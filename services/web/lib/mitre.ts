// MITRE ATT&CK for Containers mapping + attack-impact narration.
//
// A finding title tells you what is misconfigured. It does not tell a reviewer
// what an attacker DOES with it — which is the sentence that decides whether a
// ticket gets prioritised. Each detection rule therefore carries an impact
// template interpolated with the real subject, namespace and blast radius.

import type { RBACFinding } from "./rbac-scanner"
import { classifyFinding, type DomainId } from "./scoring"

export interface MitreTechnique {
  tacticId: string
  tactic: string
  techniqueId: string
  technique: string
}

export interface RuleMeta {
  key: string
  mitre: MitreTechnique[]
  /** Interpolated with {role}, {namespace}, {subjects}, {resources}. */
  impact: string
}

const T = (tacticId: string, tactic: string, techniqueId: string, technique: string): MitreTechnique => ({
  tacticId,
  tactic,
  techniqueId,
  technique,
})

const RULES: Record<string, RuleMeta> = {
  "cluster-admin": {
    key: "cluster-admin",
    mitre: [
      T("TA0004", "Privilege Escalation", "T1078.004", "Valid Accounts: Cloud Accounts"),
      T("TA0006", "Credential Access", "T1552.007", "Container API Credentials"),
    ],
    impact:
      "Any compromise of a subject bound to {role} becomes full cluster compromise. The attacker can read every secret in every namespace, schedule workloads on any node, and modify RBAC itself to persist — including re-granting access after the original binding is removed.",
  },
  "secrets-write": {
    key: "secrets-write",
    mitre: [
      T("TA0006", "Credential Access", "T1552.001", "Credentials In Files"),
      T("TA0003", "Persistence", "T1078", "Valid Accounts"),
    ],
    impact:
      "Write access to secrets in {namespace} lets an attacker replace credentials that other workloads consume — redirecting database connections, registry pulls or webhook signatures to infrastructure they control, without touching any workload definition.",
  },
  "secrets-read": {
    key: "secrets-read",
    mitre: [
      T("TA0006", "Credential Access", "T1552.007", "Container API Credentials"),
      T("TA0007", "Discovery", "T1613", "Container and Resource Discovery"),
    ],
    impact:
      "Reading secrets in {namespace} exposes every credential stored there — database passwords, cloud provider keys, and ServiceAccount tokens. Stolen SA tokens are directly reusable against the API server and inherit that account's permissions.",
  },
  "pods-exec": {
    key: "pods-exec",
    mitre: [
      T("TA0002", "Execution", "T1609", "Container Administration Command"),
      T("TA0004", "Privilege Escalation", "T1611", "Escape to Host"),
    ],
    impact:
      "exec into a running pod gives an interactive shell inside another workload's container, with that workload's mounted secrets and network identity. If any pod in {namespace} runs privileged or mounts a host path, this is also a route to the node itself.",
  },
  "pods-portforward": {
    key: "pods-portforward",
    mitre: [
      T("TA0011", "Command and Control", "T1572", "Protocol Tunneling"),
      T("TA0008", "Lateral Movement", "T1210", "Exploitation of Remote Services"),
    ],
    impact:
      "Port forwarding tunnels directly to pods in {namespace}, bypassing NetworkPolicy, ingress rules and service mesh authorization. Internal-only services become reachable from any workstation holding this permission.",
  },
  "binding-create": {
    key: "binding-create",
    mitre: [
      T("TA0004", "Privilege Escalation", "T1078", "Valid Accounts"),
      T("TA0003", "Persistence", "T1136", "Create Account"),
    ],
    impact:
      "The ability to create bindings is self-escalation: a subject holding {role} can bind itself — or any account it controls — to cluster-admin. Every other permission boundary in the cluster becomes advisory.",
  },
  "clusterrole-create": {
    key: "clusterrole-create",
    mitre: [
      T("TA0004", "Privilege Escalation", "T1078", "Valid Accounts"),
      T("TA0005", "Defense Evasion", "T1562", "Impair Defenses"),
    ],
    impact:
      "Creating or editing ClusterRoles rewrites the cluster's authorization model. An attacker can widen an existing role that is already bound to them, escalating without creating any new binding for auditors to notice.",
  },
  impersonate: {
    key: "impersonate",
    mitre: [
      T("TA0004", "Privilege Escalation", "T1134", "Access Token Manipulation"),
      T("TA0005", "Defense Evasion", "T1078", "Valid Accounts"),
    ],
    impact:
      "Impersonation lets {role} act as any user, group or ServiceAccount — including cluster-admin — while audit logs attribute the action to the impersonated identity. It is both an escalation path and an attribution problem.",
  },
  wildcard: {
    key: "wildcard",
    mitre: [T("TA0004", "Privilege Escalation", "T1078", "Valid Accounts")],
    impact:
      "Wildcards in {role} grant permissions nobody reviewed. Every CRD installed after this role was written is automatically covered, so the blast radius grows silently each time an operator is added to the cluster.",
  },
  "token-access": {
    key: "token-access",
    mitre: [
      T("TA0006", "Credential Access", "T1528", "Steal Application Access Token"),
      T("TA0003", "Persistence", "T1078", "Valid Accounts"),
    ],
    impact:
      "Minting ServiceAccount tokens converts this permission into any other account's permissions. A token issued for a privileged SA works from anywhere with API-server reachability and survives the removal of {role}.",
  },
  "node-access": {
    key: "node-access",
    mitre: [
      T("TA0007", "Discovery", "T1613", "Container and Resource Discovery"),
      T("TA0004", "Privilege Escalation", "T1611", "Escape to Host"),
    ],
    impact:
      "Node access exposes cluster topology and, through the proxy sub-resource, the kubelet API — which can list and exec into every pod on that node, bypassing API-server authorization and audit entirely.",
  },
  "workload-mutation": {
    key: "workload-mutation",
    mitre: [
      T("TA0002", "Execution", "T1610", "Deploy Container"),
      T("TA0003", "Persistence", "T1543", "Create or Modify System Process"),
    ],
    impact:
      "Modifying workloads in {namespace} means changing container images or commands. An attacker patches a Deployment to run their own image with the existing ServiceAccount, inheriting its permissions and its mounted secrets.",
  },
  "identity-hygiene": {
    key: "identity-hygiene",
    mitre: [T("TA0004", "Privilege Escalation", "T1078", "Valid Accounts")],
    impact:
      "Permissions attached to shared or default identities in {namespace} apply to every workload that did not opt out. A single compromised container inherits them without the attacker doing anything specific.",
  },
  generic: {
    key: "generic",
    mitre: [T("TA0004", "Privilege Escalation", "T1078", "Valid Accounts")],
    impact:
      "{role} grants more authority than the workload requires. Excess permissions widen the blast radius of any compromise involving subjects bound to this role.",
  },
}

