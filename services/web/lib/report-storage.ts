// Report storage. Rewired from Supabase to core-api (REST).
// Report generation now happens server-side: a single generate call creates the
// row, fetches scans, renders the file, and persists it. Download streams the
// rendered bytes from core-api.

import { reportsApi } from "./api-client"

/** Which snapshot(s) a report describes — see components/reports/report-provenance. */
export interface SnapshotSource {
  scan_id: string
  cluster_name: string
  file_name: string
  snapshot_taken_at: string
  /** Was this the newest snapshot of its cluster when the report was made? */
  is_latest: boolean
  totals: { subjects: number; roles: number; bindings: number }
  risk_counts: { critical: number; high: number; medium: number; low: number }
  namespace_count: number
  cluster_scoped_bindings: number
  bound_subjects: number
}

export interface ReportProvenance {
  sources: SnapshotSource[]
  generated_at: string
  scope: string
  filters: string[]
  based_on_latest: boolean
  selection_mode: "explicit" | "latest_per_cluster"
}

export interface Report {
  id: string
  workspace_id: string
  scan_ids: string[]
  report_name: string
  report_type: "COMPLIANCE" | "RISK_ASSESSMENT" | "RBAC_AUDIT" | "TREND_ANALYSIS"
  format: "PDF" | "JSON" | "CSV"
  clusters: string[]
  status: "generating" | "completed" | "failed"
  risk_summary: { critical: number; high: number; medium: number; low: number }
  report_data: Record<string, unknown> | null
  file_url: string | null
  file_size: string | null
  error_message: string | null
  /** Null for reports generated before provenance tracking existed. */
  provenance: ReportProvenance | null
  created_at: string
  updated_at: string
}

export async function loadReports(workspaceId: string): Promise<Report[]> {
  try {
    return (await reportsApi.list(workspaceId)) as Report[]
  } catch {
    return []
  }
}

// Generate a report synchronously (server-side). Returns the new report id.
export async function generateReport(
  workspaceId: string,
  params: {
    report_name: string
    report_type: Report["report_type"]
    format: Report["format"]
    clusters: string[]
    scan_ids?: string[]
    /** Already-formatted filter labels, recorded in the report's provenance. */
    filters?: string[]
  },
): Promise<{ reportId: string; fileSize: string }> {
  const res = await reportsApi.generate(workspaceId, {
    reportName: params.report_name,
    reportType: params.report_type,
    format: params.format,
    clusters: params.clusters,
    scanIds: params.scan_ids,
    filters: params.filters,
  })
  return { reportId: res.reportId, fileSize: res.fileSize }
}

export async function deleteReport(workspaceId: string, reportId: string): Promise<void> {
  await reportsApi.remove(workspaceId, reportId)
}

// Download the rendered report file (PDF/CSV/JSON) in the browser.
export async function downloadReport(workspaceId: string, reportId: string, fallbackName = "report"): Promise<void> {
  const { blob, filename } = await reportsApi.download(workspaceId, reportId)
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename || fallbackName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
