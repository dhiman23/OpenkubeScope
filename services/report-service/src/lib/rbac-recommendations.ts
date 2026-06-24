// RBAC Fix Suggestions Engine — ported verbatim from lib/rbac-recommendations.ts
// in the monolith. Only the RBACFinding import source changed (local rbac-types
// instead of the monolith's rbac-scanner).

import type { RBACFinding } from "./rbac-types"

export interface FixSuggestion {
  summary: string
  rationale: string
  kubectl?: string
  manifest?: string
}

const SENSITIVE_RESOURCES = new Set([
  "secrets",
  "configmaps",
  "pods",
  "pods/exec",
  "pods/portforward",
  "deployments",
  "daemonsets",
  "statefulsets",
  "replicasets",
  "roles",
  "clusterroles",
  "rolebindings",
  "clusterrolebindings",
  "serviceaccounts",
  "serviceaccounts/token",
  "tokenreviews",
  "nodes",
  "nodes/proxy",
])

const DANGEROUS_VERBS = new Set(["create", "delete", "patch", "update", "deletecollection"])

// Heuristic fixes keyed by finding title pattern. Falls back to category-level advice.
export function getFixForFinding(finding: RBACFinding): FixSuggestion {
  const title = finding.title.toLowerCase()
  const role = finding.role || "<role>"
  const namespace = finding.namespace && finding.namespace !== "cluster-wide" ? finding.namespace : ""

  if (title.includes("cluster-admin")) {
    return {
      summary: "Replace cluster-admin with a namespace-scoped Role granting only the required verbs.",
      rationale:
        "cluster-admin grants unrestricted access to every resource in every namespace. Use the built-in `edit` or `view` ClusterRoles — or a custom Role — and bind it at namespace scope instead.",
      kubectl: namespace
        ? `kubectl -n ${namespace} create rolebinding ${finding.subject}-edit --clusterrole=edit --user=${finding.subject}`
        : `kubectl create rolebinding ${finding.subject}-edit --clusterrole=edit --user=${finding.subject} -n <namespace>`,
    }
  }

  if (title.includes("wildcard")) {
    return {
      summary: "Replace wildcard (*) verbs or resources with an explicit allowlist.",
      rationale:
        "Wildcards defeat least-privilege by granting verbs/resources you did not intend. Enumerate exact verbs (e.g. get, list) and resources (e.g. pods, configmaps).",
      manifest: `rules:\n  - apiGroups: [""]\n    resources: ["pods", "configmaps"]\n    verbs: ["get", "list", "watch"]`,
    }
  }

  if (title.includes("secret") && (title.includes("write") || title.includes("create"))) {
    return {
      summary: "Remove write verbs (create/update/patch/delete) on secrets from this Role.",
      rationale:
        "Secret mutation lets a subject rotate credentials, inject malicious data, or plant persistent backdoors. Read access alone is already high-risk — writes are critical.",
      manifest: `rules:\n  - apiGroups: [""]\n    resources: ["secrets"]\n    verbs: ["get", "list"] # drop create/update/patch/delete`,
    }
  }

  if (title.includes("secret") && (title.includes("read") || title.includes("get"))) {
    return {
      summary: "Scope secret access to specific named secrets using resourceNames.",
      rationale:
        "Broad secret read enables cluster-wide credential exfiltration. If the workload only needs one secret, bind a Role that targets it by name.",
      manifest: `rules:\n  - apiGroups: [""]\n    resources: ["secrets"]\n    resourceNames: ["my-app-secret"]\n    verbs: ["get"]`,
    }
  }

  if (title.includes("exec")) {
    return {
      summary: "Remove pods/exec from this Role — use a dedicated debug service account instead.",
      rationale:
        "pods/exec is a privilege-escalation vector: an attacker with exec can inherit the workload's service-account token. Restrict to break-glass operators only.",
      kubectl: `kubectl patch clusterrole ${role} --type=json -p='[{"op":"remove","path":"/rules/<index>"}]'`,
    }
  }

  if (title.includes("portforward")) {
    return {
      summary: "Remove pods/portforward — it exposes internal pod ports to any user with the binding.",
      rationale:
        "portforward creates an unaudited TCP tunnel to the pod, bypassing Services and NetworkPolicies. It is rarely needed in production.",
    }
  }

  if (title.includes("impersonate")) {
    return {
      summary: "Remove `impersonate` on users/groups/serviceaccounts from non-admin roles.",
      rationale:
        "Impersonate lets a subject act as another identity, trivially bypassing RBAC. Keep it confined to platform admins with dedicated audit logging.",
      manifest: `# Remove these rule entries:\n# - verbs: ["impersonate"]\n#   resources: ["users", "groups", "serviceaccounts"]`,
    }
  }

  if (title.includes("escalate") || title.includes("bind")) {
    return {
      summary: "Remove `escalate` and `bind` verbs on roles/clusterroles.",
      rationale:
        "escalate lets a subject grant permissions they do not hold; bind lets them attach any role to any subject. Together they are a complete RBAC bypass.",
    }
  }

  if (title.includes("rolebinding") || title.includes("clusterrolebinding")) {
    return {
      summary: "Only platform admins should create RoleBindings or ClusterRoleBindings.",
      rationale:
        "Binding creation is equivalent to granting arbitrary permissions. Move this capability to an admin-only ClusterRole and audit its bindings.",
    }
  }

  if (title.includes("token")) {
    return {
      summary: "Restrict serviceaccounts/token and tokenreviews to authentication webhooks only.",
      rationale:
        "Token creation/review lets the holder mint or validate credentials for other identities — a direct path to identity theft.",
    }
  }

  if (title.includes("node")) {
    return {
      summary: "Confine node/nodes/proxy/stats access to monitoring and control-plane components.",
      rationale:
        "Node access exposes kubelet APIs and host-level telemetry. Combined with exec or portforward it enables host escape.",
    }
  }

  if (title.includes("workload") || title.includes("deployment") || title.includes("daemonset")) {
    return {
      summary: "Split workload mutation rights by namespace — avoid cluster-wide deployment write access.",
      rationale:
        "Creating a Deployment/DaemonSet can mount any secret or hostPath. Cluster-scoped write is effectively cluster-admin.",
    }
  }

  return categoryFallback(finding)
}

