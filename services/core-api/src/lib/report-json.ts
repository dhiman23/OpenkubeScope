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

const SELECTION_MODE: Record<number, string> = {
  [report.SelectionMode.EXPLICIT]: "explicit",
  [report.SelectionMode.LATEST_PER_CLUSTER]: "latest_per_cluster",
}

/**
 * Provenance passthrough.
 *
 * The frontend needs to state, on the report card and in the report detail,
 * exactly which snapshot a report describes and whether that snapshot is still
 * the newest — otherwise an old report is indistinguishable from one built
 * from the scan the user currently has open. Reports generated before
 * provenance tracking have none, and are surfaced as null rather than guessed.
 */
function provenanceToJson(p: report.ReportProvenance | undefined) {
  if (!p) return null
  return {
    sources: (p.sources ?? []).map((s) => ({
      scan_id: s.scanId,
      cluster_name: s.clusterName,
      file_name: s.fileName,
      snapshot_taken_at: s.snapshotTakenAt,
      is_latest: s.isLatest,
      totals: s.totals ?? { subjects: 0, roles: 0, bindings: 0 },
      risk_counts: s.riskCounts ?? { critical: 0, high: 0, medium: 0, low: 0 },
      namespace_count: s.namespaceCount,
      cluster_scoped_bindings: s.clusterScopedBindings,
      bound_subjects: s.boundSubjects,
    })),
    generated_at: p.generatedAt,
    scope: p.scope,
    filters: p.filters ?? [],
    based_on_latest: p.basedOnLatest,
    selection_mode: SELECTION_MODE[p.selectionMode] || "latest_per_cluster",
  }
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
    provenance: provenanceToJson(r.provenance),
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
