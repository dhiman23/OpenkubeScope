"use client"

import React, { useState, useEffect, useMemo, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { motion } from "framer-motion"
import {
  AlertTriangle,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Search,
  Filter,
  ChevronDown,
  ExternalLink,
  Copy,
  Check,
  Clock,
  User,
  Layers,
  AlertCircle,
  Info,
  Upload,
  Sparkles,
  Download,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import Link from "next/link"
import {
  type Scan,
  type RBACFinding,
  getActiveScan,
} from "@/lib/rbac-scanner"
import { getActiveWorkspace } from "@/lib/workspace-manager"
import { demoFindings } from "@/lib/demo-data"
import { useWorkspace } from "@/components/app/app-shell"
import { useSubscription } from "@/hooks/use-subscription"
import { UpgradeDialog } from "@/components/app/upgrade-dialog"
import { Lock } from "lucide-react"

// Risk finding categories
const riskCategories = {
  OVERLY_PERMISSIVE: {
    label: "Overly Permissive",
    icon: ShieldAlert,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
  },
  PRIVILEGE_ESCALATION: {
    label: "Privilege Escalation",
    icon: AlertTriangle,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
  },
  MISCONFIGURATION: {
    label: "Misconfiguration",
    icon: AlertCircle,
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
  },
  BEST_PRACTICE: {
    label: "Best Practice",
    icon: Info,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
  },
}

const severityConfig = {
  critical: {
    label: "Critical",
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/30",
    icon: ShieldAlert,
  },
  high: {
    label: "High",
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500/30",
    icon: AlertTriangle,
  },
  medium: {
    label: "Medium",
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
    icon: AlertCircle,
  },
  low: {
    label: "Low",
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
    icon: Info,
  },
}

const FindingCard = React.memo(function FindingCard({ finding, index }: { finding: RBACFinding; index: number }) {
  const [isOpen, setIsOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const severity = severityConfig[finding.severity as keyof typeof severityConfig]
  const category = riskCategories[finding.category as keyof typeof riskCategories] || riskCategories.MISCONFIGURATION
  const SeverityIcon = severity.icon
  const CategoryIcon = category.icon

  const handleCopy = () => {
    navigator.clipboard.writeText(finding.id)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div
          className={`rounded-xl border ${severity.borderColor} bg-card overflow-hidden transition-all hover:shadow-lg`}
        >
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="w-full p-4 flex items-start gap-4 text-left hover:bg-muted/30 transition-colors"
            >
              <div className={`p-2 rounded-lg ${severity.bgColor}`}>
                <SeverityIcon className={`w-5 h-5 ${severity.color}`} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-xs font-mono text-muted-foreground">
                    {finding.id}
                  </span>
                  <Badge variant="outline" className={`${category.bgColor} ${category.color} border-0`}>
                    <CategoryIcon className="w-3 h-3 mr-1" />
                    {category.label}
                  </Badge>
                  {finding.cveId && (
                    <Badge variant="destructive" className="text-xs">
                      {finding.cveId}
                    </Badge>
                  )}
                </div>
                <h3 className="font-medium text-foreground mb-1">{finding.title}</h3>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {finding.description}
                </p>
              </div>

              <div className="flex flex-col items-end gap-2">
                <Badge className={`${severity.bgColor} ${severity.color} border-0`}>
                  {severity.label}
                </Badge>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  {finding.discoveredAt ? new Date(finding.discoveredAt).toLocaleDateString() : 'Unknown date'}
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-muted-foreground transition-transform ${
                    isOpen ? "rotate-180" : ""
                  }`}
                />
              </div>
            </button>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <div className="px-4 pb-4 pt-0 border-t border-border/50">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 py-4">
                <div>
                  <span className="text-xs text-muted-foreground">Namespace</span>
                  <p className="text-sm font-medium text-foreground flex items-center gap-1">
                    <Layers className="w-3 h-3" />
                    {finding.namespace}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Subject</span>
                  <p className="text-sm font-medium text-foreground flex items-center gap-1">
                    <User className="w-3 h-3" />
                    {finding.subject}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Subject Type</span>
                  <p className="text-sm font-medium text-foreground">
                    {finding.subjectType}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Role</span>
                  <p className="text-sm font-medium text-foreground flex items-center gap-1">
                    <Shield className="w-3 h-3" />
                    {finding.role}
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-muted/50 mb-4">
                <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  Remediation
                </h4>
                <p className="text-sm text-muted-foreground">
                  {finding.remediation}
                </p>
              </div>

              {finding.affectedResources && finding.affectedResources.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">
                    Affected Resources:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {finding.affectedResources.map((resource) => (
                      <Badge
                        key={resource}
                        variant="secondary"
                        className="text-xs"
                      >
                        {resource}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border/50 flex-wrap">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="sm" onClick={handleCopy}>
                        {copied ? (
                          <Check className="w-4 h-4 mr-1" />
                        ) : (
                          <Copy className="w-4 h-4 mr-1" />
                        )}
                        Copy ID
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {copied ? "Copied!" : "Copy finding ID"}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Link href={`/app/rbac-map?subject=${finding.subject}`}>
                  <Button variant="ghost" size="sm">
                    <ExternalLink className="w-4 h-4 mr-1" />
                    View in RBAC Map
                  </Button>
                </Link>
                <Button variant="outline" size="sm" className="ml-auto bg-transparent">
                  Mark as Resolved
                </Button>
                <Button size="sm">Create Ticket</Button>
              </div>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </div>
  )
})

const FREE_FINDINGS_PREVIEW = 3

export default function RiskFindingsPage() {
  const searchParams = useSearchParams()
  const isDemo = searchParams.get('demo') === 'true'
  const { activeWorkspace } = useWorkspace()
  const { isPremium } = useSubscription(activeWorkspace?.id || null)
  const showAllFindings = isPremium || isDemo

  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("")
  const [severityFilter, setSeverityFilter] = useState<string>("all")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [findings, setFindings] = useState<RBACFinding[]>([])
  const [activeScan, setActiveScan] = useState<Scan | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [upgradeOpen, setUpgradeOpen] = useState(false)

  // Debounce search query to avoid filtering on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
    }, 150)
    return () => clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => {
    const loadFindings = async () => {
      // If demo mode, load demo data
      if (isDemo) {
        setActiveScan({ id: "demo", fileName: "Demo Cluster", clusterName: "demo" } as Scan)
        setFindings(demoFindings as RBACFinding[])
        setIsLoading(false)
        return
      }

      // Get active workspace first
      const workspace = await getActiveWorkspace()
      if (!workspace) {
        setActiveScan(null)
        setFindings([])
        setIsLoading(false)
        return
      }

      // Load scan from the active workspace
      const scan = await getActiveScan(workspace.id)
      if (scan) {
        setActiveScan(scan)
        setFindings(scan.dataset?.findings || [])
      } else {
        // No scan in this workspace - show empty state
        setActiveScan(null)
        setFindings([])
      }
      setIsLoading(false)
    }

    // Initial load
    loadFindings()

    // Debounce event-driven refreshes to coalesce rapid-fire events
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const handleCustomUpdate = () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => loadFindings(), 300)
    }
    window.addEventListener("kubescope-scan-updated", handleCustomUpdate)
    window.addEventListener("kubescope-workspace-changed", handleCustomUpdate)

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      window.removeEventListener("kubescope-scan-updated", handleCustomUpdate)
      window.removeEventListener("kubescope-workspace-changed", handleCustomUpdate)
    }
  }, [isDemo])

  // Memoize filtered findings - only recompute when inputs change
  const filteredFindings = useMemo(() => {
    const query = debouncedSearchQuery.toLowerCase()
    
    return findings.filter((finding) => {
      // Apply filters first (cheaper checks)
      if (severityFilter !== "all" && finding.severity !== severityFilter) return false
      if (categoryFilter !== "all" && finding.category !== categoryFilter) return false
      
      // Apply search last (more expensive string operations)
      if (query) {
        return (finding.title || '').toLowerCase().includes(query) ||
               (finding.id || '').toLowerCase().includes(query) ||
               (finding.subject || '').toLowerCase().includes(query)
      }
      
      return true
    })
  }, [findings, debouncedSearchQuery, severityFilter, categoryFilter])

  // Memoize severity counts - compute once when findings change, not on every render
  const severityCounts = useMemo(() => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0 }
    for (const f of findings) {
      if (f.severity in counts) {
        counts[f.severity as keyof typeof counts]++
      }
    }
    return counts
  }, [findings])

  const handleExportCSV = useCallback(() => {
    if (!activeScan) return
    
    const headers = ["ID", "Title", "Severity", "Category", "Subject", "Subject Type", "Role", "Namespace", "Remediation"]
    const rows = filteredFindings.map(f => [
      f.id,
      `"${f.title.replace(/"/g, '""')}"`,
      f.severity,
      f.category,
      f.subject,
      f.subjectType,
      f.role,
      f.namespace,
      `"${f.remediation.replace(/"/g, '""')}"`,
    ])
    
    const csvContent = [headers, ...rows].map(row => row.join(",")).join("\n")
    const blob = new Blob([csvContent], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `risk-findings-${activeScan.fileName.replace(/\.(json|zip)$/, "")}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }, [activeScan, filteredFindings])

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-4 w-64 bg-muted rounded animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
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

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Risk Findings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {activeScan && activeScan.id !== "demo-scan" ? (
              <>Viewing: <span className="font-medium text-foreground">{activeScan.fileName}</span></>
            ) : (
              "Security issues and misconfigurations detected in your RBAC policies"
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeScan && findings.length > 0 && (
            <Button variant="outline" onClick={handleExportCSV} className="gap-2 bg-transparent">
              <Download className="w-4 h-4" />
              Export CSV
            </Button>
          )}
          <Link href="/app/clusters?upload=true">
            <Button className="gap-2">
              <AlertTriangle className="w-4 h-4" />
              Run New Scan
            </Button>
          </Link>
        </div>
      </div>

      {findings.length > 0 ? (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.entries(severityConfig).map(([key, config]) => {
              const Icon = config.icon
              const count = severityCounts[key as keyof typeof severityCounts]
              return (
                <motion.button
                  key={key}
                  type="button"
                  onClick={() => setSeverityFilter(severityFilter === key ? "all" : key)}
                  className={`p-4 rounded-xl border transition-all text-left ${
                    severityFilter === key
                      ? `${config.borderColor} ${config.bgColor}`
                      : "border-border/50 bg-card hover:bg-muted/30"
                  }`}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <Icon className={`w-5 h-5 ${config.color}`} />
                    <span className={`text-2xl font-semibold ${config.color}`}>
                      {count}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-foreground">{config.label}</p>
                  <p className="text-xs text-muted-foreground">findings</p>
                </motion.button>
              )
            })}
          </div>

          {/* Filters */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search findings..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {Object.entries(riskCategories).map(([key, value]) => (
                  <SelectItem key={key} value={key}>
                    {value.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {(severityFilter !== "all" || categoryFilter !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSeverityFilter("all")
                  setCategoryFilter("all")
                }}
              >
                Clear filters
              </Button>
            )}
          </div>

          {/* Findings list */}
          <div className="space-y-4">
            {filteredFindings.length > 0 && (
              <div className="text-sm text-muted-foreground mb-2">
                {showAllFindings ? (
                  <>
                    Showing {Math.min(filteredFindings.length, 100)} of {filteredFindings.length} findings
                    {filteredFindings.length > 100 && <span className="ml-1 text-warning">(limited to 100 for performance)</span>}
                  </>
                ) : (
                  <>
                    Showing {Math.min(filteredFindings.length, FREE_FINDINGS_PREVIEW)} of {filteredFindings.length} findings
                    <span className="ml-1 text-cyan-600 dark:text-cyan-400">(Free plan preview)</span>
                  </>
                )}
              </div>
            )}
            {filteredFindings.length > 0 ? (
              <>
                {filteredFindings
                  .slice(0, showAllFindings ? 100 : FREE_FINDINGS_PREVIEW)
                  .map((finding, index) => (
                    <FindingCard key={finding.id} finding={finding} index={index} />
                  ))}
                {!showAllFindings && filteredFindings.length > FREE_FINDINGS_PREVIEW && (
                  <div className="relative mt-4">
                    <div className="absolute inset-0 pointer-events-none select-none blur-md opacity-60 space-y-4">
                      {filteredFindings
                        .slice(FREE_FINDINGS_PREVIEW, FREE_FINDINGS_PREVIEW + 2)
                        .map((finding, index) => (
                          <FindingCard key={`blur-${finding.id}`} finding={finding} index={index} />
                        ))}
                    </div>
                    <div className="relative rounded-2xl border border-border/60 bg-background/95 backdrop-blur-sm p-8 text-center min-h-[200px] flex flex-col items-center justify-center">
                      <div className="mx-auto w-12 h-12 rounded-xl bg-cyan-500/10 flex items-center justify-center">
                        <Lock className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
                      </div>
                      <h3 className="mt-4 text-lg font-semibold">
                        {filteredFindings.length - FREE_FINDINGS_PREVIEW} more finding{filteredFindings.length - FREE_FINDINGS_PREVIEW === 1 ? "" : "s"} hidden
                      </h3>
                      <p className="mt-2 text-sm text-muted-foreground max-w-sm">
                        Upgrade to Unlimited to see all risk findings with full details and context.
                      </p>
                      <Button
                        onClick={() => setUpgradeOpen(true)}
                        className="mt-5 bg-cyan-600 hover:bg-cyan-700 text-white"
                      >
                        <Sparkles className="h-4 w-4 mr-2" />
                        Upgrade to Unlimited
                      </Button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12">
                <ShieldCheck className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-1">
                  No findings match your filters
                </h3>
                <p className="text-sm text-muted-foreground">
                  Try adjusting your search or filter criteria
                </p>
              </div>
            )}
          </div>
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
              className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 flex items-center justify-center mb-6"
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring" }}
            >
              <ShieldCheck className="w-10 h-10 text-emerald-500" />
            </motion.div>
            
            <h3 className="text-2xl font-bold mb-2">No findings yet</h3>
            <p className="text-muted-foreground mb-8">
              Upload an RBAC snapshot to scan for security issues and misconfigurations in your Kubernetes permissions.
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

      <UpgradeDialog
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        workspaceId={activeWorkspace?.id || null}
        title="See all risk findings"
        description="Upgrade to Unlimited to view every finding with full details across your clusters."
      />
    </div>
  )
}
