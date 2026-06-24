// Report Generator for KubeScope
// Builds report objects from existing scan data — never recomputes RBAC analysis

import { createClient } from '@/lib/supabase/client'
import { updateReport } from '@/lib/report-storage'
import type { Report } from '@/lib/report-storage'
import type { ScanDataset, ScanTotals, ScanRiskCounts, RBACFinding } from '@/lib/rbac-scanner'
import { getFixForRule, getIssueDescriptionForRule, getFixForFinding } from '@/lib/rbac-recommendations'

interface ScanRow {
  id: string
  workspace_id: string
  file_name: string
  cluster_name: string
  scan_data: ScanDataset
  totals: ScanTotals
  risk_counts: ScanRiskCounts
  created_at: string
}

export interface ReportData {
  workspace_id: string
  workspace_name: string
  clusters: string[]
  report_type: Report['report_type']
  format: Report['format']
  generated_at: string
  summary: {
    subjects: number
    roles: number
    bindings: number
  }
  risks: {
    critical: number
    high: number
    medium: number
    low: number
  }
  findings: RBACFinding[]
  rbac_rows: FlatRBACRow[]
  // Type-specific sections
  compliance?: ComplianceSection
  risk_assessment?: RiskAssessmentSection
  trend_analysis?: TrendAnalysisSection
}

export interface FlatRBACRow {
  cluster: string
  subject: string
  type: string
  namespace: string
  role: string
  resource: string
  verbs: string
  risk: string
  issue: string
  recommendation: string
}

interface ComplianceSection {
  cluster_metadata: { name: string; scan_date: string; subjects: number; roles: number; bindings: number }[]
  rbac_summary: { total_subjects: number; total_roles: number; total_bindings: number }
  top_findings: RBACFinding[]
  recommendations: string[]
}

interface RiskAssessmentSection {
  severity_distribution: { critical: number; high: number; medium: number; low: number }
  affected_subjects: { name: string; type: string; finding_count: number; highest_severity: string }[]
  findings_by_category: Record<string, RBACFinding[]>
}

interface TrendAnalysisSection {
  scans_compared: { cluster: string; scan_date: string; risks: ScanRiskCounts }[]
  risk_changes: { severity: string; previous: number; current: number; change: number }[]
  new_risks: RBACFinding[]
  resolved_risks: RBACFinding[]
}

// ============================================
// MAIN GENERATOR
// ============================================

export async function generateReport(report: Report, workspaceName: string): Promise<void> {
  try {
    // 1. Fetch scans for the selected clusters
    const scans = await fetchScansForClusters(report.workspace_id, report.clusters)

    if (scans.length === 0) {
      await updateReport(report.id, {
        status: 'failed',
        error_message: 'No scans found for the selected clusters',
      })
      return
    }

    // 2. Aggregate data from scans (reusing existing processed data)
    const aggregated = aggregateScans(scans)

    // 3. Flatten RBAC rows for CSV/table views
    const rbacRows = flattenRBACRows(scans)

    // 4. Build the report data object
    const reportData: ReportData = {
      workspace_id: report.workspace_id,
      workspace_name: workspaceName,
      clusters: report.clusters,
      report_type: report.report_type,
      format: report.format,
      generated_at: new Date().toISOString(),
      summary: aggregated.totals,
      risks: aggregated.riskCounts,
      findings: aggregated.findings,
      rbac_rows: rbacRows,
    }

    // 5. Add type-specific sections
    switch (report.report_type) {
      case 'COMPLIANCE':
        reportData.compliance = buildComplianceSection(scans, aggregated)
        break
      case 'RISK_ASSESSMENT':
        reportData.risk_assessment = buildRiskAssessmentSection(aggregated)
        break
      case 'RBAC_AUDIT':
        // RBAC audit uses the full rbac_rows — no extra section needed
        break
      case 'TREND_ANALYSIS':
        reportData.trend_analysis = buildTrendAnalysisSection(scans)
        break
    }

    // 6. Generate output file
    let fileContent: string
    let fileSize: string

    switch (report.format) {
      case 'JSON':
        fileContent = JSON.stringify(reportData, null, 2)
        fileSize = formatBytes(new Blob([fileContent]).size)
        break
      case 'CSV':
        fileContent = generateCSV(rbacRows)
        fileSize = formatBytes(new Blob([fileContent]).size)
        break
      case 'PDF':
        // PDF is generated client-side; store the data for PDF rendering
        fileContent = JSON.stringify(reportData)
        fileSize = formatBytes(new Blob([fileContent]).size)
        break
      default:
        fileContent = JSON.stringify(reportData, null, 2)
        fileSize = formatBytes(new Blob([fileContent]).size)
    }

    // 7. Store as data URL for client-side download
    const blob = new Blob([fileContent], {
      type: report.format === 'CSV' ? 'text/csv' : 'application/json',
    })
    const fileUrl = URL.createObjectURL(blob)

    // 8. Update report as completed
    await updateReport(report.id, {
      status: 'completed',
      risk_summary: aggregated.riskCounts,
      report_data: reportData as unknown as Record<string, unknown>,
      file_url: fileUrl,
      file_size: fileSize,
    })
  } catch (err) {
    console.error('Report generation failed:', err)
    await updateReport(report.id, {
      status: 'failed',
      error_message: err instanceof Error ? err.message : 'Unknown error during report generation',
    })
  }
}

