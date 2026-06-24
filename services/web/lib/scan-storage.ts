// Scan Storage for KubeScope
// Handles scan CRUD with Supabase database
// IMPORTANT: Active scan is now tracked PER WORKSPACE using localStorage

import { createClient } from '@/lib/supabase/client'
import type { Scan, ScanDataset } from '@/lib/rbac-scanner'
import { getSubscription, isPremiumSubscription, FREE_SCAN_LIMIT, ScanLimitError } from '@/lib/subscription'

// Storage key for workspace-specific active scan
const getActiveScanKey = (workspaceId: string) => `kubescope_activeScan_${workspaceId}`

// In-memory cache to avoid redundant DB round-trips when multiple components
// request the same data within a short window (e.g. after a scan-updated event).
const scanCache = new Map<string, { scans: Scan[]; ts: number }>()
const CACHE_TTL_MS = 3_000 // 3 seconds

function getCachedScans(workspaceId: string): Scan[] | null {
  const entry = scanCache.get(workspaceId)
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) {
    return entry.scans
  }
  return null
}

function setCachedScans(workspaceId: string, scans: Scan[]): void {
  scanCache.set(workspaceId, { scans, ts: Date.now() })
}

export function invalidateScanCache(workspaceId?: string): void {
  if (workspaceId) {
    scanCache.delete(workspaceId)
  } else {
    scanCache.clear()
  }
}

export async function saveScans(workspaceId: string, scan: Scan): Promise<Scan> {
  const supabase = createClient()

  // Get current user for user_id
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    console.error('Auth error saving scan:', authError)
    throw new Error('Not authenticated - please log in again')
  }

  // Enforce free-tier scan limit before inserting.
  const subscription = await getSubscription(workspaceId)
  if (!isPremiumSubscription(subscription)) {
    const { count, error: countError } = await supabase
      .from('scans')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
    if (countError) {
      console.error('Error checking scan count:', countError.message)
    } else if ((count ?? 0) >= FREE_SCAN_LIMIT) {
      throw new ScanLimitError(FREE_SCAN_LIMIT)
    }
  }

  const { data, error } = await supabase
    .from('scans')
    .insert({
      workspace_id: workspaceId,
      file_name: scan.fileName,
      cluster_name: scan.clusterName,
      scan_data: scan.dataset,
      totals: scan.totals,
      risk_counts: scan.riskCounts,
      is_summary_mode: scan.isSummaryMode || false,
    })
    .select()
    .single()
  
  if (error) {
    console.error('Error saving scan:', error.message, error.details, error.hint)
    throw new Error(`Failed to save scan: ${error.message}`)
  }
  
  // Invalidate cache so subsequent loads pick up the new scan
  invalidateScanCache(workspaceId)

  // Return the saved scan with DB-assigned ID
  return {
    id: data.id,
    fileName: data.file_name,
    clusterName: data.cluster_name,
    createdAt: data.created_at,
    totals: data.totals,
    riskCounts: data.risk_counts,
    dataset: data.scan_data as ScanDataset,
    isSummaryMode: data.is_summary_mode,
  }
}

export async function loadScans(workspaceId: string): Promise<Scan[]> {
  // Check in-memory cache first
  const cached = getCachedScans(workspaceId)
  if (cached) return cached

  const supabase = createClient()

  // Get current user for user_id filter
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    console.error('Auth error loading scans:', authError)
    return []
  }

  // RLS handles user isolation through workspace relationship
  const { data, error } = await supabase
    .from('scans')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error loading scans:', error.message, error.details)
    return []
  }

  const scans = (data || []).map(s => ({
    id: s.id,
    fileName: s.file_name,
    clusterName: s.cluster_name,
    createdAt: s.created_at,
    totals: s.totals,
    riskCounts: s.risk_counts,
    dataset: s.scan_data as ScanDataset,
    isSummaryMode: s.is_summary_mode,
  }))

  setCachedScans(workspaceId, scans)
  return scans
}

// Lightweight scan list loader: fetches metadata only (no scan_data JSONB).
// Use this for dashboard/list views that only need totals and risk counts.
export async function loadScansMeta(workspaceId: string): Promise<Scan[]> {
  const supabase = createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    console.error('Auth error loading scans meta:', authError)
    return []
  }

  const { data, error } = await supabase
    .from('scans')
    .select('id, workspace_id, file_name, cluster_name, created_at, totals, risk_counts, is_summary_mode')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error loading scans meta:', error.message, error.details)
    return []
  }

  return (data || []).map(s => ({
    id: s.id,
    fileName: s.file_name,
    clusterName: s.cluster_name,
    createdAt: s.created_at,
    totals: s.totals,
    riskCounts: s.risk_counts,
    isSummaryMode: s.is_summary_mode,
  })) as Scan[]
}

// WORKSPACE-SPECIFIC active scan tracking (using localStorage for instant access)
export async function getActiveScanId(workspaceId: string): Promise<string | null> {
  if (typeof window === 'undefined') return null
  
  const key = getActiveScanKey(workspaceId)
  const storedId = localStorage.getItem(key)
  
  if (storedId) {
    return storedId
  }
  
  // If no active scan stored, return null (will fallback to most recent)
  return null
}

export async function setActiveScanId(workspaceId: string, scanId: string): Promise<void> {
  if (typeof window === 'undefined') return
  
  const key = getActiveScanKey(workspaceId)
  localStorage.setItem(key, scanId)
  
}

export async function getActiveScan(workspaceId: string): Promise<Scan | null> {
  const scans = await loadScans(workspaceId)
  
  if (scans.length === 0) {
    return null
  }
  
  const activeScanId = await getActiveScanId(workspaceId)
  
  if (activeScanId) {
    // Find the active scan in this workspace's scans
    const scan = scans.find(s => s.id === activeScanId)
    if (scan) {
      return scan
    }
    // Active scan ID doesn't belong to this workspace, fall back to most recent
  }
  
  // Fallback to most recent scan in this workspace
  const mostRecent = scans[0]
  await setActiveScanId(workspaceId, mostRecent.id)
  return mostRecent
}

export async function deleteScan(scanId: string): Promise<void> {
  const supabase = createClient()
  
  // Get current user for user_id filter (security)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    console.error('Auth error deleting scan:', authError)
    throw new Error('Not authenticated')
  }
  
  // RLS handles user isolation through workspace relationship
  const { error } = await supabase
    .from('scans')
    .delete()
    .eq('id', scanId)

  if (error) {
    console.error('Error deleting scan:', error.message)
    throw new Error(`Failed to delete scan: ${error.message}`)
  }

  // Invalidate all caches (we don't know the workspace_id here)
  invalidateScanCache()
}

// Clear active scan for a workspace (useful when deleting last scan)
export async function clearActiveScanId(workspaceId: string): Promise<void> {
  if (typeof window === 'undefined') return
  
  const key = getActiveScanKey(workspaceId)
  localStorage.removeItem(key)
}
