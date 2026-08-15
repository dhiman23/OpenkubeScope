// Regression tests for the defect this pass exists to close: a report that
// silently described a different snapshot than the one it was generated from.
//
// The reported symptom, with real numbers from the dev database: the app showed
// a Production snapshot with 121 findings (38 critical / 83 high), 79 subjects,
// 112 roles and 99 bindings, while the generated PDF claimed 230 findings
// (103 critical / 127 high), 0 subjects, 560 roles and 340 bindings. Generation
// accepted scan ids, persisted them, and then ignored them — re-resolving
// "latest scan per cluster" and summing across everything it found.

import { describe, it, expect } from "vitest"

import { buildReportData } from "./report-engine"
import { buildProvenance, countBoundSubjects, resolveSubjectCount, toIso } from "./provenance"
import { namespaceStats, describeScope, isClusterScoped, scopeLabel } from "./namespaces"
import type { ScanRow, ScanDataset, RBACFinding } from "./rbac-types"

function finding(overrides: Partial<RBACFinding> = {}): RBACFinding {
  return {
    id: overrides.id ?? "f1",
    title: overrides.title ?? "Wildcard permissions",
    description: overrides.description ?? "Role grants * on *",
    severity: overrides.severity ?? "critical",
    category: overrides.category ?? "OVERLY_PERMISSIVE",
    subject: overrides.subject ?? "svc-a",
    subjectType: overrides.subjectType ?? "ServiceAccount",
    role: overrides.role ?? "admin-role",
    namespace: overrides.namespace ?? "payments",
    remediation: overrides.remediation ?? "Scope the rule to named resources.",
    discoveredAt: overrides.discoveredAt ?? "2026-08-13T00:00:00.000Z",
    affectedResources: overrides.affectedResources ?? ["*"],
    impactedSubjects: overrides.impactedSubjects ?? ["svc-a"],
    evidence: overrides.evidence,
  }
}

function dataset(overrides: Partial<ScanDataset> = {}): ScanDataset {
  return {
    subjects: overrides.subjects ?? [{ name: "svc-a", kind: "ServiceAccount", namespace: "payments" }],
    roles: overrides.roles ?? [{ name: "admin-role", kind: "Role", namespace: "payments", rules: [] }],
    bindings: overrides.bindings ?? [
      {
        name: "b1",
        kind: "RoleBinding",
        namespace: "payments",
        roleRef: { kind: "Role", name: "admin-role" },
        subjects: [{ kind: "ServiceAccount", name: "svc-a", namespace: "payments" }],
      },
    ],
    findings: overrides.findings ?? [finding()],
  }
}

function scan(overrides: Partial<ScanRow> = {}): ScanRow {
  const data = overrides.scan_data ?? dataset()
  return {
    id: overrides.id ?? "scan-selected",
    workspace_id: overrides.workspace_id ?? "ws-1",
    file_name: overrides.file_name ?? "rbac-snapshot.zip",
    cluster_name: overrides.cluster_name ?? "Production",
    scan_data: data,
    totals: overrides.totals ?? {
      subjects: data.subjects.length,
      roles: data.roles.length,
      bindings: data.bindings.length,
    },
    risk_counts: overrides.risk_counts ?? {
      critical: data.findings.filter((f) => f.severity === "critical").length,
      high: data.findings.filter((f) => f.severity === "high").length,
      medium: 0,
      low: 0,
    },
    created_at: overrides.created_at ?? "2026-08-13T19:51:44.063Z",
  }
}

/** The selected snapshot, at the scale of the reported bug. */
function selectedSnapshot(): ScanRow {
  const findings: RBACFinding[] = [
    ...Array.from({ length: 38 }, (_, i) => finding({ id: `crit-${i}`, severity: "critical" })),
    ...Array.from({ length: 83 }, (_, i) => finding({ id: `high-${i}`, severity: "high", title: "Secrets read" })),
  ]
  return scan({
    id: "f55f6699-ede7-450b-aa91-446b8382e775",
    scan_data: dataset({ findings }),
    totals: { subjects: 79, roles: 112, bindings: 99 },
    risk_counts: { critical: 38, high: 83, medium: 0, low: 0 },
  })
}

