-- Migration 029: time-clock race-condition + duplicate index cleanup (2026-05-22)
--
-- Two follow-on items from the live-DB inventory:
--   1. The clock-in route uses find-then-create to enforce "one active entry
--      per user" — TOCTOU race if two requests arrive in the same tick. Add
--      a partial unique index that doubles as a query-acceleration index for
--      the find-active-entry lookup.
--   2. Several Workryn tables have duplicate single-column indexes
--      (one snake_case from a hand-written migration, one camelCase that
--      Prisma created). Drop the snake_case duplicates — keep the names
--      Prisma's introspection expects.

-- ── 1. Race-safe "one active entry per user" guard ───────────────────────────
-- Postgres partial unique indexes are the canonical way to express this.
-- The clock-in route will now get a 23505 unique-violation if two requests
-- race, which Prisma surfaces as P2002 — the existing 409 conflict handler
-- can be extended to catch that. Index also speeds the active-entry lookup
-- that runs on every clock-in / clock-out / status / break call.
CREATE UNIQUE INDEX IF NOT EXISTS w_time_entry_one_active_per_user
  ON public.w_time_entry ("userId")
  WHERE status = 'ACTIVE';

-- ── 2. Drop duplicate indexes ────────────────────────────────────────────────
-- Each pair below: keep the Prisma-introspection-compatible name, drop the
-- hand-rolled duplicate. All are non-unique single-column indexes.
DROP INDEX IF EXISTS public.idx_w_user_supabase_id;     -- dup of w_user_supabaseId_key (UNIQUE)
DROP INDEX IF EXISTS public.idx_w_time_entry_user;      -- dup of w_time_entry_userId_idx
DROP INDEX IF EXISTS public.idx_w_task_assigned;        -- dup of w_task_assignedToId_idx
DROP INDEX IF EXISTS public.idx_w_ticket_assigned;      -- dup of w_ticket_assignedToId_idx
DROP INDEX IF EXISTS public.idx_w_task_status;          -- dup of w_task_status_idx
DROP INDEX IF EXISTS public.idx_w_ticket_status;        -- dup of w_ticket_status_idx
DROP INDEX IF EXISTS public.audit_logs_action_idx;      -- subsumed by audit_logs_action_created_at_idx
