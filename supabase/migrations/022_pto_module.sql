-- Migration: 022_pto_module.sql
-- PTO Module: types, balances, requests, Intuit employee mapping, Intuit connection

-- ── PTO Types ──
CREATE TABLE IF NOT EXISTS public.w_pto_type (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  color TEXT NOT NULL DEFAULT '#2563eb',
  icon TEXT NOT NULL DEFAULT 'umbrella',
  "accrualRate" FLOAT NOT NULL DEFAULT 0,
  "maxAccrual" FLOAT NOT NULL DEFAULT 0,
  "requiresDoc" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INT NOT NULL DEFAULT 0,
  "excludeFromPayroll" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── PTO Balances ──
CREATE TABLE IF NOT EXISTS public.w_pto_balance (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL REFERENCES public.w_user(id) ON DELETE CASCADE,
  "typeId" TEXT NOT NULL REFERENCES public.w_pto_type(id),
  accrued FLOAT NOT NULL DEFAULT 0,
  used FLOAT NOT NULL DEFAULT 0,
  pending FLOAT NOT NULL DEFAULT 0,
  adjustment FLOAT NOT NULL DEFAULT 0,
  "periodStart" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE("userId", "typeId")
);

-- ── PTO Requests ──
CREATE TABLE IF NOT EXISTS public.w_pto_request (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL REFERENCES public.w_user(id) ON DELETE CASCADE,
  "typeId" TEXT NOT NULL REFERENCES public.w_pto_type(id),
  "startDate" TIMESTAMPTZ NOT NULL,
  "endDate" TIMESTAMPTZ NOT NULL,
  "totalHours" FLOAT NOT NULL,
  "isHalfDay" BOOLEAN NOT NULL DEFAULT false,
  "halfDayPeriod" TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  "reviewedById" TEXT REFERENCES public.w_user(id),
  "reviewedAt" TIMESTAMPTZ,
  "reviewNote" TEXT,
  "documentUrl" TEXT,
  "documentName" TEXT,
  "intuitSynced" BOOLEAN NOT NULL DEFAULT false,
  "intuitSyncedAt" TIMESTAMPTZ,
  "intuitTimeActivityId" TEXT,
  "intuitSyncError" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Intuit Employee Mapping ──
CREATE TABLE IF NOT EXISTS public.w_intuit_employee_map (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT UNIQUE NOT NULL REFERENCES public.w_user(id) ON DELETE CASCADE,
  "intuitEmployeeId" TEXT NOT NULL,
  "intuitDisplayName" TEXT,
  "intuitEmail" TEXT,
  "syncStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
  "lastSyncedAt" TIMESTAMPTZ,
  "lastSyncError" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Intuit OAuth Connection ──
CREATE TABLE IF NOT EXISTS public.w_intuit_connection (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "realmId" TEXT UNIQUE NOT NULL,
  "accessToken" TEXT NOT NULL,
  "refreshToken" TEXT NOT NULL,
  "tokenExpiresAt" TIMESTAMPTZ NOT NULL,
  "companyName" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes ──
CREATE INDEX IF NOT EXISTS idx_pto_balance_user ON public.w_pto_balance("userId");
CREATE INDEX IF NOT EXISTS idx_pto_request_user ON public.w_pto_request("userId");
CREATE INDEX IF NOT EXISTS idx_pto_request_status ON public.w_pto_request(status);
CREATE INDEX IF NOT EXISTS idx_pto_request_dates ON public.w_pto_request("startDate", "endDate");
CREATE INDEX IF NOT EXISTS idx_pto_request_reviewer ON public.w_pto_request("reviewedById");
CREATE INDEX IF NOT EXISTS idx_intuit_map_employee ON public.w_intuit_employee_map("intuitEmployeeId");

-- ── RLS ──
ALTER TABLE public.w_pto_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.w_pto_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.w_pto_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.w_intuit_employee_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.w_intuit_connection ENABLE ROW LEVEL SECURITY;

-- PTO Types: all authenticated can read
CREATE POLICY "pto_type_select" ON public.w_pto_type FOR SELECT TO authenticated USING (true);
CREATE POLICY "pto_type_manage" ON public.w_pto_type FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.w_user WHERE id = auth.uid()::text AND role IN ('SUPERVISOR','OWNER','ADMIN'))
);

-- PTO Balances: own row or manager/supervisor
CREATE POLICY "pto_balance_own" ON public.w_pto_balance FOR SELECT TO authenticated USING (
  "userId" = auth.uid()::text
);
CREATE POLICY "pto_balance_manager" ON public.w_pto_balance FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.w_user WHERE id = auth.uid()::text AND role IN ('TEAM_MANAGER','SUPERVISOR','OWNER','ADMIN'))
);
CREATE POLICY "pto_balance_manage" ON public.w_pto_balance FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.w_user WHERE id = auth.uid()::text AND role IN ('SUPERVISOR','OWNER','ADMIN'))
);

