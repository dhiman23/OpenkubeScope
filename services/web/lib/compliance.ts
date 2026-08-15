// Compliance evaluation against the CIS Kubernetes Benchmark, section 5.1
// (RBAC and Service Accounts).
//
// Compliance is NOT the security score. The score measures how much of the
// authorization surface is compromised; compliance answers a different
// question — how many named controls of a published framework pass. A cluster
// can score 84 and be 91% compliant. The two must never be conflated in copy.
//
// Only controls that are genuinely decidable from an RBAC snapshot are listed.
// Controls requiring pod specs or API-server flags are deliberately absent
// rather than guessed at.

import type { RBACRole, RBACBinding, ScanDataset } from "./rbac-scanner"
import { hasWildcard } from "./permissions"

export type ControlStatus = "pass" | "fail"

export interface ComplianceControl {
  id: string
  title: string
  rationale: string
  status: ControlStatus
  /** Object names that caused the control to fail. */
  offenders: string[]
  remediation: string
}

export interface ComplianceResult {
  framework: string
  passed: number
  total: number
  percentage: number
  controls: ComplianceControl[]
}

function rulesOf(role: RBACRole) {
  return Array.isArray(role.rules) ? role.rules : []
}

function matchesResource(resources: string[] = [], targets: string[]): boolean {
  return resources.some((r) => r === "*" || targets.includes(r))
}

function matchesVerb(verbs: string[] = [], targets: string[]): boolean {
  return verbs.some((v) => v === "*" || targets.includes(v))
}

const WRITE_VERBS = ["create", "update", "patch", "delete", "deletecollection"]
const READ_VERBS = ["get", "list", "watch"]

/** Roles violating a predicate, returned as display names. */
function offendingRoles(roles: RBACRole[], predicate: (role: RBACRole) => boolean): string[] {
  return roles.filter(predicate).map((r) => (r.namespace ? `${r.namespace}/${r.name}` : r.name))
}

