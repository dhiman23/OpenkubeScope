// Plain TypeScript shapes for RBAC scan data, mirroring rbac-scanner-service's
// engine types. report-service receives these as proto messages from the
// scanner gRPC API and maps them into these local types (see scanner-client.ts)
// so the ported report logic reads identically to the monolith.

export interface RBACSubject {
  name: string
  kind: "User" | "Group" | "ServiceAccount"
  namespace?: string
}

export interface RBACRule {
  apiGroups: string[]
  resources: string[]
  verbs: string[]
  resourceNames?: string[]
}

export interface RBACRole {
  name: string
  kind: "Role" | "ClusterRole"
  namespace?: string
  rules: RBACRule[]
}

export interface RBACBinding {
  name: string
  kind: "RoleBinding" | "ClusterRoleBinding"
  namespace?: string
  roleRef: { kind: string; name: string }
  subjects: { kind: string; name: string; namespace?: string }[]
}

export type Severity = "critical" | "high" | "medium" | "low"
export type FindingCategory = "OVERLY_PERMISSIVE" | "PRIVILEGE_ESCALATION" | "MISCONFIGURATION" | "BEST_PRACTICE"

export interface RBACFinding {
  id: string
  title: string
  description: string
  severity: Severity
  category: FindingCategory
  subject: string
  subjectType: string
  role: string
  namespace: string
  remediation: string
  discoveredAt: string
  affectedResources: string[]
  impactedSubjects: string[]
  evidence?: { apiGroups: string[]; resources: string[]; verbs: string[] }
}

export interface ScanDataset {
  subjects: RBACSubject[]
  roles: RBACRole[]
  bindings: RBACBinding[]
  findings: RBACFinding[]
  clusterRoles?: RBACRole[]
  roleBindings?: RBACBinding[]
  clusterRoleBindings?: RBACBinding[]
}

export interface ScanTotals {
  subjects: number
  roles: number
  bindings: number
}

export interface ScanRiskCounts {
  critical: number
  high: number
  medium: number
  low: number
}

// Shape the report engine consumes per scan (mirrors the ScanRow in the
// monolith's report-generator.ts).
export interface ScanRow {
  id: string
  workspace_id: string
  file_name: string
  cluster_name: string
  scan_data: ScanDataset
  totals: ScanTotals
  risk_counts: ScanRiskCounts
  created_at: string
}

export type ReportType = "COMPLIANCE" | "RISK_ASSESSMENT" | "RBAC_AUDIT" | "TREND_ANALYSIS"
export type ReportFormat = "PDF" | "JSON" | "CSV"
export type ReportStatusStr = "generating" | "completed" | "failed"
