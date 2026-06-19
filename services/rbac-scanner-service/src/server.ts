import * as grpc from "@grpc/grpc-js"
import { HealthImplementation } from "grpc-health-check"

import { RbacScannerServiceService, type RbacScannerServiceServer } from "./generated/scanner"
import { createScanFromBuffer } from "./lib/rbac-engine"
import { deleteScan, getScan, listLatestScansByCluster, saveScan } from "./lib/scan-repository"
import { scanToProto } from "./lib/proto-mapper"

const SERVICE_NAME = "kubescope.scanner.v1.RbacScannerService"

const handlers: RbacScannerServiceServer = {
  async scanSnapshot(call, callback) {
    try {
      const { workspaceId, fileName, fileContent } = call.request
      if (!workspaceId || !fileName || !fileContent?.length) {
        callback({ code: grpc.status.INVALID_ARGUMENT, message: "workspace_id, file_name, and file_content are required" })
        return
      }

      const scan = await createScanFromBuffer(Buffer.from(fileContent), fileName)
      const saved = await saveScan(workspaceId, scan)
      callback(null, { scan: scanToProto(workspaceId, saved) })
    } catch (err) {
      callback({ code: grpc.status.INTERNAL, message: toMessage(err) })
    }
  },

  async getScan(call, callback) {
    try {
      const { workspaceId, scanId } = call.request
      if (!workspaceId || !scanId) {
        callback({ code: grpc.status.INVALID_ARGUMENT, message: "workspace_id and scan_id are required" })
        return
      }

      const scan = await getScan(workspaceId, scanId)
      if (!scan) {
        callback({ code: grpc.status.NOT_FOUND, message: "scan not found" })
        return
      }

      callback(null, { scan: scanToProto(workspaceId, scan) })
    } catch (err) {
      callback({ code: grpc.status.INTERNAL, message: toMessage(err) })
    }
  },

  async listScansByCluster(call, callback) {
    try {
      const { workspaceId, clusterNames, metaOnly } = call.request
      if (!workspaceId || clusterNames.length === 0) {
        callback({ code: grpc.status.INVALID_ARGUMENT, message: "workspace_id and at least one cluster_name are required" })
        return
      }

      const scans = await listLatestScansByCluster(workspaceId, clusterNames, metaOnly)
      callback(null, { scans: scans.map((s) => scanToProto(workspaceId, s)) })
    } catch (err) {
      callback({ code: grpc.status.INTERNAL, message: toMessage(err) })
    }
  },

  async deleteScan(call, callback) {
    try {
      const { workspaceId, scanId } = call.request
      if (!workspaceId || !scanId) {
        callback({ code: grpc.status.INVALID_ARGUMENT, message: "workspace_id and scan_id are required" })
        return
      }

      const deleted = await deleteScan(workspaceId, scanId)
      callback(null, { deleted })
    } catch (err) {
      callback({ code: grpc.status.INTERNAL, message: toMessage(err) })
    }
  },
}

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Internal error"
}

function main() {
  const port = process.env.PORT || "50051"
  const server = new grpc.Server()

  server.addService(RbacScannerServiceService, handlers)

  const health = new HealthImplementation({ [SERVICE_NAME]: "SERVING" })
  health.addToServer(server)

  server.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (err, boundPort) => {
    if (err) {
      console.error("Failed to bind rbac-scanner-service:", err)
      process.exit(1)
    }
    console.log(`rbac-scanner-service listening on :${boundPort}`)
  })

  const shutdown = () => {
    console.log("rbac-scanner-service shutting down")
    health.setStatus(SERVICE_NAME, "NOT_SERVING")
    server.tryShutdown(() => process.exit(0))
  }
  process.on("SIGTERM", shutdown)
  process.on("SIGINT", shutdown)
}

main()
