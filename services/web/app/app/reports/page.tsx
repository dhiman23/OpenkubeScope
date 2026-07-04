"use client"

import React, { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import {
  FileText,
  Download,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  Plus,
  Filter,
  Search,
  MoreHorizontal,
  Eye,
  Trash2,
  RefreshCw,
  FileJson,
  FileSpreadsheet,
  File,
  Shield,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  GitCompare,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Suspense } from "react"
import Loading from "@/components/ui/loading"
import { loadReports, deleteReport, generateReport, downloadReport } from "@/lib/report-storage"
import type { Report } from "@/lib/report-storage"
import { getActiveWorkspaceId, getActiveWorkspace } from "@/lib/workspace-manager"
import { loadScansMeta } from "@/lib/scan-storage"
import { useToast } from "@/hooks/use-toast"
import { useSubscription } from "@/hooks/use-subscription"
import { UpgradeDialog } from "@/components/app/upgrade-dialog"
import { Lock, CalendarClock } from "lucide-react"
import {
  createScheduledReport,
  listScheduledReports,
  deleteScheduledReport,
  type ScheduleFrequency,
  type ScheduledReport,
} from "@/lib/scheduled-reports"
import { Switch } from "@/components/ui/switch"

// Report types configuration
const reportTypes = {
  COMPLIANCE: {
    label: "Compliance Report",
    description: "Full compliance audit against security standards",
    icon: Shield,
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
  },
  RISK_ASSESSMENT: {
    label: "Risk Assessment",
    description: "Detailed risk analysis and findings",
    icon: AlertTriangle,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
  },
  RBAC_AUDIT: {
    label: "RBAC Audit",
    description: "Complete RBAC configuration audit",
    icon: FileText,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
  },
  TREND_ANALYSIS: {
    label: "Trend Analysis",
    description: "Historical trend and comparison report",
    icon: TrendingUp,
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
  },
}

const formatTypes = {
  PDF: { icon: File, label: "PDF" },
  JSON: { icon: FileJson, label: "JSON" },
  CSV: { icon: FileSpreadsheet, label: "CSV" },
}

const statusConfig = {
  completed: {
    label: "Completed",
    icon: CheckCircle,
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
  },
  generating: {
    label: "Generating",
    icon: Loader2,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
  },
  failed: {
    label: "Failed",
    icon: XCircle,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
  },
}

// ============================================
// DOWNLOAD HANDLER
// ============================================

// The rendered file lives server-side; stream it from core-api.
async function handleDownloadUngated(workspaceId: string, report: Report) {
  await downloadReport(workspaceId, report.id, report.report_name.replace(/\s+/g, "_"))
}

// ============================================
// REPORT CARD
// ============================================

const ReportCard = React.memo(function ReportCard({
  report,
  index,
  onDelete,
  onRegenerate,
  onDownload,
}: {
  report: Report
  index: number
  onDelete: (id: string) => void
  onRegenerate: (report: Report) => void
  onDownload: (report: Report) => void
}) {
  const reportType = reportTypes[report.report_type as keyof typeof reportTypes]
  const status = statusConfig[report.status as keyof typeof statusConfig]
  const format = formatTypes[report.format as keyof typeof formatTypes]
  if (!reportType || !status || !format) return null

  const TypeIcon = reportType.icon
  const StatusIcon = status.icon
  const FormatIcon = format.icon
  const findings = report.risk_summary

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="group p-4 rounded-xl border border-border/50 bg-card hover:bg-muted/30 hover:border-border transition-all"
    >
      <div className="flex items-start gap-4">
        <div className={`p-3 rounded-xl ${reportType.bgColor}`}>
          <TypeIcon className={`w-5 h-5 ${reportType.color}`} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium text-foreground truncate">
              {report.report_name}
            </h3>
          </div>

          <div className="flex items-center gap-3 text-sm text-muted-foreground mb-3">
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {new Date(report.created_at).toLocaleDateString()}
            </span>
            <span className="flex items-center gap-1">
              <FormatIcon className="w-3 h-3" />
              {format.label}
            </span>
            {report.file_size && <span>{report.file_size}</span>}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={`${status.bgColor} ${status.color} border-0`}>
              <StatusIcon
                className={`w-3 h-3 mr-1 ${
                  report.status === "generating" ? "animate-spin" : ""
                }`}
              />
              {status.label}
            </Badge>
            {report.clusters.map((cluster) => (
              <Badge key={cluster} variant="secondary" className="text-xs">
                {cluster}
              </Badge>
            ))}
          </div>

          {report.status === "completed" && findings && (
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/50">
              <span className="text-xs text-muted-foreground">Findings:</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-500">
                  {findings.critical} critical
                </span>
                <span className="text-xs text-orange-500">
                  {findings.high} high
                </span>
                <span className="text-xs text-amber-500">
                  {findings.medium} medium
                </span>
                <span className="text-xs text-blue-500">
                  {findings.low} low
                </span>
              </div>
            </div>
          )}

          {report.status === "failed" && report.error_message && (
            <div className="mt-3 pt-3 border-t border-border/50">
              <p className="text-xs text-red-500">
                Error: {report.error_message}
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {report.status === "completed" && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onDownload(report)}
            >
              <Download className="w-4 h-4" />
            </Button>
          )}
          {report.status === "failed" && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onRegenerate(report)}
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {report.status === "completed" && (
                <>
                  <DropdownMenuItem onClick={() => onDownload(report)}>
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onClick={() => onRegenerate(report)}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Regenerate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-red-500"
                onClick={() => onDelete(report.id)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </motion.div>
  )
})

// ============================================
// NEW REPORT DIALOG
// ============================================

function NewReportDialog({
  onGenerate,
  onSchedule,
  isPremium,
  onRequestUpgrade,
}: {
  onGenerate: (params: {
    reportType: string
    format: string
    clusters: string[]
    reportName: string
  }) => void
  onSchedule: (params: {
    reportType: string
    format: string
    clusters: string[]
    reportName: string
    frequency: ScheduleFrequency
    slackWebhook: string
  }) => Promise<void>
  isPremium: boolean
  onRequestUpgrade: () => void
}) {
  const [open, setOpen] = useState(false)
  const [reportType, setReportType] = useState<string>("")
  const [format, setFormat] = useState<string>(isPremium ? "PDF" : "CSV")
  const [selectedClusters, setSelectedClusters] = useState<string[]>([])
  const [reportName, setReportName] = useState("")
  const [availableClusters, setAvailableClusters] = useState<string[]>([])
  const [loadingClusters, setLoadingClusters] = useState(true)
  const [scheduleEnabled, setScheduleEnabled] = useState(false)
  const [frequency, setFrequency] = useState<ScheduleFrequency>("weekly")
  const [slackWebhook, setSlackWebhook] = useState("")

  // Load real clusters from scans
  useEffect(() => {
    if (!open) return
    let cancelled = false

    async function loadClusters() {
      setLoadingClusters(true)
      try {
        const workspaceId = await getActiveWorkspaceId()
        if (!workspaceId || cancelled) return

        const scans = await loadScansMeta(workspaceId)
        const clusterNames = [...new Set(scans.map((s) => s.clusterName))]
        if (!cancelled) {
          setAvailableClusters(clusterNames)
        }
      } catch (err) {
        console.error("Failed to load clusters:", err)
      } finally {
        if (!cancelled) setLoadingClusters(false)
      }
    }

    loadClusters()
    return () => { cancelled = true }
  }, [open])

  // Auto-generate report name based on type
  useEffect(() => {
    if (reportType) {
      const typeLabel = reportTypes[reportType as keyof typeof reportTypes]?.label || reportType
      const date = new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
      setReportName(`${typeLabel} - ${date}`)
    }
  }, [reportType])

  const toggleCluster = (cluster: string) => {
    setSelectedClusters((prev) =>
      prev.includes(cluster)
        ? prev.filter((c) => c !== cluster)
        : [...prev, cluster]
    )
  }

  const handleGenerate = async () => {
    if (scheduleEnabled) {
      await onSchedule({
        reportType,
        format,
        clusters: selectedClusters,
        reportName,
        frequency,
        slackWebhook,
      })
    } else {
      onGenerate({ reportType, format, clusters: selectedClusters, reportName })
    }
    setOpen(false)
    setReportType("")
    setFormat("PDF")
    setSelectedClusters([])
    setReportName("")
    setScheduleEnabled(false)
    setFrequency("weekly")
    setSlackWebhook("")
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          Generate Report
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Generate New Report</DialogTitle>
          <DialogDescription>
            Configure and generate a new RBAC audit report
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Report Name */}
          <div className="space-y-2">
            <Label>Report Name</Label>
            <Input
              placeholder="e.g. Q1 Compliance Report"
              value={reportName}
              onChange={(e) => setReportName(e.target.value)}
            />
          </div>

          {/* Report Type */}
          <div className="space-y-2">
            <Label>Report Type</Label>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(reportTypes).map(([key, value]) => {
                const Icon = value.icon
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setReportType(key)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      reportType === key
                        ? `${value.bgColor} border-current ${value.color}`
                        : "border-border/50 hover:bg-muted/30"
                    }`}
                  >
                    <Icon className={`w-5 h-5 mb-2 ${value.color}`} />
                    <p className="text-sm font-medium text-foreground">
                      {value.label}
                    </p>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {value.description}
                    </p>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Output Format */}
          <div className="space-y-2">
            <Label>Output Format</Label>
            <Select
              value={format}
              onValueChange={(val) => {
                if (val === "PDF" && !isPremium) {
                  onRequestUpgrade()
                  return
                }
                setFormat(val)
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(formatTypes).map(([key, value]) => {
                  const Icon = value.icon
                  const isLocked = key === "PDF" && !isPremium
                  return (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4" />
                        {value.label}
                        {isLocked && (
                          <span className="ml-auto inline-flex items-center gap-1 text-xs text-cyan-600 dark:text-cyan-400">
                            <Lock className="w-3 h-3" />
                            Premium
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
            {!isPremium && (
              <p className="text-xs text-muted-foreground">
                PDF exports are available on the Unlimited plan.
              </p>
            )}
          </div>

          {/* Schedule toggle */}
          <div className="space-y-3 p-3 rounded-lg border border-border/50 bg-muted/20">
            <div className="flex items-center justify-between">
              <div>
                <Label className="flex items-center gap-2">
                  <CalendarClock className="w-4 h-4" />
                  Schedule recurring report
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Automatically regenerate this report on a schedule.
                </p>
              </div>
              <Switch
                checked={scheduleEnabled}
                onCheckedChange={setScheduleEnabled}
              />
            </div>
            {scheduleEnabled && (
              <div className="space-y-3 pt-2 border-t border-border/50">
                <div className="space-y-1.5">
                  <Label className="text-xs">Frequency</Label>
                  <Select
                    value={frequency}
                    onValueChange={(val) => setFrequency(val as ScheduleFrequency)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Slack webhook URL (optional)</Label>
                  <Input
                    type="url"
                    placeholder="https://hooks.slack.com/services/..."
                    value={slackWebhook}
                    onChange={(e) => setSlackWebhook(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Notify a channel every time this report runs.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Cluster Selection */}
          <div className="space-y-2">
            <Label>Select Clusters</Label>
            <div className="space-y-2">
              {loadingClusters ? (
                <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading clusters...
                </div>
              ) : availableClusters.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground">
                  No clusters found. Upload a scan first.
                </div>
              ) : (
                availableClusters.map((cluster) => (
                  <div
                    key={cluster}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors"
                  >
                    <Checkbox
                      id={cluster}
                      checked={selectedClusters.includes(cluster)}
                      onCheckedChange={() => toggleCluster(cluster)}
                    />
                    <label
                      htmlFor={cluster}
                      className="flex-1 text-sm font-medium cursor-pointer"
                    >
                      {cluster}
                    </label>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={
              !reportType ||
              selectedClusters.length === 0 ||
              !reportName.trim()
            }
          >
            Generate Report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================
// SCHEDULED REPORTS LIST
// ============================================

function ScheduledReportsList({
  schedules,
  onDelete,
}: {
  schedules: ScheduledReport[]
  onDelete: (id: string) => void
}) {
  if (schedules.length === 0) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-foreground flex items-center gap-2">
          <CalendarClock className="w-5 h-5 text-cyan-500" />
          Scheduled reports
        </h2>
        <span className="text-xs text-muted-foreground">
          {schedules.length} active
        </span>
      </div>
      <div className="space-y-2">
        {schedules.map((s) => {
          const nextRun = new Date(s.next_run_at)
          const last = s.last_run_at ? new Date(s.last_run_at) : null
          return (
            <div
              key={s.id}
              className="p-3 rounded-xl border border-border/50 bg-card flex items-start justify-between gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-sm font-medium text-foreground truncate">
                    {s.name}
                  </h3>
                  <Badge variant="secondary" className="text-[10px] uppercase">
                    {s.frequency}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {s.format}
                  </Badge>
                  {s.slack_webhook_url && (
                    <Badge variant="outline" className="text-[10px]">
                      Slack
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-3">
                  <span>Next run: {nextRun.toLocaleString()}</span>
                  {last && (
                    <span>
                      Last: {last.toLocaleDateString()}{" "}
                      {s.last_run_status === "failed" && (
                        <span className="text-red-500">(failed)</span>
                      )}
                    </span>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onDelete(s.id)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================
// MAIN PAGE
// ============================================

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [workspaceName, setWorkspaceName] = useState("Workspace")
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [scheduledReports, setScheduledReports] = useState<ScheduledReport[]>([])
  const { toast } = useToast()
  const { isPremium } = useSubscription(workspaceId)

  // Load reports from database
  const fetchReports = useCallback(async () => {
    try {
      const wsId = await getActiveWorkspaceId()
      if (!wsId) {
        setLoading(false)
        return
      }
      setWorkspaceId(wsId)

      const ws = await getActiveWorkspace()
      if (ws) setWorkspaceName(ws.name)

      const [data, schedules] = await Promise.all([
        loadReports(wsId),
        listScheduledReports(wsId),
      ])
      setReports(data)
      setScheduledReports(schedules)
    } catch (err) {
      console.error("Failed to load reports:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchReports()
  }, [fetchReports])

  // Poll for generating reports
  useEffect(() => {
    const generatingReports = reports.filter((r) => r.status === "generating")
    if (generatingReports.length === 0) return

    const interval = setInterval(fetchReports, 3000)
    return () => clearInterval(interval)
  }, [reports, fetchReports])

  // Handle generate report
  const handleGenerateReport = useCallback(
    async (params: {
      reportType: string
      format: string
      clusters: string[]
      reportName: string
    }) => {
      if (!workspaceId) return

      try {
        // Generate server-side (create + render + persist in one call).
        await generateReport(workspaceId, {
          report_name: params.reportName,
          report_type: params.reportType as Report["report_type"],
          format: params.format as Report["format"],
          clusters: params.clusters,
        })

        await fetchReports()

        toast({
          title: "Report generated",
          description: `"${params.reportName}" is ready for download.`,
        })
      } catch (err) {
        console.error("Failed to generate report:", err)
        // Refresh to show the failed status from DB
        await fetchReports()
        toast({
          title: "Report generation failed",
          description: err instanceof Error ? err.message : "An unexpected error occurred. Please try again.",
          variant: "destructive",
        })
      }
    },
    [workspaceId, workspaceName, fetchReports, toast]
  )

  // Schedule a recurring report
  const handleScheduleReport = useCallback(
    async (params: {
      reportType: string
      format: string
      clusters: string[]
      reportName: string
      frequency: ScheduleFrequency
      slackWebhook: string
    }) => {
      if (!workspaceId) return
      try {
        await createScheduledReport({
          workspace_id: workspaceId,
          name: params.reportName,
          report_type: params.reportType as Report["report_type"],
          format: params.format as Report["format"],
          clusters: params.clusters,
          frequency: params.frequency,
          slack_webhook_url: params.slackWebhook.trim() || null,
        })
        const schedules = await listScheduledReports(workspaceId)
        setScheduledReports(schedules)
        toast({
          title: "Report scheduled",
          description: `"${params.reportName}" will run ${params.frequency}.`,
        })
      } catch (err) {
        toast({
          title: "Failed to schedule report",
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive",
        })
      }
    },
    [workspaceId, toast]
  )

  const handleDeleteSchedule = useCallback(
    async (id: string) => {
      if (!workspaceId) return
      try {
        await deleteScheduledReport(workspaceId, id)
        setScheduledReports((prev) => prev.filter((s) => s.id !== id))
        toast({ title: "Schedule removed" })
      } catch (err) {
        toast({
          title: "Failed to remove schedule",
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive",
        })
      }
    },
    [workspaceId, toast]
  )

  // Gated download — free users cannot download PDF
  const handleDownload = useCallback(
    (report: Report) => {
      if (report.format === "PDF" && !isPremium) {
        setUpgradeOpen(true)
        toast({
          title: "PDF export is premium",
          description: "Upgrade to Unlimited to download branded PDF reports.",
        })
        return
      }
      if (!workspaceId) return
      handleDownloadUngated(workspaceId, report).catch((err) =>
        toast({
          title: "Download failed",
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive",
        }),
      )
    },
    [isPremium, toast, workspaceId]
  )

  // Handle delete
  const handleDelete = useCallback(
    async (reportId: string) => {
      if (!workspaceId) return
      try {
        await deleteReport(workspaceId, reportId)
        setReports((prev) => prev.filter((r) => r.id !== reportId))
      } catch (err) {
        console.error("Failed to delete report:", err)
      }
    },
    [workspaceId]
  )

  // Handle regenerate
  const handleRegenerate = useCallback(
    async (report: Report) => {
      if (!workspaceId) return
      try {
        await generateReport(workspaceId, {
          report_name: report.report_name,
          report_type: report.report_type,
          format: report.format,
          clusters: report.clusters,
          scan_ids: report.scan_ids,
        })
        await fetchReports()

        toast({
          title: "Report regenerated",
          description: `"${report.report_name}" is ready for download.`,
        })
      } catch (err) {
        console.error("Failed to regenerate report:", err)
        await fetchReports()
        toast({
          title: "Report regeneration failed",
          description: err instanceof Error ? err.message : "An unexpected error occurred.",
          variant: "destructive",
        })
      }
    },
    [workspaceId, workspaceName, fetchReports, toast]
  )

  // Filter reports
  const filteredReports = reports.filter((report) => {
    const matchesSearch = report.report_name
      .toLowerCase()
      .includes(searchQuery.toLowerCase())
    const matchesType =
      typeFilter === "all" || report.report_type === typeFilter
    const matchesStatus =
      statusFilter === "all" || report.status === statusFilter
    return matchesSearch && matchesType && matchesStatus
  })

  // Stats
  const totalReports = reports.length
  const completedReports = reports.filter(
    (r) => r.status === "completed"
  ).length
  const inProgressReports = reports.filter(
    (r) => r.status === "generating"
  ).length

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <Suspense fallback={<Loading />}>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Reports</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Generate and manage RBAC audit reports
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/app/reports/diff">
              <Button variant="outline" className="gap-2">
                <GitCompare className="w-4 h-4" />
                Compare
              </Button>
            </Link>
            <NewReportDialog
              onGenerate={handleGenerateReport}
              onSchedule={handleScheduleReport}
              isPremium={isPremium}
              onRequestUpgrade={() => setUpgradeOpen(true)}
            />
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-4 gap-4">
          <div className="p-4 rounded-xl border border-border/50 bg-card">
            <div className="flex items-center justify-between mb-2">
              <FileText className="w-5 h-5 text-muted-foreground" />
              <span className="text-2xl font-semibold text-foreground">
                {totalReports}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">Total Reports</p>
          </div>
          <div className="p-4 rounded-xl border border-border/50 bg-card">
            <div className="flex items-center justify-between mb-2">
              <CheckCircle className="w-5 h-5 text-emerald-500" />
              <span className="text-2xl font-semibold text-foreground">
                {completedReports}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">Completed</p>
          </div>
          <div className="p-4 rounded-xl border border-border/50 bg-card">
            <div className="flex items-center justify-between mb-2">
              <Loader2 className="w-5 h-5 text-blue-500" />
              <span className="text-2xl font-semibold text-foreground">
                {inProgressReports}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">In Progress</p>
          </div>
          <div className="p-4 rounded-xl border border-border/50 bg-card">
            <div className="flex items-center justify-between mb-2">
              <Clock className="w-5 h-5 text-muted-foreground" />
              <span className="text-2xl font-semibold text-foreground">
                {reports.filter((r) => r.status === "failed").length}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">Failed</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search reports..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px]">
              <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Report Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {Object.entries(reportTypes).map(([key, value]) => (
                <SelectItem key={key} value={key}>
                  {value.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="generating">Generating</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Reports list */}
        <div className="space-y-3">
          {filteredReports.length > 0 ? (
            filteredReports.map((report, index) => (
              <ReportCard
                key={report.id}
                report={report}
                index={index}
                onDelete={handleDelete}
                onRegenerate={handleRegenerate}
                onDownload={handleDownload}
              />
            ))
          ) : (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-1">
                No reports found
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Generate your first report to get started
              </p>
              <NewReportDialog
            onGenerate={handleGenerateReport}
            onSchedule={handleScheduleReport}
            isPremium={isPremium}
            onRequestUpgrade={() => setUpgradeOpen(true)}
          />
            </div>
          )}
        </div>

        <ScheduledReportsList
          schedules={scheduledReports}
          onDelete={handleDeleteSchedule}
        />

        <UpgradeDialog
          open={upgradeOpen}
          onOpenChange={setUpgradeOpen}
          workspaceId={workspaceId}
          title="Unlock premium PDF reports"
          description="Upgrade to Unlimited for branded, watermarked PDF exports and more."
        />
      </div>
    </Suspense>
  )
}