-- PTO Requests: own or manager/supervisor
CREATE POLICY "pto_request_own" ON public.w_pto_request FOR SELECT TO authenticated USING (
  "userId" = auth.uid()::text
);
CREATE POLICY "pto_request_manager" ON public.w_pto_request FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.w_user WHERE id = auth.uid()::text AND role IN ('TEAM_MANAGER','SUPERVISOR','OWNER','ADMIN'))
);
CREATE POLICY "pto_request_create" ON public.w_pto_request FOR INSERT TO authenticated WITH CHECK (
  "userId" = auth.uid()::text
);
CREATE POLICY "pto_request_manage" ON public.w_pto_request FOR UPDATE TO authenticated USING (
  "userId" = auth.uid()::text OR
  EXISTS (SELECT 1 FROM public.w_user WHERE id = auth.uid()::text AND role IN ('TEAM_MANAGER','SUPERVISOR','OWNER','ADMIN'))
);

-- Intuit mapping: supervisor+ only
CREATE POLICY "intuit_map_read" ON public.w_intuit_employee_map FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.w_user WHERE id = auth.uid()::text AND role IN ('SUPERVISOR','OWNER','ADMIN'))
);
CREATE POLICY "intuit_map_manage" ON public.w_intuit_employee_map FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.w_user WHERE id = auth.uid()::text AND role IN ('SUPERVISOR','OWNER','ADMIN'))
);

-- Intuit connection: supervisor+ only
CREATE POLICY "intuit_conn_read" ON public.w_intuit_connection FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.w_user WHERE id = auth.uid()::text AND role IN ('SUPERVISOR','OWNER','ADMIN'))
);
CREATE POLICY "intuit_conn_manage" ON public.w_intuit_connection FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.w_user WHERE id = auth.uid()::text AND role IN ('SUPERVISOR','OWNER','ADMIN'))
);

-- ── Seed default PTO types ──
INSERT INTO public.w_pto_type (id, name, code, color, icon, "accrualRate", "maxAccrual", "requiresDoc", "sortOrder", "excludeFromPayroll")
VALUES
  (gen_random_uuid()::text, 'Vacation',          'VACATION',          '#2563eb', 'umbrella',     2.0, 64, false, 1, false),
  (gen_random_uuid()::text, 'Sick',              'SICK',              '#ef4444', 'thermometer',  2.0, 55, false, 2, false),
  (gen_random_uuid()::text, 'Personal',          'PERSONAL',          '#8b5cf6', 'user',         0,   16, false, 3, false),
  (gen_random_uuid()::text, 'FMLA',              'FMLA',              '#f59e0b', 'file-text',    0,    0, true,  4, false),
  (gen_random_uuid()::text, 'Bereavement',       'BEREAVEMENT',       '#6b7280', 'heart',        0,   24, true,  5, false),
  (gen_random_uuid()::text, 'Billing Extension', 'BILLING_EXTENSION', '#0891b2', 'clock',        0,    0, false, 6, true)
ON CONFLICT (code) DO NOTHING;
