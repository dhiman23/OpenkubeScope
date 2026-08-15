// RBAC inventory: the real object breakdown, not just three aggregate totals.
//
// The old dashboard showed Subjects / Roles / Bindings / Findings, which hides
// the distinction that matters — a ClusterRole is not a Role, and a Group with
// admin rights is a very different problem from a ServiceAccount with them.

import type { Scan, ScanDataset } from "./rbac-scanner"

export interface InventoryCounts {
  users: number
  groups: number
  serviceAccounts: number
  totalSubjects: number
  roles: number
  clusterRoles: number
  totalRoles: number
  roleBindings: number
  clusterRoleBindings: number
  totalBindings: number
  namespaces: string[]
  namespaceCount: number
  permissionRules: number
}

const EMPTY: InventoryCounts = {
  users: 0,
  groups: 0,
  serviceAccounts: 0,
  totalSubjects: 0,
  roles: 0,
  clusterRoles: 0,
  totalRoles: 0,
  roleBindings: 0,
  clusterRoleBindings: 0,
  totalBindings: 0,
  namespaces: [],
  namespaceCount: 0,
  permissionRules: 0,
}

export function computeInventory(dataset: ScanDataset | undefined | null): InventoryCounts {
  if (!dataset) return { ...EMPTY }

  const subjects = dataset.subjects ?? []
  const roles = dataset.roles ?? []
  const bindings = dataset.bindings ?? []

  const namespaces = new Set<string>()
  for (const role of roles) if (role?.namespace) namespaces.add(role.namespace)
  for (const binding of bindings) {
    if (binding?.namespace) namespaces.add(binding.namespace)
    for (const s of binding?.subjects ?? []) if (s?.namespace) namespaces.add(s.namespace)
  }
  for (const s of subjects) if (s?.namespace) namespaces.add(s.namespace)

  let permissionRules = 0
  for (const role of roles) permissionRules += (role?.rules ?? []).length

  return {
    users: subjects.filter((s) => s?.kind === "User").length,
    groups: subjects.filter((s) => s?.kind === "Group").length,
    serviceAccounts: subjects.filter((s) => s?.kind === "ServiceAccount").length,
    totalSubjects: subjects.length,
    roles: roles.filter((r) => r?.kind === "Role").length,
    clusterRoles: roles.filter((r) => r?.kind === "ClusterRole").length,
    totalRoles: roles.length,
    roleBindings: bindings.filter((b) => b?.kind === "RoleBinding").length,
    clusterRoleBindings: bindings.filter((b) => b?.kind === "ClusterRoleBinding").length,
    totalBindings: bindings.length,
    namespaces: Array.from(namespaces).sort(),
    namespaceCount: namespaces.size,
    permissionRules,
  }
}

/**
 * Inventory for a scan, falling back to persisted totals when the dataset was
 * not loaded (list views use loadScansMeta, which omits it). Fields that
 * genuinely cannot be derived stay at 0 and the UI renders them as "—".
 */
export function inventoryForScan(scan: Scan | null | undefined): InventoryCounts {
  if (!scan) return { ...EMPTY }
  if (scan.dataset) return computeInventory(scan.dataset)
  return {
    ...EMPTY,
    totalSubjects: scan.totals?.subjects ?? 0,
    totalRoles: scan.totals?.roles ?? 0,
    totalBindings: scan.totals?.bindings ?? 0,
  }
}

export interface InventoryRow {
  label: string
  value: number
  href: string
  group: "identities" | "authorization" | "bindings"
  emphasis?: boolean
}

/** Inventory rows with the Viewer filter each one opens. */
export function inventoryRows(inv: InventoryCounts, scanId: string): InventoryRow[] {
  const base = `/app/scans/${scanId}/viewer`
  return [
    { label: "Users", value: inv.users, href: `${base}?kind=User`, group: "identities" },
    { label: "Groups", value: inv.groups, href: `${base}?kind=Group`, group: "identities" },
    {
      label: "ServiceAccounts",
      value: inv.serviceAccounts,
      href: `${base}?kind=ServiceAccount`,
      group: "identities",
    },
    { label: "Total Subjects", value: inv.totalSubjects, href: base, group: "identities", emphasis: true },

    { label: "Roles", value: inv.roles, href: `${base}?tab=roles&kind=Role`, group: "authorization" },
    {
      label: "ClusterRoles",
      value: inv.clusterRoles,
      href: `${base}?tab=roles&kind=ClusterRole`,
      group: "authorization",
    },
    {
      label: "Total Roles",
      value: inv.totalRoles,
      href: `${base}?tab=roles`,
      group: "authorization",
      emphasis: true,
    },

    {
      label: "RoleBindings",
      value: inv.roleBindings,
      href: `${base}?tab=bindings&kind=RoleBinding`,
      group: "bindings",
    },
    {
      label: "ClusterRoleBindings",
      value: inv.clusterRoleBindings,
      href: `${base}?tab=bindings&kind=ClusterRoleBinding`,
      group: "bindings",
    },
    {
      label: "Total Bindings",
      value: inv.totalBindings,
      href: `${base}?tab=bindings`,
      group: "bindings",
      emphasis: true,
    },
  ]
}
