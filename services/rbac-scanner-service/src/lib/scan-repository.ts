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
import type { Scan, ScanDataset } from "./rbac-engine"

interface ScanRow {
  id: string
  workspace_id: string
  file_name: string
  cluster_name: string
  scan_data: ScanDataset
  totals: Scan["totals"]
  risk_counts: Scan["riskCounts"]
  is_summary_mode: boolean
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
    dataset: row.scan_data,
    isSummaryMode: row.is_summary_mode,
  }
}

export async function saveScan(workspaceId: string, scan: Scan): Promise<Scan> {
  const pool = getPool()

  const { rows } = await pool.query<ScanRow>(
    `INSERT INTO scanner.scans
       (workspace_id, file_name, cluster_name, scan_data, totals, risk_counts, is_summary_mode)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, workspace_id, file_name, cluster_name, scan_data, totals, risk_counts, is_summary_mode, created_at`,
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
    `SELECT id, workspace_id, file_name, cluster_name, scan_data, totals, risk_counts, is_summary_mode, created_at
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
            id, workspace_id, file_name, cluster_name, ${dataCol}, totals, risk_counts, is_summary_mode, created_at
       FROM scanner.scans
      WHERE workspace_id = $1 AND cluster_name = ANY($2::text[])
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
    `SELECT id, workspace_id, file_name, cluster_name, ${dataCol}, totals, risk_counts, is_summary_mode, created_at
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
