"use client"

import { motion } from "framer-motion"
import { MetricCard } from "@/components/app/metric-card"
import { Users, Shield, Link2, AlertTriangle, Clock, ChevronRight, Upload, Sparkles, FileJson, FileArchive, FileText, CheckCircle, XCircle, Loader2, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  type Scan,
  loadScansMeta,
  getWorkspaceMode,
  setActiveScanId,
} from "@/lib/rbac-scanner"
import { getDisplayName, getActiveWorkspace } from "@/lib/workspace-manager"
import { demoMetrics, demoScans, isDemoMode } from "@/lib/demo-data"
import { getTimeAgo, getTotalRisks } from "@/lib/format-utils"
import { loadReports } from "@/lib/report-storage"
import type { Report } from "@/lib/report-storage"
import { UpgradeBanner } from "@/components/app/upgrade-banner"

export default function DashboardPage() {
  const searchParams = useSearchParams()
  const isDemo = searchParams.get('demo') === 'true'
  
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [scans, setScans] = useState<Scan[]>([])
  const [activeScan, setActiveScan] = useState<Scan | null>(null)
  const [workspaceMode, setWorkspaceMode] = useState<"demo" | "real" | null>(null)
  const [recentReports, setRecentReports] = useState<Report[]>([])


  useEffect(() => {
    loadDashboardData()

    // Debounce event-driven refreshes so cascading events (e.g. workspace
    // change + scan update fired together) only trigger one reload.
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const handleWorkspaceChange = () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => loadDashboardData(), 300)
    }
    window.addEventListener("kubescope-workspace-changed", handleWorkspaceChange)
    window.addEventListener("kubescope-scan-updated", handleWorkspaceChange)

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      window.removeEventListener("kubescope-workspace-changed", handleWorkspaceChange)
      window.removeEventListener("kubescope-scan-updated", handleWorkspaceChange)
    }
  }, [isDemo])

  const loadDashboardData = async () => {
    // If demo mode, load demo data
    if (isDemo) {
      setDisplayName("Demo User")
      setWorkspaceMode("demo")
      
      // Convert demo scans to proper format
      const formattedDemoScans = demoScans.map(scan => ({
        id: scan.id,
        fileName: scan.filename,
        clusterName: scan.filename.replace('.json', '').replace(/-rbac$/, ''),
        createdAt: scan.scan_date,
        totals: {
          subjects: scan.subjects_count,
          roles: scan.roles_count,
          bindings: scan.bindings_count,
        },
        riskCounts: {
          critical: demoMetrics.criticalRisks,
          high: demoMetrics.highRisks,
          medium: demoMetrics.mediumRisks,
          low: demoMetrics.lowRisks,
        },
      })) as Scan[]
      
      setScans(formattedDemoScans)
      setActiveScan(formattedDemoScans[0])
      return
    }

    // Regular mode
    const name = await getDisplayName()
    setDisplayName(name)

    // Get active workspace first
    const workspace = await getActiveWorkspace()
    if (!workspace) {
      setScans([])
      setActiveScan(null)
      setWorkspaceMode(null)
      return
    }

    // Load workspace mode and scans (workspace-aware)
    const mode = await getWorkspaceMode()
    setWorkspaceMode(mode)

    // Use metadata-only loader — skips the large scan_data JSONB column
    const savedScans = await loadScansMeta(workspace.id)
    setScans(savedScans)

    // Load recent reports for dashboard display
    try {
      const reports = await loadReports(workspace.id)
      setRecentReports(reports.slice(0, 5))
    } catch (err) {
      console.error("Failed to load reports:", err)
    }

    // Pick active scan from the already-loaded list (no extra DB call)
    if (savedScans.length > 0) {
      setActiveScan(savedScans[0])
      await setActiveScanId(savedScans[0].id)
    } else {
      // Workspace is empty - show empty state
      setActiveScan(null)
    }
  }

  // Memoize metrics - only recompute when activeScan changes
  const metrics = useMemo(() => activeScan ? [
    { title: "Total Subjects", value: activeScan.totals?.subjects || 0, icon: Users, color: "default" as const },
    { title: "Total Roles", value: activeScan.totals?.roles || 0, icon: Shield, color: "success" as const },
    { title: "Total Bindings", value: activeScan.totals?.bindings || 0, icon: Link2, color: "warning" as const },
    { title: "Risk Findings", value: getTotalRisks(activeScan), icon: AlertTriangle, color: "destructive" as const },
  ] : [
    { title: "Total Subjects", value: 0, icon: Users, color: "default" as const },
    { title: "Total Roles", value: 0, icon: Shield, color: "success" as const },
    { title: "Total Bindings", value: 0, icon: Link2, color: "warning" as const },
    { title: "Risk Findings", value: 0, icon: AlertTriangle, color: "destructive" as const },
  ], [activeScan])


  // Memoize risk distribution data - precompute once when activeScan changes
  const riskDistribution = useMemo(() => {
    if (!activeScan) return []
    const total = getTotalRisks(activeScan)
    return [
      {
        label: "Critical",
        count: activeScan.riskCounts?.critical || 0,
        color: "bg-destructive",
        percentage: (activeScan.riskCounts?.critical || 0) > 0
          ? Math.min(100, ((activeScan.riskCounts?.critical || 0) / Math.max(1, total)) * 100 * 3)
          : 0
      },
      {
        label: "High",
        count: activeScan.riskCounts?.high || 0,
        color: "bg-orange-500",
        percentage: (activeScan.riskCounts?.high || 0) > 0
          ? Math.min(100, ((activeScan.riskCounts?.high || 0) / Math.max(1, total)) * 100 * 2)
          : 0
      },
      {
        label: "Medium",
        count: activeScan.riskCounts?.medium || 0,
        color: "bg-warning",
        percentage: (activeScan.riskCounts?.medium || 0) > 0
          ? Math.min(100, ((activeScan.riskCounts?.medium || 0) / Math.max(1, total)) * 100 * 1.5)
          : 0
      },
      {
        label: "Low",
        count: activeScan.riskCounts?.low || 0,
        color: "bg-success",
        percentage: (activeScan.riskCounts?.low || 0) > 0
          ? Math.min(100, ((activeScan.riskCounts?.low || 0) / Math.max(1, total)) * 100)
          : 0
      },
    ]
  }, [activeScan])

  return (
    <div className="space-y-8">
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
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="text-3xl font-bold tracking-tight">
          {displayName ? (
            <>Welcome, {displayName}</>
          ) : (
            "Dashboard"
          )}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {activeScan ? (
            <>Viewing scan: <span className="font-medium text-foreground">{activeScan.fileName}</span></>
          ) : scans.length === 0 ? (
            "This workspace has no scans yet. Upload a snapshot to get started."
          ) : (
            "Overview of your Kubernetes RBAC security posture"
          )}
        </p>
      </motion.div>

      {/* Metrics grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {metrics.map((metric, index) => (
          <MetricCard
            key={metric.title}
            title={metric.title}
            value={metric.value}
            icon={metric.icon}
            color={metric.color}
            delay={index * 0.1}
          />
        ))}
      </div>

      {/* Content grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Risk Overview */}
        <motion.div
          className="lg:col-span-2 glass-card p-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold">Risk Overview</h2>
            <Link href="/app/risk-findings">
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                View All
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
          
          {/* Risk distribution - uses memoized riskDistribution */}
          {activeScan ? (
            <div className="space-y-4">
              {riskDistribution.map((risk, index) => (
                <motion.div
                  key={risk.label}
                  className="space-y-2"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + index * 0.1 }}
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{risk.label}</span>
                    <span className="font-medium">{risk.count} findings</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      className={`h-full ${risk.color} rounded-full`}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.max(risk.count > 0 ? 5 : 0, risk.percentage)}%` }}
                      transition={{ duration: 1, delay: 0.6 + index * 0.1, ease: [0.16, 1, 0.3, 1] }}
                    />
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <motion.div 
                className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-muted/50 to-muted/20 flex items-center justify-center mb-4"
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.5, type: "spring" }}
              >
                <AlertTriangle className="w-7 h-7 text-muted-foreground" />
              </motion.div>
              <p className="font-medium mb-1">No scan data</p>
              <p className="text-sm text-muted-foreground mb-4">Upload a snapshot to see risk overview</p>
              <Link href="/app/clusters?upload=true">
                <Button size="sm" variant="outline" className="rounded-xl bg-transparent">
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Snapshot
                </Button>
              </Link>
            </div>
          )}
        </motion.div>

        {/* Recent Scans */}
        <motion.div
          className="glass-card p-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold">Recent Scans</h2>
            <Link href="/app/clusters">
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                View All
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>

          {scans.length > 0 ? (
            <div className="space-y-4">
              {scans.slice(0, 4).map((scan, index) => (
                <motion.div
                  key={scan.id}
                  className={`flex items-center gap-4 p-3 rounded-xl transition-colors cursor-pointer group ${
                    activeScan?.id === scan.id 
                      ? "bg-primary/10 border border-primary/20" 
                      : "bg-muted/30 hover:bg-muted/50"
                  }`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 + index * 0.1 }}
                  whileHover={{ x: 4 }}
                  onClick={() => {
                    setActiveScan(scan)
                    setActiveScanId(scan.id)
                    // Dispatch custom event to notify components about active scan change
                    window.dispatchEvent(new CustomEvent("kubescope-scan-updated", { detail: { scanId: scan.id } }))
                  }}
                >
                  <div className="p-2 rounded-lg bg-muted">
                    {scan.fileName?.endsWith('.json') ? (
                      <FileJson className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <FileArchive className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{scan.fileName}</p>
                    <p className="text-xs text-muted-foreground">{getTimeAgo(scan.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                      (scan.riskCounts?.critical || 0) > 0
                        ? "bg-destructive/10 text-destructive"
                        : (scan.riskCounts?.high || 0) > 0
                        ? "bg-orange-500/10 text-orange-500"
                        : getTotalRisks(scan) <= 5 
                        ? "bg-success/10 text-success" 
                        : "bg-warning/10 text-warning"
                    }`}>
                      {getTotalRisks(scan)} risks
                    </span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            /* Premium Empty state */
            <div className="text-center py-8">
              <motion.div 
                className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-4"
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.6, type: "spring" }}
              >
                <Sparkles className="w-7 h-7 text-primary" />
              </motion.div>
              <p className="font-medium mb-1">No scans yet</p>
              <p className="text-sm text-muted-foreground mb-4">Upload your first RBAC snapshot</p>
              <Link href="/app/clusters?upload=true">
                <Button size="sm" className="rounded-xl">
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Snapshot
                </Button>
              </Link>
            </div>
          )}
        </motion.div>
      </div>

      {!isDemo && <UpgradeBanner />}

      {/* Recent Reports */}
      {recentReports.length > 0 && (
        <motion.div
          className="glass-card p-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.55 }}
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold">Recent Reports</h2>
            <Link href="/app/reports">
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                View All
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>

          <div className="space-y-3">
            {recentReports.map((report, index) => {
              const statusIcon = report.status === "completed"
                ? CheckCircle
                : report.status === "failed"
                ? XCircle
                : Loader2
              const statusColor = report.status === "completed"
                ? "text-emerald-500"
                : report.status === "failed"
                ? "text-red-500"
                : "text-blue-500"
              const StatusIcon = statusIcon

              return (
                <motion.div
                  key={report.id}
                  className="flex items-center gap-4 p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 + index * 0.08 }}
                >
                  <div className="p-2 rounded-lg bg-muted">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{report.report_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {report.format} &middot; {getTimeAgo(report.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusIcon className={`w-4 h-4 ${statusColor} ${report.status === "generating" ? "animate-spin" : ""}`} />
                    {report.status === "completed" && report.risk_summary && (
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                        report.risk_summary.critical > 0
                          ? "bg-destructive/10 text-destructive"
                          : report.risk_summary.high > 0
                          ? "bg-orange-500/10 text-orange-500"
                          : "bg-success/10 text-success"
                      }`}>
                        {report.risk_summary.critical + report.risk_summary.high + report.risk_summary.medium + report.risk_summary.low} findings
                      </span>
                    )}
                    {report.status === "failed" && (
                      <span className="text-xs font-medium px-2 py-1 rounded-full bg-destructive/10 text-destructive">
                        Failed
                      </span>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </div>
        </motion.div>
      )}

      {/* Active Scan Details */}
      {activeScan && activeScan.id !== "demo-scan" && (
        <motion.div
          className="glass-card p-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Active Scan Details</h2>
            <Link href="/app/rbac-viewer">
              <Button variant="outline" size="sm" className="rounded-xl bg-transparent">
                View RBAC Data
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
          
          <div className="grid md:grid-cols-4 gap-6">
            <div>
              <p className="text-sm text-muted-foreground mb-1">File Name</p>
              <p className="font-medium truncate">{activeScan.fileName}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Cluster</p>
              <p className="font-medium">{activeScan.clusterName}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Scanned</p>
              <p className="font-medium">{getTimeAgo(activeScan.createdAt)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Total Findings</p>
              <p className="font-medium">{getTotalRisks(activeScan)} risks detected</p>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  )
}
