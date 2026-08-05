-- 062 — POS appeals metadata, Med Tech date, pending-CO application source,
-- and the Appeal Letter document category.
-- Megan 08-05 spec, Josh-confirmed 08-05 (LTC codes L01/L98/L99; appeal-gated
-- items stay flagged but never critical).
-- APPLY TO BOTH PLANES: Azure (PHI, production) and Supabase (mirror).

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS appeal_status text,
  ADD COLUMN IF NOT EXISTS appeal_received_date date,
  ADD COLUMN IF NOT EXISTS appeal_hearing_date date,
  ADD COLUMN IF NOT EXISTS appeal_decision_date date,
  ADD COLUMN IF NOT EXISTS services_continuing_during_appeal boolean,
  ADD COLUMN IF NOT EXISTS services_continuing_source text,
  ADD COLUMN IF NOT EXISTS med_tech_date date,
  ADD COLUMN IF NOT EXISTS co_application_source text;

ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_appeal_status_check;
ALTER TABLE public.clients ADD CONSTRAINT clients_appeal_status_check
  CHECK (appeal_status IS NULL OR appeal_status IN ('none','filed','received','hearing_scheduled','decision_issued'));

ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_co_application_source_check;
ALTER TABLE public.clients ADD CONSTRAINT clients_co_application_source_check
  CHECK (co_application_source IS NULL OR co_application_source IN ('community','nursing_facility'));

-- client_documents.category: widen with 'appeal'. The full allowed set mirrors
-- ALLOWED_CATEGORY_VALUES in lib/document-folders.ts — keep the two in sync.
ALTER TABLE public.client_documents DROP CONSTRAINT IF EXISTS client_documents_category_check;
ALTER TABLE public.client_documents ADD CONSTRAINT client_documents_category_check
  CHECK (category IN (
    'general','consent_form','assessment','letter','authorization',
    'intake','plan','correspondence','medical','financial','ltss','other',
    'co','forms_signatures','reporting_review','waiver','snf','appeal'
  ));
