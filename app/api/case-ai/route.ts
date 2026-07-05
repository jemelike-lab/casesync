import { isSupervisorLike, canManageTeam, getRoleLabel, getRoleColor } from '@/lib/roles'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { checkAiRateLimit } from '@/lib/ai-rate-limit'
import { validateUUID } from '@/lib/validation'
import { auditLog } from '@/lib/audit'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'
import { evaluateReadiness, SIGNATURE_CATEGORIES } from '@/lib/readiness'
import { ensureConversation, persistExchange } from '@/lib/bot-persistence'
import { getBotKnowledgeSection } from '@/lib/bot-knowledge'
import { businessTodayStr, businessDateOffsetStr } from '@/lib/business-date'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // Allow up to 60s for multi-tool bot conversations

// ─── Rate limiter ─────────────────────────────────────────────────────────────
let activeRequests = 0
const MAX_CONCURRENT = 10

// ─── Paginated Supabase fetch (bypasses 1,000-row default limit) ─────────────
const PAGE_SIZE = 1000

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAllRows(buildQuery: () => any): Promise<Record<string, unknown>[]> {
  const allRows: Record<string, unknown>[] = []
  let from = 0
  while (true) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const rows = (data ?? []) as Record<string, unknown>[]
    allRows.push(...rows)
    if (rows.length < PAGE_SIZE) break
    from += PAGE_SIZE
    if (from > 10000) break // safety cap
  }
  return allRows
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * D4: Stream a final Anthropic response to the client.
 * Parses SSE events and extracts content_block_delta text chunks.
 */
function streamAnthropicResponse(
  apiHeaders: Record<string, string>,
  systemPrompt: string,
  messages: Array<{ role: string; content: unknown }>,
  tools?: unknown[],
  toolChoice?: { type: string },
  appendText?: string,
  extraHeaders?: Record<string, string>,
  onDone?: (fullText: string) => Promise<void>,
): Response {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      // Batch D: accumulate the streamed text so onDone can persist the final
      // answer (appendText — the proposal trailer — is deliberately excluded).
      let streamedText = ''
      try {
        const body: Record<string, unknown> = {
          model: 'claude-haiku-4-5',
          max_tokens: 1024,
          system: systemPrompt,
          messages,
          stream: true,
        }
        if (tools) body.tools = tools
        if (toolChoice) body.tool_choice = toolChoice

        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: apiHeaders,
          body: JSON.stringify(body),
        })

        if (!res.ok || !res.body) {
          controller.enqueue(encoder.encode('AI service error — please try again.'))
          controller.close()
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const json = line.slice(6).trim()
            if (json === '[DONE]') continue
            try {
              const event = JSON.parse(json)
              if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                streamedText += event.delta.text
                controller.enqueue(encoder.encode(event.delta.text))
              }
            } catch {
              // skip unparseable events
            }
          }
        }
      } catch {
        controller.enqueue(encoder.encode('\n\nSorry, the response was interrupted. Please try again.'))
      } finally {
        if (appendText) {
          try { controller.enqueue(encoder.encode(appendText)) } catch { /* stream already closed */ }
        }
        // The invocation is still alive while the stream is open, so awaiting
        // persistence here (before close) is serverless-safe. Non-fatal.
        if (onDone) {
          try { await onDone(streamedText) } catch { /* persistence is non-fatal */ }
        }
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
      ...(extraHeaders ?? {}),
    },
  })
}

function getDateStatus(dateStr: string | null): 'critical' | 'red' | 'orange' | 'yellow' | 'green' | 'none' {
  if (!dateStr) return 'none'
  // Use date-only comparison to match dashboard logic (lib/types.ts getDateStatus)
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)  // midnight local
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())  // midnight local
  const diffMs = date.getTime() - today.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays < -14) return 'critical'
  if (diffDays < 0) return 'red'
  if (diffDays <= 3) return 'orange'
  if (diffDays <= 7) return 'yellow'
  return 'green'
}

function getOverdueCount(client: Record<string, unknown>): number {
  const fields = [
    'eligibility_end_date', 'three_month_visit_due', 'quarterly_waiver_date',
    'med_tech_redet_date', 'pos_deadline', 'assessment_due', 'thirty_day_letter_date',
    'co_financial_redet_date', 'co_app_date', 'mfp_consent_date', 'two57_date', 'doc_mdh_date',
    'spm_next_due',
  ]
  return fields.filter(f => {
    const s = getDateStatus(client[f] as string | null)
    return s === 'red' || s === 'critical'
  }).length
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
Eligibility Code: ${client.eligibility_code ?? 'not set'}
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
      return days === null || days >= 7
    }).length
    const avgGoalPct = plannerClients.length > 0
      ? Math.round(plannerClients.reduce((sum, client) => sum + Number(client.goal_pct ?? 0), 0) / plannerClients.length)
      : 0
    const complianceScore = plannerClients.length > 0
      ? Math.round(plannerClients.filter((client) => getOverdueCount(client) === 0).length / plannerClients.length * 100)
      : 100
    const pressureScore = overdue * 5 + dueThisWeek * 2 + Math.max(0, plannerClients.length - 35)
    const loadStatus: PlannerOpsRow['loadStatus'] = pressureScore >= 12 ? 'rebalance' : pressureScore >= 6 ? 'watch' : 'balanced'
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

  return derivePlannerOps(plannerRows)
}

type PlannerOpsRow = {
  plannerId: string
  plannerName: string
  clientCount: number
  overdue: number
  dueThisWeek: number
  noContact7: number
  avgGoalPct: number
  complianceScore: number
  pressureScore: number
  loadStatus: 'rebalance' | 'watch' | 'balanced'
  topOverdueClients: string[]
}

