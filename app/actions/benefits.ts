'use server'

import { revalidatePath } from 'next/cache'
import { getWorkrynSession } from '@/lib/workryn/auth'
import { db } from '@/lib/workryn/db'
import { sendEmail } from '@/lib/workryn/email'
import {
  fillCdmEnrollmentPdf,
  buildGymElectionPdf,
  GYM_SELECTION_LABEL,
} from '@/lib/pdf/cdm'
import { cdmBlankBytes } from '@/lib/pdf/cdmBlank'
import { allocationsValid } from '@/lib/benefits/funds'

const BIANCA = 'bianca.parker@blhnurses.com'
const MILEAGE_INBOX = 'mileage@blhnurses.com'

export type ActionResult = { ok: true } | { ok: false; error: string }

const GYM_SELECTIONS = ['pf_option_1', 'pf_option_2', 'la_fitness', 'waive'] as const

function today(): string {
  return new Date().toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function fileSlug(s: string): string {
  return (s || 'employee').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'employee'
}

/** emailedAt is truthful only when SMTP actually sent (not the dev no-op). */
function emailedAtFrom(sent: { ok: boolean; messageId?: string }): Date | null {
  return sent.ok && sent.messageId && sent.messageId !== 'dev-noop' ? new Date() : null
}

/** Best-effort plain-text confirmation to the employee's own inbox. Never blocks the save; no attachments (keeps SSN/DOB out of personal inboxes). */
async function emailEmployeeConfirmation(to: string, name: string, subject: string, summary: string): Promise<void> {
  if (!to) return
  try {
    await sendEmail({
      to,
      subject,
      text:
        `Hi ${name},\n\n` +
        `We've received your submission through the Workryn benefits portal. Here's a summary for your records:\n\n` +
        `${summary}\n\n` +
        `If anything looks incorrect, you can resubmit in Workryn or reach out to HR.\n\n` +
        `— Beatrice Loving Heart`,
    })
  } catch (err) {
    console.error('[benefits] employee confirmation email failed:', err)
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Gym membership election — one row/user, in-portal, emailed to Bianca.
// ─────────────────────────────────────────────────────────────────────────
export async function saveGymSelection(input: {
  selection: string
  preferredStartDate?: string | null
  authorizationAck: boolean
  signatureName: string
}): Promise<ActionResult> {
  const session = await getWorkrynSession()
  if (!session) return { ok: false, error: 'Not signed in.' }
  const { user } = session

  if (!(GYM_SELECTIONS as readonly string[]).includes(input.selection)) {
    return { ok: false, error: 'Please choose a gym option.' }
  }
  const sig = (input.signatureName || '').trim()
  if (!sig) return { ok: false, error: 'A typed signature is required.' }
  if (input.selection !== 'waive' && !input.authorizationAck) {
    return { ok: false, error: 'Please acknowledge the payroll deduction authorization.' }
  }

  const date = today()
  const start = input.preferredStartDate ? new Date(input.preferredStartDate) : null

  let emailedAt: Date | null = null
  try {
    const pdf = await buildGymElectionPdf({
      name: user.name || user.email,
      selection: input.selection,
      preferredStartDate: input.preferredStartDate || undefined,
      authorizationAck: !!input.authorizationAck,
      signatureName: sig,
      date,
    })
    const sent = await sendEmail({
      to: BIANCA,
      subject: `Gym Membership Election — ${user.name || user.email}`,
      text:
        `Gym membership election submitted via Workryn.\n\n` +
        `Employee: ${user.name || user.email}\n` +
        `Election: ${GYM_SELECTION_LABEL[input.selection] ?? input.selection}\n` +
        `Preferred start: ${input.preferredStartDate || '—'}\n` +
        `Signed: ${sig} on ${date}\n\n` +
        `The completed election PDF is attached.`,
      attachments: [
        { filename: `gym-election-${fileSlug(user.name || user.email)}.pdf`, content: Buffer.from(pdf), contentType: 'application/pdf' },
      ],
    })
    emailedAt = emailedAtFrom(sent)
  } catch (err) {
    console.error('[benefits] gym PDF/email failed:', err)
    // Persist the election even if email is unconfigured; emailedAt stays null.
  }

  try {
    await db.benefitGymSelection.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        selection: input.selection,
        preferredStartDate: start,
        authorizationAck: !!input.authorizationAck,
        signatureName: sig,
        emailedAt,
      },
      update: {
        selection: input.selection,
        preferredStartDate: start,
        authorizationAck: !!input.authorizationAck,
        signatureName: sig,
        signedAt: new Date(),
        emailedAt,
      },
    })
  } catch (err) {
    console.error('[benefits] gym save failed:', err)
    return { ok: false, error: 'Could not save your gym election. Please try again.' }
  }

  await emailEmployeeConfirmation(
    user.email,
    user.name || 'there',
    'Your gym membership election was received',
    `Election: ${GYM_SELECTION_LABEL[input.selection] ?? input.selection}\n` +
      `Preferred start: ${input.preferredStartDate || '—'}\n` +
      `Signed: ${sig} on ${date}`,
  )
  revalidatePath('/w/benefits')
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────
// 401(k) retirement election — one row/user. Stamps the CDM form, emails it.
// SSN/DOB are TRANSIENT (used only to render the PDF), never persisted.
// ─────────────────────────────────────────────────────────────────────────
interface BeneficiaryInput {
  name: string
  relationship: string
  percent: number
  dob?: string // transient
  ssn?: string // transient
  address?: string // transient
}

export async function saveRetirementElection(input: {
  deferralValue: number // percent, pre-tax
  allocations: Record<string, number>
  primary: BeneficiaryInput
  contingent?: BeneficiaryInput | null
  signatureName: string
  participant?: {
    ssn?: string
    dob?: string
    addr?: string
    city?: string
    state?: string
    zip?: string
    phone?: string
    hire?: string
  }
}): Promise<ActionResult> {
  const session = await getWorkrynSession()
  if (!session) return { ok: false, error: 'Not signed in.' }
  const { user } = session

  const pct = Number(input.deferralValue)
  if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
    return { ok: false, error: 'Please enter a contribution between 1% and 100%.' }
  }
  if (!allocationsValid(input.allocations)) {
    return { ok: false, error: 'Fund allocations must use whole percentages that total exactly 100.' }
  }
  const sig = (input.signatureName || '').trim()
  if (!sig) return { ok: false, error: 'A typed signature is required.' }
  if (!input.primary?.name?.trim() || !input.primary?.relationship?.trim()) {
    return { ok: false, error: 'A primary beneficiary name and relationship are required.' }
  }

  const date = today()
  const p = input.participant || {}

  let emailedAt: Date | null = null
  try {
    const pdf = await fillCdmEnrollmentPdf(cdmBlankBytes(), {
      name: user.name || sig,
      ssn: p.ssn,
      addr: p.addr,
      city: p.city,
      state: p.state,
      zip: p.zip,
      email: user.email,
      phone: p.phone,
      dob: p.dob,
      hire: p.hire,
      deferralType: 'percent',
      deferralValue: pct,
      allocations: input.allocations,
      primary: {
        name: input.primary.name,
        relationship: input.primary.relationship,
        percent: input.primary.percent,
        dob: input.primary.dob,
        ssn: input.primary.ssn,
        address: input.primary.address,
      },
      contingent: input.contingent
        ? {
            name: input.contingent.name,
            relationship: input.contingent.relationship,
            percent: input.contingent.percent,
            dob: input.contingent.dob,
            ssn: input.contingent.ssn,
            address: input.contingent.address,
          }
        : undefined,
      signatureName: sig,
      date,
    })
    const sent = await sendEmail({
      to: BIANCA,
      subject: `401(k) Enrollment — ${user.name || user.email}`,
      text:
        `401(k) enrollment submitted via Workryn.\n\n` +
        `Employee: ${user.name || user.email}\n` +
        `Pre-tax salary deferral: ${pct}%\n` +
        `Signed: ${sig} on ${date}\n\n` +
        `The completed CDM Enrollment Form is attached.`,
      attachments: [
        { filename: `cdm-401k-${fileSlug(user.name || user.email)}.pdf`, content: Buffer.from(pdf), contentType: 'application/pdf' },
      ],
    })
    emailedAt = emailedAtFrom(sent)
  } catch (err) {
    console.error('[benefits] 401k PDF/email failed:', err)
  }

  // Persist WITHOUT SSN/DOB — beneficiaries keep name/relationship/percent/tier only.
  const beneficiaries = [
    { tier: 'primary', name: input.primary.name, relationship: input.primary.relationship, percent: input.primary.percent },
    ...(input.contingent
      ? [{ tier: 'contingent', name: input.contingent.name, relationship: input.contingent.relationship, percent: input.contingent.percent }]
      : []),
  ]

  try {
    await db.benefitRetirementElection.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        deferralType: 'percent',
        deferralValue: pct,
        preTax: true,
        allocations: input.allocations,
        beneficiaries,
        signatureName: sig,
        emailedAt,
      },
      update: {
        deferralType: 'percent',
        deferralValue: pct,
        preTax: true,
        allocations: input.allocations,
        beneficiaries,
        signatureName: sig,
        signedAt: new Date(),
        emailedAt,
      },
    })
  } catch (err) {
    console.error('[benefits] 401k save failed:', err)
    return { ok: false, error: 'Could not save your 401(k) election. Please try again.' }
  }

  await emailEmployeeConfirmation(
    user.email,
    user.name || 'there',
    'Your 401(k) enrollment was received',
    `Pre-tax salary deferral: ${pct}%\n` +
      `Primary beneficiary: ${input.primary.name} (${input.primary.relationship})\n` +
      (input.contingent ? `Contingent beneficiary: ${input.contingent.name} (${input.contingent.relationship})\n` : '') +
      `Signed: ${sig} on ${date}`,
  )
  revalidatePath('/w/benefits')
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────
// Mileage — append-only log row, emailed to mileage@blhnurses.com.
// ─────────────────────────────────────────────────────────────────────────
export async function submitMileage(input: {
  tripDate: string
  miles: number
  purpose?: string
  ratePerMile?: number
}): Promise<ActionResult> {
  const session = await getWorkrynSession()
  if (!session) return { ok: false, error: 'Not signed in.' }
  const { user } = session

  const miles = Number(input.miles)
  if (!input.tripDate || Number.isNaN(Date.parse(input.tripDate))) {
    return { ok: false, error: 'A valid trip date is required.' }
  }
  if (!Number.isFinite(miles) || miles <= 0) {
    return { ok: false, error: 'Miles must be greater than zero.' }
  }
  const rate = input.ratePerMile != null && Number.isFinite(Number(input.ratePerMile)) ? Number(input.ratePerMile) : null
  const amount = rate != null ? Math.round(miles * rate * 100) / 100 : null

  let row
  try {
    row = await db.benefitMileageSubmission.create({
      data: {
        userId: user.id,
        tripDate: new Date(input.tripDate),
        miles,
        purpose: input.purpose?.trim() || null,
        ratePerMile: rate,
        amount,
      },
    })
  } catch (err) {
    console.error('[benefits] mileage save failed:', err)
    return { ok: false, error: 'Could not record your mileage. Please try again.' }
  }

  try {
    const sent = await sendEmail({
      to: MILEAGE_INBOX,
      subject: `Mileage — ${user.name || user.email} — ${input.tripDate}`,
      text:
        `Mileage submitted via Workryn.\n\n` +
        `Employee: ${user.name || user.email}\n` +
        `Trip date: ${input.tripDate}\n` +
        `Miles: ${miles}\n` +
        (rate != null ? `Rate: $${rate.toFixed(3)}/mi\nAmount: $${(amount ?? 0).toFixed(2)}\n` : '') +
        (input.purpose ? `Purpose: ${input.purpose}\n` : ''),
    })
    if (emailedAtFrom(sent)) {
      await db.benefitMileageSubmission.update({ where: { id: row.id }, data: { emailedAt: new Date() } })
    }
  } catch (err) {
    console.error('[benefits] mileage email failed:', err)
  }

  await emailEmployeeConfirmation(
    user.email,
    user.name || 'there',
    'Your mileage submission was received',
    `Trip date: ${input.tripDate}\n` +
      `Miles: ${miles}\n` +
      (rate != null ? `Rate: $${rate.toFixed(3)}/mi\nAmount: $${(amount ?? 0).toFixed(2)}\n` : '') +
      (input.purpose ? `Purpose: ${input.purpose}` : ''),
  )
  revalidatePath('/w/benefits')
  return { ok: true }
}
