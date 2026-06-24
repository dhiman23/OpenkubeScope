// Scan storage. Rewired from Supabase to core-api (REST).
// - Snapshot parsing + persistence happens server-side now (core-api -> scanner
//   gRPC); the browser uploads the raw file via uploadScan().
// - Active-scan selection stays in localStorage, per workspace (a UI pointer).

import type { Scan } from "@/lib/rbac-scanner"
import { scansApi } from "./api-client"

const getActiveScanKey = (workspaceId: string) => `kubescope_activeScan_${workspaceId}`

// Cache removed in the core-api migration; kept as a no-op for call-site compat.
export function invalidateScanCache(_workspaceId?: string): void {}

// Upload a snapshot file. core-api parses it (via the scanner service), runs the
// findings engine, persists it, and returns the resulting Scan. The free-tier
// scan limit is enforced server-side; a 402 surfaces as ScanLimitError.
export async function uploadScan(workspaceId: string, file: File): Promise<Scan> {
  const { ScanLimitError } = await import("./subscription")
  try {
    return (await scansApi.upload(workspaceId, file)) as Scan
  } catch (err) {
    const e = err as { status?: number; code?: string }
    if (e?.status === 402 || e?.code === "SCAN_LIMIT_REACHED") {
      throw new ScanLimitError(1)
    }
    throw err
  }
}

export async function loadScans(workspaceId: string): Promise<Scan[]> {
  try {
    return (await scansApi.list(workspaceId, false)) as Scan[]
  } catch {
    return []
  }
}

export async function loadScansMeta(workspaceId: string): Promise<Scan[]> {
  try {
    return (await scansApi.list(workspaceId, true)) as Scan[]
  } catch {
    return []
  }
}

// ---- active scan (localStorage pointer per workspace) ----

export async function getActiveScanId(workspaceId: string): Promise<string | null> {
  if (typeof window === "undefined") return null
  return localStorage.getItem(getActiveScanKey(workspaceId))
}

export async function setActiveScanId(workspaceId: string, scanId: string): Promise<void> {
  if (typeof window === "undefined") return
  localStorage.setItem(getActiveScanKey(workspaceId), scanId)
}

export async function clearActiveScanId(workspaceId: string): Promise<void> {
  if (typeof window === "undefined") return
  localStorage.removeItem(getActiveScanKey(workspaceId))
}

export async function getActiveScan(workspaceId: string): Promise<Scan | null> {
  const scans = await loadScans(workspaceId)
  if (scans.length === 0) return null

  const activeScanId = await getActiveScanId(workspaceId)
  if (activeScanId) {
    const match = scans.find((s) => s.id === activeScanId)
    if (match) return match
  }
  // Fallback: most recent (core-api returns newest-first).
  await setActiveScanId(workspaceId, scans[0].id)
  return scans[0]
}

export async function deleteScan(workspaceId: string, scanId: string): Promise<void> {
  await scansApi.remove(workspaceId, scanId)
}
