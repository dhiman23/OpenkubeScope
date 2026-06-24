// Ported from the cluster helpers in lib/workspace-manager.ts. deleteCluster
// now filters by workspace_id (the monolith relied on RLS) — closes the IDOR
// defense-in-depth gap from the audit, since there's no RLS at this layer.

import { getPool } from "../db"

export interface Cluster {
  id: string
  workspace_id: string
  name: string
  status: string
  created_at: string
  updated_at: string
}

export async function listClusters(workspaceId: string): Promise<Cluster[]> {
  const pool = getPool()
  const { rows } = await pool.query<Cluster>(
    `SELECT id, workspace_id, name, status, created_at, updated_at FROM core.clusters WHERE workspace_id = $1 ORDER BY created_at ASC`,
    [workspaceId],
  )
  return rows
}

export async function createCluster(workspaceId: string, name: string, kubeconfig?: string): Promise<Cluster> {
  const pool = getPool()
  const { rows } = await pool.query<Cluster>(
    `INSERT INTO core.clusters (workspace_id, name, kubeconfig, status) VALUES ($1, $2, $3, 'active')
     RETURNING id, workspace_id, name, status, created_at, updated_at`,
    [workspaceId, name, kubeconfig || null],
  )
  return rows[0]
}

export async function deleteCluster(workspaceId: string, clusterId: string): Promise<boolean> {
  const pool = getPool()
  const result = await pool.query(`DELETE FROM core.clusters WHERE workspace_id = $1 AND id = $2`, [workspaceId, clusterId])
  return (result.rowCount ?? 0) > 0
}
