// Attack surface tiles.
//
// Each tile is a saved query into the findings/roles of a snapshot. Eight are
// derivable from RBAC data. HostPath and privileged containers are Pod
// Security concerns (securityContext / PSA), NOT RBAC — they are not present
// in roles.json or bindings.json. Those tiles ship in an explicit
// "not collected" state rather than rendering a number we cannot source.

import type { ScanDataset, RBACRole, RBACBinding } from "./rbac-scanner"
import { hasWildcard } from "./permissions"

export type TileAvailability = "available" | "not-collected"

export interface AttackSurfaceTile {
  id: string
  label: string
  count: number
  availability: TileAvailability
  /** Why the tile matters, shown on hover. */
  hint: string
  /** Findings query this tile links to. */
  query: string
  /** Explanation shown when availability is "not-collected". */
  unavailableReason?: string
}

function rulesOf(role: RBACRole) {
  return Array.isArray(role.rules) ? role.rules : []
}

function roleMatches(role: RBACRole, predicate: (r: { apiGroups: string[]; resources: string[]; verbs: string[] }) => boolean) {
  return rulesOf(role).some((rule) =>
    predicate({
      apiGroups: rule?.apiGroups ?? [],
      resources: rule?.resources ?? [],
      verbs: rule?.verbs ?? [],
    }),
  )
}

function has(list: string[], targets: string[]): boolean {
  return list.some((v) => v === "*" || targets.includes(v))
}

const ANONYMOUS_SUBJECTS = ["system:anonymous", "system:unauthenticated"]

export function computeAttackSurface(dataset: ScanDataset | undefined | null): AttackSurfaceTile[] {
  const roles: RBACRole[] = dataset?.roles ?? []
  const bindings: RBACBinding[] = dataset?.bindings ?? []

  const wildcardRoles = roles.filter((role) =>
    roleMatches(role, (r) => hasWildcard(r.verbs) || hasWildcard(r.resources) || hasWildcard(r.apiGroups)),
  ).length

  const clusterAdminSubjects = new Set<string>()
  for (const binding of bindings) {
    const isAdminRole =
      binding.roleRef?.name === "cluster-admin" || (binding.roleRef?.name || "").toLowerCase().includes("cluster-admin")
    if (!isAdminRole) continue
    for (const s of binding.subjects ?? []) clusterAdminSubjects.add(`${s.kind}/${s.name}`)
  }

  const secretReaders = roles.filter((role) =>
    roleMatches(role, (r) => has(r.resources, ["secrets"]) && has(r.verbs, ["get", "list", "watch"])),
  ).length

  const podsExec = roles.filter((role) =>
    roleMatches(role, (r) => has(r.resources, ["pods/exec", "pods/attach"]) && has(r.verbs, ["create"])),
  ).length

  const impersonation = roles.filter((role) => roleMatches(role, (r) => r.verbs.includes("impersonate"))).length

  const nodeAccess = roles.filter((role) =>
    roleMatches(role, (r) => has(r.resources, ["nodes", "nodes/proxy", "nodes/stats"])),
  ).length

  const anonymousBindings = bindings.filter((b) =>
    (b.subjects ?? []).some((s) => ANONYMOUS_SUBJECTS.includes(s.name)),
  ).length

  // "Privileged accounts" in RBAC terms: subjects holding admin-equivalent verbs
  // (bind / escalate / impersonate / wildcard) through any binding.
  const privilegedSubjects = new Set<string>()
  const roleByName = new Map<string, RBACRole>()
  for (const role of roles) if (role?.name) roleByName.set(role.name, role)
  for (const binding of bindings) {
    const role = roleByName.get(binding.roleRef?.name ?? "")
    if (!role) continue
    const privileged = roleMatches(
      role,
      (r) => hasWildcard(r.verbs) || has(r.verbs, ["bind", "escalate", "impersonate"]),
    )
    if (!privileged) continue
    for (const s of binding.subjects ?? []) privilegedSubjects.add(`${s.kind}/${s.name}`)
  }

  return [
    {
      id: "wildcard-roles",
      label: "Wildcard Roles",
      count: wildcardRoles,
      availability: "available",
      hint: "Roles using * for verbs, resources or apiGroups — they cover resources nobody reviewed.",
      query: "?q=wildcard",
    },
    {
      id: "cluster-admins",
      label: "Cluster Admins",
      count: clusterAdminSubjects.size,
      availability: "available",
      hint: "Subjects bound to cluster-admin or an equivalent unrestricted role.",
      query: "?q=cluster-admin",
    },
    {
      id: "secret-readers",
      label: "Secret Readers",
      count: secretReaders,
      availability: "available",
      hint: "Roles that can read secrets — equivalent to credential disclosure.",
      query: "?q=secrets",
    },
    {
      id: "pods-exec",
      label: "Pods Exec",
      count: podsExec,
      availability: "available",
      hint: "Roles granting shell access into running containers.",
      query: "?q=exec",
    },
    {
      id: "impersonation",
      label: "Impersonation",
      count: impersonation,
      availability: "available",
      hint: "Roles that can act as another identity, breaking audit attribution.",
      query: "?q=impersonate",
    },
    {
      id: "node-access",
      label: "Node Access",
      count: nodeAccess,
      availability: "available",
      hint: "Roles reaching node or kubelet surfaces.",
      query: "?q=node",
    },
    {
      id: "anonymous-access",
      label: "Anonymous Access",
      count: anonymousBindings,
      availability: "available",
      hint: "Bindings granting rights to system:anonymous or system:unauthenticated.",
      query: "?q=anonymous",
    },
    {
      id: "privileged-accounts",
      label: "Privileged Accounts",
      count: privilegedSubjects.size,
      availability: "available",
      hint: "Subjects holding bind, escalate, impersonate or wildcard verbs through any binding.",
      query: "?q=privileged",
    },
    {
      id: "hostpath",
      label: "HostPath",
      count: 0,
      availability: "not-collected",
      hint: "Workloads mounting host filesystem paths.",
      query: "",
      unavailableReason:
        "HostPath is a Pod Security concern (securityContext / Pod Security Admission), not an RBAC object. It cannot be derived from an RBAC snapshot — the collector must also capture pod specs.",
    },
  ]
}
