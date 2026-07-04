import { Router } from "express"
import multer from "multer"
import { requireAuth, requireCredentialsChanged } from "../auth/middleware"
import { getOwnedWorkspace } from "../repositories/workspaces"
import { getSubscription, isPremium, FREE_SCAN_LIMIT } from "../repositories/subscriptions"
import { tryReserveFreeScanSlot, incrementScanUsage, decrementScanUsage } from "../repositories/scan-usage"
import { scannerApi } from "../lib/grpc-clients"
import { scanToJson } from "../lib/scan-json"
import { scanQueueUrl, enqueueScanJob } from "../lib/sqs"

// In-memory upload — snapshots are small JSON/ZIP files. 32MB cap.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 32 * 1024 * 1024 } })

export const scansRouter = Router()
scansRouter.use(requireAuth, requireCredentialsChanged)

// Upload + scan a snapshot. Ownership + free-tier quota enforced HERE (core-api
// owns billing); rbac-scanner-service trusts the workspace_id we send.
scansRouter.post("/:workspaceId/scans", upload.single("file"), async (req, res) => {
  // String() coerce: the multer middleware in the chain widens req.params typing.
  const ws = await getOwnedWorkspace(req.user!.id, String(req.params.workspaceId))
  if (!ws) return res.status(404).json({ error: "Workspace not found" })
  if (!req.file) return res.status(400).json({ error: "file is required (multipart field 'file')" })

  // Quota: premium = unlimited; free = atomic slot reservation (race-safe).
  const sub = await getSubscription(ws.id)
  let reserved = false
  if (isPremium(sub)) {
    await incrementScanUsage(ws.id)
    reserved = true
  } else {
    const ok = await tryReserveFreeScanSlot(ws.id, FREE_SCAN_LIMIT)
    if (!ok) {
      return res.status(402).json({
        error: `Free plan allows only ${FREE_SCAN_LIMIT} scan. Upgrade to Unlimited for more.`,
        code: "SCAN_LIMIT_REACHED",
      })
    }
    reserved = true
  }

  // Async path (event-driven flow): persist the raw snapshot as a 'pending'
  // scan via SubmitScan, publish {scanId, workspaceId} to the rbac_scan_queue,
  // and return 202 — rbac-scanner-service consumes the queue (KEDA-scaled) and
  // completes the row. The frontend polls GET /scans/:scanId until the status
  // flips. Note: the quota slot stays consumed if the scan later fails — the
  // consumer can't touch the core schema; deleting the failed scan refunds it.
  if (scanQueueUrl()) {
    let scanId = ""
    try {
      const submitted = await scannerApi.submitScan({
        workspaceId: ws.id,
        fileName: req.file.originalname,
        fileContent: req.file.buffer,
        fileSize: req.file.size,
      })
      scanId = submitted.scanId
      await enqueueScanJob({ scanId, workspaceId: ws.id })
      return res.status(202).json({ scan: { id: scanId, status: "pending", fileName: req.file.originalname } })
    } catch (err) {
      // Enqueue failed after the pending row was created — remove the orphan
      // row and refund the quota slot.
      if (scanId) await scannerApi.deleteScan({ workspaceId: ws.id, scanId }).catch(() => {})
      if (reserved) await decrementScanUsage(ws.id).catch(() => {})
      return res.status(502).json({ error: err instanceof Error ? err.message : "Failed to queue scan" })
    }
  }

  // Sync fallback (no SQS configured — local dev without AWS).
  try {
    const result = await scannerApi.scanSnapshot({
      workspaceId: ws.id,
      fileName: req.file.originalname,
      fileContent: req.file.buffer,
      fileSize: req.file.size,
    })
    return res.status(201).json({ scan: scanToJson(result.scan) })
  } catch (err) {
    // Roll back the reserved quota slot if the scan failed to persist.
    if (reserved) await decrementScanUsage(ws.id).catch(() => {})
    return res.status(502).json({ error: err instanceof Error ? err.message : "Scan failed" })
  }
})

scansRouter.get("/:workspaceId/scans", async (req, res) => {
  const ws = await getOwnedWorkspace(req.user!.id, req.params.workspaceId)
  if (!ws) return res.status(404).json({ error: "Workspace not found" })
  const meta = req.query.meta === "1" || req.query.meta === "true"
  const result = await scannerApi.listScans({ workspaceId: ws.id, metaOnly: meta })
  res.json({ scans: result.scans.map(scanToJson) })
})

scansRouter.get("/:workspaceId/scans/:scanId", async (req, res) => {
  const ws = await getOwnedWorkspace(req.user!.id, req.params.workspaceId)
  if (!ws) return res.status(404).json({ error: "Workspace not found" })
  try {
    const result = await scannerApi.getScan({ workspaceId: ws.id, scanId: req.params.scanId })
    res.json({ scan: scanToJson(result.scan) })
  } catch {
    res.status(404).json({ error: "Scan not found" })
  }
})

scansRouter.delete("/:workspaceId/scans/:scanId", async (req, res) => {
  const ws = await getOwnedWorkspace(req.user!.id, req.params.workspaceId)
  if (!ws) return res.status(404).json({ error: "Workspace not found" })
  const result = await scannerApi.deleteScan({ workspaceId: ws.id, scanId: req.params.scanId })
  if (!result.deleted) return res.status(404).json({ error: "Scan not found" })
  await decrementScanUsage(ws.id).catch(() => {})
  res.json({ deleted: true })
})
