// Cron endpoint: triggers report-service to run all due scheduled reports.
// Mirrors the monolith's app/api/cron/scheduled-reports route. Gated by a
// bearer CRON_SECRET compared in constant time (audit finding: the monolith
// used `===`, vulnerable to timing analysis).
import { Router } from "express"
import { timingSafeEqual } from "node:crypto"
import { reportApi } from "../lib/grpc-clients"

export const cronRouter = Router()

function authorized(header: string | undefined): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  if (!header || !header.startsWith("Bearer ")) return false
  const provided = Buffer.from(header.slice("Bearer ".length))
  const expected = Buffer.from(secret)
  if (provided.length !== expected.length) return false
  return timingSafeEqual(provided, expected)
}

cronRouter.post("/scheduled-reports", async (req, res) => {
  if (!authorized(req.headers.authorization)) {
    return res.status(401).json({ error: "Unauthorized" })
  }
  try {
    const result = await reportApi.runDueScheduledReports({ limit: 0 })
    res.json(result)
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Cron run failed" })
  }
})
