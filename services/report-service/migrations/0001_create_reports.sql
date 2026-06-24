-- report-service owns this schema. Same RDS instance as core-api /
-- rbac-scanner-service, logically separated by schema. No cross-schema FKs:
-- workspace_id and scan_ids are plain UUID columns/arrays referencing rows
-- owned by other services. core-api verifies workspace ownership before
-- calling this service.

CREATE SCHEMA IF NOT EXISTS report;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS report.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  scan_ids UUID[] NOT NULL DEFAULT '{}',
  report_name TEXT NOT NULL,
  report_type TEXT NOT NULL CHECK (report_type IN ('COMPLIANCE', 'RISK_ASSESSMENT', 'RBAC_AUDIT', 'TREND_ANALYSIS')),
  format TEXT NOT NULL CHECK (format IN ('PDF', 'JSON', 'CSV')),
  clusters TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'generating' CHECK (status IN ('generating', 'completed', 'failed')),
  risk_summary JSONB NOT NULL DEFAULT '{"critical": 0, "high": 0, "medium": 0, "low": 0}'::jsonb,
  report_data JSONB,
  -- file content is stored inline as base64 (small reports). Swapping to S3 is
  -- DevOps scope; the column would then hold an object key instead.
  file_content TEXT,
  file_size TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_reports_workspace ON report.reports(workspace_id);
CREATE INDEX IF NOT EXISTS idx_report_reports_created ON report.reports(created_at DESC);

CREATE TABLE IF NOT EXISTS report.scheduled_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  -- denormalized so report-service can generate without calling core-api for
  -- the workspace name (it doesn't own workspaces).
  workspace_name TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  report_type TEXT NOT NULL CHECK (report_type IN ('COMPLIANCE', 'RISK_ASSESSMENT', 'RBAC_AUDIT', 'TREND_ANALYSIS')),
  format TEXT NOT NULL CHECK (format IN ('PDF', 'JSON', 'CSV')),
  clusters TEXT[] NOT NULL DEFAULT '{}',
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  slack_webhook_url TEXT,
  notify_email TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  next_run_at TIMESTAMPTZ NOT NULL,
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT CHECK (last_run_status IN ('success', 'failed')),
  last_run_error TEXT,
  last_report_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_scheduled_workspace ON report.scheduled_reports(workspace_id);
CREATE INDEX IF NOT EXISTS idx_report_scheduled_next_run ON report.scheduled_reports(next_run_at) WHERE enabled = TRUE;

CREATE OR REPLACE FUNCTION report.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_report_reports_updated_at ON report.reports;
CREATE TRIGGER set_report_reports_updated_at
  BEFORE UPDATE ON report.reports
  FOR EACH ROW EXECUTE FUNCTION report.set_updated_at();

DROP TRIGGER IF EXISTS set_report_scheduled_updated_at ON report.scheduled_reports;
CREATE TRIGGER set_report_scheduled_updated_at
  BEFORE UPDATE ON report.scheduled_reports
  FOR EACH ROW EXECUTE FUNCTION report.set_updated_at();
