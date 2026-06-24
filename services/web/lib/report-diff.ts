// Report Diff Engine for KubeScope
// Compares two report snapshots and surfaces added / removed / changed findings + RBAC rows.

import type { ReportData, FlatRBACRow } from "@/lib/report-generator"
import type { RBACFinding } from "@/lib/rbac-scanner"

export interface ReportDiff {
  base: { id: string; name: string; generatedAt: string }
  target: { id: string; name: string; generatedAt: string }
  risks: {
    critical: { before: number; after: number; delta: number }
    high: { before: number; after: number; delta: number }
    medium: { before: number; after: number; delta: number }
    low: { before: number; after: number; delta: number }
  }
  totals: {
    subjects: { before: number; after: number; delta: number }
    roles: { before: number; after: number; delta: number }
    bindings: { before: number; after: number; delta: number }
  }
  findings: {
    added: RBACFinding[]
    removed: RBACFinding[]
    unchanged: number
  }
  rbacRows: {
    added: FlatRBACRow[]
    removed: FlatRBACRow[]
    unchanged: number
  }
}

function rowKey(row: FlatRBACRow): string {
  return [row.cluster, row.namespace, row.subject, row.type, row.role, row.resource, row.verbs].join("|")
}

function findingKey(finding: RBACFinding): string {
  return finding.id || [finding.role, finding.namespace, finding.subject, finding.title].join("|")
}

export function diffReports(
  base: { id: string; name: string; data: ReportData },
  target: { id: string; name: string; data: ReportData }
): ReportDiff {
  const before = base.data
  const after = target.data

  const beforeFindingKeys = new Set((before.findings || []).map(findingKey))
  const afterFindingKeys = new Set((after.findings || []).map(findingKey))

  const added = (after.findings || []).filter(f => !beforeFindingKeys.has(findingKey(f)))
  const removed = (before.findings || []).filter(f => !afterFindingKeys.has(findingKey(f)))
  const unchanged = (after.findings || []).length - added.length

  const beforeRowKeys = new Set((before.rbac_rows || []).map(rowKey))
  const afterRowKeys = new Set((after.rbac_rows || []).map(rowKey))

  const addedRows = (after.rbac_rows || []).filter(r => !beforeRowKeys.has(rowKey(r)))
  const removedRows = (before.rbac_rows || []).filter(r => !afterRowKeys.has(rowKey(r)))
  const unchangedRows = (after.rbac_rows || []).length - addedRows.length

  const diffRisk = (k: "critical" | "high" | "medium" | "low") => ({
    before: before.risks?.[k] || 0,
    after: after.risks?.[k] || 0,
    delta: (after.risks?.[k] || 0) - (before.risks?.[k] || 0),
  })

  const diffTotal = (k: "subjects" | "roles" | "bindings") => ({
    before: before.summary?.[k] || 0,
    after: after.summary?.[k] || 0,
    delta: (after.summary?.[k] || 0) - (before.summary?.[k] || 0),
  })

  return {
    base: { id: base.id, name: base.name, generatedAt: before.generated_at },
    target: { id: target.id, name: target.name, generatedAt: after.generated_at },
    risks: {
      critical: diffRisk("critical"),
      high: diffRisk("high"),
      medium: diffRisk("medium"),
      low: diffRisk("low"),
    },
    totals: {
      subjects: diffTotal("subjects"),
      roles: diffTotal("roles"),
      bindings: diffTotal("bindings"),
    },
    findings: { added, removed, unchanged },
    rbacRows: { added: addedRows, removed: removedRows, unchanged: unchangedRows },
  }
}
