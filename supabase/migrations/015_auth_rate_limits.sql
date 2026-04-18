-- Persistent auth rate limiting table
-- Replaces the in-memory rate limiter which reset on every cold start,
-- making it ineffective in Vercel's serverless environment.
--
-- Only accessible via the service role key from /api/auth/rate-limit route.
-- No RLS needed — never exposed to client-side queries.

create table if not exists public.auth_rate_limits (
  key text primary key,
  count integer not null default 1,
  reset_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists auth_rate_limits_reset_at_idx
  on public.auth_rate_limits (reset_at);

-- Periodic cleanup: delete expired records older than 1 hour
-- (Vercel cron can call a cleanup endpoint, or pg_cron if enabled)
-- For now, the route itself handles expiry logic inline.
