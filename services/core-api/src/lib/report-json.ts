// Maps report proto messages (numeric enums, camelCase) to the snake_case
// string-enum JSON the frontend's report-storage / scheduled-reports expect.

import * as report from "../generated/report"

const TYPE: Record<number, string> = {
  [report.ReportType.COMPLIANCE]: "COMPLIANCE",
  [report.ReportType.RISK_ASSESSMENT]: "RISK_ASSESSMENT",
  [report.ReportType.RBAC_AUDIT]: "RBAC_AUDIT",
  [report.ReportType.TREND_ANALYSIS]: "TREND_ANALYSIS",
}
const FORMAT: Record<number, string> = {
  [report.ReportFormat.PDF]: "PDF",
  [report.ReportFormat.JSON]: "JSON",
  [report.ReportFormat.CSV]: "CSV",
}
const STATUS: Record<number, string> = {
  [report.ReportStatus.PENDING]: "generating",
  [report.ReportStatus.COMPLETED]: "completed",
  [report.ReportStatus.FAILED]: "failed",
}
const FREQ: Record<number, string> = {
  [report.ScheduleFrequency.DAILY]: "daily",
  [report.ScheduleFrequency.WEEKLY]: "weekly",
  [report.ScheduleFrequency.MONTHLY]: "monthly",
}

export function reportToJson(r: report.Report) {
  return {
    id: r.id,
    workspace_id: r.workspaceId,
    scan_ids: r.scanIds,
    report_name: r.reportName,
    report_type: TYPE[r.reportType] || "RBAC_AUDIT",
    format: FORMAT[r.format] || "JSON",
    clusters: r.clusters,
    status: STATUS[r.status] || "generating",
    risk_summary: r.riskSummary || { critical: 0, high: 0, medium: 0, low: 0 },
    report_data: null,
    file_url: null,
    file_size: r.fileSize || null,
    error_message: r.errorMessage || null,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  }
}

export function scheduledToJson(s: report.ScheduledReport) {
  return {
    id: s.id,
    workspace_id: s.workspaceId,
    name: s.name,
    report_type: TYPE[s.reportType] || "RBAC_AUDIT",
    format: FORMAT[s.format] || "JSON",
    clusters: s.clusters,
    frequency: FREQ[s.frequency] || "weekly",
    slack_webhook_url: s.slackWebhookUrl ?? null,
    notify_email: s.notifyEmail ?? null,
    enabled: s.enabled,
    next_run_at: s.nextRunAt,
    last_run_at: s.lastRunAt ?? null,
    last_run_status: s.lastRunStatus ?? null,
    last_run_error: s.lastRunError ?? null,
    last_report_id: s.lastReportId ?? null,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
  }
}
