// Converts scanner proto Scan messages (numeric enums) into the plain JSON
// shape the frontend expects (string unions for kind/severity/category),
// matching the Scan / ScanDataset types in services/web/lib/rbac-scanner.ts.
// Keeps all enum mapping in one place so the browser consumes clean JSON.

import * as scanner from "../generated/scanner"

const SUBJECT_KIND: Record<number, string> = {
  [scanner.SubjectKind.USER]: "User",
  [scanner.SubjectKind.GROUP]: "Group",
  [scanner.SubjectKind.SERVICE_ACCOUNT]: "ServiceAccount",
}
const ROLE_KIND: Record<number, string> = {
  [scanner.RoleKind.ROLE]: "Role",
  [scanner.RoleKind.CLUSTER_ROLE]: "ClusterRole",
}
const BINDING_KIND: Record<number, string> = {
  [scanner.BindingKind.ROLE_BINDING]: "RoleBinding",
  [scanner.BindingKind.CLUSTER_ROLE_BINDING]: "ClusterRoleBinding",
}
const SEVERITY: Record<number, string> = {
  [scanner.Severity.LOW]: "low",
  [scanner.Severity.MEDIUM]: "medium",
  [scanner.Severity.HIGH]: "high",
  [scanner.Severity.CRITICAL]: "critical",
}
const CATEGORY: Record<number, string> = {
  [scanner.FindingCategory.OVERLY_PERMISSIVE]: "OVERLY_PERMISSIVE",
  [scanner.FindingCategory.PRIVILEGE_ESCALATION]: "PRIVILEGE_ESCALATION",
  [scanner.FindingCategory.MISCONFIGURATION]: "MISCONFIGURATION",
  [scanner.FindingCategory.BEST_PRACTICE]: "BEST_PRACTICE",
}

function datasetToJson(d: scanner.ScanDataset | undefined) {
  if (!d) return { subjects: [], roles: [], bindings: [], findings: [] }

  const role = (r: scanner.RBACRole) => ({
    name: r.name,
    kind: ROLE_KIND[r.kind] || "Role",
    namespace: r.namespace,
    rules: r.rules.map((rule) => ({
      apiGroups: rule.apiGroups,
      resources: rule.resources,
      verbs: rule.verbs,
      resourceNames: rule.resourceNames.length ? rule.resourceNames : undefined,
    })),
  })
  const binding = (b: scanner.RBACBinding) => ({
    name: b.name,
    kind: BINDING_KIND[b.kind] || "RoleBinding",
    namespace: b.namespace,
    roleRef: { kind: b.roleRef?.kind || "", name: b.roleRef?.name || "" },
    subjects: b.subjects.map((s) => ({ kind: s.kind, name: s.name, namespace: s.namespace })),
  })

  return {
    subjects: d.subjects.map((s) => ({ name: s.name, kind: SUBJECT_KIND[s.kind] || "User", namespace: s.namespace })),
    roles: d.roles.map(role),
    bindings: d.bindings.map(binding),
    findings: d.findings.map((f) => ({
      id: f.id,
      title: f.title,
      description: f.description,
      severity: SEVERITY[f.severity] || "low",
      category: CATEGORY[f.category] || "MISCONFIGURATION",
      subject: f.subject,
      subjectType: f.subjectType,
      role: f.role,
      namespace: f.namespace,
      remediation: f.remediation,
      discoveredAt: f.discoveredAt,
      affectedResources: f.affectedResources,
      impactedSubjects: f.impactedSubjects,
      evidence: f.evidence ? { apiGroups: f.evidence.apiGroups, resources: f.evidence.resources, verbs: f.evidence.verbs } : undefined,
    })),
  }
}

// Frontend-shaped scan (camelCase, string enums) matching lib/rbac-scanner.ts Scan.
export function scanToJson(s: scanner.Scan | undefined) {
  if (!s) return null
  return {
    id: s.id,
    fileName: s.fileName,
    clusterName: s.clusterName,
    createdAt: s.createdAt,
    totals: s.totals || { subjects: 0, roles: 0, bindings: 0 },
    riskCounts: s.riskCounts || { critical: 0, high: 0, medium: 0, low: 0 },
    dataset: datasetToJson(s.dataset),
    isSummaryMode: s.isSummaryMode,
    status: scanStatusToJson(s.status),
    errorMessage: s.errorMessage || null,
  }
}

// Pre-async rows and sync-path scans are always completed.
function scanStatusToJson(status: scanner.ScanStatus | undefined): "pending" | "completed" | "failed" {
  switch (status) {
    case scanner.ScanStatus.PENDING:
      return "pending"
    case scanner.ScanStatus.FAILED:
      return "failed"
    default:
      return "completed"
  }
}
