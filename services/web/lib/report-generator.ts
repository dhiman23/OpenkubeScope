// Report data types. Report GENERATION now happens server-side in
// report-service (see services/report-service); this file only keeps the shared
// TypeScript shapes still referenced by report-diff.ts and the diff page.

import type { ScanRiskCounts, RBACFinding } from "@/lib/rbac-scanner"

export interface ReportData {
  workspace_id: string
  workspace_name: string
  clusters: string[]
  report_type: "COMPLIANCE" | "RISK_ASSESSMENT" | "RBAC_AUDIT" | "TREND_ANALYSIS"
  format: "PDF" | "JSON" | "CSV"
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

export interface ComplianceSection {
  cluster_metadata: { name: string; scan_date: string; subjects: number; roles: number; bindings: number }[]
  rbac_summary: { total_subjects: number; total_roles: number; total_bindings: number }
  top_findings: RBACFinding[]
  recommendations: string[]
}

export interface RiskAssessmentSection {
  severity_distribution: { critical: number; high: number; medium: number; low: number }
  affected_subjects: { name: string; type: string; finding_count: number; highest_severity: string }[]
  findings_by_category: Record<string, RBACFinding[]>
}

export interface TrendAnalysisSection {
  scans_compared: { cluster: string; scan_date: string; risks: ScanRiskCounts }[]
  risk_changes: { severity: string; previous: number; current: number; change: number }[]
  new_risks: RBACFinding[]
  resolved_risks: RBACFinding[]
}
