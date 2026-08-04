/**
 * Smartsheet integration — read-only pull of per-planner client sheets.
 *
 * Each support planner keeps one sheet whose NAME is their full name
 * ("Mariama Jalloh", "Blair Morales"); that is how a sheet is matched to a
 * CaseSync profile. Column titles are the human labels the SPs already use;
 * SMARTSHEET_COLUMN_MAP translates them to the canonical import headers so
 * rows go through lib/client-import's normalizer — the same code path as a
 * manual CSV import, so validation and date handling stay identical.
 *
 * The token lives ONLY in process.env.SMARTSHEET_API_TOKEN. Never inline it.
 */

const SMARTSHEET_API = 'https://api.smartsheet.com/2.0'

export interface SmartsheetListedSheet {
  id: number
  name: string
  modifiedAt?: string
}

interface SmartsheetCell {
  columnId: number
  value?: string | number | boolean | null
  displayValue?: string | null
}

interface SmartsheetRow {
  id: number
  rowNumber: number
  cells: SmartsheetCell[]
}

interface SmartsheetColumn {
  id: number
  title: string
  index: number
}

export interface SmartsheetSheet {
  id: number
  name: string
  columns: SmartsheetColumn[]
  rows: SmartsheetRow[]
}

/**
 * Smartsheet column title -> canonical client-import header.
 * Titles are matched loosely (case/space/punctuation-insensitive) so a stray
 * trailing colon or double space in one planner's sheet doesn't drop a column.
 * Anything not listed here is ignored rather than guessed at.
 */
export const SMARTSHEET_COLUMN_MAP: Record<string, string> = {
  client_id: 'client_id',
  client_last_name: 'last_name',
  eligibility_code: 'eligibility_code',
  eligibility_end_date: 'eligibility_end_date',
  last_contact_date: 'last_contact_date',
  spm_completed: 'spm_completed',
  three_month_visit_date: 'three_month_visit_date',
  '3_month_visit_date': 'three_month_visit_date',
  '3_month_visit_due': 'three_month_visit_due',
  quarterly_visit_waiver_date: 'quarterly_waiver_date',
  med_tech_redet_date: 'med_tech_redet_date',
  med_tech_status: 'med_tech_status',
  poc_date: 'poc_date',
  loc_date_if_necessary: 'loc_date',
  documentation_mdh_date_30_days_after_due_date: 'doc_mdh_date',
  pos_deadline: 'pos_deadline',
  assessment_due_date: 'assessment_due',
  pos_status: 'pos_status',
  foc: 'foc',
  provider_forms: 'provider_forms',
  signatures_needed: 'signatures_needed',
  schedule_supporting_documents_attached: 'schedule_docs',
  snfs: 'snfs',
  atp: 'atp',
  lease: 'lease',
  reportable_events: 'reportable_events',
  appeals: 'appeals',
  '30_day_letter_date': 'thirty_day_letter_date',
  drop_in_visit_date: 'drop_in_visit_date',
  co_financial_redetermination_due_date: 'co_financial_redet_date',
  co_application_date: 'co_app_date',
  request_letter: 'request_letter',
  mfp_consent_form_date: 'mfp_consent_date',
  '257_date': 'two57_date',
  audit_team_review: 'audit_review',
  qa_team_review: 'qa_review',
}

/**
 * Columns that together identify a sheet as a client caseload. A caseload
 * sheet must expose a Client ID column plus at least CASELOAD_MIN_SIGNALS of
 * these. HR/evaluation/admin sheets share none of them, so they can never be
 * mistaken for a caseload even when the sheet name matches a staff profile.
 */
const CASELOAD_SIGNAL_HEADERS = [
  'eligibility_code', 'eligibility_end_date', 'last_contact_date',
  'poc_date', 'pos_deadline', 'pos_status', 'three_month_visit_date',
  'spm_completed', 'assessment_due', 'med_tech_status',
]
const CASELOAD_MIN_SIGNALS = 3

export interface CaseloadCheck {
  ok: boolean
  reason?: string
}

/**
 * Structural gate: is this sheet actually a client caseload?
 * Deliberately checks the sheet's SHAPE, not its name — a name-based rule
 * cannot distinguish "Jane Doe" the planner's caseload from "Jane Doe" the
 * evaluation record.
 */
export function isCaseloadSheet(sheet: SmartsheetSheet): CaseloadCheck {
  const mapped = new Set<string>()
  for (const col of sheet.columns ?? []) {
    const m = SMARTSHEET_COLUMN_MAP[squashTitle(col.title)]
    if (m) mapped.add(m)
  }
  if (!mapped.has('client_id')) {
    return { ok: false, reason: 'no Client ID column' }
  }
  const signals = CASELOAD_SIGNAL_HEADERS.filter(h => mapped.has(h)).length
  if (signals < CASELOAD_MIN_SIGNALS) {
    return { ok: false, reason: `only ${signals} caseload columns (need ${CASELOAD_MIN_SIGNALS})` }
  }
  return { ok: true }
}

/**
 * Several planners keep client surnames in ALL CAPS. CaseSync stores them
 * Title Cased (the original import transform did this), so syncing raw sheet
 * text shouts every name. Only normalize strings that are entirely uppercase
 * — never touch already-mixed case, which would break McPhaul, DeSanto,
 * O'Brien and similar.
 */
