// Workspace Management for KubeScope
// Handles workspace CRUD with Supabase database

import { createClient } from '@/lib/supabase/client'

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

// ============================================
// INITIALIZATION
// ============================================

const DEFAULT_WORKSPACES = [
  { name: "Production", id: "ws_prod" },
  { name: "Staging", id: "ws_staging" },
  { name: "QA", id: "ws_qa" },
  { name: "Development", id: "ws_dev" },
]

// Export for onboarding page compatibility
export const SUGGESTED_WORKSPACES = DEFAULT_WORKSPACES

export async function initializeWorkspaces(): Promise<void> {
  const supabase = createClient()
  
  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  
  // Check if user already has workspaces
  const { data: existing } = await supabase
    .from('workspaces')
    .select('id')
    .eq('user_id', user.id)
    .limit(1)
  
  // Only initialize if no workspaces exist
  if (!existing || existing.length === 0) {
    const workspaces = DEFAULT_WORKSPACES.map(ws => ({
      name: ws.name,
      user_id: user.id,
      description: `${ws.name} environment`,
    }))
    
    await supabase.from('workspaces').insert(workspaces)
  }
}

// ============================================
// WORKSPACE CRUD
// ============================================

export async function getWorkspaces(): Promise<Workspace[]> {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  
  const { data, error } = await supabase
    .from('workspaces')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
  
  if (error) {
    console.error('Error fetching workspaces:', error)
    return []
  }
  
  return (data || []).map(w => ({
    id: w.id,
    name: w.name,
    description: w.description,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
    user_id: w.user_id,
  }))
}

export async function getActiveWorkspaceId(): Promise<string | null> {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  
  const { data } = await supabase
    .from('user_settings')
    .select('active_workspace_id')
    .eq('user_id', user.id)
    .single()
  
  return data?.active_workspace_id || null
}

/**
 * Gets the active workspace ID, creating a default workspace if none exists.
 * This ensures scans can always be saved even if user_settings is empty.
 */
export async function getOrCreateActiveWorkspaceId(): Promise<string | null> {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  
  // First try to get existing active workspace
  const activeId = await getActiveWorkspaceId()
  if (activeId) {
    // Verify the workspace still exists
    const { data: wsExists } = await supabase
      .from('workspaces')
      .select('id')
      .eq('id', activeId)
      .eq('user_id', user.id)
      .single()
    
    if (wsExists) return activeId
  }
  
  // No active workspace set, check if user has any workspaces
  const workspaces = await getWorkspaces()
  
  if (workspaces.length > 0) {
    // Set the first workspace as active
    await setActiveWorkspaceId(workspaces[0].id)
    return workspaces[0].id
  }
  
  // No workspaces exist, create a default one
  try {
    const { data, error } = await supabase
      .from('workspaces')
      .insert({
        name: "Default Workspace",
        user_id: user.id,
        description: "Auto-created default workspace",
      })
      .select()
      .single()
    
    if (error) {
      console.error('Error creating default workspace:', error)
      return null
    }
    
    // Set it as active
    await setActiveWorkspaceId(data.id)
    return data.id
  } catch (err) {
    console.error('Failed to create default workspace:', err)
    return null
  }
}

export async function setActiveWorkspaceId(workspaceId: string): Promise<void> {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  
  const current = await getActiveWorkspaceId()
  
  // Only update if actually changing
  if (current !== workspaceId) {
    await supabase
      .from('user_settings')
      .upsert({
        user_id: user.id,
        active_workspace_id: workspaceId,
        updated_at: new Date().toISOString(),
      })
    
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent("kubescope-workspace-changed", { 
        detail: { workspaceId } 
      }))
    }
  }
}

export async function getActiveWorkspace(): Promise<Workspace | null> {
  const workspaces = await getWorkspaces()
  const activeId = await getActiveWorkspaceId()
  
  if (activeId) {
    const workspace = workspaces.find(w => w.id === activeId)
    if (workspace) return workspace
  }
  
  // Fallback to first workspace
  if (workspaces.length > 0) {
    await setActiveWorkspaceId(workspaces[0].id)
    return workspaces[0]
  }
  
  return null
}

