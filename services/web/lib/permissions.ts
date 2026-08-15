// Translation layer: raw Kubernetes RBAC primitives -> language a human reads.
//
// The viewer must never render a bare "*" or a raw verb array as its primary
// signal. Raw values stay available one level down (see rawRule()), so experts
// lose nothing — the abstraction delays the detail, it does not hide it.

import type { RBACRule, RBACRole, RBACBinding, RBACSubject } from "./rbac-scanner"

export type AccessLevel = "admin" | "write" | "read" | "none"

export const ACCESS_LABEL: Record<AccessLevel, string> = {
  admin: "ADMIN",
  write: "WRITE",
  read: "READ",
  none: "NONE",
}

const READ_VERBS = ["get", "list", "watch"]
const WRITE_VERBS = ["create", "update", "patch", "delete", "deletecollection"]
const ADMIN_VERBS = ["escalate", "bind", "impersonate", "approve", "sign"]

export function isWildcard(value: string): boolean {
  return value === "*"
}

export function hasWildcard(values: string[] = []): boolean {
  return values.some(isWildcard)
}

/** Highest access level implied by a verb list. */
export function verbsToAccessLevel(verbs: string[] = []): AccessLevel {
  if (verbs.some(isWildcard) || verbs.some((v) => ADMIN_VERBS.includes(v))) return "admin"
  if (verbs.some((v) => WRITE_VERBS.includes(v))) return "write"
  if (verbs.some((v) => READ_VERBS.includes(v))) return "read"
  return verbs.length > 0 ? "read" : "none"
}

/** Group a verb list into the three buckets the UI shows. */
export function groupVerbs(verbs: string[] = []): Record<Exclude<AccessLevel, "none">, string[]> {
  const wildcard = verbs.some(isWildcard)
  return {
    read: wildcard ? [...READ_VERBS] : verbs.filter((v) => READ_VERBS.includes(v)),
    write: wildcard ? [...WRITE_VERBS] : verbs.filter((v) => WRITE_VERBS.includes(v)),
    admin: wildcard ? [...ADMIN_VERBS] : verbs.filter((v) => ADMIN_VERBS.includes(v)),
  }
}

export function accessRank(level: AccessLevel): number {
  return { admin: 3, write: 2, read: 1, none: 0 }[level]
}

/** Human label for a resource list. "*" becomes "All Resources", never a bare star. */
export function describeResources(resources: string[] = []): string {
  if (resources.length === 0) return "None"
  if (hasWildcard(resources)) return "All Resources"
  if (resources.length <= 3) return resources.join(", ")
  return `${resources.slice(0, 3).join(", ")} +${resources.length - 3}`
}

export function describeVerbs(verbs: string[] = []): string {
  if (verbs.length === 0) return "None"
  if (hasWildcard(verbs)) return "Wildcard Access"
  if (verbs.length <= 4) return verbs.join(", ")
  return `${verbs.slice(0, 4).join(", ")} +${verbs.length - 4}`
}

export function describeApiGroups(apiGroups: string[] = []): string {
  if (apiGroups.length === 0) return "core"
  if (hasWildcard(apiGroups)) return "All API Groups"
  return apiGroups.map((g) => (g === "" ? "core" : g)).join(", ")
}

/** Plain-language meaning for resources that carry outsized risk. */
const RESOURCE_MEANING: Record<string, string> = {
  "pods/exec": "Shell access to running containers",
  "pods/attach": "Attach to running containers",
  "pods/portforward": "Network tunnel into pods",
  "serviceaccounts/token": "Can mint identity tokens",
  tokenreviews: "Can validate identity tokens",
  secrets: "Access to stored credentials",
  "nodes/proxy": "Direct access to the kubelet API",
  nodes: "Cluster infrastructure visibility",
  clusterroles: "Can rewrite cluster authorization",
  clusterrolebindings: "Can grant cluster authorization",
  rolebindings: "Can grant namespace authorization",
}

export function resourceMeaning(resource: string): string | null {
  if (isWildcard(resource)) return "Every resource in the cluster"
  return RESOURCE_MEANING[resource] ?? null
}

/** Resources whose presence should be flagged inline in the viewer. */
export function isSensitiveResource(resource: string): boolean {
  return isWildcard(resource) || resource in RESOURCE_MEANING
}

export function scopeLabel(namespace?: string | null): string {
  if (!namespace || namespace === "*") return "Cluster-wide"
  return namespace
}

export function subjectKey(subject: { kind: string; name: string; namespace?: string }): string {
  return `${subject.kind}:${subject.namespace || "-"}/${subject.name}`
}

export function parseSubjectKey(key: string): { kind: string; namespace: string | null; name: string } | null {
  const m = /^([^:]+):([^/]*)\/(.+)$/.exec(key)
  if (!m) return null
  return { kind: m[1], namespace: m[2] === "-" ? null : m[2], name: m[3] }
}

