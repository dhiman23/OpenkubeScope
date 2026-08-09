import { describe, it, expect } from "vitest"
import { generateStableId, generateFindings, parseSnapshotJSON, type RBACRole } from "./rbac-engine"

describe("generateStableId", () => {
  it("is deterministic for the same content", () => {
    expect(generateStableId("hello world")).toBe(generateStableId("hello world"))
  })

  it("differs for different content", () => {
    expect(generateStableId("a")).not.toBe(generateStableId("b"))
  })
})

describe("generateFindings", () => {
  it("returns an empty array for empty input", () => {
    expect(generateFindings([], [])).toEqual([])
  })

  it("flags a cluster-admin role as critical / OVERLY_PERMISSIVE", () => {
    const roles: RBACRole[] = [
      {
        name: "cluster-admin",
        kind: "ClusterRole",
        rules: [{ apiGroups: ["*"], resources: ["*"], verbs: ["*"] }],
      },
    ]
    const findings = generateFindings(roles, [])
    const ca = findings.find((f) => f.title.includes("Cluster-admin"))
    expect(ca).toBeDefined()
    expect(ca!.severity).toBe("critical")
    expect(ca!.category).toBe("OVERLY_PERMISSIVE")
  })

  it("flags secrets write access as PRIVILEGE_ESCALATION", () => {
    const roles: RBACRole[] = [
      {
        name: "secret-writer",
        kind: "Role",
        namespace: "default",
        rules: [{ apiGroups: [""], resources: ["secrets"], verbs: ["create", "update"] }],
      },
    ]
    const findings = generateFindings(roles, [])
    const sec = findings.find((f) => f.title.includes("Secrets WRITE"))
    expect(sec).toBeDefined()
    expect(sec!.category).toBe("PRIVILEGE_ESCALATION")
  })
})

describe("parseSnapshotJSON subject extraction", () => {
  it("reads the 'subject' scalar when subjects[] is present but empty", () => {
    const snapshot = JSON.stringify({
      roles: [{ name: "role-a", kind: "ClusterRole", rules: [] }],
      bindings: [
        {
          name: "unknown",
          kind: "RoleBinding",
          namespace: "platform",
          roleRef: { kind: "ClusterRole", name: "role-a" },
          subjects: [],
          subject: "ServiceAccount:payments:sa-45",
        },
        {
          name: "unknown",
          kind: "RoleBinding",
          namespace: "monitoring",
          roleRef: { kind: "ClusterRole", name: "role-a" },
          subjects: [],
          subject: "Group:team-23",
        },
      ],
    })

    const dataset = parseSnapshotJSON(snapshot)

    expect(dataset.subjects).toHaveLength(2)
    expect(dataset.subjects).toContainEqual({ kind: "ServiceAccount", name: "sa-45", namespace: "payments" })
    expect(dataset.subjects).toContainEqual({ kind: "Group", name: "team-23", namespace: undefined })
  })

  it("prefers subjects[] entries when they carry names", () => {
    const snapshot = JSON.stringify({
      roles: [],
      bindings: [
        {
          name: "rb",
          kind: "RoleBinding",
          roleRef: { kind: "Role", name: "r" },
          subjects: [{ kind: "User", name: "alice" }],
          subject: "Group:ignored",
        },
      ],
    })

    expect(parseSnapshotJSON(snapshot).subjects).toEqual([{ kind: "User", name: "alice", namespace: undefined }])
  })

  it("keeps declared top-level subjects that no binding references", () => {
    const snapshot = JSON.stringify({
      subjects: [
        { name: "sa-45", kind: "ServiceAccount", namespace: "payments" },
        { name: "orphan-user", kind: "User" },
      ],
      roles: [],
      bindings: [
        {
          name: "rb",
          kind: "RoleBinding",
          roleRef: { kind: "Role", name: "r" },
          subjects: [],
          subject: "ServiceAccount:payments:sa-45",
        },
      ],
    })

    const dataset = parseSnapshotJSON(snapshot)

    // sa-45 comes from both sources but is deduped by subject key.
    expect(dataset.subjects).toHaveLength(2)
    expect(dataset.subjects.map((s) => s.name).sort()).toEqual(["orphan-user", "sa-45"])
  })

  it("treats a two-part ServiceAccount string as name-only", () => {
    const snapshot = JSON.stringify({
      roles: [],
      bindings: [
        {
          name: "rb",
          kind: "RoleBinding",
          roleRef: { kind: "Role", name: "r" },
          subjects: [],
          subject: "ServiceAccount:sa-solo",
        },
      ],
    })

    expect(parseSnapshotJSON(snapshot).subjects).toEqual([
      { kind: "ServiceAccount", name: "sa-solo", namespace: undefined },
    ])
  })
})
