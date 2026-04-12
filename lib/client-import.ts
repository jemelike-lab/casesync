import type { ClientClassification, Category, Profile } from '@/lib/types'

export const CLIENT_IMPORT_REQUIRED_HEADERS = ['client_id', 'last_name', 'category'] as const

export const CLIENT_IMPORT_HEADERS = [
  'client_id',
  'first_name',
  'last_name',
  'category',
  'eligibility_code',
  'eligibility_end_date',
  'assigned_to_name',
  'last_contact_date',
  'last_contact_type',
  'three_month_visit_date',
  'three_month_visit_due',
  'quarterly_waiver_date',
  'drop_in_visit_date',
  'poc_date',
  'loc_date',
  'med_tech_redet_date',
  'med_tech_status',
  'pos_deadline',
  'pos_status',
  'assessment_due',
  'spm_completed',
  'spm_next_due',
  'foc',
  'provider_forms',
  'signatures_needed',
  'schedule_docs',
  'atp',
  'snfs',
  'lease',
  'reportable_events',
  'appeals',
  'thirty_day_letter_date',
  'co_financial_redet_date',
  'co_app_date',
  'request_letter',
  'mfp_consent_date',
  'two57_date',
  'doc_mdh_date',
  'audit_review',
  'qa_review',
  'goal_pct',
  'client_classification',
  'notes',
] as const

const CATEGORY_VALUES = new Set<Category>(['co', 'cfc', 'cpas'])
const CLIENT_CLASSIFICATION_VALUES = new Set<ClientClassification>(['real', 'trial', 'test'])
const BOOLEAN_TRUE = new Set(['true', 'yes', 'y', '1'])
const BOOLEAN_FALSE = new Set(['false', 'no', 'n', '0'])
const DATE_FIELDS = new Set([
  'eligibility_end_date',
  'last_contact_date',
  'three_month_visit_date',
  'three_month_visit_due',
  'quarterly_waiver_date',
  'drop_in_visit_date',
  'poc_date',
  'loc_date',
  'med_tech_redet_date',
  'pos_deadline',
  'assessment_due',
  'spm_next_due',
  'thirty_day_letter_date',
  'co_financial_redet_date',
  'co_app_date',
  'mfp_consent_date',
  'two57_date',
  'doc_mdh_date',
])

const TEXT_FIELDS = new Set([
  'client_id',
  'first_name',
  'last_name',
  'eligibility_code',
  'last_contact_type',
  'med_tech_status',
  'pos_status',
  'foc',
  'provider_forms',
  'signatures_needed',
  'atp',
  'snfs',
  'lease',
  'reportable_events',
  'appeals',
  'request_letter',
  'audit_review',
  'qa_review',
  'notes',
])

export type ClientImportHeader = (typeof CLIENT_IMPORT_HEADERS)[number]

export interface ClientImportError {
  rowNumber: number
  column?: string
  message: string
}

export interface ClientImportParsedRow {
  rowNumber: number
  raw: Record<string, string>
}

export interface ClientImportPlannerSuggestion {
  id: string
  full_name: string | null
}

export interface ClientImportPlannerMatch {
  matched: boolean
  plannerId: string | null
  plannerName: string | null
  mode: 'blank' | 'exact' | 'exact-normalized' | 'suggested' | 'unassigned' | 'missing' | 'ambiguous'
  matches?: ClientImportPlannerSuggestion[]
  suggestions?: ClientImportPlannerSuggestion[]
}

export interface ClientImportNormalizedRow {
  rowNumber: number
  client_id: string
  first_name: string | null
  last_name: string
  category: Category
  eligibility_code: string | null
  eligibility_end_date: string | null
  assigned_to: string | null
  assigned_to_name: string | null
  assigned_to_resolution: ClientImportPlannerMatch['mode']
  assigned_to_suggestions?: ClientImportPlannerSuggestion[]
  last_contact_date: string | null
  last_contact_type: string | null
  three_month_visit_date: string | null
  three_month_visit_due: string | null
  quarterly_waiver_date: string | null
  drop_in_visit_date: string | null
  poc_date: string | null
  loc_date: string | null
  med_tech_redet_date: string | null
  med_tech_status: string | null
  pos_deadline: string | null
  pos_status: string | null
  assessment_due: string | null
  spm_completed: boolean
  spm_next_due: string | null
  foc: string | null
  provider_forms: string | null
  signatures_needed: string | null
  schedule_docs: boolean
  atp: string | null
  snfs: string | null
  lease: string | null
  reportable_events: string | null
  appeals: string | null
  thirty_day_letter_date: string | null
  co_financial_redet_date: string | null
  co_app_date: string | null
  request_letter: string | null
  mfp_consent_date: string | null
  two57_date: string | null
  doc_mdh_date: string | null
  audit_review: string | null
  qa_review: string | null
  goal_pct: number
  client_classification: ClientClassification | null
  notes: string | null
}

