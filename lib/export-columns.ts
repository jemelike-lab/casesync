/**
 * PHI-safe column allowlists for CSV exports.
 *
 * HIPAA requires that downloadable exports exclude Protected Health Information
 * unless the export is explicitly labeled as a PHI export and the user has the
 * appropriate role.  These constants ensure we never accidentally SELECT * and
 * leak identifiers into a CSV file.
 *
 * PHI columns (NEVER include in standard exports):
 *   - first_name
 *   - last_name
 *   - client_id   (MA number / state identifier)
 *   - eligibility_code
 *
 * If a future feature requires PHI in a download, create a separate
 * PHI_EXPORT_COLUMNS list, gate it behind supervisor + MFA, and log the
 * export with `export_type: 'clients_csv_phi'` in audit_exports.
 */

// ── Standard (de-identified) export ──────────────────────────────────────────

/** Supabase select string – safe for any role */
export const SAFE_EXPORT_SELECT = `
  id, category, eligibility_end_date, assigned_to,
  last_contact_date, last_contact_type,
  goal_pct, pos_status, assessment_due, spm_next_due,
  three_month_visit_due, quarterly_waiver_date,
  med_tech_redet_date, pos_deadline,
  thirty_day_letter_date, co_financial_redet_date,
  co_app_date, mfp_consent_date, two57_date, doc_mdh_date,
  loc_date, drop_in_visit_date,
  is_active, client_classification,
  profiles!clients_assigned_to_fkey(full_name)
`.replace(/\n/g, ' ').trim()

/** CSV header row – matches the order returned by SAFE_EXPORT_SELECT */
export const SAFE_EXPORT_HEADERS = [
  'Record ID',
  'Category',
  'Eligibility End Date',
  'Assigned To',
  'Last Contact Date',
  'Last Contact Type',
  'Goal %',
  'POS Status',
  'Assessment Due',
  'SPM Next Due',
  'Three-Month Visit Due',
  'Quarterly Waiver Date',
  'Med Tech Redet Date',
  'POS Deadline',
  'Thirty-Day Letter Date',
  'CO Financial Redet Date',
  'CO App Date',
  'MFP Consent Date',
  '257 Date',
  'Doc MDH Date',
  'LOC Date',
  'Drop-In Visit Date',
  'Active',
  'Classification',
]

/** Map a row from the safe select into an ordered array of CSV values */
export function safeRowToCSV(client: any): string[] {
  const assignee =
    (Array.isArray(client.profiles)
      ? client.profiles[0]?.full_name
      : client.profiles?.full_name) ?? 'Unassigned'

  return [
    client.id ?? '',
    client.category ?? '',
    client.eligibility_end_date ?? '',
    assignee,
    client.last_contact_date ?? '',
    client.last_contact_type ?? '',
    String(client.goal_pct ?? ''),
    client.pos_status ?? '',
    client.assessment_due ?? '',
    client.spm_next_due ?? '',
    client.three_month_visit_due ?? '',
    client.quarterly_waiver_date ?? '',
    client.med_tech_redet_date ?? '',
    client.pos_deadline ?? '',
    client.thirty_day_letter_date ?? '',
    client.co_financial_redet_date ?? '',
    client.co_app_date ?? '',
    client.mfp_consent_date ?? '',
    client.two57_date ?? '',
    client.doc_mdh_date ?? '',
    client.loc_date ?? '',
    client.drop_in_visit_date ?? '',
    client.is_active ? 'Yes' : 'No',
    client.client_classification ?? '',
  ]
}

// ── PHI export (supervisor-only, MFA required) ───────────────────────────────

/** Supabase select string – includes PHI, supervisor-gated */
export const PHI_EXPORT_SELECT = `
  id, client_id, first_name, last_name,
  category, eligibility_code, eligibility_end_date, assigned_to,
  last_contact_date, last_contact_type,
  goal_pct, pos_status, assessment_due, spm_next_due,
  three_month_visit_due, quarterly_waiver_date,
  med_tech_redet_date, pos_deadline,
  thirty_day_letter_date, co_financial_redet_date,
  co_app_date, mfp_consent_date, two57_date, doc_mdh_date,
  loc_date, drop_in_visit_date,
  is_active, client_classification,
  profiles!clients_assigned_to_fkey(full_name)
`.replace(/\n/g, ' ').trim()

export const PHI_EXPORT_HEADERS = [
  'Record ID',
  'Client ID',
  'First Name',
  'Last Name',
  'Category',
  'Eligibility Code',
  'Eligibility End Date',
  'Assigned To',
  'Last Contact Date',
  'Last Contact Type',
  'Goal %',
  'POS Status',
  'Assessment Due',
  'SPM Next Due',
  'Three-Month Visit Due',
  'Quarterly Waiver Date',
  'Med Tech Redet Date',
  'POS Deadline',
  'Thirty-Day Letter Date',
  'CO Financial Redet Date',
  'CO App Date',
  'MFP Consent Date',
  '257 Date',
  'Doc MDH Date',
  'LOC Date',
  'Drop-In Visit Date',
  'Active',
  'Classification',
]

export function phiRowToCSV(client: any): string[] {
  const assignee =
    (Array.isArray(client.profiles)
      ? client.profiles[0]?.full_name
      : client.profiles?.full_name) ?? 'Unassigned'

  return [
    client.id ?? '',
    client.client_id ?? '',
    client.first_name ?? '',
    client.last_name ?? '',
    client.category ?? '',
    client.eligibility_code ?? '',
    client.eligibility_end_date ?? '',
    assignee,
    client.last_contact_date ?? '',
    client.last_contact_type ?? '',
    String(client.goal_pct ?? ''),
    client.pos_status ?? '',
    client.assessment_due ?? '',
    client.spm_next_due ?? '',
    client.three_month_visit_due ?? '',
    client.quarterly_waiver_date ?? '',
    client.med_tech_redet_date ?? '',
    client.pos_deadline ?? '',
    client.thirty_day_letter_date ?? '',
    client.co_financial_redet_date ?? '',
    client.co_app_date ?? '',
    client.mfp_consent_date ?? '',
    client.two57_date ?? '',
    client.doc_mdh_date ?? '',
    client.loc_date ?? '',
    client.drop_in_visit_date ?? '',
    client.is_active ? 'Yes' : 'No',
    client.client_classification ?? '',
  ]
}
