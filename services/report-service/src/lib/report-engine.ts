// Report builder — ported from lib/report-generator.ts in the monolith.
// Difference: the monolith fetched scans from Supabase inline. Here the scans
// are fetched via the scanner gRPC client by the caller (server.ts) and passed
// in as ScanRow[], so this module is pure (no I/O). Output file generation
// (JSON/CSV/PDF bytes) also lives here instead of creating browser blob URLs.

import { getFixForRule, getIssueDescriptionForRule, getFixForFinding } from "./rbac-recommendations"
import { generatePDFReport } from "./report-pdf"
import { namespaceStats, describeScope, scopeLabel, isClusterScoped } from "./namespaces"
import { resolveSubjectCount, countBoundSubjects, type ReportProvenance } from "./provenance"
import { computeScore, type ScoreResult, UNAVAILABLE_SCORE } from "./scoring"
import type { RBACFinding, ScanDataset, ScanRow, ReportType, ReportFormat } from "./rbac-types"

export interface ReportData {
  workspace_id: string
  workspace_name: string
  clusters: string[]
  report_type: ReportType
  format: ReportFormat
  generated_at: string
  summary: { subjects: number; roles: number; bindings: number }
  risks: { critical: number; high: number; medium: number; low: number }
  findings: RBACFinding[]
  rbac_rows: FlatRBACRow[]
  compliance?: ComplianceSection
  risk_assessment?: RiskAssessmentSection
  trend_analysis?: TrendAnalysisSection
  /** Which snapshot(s) this report describes. Always present on new reports. */
  provenance?: ReportProvenance
  /** Posture score for the analysed snapshot(s); same model as the app. */
  security_score?: ScoreResult
  /** Scope + coverage facts the PDF and the UI both render. */
  scope?: ScopeSummary
  /** Evidence-backed remediation priorities, worst first. */
  priorities?: RemediationPriority[]
  /** Findings grouped by title, so 40 copies of one rule read as one item. */
  grouped_findings?: FindingGroup[]
}

/**
 * A recommendation a reader can act on and argue with: it names the evidence
 * (how many findings, where, which roles), who normally owns the fix, and what
 * it is worth. A bare "apply least privilege" is not actionable.
 */
export interface RemediationPriority {
  rank: number
  title: string
  why_it_matters: string
  action: string
  finding_count: number
  critical_count: number
  high_count: number
  affected_namespaces: string[]
  example_roles: string[]
  example_subjects: string[]
  suggested_owner: string
  /** Points the posture score would regain if this group were fully resolved. */
  expected_score_gain: number
  finding_ids: string[]
}

/** Repeated findings collapsed into one row, with their scope preserved. */
export interface FindingGroup {
  title: string
  severity: RBACFinding["severity"]
  category: string
  count: number
  description: string
  remediation: string
  why_it_matters: string
  namespaces: string[]
  cluster_scoped: boolean
  roles: string[]
  subjects: string[]
  finding_ids: string[]
}

export interface ScopeSummary {
  /** Real namespaces only — never includes the cluster-wide bucket. */
  namespaces: string[]
  namespace_count: number
  cluster_scoped_bindings: number
  /** e.g. "7 namespaces + cluster-wide permissions". */
  label: string
  /** Distinct subjects bound by the analysed snapshots. */
  bound_subjects: number
  /**
   * True when the snapshots record no bound subjects at all. The report then
   * says "0 bound subjects evaluated" and explains Subject: N/A, instead of
   * printing a bare "0 subjects" that reads as a data error.
   */
  subjects_absent: boolean
  /** True when the count came from the bindings rather than recorded totals. */
  subjects_derived: boolean
  /** Collection fields an RBAC snapshot cannot supply. */
  collection_gaps: string[]
  top_namespaces: { namespace: string; critical: number; high: number; total: number }[]
  /** Always computed, so the risk page carries a breakdown for every report type. */
  categories: { category: string; count: number }[]
  top_roles: { role: string; critical: number; high: number; total: number }[]
}

export interface FlatRBACRow {
  cluster: string
  subject: string
  type: string
  namespace: string
  role: string
  resource: string
  verbs: string
  risk: string
  issue: string
  recommendation: string
}