/** A newer, much larger snapshot of the same cluster. */
function newerSnapshot(): ScanRow {
  const findings = Array.from({ length: 230 }, (_, i) =>
    finding({ id: `other-${i}`, severity: i < 103 ? "critical" : "high" }),
  )
  return scan({
    id: "d27ffcb3-5426-4ab7-b789-11958cd1e2c9",
    file_name: "kubescope_2k_snapshot-export.json",
    scan_data: dataset({ findings }),
    totals: { subjects: 0, roles: 560, bindings: 340 },
    risk_counts: { critical: 103, high: 127, medium: 0, low: 0 },
    created_at: "2026-08-14T23:01:05.367Z",
  })
}

describe("report data is bound to the selected snapshot", () => {
  it("reports the selected snapshot's counts, not an aggregate across snapshots", () => {
    const selected = selectedSnapshot()

    const data = buildReportData({
      workspaceId: "ws-1",
      workspaceName: "Acme",
      clusters: ["Production"],
      reportType: "RBAC_AUDIT",
      format: "PDF",
      scans: [selected],
    })

    expect(data.summary).toEqual({ subjects: 79, roles: 112, bindings: 99 })
    expect(data.risks.critical).toBe(38)
    expect(data.risks.high).toBe(83)
    expect(data.findings).toHaveLength(121)
  })

  it("does not blend a second snapshot of the same cluster into the totals", () => {
    const selected = selectedSnapshot()
    const newer = newerSnapshot()

    const selectedOnly = buildReportData({
      workspaceId: "ws-1",
      workspaceName: "Acme",
      clusters: ["Production"],
      reportType: "RBAC_AUDIT",
      format: "PDF",
      scans: [selected],
    })
    const blended = buildReportData({
      workspaceId: "ws-1",
      workspaceName: "Acme",
      clusters: ["Production"],
      reportType: "RBAC_AUDIT",
      format: "PDF",
      scans: [selected, newer],
    })

    // The engine aggregates whatever it is given; generate.ts is what must give
    // it exactly one snapshot per cluster. This pins the difference so a
    // regression in the selection step is visible as a number change.
    expect(selectedOnly.summary.roles).toBe(112)
    expect(blended.summary.roles).toBe(672)
    expect(selectedOnly.findings).toHaveLength(121)
    expect(blended.findings).toHaveLength(351)
  })
})

describe("provenance", () => {
  it("marks a report on an older snapshot as not latest", () => {
    const selected = selectedSnapshot()
    const latestIds = new Map([["Production", "d27ffcb3-5426-4ab7-b789-11958cd1e2c9"]])

    const provenance = buildProvenance({
      scans: [selected],
      latestIdsByCluster: latestIds,
      selectionMode: "EXPLICIT",
    })

    expect(provenance.based_on_latest).toBe(false)
    expect(provenance.sources).toHaveLength(1)
    expect(provenance.sources[0].scan_id).toBe(selected.id)
    expect(provenance.sources[0].cluster_name).toBe("Production")
    expect(provenance.sources[0].snapshot_taken_at).toBe(selected.created_at)
    expect(provenance.selection_mode).toBe("EXPLICIT")
  })

  it("marks a report on the newest snapshot as latest", () => {
    const selected = selectedSnapshot()
    const provenance = buildProvenance({
      scans: [selected],
      latestIdsByCluster: new Map([["Production", selected.id]]),
      selectionMode: "EXPLICIT",
    })

    expect(provenance.based_on_latest).toBe(true)
    expect(provenance.sources[0].is_latest).toBe(true)
  })

  it("records the scope using the agreed namespace phrasing", () => {
    const withClusterWide = scan({
      scan_data: dataset({
        bindings: [
          {
            name: "b1",
            kind: "RoleBinding",
            namespace: "payments",
            roleRef: { kind: "Role", name: "r" },
            subjects: [{ kind: "ServiceAccount", name: "svc-a", namespace: "payments" }],
          },
          {
            name: "b2",
            kind: "ClusterRoleBinding",
            roleRef: { kind: "ClusterRole", name: "cluster-admin" },
            subjects: [{ kind: "User", name: "root" }],
          },
        ],
      }),
    })

    const provenance = buildProvenance({
      scans: [withClusterWide],
      latestIdsByCluster: new Map(),
      selectionMode: "EXPLICIT",
    })

    expect(provenance.scope).toBe("1 namespace + cluster-wide permissions")
  })

  it("carries the report's data into the built report", () => {
    const selected = selectedSnapshot()
    const provenance = buildProvenance({
      scans: [selected],
      latestIdsByCluster: new Map([["Production", selected.id]]),
      selectionMode: "EXPLICIT",
      filters: ["Open findings", "All namespaces"],
    })

    const data = buildReportData({
      workspaceId: "ws-1",
      workspaceName: "Acme",
      clusters: ["Production"],
      reportType: "RBAC_AUDIT",
      format: "PDF",
      scans: [selected],
      provenance,
    })

    expect(data.provenance?.sources[0].scan_id).toBe(selected.id)
    expect(data.provenance?.filters).toEqual(["Open findings", "All namespaces"])
    // generated_at must be the provenance timestamp, so the row, the JSON and
    // the PDF cover all state the same generation time.
    expect(data.generated_at).toBe(provenance.generated_at)
  })
})

