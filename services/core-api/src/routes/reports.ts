import { Router } from "express"
import { requireAuth, requireCredentialsChanged } from "../auth/middleware"
import { getOwnedWorkspace } from "../repositories/workspaces"
import { reportApi, report as reportProto } from "../lib/grpc-clients"
import { reportToJson, scheduledToJson } from "../lib/report-json"
import { reportQueueUrl, enqueueReportJob } from "../lib/report-queue"

export const reportsRouter = Router()
reportsRouter.use(requireAuth, requireCredentialsChanged)

const FORMAT_CONTENT_TYPE: Record<number, string> = {
  [reportProto.ReportFormat.PDF]: "application/pdf",
  [reportProto.ReportFormat.CSV]: "text/csv",
  [reportProto.ReportFormat.JSON]: "application/json",
}
const FORMAT_EXT: Record<number, string> = {
  [reportProto.ReportFormat.PDF]: "pdf",
  [reportProto.ReportFormat.CSV]: "csv",
  [reportProto.ReportFormat.JSON]: "json",
}

reportsRouter.post("/:workspaceId/reports", async (req, res) => {
  const ws = await getOwnedWorkspace(req.user!.id, req.params.workspaceId)
  if (!ws) return res.status(404).json({ error: "Workspace not found" })

  const { reportName, reportType, format, clusters, scanIds } = req.body ?? {}
  if (!Array.isArray(clusters) || clusters.length === 0) {
    return res.status(400).json({ error: "clusters (non-empty array) required" })
  }

  const name = typeof reportName === "string" ? reportName : "Report"
  const type = reportProto.reportTypeFromJSON(reportType ?? "RBAC_AUDIT")
  const fmt = reportProto.reportFormatFromJSON(format ?? "JSON")
  const ids = Array.isArray(scanIds) ? scanIds : []

  // Async path: create the row (visible immediately as 'generating'), then
  // enqueue the job on SQS for report-service; KEDA scales consumers on queue
  // depth. The frontend polls the list until the status flips.
  if (reportQueueUrl()) {
    let reportId = ""
    try {
      const created = await reportApi.createReport({ workspaceId: ws.id, reportName: name, reportType: type, format: fmt, clusters, scanIds: ids })
      reportId = created.reportId
      await enqueueReportJob({
        reportId,
        workspaceId: ws.id,
        workspaceName: ws.name,
        clusters,
        reportType: reportProto.reportTypeToJSON(type),
        format: reportProto.reportFormatToJSON(fmt),
        reportName: name,
        scanIds: ids,
      })
      return res.status(202).json({ reportId, status: "generating" })
    } catch (err) {
      // Enqueue failed after the row was created — remove it so it doesn't
      // sit in 'generating' forever with no job behind it.
      if (reportId) await reportApi.deleteReport({ workspaceId: ws.id, reportId }).catch(() => {})
      return res.status(502).json({ error: err instanceof Error ? err.message : "Failed to queue report generation" })
    }
  }

  // Sync fallback (no SQS configured — local dev without AWS).
  try {
    const result = await reportApi.generateReport({
      reportId: "",
      workspaceId: ws.id,
      workspaceName: ws.name,
      clusters,
      reportType: type,
      format: fmt,
      reportName: name,
      scanIds: ids,
    })

    if (result.status === reportProto.ReportStatus.FAILED) {
      return res.status(422).json({ error: result.errorMessage || "Report generation failed", reportId: result.reportId })
    }
    return res.status(201).json({ reportId: result.reportId, status: "completed", fileSize: result.fileSize })
  } catch (err) {
    return res.status(502).json({ error: err instanceof Error ? err.message : "Report generation failed" })
  }
})

reportsRouter.get("/:workspaceId/reports", async (req, res) => {
  const ws = await getOwnedWorkspace(req.user!.id, req.params.workspaceId)
  if (!ws) return res.status(404).json({ error: "Workspace not found" })
  const result = await reportApi.listReports({ workspaceId: ws.id })
  res.json({ reports: result.reports.map(reportToJson) })
})

