// Report builder — ported from lib/report-generator.ts in the monolith.
// Difference: the monolith fetched scans from Supabase inline. Here the scans
// are fetched via the scanner gRPC client by the caller (server.ts) and passed
// in as ScanRow[], so this module is pure (no I/O). Output file generation
// (JSON/CSV/PDF bytes) also lives here instead of creating browser blob URLs.

import { getFixForRule, getIssueDescriptionForRule, getFixForFinding } from "./rbac-recommendations"
import { generatePDFReport } from "./report-pdf"
import type { RBACFinding, ScanDataset, ScanRow, ReportType, ReportFormat } from "./rbac-types"

export interface ReportData {
  workspace_id: string
  workspace_name: string
  clusters: string[]
  report_type: ReportType
  format: ReportFormat
  generated_at: string
  summary: { subjects: number; roles: number; bindings: number }
  risks: { critical: number; high: number; medium: number; low: number }
  findings: RBACFinding[]
  rbac_rows: FlatRBACRow[]
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
  scans_compared: { cluster: string; scan_date: string; risks: ScanRow["risk_counts"] }[]
  risk_changes: { severity: string; previous: number; current: number; change: number }[]
  new_risks: RBACFinding[]
  resolved_risks: RBACFinding[]
}

interface AggregatedData {
  totals: { subjects: number; roles: number; bindings: number }
  riskCounts: { critical: number; high: number; medium: number; low: number }
  findings: RBACFinding[]
}

// ============================================
// MAIN: build the ReportData object from already-fetched scans
// ============================================

export function buildReportData(params: {
  workspaceId: string
  workspaceName: string
  clusters: string[]
  reportType: ReportType
  format: ReportFormat
  scans: ScanRow[]
}): ReportData {
  const { workspaceId, workspaceName, clusters, reportType, format, scans } = params

  const aggregated = aggregateScans(scans)
  const rbacRows = flattenRBACRows(scans)

  const reportData: ReportData = {
    workspace_id: workspaceId,
    workspace_name: workspaceName,
    clusters,
    report_type: reportType,
    format,
    generated_at: new Date().toISOString(),
    summary: aggregated.totals,
    risks: aggregated.riskCounts,
    findings: aggregated.findings,
    rbac_rows: rbacRows,
  }

  switch (reportType) {
    case "COMPLIANCE":
      reportData.compliance = buildComplianceSection(scans, aggregated)
      break
    case "RISK_ASSESSMENT":
      reportData.risk_assessment = buildRiskAssessmentSection(aggregated)
      break
    case "RBAC_AUDIT":
      break
    case "TREND_ANALYSIS":
      reportData.trend_analysis = buildTrendAnalysisSection(scans)
      break
  }

  return reportData
}

// Produce the downloadable file bytes for the chosen format.
export function renderReportFile(reportData: ReportData): { content: Buffer; size: string } {
  let content: Buffer

  switch (reportData.format) {
    case "JSON":
      content = Buffer.from(JSON.stringify(reportData, null, 2), "utf-8")
      break
    case "CSV":
      content = Buffer.from(generateCSV(reportData.rbac_rows), "utf-8")
      break
    case "PDF": {
      const doc = generatePDFReport(reportData)
      content = Buffer.from(doc.output("arraybuffer"))
      break
    }
    default:
      content = Buffer.from(JSON.stringify(reportData, null, 2), "utf-8")
  }

  return { content, size: formatBytes(content.byteLength) }
}

// ============================================
// AGGREGATION (reuses each scan's pre-computed totals/riskCounts)
// ============================================