export async function createWorkspace(name: string): Promise<Workspace> {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('User not authenticated')
  
  const workspaces = await getWorkspaces()
  
  // Check for duplicate name (case-insensitive, trimmed)
  const trimmedName = name.trim()
  const nameLower = trimmedName.toLowerCase()
  const exists = workspaces.some(w => w.name.trim().toLowerCase() === nameLower)
  
  if (exists) {
    throw new Error(`Workspace "${trimmedName}" already exists`)
  }
  
  const { data, error } = await supabase
    .from('workspaces')
    .insert({
      name: trimmedName,
      user_id: user.id,
    })
    .select()
    .single()
  
  if (error) {
    console.error('Error creating workspace:', error)
    throw new Error('Failed to create workspace')
  }
  
  return {
    id: data.id,
    name: data.name,
    description: data.description,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    user_id: data.user_id,
  }
}

export async function deleteWorkspace(workspaceId: string): Promise<void> {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    console.error('Cannot delete workspace: User not authenticated')
    throw new Error('User not authenticated')
  }
  
  // Delete workspace (cascades to clusters and scans via FK)
  const { error } = await supabase
    .from('workspaces')
    .delete()
    .eq('id', workspaceId)
    .eq('user_id', user.id)
  
  if (error) {
    console.error('Error deleting workspace:', error)
    throw new Error(`Failed to delete workspace: ${error.message}`)
  }
  
  // If deleted active workspace, switch to first available
  const activeId = await getActiveWorkspaceId()
  if (activeId === workspaceId) {
    const workspaces = await getWorkspaces()
    if (workspaces.length > 0) {
      await setActiveWorkspaceId(workspaces[0].id)
    }
  }
}

export async function updateWorkspace(workspaceId: string, updates: Partial<Workspace>): Promise<void> {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  
  // Check for duplicate name if name is being updated
  if (updates.name) {
    const workspaces = await getWorkspaces()
    const trimmedName = updates.name.trim()
    const nameLower = trimmedName.toLowerCase()
    const duplicate = workspaces.find(w => 
      w.id !== workspaceId && w.name.trim().toLowerCase() === nameLower
    )
    if (duplicate) {
      throw new Error(`Workspace "${trimmedName}" already exists`)
    }
    updates.name = trimmedName
  }
  
  const { error } = await supabase
    .from('workspaces')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', workspaceId)
    .eq('user_id', user.id)
  
  if (error) {
    console.error('Error updating workspace:', error)
  }
}

// ============================================
// WORKSPACE MODE & ONBOARDING
// ============================================

declare global {
  interface Window {
    __kubescopeDebug?: () => void
    __kubescopeDBDebug?: () => Promise<void>
  }
}

export type WorkspaceMode = "demo" | "real"

export async function getWorkspaceMode(): Promise<WorkspaceMode> {
  if (typeof window === "undefined") return "demo"
  
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return "demo"
  
  const { data } = await supabase
    .from('user_settings')
    .select('workspace_mode')
    .eq('user_id', user.id)
    .single()
  
  return (data?.workspace_mode as WorkspaceMode) || "demo"
}

export async function setWorkspaceMode(mode: WorkspaceMode): Promise<void> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  
  await supabase
    .from('user_settings')
    .upsert({
      user_id: user.id,
      workspace_mode: mode,
      updated_at: new Date().toISOString(),
    })
}

export async function isOnboardingCompleted(): Promise<boolean> {
  if (typeof window === "undefined") return false
  
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  
  const { data } = await supabase
    .from('user_settings')
    .select('onboarding_completed')
    .eq('user_id', user.id)
    .single()
  
  return data?.onboarding_completed || false
}

export async function setOnboardingCompleted(completed: boolean): Promise<void> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  
  await supabase
    .from('user_settings')
    .upsert({
      user_id: user.id,
      onboarding_completed: completed,
      updated_at: new Date().toISOString(),
    })
}

export async function getDisplayName(): Promise<string> {
  if (typeof window === "undefined") return "User"
  
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return "User"
  
  const { data } = await supabase
    .from('user_settings')
    .select('display_name')
    .eq('user_id', user.id)
    .single()
  
  return data?.display_name || user.email?.split('@')[0] || "User"
}

