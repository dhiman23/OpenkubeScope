// Maps DB rows to outgoing proto messages.
//
// Note: GenerateReport/GetReport responses do NOT populate the proto
// `report_data` field. The full ReportData tree is large and format-specific;
// instead the response carries `file_content` bytes (the JSON/CSV/PDF the user
// downloads) plus the persisted risk summary. For JSON format the bytes ARE the
// report data. Mapping ReportData -> proto can be added later if a consumer
// needs the structured tree over gRPC rather than the rendered file.

import * as proto from "../generated/report"
import type { ReportRow } from "./report-repository"
import type { ReportProvenance } from "./provenance"
import type { ScheduledReportRow } from "./scheduled-repository"
import { reportTypeToProto, reportFormatToProto, reportStatusToProto, scheduleFrequencyToProto } from "./enums"

/**
 * Provenance is mapped even for list responses: a reports list that cannot say
 * which snapshot each report describes is how an old report gets mistaken for
 * the current scan.
 */
export function provenanceToProto(provenance: ReportProvenance | null): proto.ReportProvenance | undefined {
  if (!provenance) return undefined

  return {
    sources: (provenance.sources ?? []).map((source) => ({
      scanId: source.scan_id,
      clusterName: source.cluster_name,
      fileName: source.file_name,
      snapshotTakenAt: source.snapshot_taken_at,
      isLatest: source.is_latest,
      totals: source.totals,
      riskCounts: source.risk_counts,
      namespaceCount: source.namespace_count,
      clusterScopedBindings: source.cluster_scoped_bindings,
      boundSubjects: source.bound_subjects,
    })),
    generatedAt: provenance.generated_at,
    scope: provenance.scope,
    filters: provenance.filters ?? [],
    basedOnLatest: provenance.based_on_latest,
    selectionMode:
      provenance.selection_mode === "EXPLICIT"
        ? proto.SelectionMode.EXPLICIT
        : proto.SelectionMode.LATEST_PER_CLUSTER,
  }
}

export function reportRowToProto(row: ReportRow): proto.Report {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    scanIds: row.scan_ids,
    reportName: row.report_name,
    reportType: reportTypeToProto[row.report_type],
    format: reportFormatToProto[row.format],
    clusters: row.clusters,
    status: reportStatusToProto[row.status],
    riskSummary: row.risk_summary,
    fileSize: row.file_size || "",
    errorMessage: row.error_message || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    provenance: provenanceToProto(row.provenance),
  }
}

export function scheduledRowToProto(row: ScheduledReportRow): proto.ScheduledReport {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    reportType: reportTypeToProto[row.report_type],
    format: reportFormatToProto[row.format],
    clusters: row.clusters,
    frequency: scheduleFrequencyToProto[row.frequency],
    slackWebhookUrl: row.slack_webhook_url || undefined,
    notifyEmail: row.notify_email || undefined,
    enabled: row.enabled,
    nextRunAt: row.next_run_at,
    lastRunAt: row.last_run_at || undefined,
    lastRunStatus: row.last_run_status || undefined,
    lastRunError: row.last_run_error || undefined,
    lastReportId: row.last_report_id || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