describe("timestamps", () => {
  it("normalises a locale-formatted capture time to ISO 8601", () => {
    // created_at crosses the gRPC boundary as a proto string, which stringifies
    // a Date in the server's locale. A report read months later in another
    // timezone must not depend on that.
    const locale = "Thu Aug 13 2026 22:51:44 GMT+0300 (Arabian Standard Time)"
    expect(toIso(locale)).toBe("2026-08-13T19:51:44.000Z")
  })

  it("leaves an ISO timestamp untouched and passes through junk unharmed", () => {
    expect(toIso("2026-08-13T19:51:44.063Z")).toBe("2026-08-13T19:51:44.063Z")
    expect(toIso("not a date")).toBe("not a date")
  })

  it("stores the capture time as ISO in provenance", () => {
    const scan = selectedSnapshot()
    scan.created_at = "Thu Aug 13 2026 22:51:44 GMT+0300 (Arabian Standard Time)"

    const provenance = buildProvenance({
      scans: [scan],
      latestIdsByCluster: new Map(),
      selectionMode: "EXPLICIT",
    })

    expect(provenance.sources[0].snapshot_taken_at).toBe("2026-08-13T19:51:44.000Z")
  })
})

describe("namespace terminology", () => {
  it("never counts cluster-wide as a namespace", () => {
    const stats = namespaceStats(
      dataset({
        roles: [
          { name: "r1", kind: "Role", namespace: "payments", rules: [] },
          { name: "r2", kind: "Role", namespace: "prod", rules: [] },
          { name: "cr", kind: "ClusterRole", rules: [] },
        ],
        bindings: [
          {
            name: "b1",
            kind: "ClusterRoleBinding",
            roleRef: { kind: "ClusterRole", name: "cr" },
            subjects: [{ kind: "User", name: "root" }],
          },
        ],
      }),
    )

    expect(stats.namespaces).toEqual(["payments", "prod"])
    expect(stats.namespaceCount).toBe(2)
    expect(stats.clusterScopedRoles).toBe(1)
    expect(stats.clusterScopedBindings).toBe(1)
    expect(stats.namespaces).not.toContain("cluster-wide")
  })

  it("treats the cluster-scope aliases consistently", () => {
    for (const value of [undefined, null, "", "*", "cluster-wide", "Cluster-Wide"]) {
      expect(isClusterScoped(value)).toBe(true)
    }
    expect(isClusterScoped("payments")).toBe(false)
    expect(scopeLabel(undefined)).toBe("Cluster-wide")
    expect(scopeLabel("payments")).toBe("payments")
  })

  it("phrases scope the same way everywhere", () => {
    expect(
      describeScope({ namespaces: [], namespaceCount: 7, clusterScopedBindings: 3, clusterScopedRoles: 0 }),
    ).toBe("7 namespaces + cluster-wide permissions")
    expect(
      describeScope({ namespaces: [], namespaceCount: 7, clusterScopedBindings: 0, clusterScopedRoles: 0 }),
    ).toBe("7 namespaces")
    expect(
      describeScope({ namespaces: [], namespaceCount: 1, clusterScopedBindings: 0, clusterScopedRoles: 0 }),
    ).toBe("1 namespace")
  })
})