interface ComplianceSection {
  cluster_metadata: { name: string; scan_date: string; subjects: number; roles: number; bindings: number }[]
  rbac_summary: { total_subjects: number; total_roles: number; total_bindings: number }
  top_findings: RBACFinding[]
  recommendations: string[]
}

interface RiskAssessmentSection {
  severity_distribution: { critical: number; high: number; medium: number; low: number }
  affected_subjects: { name: string; type: string; finding_count: number; highest_severity: string }[]
  findings_by_category: Record<string, RBACFinding[]>
}

interface TrendAnalysisSection {
  scans_compared: { cluster: string; scan_date: string; risks: ScanRow["risk_counts"] }[]
  risk_changes: { severity: string; previous: number; current: number; change: number }[]
  new_risks: RBACFinding[]
  resolved_risks: RBACFinding[]
}

interface AggregatedData {
  totals: { subjects: number; roles: number; bindings: number }
  riskCounts: { critical: number; high: number; medium: number; low: number }
  findings: RBACFinding[]
}

// ============================================
// MAIN: build the ReportData object from already-fetched scans
// ============================================

export function buildReportData(params: {
  workspaceId: string
  workspaceName: string
  clusters: string[]
  reportType: ReportType
  format: ReportFormat
  scans: ScanRow[]
  provenance?: ReportProvenance
}): ReportData {
  const { workspaceId, workspaceName, clusters, reportType, format, scans, provenance } = params

  const aggregated = aggregateScans(scans)
  const rbacRows = flattenRBACRows(scans)

  const reportData: ReportData = {
    workspace_id: workspaceId,
    workspace_name: workspaceName,
    clusters,
    report_type: reportType,
    format,
    generated_at: provenance?.generated_at ?? new Date().toISOString(),
    summary: aggregated.totals,
    risks: aggregated.riskCounts,
    findings: aggregated.findings,
    rbac_rows: rbacRows,
    provenance,
    // Findings are emitted per role, so roles are the evaluated surface —
    // identical denominator to scoreForScan() in the app.
    security_score: scans.length > 0
      ? computeScore(aggregated.findings, {
          evaluatedSurface: aggregated.totals.roles || aggregated.findings.length || 1,
        })
      : UNAVAILABLE_SCORE,
    scope: buildScopeSummary(scans, aggregated),
    grouped_findings: groupFindings(aggregated.findings),
    priorities: buildPriorities(aggregated),
  }

  switch (reportType) {
    case "COMPLIANCE":
      reportData.compliance = buildComplianceSection(scans, aggregated)
      break
    case "RISK_ASSESSMENT":
      reportData.risk_assessment = buildRiskAssessmentSection(aggregated)
      break
    case "RBAC_AUDIT":
      break
    case "TREND_ANALYSIS":
      reportData.trend_analysis = buildTrendAnalysisSection(scans)
      break
  }

  return reportData
}

// Produce the downloadable file bytes for the chosen format.
export function renderReportFile(reportData: ReportData): { content: Buffer; size: string } {
  let content: Buffer

  switch (reportData.format) {
    case "JSON":
      content = Buffer.from(JSON.stringify(reportData, null, 2), "utf-8")
      break
    case "CSV":
      content = Buffer.from(generateCSV(reportData.rbac_rows), "utf-8")
      break
    case "PDF": {
      const doc = generatePDFReport(reportData)
      content = Buffer.from(doc.output("arraybuffer"))
      break
    }
    default:
      content = Buffer.from(JSON.stringify(reportData, null, 2), "utf-8")
  }

  return { content, size: formatBytes(content.byteLength) }
}

// ============================================
// AGGREGATION (reuses each scan's pre-computed totals/riskCounts)
// ============================================

function aggregateScans(scans: ScanRow[]): AggregatedData {
  const totals = { subjects: 0, roles: 0, bindings: 0 }
  const riskCounts = { critical: 0, high: 0, medium: 0, low: 0 }
  const allFindings: RBACFinding[] = []

  for (const scan of scans) {
    // Subjects: prefer what the scanner recorded, but fall back to the subjects
    // named in the bindings when the recorded total is empty. A snapshot that
    // clearly binds subjects must never be summarised as "0 subjects".
    totals.subjects += resolveSubjectCount(scan).count
    totals.roles += scan.totals?.roles || 0
    totals.bindings += scan.totals?.bindings || 0

    riskCounts.critical += scan.risk_counts?.critical || 0
    riskCounts.high += scan.risk_counts?.high || 0
    riskCounts.medium += scan.risk_counts?.medium || 0
    riskCounts.low += scan.risk_counts?.low || 0

    const dataset = scan.scan_data as ScanDataset
    if (dataset?.findings) {
      allFindings.push(...dataset.findings)
    }
  }

  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
  allFindings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

  return { totals, riskCounts, findings: allFindings }
}

