import { describe, it, expect } from "vitest"
import { generateStableId, generateFindings, type RBACRole } from "./rbac-engine"

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
