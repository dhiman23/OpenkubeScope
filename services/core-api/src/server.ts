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
import { subscriptionRouter } from "./routes/subscription"
import { cronRouter } from "./routes/cron"
import { closeClients } from "./lib/grpc-clients"
import { closePool, getPool } from "./db"
import { runMigrations } from "./lib/migrate"
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
app.use("/api/billing", subscriptionRouter) // /:workspaceId/subscription (read-only)
app.use("/api/cron", cronRouter)

// Fallback error handler.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled error:", err)
  res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" })
})

const port = Number(process.env.PORT || 8080)

// Ensure the schema exists (fresh DB, fresh RDS instance, etc.) and the
// bootstrap admin is seeded before this service accepts any traffic — no
// manual `psql -f migrations/...` step required in any environment.
async function start() {
  try {
    await runMigrations(getPool())
  } catch (err) {
    console.error("Database migration failed, refusing to start:", err)
    process.exit(1)
  }

  // Bootstrap-admin seeding only runs after migrations succeed, and is kept
  // in its own module (repositories/users.ts) — migrate.ts guarantees schema,
  // this seeds data. Failure here is logged, not fatal: the schema is sound,
  // and seeding is retried implicitly (it's an idempotent INSERT ... WHERE NOT
  // EXISTS) on next restart if this transient failure was e.g. a DB hiccup.
  try {
    await ensureBootstrapAdmin()
  } catch (err) {
    console.error("Bootstrap admin seed failed:", err)
  }

  server = app.listen(port, () => {
    console.log(`core-api listening on :${port}`)
  })
}

let server: ReturnType<typeof app.listen>
start()

async function shutdown() {
  console.log("core-api shutting down")
  // server may not exist yet if SIGTERM arrives while migrations/bootstrap
  // are still running (e.g. a rolling restart hitting a slow migration).
  const finish = async () => {
    closeClients()
    await closePool()
    await shutdownTelemetry()
    process.exit(0)
  }
  if (server) server.close(() => finish())
  else await finish()
}
process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)