function aggregateScans(scans: ScanRow[]): AggregatedData {
  const totals = { subjects: 0, roles: 0, bindings: 0 }
  const riskCounts = { critical: 0, high: 0, medium: 0, low: 0 }
  const allFindings: RBACFinding[] = []

  for (const scan of scans) {
    totals.subjects += scan.totals?.subjects || 0
    totals.roles += scan.totals?.roles || 0
    totals.bindings += scan.totals?.bindings || 0

    riskCounts.critical += scan.risk_counts?.critical || 0
    riskCounts.high += scan.risk_counts?.high || 0
    riskCounts.medium += scan.risk_counts?.medium || 0
    riskCounts.low += scan.risk_counts?.low || 0

    const dataset = scan.scan_data as ScanDataset
    if (dataset?.findings) {
      allFindings.push(...dataset.findings)
    }
  }

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

    const roleMap = new Map<string, ScanDataset["roles"][0]>()
    for (const role of dataset.roles || []) {
      roleMap.set(role.name, role)
    }

    for (const binding of dataset.bindings || []) {
      const role = roleMap.get(binding.roleRef.name)
      if (!role) continue

      for (const subject of binding.subjects || []) {
        for (const rule of role.rules || []) {
          for (const resource of rule.resources || ["*"]) {
            const risk = assessRuleRisk(rule.verbs, resource)
            rows.push({
              cluster: scan.cluster_name,
              subject: subject.name,
              type: subject.kind,
              namespace: binding.namespace || "cluster-wide",
              role: role.name,
              resource,
              verbs: (rule.verbs || []).join(", "),
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
  const hasWildcard = verbs.includes("*") || resource === "*"
  const hasDangerous = verbs.some((v) => ["create", "delete", "patch", "update"].includes(v))
  const sensitiveResources = ["secrets", "configmaps", "pods", "deployments", "daemonsets", "roles", "clusterroles", "rolebindings", "clusterrolebindings"]

  if (hasWildcard) return "critical"
  if (hasDangerous && sensitiveResources.includes(resource)) return "high"
  if (hasDangerous) return "medium"
  return "low"
}

// ============================================
// REPORT TYPE BUILDERS
// ============================================

function buildComplianceSection(scans: ScanRow[], aggregated: AggregatedData): ComplianceSection {
  return {
    cluster_metadata: scans.map((s) => ({
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
  const subjectMap = new Map<string, { type: string; findings: RBACFinding[] }>()
  for (const f of aggregated.findings) {
    if (!subjectMap.has(f.subject)) {
      subjectMap.set(f.subject, { type: f.subjectType, findings: [] })
    }
    subjectMap.get(f.subject)!.findings.push(f)
  }

  const affected_subjects = Array.from(subjectMap.entries())
    .map(([name, data]) => ({
      name,
      type: data.type,
      finding_count: data.findings.length,
      highest_severity: data.findings.reduce((prev, curr) => {
        const order = { critical: 0, high: 1, medium: 2, low: 3 }
        return order[curr.severity as keyof typeof order] < order[prev as keyof typeof order] ? curr.severity : prev
      }, "low" as string),
    }))
    .sort((a, b) => (a.finding_count > b.finding_count ? -1 : 1))

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
  const scansCompared = scans.map((s) => ({
    cluster: s.cluster_name,
    scan_date: s.created_at,
    risks: s.risk_counts,
  }))

  const riskChanges: TrendAnalysisSection["risk_changes"] = []
  if (scans.length >= 2) {
    const current = scans[0].risk_counts
    const previous = scans[scans.length - 1].risk_counts
    for (const sev of ["critical", "high", "medium", "low"] as const) {
      riskChanges.push({
        severity: sev,
        previous: previous?.[sev] || 0,
        current: current?.[sev] || 0,
        change: (current?.[sev] || 0) - (previous?.[sev] || 0),
      })
    }
  }

  const currentFindings = (scans[0]?.scan_data as ScanDataset)?.findings || []
  const previousFindings = scans.length >= 2 ? (scans[scans.length - 1]?.scan_data as ScanDataset)?.findings || [] : []

  const prevIds = new Set(previousFindings.map((f) => f.id))
  const currIds = new Set(currentFindings.map((f) => f.id))

  const newRisks = currentFindings.filter((f) => !prevIds.has(f.id))
  const resolvedRisks = previousFindings.filter((f) => !currIds.has(f.id))

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

  const topFindings = aggregated.findings.filter((f) => f.severity === "critical" || f.severity === "high").slice(0, 3)
  for (const finding of topFindings) {
    const fix = getFixForFinding(finding)
    recs.push(`[${finding.severity.toUpperCase()}] ${finding.title} → ${fix.summary}`)
  }

  const categories = new Set(aggregated.findings.map((f) => f.category))
  if (categories.has("OVERLY_PERMISSIVE")) {
    recs.push("Apply the principle of least privilege by scoping wildcard permissions to specific resources and verbs.")
  }
  if (categories.has("PRIVILEGE_ESCALATION")) {
    recs.push("Remove escalate, bind, and impersonate verbs from non-admin roles to prevent privilege escalation paths.")
  }
  if (categories.has("MISCONFIGURATION")) {
    recs.push("Audit orphaned role bindings and unused service accounts to reduce the attack surface.")
  }
  if (categories.has("BEST_PRACTICE")) {
    recs.push("Consider namespace-scoped Roles instead of ClusterRoles where cluster-wide access is not required.")
  }

  if (recs.length === 0) {
    recs.push("No critical issues detected. Continue monitoring RBAC configurations with regular scans.")
  }

  return recs
}

// ============================================
// CSV GENERATION
// ============================================

function generateCSV(rows: FlatRBACRow[]): string {
  const headers = ["Cluster", "Namespace", "Subject", "Subject Type", "Role", "Resource", "Verbs", "Risk Level", "Issue Description", "Recommendation"]
  const csvRows = [headers.join(",")]

  for (const row of rows) {
    csvRows.push(
      [
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
      ].join(","),
    )
  }

  return csvRows.join("\n")
}

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

// ============================================
// UTILS
// ============================================

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}
