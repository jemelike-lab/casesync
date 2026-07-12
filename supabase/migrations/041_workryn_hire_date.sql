-- 041: Workryn hire date (2026-07-12 audit, P0-6)
-- Milestone/evaluation math previously used w_user."createdAt" (account
-- creation) as the hire date, which makes every invited long-tenured employee
-- a "day-0 hire" at go-live. hireDate is admin-set and nullable; consumers
-- fall back to createdAt (effectiveHireDate in lib/workryn/permissions.ts).
ALTER TABLE public.w_user ADD COLUMN IF NOT EXISTS "hireDate" timestamp(3);
COMMENT ON COLUMN public.w_user."hireDate" IS
  'Actual employment start date (admin-set). Milestone math uses hireDate ?? createdAt.';