// ============================================
// SCOPE / COVERAGE
// ============================================

/**
 * What the report actually covers.
 *
 * `cluster-wide` is a scope, not a namespace: it is counted separately and
 * labelled "Cluster-scoped access" so the same snapshot never reads as
 * "7 namespaces" in one place and "8" in another.
 */
function buildScopeSummary(scans: ScanRow[], aggregated: AggregatedData): ScopeSummary {
  const namespaces = new Set<string>()
  let clusterScopedBindings = 0
  let boundSubjects = 0
  let derived = false

  for (const scan of scans) {
    const stats = namespaceStats(scan.scan_data)
    for (const ns of stats.namespaces) namespaces.add(ns)
    clusterScopedBindings += stats.clusterScopedBindings
    boundSubjects += countBoundSubjects(scan.scan_data)
    if (resolveSubjectCount(scan).derived) derived = true
  }

  // Worst namespaces by critical, then high — the ones a reader should look at
  // first. Cluster-scoped findings are ranked under their own label.
  const byNamespace = new Map<string, { critical: number; high: number; total: number }>()
  for (const finding of aggregated.findings) {
    const key = isClusterScoped(finding.namespace) ? "Cluster-wide" : finding.namespace.trim()
    const entry = byNamespace.get(key) ?? { critical: 0, high: 0, total: 0 }
    entry.total++
    if (finding.severity === "critical") entry.critical++
    if (finding.severity === "high") entry.high++
    byNamespace.set(key, entry)
  }

  const topNamespaces = [...byNamespace.entries()]
    .map(([namespace, counts]) => ({ namespace, ...counts }))
    .sort((a, b) => b.critical - a.critical || b.high - a.high || b.total - a.total)
    .slice(0, 5)

  // Category and per-role breakdowns are computed for every report type, not
  // only RISK_ASSESSMENT — otherwise the risk page renders half empty.
  const categoryCounts = new Map<string, number>()
  const byRole = new Map<string, { critical: number; high: number; total: number }>()
  for (const finding of aggregated.findings) {
    const category = String(finding.category || "UNCATEGORISED")
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1)

    if (!finding.role) continue
    const entry = byRole.get(finding.role) ?? { critical: 0, high: 0, total: 0 }
    entry.total++
    if (finding.severity === "critical") entry.critical++
    if (finding.severity === "high") entry.high++
    byRole.set(finding.role, entry)
  }

  const categories = [...categoryCounts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)

  const topRoles = [...byRole.entries()]
    .map(([role, counts]) => ({ role, ...counts }))
    .sort((a, b) => b.critical - a.critical || b.high - a.high || b.total - a.total)
    .slice(0, 6)

  return {
    namespaces: [...namespaces].sort(),
    namespace_count: namespaces.size,
    cluster_scoped_bindings: clusterScopedBindings,
    label: describeScope({
      namespaces: [...namespaces],
      namespaceCount: namespaces.size,
      clusterScopedBindings,
      clusterScopedRoles: 0,
    }),
    bound_subjects: boundSubjects,
    subjects_absent: boundSubjects === 0,
    subjects_derived: derived,
    // Stated rather than left blank: an RBAC snapshot genuinely cannot carry
    // these, and an unexplained gap reads as a broken scan.
    collection_gaps: [
      "Kubernetes version — requires collector metadata (metadata.json)",
      "Scan duration — recorded by the scanner from v2 snapshots onward",
      "HostPath / privileged workloads — Pod Security scope, not RBAC",
    ],
    top_namespaces: topNamespaces,
    categories,
    top_roles: topRoles,
  }
}

// ============================================
// RBAC ROW FLATTENING
// ============================================

