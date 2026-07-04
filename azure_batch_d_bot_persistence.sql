-- azure_batch_d_bot_persistence.sql
-- Batch D: durable BLH Bot storage on the Azure PHI plane.
--
-- Run in Azure Cloud Shell as Jemelike@blhnurses.com:
--   export PGPASSWORD=$(az account get-access-token --resource-type oss-rdbms --query accessToken -o tsv)
--   psql "host=blh-casesync-prod.postgres.database.azure.com dbname=casesync user=Jemelike@blhnurses.com sslmode=require" -f azure_batch_d_bot_persistence.sql
--
-- Bot conversations contain client PHI (names, dates, note excerpts), so they
-- live on Azure — NOT Supabase. All app access goes through withRlsContext()
-- (SET ROLE authenticated + app.user_id), so every policy below targets the
-- `authenticated` role and the auth.uid() shim.
--
-- Privacy model:
--   * bot_conversations / bot_messages: OWNER-ONLY. Nobody — not even a
--     supervisor — can read another user's bot chats.
--   * bot_feedback: owner can write/read; elevated roles (supervisor, it,
--     administrator — mirroring isSupervisorLike) can READ all feedback, via a
--     denormalized message_excerpt, WITHOUT gaining access to the underlying
--     conversation.
--
-- Perf notes (per the RLS load-test learning):
--   * user_id is denormalized onto bot_messages so the hot-path USING clause is
--     a single indexed column compare — no per-row join.
--   * every auth.uid()/subquery in a policy is wrapped in (SELECT ...) to force
--     InitPlan evaluation.

\pset pager off

BEGIN;

-- ── Tables ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bot_conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  title       text NOT NULL DEFAULT 'New conversation',
  client_uuid uuid NULL,           -- client-page context at creation (informational; no FK so client deletion never breaks chat history)
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bot_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.bot_conversations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL,  -- denormalized owner for cheap RLS
  role            text NOT NULL CHECK (role IN ('user', 'assistant')),
  content         text NOT NULL,
  meta            jsonb NULL,     -- e.g. { tools_used: [...], proposal: {...} } — audit value only, never re-rendered as actionable
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bot_feedback (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id      uuid NOT NULL REFERENCES public.bot_messages(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  user_id         uuid NOT NULL,
  rating          smallint NOT NULL CHECK (rating IN (-1, 1)),
  comment         text NULL CHECK (comment IS NULL OR length(comment) <= 500),
  message_excerpt text NULL,      -- first ~400 chars of the rated assistant message, so admins can review feedback without opening conversations
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)    -- one rating per message per user; app upserts on conflict
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS bot_conversations_user_updated_idx
  ON public.bot_conversations (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS bot_messages_conversation_created_idx
  ON public.bot_messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS bot_messages_user_idx
  ON public.bot_messages (user_id);
CREATE INDEX IF NOT EXISTS bot_feedback_created_idx
  ON public.bot_feedback (created_at DESC);

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- FORCE is safe/free here: the app never connects as the table owner.

ALTER TABLE public.bot_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_conversations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.bot_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE public.bot_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_feedback FORCE ROW LEVEL SECURITY;

-- Conversations: strictly owner-only.
DROP POLICY IF EXISTS bot_conversations_owner_all ON public.bot_conversations;
CREATE POLICY bot_conversations_owner_all ON public.bot_conversations
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- Messages: owner-only reads via the denormalized column (indexed, no join).
-- WITH CHECK additionally proves the target conversation is the caller's own,
-- so a spoofed conversation_id can never attach messages to someone else's
-- thread (defense in depth on top of the app-level ownership check).
DROP POLICY IF EXISTS bot_messages_owner_all ON public.bot_messages;
CREATE POLICY bot_messages_owner_all ON public.bot_messages
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.bot_conversations c
      WHERE c.id = conversation_id
        AND c.user_id = (SELECT auth.uid())
    )
  );

-- Feedback: owner writes; owner OR elevated roles read.
-- Deliberately NOT public.is_supervisor() — that helper only matches
-- 'supervisor'; app-level isSupervisorLike also includes 'it' and
-- 'administrator', and feedback review should match the app gate exactly.
DROP POLICY IF EXISTS bot_feedback_owner_insert ON public.bot_feedback;
CREATE POLICY bot_feedback_owner_insert ON public.bot_feedback
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.bot_messages m
      WHERE m.id = message_id
        AND m.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS bot_feedback_owner_update ON public.bot_feedback;
CREATE POLICY bot_feedback_owner_update ON public.bot_feedback
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS bot_feedback_read_own_or_elevated ON public.bot_feedback;
CREATE POLICY bot_feedback_read_own_or_elevated ON public.bot_feedback
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (SELECT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('supervisor', 'it', 'administrator')
    ))
  );

-- ── Grants ────────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.bot_conversations, public.bot_messages, public.bot_feedback
  TO authenticated;

COMMIT;

-- ── Verify ────────────────────────────────────────────────────────────────────

\echo '[V1] Tables present (EXPECT: 3 rows):'
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND tablename IN ('bot_conversations', 'bot_messages', 'bot_feedback')
ORDER BY tablename;

\echo '[V2] Policies (EXPECT: 5 rows):'
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename LIKE 'bot\_%'
ORDER BY tablename, policyname;

\echo '[V3] RLS round-trip as authenticated (EXPECT: insert/select own = 1, cross-user select = 0):'
BEGIN;
SET ROLE authenticated;
SELECT set_config('app.user_id', 'ced7dfd5-23c3-4609-b573-c69ac2bca689', true) AS acting_as;
INSERT INTO public.bot_conversations (user_id, title)
VALUES ('ced7dfd5-23c3-4609-b573-c69ac2bca689', 'RLS smoke test') RETURNING id;
SELECT count(*) AS my_rows FROM public.bot_conversations WHERE title = 'RLS smoke test';
SELECT set_config('app.user_id', 'b6b4b398-d0a4-4b5b-a6ca-83419b12eccb', true) AS acting_as;
SELECT count(*) AS other_user_sees FROM public.bot_conversations WHERE title = 'RLS smoke test';
RESET ROLE;
ROLLBACK;  -- smoke rows discarded

\echo '[DONE] Batch D bot persistence DDL complete.'