describe("subject reporting", () => {
  it("counts distinct bound subjects across bindings", () => {
    const data = dataset({
      bindings: [
        {
          name: "b1",
          kind: "RoleBinding",
          namespace: "payments",
          roleRef: { kind: "Role", name: "r" },
          subjects: [
            { kind: "ServiceAccount", name: "svc-a", namespace: "payments" },
            { kind: "User", name: "alice" },
          ],
        },
        {
          name: "b2",
          kind: "RoleBinding",
          namespace: "prod",
          roleRef: { kind: "Role", name: "r" },
          // svc-a in another namespace is a different subject; alice repeats.
          subjects: [
            { kind: "ServiceAccount", name: "svc-a", namespace: "prod" },
            { kind: "User", name: "alice" },
          ],
        },
      ],
    })

    expect(countBoundSubjects(data)).toBe(3)
  })

  it("derives subjects from bindings when the recorded total is empty", () => {
    const withEmptyTotal = scan({ totals: { subjects: 0, roles: 5, bindings: 1 } })
    const resolved = resolveSubjectCount(withEmptyTotal)

    expect(resolved.count).toBe(1)
    expect(resolved.derived).toBe(true)
  })

  it("reports a genuinely subject-less snapshot as absent rather than wrong", () => {
    const roleOnly = scan({
      scan_data: dataset({ bindings: [], findings: [finding({ subject: "N/A" })] }),
      totals: { subjects: 0, roles: 5, bindings: 0 },
    })

    expect(resolveSubjectCount(roleOnly)).toEqual({ count: 0, derived: false })

    const data = buildReportData({
      workspaceId: "ws-1",
      workspaceName: "Acme",
      clusters: ["Production"],
      reportType: "RBAC_AUDIT",
      format: "PDF",
      scans: [roleOnly],
    })

    expect(data.scope?.subjects_absent).toBe(true)
    expect(data.scope?.bound_subjects).toBe(0)
  })
})

describe("finding grouping and priorities", () => {
  it("groups repeated findings and keeps their scope", () => {
    const findings = [
      finding({ id: "a", title: "Wildcard permissions", namespace: "payments", role: "role-a" }),
      finding({ id: "b", title: "Wildcard permissions", namespace: "prod", role: "role-b" }),
      finding({ id: "c", title: "Wildcard permissions", namespace: "*", role: "role-c" }),
    ]
    const data = buildReportData({
      workspaceId: "ws-1",
      workspaceName: "Acme",
      clusters: ["Production"],
      reportType: "RBAC_AUDIT",
      format: "PDF",
      scans: [scan({ scan_data: dataset({ findings }) })],
    })

    const group = data.grouped_findings?.find((g) => g.title === "Wildcard permissions")
    expect(group?.count).toBe(3)
    expect(group?.namespaces.sort()).toEqual(["payments", "prod"])
    expect(group?.cluster_scoped).toBe(true)
    expect(group?.roles).toHaveLength(3)
    expect(group?.why_it_matters).not.toBe("")
  })

  it("attaches evidence and a computed score gain to each priority", () => {
    const findings = Array.from({ length: 6 }, (_, i) =>
      finding({ id: `w-${i}`, title: "Cluster-admin binding", severity: "critical", role: `role-${i}` }),
    )
    const data = buildReportData({
      workspaceId: "ws-1",
      workspaceName: "Acme",
      clusters: ["Production"],
      reportType: "RBAC_AUDIT",
      format: "PDF",
      scans: [scan({ scan_data: dataset({ findings }), totals: { subjects: 1, roles: 20, bindings: 1 } })],
    })

    const top = data.priorities?.[0]
    expect(top).toBeDefined()
    expect(top!.finding_count).toBe(6)
    expect(top!.example_roles.length).toBeGreaterThan(0)
    expect(top!.suggested_owner).not.toBe("")
    expect(top!.expected_score_gain).toBeGreaterThanOrEqual(0)
  })
})

describe("security score", () => {
  it("caps the score and reports the uncapped value", () => {
    const findings = Array.from({ length: 38 }, (_, i) => finding({ id: `c-${i}`, severity: "critical" }))
    const data = buildReportData({
      workspaceId: "ws-1",
      workspaceName: "Acme",
      clusters: ["Production"],
      reportType: "RBAC_AUDIT",
      format: "PDF",
      scans: [scan({ scan_data: dataset({ findings }), totals: { subjects: 79, roles: 1600, bindings: 99 } })],
    })

    const score = data.security_score!
    expect(score.available).toBe(true)
    // Any open critical caps the headline score at 74 (design spec A.5).
    expect(score.score).toBeLessThanOrEqual(74)
    expect(score.uncappedScore).toBeGreaterThanOrEqual(score.score)
    expect(score.cappedBy).toBe("critical")
  })
})