function flattenRBACRows(scans: ScanRow[]): FlatRBACRow[] {
  const rows: FlatRBACRow[] = []

  for (const scan of scans) {
    const dataset = scan.scan_data as ScanDataset
    if (!dataset) continue

    const roleMap = new Map<string, ScanDataset["roles"][0]>()
    for (const role of dataset.roles || []) {
      roleMap.set(role.name, role)
    }

    for (const binding of dataset.bindings || []) {
      const role = roleMap.get(binding.roleRef.name)
      if (!role) continue

      for (const subject of binding.subjects || []) {
        for (const rule of role.rules || []) {
          for (const resource of rule.resources || ["*"]) {
            const risk = assessRuleRisk(rule.verbs, resource)
            rows.push({
              cluster: scan.cluster_name,
              subject: subject.name,
              type: subject.kind,
              // "Cluster-wide" is a scope label here, not a namespace name.
              namespace: scopeLabel(binding.namespace),
              role: role.name,
              resource,
              verbs: (rule.verbs || []).join(", "),
              risk,
              issue: getIssueDescriptionForRule(rule.verbs || [], resource, risk),
              recommendation: getFixForRule(rule.verbs || [], resource),
            })
          }
        }
      }
    }
  }

  return rows
}

function assessRuleRisk(verbs: string[], resource: string): string {
  const hasWildcard = verbs.includes("*") || resource === "*"
  const hasDangerous = verbs.some((v) => ["create", "delete", "patch", "update"].includes(v))
  const sensitiveResources = ["secrets", "configmaps", "pods", "deployments", "daemonsets", "roles", "clusterroles", "rolebindings", "clusterrolebindings"]

  if (hasWildcard) return "critical"
  if (hasDangerous && sensitiveResources.includes(resource)) return "high"
  if (hasDangerous) return "medium"
  return "low"
}

// ============================================
// REPORT TYPE BUILDERS
// ============================================

function buildComplianceSection(scans: ScanRow[], aggregated: AggregatedData): ComplianceSection {
  return {
    cluster_metadata: scans.map((s) => ({
      name: s.cluster_name,
      scan_date: s.created_at,
      subjects: resolveSubjectCount(s).count,
      roles: s.totals?.roles || 0,
      bindings: s.totals?.bindings || 0,
    })),
    rbac_summary: {
      total_subjects: aggregated.totals.subjects,
      total_roles: aggregated.totals.roles,
      total_bindings: aggregated.totals.bindings,
    },
    top_findings: aggregated.findings.slice(0, 20),
    recommendations: generateRecommendations(aggregated),
  }
}

function buildRiskAssessmentSection(aggregated: AggregatedData): RiskAssessmentSection {
  const subjectMap = new Map<string, { type: string; findings: RBACFinding[] }>()
  for (const f of aggregated.findings) {
    if (!subjectMap.has(f.subject)) {
      subjectMap.set(f.subject, { type: f.subjectType, findings: [] })
    }
    subjectMap.get(f.subject)!.findings.push(f)
  }

  const affected_subjects = Array.from(subjectMap.entries())
    .map(([name, data]) => ({
      name,
      type: data.type,
      finding_count: data.findings.length,
      highest_severity: data.findings.reduce((prev, curr) => {
        const order = { critical: 0, high: 1, medium: 2, low: 3 }
        return order[curr.severity as keyof typeof order] < order[prev as keyof typeof order] ? curr.severity : prev
      }, "low" as string),
    }))
    .sort((a, b) => (a.finding_count > b.finding_count ? -1 : 1))

  const findings_by_category: Record<string, RBACFinding[]> = {}
  for (const f of aggregated.findings) {
    if (!findings_by_category[f.category]) findings_by_category[f.category] = []
    findings_by_category[f.category].push(f)
  }

  return {
    severity_distribution: aggregated.riskCounts,
    affected_subjects,
    findings_by_category,
  }
}

