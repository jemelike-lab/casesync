// lib/readiness.ts
// Deterministic POS submission-readiness evaluation for a CaseSync client.
//
// Source of truth: BLH "POS Submission Guidelines — Whole Agency" (ruling principles).
// Batch C — signed off by Josh 2026-07-03:
//   • Five auto-gates; ALL must pass for a client to be "ready".
//   • A missing value FAILS its gate (a requirement, not a soft reminder).
//   • LOC is annual: expiry = loc_date + 1 year. Fail if expired, expiring within
//     30 days, or absent.
//   • Everything else on the checklist is surfaced as a manual reminder — never scored.
//   • No schema changes.
//
// Pure and framework-free so both the Casey tool (evaluate_client_readiness) and
// the once-a-day briefing card can call it without duplicating the rules.

import { businessTodayEpoch } from './business-date'

export type GateStatus = 'pass' | 'fail'

export interface ReadinessGate {
  key: string
  label: string
  status: GateStatus
  detail: string
}

export interface ReadinessResult {
  ready: boolean
  gates: ReadinessGate[]
  reminders: string[]
}

// Subset of the clients row the evaluator reads.
export interface ReadinessClient {
  eligibility_end_date: string | null
  loc_date: string | null
  pos_status: string | null
  poc_date: string | null
}

// Attachment category values that resolve into the "Forms & Signatures" folder.
// Mirrors CATEGORY_TO_FOLDER in components/ClientFiles.tsx — keep the two in sync.
export const SIGNATURE_CATEGORIES = ['forms_signatures', 'consent_form'] as const

// Days before LOC expiry at which a plan is no longer submittable (per guidelines).
export const LOC_EXPIRY_WARN_DAYS = 30

// Checklist items that live in the LTSS POS document / narrative — NOT in the
// CaseSync data plane. The engine can't verify these, so it surfaces them as
// reminders for the planner to eyeball. Never auto-scored.
export const MANUAL_REMINDERS: string[] = [
  'POS type and program type are appropriate (annual vs. initial; CFC/CO)',
  'Recent redetermination is an annual POS; significant-change assessment revised if applicable',
  'Narrative fits the participant (gender, age, language) and reads correctly',
  'All POC recommendations appear in the narrative or as a service',
  'Updated strengths and goals for annual/initial plans',
  'Service address matches the primary address on the profile',
  'CSQ completed no more than 60 days before submission',
  'All mandatory (**) sections completed; no unrequested exception request',
  'Emergency backups: at least one listed, a primary indicated (24/7, local, not a minor)',
  'Services complete: provider, unit/frequency, overall cost, and a comment each',
]

const DAY_MS = 24 * 60 * 60 * 1000

// Date-only UTC-midnight epoch for a 'YYYY-MM-DD' (or ISO) string; null if unparseable.
function dayEpoch(dateStr: string | null): number | null {
  if (!dateStr) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr)
  if (!m) return null
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

function fmt(epoch: number): string {
  const d = new Date(epoch)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
}

export function evaluateReadiness(
  client: ReadinessClient,
  hasSignatureDoc: boolean,
  now: Date = new Date()
): ReadinessResult {
  // "Today" is the America/New_York business date — gates must agree with
  // the dashboard SQL and client-list badges, not the server's UTC clock.
  const today = businessTodayEpoch(now)
  const gates: ReadinessGate[] = []

  // 1 — Medicaid active. eligibility_end_date must be today or later. Missing = fail.
  {
    const e = dayEpoch(client.eligibility_end_date)
    if (e === null) {
      gates.push({ key: 'medicaid', label: 'Medicaid active', status: 'fail', detail: 'No Medicaid eligibility end date on file.' })
    } else if (e < today) {
      gates.push({ key: 'medicaid', label: 'Medicaid active', status: 'fail', detail: `Medicaid eligibility ended ${fmt(e)}.` })
    } else {
      gates.push({ key: 'medicaid', label: 'Medicaid active', status: 'pass', detail: `Medicaid eligibility current through ${fmt(e)}.` })
    }
  }

  // 2 — Level of Care valid. Annual: expiry = loc_date + 1 year.
  // LOC date is conditional (Megan 07-31): when absent it is treated as
  // identical to the POC date — only entered when it differs from POC.
  // Fail only when both are absent, expired, or expiring within LOC_EXPIRY_WARN_DAYS.
  {
    const locOwn = dayEpoch(client.loc_date)
    const s = locOwn !== null ? locOwn : dayEpoch(client.poc_date)
    const basis = locOwn !== null ? 'LOC' : 'LOC (≡ POC date)'
    if (s === null) {
      gates.push({ key: 'loc', label: 'Level of Care valid', status: 'fail', detail: 'No LOC or POC date on file (LOC is only entered separately when it differs from POC).' })
    } else {
      const sd = new Date(s)
      const expiry = Date.UTC(sd.getUTCFullYear() + 1, sd.getUTCMonth(), sd.getUTCDate())
      const warnFrom = today + LOC_EXPIRY_WARN_DAYS * DAY_MS
      if (expiry <= today) {
        gates.push({ key: 'loc', label: 'Level of Care valid', status: 'fail', detail: `${basis} expired ${fmt(expiry)} (started ${fmt(s)}; annual).` })
      } else if (expiry <= warnFrom) {
        gates.push({ key: 'loc', label: 'Level of Care valid', status: 'fail', detail: `${basis} expires ${fmt(expiry)} — within ${LOC_EXPIRY_WARN_DAYS} days.` })
      } else {
        gates.push({ key: 'loc', label: 'Level of Care valid', status: 'pass', detail: `${basis} valid through ${fmt(expiry)}.` })
      }
    }
  }

  // 3 — POS approved/active. An 'Active' or 'Approved' POS is a pass —
  // it must never surface as a red alert (Megan 07-31). 'Completed' kept
  // for legacy records.
  {
    const v = (client.pos_status ?? '').trim().toLowerCase()
    const ok = v === 'completed' || v === 'approved' || v === 'active'
    gates.push({
      key: 'pos_status',
      label: 'POS approved/active',
      status: ok ? 'pass' : 'fail',
      detail: ok ? `POS status is ${client.pos_status}.` : `POS status is ${client.pos_status ? `"${client.pos_status}"` : 'not set'}.`,
    })
  }

  // 4 — Signed forms uploaded to the Forms & Signatures folder.
  gates.push({
    key: 'signatures',
    label: 'Signed forms on file',
    status: hasSignatureDoc ? 'pass' : 'fail',
    detail: hasSignatureDoc ? 'At least one document in Forms & Signatures.' : 'No document in the Forms & Signatures folder.',
  })

  // 5 — Plan of Care on file (a POC must precede a POS).
  {
    const p = dayEpoch(client.poc_date)
    gates.push({
      key: 'poc',
      label: 'Plan of Care on file',
      status: p === null ? 'fail' : 'pass',
      detail: p === null ? 'No POC date on file (required before a POS).' : `POC on file (${fmt(p)}).`,
    })
  }

  return { ready: gates.every((g) => g.status === 'pass'), gates, reminders: MANUAL_REMINDERS }
}
