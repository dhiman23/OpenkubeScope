// gRPC client for rbac-scanner-service + optional Redis cache.
//
// Locked decision: "Redis for caching scan results between scanner and report
// service." When REDIS_URL is set, ListScansByCluster results are cached per
// (workspace, clusters) key for SCAN_CACHE_TTL_SECONDS so repeated report
// generations (and scheduled runs) don't re-hit the scanner+DB every time.
// When REDIS_URL is unset, caching is a no-op and every call goes to gRPC.

import * as grpc from "@grpc/grpc-js"
import Redis from "ioredis"

import { RbacScannerServiceClient } from "../generated/scanner"
import * as scannerProto from "../generated/scanner"
import type { ScanRow, ScanDataset, RBACRole, RBACBinding, RBACSubject, RBACFinding, Severity, FindingCategory } from "./rbac-types"

let scannerClient: RbacScannerServiceClient | null = null
let redis: Redis | null = null
let redisDisabled = false

function getScannerClient(): RbacScannerServiceClient {
  if (scannerClient) return scannerClient
  const addr = process.env.SCANNER_SERVICE_ADDR || "localhost:50051"
  scannerClient = new RbacScannerServiceClient(addr, grpc.credentials.createInsecure())
  return scannerClient
}

function getRedis(): Redis | null {
  if (redisDisabled) return null
  if (redis) return redis
  const url = process.env.REDIS_URL
  if (!url) {
    redisDisabled = true
    return null
  }
  redis = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 2 })
  redis.on("error", (err) => {
    // Don't crash report generation if Redis is down — degrade to no-cache.
    console.error("Redis error (caching disabled for this call):", err.message)
  })
  return redis
}

const SUBJECT_KIND_FROM_PROTO: Record<number, RBACSubject["kind"]> = {
  [scannerProto.SubjectKind.USER]: "User",
  [scannerProto.SubjectKind.GROUP]: "Group",
  [scannerProto.SubjectKind.SERVICE_ACCOUNT]: "ServiceAccount",
}

const ROLE_KIND_FROM_PROTO: Record<number, RBACRole["kind"]> = {
  [scannerProto.RoleKind.ROLE]: "Role",
  [scannerProto.RoleKind.CLUSTER_ROLE]: "ClusterRole",
}

const BINDING_KIND_FROM_PROTO: Record<number, RBACBinding["kind"]> = {
  [scannerProto.BindingKind.ROLE_BINDING]: "RoleBinding",
  [scannerProto.BindingKind.CLUSTER_ROLE_BINDING]: "ClusterRoleBinding",
}

const SEVERITY_FROM_PROTO: Record<number, Severity> = {
  [scannerProto.Severity.LOW]: "low",
  [scannerProto.Severity.MEDIUM]: "medium",
  [scannerProto.Severity.HIGH]: "high",
  [scannerProto.Severity.CRITICAL]: "critical",
}

const CATEGORY_FROM_PROTO: Record<number, FindingCategory> = {
  [scannerProto.FindingCategory.OVERLY_PERMISSIVE]: "OVERLY_PERMISSIVE",
  [scannerProto.FindingCategory.PRIVILEGE_ESCALATION]: "PRIVILEGE_ESCALATION",
  [scannerProto.FindingCategory.MISCONFIGURATION]: "MISCONFIGURATION",
  [scannerProto.FindingCategory.BEST_PRACTICE]: "BEST_PRACTICE",
}