export function rawRule(rule: RBACRule): string {
  return JSON.stringify(
    {
      apiGroups: rule.apiGroups ?? [],
      resources: rule.resources ?? [],
      verbs: rule.verbs ?? [],
      ...(rule.resourceNames?.length ? { resourceNames: rule.resourceNames } : {}),
    },
    null,
    2,
  )
}

/** Highest access level a role grants anywhere in its rules. */
export function roleAccessLevel(role: RBACRole): AccessLevel {
  let best: AccessLevel = "none"
  for (const rule of role.rules ?? []) {
    const level = verbsToAccessLevel(rule?.verbs ?? [])
    if (accessRank(level) > accessRank(best)) best = level
  }
  return best
}

/** Every distinct resource a role touches. */
export function roleResources(role: RBACRole): string[] {
  const out = new Set<string>()
  for (const rule of role.rules ?? []) {
    for (const r of rule?.resources ?? []) out.add(r)
  }
  return Array.from(out)
}

// ---------------------------------------------------------------------------
// Subject -> effective access resolution
// ---------------------------------------------------------------------------

export interface GrantChainLink {
  bindingName: string
  bindingKind: RBACBinding["kind"]
  bindingNamespace: string | null
  roleName: string
  roleKind: string
  role: RBACRole | null
}

export interface EffectiveAccess {
  key: string
  subject: RBACSubject
  namespaces: string[]
  accessLevel: AccessLevel
  resources: string[]
  verbs: string[]
  chain: GrantChainLink[]
  clusterScopedGrants: number
  wildcard: boolean
}

function normalizeRoleKey(kind: string, name: string, namespace?: string | null): string {
  return kind === "ClusterRole" ? `ClusterRole/${name}` : `Role/${namespace || ""}/${name}`
}

/**
 * Resolve every subject in a dataset to its effective access.
 * One pass over bindings; roles indexed up front. O(bindings × subjects-per-binding).
 */
export function resolveEffectiveAccess(
  subjects: RBACSubject[],
  roles: RBACRole[],
  bindings: RBACBinding[],
): Map<string, EffectiveAccess> {
  const roleIndex = new Map<string, RBACRole>()
  for (const role of roles ?? []) {
    if (!role?.name) continue
    roleIndex.set(normalizeRoleKey(role.kind, role.name, role.namespace), role)
    // Fallback lookup by bare name — snapshots are not always internally consistent.
    if (!roleIndex.has(role.name)) roleIndex.set(role.name, role)
  }

  const out = new Map<string, EffectiveAccess>()
  const ensure = (s: { kind: string; name: string; namespace?: string }): EffectiveAccess => {
    const key = subjectKey(s)
    let entry = out.get(key)
    if (!entry) {
      entry = {
        key,
        subject: { kind: s.kind as RBACSubject["kind"], name: s.name, namespace: s.namespace },
        namespaces: [],
        accessLevel: "none",
        resources: [],
        verbs: [],
        chain: [],
        clusterScopedGrants: 0,
        wildcard: false,
      }
      out.set(key, entry)
    }
    return entry
  }

  // Seed from the declared subject list so unbound subjects still appear.
  for (const s of subjects ?? []) {
    if (s?.name) ensure(s)
  }

  for (const binding of bindings ?? []) {
    if (!binding?.roleRef?.name) continue
    const role =
      roleIndex.get(normalizeRoleKey(binding.roleRef.kind, binding.roleRef.name, binding.namespace)) ??
      roleIndex.get(binding.roleRef.name) ??
      null

    for (const s of binding.subjects ?? []) {
      if (!s?.name) continue
      const entry = ensure(s)
      entry.chain.push({
        bindingName: binding.name,
        bindingKind: binding.kind,
        bindingNamespace: binding.namespace ?? null,
        roleName: binding.roleRef.name,
        roleKind: binding.roleRef.kind,
        role,
      })
      if (binding.kind === "ClusterRoleBinding") entry.clusterScopedGrants += 1

      const ns = binding.namespace ?? "*"
      if (!entry.namespaces.includes(ns)) entry.namespaces.push(ns)

      if (role) {
        for (const rule of role.rules ?? []) {
          const level = verbsToAccessLevel(rule?.verbs ?? [])
          if (accessRank(level) > accessRank(entry.accessLevel)) entry.accessLevel = level
          for (const r of rule?.resources ?? []) {
            if (!entry.resources.includes(r)) entry.resources.push(r)
            if (isWildcard(r)) entry.wildcard = true
          }
          for (const v of rule?.verbs ?? []) {
            if (!entry.verbs.includes(v)) entry.verbs.push(v)
            if (isWildcard(v)) entry.wildcard = true
          }
        }
      }
    }
  }

  return out
}
