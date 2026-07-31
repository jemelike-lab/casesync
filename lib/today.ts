// lib/today.ts
// Phase 3 — deterministic "Today" engine: triage the handful that matter out
// of a whole caseload. Pure and framework-free so the in-app Today card
// (/api/today) and the morning digest email (check-deadlines cron) run the
// EXACT same math and can never disagree.
//
// Show green, not just red: caught_up drives the "you're caught up" state.

import { daysFromToday, PREVISIT_DEADLINE_FIELDS, deadlineLabel } from './previsit'

export type TodayFocusClient = { id: string; name: string; score: number; reasons: string[] }

export type TodayCounts = {
  total: number
  overdue: number
  due_today: number
  due_this_week: number
  no_contact_7: number
  eligibility_soon_30: number
}

export type TodayPacket = {
  counts: TodayCounts
  focus: TodayFocusClient[]
  caught_up: boolean
}

/**
 * Compute the Today packet from client rows that carry the 13 deadline canon
 * fields plus id / client_id / first_name / last_name / last_contact_date.
 * Count semantics match the existing digest: due_this_week EXCLUDES clients
 * that are already overdue (a client sits in its worst bucket).
 */
export function computeTodayPacket(
  rows: Array<Record<string, unknown>>,
  todayStr: string,
  focusLimit = 5,
): TodayPacket {
  const counts: TodayCounts = {
    total: rows.length, overdue: 0, due_today: 0, due_this_week: 0,
    no_contact_7: 0, eligibility_soon_30: 0,
  }
  const scored: TodayFocusClient[] = []

  for (const r of rows) {
    let overdueFields = 0
    let worstOverdueDays = 0
    let worstOverdueField = ''
    let dueTodayField = ''
    let dueWeekCount = 0
    let nextDueField = ''
    let nextDueDays = 99

    for (const f of PREVISIT_DEADLINE_FIELDS) {
      const days = daysFromToday((r[f] as string | null) ?? null, todayStr)
      if (days === null) continue
      if (days < 0) {
        overdueFields++
        if (-days > worstOverdueDays) { worstOverdueDays = -days; worstOverdueField = f }
      } else if (days === 0) {
        if (!dueTodayField) dueTodayField = f
      } else if (days <= 7) {
        dueWeekCount++
        if (days < nextDueDays) { nextDueDays = days; nextDueField = f }
      }
    }

    const lcDays = daysFromToday((r.last_contact_date as string | null) ?? null, todayStr)
    const daysSinceContact = lcDays === null ? null : Math.max(0, -lcDays)
    const noContact7 = daysSinceContact === null || daysSinceContact >= 15
    const eligDays = daysFromToday((r.eligibility_end_date as string | null) ?? null, todayStr)
    const eligSoon = eligDays !== null && eligDays >= 0 && eligDays <= 30

    if (overdueFields > 0) counts.overdue++
    if (dueTodayField) counts.due_today++
    if (!overdueFields && (dueTodayField || dueWeekCount > 0)) counts.due_this_week++
    if (noContact7) counts.no_contact_7++
    if (eligSoon) counts.eligibility_soon_30++

    const score =
      overdueFields * 10 +
      Math.min(worstOverdueDays, 365) / 30 +
      (dueTodayField ? 6 : 0) +
      dueWeekCount * 2 +
      (noContact7 ? 4 : 0) +
      (eligSoon ? 5 : 0)
    if (score <= 0) continue

    const reasons: string[] = []
    if (worstOverdueField) {
      reasons.push(`${deadlineLabel(worstOverdueField)} ${worstOverdueDays}d overdue${overdueFields > 1 ? ` (+${overdueFields - 1} more)` : ''}`)
    }
    if (dueTodayField) reasons.push(`${deadlineLabel(dueTodayField)} due today`)
    else if (nextDueField) reasons.push(`${deadlineLabel(nextDueField)} due in ${nextDueDays}d`)
    if (eligSoon) reasons.push(`Eligibility ends in ${eligDays}d`)
    if (noContact7) reasons.push(daysSinceContact === null ? 'Never contacted' : `No contact ${daysSinceContact}d`)

    const name = [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || String(r.client_id ?? 'client')
    scored.push({ id: String(r.id), name, score, reasons: reasons.slice(0, 3) })
  }

  scored.sort((a, b) => b.score - a.score || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  return {
    counts,
    focus: scored.slice(0, focusLimit),
    caught_up: counts.overdue === 0 && counts.due_today === 0,
  }
}

/** Columns the Today engine reads — shared by /api/today and the cron scan. */
export const TODAY_CLIENT_COLS =
  'id, client_id, first_name, last_name, last_contact_date, eligibility_end_date, three_month_visit_due, quarterly_waiver_date, med_tech_redet_date, pos_deadline, assessment_due, thirty_day_letter_date, co_financial_redet_date, co_app_date, mfp_consent_date, two57_date, doc_mdh_date, spm_next_due'
