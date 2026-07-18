// Telemetry first so auto-instrumentation can patch grpc/pg before they load.
import { startTelemetry, shutdownTelemetry } from "./telemetry"
startTelemetry()

import * as grpc from "@grpc/grpc-js"
import { HealthImplementation } from "grpc-health-check"

import { ReportServiceService, type ReportServiceServer } from "./generated/report"
import { generateReport } from "./lib/generate"
import { runDueScheduledReports } from "./lib/run-scheduled"
import { listReports, getReport, getReportFile, deleteReport } from "./lib/report-repository"
import {
  listScheduledReports,
  createScheduledReport,
  deleteScheduledReport,
  toggleScheduledReport,
} from "./lib/scheduled-repository"
import { reportRowToProto, scheduledRowToProto } from "./lib/proto-mapper"
import { reportTypeFromProto, reportFormatFromProto, reportFormatToProto, reportStatusToProto, scheduleFrequencyFromProto } from "./lib/enums"
import { closeClients } from "./lib/scanner-client"
import { closePool, getPool } from "./lib/db"
import { runMigrations } from "./lib/migrate"

const SERVICE_NAME = "kubescope.report.v1.ReportService"

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Internal error"
}

const handlers: ReportServiceServer = {
  async generateReport(call, callback) {
    try {
      const r = call.request
      if (!r.workspaceId || r.clusters.length === 0) {
        callback({ code: grpc.status.INVALID_ARGUMENT, message: "workspace_id and at least one cluster are required" })
        return
      }

      const result = await generateReport({
        reportId: r.reportId || undefined,
        workspaceId: r.workspaceId,
        workspaceName: r.workspaceName,
        clusters: r.clusters,
        reportType: reportTypeFromProto[r.reportType] || "RBAC_AUDIT",
        format: reportFormatFromProto[r.format] || "JSON",
        reportName: r.reportName || "Report",
        scanIds: r.scanIds,
      })

      callback(null, {
        reportId: result.reportId,
        status: result.status === "completed" ? reportStatusToProto.completed : reportStatusToProto.failed,
        reportData: undefined,
        fileContent: result.fileContent || Buffer.alloc(0),
        fileSize: result.fileSize,
        errorMessage: result.errorMessage,
      })
    } catch (err) {
      callback({ code: grpc.status.INTERNAL, message: toMessage(err) })
    }
  },

  async getReport(call, callback) {
    try {
      const { workspaceId, reportId } = call.request
      if (!workspaceId || !reportId) {
        callback({ code: grpc.status.INVALID_ARGUMENT, message: "workspace_id and report_id are required" })
        return
      }

      const row = await getReport(workspaceId, reportId)
      if (!row) {
        callback({ code: grpc.status.NOT_FOUND, message: "report not found" })
        return
      }

      const file = await getReportFile(workspaceId, reportId)
      callback(null, {
        status: reportStatusToProto[row.status],
        reportData: undefined,
        fileSize: row.file_size || "",
        errorMessage: row.error_message || "",
        fileContent: file?.content || Buffer.alloc(0),
        format: reportFormatToProto[row.format],
        reportName: row.report_name,
      })
    } catch (err) {
      callback({ code: grpc.status.INTERNAL, message: toMessage(err) })
    }
  },

  async listReports(call, callback) {
    try {
      const { workspaceId } = call.request
      if (!workspaceId) {
        callback({ code: grpc.status.INVALID_ARGUMENT, message: "workspace_id is required" })
        return
      }
      const rows = await listReports(workspaceId)
      callback(null, { reports: rows.map(reportRowToProto) })
    } catch (err) {
      callback({ code: grpc.status.INTERNAL, message: toMessage(err) })
    }
  },

  async deleteReport(call, callback) {
    try {
      const { workspaceId, reportId } = call.request
      if (!workspaceId || !reportId) {
        callback({ code: grpc.status.INVALID_ARGUMENT, message: "workspace_id and report_id are required" })
        return
      }
      const deleted = await deleteReport(workspaceId, reportId)
      callback(null, { deleted })
    } catch (err) {
      callback({ code: grpc.status.INTERNAL, message: toMessage(err) })
    }
  },

  async listScheduledReports(call, callback) {
    try {
      const { workspaceId } = call.request
      if (!workspaceId) {
        callback({ code: grpc.status.INVALID_ARGUMENT, message: "workspace_id is required" })
        return
      }
      const rows = await listScheduledReports(workspaceId)
      callback(null, { scheduledReports: rows.map(scheduledRowToProto) })
    } catch (err) {
      callback({ code: grpc.status.INTERNAL, message: toMessage(err) })
    }
  },

  async createScheduledReport(call, callback) {
    try {
      const r = call.request
      if (!r.workspaceId || !r.name || r.clusters.length === 0) {
        callback({ code: grpc.status.INVALID_ARGUMENT, message: "workspace_id, name, and clusters are required" })
        return
      }
      const row = await createScheduledReport({
        workspaceId: r.workspaceId,
        workspaceName: r.workspaceName,
        name: r.name,
        reportType: reportTypeFromProto[r.reportType] || "RBAC_AUDIT",
        format: reportFormatFromProto[r.format] || "JSON",
        clusters: r.clusters,
        frequency: scheduleFrequencyFromProto[r.frequency] || "weekly",
        slackWebhookUrl: r.slackWebhookUrl,
        notifyEmail: r.notifyEmail,
      })
      callback(null, { scheduledReport: scheduledRowToProto(row) })
    } catch (err) {
      callback({ code: grpc.status.INTERNAL, message: toMessage(err) })
    }
  },

  async deleteScheduledReport(call, callback) {
    try {
      const { workspaceId, scheduledReportId } = call.request
      if (!workspaceId || !scheduledReportId) {
        callback({ code: grpc.status.INVALID_ARGUMENT, message: "workspace_id and scheduled_report_id are required" })
        return
      }
      const deleted = await deleteScheduledReport(workspaceId, scheduledReportId)
      callback(null, { deleted })
    } catch (err) {
      callback({ code: grpc.status.INTERNAL, message: toMessage(err) })
    }
  },

  async toggleScheduledReport(call, callback) {
    try {
      const { workspaceId, scheduledReportId, enabled } = call.request
      if (!workspaceId || !scheduledReportId) {
        callback({ code: grpc.status.INVALID_ARGUMENT, message: "workspace_id and scheduled_report_id are required" })
        return
      }
      const row = await toggleScheduledReport(workspaceId, scheduledReportId, enabled)
      if (!row) {
        callback({ code: grpc.status.NOT_FOUND, message: "scheduled report not found" })
        return
      }
      callback(null, { scheduledReport: scheduledRowToProto(row) })
    } catch (err) {
      callback({ code: grpc.status.INTERNAL, message: toMessage(err) })
    }
  },

  async runDueScheduledReports(call, callback) {
    try {
      const result = await runDueScheduledReports(call.request.limit)
      callback(null, result)
    } catch (err) {
      callback({ code: grpc.status.INTERNAL, message: toMessage(err) })
    }
  },
}

async function main() {
  // Schema must exist before the gRPC server accepts a single call — no
  // manual `psql -f migrations/...` step required in any environment.
  try {
    await runMigrations(getPool())
  } catch (err) {
    console.error("Database migration failed, refusing to start:", err)
    process.exit(1)
  }

  const port = process.env.PORT || "50052"
  const server = new grpc.Server({ "grpc.max_receive_message_length": 32 * 1024 * 1024 })

  server.addService(ReportServiceService, handlers)

  const health = new HealthImplementation({ [SERVICE_NAME]: "SERVING" })
  health.addToServer(server)

  server.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (err, boundPort) => {
    if (err) {
      console.error("Failed to bind report-service:", err)
      process.exit(1)
    }
    console.log(`report-service listening on :${boundPort}`)
  })

  const shutdown = () => {
    console.log("report-service shutting down")
    health.setStatus(SERVICE_NAME, "NOT_SERVING")
    server.tryShutdown(async () => {
      await closeClients()
      await closePool()
      await shutdownTelemetry()
      process.exit(0)
    })
  }
  process.on("SIGTERM", shutdown)
  process.on("SIGINT", shutdown)
}

main()