export interface ClientImportParseResult {
  headers: string[]
  rows: ClientImportParsedRow[]
  errors: ClientImportError[]
}

export interface ClientImportValidationResult {
  normalizedRows: ClientImportNormalizedRow[]
  errors: ClientImportError[]
  warnings: ClientImportError[]
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    const next = line[i + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      cells.push(current)
      current = ''
      continue
    }

    current += char
  }

  cells.push(current)
  return cells
}

export function parseClientImportCsv(csvText: string): ClientImportParseResult {
  const normalized = csvText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized.split('\n').filter((line, index, all) => !(index === all.length - 1 && line.trim() === ''))

  if (lines.length === 0) {
    return {
      headers: [],
      rows: [],
      errors: [{ rowNumber: 1, message: 'The file is empty.' }],
    }
  }

  const headers = splitCsvLine(lines[0]).map(h => h.trim())
  const missingHeaders = CLIENT_IMPORT_REQUIRED_HEADERS.filter(header => !headers.includes(header))
  const errors: ClientImportError[] = missingHeaders.map(header => ({
    rowNumber: 1,
    column: header,
    message: `Missing required header: ${header}`,
  }))

  const rows: ClientImportParsedRow[] = []

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex]
    if (!line.trim()) continue

    const values = splitCsvLine(line)
    if (values.length > headers.length) {
      errors.push({
        rowNumber: lineIndex + 1,
        message: `Row has ${values.length} columns but header defines ${headers.length}.`,
      })
      continue
    }

    const raw: Record<string, string> = {}
    headers.forEach((header, index) => {
      raw[header] = (values[index] ?? '').trim()
    })

    const hasAnyValue = Object.values(raw).some(value => value !== '')
    if (!hasAnyValue) continue

    rows.push({ rowNumber: lineIndex + 1, raw })
  }

  return { headers, rows, errors }
}

function normalizeText(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed === '' ? null : trimmed
}

function normalizeLooseText(value: string | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ')
}

