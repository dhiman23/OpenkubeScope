"use client"

import JSZip from "jszip"

// ============================================
// TYPES
// ============================================

export interface RBACSubject {
  name: string
  kind: "User" | "Group" | "ServiceAccount"
  namespace?: string
}

export interface RBACRule {
  apiGroups: string[]
  resources: string[]
  verbs: string[]
  resourceNames?: string[]
}

export interface RBACRole {
  name: string
  kind: "Role" | "ClusterRole"
  namespace?: string
  rules: RBACRule[]
}

export interface RBACBinding {
  name: string
  kind: "RoleBinding" | "ClusterRoleBinding"
  namespace?: string
  roleRef: {
    kind: string
    name: string
  }
  subjects: {
    kind: string
    name: string
    namespace?: string
  }[]
}

export interface RBACFinding {
  id: string
  title: string
  description: string
  severity: "critical" | "high" | "medium" | "low"
  category: "OVERLY_PERMISSIVE" | "PRIVILEGE_ESCALATION" | "MISCONFIGURATION" | "BEST_PRACTICE"
  subject: string
  subjectType: string
  role: string
  namespace: string
  remediation: string
  discoveredAt: string
  affectedResources: string[]
  impactedSubjects: string[]
  evidence?: { apiGroups: string[], resources: string[], verbs: string[] }
}

// Normalized internal dataset
export interface ScanDataset {
  subjects: RBACSubject[]
  roles: RBACRole[]           // Combined Role + ClusterRole
  bindings: RBACBinding[]     // Combined RoleBinding + ClusterRoleBinding
  findings: RBACFinding[]
  // Optional: Keep separated for detailed views
  clusterRoles?: RBACRole[]
  roleBindings?: RBACBinding[]
  clusterRoleBindings?: RBACBinding[]
}

export interface ScanTotals {
  subjects: number
  roles: number
  bindings: number
}

export interface ScanRiskCounts {
  critical: number
  high: number
  medium: number
  low: number
}

export interface Scan {
  id: string
  fileName: string
  createdAt: string
  clusterName: string
  totals: ScanTotals
  riskCounts: ScanRiskCounts
  dataset: ScanDataset
  isSummaryMode?: boolean // Large scan indicator
}

// Resolved binding for internal use
interface ResolvedBinding {
  bindingKind: "RoleBinding" | "ClusterRoleBinding"
  bindingName: string
  namespace: string | null
  subjectKey: string
  roleKind: "Role" | "ClusterRole"
  roleName: string
  rules: RBACRule[]
  scope: "namespace" | "cluster"
}

// ============================================
// UTILITIES
// ============================================

function hashString(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(16).padStart(8, '0')
}

export function generateStableId(content: string): string {
  const hash = hashString(content)
  return `scan-${hash}-${hashString(content.slice(-100))}`
}

function getSubjectKey(subject: { kind: string, name: string, namespace?: string }): string {
  if (subject.kind === "ServiceAccount") {
    return `ServiceAccount:${subject.namespace || "default"}:${subject.name}`
  } else if (subject.kind === "Group") {
    return `Group:${subject.name}`
  }
  return `User:${subject.name}`
}

function arrIncludes(arr: string[], value: string): boolean {
  return arr.includes(value) || arr.includes("*")
}

function hasWildcard(arr: string[]): boolean {
  return arr.includes("*")
}

// ============================================
// SUBJECT EXTRACTION (From Bindings Only!)
// ============================================

function extractUniqueSubjects(bindings: RBACBinding[]): RBACSubject[] {
  const subjectMap = new Map<string, RBACSubject>()
  
  for (const binding of bindings) {
    if (!binding || !Array.isArray(binding.subjects)) continue
    
    for (const sub of binding.subjects) {
      if (!sub || !sub.name) continue
      
      const key = getSubjectKey(sub)
      if (!subjectMap.has(key)) {
        subjectMap.set(key, {
          name: sub.name,
          kind: (sub.kind as "User" | "Group" | "ServiceAccount") || "User",
          namespace: sub.namespace,
        })
      }
    }
  }
  
  return Array.from(subjectMap.values())
}

// ============================================
// ROLEREF RESOLUTION
// ============================================

function buildRoleMap(roles: RBACRole[]): Map<string, RBACRole> {
  const map = new Map<string, RBACRole>()
  for (const role of roles) {
    // Key format: "ClusterRole:name" or "Role:namespace:name"
    const key = role.kind === "ClusterRole" 
      ? `ClusterRole:${role.name}`
      : `Role:${role.namespace || "default"}:${role.name}`
    map.set(key, role)
  }
  return map
}

function resolveBindings(bindings: RBACBinding[], roleMap: Map<string, RBACRole>): ResolvedBinding[] {
  const resolved: ResolvedBinding[] = []
  
  for (const binding of bindings) {
    if (!binding || !binding.roleRef) continue
    
    // Find the referenced role
    let role: RBACRole | undefined
    
    if (binding.kind === "ClusterRoleBinding") {
      // ClusterRoleBinding can only reference ClusterRole
      role = roleMap.get(`ClusterRole:${binding.roleRef.name}`)
    } else {
      // RoleBinding can reference Role (same namespace) or ClusterRole
      if (binding.roleRef.kind === "ClusterRole") {
        role = roleMap.get(`ClusterRole:${binding.roleRef.name}`)
      } else {
        role = roleMap.get(`Role:${binding.namespace || "default"}:${binding.roleRef.name}`)
      }
    }
    
    if (!role) continue
    
    // Create resolved binding for each subject
    const subjects = Array.isArray(binding.subjects) ? binding.subjects : []
    for (const subject of subjects) {
      if (!subject || !subject.name) continue
      
      resolved.push({
        bindingKind: binding.kind,
        bindingName: binding.name,
        namespace: binding.namespace || null,
        subjectKey: getSubjectKey(subject),
        roleKind: role.kind,
        roleName: role.name,
        rules: role.rules || [],
        scope: binding.kind === "ClusterRoleBinding" ? "cluster" : "namespace",
      })
    }
  }
  
  return resolved
}