// Download the rendered report file (PDF/CSV/JSON bytes).
reportsRouter.get("/:workspaceId/reports/:reportId/download", async (req, res) => {
  const ws = await getOwnedWorkspace(req.user!.id, req.params.workspaceId)
  if (!ws) return res.status(404).json({ error: "Workspace not found" })

  try {
    const result = await reportApi.getReport({ workspaceId: ws.id, reportId: req.params.reportId })
    if (result.status !== reportProto.ReportStatus.COMPLETED || result.fileContent.length === 0) {
      return res.status(409).json({ error: "Report not ready for download", status: result.status })
    }
    const ext = FORMAT_EXT[result.format] || "bin"
    res.setHeader("Content-Type", FORMAT_CONTENT_TYPE[result.format] || "application/octet-stream")
    res.setHeader("Content-Disposition", `attachment; filename="${sanitize(result.reportName)}.${ext}"`)
    res.send(Buffer.from(result.fileContent))
  } catch {
    res.status(404).json({ error: "Report not found" })
  }
})

reportsRouter.delete("/:workspaceId/reports/:reportId", async (req, res) => {
  const ws = await getOwnedWorkspace(req.user!.id, req.params.workspaceId)
  if (!ws) return res.status(404).json({ error: "Workspace not found" })
  const result = await reportApi.deleteReport({ workspaceId: ws.id, reportId: req.params.reportId })
  if (!result.deleted) return res.status(404).json({ error: "Report not found" })
  res.json({ deleted: true })
})

// ---- scheduled reports ----

reportsRouter.get("/:workspaceId/scheduled-reports", async (req, res) => {
  const ws = await getOwnedWorkspace(req.user!.id, req.params.workspaceId)
  if (!ws) return res.status(404).json({ error: "Workspace not found" })
  const result = await reportApi.listScheduledReports({ workspaceId: ws.id })
  res.json({ scheduledReports: result.scheduledReports.map(scheduledToJson) })
})

reportsRouter.post("/:workspaceId/scheduled-reports", async (req, res) => {
  const ws = await getOwnedWorkspace(req.user!.id, req.params.workspaceId)
  if (!ws) return res.status(404).json({ error: "Workspace not found" })
  const { name, reportType, format, clusters, frequency, slackWebhookUrl, notifyEmail } = req.body ?? {}
  if (typeof name !== "string" || !Array.isArray(clusters) || clusters.length === 0) {
    return res.status(400).json({ error: "name and clusters required" })
  }
  const result = await reportApi.createScheduledReport({
    workspaceId: ws.id,
    workspaceName: ws.name,
    name,
    reportType: reportProto.reportTypeFromJSON(reportType ?? "RBAC_AUDIT"),
    format: reportProto.reportFormatFromJSON(format ?? "JSON"),
    clusters,
    frequency: reportProto.scheduleFrequencyFromJSON(frequency ?? "weekly"),
    slackWebhookUrl: typeof slackWebhookUrl === "string" ? slackWebhookUrl : undefined,
    notifyEmail: typeof notifyEmail === "string" ? notifyEmail : undefined,
  })
  res.status(201).json({ scheduledReport: scheduledToJson(result.scheduledReport!) })
})

reportsRouter.patch("/:workspaceId/scheduled-reports/:id", async (req, res) => {
  const ws = await getOwnedWorkspace(req.user!.id, req.params.workspaceId)
  if (!ws) return res.status(404).json({ error: "Workspace not found" })
  const { enabled } = req.body ?? {}
  if (typeof enabled !== "boolean") return res.status(400).json({ error: "enabled (boolean) required" })
  try {
    const result = await reportApi.toggleScheduledReport({ workspaceId: ws.id, scheduledReportId: req.params.id, enabled })
    res.json({ scheduledReport: scheduledToJson(result.scheduledReport!) })
  } catch {
    res.status(404).json({ error: "Scheduled report not found" })
  }
})

reportsRouter.delete("/:workspaceId/scheduled-reports/:id", async (req, res) => {
  const ws = await getOwnedWorkspace(req.user!.id, req.params.workspaceId)
  if (!ws) return res.status(404).json({ error: "Workspace not found" })
  const result = await reportApi.deleteScheduledReport({ workspaceId: ws.id, scheduledReportId: req.params.id })
  if (!result.deleted) return res.status(404).json({ error: "Scheduled report not found" })
  res.json({ deleted: true })
})

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_]+/g, "_").slice(0, 80) || "report"
}
