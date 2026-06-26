// Converts between the engine's plain string-union types (rbac-engine.ts,
// ported straight from the monolith) and the generated proto types
// (numeric enums). Kept in one file so the enum<->string tables aren't
// scattered across server.ts.

import * as proto from "../generated/scanner"
import type * as engine from "./rbac-engine"

const SUBJECT_KIND_TO_PROTO: Record<engine.RBACSubject["kind"], proto.SubjectKind> = {
  User: proto.SubjectKind.USER,
  Group: proto.SubjectKind.GROUP,
  ServiceAccount: proto.SubjectKind.SERVICE_ACCOUNT,
}

const ROLE_KIND_TO_PROTO: Record<engine.RBACRole["kind"], proto.RoleKind> = {
  Role: proto.RoleKind.ROLE,
  ClusterRole: proto.RoleKind.CLUSTER_ROLE,
}

const BINDING_KIND_TO_PROTO: Record<engine.RBACBinding["kind"], proto.BindingKind> = {
  RoleBinding: proto.BindingKind.ROLE_BINDING,
  ClusterRoleBinding: proto.BindingKind.CLUSTER_ROLE_BINDING,
}

const SEVERITY_TO_PROTO: Record<engine.RBACFinding["severity"], proto.Severity> = {
  low: proto.Severity.LOW,
  medium: proto.Severity.MEDIUM,
  high: proto.Severity.HIGH,
  critical: proto.Severity.CRITICAL,
}

const CATEGORY_TO_PROTO: Record<engine.RBACFinding["category"], proto.FindingCategory> = {
  OVERLY_PERMISSIVE: proto.FindingCategory.OVERLY_PERMISSIVE,
  PRIVILEGE_ESCALATION: proto.FindingCategory.PRIVILEGE_ESCALATION,
  MISCONFIGURATION: proto.FindingCategory.MISCONFIGURATION,
  BEST_PRACTICE: proto.FindingCategory.BEST_PRACTICE,
}

function subjectToProto(s: engine.RBACSubject): proto.RBACSubject {
  return { name: s.name, kind: SUBJECT_KIND_TO_PROTO[s.kind] ?? proto.SubjectKind.USER, namespace: s.namespace }
}

function ruleToProto(r: engine.RBACRule): proto.RBACRule {
  // Snapshot files can embed findings/rules with missing fields — every repeated
  // field is coalesced to [] so proto serialization (which iterates them) never
  // throws "X is not iterable".
  return {
    apiGroups: r.apiGroups || [],
    resources: r.resources || [],
    verbs: r.verbs || [],
    resourceNames: r.resourceNames || [],
  }
}

function roleToProto(r: engine.RBACRole): proto.RBACRole {
  return {
    name: r.name,
    kind: ROLE_KIND_TO_PROTO[r.kind] ?? proto.RoleKind.ROLE,
    namespace: r.namespace,
    rules: (r.rules || []).map(ruleToProto),
  }
}

function bindingToProto(b: engine.RBACBinding): proto.RBACBinding {
  return {
    name: b.name,
    kind: BINDING_KIND_TO_PROTO[b.kind] ?? proto.BindingKind.ROLE_BINDING,
    namespace: b.namespace,
    roleRef: { kind: b.roleRef?.kind || "", name: b.roleRef?.name || "" },
    subjects: (b.subjects || []).map((s) => ({ kind: s.kind, name: s.name, namespace: s.namespace })),
  }
}

function findingToProto(f: engine.RBACFinding): proto.RBACFinding {
  return {
    id: f.id,
    title: f.title,
    description: f.description,
    // Embedded findings may use unmapped severities/categories (e.g. the demo
    // dataset's "Privilege Escalation"); fall back instead of emitting undefined.
    severity: SEVERITY_TO_PROTO[f.severity] ?? proto.Severity.LOW,
    category: CATEGORY_TO_PROTO[f.category] ?? proto.FindingCategory.MISCONFIGURATION,
    subject: f.subject ?? "",
    subjectType: f.subjectType ?? "",
    role: f.role ?? "",
    namespace: f.namespace ?? "",
    remediation: f.remediation ?? "",
    discoveredAt: f.discoveredAt ?? new Date().toISOString(),
    affectedResources: f.affectedResources || [],
    impactedSubjects: f.impactedSubjects || [],
    evidence: f.evidence
      ? { apiGroups: f.evidence.apiGroups || [], resources: f.evidence.resources || [], verbs: f.evidence.verbs || [] }
      : undefined,
  }
}

function datasetToProto(d: engine.ScanDataset): proto.ScanDataset {
  return {
    subjects: d.subjects.map(subjectToProto),
    roles: d.roles.map(roleToProto),
    bindings: d.bindings.map(bindingToProto),
    findings: d.findings.map(findingToProto),
    clusterRoles: (d.clusterRoles || []).map(roleToProto),
    roleBindings: (d.roleBindings || []).map(bindingToProto),
    clusterRoleBindings: (d.clusterRoleBindings || []).map(bindingToProto),
  }
}

export function scanToProto(workspaceId: string, s: engine.Scan): proto.Scan {
  return {
    id: s.id,
    fileName: s.fileName,
    createdAt: s.createdAt,
    clusterName: s.clusterName,
    totals: s.totals,
    riskCounts: s.riskCounts,
    dataset: datasetToProto(s.dataset),
    isSummaryMode: s.isSummaryMode || false,
    workspaceId,
  }
}
