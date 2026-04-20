-- 017: Trigram search indexes for 5,000+ client scale
-- Enables fast ILIKE / similarity searches on client name and ID fields

-- Enable trigram extension (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram indexes for the columns used in /api/clients search
CREATE INDEX IF NOT EXISTS idx_clients_last_name_trgm
  ON clients USING gin (lower(last_name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_clients_first_name_trgm
  ON clients USING gin (lower(first_name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_clients_client_id_trgm
  ON clients USING gin (lower(client_id) gin_trgm_ops);

-- Composite index for the most common dashboard query pattern:
-- active clients, scoped by planner, sorted by name
CREATE INDEX IF NOT EXISTS idx_clients_active_assigned_name
  ON clients (is_active, assigned_to, last_name, first_name)
  WHERE is_active = true;

-- Index for overdue/deadline filtering (date range scans)
CREATE INDEX IF NOT EXISTS idx_clients_active_next_deadline
  ON clients (is_active, next_contact_date)
  WHERE is_active = true;

-- Index for calendar date-range queries across multiple deadline columns
CREATE INDEX IF NOT EXISTS idx_clients_active_eligibility_end
  ON clients (is_active, eligibility_end_date)
  WHERE is_active = true;
