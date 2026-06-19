-- Scheduled Reports table for KubeScope
-- Enables recurring report generation with optional Slack webhook notifications.

CREATE TABLE IF NOT EXISTS public.scheduled_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
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
  last_report_id UUID REFERENCES public.reports(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_reports_workspace ON public.scheduled_reports(workspace_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_reports_next_run ON public.scheduled_reports(next_run_at) WHERE enabled = TRUE;

ALTER TABLE public.scheduled_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members read scheduled reports" ON public.scheduled_reports
  FOR SELECT USING (
    workspace_id IN (SELECT id FROM public.workspaces WHERE user_id = auth.uid())
  );

CREATE POLICY "workspace members insert scheduled reports" ON public.scheduled_reports
  FOR INSERT WITH CHECK (
    workspace_id IN (SELECT id FROM public.workspaces WHERE user_id = auth.uid())
  );

CREATE POLICY "workspace members update scheduled reports" ON public.scheduled_reports
  FOR UPDATE USING (
    workspace_id IN (SELECT id FROM public.workspaces WHERE user_id = auth.uid())
  );

CREATE POLICY "workspace members delete scheduled reports" ON public.scheduled_reports
  FOR DELETE USING (
    workspace_id IN (SELECT id FROM public.workspaces WHERE user_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.update_scheduled_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_scheduled_reports_updated_at ON public.scheduled_reports;
CREATE TRIGGER trg_scheduled_reports_updated_at
  BEFORE UPDATE ON public.scheduled_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.update_scheduled_reports_updated_at();