// ============================================
// IMPACTED SUBJECTS MAPPING
// ============================================

// Pre-build a role-name → subjects index so lookups are O(1) per role
// instead of scanning all bindings for every role.
function buildImpactedSubjectsIndex(bindings: RBACBinding[]): Map<string, string[]> {
  const index = new Map<string, Set<string>>()

  for (const binding of bindings) {
    if (!binding || !binding.roleRef) continue
    const roleName = binding.roleRef.name
    if (!index.has(roleName)) index.set(roleName, new Set())
    const subjectSet = index.get(roleName)!

    const bindingSubjects = Array.isArray(binding.subjects) ? binding.subjects : []
    for (const sub of bindingSubjects) {
      if (sub && sub.name) {
        subjectSet.add(getSubjectKey(sub))
      }
    }
  }

  const result = new Map<string, string[]>()
  for (const [role, subs] of index) {
    result.set(role, Array.from(subs))
  }
  return result
}

function getImpactedSubjects(roleName: string, bindings: RBACBinding[]): string[] {
  const subjects = new Set<string>()

  for (const binding of bindings) {
    if (!binding || !binding.roleRef) continue
    if (binding.roleRef.name !== roleName) continue

    const bindingSubjects = Array.isArray(binding.subjects) ? binding.subjects : []
    for (const sub of bindingSubjects) {
      if (sub && sub.name) {
        subjects.add(getSubjectKey(sub))
      }
    }
  }

  return Array.from(subjects)
}

// ============================================
// 12-RULE RISK FINDINGS ENGINE
// ============================================

