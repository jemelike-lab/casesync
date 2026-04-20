-- 017: Trigram search indexes + deadline indexes + audit_exports for 5,000+ client scale

-- Enable trigram extension (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram indexes for the columns used in /api/clients search
CREATE INDEX IF NOT EXISTS idx_clients_last_name_trgm
  ON clients USING gin (lower(last_name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_clients_first_name_trgm
  ON clients USING gin (lower(first_name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_clients_client_id_trgm
  ON clients USING gin (lower(client_id) gin_trgm_ops);

-- Composite index for the most common dashboard query pattern
CREATE INDEX IF NOT EXISTS idx_clients_active_assigned_name
  ON clients (is_active, assigned_to, last_name, first_name)
  WHERE is_active = true;

-- Deadline/date indexes for calendar and overdue filtering
CREATE INDEX IF NOT EXISTS idx_clients_active_last_contact
  ON clients (is_active, last_contact_date) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_clients_active_eligibility_end
  ON clients (is_active, eligibility_end_date) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_clients_active_co_app
  ON clients (is_active, co_app_date) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_clients_active_loc
  ON clients (is_active, loc_date) WHERE is_active = true;

-- Audit exports table — tracks who exported what data and when
CREATE TABLE IF NOT EXISTS audit_exports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  export_type text NOT NULL, -- 'clients_csv', 'overdue_report', etc.
  filter_params jsonb DEFAULT '{}',
  row_count integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- RLS on audit_exports: only supervisors can read, authenticated can insert own
ALTER TABLE audit_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own export records"
  ON audit_exports FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Supervisors can read all export records"
  ON audit_exports FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('supervisor', 'it')
    )
  );

-- Rate limit table for AI endpoints
CREATE TABLE IF NOT EXISTS ai_rate_limits (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  endpoint text NOT NULL, -- '/api/blhbot', '/api/case-ai'
  request_count integer NOT NULL DEFAULT 1,
  window_start timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, endpoint, window_start)
);

CREATE INDEX IF NOT EXISTS idx_ai_rate_limits_lookup
  ON ai_rate_limits (user_id, endpoint, window_start DESC);