// ============================================
// DATA FETCHING (reuses existing scan data)
// ============================================

async function fetchScansForClusters(workspaceId: string, clusters: string[]): Promise<ScanRow[]> {
  const supabase = createClient()

  // Fetch latest scan per cluster
  const { data, error } = await supabase
    .from('scans')
    .select('*')
    .eq('workspace_id', workspaceId)
    .in('cluster_name', clusters)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to fetch scans: ${error.message}`)

  // Keep only the latest scan per cluster
  const latestPerCluster = new Map<string, ScanRow>()
  for (const scan of (data || [])) {
    if (!latestPerCluster.has(scan.cluster_name)) {
      latestPerCluster.set(scan.cluster_name, scan as ScanRow)
    }
  }

  return Array.from(latestPerCluster.values())
}

// ============================================
// AGGREGATION (reuses existing totals/riskCounts)
// ============================================

interface AggregatedData {
  totals: { subjects: number; roles: number; bindings: number }
  riskCounts: { critical: number; high: number; medium: number; low: number }
  findings: RBACFinding[]
}

function aggregateScans(scans: ScanRow[]): AggregatedData {
  const totals = { subjects: 0, roles: 0, bindings: 0 }
  const riskCounts = { critical: 0, high: 0, medium: 0, low: 0 }
  const allFindings: RBACFinding[] = []

  for (const scan of scans) {
    // Reuse pre-computed totals
    totals.subjects += scan.totals?.subjects || 0
    totals.roles += scan.totals?.roles || 0
    totals.bindings += scan.totals?.bindings || 0

    // Reuse pre-computed risk counts
    riskCounts.critical += scan.risk_counts?.critical || 0
    riskCounts.high += scan.risk_counts?.high || 0
    riskCounts.medium += scan.risk_counts?.medium || 0
    riskCounts.low += scan.risk_counts?.low || 0

    // Collect findings from scan_data
    const dataset = scan.scan_data as ScanDataset
    if (dataset?.findings) {
      allFindings.push(...dataset.findings)
    }
  }

  // Sort findings by severity
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
  allFindings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

  return { totals, riskCounts, findings: allFindings }
}

// ============================================
// RBAC ROW FLATTENING
// ============================================

function flattenRBACRows(scans: ScanRow[]): FlatRBACRow[] {
  const rows: FlatRBACRow[] = []

  for (const scan of scans) {
    const dataset = scan.scan_data as ScanDataset
    if (!dataset) continue

    // Build role lookup
    const roleMap = new Map<string, typeof dataset.roles[0]>()
    for (const role of (dataset.roles || [])) {
      roleMap.set(role.name, role)
    }

    // Flatten bindings → rows
    for (const binding of (dataset.bindings || [])) {
      const role = roleMap.get(binding.roleRef.name)
      if (!role) continue

      for (const subject of (binding.subjects || [])) {
        for (const rule of (role.rules || [])) {
          for (const resource of (rule.resources || ['*'])) {
            const risk = assessRuleRisk(rule.verbs, resource)
            rows.push({
              cluster: scan.cluster_name,
              subject: subject.name,
              type: subject.kind,
              namespace: binding.namespace || 'cluster-wide',
              role: role.name,
              resource,
              verbs: (rule.verbs || []).join(', '),
              risk,
              issue: getIssueDescriptionForRule(rule.verbs || [], resource, risk),
              recommendation: getFixForRule(rule.verbs || [], resource),
            })
          }
        }
      }
    }
  }

  return rows
}

function assessRuleRisk(verbs: string[], resource: string): string {
  const hasWildcard = verbs.includes('*') || resource === '*'
  const hasDangerous = verbs.some(v => ['create', 'delete', 'patch', 'update'].includes(v))
  const sensitiveResources = ['secrets', 'configmaps', 'pods', 'deployments', 'daemonsets', 'roles', 'clusterroles', 'rolebindings', 'clusterrolebindings']

  if (hasWildcard) return 'critical'
  if (hasDangerous && sensitiveResources.includes(resource)) return 'high'
  if (hasDangerous) return 'medium'
  return 'low'
}

// ============================================
// REPORT TYPE BUILDERS
// ============================================

function buildComplianceSection(scans: ScanRow[], aggregated: AggregatedData): ComplianceSection {
  return {
    cluster_metadata: scans.map(s => ({
      name: s.cluster_name,
      scan_date: s.created_at,
      subjects: s.totals?.subjects || 0,
      roles: s.totals?.roles || 0,
      bindings: s.totals?.bindings || 0,
    })),
    rbac_summary: {
      total_subjects: aggregated.totals.subjects,
      total_roles: aggregated.totals.roles,
      total_bindings: aggregated.totals.bindings,
    },
    top_findings: aggregated.findings.slice(0, 20),
    recommendations: generateRecommendations(aggregated),
  }
}

function buildRiskAssessmentSection(aggregated: AggregatedData): RiskAssessmentSection {
  // Group findings by affected subject
  const subjectMap = new Map<string, { type: string; findings: RBACFinding[] }>()
  for (const f of aggregated.findings) {
    if (!subjectMap.has(f.subject)) {
      subjectMap.set(f.subject, { type: f.subjectType, findings: [] })
    }
    subjectMap.get(f.subject)!.findings.push(f)
  }

  const affected_subjects = Array.from(subjectMap.entries()).map(([name, data]) => ({
    name,
    type: data.type,
    finding_count: data.findings.length,
    highest_severity: data.findings.reduce((prev, curr) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 }
      return order[curr.severity as keyof typeof order] < order[prev as keyof typeof order] ? curr.severity : prev
    }, 'low' as string),
  })).sort((a, b) => a.finding_count > b.finding_count ? -1 : 1)

  // Group by category
  const findings_by_category: Record<string, RBACFinding[]> = {}
  for (const f of aggregated.findings) {
    if (!findings_by_category[f.category]) findings_by_category[f.category] = []
    findings_by_category[f.category].push(f)
  }

  return {
    severity_distribution: aggregated.riskCounts,
    affected_subjects,
    findings_by_category,
  }
}

function buildTrendAnalysisSection(scans: ScanRow[]): TrendAnalysisSection {
  // Compare scans chronologically
  const scansCompared = scans.map(s => ({
    cluster: s.cluster_name,
    scan_date: s.created_at,
    risks: s.risk_counts,
  }))

  // If we have at least 2 scans, compute changes
  const riskChanges: TrendAnalysisSection['risk_changes'] = []
  if (scans.length >= 2) {
    const current = scans[0].risk_counts
    const previous = scans[scans.length - 1].risk_counts
    for (const sev of ['critical', 'high', 'medium', 'low'] as const) {
      riskChanges.push({
        severity: sev,
        previous: previous?.[sev] || 0,
        current: current?.[sev] || 0,
        change: (current?.[sev] || 0) - (previous?.[sev] || 0),
      })
    }
  }

  // Identify new/resolved risks between scans
  const currentFindings = (scans[0]?.scan_data as ScanDataset)?.findings || []
  const previousFindings = scans.length >= 2
    ? ((scans[scans.length - 1]?.scan_data as ScanDataset)?.findings || [])
    : []

  const prevIds = new Set(previousFindings.map(f => f.id))
  const currIds = new Set(currentFindings.map(f => f.id))

  const newRisks = currentFindings.filter(f => !prevIds.has(f.id))
  const resolvedRisks = previousFindings.filter(f => !currIds.has(f.id))

  return {
    scans_compared: scansCompared,
    risk_changes: riskChanges,
    new_risks: newRisks,
    resolved_risks: resolvedRisks,
  }
}

// ============================================
// RECOMMENDATIONS
// ============================================

function generateRecommendations(aggregated: AggregatedData): string[] {
  const recs: string[] = []

  if (aggregated.riskCounts.critical > 0) {
    recs.push(`Address ${aggregated.riskCounts.critical} critical findings immediately — these represent cluster-admin level risks or wildcard permissions.`)
  }
  if (aggregated.riskCounts.high > 0) {
    recs.push(`Review ${aggregated.riskCounts.high} high-severity findings — these involve write access to sensitive resources like secrets, roles, or bindings.`)
  }

  // Pull concrete fixes from the top 3 critical/high findings
  const topFindings = aggregated.findings
    .filter(f => f.severity === 'critical' || f.severity === 'high')
    .slice(0, 3)
  for (const finding of topFindings) {
    const fix = getFixForFinding(finding)
    recs.push(`[${finding.severity.toUpperCase()}] ${finding.title} → ${fix.summary}`)
  }

  // Category-specific
  const categories = new Set(aggregated.findings.map(f => f.category))
  if (categories.has('OVERLY_PERMISSIVE')) {
    recs.push('Apply the principle of least privilege by scoping wildcard permissions to specific resources and verbs.')
  }
  if (categories.has('PRIVILEGE_ESCALATION')) {
    recs.push('Remove escalate, bind, and impersonate verbs from non-admin roles to prevent privilege escalation paths.')
  }
  if (categories.has('MISCONFIGURATION')) {
    recs.push('Audit orphaned role bindings and unused service accounts to reduce the attack surface.')
  }
  if (categories.has('BEST_PRACTICE')) {
    recs.push('Consider namespace-scoped Roles instead of ClusterRoles where cluster-wide access is not required.')
  }

  if (recs.length === 0) {
    recs.push('No critical issues detected. Continue monitoring RBAC configurations with regular scans.')
  }

  return recs
}

// ============================================
// CSV GENERATION
// ============================================

function generateCSV(rows: FlatRBACRow[]): string {
  const headers = [
    'Cluster',
    'Namespace',
    'Subject',
    'Subject Type',
    'Role',
    'Resource',
    'Verbs',
    'Risk Level',
    'Issue Description',
    'Recommendation',
  ]
  const csvRows = [headers.join(',')]

  for (const row of rows) {
    csvRows.push([
      escapeCSV(row.cluster),
      escapeCSV(row.namespace),
      escapeCSV(row.subject),
      escapeCSV(row.type),
      escapeCSV(row.role),
      escapeCSV(row.resource),
      escapeCSV(row.verbs),
      escapeCSV(row.risk),
      escapeCSV(row.issue),
      escapeCSV(row.recommendation),
    ].join(','))
  }

  return csvRows.join('\n')
}

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

// ============================================
// UTILS
// ============================================

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}
