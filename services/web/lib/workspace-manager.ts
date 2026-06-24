// Workspace + cluster management. Rewired from Supabase to core-api (REST).
// Function signatures are unchanged so the pages that import them keep working.
//
// UI-only preferences (workspace mode / onboarding / display name) live in
// localStorage now — core-api doesn't expose a user_settings endpoint, and
// these are per-browser display state, not authoritative data.

import { workspacesApi, clustersApi, getLocalActiveWorkspace, setLocalActiveWorkspace, type ApiWorkspace, type ApiCluster } from "./api-client"

export interface Workspace {
  id: string
  name: string
  description?: string
  createdAt: string
  updatedAt?: string
  user_id?: string
}

export interface Cluster {
  id: string
  workspace_id: string
  name: string
  kubeconfig?: string
  status?: string
  createdAt: string
  updatedAt?: string
}

const DEFAULT_WORKSPACES = [
  { name: "Production", id: "ws_prod" },
  { name: "Staging", id: "ws_staging" },
  { name: "QA", id: "ws_qa" },
  { name: "Development", id: "ws_dev" },
]
export const SUGGESTED_WORKSPACES = DEFAULT_WORKSPACES

function toWorkspace(w: ApiWorkspace): Workspace {
  return { id: w.id, name: w.name, description: w.description ?? undefined, createdAt: w.created_at, updatedAt: w.updated_at }
}
function toCluster(c: ApiCluster): Cluster {
  return { id: c.id, workspace_id: c.workspace_id, name: c.name, status: c.status, createdAt: c.created_at, updatedAt: c.updated_at }
}

// ============================================
// WORKSPACE CRUD
// ============================================

export async function getWorkspaces(): Promise<Workspace[]> {
  try {
    return (await workspacesApi.list()).map(toWorkspace)
  } catch {
    return []
  }
}

export async function getActiveWorkspaceId(): Promise<string | null> {
  return getLocalActiveWorkspace()
}

export async function getOrCreateActiveWorkspaceId(): Promise<string | null> {
  const workspaces = await getWorkspaces()

  const localId = getLocalActiveWorkspace()
  if (localId && workspaces.some((w) => w.id === localId)) return localId

  if (workspaces.length > 0) {
    await setActiveWorkspaceId(workspaces[0].id)
    return workspaces[0].id
  }

  // None yet — create a default workspace.
  try {
    const created = toWorkspace(await workspacesApi.create("Default Workspace", "Auto-created default workspace"))
    await setActiveWorkspaceId(created.id)
    return created.id
  } catch {
    return null
  }
}

export async function setActiveWorkspaceId(workspaceId: string): Promise<void> {
  setLocalActiveWorkspace(workspaceId)
  // Best-effort server-side pointer; ignore failures.
  workspacesApi.activate(workspaceId).catch(() => {})
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("kubescope-workspace-changed", { detail: { workspaceId } }))
  }
}

export async function setActiveWorkspace(workspaceId: string): Promise<void> {
  await setActiveWorkspaceId(workspaceId)
}

export async function getActiveWorkspace(): Promise<Workspace | null> {
  const workspaces = await getWorkspaces()
  const activeId = getLocalActiveWorkspace()
  const found = activeId ? workspaces.find((w) => w.id === activeId) : undefined
  if (found) return found
  if (workspaces.length > 0) {
    await setActiveWorkspaceId(workspaces[0].id)
    return workspaces[0]
  }
  return null
}

export async function createWorkspace(name: string): Promise<Workspace> {
  return toWorkspace(await workspacesApi.create(name.trim()))
}

export async function deleteWorkspace(workspaceId: string): Promise<void> {
  await workspacesApi.remove(workspaceId)
  if (getLocalActiveWorkspace() === workspaceId) {
    const remaining = await getWorkspaces()
    if (remaining.length > 0) await setActiveWorkspaceId(remaining[0].id)
  }
}

export async function updateWorkspace(workspaceId: string, updates: Partial<Workspace>): Promise<void> {
  await workspacesApi.update(workspaceId, { name: updates.name, description: updates.description })
}

export async function initializeWorkspaces(): Promise<void> {
  // core-api auto-creates a default workspace on demand (getOrCreateActiveWorkspaceId).
  // Kept as a no-op for call-site compatibility.
}

export async function ensureDemoWorkspace(): Promise<Workspace> {
  const workspaces = await getWorkspaces()
  const existing = workspaces.find((w) => w.name === "Demo Workspace")
  if (existing) return existing
  return toWorkspace(await workspacesApi.create("Demo Workspace", "Demo environment"))
}

// ============================================
// CLUSTERS
// ============================================

export async function getClusters(workspaceId: string): Promise<Cluster[]> {
  try {
    return (await clustersApi.list(workspaceId)).map(toCluster)
  } catch {
    return []
  }
}

export async function createCluster(workspaceId: string, name: string, kubeconfig?: string): Promise<Cluster> {
  return toCluster(await clustersApi.create(workspaceId, name, kubeconfig))
}

export async function deleteCluster(workspaceId: string, clusterId: string): Promise<void> {
  await clustersApi.remove(workspaceId, clusterId)
}

// ============================================
// UI PREFERENCES (localStorage — per-browser display state)
// ============================================

export type WorkspaceMode = "demo" | "real"

function pref(key: string): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem(key)
}
function setPref(key: string, val: string): void {
  if (typeof window === "undefined") return
  localStorage.setItem(key, val)
}

export async function getWorkspaceMode(): Promise<WorkspaceMode> {
  return (pref("kubescope_mode") as WorkspaceMode) || "real"
}
export async function setWorkspaceMode(mode: WorkspaceMode): Promise<void> {
  setPref("kubescope_mode", mode)
}
export async function isOnboardingCompleted(): Promise<boolean> {
  return pref("kubescope_onboarded") === "1"
}
export async function setOnboardingCompleted(completed: boolean): Promise<void> {
  setPref("kubescope_onboarded", completed ? "1" : "0")
}
export async function getDisplayName(): Promise<string> {
  return pref("kubescope_display_name") || "User"
}
export async function setDisplayName(name: string): Promise<void> {
  setPref("kubescope_display_name", name)
}

// Debug helper removed with the Supabase migration.
export function setupDebugHelper(): void {}
