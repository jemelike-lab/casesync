import { isSupervisorLike, canManageTeam, getRoleLabel, getRoleColor } from '@/lib/roles'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { checkAiRateLimit } from '@/lib/ai-rate-limit'
import { validateUUID } from '@/lib/validation'
import { auditLog } from '@/lib/audit'

export const dynamic = 'force-dynamic'

// ─── Rate limiter ─────────────────────────────────────────────────────────────
let activeRequests = 0
const MAX_CONCURRENT = 10

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDateStatus(dateStr: string | null): 'red' | 'orange' | 'yellow' | 'green' | 'none' {
  if (!dateStr) return 'none'
  const date = new Date(dateStr)
  const now = new Date()
  const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return 'red'
  if (diffDays <= 7) return 'orange'
  if (diffDays <= 30) return 'yellow'
  return 'green'
}

function getOverdueCount(client: Record<string, unknown>): number {
  const fields = [
    'eligibility_end_date', 'three_month_visit_due', 'quarterly_waiver_date',
    'med_tech_redet_date', 'pos_deadline', 'assessment_due', 'thirty_day_letter_date',
    'co_financial_redet_date', 'co_app_date', 'mfp_consent_date', 'two57_date', 'doc_mdh_date',
  ]
  return fields.filter(f => getDateStatus(client[f] as string | null) === 'red').length
}

function getDaysSinceContact(dateStr: string | null): number | null {
  if (!dateStr) return null
  const date = new Date(dateStr)
  const now = new Date()
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
}

function formatClientSummary(client: Record<string, unknown>): string {
  const name = `${client.first_name ?? ''} ${client.last_name ?? ''}`.trim()
  const now = new Date()

  function statusOf(dateStr: string | null): string {
    if (!dateStr) return 'not set'
    const d = new Date(dateStr)
    const diff = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (diff < 0) return `OVERDUE by ${Math.abs(diff)} days`
    if (diff === 0) return 'due TODAY'
    if (diff <= 7) return `due in ${diff} days`
    return `due ${dateStr}`
  }

  const daysSince = getDaysSinceContact(client.last_contact_date as string | null)
  const lastContact = daysSince !== null
    ? `${daysSince} days ago via ${client.last_contact_type ?? 'unknown'}`
    : 'never'

  return `Client: ${name} (ID: ${client.client_id})
Category: ${String(client.category ?? '').toUpperCase()}
POS Status: ${client.pos_status ?? 'unknown'}
Goal Progress: ${client.goal_pct ?? 0}%
Last Contact: ${lastContact}
Overdue items: ${getOverdueCount(client)}

Key Dates:
- Eligibility End: ${statusOf(client.eligibility_end_date as string | null)}
- POS Deadline: ${statusOf(client.pos_deadline as string | null)}
- Assessment Due: ${statusOf(client.assessment_due as string | null)}
- 3-Month Visit Due: ${statusOf(client.three_month_visit_due as string | null)}
- Quarterly Waiver: ${statusOf(client.quarterly_waiver_date as string | null)}
- Med Tech Redet: ${statusOf(client.med_tech_redet_date as string | null)}
- SPM Next Due: ${statusOf(client.spm_next_due as string | null)}
- SPM Completed this month: ${client.spm_completed ? 'Yes' : 'No'}
- 30-Day Letter: ${statusOf(client.thirty_day_letter_date as string | null)}
- CO Redet: ${statusOf(client.co_financial_redet_date as string | null)}
- CO App Date: ${statusOf(client.co_app_date as string | null)}
- MFP Consent: ${statusOf(client.mfp_consent_date as string | null)}
- 257 Date: ${statusOf(client.two57_date as string | null)}
- Doc MDH: ${statusOf(client.doc_mdh_date as string | null)}
- POC Date: ${client.poc_date ?? 'not set'}
- LOC Date: ${client.loc_date ?? 'not set'}

Other:
- Med Tech Status: ${client.med_tech_status ?? 'none'}
- Provider Forms: ${client.provider_forms ?? 'none'}
- Signatures Needed: ${client.signatures_needed ?? 'none'}
- Reportable Events: ${client.reportable_events ?? 'none'}
- Appeals: ${client.appeals ?? 'none'}
- ATP: ${client.atp ?? 'none'}
- SNFs: ${client.snfs ?? 'none'}
- FOC: ${client.foc ?? 'none'}
- Schedule Docs: ${client.schedule_docs ? 'Yes' : 'No'}`
}


