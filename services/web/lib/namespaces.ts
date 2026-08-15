// Canonical namespace vocabulary for the app.
//
// A ClusterRole or ClusterRoleBinding has no namespace. Different surfaces used
// to handle that differently — the heatmap added a synthetic "cluster-wide"
// row and counted it among namespaces, while the context bar counted only real
// namespaces — so the same snapshot read as "6 namespaces" in one place and
// "7" in another. `cluster-wide` is a SCOPE, not a namespace: it is counted
// separately, labelled separately, and never included in a namespace count.
//
// services/report-service/src/lib/namespaces.ts mirrors this module so the PDF
// and the UI describe the same snapshot the same way.

import type { RBACFinding, ScanDataset } from "./rbac-scanner"

/** Bucket key for grants that are not scoped to a namespace. */
export const CLUSTER_SCOPE = "cluster-wide"

/** Label shown wherever the cluster-scoped bucket is displayed. */
export const CLUSTER_SCOPE_LABEL = "Cluster-wide"

// "null"/"undefined" appear when a snapshot serialises an absent namespace as a
// string rather than omitting it. Without them the filter lists offer a
// namespace literally called "null", and the namespace count is one too high.
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

/** Display label for one grant's scope. */
export function scopeLabel(namespace: string | null | undefined): string {
  return isClusterScoped(namespace) ? CLUSTER_SCOPE_LABEL : namespace!.trim()
}

export interface NamespaceStats {
  /** Real namespaces only, sorted. Never contains the cluster-wide bucket. */
  namespaces: string[]
  namespaceCount: number
  clusterScopedRoles: number
  clusterScopedBindings: number
  hasClusterScopedAccess: boolean
}

export function namespaceStats(dataset: ScanDataset | null | undefined): NamespaceStats {
  const namespaces = new Set<string>()
  let clusterScopedRoles = 0
  let clusterScopedBindings = 0

  for (const role of dataset?.roles ?? []) {
    if (isClusterScoped(role?.namespace)) clusterScopedRoles++
    else namespaces.add(role.namespace!.trim())
  }
  for (const binding of dataset?.bindings ?? []) {
    if (isClusterScoped(binding?.namespace)) clusterScopedBindings++
    else namespaces.add(binding.namespace!.trim())
    for (const subject of binding?.subjects ?? []) {
      if (!isClusterScoped(subject?.namespace)) namespaces.add(subject.namespace!.trim())
    }
  }
  for (const subject of dataset?.subjects ?? []) {
    if (!isClusterScoped(subject?.namespace)) namespaces.add(subject.namespace!.trim())
  }

  return {
    namespaces: [...namespaces].sort(),
    namespaceCount: namespaces.size,
    clusterScopedRoles,
    clusterScopedBindings,
    hasClusterScopedAccess: clusterScopedRoles > 0 || clusterScopedBindings > 0,
  }
}

/**
 * The one phrasing used across the app and the PDF.
 * e.g. "7 namespaces + cluster-wide permissions".
 */
export function describeScope(stats: Pick<NamespaceStats, "namespaceCount" | "hasClusterScopedAccess">): string {
  const base = `${stats.namespaceCount} ${stats.namespaceCount === 1 ? "namespace" : "namespaces"}`
  return stats.hasClusterScopedAccess ? `${base} + cluster-wide permissions` : base
}

/** Namespaces referenced by findings, excluding cluster-scoped ones. */
export function findingNamespaces(findings: RBACFinding[]): string[] {
  const set = new Set<string>()
  for (const finding of findings) {
    if (!isClusterScoped(finding?.namespace)) set.add(finding.namespace.trim())
  }
  return [...set].sort()
}

/** Findings that are cluster-scoped rather than belonging to a namespace. */
export function clusterScopedFindings(findings: RBACFinding[]): RBACFinding[] {
  return findings.filter((f) => isClusterScoped(f?.namespace))
}
