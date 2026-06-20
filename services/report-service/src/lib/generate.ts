// Orchestrates a single report generation: persist row -> fetch scans (gRPC,
// cached) -> build ReportData -> render file -> persist result. Shared by the
// GenerateReport RPC and the scheduled-report runner. Mirrors generateReport()
// in the monolith's report-generator.ts, minus the browser blob URL.

import { buildReportData, renderReportFile } from "./report-engine"
import { fetchScansForClusters } from "./scanner-client"
import { createReport, completeReport, failReport, getReport, type ReportRow } from "./report-repository"
import type { ReportType, ReportFormat } from "./rbac-types"

export interface GenerateResult {
  reportId: string
  status: "completed" | "failed"
  fileContent: Buffer | null
  fileSize: string
  errorMessage: string
  riskSummary: { critical: number; high: number; medium: number; low: number }
}

export async function generateReport(params: {
  reportId?: string
  workspaceId: string
  workspaceName: string
  clusters: string[]
  reportType: ReportType
  format: ReportFormat
  reportName: string
  scanIds?: string[]
}): Promise<GenerateResult> {
  // 1. Persist (or reuse) the report row in 'generating' state.
  let row: ReportRow
  if (params.reportId) {
    const existing = await getReport(params.workspaceId, params.reportId)
    row =
      existing ||
      (await createReport({
        workspaceId: params.workspaceId,
        scanIds: params.scanIds || [],
        reportName: params.reportName,
        reportType: params.reportType,
        format: params.format,
        clusters: params.clusters,
        reportId: params.reportId,
      }))
  } else {
    row = await createReport({
      workspaceId: params.workspaceId,
      scanIds: params.scanIds || [],
      reportName: params.reportName,
      reportType: params.reportType,
      format: params.format,
      clusters: params.clusters,
    })
  }

  try {
    // 2. Fetch scans for the selected clusters via the scanner gRPC API.
    const scans = await fetchScansForClusters(params.workspaceId, params.clusters)

    if (scans.length === 0) {
      await failReport(row.id, "No scans found for the selected clusters")
      return emptyFail(row.id, "No scans found for the selected clusters")
    }

    // 3. Build the report data + render the downloadable file.
    const reportData = buildReportData({
      workspaceId: params.workspaceId,
      workspaceName: params.workspaceName,
      clusters: params.clusters,
      reportType: params.reportType,
      format: params.format,
      scans,
    })
    const { content, size } = renderReportFile(reportData)
    const fileBase64 = content.toString("base64")

    // 4. Persist the completed report.
    await completeReport(row.id, {
      riskSummary: reportData.risks,
      reportData,
      fileContent: fileBase64,
      fileSize: size,
    })

    return {
      reportId: row.id,
      status: "completed",
      fileContent: content,
      fileSize: size,
      errorMessage: "",
      riskSummary: reportData.risks,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error during report generation"
    await failReport(row.id, message)
    return emptyFail(row.id, message)
  }
}

function emptyFail(reportId: string, message: string): GenerateResult {
  return {
    reportId,
    status: "failed",
    fileContent: null,
    fileSize: "",
    errorMessage: message,
    riskSummary: { critical: 0, high: 0, medium: 0, low: 0 },
  }
}
