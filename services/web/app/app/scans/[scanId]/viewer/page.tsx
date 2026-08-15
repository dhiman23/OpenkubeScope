"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ChevronDown, ChevronRight, Download, Search, Settings2, User, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useScan } from "@/components/scan/scan-context"
import { CLUSTER_SCOPE, CLUSTER_SCOPE_LABEL, isClusterScoped, namespaceStats } from "@/lib/namespaces"
import { RiskGlyph } from "@/components/posture/severity"
import { downloadCsv } from "@/lib/export"
import {
  ACCESS_LABEL,
  accessRank,
  describeResources,
  describeVerbs,
  describeApiGroups,
  groupVerbs,
  isSensitiveResource,
  resolveEffectiveAccess,
  resourceMeaning,
  roleAccessLevel,
  roleResources,
  scopeLabel,
  verbsToAccessLevel,
  type AccessLevel,
  type EffectiveAccess,
} from "@/lib/permissions"

type Tab = "subjects" | "roles" | "bindings"

const KIND_ICON: Record<string, typeof User> = {
  User,
  Group: Users,
  ServiceAccount: Settings2,
}

const ACCESS_STYLE: Record<AccessLevel, string> = {
  admin: "bg-sev-critical-bg text-sev-critical",
  write: "bg-sev-high-bg text-sev-high",
  read: "bg-sev-low-bg text-sev-low",
  none: "bg-muted text-muted-foreground",
}

const PAGE_SIZE = 100

