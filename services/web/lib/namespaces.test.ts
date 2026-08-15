// The app and the PDF must describe the same snapshot the same way. These
// cases mirror services/report-service/src/lib/report-selection.test.ts, which
// pins the identical rules on the report side.
//
// The bug they close: the heatmap folded cluster-scoped grants into the
// namespace list and counted them, the scan bar counted only real namespaces,
// and a snapshot that serialised an absent namespace as the string "null"
// produced a namespace literally called "null" — so one snapshot read as 6, 7
// and 11 namespaces in three different places.

import { describe, it, expect } from "vitest"

import {
  CLUSTER_SCOPE,
  clusterScopedFindings,
  describeScope,
  findingNamespaces,
  isClusterScoped,
  namespaceStats,
  scopeLabel,
} from "./namespaces"
import type { RBACFinding, ScanDataset } from "./rbac-scanner"

function finding(namespace: string, overrides: Partial<RBACFinding> = {}): RBACFinding {
  return {
    id: overrides.id ?? `f-${namespace}`,
    title: overrides.title ?? "Wildcard permissions: admin",
    description: "",
    severity: overrides.severity ?? "high",
    category: "OVERLY_PERMISSIVE",
    subject: overrides.subject ?? "svc",
    subjectType: "ServiceAccount",
    role: overrides.role ?? "admin",
    namespace,
    remediation: "",
    discoveredAt: "2026-08-13T00:00:00.000Z",
    affectedResources: [],
    impactedSubjects: [],
  }
}

const dataset: ScanDataset = {
  subjects: [
    { name: "svc-a", kind: "ServiceAccount", namespace: "payments" },
    { name: "root", kind: "User" },
  ],
  roles: [
    { name: "r1", kind: "Role", namespace: "payments", rules: [] },
    { name: "r2", kind: "Role", namespace: "prod", rules: [] },
    { name: "cr", kind: "ClusterRole", rules: [] },
    // A snapshot that serialised an absent namespace as a string.
    { name: "r3", kind: "Role", namespace: "null", rules: [] },
  ],
  bindings: [
    {
      name: "b1",
      kind: "RoleBinding",
      namespace: "payments",
      roleRef: { kind: "Role", name: "r1" },
      subjects: [{ kind: "ServiceAccount", name: "svc-a", namespace: "payments" }],
    },
    {
      name: "b2",
      kind: "ClusterRoleBinding",
      roleRef: { kind: "ClusterRole", name: "cr" },
      subjects: [{ kind: "User", name: "root" }],
    },
  ],
  findings: [],
}

describe("isClusterScoped", () => {
  it("treats every absent-namespace spelling as cluster scope", () => {
    for (const value of [undefined, null, "", "*", "cluster-wide", "Cluster-Wide", "-", "null", "undefined"]) {
      expect(isClusterScoped(value)).toBe(true)
    }
  })

  it("treats a real namespace as namespaced", () => {
    for (const value of ["payments", "kube-system", "prod"]) {
      expect(isClusterScoped(value)).toBe(false)
    }
  })
})

describe("namespaceStats", () => {
  it("counts only real namespaces and buckets the rest as cluster scope", () => {
    const stats = namespaceStats(dataset)

    expect(stats.namespaces).toEqual(["payments", "prod"])
    expect(stats.namespaceCount).toBe(2)
    expect(stats.namespaces).not.toContain(CLUSTER_SCOPE)
    // "null" must never become a namespace.
    expect(stats.namespaces).not.toContain("null")
    expect(stats.clusterScopedRoles).toBe(2) // the ClusterRole and the "null" Role
    expect(stats.clusterScopedBindings).toBe(1)
    expect(stats.hasClusterScopedAccess).toBe(true)
  })

  it("reports no cluster-scoped access when everything is namespaced", () => {
    const stats = namespaceStats({
      ...dataset,
      roles: [{ name: "r1", kind: "Role", namespace: "payments", rules: [] }],
      bindings: [
        {
          name: "b1",
          kind: "RoleBinding",
          namespace: "payments",
          roleRef: { kind: "Role", name: "r1" },
          subjects: [{ kind: "ServiceAccount", name: "svc-a", namespace: "payments" }],
        },
      ],
      subjects: [{ name: "svc-a", kind: "ServiceAccount", namespace: "payments" }],
    })

    expect(stats.namespaceCount).toBe(1)
    expect(stats.hasClusterScopedAccess).toBe(false)
  })

  it("handles a missing dataset without throwing", () => {
    expect(namespaceStats(null).namespaceCount).toBe(0)
    expect(namespaceStats(undefined).hasClusterScopedAccess).toBe(false)
  })
})

describe("describeScope", () => {
  it("uses one phrasing everywhere", () => {
    expect(describeScope({ namespaceCount: 7, hasClusterScopedAccess: true })).toBe(
      "7 namespaces + cluster-wide permissions",
    )
    expect(describeScope({ namespaceCount: 7, hasClusterScopedAccess: false })).toBe("7 namespaces")
    expect(describeScope({ namespaceCount: 1, hasClusterScopedAccess: false })).toBe("1 namespace")
    expect(describeScope({ namespaceCount: 0, hasClusterScopedAccess: true })).toBe(
      "0 namespaces + cluster-wide permissions",
    )
  })
})

describe("scopeLabel", () => {
  it("labels the cluster bucket rather than printing a raw value", () => {
    expect(scopeLabel(undefined)).toBe("Cluster-wide")
    expect(scopeLabel("*")).toBe("Cluster-wide")
    expect(scopeLabel("null")).toBe("Cluster-wide")
    expect(scopeLabel("payments")).toBe("payments")
  })
})

describe("finding partitioning", () => {
  const findings = [finding("payments"), finding("prod"), finding("*"), finding("")]

  it("splits namespaced findings from cluster-scoped ones", () => {
    expect(findingNamespaces(findings)).toEqual(["payments", "prod"])
    expect(clusterScopedFindings(findings)).toHaveLength(2)
  })

  it("keeps the two partitions disjoint and complete", () => {
    const namespaced = findings.filter((f) => !isClusterScoped(f.namespace))
    expect(namespaced.length + clusterScopedFindings(findings).length).toBe(findings.length)
  })
})