export function generateFindings(roles: RBACRole[], bindings: RBACBinding[]): RBACFinding[] {
  const findings: RBACFinding[] = []
  const findingIds = new Set<string>()
  const now = new Date().toISOString()

  // Pre-build index once: O(bindings) instead of O(roles × bindings)
  const subjectsIndex = buildImpactedSubjectsIndex(bindings)

  for (const role of roles) {
    if (!role || !role.name) continue

    const rules = Array.isArray(role.rules) ? role.rules : []
    const namespace = role.namespace || "*"
    const impactedSubjects = subjectsIndex.get(role.name) || []
    const isClusterScope = role.kind === "ClusterRole"
    
    // Flatten all resources and verbs for this role
    const allResources = new Set<string>()
    const allVerbs = new Set<string>()
    
    for (const rule of rules) {
      if (!rule) continue
      const resources = Array.isArray(rule.resources) ? rule.resources : []
      const verbs = Array.isArray(rule.verbs) ? rule.verbs : []
      resources.forEach(r => allResources.add(r))
      verbs.forEach(v => allVerbs.add(v))
    }
    
    const resourcesArr = Array.from(allResources)
    const verbsArr = Array.from(allVerbs)
    
    // Helper to add finding with dedup
    const addFinding = (finding: Omit<RBACFinding, "id">, idSuffix: string) => {
      const id = `RISK-${hashString(role.name + namespace + idSuffix)}`
      if (findingIds.has(id)) return
      findingIds.add(id)
      findings.push({ ...finding, id, impactedSubjects } as RBACFinding)
    }
    
    // ==========================================
    // CRITICAL RULES (1-6)
    // ==========================================
    
    // Rule 1: cluster-admin role detected
    if (role.name.toLowerCase() === "cluster-admin" || 
        role.name.toLowerCase().includes("cluster-admin")) {
      addFinding({
        title: `Cluster-admin role detected: ${role.name}`,
        description: `The role "${role.name}" is a cluster-admin role granting full control over all cluster resources.`,
        severity: "critical",
        category: "OVERLY_PERMISSIVE",
        subject: "N/A",
        subjectType: "Role",
        role: role.name,
        namespace,
        remediation: "Review if cluster-admin access is necessary. Create a more restrictive role with only required permissions.",
        discoveredAt: now,
        affectedResources: ["*"],
        impactedSubjects: [],
        evidence: { apiGroups: ["*"], resources: ["*"], verbs: ["*"] },
      }, "cluster-admin")
    }
    
    // Check each rule
    for (const rule of rules) {
      if (!rule) continue
      const resources = Array.isArray(rule.resources) ? rule.resources : []
      const verbs = Array.isArray(rule.verbs) ? rule.verbs : []
      const apiGroups = Array.isArray(rule.apiGroups) ? rule.apiGroups : []
      
      // Rule 2: secrets WRITE (create/update/patch/delete)
      const writeVerbs = ["create", "update", "patch", "delete"]
      const hasSecretsWrite = arrIncludes(resources, "secrets") && 
                              verbs.some(v => writeVerbs.includes(v) || v === "*")
      if (hasSecretsWrite) {
        addFinding({
          title: `Secrets WRITE access: ${role.name}`,
          description: `The role "${role.name}" can create/update/delete secrets, which may expose sensitive credentials.`,
          severity: "critical",
          category: "PRIVILEGE_ESCALATION",
          subject: "N/A",
          subjectType: "Role",
          role: role.name,
          namespace,
          remediation: "Remove secrets write permissions. Use external secret management systems.",
          discoveredAt: now,
          affectedResources: ["secrets"],
          impactedSubjects: [],
          evidence: { apiGroups, resources, verbs },
        }, "secrets-write")
      }
      
      // Rule 3: pods/exec
      if (arrIncludes(resources, "pods/exec") && 
          verbs.some(v => ["create", "*"].includes(v))) {
        addFinding({
          title: `pods/exec access: ${role.name}`,
          description: `The role "${role.name}" allows executing commands in pods, enabling container breakout and privilege escalation.`,
          severity: "critical",
          category: "PRIVILEGE_ESCALATION",
          subject: "N/A",
          subjectType: "Role",
          role: role.name,
          namespace,
          remediation: "Remove pods/exec permissions. Use dedicated debug containers with audit logging.",
          discoveredAt: now,
          affectedResources: ["pods/exec"],
          impactedSubjects: [],
          evidence: { apiGroups, resources, verbs },
        }, "pods-exec")
      }
      
      // Rule 4: create/update rolebindings or clusterrolebindings
      const bindingResources = ["rolebindings", "clusterrolebindings"]
      if (resources.some(r => bindingResources.includes(r) || r === "*") &&
          verbs.some(v => ["create", "update", "patch", "*"].includes(v))) {
        addFinding({
          title: `RoleBinding creation allowed: ${role.name}`,
          description: `The role "${role.name}" can create or modify role bindings, enabling privilege escalation attacks.`,
          severity: "critical",
          category: "PRIVILEGE_ESCALATION",
          subject: "N/A",
          subjectType: "Role",
          role: role.name,
          namespace,
          remediation: "Remove binding creation permissions. Use GitOps for RBAC management with proper reviews.",
          discoveredAt: now,
          affectedResources: bindingResources,
          impactedSubjects: [],
          evidence: { apiGroups, resources, verbs },
        }, "binding-create")
      }
      
      // Rule 5: create/update clusterroles
      if (arrIncludes(resources, "clusterroles") &&
          verbs.some(v => ["create", "update", "patch", "*"].includes(v))) {
        addFinding({
          title: `ClusterRole creation allowed: ${role.name}`,
          description: `The role "${role.name}" can create or modify ClusterRoles, enabling privilege escalation.`,
          severity: "critical",
          category: "PRIVILEGE_ESCALATION",
          subject: "N/A",
          subjectType: "Role",
          role: role.name,
          namespace,
          remediation: "Remove clusterrole creation permissions. Use GitOps with approval workflows.",
          discoveredAt: now,
          affectedResources: ["clusterroles"],
          impactedSubjects: [],
          evidence: { apiGroups, resources, verbs },
        }, "clusterrole-create")
      }
      
      // Rule 6: impersonate permissions
      const impersonateResources = ["users", "groups", "serviceaccounts"]
      if (verbs.includes("impersonate") && 
          resources.some(r => impersonateResources.includes(r) || r === "*")) {
        addFinding({
          title: `Impersonate permissions: ${role.name}`,
          description: `The role "${role.name}" can impersonate users/groups/serviceaccounts, allowing identity spoofing.`,
          severity: "critical",
          category: "PRIVILEGE_ESCALATION",
          subject: "N/A",
          subjectType: "Role",
          role: role.name,
          namespace,
          remediation: "Remove impersonate permissions. Use dedicated service accounts with proper audit logging.",
          discoveredAt: now,
          affectedResources: impersonateResources,
          impactedSubjects: [],
          evidence: { apiGroups, resources, verbs },
        }, "impersonate")
      }
      
      // ==========================================
      // HIGH RULES (7-11)
      // ==========================================
      
      // Rule 7: wildcard permissions
      if ((hasWildcard(verbs) || hasWildcard(resources)) && 
          role.name.toLowerCase() !== "cluster-admin") {
        addFinding({
          title: `Wildcard permissions: ${role.name}`,
          description: `The role "${role.name}" grants wildcard permissions. Verbs: [${verbs.join(", ")}], Resources: [${resources.join(", ")}].`,
          severity: "high",
          category: "OVERLY_PERMISSIVE",
          subject: "N/A",
          subjectType: "Role",
          role: role.name,
          namespace,
          remediation: "Replace wildcard (*) with specific resources and verbs that are actually needed.",
          discoveredAt: now,
          affectedResources: resources,
          impactedSubjects: [],
          evidence: { apiGroups, resources, verbs },
        }, "wildcard")
      }
      
      // Rule 8: secrets READ (get/list/watch)
      const readVerbs = ["get", "list", "watch"]
      const hasSecretsRead = arrIncludes(resources, "secrets") && 
                             verbs.some(v => readVerbs.includes(v) || v === "*") &&
                             !hasSecretsWrite // Don't duplicate if already critical
      if (hasSecretsRead) {
        addFinding({
          title: `Secrets READ access: ${role.name}`,
          description: `The role "${role.name}" allows reading secrets. Secret exposure can lead to credential theft.`,
          severity: "high",
          category: "PRIVILEGE_ESCALATION",
          subject: "N/A",
          subjectType: "Role",
          role: role.name,
          namespace,
          remediation: "Limit secrets access to only specific secrets required. Use external secret management.",
          discoveredAt: now,
          affectedResources: ["secrets"],
          impactedSubjects: [],
          evidence: { apiGroups, resources, verbs },
        }, "secrets-read")
      }
      
      // Rule 9: pods/portforward
      if (arrIncludes(resources, "pods/portforward") &&
          verbs.some(v => ["create", "*"].includes(v))) {
        addFinding({
          title: `pods/portforward access: ${role.name}`,
          description: `The role "${role.name}" allows port forwarding to pods, enabling network access bypass.`,
          severity: "high",
          category: "PRIVILEGE_ESCALATION",
          subject: "N/A",
          subjectType: "Role",
          role: role.name,
          namespace,
          remediation: "Remove pods/portforward permissions. Use proper ingress/service mesh for access.",
          discoveredAt: now,
          affectedResources: ["pods/portforward"],
          impactedSubjects: [],
          evidence: { apiGroups, resources, verbs },
        }, "pods-portforward")
      }
      
      // Rule 10: serviceaccounts/token or tokenreviews
      const tokenResources = ["serviceaccounts/token", "tokenreviews"]
      if (resources.some(r => tokenResources.includes(r) || r === "*") &&
          verbs.some(v => ["create", "get", "*"].includes(v))) {
        addFinding({
          title: `Token access: ${role.name}`,
          description: `The role "${role.name}" can access service account tokens, enabling token theft.`,
          severity: "high",
          category: "PRIVILEGE_ESCALATION",
          subject: "N/A",
          subjectType: "Role",
          role: role.name,
          namespace,
          remediation: "Remove token access permissions. Use workload identity federation where possible.",
          discoveredAt: now,
          affectedResources: tokenResources,
          impactedSubjects: [],
          evidence: { apiGroups, resources, verbs },
        }, "token-access")
      }
      
      // Rule 11: nodes access
      const nodeResources = ["nodes", "nodes/proxy", "nodes/stats"]
      if (resources.some(r => nodeResources.includes(r) || r === "*") &&
          verbs.some(v => ["get", "list", "watch", "*"].includes(v))) {
        addFinding({
          title: `Node access: ${role.name}`,
          description: `The role "${role.name}" can access node information, potentially exposing cluster infrastructure.`,
          severity: "high",
          category: "MISCONFIGURATION",
          subject: "N/A",
          subjectType: "Role",
          role: role.name,
          namespace,
          remediation: "Limit node access to monitoring systems only. Use node-level RBAC restrictions.",
          discoveredAt: now,
          affectedResources: nodeResources,
          impactedSubjects: [],
          evidence: { apiGroups, resources, verbs },
        }, "node-access")
      }
      
      // ==========================================
      // MEDIUM/HIGH RULE (12)
      // ==========================================
      
      // Rule 12: workload mutation
      const workloadResources = ["deployments", "daemonsets", "statefulsets", "replicasets"]
      if (resources.some(r => workloadResources.includes(r)) &&
          verbs.some(v => ["patch", "update", "create", "delete", "*"].includes(v))) {
        const severity = isClusterScope ? "high" : "medium"
        addFinding({
          title: `Workload mutation: ${role.name}`,
          description: `The role "${role.name}" can modify workloads (${resources.filter(r => workloadResources.includes(r)).join(", ")}), enabling code injection.`,
          severity,
          category: "MISCONFIGURATION",
          subject: "N/A",
          subjectType: "Role",
          role: role.name,
          namespace,
          remediation: "Use GitOps for workload deployments. Restrict direct API access to CI/CD systems only.",
          discoveredAt: now,
          affectedResources: resources.filter(r => workloadResources.includes(r)),
          impactedSubjects: [],
          evidence: { apiGroups, resources, verbs },
        }, "workload-mutation")
      }
    }
  }
  
  // Sort by severity for consistent order
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
  findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
  
  return findings
}

