"use client"

import React, { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import Link from "next/link"
import {
  ArrowLeft,
  ArrowRight,
  GitCompare,
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
  Plus,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { loadReports } from "@/lib/report-storage"
import type { Report } from "@/lib/report-storage"
import type { ReportData } from "@/lib/report-generator"
import { diffReports } from "@/lib/report-diff"
import type { ReportDiff } from "@/lib/report-diff"
import { getActiveWorkspaceId } from "@/lib/workspace-manager"

const severityColor: Record<string, string> = {
  critical: "text-red-500",
  high: "text-orange-500",
  medium: "text-amber-500",
  low: "text-blue-500",
}

const severityBg: Record<string, string> = {
  critical: "bg-red-500/10",
  high: "bg-orange-500/10",
  medium: "bg-amber-500/10",
  low: "bg-blue-500/10",
}

function DeltaBadge({ delta }: { delta: number }) {
  if (delta > 0) {
    return (
      <Badge className="bg-red-500/10 text-red-500 border-0 gap-1">
        <TrendingUp className="w-3 h-3" />
        +{delta}
      </Badge>
    )
  }
  if (delta < 0) {
    return (
      <Badge className="bg-emerald-500/10 text-emerald-500 border-0 gap-1">
        <TrendingDown className="w-3 h-3" />
        {delta}
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <Minus className="w-3 h-3" />
      0
    </Badge>
  )
}

export default function ReportDiffPage() {
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [baseId, setBaseId] = useState<string>("")
  const [targetId, setTargetId] = useState<string>("")

  useEffect(() => {
    async function load() {
      try {
        const wsId = await getActiveWorkspaceId()
        if (!wsId) {
          setLoading(false)
          return
        }
        const data = await loadReports(wsId)
        const completed = data.filter(
          r => r.status === "completed" && r.report_data
        )
        setReports(completed)

        if (completed.length >= 2) {
          setTargetId(completed[0].id)
          setBaseId(completed[1].id)
        } else if (completed.length === 1) {
          setTargetId(completed[0].id)
        }
      } catch (err) {
        console.error("Failed to load reports:", err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const diff = useMemo<ReportDiff | null>(() => {
    if (!baseId || !targetId || baseId === targetId) return null
    const base = reports.find(r => r.id === baseId)
    const target = reports.find(r => r.id === targetId)
    if (!base || !target || !base.report_data || !target.report_data) return null
    return diffReports(
      {
        id: base.id,
        name: base.report_name,
        data: base.report_data as unknown as ReportData,
      },
      {
        id: target.id,
        name: target.report_name,
        data: target.report_data as unknown as ReportData,
      }
    )
  }, [baseId, targetId, reports])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (reports.length < 2) {
    return (
      <div className="p-6 space-y-6">
        <Link href="/app/reports" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Back to Reports
        </Link>
        <div className="text-center py-12">
          <GitCompare className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-1">
            Need at least 2 completed reports to compare
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Generate a second report to start tracking changes over time.
          </p>
          <Link href="/app/reports">
            <Button>Go to Reports</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/app/reports"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-2"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Reports
          </Link>
          <h1 className="text-2xl font-semibold text-foreground">
            Compare Reports
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            See what changed between two RBAC snapshots — added permissions, resolved risks, new threats.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 p-4 rounded-xl border border-border/50 bg-card">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Baseline (older)</label>
          <Select value={baseId} onValueChange={setBaseId}>
            <SelectTrigger>
              <SelectValue placeholder="Select baseline report" />
            </SelectTrigger>
            <SelectContent>
              {reports.map(r => (
                <SelectItem key={r.id} value={r.id}>
                  {r.report_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <ArrowRight className="w-5 h-5 text-muted-foreground mt-5" />
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Current (newer)</label>
          <Select value={targetId} onValueChange={setTargetId}>
            <SelectTrigger>
              <SelectValue placeholder="Select current report" />
            </SelectTrigger>
            <SelectContent>
              {reports.map(r => (
                <SelectItem key={r.id} value={r.id}>
                  {r.report_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {diff && <DiffView diff={diff} />}

      {!diff && baseId && targetId && baseId === targetId && (
        <p className="text-sm text-muted-foreground text-center py-8">
          Select two different reports to compare.
        </p>
      )}
    </div>
  )
}

function DiffView({ diff }: { diff: ReportDiff }) {
  return (
    <div className="space-y-6">
      {/* Risk changes */}
      <div>
        <h2 className="text-lg font-medium text-foreground mb-3">Risk changes</h2>
        <div className="grid grid-cols-4 gap-4">
          {(["critical", "high", "medium", "low"] as const).map(sev => {
            const risk = diff.risks[sev]
            return (
              <div
                key={sev}
                className={`p-4 rounded-xl border border-border/50 ${severityBg[sev]}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs font-medium uppercase ${severityColor[sev]}`}>
                    {sev}
                  </span>
                  <DeltaBadge delta={risk.delta} />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-semibold text-foreground">
                    {risk.after}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    was {risk.before}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Totals */}
      <div>
        <h2 className="text-lg font-medium text-foreground mb-3">RBAC object totals</h2>
        <div className="grid grid-cols-3 gap-4">
          {(["subjects", "roles", "bindings"] as const).map(key => {
            const t = diff.totals[key]
            return (
              <div key={key} className="p-4 rounded-xl border border-border/50 bg-card">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium uppercase text-muted-foreground">
                    {key}
                  </span>
                  <DeltaBadge delta={t.delta} />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-semibold text-foreground">
                    {t.after}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    was {t.before}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Added findings */}
      <div>
        <h2 className="text-lg font-medium text-foreground mb-3 flex items-center gap-2">
          <Plus className="w-5 h-5 text-red-500" />
          New findings ({diff.findings.added.length})
        </h2>
        {diff.findings.added.length === 0 ? (
          <div className="p-4 rounded-xl border border-border/50 bg-card text-sm text-muted-foreground">
            No new findings introduced.
          </div>
        ) : (
          <div className="space-y-2">
            {diff.findings.added.slice(0, 20).map((f, i) => (
              <motion.div
                key={`${f.id}-${i}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="p-3 rounded-xl border border-red-500/20 bg-red-500/5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={`${severityBg[f.severity]} ${severityColor[f.severity]} border-0 uppercase text-[10px]`}>
                        {f.severity}
                      </Badge>
                      <span className="text-sm font-medium text-foreground truncate">
                        {f.title}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {f.subject} · {f.role} · {f.namespace || "cluster-wide"}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
            {diff.findings.added.length > 20 && (
              <p className="text-xs text-muted-foreground text-center pt-2">
                … and {diff.findings.added.length - 20} more
              </p>
            )}
          </div>
        )}
      </div>

      {/* Resolved findings */}
      <div>
        <h2 className="text-lg font-medium text-foreground mb-3 flex items-center gap-2">
          <X className="w-5 h-5 text-emerald-500" />
          Resolved findings ({diff.findings.removed.length})
        </h2>
        {diff.findings.removed.length === 0 ? (
          <div className="p-4 rounded-xl border border-border/50 bg-card text-sm text-muted-foreground">
            No findings were resolved between these reports.
          </div>
        ) : (
          <div className="space-y-2">
            {diff.findings.removed.slice(0, 20).map((f, i) => (
              <motion.div
                key={`${f.id}-${i}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Badge className={`${severityBg[f.severity]} ${severityColor[f.severity]} border-0 uppercase text-[10px]`}>
                    {f.severity}
                  </Badge>
                  <span className="text-sm font-medium text-foreground line-through opacity-70">
                    {f.title}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {f.subject} · {f.role} · {f.namespace || "cluster-wide"}
                </p>
              </motion.div>
            ))}
            {diff.findings.removed.length > 20 && (
              <p className="text-xs text-muted-foreground text-center pt-2">
                … and {diff.findings.removed.length - 20} more
              </p>
            )}
          </div>
        )}
      </div>

      {/* RBAC row changes summary */}
      <div>
        <h2 className="text-lg font-medium text-foreground mb-3">Permission changes</h2>
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 rounded-xl border border-border/50 bg-card">
            <p className="text-xs text-muted-foreground uppercase mb-1">Added</p>
            <p className="text-2xl font-semibold text-red-500">
              +{diff.rbacRows.added.length}
            </p>
          </div>
          <div className="p-4 rounded-xl border border-border/50 bg-card">
            <p className="text-xs text-muted-foreground uppercase mb-1">Removed</p>
            <p className="text-2xl font-semibold text-emerald-500">
              -{diff.rbacRows.removed.length}
            </p>
          </div>
          <div className="p-4 rounded-xl border border-border/50 bg-card">
            <p className="text-xs text-muted-foreground uppercase mb-1">Unchanged</p>
            <p className="text-2xl font-semibold text-muted-foreground">
              {diff.rbacRows.unchanged}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
