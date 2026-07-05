-- Claim-based dedupe for the /api/check-deadlines cron.
-- The cron "claims" a key via INSERT ... ON CONFLICT DO NOTHING before acting
-- (in-app notification, alert email, manager escalation, digest). A key that is
-- already present means the action already happened today — replaces the old
-- read-back body-matching dedupe, which silently capped at 1000 rows/day and
-- never matched for emails. Service-role only (RLS on, no policies).
-- Applied to iiqttbpaufzlinbufsdx via Supabase MCP on 2026-07-04.
create table if not exists public.cron_dedupe (
  key text primary key,
  created_at timestamptz not null default now()
);

alter table public.cron_dedupe enable row level security;

create index if not exists cron_dedupe_created_at_idx
  on public.cron_dedupe (created_at);

comment on table public.cron_dedupe is
  'Idempotency claims for scheduled jobs (check-deadlines). Keys are pruned after 7 days by the cron itself. No PHI: keys contain uuids, field names, and dates only.';