// Legacy export for backwards compatibility
export const generateFindingsFromRoles = generateFindings

// ============================================
// SNAPSHOT PARSING - SUPPORTS ALL FORMATS
// ============================================

function convertKubeRole(item: any, kind: "Role" | "ClusterRole"): RBACRole {
  const metadata = item.metadata || {}
  const rules: RBACRule[] = Array.isArray(item.rules) ? item.rules.map((r: any) => ({
    apiGroups: Array.isArray(r.apiGroups) ? r.apiGroups : [],
    resources: Array.isArray(r.resources) ? r.resources : [],
    verbs: Array.isArray(r.verbs) ? r.verbs : [],
    resourceNames: Array.isArray(r.resourceNames) ? r.resourceNames : undefined,
  })) : []
  
  return {
    name: metadata.name || item.name || "unknown",
    kind,
    namespace: metadata.namespace || item.namespace,
    rules,
  }
}

function convertKubeBinding(item: any, kind: "RoleBinding" | "ClusterRoleBinding"): RBACBinding {
  const metadata = item.metadata || {}
  const roleRef = item.roleRef || {}
  
  // Parse subjects from various formats
  let subjects: { kind: string, name: string, namespace?: string }[] = []
  
  if (Array.isArray(item.subjects)) {
    subjects = item.subjects.map((s: any) => ({
      kind: s.kind || "User",
      name: s.name || "",
      namespace: s.namespace,
    })).filter((s: any) => s.name)
  } else if (typeof item.subject === "string" && item.subject.trim()) {
    // Handle simplified "subject" string field
    const subjectStr = item.subject.trim()
    let subKind = "ServiceAccount"
    let subName = subjectStr
    let subNamespace: string | undefined
    
    if (subjectStr.startsWith("ServiceAccount:")) {
      const parts = subjectStr.split(":")
      subKind = "ServiceAccount"
      subNamespace = parts[1] || "default"
      subName = parts.slice(2).join(":") || parts[1]
    } else if (subjectStr.startsWith("User:")) {
      subKind = "User"
      subName = subjectStr.slice(5)
    } else if (subjectStr.startsWith("Group:")) {
      subKind = "Group"
      subName = subjectStr.slice(6)
    }
    
    if (subName) {
      subjects = [{ kind: subKind, name: subName, namespace: subNamespace }]
    }
  }
  
  return {
    name: metadata.name || item.name || "unknown",
    kind,
    namespace: metadata.namespace || item.namespace,
    roleRef: {
      kind: roleRef.kind || "ClusterRole",
      name: roleRef.name || item.role || "",
    },
    subjects,
  }
}

