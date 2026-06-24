"use client"

import React, { useState, useEffect, useMemo, useCallback, Suspense } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useSearchParams, useRouter } from "next/navigation"
import {
  Shield,
  User,
  Users,
  Key,
  Box,
  Link2,
  AlertTriangle,
  X,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Sparkles,
  FileText,
  ExternalLink,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  type Scan,
  type RBACRole,
  type RBACBinding,
  type RBACFinding,
  getActiveScan,
  demoScan,
} from "@/lib/rbac-scanner"
import { getActiveWorkspace } from "@/lib/workspace-manager"
import { demoScans } from "@/lib/demo-data"
import Link from "next/link"
import { PremiumGate } from "@/components/app/premium-gate"

// ============================================
// TYPES
// ============================================

interface MapPayload {
  subject: string
  subjectType: string
  namespace: string
  role: string
  resource?: string
}

interface ResolvedChain {
  subject: {
    name: string
    kind: string
    namespace?: string
    key: string
  }
  bindings: {
    name: string
    kind: "RoleBinding" | "ClusterRoleBinding"
    namespace?: string
    roleRef: { kind: string; name: string }
  }[]
  roles: {
    name: string
    kind: "Role" | "ClusterRole"
    namespace?: string
    rules: { apiGroups: string[]; resources: string[]; verbs: string[] }[]
  }[]
  permissions: {
    resource: string
    verbs: string[]
    isRisky: boolean
    riskLevel?: "critical" | "high"
  }[]
  findings: RBACFinding[]
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function buildSubjectKey(kind: string, name: string, namespace?: string): string {
  if (kind === "ServiceAccount") {
    return `ServiceAccount:${namespace || "default"}:${name}`
  } else if (kind === "Group") {
    return `Group:${name}`
  }
  return `User:${name}`
}

function normalizeRoleName(name: string): string {
  return name.replace(/^(Role|ClusterRole)\//, "").trim()
}

// Check if a permission is risky
function checkRiskyPermission(resource: string, verbs: string[]): { isRisky: boolean; level?: "critical" | "high" } {
  const criticalPatterns = [
    { resource: "pods/exec", verbs: ["create", "*"] },
    { resource: "secrets", verbs: ["create", "update", "patch", "delete", "*"] },
    { resource: "rolebindings", verbs: ["create", "update", "patch", "*"] },
    { resource: "clusterrolebindings", verbs: ["create", "update", "patch", "*"] },
    { resource: "clusterroles", verbs: ["create", "update", "patch", "*"] },
    { resource: "*", verbs: ["*"] },
  ]
  
  const highPatterns = [
    { resource: "secrets", verbs: ["get", "list", "watch"] },
    { resource: "pods/portforward", verbs: ["create", "*"] },
    { resource: "nodes/proxy", verbs: ["create", "get", "*"] },
    { resource: "serviceaccounts/token", verbs: ["create", "*"] },
  ]

  for (const pattern of criticalPatterns) {
    if ((resource === pattern.resource || pattern.resource === "*" || resource === "*") &&
        verbs.some(v => pattern.verbs.includes(v) || v === "*")) {
      return { isRisky: true, level: "critical" }
    }
  }

  for (const pattern of highPatterns) {
    if ((resource === pattern.resource || resource === "*") &&
        verbs.some(v => pattern.verbs.includes(v) || v === "*")) {
      return { isRisky: true, level: "high" }
    }
  }

  // Check for wildcard
  if (resource === "*" || verbs.includes("*")) {
    return { isRisky: true, level: "high" }
  }

  return { isRisky: false }
}

// Helper to extract permissions from a role's rules
function extractPermissions(role: RBACRole): ResolvedChain["permissions"] {
  const permissions: ResolvedChain["permissions"] = []
  for (const rule of role.rules || []) {
    for (const resource of rule.resources || []) {
      const existing = permissions.find(p => p.resource === resource)
      if (existing) {
        for (const verb of rule.verbs || []) {
          if (!existing.verbs.includes(verb)) {
            existing.verbs.push(verb)
          }
        }
      } else {
        const riskCheck = checkRiskyPermission(resource, rule.verbs || [])
        permissions.push({
          resource,
          verbs: [...(rule.verbs || [])],
          isRisky: riskCheck.isRisky,
          riskLevel: riskCheck.level,
        })
      }
    }
  }
  return permissions
}

// Resolve the full RBAC chain for a subject
function resolveChain(scan: Scan, payload: MapPayload): ResolvedChain {
  const subjectKey = buildSubjectKey(payload.subjectType, payload.subject, 
    payload.subjectType === "ServiceAccount" ? payload.namespace : undefined)
  
  const chain: ResolvedChain = {
    subject: {
      name: payload.subject,
      kind: payload.subjectType,
      namespace: payload.subjectType === "ServiceAccount" ? payload.namespace : undefined,
      key: subjectKey,
    },
    bindings: [],
    roles: [],
    permissions: [],
    findings: [],
  }

  const roles = scan.dataset?.roles || []
  const bindings = scan.dataset?.bindings || []
  const findings = scan.dataset?.findings || []

  // Build role map
  const roleMap = new Map<string, RBACRole>()
  for (const role of roles) {
    if (!role?.name) continue
    roleMap.set(normalizeRoleName(role.name), role)
    roleMap.set(role.name, role)
  }
  // CASE 1: Find bindings that include this subject
  for (const binding of bindings) {
    if (!binding?.subjects) continue
    const subjects = Array.isArray(binding.subjects) ? binding.subjects : []
    
    for (const sub of subjects) {
      if (!sub || !sub.name) continue
      
      let matches = false
      if (sub.kind === payload.subjectType && sub.name === payload.subject) {
        if (payload.subjectType === "ServiceAccount") {
          const subNs = sub.namespace || "default"
          const payloadNs = payload.namespace || "default"
          matches = subNs === payloadNs
        } else {
          matches = true
        }
      }
      
      if (matches) {
        chain.bindings.push({
          name: binding.name,
          kind: binding.kind,
          namespace: binding.namespace,
          roleRef: binding.roleRef,
        })
        
        const roleName = normalizeRoleName(binding.roleRef.name)
        const role = roleMap.get(roleName)
        
        if (role && !chain.roles.find(r => r.name === role.name)) {
          chain.roles.push({
            name: role.name,
            kind: role.kind,
            namespace: role.namespace,
            rules: role.rules || [],
          })
          chain.permissions.push(...extractPermissions(role))
        }
      }
    }
  }

  // CASE 2: No bindings matched - try direct role match from URL param
  if (chain.roles.length === 0 && payload.role) {
    const normalizedPayloadRole = normalizeRoleName(payload.role)
    const role = roleMap.get(normalizedPayloadRole)
    if (role) {
      chain.roles.push({
        name: role.name,
        kind: role.kind,
        namespace: role.namespace,
        rules: role.rules || [],
      })
      chain.permissions.push(...extractPermissions(role))
    }
  }

  // CASE 3: Still nothing - do a broader search: find any binding that mentions the subject by name only (ignore kind mismatch)
  if (chain.roles.length === 0) {
    for (const binding of bindings) {
      if (!binding?.subjects) continue
      const subjects = Array.isArray(binding.subjects) ? binding.subjects : []
      
      for (const sub of subjects) {
        if (!sub?.name) continue
        
        // Match by name only (relaxed matching)
        if (sub.name === payload.subject) {
          chain.bindings.push({
            name: binding.name,
            kind: binding.kind,
            namespace: binding.namespace,
            roleRef: binding.roleRef,
          })
          
          if (binding.roleRef?.name) {
            const roleName = normalizeRoleName(binding.roleRef.name)
            const role = roleMap.get(roleName)
            
            if (role && !chain.roles.find(r => r.name === role.name)) {
              chain.roles.push({
                name: role.name,
                kind: role.kind,
                namespace: role.namespace,
                rules: role.rules || [],
              })
              chain.permissions.push(...extractPermissions(role))
            }
          }
        }
      }
    }
    
    // Also try matching role directly by subject name (common when subject = role name)
    if (chain.roles.length === 0) {
      const roleBySubjectName = roleMap.get(normalizeRoleName(payload.subject))
      if (roleBySubjectName) {
        chain.roles.push({
          name: roleBySubjectName.name,
          kind: roleBySubjectName.kind,
          namespace: roleBySubjectName.namespace,
          rules: roleBySubjectName.rules || [],
        })
        chain.permissions.push(...extractPermissions(roleBySubjectName))
      }
    }
  }

  // Deduplicate permissions (merge verbs for same resource)
  const permMap = new Map<string, ResolvedChain["permissions"][0]>()
  for (const perm of chain.permissions) {
    const existing = permMap.get(perm.resource)
    if (existing) {
      for (const verb of perm.verbs) {
        if (!existing.verbs.includes(verb)) existing.verbs.push(verb)
      }
      if (perm.isRisky && (!existing.isRisky || 
          (perm.riskLevel === "critical" && existing.riskLevel !== "critical"))) {
        existing.isRisky = perm.isRisky
        existing.riskLevel = perm.riskLevel
      }
    } else {
      permMap.set(perm.resource, { ...perm })
    }
  }
  chain.permissions = Array.from(permMap.values())

  // Find matching findings
  for (const finding of findings) {
    if (!finding) continue
    const findingRoleName = finding.role ? normalizeRoleName(finding.role) : null
    
    const roleMatches = chain.roles.some(r => normalizeRoleName(r.name) === findingRoleName)
    const nsMatches = !finding.namespace || finding.namespace === "*" || 
                      finding.namespace === payload.namespace
    
    let subjectMatches = true
    if (finding.impactedSubjects && Array.isArray(finding.impactedSubjects) && finding.impactedSubjects.length > 0) {
      subjectMatches = finding.impactedSubjects.includes(subjectKey) || 
                       finding.impactedSubjects.includes(payload.subject)
    }
    
    if (roleMatches && nsMatches && subjectMatches) {
      if (!chain.findings.find(f => f.id === finding.id)) {
        chain.findings.push(finding)
      }
    }
  }

  // Sort permissions: risky first
  chain.permissions.sort((a, b) => {
    if (a.isRisky && !b.isRisky) return -1
    if (!a.isRisky && b.isRisky) return 1
    if (a.riskLevel === "critical" && b.riskLevel !== "critical") return -1
    if (a.riskLevel !== "critical" && b.riskLevel === "critical") return 1
    return 0
  })

  return chain
}

// ============================================
// COMPONENTS
// ============================================

function AnimatedLine({ delay = 0 }: { delay?: number }) {
  return (
    <div className="flex items-center justify-center w-20 relative">
      <svg className="w-full h-8" viewBox="0 0 80 32">
        <defs>
          <linearGradient id={`lineGrad-${delay}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.2" />
            <stop offset="50%" stopColor="hsl(var(--primary))" stopOpacity="0.8" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.2" />
          </linearGradient>
        </defs>
        <motion.path
          d="M 0 16 Q 40 16 80 16"
          fill="none"
          stroke={`url(#lineGrad-${delay})`}
          strokeWidth="2"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.8, delay: delay * 0.2, ease: "easeOut" }}
        />
        <motion.circle
          cx="0"
          cy="16"
          r="3"
          fill="hsl(var(--primary))"
          initial={{ opacity: 0 }}
          animate={{ 
            opacity: [0, 1, 0],
            cx: [0, 80, 80]
          }}
          transition={{ 
            duration: 2, 
            delay: delay * 0.2 + 0.8,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      </svg>
    </div>
  )
}

const SubjectNode = React.memo(function SubjectNode({ subject }: { subject: ResolvedChain["subject"] }) {
  const [copied, setCopied] = useState(false)
  
  const iconMap = {
    User: User,
    Group: Users,
    ServiceAccount: Key,
  }
  const Icon = iconMap[subject.kind as keyof typeof iconMap] || User
  
  const colorMap = {
    User: "from-blue-500 to-blue-600",
    Group: "from-purple-500 to-purple-600", 
    ServiceAccount: "from-amber-500 to-amber-600",
  }
  const gradient = colorMap[subject.kind as keyof typeof colorMap] || colorMap.User

  const handleCopy = () => {
    navigator.clipboard.writeText(subject.key)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.5, type: "spring" }}
      whileHover={{ scale: 1.02, y: -2 }}
      className="relative"
    >
      <div className="glass-card p-6 rounded-2xl border border-border/50 min-w-[220px] backdrop-blur-xl bg-card/80">
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
        
        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-4">
            <div className={`p-3 rounded-xl bg-gradient-to-br ${gradient} text-white shadow-lg`}>
              <Icon className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Subject</p>
              <p className="font-semibold text-foreground">{subject.kind}</p>
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-foreground truncate max-w-[160px]" title={subject.name}>
                {subject.name}
              </p>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button 
                    onClick={handleCopy}
                    className="p-1 rounded hover:bg-muted transition-colors"
                  >
                    {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent>Copy subject key</TooltipContent>
              </Tooltip>
            </div>
            {subject.namespace && (
              <Badge variant="secondary" className="text-xs">
                ns: {subject.namespace}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
})

const BindingNode = React.memo(function BindingNode({ bindings }: { bindings: ResolvedChain["bindings"] }) {
  const [expanded, setExpanded] = useState(false)
  const displayBindings = expanded ? bindings : bindings.slice(0, 2)
  
  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.1, type: "spring" }}
      whileHover={{ scale: 1.02, y: -2 }}
      className="relative"
    >
      <div className="glass-card p-6 rounded-2xl border border-border/50 min-w-[220px] backdrop-blur-xl bg-card/80">
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none" />
        
        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg">
              <Link2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Bindings</p>
              <p className="font-semibold text-foreground">{bindings.length} binding{bindings.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
          
          <div className="space-y-2">
            {displayBindings.map((binding, i) => (
              <div key={i} className="p-2 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant={binding.kind === "ClusterRoleBinding" ? "default" : "secondary"} className="text-xs">
                    {binding.kind === "ClusterRoleBinding" ? "CRB" : "RB"}
                  </Badge>
                  <span className="text-xs text-muted-foreground truncate max-w-[120px]" title={binding.name}>
                    {binding.name}
                  </span>
                </div>
                {binding.namespace && (
                  <p className="text-xs text-muted-foreground">ns: {binding.namespace}</p>
                )}
              </div>
            ))}
            
            {bindings.length > 2 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {expanded ? "Show less" : `+${bindings.length - 2} more`}
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
})

const RoleNode = React.memo(function RoleNode({ roles }: { roles: ResolvedChain["roles"] }) {
  const [expanded, setExpanded] = useState(false)
  const displayRoles = expanded ? roles : roles.slice(0, 2)
  
  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.2, type: "spring" }}
      whileHover={{ scale: 1.02, y: -2 }}
      className="relative"
    >
      <div className="glass-card p-6 rounded-2xl border border-border/50 min-w-[220px] backdrop-blur-xl bg-card/80">
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan-500/5 to-transparent pointer-events-none" />
        
        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-cyan-500 to-cyan-600 text-white shadow-lg">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Roles</p>
              <p className="font-semibold text-foreground">{roles.length} role{roles.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
          
          <div className="space-y-2">
            {displayRoles.map((role, i) => (
              <div key={i} className="p-2 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant={role.kind === "ClusterRole" ? "default" : "secondary"} className="text-xs">
                    {role.kind === "ClusterRole" ? "CR" : "R"}
                  </Badge>
                  <span className="text-xs font-medium truncate max-w-[120px]" title={role.name}>
                    {role.name}
                  </span>
                </div>
                {role.namespace ? (
                  <p className="text-xs text-muted-foreground">ns: {role.namespace}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">cluster scope</p>
                )}
              </div>
            ))}
            
            {roles.length > 2 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {expanded ? "Show less" : `+${roles.length - 2} more`}
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
})

const PermissionsNode = React.memo(function PermissionsNode({ permissions }: { permissions: ResolvedChain["permissions"] }) {
  const [expanded, setExpanded] = useState(false)
  const displayPerms = expanded ? permissions : permissions.slice(0, 6)
  
  const criticalCount = permissions.filter(p => p.riskLevel === "critical").length
  const highCount = permissions.filter(p => p.riskLevel === "high").length
  
  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.3, type: "spring" }}
      whileHover={{ scale: 1.02, y: -2 }}
      className="relative"
    >
      <div className="glass-card p-6 rounded-2xl border border-border/50 min-w-[280px] max-w-[320px] backdrop-blur-xl bg-card/80">
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-pink-500/5 to-transparent pointer-events-none" />
        
        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-pink-500 to-pink-600 text-white shadow-lg">
              <Box className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Permissions</p>
              <p className="font-semibold text-foreground">{permissions.length} resource{permissions.length !== 1 ? "s" : ""}</p>
            </div>
            {(criticalCount > 0 || highCount > 0) && (
              <div className="flex gap-1">
                {criticalCount > 0 && (
                  <Badge variant="destructive" className="text-xs">{criticalCount} critical</Badge>
                )}
                {highCount > 0 && (
                  <Badge className="text-xs bg-orange-500/10 text-orange-500 border-orange-500/20">{highCount} high</Badge>
                )}
              </div>
            )}
          </div>
          
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {displayPerms.map((perm, i) => (
              <motion.div 
                key={i} 
                className={`p-2 rounded-lg ${
                  perm.riskLevel === "critical" ? "bg-destructive/10 border border-destructive/20" :
                  perm.riskLevel === "high" ? "bg-orange-500/10 border border-orange-500/20" :
                  "bg-muted/50"
                }`}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <code className="text-xs font-medium">{perm.resource}</code>
                  {perm.isRisky && (
                    <AlertTriangle className={`w-3 h-3 ${
                      perm.riskLevel === "critical" ? "text-destructive" : "text-orange-500"
                    }`} />
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {perm.verbs.slice(0, 5).map((verb, vi) => (
                    <Badge key={vi} variant="secondary" className="text-[10px] px-1.5 py-0">
                      {verb}
                    </Badge>
                  ))}
                  {perm.verbs.length > 5 && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      +{perm.verbs.length - 5}
                    </Badge>
                  )}
                </div>
              </motion.div>
            ))}
            
            {permissions.length > 6 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 text-xs text-primary hover:underline w-full justify-center py-2"
              >
                {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {expanded ? "Show less" : `Show ${permissions.length - 6} more`}
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
})

const FindingsPanel = React.memo(function FindingsPanel({ findings }: { findings: RBACFinding[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  
  if (findings.length === 0) return null
  
  const severityColors = {
    critical: "bg-destructive/10 text-destructive border-destructive/20",
    high: "bg-orange-500/10 text-orange-500 border-orange-500/20",
    medium: "bg-warning/10 text-warning border-warning/20",
    low: "bg-success/10 text-success border-success/20",
  }
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="mt-8"
    >
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle className="w-5 h-5 text-destructive" />
        <h3 className="text-lg font-semibold">Risk Findings ({findings.length})</h3>
      </div>
      
      <div className="grid gap-3">
        {findings.map((finding) => (
          <motion.div
            key={finding.id}
            className={`p-4 rounded-xl border ${severityColors[finding.severity]} backdrop-blur-sm`}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <div 
              className="flex items-start gap-3 cursor-pointer"
              onClick={() => setExpandedId(expandedId === finding.id ? null : finding.id)}
            >
              <Badge className={severityColors[finding.severity]}>
                {finding.severity.toUpperCase()}
              </Badge>
              <div className="flex-1">
                <p className="font-medium text-sm">{finding.title}</p>
                {expandedId === finding.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    className="mt-3 space-y-2"
                  >
                    <p className="text-xs text-muted-foreground">{finding.description}</p>
                    {finding.remediation && (
                      <div className="p-2 rounded-lg bg-background/50">
                        <p className="text-xs font-medium mb-1">Remediation:</p>
                        <p className="text-xs text-muted-foreground">{finding.remediation}</p>
                      </div>
                    )}
                  </motion.div>
                )}
              </div>
              <ChevronDown className={`w-4 h-4 transition-transform ${expandedId === finding.id ? "rotate-180" : ""}`} />
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
})

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center min-h-[60vh] text-center"
    >
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-6">
        <Sparkles className="w-10 h-10 text-primary" />
      </div>
      <h2 className="text-2xl font-bold mb-2">RBAC Map</h2>
      <p className="text-muted-foreground mb-6 max-w-md">
        Select a subject from RBAC Viewer to visualize access paths and understand permissions at a glance.
      </p>
      <Link href="/app/rbac-viewer">
        <Button className="rounded-xl">
          <ArrowRight className="w-4 h-4 mr-2" />
          Go to RBAC Viewer
        </Button>
      </Link>
    </motion.div>
  )
}

function RBACMapContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [scan, setScan] = useState<Scan | null>(null)
  const [chain, setChain] = useState<ResolvedChain | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Extract raw params as primitive strings for stable dependency
  const subjectParam = searchParams.get("subject")
  const subjectTypeParam = searchParams.get("subjectType")
  const namespaceParam = searchParams.get("namespace")
  const roleParam = searchParams.get("role")
  const resourceParam = searchParams.get("resource")

  // Parse payload from URL params - compute inline so it's always fresh
  const payload: MapPayload | null = useMemo(() => {
    if (!subjectParam || !subjectTypeParam) return null

    return {
      subject: subjectParam,
      subjectType: subjectTypeParam,
      namespace: namespaceParam || "*",
      role: roleParam || "",
      resource: resourceParam || undefined,
    }
  }, [subjectParam, subjectTypeParam, namespaceParam, roleParam, resourceParam])

  useEffect(() => {
    let cancelled = false

    const loadData = async () => {
      setIsLoading(true)
      
      // Build payload from current params inside the effect to avoid stale closures
      const currentPayload: MapPayload | null = subjectParam && subjectTypeParam
        ? {
            subject: subjectParam,
            subjectType: subjectTypeParam,
            namespace: namespaceParam || "*",
            role: roleParam || "",
            resource: resourceParam || undefined,
          }
        : null

      // Get active workspace, then load scan
      const workspace = await getActiveWorkspace()
      if (cancelled) return
      
      let activeScan: Scan | null = null
      if (workspace) {
        activeScan = await getActiveScan(workspace.id)
      } else {
        // Fallback: try without workspace (uses getOrCreateActiveWorkspaceId internally)
        activeScan = await getActiveScan()
      }
      if (cancelled) return

      const scanToUse = activeScan || demoScan
      setScan(scanToUse)
      
      if (currentPayload && scanToUse?.dataset) {
        const resolved = resolveChain(scanToUse, currentPayload)
        if (!cancelled) setChain(resolved)
      } else {
        if (!cancelled) setChain(null)
      }
      
      if (!cancelled) setIsLoading(false)
    }

    loadData()

    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const handleUpdate = () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => loadData(), 300)
    }
    window.addEventListener("kubescope-scan-updated", handleUpdate)
    return () => {
      cancelled = true
      if (debounceTimer) clearTimeout(debounceTimer)
      window.removeEventListener("kubescope-scan-updated", handleUpdate)
    }
  }, [subjectParam, subjectTypeParam, namespaceParam, roleParam, resourceParam])

  // Memoize risk summary data - must be called before any conditional returns (React hooks rules)
  const riskSummary = useMemo(() => {
    if (!chain) return null
    const criticalCount = chain.permissions.filter(p => p.riskLevel === "critical").length
    const highCount = chain.permissions.filter(p => p.riskLevel === "high").length
    const hasWildcard = chain.permissions.some(p => p.resource === "*" || p.verbs.includes("*"))
    const hasSecretsAccess = chain.permissions.some(p => p.resource.includes("secrets"))
    const hasPodExec = chain.permissions.some(p => p.resource.includes("pods/exec"))
    const hasRiskyPermissions = chain.permissions.some(p => p.isRisky)
    return { criticalCount, highCount, hasWildcard, hasSecretsAccess, hasPodExec, hasRiskyPermissions }
  }, [chain])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!payload) {
    return <EmptyState />
  }

  if (!scan) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <AlertTriangle className="w-10 h-10 text-muted-foreground mb-4" />
        <h2 className="text-xl font-bold mb-2">No Active Scan</h2>
        <p className="text-muted-foreground mb-6 max-w-md">
          Upload an RBAC snapshot first to visualize access paths.
        </p>
        <Link href="/app/clusters">
          <Button className="rounded-xl">
            <ArrowRight className="w-4 h-4 mr-2" />
            Go to Clusters
          </Button>
        </Link>
      </div>
    )
  }

  if (!chain || (chain.roles.length === 0 && chain.bindings.length === 0 && chain.permissions.length === 0)) {
    return (
      <TooltipProvider>
        <div className="p-6 space-y-8">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between"
          >
            <div>
              <h1 className="text-3xl font-bold tracking-tight">RBAC Map</h1>
              <p className="mt-1 text-muted-foreground">
                Access path visualization for <span className="font-medium text-foreground">{payload.subject}</span>
              </p>
            </div>
            <Button variant="outline" onClick={() => router.push("/app/rbac-viewer")} className="rounded-xl bg-transparent">
              <X className="w-4 h-4 mr-2" />
              Back to Viewer
            </Button>
          </motion.div>
          <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
            <AlertTriangle className="w-10 h-10 text-muted-foreground mb-4" />
            <h2 className="text-xl font-bold mb-2">No matching RBAC chain found</h2>
            <p className="text-muted-foreground mb-6 max-w-md">
              Could not resolve bindings or roles for <span className="font-medium">{payload.subject}</span> ({payload.subjectType}) in this scan.
            </p>
            <Link href="/app/rbac-viewer">
              <Button className="rounded-xl">
                <ArrowRight className="w-4 h-4 mr-2" />
                Back to RBAC Viewer
              </Button>
            </Link>
          </div>
        </div>
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider>
      <div className="p-6 space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div>
            <h1 className="text-3xl font-bold tracking-tight">RBAC Map</h1>
            <p className="mt-1 text-muted-foreground">
              Access path visualization for <span className="font-medium text-foreground">{payload.subject}</span>
            </p>
          </div>
          <Button variant="outline" onClick={() => router.push("/app/rbac-viewer")} className="rounded-xl bg-transparent">
            <X className="w-4 h-4 mr-2" />
            Close Map
          </Button>
        </motion.div>

        {/* Chain Visualization */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="relative overflow-x-auto pb-4"
        >
          <div className="flex items-center gap-2 min-w-max py-8">
            <SubjectNode subject={chain.subject} />
            
            {chain.bindings.length > 0 && (
              <>
                <AnimatedLine delay={0} />
                <BindingNode bindings={chain.bindings} />
              </>
            )}
            
            {chain.roles.length > 0 && (
              <>
                <AnimatedLine delay={1} />
                <RoleNode roles={chain.roles} />
              </>
            )}
            
            {chain.permissions.length > 0 && (
              <>
                <AnimatedLine delay={2} />
                <PermissionsNode permissions={chain.permissions} />
              </>
            )}
          </div>
        </motion.div>

        {/* Risk Summary - uses memoized riskSummary */}
        {riskSummary && (riskSummary.hasRiskyPermissions || chain.findings.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="glass-card p-6 rounded-2xl"
          >
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Risk Summary
            </h3>
            <div className="flex flex-wrap gap-2">
              {riskSummary.criticalCount > 0 && (
                <Badge variant="destructive" className="text-sm px-3 py-1">
                  {riskSummary.criticalCount} Critical Permissions
                </Badge>
              )}
              {riskSummary.highCount > 0 && (
                <Badge className="text-sm px-3 py-1 bg-orange-500/10 text-orange-500 border-orange-500/20">
                  {riskSummary.highCount} High Risk Permissions
                </Badge>
              )}
              {riskSummary.hasWildcard && (
                <Badge variant="secondary" className="text-sm px-3 py-1">
                  Wildcard Access Detected
                </Badge>
              )}
              {riskSummary.hasSecretsAccess && (
                <Badge variant="secondary" className="text-sm px-3 py-1">
                  Secrets Access
                </Badge>
              )}
              {riskSummary.hasPodExec && (
                <Badge variant="secondary" className="text-sm px-3 py-1">
                  Pod Exec Access
                </Badge>
              )}
            </div>
          </motion.div>
        )}

        {/* Findings */}
        <FindingsPanel findings={chain.findings} />

        {/* Actions Panel */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="flex flex-wrap gap-3 pt-4 border-t border-border"
        >
          <Button variant="outline" className="rounded-xl bg-transparent">
            <FileText className="w-4 h-4 mr-2" />
            Export Findings CSV
          </Button>
          <Button variant="outline" className="rounded-xl bg-transparent">
            <ExternalLink className="w-4 h-4 mr-2" />
            Create Ticket
          </Button>
        </motion.div>
      </div>
    </TooltipProvider>
  )
}

function RBACMapGate() {
  const searchParams = useSearchParams()
  const isDemo = searchParams.get("demo") === "true"

  return (
    <PremiumGate
      bypass={isDemo}
      title="RBAC Map is a premium feature"
      description="Upgrade to KubeScope Unlimited to visualize permission chains across your clusters."
    >
      <RBACMapContent />
    </PremiumGate>
  )
}

export default function RBACMapPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <RBACMapGate />
    </Suspense>
  )
}
