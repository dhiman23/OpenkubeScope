// Report storage. Rewired from Supabase to core-api (REST).
// Report generation now happens server-side: a single generate call creates the
// row, fetches scans, renders the file, and persists it. Download streams the
// rendered bytes from core-api.

import { reportsApi } from "./api-client"

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

// Kick off report generation server-side. Status is "completed" when core-api
// generated synchronously, or "generating" when the job was queued (SQS) —
// callers should poll loadReports until the status flips.
export async function generateReport(
  workspaceId: string,
  params: {
    report_name: string
    report_type: Report["report_type"]
    format: Report["format"]
    clusters: string[]
    scan_ids?: string[]
  },
): Promise<{ reportId: string; status: string }> {
  const res = await reportsApi.generate(workspaceId, {
    reportName: params.report_name,
    reportType: params.report_type,
    format: params.format,
    clusters: params.clusters,
    scanIds: params.scan_ids,
  })
  return { reportId: res.reportId, status: res.status }
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