export function parseSnapshotJSON(content: string): ScanDataset {
  const data = JSON.parse(content)
  
  const roles: RBACRole[] = []
  const bindings: RBACBinding[] = []
  
  // Format C: kubectl output with kind: "List" and items[]
  if (data.kind === "List" && Array.isArray(data.items)) {
    for (const item of data.items) {
      if (!item || !item.kind) continue
      
      switch (item.kind) {
        case "Role":
          roles.push(convertKubeRole(item, "Role"))
          break
        case "ClusterRole":
          roles.push(convertKubeRole(item, "ClusterRole"))
          break
        case "RoleBinding":
          bindings.push(convertKubeBinding(item, "RoleBinding"))
          break
        case "ClusterRoleBinding":
          bindings.push(convertKubeBinding(item, "ClusterRoleBinding"))
          break
      }
    }
    
    const subjects = extractUniqueSubjects(bindings)
    const findings = generateFindings(roles, bindings)
    return { subjects, roles, bindings, findings }
  }
  
  // Format B: Kubernetes native separate arrays
  if (data.clusterRoles !== undefined || data.clusterRoleBindings !== undefined || 
      data.roleBindings !== undefined || (data.roles !== undefined && data.bindings === undefined)) {
    if (Array.isArray(data.roles)) {
      for (const item of data.roles) {
        if (item) roles.push(convertKubeRole(item, "Role"))
      }
    }
    if (Array.isArray(data.clusterRoles)) {
      for (const item of data.clusterRoles) {
        if (item) roles.push(convertKubeRole(item, "ClusterRole"))
      }
    }
    if (Array.isArray(data.roleBindings)) {
      for (const item of data.roleBindings) {
        if (item) bindings.push(convertKubeBinding(item, "RoleBinding"))
      }
    }
    if (Array.isArray(data.clusterRoleBindings)) {
      for (const item of data.clusterRoleBindings) {
        if (item) bindings.push(convertKubeBinding(item, "ClusterRoleBinding"))
      }
    }
    
    const subjects = extractUniqueSubjects(bindings)
    const findings = generateFindings(roles, bindings)
    return { subjects, roles, bindings, findings }
  }
  
  // Format A: KubeScope simplified dataset
  if (data.roles !== undefined && data.bindings !== undefined) {
    if (Array.isArray(data.roles)) {
      for (const item of data.roles) {
        if (item) {
          const kind = item.kind || (item.namespace ? "Role" : "ClusterRole")
          roles.push(convertKubeRole(item, kind as "Role" | "ClusterRole"))
        }
      }
    }
    if (Array.isArray(data.bindings)) {
      for (const item of data.bindings) {
        if (item) {
          const kind = item.kind || (item.namespace && !item.name?.includes("cluster") ? "RoleBinding" : "ClusterRoleBinding")
          bindings.push(convertKubeBinding(item, kind as "RoleBinding" | "ClusterRoleBinding"))
        }
      }
    }
    
    const subjects = extractUniqueSubjects(bindings)
    
    let findings: RBACFinding[] = Array.isArray(data.findings) ? data.findings : []
    if (findings.length === 0) {
      findings = generateFindings(roles, bindings)
    }
    
    return { subjects, roles, bindings, findings }
  }
  
  // Fallback: Try to parse any array-like structure
  if (Array.isArray(data.roles)) {
    for (const item of data.roles) {
      if (item) roles.push(convertKubeRole(item, "Role"))
    }
  }
  if (Array.isArray(data.clusterRoles)) {
    for (const item of data.clusterRoles) {
      if (item) roles.push(convertKubeRole(item, "ClusterRole"))
    }
  }
  if (Array.isArray(data.roleBindings)) {
    for (const item of data.roleBindings) {
      if (item) bindings.push(convertKubeBinding(item, "RoleBinding"))
    }
  }
  if (Array.isArray(data.clusterRoleBindings)) {
    for (const item of data.clusterRoleBindings) {
      if (item) bindings.push(convertKubeBinding(item, "ClusterRoleBinding"))
    }
  }
  
  const subjects = extractUniqueSubjects(bindings)
  const findings = generateFindings(roles, bindings)
  
  return { subjects, roles, bindings, findings }
}