function buildTrendAnalysisSection(scans: ScanRow[]): TrendAnalysisSection {
  const scansCompared = scans.map((s) => ({
    cluster: s.cluster_name,
    scan_date: s.created_at,
    risks: s.risk_counts,
  }))

  const riskChanges: TrendAnalysisSection["risk_changes"] = []
  if (scans.length >= 2) {
    const current = scans[0].risk_counts
    const previous = scans[scans.length - 1].risk_counts
    for (const sev of ["critical", "high", "medium", "low"] as const) {
      riskChanges.push({
        severity: sev,
        previous: previous?.[sev] || 0,
        current: current?.[sev] || 0,
        change: (current?.[sev] || 0) - (previous?.[sev] || 0),
      })
    }
  }

  const currentFindings = (scans[0]?.scan_data as ScanDataset)?.findings || []
  const previousFindings = scans.length >= 2 ? (scans[scans.length - 1]?.scan_data as ScanDataset)?.findings || [] : []

  const prevIds = new Set(previousFindings.map((f) => f.id))
  const currIds = new Set(currentFindings.map((f) => f.id))

  const newRisks = currentFindings.filter((f) => !prevIds.has(f.id))
  const resolvedRisks = previousFindings.filter((f) => !currIds.has(f.id))

  return {
    scans_compared: scansCompared,
    risk_changes: riskChanges,
    new_risks: newRisks,
    resolved_risks: resolvedRisks,
  }
}

// ============================================
// GROUPING + PRIORITIES
// ============================================

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }

/**
 * Why a rule matters, in the reader's terms.
 *
 * The engine's own `description` says what was found; this says what an
 * attacker does with it. Keyed on the same title prefixes the scoring model
 * classifies on.
 */
function whyItMatters(title: string, severity: string): string {
  const t = title.toLowerCase()
  if (t.includes("cluster-admin"))
    return "cluster-admin is unrestricted access to every object in every namespace, including secrets and the RBAC rules themselves. One compromised holder is a full cluster compromise, and the grant is invisible in audit logs because nothing it does is unauthorised."
  if (t.includes("secrets write"))
    return "Write access to secrets lets a subject plant or overwrite credentials that other workloads then trust — a durable foothold that survives pod restarts and reads as normal application behaviour."
  if (t.includes("secrets read") || t.includes("token access"))
    return "Reading secrets and service-account tokens yields live credentials for other identities, so this grant is the usual first step in moving laterally from one workload to the rest of the cluster."
  if (t.includes("pods/exec") || t.includes("pods/attach"))
    return "Exec into a pod runs commands inside that workload with its identity and its mounted secrets, bypassing the application entirely. It is the fastest path from namespace access to credential theft."
  if (t.includes("portforward"))
    return "Port-forward reaches services that were never exposed outside the cluster, including databases and admin endpoints that rely on network isolation for their protection."
  if (t.includes("impersonate"))
    return "Impersonation lets a subject act as any other user or group, which both escalates privilege and attributes the resulting actions to someone else in the audit trail."
  if (t.includes("escalate") || t.includes("rolebinding creation") || t.includes("clusterrole creation"))
    return "The ability to create or modify roles and bindings means the subject can grant itself anything it does not already have, so every other restriction on it is advisory rather than enforced."
  if (t.includes("wildcard"))
    return "A wildcard grants every current resource and verb and silently absorbs every API added by a future upgrade, so the permission keeps growing after the review that approved it."
  if (t.includes("node access"))
    return "Node and kubelet access reaches every pod on that node regardless of namespace boundaries, which turns a single node grant into cluster-wide workload access."
  if (t.includes("default"))
    return "Binding privileges to a default service account grants them to every pod in the namespace that does not set its own, including workloads added later by someone unaware of the binding."
  if (t.includes("anonymous") || t.includes("unauthenticated"))
    return "Grants to anonymous or unauthenticated identities are reachable by anyone who can reach the API server, with no credential required."
  return severity === "critical" || severity === "high"
    ? "This grant materially widens the blast radius of a compromise of the bound subject: it hands an attacker capability that the workload's own function does not require."
    : "This grant exceeds what the workload needs, which enlarges the review surface and hides genuinely dangerous permissions among routine ones."
}

/** Team that normally owns the fix, inferred from the rule family. */
function suggestedOwner(title: string): string {
  const t = title.toLowerCase()
  if (t.includes("cluster-admin") || t.includes("impersonate") || t.includes("escalate")) return "Platform / cluster admins"
  if (t.includes("secrets") || t.includes("token")) return "Security engineering"
  if (t.includes("node")) return "Infrastructure / node operations"
  if (t.includes("default") || t.includes("anonymous")) return "Namespace owners"
  return "Service owner + platform team"
}