export async function setDisplayName(name: string): Promise<void> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  
  await supabase
    .from('user_settings')
    .upsert({
      user_id: user.id,
      display_name: name,
      updated_at: new Date().toISOString(),
    })
}

export async function setActiveWorkspace(workspaceId: string): Promise<void> {
  await setActiveWorkspaceId(workspaceId)
}

export async function ensureDemoWorkspace(): Promise<Workspace> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('User not authenticated')
  
  const workspaces = await getWorkspaces()
  let demoWorkspace = workspaces.find(w => w.name === "Demo Workspace")
  
  if (!demoWorkspace) {
    const { data, error } = await supabase
      .from('workspaces')
      .insert({
        name: "Demo Workspace",
        user_id: user.id,
        description: "Demo environment",
      })
      .select()
      .single()
    
    if (error) {
      console.error('Error creating demo workspace:', error)
      throw new Error('Failed to create demo workspace')
    }
    
    demoWorkspace = {
      id: data.id,
      name: data.name,
      description: data.description,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      user_id: data.user_id,
    }
  }
  
  return demoWorkspace
}

// ============================================
// CLUSTERS (NEW)
// ============================================

export async function getClusters(workspaceId: string): Promise<Cluster[]> {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('clusters')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true })
  
  if (error) {
    console.error('Error fetching clusters:', error)
    return []
  }
  
  return (data || []).map(c => ({
    id: c.id,
    workspace_id: c.workspace_id,
    name: c.name,
    kubeconfig: c.kubeconfig,
    status: c.status,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  }))
}

export async function createCluster(workspaceId: string, name: string, kubeconfig?: string): Promise<Cluster> {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('clusters')
    .insert({
      workspace_id: workspaceId,
      name,
      kubeconfig,
      status: 'active',
    })
    .select()
    .single()
  
  if (error) {
    console.error('Error creating cluster:', error)
    throw new Error('Failed to create cluster')
  }
  
  return {
    id: data.id,
    workspace_id: data.workspace_id,
    name: data.name,
    kubeconfig: data.kubeconfig,
    status: data.status,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  }
}

export async function deleteCluster(clusterId: string): Promise<void> {
  const supabase = createClient()
  
  const { error } = await supabase
    .from('clusters')
    .delete()
    .eq('id', clusterId)
  
  if (error) {
    console.error('Error deleting cluster:', error)
  }
}

// ============================================
// DEBUG HELPER
// ============================================

export function setupDebugHelper(): void {
  if (typeof window !== "undefined") {
    window.__kubescopeDBDebug = async () => {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      
      // Get workspaces
      const workspaces = await getWorkspaces()
      const activeWorkspace = await getActiveWorkspace()
      const activeWorkspaceId = await getActiveWorkspaceId()
      
      // Get user settings
      const { data: userSettings } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user?.id || '')
        .single()
      
      // Get scans for active workspace
      let scans: unknown[] = []
      if (activeWorkspaceId) {
        const { data } = await supabase
          .from('scans')
          .select('id, file_name, cluster_name, created_at')
          .eq('workspace_id', activeWorkspaceId)
          .order('created_at', { ascending: false })
        scans = data || []
      }
      
      console.group("🔍 KubeScope Database Debug Info")
      console.log("📧 User:", user?.email || "Not logged in")
      console.log("🆔 User ID:", user?.id || "N/A")
      console.log("")
      console.log("🏢 Active Workspace ID:", activeWorkspaceId || "None")
      console.log("🏢 Active Workspace:", activeWorkspace?.name || "None")
      console.log("")
      console.log("📋 All Workspaces:", workspaces.map(w => ({ id: w.id, name: w.name })))
      console.log("")
      console.log("⚙️ User Settings:", userSettings || "None")
      console.log("")
      console.log("📊 Scans in Active Workspace:", scans)
      console.groupEnd()
    }
    
    // Also add alias for convenience
    window.__kubescopeDebug = window.__kubescopeDBDebug
  }
}
