-- 065 — 'denial' joins the client_documents category taxonomy.
--
-- Megan 08-07: a POS denial notice had nowhere to be filed. The appeal
-- letter had a category ('appeal') but the denial that triggers the appeal
-- did not, so planners either mis-filed it under Other or gave up. The
-- Appeal card now offers "Upload denial letter" / "Upload appeal letter"
-- buttons that preselect these categories; this widens the DB constraint
-- so those uploads are accepted.
--
-- Mirrors lib/document-folders.ts ALLOWED_CATEGORY_VALUES. 'denial' maps to
-- the Plans folder, alongside 'appeal'.
--
-- APPLY TO BOTH PLANES (Azure PHI plane + Supabase mirror).

ALTER TABLE public.client_documents DROP CONSTRAINT IF EXISTS client_documents_category_check;
ALTER TABLE public.client_documents ADD CONSTRAINT client_documents_category_check
  CHECK (category IN (
    'general','consent_form','assessment','letter','authorization',
    'intake','plan','correspondence','medical','financial','ltss','other',
    'co','forms_signatures','reporting_review','waiver','snf','appeal',
    'denial'
  ));
