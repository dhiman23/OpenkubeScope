"use client"

import { useEffect, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ChevronDown, ChevronRight, Download, Layers, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import type { RBACFinding } from "@/lib/rbac-scanner"
import { classifyFinding, DOMAIN_BY_ID, type DomainId } from "@/lib/scoring"
import { mitreForFinding } from "@/lib/mitre"
import { downloadFindingsCsv } from "@/lib/export"
import {
  clearFindingStatus,
  loadFindingStatuses,
  setFindingStatus,
  stateOf,
  type FindingState,
  type FindingStatusRecord,
} from "@/lib/finding-status"
import { SeverityBadge, SEVERITY_LABEL, SEVERITY_ORDER, type Severity } from "@/components/posture/severity"
import { FindingCard } from "@/components/analysis/finding-card"
import { CLUSTER_SCOPE, CLUSTER_SCOPE_LABEL, isClusterScoped } from "@/lib/namespaces"
import { useScan } from "@/components/scan/scan-context"

/** Tile ids from the attack-surface grid map onto free-text queries. */
const QUERY_ALIASES: Record<string, string[]> = {
  wildcard: ["wildcard"],
  "cluster-admin": ["cluster-admin"],
  secrets: ["secrets"],
  exec: ["pods/exec", "exec"],
  impersonate: ["impersonate"],
  node: ["node access", "nodes"],
  anonymous: ["anonymous", "unauthenticated"],
  privileged: ["impersonate", "escalate", "wildcard", "cluster-admin"],
}

export default function FindingsPage() {
  const { scan, scanId, workspaceId } = useScan()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [statuses, setStatuses] = useState<Record<string, FindingStatusRecord>>({})
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [groupSimilar, setGroupSimilar] = useState(true)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState(searchParams.get("q") ?? "")

  const severityFilter = searchParams.get("severity") as Severity | null
  const namespaceFilter = searchParams.get("ns")
  const domainFilter = searchParams.get("domain") as DomainId | null
  const statusFilter = (searchParams.get("status") as FindingState | null) ?? "open"

  useEffect(() => {
    setStatuses(loadFindingStatuses(workspaceId, scanId))
  }, [workspaceId, scanId])

  // Keep the URL as the source of truth for the search box (debounced).
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (search.trim()) params.set("q", search.trim())
      else params.delete("q")
      const qs = params.toString()
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false })
    }, 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const all = scan.dataset?.findings ?? []

  const filtered = useMemo(() => {
    const query = (searchParams.get("q") ?? "").toLowerCase().trim()
    const aliases = QUERY_ALIASES[query] ?? (query ? [query] : [])

    return all.filter((finding) => {
      if (severityFilter && finding.severity !== severityFilter) return false

      if (namespaceFilter) {
        const ns = isClusterScoped(finding.namespace) ? CLUSTER_SCOPE : finding.namespace
        if (ns !== namespaceFilter) return false
      }

      if (domainFilter && classifyFinding(finding) !== domainFilter) return false

      if (statusFilter && stateOf(statuses, finding.id) !== statusFilter) return false

      if (aliases.length > 0) {
        const haystack = [
          finding.title,
          finding.description,
          finding.role,
          finding.namespace,
          ...(finding.affectedResources ?? []),
          ...mitreForFinding(finding).map((m) => `${m.techniqueId} ${m.technique} ${m.tactic}`),
        ]
          .join(" ")
          .toLowerCase()
        if (!aliases.some((alias) => haystack.includes(alias))) return false
      }

      return true
    })
  }, [all, severityFilter, namespaceFilter, domainFilter, statusFilter, statuses, searchParams])

  /**
   * A cluster with 34 wildcard roles produces 34 near-identical findings.
   * Grouping collapses them into one row with a count — the difference between
   * 287 rows and ~40 real problems.
   */
  const groups = useMemo(() => {
    if (!groupSimilar) {
      return filtered.map((finding) => ({ key: finding.id, title: finding.title, findings: [finding] }))
    }
    const map = new Map<string, { key: string; title: string; findings: RBACFinding[] }>()
    for (const finding of filtered) {
      // The engine emits "<Rule name>: <role>" — the prefix is the rule.
      const key = `${finding.severity}|${(finding.title || "").split(":")[0].trim()}`
      const existing = map.get(key)
      if (existing) existing.findings.push(finding)
      else map.set(key, { key, title: (finding.title || "").split(":")[0].trim(), findings: [finding] })
    }
    return Array.from(map.values())
  }, [filtered, groupSimilar])

  const counts = useMemo(() => {
    const open = all.filter((f) => stateOf(statuses, f.id) === "open")
    return {
      all: open.length,
      critical: open.filter((f) => f.severity === "critical").length,
      high: open.filter((f) => f.severity === "high").length,
      medium: open.filter((f) => f.severity === "medium").length,
      low: open.filter((f) => f.severity === "low").length,
      resolved: all.filter((f) => stateOf(statuses, f.id) === "resolved").length,
      suppressed: all.filter((f) => stateOf(statuses, f.id) === "suppressed").length,
    }
  }, [all, statuses])

  const setParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    const qs = params.toString()
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false })
  }

  const updateStatus = (findingId: string, state: FindingState, opts?: { reason?: string; expiresAt?: string | null }) => {
    if (state === "open") clearFindingStatus(workspaceId, scanId, findingId)
    else setFindingStatus(workspaceId, scanId, findingId, state, opts)
    setStatuses(loadFindingStatuses(workspaceId, scanId))
  }

  const namespaces = useMemo(() => {
    const set = new Set<string>()
    for (const finding of all) {
      set.add(isClusterScoped(finding.namespace) ? CLUSTER_SCOPE : finding.namespace)
    }
    return Array.from(set).sort()
  }, [all])

  const domains = useMemo(() => {
    const set = new Set<DomainId>()
    for (const finding of all) set.add(classifyFinding(finding))
    return Array.from(set)
  }, [all])

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Risk findings</h1>
          <p className="mt-1 text-sm text-muted-foreground tabular">
            {counts.all} open · Critical {counts.critical} · High {counts.high}
            {counts.suppressed > 0 && ` · ${counts.suppressed} suppressed`}
          </p>
        </div>
        <Button
          variant="outline"
          className="rounded-xl bg-transparent"
          onClick={() => downloadFindingsCsv(scan, filtered)}
        >
          <Download className="w-4 h-4 mr-2" />
          Export {filtered.length}
        </Button>
      </div>

      {/* Severity tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        <FilterTab active={!severityFilter} onClick={() => setParam("severity", null)} label="All" count={counts.all} />
        {SEVERITY_ORDER.map((severity) => (
          <FilterTab
            key={severity}
            active={severityFilter === severity}
            onClick={() => setParam("severity", severity)}
            label={SEVERITY_LABEL[severity]}
            count={counts[severity]}
          />
        ))}
        <span className="w-px h-6 bg-border mx-1" />
        <FilterTab
          active={statusFilter === "open"}
          onClick={() => setParam("status", "open")}
          label="Open"
          count={counts.all}
        />
        <FilterTab
          active={statusFilter === "resolved"}
          onClick={() => setParam("status", "resolved")}
          label="Resolved"
          count={counts.resolved}
        />
        <FilterTab
          active={statusFilter === "suppressed"}
          onClick={() => setParam("status", "suppressed")}
          label="Suppressed"
          count={counts.suppressed}
        />
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search findings, roles, resources, MITRE…"
            className="pl-9 h-9 rounded-xl"
          />
        </div>

        <select
          value={namespaceFilter ?? ""}
          onChange={(e) => setParam("ns", e.target.value || null)}
          className="h-9 rounded-xl border border-border bg-background px-3 text-sm"
        >
          <option value="">All namespaces</option>
          {namespaces.map((ns) => (
            <option key={ns} value={ns}>
              {ns === CLUSTER_SCOPE ? `${CLUSTER_SCOPE_LABEL} (cluster-scoped)` : ns}
            </option>
          ))}
        </select>

        <select
          value={domainFilter ?? ""}
          onChange={(e) => setParam("domain", e.target.value || null)}
          className="h-9 rounded-xl border border-border bg-background px-3 text-sm"
        >
          <option value="">All domains</option>
          {domains.map((domain) => (
            <option key={domain} value={domain}>
              {DOMAIN_BY_ID[domain].label}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          <Switch id="group-similar" checked={groupSimilar} onCheckedChange={setGroupSimilar} />
          <Label htmlFor="group-similar" className="text-sm text-muted-foreground cursor-pointer">
            Group similar
          </Label>
        </div>
      </div>

      {/* What is actually being applied, in one line, with a way out. */}
      <ActiveFilters
        severity={severityFilter}
        namespace={namespaceFilter}
        domain={domainFilter}
        status={statusFilter}
        query={searchParams.get("q")}
        grouped={groupSimilar}
        shown={filtered.length}
        total={all.length}
        onClear={() => {
          setSearch("")
          router.replace(pathname, { scroll: false })
        }}
        onRemove={(key) => {
          if (key === "q") setSearch("")
          setParam(key, key === "status" ? "open" : null)
        }}
      />

      {filtered.length === 0 ? (
        <div className="data-card p-10 text-center">
          <p className="font-medium">No findings match these filters</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {all.length === 0
              ? "This snapshot produced no findings."
              : `${all.length} findings exist in this snapshot — try clearing a filter.`}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map((group) => {
            if (group.findings.length === 1) {
              const finding = group.findings[0]
              return (
                <FindingCard
                  key={finding.id}
                  finding={finding}
                  scanId={scanId}
                  state={stateOf(statuses, finding.id)}
                  reason={statuses[finding.id]?.reason}
                  expanded={expandedId === finding.id}
                  onToggle={() => setExpandedId(expandedId === finding.id ? null : finding.id)}
                  onSetState={(state, opts) => updateStatus(finding.id, state, opts)}
                />
              )
            }

            const open = expandedGroups.has(group.key)
            return (
              <div key={group.key} className="data-card overflow-hidden">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() =>
                    setExpandedGroups((prev) => {
                      const next = new Set(prev)
                      if (next.has(group.key)) next.delete(group.key)
                      else next.add(group.key)
                      return next
                    })
                  }
                  className="w-full flex items-center gap-3 p-4 text-left cursor-pointer hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset transition-colors"
                >
                  <Layers className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      {/* Severity is on the row itself, not buried in small print. */}
                      <SeverityBadge severity={group.findings[0].severity} />
                      <span className="font-medium">{group.title}</span>
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {groupScopeLabel(group.findings)}
                    </span>
                  </span>
                  {/* "Show 18" alone never said 18 of what. */}
                  <span className="shrink-0 text-sm text-muted-foreground">
                    {open ? "Hide" : "Show"} {group.findings.length} affected{" "}
                    {group.findings.length === 1 ? "role" : "roles"}
                  </span>
                  {open ? (
                    <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  )}
                </button>

                {open && (
                  <div className="border-t border-border p-2 space-y-2 bg-muted/20">
                    {group.findings.map((finding) => (
                      <FindingCard
                        key={finding.id}
                        finding={finding}
                        scanId={scanId}
                        state={stateOf(statuses, finding.id)}
                        reason={statuses[finding.id]?.reason}
                        expanded={expandedId === finding.id}
                        onToggle={() => setExpandedId(expandedId === finding.id ? null : finding.id)}
                        onSetState={(state, opts) => updateStatus(finding.id, state, opts)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Where a grouped rule lands, using the shared scope vocabulary. */
function groupScopeLabel(findings: RBACFinding[]): string {
  const namespaces = new Set<string>()
  let clusterScoped = false
  for (const finding of findings) {
    if (isClusterScoped(finding.namespace)) clusterScoped = true
    else namespaces.add(finding.namespace)
  }

  const parts: string[] = []
  if (clusterScoped) parts.push(CLUSTER_SCOPE_LABEL)
  parts.push(...[...namespaces].sort().slice(0, 3))

  const remaining = namespaces.size - Math.min(3, namespaces.size)
  const scope = parts.length > 0 ? parts.join(", ") : "scope not recorded"
  return remaining > 0 ? `${scope} +${remaining} more` : scope
}

/**
 * The active-filter summary.
 *
 * Filters lived in three separate controls with no single statement of what
 * was applied, so a user who had narrowed to one namespace days earlier read
 * the shrunken list as "we found almost nothing". This line always says what
 * is being applied and offers one click out of all of it.
 */
function ActiveFilters({
  severity,
  namespace,
  domain,
  status,
  query,
  grouped,
  shown,
  total,
  onClear,
  onRemove,
}: {
  severity: Severity | null
  namespace: string | null
  domain: DomainId | null
  status: FindingState
  query: string | null
  grouped: boolean
  shown: number
  total: number
  onClear: () => void
  onRemove: (key: string) => void
}) {
  const chips: { key: string; label: string; removable: boolean }[] = [
    {
      key: "status",
      label: status === "open" ? "Open" : status === "resolved" ? "Resolved" : "Suppressed",
      removable: status !== "open",
    },
    {
      key: "severity",
      label: severity ? SEVERITY_LABEL[severity] : "All severities",
      removable: Boolean(severity),
    },
    {
      key: "ns",
      label: namespace
        ? namespace === CLUSTER_SCOPE
          ? CLUSTER_SCOPE_LABEL
          : namespace
        : "All namespaces",
      removable: Boolean(namespace),
    },
    {
      key: "domain",
      label: domain ? DOMAIN_BY_ID[domain].label : "All domains",
      removable: Boolean(domain),
    },
  ]

  if (query) chips.push({ key: "q", label: `Search: ${query}`, removable: true })
  chips.push({ key: "grouped", label: grouped ? "Grouped" : "Ungrouped", removable: false })

  const hasActive = chips.some((chip) => chip.removable)

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Showing</span>

      {chips.map((chip, index) => (
        <span key={chip.key} className="flex items-center gap-2">
          {index > 0 && <span className="text-muted-foreground/60" aria-hidden="true">·</span>}
          {chip.removable ? (
            <button
              type="button"
              onClick={() => onRemove(chip.key)}
              aria-label={`Remove filter: ${chip.label}`}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
            >
              {chip.label}
              <X className="w-3 h-3" aria-hidden="true" />
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">{chip.label}</span>
          )}
        </span>
      ))}

      <span className="ml-auto flex items-center gap-3">
        <span className="tabular text-xs text-muted-foreground">
          {shown} of {total} findings
        </span>
        {hasActive && (
          <button
            type="button"
            onClick={onClear}
            className="rounded text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Clear filters
          </button>
        )}
      </span>
    </div>
  )
}

function FilterTab({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  label: string
  count: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "px-3 py-1.5 rounded-xl text-sm font-medium transition-colors cursor-pointer",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-primary text-primary-foreground" : "bg-muted/50 text-foreground/80 hover:bg-muted",
      )}
    >
      {label}
      <span className="ml-1.5 tabular opacity-70">{count}</span>
    </button>
  )
}