function getDateDiffDays(dateStr: string | null): number | null {
  if (!dateStr) return null
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return null
  const now = new Date()
  return Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function isDueThisWeekClient(client: Record<string, unknown>): boolean {
  const fields = [
    'eligibility_end_date', 'three_month_visit_due', 'quarterly_waiver_date',
    'med_tech_redet_date', 'pos_deadline', 'assessment_due', 'thirty_day_letter_date',
    'co_financial_redet_date', 'co_app_date', 'mfp_consent_date', 'two57_date', 'doc_mdh_date', 'spm_next_due',
  ]
  return fields.some((field) => {
    const diff = getDateDiffDays(client[field] as string | null)
    return diff !== null && diff >= 0 && diff <= 7
  })
}

function getPlannerOpsSummary(allClients: Record<string, unknown>[], planners: Record<string, unknown>[]) {
  const plannerRows = planners.map((planner) => {
    const plannerClients = allClients.filter((client) => client.assigned_to === planner.id)
    const overdue = plannerClients.filter((client) => getOverdueCount(client) > 0).length
    const dueThisWeek = plannerClients.filter(isDueThisWeekClient).length
    const noContact7 = plannerClients.filter((client) => {
      const days = getDaysSinceContact(client.last_contact_date as string | null)
      return days !== null && days >= 7
    }).length
    const avgGoalPct = plannerClients.length > 0
      ? Math.round(plannerClients.reduce((sum, client) => sum + Number(client.goal_pct ?? 0), 0) / plannerClients.length)
      : 0
    const complianceScore = plannerClients.length > 0
      ? Math.round(plannerClients.filter((client) => getOverdueCount(client) === 0).length / plannerClients.length * 100)
      : 100
    const pressureScore = overdue * 5 + dueThisWeek * 2 + Math.max(0, plannerClients.length - 35)
    const loadStatus = pressureScore >= 12 ? 'rebalance' : pressureScore >= 6 ? 'watch' : 'balanced'
    const topOverdueClients = plannerClients
      .filter((client) => getOverdueCount(client) > 0)
      .sort((a, b) => getOverdueCount(b) - getOverdueCount(a))
      .slice(0, 3)
      .map((client) => `${client.last_name ?? 'Unknown'}${client.first_name ? `, ${client.first_name}` : ''} (${client.client_id ?? 'no-id'})`)

    return {
      plannerId: String(planner.id ?? ''),
      plannerName: String(planner.full_name ?? 'Unknown'),
      clientCount: plannerClients.length,
      overdue,
      dueThisWeek,
      noContact7,
      avgGoalPct,
      complianceScore,
      pressureScore,
      loadStatus,
      topOverdueClients,
    }
  })

  const donors = plannerRows
    .filter((row) => row.loadStatus === 'rebalance')
    .sort((a, b) => b.pressureScore - a.pressureScore)
    .slice(0, 3)

  const receivers = plannerRows
    .filter((row) => row.loadStatus === 'balanced')
    .sort((a, b) => a.pressureScore - b.pressureScore || a.clientCount - b.clientCount)
    .slice(0, 3)

  const managerAlerts = plannerRows
    .filter((row) => row.overdue > 0 || row.dueThisWeek >= 3 || row.loadStatus !== 'balanced')
    .sort((a, b) => b.overdue - a.overdue || b.pressureScore - a.pressureScore)
    .slice(0, 5)

  return { plannerRows, donors, receivers, managerAlerts }
}

function formatPlannerOpsContext(summary: ReturnType<typeof getPlannerOpsSummary>): string {
  const plannerLines = summary.plannerRows
    .sort((a, b) => b.pressureScore - a.pressureScore || b.overdue - a.overdue)
    .map((row) => `- ${row.plannerName} | load: ${row.loadStatus} | pressure: ${row.pressureScore} | clients: ${row.clientCount} | overdue: ${row.overdue} | due this week: ${row.dueThisWeek} | no contact 7+ days: ${row.noContact7} | compliance: ${row.complianceScore}% | avg goal: ${row.avgGoalPct}%${row.topOverdueClients.length ? ` | top overdue: ${row.topOverdueClients.join(', ')}` : ''}`)
    .join('\n')

  const donorLine = summary.donors.length > 0
    ? summary.donors.map((row) => `${row.plannerName} (pressure ${row.pressureScore})`).join(', ')
    : 'none right now'

  const receiverLine = summary.receivers.length > 0
    ? summary.receivers.map((row) => `${row.plannerName} (pressure ${row.pressureScore})`).join(', ')
    : 'none right now'

  const alertLine = summary.managerAlerts.length > 0
    ? summary.managerAlerts.map((row) => `${row.plannerName}: ${row.overdue} overdue, ${row.dueThisWeek} due this week, pressure ${row.pressureScore}`).join(' | ')
    : 'none right now'

  return `=== PLANNER OPS SNAPSHOT ===
Recommended donors: ${donorLine}
Recommended receivers: ${receiverLine}
Manager follow-up alerts: ${alertLine}
Planner detail:
${plannerLines}
=== END PLANNER OPS SNAPSHOT ===`
}

// ─── Knowledge blocks (injected into system prompt) ───────────────────────────

const KNOWLEDGE_POS_WORKFLOW = `
=== POS (PLAN OF SERVICE) FULL WORKFLOW ===

CRITICAL RULE: All Plans of Service must be completed within 20 calendar days of the POC being uploaded into the LTSS System.

── WHEN FIRST ASSIGNED A PARTICIPANT ──
• Establish contact and perform initial home visit within 14 calendar days of assignment.

If POC is NOT yet complete:
  1. Contact participant, introduce yourself, BLH, and the waiver programs
  2. Engage in a person-centered meeting: strengths, goals, emergency backup plans
  3. Check if POC is past due
  4. Contact LHD to ask when assessment will be complete

If POC IS complete:
  1. Schedule face-to-face appointment within 3 days of POC being uploaded
  2. Introduce yourself, BLH, and the waiver programs
  3. Engage in person-centered meeting (strengths, goals, emergency backups)
  4. Go over all recommendations and services on the plan

── POS DEVELOPMENT ──
  1. Contact participant for provider information — agency or independent provider?
  2. Gather all medical supply needs, quantities, and physician/doctor info
  3. Research, locate, and contact providers; insert name, phone, fax into POS
  4. Meet with participant to obtain their signature; go over each service and its frequency
  5. Obtain all required signatures: Participant, SP, BLH, and anyone else on plan
  6. Send signature page to LHD — 3 signatures required at this stage: Participant, SP, and BLH

── WHILE WAITING FOR LHD SIGNATURE ──
  • Review POS for errors; make any corrections
  • Gather provider signature if not yet obtained
  • Verify all information is accurate

── ONCE LHD SIGNS ──
  1. Upload and attach: signature page/consent form, doctor's notes, invoices, assessments, DDA information
  2. Ensure all 5 signatures present: Participant, SP, BLH, LHD, PA/Agency Provider
  3. Submit the POS
  4. Check daily for alerts (clarifications, approval, or denial)
  5. Update participant on status weekly

── ONCE POS APPROVED (independent provider) ──
  1. Complete ATP — only one needed per year
  2. Update participant; complete global referral
  3. Help with PPL packet — ensure it's received, filled out, and returned

── ONCE POS APPROVED (agency/no independent provider) ──
  1. Complete ATP — only one needed per year
  2. Update participant; follow up on any questions

── ONCE ATP APPROVED ──
  1. Contact participant — inform them they'll receive a letter in the mail
  2. Contact all providers; send each a copy of the ATP/service plan
  3. Confirm all parties are ready for the effective start date

── MONTHLY MONITORING (SPM) ──
  • Check in with participant each month
  • Confirm they're happy with services and receiving everything listed on the plan
  • Check whether any increase or decrease in services is needed
  • Fill out Monthly Monitoring on LTSS by the 15th of each month
  • SPM RULE: When SPM is marked complete, next due = 15th of the FOLLOWING month (NEVER +30 days)

=== END POS WORKFLOW ===`

const KNOWLEDGE_POS_SUBMISSION = `
=== POS SUBMISSION CHECKLIST & RULES ===

── RULING PRINCIPLES (ALL must be true before submitting) ──
  ✓ Medicaid is active
  ✓ POS type and program type are appropriate
  ✓ Recent redetermination = annual POS; significant change assessment = revised POS
  ✓ Narrative makes sense for participant (correct gender, age, and language)
  ✓ All POC recommendations are mentioned — in narrative or as a service
  ✓ Updated strengths and goals present for all annual or initial plans
  ✓ Address to receive services matches primary address on profile
  ✓ CSQ completed no more than 60 days before POS submission date
  ✓ LOC is NOT expired AND does NOT expire in the next 30 days
    → If LOC expires within 30 days: DO NOT submit — resolve LOC first
  ✓ All mandatory (**) sections completed
  ✓ No exception request completed unless one is actually indicated
  ✓ All needed signatures uploaded to client attachments with a date present

── EMERGENCY BACKUPS ──
  • At least ONE backup must be listed
  • A primary backup contact must be indicated
  • Primary backup must be available 24/7 and should be local
  • If participant receives personal care services: a backup PCA must be listed
    UNLESS participant/representative declines
  • If backup PCA is declined: document this in the POS narrative AND in progress notes

── SERVICES REQUIREMENTS ──
  • All waiver-based services (not state plan or community services) must include:
    - Provider name
    - Unit and frequency
    - Overall cost
  • All services must have a description/comment
  • All frequencies must meet appropriate guidelines
  • DMS: item frequency of 1
  • DME: one-time purchase only
  • SP services: 6 hrs/month (initial), 3 hrs/month (annual), 20 hrs/year (ALF participants)
  • NM services: based on county (refer to county document for guidelines)
  • Supplemental services: add ACTUAL amounts (including tax/shipping) — do not use flat $300 or $700

── SIGNATURE REQUIREMENTS ──
  • All waiver-based services: signatures required before submission
  • If a state plan or community service has a provider listed: those signatures also required
  • Primary backup signature required for submission
  • Participant or representative signature required for ALL POS submissions
  • Revisions (other than provider changes): updated physical AND electronic signature required
  • All signatures must be: (a) present in client attachments AND (b) electronically reflected on the POS

=== END POS SUBMISSION CHECKLIST ===`

const KNOWLEDGE_ATP = `
=== ATP (AUTHORIZATION TO PARTICIPANT) DESK REFERENCE ===

ATP = Authorization to Participant. Notifies DHMH of waiver eligibility decisions.
Applies to: CO (Community Options), CFC, MAPC, and ICS programs.

── 5 TYPES OF ATP ──
  1. Advisory Authorization — met all technical/medical criteria EXCEPT housing (CO or ICS only)
  2. Authorization — met ALL technical and medical criteria including housing (MAPC, CFC, CO, or ICS)
  3. Denial — did NOT meet at least one technical and/or medical criterion
  4. Disenrollment — participant NO LONGER meets all technical/medical criteria
  5. Denial-Overturn — denial overturned through appeals process

── CO / ICS RULES ──
  • Signed Freedom of Choice form (option 1) must be submitted PRIOR to ATP submission
  • Advisory Authorization ATP CANNOT be submitted before POS approval
  • Do NOT submit Advisory Authorization ATP if anticipated discharge date is more than 6 months away
  • Authorization ATP CANNOT be submitted before POS approval
  • Authorization ATPs: POS effective date and date deinstitutionalized must be THE SAME
  • Community participants: POS effective date = current date of ATP or a few days prior
  • Services CANNOT begin before service effective date on Authorization ATP and Approval letter
  • Agencies are liable for costs of services rendered prior to ATP approval

── CFC RULES ──
  • NO Advisory ATPs
  • Authorization ATP cannot be submitted before POS approval
  • Authorization ATPs: POS effective date must be on the 1st OR 15th of the month
  • Services cannot begin before service effective date

── MAPC RULES ──
  • NO Advisory ATPs
  • Authorization ATP cannot be submitted before POS approval
  • Authorization ATPs: POS effective date AND service effective date must both be July 1
  • Services cannot begin before service effective date

── DECEASED PARTICIPANTS (all programs) ──
  • Update date of death field in client profile
  • Deactivate the Plan of Service
  • DO NOT discard the POS — keep it on file

── DHMH ATP CONTACTS (by client last name) ──
  • A–I: Keshia Turner — keshia.turner@maryland.gov — 410-767-9738
  • J–Q: Kourtney Jeffers — kourtney.jeffers@maryland.gov — 410-767-6772
  • R–Z: Amanda Patek — amanda.patek@maryland.gov — 410-767-9738

── ENROLLMENT ──
  • CO waiver and ICS waiver: DEWS handles enrollment
  • MAPC and CFC: Community Options Administrative Division handles enrollment

=== END ATP DESK REFERENCE ===`

const KNOWLEDGE_PROGRAM_CODES = `
=== SPECIAL PROGRAM CODES (MMIS Screen 8) ===

These codes MUST be listed on Screen 8 of the participant subsystem in MMIS for waiver claims to pay.
EDD updates the code upon enrollment and disenrollment.
NOTE: CFC and MAPC have NO special program codes — they are State Plan Services (not waivers).

MODEL WAIVER:          MOD = Model Waiver | MWD = Model Waiver-Deinstitutionalized/Diverted
AUTISM WAIVER:         AUT = Autism Waiver
COMMUNITY PATHWAYS:    MRW = Intellectual Disability, deinstitutionalized
                       DRW = Intellectual Disability, diverted
                       NRX = Developmentally disabled, diverted
                       DRM = MFP - Intellectual Disability, diverted
                       NRM = MFP - Developmentally disabled, deinstitutionalized
NEW DIRECTIONS:        NRW = Developmentally disabled, deinstitutionalized
                       MRM = MFP Intellectual Disability, deinstitutionalized
BRAIN INJURY:          TBW = Brain Injury Waiver | TBM = MFP-Brain Injury Waiver
LIVING AT HOME (*No Longer in Use*):
                       ACD = Deinstitutionalized | ACI = Diverted | ACM = MFP-Living at Home
RTC WAIVER:            RTC = Residential Treatment Center Waiver
COMMUNITY OPTIONS:     OAA = CO Waiver-Assisted Living
                       OAH = CO Waiver-Private Residence
                       OHM = MFP - CO Waiver-Private Residence
                       OAM = MFP - CO Waiver-Assisted Living
RARE & EXPENSIVE:      APD=Asymptomatic Pediatric | BLD=Blood Disease | CON=Congenital Anomalies
                       DEG=Degenerative Disease | IID=Infant w/ Inconclusive Disease | MET=Metabolic
                       PSA=Pediatric Symptomatic | VDP=Ventilator Dependent | OTH=Other
OTHER:                 HOS=Hospice | MDC=Medical Day Care | ICS=Increased Community Services
                       ICM=MFP-ICS | BHH=Behavioral Health Homes
                       MFP=Money Follows the Person (State-plan only, no waiver services)

If waiver claims aren't paying → verify the correct special program code is on Screen 8 in MMIS.

=== END SPECIAL PROGRAM CODES ===`

const KNOWLEDGE_TRANSITION_FUNDS = `
=== TRANSITION FUNDS ===

All requests → transitionfunds@blhnurses.com
Subject line MUST include: CLIENT ID and whether the request is URGENT

RULES:
  • Total cost of ALL items (including tax and shipping) must be approved on the POS first
  • Cannot order items in excess of approved funding
  • NO requests can be processed if client has been in the community for MORE than 60 days
  • If client is approaching the 60-day deadline → notify transition funds team IMMEDIATELY

DOCUMENTS NEEDED — CLIENT HAS NOT YET DISCHARGED:
  1. Advisory letter
  2. MFP consent form
  3. Payment request form
  4. Wishlist* (not needed for housing/utilities/documentation check requests)
  5. Provisionally approved POS

DOCUMENTS NEEDED — CLIENT HAS DISCHARGED:
  1. Approval at home letter
  2. MFP consent form
  3. Payment request form
  4. Wishlist*
  5. Approved POS
  6. 257 form

FOLLOW-UP:
  • Planner must follow up to confirm all items received
  • If item is broken/needs return → email transitionfunds@blhnurses.com with client ID + what is broken,
    how it's broken, and what the client wants to happen
  • Most vendors have a 30-day return policy — be mindful of this deadline

DEFINITIONS:
  *Wishlist = Word doc or PDF of specific items requested (can save online shopping cart as PDF)
  All purchases require receipts. If vendor doesn't provide one, planner must verify service was
  provided and supply an alternate receipt.

=== END TRANSITION FUNDS ===`

const KNOWLEDGE_VISIT_CHECKLISTS = `
=== VISIT CHECKLISTS ===

── PREPARING FOR INITIAL VISIT ──
  • Create a file for the participant
  • File must include: Level of Care, Eligibility, Brochure (with contact info),
    CFC Information, Freedom of Choice Form
  • Call participant to confirm visit time and address

── DURING INITIAL VISIT ──
  • Present Nurse Recommendations (Services) to participant
  • Obtain info needed for POS Development:
    - Emergency Backups: 3 total (1 must be designated Primary Contact)
    - Strengths & Goals: 2–3 items
    - Medical Day Care information
    - Provider information
    - Any additional services already provided (MAPC, REM, or DDA)
  • Explain next steps in the enrollment process
  • Sign Freedom of Choice Form

── PREPARING FOR SIGNATURE VISIT ──
  • Verify all services and providers are included on the POS
  • Have your LEAD review the POS before the visit
  • Print documentation (POS and Waiver Forms if needed)

── DURING SIGNATURE VISIT ──
  • Explain the developed POS: hours, providers, services, possible effective date
  • For independent providers: explain PPL Packet/paperwork, CPR & First Aid Certification,
    conversion of provider number to CFC Program
  • Inform independent providers of the CFC provider number conversion process
  • Collect signatures from: Participant, Independent Providers, Emergency Backups (if available)
  • Give estimated timeline for DHMH approval

── NON-POC VISIT (before assessment is complete) ──
  • Create a file: Eligibility, Brochure, CFC Information, Freedom of Choice Form
  • Call participant to confirm visit time and address
  • During visit: Introduce agency, yourself, and explain programs and agency's role
  • Inform participant that an LHD nurse will contact them to complete the assessment
  • Once assessment complete, SP will revisit to go over nurse assessor's recommendations

── SUPPORT PLANNING MONITORING (ONGOING) ──
  • Contact participants EVERY MONTH
  • Visit in person EVERY 3 MONTHS
  • Confirm services are being provided as planned
  • Check for any significant change in participant's health status
  • Complete Support Planning Monthly Monitoring on LTSS

=== END VISIT CHECKLISTS ===`

const KNOWLEDGE_RUG_SCORES = `
=== RUG SCORE BUDGET GROUPS ===

RUG = Resource Utilization Group — determines annual funding based on ADL/IADL needs.
ADL = Activities of Daily Living (bathing, dressing, eating, mobility)
IADL = Instrumental Activities of Daily Living (cooking, cleaning, managing medications)

GROUP 1 — $15,600/year:
  PA1 (Physical Function - Low ADL) | BA1 (Behavioral - Low ADL) | CA1 (Clinical Complex - Low ADL)
  IA1 (Cognitive Impairment - Low ADL) | PA2 (Physical Function - Low ADL, Low-High IADL)
  RA1 (Rehabilitation - Low ADL)

GROUP 2 — $20,800/year:
  BA2 (Behavioral - Low ADL, High IADL) | CA2 (Clinical Complex - Low ADL, High IADL)
  IA2 (Cognitive Impairment - Low ADL, Low-High IADL) | PB0 (Physical Function - Low-Medium ADL)

GROUP 3 — $29,120/year:
  CB0 (Clinical Complex - Low-Medium ADL) | RA2 (Rehabilitation Low - Low ADL, High IADL)
  PC0 (Physical Function - Medium-High ADL) | SSA (Special Care - Low-High ADL)
  IB0 (Cognitive Impairment - Medium ADL) | BB0 (Behavioral - Medium ADL)

GROUP 4 — $43,680/year:
  PD0 (Physical Function - High ADL) | CC0 (Clinical Complex - High ADL)

GROUP 5 — $44,700/year:
  SE1 (Extensive Services 1 - Medium-High ADL) | RB0 (Rehabilitation High - High ADL)
  SSB (Special Care - Very High ADL)

GROUP 6 — $56,364/year:
  SE2 (Extensive Services 2 - Medium-High ADL)

GROUP 7 — $98,910/year (highest):
  SE3 (Extensive Services 3 - Medium-High ADL)

=== END RUG SCORES ===`

const KNOWLEDGE_CPAS = `
=== CPAS (COMMUNITY PERSONAL ASSISTANCE SERVICES) ===

CPAS = Maryland's program enabling older adults and people with disabilities to live in their own homes.

COVERED SERVICES:
  • Personal Assistance Services
  • Supports Planning
  • Nurse Monitoring

CPAS PARTICIPANTS MAY ALSO BE ELIGIBLE FOR:
  Physician/Hospital Care, Pharmacy, Home Health, Lab Services, Mental Health Services,
  Disposable Medical Supplies, Durable Medical Equipment

WHO SHOULD APPLY: Maryland residents who need help with activities of daily living (bathing, grooming, dressing)

ELIGIBILITY — MEDICAL: Must live in community, need ADL assistance at home, meet program's LOC

ELIGIBILITY — FINANCIAL:
  • Income and assets reviewed for community Medicaid eligibility
  • Medicaid automatically granted to: SSI recipients, TCA (Temporary Cash Assistance) recipients, Foster Care
  • Single person income limit: up to $16,243/year to qualify
  • More info: https://mmcp.dhmh.maryland.gov

CONTACT:
  • Medicaid Long Term Care & Waiver Services: 410-767-1739 or 1-877-4MD-DHMH
  • MD Relay: 1-800-735-2258
  • 201 W. Preston Street, Suite 136, Baltimore, MD 21201

=== END CPAS ===`

const KNOWLEDGE_CFC_LIMITATIONS = `
=== CFC SERVICE LIMITATIONS (COMAR 10.09.84.23) ===

PERSONAL EMERGENCY RESPONSE SYSTEM (PERS) — limited to participants who:
  • Live alone, OR
  • Have no regular caregiver for extended parts of the day and would otherwise need extensive supervision

SERVICES NOT COVERED BY CFC:
  1. Housekeeping unrelated to ADLs:
     - Cleaning areas NOT occupied by participant
     - Laundry not incidental to participant's care
     - Grocery/household shopping UNLESS SP accompanies participant
  2. Services by non-Department-approved providers
  3. Escort expenses for medical treatment, commuting to work, or social/community activities
  4. Room and board for participant or worker
  5. Transition services more than 60 days post-transition
  6. Personal assistance outside Maryland for more than 30 days per calendar year
  7. Environmental adaptations that are:
     - General maintenance (carpeting, roof repair, central A/C)
     - Not of direct medical or remedial benefit
     - Add to home's total square footage
     - Modify home exterior (EXCEPT: ramps, lifts, sidewalks for ramp/lift, and railings)
  8. Experimental technology or equipment

SP & NURSE MONITORING PAYMENT LIMITS:
  • Direct services to participant ONLY — no billing for: administrative overhead, travel, internal
    quality monitoring, staff supervision/training/consultation
  • Cannot exceed 7 hours/day per individual SP or nurse monitor UNLESS preauthorized in writing by Dept.

ENVIRONMENTAL ADAPTATIONS & TECHNOLOGY:
  • Combined reimbursement cap: $15,000 over a 3-year period per participant
  • Technology items/services above $1,000: multiple provider quotes required

=== END CFC LIMITATIONS ===`

const KNOWLEDGE_PERSONAL_ASSISTANCE = `
=== PERSONAL ASSISTANCE SERVICES (COMAR 10.09.84.14) ===

Must be rendered by a qualified provider in participant's home OR community setting.

COVERED SERVICES:
  1. Assistance with ADLs (Activities of Daily Living)
  2. Delegated nursing functions — IF specified in POS AND rendered per Maryland Nurse Practice Act /
     COMAR 10.27.11 / Maryland Board of Nursing requirements
  3. Assistance with tasks requiring judgment to protect participant from harm or neglect
  4. IADL assistance — ONLY when provided IN CONJUNCTION with ADL/delegated nursing/judgment services
  5. Help with participant's self-administration of medications OR administration of medications/remedies
     when ordered by a physician

NOT COVERED:
  1. Services for anyone other than the participant, or primarily for someone else's benefit
  2. Cost of food or meals (prepared, delivered, or received in community)
  3. Standalone housekeeping (only housekeeping incidental to covered services is allowed)

QUICK RULES:
  • PCA can help with medications: Yes (self-admin or physician-ordered admin)
  • PCA can do housekeeping: Only if incidental to covered ADL services
  • PCA can cook for the whole family: No — participant only
  • PCA can grocery shop: Only as an IADL in conjunction with ADL services, and only when
    accompanying the participant (not shopping alone for them)

=== END PERSONAL ASSISTANCE ===`

const KNOWLEDGE_SUPPLEMENTAL_ACP = `
=== SUPPLEMENTAL SERVICES, COVERAGE GROUPS & ACP GUIDANCE ===

── SUPPLEMENTAL SERVICES ──
  • Participants don't have to exhaust the full amount they're eligible to receive
  • When adding supplemental services to POS, use ACTUAL costs including tax and shipping
    (Do NOT use flat amounts like $300 or $700 — use the real total)

── CPAS / CFC ELIGIBILITY EXPANSION (Effective April 13, 2026) ──
  • Coverage groups S21 and H98 are NOW ELIGIBLE (previously excluded)

── INELIGIBLE COVERAGE GROUPS FOR CPAS AND CFC ──
  The following groups are NOT eligible:
  P10, E03, E04, G01, G02, G98, G99, S03, S06, S07, S14, T02, T03, T04, T05, T99,
  L01, L98, L99, X02, X03, X11, X12, C13J, C13K, C13M, C13P, C10

── ACP (ADDRESS CONFIDENTIALITY PROGRAM) PARTICIPANTS ──
  Participants in ACP have a protected address. Handle carefully:
  1. Upload the ACP form to client attachments
  2. Add the ACP address (including ACP number) as the CURRENT, PERMANENT, and MAILING address in LTSS
  3. DO NOT include the actual physical address ANYWHERE in LTSS
  4. EVV app usage may be problematic for ACP participants — OTP device is safer
  5. Complete the CSQ using the ACP address
  6. Add note in CSQ comment box: "ACP participant - please see client attachments"
  7. Conduct site visit to the ACTUAL residence (to answer health/safety questions) while ensuring
     the real address never appears in any system record

=== END SUPPLEMENTAL / ACP GUIDANCE ===`

const KNOWLEDGE_GLOSSARY = `
=== FIELD & TERM GLOSSARY ===
SPM: Monthly Monitoring — must be filed in LTSS by the 15th; next due = 15th of NEXT month after completion
POS: Plan of Service — must be completed within 20 days of POC upload
POC: Plan of Care — assessment by LHD that triggers the 20-day POS clock
LOC: Level of Care — determines eligible services; must not expire within 30 days of POS submission
LHD: Local Health Department — issues POC/assessment and co-signs POS
CO: Community Options waiver
CFC: Community First Choice — State Plan Service (no special program code in MMIS)
CPAS: Community Personal Assistance Services — State Plan Service (no special program code)
MAPC: Medical Assistance Personal Care Program
ICS: Increased Community Services
Med Tech Redet: Medical technology redetermination / renewal
MFP: Money Follows the Person — transition from institutional to community care
257 Date: Regulatory deadline for the 257 form
Doc MDH: Documentation submitted to Maryland Department of Health
ATP (program): Authorization to Participant — 5 types (Advisory, Authorization, Denial, Disenrollment, Denial-Overturn)
ATP (field in CaseSync): Notes about the ATP status for the client
PPL: Public Partnerships LLC — fiscal intermediary for independent providers
SNFs: Skilled Nursing Facilities
DDA: Developmental Disabilities Administration
FOC: Focus of Care
LTSS: Long-Term Services and Supports portal
CSQ: Client Summary Questionnaire — must be completed no more than 60 days before POS submission
SP: Supports Planner
BLH: Beatrice Loving Heart (the agency)
PA: Provider Agency
PCA: Personal Care Attendant
PERS: Personal Emergency Response System
RUG: Resource Utilization Group — sets annual funding level (Groups 1–7, $15,600–$98,910)
ADL: Activities of Daily Living (bathing, dressing, eating, mobility)
IADL: Instrumental ADLs (cooking, cleaning, managing medications)
MMIS: Maryland Medicaid Information System — where special program codes live (Screen 8)
EDD: Enrollment & Disenrollment Division — updates special program codes in MMIS
ACP: Address Confidentiality Program — participant has protected address; use ACP address in all systems
=== END GLOSSARY ===`

const KNOWLEDGE_NAVIGATION = `
=== NAVIGATION (CaseSync portal) ===
- Dashboard: [/dashboard]
- All clients: [/clients]
- Add a new client: [/clients/new]
- Client detail: [/clients/{clientId}]
- Calendar / deadlines: [/calendar]
- Team messaging: [/chat]
- Team management: [/team]
- Supervisor view: [/supervisor]
- Settings: [/settings]
- Admin panel: [/admin]
- Log a contact: open the client's profile → Contact Log section
- Upload a document: open client profile → Documents tab
- Submit POS: done via the external LTSS System (not inside CaseSync)
=== END NAVIGATION ===`

// ─── Route handler ─────────────────────────────────────────────────────────────



// === MONTHLY CONTACT & QUIZ KNOWLEDGE ===

const KNOWLEDGE_MONTHLY_CONTACT = `
=== MONTHLY CONTACT REQUIREMENTS ===

Q: Is monthly contact required for non-enrolled AND enrolled participants?
A: YES — ALL participants require monthly contact.

Q: What are 4 ways monthly contact can be logged in LTSS?
A: Phone, Email, Home Visit, Mail/Letter

Q: What is required when monthly monitoring shows NO contact was made?
A: After showing at least 3 attempts to contact, a DROP-IN VISIT and an UNABLE TO CONTACT/30-DAY LETTER are needed.

Q: What option exists for participants who don't want monthly contact?
A: SP Waiver Form — although SPs should still be making monthly contact.

Q: What is required for a SP Waiver to be active, and how long is it valid?
A: SP Waiver form must be completed. It is active for ONE YEAR.

Q: How many contact attempts must be made before marking contact unsuccessful?
A: At least 3 attempts throughout the month.

Q: What are 2 reasons a Supports Planner should NOT complete a Monthly Monitoring?
A: 1) Client is deceased, 2) Client is out of state.

Q: What reports track monthly monitoring completed by staff?
A: SPM Tracker and Smartsheets.

Q: What are the quarterly visit months?
A: March, June, September, December.
`

const KNOWLEDGE_GENERAL_QUIZ = `
=== POS, POC, ATP, LOC, ELIGIBILITY — KNOWLEDGE BASE ===

POS (Plan of Service):
- POS = Plan of Service
- Before a POS can be started: POC and LOC must be completed/generated
- Participant's budget comes from: interRAI assessment / RUG score
- Emergency Backups needed: 2 (preferably one PAA and one family member)
- If client declines Emergency Backup: list in the narrative that they are declining an EBU
- Emergency Backup restriction: They CANNOT be a minor

POC (Plan of Care):
- POC = Plan of Care
- Assessment is completed by: Local Health Department Nurse Assessor
- When to submit new POC request: Significant change OR annual/redetermination
- Key dates to focus on in POC: Due date and request completion date

ATP (Authorization to Participate):
- ATP = Authorization to Participate
- When to complete ATP: When starting or stopping services

LOC (Level of Care):
- NF = Nursing Facility
- NF level of care qualifies participants for: CFC or CO programs
- CPAS participants receive ONLY: PAA, NM (Nurse Monitoring), SP (Supports Planning)

ELIGIBILITY:
- Highlighted eligibility code means: It is an eligible MA code for the client to receive CPAS, CFC, and CO services (reference MA Coverage Group Sheet on Zoho)
- Before working with any participant, check at least 4 things: Eligibility code, Program type, MA #, LOC, POC, POS
- Three special CO codes:
  1. OAA = Assisted Living, NOT MFP eligible
  2. OAM = Assisted Living, MFP eligible
  3. OAH = Private residence, NOT MFP eligible
  4. OHM = Private residence, MFP eligible

CO (Community Options):
- MFP (Money Follows the Person) eligibility: CO applicants residing in a NF for 60 CONSECUTIVE DAYS
- Transition funds eligibility: MFP participants transitioning out of a nursing facility
- ALF bed minimum for transition funds and MFP: 4 beds
- Advisory Letters for CO participants are sent by: EDD
- Three requirements for all CO applications: Meet financial, technical, AND medical eligibility guidelines
- CO application renewal: Yearly, unless stated otherwise on current enrollment tab
- SP hours for participant in ALF: 20 hours per year

LTSS NAVIGATION:
- To find participant's language: Client → Profile → Client Demographics
- Additional contact info/representatives: Client → Profile
- Most important tab in LTSS (Client Summary) lists: Client eligibility, current enrollment, program snapshot, waiver information, and who is assigned to their case
`

export async function POST(req: NextRequest) {
  const aiRateLimit = await checkAiRateLimit(req, '/api/case-ai')
  if (aiRateLimit) return aiRateLimit

  // Rate limiting: max 10 concurrent AI requests
  if (activeRequests >= MAX_CONCURRENT) {

    // Audit: log AI query
    auditLog(req, { userId: authData?.user?.id, userEmail: authData?.user?.email ?? undefined, action: 'client.view', resourceType: 'case-ai', resourceId: clientId, details: { prompt_length: prompt?.length ?? 0 } }).catch(() => {})
    return new Response(
      JSON.stringify({ error: 'BLH Bot is busy, please try again in a moment' }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    )
  }
  activeRequests++

  try {
    // Verify session — never trust userId from the request body
    const serverSupabase = await createServerClient()
    const { data: authData, error: authErr } = await serverSupabase.auth.getUser()
    if (authErr || !authData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }
    const userId = authData.user.id

    const { messages, clientId } = await req.json()

    // P0: UUID validation on clientId
    if (clientId && !validateUUID(clientId)) {
      return new Response('Invalid client ID format', { status: 400 })
    }

    // P0: Cap messages array length to prevent token abuse
    if (!messages || !Array.isArray(messages)) {
      return new Response('Missing required fields', { status: 400 })
    }

    // P0: Cap messages to prevent memory exhaustion
    if (messages.length > 50) {
      return new Response('Too many messages', { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('id', userId)
      .single()

    const userName = profile?.full_name ?? 'User'
    const userRole = profile?.role ?? 'unknown'

    // --- Role-scoped data loading ---
    // Supports planners only see their own clients.
    // Team managers see their team's clients + planner stats for their team.
    // Supervisors/IT see org-wide summary stats but NOT all individual client rows
    //   (sending 5,000 client rows per request is a major cost/latency issue).
    // In all cases, if a specific clientId is provided we fetch that one record.
    let allClients: Record<string, unknown>[] = []
    let plannerContext = ''

    const isPlannerRole = userRole === 'supports_planner'
    const isManagerRole = userRole === 'team_manager'
    const isSupervisorRole = isSupervisorLike(userRole)

    if (isPlannerRole) {
      // Supports planner: load only their assigned clients
      const { data: myClients } = await supabase
        .from('clients')
        .select('id, client_id, first_name, last_name, category, assigned_to, is_active, last_contact_date, last_contact_type, goal_pct, eligibility_code, eligibility_end_date, three_month_visit_due, quarterly_waiver_date, med_tech_redet_date, pos_deadline, assessment_due, thirty_day_letter_date, co_financial_redet_date, co_app_date, mfp_consent_date, two57_date, doc_mdh_date, spm_next_due, pos_status, loc_date, spm_completed, med_tech_status, appeals, atp, foc, poc_date, provider_forms, reportable_events, schedule_docs, signatures_needed, snfs, profiles!clients_assigned_to_fkey(full_name)')
        .eq('assigned_to', userId)
        .eq('is_active', true)
        .order('last_name')
      allClients = (myClients as Record<string, unknown>[]) ?? []
      plannerContext = `You are assisting a Supports Planner with their own caseload of ${allClients.length} active clients.`

    } else if (isManagerRole) {
      // Team manager: load their team's planners and those planners' clients
      const { data: teamPlanners } = await supabase
        .from('profiles')
        .select('id, full_name, team_manager_id')
        .eq('role', 'supports_planner')
        .eq('team_manager_id', userId)
        .order('full_name')
      const teamPlannerIds = (teamPlanners ?? []).map((p: Record<string, unknown>) => p.id as string)

      if (teamPlannerIds.length > 0) {
        const { data: teamClients } = await supabase
          .from('clients')
          .select('id, client_id, first_name, last_name, category, assigned_to, is_active, last_contact_date, last_contact_type, goal_pct, eligibility_code, eligibility_end_date, three_month_visit_due, quarterly_waiver_date, med_tech_redet_date, pos_deadline, assessment_due, thirty_day_letter_date, co_financial_redet_date, co_app_date, mfp_consent_date, two57_date, doc_mdh_date, spm_next_due, pos_status, loc_date, spm_completed, med_tech_status, appeals, atp, foc, poc_date, provider_forms, reportable_events, schedule_docs, signatures_needed, snfs, profiles!clients_assigned_to_fkey(full_name)')
          .in('assigned_to', teamPlannerIds)
          .eq('is_active', true)
          .order('last_name')
        allClients = (teamClients as Record<string, unknown>[]) ?? []
      }

      const plannerOpsSummary = getPlannerOpsSummary(allClients, (teamPlanners ?? []) as Record<string, unknown>[])
      const plannerStats = plannerOpsSummary.plannerRows.map((row) => `${row.plannerName}: ${row.clientCount} clients, ${row.overdue} overdue, pressure ${row.pressureScore}`)
      plannerContext = `Team Manager view: ${allClients.length} clients across ${teamPlanners?.length ?? 0} Supports Planners on your team. Planner coverage: ${plannerStats.join(', ')}

${formatPlannerOpsContext(plannerOpsSummary)}`

    } else if (isSupervisorRole) {
      // Supervisor/IT: load summary stats only — NOT individual rows.
      // Full row loading of thousands of clients is too expensive per-request.
      const { data: allPlanners } = await supabase
        .from('profiles')
        .select('id, full_name, team_manager_id')
        .eq('role', 'supports_planner')
        .order('full_name')

      // Load clients but only the fields needed for ops snapshot (not full records)
      const { data: summaryClients } = await supabase
        .from('clients')
        .select('id, assigned_to, goal_pct, last_contact_date, spm_next_due, eligibility_end_date, three_month_visit_due, quarterly_waiver_date, med_tech_redet_date, pos_deadline, assessment_due, thirty_day_letter_date, co_financial_redet_date, co_app_date, mfp_consent_date, two57_date, doc_mdh_date, pos_status, client_id, first_name, last_name')
        .eq('is_active', true)
      allClients = (summaryClients as Record<string, unknown>[]) ?? []

      const plannerOpsSummary = getPlannerOpsSummary(allClients, (allPlanners ?? []) as Record<string, unknown>[])
      const plannerStats = plannerOpsSummary.plannerRows.map((row) => `${row.plannerName}: ${row.clientCount} clients, ${row.overdue} overdue, pressure ${row.pressureScore}`)
      plannerContext = `Org-wide visibility. Organization snapshot: ${allClients.length} active clients across ${allPlanners?.length ?? 0} Supports Planners. Planner coverage: ${plannerStats.join(', ')}

${formatPlannerOpsContext(plannerOpsSummary)}`
    }

    const clientCount = allClients?.length ?? 0

    let clientContextStr = ''

    if (clientId) {
      // Always fetch the specific client when one is provided — but verify access
      let clientQuery = supabase.from('clients').select('id, client_id, first_name, last_name, category, assigned_to, is_active, last_contact_date, goal_pct, eligibility_end_date, three_month_visit_due, quarterly_waiver_date, med_tech_redet_date, pos_deadline, assessment_due, thirty_day_letter_date, co_financial_redet_date, co_app_date, mfp_consent_date, two57_date, doc_mdh_date, spm_next_due, pos_status, spm_completed, poc_date, loc_date, med_tech_status, provider_forms, signatures_needed, reportable_events, appeals, atp, snfs, foc, schedule_docs, profiles!clients_assigned_to_fkey(full_name)').eq('id', clientId)
      // For planners, enforce they can only ask about their own clients
      if (isPlannerRole) {
        clientQuery = clientQuery.eq('assigned_to', userId)
      }
      const { data: client } = await clientQuery.single()

      if (client) {
        clientContextStr = `\n\n=== CURRENT CLIENT CONTEXT ===\n${formatClientSummary(client as Record<string, unknown>)}\n=== END CLIENT CONTEXT ===`
      }
    } else if (allClients && allClients.length > 0 && (isPlannerRole || isManagerRole)) {
      // Only send full client list rows for planner/manager — supervisor uses ops snapshot above
      const clientList = allClients.map((c: Record<string, unknown>) => {
        const name = `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim()
        const daysSince = getDaysSinceContact(c.last_contact_date as string | null)
        const overdueCount = getOverdueCount(c)
        const spmStatus = getDateStatus(c.spm_next_due as string | null)
        const spmNote = spmStatus === 'red' ? ' ⚠️ SPM OVERDUE' : spmStatus === 'orange' ? ' ⏰ SPM due soon' : ''
        return `- ${name} (ID: ${c.client_id}) | Overdue: ${overdueCount} | Last contact: ${daysSince !== null ? `${daysSince}d ago` : 'never'} | Goal: ${c.goal_pct ?? 0}% | POS: ${c.pos_status ?? 'unknown'}${spmNote}`
      }).join('\n')
      clientContextStr = `\n\n=== YOUR CLIENTS (${clientCount} total) ===\n${clientList}\n=== END CLIENTS ===`
    }

    const today = new Date()
    const todayStr = today.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    })
    const currentMonthDeadline = new Date(today.getFullYear(), today.getMonth(), 15)
    const nextMonthDeadline = new Date(today.getFullYear(), today.getMonth() + 1, 15)
    const spmDeadlinePassed = today > currentMonthDeadline
    const currentSpmStr = currentMonthDeadline.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    const nextSpmStr = nextMonthDeadline.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

    const roleLabel = userRole.replace(/_/g, ' ')
    const isManagerLike = userRole === 'team_manager' || isSupervisorLike(userRole)
    const isPlannerLike = userRole === 'supports_planner'

    const systemPrompt = `You are "BLH Bot", an intelligent assistant built into the CaseSync case management portal for Beatrice Loving Heart (BLH). You help Supports Planners, Team Managers, and Supervisors manage their caseloads and stay fully compliant.

=== CURRENT USER ===
Name: ${userName}
Role: ${roleLabel}
Role label: ${getRoleLabel(userRole) ?? roleLabel}
Role color: ${getRoleColor(userRole) ?? 'unknown'}
Supervisor-like: ${isSupervisorLike(userRole) ? 'yes' : 'no'}
Can manage team: ${canManageTeam(userRole) ? 'yes' : 'no'}
Assigned clients: ${clientCount}
Today: ${todayStr}
Current month SPM deadline: ${currentSpmStr}${spmDeadlinePassed ? ' — PASSED. File any missing SPMs immediately.' : ' — upcoming.'}
Next SPM deadline (if filed today or later this month): ${nextSpmStr}
=== END USER ===
${plannerContext}${clientContextStr}

${KNOWLEDGE_POS_WORKFLOW}

${KNOWLEDGE_POS_SUBMISSION}

${KNOWLEDGE_ATP}

${KNOWLEDGE_PROGRAM_CODES}

${KNOWLEDGE_TRANSITION_FUNDS}

${KNOWLEDGE_VISIT_CHECKLISTS}

${KNOWLEDGE_RUG_SCORES}

${KNOWLEDGE_CPAS}

${KNOWLEDGE_CFC_LIMITATIONS}

${KNOWLEDGE_PERSONAL_ASSISTANCE}

${KNOWLEDGE_SUPPLEMENTAL_ACP}

${KNOWLEDGE_GLOSSARY}

${KNOWLEDGE_NAVIGATION}

=== RESPONSE STYLE BY ROLE ===
- If the user is a Supports Planner, default to: immediate client actions, due-next guidance, submission readiness, and what to do today.
- If the user is a Team Manager, default to: which planners need follow-up, where queue pressure is stacking up, and the clearest next management move.
- If the user is a Supervisor, default to: org/team pressure, staffing/rebalance opportunities, and the top supervisory intervention points.
- If a user asks a higher-level question than their role normally needs, still answer using the available CaseSync context.
=== END RESPONSE STYLE BY ROLE ===

=== RESPONSE FORMAT ===
- Start with a direct answer in 1-2 short sentences.
- If action is needed, include a **Next actions** section with 1-3 bullets.
- If citing workload or risk, name the planner/client first, then the reason.
- Use **Watch-outs** only when there is a real deadline/compliance risk.
- For client-specific questions, prefer: status -> risk -> next actions.
- For team/org questions, prefer: top pressure -> best relief path -> immediate next move.
- For operations questions about workload, staffing, triage, compliance pressure, or rebalance, prefer this exact structure when useful:
  **Top pressure**
  - ...
  **Why**
  - ...
  **Next move**
  - ...
=== END RESPONSE FORMAT ===

=== RESPONSE GUIDELINES ===
1. Be concise and actionable. Use bullet points for lists.
2. When walking through the POS workflow, ask clarifying questions to find where the planner is in the process.
3. For "Is my POS ready to submit?" — walk through the POS submission checklist step by step.
4. For ATP questions — confirm the program type, then apply the correct rules.
5. For SPM — always remind: next due = 15th of the FOLLOWING month (never +30 days).
6. For navigation — embed page paths in brackets like [/calendar] so the UI renders them as clickable links.
7. When asked org/team operations questions, use the planner ops snapshot to name who needs intervention now, who can absorb work, and the most practical next move.
8. Prefer operational recommendations over generic commentary: identify the riskiest planners/clients first, then suggest the next 1-3 actions.
9. If the question is manager/supervisor-facing, summarize pressure, overdue burden, due-this-week load, and no-contact risk in plain English.
10. If there is not enough information for certainty, say what is known from CaseSync and what is still missing.
11. Be warm but professional — planners are caring for vulnerable people.
12. HIPAA: never suggest sharing client info externally.
=== END GUIDELINES ===`

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return new Response('AI service not configured', { status: 503 })
    }

    // 30-second timeout for Anthropic requests
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    let anthropicRes: Response
    try {
      anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          max_tokens: 1024,
          stream: true,
          system: systemPrompt,
          messages: messages.map((m: { role: string; content: string }) => ({
            role: m.role,
            content: m.content,
          })),
        }),
        signal: controller.signal,
      })
    } catch (fetchErr) {
      clearTimeout(timeoutId)
      if ((fetchErr as Error).name === 'AbortError') {
        return new Response(
          JSON.stringify({ error: 'BLH Bot took too long to respond. Please try again.' }),
          { status: 504, headers: { 'Content-Type': 'application/json' } }
        )
      }
      throw fetchErr
    }
    clearTimeout(timeoutId)

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text()
      console.error('Anthropic error:', err)
      return new Response('AI service error', { status: 500 })
    }

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        const reader = anthropicRes.body!.getReader()
        const decoder = new TextDecoder()
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            const chunk = decoder.decode(value, { stream: true })
            for (const line of chunk.split('\n')) {
              if (!line.startsWith('data: ')) continue
              const data = line.slice(6).trim()
              if (!data || data === '[DONE]') continue
              try {
                const parsed = JSON.parse(data)
                if (
                  parsed.type === 'content_block_delta' &&
                  parsed.delta?.type === 'text_delta' &&
                  parsed.delta?.text
                ) {
                  controller.enqueue(encoder.encode(parsed.delta.text))
                }
              } catch { /* skip malformed */ }
            }
          }
        } catch (err) {
          console.error('Stream error:', err)
        } finally {
          controller.close()
        }
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-cache',
      },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal error'
    console.error('case-ai error:', msg)
    return new Response(msg, { status: 500 })
  } finally {
    activeRequests--
  }
}
