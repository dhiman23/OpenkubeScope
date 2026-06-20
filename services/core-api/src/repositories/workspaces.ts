// Ported from lib/workspace-manager.ts. All operations take the authenticated
// user id explicitly (no Supabase session) and filter by it — this is the
// ownership boundary that lets us trust the workspace_id we forward to the
// scanner/report gRPC services.

import { getPool } from "../db"

export interface Workspace {
  id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

export async function listWorkspaces(userId: string): Promise<Workspace[]> {
  const pool = getPool()
  const { rows } = await pool.query<Workspace>(
    `SELECT id, name, description, created_at, updated_at FROM core.workspaces WHERE user_id = $1 ORDER BY created_at ASC`,
    [userId],
  )
  return rows
}

// Returns the workspace if owned by userId, else null. Used as the ownership
// gate before any scanner/report gRPC call.
export async function getOwnedWorkspace(userId: string, workspaceId: string): Promise<Workspace | null> {
  const pool = getPool()
  const { rows } = await pool.query<Workspace>(
    `SELECT id, name, description, created_at, updated_at FROM core.workspaces WHERE id = $1 AND user_id = $2`,
    [workspaceId, userId],
  )
  return rows[0] || null
}

export async function createWorkspace(userId: string, name: string, description?: string): Promise<Workspace> {
  const pool = getPool()
  const { rows } = await pool.query<Workspace>(
    `INSERT INTO core.workspaces (user_id, name, description) VALUES ($1, $2, $3)
     RETURNING id, name, description, created_at, updated_at`,
    [userId, name.trim(), description || null],
  )
  return rows[0]
}

export async function updateWorkspace(userId: string, workspaceId: string, updates: { name?: string; description?: string }): Promise<Workspace | null> {
  const pool = getPool()
  const { rows } = await pool.query<Workspace>(
    `UPDATE core.workspaces SET name = COALESCE($3, name), description = COALESCE($4, description)
      WHERE id = $1 AND user_id = $2
      RETURNING id, name, description, created_at, updated_at`,
    [workspaceId, userId, updates.name?.trim() ?? null, updates.description ?? null],
  )
  return rows[0] || null
}

export async function deleteWorkspace(userId: string, workspaceId: string): Promise<boolean> {
  const pool = getPool()
  const result = await pool.query(`DELETE FROM core.workspaces WHERE id = $1 AND user_id = $2`, [workspaceId, userId])
  return (result.rowCount ?? 0) > 0
}

// Ensures the user has at least one workspace; returns the active/first id.
// Mirrors getOrCreateActiveWorkspaceId() in the monolith.
export async function getOrCreateActiveWorkspaceId(userId: string): Promise<string> {
  const pool = getPool()

  const settings = await pool.query<{ active_workspace_id: string | null }>(
    `SELECT active_workspace_id FROM core.user_settings WHERE user_id = $1`,
    [userId],
  )
  const activeId = settings.rows[0]?.active_workspace_id
  if (activeId) {
    const owned = await getOwnedWorkspace(userId, activeId)
    if (owned) return owned.id
  }

  const existing = await listWorkspaces(userId)
  if (existing.length > 0) {
    await setActiveWorkspace(userId, existing[0].id)
    return existing[0].id
  }

  const created = await createWorkspace(userId, "Default Workspace", "Auto-created default workspace")
  await setActiveWorkspace(userId, created.id)
  return created.id
}

export async function setActiveWorkspace(userId: string, workspaceId: string): Promise<void> {
  const pool = getPool()
  await pool.query(
    `INSERT INTO core.user_settings (user_id, active_workspace_id) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET active_workspace_id = EXCLUDED.active_workspace_id`,
    [userId, workspaceId],
  )
}
