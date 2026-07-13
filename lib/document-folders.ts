/**
 * lib/document-folders.ts — single source of truth for the client-document
 * taxonomy (2026-07-12 file-organization build).
 *
 * Previously ALLOWED_CATEGORIES / the folder mapping were duplicated across
 * components/ClientFiles.tsx, app/api/sharepoint/upload/route.ts and
 * app/api/clients/[id]/files/route.ts — three copies that could drift.
 * Every producer and consumer of `client_documents.category` now imports
 * from here. The Azure CHECK constraint on client_documents.category and
 * supabase/migrations/042 enforce the same set at the database layer.
 *
 * Pure constants only — safe to import from both server routes and
 * 'use client' components.
 */

/** Every category value the DB accepts (7 folder-aligned + legacy values). */
export const ALLOWED_CATEGORY_VALUES = [
  'general', 'consent_form', 'assessment', 'letter', 'authorization',
  'intake', 'plan', 'correspondence', 'medical', 'financial', 'ltss', 'other',
  'co', 'forms_signatures', 'reporting_review',
] as const

export const ALLOWED_CATEGORIES = new Set<string>(ALLOWED_CATEGORY_VALUES)

/** Display labels for every category value that may appear on a row — legacy
 *  human values, the bot's `ltss`, and the folder-aligned values. Existing
 *  rows keep their original granular label; only the upload picker is
 *  narrowed to the seven folders. */
export const CATEGORY_LABELS: Record<string, string> = {
  general: 'General',
  intake: 'Intake',
  plan: 'Plan',
  assessment: 'Assessment',
  consent_form: 'Consent Form',
  letter: 'Letter',
  authorization: 'Authorization',
  correspondence: 'Correspondence',
  medical: 'Medical',
  financial: 'Financial',
  other: 'Other',
  ltss: 'LTSS',
  co: 'CO',
  forms_signatures: 'Forms & Signatures',
  reporting_review: 'Reporting & Reviews',
}

/** Options the upload picker offers — 1:1 with the seven file folders. */
export const UPLOAD_CATEGORIES = [
  { value: 'intake',           label: 'Intake' },
  { value: 'co',               label: 'CO' },
  { value: 'plan',             label: 'Plans' },
  { value: 'forms_signatures', label: 'Forms & Signatures' },
  { value: 'authorization',    label: 'Authorizations' },
  { value: 'reporting_review', label: 'Reporting & Reviews' },
  { value: 'other',            label: 'Other' },
]

/** File folders shown in the Client Files accordion (and the /documents
 *  completeness matrix), in display order. Every category value resolves to
 *  exactly one folder via folderOf(); anything unmapped falls through to
 *  Other. */
export const FILE_FOLDERS: { key: string; label: string }[] = [
  { key: 'intake',           label: 'Intake' },
  { key: 'co',               label: 'CO' },
  { key: 'plan',             label: 'Plans' },
  { key: 'forms_signatures', label: 'Forms & Signatures' },
  { key: 'authorization',    label: 'Authorizations' },
  { key: 'reporting_review', label: 'Reporting & Reviews' },
  { key: 'other',            label: 'Other' },
]

export const FOLDER_KEYS = new Set(FILE_FOLDERS.map(f => f.key))

export const FOLDER_LABELS: Record<string, string> = Object.fromEntries(
  FILE_FOLDERS.map(f => [f.key, f.label])
)

/** category value -> folder key (the approved Batch 3 mapping). */
export const CATEGORY_TO_FOLDER: Record<string, string> = {
  intake: 'intake',
  co: 'co',
  plan: 'plan',
  assessment: 'plan',
  forms_signatures: 'forms_signatures',
  consent_form: 'forms_signatures',
  authorization: 'authorization',
  reporting_review: 'reporting_review',
  correspondence: 'reporting_review',
  letter: 'reporting_review',
  other: 'other',
  general: 'other',
  medical: 'other',
  financial: 'other',
  ltss: 'other',
}

export function folderOf(category: string): string {
  return CATEGORY_TO_FOLDER[category] ?? 'other'
}