/** Detection-rule key inferred from the finding title emitted by the engine. */
export function ruleKeyForFinding(finding: RBACFinding): string {
  const title = (finding.title || "").toLowerCase()
  if (title.includes("cluster-admin")) return "cluster-admin"
  if (title.includes("secrets write")) return "secrets-write"
  if (title.includes("secrets read") || title.includes("read secrets")) return "secrets-read"
  if (title.includes("pods/exec") || title.includes("exec into")) return "pods-exec"
  if (title.includes("pods/portforward")) return "pods-portforward"
  if (title.includes("rolebinding creation")) return "binding-create"
  if (title.includes("clusterrole creation")) return "clusterrole-create"
  if (title.includes("impersonate")) return "impersonate"
  if (title.includes("wildcard")) return "wildcard"
  if (title.includes("token access")) return "token-access"
  if (title.includes("node access") || title.includes("cluster-wide")) return "node-access"
  if (title.includes("workload mutation") || title.includes("configmaps")) return "workload-mutation"
  if (title.includes("default") || title.includes("anonymous")) return "identity-hygiene"
  return "generic"
}

export function metaForFinding(finding: RBACFinding): RuleMeta {
  return RULES[ruleKeyForFinding(finding)] ?? RULES.generic
}

export function mitreForFinding(finding: RBACFinding): MitreTechnique[] {
  return metaForFinding(finding).mitre
}

/** Prose explanation of what an attacker does with this finding. */
export function attackImpact(finding: RBACFinding): string {
  const meta = metaForFinding(finding)
  const namespace = !finding.namespace || finding.namespace === "*" ? "every namespace" : `\`${finding.namespace}\``
  return meta.impact
    .replace(/\{role\}/g, `\`${finding.role || "this role"}\``)
    .replace(/\{namespace\}/g, namespace)
    .replace(/\{subjects\}/g, String(finding.impactedSubjects?.length ?? 0))
    .replace(/\{resources\}/g, (finding.affectedResources ?? []).join(", ") || "the affected resources")
}

export interface BlastRadius {
  subjects: number
  resources: number
  clusterWide: boolean
}

export function blastRadius(finding: RBACFinding): BlastRadius {
  return {
    subjects: finding.impactedSubjects?.length ?? 0,
    resources: finding.affectedResources?.length ?? 0,
    clusterWide: !finding.namespace || finding.namespace === "*",
  }
}

/** All distinct tactics present in a finding set — powers the MITRE filter. */
export function tacticsInFindings(findings: RBACFinding[]): { id: string; name: string; count: number }[] {
  const counts = new Map<string, { id: string; name: string; count: number }>()
  for (const finding of findings) {
    for (const t of mitreForFinding(finding)) {
      const existing = counts.get(t.tacticId)
      if (existing) existing.count += 1
      else counts.set(t.tacticId, { id: t.tacticId, name: t.tactic, count: 1 })
    }
  }
  return Array.from(counts.values()).sort((a, b) => b.count - a.count)
}

export function domainForFinding(finding: RBACFinding): DomainId {
  return classifyFinding(finding)
}
