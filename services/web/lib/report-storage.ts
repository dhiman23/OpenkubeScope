// Report Storage for KubeScope
// Handles report CRUD operations with Supabase

import { createClient } from '@/lib/supabase/client'

export interface Report {
  id: string
  workspace_id: string
  scan_ids: string[]
  report_name: string
  report_type: 'COMPLIANCE' | 'RISK_ASSESSMENT' | 'RBAC_AUDIT' | 'TREND_ANALYSIS'
  format: 'PDF' | 'JSON' | 'CSV'
  clusters: string[]
  status: 'generating' | 'completed' | 'failed'
  risk_summary: {
    critical: number
    high: number
    medium: number
    low: number
  }
  report_data: Record<string, unknown> | null
  file_url: string | null
  file_size: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}

export async function createReport(params: {
  workspace_id: string
  scan_ids: string[]
  report_name: string
  report_type: Report['report_type']
  format: Report['format']
  clusters: string[]
}): Promise<Report> {
  const supabase = createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('reports')
    .insert({
      workspace_id: params.workspace_id,
      scan_ids: params.scan_ids,
      report_name: params.report_name,
      report_type: params.report_type,
      format: params.format,
      clusters: params.clusters,
      status: 'generating',
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to create report: ${error.message}`)
  return data as Report
}

export async function updateReport(
  reportId: string,
  updates: Partial<Pick<Report, 'status' | 'risk_summary' | 'report_data' | 'file_url' | 'file_size' | 'error_message'>>
): Promise<Report> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('reports')
    .update(updates)
    .eq('id', reportId)
    .select()
    .single()

  if (error) throw new Error(`Failed to update report: ${error.message}`)
  return data as Report
}

export async function loadReports(workspaceId: string): Promise<Report[]> {
  const supabase = createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return []

  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error loading reports:', error.message)
    return []
  }

  return (data || []) as Report[]
}

export async function deleteReport(reportId: string): Promise<void> {
  const supabase = createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Not authenticated')

  const { error } = await supabase
    .from('reports')
    .delete()
    .eq('id', reportId)

  if (error) throw new Error(`Failed to delete report: ${error.message}`)
}

export async function getReport(reportId: string): Promise<Report | null> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .eq('id', reportId)
    .single()

  if (error) return null
  return data as Report
}