// Parse ZIP file containing snapshot data
export async function parseSnapshotZip(file: File): Promise<ScanDataset> {
  const zip = new JSZip()
  const contents = await zip.loadAsync(file)
  
  // Look for snapshot.json first
  const snapshotFile = contents.file("snapshot.json")
  if (snapshotFile) {
    const content = await snapshotFile.async("string")
    return parseSnapshotJSON(content)
  }

  // Otherwise, merge all JSON files (sorted for determinism)
  const combinedRoles: RBACRole[] = []
  const combinedBindings: RBACBinding[] = []
  
  const jsonFiles = Object.keys(contents.files)
    .filter(name => name.endsWith(".json"))
    .sort() // Sort for deterministic order
  
  for (const fileName of jsonFiles) {
    const jsonFile = contents.file(fileName)
    if (jsonFile) {
      const content = await jsonFile.async("string")
      try {
        const data = parseSnapshotJSON(content)
        combinedRoles.push(...data.roles)
        combinedBindings.push(...data.bindings)
      } catch (e) {
        console.error(`Failed to parse ${fileName}:`, e)
      }
    }
  }

  // Deduplicate roles by key
  const roleMap = new Map<string, RBACRole>()
  for (const role of combinedRoles) {
    const key = role.kind === "ClusterRole" 
      ? `ClusterRole:${role.name}`
      : `Role:${role.namespace || "default"}:${role.name}`
    if (!roleMap.has(key)) {
      roleMap.set(key, role)
    }
  }
  const roles = Array.from(roleMap.values())

  // Deduplicate bindings by key
  const bindingMap = new Map<string, RBACBinding>()
  for (const binding of combinedBindings) {
    const key = binding.kind === "ClusterRoleBinding"
      ? `ClusterRoleBinding:${binding.name}`
      : `RoleBinding:${binding.namespace || "default"}:${binding.name}`
    if (!bindingMap.has(key)) {
      bindingMap.set(key, binding)
    }
  }
  const bindings = Array.from(bindingMap.values())

  const subjects = extractUniqueSubjects(bindings)
  const findings = generateFindings(roles, bindings)

  return { subjects, roles, bindings, findings }
}

// ============================================
// LARGE SCAN SAFE MODE
// ============================================

const LARGE_SCAN_THRESHOLD_SIZE = 2 * 1024 * 1024 // 2MB
const LARGE_SCAN_THRESHOLD_OBJECTS = 20000
const PREVIEW_LIMIT = 200

function applySummaryMode(dataset: ScanDataset): { dataset: ScanDataset, isSummaryMode: boolean } {
  const totalObjects = dataset.subjects.length + dataset.roles.length + dataset.bindings.length
  
  if (totalObjects <= LARGE_SCAN_THRESHOLD_OBJECTS) {
    return { dataset, isSummaryMode: false }
  }
  
  // Trim to preview limit while keeping all findings
  return {
    dataset: {
      subjects: dataset.subjects.slice(0, PREVIEW_LIMIT),
      roles: dataset.roles.slice(0, PREVIEW_LIMIT),
      bindings: dataset.bindings.slice(0, PREVIEW_LIMIT),
      findings: dataset.findings, // Keep all findings
    },
    isSummaryMode: true,
  }
}

// ============================================
// SCAN CREATION
// ============================================

export async function createScanFromFile(file: File): Promise<Scan> {
  const fileContent = await file.text()
  const stableId = generateStableId(fileContent)
  
  let dataset: ScanDataset
  
  if (file.name.endsWith(".zip")) {
    dataset = await parseSnapshotZip(file)
  } else {
    dataset = parseSnapshotJSON(fileContent)
  }
  
  // Check for large scan mode
  const isLargeScan = file.size > LARGE_SCAN_THRESHOLD_SIZE
  const { dataset: finalDataset, isSummaryMode } = isLargeScan 
    ? applySummaryMode(dataset)
    : { dataset, isSummaryMode: false }

  const totals: ScanTotals = {
    subjects: dataset.subjects.length,
    roles: dataset.roles.length,
    bindings: dataset.bindings.length,
  }

  // Compute risk counts from findings
  const riskCounts: ScanRiskCounts = {
    critical: dataset.findings.filter(f => f.severity === "critical").length,
    high: dataset.findings.filter(f => f.severity === "high").length,
    medium: dataset.findings.filter(f => f.severity === "medium").length,
    low: dataset.findings.filter(f => f.severity === "low").length,
  }

  return {
    id: stableId,
    fileName: file.name,
    createdAt: new Date().toISOString(),
    clusterName: "Production",
    totals,
    riskCounts,
    dataset: finalDataset,
    isSummaryMode,
  }
}

// ============================================
// STORAGE HELPERS (Workspace-aware with Supabase)
// ============================================

import { getActiveWorkspaceId, getOrCreateActiveWorkspaceId } from "./workspace-manager"
import {
  saveScans as saveScansToDB,
  loadScans as loadScansFromDB,
  loadScansMeta as loadScansMetaFromDB,
  getActiveScanId as getActiveScanIdFromDB,
  setActiveScanId as setActiveScanIdInDB,
  getActiveScan as getActiveScanFromDB,
  deleteScan as deleteScanFromDB
} from "./scan-storage"

// saveScans now returns the saved Scan with the DB-assigned ID
// Uses getOrCreateActiveWorkspaceId to ensure a workspace always exists
export async function saveScans(scan: Scan, workspaceId?: string): Promise<Scan | null> {
  // Use getOrCreateActiveWorkspaceId which creates a default workspace if needed
  const wsId = workspaceId || await getOrCreateActiveWorkspaceId()
  if (!wsId) {
    return null
  }

  const savedScan = await saveScansToDB(wsId, scan)
  return savedScan
}

