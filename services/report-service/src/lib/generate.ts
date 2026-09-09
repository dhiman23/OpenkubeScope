// Orchestrates a single report generation: persist row -> fetch scans (gRPC,
// cached) -> build ReportData -> render file -> persist result. Shared by the
// GenerateReport RPC and the scheduled-report runner. Mirrors generateReport()
// in the monolith's report-generator.ts, minus the browser blob URL.

import { buildReportData, renderReportFile } from "./report-engine"
import { fetchScansForClusters, fetchScansByIds, fetchLatestScanMetaForClusters } from "./scanner-client"
import { buildProvenance, type SelectionMode } from "./provenance"
import { createReport, completeReport, failReport, getReport, type ReportRow } from "./report-repository"
import type { ReportType, ReportFormat, ScanRow } from "./rbac-types"
import { SpanStatusCode, trace } from "@opentelemetry/api"
import { withSpan, withSyncSpan } from "./tracing"

export interface GenerateResult {
  reportId: string
  status: "completed" | "failed"
  fileContent: Buffer | null
  fileSize: string
  errorMessage: string
  riskSummary: { critical: number; high: number; medium: number; low: number }
}

export interface GenerateParams {
  reportId?: string
  workspaceId: string
  workspaceName: string
  clusters: string[]
  reportType: ReportType
  format: ReportFormat
  reportName: string
  scanIds?: string[]
  filters?: string[]
}

// Traced entry point. Auto-instrumentation shows the gRPC call coming in and
// the Postgres writes going out, but not the fetch/build/render work between
// them — which is where a slow report actually spends its time. The attributes
// describe the shape of the report so a trace can be read on its own.
//
// generateReport() returns a failed GenerateResult instead of throwing, so the
// span status is set from the result rather than from a caught exception.
export async function generateReport(params: GenerateParams): Promise<GenerateResult> {
  return withSpan(
    "report.generate",
    {
      "workspace.id": params.workspaceId,
      "report.type": params.reportType,
      "report.format": params.format,
      "report.clusters": params.clusters.length,
      "report.explicit_scan_ids": (params.scanIds ?? []).length,
    },
    async (span) => {
      const result = await generateReportInner(params)
      span.setAttributes({
        "report.id": result.reportId,
        "report.status": result.status,
        "report.file_bytes": result.fileContent?.length ?? 0,
      })
      if (result.status === "failed") {
        span.setStatus({ code: SpanStatusCode.ERROR, message: result.errorMessage })
      }
      return result
    },
  )
}

async function generateReportInner(params: GenerateParams): Promise<GenerateResult> {
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
    // 2. Resolve the snapshots this report is about.
    //
    // When the caller names scan ids (the snapshot the user had open), those
    // are the ONLY scans read. Previously this step always re-resolved "latest
    // per cluster" and summed across whatever it found, so a report could
    // describe a different snapshot than the one it was generated from.
    const requestedIds = (params.scanIds ?? []).filter(Boolean)
    let scans: ScanRow[]
    let selectionMode: SelectionMode

    if (requestedIds.length > 0) {
      const { scans: found, missing } = await fetchScansByIds(params.workspaceId, requestedIds)
      if (missing.length > 0) {
        // Never silently substitute a different snapshot for a missing one.
        const message = `Snapshot${missing.length === 1 ? "" : "s"} not found: ${missing.join(", ")}`
        await failReport(row.id, message)
        return emptyFail(row.id, message)
      }
      scans = found
      selectionMode = "EXPLICIT"
    } else {
      scans = await fetchScansForClusters(params.workspaceId, params.clusters)
      selectionMode = "LATEST_PER_CLUSTER"
    }

    trace.getActiveSpan()?.setAttributes({
      "report.scans": scans.length,
      "report.selection_mode": selectionMode,
    })

    if (scans.length === 0) {
      await failReport(row.id, "No scans found for the selected clusters")
      return emptyFail(row.id, "No scans found for the selected clusters")
    }

    // 3. Work out which snapshot is each cluster's newest, so the report can
    //    state plainly whether it describes the latest scan or an earlier one.
    const latestIdsByCluster = await resolveLatestIds(
      params.workspaceId,
      [...new Set(scans.map((s) => s.cluster_name))],
    )

    const provenance = buildProvenance({
      scans,
      latestIdsByCluster,
      selectionMode,
      filters: params.filters,
    })

    // 4. Build the report data + render the downloadable file.
    const reportData = buildReportData({
      workspaceId: params.workspaceId,
      workspaceName: params.workspaceName,
      // Report on the clusters actually analysed, not the requested labels.
      clusters: [...new Set(scans.map((s) => s.cluster_name))],
      reportType: params.reportType,
      format: params.format,
      scans,
      provenance,
    })
    // The PDF path (jspdf + autotable) is the expensive one and scales with
    // findings count, so it gets its own span rather than hiding inside the
    // parent's duration.
    const { content, size } = withSyncSpan(
      "report.render_file",
      { "report.format": params.format, "report.findings": reportData.findings.length },
      () => renderReportFile(reportData),
    )
    const fileBase64 = content.toString("base64")

    // 5. Persist the completed report, including the snapshot ids it actually
    //    used — so a report generated without explicit ids still records
    //    exactly which snapshots it read.
    await completeReport(row.id, {
      riskSummary: reportData.risks,
      reportData,
      fileContent: fileBase64,
      fileSize: size,
      scanIds: scans.map((s) => s.id),
      provenance,
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

/**
 * scanId -> "is this the newest completed snapshot of its cluster?".
 *
 * Best-effort: if the lookup fails the report is still generated, just without
 * a latest/earlier claim it cannot substantiate.
 */
async function resolveLatestIds(workspaceId: string, clusters: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (clusters.length === 0) return out
  try {
    const latest = await fetchLatestScanMetaForClusters(workspaceId, clusters)
    for (const scan of latest) out.set(scan.cluster_name, scan.id)
  } catch {
    // Leave the map empty — sources then report is_latest: false, and the UI
    // shows "could not confirm" rather than an unverified "latest".
  }
  return out
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
