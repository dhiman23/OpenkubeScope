// Telemetry must be initialized before anything else so auto-instrumentation
// can patch http/express/pg/grpc.
import { startTelemetry, shutdownTelemetry } from "./telemetry"
startTelemetry()

import express from "express"
import cors from "cors"
import { authRouter } from "./routes/auth"
import { workspacesRouter } from "./routes/workspaces"
import { scansRouter } from "./routes/scans"
import { reportsRouter } from "./routes/reports"
import { cronRouter } from "./routes/cron"
import { closeClients } from "./lib/grpc-clients"
import { closePool } from "./db"
import { ensureBootstrapAdmin } from "./repositories/users"

const app = express()

const corsOrigins = (process.env.CORS_ORIGINS || "http://localhost:3000").split(",").map((s) => s.trim())
app.use(cors({ origin: corsOrigins, credentials: true }))

// Liveness/readiness. (gRPC services use the gRPC health protocol; core-api is
// HTTP so it exposes a plain endpoint for K8s probes / ALB health checks.)
app.get("/healthz", (_req, res) => res.json({ status: "ok", service: "core-api" }))

app.use(express.json({ limit: "1mb" }))

app.use("/api/auth", authRouter)
app.use("/api/workspaces", workspacesRouter)
app.use("/api/workspaces", scansRouter) // /:workspaceId/scans...
app.use("/api/workspaces", reportsRouter) // /:workspaceId/reports..., scheduled-reports...
app.use("/api/cron", cronRouter)

// Fallback error handler.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled error:", err)
  res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" })
})

const port = Number(process.env.PORT || 8080)
const server = app.listen(port, () => {
  console.log(`core-api listening on :${port}`)
  // Jenkins-style first-boot seed of the admin/admin account.
  ensureBootstrapAdmin().catch((err) => console.error("Bootstrap admin seed failed:", err))
})

async function shutdown() {
  console.log("core-api shutting down")
  server.close(async () => {
    closeClients()
    await closePool()
    await shutdownTelemetry()
    process.exit(0)
  })
}
process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)