/**
 * The rule a finding came from.
 *
 * The engine emits per-object titles ("Secrets READ access:
 * argocd-application-controller"), so grouping on the whole title produces one
 * group per role — 117 "groups" for 121 findings, which is not grouping. The
 * text before the colon is the rule; the role after it is already carried in
 * the group's role list.
 */
/** Whether a finding names a real subject rather than a placeholder. */
export function isNamedSubject(subject: string | null | undefined): boolean {
  if (!subject) return false
  const normalised = subject.trim().toLowerCase()
  return normalised !== "" && normalised !== "n/a" && normalised !== "-" && normalised !== "none"
}

export function ruleNameOf(title: string): string {
  const separator = title.indexOf(":")
  if (separator <= 0) return title.trim()
  return title.slice(0, separator).trim()
}

export function groupFindings(findings: RBACFinding[]): FindingGroup[] {
  const groups = new Map<string, FindingGroup>()

  for (const finding of findings) {
    const rule = ruleNameOf(finding.title)
    const key = `${finding.severity}::${rule}`
    let group = groups.get(key)
    if (!group) {
      group = {
        title: rule,
        severity: finding.severity,
        category: finding.category,
        count: 0,
        description: finding.description,
        remediation: finding.remediation,
        why_it_matters: whyItMatters(finding.title, finding.severity),
        namespaces: [],
        cluster_scoped: false,
        roles: [],
        subjects: [],
        finding_ids: [],
      }
      groups.set(key, group)
    }

    group.count++
    if (isClusterScoped(finding.namespace)) group.cluster_scoped = true
    else if (!group.namespaces.includes(finding.namespace)) group.namespaces.push(finding.namespace)
    if (finding.role && !group.roles.includes(finding.role)) group.roles.push(finding.role)
    // Placeholder subjects ("N/A", "-") are not subjects. Keeping them would
    // print "Example subjects: N/A" as if that were a real identity; the
    // absence is stated once, in words, instead.
    if (isNamedSubject(finding.subject) && !group.subjects.includes(finding.subject)) {
      group.subjects.push(finding.subject)
    }
    group.finding_ids.push(finding.id)
  }

  return [...groups.values()].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.count - a.count,
  )
}

/**
 * Remediation priorities ranked by what fixing them is actually worth.
 *
 * Ordering is by severity and blast radius (how many roles and namespaces the
 * group touches), not by raw count — one cluster-admin grant outranks forty
 * low-severity wildcards.
 */
function buildPriorities(aggregated: AggregatedData): RemediationPriority[] {
  const groups = groupFindings(aggregated.findings)
  if (groups.length === 0) return []

  const surface = aggregated.totals.roles || aggregated.findings.length || 1
  const baseline = computeScore(aggregated.findings, { evaluatedSurface: surface })

  const ranked = groups
    .map((group) => {
      // What the score would be if this whole group were resolved. Computed,
      // not guessed — the same function that produced the headline score.
      //
      // Measured on the UNCAPPED score deliberately: while any critical
      // remains open the displayed score is pinned at 74, so a capped
      // comparison would report "+0" for every item and make real progress
      // look worthless. The PDF says which number this refers to.
      const remainingIds = new Set(group.finding_ids)
      const without = computeScore(
        aggregated.findings.filter((f) => !remainingIds.has(f.id)),
        { evaluatedSurface: surface },
      )
      const criticalCount = group.severity === "critical" ? group.count : 0
      const highCount = group.severity === "high" ? group.count : 0

      return {
        group,
        gain: Math.max(0, without.uncappedScore - baseline.uncappedScore),
        blastRadius: group.roles.length + group.namespaces.length * 2 + (group.cluster_scoped ? 10 : 0),
        criticalCount,
        highCount,
      }
    })
    .sort(
      (a, b) =>
        SEVERITY_ORDER[a.group.severity] - SEVERITY_ORDER[b.group.severity] ||
        b.gain - a.gain ||
        b.blastRadius - a.blastRadius,
    )
    .slice(0, 6)

  return ranked.map((entry, index) => {
    const { group } = entry
    const namespaces = group.cluster_scoped ? ["Cluster-wide", ...group.namespaces] : group.namespaces

    return {
      rank: index + 1,
      title: group.title,
      why_it_matters: group.why_it_matters,
      action: group.remediation,
      finding_count: group.count,
      critical_count: entry.criticalCount,
      high_count: entry.highCount,
      affected_namespaces: namespaces.slice(0, 8),
      example_roles: group.roles.slice(0, 4),
      example_subjects: group.subjects.slice(0, 4),
      suggested_owner: suggestedOwner(group.title),
      expected_score_gain: entry.gain,
      finding_ids: group.finding_ids.slice(0, 20),
    }
  })
}

