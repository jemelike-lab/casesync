-- 063 — Appeal decision clock (Josh 08-05 follow-up, thresholds confirmed):
-- decision due = earliest of hearing + 14d, received + 90d (42 CFR 431.244
-- fair-hearing clock), or appeal_status_changed_at + 90d when neither date
-- exists. Past due => "Confirm appeal outcome" flagged item; past due + 14d
-- grace => appeal gating EXPIRES and POS items return to critical scoring.
--
-- appeal_status_changed_at is server-stamped in the PATCH route on any
-- transition into an active status, cleared on 'none'. Backfilled to today
-- for every appeal already active (including legacy pos_status 'Appealing')
-- so no appeal is ever without an anchor: worst case is bounded at 90 + 14
-- days from this migration.
-- APPLY TO BOTH PLANES: Azure (PHI, production) and Supabase (mirror).

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS appeal_status_changed_at date;

UPDATE public.clients
SET appeal_status_changed_at = CURRENT_DATE
WHERE appeal_status_changed_at IS NULL
  AND appeal_received_date IS NULL
  AND appeal_hearing_date IS NULL
  AND (
    appeal_status IN ('filed', 'received', 'hearing_scheduled')
    OR lower(coalesce(pos_status, '')) = 'appealing'
  );
