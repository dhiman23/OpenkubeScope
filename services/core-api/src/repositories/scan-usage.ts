// Free-tier scan quota. The scans live in rbac-scanner-service; this counter is
// core-api's billing-side enforcement (the limit was deliberately NOT ported
// into the scanner). Replaces the monolith's count-then-insert (TOCTOU race
// flagged in the audit) with an atomic conditional increment.

import { getPool } from "../db"

// Atomically reserve a scan slot for a free-tier workspace. Returns true if a
// slot was granted (under the limit), false if the limit is already reached.
// The conditional ON CONFLICT ... WHERE makes the check-and-increment a single
// statement, so two concurrent uploads can't both pass.
export async function tryReserveFreeScanSlot(workspaceId: string, limit: number): Promise<boolean> {
  const pool = getPool()
  const { rows } = await pool.query<{ scan_count: number }>(
    `INSERT INTO core.scan_usage (workspace_id, scan_count) VALUES ($1, 1)
     ON CONFLICT (workspace_id) DO UPDATE
       SET scan_count = core.scan_usage.scan_count + 1, updated_at = NOW()
       WHERE core.scan_usage.scan_count < $2
     RETURNING scan_count`,
    [workspaceId, limit],
  )
  return rows.length > 0
}

// Premium workspaces have no limit — just bump the counter for visibility.
export async function incrementScanUsage(workspaceId: string): Promise<void> {
  const pool = getPool()
  await pool.query(
    `INSERT INTO core.scan_usage (workspace_id, scan_count) VALUES ($1, 1)
     ON CONFLICT (workspace_id) DO UPDATE SET scan_count = core.scan_usage.scan_count + 1, updated_at = NOW()`,
    [workspaceId],
  )
}

export async function decrementScanUsage(workspaceId: string): Promise<void> {
  const pool = getPool()
  await pool.query(
    `UPDATE core.scan_usage SET scan_count = GREATEST(scan_count - 1, 0), updated_at = NOW() WHERE workspace_id = $1`,
    [workspaceId],
  )
}