// Shared tail of the workload summary — the donor/receiver/alert derivation is
// planner-level and identical for both the SQL-aggregate (Azure) and row-scan
// (fallback) paths, so it lives in exactly one place.
function derivePlannerOps(plannerRows: PlannerOpsRow[]) {
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

// Audit item #7 (2026-07-04): the Azure path computes per-planner counts IN the
// database instead of hauling every in-scope client row into JS on each bot
// question. Predicates mirror the canonical 13 deadline fields and the
// America/New_York business date, same as lib/dashboard-summary and
// lib/db/clients-azure. Never-contacted counts as no-contact (isNoContact7Days
// semantics).
async function getPlannerOpsSummaryAzure(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sql: any,
  plannerIds: string[],
  planners: Record<string, unknown>[],
) {
  const agg = (await sql`
    WITH t AS (SELECT (now() at time zone 'America/New_York')::date AS today)
    SELECT
      c.assigned_to,
      COUNT(*)::int AS client_count,
      COUNT(*) FILTER (WHERE c.eligibility_end_date < t.today OR c.three_month_visit_due < t.today OR c.quarterly_waiver_date < t.today OR c.med_tech_redet_date < t.today OR c.pos_deadline < t.today OR c.assessment_due < t.today OR c.thirty_day_letter_date < t.today OR c.co_financial_redet_date < t.today OR c.co_app_date < t.today OR c.mfp_consent_date < t.today OR c.two57_date < t.today OR c.doc_mdh_date < t.today OR c.spm_next_due < t.today)::int AS overdue,
      COUNT(*) FILTER (WHERE c.eligibility_end_date BETWEEN t.today AND t.today + 7 OR c.three_month_visit_due BETWEEN t.today AND t.today + 7 OR c.quarterly_waiver_date BETWEEN t.today AND t.today + 7 OR c.med_tech_redet_date BETWEEN t.today AND t.today + 7 OR c.pos_deadline BETWEEN t.today AND t.today + 7 OR c.assessment_due BETWEEN t.today AND t.today + 7 OR c.thirty_day_letter_date BETWEEN t.today AND t.today + 7 OR c.co_financial_redet_date BETWEEN t.today AND t.today + 7 OR c.co_app_date BETWEEN t.today AND t.today + 7 OR c.mfp_consent_date BETWEEN t.today AND t.today + 7 OR c.two57_date BETWEEN t.today AND t.today + 7 OR c.doc_mdh_date BETWEEN t.today AND t.today + 7 OR c.spm_next_due BETWEEN t.today AND t.today + 7)::int AS due_this_week,
      COUNT(*) FILTER (WHERE c.last_contact_date IS NULL OR c.last_contact_date <= t.today - 7)::int AS no_contact7,
      COALESCE(ROUND(AVG(COALESCE(c.goal_pct, 0)))::int, 0) AS avg_goal_pct
    FROM clients c CROSS JOIN t
    WHERE c.is_active = true AND c.client_classification = 'real' AND c.assigned_to = ANY(${plannerIds}::uuid[])
    GROUP BY c.assigned_to
  `) as unknown as Array<{
    assigned_to: string
    client_count: number
    overdue: number
    due_this_week: number
    no_contact7: number
    avg_goal_pct: number
  }>

  const top = (await sql`
    WITH t AS (SELECT (now() at time zone 'America/New_York')::date AS today),
    oc AS (
      SELECT c.assigned_to, c.last_name, c.first_name, c.client_id,
        ((c.eligibility_end_date IS NOT NULL AND c.eligibility_end_date < t.today)::int + (c.three_month_visit_due IS NOT NULL AND c.three_month_visit_due < t.today)::int + (c.quarterly_waiver_date IS NOT NULL AND c.quarterly_waiver_date < t.today)::int + (c.med_tech_redet_date IS NOT NULL AND c.med_tech_redet_date < t.today)::int + (c.pos_deadline IS NOT NULL AND c.pos_deadline < t.today)::int + (c.assessment_due IS NOT NULL AND c.assessment_due < t.today)::int + (c.thirty_day_letter_date IS NOT NULL AND c.thirty_day_letter_date < t.today)::int + (c.co_financial_redet_date IS NOT NULL AND c.co_financial_redet_date < t.today)::int + (c.co_app_date IS NOT NULL AND c.co_app_date < t.today)::int + (c.mfp_consent_date IS NOT NULL AND c.mfp_consent_date < t.today)::int + (c.two57_date IS NOT NULL AND c.two57_date < t.today)::int + (c.doc_mdh_date IS NOT NULL AND c.doc_mdh_date < t.today)::int + (c.spm_next_due IS NOT NULL AND c.spm_next_due < t.today)::int) AS overdue_count
      FROM clients c CROSS JOIN t
      WHERE c.is_active = true AND c.client_classification = 'real' AND c.assigned_to = ANY(${plannerIds}::uuid[])
    )
    SELECT assigned_to, last_name, first_name, client_id, overdue_count FROM (
      SELECT oc.*, ROW_NUMBER() OVER (PARTITION BY assigned_to ORDER BY overdue_count DESC, last_name ASC) AS rn
      FROM oc WHERE overdue_count > 0
    ) ranked WHERE rn <= 3
  `) as unknown as Array<{
    assigned_to: string
    last_name: string | null
    first_name: string | null
    client_id: string | null
  }>

  const aggMap = new Map(agg.map((row) => [row.assigned_to, row]))
  const topMap = new Map<string, string[]>()
  for (const row of top) {
    const label = `${row.last_name ?? 'Unknown'}${row.first_name ? `, ${row.first_name}` : ''} (${row.client_id ?? 'no-id'})`
    const list = topMap.get(row.assigned_to) ?? []
    list.push(label)
    topMap.set(row.assigned_to, list)
  }

  const plannerRows: PlannerOpsRow[] = planners.map((planner) => {
    const id = String(planner.id ?? '')
    const a = aggMap.get(id)
    const clientCount = a?.client_count ?? 0
    const overdue = a?.overdue ?? 0
    const dueThisWeek = a?.due_this_week ?? 0
    const complianceScore = clientCount > 0
      ? Math.round((clientCount - overdue) / clientCount * 100)
      : 100
    const pressureScore = overdue * 5 + dueThisWeek * 2 + Math.max(0, clientCount - 35)
    const loadStatus: PlannerOpsRow['loadStatus'] =
      pressureScore >= 12 ? 'rebalance' : pressureScore >= 6 ? 'watch' : 'balanced'
    return {
      plannerId: id,
      plannerName: String(planner.full_name ?? 'Unknown'),
      clientCount,
      overdue,
      dueThisWeek,
      noContact7: a?.no_contact7 ?? 0,
      avgGoalPct: a?.avg_goal_pct ?? 0,
      complianceScore,
      pressureScore,
      loadStatus,
      topOverdueClients: topMap.get(id) ?? [],
    }
  })

  return derivePlannerOps(plannerRows)
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

const KNOWLEDGE_DRAFTING = `
=== DRAFT WRITING (LETTERS, NOTES, SUMMARIES) ===
You can draft professional text for the user to copy into their own workflow. You NEVER send anything yourself, and drafts are ALWAYS for the user to review before use.
• Contact / case note: 2-6 sentences, past tense, objective and factual, no diagnoses or speculation. Include: date, contact type, what was discussed, and any follow-ups with owner + due date.
• 30-day letter: professional letter to the client. Use placeholders like [Date], [Client Name], [Address] for anything not supplied. State that the Support Planner has been unable to reach them, list ONLY contact attempts the user actually provided (never invent attempts or dates), state clearly what the client must do and by when, and close with the SP name + contact line.
• Reportable-event summary: strictly factual and chronological — what happened, when it was discovered, who was notified, immediate actions taken, and the follow-up plan. No speculation about causes or fault.
• Fill drafts from the ACTUAL client context or tool data when available; use [placeholders] for anything unknown. Always remind the user to review and complete the draft before using it.
`

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
=== CASESYNC SITE GUIDE (how to use the portal) ===
You know the CaseSync site thoroughly. When users ask "how do I..." or "where is...", give exact, step-by-step guidance from this guide. Route paths are in [brackets].

NAVIGATION
- Dashboard [/dashboard]: stat cards (Active / Overdue / Due this week / No contact — click one to filter), urgent-tasks welcome card, role-based team panels.
- All clients [/clients] · Add client [/clients/new] · Client detail [/clients/{clientId}] · Calendar [/calendar] · Team chat [/chat] · Team [/team] (team managers+) · Supervisor [/supervisor] · Admin [/admin] · Audit log [/admin/audit] (supervisors) · Settings [/settings/security] · Help [/help] · Workryn (HR/ops) via the ⇄ Workryn button in the header.

CLIENT DETAIL PAGE (top to bottom)
- Identity hero: name, program pill, ID and eligibility code; Edit button and ⋮ menu (Reassign, Mark as deceased, Print).
- Status row: four cards — last contact, next deadline, goal progress, eligibility countdown.
- Attention card: "N items need attention" — automatic, deterministic reminders (overdue contact, deadlines within 7 days, failed POS-readiness gates). Collapsing it keeps it collapsed for the rest of the day. Item links jump to the relevant section or open the edit form.
- Sections in order: Deadlines, Contact details, Plans & assessments, CO details, Med tech, Forms & signatures, Authorizations, Reporting & reviews, Notes, Activity, Client files.
- Right rail on wide screens: snapshot, key dates, AI Intelligence. On narrow screens it becomes a floating brain button stacked above my launcher.

EDITING A CLIENT
- The Edit button opens the full edit form: eligibility code, goal %, every deadline date, contact, plans, CO, med tech, forms, authorizations, and reporting fields. Save writes everything at once and records the changes in the Activity log. Marking SPM completed auto-sets the next SPM due date 30 days out.

CLIENT FILES
- Seven folders: Intake, CO, Plans, Forms & Signatures, Authorizations, Reporting & Reviews, Other.
- Uploading requires choosing a category first — this is enforced; uncategorized uploads are rejected. An optional expiry date shows colored badges as it approaches.
- PDFs and images preview in-portal; Word and Excel render in the viewer; other types download.
- Downloading on a phone opens the share sheet — tap "Save to Files".
- Deleting asks for confirmation and is permanent (removed from CaseSync and SharePoint).

ACTIONS AND WHO CAN DO WHAT
- Reassign and Mark as deceased: supervisors and team managers only (⋮ menu on the hero). Mark as deceased requires typing the client's last name to confirm, and deactivates the client.
- Data visibility is automatic and enforced: Supports Planners see their own clients, Team Managers their team, Supervisors everything. My tools follow the same scoping.
- Planner-workload comparisons: team managers and supervisors only.
- My knowledge base editor [/admin/bot-knowledge]: supervisors and administrators only.

SESSIONS AND THE MOBILE APP (PWA)
- CaseSync installs as an app: browser menu → Add to Home Screen / Install.
- Security behavior is intentional PHI protection, not a bug: 30-minute idle timeout with a 2-minute warning; on the installed app, fully closing it — or leaving it in the background for more than a minute — requires signing in again.

RULES FOR SITE HELP (ENFORCE ALWAYS)
- NEVER help anyone bypass role restrictions, access controls, or session/security rules — no workarounds, no exceptions. If asked, explain the restriction protects client PHI and direct them to their Supervisor or the Administrator for access requests.
- You cannot change anyone's role or permissions, and you never suggest sharing logins or credentials.
- You may describe features a user's role cannot access, but always state which role is required.
- POS submission itself happens in the external LTSS system, not inside CaseSync.
- If the site behaves differently from this guide, trust what the user is seeing and point them to the Help page [/help] or their Supervisor.
=== END CASESYNC SITE GUIDE ===`

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

const KNOWLEDGE_ADL_IADL_TIMES = `
=== ADL/IADL STANDARDIZED TIMES (SOP Reference) ===

ADL (Activities of Daily Living) Standard Times:
- Bathing/Grooming: 30 min per session
- Dressing: 15 min per session
- Eating/Feeding assistance: 30 min per meal
- Toileting: 15 min per session
- Transferring/Mobility: 15 min per session
- Personal Hygiene: 15 min per session

IADL (Instrumental Activities of Daily Living) Standard Times:
- Meal Preparation: 60 min per meal
- Laundry: 60 min per load
- Light Housekeeping: 60 min per session
- Heavy Housekeeping: 120 min per session
- Grocery Shopping: 90 min per trip (includes travel)
- Medication Management: 15 min per session
- Community Integration/Errands: time varies by activity
- Companion/Supervision: billed per hour as authorized

Key Rules:
- POS hours must align with assessed needs from POC/interRAI
- Total weekly hours cannot exceed what RUG score authorizes
- All time entries must match actual delivered service
- If time exceeds standard, narrative justification required in POS
- Overnight hours (sleep cycle) are NOT billable unless active care documented
`;


const KNOWLEDGE_MA_COVERAGE_GROUPS = `
=== MARYLAND MA COVERAGE GROUPS ===

COMMUNITY OPTIONS (CO):
  CO1: Community Options Waiver - Home & Community Based
  CO Codes: OAA (Assisted Living, NOT MFP), OAM (Assisted Living, MFP eligible),
            OAH (Private residence, NOT MFP), OHM (Private residence, MFP eligible)

HOME & COMMUNITY BASED OPTIONS (HCBO):
  HCBO: Model Waiver (formerly known as Waiver for Older Adults)
  Note: If participant is HCBO, they are NOT HealthChoice eligible

CFC (Community First Choice):
  State Plan Service (NOT a waiver)
  No special program code - uses standard MA
  Eligibility: Institutional level of care + community-based
  Services: Personal assistance, community integration

CPAS (Community Personal Assistance Services):
  State Plan Service (NOT a waiver)
  No special program code - uses standard MA
  For individuals not meeting institutional level of care

MEDICAID CATEGORIES:
  A01-A06: Aged categories
  D01-D06: Disabled categories
  F01: Foster Care
  S03: QMB (Qualified Medicare Beneficiary) - Medicare Savings
  S07: SLMB (Specified Low Income Medicare Beneficiary) - Medicare Savings
  S14: QI (Qualifying Individual) - Medicare Savings

ELIGIBILITY:
  C13M: MAGI groups (excluding Pregnant Women)
  C13P: Pregnant Women

NOTES:
  HealthChoice eligible unless: on Medicare, in institution, out of state, or in Model Waiver
  Medicare Savings Programs: S03 (QMB), S07 (SLMB), S14 (QI)
  CFC and CPAS have NO special program codes - they are State Plan Services not waivers
`;



// ---- Tool definitions for Casey function calling ----

const BOT_TOOLS = [
  {
    name: "search_clients" as const,
    description: "Search and filter across the caseload. Use when user asks about eligibility ending soon, overdue items, specific categories, or date ranges. Results are scoped by role automatically.",
    input_schema: {
      type: "object" as const,
      properties: {
        eligibility_ending_within_days: {
          type: "number" as const,
          description: "Find entries whose eligibility_end_date is within this many days from today."
        },
        category: {
          type: "string" as const,
          description: "Filter by category code (e.g. CO, CFC, CPAS, HCBO)."
        },
        name_search: {
          type: "string" as const,
          description: "Search by name (partial match)."
        },
        overdue_field: {
          type: "string" as const,
          description: "Find entries overdue on this field. Valid: pos_deadline, assessment_due, eligibility_end_date, loc_date, med_tech_redet_date, spm_next_due, quarterly_waiver_date, three_month_visit_due, thirty_day_letter_date, co_financial_redet_date, co_app_date, mfp_consent_date, two57_date, doc_mdh_date"
        },
        assigned_to_id: {
          type: "string" as const,
          description: "Filter by assigned planner UUID."
        },
        limit: {
          type: "number" as const,
          description: "Max results to return (default 20, max 50)."
        }
      },
      required: [] as string[]
    }
  },
  {
    name: "get_caseload_stats" as const,
    description: "Get aggregate stats: total count, overdue counts by field, eligibility expirations in 30/60/90 days. Results are scoped by role.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [] as string[]
    }
  },
  {
    name: "get_client_notes" as const,
    description: "Fetch the case notes for a specific client — visit history, prior conversations, and what colleagues have written. Use when the user asks what happened previously, about the last visit, or for background before contacting a client. Requires the client's uuid id (from CURRENT CLIENT CONTEXT or search_clients results — NOT the display client_id). Results are scoped by role automatically.",
    input_schema: {
      type: "object" as const,
      properties: {
        client_id: {
          type: "string" as const,
          description: "The client's uuid id field (from context or search_clients results)."
        },
        limit: {
          type: "number" as const,
          description: "Max notes to return, most recent first (default 10, max 25)."
        }
      },
      required: ["client_id"] as string[]
    }
  },
  {
    name: "get_client_files" as const,
    description: "List the documents on file for a specific client (name, category, upload date, expiration). Use whenever the user asks whether a document exists, what is on file, or what is missing. NEVER guess about file existence. Requires the client's uuid id. Results are scoped by role automatically.",
    input_schema: {
      type: "object" as const,
      properties: {
        client_id: {
          type: "string" as const,
          description: "The client's uuid id field (from context or search_clients results)."
        }
      },
      required: ["client_id"] as string[]
    }
  },
  {
    name: "compute_deadline" as const,
    description: "Deterministic date math. REQUIRED for ALL date arithmetic — never compute dates yourself. Operations: spm_next_due (15th of the month following anchor_date), add_days, add_months, days_between.",
    input_schema: {
      type: "object" as const,
      properties: {
        operation: {
          type: "string" as const,
          description: "One of: spm_next_due, add_days, add_months, days_between"
        },
        anchor_date: {
          type: "string" as const,
          description: "Start date, YYYY-MM-DD"
        },
        amount: {
          type: "number" as const,
          description: "Integer days/months for add_days / add_months"
        },
        end_date: {
          type: "string" as const,
          description: "End date (YYYY-MM-DD) for days_between"
        }
      },
      required: ["operation", "anchor_date"] as string[]
    }
  },
  {
    name: "get_assignment_history" as const,
    description: "Show who a client has been assigned to over time — each reassignment with from/to planner, who did it, when, and why. Requires the client's uuid id. Results are scoped by role automatically.",
    input_schema: {
      type: "object" as const,
      properties: {
        client_id: {
          type: "string" as const,
          description: "The client's uuid id field (from context or search_clients results)."
        }
      },
      required: ["client_id"] as string[]
    }
  },
  {
    name: "get_planner_workload" as const,
    description: "Per-planner workload and compliance comparison: client counts, overdue burden, due-this-week load, contact gaps, compliance scores, rebalance donors/receivers. ONLY for team managers and supervisors — refuse for planners. Team managers see their own team; supervisors see all planners.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [] as string[]
    }
  },
  {
    name: "evaluate_client_readiness" as const,
    description: "Deterministically check whether a specific client's Plan of Service is ready to submit, against BLH's five hard submission gates: Medicaid active, Level of Care valid (annual — not expired or expiring within 30 days), POS marked Completed, signed forms on file (Forms & Signatures folder), and a Plan of Care on file. A missing value FAILS its gate. Also returns the manual-checklist reminders the planner must eyeball (emergency backups, narrative, service address, CSQ timing, services) — these are NOT auto-scored. Requires the client's uuid id. Results are scoped by role automatically. Use whenever the user asks whether a client is ready, what is blocking submission, or what still needs doing before submitting a POS.",
    input_schema: {
      type: "object" as const,
      properties: {
        client_id: {
          type: "string" as const,
          description: "The client's uuid id field (from context or search_clients results)."
        }
      },
      required: ["client_id"] as string[]
    }
  },
  {
    name: "propose_log_contact" as const,
    description: "PROPOSE logging a client contact (visit, call, email). Nothing is saved by this tool — the user must tap Confirm on the card shown under your reply. Use whenever the user asks to log, record, or note a contact or visit. Requires the client's uuid id.",
    input_schema: {
      type: "object" as const,
      properties: {
        client_id: { type: "string" as const, description: "The client's uuid id field (from context or search_clients results)." },
        date: { type: "string" as const, description: "Contact date, YYYY-MM-DD. Resolve 'today' from the Today date in your context." },
        type: { type: "string" as const, description: "Contact type: phone, in_person, email, video, or similar." },
        note: { type: "string" as const, description: "Optional short note about the contact." }
      },
      required: ["client_id", "date", "type"] as string[]
    }
  },
  {
    name: "propose_add_note" as const,
    description: "PROPOSE adding a case note to a client's record. Nothing is saved by this tool — the user must tap Confirm on the card shown under your reply. Use whenever the user asks to add, save, or write a note. Requires the client's uuid id.",
    input_schema: {
      type: "object" as const,
      properties: {
        client_id: { type: "string" as const, description: "The client's uuid id field (from context or search_clients results)." },
        content: { type: "string" as const, description: "The note text, exactly as it should be saved." }
      },
      required: ["client_id", "content"] as string[]
    }
  },
  {
    name: "propose_update_date" as const,
    description: "PROPOSE changing one of a client's deadline/date fields. Nothing is saved by this tool — the user must tap Confirm on the card shown under your reply. Use whenever the user asks to set, change, or update a deadline or date. Requires the client's uuid id, the exact field name, and the new date.",
    input_schema: {
      type: "object" as const,
      properties: {
        client_id: { type: "string" as const, description: "The client's uuid id field (from context or search_clients results)." },
        field: { type: "string" as const, description: "Exact column name, e.g. pos_deadline, assessment_due, spm_next_due, eligibility_end_date, three_month_visit_due." },
        new_date: { type: "string" as const, description: "New value, YYYY-MM-DD." }
      },
      required: ["client_id", "field", "new_date"] as string[]
    }
  }
];

// ---- Tool execution functions ----

async function executeSearchClients(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  input: Record<string, unknown>,
  userRole: string,
  userId: string
) {
  const limit = Math.min(Number(input.limit) || 20, 50);
  if (isAzureConfigured()) {
    return await withRlsContext(userId, async (sql) => {
      let scope = sql``
      if (userRole === 'supports_planner' || userRole === 'SUPPORT_PLANNER' || userRole === 'STAFF') {
        scope = sql`AND assigned_to = ${userId}`
      } else if (userRole === 'team_manager' || userRole === 'TEAM_MANAGER' || userRole === 'MANAGER') {
        const tm = await sql`SELECT id FROM profiles WHERE team_manager_id = ${userId}`
        const ids = (tm as unknown as { id: string }[]).map((m) => m.id)
        ids.push(userId)
        scope = sql`AND assigned_to = ANY(${ids}::uuid[])`
      }
      let eligFrag = sql``
      if (input.eligibility_ending_within_days) {
        const todayStr = businessTodayStr();
        const futureStr = businessDateOffsetStr(Number(input.eligibility_ending_within_days));
        eligFrag = sql`AND eligibility_end_date >= ${todayStr} AND eligibility_end_date <= ${futureStr}`
      }
      let catFrag = sql``
      if (input.category) {
        catFrag = sql`AND category ILIKE ${String(input.category)}`
      }
      let nameFrag = sql``
      if (input.name_search) {
        const search = String(input.name_search).replace(/[%_]/g, '');
        nameFrag = sql`AND (first_name ILIKE ${'%' + search + '%'} OR last_name ILIKE ${'%' + search + '%'})`
      }
      let overdueFrag = sql``
      if (input.overdue_field) {
        const validFields = new Set([
          'pos_deadline', 'assessment_due', 'eligibility_end_date', 'loc_date',
          'med_tech_redet_date', 'spm_next_due', 'quarterly_waiver_date',
          'three_month_visit_due', 'thirty_day_letter_date', 'co_financial_redet_date',
          'co_app_date', 'mfp_consent_date', 'two57_date', 'doc_mdh_date'
        ]);
        const field = String(input.overdue_field);
        if (validFields.has(field)) {
          overdueFrag = sql`AND ${sql(field)} < ${businessTodayStr()} AND ${sql(field)} IS NOT NULL`
        }
      }
      let assignedFrag = sql``
      if (input.assigned_to_id) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(String(input.assigned_to_id))) {
          assignedFrag = sql`AND assigned_to = ${String(input.assigned_to_id)}`
        }
      }
      const azRows = await sql`SELECT id, client_id, first_name, last_name, category, is_active, assigned_to, eligibility_end_date, pos_deadline, assessment_due, loc_date, med_tech_redet_date, spm_next_due, quarterly_waiver_date, three_month_visit_due, thirty_day_letter_date, co_financial_redet_date, co_app_date, mfp_consent_date, two57_date, doc_mdh_date, goal_pct, pos_status, last_contact_date FROM clients WHERE is_active = true AND client_classification = 'real' ${scope} ${eligFrag} ${catFrag} ${nameFrag} ${overdueFrag} ${assignedFrag} ORDER BY eligibility_end_date ASC LIMIT ${limit}`
      const results = azRows as unknown as Record<string, unknown>[]
      return JSON.stringify({ count: results.length, results });
    });
  }
  let query = supabase.from('clients').select(
    'id, client_id, first_name, last_name, category, is_active, assigned_to, eligibility_end_date, pos_deadline, assessment_due, loc_date, med_tech_redet_date, spm_next_due, quarterly_waiver_date, three_month_visit_due, thirty_day_letter_date, co_financial_redet_date, co_app_date, mfp_consent_date, two57_date, doc_mdh_date, goal_pct, pos_status, last_contact_date'
  ).eq('is_active', true).eq('client_classification', 'real');

  // Role-based scoping (roles stored lowercase in profiles table)
  if (userRole === 'supports_planner' || userRole === 'SUPPORT_PLANNER' || userRole === 'STAFF') {
    query = query.eq('assigned_to', userId);
  } else if (userRole === 'team_manager' || userRole === 'TEAM_MANAGER' || userRole === 'MANAGER') {
    const { data: teamMembers } = await supabase
      .from('profiles')
      .select('id')
      .eq('team_manager_id', userId);
    const teamIds = (teamMembers || []).map((m: { id: string }) => m.id);
    teamIds.push(userId);
    query = query.in('assigned_to', teamIds);
  }
  // SUPERVISOR, ADMIN, OWNER see all - no filter needed

  if (input.eligibility_ending_within_days) {
    query = query.gte('eligibility_end_date', businessTodayStr())
                 .lte('eligibility_end_date', businessDateOffsetStr(Number(input.eligibility_ending_within_days)));
  }

  if (input.category) {
    query = query.ilike('category', String(input.category));
  }

  if (input.name_search) {
    const search = String(input.name_search).replace(/[%_]/g, '');
    query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
  }

  if (input.overdue_field) {
    const validFields = new Set([
      'pos_deadline', 'assessment_due', 'eligibility_end_date', 'loc_date',
      'med_tech_redet_date', 'spm_next_due', 'quarterly_waiver_date',
      'three_month_visit_due', 'thirty_day_letter_date', 'co_financial_redet_date',
      'co_app_date', 'mfp_consent_date', 'two57_date', 'doc_mdh_date'
    ]);
    const field = String(input.overdue_field);
    if (validFields.has(field)) {
      query = query.lt(field, businessTodayStr()).not(field, 'is', null);
    }
  }

  if (input.assigned_to_id) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(String(input.assigned_to_id))) {
      query = query.eq('assigned_to', String(input.assigned_to_id));
    }
  }

  const { data, error } = await query.order('eligibility_end_date', { ascending: true }).limit(limit);

  if (error) return JSON.stringify({ error: error.message });
  return JSON.stringify({ count: (data || []).length, results: data || [] });
}

async function executeGetClientNotes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  input: Record<string, unknown>,
  userRole: string,
  userId: string
) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const clientId = String(input.client_id ?? '');
  if (!uuidRegex.test(clientId)) {
    return JSON.stringify({ error: 'client_id must be the uuid id field from context or search_clients results, not the display client_id' });
  }
  const limit = Math.min(Number(input.limit) || 10, 25);

  if (isAzureConfigured()) {
    return await withRlsContext(userId, async (sql) => {
      let scope = sql``
      if (userRole === 'supports_planner' || userRole === 'SUPPORT_PLANNER' || userRole === 'STAFF') {
        scope = sql`AND c.assigned_to = ${userId}`
      } else if (userRole === 'team_manager' || userRole === 'TEAM_MANAGER' || userRole === 'MANAGER') {
        const tm = await sql`SELECT id FROM profiles WHERE team_manager_id = ${userId}`
        const ids = (tm as unknown as { id: string }[]).map((m) => m.id)
        ids.push(userId)
        scope = sql`AND c.assigned_to = ANY(${ids}::uuid[])`
      }
      const rows = await sql`SELECT n.content, n.created_at, p.full_name AS author FROM client_notes n JOIN clients c ON c.id = n.client_id LEFT JOIN profiles p ON p.id = n.author_id WHERE n.client_id = ${clientId} ${scope} ORDER BY n.created_at DESC LIMIT ${limit}`
      const notes = rows as unknown as Record<string, unknown>[]
      return JSON.stringify({ count: notes.length, notes });
    });
  }

  // Supabase fallback: verify the client is in role scope first (RLS also applies).
  let clientQuery = supabase.from('clients').select('id').eq('id', clientId);
  if (userRole === 'supports_planner' || userRole === 'SUPPORT_PLANNER' || userRole === 'STAFF') {
    clientQuery = clientQuery.eq('assigned_to', userId);
  } else if (userRole === 'team_manager' || userRole === 'TEAM_MANAGER' || userRole === 'MANAGER') {
    const { data: teamMembers } = await supabase.from('profiles').select('id').eq('team_manager_id', userId);
    const teamIds = (teamMembers || []).map((m: { id: string }) => m.id);
    teamIds.push(userId);
    clientQuery = clientQuery.in('assigned_to', teamIds);
  }
  const { data: scopedClient } = await clientQuery.single();
  if (!scopedClient) return JSON.stringify({ error: 'Client not found (or out of scope)' });

  const { data, error } = await supabase
    .from('client_notes')
    .select('content, created_at, profiles(full_name)')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return JSON.stringify({ error: error.message });
  const notes = (data || []).map((n: { content: string; created_at: string; profiles?: { full_name: string | null } | null }) => ({ content: n.content, created_at: n.created_at, author: n.profiles?.full_name ?? null }));
  return JSON.stringify({ count: notes.length, notes });
}

async function executeGetClientFiles(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  input: Record<string, unknown>,
  userRole: string,
  userId: string
) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const clientId = String(input.client_id ?? '');
  if (!uuidRegex.test(clientId)) {
    return JSON.stringify({ error: 'client_id must be the uuid id field from context or search_clients results' });
  }

  if (isAzureConfigured()) {
    return await withRlsContext(userId, async (sql) => {
      let scope = sql``
      if (userRole === 'supports_planner' || userRole === 'SUPPORT_PLANNER' || userRole === 'STAFF') {
        scope = sql`AND c.assigned_to = ${userId}`
      } else if (userRole === 'team_manager' || userRole === 'TEAM_MANAGER' || userRole === 'MANAGER') {
        const tm = await sql`SELECT id FROM profiles WHERE team_manager_id = ${userId}`
        const ids = (tm as unknown as { id: string }[]).map((m) => m.id)
        ids.push(userId)
        scope = sql`AND c.assigned_to = ANY(${ids}::uuid[])`
      }
      const rows = await sql`SELECT cd.file_name, cd.category, cd.file_size, cd.expires_at, cd.created_at, cd.storage_provider FROM client_documents cd JOIN clients c ON c.id = cd.client_id WHERE cd.client_id = ${clientId} ${scope} ORDER BY cd.created_at DESC LIMIT 50`
      return JSON.stringify({ count: rows.length, files: rows });
    });
  }

  let clientQuery = supabase.from('clients').select('id').eq('id', clientId);
  if (userRole === 'supports_planner' || userRole === 'SUPPORT_PLANNER' || userRole === 'STAFF') {
    clientQuery = clientQuery.eq('assigned_to', userId);
  } else if (userRole === 'team_manager' || userRole === 'TEAM_MANAGER' || userRole === 'MANAGER') {
    const { data: teamMembers } = await supabase.from('profiles').select('id').eq('team_manager_id', userId);
    const teamIds = (teamMembers || []).map((m: { id: string }) => m.id);
    teamIds.push(userId);
    clientQuery = clientQuery.in('assigned_to', teamIds);
  }
  const { data: scopedClient } = await clientQuery.single();
  if (!scopedClient) return JSON.stringify({ error: 'Client not found (or out of scope)' });

  const { data, error } = await supabase
    .from('client_documents')
    .select('file_name, category, file_size, expires_at, created_at, storage_provider')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return JSON.stringify({ error: error.message });
  return JSON.stringify({ count: (data || []).length, files: data || [] });
}

async function executeEvaluateClientReadiness(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  input: Record<string, unknown>,
  userRole: string,
  userId: string
) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const clientId = String(input.client_id ?? '');
  if (!uuidRegex.test(clientId)) {
    return JSON.stringify({ error: 'client_id must be the uuid id field from context or search_clients results' });
  }

  const sigCats = SIGNATURE_CATEGORIES as readonly string[];

  if (isAzureConfigured()) {
    return await withRlsContext(userId, async (sql) => {
      let scope = sql``
      if (userRole === 'supports_planner' || userRole === 'SUPPORT_PLANNER' || userRole === 'STAFF') {
        scope = sql`AND c.assigned_to = ${userId}`
      } else if (userRole === 'team_manager' || userRole === 'TEAM_MANAGER' || userRole === 'MANAGER') {
        const tm = await sql`SELECT id FROM profiles WHERE team_manager_id = ${userId}`
        const ids = (tm as unknown as { id: string }[]).map((m) => m.id)
        ids.push(userId)
        scope = sql`AND c.assigned_to = ANY(${ids}::uuid[])`
      }
      const rows = await sql`SELECT eligibility_end_date, loc_date, pos_status, poc_date, first_name, last_name, client_id FROM clients c WHERE c.id = ${clientId} ${scope} LIMIT 1`
      if (!rows.length) return JSON.stringify({ error: 'Client not found (or out of scope)' });
      const sig = await sql`SELECT 1 FROM client_documents WHERE client_id = ${clientId} AND category = ANY(${sigCats}::text[]) LIMIT 1`
      return JSON.stringify(buildReadinessPayload(rows[0] as Record<string, unknown>, sig.length > 0));
    });
  }

  let clientQuery = supabase
    .from('clients')
    .select('eligibility_end_date, loc_date, pos_status, poc_date, first_name, last_name, client_id')
    .eq('id', clientId);
  if (userRole === 'supports_planner' || userRole === 'SUPPORT_PLANNER' || userRole === 'STAFF') {
    clientQuery = clientQuery.eq('assigned_to', userId);
  } else if (userRole === 'team_manager' || userRole === 'TEAM_MANAGER' || userRole === 'MANAGER') {
    const { data: teamMembers } = await supabase.from('profiles').select('id').eq('team_manager_id', userId);
    const teamIds = (teamMembers || []).map((m: { id: string }) => m.id);
    teamIds.push(userId);
    clientQuery = clientQuery.in('assigned_to', teamIds);
  }
  const { data: client } = await clientQuery.single();
  if (!client) return JSON.stringify({ error: 'Client not found (or out of scope)' });

  const { data: sigDocs } = await supabase
    .from('client_documents')
    .select('id')
    .eq('client_id', clientId)
    .in('category', sigCats)
    .limit(1);
  return JSON.stringify(buildReadinessPayload(client as Record<string, unknown>, (sigDocs || []).length > 0));
}

function buildReadinessPayload(client: Record<string, unknown>, hasSignatureDoc: boolean) {
  const result = evaluateReadiness(
    {
      eligibility_end_date: (client.eligibility_end_date as string) ?? null,
      loc_date: (client.loc_date as string) ?? null,
      pos_status: (client.pos_status as string) ?? null,
      poc_date: (client.poc_date as string) ?? null,
    },
    hasSignatureDoc,
  );
  const name = [client.first_name, client.last_name].filter(Boolean).join(' ').trim();
  const blocking = result.gates.filter((g) => g.status === 'fail').map((g) => `${g.label}: ${g.detail}`);
  return {
    client: name || (client.client_id as string) || 'client',
    ready: result.ready,
    summary: result.ready ? 'All five submission gates pass.' : `${blocking.length} of 5 gates failing.`,
    gates: result.gates,
    blocking,
    manual_reminders: result.reminders,
  };
}

function executeComputeDeadline(input: Record<string, unknown>) {
  const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
  const op = String(input.operation ?? '')
  const anchor = String(input.anchor_date ?? '')
  if (!DATE_ONLY.test(anchor)) return JSON.stringify({ error: 'anchor_date must be YYYY-MM-DD' })
  const [y, m, d] = anchor.split('-').map(Number)
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (dt: Date) => `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`

  if (op === 'spm_next_due') {
    // SPM RULE (KNOWLEDGE_POS_WORKFLOW): next due = 15th of the month
    // FOLLOWING the anchor date — NEVER anchor + 30 days.
    const dt = new Date(Date.UTC(y, m, 15))
    return JSON.stringify({ operation: op, anchor_date: anchor, result_date: fmt(dt), rule: '15th of the month following the anchor date (never +30 days)' })
  }
  if (op === 'add_days') {
    const amount = Number(input.amount)
    if (!Number.isInteger(amount) || Math.abs(amount) > 3650) return JSON.stringify({ error: 'amount must be an integer number of days (max ±3650)' })
    const dt = new Date(Date.UTC(y, m - 1, d + amount))
    return JSON.stringify({ operation: op, anchor_date: anchor, amount, result_date: fmt(dt) })
  }
  if (op === 'add_months') {
    const amount = Number(input.amount)
    if (!Number.isInteger(amount) || Math.abs(amount) > 120) return JSON.stringify({ error: 'amount must be an integer number of months (max ±120)' })
    const targetMonthIndex = (m - 1) + amount
    const lastDay = new Date(Date.UTC(y, targetMonthIndex + 1, 0)).getUTCDate()
    const dt = new Date(Date.UTC(y, targetMonthIndex, Math.min(d, lastDay)))
    return JSON.stringify({ operation: op, anchor_date: anchor, amount, result_date: fmt(dt), note: 'day clamped to month length when needed' })
  }
  if (op === 'days_between') {
    const end = String(input.end_date ?? '')
    if (!DATE_ONLY.test(end)) return JSON.stringify({ error: 'end_date must be YYYY-MM-DD' })
    const [ey, em, ed] = end.split('-').map(Number)
    const days = Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(y, m - 1, d)) / 86400000)
    return JSON.stringify({ operation: op, anchor_date: anchor, end_date: end, days, interpretation: days >= 0 ? `end_date is ${days} day(s) after anchor_date` : `end_date is ${Math.abs(days)} day(s) before anchor_date` })
  }
  return JSON.stringify({ error: 'operation must be one of: spm_next_due, add_days, add_months, days_between' })
}

async function executeGetAssignmentHistory(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  input: Record<string, unknown>,
  userRole: string,
  userId: string
) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const clientId = String(input.client_id ?? '');
  if (!uuidRegex.test(clientId)) {
    return JSON.stringify({ error: 'client_id must be the uuid id field from context or search_clients results' });
  }

  if (isAzureConfigured()) {
    return await withRlsContext(userId, async (sql) => {
      let scope = sql``
      if (userRole === 'supports_planner' || userRole === 'SUPPORT_PLANNER' || userRole === 'STAFF') {
        scope = sql`AND c.assigned_to = ${userId}`
      } else if (userRole === 'team_manager' || userRole === 'TEAM_MANAGER' || userRole === 'MANAGER') {
        const tm = await sql`SELECT id FROM profiles WHERE team_manager_id = ${userId}`
        const ids = (tm as unknown as { id: string }[]).map((m) => m.id)
        ids.push(userId)
        scope = sql`AND c.assigned_to = ANY(${ids}::uuid[])`
      }
      const rows = await sql`SELECT h.occurred_at, h.reason, pf.full_name AS from_planner, pt.full_name AS to_planner, pb.full_name AS reassigned_by FROM client_assignment_history h JOIN clients c ON c.id = h.client_id LEFT JOIN profiles pf ON pf.id = h.from_planner_id LEFT JOIN profiles pt ON pt.id = h.to_planner_id LEFT JOIN profiles pb ON pb.id = h.reassigned_by WHERE h.client_id = ${clientId} ${scope} ORDER BY h.occurred_at DESC LIMIT 20`
      return JSON.stringify({ count: rows.length, history: rows });
    });
  }

  let clientQuery = supabase.from('clients').select('id').eq('id', clientId);
  if (userRole === 'supports_planner' || userRole === 'SUPPORT_PLANNER' || userRole === 'STAFF') {
    clientQuery = clientQuery.eq('assigned_to', userId);
  } else if (userRole === 'team_manager' || userRole === 'TEAM_MANAGER' || userRole === 'MANAGER') {
    const { data: teamMembers } = await supabase.from('profiles').select('id').eq('team_manager_id', userId);
    const teamIds = (teamMembers || []).map((m: { id: string }) => m.id);
    teamIds.push(userId);
    clientQuery = clientQuery.in('assigned_to', teamIds);
  }
  const { data: scopedClient } = await clientQuery.single();
  if (!scopedClient) return JSON.stringify({ error: 'Client not found (or out of scope)' });

  const { data: hist, error } = await supabase
    .from('client_assignment_history')
    .select('occurred_at, reason, from_planner_id, to_planner_id, reassigned_by')
    .eq('client_id', clientId)
    .order('occurred_at', { ascending: false })
    .limit(20);
  if (error) return JSON.stringify({ error: error.message });
  const rows = (hist || []) as { occurred_at: string; reason: string | null; from_planner_id: string | null; to_planner_id: string | null; reassigned_by: string | null }[];
  const ids = Array.from(new Set(rows.flatMap((h) => [h.from_planner_id, h.to_planner_id, h.reassigned_by]).filter(Boolean))) as string[];
  const nameMap: Record<string, string | null> = {};
  if (ids.length > 0) {
    const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids);
    for (const p of (profs || []) as { id: string; full_name: string | null }[]) nameMap[p.id] = p.full_name;
  }
  const history = rows.map((h) => ({
    occurred_at: h.occurred_at,
    reason: h.reason,
    from_planner: h.from_planner_id ? nameMap[h.from_planner_id] ?? null : null,
    to_planner: h.to_planner_id ? nameMap[h.to_planner_id] ?? null : null,
    reassigned_by: h.reassigned_by ? nameMap[h.reassigned_by] ?? null : null,
  }));
  return JSON.stringify({ count: history.length, history });
}

async function executeGetPlannerWorkload(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userRole: string,
  userId: string
) {
  // HARD ROLE GATE: planners never see other planners' workloads.
  if (userRole === 'supports_planner' || userRole === 'SUPPORT_PLANNER' || userRole === 'STAFF' || userRole === 'case_manager') {
    return JSON.stringify({ error: 'get_planner_workload is only available to team managers and supervisors' });
  }
  const isTM = userRole === 'team_manager' || userRole === 'TEAM_MANAGER' || userRole === 'MANAGER';

  if (isAzureConfigured()) {
    return await withRlsContext(userId, async (sql) => {
      const planners = isTM
        ? await sql`SELECT id, full_name FROM profiles WHERE team_manager_id = ${userId} OR id = ${userId}`
        : await sql`SELECT id, full_name FROM profiles WHERE role IN ('supports_planner', 'case_manager', 'team_manager')`
      const plannerIds = (planners as unknown as { id: string }[]).map((p) => p.id)
      if (plannerIds.length === 0) return JSON.stringify({ error: 'No planners found in your scope' })
      const summary = await getPlannerOpsSummaryAzure(sql, plannerIds, planners as unknown as Record<string, unknown>[])
      return formatPlannerOpsContext(summary)
    });
  }

  let planners: { id: string; full_name: string | null }[] = [];
  if (isTM) {
    const { data } = await supabase.from('profiles').select('id, full_name').or(`team_manager_id.eq.${userId},id.eq.${userId}`);
    planners = data || [];
  } else {
    const { data } = await supabase.from('profiles').select('id, full_name').in('role', ['supports_planner', 'case_manager', 'team_manager']);
    planners = data || [];
  }
  const plannerIds = planners.map((p) => p.id);
  if (plannerIds.length === 0) return JSON.stringify({ error: 'No planners found in your scope' });
  const { data: clients } = await supabase
    .from('clients')
    .select('id, client_id, first_name, last_name, assigned_to, last_contact_date, goal_pct, eligibility_end_date, three_month_visit_due, quarterly_waiver_date, med_tech_redet_date, pos_deadline, assessment_due, thirty_day_letter_date, co_financial_redet_date, co_app_date, mfp_consent_date, two57_date, doc_mdh_date, spm_next_due')
    .eq('is_active', true)
    .eq('client_classification', 'real')
    .in('assigned_to', plannerIds);
  const summary = getPlannerOpsSummary((clients || []) as Record<string, unknown>[], planners as unknown as Record<string, unknown>[]);
  return formatPlannerOpsContext(summary);
}

// Editable date fields for propose_update_date — MUST stay in sync with the
// DATE_FIELDS whitelist in app/api/clients/[id]/route.ts (the PATCH route
// that executes confirmed proposals).
const PROPOSAL_DATE_FIELDS = [
  'eligibility_end_date', 'last_contact_date', 'three_month_visit_date',
  'three_month_visit_due', 'quarterly_waiver_date', 'med_tech_redet_date',
  'poc_date', 'loc_date', 'doc_mdh_date', 'pos_deadline', 'assessment_due',
  'spm_next_due', 'co_financial_redet_date', 'co_app_date', 'mfp_consent_date',
  'two57_date', 'thirty_day_letter_date', 'drop_in_visit_date',
]

// The propose_* tools NEVER write anything. They validate the model's input
// (uuid, role scope, field whitelist, date format), resolve the client name
// (and current value for date updates), and stash a server-built proposal in
// the request-scoped holder. The route appends that proposal as a machine
// trailer; the UI's Confirm button then executes it through the existing
// audited PATCH / notes routes under the user's own session.
async function executeProposeAction(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  toolName: string,
  input: Record<string, unknown>,
  userRole: string,
  userId: string,
  holder: { proposal: Record<string, unknown> | null }
) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
  const clientId = String(input.client_id ?? '');
  if (!uuidRegex.test(clientId)) {
    return JSON.stringify({ error: 'client_id must be the uuid id field from context or search_clients results' });
  }

  const wantField = toolName === 'propose_update_date' ? String(input.field ?? '') : null;
  if (wantField !== null && !PROPOSAL_DATE_FIELDS.includes(wantField)) {
    return JSON.stringify({ error: `field must be one of: ${PROPOSAL_DATE_FIELDS.join(', ')}` });
  }

  // Resolve + scope-check the client. Also supplies the confirm card's client
  // name and, for date updates, the current field value.
  let clientRow: Record<string, unknown> | null = null;
  if (isAzureConfigured()) {
    clientRow = await withRlsContext(userId, async (sql) => {
      let scope = sql``
      if (userRole === 'supports_planner' || userRole === 'SUPPORT_PLANNER' || userRole === 'STAFF') {
        scope = sql`AND assigned_to = ${userId}`
      } else if (userRole === 'team_manager' || userRole === 'TEAM_MANAGER' || userRole === 'MANAGER') {
        const tm = await sql`SELECT id FROM profiles WHERE team_manager_id = ${userId}`
        const ids = (tm as unknown as { id: string }[]).map((m) => m.id)
        ids.push(userId)
        scope = sql`AND assigned_to = ANY(${ids}::uuid[])`
      }
      const rows = await sql`SELECT id, first_name, last_name, eligibility_end_date, last_contact_date, three_month_visit_date, three_month_visit_due, quarterly_waiver_date, med_tech_redet_date, poc_date, loc_date, doc_mdh_date, pos_deadline, assessment_due, spm_next_due, co_financial_redet_date, co_app_date, mfp_consent_date, two57_date, thirty_day_letter_date, drop_in_visit_date FROM clients WHERE id = ${clientId} ${scope} LIMIT 1`
      return (rows[0] ?? null) as unknown as Record<string, unknown> | null
    });
  } else {
    let clientQuery = supabase.from('clients').select('*').eq('id', clientId);
    if (userRole === 'supports_planner' || userRole === 'SUPPORT_PLANNER' || userRole === 'STAFF') {
      clientQuery = clientQuery.eq('assigned_to', userId);
    } else if (userRole === 'team_manager' || userRole === 'TEAM_MANAGER' || userRole === 'MANAGER') {
      const { data: teamMembers } = await supabase.from('profiles').select('id').eq('team_manager_id', userId);
      const teamIds = (teamMembers || []).map((m: { id: string }) => m.id);
      teamIds.push(userId);
      clientQuery = clientQuery.in('assigned_to', teamIds);
    }
    const { data } = await clientQuery.single();
    clientRow = data;
  }
  if (!clientRow) return JSON.stringify({ error: 'Client not found (or out of scope)' });

  const clientName = `${clientRow.last_name ?? 'Unknown'}${clientRow.first_name ? `, ${clientRow.first_name}` : ''}`;

  if (toolName === 'propose_add_note') {
    const content = typeof input.content === 'string' ? input.content.trim() : '';
    if (!content) return JSON.stringify({ error: 'content is required' });
    if (content.length > 10000) return JSON.stringify({ error: 'content exceeds 10000 characters' });
    holder.proposal = { kind: 'add_note', client_id: clientId, client_name: clientName, content };
    return JSON.stringify({ ok: true, status: 'proposal_ready', instruction: 'A confirmation card is shown below your reply. The note will ONLY be saved after the user taps Confirm. Do NOT claim it has been added.' });
  }

  if (toolName === 'propose_log_contact') {
    const date = String(input.date ?? '');
    if (!DATE_ONLY.test(date)) return JSON.stringify({ error: 'date must be YYYY-MM-DD' });
    const type = typeof input.type === 'string' ? input.type.trim().slice(0, 50) : '';
    if (!type) return JSON.stringify({ error: 'type is required (e.g. phone, in_person, email)' });
    const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim().slice(0, 1000) : null;
    holder.proposal = { kind: 'log_contact', client_id: clientId, client_name: clientName, date, type, note };
    return JSON.stringify({ ok: true, status: 'proposal_ready', instruction: 'A confirmation card is shown below your reply. The contact will ONLY be logged after the user taps Confirm. Do NOT claim it has been logged.' });
  }

  if (toolName === 'propose_update_date') {
    const newDate = String(input.new_date ?? '');
    if (!DATE_ONLY.test(newDate)) return JSON.stringify({ error: 'new_date must be YYYY-MM-DD' });
    const oldValue = (clientRow[wantField as string] as string | null) ?? null;
    holder.proposal = { kind: 'update_date', client_id: clientId, client_name: clientName, field: wantField, old_value: oldValue, new_date: newDate };
    return JSON.stringify({ ok: true, status: 'proposal_ready', current_value: oldValue, instruction: 'A confirmation card is shown below your reply. The date will ONLY change after the user taps Confirm. Do NOT claim it has been changed.' });
  }

  return JSON.stringify({ error: 'Unknown proposal tool' });
}

async function executeCaseloadStats(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userRole: string,
  userId: string
) {
  if (isAzureConfigured()) {
    // Audit item #7 (2026-07-04): counts run IN the database on the
    // America/New_York business date — no more hauling every in-scope row
    // into JS per bot question.
    try {
      return await withRlsContext(userId, async (sql) => {
        let scope = sql``
        if (userRole === 'supports_planner' || userRole === 'SUPPORT_PLANNER' || userRole === 'STAFF') {
          scope = sql`AND assigned_to = ${userId}`
        } else if (userRole === 'team_manager' || userRole === 'TEAM_MANAGER' || userRole === 'MANAGER') {
          const tm = await sql`SELECT id FROM profiles WHERE team_manager_id = ${userId}`
          const ids = (tm as unknown as { id: string }[]).map((m) => m.id)
          ids.push(userId)
          scope = sql`AND assigned_to = ANY(${ids}::uuid[])`
        }
        const rows = await sql`
          WITH t AS (SELECT (now() at time zone 'America/New_York')::date AS today)
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE pos_deadline < t.today)::int AS pos_deadline,
            COUNT(*) FILTER (WHERE assessment_due < t.today)::int AS assessment_due,
            COUNT(*) FILTER (WHERE eligibility_end_date < t.today)::int AS eligibility_end_date,
            COUNT(*) FILTER (WHERE loc_date < t.today)::int AS loc_date,
            COUNT(*) FILTER (WHERE med_tech_redet_date < t.today)::int AS med_tech_redet_date,
            COUNT(*) FILTER (WHERE spm_next_due < t.today)::int AS spm_next_due,
            COUNT(*) FILTER (WHERE quarterly_waiver_date < t.today)::int AS quarterly_waiver_date,
            COUNT(*) FILTER (WHERE three_month_visit_due < t.today)::int AS three_month_visit_due,
            COUNT(*) FILTER (WHERE thirty_day_letter_date < t.today)::int AS thirty_day_letter_date,
            COUNT(*) FILTER (WHERE co_financial_redet_date < t.today)::int AS co_financial_redet_date,
            COUNT(*) FILTER (WHERE co_app_date < t.today)::int AS co_app_date,
            COUNT(*) FILTER (WHERE mfp_consent_date < t.today)::int AS mfp_consent_date,
            COUNT(*) FILTER (WHERE two57_date < t.today)::int AS two57_date,
            COUNT(*) FILTER (WHERE doc_mdh_date < t.today)::int AS doc_mdh_date,
            COUNT(*) FILTER (WHERE eligibility_end_date BETWEEN t.today AND t.today + 30)::int AS elig_30,
            COUNT(*) FILTER (WHERE eligibility_end_date BETWEEN t.today AND t.today + 60)::int AS elig_60,
            COUNT(*) FILTER (WHERE eligibility_end_date BETWEEN t.today AND t.today + 90)::int AS elig_90
          FROM clients CROSS JOIN t
          WHERE is_active = true AND client_classification = 'real' ${scope}
        `
        const agg = (rows as unknown as Record<string, number>[])[0] ?? {}
        const overdueFieldsSql = [
          'pos_deadline', 'assessment_due', 'eligibility_end_date', 'loc_date',
          'med_tech_redet_date', 'spm_next_due', 'quarterly_waiver_date',
          'three_month_visit_due', 'thirty_day_letter_date', 'co_financial_redet_date',
          'co_app_date', 'mfp_consent_date', 'two57_date', 'doc_mdh_date'
        ];
        const overdueCountsSql: Record<string, number> = {}
        for (const f of overdueFieldsSql) overdueCountsSql[f] = Number(agg[f] ?? 0)
        return JSON.stringify({
          total: Number(agg.total ?? 0),
          active: Number(agg.total ?? 0),
          overdue_counts: overdueCountsSql,
          eligibility_expiring: {
            within_30_days: Number(agg.elig_30 ?? 0),
            within_60_days: Number(agg.elig_60 ?? 0),
            within_90_days: Number(agg.elig_90 ?? 0),
          },
        })
      })
    } catch (fetchErr) {
      return JSON.stringify({ error: (fetchErr as Error).message });
    }
  }

  // Fallback plane (non-Azure environments): fetch rows and count in JS.
  let rows: Record<string, unknown>[];
  {
    // Pre-fetch team IDs if needed (can't do async inside query builder fn)
    let teamIds: string[] | null = null
    if (userRole === 'team_manager' || userRole === 'TEAM_MANAGER' || userRole === 'MANAGER') {
      const { data: teamMembers } = await supabase
        .from('profiles')
        .select('id')
        .eq('team_manager_id', userId);
      teamIds = (teamMembers || []).map((m: { id: string }) => m.id);
      teamIds!.push(userId);
    }
    try {
      rows = await fetchAllRows(() => {
        let q = supabase.from('clients').select(
          'id, eligibility_end_date, pos_deadline, assessment_due, loc_date, med_tech_redet_date, spm_next_due, quarterly_waiver_date, three_month_visit_due, thirty_day_letter_date, co_financial_redet_date, co_app_date, mfp_consent_date, two57_date, doc_mdh_date, is_active'
        ).eq('is_active', true).eq('client_classification', 'real');

        if (userRole === 'supports_planner' || userRole === 'SUPPORT_PLANNER' || userRole === 'STAFF') {
          q = q.eq('assigned_to', userId);
        } else if (teamIds) {
          q = q.in('assigned_to', teamIds);
        }
        return q;
      });
    } catch (fetchErr) {
      return JSON.stringify({ error: (fetchErr as Error).message });
    }
  }
  const today = businessTodayStr();
  const d30 = businessDateOffsetStr(30);
  const d60 = businessDateOffsetStr(60);
  const d90 = businessDateOffsetStr(90);

  const overdueFields = [
    'pos_deadline', 'assessment_due', 'eligibility_end_date', 'loc_date',
    'med_tech_redet_date', 'spm_next_due', 'quarterly_waiver_date',
    'three_month_visit_due', 'thirty_day_letter_date', 'co_financial_redet_date',
    'co_app_date', 'mfp_consent_date', 'two57_date', 'doc_mdh_date'
  ];

  const overdueCounts: Record<string, number> = {};
  for (const f of overdueFields) {
    overdueCounts[f] = rows.filter((r: Record<string, unknown>) => r[f] && String(r[f]) < today).length;
  }

  const eligExpiring = {
    within_30_days: rows.filter((r: Record<string, unknown>) => r.eligibility_end_date && String(r.eligibility_end_date) >= today && String(r.eligibility_end_date) <= d30).length,
    within_60_days: rows.filter((r: Record<string, unknown>) => r.eligibility_end_date && String(r.eligibility_end_date) >= today && String(r.eligibility_end_date) <= d60).length,
    within_90_days: rows.filter((r: Record<string, unknown>) => r.eligibility_end_date && String(r.eligibility_end_date) >= today && String(r.eligibility_end_date) <= d90).length,
  };

  return JSON.stringify({
    total: rows.length,
    active: rows.filter((r: Record<string, unknown>) => r.is_active === true).length,
    overdue_counts: overdueCounts,
    eligibility_expiring: eligExpiring
  });
}


export async function POST(req: NextRequest) {
  const aiRateLimit = await checkAiRateLimit(req, '/api/case-ai')
  if (aiRateLimit) return aiRateLimit

  // Rate limiting: max 10 concurrent AI requests
  if (activeRequests >= MAX_CONCURRENT) {
    return new Response(
      JSON.stringify({ error: 'Casey is busy, please try again in a moment' }),
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

    const { messages, clientId, conversationId: requestedConversationId } = await req.json()

    // P0: UUID validation on clientId
    if (clientId && !validateUUID(clientId)) {
      return new Response('Invalid client ID format', { status: 400 })
    }

    // Batch D: UUID validation on conversationId (ownership is proven later by
    // an RLS-scoped lookup inside ensureConversation — a foreign id is treated
    // as "start a new conversation", never written into)
    if (requestedConversationId && !validateUUID(requestedConversationId)) {
      return new Response('Invalid conversation ID format', { status: 400 })
    }

    // P0: Cap messages array length to prevent token abuse
    if (!messages || !Array.isArray(messages)) {
      return new Response('Missing required fields', { status: 400 })
    }

    // P0: Cap messages to prevent memory exhaustion
    if (messages.length > 50) {
      return new Response('Too many messages', { status: 400 })
    }

    // Batch D: durable conversations (Azure PHI plane). Resolved up front so
    // every success exit can persist the exchange and return the ids the UI
    // needs. Null when Azure is unavailable — the bot then answers statelessly.
    const lastUserText = String(
      [...messages].reverse().find((m: { role: string }) => m.role === 'user')?.content ?? ''
    )
    const conversationId = await ensureConversation(
      userId,
      requestedConversationId ?? null,
      lastUserText,
      clientId ?? null,
    )
    const assistantMessageId = globalThis.crypto.randomUUID()
    const persistHeaders: Record<string, string> = conversationId
      ? { 'X-Conversation-Id': conversationId, 'X-Assistant-Message-Id': assistantMessageId }
      : {}

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    let profile: { full_name?: string | null; role?: string | null } | null = null
    if (isAzureConfigured()) {
      profile = await withRlsContext(userId, async (sql) => {
        const rows = await sql`SELECT id, full_name, role FROM profiles WHERE id = ${userId} LIMIT 1`
        return (rows[0] ?? null) as unknown as { full_name?: string | null; role?: string | null } | null
      })
    } else {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('id', userId)
        .single()
      profile = data
    }

    const userName = profile?.full_name ?? 'User'
    const userRole = profile?.role ?? 'unknown'

    // Audit: log AI query
    auditLog(req, { userId, userEmail: authData?.user?.email ?? undefined, action: 'client.view', resourceType: 'case-ai', resourceId: clientId, details: { message_count: messages?.length ?? 0 } }).catch(() => {})

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
      if (isAzureConfigured()) {
        allClients = await withRlsContext(userId, async (sql) => {
          const rows = await sql`SELECT id, client_id, first_name, last_name, category, assigned_to, is_active, last_contact_date, last_contact_type, goal_pct, eligibility_code, eligibility_end_date, three_month_visit_due, quarterly_waiver_date, med_tech_redet_date, pos_deadline, assessment_due, thirty_day_letter_date, co_financial_redet_date, co_app_date, mfp_consent_date, two57_date, doc_mdh_date, spm_next_due, pos_status, loc_date, spm_completed, med_tech_status, appeals, atp, foc, poc_date, provider_forms, reportable_events, schedule_docs, signatures_needed, snfs FROM clients WHERE assigned_to = ${userId} AND is_active = true AND client_classification = 'real'`
          return rows as unknown as Record<string, unknown>[]
        })
      } else {
        const { data: myClients } = await supabase
          .from('clients')
          .select('id, client_id, first_name, last_name, category, assigned_to, is_active, last_contact_date, last_contact_type, goal_pct, eligibility_code, eligibility_end_date, three_month_visit_due, quarterly_waiver_date, med_tech_redet_date, pos_deadline, assessment_due, thirty_day_letter_date, co_financial_redet_date, co_app_date, mfp_consent_date, two57_date, doc_mdh_date, spm_next_due, pos_status, loc_date, spm_completed, med_tech_status, appeals, atp, foc, poc_date, provider_forms, reportable_events, schedule_docs, signatures_needed, snfs, profiles!clients_assigned_to_fkey(full_name)')
          .eq('assigned_to', userId)
          .eq('is_active', true)
          .eq('client_classification', 'real')
        allClients = (myClients as Record<string, unknown>[]) ?? []
      }
      plannerContext = `You are assisting a Supports Planner with their own caseload of ${allClients.length} active clients.`

    } else if (isManagerRole) {
      // Team manager: load their team's planners and those planners' clients
      let teamPlanners: Record<string, unknown>[] | null = null
      if (isAzureConfigured()) {
        teamPlanners = await withRlsContext(userId, async (sql) => {
          const rows = await sql`SELECT id, full_name, team_manager_id FROM profiles WHERE role = 'supports_planner' AND team_manager_id = ${userId} ORDER BY full_name`
          return rows as unknown as Record<string, unknown>[]
        })
      } else {
        const { data } = await supabase
          .from('profiles')
          .select('id, full_name, team_manager_id')
          .eq('role', 'supports_planner')
          .eq('team_manager_id', userId)
          .order('full_name')
        teamPlanners = data
      }
      const teamPlannerIds = (teamPlanners ?? []).map((p: Record<string, unknown>) => p.id as string)

      if (teamPlannerIds.length > 0) {
        if (isAzureConfigured()) {
          allClients = await withRlsContext(userId, async (sql) => {
            const rows = await sql`SELECT id, client_id, first_name, last_name, category, assigned_to, is_active, last_contact_date, last_contact_type, goal_pct, eligibility_code, eligibility_end_date, three_month_visit_due, quarterly_waiver_date, med_tech_redet_date, pos_deadline, assessment_due, thirty_day_letter_date, co_financial_redet_date, co_app_date, mfp_consent_date, two57_date, doc_mdh_date, spm_next_due, pos_status, loc_date, spm_completed, med_tech_status, appeals, atp, foc, poc_date, provider_forms, reportable_events, schedule_docs, signatures_needed, snfs FROM clients WHERE assigned_to = ANY(${teamPlannerIds}::uuid[]) AND is_active = true AND client_classification = 'real' ORDER BY last_name`
            return rows as unknown as Record<string, unknown>[]
          })
        } else {
          allClients = await fetchAllRows(() =>
            supabase
              .from('clients')
              .select('id, client_id, first_name, last_name, category, assigned_to, is_active, last_contact_date, last_contact_type, goal_pct, eligibility_code, eligibility_end_date, three_month_visit_due, quarterly_waiver_date, med_tech_redet_date, pos_deadline, assessment_due, thirty_day_letter_date, co_financial_redet_date, co_app_date, mfp_consent_date, two57_date, doc_mdh_date, spm_next_due, pos_status, loc_date, spm_completed, med_tech_status, appeals, atp, foc, poc_date, provider_forms, reportable_events, schedule_docs, signatures_needed, snfs, profiles!clients_assigned_to_fkey(full_name)')
              .in('assigned_to', teamPlannerIds)
              .eq('is_active', true)
              .eq('client_classification', 'real')
              .order('last_name')
          )
        }
      }

      const plannerOpsSummary = getPlannerOpsSummary(allClients, (teamPlanners ?? []) as Record<string, unknown>[])
      const plannerStats = plannerOpsSummary.plannerRows.map((row) => `${row.plannerName}: ${row.clientCount} clients, ${row.overdue} overdue, pressure ${row.pressureScore}`)
      plannerContext = `Team Manager view: ${allClients.length} clients across ${teamPlanners?.length ?? 0} Supports Planners on your team. Planner coverage: ${plannerStats.join(', ')}

${formatPlannerOpsContext(plannerOpsSummary)}`

    } else if (isSupervisorRole) {
      // Supervisor/IT: load summary stats only — NOT individual rows.
      // Full row loading of thousands of clients is too expensive per-request.
      let allPlanners: Record<string, unknown>[] | null = null
      if (isAzureConfigured()) {
        allPlanners = await withRlsContext(userId, async (sql) => {
          const rows = await sql`SELECT id, full_name, team_manager_id FROM profiles WHERE role = 'supports_planner' ORDER BY full_name`
          return rows as unknown as Record<string, unknown>[]
        })
      } else {
        const { data } = await supabase
          .from('profiles')
          .select('id, full_name, team_manager_id')
          .eq('role', 'supports_planner')
          .order('full_name')
        allPlanners = data
      }

      // Load clients but only the fields needed for ops snapshot (not full records)
      if (isAzureConfigured()) {
        allClients = await withRlsContext(userId, async (sql) => {
          const rows = await sql`SELECT id, assigned_to, goal_pct, last_contact_date, spm_next_due, eligibility_end_date, three_month_visit_due, quarterly_waiver_date, med_tech_redet_date, pos_deadline, assessment_due, thirty_day_letter_date, co_financial_redet_date, co_app_date, mfp_consent_date, two57_date, doc_mdh_date, pos_status, client_id, first_name, last_name FROM clients WHERE is_active = true AND client_classification = 'real' ORDER BY id`
          return rows as unknown as Record<string, unknown>[]
        })
      } else {
        allClients = await fetchAllRows(() =>
          supabase
            .from('clients')
            .select('id, assigned_to, goal_pct, last_contact_date, spm_next_due, eligibility_end_date, three_month_visit_due, quarterly_waiver_date, med_tech_redet_date, pos_deadline, assessment_due, thirty_day_letter_date, co_financial_redet_date, co_app_date, mfp_consent_date, two57_date, doc_mdh_date, pos_status, client_id, first_name, last_name')
            .eq('is_active', true)
            .eq('client_classification', 'real')
            .order('id')
        )
      }

      const plannerOpsSummary = getPlannerOpsSummary(allClients, (allPlanners ?? []) as Record<string, unknown>[])
      const plannerStats = plannerOpsSummary.plannerRows.map((row) => `${row.plannerName}: ${row.clientCount} clients, ${row.overdue} overdue, pressure ${row.pressureScore}`)
      plannerContext = `Org-wide visibility. Organization snapshot: ${allClients.length} active clients across ${allPlanners?.length ?? 0} Supports Planners. Planner coverage: ${plannerStats.join(', ')}

${formatPlannerOpsContext(plannerOpsSummary)}`
    }

    const clientCount = allClients?.length ?? 0

    let clientContextStr = ''

    if (clientId) {
      // Always fetch the specific client when one is provided — but verify access
      let client: Record<string, unknown> | null = null
      let recentNotes: Record<string, unknown>[] = []
      if (isAzureConfigured()) {
        const ctxData = await withRlsContext(userId, async (sql) => {
          let scope = sql``
          if (isPlannerRole) scope = sql`AND assigned_to = ${userId}`
          const rows = await sql`SELECT id, client_id, first_name, last_name, category, assigned_to, is_active, last_contact_date, last_contact_type, eligibility_code, goal_pct, eligibility_end_date, three_month_visit_due, quarterly_waiver_date, med_tech_redet_date, pos_deadline, assessment_due, thirty_day_letter_date, co_financial_redet_date, co_app_date, mfp_consent_date, two57_date, doc_mdh_date, spm_next_due, pos_status, spm_completed, poc_date, loc_date, med_tech_status, provider_forms, signatures_needed, reportable_events, appeals, atp, snfs, foc, schedule_docs FROM clients WHERE id = ${clientId} ${scope} LIMIT 1`
          const row = (rows[0] ?? null) as unknown as Record<string, unknown> | null
          let notes: Record<string, unknown>[] = []
          if (row) {
            const noteRows = await sql`SELECT n.content, n.created_at, p.full_name AS author FROM client_notes n LEFT JOIN profiles p ON p.id = n.author_id WHERE n.client_id = ${clientId} ORDER BY n.created_at DESC LIMIT 5`
            notes = noteRows as unknown as Record<string, unknown>[]
          }
          return { row, notes }
        })
        client = ctxData.row
        recentNotes = ctxData.notes
      } else {
        let clientQuery = supabase.from('clients').select('id, client_id, first_name, last_name, category, assigned_to, is_active, last_contact_date, last_contact_type, eligibility_code, goal_pct, eligibility_end_date, three_month_visit_due, quarterly_waiver_date, med_tech_redet_date, pos_deadline, assessment_due, thirty_day_letter_date, co_financial_redet_date, co_app_date, mfp_consent_date, two57_date, doc_mdh_date, spm_next_due, pos_status, spm_completed, poc_date, loc_date, med_tech_status, provider_forms, signatures_needed, reportable_events, appeals, atp, snfs, foc, schedule_docs, profiles!clients_assigned_to_fkey(full_name)').eq('id', clientId)
        // For planners, enforce they can only ask about their own clients
        if (isPlannerRole) {
          clientQuery = clientQuery.eq('assigned_to', userId)
        }
        const { data } = await clientQuery.single()
        client = data
        if (client) {
          const { data: noteRows } = await supabase
            .from('client_notes')
            .select('content, created_at, profiles(full_name)')
            .eq('client_id', clientId)
            .order('created_at', { ascending: false })
            .limit(5)
          recentNotes = ((noteRows || []) as unknown as Array<{ content: string; created_at: string; profiles?: { full_name: string | null } | null }>).map((n) => ({ content: n.content, created_at: n.created_at, author: n.profiles?.full_name ?? null }))
        }
      }

      if (client) {
        const notesBlock = recentNotes.length > 0
          ? `\n=== RECENT CASE NOTES (newest first, up to 5 — call get_client_notes for older history) ===\n${recentNotes.map((n) => `- [${String(n.created_at ?? '').slice(0, 10)}] ${n.author ?? 'Unknown'}: ${String(n.content ?? '').slice(0, 300)}`).join('\n')}\n=== END CASE NOTES ===`
          : ''
        clientContextStr = `\n\n=== CURRENT CLIENT CONTEXT ===\nIMPORTANT: The user is currently viewing this specific client detail page. ALL questions should be answered in the context of THIS client only, unless the user explicitly asks about other clients or the full caseload.\nThis client's uuid id (use it for ALL tool calls that need client_id): ${clientId}\n${formatClientSummary(client as Record<string, unknown>)}${notesBlock}\n=== END CLIENT CONTEXT ===`
      }
    } else if (allClients && allClients.length > 0 && (isPlannerRole || isManagerRole)) {
      // Only send full client list rows for planner/manager — supervisor uses ops snapshot above
      const clientList = allClients.map((c: Record<string, unknown>) => {
        const name = `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim()
        const daysSince = getDaysSinceContact(c.last_contact_date as string | null)
        const overdueCount = getOverdueCount(c)
        const spmStatus = getDateStatus(c.spm_next_due as string | null)
        const spmNote = spmStatus === 'critical' ? ' 🚨 SPM CRITICALLY OVERDUE' : spmStatus === 'red' ? ' ⚠️ SPM OVERDUE' : spmStatus === 'orange' ? ' ⏰ SPM due within 3 days' : spmStatus === 'yellow' ? ' ⏰ SPM due this week' : ''
        return `- ${name} (ID: ${c.client_id}) | Overdue: ${overdueCount} | Last contact: ${daysSince !== null ? `${daysSince}d ago` : 'never'} | Goal: ${c.goal_pct ?? 0}% | POS: ${c.pos_status ?? 'unknown'}${spmNote} | page: [/clients/${c.id}]`
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

    // Batch D: admin-maintained knowledge (Supabase bot_knowledge; 60s
    // in-memory cache per warm instance — no per-request read at scale).
    const botKnowledgeSection = await getBotKnowledgeSection()

    const systemPrompt = `You are "Casey" — the CaseSync Assistant — built into the CaseSync case management portal for Beatrice Loving Heart (BLH). You help Supports Planners, Team Managers, and Supervisors manage their caseloads, stay fully compliant, and get the most out of every part of the CaseSync site. Introduce yourself as Casey.

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

${KNOWLEDGE_DRAFTING}
${KNOWLEDGE_GLOSSARY}

${KNOWLEDGE_NAVIGATION}

${KNOWLEDGE_ADL_IADL_TIMES}

${KNOWLEDGE_MA_COVERAGE_GROUPS}


=== SEARCH & DATA TOOLS (MANDATORY) ===
You have tools you MUST use for data queries. NEVER say "I cannot search" or "let me try a different approach." ALWAYS call the tool.

TOOL 1 - search_clients: Use for ANY question about specific entries - eligibility dates, overdue items, categories, names, assigned planners.
TOOL 2 - get_caseload_stats: Use for aggregate questions - totals, overdue counts, eligibility expiration summaries.
TOOL 3 - get_client_notes: Use for visit history and what colleagues wrote about a specific client. Pass the uuid id from CURRENT CLIENT CONTEXT or from a search_clients result (call search_clients first if you only have a name).
TOOL 4 - get_client_files: Use to check what documents are on file for a client (pass the uuid id). NEVER guess or assume whether a document exists — always check.
TOOL 5 - compute_deadline: REQUIRED for ALL date arithmetic — SPM next-due dates, adding days or months, days between dates, days until a deadline. NEVER compute dates in your head; your mental date math is not reliable enough for compliance work.
TOOL 6 - get_assignment_history: Use for who a client was assigned to over time and why (pass the uuid id).
TOOL 7 - get_planner_workload: Per-planner load and compliance comparison. ONLY available to team managers and supervisors — if a planner asks, explain it is not available for their role.
TOOL 8 - propose_log_contact: When the user asks to log, record, or note a contact/visit for a client. Pass the uuid id, date (YYYY-MM-DD), type (phone, in_person, email, video), and optional note.
TOOL 9 - propose_add_note: When the user asks to add or save a case note for a client. Pass the uuid id and the exact note content.
TOOL 10 - propose_update_date: When the user asks to set, change, or update a deadline/date field for a client. Pass the uuid id, the exact field name, and new_date (YYYY-MM-DD).
TOOL 11 - evaluate_client_readiness: Use when the user asks whether a client is ready to submit, what is blocking a POS, or what still needs doing before submission. Deterministic five-gate check plus manual reminders. Pass the uuid id. NEVER assess readiness yourself — always call this tool.

ACTION RULES (TOOLS 8-10 — CRITICAL):
- These tools only PROPOSE a change. NOTHING is saved until the user taps the Confirm button that appears under your reply.
- After a proposal_ready result: summarize exactly what will change and tell the user to review and tap Confirm. NEVER say the change has been made, logged, saved, or updated.
- Propose ONE action per reply. If the user asks for several changes, do them one at a time.
- Resolve "today"/"yesterday" from the Today date in your context. If details are missing (which client, which date, which field), ask instead of guessing.
- If the user is viewing a client page (CURRENT CLIENT CONTEXT), use THAT client's id unless they clearly name a different client.

RULES:
- If the user asks about eligibility, overdue dates, caseload numbers, or finding entries by criteria: YOU MUST call the appropriate tool. Do not attempt to answer from the data already in this prompt.
- The pre-loaded data in this conversation does NOT include all fields needed for date-based searches. The tools query the database directly and return complete, current data.
- Results are automatically scoped by role. Support Planners see only their entries, Team Managers see their team, Supervisors see all.
- After receiving tool results, summarize them clearly with names and key dates.
- If a tool returns zero results, say so clearly (e.g. "No entries have eligibility ending in the next 30 days").
=== END SEARCH & DATA TOOLS ===


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
2. CRITICAL: When a CURRENT CLIENT CONTEXT section is present, the user is on that client detail page. Scope ALL answers to that specific client unless the user explicitly asks about other clients or the full caseload. Do NOT list other clients data when the user asks about this client or uses general terms like overdue items.
3. When walking through the POS workflow, ask clarifying questions to find where the planner is in the process.
3. For "Is my POS ready to submit?" — walk through the POS submission checklist step by step.
4. For ATP questions — confirm the program type, then apply the correct rules.
5. For SPM — always remind: next due = 15th of the FOLLOWING month (never +30 days).
6. For navigation — embed page paths in brackets like [/calendar] so the UI renders them as clickable links.
6b. CLIENT DEEP LINKS: whenever you name a specific client that came from a tool result or the client list, append their page link right after the name, e.g. "Smith, Jane [/clients/<uuid>]" — copy the page link shown in the client list, or build it from the uuid id field in tool results. NEVER use the display client_id in the link and NEVER fabricate an id; omit the link if you do not have the uuid.
7. When asked org/team operations questions, use the planner ops snapshot to name who needs intervention now, who can absorb work, and the most practical next move.
8. Prefer operational recommendations over generic commentary: identify the riskiest planners/clients first, then suggest the next 1-3 actions.
9. If the question is manager/supervisor-facing, summarize pressure, overdue burden, due-this-week load, and no-contact risk in plain English.
10. If there is not enough information for certainty, say what is known from CaseSync and what is still missing.
11. Be warm but professional — planners are caring for vulnerable people.
12. HIPAA: never suggest sharing client info externally.
=== END GUIDELINES ===${botKnowledgeSection}`

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return new Response('AI service not configured', { status: 503 })
    }

    // 30-second timeout for Anthropic API
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    const apiHeaders = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    }

    const formattedMessages = messages.map((m: { role: string; content: string }) => ({
      role: m.role,
      content: m.content,
    }))

    // ---- Pass 1: Non-streaming call with tools ----
    let pass1Data: { content: Array<{ type: string; id?: string; name?: string; input?: Record<string, unknown>; text?: string }>; stop_reason: string }
    try {
      const pass1Res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: apiHeaders,
        signal: controller.signal,
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          max_tokens: 1024,
          system: systemPrompt,
          messages: formattedMessages,
          tools: BOT_TOOLS,
        }),
      })

      if (!pass1Res.ok) {
        clearTimeout(timeoutId)
        const errText = await pass1Res.text()
        console.error('Anthropic pass1 error:', pass1Res.status, errText)
        return new Response('AI service error', { status: 502 })
      }

      pass1Data = await pass1Res.json()
      console.log('[Casey] Pass1 stop_reason:', pass1Data.stop_reason, 'content_types:', pass1Data.content?.map((b: {type: string}) => b.type))
    } catch (fetchErr) {
      clearTimeout(timeoutId)
      if ((fetchErr as Error).name === 'AbortError') {
        return new Response(
          JSON.stringify({ error: 'Casey took too long to respond. Please try again.' }),
          { status: 504, headers: { 'Content-Type': 'application/json' } }
        )
      }
      throw fetchErr
    }
    clearTimeout(timeoutId)

    // Check if the model wants to use a tool
    // Parallel tool-use fix (2026-07-05): the model may emit SEVERAL
    // tool_use blocks in one assistant turn; the API requires a matching
    // tool_result for EVERY id in the next message. Answering only the
    // first block 400s the follow-up call (surfaced as 502s on the AI rail).
    const toolUseBlocks = pass1Data.content.filter((b: any) => b.type === 'tool_use' && b.name && b.input) as Array<{ id: string; name: string; input: any }>
    const toolUseBlock = toolUseBlocks[0]
    const toolsUsed: string[] = []

    // Server-validated action proposal captured by the propose_* executor for
    // THIS request; appended as a machine trailer so the UI can render the
    // confirm card. Built from validated tool input — never from model prose.
    const proposalHolder: { proposal: Record<string, unknown> | null } = { proposal: null }

    let finalText = ''

    const runCaseyTool = async (name: string, input: any): Promise<string> => {
      try {
        if (name === 'search_clients') return await executeSearchClients(supabase, input, userRole, userId)
        if (name === 'get_caseload_stats') return await executeCaseloadStats(supabase, userRole, userId)
        if (name === 'get_client_notes') return await executeGetClientNotes(supabase, input, userRole, userId)
        if (name === 'get_client_files') return await executeGetClientFiles(supabase, input, userRole, userId)
        if (name === 'compute_deadline') return executeComputeDeadline(input)
        if (name === 'get_assignment_history') return await executeGetAssignmentHistory(supabase, input, userRole, userId)
        if (name === 'get_planner_workload') return await executeGetPlannerWorkload(supabase, userRole, userId)
        if (name === 'evaluate_client_readiness') return await executeEvaluateClientReadiness(supabase, input, userRole, userId)
        if (name === 'propose_log_contact' || name === 'propose_add_note' || name === 'propose_update_date') {
          return await executeProposeAction(supabase, name, input, userRole, userId, proposalHolder)
        }
        return JSON.stringify({ error: 'Unknown tool: ' + name })
      } catch (toolErr) {
        console.error('Tool execution error:', toolErr)
        return JSON.stringify({ error: 'Tool execution failed' })
      }
    }

    if (toolUseBlock && toolUseBlock.name && toolUseBlock.input) {
      // Execute ALL requested tools and answer every tool_use id.
      const pass1Results: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = []
      for (const blk of toolUseBlocks) {
        toolsUsed.push(blk.name)
        console.log('[Casey] Executing tool:', blk.name, 'input:', JSON.stringify(blk.input))
        pass1Results.push({ type: 'tool_result', tool_use_id: blk.id, content: await runCaseyTool(blk.name, blk.input) })
      }

      // ---- Tool loop: execute tools until the model gives a text-only response ----
      let loopMessages = [
        ...formattedMessages,
        { role: 'assistant' as const, content: pass1Data.content },
        { role: 'user' as const, content: pass1Results },
      ]

      const MAX_TOOL_ROUNDS = 5
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const loopController = new AbortController()
        const loopTimeout = setTimeout(() => loopController.abort(), 30000)

        try {
          const loopRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: apiHeaders,
            signal: loopController.signal,
            body: JSON.stringify({
              model: 'claude-haiku-4-5',
              max_tokens: 1024,
              system: systemPrompt,
              messages: loopMessages,
              tools: BOT_TOOLS,
            }),
          })
          clearTimeout(loopTimeout)

          if (!loopRes.ok) {
            const errText = await loopRes.text()
            console.error(`Anthropic tool-loop round ${round + 1} error:`, errText)
            return new Response('AI service error', { status: 502 })
          }

          const loopData = await loopRes.json() as typeof pass1Data
          const nextToolUses = loopData.content.filter((b: any) => b.type === 'tool_use' && b.name && b.input) as Array<{ id: string; name: string; input: any }>

          if (nextToolUses.length === 0) {
            // No more tool calls — extract final text and return
            const finalAnswer = loopData.content
              .filter((b: { type: string }) => b.type === 'text')
              .map((b: { text?: string }) => b.text || '')
              .join('')

            auditLog(req, { userId, action: 'bot_query' })
            const proposalTrailer = proposalHolder.proposal
              ? `\n\n[[ACTION_PROPOSAL]]${JSON.stringify(proposalHolder.proposal)}[[/ACTION_PROPOSAL]]`
              : ''
            // Batch D: persist the display text (trailer excluded); proposal
            // goes into meta for audit value only.
            await persistExchange(userId, conversationId, lastUserText, finalAnswer, assistantMessageId,
              proposalHolder.proposal ? { tools_used: toolsUsed, proposal: proposalHolder.proposal } : { tools_used: toolsUsed })
            return new Response(finalAnswer + proposalTrailer, {
              headers: { 'Content-Type': 'text/plain; charset=utf-8', ...persistHeaders },
            })
          }

          // Execute ALL requested tools this round and answer every id.
          const roundResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = []
          for (const blk of nextToolUses) {
            toolsUsed.push(blk.name)
            console.log(`[Casey] Tool loop round ${round + 2}: ${blk.name}`)
            roundResults.push({ type: 'tool_result', tool_use_id: blk.id, content: await runCaseyTool(blk.name, blk.input) })
          }

          // Append this round to the conversation and continue the loop
          loopMessages = [
            ...loopMessages,
            { role: 'assistant' as const, content: loopData.content },
            { role: 'user' as const, content: roundResults },
          ]
        } catch (loopErr) {
          clearTimeout(loopTimeout)
          if ((loopErr as Error).name === 'AbortError') {
            return new Response(
              JSON.stringify({ error: 'Casey took too long. Please try again.' }),
              { status: 504, headers: { 'Content-Type': 'application/json' } }
            )
          }
          throw loopErr
        }
      }

      // If we exhausted all rounds, stream one final call with tool_choice:none to force an answer
      auditLog(req, { userId, action: 'bot_query' }).catch(() => {})
      const exhaustedTrailer = proposalHolder.proposal
        ? `\n\n[[ACTION_PROPOSAL]]${JSON.stringify(proposalHolder.proposal)}[[/ACTION_PROPOSAL]]`
        : ''
      return streamAnthropicResponse(apiHeaders, systemPrompt, loopMessages, BOT_TOOLS, { type: 'none' }, exhaustedTrailer, persistHeaders,
        async (fullText) => {
          await persistExchange(userId, conversationId, lastUserText, fullText, assistantMessageId,
            proposalHolder.proposal ? { tools_used: toolsUsed, proposal: proposalHolder.proposal } : { tools_used: toolsUsed })
        })
    } else {
      // No tool use - extract text from pass1 response directly
      console.log('[Casey] No tool use - returning pass1 text directly')
      finalText = pass1Data.content
        .filter((b: { type: string }) => b.type === 'text')
        .map((b: { text?: string }) => b.text || '')
        .join('')

      auditLog(req, { userId, action: 'bot_query' })

      // Batch D: persist the exchange before returning (small indexed writes
      // on the warm Azure pool; failure is logged and never blocks the answer).
      await persistExchange(userId, conversationId, lastUserText, finalText, assistantMessageId, { tools_used: toolsUsed })

      return new Response(finalText, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', ...persistHeaders },
      })
    }
  } finally {
    activeRequests--
  }
}
