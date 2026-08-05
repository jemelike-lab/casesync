// lib/business-date.ts
//
// Single source of truth for "today" in all deadline, reminder, and dashboard
// math. BLH operates in Maryland, so the business day is America/New_York —
// NOT the server's local clock (UTC on Vercel) and NOT the browser's clock.
//
// Why this exists (2026-07-04 accuracy audit): server-side code derived
// "today" from UTC (`new Date()` on Vercel, `current_date` on Azure Postgres)
// while browser-side badges derived it from the user's local clock. Between
// 8pm and midnight ET the two disagreed by a day, so dashboard counters
// called a deadline overdue while the client list still showed it due today.
//
// Rules for all date logic in CaseSync:
//   • Deadline columns are date-only strings ('YYYY-MM-DD'). Parse them with
//     dateStrToEpoch — NEVER `new Date('YYYY-MM-DD')`, which is UTC-midnight
//     and renders as the previous day in US timezones.
//   • "Today" comes from businessTodayStr / businessTodayEpoch.
//   • Day differences are exact integer math on UTC-midnight epochs (DST-proof).
//   • SQL that needs today must use
//     `(now() at time zone 'America/New_York')::date`, not `current_date`.
//
// Pure and framework-free: safe to import from client components, server
// components, API routes, and lib code alike.

export const BUSINESS_TZ = 'America/New_York'

export const DAY_MS = 24 * 60 * 60 * 1000

// en-CA yields YYYY-MM-DD directly.
const businessDayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** The calendar date in America/New_York for the given instant, as 'YYYY-MM-DD'. */
export function businessTodayStr(now: Date = new Date()): string {
  return businessDayFormatter.format(now)
}

/** Alias for formatting an arbitrary instant as its ET calendar date. */
export function dateToBusinessStr(instant: Date): string {
  return businessDayFormatter.format(instant)
}

/**
 * UTC-midnight epoch (ms) for a 'YYYY-MM-DD' (or ISO-prefixed) string.
 * Returns null for null/undefined/unparseable input.
 * Using UTC midnight as a neutral anchor for BOTH sides of every comparison
 * makes day-diff math exact and immune to DST transitions.
 */
export function dateStrToEpoch(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr)
  if (!m) return null
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

/** UTC-midnight epoch (ms) of today's ET calendar date. */
export function businessTodayEpoch(now: Date = new Date()): number {
  // businessTodayStr always yields a valid YYYY-MM-DD.
  return dateStrToEpoch(businessTodayStr(now)) as number
}

/** Format a UTC-midnight epoch back to 'YYYY-MM-DD'. */
export function epochToDateStr(epoch: number): string {
  const d = new Date(epoch)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/**
 * Whole days from today (ET) to dateStr. Negative = overdue by that many days,
 * 0 = due today, positive = due in that many days. Null if dateStr is unusable.
 */
export function daysFromBusinessToday(
  dateStr: string | null | undefined,
  now: Date = new Date(),
): number | null {
  const target = dateStrToEpoch(dateStr)
  if (target === null) return null
  return Math.round((target - businessTodayEpoch(now)) / DAY_MS)
}

/** 'YYYY-MM-DD' that is `offsetDays` from today (ET). */
export function businessDateOffsetStr(offsetDays: number, now: Date = new Date()): string {
  return epochToDateStr(businessTodayEpoch(now) + offsetDays * DAY_MS)
}

/** 'YYYY-MM-DD' plus n days (exact math on UTC-midnight epochs; DST-proof). */
/**
 * SPM next-due after completion: the 15th of the month following the
 * business "today" (Megan 07-31 spec — replaces the old +30-day auto-set).
 */
export function spmNextDueAfterCompletionStr(now: Date = new Date()): string {
  const [y, m] = businessTodayStr(now).split('-').map(Number)
  const ny = m === 12 ? y + 1 : y
  const nm = m === 12 ? 1 : m + 1
  return `${ny}-${String(nm).padStart(2, '0')}-15`
}

/**
 * MDH 30-day shadow date (Josh 08-05 ruling): the 15th-of-month rule is the
 * HARD rule everywhere; the MDH 30-days-from-previous-due standard is kept as
 * a quiet background indicator only — never scored, never alerted.
 * previous due = the 15th of the month before spm_next_due; shadow = +30 days.
 * Returns null when spm_next_due is absent or unparsable.
 */
export function mdhSpmShadowDateStr(spmNextDue: string | null | undefined): string | null {
  if (!spmNextDue) return null
  const parts = spmNextDue.split('-').map(Number)
  if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) return null
  const [y, m] = parts
  const py = m === 1 ? y - 1 : y
  const pm = m === 1 ? 12 : m - 1
  const prevDue = `${py}-${String(pm).padStart(2, '0')}-15`
  try {
    return dateStrAddDays(prevDue, 30)
  } catch {
    return null
  }
}

export function dateStrAddDays(dateStr: string, days: number): string {
  const epoch = dateStrToEpoch(dateStr)
  if (epoch === null) throw new Error(`dateStrAddDays: unusable date string "${dateStr}"`)
  return epochToDateStr(epoch + days * DAY_MS)
}

const businessHourFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TZ,
  hour: '2-digit',
  hourCycle: 'h23',
})

/**
 * The UTC instant at which the given ET calendar date begins (ET midnight).
 * ET is only ever UTC-4 (EDT) or UTC-5 (EST); we test both candidates against
 * the formatter instead of hardcoding DST transition rules.
 */
export function businessDayStartInstant(dateStr: string): Date {
  for (const offset of [4, 5]) {
    const candidate = new Date(`${dateStr}T0${offset}:00:00Z`)
    if (
      businessDayFormatter.format(candidate) === dateStr &&
      businessHourFormatter.format(candidate) === '00'
    ) {
      return candidate
    }
  }
  // Unreachable for America/New_York; conservative fallback (EST).
  return new Date(`${dateStr}T05:00:00Z`)
}

/**
 * Monday 'YYYY-MM-DD' of the ET business week containing the given instant.
 * Payroll weeks are Monday-anchored — matches the time-clock routes.
 */
export function businessWeekStartStr(now: Date = new Date()): string {
  const epoch = businessTodayEpoch(now)
  const dow = new Date(epoch).getUTCDay() // ET weekday: epoch is UTC-midnight of the ET date
  const diff = dow === 0 ? -6 : 1 - dow
  return epochToDateStr(epoch + diff * DAY_MS)
}

/**
 * SQL expression for today's ET calendar date on Azure Postgres (session TZ is
 * UTC there, so bare `current_date` flips a day early every evening ET).
 * Interpolate as a raw fragment inside a template — it contains no user input.
 */
export const SQL_BUSINESS_TODAY = `(now() at time zone 'America/New_York')::date`
