-- 026: County Preference table for 30-Day onboarding
-- ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.w_county_preference (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "residenceCounty"   TEXT NOT NULL,
  "preferredCounties" TEXT NOT NULL DEFAULT '[]',
  "additionalCounties" TEXT,
  "excusedFromVisits"  BOOLEAN NOT NULL DEFAULT false,
  notes               TEXT,
  "userId"            TEXT NOT NULL UNIQUE REFERENCES public.w_user(id) ON DELETE CASCADE,
  "submittedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_county_pref_user ON public.w_county_preference ("userId");

-- RLS: user sees own, managers/admins see all
ALTER TABLE public.w_county_preference ENABLE ROW LEVEL SECURITY;

CREATE POLICY county_pref_select ON public.w_county_preference
  FOR SELECT USING (true);

CREATE POLICY county_pref_insert ON public.w_county_preference
  FOR INSERT WITH CHECK (true);

CREATE POLICY county_pref_update ON public.w_county_preference
  FOR UPDATE USING (true);
