"use client"

import { motion, AnimatePresence } from "framer-motion"
import { useState, useEffect, useMemo, useCallback } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Search, Filter, Map as MapIcon, ChevronRight, X, Upload, Sparkles, Download } from "lucide-react"
import Link from "next/link"
import {
  type Scan,
  type RBACSubject,
  type RBACRole,
  type RBACBinding,
  getActiveScan,
} from "@/lib/rbac-scanner"
import { getActiveWorkspace } from "@/lib/workspace-manager"
import { demoRBACData } from "@/lib/demo-data"

interface RBACViewItem {
  id: string
  subject: string
  subjectType: string
  namespace: string
  resource: string
  verbs: string[]
  risk: "critical" | "high" | "medium" | "low"
  role: string
}

const RISK_BADGE_VARIANTS = {
  critical: "bg-destructive/10 text-destructive border-destructive/20",
  high: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  medium: "bg-warning/10 text-warning border-warning/20",
  low: "bg-success/10 text-success border-success/20",
} as const

// Normalize role name by stripping prefixes
function normalizeRoleName(name: string): string {
  return name.replace(/^(Role|ClusterRole)\//, '').trim()
}

// Convert scan dataset to view items with proper risk matching
function convertToViewItems(scan: Scan): RBACViewItem[] {
  const items: RBACViewItem[] = []
  
  const roles = scan.dataset?.roles || []
  const bindings = scan.dataset?.bindings || []
  const findings = scan.dataset?.findings || []
  
  // Create role map
  const roleMap = new Map<string, RBACRole>()
  for (const role of roles) {
    if (!role || !role.name) continue
    const normalized = normalizeRoleName(role.name)
    roleMap.set(normalized, role)
    if (normalized !== role.name) {
      roleMap.set(role.name, role)
    }
  }

  const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
  let idCounter = 0

  // Pre-compute risk lookup: Map<"role|namespace|subject?" -> highestSeverity>
  // This avoids iterating all findings for every row (O(findings) per row -> O(1) per row)
  const riskLookup = new Map<string, "critical" | "high" | "medium" | "low">()

  for (const finding of findings) {
    const findingRole = finding.role ? normalizeRoleName(finding.role) : null
    if (!findingRole) continue
    const findingNamespace = finding.namespace || "*"
    const findingSeverity = finding.severity as "critical" | "high" | "medium" | "low"

    // Build lookup keys for this finding
    const keys: string[] = []

    if (finding.impactedSubjects?.length > 0) {
      for (const subject of finding.impactedSubjects) {
        keys.push(`${findingRole}|${findingNamespace}|${subject}`)
        if (findingNamespace !== "*") {
          keys.push(`${findingRole}|*|${subject}`)
        }
      }
    } else {
      keys.push(`${findingRole}|${findingNamespace}|`)
      if (findingNamespace !== "*") {
        keys.push(`${findingRole}|*|`)
      }
    }

    for (const key of keys) {
      const existing = riskLookup.get(key)
      if (!existing || severityOrder[findingSeverity] < severityOrder[existing]) {
        riskLookup.set(key, findingSeverity)
      }
    }
  }

  // Fast risk lookup using pre-computed map
  const computeRisk = (roleName: string, namespace: string, subjectKey?: string): "critical" | "high" | "medium" | "low" => {
    const normalizedRole = normalizeRoleName(roleName)

    // Try exact match with subject
    if (subjectKey) {
      const exactKey = `${normalizedRole}|${namespace}|${subjectKey}`
      const wildcardKey = `${normalizedRole}|*|${subjectKey}`
      const exact = riskLookup.get(exactKey)
      const wildcard = riskLookup.get(wildcardKey)

      let best: "critical" | "high" | "medium" | "low" = "low"
      if (exact && severityOrder[exact] < severityOrder[best]) best = exact
      if (wildcard && severityOrder[wildcard] < severityOrder[best]) best = wildcard

      // Also check without subject (findings that apply to all subjects)
      const noSubjectKey = `${normalizedRole}|${namespace}|`
      const noSubjectWildcard = `${normalizedRole}|*|`
      const noSubject = riskLookup.get(noSubjectKey)
      const noSubjectWc = riskLookup.get(noSubjectWildcard)
      if (noSubject && severityOrder[noSubject] < severityOrder[best]) best = noSubject
      if (noSubjectWc && severityOrder[noSubjectWc] < severityOrder[best]) best = noSubjectWc

      return best
    }

    // No subject key - check without subject
    const key = `${normalizedRole}|${namespace}|`
    const wildcardKey = `${normalizedRole}|*|`
    const exact = riskLookup.get(key)
    const wildcard = riskLookup.get(wildcardKey)

    let best: "critical" | "high" | "medium" | "low" = "low"
    if (exact && severityOrder[exact] < severityOrder[best]) best = exact
    if (wildcard && severityOrder[wildcard] < severityOrder[best]) best = wildcard
    return best
  }

  // CASE 1: If we have bindings, generate items from bindings (normal flow)
  if (bindings.length > 0) {
    for (const binding of bindings) {
      if (!binding?.roleRef?.name) continue
      
      const roleRefName = normalizeRoleName(binding.roleRef.name)
      const role = roleMap.get(roleRefName)
      if (!role) continue

      const subjects = Array.isArray(binding.subjects) ? binding.subjects : []
      for (const subject of subjects) {
        if (!subject?.name) continue

        const subjectKey = subject.kind === "ServiceAccount"
          ? `ServiceAccount:${subject.namespace || "default"}:${subject.name}`
          : subject.kind === "Group" ? `Group:${subject.name}` : `User:${subject.name}`

        const rules = Array.isArray(role.rules) ? role.rules : []
        for (const rule of rules) {
          if (!rule) continue

          const resources = Array.isArray(rule.resources) ? rule.resources : []
          const verbs = Array.isArray(rule.verbs) ? rule.verbs : []
          if (resources.length === 0 || verbs.length === 0) continue

          for (const resource of resources) {
            idCounter++
            const rowNamespace = binding.namespace || role.namespace || "*"
            
            items.push({
              id: `${idCounter}`,
              subject: subject.name,
              subjectType: subject.kind,
              namespace: rowNamespace,
              resource,
              verbs,
              risk: computeRisk(role.name, rowNamespace, subjectKey),
              role: role.name,
            })
          }
        }
      }
    }
  }
  
  // CASE 2: If no bindings but we have roles, show roles directly (useful for clusterroles.json files)
  if (items.length === 0 && roles.length > 0) {
    for (const role of roles) {
      if (!role?.name) continue
      
      const rules = Array.isArray(role.rules) ? role.rules : []
      for (const rule of rules) {
        if (!rule) continue

        const resources = Array.isArray(rule.resources) ? rule.resources : []
        const verbs = Array.isArray(rule.verbs) ? rule.verbs : []
        if (resources.length === 0 || verbs.length === 0) continue

        for (const resource of resources) {
          idCounter++
          const rowNamespace = role.namespace || "*"
          
          items.push({
            id: `${idCounter}`,
            subject: role.name, // Use role name as subject when no bindings
            subjectType: role.kind || "ClusterRole",
            namespace: rowNamespace,
            resource,
            verbs,
            risk: computeRisk(role.name, rowNamespace),
            role: role.name,
          })
        }
      }
    }
  }

  return items
}

export default function RBACViewerPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const isDemo = searchParams.get('demo') === 'true'
  
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("")
  const [filters, setFilters] = useState({
    namespace: "All",
    subjectType: "All",
    risk: "All",
    resource: "All",
  })
  const [isLoading, setIsLoading] = useState(true)
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)
  const [rbacData, setRbacData] = useState<RBACViewItem[]>([])
  const [activeScan, setActiveScan] = useState<Scan | null>(null)

  // Debounce search query to avoid filtering on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
    }, 150)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Memoize filter options - only recompute when rbacData changes
  const namespaces = useMemo(() => ["All", ...new Set(rbacData.map(item => item.namespace))], [rbacData])
  const subjectTypes = useMemo(() => ["All", ...new Set(rbacData.map(item => item.subjectType))], [rbacData])
  const riskLevels = useMemo(() => ["All", "critical", "high", "medium", "low"], [])
  const resources = useMemo(() => ["All", ...new Set(rbacData.map(item => item.resource))], [rbacData])

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true)
      
      // If demo mode, load demo data
      if (isDemo) {
        setActiveScan({ id: "demo", fileName: "Demo Cluster", clusterName: "demo" } as Scan)
        setRbacData(demoRBACData as RBACViewItem[])
        setIsLoading(false)
        return
      }

      // Get active workspace first
      const workspace = await getActiveWorkspace()
      if (!workspace) {
        setActiveScan(null)
        setRbacData([])
        setIsLoading(false)
        return
      }

      // Load scan from the active workspace
      const scan = await getActiveScan(workspace.id)
      if (scan && scan.dataset) {
        // Set active scan even if dataset is partial
        setActiveScan(scan)
        
        // Convert to view items - handles missing bindings/roles gracefully
        const viewItems = convertToViewItems(scan)
        setRbacData(viewItems)
      } else {
        // No scan in this workspace - show empty state
        setActiveScan(null)
        setRbacData([])
      }
      setIsLoading(false)
    }

    loadData()

    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const handleCustomUpdate = () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => loadData(), 300)
    }
    window.addEventListener("kubescope-scan-updated", handleCustomUpdate)
    window.addEventListener("kubescope-workspace-changed", handleCustomUpdate)

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      window.removeEventListener("kubescope-scan-updated", handleCustomUpdate)
      window.removeEventListener("kubescope-workspace-changed", handleCustomUpdate)
    }
  }, [isDemo])

  const activeFiltersCount = useMemo(
    () => Object.values(filters).filter((v) => v !== "All").length,
    [filters]
  )

  // Memoize filtered data - only recompute when inputs change
  const filteredData = useMemo(() => {
    const searchLower = debouncedSearchQuery.toLowerCase()
    
    return rbacData.filter((item) => {
      // Apply filters first (cheaper checks)
      if (filters.namespace !== "All" && item.namespace !== filters.namespace) return false
      if (filters.subjectType !== "All" && item.subjectType !== filters.subjectType) return false
      if (filters.risk !== "All" && item.risk !== filters.risk) return false
      if (filters.resource !== "All" && item.resource !== filters.resource) return false
      
      // Apply search last (more expensive string operations)
      if (searchLower) {
        return item.subject.toLowerCase().includes(searchLower) ||
               item.resource.toLowerCase().includes(searchLower) ||
               item.role.toLowerCase().includes(searchLower)
      }
      
      return true
    })
  }, [rbacData, debouncedSearchQuery, filters])

  const handleFilterChange = useCallback((key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }, [])

  const clearFilters = useCallback(() => {
    setFilters({
      namespace: "All",
      subjectType: "All",
      risk: "All",
      resource: "All",
    })
  }, [])

  const getRiskBadge = useCallback((risk: string) => {
    return RISK_BADGE_VARIANTS[risk as keyof typeof RISK_BADGE_VARIANTS] || RISK_BADGE_VARIANTS.low
  }, [])

  const handleExportCSV = useCallback(() => {
    if (!activeScan) return
    
    const headers = ["Subject", "Type", "Namespace", "Resource", "Verbs", "Risk", "Role"]
    const rows = filteredData.map(item => [
      item.subject,
      item.subjectType,
      item.namespace,
      item.resource,
      item.verbs.join(";"),
      item.risk,
      item.role,
    ])
    
    const csvContent = [headers, ...rows].map(row => row.join(",")).join("\n")
    const blob = new Blob([csvContent], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `rbac-viewer-${activeScan.fileName.replace(/\.(json|zip)$/, "")}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }, [activeScan, filteredData])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-4 w-64 bg-muted rounded animate-pulse" />
        <div className="grid gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-muted rounded animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <motion.div className="space-y-6">
      {/* Demo Mode Banner */}
      {isDemo && (
        <motion.div
          className="glass-card p-4 border-2 border-primary/50"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-primary" />
            <div className="flex-1">
              <p className="font-semibold">Demo Mode</p>
              <p className="text-sm text-muted-foreground">
                You're viewing KubeScope with sample data. Sign up to analyze your own clusters.
              </p>
            </div>
            <Link href="/auth/sign-up">
              <Button size="sm" className="rounded-xl">
                Sign Up
              </Button>
            </Link>
          </div>
        </motion.div>
      )}

      {/* Page header */}
      <motion.div
        className="flex items-center justify-between"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div>
          <h1 className="text-3xl font-bold tracking-tight">RBAC Viewer</h1>
          <p className="mt-1 text-muted-foreground">
            {activeScan && activeScan.id !== "demo-scan" ? (
              <>Viewing: <span className="font-medium text-foreground">{activeScan.fileName}</span></>
            ) : (
              "Search and filter Kubernetes RBAC permissions"
            )}
          </p>
        </div>
        {activeScan && (
          <Button variant="outline" onClick={handleExportCSV} className="rounded-xl bg-transparent">
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        )}
      </motion.div>

      {rbacData.length > 0 ? (
        <>
          {/* Search and Filters */}
          <motion.div
            className="space-y-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            {/* Search bar */}
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search subjects, resources, roles..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-11 rounded-xl"
              />
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Filter className="w-4 h-4" />
                Filters:
              </div>

              <Select value={filters.namespace} onValueChange={(v) => handleFilterChange("namespace", v)}>
                <SelectTrigger className="w-[140px] rounded-xl">
                  <SelectValue placeholder="Namespace" />
                </SelectTrigger>
                <SelectContent>
                  {namespaces.map((ns) => (
                    <SelectItem key={ns} value={ns}>
                      {ns === "All" ? "All Namespaces" : ns}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filters.subjectType} onValueChange={(v) => handleFilterChange("subjectType", v)}>
                <SelectTrigger className="w-[150px] rounded-xl">
                  <SelectValue placeholder="Subject Type" />
                </SelectTrigger>
                <SelectContent>
                  {subjectTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type === "All" ? "All Types" : type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filters.risk} onValueChange={(v) => handleFilterChange("risk", v)}>
                <SelectTrigger className="w-[130px] rounded-xl">
                  <SelectValue placeholder="Risk Level" />
                </SelectTrigger>
                <SelectContent>
                  {riskLevels.map((risk) => (
                    <SelectItem key={risk} value={risk}>
                      {risk === "All" ? "All Risks" : risk.charAt(0).toUpperCase() + risk.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filters.resource} onValueChange={(v) => handleFilterChange("resource", v)}>
                <SelectTrigger className="w-[180px] rounded-xl">
                  <SelectValue placeholder="Resource" />
                </SelectTrigger>
                <SelectContent>
                  {resources.map((resource) => (
                    <SelectItem key={resource} value={resource}>
                      {resource === "All" ? "All Resources" : resource}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {activeFiltersCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4 mr-1" />
                  Clear ({activeFiltersCount})
                </Button>
              )}
            </div>
          </motion.div>

          {/* Table */}
          <motion.div
            className="glass-card overflow-hidden"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="font-semibold">Subject</TableHead>
                    <TableHead className="font-semibold">Namespace</TableHead>
                    <TableHead className="font-semibold">Resource</TableHead>
                    <TableHead className="font-semibold">Verbs</TableHead>
                    <TableHead className="font-semibold">Risk</TableHead>
                    <TableHead className="font-semibold w-[100px]">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                    {filteredData.length > 0 ? (
                      filteredData.slice(0, 100).map((item) => (
                        <tr
                          key={item.id}
                          className={`border-b border-border transition-colors cursor-pointer ${
                            hoveredRow === item.id ? "bg-muted/50" : ""
                          }`}
                          onMouseEnter={() => setHoveredRow(item.id)}
                          onMouseLeave={() => setHoveredRow(null)}
                        >
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-xs font-medium">
                                {item.subjectType[0]}
                              </div>
                              <div>
                                <p className="font-medium">{item.subject}</p>
                                <p className="text-xs text-muted-foreground">{item.subjectType}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-muted-foreground">{item.namespace}</span>
                          </TableCell>
                          <TableCell>
                            <code className="px-2 py-1 rounded bg-muted text-sm">
                              {item.resource}
                            </code>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {item.verbs.slice(0, 3).map((verb) => (
                                <Badge key={verb} variant="secondary" className="text-xs">
                                  {verb}
                                </Badge>
                              ))}
                              {item.verbs.length > 3 && (
                                <Badge variant="secondary" className="text-xs">
                                  +{item.verbs.length - 3}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={`${getRiskBadge(item.risk)} border`}>
                              {item.risk}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => router.push(`/app/rbac-map?subject=${encodeURIComponent(item.subject)}&subjectType=${encodeURIComponent(item.subjectType)}&namespace=${encodeURIComponent(item.namespace)}&role=${encodeURIComponent(item.role)}&resource=${encodeURIComponent(item.resource)}`)}
                              className="h-8 w-full justify-center text-primary hover:text-primary"
                            >
                              View
                            </Button>
                          </TableCell>
                        </tr>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                          No RBAC data found matching your filters
                        </TableCell>
                      </TableRow>
                    )}
                </TableBody>
              </Table>
            </div>

            {/* Table footer */}
            <div className="px-4 py-3 border-t border-border flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Showing {Math.min(filteredData.length, 100)} of {filteredData.length} entries
                {filteredData.length > 100 && <span className="ml-1 text-warning">(limited to 100 for performance)</span>}
              </span>
              <span>{activeFiltersCount} filter{activeFiltersCount !== 1 ? "s" : ""} applied</span>
            </div>
          </motion.div>
        </>
      ) : (
        /* Empty State */
        <motion.div
          className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-muted/30 via-background to-muted/30 p-12"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-primary/5 blur-3xl" />
            <div className="absolute -bottom-24 -left-24 w-64 h-64 rounded-full bg-primary/5 blur-3xl" />
          </div>

          <div className="relative text-center max-w-md mx-auto">
            <motion.div 
              className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-6"
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring" }}
            >
              <Sparkles className="w-10 h-10 text-primary" />
            </motion.div>
            
            <h3 className="text-2xl font-bold mb-2">No RBAC data</h3>
            <p className="text-muted-foreground mb-8">
              Upload an RBAC snapshot to view and analyze your Kubernetes permissions.
            </p>
            
            <Link href="/app/clusters?upload=true">
              <Button size="lg" className="rounded-xl px-8">
                <Upload className="w-4 h-4 mr-2" />
                Upload Snapshot
              </Button>
            </Link>
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}
