// Maps DB rows to outgoing proto messages.
//
// Note: GenerateReport/GetReport responses do NOT populate the proto
// `report_data` field. The full ReportData tree is large and format-specific;
// instead the response carries `file_content` bytes (the JSON/CSV/PDF the user
// downloads) plus the persisted risk summary. For JSON format the bytes ARE the
// report data. Mapping ReportData -> proto can be added later if a consumer
// needs the structured tree over gRPC rather than the rendered file.

import type * as proto from "../generated/report"
import type { ReportRow } from "./report-repository"
import type { ScheduledReportRow } from "./scheduled-repository"
import { reportTypeToProto, reportFormatToProto, reportStatusToProto, scheduleFrequencyToProto } from "./enums"

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