export default function RbacViewerPage() {
  const { scan, scanId } = useScan()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const tab = (searchParams.get("tab") as Tab | null) ?? "subjects"
  const kindFilter = searchParams.get("kind")
  const namespaceFilter = searchParams.get("ns")
  const accessFilter = searchParams.get("access") as AccessLevel | null
  const query = searchParams.get("q") ?? ""

  const [search, setSearch] = useState(query)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [visible, setVisible] = useState(PAGE_SIZE)

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

  useEffect(() => setVisible(PAGE_SIZE), [tab, kindFilter, namespaceFilter, accessFilter, query])

  const setParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    const qs = params.toString()
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false })
  }

  const dataset = scan.dataset
  const findings = dataset?.findings ?? []

  const effective = useMemo(
    () => resolveEffectiveAccess(dataset?.subjects ?? [], dataset?.roles ?? [], dataset?.bindings ?? []),
    [dataset],
  )

  const findingsByRole = useMemo(() => {
    const map = new Map<string, typeof findings>()
    for (const finding of findings) {
      const list = map.get(finding.role)
      if (list) list.push(finding)
      else map.set(finding.role, [finding])
    }
    return map
  }, [findings])

  const subjectRows = useMemo(() => {
    const q = query.toLowerCase().trim()
    return Array.from(effective.values())
      .filter((row) => {
        if (kindFilter && row.subject.kind !== kindFilter) return false
        if (namespaceFilter) {
          const inNamespace =
            row.subject.namespace === namespaceFilter ||
            row.namespaces.includes(namespaceFilter) ||
            (namespaceFilter === CLUSTER_SCOPE && row.clusterScopedGrants > 0)
          if (!inNamespace) return false
        }
        if (accessFilter && row.accessLevel !== accessFilter) return false
        if (q && !`${row.subject.name} ${row.subject.kind} ${row.subject.namespace ?? ""}`.toLowerCase().includes(q))
          return false
        return true
      })
      .sort((a, b) => accessRank(b.accessLevel) - accessRank(a.accessLevel) || a.subject.name.localeCompare(b.subject.name))
  }, [effective, kindFilter, namespaceFilter, accessFilter, query])

  const roleRows = useMemo(() => {
    const q = query.toLowerCase().trim()
    return (dataset?.roles ?? [])
      .filter((role) => {
        if (kindFilter && role.kind !== kindFilter) return false
        if (namespaceFilter) {
          const ns = isClusterScoped(role.namespace) ? CLUSTER_SCOPE : role.namespace!
          if (ns !== namespaceFilter) return false
        }
        if (accessFilter && roleAccessLevel(role) !== accessFilter) return false
        if (q && !`${role.name} ${role.namespace ?? ""}`.toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => accessRank(roleAccessLevel(b)) - accessRank(roleAccessLevel(a)) || a.name.localeCompare(b.name))
  }, [dataset?.roles, kindFilter, namespaceFilter, accessFilter, query])

  const bindingRows = useMemo(() => {
    const q = query.toLowerCase().trim()
    return (dataset?.bindings ?? [])
      .filter((binding) => {
        if (kindFilter && binding.kind !== kindFilter) return false
        if (namespaceFilter) {
          const ns = isClusterScoped(binding.namespace) ? CLUSTER_SCOPE : binding.namespace!
          if (ns !== namespaceFilter) return false
        }
        if (q && !`${binding.name} ${binding.roleRef?.name ?? ""} ${binding.namespace ?? ""}`.toLowerCase().includes(q))
          return false
        return true
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [dataset?.bindings, kindFilter, namespaceFilter, query])

  // One source of truth for what counts as a namespace: a snapshot that
  // serialises an absent namespace as the string "null" must not produce a
  // filter option called "null".
  const namespaces = useMemo(() => [CLUSTER_SCOPE, ...namespaceStats(dataset).namespaces], [dataset])

  const total = tab === "subjects" ? subjectRows.length : tab === "roles" ? roleRows.length : bindingRows.length

  const kindOptions =
    tab === "subjects"
      ? ["User", "Group", "ServiceAccount"]
      : tab === "roles"
        ? ["Role", "ClusterRole"]
        : ["RoleBinding", "ClusterRoleBinding"]

  const exportRows = () => {
    if (tab === "subjects") {
      downloadCsv(
        subjectRows.map((row) => ({
          subject: row.subject.name,
          kind: row.subject.kind,
          namespace: row.subject.namespace ?? "cluster-wide",
          accessLevel: ACCESS_LABEL[row.accessLevel],
          resources: row.resources.join(" "),
          verbs: row.verbs.join(" "),
          bindings: row.chain.length,
          clusterScopedGrants: row.clusterScopedGrants,
        })),
        "rbac-subjects.csv",
      )
    } else if (tab === "roles") {
      downloadCsv(
        roleRows.map((role) => ({
          role: role.name,
          kind: role.kind,
          namespace: role.namespace ?? "cluster-wide",
          accessLevel: ACCESS_LABEL[roleAccessLevel(role)],
          resources: roleResources(role).join(" "),
          rules: (role.rules ?? []).length,
        })),
        "rbac-roles.csv",
      )
    } else {
      downloadCsv(
        bindingRows.map((binding) => ({
          binding: binding.name,
          kind: binding.kind,
          namespace: binding.namespace ?? "cluster-wide",
          role: binding.roleRef?.name ?? "",
          roleKind: binding.roleRef?.kind ?? "",
          subjects: (binding.subjects ?? []).length,
        })),
        "rbac-bindings.csv",
      )
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">RBAC viewer</h1>
          <p className="mt-1 text-sm text-muted-foreground tabular">
            Showing {Math.min(visible, total)} of {total}
          </p>
        </div>
        <Button variant="outline" className="rounded-xl bg-transparent" onClick={exportRows}>
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Entity tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {(
          [
            ["subjects", "Subjects", effective.size],
            ["roles", "Roles", (dataset?.roles ?? []).length],
            ["bindings", "Bindings", (dataset?.bindings ?? []).length],
          ] as const
        ).map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString())
              params.set("tab", value)
              params.delete("kind")
              params.delete("access")
              router.replace(`${pathname}?${params.toString()}`, { scroll: false })
            }}
            aria-pressed={tab === value}
            className={cn(
              "px-3 py-1.5 rounded-xl text-sm font-medium transition-colors cursor-pointer",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tab === value ? "bg-primary text-primary-foreground" : "bg-muted/50 text-foreground/80 hover:bg-muted",
            )}
          >
            {label}
            <span className="ml-1.5 tabular opacity-70">{count}</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name…"
            className="pl-9 h-9 rounded-xl"
          />
        </div>

        <select
          value={kindFilter ?? ""}
          onChange={(e) => setParam("kind", e.target.value || null)}
          className="h-9 rounded-xl border border-border bg-background px-3 text-sm"
        >
          <option value="">All kinds</option>
          {kindOptions.map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </select>

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

        {tab !== "bindings" && (
          <select
            value={accessFilter ?? ""}
            onChange={(e) => setParam("access", e.target.value || null)}
            className="h-9 rounded-xl border border-border bg-background px-3 text-sm"
          >
            <option value="">Any access</option>
            <option value="admin">Admin</option>
            <option value="write">Write</option>
            <option value="read">Read</option>
          </select>
        )}
      </div>

      {total === 0 ? (
        <div className="data-card p-10 text-center">
          <p className="font-medium">Nothing matches these filters</p>
          <p className="mt-1 text-sm text-muted-foreground">Try clearing the search or a filter.</p>
        </div>
      ) : (
        <div className="data-card overflow-hidden">
          {tab === "subjects" && (
            <SubjectTable
              rows={subjectRows.slice(0, visible)}
              expanded={expanded}
              onToggle={(key) => setExpanded(expanded === key ? null : key)}
              scanId={scanId}
              findingsByRole={findingsByRole}
            />
          )}
          {tab === "roles" && (
            <RoleTable
              rows={roleRows.slice(0, visible)}
              expanded={expanded}
              onToggle={(key) => setExpanded(expanded === key ? null : key)}
              scanId={scanId}
              findingsByRole={findingsByRole}
            />
          )}
          {tab === "bindings" && <BindingTable rows={bindingRows.slice(0, visible)} scanId={scanId} />}

          {visible < total && (
            <div className="p-4 border-t border-border text-center">
              {/* Rows render in pages rather than all at once: a 3,400-row table
                  rendered in one pass is a guaranteed jank source. */}
              <Button variant="outline" className="rounded-xl bg-transparent" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
                Show {Math.min(PAGE_SIZE, total - visible)} more
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function HeaderRow({ columns }: { columns: string[] }) {
  return (
    <div className="grid grid-cols-[1.6fr_1fr_0.7fr_1.2fr_0.7fr_0.9fr] gap-3 px-4 py-2.5 bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
      {columns.map((column) => (
        <span key={column}>{column}</span>
      ))}
    </div>
  )
}

function AccessPill({ level }: { level: AccessLevel }) {
  return (
    <span className={cn("inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold", ACCESS_STYLE[level])}>
      {ACCESS_LABEL[level]}
    </span>
  )
}

function riskLevelFor(level: AccessLevel, wildcard: boolean): 0 | 1 | 2 | 3 | 4 {
  if (level === "admin" || wildcard) return 4
  if (level === "write") return 3
  if (level === "read") return 2
  return 1
}

/**
 * A collapsible section inside an expanded row.
 *
 * Expanding one subject used to dump effective permissions, the full grant
 * chain, every linked finding and the raw RBAC into the page at once, so the
 * first row pushed every other subject below the fold. Each block is now its
 * own disclosure with a count in the header: the summary is readable at a
 * glance, and the reader opens only the part they came for.
 */
function Disclosure({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string
  count?: number | string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className="rounded-xl border border-border bg-background">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium cursor-pointer hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
      >
        <ChevronRight
          className={cn("w-3.5 h-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
          aria-hidden="true"
        />
        <span className="flex-1">{title}</span>
        {count !== undefined && <span className="tabular text-xs text-muted-foreground">{count}</span>}
      </button>
      {open && <div className="border-t border-border px-3 py-3">{children}</div>}
    </section>
  )
}

/** Full value on hover and focus, for names the grid has to truncate. */
function Truncated({ value, className }: { value: string; className?: string }) {
  return (
    <span className={cn("block truncate", className)} title={value} tabIndex={0}>
      {value}
    </span>
  )
}

function SubjectTable({
  rows,
  expanded,
  onToggle,
  scanId,
  findingsByRole,
}: {
  rows: EffectiveAccess[]
  expanded: string | null
  onToggle: (key: string) => void
  scanId: string
  findingsByRole: Map<string, { id: string; title: string; severity: string }[]>
}) {
  return (
    <div>
      <HeaderRow columns={["Subject", "Namespace", "Access", "Resources", "Risk", "Inherited"]} />
      <div className="divide-y divide-border">
        {rows.map((row) => {
          const Icon = KIND_ICON[row.subject.kind] ?? User
          const isOpen = expanded === row.key
          const relatedFindings = row.chain.flatMap((link) => findingsByRole.get(link.roleName) ?? [])

          return (
            <div key={row.key}>
              {/* The whole row is the control — nested links stop propagation. */}
              <button
                type="button"
                onClick={() => onToggle(row.key)}
                aria-expanded={isOpen}
                className="w-full grid grid-cols-[1.6fr_1fr_0.7fr_1.2fr_0.7fr_0.9fr] gap-3 px-4 py-3 items-center text-left hover:bg-muted/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <ChevronDown
                    className={cn("w-3.5 h-3.5 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")}
                  />
                  <Icon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <Truncated value={row.subject.name} className="font-medium" />
                    <span className="block text-xs text-muted-foreground">{row.subject.kind}</span>
                  </span>
                </span>

                <span className="text-sm text-muted-foreground truncate">
                  {scopeLabel(row.subject.namespace ?? row.namespaces[0])}
                </span>

                <span>
                  <AccessPill level={row.accessLevel} />
                </span>

                <span className="text-sm text-muted-foreground truncate" title={row.resources.join(", ")}>
                  {describeResources(row.resources)}
                </span>

                <span>
                  <RiskGlyph level={riskLevelFor(row.accessLevel, row.wildcard)} />
                </span>

                <span
                  className="text-sm text-muted-foreground truncate"
                  title={
                    row.chain.length > 0
                      ? `Inherited through: ${row.chain
                          .map((link) => `${link.bindingKind} ${link.bindingName} → ${link.roleKind} ${link.roleName}`)
                          .join("; ")}`
                      : "No bindings grant this subject any access in this snapshot"
                  }
                >
                  {row.clusterScopedGrants > 0
                    ? `via ${row.clusterScopedGrants} cluster grant${row.clusterScopedGrants === 1 ? "" : "s"}`
                    : row.chain.length > 0
                      ? `via ${row.chain.length} binding${row.chain.length === 1 ? "" : "s"}`
                      : "not bound"}
                </span>
              </button>

              {isOpen && (
                <div className="space-y-2 bg-muted/20 px-4 pb-4 pt-3">
                  {/* Compact summary first — the answer to "what is this?" in one line. */}
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{ACCESS_LABEL[row.accessLevel]}</span> access to{" "}
                    {row.resources.length} resource type{row.resources.length === 1 ? "" : "s"} through{" "}
                    {row.chain.length} binding{row.chain.length === 1 ? "" : "s"}
                    {row.clusterScopedGrants > 0 && ` (${row.clusterScopedGrants} cluster-wide)`}
                    {relatedFindings.length > 0 && ` · ${relatedFindings.length} linked finding${relatedFindings.length === 1 ? "" : "s"}`}
                    .
                  </p>

                  <Disclosure title="Effective permissions" defaultOpen>
                    <EffectivePermissions row={row} />
                  </Disclosure>

                  <Disclosure title="Grant chain" count={row.chain.length}>
                    {row.chain.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        This subject appears in the snapshot but is not bound to any role.
                      </p>
                    ) : (
                      <ul className="space-y-1 text-sm">
                        {row.chain.map((link, index) => (
                          <li key={`${link.bindingName}-${index}`} className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium">{row.subject.name}</span>
                            <span className="text-muted-foreground" aria-hidden="true">→</span>
                            <code
                              className="rounded border border-border bg-background px-1.5 py-0.5 text-xs"
                              title={`${link.bindingKind} ${link.bindingName}`}
                            >
                              {link.bindingKind} {link.bindingName}
                            </code>
                            <span className="text-muted-foreground" aria-hidden="true">→</span>
                            <code
                              className="rounded border border-border bg-background px-1.5 py-0.5 text-xs"
                              title={`${link.roleKind} ${link.roleName}`}
                            >
                              {link.roleKind} {link.roleName}
                            </code>
                            {!link.role && (
                              <span className="text-xs text-sev-medium">unresolved — role not in snapshot</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Disclosure>

                  <Disclosure title="Linked findings" count={relatedFindings.length}>
                    {relatedFindings.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No findings reference this subject&apos;s roles.</p>
                    ) : (
                      <ul className="space-y-1">
                        {relatedFindings.slice(0, 10).map((finding) => (
                          <li key={finding.id}>
                            <Link
                              href={`/app/scans/${scanId}/findings/${finding.id}`}
                              className="rounded text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {finding.title}
                            </Link>
                          </li>
                        ))}
                        {relatedFindings.length > 10 && (
                          <li className="text-xs text-muted-foreground">
                            +{relatedFindings.length - 10} more — open the findings list to see them all.
                          </li>
                        )}
                      </ul>
                    )}
                  </Disclosure>

                  <Disclosure title="Raw RBAC">
                    <pre className="overflow-x-auto rounded-lg border border-border bg-background p-3 text-xs">
                      {JSON.stringify(
                        {
                          subject: row.subject,
                          resources: row.resources,
                          verbs: row.verbs,
                          bindings: row.chain.map((link) => ({
                            binding: `${link.bindingKind}/${link.bindingName}`,
                            role: `${link.roleKind}/${link.roleName}`,
                          })),
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </Disclosure>

                  <div className="flex gap-2 pt-1">
                    <Link href={`/app/scans/${scanId}/map?focus=${encodeURIComponent(`subject:${row.key}`)}`}>
                      <Button variant="outline" size="sm" className="rounded-xl bg-transparent">
                        Open in Map
                      </Button>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function EffectivePermissions({ row }: { row: EffectiveAccess }) {
  const grouped = groupVerbs(row.verbs)
  const sensitive = row.resources.filter(isSensitiveResource)

  return (
    <div>
      <div className="space-y-1.5 text-sm">
        {(["read", "write", "admin"] as const).map((level) => (
          <div key={level} className="flex gap-3">
            <span className="w-16 shrink-0">
              <AccessPill level={level} />
            </span>
            <span className="text-muted-foreground min-w-0">
              {grouped[level].length > 0 ? grouped[level].join(", ") : "—"}
            </span>
          </div>
        ))}
      </div>

      {sensitive.length > 0 && (
        <div className="mt-3 space-y-1">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Dangerous resources</p>
          {sensitive.map((resource) => (
            <p key={resource} className="text-xs text-sev-high flex items-start gap-1.5">
              <span aria-hidden>⚠</span>
              <span>
                <code className="bg-background border border-border px-1 py-0.5 rounded">
                  {resource === "*" ? "All resources" : resource}
                </code>{" "}
                — {resourceMeaning(resource)}
              </span>
            </p>
          ))}
        </div>
      )}

    </div>
  )
}

function RoleTable({
  rows,
  expanded,
  onToggle,
  scanId,
  findingsByRole,
}: {
  rows: { name: string; kind: string; namespace?: string; rules: { apiGroups: string[]; resources: string[]; verbs: string[] }[] }[]
  expanded: string | null
  onToggle: (key: string) => void
  scanId: string
  findingsByRole: Map<string, { id: string; title: string; severity: string }[]>
}) {
  return (
    <div>
      <HeaderRow columns={["Role", "Namespace", "Access", "Resources", "Risk", "Rules"]} />
      <div className="divide-y divide-border">
        {rows.map((role) => {
          const key = `${role.kind}/${role.namespace ?? "-"}/${role.name}`
          const isOpen = expanded === key
          const level = roleAccessLevel(role as never)
          const resources = roleResources(role as never)
          const related = findingsByRole.get(role.name) ?? []

          return (
            <div key={key}>
              <button
                type="button"
                onClick={() => onToggle(key)}
                aria-expanded={isOpen}
                className="w-full grid grid-cols-[1.6fr_1fr_0.7fr_1.2fr_0.7fr_0.9fr] gap-3 px-4 py-3 items-center text-left hover:bg-muted/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <ChevronDown
                    className={cn("w-3.5 h-3.5 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")}
                  />
                  <span className="min-w-0">
                    <Truncated value={role.name} className="font-medium" />
                    <span className="block text-xs text-muted-foreground">{role.kind}</span>
                  </span>
                </span>
                <span className="text-sm text-muted-foreground truncate">{scopeLabel(role.namespace)}</span>
                <span>
                  <AccessPill level={level} />
                </span>
                <span className="text-sm text-muted-foreground truncate" title={resources.join(", ")}>
                  {describeResources(resources)}
                </span>
                <span>
                  <RiskGlyph level={riskLevelFor(level, resources.includes("*"))} />
                </span>
                <span className="text-sm text-muted-foreground tabular">{(role.rules ?? []).length}</span>
              </button>

              {isOpen && (
                <div className="px-4 pb-4 bg-muted/20 space-y-3 pt-4">
                  <div className="space-y-2">
                    {(role.rules ?? []).map((rule, index) => (
                      <div key={index} className="rounded-xl border border-border bg-background p-3 text-sm">
                        <div className="flex flex-wrap gap-x-6 gap-y-1">
                          <span>
                            <span className="text-muted-foreground text-xs">API groups: </span>
                            {describeApiGroups(rule.apiGroups)}
                          </span>
                          <span>
                            <span className="text-muted-foreground text-xs">Resources: </span>
                            {describeResources(rule.resources)}
                          </span>
                          <span>
                            <span className="text-muted-foreground text-xs">Access: </span>
                            <AccessPill level={verbsToAccessLevel(rule.verbs)} />
                          </span>
                        </div>
                        <p className="mt-1.5 text-xs text-muted-foreground">{describeVerbs(rule.verbs)}</p>
                      </div>
                    ))}
                  </div>

                  {related.length > 0 && (
                    <div>
                      <h4 className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
                        Findings ({related.length})
                      </h4>
                      <ul className="space-y-1">
                        {related.map((finding) => (
                          <li key={finding.id}>
                            <Link
                              href={`/app/scans/${scanId}/findings/${finding.id}`}
                              className="text-sm text-primary hover:underline"
                            >
                              {finding.title}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function BindingTable({
  rows,
  scanId,
}: {
  rows: {
    name: string
    kind: string
    namespace?: string
    roleRef: { kind: string; name: string }
    subjects: { kind: string; name: string; namespace?: string }[]
  }[]
  scanId: string
}) {
  return (
    <div>
      <div className="grid grid-cols-[1.6fr_1fr_1.2fr_1fr] gap-3 px-4 py-2.5 bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
        <span>Binding</span>
        <span>Namespace</span>
        <span>Role</span>
        <span>Subjects</span>
      </div>
      <div className="divide-y divide-border">
        {rows.map((binding) => (
          <div
            key={`${binding.kind}/${binding.namespace ?? "-"}/${binding.name}`}
            className="grid grid-cols-[1.6fr_1fr_1.2fr_1fr] gap-3 px-4 py-3 items-center"
          >
            <span className="min-w-0">
              <span className="block font-medium truncate">{binding.name}</span>
              <span className="block text-xs text-muted-foreground">{binding.kind}</span>
            </span>
            <span className="text-sm text-muted-foreground truncate">{scopeLabel(binding.namespace)}</span>
            <Link
              href={`/app/scans/${scanId}/viewer?tab=roles&q=${encodeURIComponent(binding.roleRef?.name ?? "")}`}
              className="text-sm text-primary hover:underline truncate"
            >
              {binding.roleRef?.name}
            </Link>
            <span className="text-sm text-muted-foreground truncate">
              {(binding.subjects ?? []).length === 0
                ? "—"
                : (binding.subjects ?? [])
                    .slice(0, 2)
                    .map((s) => s.name)
                    .join(", ") + ((binding.subjects ?? []).length > 2 ? ` +${binding.subjects.length - 2}` : "")}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