export function evaluateCompliance(dataset: ScanDataset | undefined | null): ComplianceResult {
  const roles: RBACRole[] = dataset?.roles ?? []
  const bindings: RBACBinding[] = dataset?.bindings ?? []

  const controls: ComplianceControl[] = []
  const add = (
    id: string,
    title: string,
    rationale: string,
    offenders: string[],
    remediation: string,
  ) => {
    controls.push({
      id,
      title,
      rationale,
      status: offenders.length === 0 ? "pass" : "fail",
      offenders,
      remediation,
    })
  }

  // 5.1.1 — cluster-admin only where required
  const clusterAdminBindings = bindings
    .filter((b) => b.roleRef?.name === "cluster-admin")
    .flatMap((b) => (b.subjects ?? []).map((s) => `${s.kind}/${s.name}`))
  add(
    "5.1.1",
    "Ensure that the cluster-admin role is only used where required",
    "cluster-admin grants unrestricted control over every resource in every namespace.",
    clusterAdminBindings.length > 1 ? clusterAdminBindings : [],
    "Replace cluster-admin bindings with least-privilege roles scoped to the namespaces each subject actually needs.",
  )

  // 5.1.2 — minimize access to secrets
  add(
    "5.1.2",
    "Minimize access to secrets",
    "Secrets hold credentials; broad read access is equivalent to credential disclosure.",
    offendingRoles(roles, (role) =>
      rulesOf(role).some(
        (rule) =>
          matchesResource(rule.resources, ["secrets"]) &&
          matchesVerb(rule.verbs, [...READ_VERBS, ...WRITE_VERBS]) &&
          !(rule.resourceNames && rule.resourceNames.length > 0),
      ),
    ),
    "Scope secret access with resourceNames, or move credentials to an external secret manager.",
  )

  // 5.1.3 — minimize wildcard use
  add(
    "5.1.3",
    "Minimize wildcard use in Roles and ClusterRoles",
    "Wildcards silently grant permissions on resources that did not exist when the role was written.",
    offendingRoles(roles, (role) =>
      rulesOf(role).some(
        (rule) => hasWildcard(rule.verbs ?? []) || hasWildcard(rule.resources ?? []) || hasWildcard(rule.apiGroups ?? []),
      ),
    ),
    "Enumerate the specific apiGroups, resources and verbs the workload requires.",
  )

  // 5.1.4 — minimize access to create pods
  add(
    "5.1.4",
    "Minimize access to create pods",
    "Pod creation allows scheduling arbitrary code, mounting secrets, and node access.",
    offendingRoles(roles, (role) =>
      rulesOf(role).some((rule) => matchesResource(rule.resources, ["pods"]) && matchesVerb(rule.verbs, ["create"])),
    ),
    "Grant pod creation only to controllers and CI systems; use workload controllers for everything else.",
  )

  // 5.1.5 — default service accounts not actively used
  const defaultSaBindings = bindings
    .filter((b) => (b.subjects ?? []).some((s) => s.kind === "ServiceAccount" && s.name === "default"))
    .map((b) => b.name)
  add(
    "5.1.5",
    "Ensure that default service accounts are not actively used",
    "Every pod without an explicit serviceAccountName runs as default; binding rights to it grants them cluster-wide by accident.",
    defaultSaBindings,
    "Create a dedicated ServiceAccount per workload and set automountServiceAccountToken: false on the default SA.",
  )

  // 5.1.7 — avoid system:masters
  const systemMasters = bindings
    .filter((b) => (b.subjects ?? []).some((s) => s.name === "system:masters"))
    .map((b) => b.name)
  add(
    "5.1.7",
    "Avoid use of the system:masters group",
    "system:masters bypasses RBAC authorization entirely and cannot be revoked without certificate rotation.",
    systemMasters,
    "Remove system:masters bindings. Grant explicit ClusterRoles instead so access remains auditable and revocable.",
  )

  // 5.1.8 — limit bind/impersonate/escalate
  add(
    "5.1.8",
    "Limit use of the Bind, Impersonate and Escalate permissions",
    "These verbs let a subject grant itself permissions it does not already hold.",
    offendingRoles(roles, (role) =>
      rulesOf(role).some((rule) => matchesVerb(rule.verbs, ["bind", "impersonate", "escalate"])),
    ),
    "Remove bind, impersonate and escalate. Manage RBAC changes through GitOps with review.",
  )

  // 5.1.9 — minimize access to create persistent volumes
  add(
    "5.1.9",
    "Minimize access to create persistent volumes",
    "PersistentVolume creation can mount host paths, providing a route to node compromise.",
    offendingRoles(roles, (role) =>
      rulesOf(role).some(
        (rule) => matchesResource(rule.resources, ["persistentvolumes"]) && matchesVerb(rule.verbs, ["create"]),
      ),
    ),
    "Restrict PV creation to storage controllers; workloads should use PersistentVolumeClaims only.",
  )

  // 5.1.10 — minimize access to nodes/proxy
  add(
    "5.1.10",
    "Minimize access to the proxy sub-resource of nodes",
    "nodes/proxy reaches the kubelet API directly, bypassing API-server authorization and audit.",
    offendingRoles(roles, (role) =>
      rulesOf(role).some((rule) => matchesResource(rule.resources, ["nodes/proxy"])),
    ),
    "Remove nodes/proxy access. Use the metrics API or an audited debugging workflow instead.",
  )

  // 5.1.11 — minimize access to CSR approval
  add(
    "5.1.11",
    "Minimize access to the approval sub-resource of certificatesigningrequests",
    "Approving CSRs mints trusted client certificates — a direct path to impersonating any identity.",
    offendingRoles(roles, (role) =>
      rulesOf(role).some(
        (rule) =>
          matchesResource(rule.resources, ["certificatesigningrequests/approval", "certificatesigningrequests"]) &&
          matchesVerb(rule.verbs, ["update", "approve"]),
      ),
    ),
    "Restrict CSR approval to the cluster's signer controller.",
  )

  // 5.1.12 — minimize access to webhook configuration objects
  add(
    "5.1.12",
    "Minimize access to webhook configuration objects",
    "Admission webhooks intercept every API request; write access allows cluster-wide interception or bypass.",
    offendingRoles(roles, (role) =>
      rulesOf(role).some(
        (rule) =>
          matchesResource(rule.resources, ["validatingwebhookconfigurations", "mutatingwebhookconfigurations"]) &&
          matchesVerb(rule.verbs, WRITE_VERBS),
      ),
    ),
    "Manage webhook configurations through GitOps only; remove direct write access from workloads.",
  )

  // 5.1.13 — minimize access to service account token creation
  add(
    "5.1.13",
    "Minimize access to the service account token creation API",
    "Minting a ServiceAccount token grants that account's full identity to the holder.",
    offendingRoles(roles, (role) =>
      rulesOf(role).some(
        (rule) =>
          matchesResource(rule.resources, ["serviceaccounts/token"]) && matchesVerb(rule.verbs, ["create"]),
      ),
    ),
    "Remove serviceaccounts/token create rights; prefer projected volume tokens or workload identity federation.",
  )

  const passed = controls.filter((c) => c.status === "pass").length
  return {
    framework: "CIS Kubernetes Benchmark v1.9 — Section 5.1 (RBAC & Service Accounts)",
    passed,
    total: controls.length,
    percentage: controls.length === 0 ? 0 : Math.round((passed / controls.length) * 100),
    controls,
  }
}
