-- rbac-scanner-service owns this schema. Lives in the same RDS Postgres
-- instance as core-api / report-service, logically separated by schema
-- (not a separate database) per the agreed data-ownership split.
--
-- workspace_id is NOT a foreign key to core-api's workspaces table — schemas
-- are isolated, no cross-schema FKs. core-api verifies workspace ownership
-- before calling this service; this table just stores the id it's given.

CREATE SCHEMA IF NOT EXISTS scanner;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS scanner.scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  cluster_name TEXT NOT NULL,
  scan_data JSONB NOT NULL,
  totals JSONB NOT NULL DEFAULT '{"subjects": 0, "roles": 0, "bindings": 0}'::jsonb,
  risk_counts JSONB NOT NULL DEFAULT '{"critical": 0, "high": 0, "medium": 0, "low": 0}'::jsonb,
  is_summary_mode BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scanner_scans_workspace_id ON scanner.scans(workspace_id);
CREATE INDEX IF NOT EXISTS idx_scanner_scans_workspace_cluster ON scanner.scans(workspace_id, cluster_name, created_at DESC);

CREATE OR REPLACE FUNCTION scanner.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_scanner_scans_updated_at ON scanner.scans;
CREATE TRIGGER set_scanner_scans_updated_at
  BEFORE UPDATE ON scanner.scans
  FOR EACH ROW EXECUTE FUNCTION scanner.set_updated_at();
