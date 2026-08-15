// Canonical namespace vocabulary.
//
// A ClusterRoleBinding grants access with no namespace. Earlier code bucketed
// that under the literal string "cluster-wide" and then counted the buckets,
// so a snapshot with 7 namespaces plus cluster-scoped grants reported "8
// namespaces" in one view and "7" in another. `cluster-wide` is not a
// namespace — it is a scope. It is counted and labelled separately everywhere.
//
// The web app mirrors this module at services/web/lib/namespaces.ts; the two
// must agree, because the UI and the PDF describe the same snapshot.

import type { ScanDataset, RBACFinding } from "./rbac-types"

/** The bucket key used for grants that are not namespaced. */
export const CLUSTER_SCOPE = "cluster-wide"

/**
 * Values that mean "this grant is not scoped to a namespace".
 *
 * "null"/"undefined" appear when a snapshot serialises an absent namespace as a
 * string rather than omitting it; without them a report counts a namespace
 * literally called "null".
 */
const CLUSTER_SCOPE_ALIASES = new Set([
  "",
  "*",
  "all",
  CLUSTER_SCOPE,
  "cluster",
  "cluster-scoped",
  "-",
  "null",
  "undefined",
])

export function isClusterScoped(namespace: string | null | undefined): boolean {
  if (namespace === null || namespace === undefined) return true
  return CLUSTER_SCOPE_ALIASES.has(namespace.trim().toLowerCase())
}

export interface NamespaceStats {
  /** Real namespaces only, sorted. Never contains the cluster-wide bucket. */
  namespaces: string[]
  namespaceCount: number
  /** Objects whose scope is the whole cluster rather than one namespace. */
  clusterScopedBindings: number
  clusterScopedRoles: number
}

export function namespaceStats(dataset: ScanDataset | null | undefined): NamespaceStats {
  const namespaces = new Set<string>()
  let clusterScopedBindings = 0
  let clusterScopedRoles = 0

  for (const role of dataset?.roles ?? []) {
    if (isClusterScoped(role.namespace)) clusterScopedRoles++
    else namespaces.add(role.namespace!.trim())
  }

  for (const binding of dataset?.bindings ?? []) {
    if (isClusterScoped(binding.namespace)) clusterScopedBindings++
    else namespaces.add(binding.namespace!.trim())
  }

  return {
    namespaces: [...namespaces].sort(),
    namespaceCount: namespaces.size,
    clusterScopedBindings,
    clusterScopedRoles,
  }
}

/** Namespaces referenced by findings, excluding cluster-scoped ones. */
export function findingNamespaces(findings: RBACFinding[]): string[] {
  const set = new Set<string>()
  for (const f of findings) {
    if (!isClusterScoped(f.namespace)) set.add(f.namespace.trim())
  }
  return [...set].sort()
}

/**
 * The one phrasing used in the UI, the PDF, and the CSV.
 * e.g. "7 namespaces + cluster-wide permissions" / "7 namespaces".
 */
export function describeScope(stats: NamespaceStats): string {
  const noun = stats.namespaceCount === 1 ? "namespace" : "namespaces"
  const base = `${stats.namespaceCount} ${noun}`
  return stats.clusterScopedBindings > 0 || stats.clusterScopedRoles > 0
    ? `${base} + cluster-wide permissions`
    : base
}

/** Display label for a single grant's scope. */
export function scopeLabel(namespace: string | null | undefined): string {
  return isClusterScoped(namespace) ? "Cluster-wide" : namespace!.trim()
}