function categoryFallback(finding: RBACFinding): FixSuggestion {
  switch (finding.category) {
    case "OVERLY_PERMISSIVE":
      return {
        summary: "Apply least-privilege: enumerate the exact verbs and resources actually needed.",
        rationale:
          "Broad permissions expand the blast radius of any credential compromise. Audit the workload's real API calls (audit logs) and pare the Role down to that set.",
      }
    case "PRIVILEGE_ESCALATION":
      return {
        summary: "Remove verbs that allow a subject to grow their own privileges (escalate, bind, impersonate, token create).",
        rationale:
          "Privilege-escalation verbs turn a limited compromise into full cluster takeover. They have no legitimate place outside platform-admin roles.",
      }
    case "MISCONFIGURATION":
      return {
        summary: "Audit this binding — it targets a subject or role that looks misconfigured.",
        rationale:
          "Orphaned bindings, typos in subject names, and wrong-kind references accumulate as RBAC drift. Remove or correct the binding.",
      }
    case "BEST_PRACTICE":
      return {
        summary: "Prefer namespace-scoped Roles over ClusterRoles unless cluster-wide access is genuinely required.",
        rationale:
          "ClusterRoles apply to every namespace including future ones. A Role confined to one namespace limits mistakes and compromises.",
      }
    default:
      return {
        summary: finding.remediation || "Review this finding and apply least-privilege principles.",
        rationale: finding.description || "No additional context available.",
      }
  }
}

// Assess a raw RBAC rule (from flattened rows where we don't have a finding yet).
export function getFixForRule(verbs: string[], resource: string): string {
  const hasWildcardVerb = verbs.includes("*")
  const hasWildcardResource = resource === "*"
  const hasDangerous = verbs.some((v) => DANGEROUS_VERBS.has(v))
  const isSensitive = SENSITIVE_RESOURCES.has(resource)

  if (hasWildcardVerb && hasWildcardResource) {
    return "Replace wildcards with an explicit list of verbs and resources — this rule grants full API access."
  }
  if (hasWildcardVerb) {
    return `Enumerate exact verbs (e.g. get, list, watch) instead of * on ${resource}.`
  }
  if (hasWildcardResource) {
    return `Enumerate exact resources instead of * (rule currently allows ${verbs.join(", ")} on every resource).`
  }
  if (hasDangerous && isSensitive) {
    return `Remove ${verbs.filter((v) => DANGEROUS_VERBS.has(v)).join("/")} on ${resource} or scope it with resourceNames.`
  }
  if (hasDangerous) {
    return `Verify ${verbs.filter((v) => DANGEROUS_VERBS.has(v)).join("/")} on ${resource} is required; prefer read-only where possible.`
  }
  if (isSensitive) {
    return `Read access on ${resource} is sensitive — scope with resourceNames if only specific objects are needed.`
  }
  return "Looks reasonable — review periodically to ensure it still matches workload needs."
}

// Describe the security issue for a raw rule (used as "Issue Description" in CSV).
export function getIssueDescriptionForRule(verbs: string[], resource: string, risk: string): string {
  const hasWildcardVerb = verbs.includes("*")
  const hasWildcardResource = resource === "*"

  if (hasWildcardVerb && hasWildcardResource) {
    return "Full API access (wildcard verbs on wildcard resources) — effectively cluster-admin."
  }
  if (hasWildcardVerb) {
    return `Wildcard verbs granted on ${resource}.`
  }
  if (hasWildcardResource) {
    return `${verbs.join("/")} allowed on every resource in scope.`
  }
  if (risk === "high" || risk === "critical") {
    return `Mutating access (${verbs.filter((v) => DANGEROUS_VERBS.has(v)).join("/")}) on sensitive resource ${resource}.`
  }
  if (risk === "medium") {
    return `Mutating access (${verbs.filter((v) => DANGEROUS_VERBS.has(v)).join("/")}) on ${resource}.`
  }
  return `Read access on ${resource} (${verbs.join(", ")}).`
}