export function normalizeLastName(raw: string): string {
  const s = raw.trim()
  if (!s) return s
  const hasLower = /[a-z]/.test(s)
  if (hasLower) return s
  return s
    .toLowerCase()
    .replace(/(^|[\s\-'\u2019.,/])([a-z])/g, (_m, sep, ch) => sep + ch.toUpperCase())
}

export function squashTitle(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function token(): string {
  const t = process.env.SMARTSHEET_API_TOKEN
  if (!t) throw new Error('SMARTSHEET_API_TOKEN is not configured')
  return t
}

async function smartsheetGet<T>(path: string): Promise<T> {
  const res = await fetch(`${SMARTSHEET_API}${path}`, {
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    cache: 'no-store',
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    // Never echo the token; surface status + Smartsheet's own message only.
    throw new Error(`Smartsheet ${res.status} on ${path}: ${body.slice(0, 300)}`)
  }
  return (await res.json()) as T
}

export async function listSheets(): Promise<SmartsheetListedSheet[]> {
  const out: SmartsheetListedSheet[] = []
  let page = 1
  // Paginate defensively — the bare call caps out and would silently drop
  // planners past the first page as the team grows.
  for (;;) {
    const j = await smartsheetGet<{ data?: SmartsheetListedSheet[]; totalPages?: number }>(
      `/sheets?includeAll=false&pageSize=100&page=${page}`
    )
    out.push(...(j.data ?? []))
    if (!j.totalPages || page >= j.totalPages) break
    page += 1
    if (page > 20) break
  }
  return out
}

export async function getSheet(sheetId: number): Promise<SmartsheetSheet> {
  return smartsheetGet<SmartsheetSheet>(`/sheets/${sheetId}`)
}

/**
 * Sentinel dates BLH uses in Smartsheet to mean "unknown/none" (12/31/9999,
 * 1/1/1900 and friends). The import normalizer rejects them outright, so they
 * are blanked here — matching the documented transform rule.
 */
function isSentinelDate(y: number): boolean {
  return y < 1900 || y >= 2100
}

function toIsoDate(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null
  let y: number, m: number, d: number
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)
  if (iso) { y = +iso[1]; m = +iso[2]; d = +iso[3] }
  else if (us) { m = +us[1]; d = +us[2]; y = +us[3] }
  else return null
  if (isSentinelDate(y)) return null
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

const DATE_HEADERS = new Set([
  'eligibility_end_date', 'last_contact_date', 'three_month_visit_date',
  'three_month_visit_due', 'quarterly_waiver_date', 'drop_in_visit_date',
  'poc_date', 'loc_date', 'med_tech_redet_date', 'pos_deadline',
  'assessment_due', 'thirty_day_letter_date', 'co_financial_redet_date',
  'co_app_date', 'mfp_consent_date', 'two57_date', 'doc_mdh_date',
])

export interface SheetRowResult {
  /** canonical import header -> string value (CSV-ready) */
  values: Record<string, string>
  rowNumber: number
  notes: string[]
}

/**
 * Convert one Smartsheet sheet into canonical-header rows plus per-row notes
 * for the values that don't map to a column (SPM month lists, waiver markers,
 * contact attempts) — same conventions as the manual Smartsheet transforms.
 */
export function sheetToRows(sheet: SmartsheetSheet): SheetRowResult[] {
  const byId = new Map<number, string>()
  for (const col of sheet.columns) {
    const mapped = SMARTSHEET_COLUMN_MAP[squashTitle(col.title)]
    if (mapped) byId.set(col.id, mapped)
  }

  const results: SheetRowResult[] = []
  for (const row of sheet.rows ?? []) {
    const values: Record<string, string> = {}
    const notes: string[] = []
    const attempts: string[] = []

    for (const cell of row.cells ?? []) {
      const header = byId.get(cell.columnId)
      const raw = (cell.displayValue ?? cell.value ?? '') as string | number | boolean
      // Smartsheet checkbox columns return boolean false when UNCHECKED.
      // String()ing that writes the literal "false" into an otherwise blank
      // field, so treat it as no value at all.
      if (raw === false) continue
      const text = raw === null || raw === undefined ? '' : String(raw).trim()
      if (!header) {
        continue
      }
      if (!text) continue

      if (DATE_HEADERS.has(header)) {
        const iso = toIsoDate(text)
        if (iso) {
          values[header] = iso
        } else {
          notes.push(`${header} on source sheet: "${text}" (not a usable date — left blank)`)
        }
        continue
      }

      if (header === 'spm_completed') {
        // Sheets carry month lists ("Jul", "May, Jun") rather than booleans.
        values.spm_completed = 'yes'
        notes.push(`SPM completed: ${text}`)
        continue
      }

      values[header] = header === 'last_name' ? normalizeLastName(text) : text
    }

    // Contact attempts live in 1st/2nd/3rd Attempt columns — notes, not fields.
    for (const cell of row.cells ?? []) {
      const col = sheet.columns.find(c => c.id === cell.columnId)
      if (!col) continue
      const t = squashTitle(col.title)
      if (t === '1st_attempt' || t === '2nd_attempt' || t === '3rd_attempt') {
        const v = (cell.displayValue ?? cell.value ?? '') as string
        if (v && String(v).trim()) attempts.push(`${col.title}: ${String(v).trim()}`)
      }
    }
    if (attempts.length) notes.push(attempts.join(' · '))

    if (!values.client_id) continue

    // Classification: CO only when the CO trailing columns are populated.
    values.category = values.co_app_date || values.co_financial_redet_date ? 'co' : 'cfc'

    results.push({ values, rowNumber: row.rowNumber, notes })
  }
  return results
}
