// Owns all reads/writes to scanner.scans (RDS Postgres, raw SQL via `pg`).
// Ported from lib/scan-storage.ts in the monolith, with changes for the
// service split:
//
// 1. No auth.getUser() / localStorage — there's no end-user session here.
//    The caller (core-api) has already verified workspace ownership.
// 2. Free-tier scan-limit enforcement (FREE_SCAN_LIMIT) is NOT ported here.
//    Quota/billing is core-api's domain; core-api must check quota via its
//    own logic before calling ScanSnapshot.
// 3. deleteScan requires workspace_id and filters on it (the monolith's
//    version filtered by id only, relying solely on RLS). There is no RLS
//    here — Postgres is reached directly — so this filter is the only
//    thing preventing cross-workspace deletes.
// 4. All queries are parameterized ($1, $2, ...) — never interpolate
//    workspaceId/scanId/clusterNames into SQL strings.

import { getPool } from "./db"
import type { Scan, ScanDataset, ScanStatusStr } from "./rbac-engine"

const EMPTY_DATASET: ScanDataset = { subjects: [], roles: [], bindings: [], findings: [] }

interface ScanRow {
  id: string
  workspace_id: string
  file_name: string
  cluster_name: string
  scan_data: ScanDataset | null // NULL while a scan is pending (async path)
  totals: Scan["totals"]
  risk_counts: Scan["riskCounts"]
  is_summary_mode: boolean
  status: ScanStatusStr
  error_message: string | null
  created_at: string
}

function rowToScan(row: ScanRow): Scan {
  return {
    id: row.id,
    fileName: row.file_name,
    clusterName: row.cluster_name,
    createdAt: row.created_at,
    totals: row.totals,
    riskCounts: row.risk_counts,
    dataset: row.scan_data || EMPTY_DATASET,
    isSummaryMode: row.is_summary_mode,
    status: row.status,
    errorMessage: row.error_message,
  }
}

export async function saveScan(workspaceId: string, scan: Scan): Promise<Scan> {
  const pool = getPool()

  const { rows } = await pool.query<ScanRow>(
    `INSERT INTO scanner.scans
       (workspace_id, file_name, cluster_name, scan_data, totals, risk_counts, is_summary_mode)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, workspace_id, file_name, cluster_name, scan_data, totals, risk_counts, is_summary_mode, status, error_message, created_at`,
    [
      workspaceId,
      scan.fileName,
      scan.clusterName,
      JSON.stringify(scan.dataset),
      JSON.stringify(scan.totals),
      JSON.stringify(scan.riskCounts),
      scan.isSummaryMode || false,
    ],
  )

  return rowToScan(rows[0])
}

export async function getScan(workspaceId: string, scanId: string): Promise<Scan | null> {
  const pool = getPool()

  const { rows } = await pool.query<ScanRow>(
    `SELECT id, workspace_id, file_name, cluster_name, scan_data, totals, risk_counts, is_summary_mode, status, error_message, created_at
       FROM scanner.scans
      WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, scanId],
  )

  return rows[0] ? rowToScan(rows[0]) : null
}

// Returns the latest scan per requested cluster name, scoped to one workspace.
// metaOnly skips scan_data (subjects/roles/bindings) for list views, mirroring
// loadScansMeta() in the monolith.
export async function listLatestScansByCluster(workspaceId: string, clusterNames: string[], metaOnly: boolean): Promise<Scan[]> {
  const pool = getPool()

  const dataCol = metaOnly ? `'{"subjects":[],"roles":[],"bindings":[],"findings":[]}'::jsonb AS scan_data` : "scan_data"

  const { rows } = await pool.query<ScanRow>(
    `SELECT DISTINCT ON (cluster_name)
            id, workspace_id, file_name, cluster_name, ${dataCol}, totals, risk_counts, is_summary_mode, status, error_message, created_at
       FROM scanner.scans
      WHERE workspace_id = $1 AND cluster_name = ANY($2::text[]) AND status = 'completed'
      ORDER BY cluster_name, created_at DESC`,
    [workspaceId, clusterNames],
  )

  return rows.map(rowToScan)
}

// All scans for a workspace, newest first (mirrors loadScans/loadScansMeta).
export async function listScans(workspaceId: string, metaOnly: boolean): Promise<Scan[]> {
  const pool = getPool()

  const dataCol = metaOnly ? `'{"subjects":[],"roles":[],"bindings":[],"findings":[]}'::jsonb AS scan_data` : "scan_data"

  const { rows } = await pool.query<ScanRow>(
    `SELECT id, workspace_id, file_name, cluster_name, ${dataCol}, totals, risk_counts, is_summary_mode, status, error_message, created_at
       FROM scanner.scans
      WHERE workspace_id = $1
      ORDER BY created_at DESC`,
    [workspaceId],
  )

  return rows.map(rowToScan)
}

export async function deleteScan(workspaceId: string, scanId: string): Promise<boolean> {
  const pool = getPool()

  const result = await pool.query(`DELETE FROM scanner.scans WHERE workspace_id = $1 AND id = $2`, [workspaceId, scanId])

  return (result.rowCount ?? 0) > 0
}

// ---- async (SQS) scan intake ----
// SubmitScan persists the raw snapshot in a 'pending' row; the SQS consumer
// loads it back, runs the engine, and moves the row to completed/failed.
// raw_snapshot is cleared on both terminal states so blobs don't accumulate.

export async function createPendingScan(workspaceId: string, fileName: string, rawSnapshot: Buffer): Promise<string> {
  const pool = getPool()

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO scanner.scans (workspace_id, file_name, status, raw_snapshot)
     VALUES ($1, $2, 'pending', $3)
     RETURNING id`,
    [workspaceId, fileName, rawSnapshot],
  )

  return rows[0].id
}

export async function getPendingScanJob(
  workspaceId: string,
  scanId: string,
): Promise<{ status: ScanStatusStr; fileName: string; rawSnapshot: Buffer | null } | null> {
  const pool = getPool()

  const { rows } = await pool.query<{ status: ScanStatusStr; file_name: string; raw_snapshot: Buffer | null }>(
    `SELECT status, file_name, raw_snapshot FROM scanner.scans WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, scanId],
  )

  const row = rows[0]
  return row ? { status: row.status, fileName: row.file_name, rawSnapshot: row.raw_snapshot } : null
}

export async function completePendingScan(workspaceId: string, scanId: string, scan: Scan): Promise<void> {
  const pool = getPool()

  await pool.query(
    `UPDATE scanner.scans
        SET cluster_name = $3, scan_data = $4, totals = $5, risk_counts = $6, is_summary_mode = $7,
            status = 'completed', error_message = NULL, raw_snapshot = NULL
      WHERE workspace_id = $1 AND id = $2`,
    [
      workspaceId,
      scanId,
      scan.clusterName,
      JSON.stringify(scan.dataset),
      JSON.stringify(scan.totals),
      JSON.stringify(scan.riskCounts),
      scan.isSummaryMode || false,
    ],
  )
}

export async function failPendingScan(workspaceId: string, scanId: string, errorMessage: string): Promise<void> {
  const pool = getPool()

  await pool.query(
    `UPDATE scanner.scans SET status = 'failed', error_message = $3, raw_snapshot = NULL
      WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, scanId, errorMessage],
  )
}