// ============================================
// RECOMMENDATIONS
// ============================================

function generateRecommendations(aggregated: AggregatedData): string[] {
  const recs: string[] = []

  if (aggregated.riskCounts.critical > 0) {
    recs.push(`Address ${aggregated.riskCounts.critical} critical findings immediately — these represent cluster-admin level risks or wildcard permissions.`)
  }
  if (aggregated.riskCounts.high > 0) {
    recs.push(`Review ${aggregated.riskCounts.high} high-severity findings — these involve write access to sensitive resources like secrets, roles, or bindings.`)
  }

  // Evidence, not exhortation: each line names the affected count, where it
  // lands, an example role, and who normally owns the fix.
  for (const priority of buildPriorities(aggregated).slice(0, 3)) {
    const where =
      priority.affected_namespaces.length > 0
        ? ` across ${priority.affected_namespaces.slice(0, 3).join(", ")}`
        : ""
    const example = priority.example_roles.length > 0 ? ` (e.g. role ${priority.example_roles[0]})` : ""
    const gain = priority.expected_score_gain > 0 ? ` Expected posture gain: +${priority.expected_score_gain} points.` : ""
    recs.push(
      `[${priority.rank}] ${priority.title} — ${priority.finding_count} finding(s)${where}${example}. ${priority.action} Owner: ${priority.suggested_owner}.${gain}`,
    )
  }

  const topFindings = aggregated.findings.filter((f) => f.severity === "critical" || f.severity === "high").slice(0, 2)
  for (const finding of topFindings) {
    const fix = getFixForFinding(finding)
    recs.push(`[${finding.severity.toUpperCase()}] ${finding.title} → ${fix.summary}`)
  }

  const categories = new Set(aggregated.findings.map((f) => f.category))
  if (categories.has("OVERLY_PERMISSIVE")) {
    recs.push("Apply the principle of least privilege by scoping wildcard permissions to specific resources and verbs.")
  }
  if (categories.has("PRIVILEGE_ESCALATION")) {
    recs.push("Remove escalate, bind, and impersonate verbs from non-admin roles to prevent privilege escalation paths.")
  }
  if (categories.has("MISCONFIGURATION")) {
    recs.push("Audit orphaned role bindings and unused service accounts to reduce the attack surface.")
  }
  if (categories.has("BEST_PRACTICE")) {
    recs.push("Consider namespace-scoped Roles instead of ClusterRoles where cluster-wide access is not required.")
  }

  if (recs.length === 0) {
    recs.push("No critical issues detected. Continue monitoring RBAC configurations with regular scans.")
  }

  return recs
}

// ============================================
// CSV GENERATION
// ============================================

function generateCSV(rows: FlatRBACRow[]): string {
  // "Scope" rather than "Namespace": the column carries "Cluster-wide" for
  // grants that are not namespaced, and calling that a namespace is the
  // ambiguity this pass removes.
  const headers = ["Cluster", "Scope (namespace or cluster-wide)", "Subject", "Subject Type", "Role", "Resource", "Verbs", "Risk Level", "Issue Description", "Recommendation"]
  const csvRows = [headers.join(",")]

  for (const row of rows) {
    csvRows.push(
      [
        escapeCSV(row.cluster),
        escapeCSV(row.namespace),
        escapeCSV(row.subject),
        escapeCSV(row.type),
        escapeCSV(row.role),
        escapeCSV(row.resource),
        escapeCSV(row.verbs),
        escapeCSV(row.risk),
        escapeCSV(row.issue),
        escapeCSV(row.recommendation),
      ].join(","),
    )
  }

  return csvRows.join("\n")
}

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

// ============================================
// UTILS
// ============================================

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}