export async function loadScans(workspaceId?: string): Promise<Scan[]> {
  // Use getOrCreateActiveWorkspaceId to ensure workspace exists
  const wsId = workspaceId || await getOrCreateActiveWorkspaceId()
  if (!wsId) {
    return []
  }

  return await loadScansFromDB(wsId)
}

// Lightweight loader: metadata only (no scan_data JSONB).
// Use for dashboard/list views that only need totals and risk counts.
export async function loadScansMeta(workspaceId?: string): Promise<Scan[]> {
  const wsId = workspaceId || await getOrCreateActiveWorkspaceId()
  if (!wsId) {
    return []
  }

  return await loadScansMetaFromDB(wsId)
}

export async function setActiveScan(scanId: string, workspaceId?: string): Promise<void> {
  const wsId = workspaceId || await getOrCreateActiveWorkspaceId()
  if (!wsId) return
  
  await setActiveScanIdInDB(wsId, scanId)
}

// Alias for backward compatibility
export const setActiveScanId = setActiveScan

export async function getActiveScanId(workspaceId?: string): Promise<string | null> {
  const wsId = workspaceId || await getOrCreateActiveWorkspaceId()
  if (!wsId) return null
  
  return await getActiveScanIdFromDB(wsId)
}

export async function getActiveScan(workspaceId?: string): Promise<Scan | null> {
  const wsId = workspaceId || await getOrCreateActiveWorkspaceId()
  if (!wsId) return null
  
  return await getActiveScanFromDB(wsId)
}

export async function deleteScan(scanId: string): Promise<void> {
  await deleteScanFromDB(scanId)
}

// ============================================
// WORKSPACE MODE HELPERS (Re-exported from workspace-manager)
// ============================================

export {
  setWorkspaceMode,
  getWorkspaceMode
} from "./workspace-manager"

// ============================================
// DEMO SCAN DATA
// ============================================