function normalizeComparableName(value: string | undefined): string {
  return normalizeLooseText(value)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function plannerSimilarityScore(input: string, candidate: string): number {
  if (!input || !candidate) return 0
  if (candidate === input) return 1
  if (candidate.includes(input) || input.includes(candidate)) return 0.9

  const inputParts = input.split(' ')
  const candidateParts = candidate.split(' ')
  const overlap = inputParts.filter(part => candidateParts.includes(part)).length
  if (!overlap) return 0
  return overlap / Math.max(inputParts.length, candidateParts.length)
}

function normalizeDate(value: string | undefined): { value: string | null; error?: string } {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return { value: null }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return { value: null, error: 'Expected date format YYYY-MM-DD' }
  }
  const date = new Date(`${trimmed}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== trimmed) {
    return { value: null, error: 'Invalid calendar date' }
  }
  return { value: trimmed }
}

function normalizeBoolean(value: string | undefined): { value: boolean; error?: string } {
  const trimmed = value?.trim().toLowerCase() ?? ''
  if (!trimmed) return { value: false }
  if (BOOLEAN_TRUE.has(trimmed)) return { value: true }
  if (BOOLEAN_FALSE.has(trimmed)) return { value: false }
  return { value: false, error: 'Expected boolean value (TRUE/FALSE, Yes/No, 1/0)' }
}

function normalizeCategory(value: string | undefined): { value: Category | null; error?: string } {
  const trimmed = value?.trim().toLowerCase() ?? ''
  if (!trimmed) return { value: null, error: 'Category is required' }
  if (!CATEGORY_VALUES.has(trimmed as Category)) {
    return { value: null, error: 'Category must be one of: co, cfc, cpas' }
  }
  return { value: trimmed as Category }
}

function normalizeGoalPct(value: string | undefined): { value: number; error?: string } {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return { value: 0 }
  const numeric = Number(trimmed)
  if (!Number.isFinite(numeric)) return { value: 0, error: 'Goal % must be a number' }
  if (numeric < 0 || numeric > 100) return { value: 0, error: 'Goal % must be between 0 and 100' }
  return { value: numeric }
}

function normalizeClientClassification(value: string | undefined): { value: ClientClassification | null; error?: string } {
  const trimmed = value?.trim().toLowerCase() ?? ''
  if (!trimmed) return { value: null }
  if (!CLIENT_CLASSIFICATION_VALUES.has(trimmed as ClientClassification)) {
    return { value: null, error: 'Client classification must be one of: real, trial, test' }
  }
  return { value: trimmed as ClientClassification }
}

export function resolvePlannerByName(name: string | null, planners: Pick<Profile, 'id' | 'full_name'>[]): ClientImportPlannerMatch {
  if (!name) return { matched: true, plannerId: null, plannerName: null, mode: 'blank' }

  const rawName = normalizeLooseText(name)
  const normalized = rawName.toLowerCase()
  const comparable = normalizeComparableName(rawName)

  if (!normalized || normalized === 'unassigned') {
    return { matched: true, plannerId: null, plannerName: 'Unassigned', mode: 'unassigned' }
  }

  const exactMatches = planners.filter(planner => normalizeLooseText(planner.full_name ?? '').toLowerCase() === normalized)
  if (exactMatches.length === 1) {
    return {
      matched: true,
      plannerId: exactMatches[0].id,
      plannerName: exactMatches[0].full_name,
      mode: 'exact',
    }
  }

  if (exactMatches.length > 1) {
    return {
      matched: false,
      plannerId: null,
      plannerName: null,
      mode: 'ambiguous',
      matches: exactMatches.map(({ id, full_name }) => ({ id, full_name })),
    }
  }

  const normalizedMatches = planners.filter(planner => normalizeComparableName(planner.full_name ?? '') === comparable)
  if (normalizedMatches.length === 1) {
    return {
      matched: true,
      plannerId: normalizedMatches[0].id,
      plannerName: normalizedMatches[0].full_name,
      mode: 'exact-normalized',
    }
  }

  if (normalizedMatches.length > 1) {
    return {
      matched: false,
      plannerId: null,
      plannerName: null,
      mode: 'ambiguous',
      matches: normalizedMatches.map(({ id, full_name }) => ({ id, full_name })),
    }
  }

  const suggestions = planners
    .map((planner) => ({
      id: planner.id,
      full_name: planner.full_name,
      score: plannerSimilarityScore(comparable, normalizeComparableName(planner.full_name ?? '')),
    }))
    .filter(planner => planner.score >= 0.5)
    .sort((a, b) => b.score - a.score || String(a.full_name).localeCompare(String(b.full_name)))
    .slice(0, 3)
    .map(({ id, full_name }) => ({ id, full_name }))

  return {
    matched: false,
    plannerId: null,
    plannerName: null,
    mode: suggestions.length ? 'suggested' : 'missing',
    suggestions,
  }
}

export function validateClientImportRows(
  rows: ClientImportParsedRow[],
  planners: Pick<Profile, 'id' | 'full_name'>[],
  existingClientIds: string[] = [],
): ClientImportValidationResult {
  const errors: ClientImportError[] = []
  const warnings: ClientImportError[] = []
  const normalizedRows: ClientImportNormalizedRow[] = []
  const seenClientIds = new Map<string, number>()
  const existingSet = new Set(existingClientIds.map(id => id.trim().toLowerCase()).filter(Boolean))

  for (const row of rows) {
    const raw = row.raw

    const clientId = normalizeText(raw.client_id)
    const lastName = normalizeText(raw.last_name)
    const firstName = normalizeText(raw.first_name)

    if (!clientId) {
      errors.push({ rowNumber: row.rowNumber, column: 'client_id', message: 'Client ID is required' })
    }

    if (!lastName) {
      errors.push({ rowNumber: row.rowNumber, column: 'last_name', message: 'Last name is required' })
    }

    const category = normalizeCategory(raw.category)
    if (category.error) {
      errors.push({ rowNumber: row.rowNumber, column: 'category', message: category.error })
    }

    const normalizedClientId = clientId?.toLowerCase() ?? ''
    if (normalizedClientId) {
      if (seenClientIds.has(normalizedClientId)) {
        errors.push({
          rowNumber: row.rowNumber,
          column: 'client_id',
          message: `Duplicate client_id in file (first seen on row ${seenClientIds.get(normalizedClientId)})`,
        })
      } else {
        seenClientIds.set(normalizedClientId, row.rowNumber)
      }

      if (existingSet.has(normalizedClientId)) {
        errors.push({ rowNumber: row.rowNumber, column: 'client_id', message: 'Client ID already exists in CaseSync' })
      }
    }

    const plannerMatch = resolvePlannerByName(normalizeText(raw.assigned_to_name), planners)
    if (!plannerMatch.matched) {
      if (plannerMatch.mode === 'ambiguous') {
        errors.push({
          rowNumber: row.rowNumber,
          column: 'assigned_to_name',
          message: `Planner name is ambiguous.${plannerMatch.matches?.length ? ` Matches: ${plannerMatch.matches.map(match => match.full_name).filter(Boolean).join(', ')}` : ''}`,
        })
      } else if (plannerMatch.mode === 'suggested' && plannerMatch.suggestions?.length) {
        errors.push({
          rowNumber: row.rowNumber,
          column: 'assigned_to_name',
          message: `Planner not found. Did you mean: ${plannerMatch.suggestions.map(match => match.full_name).filter(Boolean).join(', ')}?`,
        })
      } else if (normalizeText(raw.assigned_to_name)) {
        errors.push({ rowNumber: row.rowNumber, column: 'assigned_to_name', message: 'Planner name not found' })
      }
    } else if (plannerMatch.mode === 'exact-normalized') {
      warnings.push({
        rowNumber: row.rowNumber,
        column: 'assigned_to_name',
        message: `Planner matched after normalizing spacing/punctuation: ${plannerMatch.plannerName}`,
      })
    }

    const dateValues = Object.fromEntries(
      [...DATE_FIELDS].map((field) => {
        const normalizedValue = normalizeDate(raw[field])
        if (normalizedValue.error) {
          errors.push({ rowNumber: row.rowNumber, column: field, message: normalizedValue.error })
        }
        return [field, normalizedValue.value]
      }),
    ) as Record<string, string | null>

    const booleanSpmCompleted = normalizeBoolean(raw.spm_completed)
    if (booleanSpmCompleted.error) {
      errors.push({ rowNumber: row.rowNumber, column: 'spm_completed', message: booleanSpmCompleted.error })
    }

    const booleanScheduleDocs = normalizeBoolean(raw.schedule_docs)
    if (booleanScheduleDocs.error) {
      errors.push({ rowNumber: row.rowNumber, column: 'schedule_docs', message: booleanScheduleDocs.error })
    }

    const goalPct = normalizeGoalPct(raw.goal_pct)
    if (goalPct.error) {
      errors.push({ rowNumber: row.rowNumber, column: 'goal_pct', message: goalPct.error })
    }

    const classification = normalizeClientClassification(raw.client_classification)
    if (classification.error) {
      errors.push({ rowNumber: row.rowNumber, column: 'client_classification', message: classification.error })
    }

    for (const field of TEXT_FIELDS) {
      const value = normalizeText(raw[field])
      if (value && /\s{2,}/.test(value)) {
        warnings.push({ rowNumber: row.rowNumber, column: field, message: 'Value contains extra internal spacing; saved as entered.' })
      }
    }

    if (errors.some(error => error.rowNumber === row.rowNumber)) {
      continue
    }

    normalizedRows.push({
      rowNumber: row.rowNumber,
      client_id: clientId!,
      first_name: firstName,
      last_name: lastName!,
      category: category.value!,
      eligibility_code: normalizeText(raw.eligibility_code),
      eligibility_end_date: dateValues.eligibility_end_date,
      assigned_to: plannerMatch.plannerId,
      assigned_to_name: plannerMatch.plannerName,
      assigned_to_resolution: plannerMatch.mode,
      assigned_to_suggestions: plannerMatch.suggestions,
      last_contact_date: dateValues.last_contact_date,
      last_contact_type: normalizeText(raw.last_contact_type),
      three_month_visit_date: dateValues.three_month_visit_date,
      three_month_visit_due: dateValues.three_month_visit_due,
      quarterly_waiver_date: dateValues.quarterly_waiver_date,
      drop_in_visit_date: dateValues.drop_in_visit_date,
      poc_date: dateValues.poc_date,
      loc_date: dateValues.loc_date,
      med_tech_redet_date: dateValues.med_tech_redet_date,
      med_tech_status: normalizeText(raw.med_tech_status),
      pos_deadline: dateValues.pos_deadline,
      pos_status: normalizeText(raw.pos_status),
      assessment_due: dateValues.assessment_due,
      spm_completed: booleanSpmCompleted.value,
      spm_next_due: dateValues.spm_next_due,
      foc: normalizeText(raw.foc),
      provider_forms: normalizeText(raw.provider_forms),
      signatures_needed: normalizeText(raw.signatures_needed),
      schedule_docs: booleanScheduleDocs.value,
      atp: normalizeText(raw.atp),
      snfs: normalizeText(raw.snfs),
      lease: normalizeText(raw.lease),
      reportable_events: normalizeText(raw.reportable_events),
      appeals: normalizeText(raw.appeals),
      thirty_day_letter_date: dateValues.thirty_day_letter_date,
      co_financial_redet_date: dateValues.co_financial_redet_date,
      co_app_date: dateValues.co_app_date,
      request_letter: normalizeText(raw.request_letter),
      mfp_consent_date: dateValues.mfp_consent_date,
      two57_date: dateValues.two57_date,
      doc_mdh_date: dateValues.doc_mdh_date,
      audit_review: normalizeText(raw.audit_review),
      qa_review: normalizeText(raw.qa_review),
      goal_pct: goalPct.value,
      client_classification: classification.value,
      notes: normalizeText(raw.notes),
    })
  }

  return { normalizedRows, errors, warnings }
}

export function buildClientInsertPayload(row: ClientImportNormalizedRow) {
  return {
    client_id: row.client_id,
    first_name: row.first_name,
    last_name: row.last_name,
    category: row.category,
    eligibility_code: row.eligibility_code,
    eligibility_end_date: row.eligibility_end_date,
    assigned_to: row.assigned_to,
    last_contact_date: row.last_contact_date,
    last_contact_type: row.last_contact_type,
    three_month_visit_date: row.three_month_visit_date,
    three_month_visit_due: row.three_month_visit_due,
    quarterly_waiver_date: row.quarterly_waiver_date,
    drop_in_visit_date: row.drop_in_visit_date,
    poc_date: row.poc_date,
    loc_date: row.loc_date,
    med_tech_redet_date: row.med_tech_redet_date,
    med_tech_status: row.med_tech_status,
    pos_deadline: row.pos_deadline,
    pos_status: row.pos_status,
    assessment_due: row.assessment_due,
    spm_completed: row.spm_completed,
    spm_next_due: row.spm_next_due,
    foc: row.foc,
    provider_forms: row.provider_forms,
    signatures_needed: row.signatures_needed,
    schedule_docs: row.schedule_docs,
    atp: row.atp,
    snfs: row.snfs,
    lease: row.lease,
    reportable_events: row.reportable_events,
    appeals: row.appeals,
    thirty_day_letter_date: row.thirty_day_letter_date,
    co_financial_redet_date: row.co_financial_redet_date,
    co_app_date: row.co_app_date,
    request_letter: row.request_letter,
    mfp_consent_date: row.mfp_consent_date,
    two57_date: row.two57_date,
    doc_mdh_date: row.doc_mdh_date,
    audit_review: row.audit_review,
    qa_review: row.qa_review,
    goal_pct: row.goal_pct,
    client_classification: row.client_classification ?? 'real',
  }
}

export function parseClientImportText(csvText: string, planners: Pick<Profile, 'id' | 'full_name'>[], existingClientIds: string[] = []) {
  const parsed = parseClientImportCsv(csvText)
  const validated = validateClientImportRows(parsed.rows, planners, existingClientIds)

  return {
    headers: parsed.headers,
    rows: parsed.rows,
    parseErrors: parsed.errors,
    validationErrors: validated.errors,
    warnings: validated.warnings,
    normalizedRows: validated.normalizedRows,
  }
}

export function parseDelimitedRowsToCsv(headers: string[], dataRows: string[][]): string {
  const escapeCell = (value: string) => {
    if (/[\",\n]/.test(value)) {
      return '"' + value.replace(/"/g, '""') + '"'
    }
    return value
  }

  const allRows = [headers, ...dataRows]
  return allRows.map(row => row.map(cell => escapeCell(String(cell ?? ''))).join(',')).join('\n')
}

export function buildImportIssueCsv(issues: ClientImportError[]): string {
  return parseDelimitedRowsToCsv(
    ['row_number', 'column', 'message'],
    issues.map(issue => [String(issue.rowNumber), issue.column ?? '', issue.message]),
  )
}