function datasetFromProto(d: scannerProto.ScanDataset | undefined): ScanDataset {
  if (!d) return { subjects: [], roles: [], bindings: [], findings: [] }

  const subjects: RBACSubject[] = d.subjects.map((s) => ({
    name: s.name,
    kind: SUBJECT_KIND_FROM_PROTO[s.kind] || "User",
    namespace: s.namespace,
  }))

  const mapRole = (r: scannerProto.RBACRole): RBACRole => ({
    name: r.name,
    kind: ROLE_KIND_FROM_PROTO[r.kind] || "Role",
    namespace: r.namespace,
    rules: r.rules.map((rule) => ({
      apiGroups: rule.apiGroups,
      resources: rule.resources,
      verbs: rule.verbs,
      resourceNames: rule.resourceNames.length ? rule.resourceNames : undefined,
    })),
  })

  const mapBinding = (b: scannerProto.RBACBinding): RBACBinding => ({
    name: b.name,
    kind: BINDING_KIND_FROM_PROTO[b.kind] || "RoleBinding",
    namespace: b.namespace,
    roleRef: { kind: b.roleRef?.kind || "", name: b.roleRef?.name || "" },
    subjects: b.subjects.map((s) => ({ kind: s.kind, name: s.name, namespace: s.namespace })),
  })

  const findings: RBACFinding[] = d.findings.map((f) => ({
    id: f.id,
    title: f.title,
    description: f.description,
    severity: SEVERITY_FROM_PROTO[f.severity] || "low",
    category: CATEGORY_FROM_PROTO[f.category] || "MISCONFIGURATION",
    subject: f.subject,
    subjectType: f.subjectType,
    role: f.role,
    namespace: f.namespace,
    remediation: f.remediation,
    discoveredAt: f.discoveredAt,
    affectedResources: f.affectedResources,
    impactedSubjects: f.impactedSubjects,
    evidence: f.evidence ? { apiGroups: f.evidence.apiGroups, resources: f.evidence.resources, verbs: f.evidence.verbs } : undefined,
  }))

  return {
    subjects,
    roles: d.roles.map(mapRole),
    bindings: d.bindings.map(mapBinding),
    findings,
    clusterRoles: d.clusterRoles.map(mapRole),
    roleBindings: d.roleBindings.map(mapBinding),
    clusterRoleBindings: d.clusterRoleBindings.map(mapBinding),
  }
}

function scanToRow(s: scannerProto.Scan): ScanRow {
  return {
    id: s.id,
    workspace_id: s.workspaceId,
    file_name: s.fileName,
    cluster_name: s.clusterName,
    scan_data: datasetFromProto(s.dataset),
    totals: s.totals || { subjects: 0, roles: 0, bindings: 0 },
    risk_counts: s.riskCounts || { critical: 0, high: 0, medium: 0, low: 0 },
    created_at: s.createdAt,
  }
}

// Fetch the latest scan per cluster for a workspace, via the scanner gRPC API.
// Cached in Redis when available.
export async function fetchScansForClusters(workspaceId: string, clusters: string[]): Promise<ScanRow[]> {
  const cacheKey = `scans:${workspaceId}:${[...clusters].sort().join(",")}`
  const cache = getRedis()

  if (cache) {
    try {
      const hit = await cache.get(cacheKey)
      if (hit) return JSON.parse(hit) as ScanRow[]
    } catch {
      // ignore cache read failure, fall through to gRPC
    }
  }

  const client = getScannerClient()
  const scans = await new Promise<ScanRow[]>((resolve, reject) => {
    client.listScansByCluster({ workspaceId, clusterNames: clusters, metaOnly: false }, (err, res) => {
      if (err) return reject(err)
      resolve((res.scans || []).map(scanToRow))
    })
  })

  if (cache) {
    const ttl = Number(process.env.SCAN_CACHE_TTL_SECONDS || 300)
    try {
      await cache.set(cacheKey, JSON.stringify(scans), "EX", ttl)
    } catch {
      // ignore cache write failure
    }
  }

  return scans
}

// Invalidate cached scans for a workspace (call when scans change). Best-effort.
export async function invalidateScanCache(workspaceId: string): Promise<void> {
  const cache = getRedis()
  if (!cache) return
  try {
    const keys = await cache.keys(`scans:${workspaceId}:*`)
    if (keys.length) await cache.del(...keys)
  } catch {
    // ignore
  }
}

export async function closeClients(): Promise<void> {
  if (redis) {
    redis.disconnect()
    redis = null
  }
  if (scannerClient) {
    scannerClient.close()
    scannerClient = null
  }
}
