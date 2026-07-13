-- 042: CHECK constraint on client_documents.category (2026-07-12
-- file-organization build).
--
-- Category validation previously lived only in the API routes; this makes
-- the database itself reject anything outside the taxonomy so no future
-- code path, integration, or manual insert can file a document the folder
-- accordion can't place. The value list mirrors
-- lib/document-folders.ts ALLOWED_CATEGORY_VALUES exactly — update both
-- together. The same constraint is applied to the Azure production table
-- (the authoritative copy) via the admin SQL workflow.

ALTER TABLE public.client_documents
  DROP CONSTRAINT IF EXISTS client_documents_category_check;

ALTER TABLE public.client_documents
  ADD CONSTRAINT client_documents_category_check CHECK (category IN (
    'general', 'consent_form', 'assessment', 'letter', 'authorization',
    'intake', 'plan', 'correspondence', 'medical', 'financial', 'ltss', 'other',
    'co', 'forms_signatures', 'reporting_review'
  ));