export const demoScan: Scan = {
  id: "demo-scan-001",
  fileName: "demo-cluster.json",
  clusterName: "demo-production",
  createdAt: new Date().toISOString(),
  totals: {
    subjects: 12,
    roles: 8,
    bindings: 15,
  },
  riskCounts: {
    critical: 2,
    high: 4,
    medium: 3,
    low: 1,
  },
  dataset: {
    subjects: [
      { name: "admin", kind: "User" },
      { name: "developer", kind: "User" },
      { name: "readonly-user", kind: "User" },
      { name: "ci-bot", kind: "ServiceAccount", namespace: "ci-cd" },
      { name: "monitoring", kind: "ServiceAccount", namespace: "monitoring" },
      { name: "default", kind: "ServiceAccount", namespace: "default" },
      { name: "deployer", kind: "ServiceAccount", namespace: "production" },
      { name: "backup-agent", kind: "ServiceAccount", namespace: "backup" },
      { name: "developers", kind: "Group" },
      { name: "admins", kind: "Group" },
      { name: "viewers", kind: "Group" },
      { name: "system:authenticated", kind: "Group" },
    ],
    roles: [
      { name: "cluster-admin", kind: "ClusterRole", rules: [{ apiGroups: ["*"], resources: ["*"], verbs: ["*"] }] },
      { name: "admin", kind: "ClusterRole", rules: [{ apiGroups: [""], resources: ["pods", "services", "deployments"], verbs: ["*"] }] },
      { name: "edit", kind: "ClusterRole", rules: [{ apiGroups: [""], resources: ["pods", "configmaps", "secrets"], verbs: ["get", "list", "watch", "create", "update", "patch", "delete"] }] },
      { name: "view", kind: "ClusterRole", rules: [{ apiGroups: [""], resources: ["pods", "services"], verbs: ["get", "list", "watch"] }] },
      { name: "secret-reader", kind: "Role", namespace: "production", rules: [{ apiGroups: [""], resources: ["secrets"], verbs: ["get", "list"] }] },
      { name: "pod-exec", kind: "Role", namespace: "default", rules: [{ apiGroups: [""], resources: ["pods/exec"], verbs: ["create"] }] },
      { name: "deployer-role", kind: "Role", namespace: "production", rules: [{ apiGroups: ["apps"], resources: ["deployments"], verbs: ["*"] }] },
      { name: "monitoring-role", kind: "ClusterRole", rules: [{ apiGroups: [""], resources: ["pods", "nodes"], verbs: ["get", "list", "watch"] }] },
    ],
    bindings: [
      { name: "admin-cluster-admin", kind: "ClusterRoleBinding", roleRef: { kind: "ClusterRole", name: "cluster-admin" }, subjects: [{ kind: "User", name: "admin" }] },
      { name: "admins-cluster-admin", kind: "ClusterRoleBinding", roleRef: { kind: "ClusterRole", name: "cluster-admin" }, subjects: [{ kind: "Group", name: "admins" }] },
      { name: "developers-edit", kind: "ClusterRoleBinding", roleRef: { kind: "ClusterRole", name: "edit" }, subjects: [{ kind: "Group", name: "developers" }] },
      { name: "viewers-view", kind: "ClusterRoleBinding", roleRef: { kind: "ClusterRole", name: "view" }, subjects: [{ kind: "Group", name: "viewers" }] },
      { name: "ci-bot-admin", kind: "ClusterRoleBinding", roleRef: { kind: "ClusterRole", name: "admin" }, subjects: [{ kind: "ServiceAccount", name: "ci-bot", namespace: "ci-cd" }] },
      { name: "monitoring-binding", kind: "ClusterRoleBinding", roleRef: { kind: "ClusterRole", name: "monitoring-role" }, subjects: [{ kind: "ServiceAccount", name: "monitoring", namespace: "monitoring" }] },
      { name: "secret-reader-binding", kind: "RoleBinding", namespace: "production", roleRef: { kind: "Role", name: "secret-reader" }, subjects: [{ kind: "ServiceAccount", name: "deployer", namespace: "production" }] },
      { name: "pod-exec-binding", kind: "RoleBinding", namespace: "default", roleRef: { kind: "Role", name: "pod-exec" }, subjects: [{ kind: "ServiceAccount", name: "default", namespace: "default" }] },
    ],
    findings: [
      {
        id: "RISK-demo-001",
        title: "User 'admin' has cluster-admin privileges",
        description: "The user 'admin' is bound to the cluster-admin role which grants full access to all resources in the cluster.",
        severity: "critical",
        category: "Privilege Escalation",
        remediation: "Review if full cluster-admin access is necessary. Consider using more restrictive roles.",
        discoveredAt: new Date().toISOString(),
        affectedResources: ["User:admin", "ClusterRole:cluster-admin"],
      },
      {
        id: "RISK-demo-002",
        title: "Group 'admins' has cluster-admin privileges",
        description: "The group 'admins' is bound to cluster-admin, granting all members unrestricted access.",
        severity: "critical",
        category: "Privilege Escalation",
        remediation: "Audit group membership and consider using namespace-scoped admin roles instead.",
        discoveredAt: new Date().toISOString(),
        affectedResources: ["Group:admins", "ClusterRole:cluster-admin"],
      },
      {
        id: "RISK-demo-003",
        title: "ServiceAccount can read secrets in production",
        description: "The deployer ServiceAccount has read access to secrets in the production namespace.",
        severity: "high",
        category: "Secret Access",
        remediation: "Limit secret access to only the specific secrets needed for deployment.",
        discoveredAt: new Date().toISOString(),
        affectedResources: ["ServiceAccount:production/deployer", "secrets"],
      },
      {
        id: "RISK-demo-004",
        title: "Default ServiceAccount can exec into pods",
        description: "The default ServiceAccount in the default namespace can create pod/exec resources.",
        severity: "high",
        category: "Container Escape",
        remediation: "Remove exec permissions from default ServiceAccount or use a dedicated SA.",
        discoveredAt: new Date().toISOString(),
        affectedResources: ["ServiceAccount:default/default", "pods/exec"],
      },
      {
        id: "RISK-demo-005",
        title: "Wildcard permissions on edit role",
        description: "The edit ClusterRole grants delete permissions on secrets which could lead to data loss.",
        severity: "high",
        category: "Data Exposure",
        remediation: "Remove delete verb from secrets resource in the edit role.",
        discoveredAt: new Date().toISOString(),
        affectedResources: ["ClusterRole:edit", "secrets"],
      },
      {
        id: "RISK-demo-006",
        title: "CI bot has broad admin permissions",
        description: "The ci-bot ServiceAccount has admin-level access across the cluster.",
        severity: "high",
        category: "Over-Privileged Service Account",
        remediation: "Scope CI bot permissions to only the namespaces and resources needed for CI/CD.",
        discoveredAt: new Date().toISOString(),
        affectedResources: ["ServiceAccount:ci-cd/ci-bot", "ClusterRole:admin"],
      },
      {
        id: "RISK-demo-007",
        title: "Developers group can modify configmaps",
        description: "All developers can create, update, and delete configmaps which may contain sensitive data.",
        severity: "medium",
        category: "Configuration Risk",
        remediation: "Consider separating configmap write access to specific namespaces.",
        discoveredAt: new Date().toISOString(),
        affectedResources: ["Group:developers", "configmaps"],
      },
      {
        id: "RISK-demo-008",
        title: "Deployer has wildcard permissions on deployments",
        description: "The deployer-role grants all verbs on deployments in production.",
        severity: "medium",
        category: "Over-Privileged Role",
        remediation: "Restrict to only create, update, and patch verbs needed for deployments.",
        discoveredAt: new Date().toISOString(),
        affectedResources: ["Role:production/deployer-role", "deployments"],
      },
      {
        id: "RISK-demo-009",
        title: "Monitoring SA can list all pods cluster-wide",
        description: "The monitoring ServiceAccount can list pods across all namespaces.",
        severity: "medium",
        category: "Information Disclosure",
        remediation: "Scope monitoring to specific namespaces if full cluster visibility is not required.",
        discoveredAt: new Date().toISOString(),
        affectedResources: ["ServiceAccount:monitoring/monitoring", "pods"],
      },
      {
        id: "RISK-demo-010",
        title: "Viewers group has broad read access",
        description: "The viewers group can read pods and services across all namespaces.",
        severity: "low",
        category: "Information Disclosure",
        remediation: "Consider if cluster-wide read access is necessary for all viewers.",
        discoveredAt: new Date().toISOString(),
        affectedResources: ["Group:viewers", "ClusterRole:view"],
      },
    ],
  },
}
