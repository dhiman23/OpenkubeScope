// PDF report generator.
//
// What changed in this pass, and why:
//   - One title. The cover said "RBAC Security Report" while the page headers
//     said something else again and the app called it an RBAC Audit. The
//     document now uses a single title — "RBAC Audit — Production" — on the
//     cover, in every running header, and in the PDF metadata.
//   - Provenance on the cover and in the executive summary. A report that does
//     not say which snapshot it describes cannot be trusted six weeks later.
//   - The empty half of the executive-summary and risk pages now carries the
//     posture score, the score cap explanation, scope, top namespaces, and
//     collection gaps instead of whitespace.
//   - Findings carry why-they-matter, remediation, ids, and affected scope,
//     and repeated findings are grouped.
//   - Headers and footers are identical on every content page, and a section
//     that spills over is labelled "(continued)".
//   - The diagonal watermark is gone; provenance sits in the footer instead,
//     which is what the watermark was gesturing at.
//
// Accessibility: jsPDF cannot emit a PDF/UA structure tree (no /StructTreeRoot
// API), so this is not a tagged PDF in the strict sense. What is achievable
// here is done: document language and title metadata, "display document title"
// so readers announce the title rather than the filename, section bookmarks
// for navigation, single-column left-to-right draw order matching the reading
// order, real text (never images) for every label, and severity conveyed by
// text as well as colour. Full tagging needs a different renderer — see the
// note in the accompanying summary.

import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import type { ReportData, FlatRBACRow, RemediationPriority, FindingGroup } from "./report-engine"
import { describeCap } from "./scoring"
import { formatTimestamp, shortScanId } from "./provenance"

const COLORS = {
  primary: [15, 23, 42] as [number, number, number],
  primaryLight: [30, 41, 59] as [number, number, number],
  accent: [37, 99, 235] as [number, number, number],
  accentLight: [219, 234, 254] as [number, number, number],
  critical: [185, 28, 28] as [number, number, number],
  criticalBg: [254, 226, 226] as [number, number, number],
  high: [180, 83, 9] as [number, number, number],
  highBg: [255, 237, 213] as [number, number, number],
  medium: [161, 98, 7] as [number, number, number],
  mediumBg: [254, 249, 195] as [number, number, number],
  low: [21, 128, 61] as [number, number, number],
  lowBg: [220, 252, 231] as [number, number, number],
  text: [15, 23, 42] as [number, number, number],
  // Darkened from the previous #64748B: secondary text at 7–8pt needs more
  // contrast than that against white to stay legible in print.
  textSecondary: [71, 85, 105] as [number, number, number],
  border: [203, 213, 225] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  bgLight: [248, 250, 252] as [number, number, number],
}

const SEVERITY_COLORS = {
  critical: { text: COLORS.critical, bg: COLORS.criticalBg },
  high: { text: COLORS.high, bg: COLORS.highBg },
  medium: { text: COLORS.medium, bg: COLORS.mediumBg },
  low: { text: COLORS.low, bg: COLORS.lowBg },
}

const TYPE_LABELS: Record<string, string> = {
  COMPLIANCE: "Compliance Audit",
  RISK_ASSESSMENT: "Risk Assessment",
  RBAC_AUDIT: "RBAC Audit",
  TREND_ANALYSIS: "Trend Analysis",
}

const MARGIN = 20
const FOOTER_RESERVE = 22

interface Ctx {
  doc: jsPDF
  data: ReportData
  pw: number
  ph: number
  title: string
  /** Section currently being drawn — used for "(continued)" headers. */
  section: string
}

/** The single title used on the cover, in every header, and in the metadata. */
function reportTitle(data: ReportData): string {
  const type = TYPE_LABELS[data.report_type] || "RBAC Audit"
  const clusters = data.clusters.length > 0 ? data.clusters.join(", ") : "All clusters"
  return `${type} — ${clusters}`
}

export function generatePDFReport(reportData: ReportData): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const pw = doc.internal.pageSize.getWidth()
  const ph = doc.internal.pageSize.getHeight()
  const title = reportTitle(reportData)

  const ctx: Ctx = { doc, data: reportData, pw, ph, title, section: "" }

  // Metadata + language: screen readers announce the document title instead of
  // the filename, and a declared language stops them guessing pronunciation.
  doc.setDocumentProperties({
    title,
    subject: `Kubernetes RBAC posture for ${reportData.clusters.join(", ")}`,
    author: "KubeScope",
    creator: "KubeScope report-service",
    keywords: ["kubernetes", "rbac", "security", "audit", ...reportData.clusters].join(", "),
  })
  doc.setLanguage("en-US")
  setDisplayDocTitle(doc)

  drawCoverPage(ctx)

  startSection(ctx, "Executive Summary")
  drawExecutiveSummary(ctx)

  startSection(ctx, "Risk Summary")
  drawRiskSummary(ctx)

  if (reportData.findings.length > 0) {
    startSection(ctx, "Top Security Findings")
    drawTopFindings(ctx)
  }

  if ((reportData.priorities?.length ?? 0) > 0 || reportData.compliance?.recommendations) {
    startSection(ctx, "Remediation Priorities")
    drawPriorities(ctx)
  }

  if (reportData.rbac_rows.length > 0) {
    startSection(ctx, "RBAC Access Matrix")
    drawRBACTable(ctx)
  }

  startSection(ctx, "Scope & Methodology")
  drawScopeAndMethodology(ctx)

  // Footers last, once the total page count is known.
  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    drawPageFooter(ctx, i, totalPages)
  }

  return doc
}

/**
 * Ask readers to announce the document title rather than the filename.
 * jsPDF has no typed API for the viewer preference, so it is written directly
 * into the catalog; guarded because it is a nicety, not a correctness feature.
 */
function setDisplayDocTitle(doc: jsPDF) {
  try {
    const internal = doc.internal as unknown as {
      events?: { subscribe: (name: string, fn: () => void) => void }
      write?: (...args: string[]) => void
    }
    internal.events?.subscribe("putCatalog", () => {
      internal.write?.("/ViewerPreferences << /DisplayDocTitle true >>")
    })
  } catch {
    // Non-fatal: the document is still readable without the preference.
  }
}

/** Start a new content page for a section and bookmark it. */
function startSection(ctx: Ctx, section: string) {
  ctx.section = section
  ctx.doc.addPage()
  addBookmark(ctx, section)
  drawPageHeader(ctx)
}

/** Continue a section onto a fresh page, labelled so the reader is not lost. */
function continueSection(ctx: Ctx): number {
  ctx.doc.addPage()
  return drawPageHeader(ctx, true)
}

function addBookmark(ctx: Ctx, label: string) {
  try {
    const outline = (ctx.doc as unknown as { outline?: { add: (parent: null, title: string, options: { pageNumber: number }) => void } }).outline
    outline?.add(null, label, { pageNumber: ctx.doc.getNumberOfPages() })
  } catch {
    // Bookmarks are navigation sugar; never fail a report over them.
  }
}

// ============================================
// COVER
// ============================================

function drawCoverPage(ctx: Ctx) {
  const { doc, data, pw, ph } = ctx

  doc.setFillColor(...COLORS.primary)
  doc.rect(0, 0, pw, ph, "F")
  doc.setFillColor(...COLORS.accent)
  doc.rect(0, 0, pw, 6, "F")

  doc.setFillColor(...COLORS.accent)
  doc.roundedRect(MARGIN, 32, 44, 44, 4, 4, "F")
  doc.setTextColor(...COLORS.white)
  doc.setFontSize(22)
  doc.setFont("helvetica", "bold")
  doc.text("K", MARGIN + 15, 52)
  doc.setFontSize(11)
  doc.text("SCOPE", MARGIN + 15, 64)

  // One title, matching every page header and the PDF metadata.
  doc.setTextColor(...COLORS.white)
  doc.setFontSize(28)
  doc.setFont("helvetica", "bold")
  const titleLines = doc.splitTextToSize(ctx.title, pw - MARGIN * 2)
  doc.text(titleLines, MARGIN, 100)

  let y = 100 + titleLines.length * 11

  doc.setDrawColor(...COLORS.accent)
  doc.setLineWidth(0.5)
  doc.line(MARGIN, y, pw - MARGIN, y)
  y += 14

  // ---- provenance block: the point of the cover ----
  const provenance = data.provenance
  const source = provenance?.sources?.[0]

  const rows: [string, string][] = [
    ["Workspace", data.workspace_name],
    ["Source cluster", source?.cluster_name ?? data.clusters.join(", ") ?? "—"],
    [
      "Source snapshot",
      source ? `${source.file_name} · ${shortScanId(source.scan_id)}` : "Not recorded",
    ],
    ["Snapshot captured", source ? formatTimestamp(source.snapshot_taken_at) : "Not recorded"],
    ["Report generated", formatTimestamp(data.generated_at)],
    ["Scope", data.scope?.label ?? provenance?.scope ?? "—"],
    [
      "Filters",
      provenance?.filters && provenance.filters.length > 0 ? provenance.filters.join(" · ") : "None (all findings)",
    ],
  ]

  doc.setFontSize(10)
  for (const [label, value] of rows) {
    doc.setFont("helvetica", "bold")
    doc.setTextColor(170, 185, 210)
    doc.text(label, MARGIN, y)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(...COLORS.white)
    const valueLines = doc.splitTextToSize(value, pw - MARGIN - 62)
    doc.text(valueLines, MARGIN + 42, y)
    y += Math.max(7, valueLines.length * 5.2)
  }

  y += 4

  // Currency banner — the one line that stops an old report being mistaken for
  // the current scan. Text, not just colour.
  if (provenance && provenance.sources.length > 0) {
    const latest = provenance.based_on_latest
    const bannerText = latest
      ? "Based on the latest snapshot of this cluster at generation time."
      : "Based on an EARLIER snapshot — a newer snapshot of this cluster exists."
    doc.setFillColor(...(latest ? COLORS.primaryLight : COLORS.high))
    doc.roundedRect(MARGIN, y, pw - MARGIN * 2, 12, 2, 2, "F")
    doc.setFontSize(9)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...COLORS.white)
    doc.text(bannerText, MARGIN + 4, y + 7.8)
    y += 22
  }

  // ---- posture + risk summary ----
  const score = data.security_score
  const totalFindings = data.risks.critical + data.risks.high + data.risks.medium + data.risks.low

  doc.setFontSize(12)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...COLORS.white)
  doc.text("Posture at a glance", MARGIN, y)
  y += 8

  const cardW = (pw - MARGIN * 2 - 21) / 4
  const cards: { label: string; value: string; accent: [number, number, number] }[] = [
    {
      label: score?.available ? `Score · ${bandLabel(score.band)}` : "Score",
      value: score?.available ? `${score.score}` : "n/a",
      accent: COLORS.accent,
    },
    { label: "Findings", value: String(totalFindings), accent: COLORS.accentLight },
    { label: "Critical", value: String(data.risks.critical), accent: COLORS.critical },
    { label: "High", value: String(data.risks.high), accent: COLORS.high },
  ]

  cards.forEach((card, i) => {
    const x = MARGIN + i * (cardW + 7)
    doc.setFillColor(...COLORS.primaryLight)
    doc.roundedRect(x, y, cardW, 32, 3, 3, "F")
    doc.setFillColor(...card.accent)
    doc.rect(x, y, cardW, 3.5, "F")
    doc.setFontSize(19)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...COLORS.white)
    doc.text(card.value, x + cardW / 2, y + 19, { align: "center" })
    doc.setFontSize(7.5)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(185, 198, 218)
    doc.text(card.label, x + cardW / 2, y + 27, { align: "center" })
  })

  doc.setFillColor(...COLORS.accent)
  doc.rect(0, ph - 6, pw, 6, "F")
}

function bandLabel(band: string): string {
  return band.charAt(0).toUpperCase() + band.slice(1)
}

// ============================================
// RUNNING HEADER / FOOTER — identical on every content page
// ============================================

function drawPageHeader(ctx: Ctx, continued = false): number {
  const { doc, pw } = ctx

  doc.setFillColor(...COLORS.primary)
  doc.rect(0, 0, pw, 18, "F")
  doc.setFillColor(...COLORS.accent)
  doc.rect(0, 18, pw, 1.5, "F")

  doc.setTextColor(...COLORS.white)
  doc.setFontSize(9)
  doc.setFont("helvetica", "bold")
  doc.text(ctx.title, MARGIN, 11.5)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(200, 212, 230)
  doc.text(continued ? `${ctx.section} (continued)` : ctx.section, pw - MARGIN, 11.5, { align: "right" })

  return 30
}

function drawPageFooter(ctx: Ctx, page: number, total: number) {
  const { doc, pw, ph, data } = ctx
  if (page === 1) return

  doc.setDrawColor(...COLORS.border)
  doc.setLineWidth(0.3)
  doc.line(MARGIN, ph - 15, pw - MARGIN, ph - 15)

  doc.setTextColor(...COLORS.textSecondary)
  doc.setFontSize(7)
  doc.setFont("helvetica", "normal")

  // The provenance line replaces the diagonal watermark: same "this is a
  // KubeScope document, and here is which snapshot" purpose, none of the
  // reading interference.
  const source = data.provenance?.sources?.[0]
  const left = source
    ? `KubeScope · ${source.cluster_name} · snapshot ${shortScanId(source.scan_id)} · captured ${formatTimestamp(source.snapshot_taken_at)}`
    : `KubeScope · generated ${formatTimestamp(data.generated_at)}`
  doc.text(left, MARGIN, ph - 9)
  doc.text(`Page ${page} of ${total}`, pw - MARGIN, ph - 9, { align: "right" })
}

// ============================================
// SECTION HELPERS
// ============================================

function sectionHeading(ctx: Ctx, y: number, text: string): number {
  const { doc } = ctx
  doc.setFontSize(17)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...COLORS.text)
  doc.text(text, MARGIN, y)
  doc.setFillColor(...COLORS.accent)
  doc.rect(MARGIN, y + 3, 38, 1.5, "F")
  return y + 14
}

function subHeading(ctx: Ctx, y: number, text: string): number {
  const { doc } = ctx
  doc.setFontSize(11)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...COLORS.text)
  doc.text(text, MARGIN, y)
  return y + 7
}

function bodyText(ctx: Ctx, y: number, text: string, opts: { width?: number; size?: number } = {}): number {
  const { doc, pw } = ctx
  const width = opts.width ?? pw - MARGIN * 2
  doc.setFontSize(opts.size ?? 9.5)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(...COLORS.textSecondary)
  const lines = doc.splitTextToSize(text, width)
  doc.text(lines, MARGIN, y)
  return y + lines.length * (opts.size ? opts.size * 0.5 : 4.8) + 3
}

/** Break to a continued page when the next block would not fit. */
function ensureSpace(ctx: Ctx, y: number, needed: number): number {
  return y + needed > ctx.ph - FOOTER_RESERVE ? continueSection(ctx) : y
}

/**
 * A labelled list row (label left, figures right).
 *
 * Rows check for space individually so a long list flows onto the next page
 * instead of moving as one block and leaving most of a page blank.
 */
function listRow(ctx: Ctx, y: number, label: string, detail: string, opts: { bold?: boolean } = {}): number {
  const { doc, pw } = ctx
  const contentWidth = pw - MARGIN * 2

  y = ensureSpace(ctx, y, 12)

  doc.setFillColor(...COLORS.bgLight)
  doc.roundedRect(MARGIN, y, contentWidth, 9.5, 1.5, 1.5, "F")
  doc.setFontSize(8.5)
  doc.setFont("helvetica", opts.bold ? "bold" : "normal")
  doc.setTextColor(...COLORS.text)
  doc.text(doc.splitTextToSize(label, contentWidth - 68)[0], MARGIN + 4, y + 6.3)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(...COLORS.textSecondary)
  doc.text(detail, pw - MARGIN - 4, y + 6.3, { align: "right" })

  return y + 11.5
}

/** Heading that keeps at least one row with it. */
function listHeading(ctx: Ctx, y: number, text: string): number {
  return subHeading(ctx, ensureSpace(ctx, y + 3, 24), text)
}

// ============================================
// EXECUTIVE SUMMARY
// ============================================

function drawExecutiveSummary(ctx: Ctx) {
  const { doc, data, pw } = ctx
  const contentWidth = pw - MARGIN * 2
  let y = 30

  y = sectionHeading(ctx, y, "Executive Summary")

  const totalFindings = data.risks.critical + data.risks.high + data.risks.medium + data.risks.low
  const source = data.provenance?.sources?.[0]
  const scope = data.scope

  const subjectsClause = scope?.subjects_absent
    ? "0 bound subjects evaluated (the snapshot contains role-level findings with no bound subject; those findings show Subject: N/A)"
    : `${data.summary.subjects} subjects`

  const summaryText =
    `This report describes a single point-in-time snapshot of ${data.clusters.join(", ")}` +
    (source ? `, captured ${formatTimestamp(source.snapshot_taken_at)} (snapshot ${shortScanId(source.scan_id)})` : "") +
    `. It evaluated ${subjectsClause}, ${data.summary.roles} roles and ${data.summary.bindings} bindings across ` +
    `${scope?.label ?? "the analysed scope"}, and identified ${totalFindings} findings — ` +
    `${data.risks.critical} critical and ${data.risks.high} high severity.`

  y = bodyText(ctx, y, summaryText)
  y += 4

  // ---- stat row ----
  const boxW = (contentWidth - 15) / 4
  const stats = [
    {
      label: scope?.subjects_absent ? "Bound subjects" : "Subjects",
      value: String(data.summary.subjects),
      color: COLORS.accent,
    },
    { label: "Roles", value: String(data.summary.roles), color: COLORS.accent },
    { label: "Bindings", value: String(data.summary.bindings), color: COLORS.accent },
    {
      label: "Findings",
      value: String(totalFindings),
      color: data.risks.critical > 0 ? COLORS.critical : COLORS.accent,
    },
  ]

  stats.forEach((stat, i) => {
    const x = MARGIN + i * (boxW + 5)
    doc.setFillColor(...COLORS.bgLight)
    doc.roundedRect(x, y, boxW, 26, 2, 2, "F")
    doc.setDrawColor(...stat.color)
    doc.setLineWidth(0.8)
    doc.line(x, y, x, y + 26)
    doc.setFontSize(17)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...stat.color)
    doc.text(stat.value, x + 7, y + 13)
    doc.setFontSize(8)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(...COLORS.textSecondary)
    doc.text(stat.label, x + 7, y + 21)
  })
  y += 38

  // ---- posture score, with the cap explained ----
  const score = data.security_score
  if (score?.available) {
    y = subHeading(ctx, y, "Posture score")

    doc.setFillColor(...COLORS.bgLight)
    doc.roundedRect(MARGIN, y, contentWidth, 30, 2, 2, "F")

    doc.setFontSize(26)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...COLORS.text)
    doc.text(String(score.score), MARGIN + 8, y + 20)
    doc.setFontSize(9)
    doc.setTextColor(...COLORS.textSecondary)
    doc.setFont("helvetica", "normal")
    doc.text("/ 100", MARGIN + 30, y + 20)

    doc.setFontSize(9)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...COLORS.text)
    doc.text(`Band: ${bandLabel(score.band)}`, MARGIN + 50, y + 11)

    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    doc.setTextColor(...COLORS.textSecondary)
    const capText =
      describeCap(score) ??
      `Calculated score: ${score.uncappedScore}. No severity cap applied — no unresolved critical or high findings.`
    const capLines = doc.splitTextToSize(capText, contentWidth - 58)
    doc.text(capLines, MARGIN + 50, y + 17)

    y += 40

    // Top score drivers — the whitespace this page used to waste.
    const drivers = [...score.domains].filter((d) => d.score < 100).sort((a, b) => a.score - b.score).slice(0, 4)
    if (drivers.length > 0) {
      y = listHeading(ctx, y, "Top score drivers")
      for (const driver of drivers) {
        y = listRow(
          ctx,
          y,
          driver.label,
          `${driver.findingCount} finding(s) · domain score ${driver.score}/100 · weight ${driver.weight}`,
        )
      }
      y += 3
    }
  }

  // ---- scope + collection gaps ----
  y = ensureSpace(ctx, y, 50)
  y = subHeading(ctx, y, "Scope")
  y = bodyText(
    ctx,
    y,
    scope
      ? `${scope.label}. Cluster-scoped grants (ClusterRoleBindings) are counted separately from namespaces — ${scope.cluster_scoped_bindings} cluster-scoped binding(s) were evaluated. Namespaces analysed: ${
          scope.namespaces.length > 0 ? scope.namespaces.join(", ") : "none"
        }.`
      : "Scope not recorded for this report.",
    { size: 9 },
  )

  if (scope?.collection_gaps?.length) {
    y = ensureSpace(ctx, y, 14 + scope.collection_gaps.length * 6)
    y = subHeading(ctx, y, "Not collected")
    doc.setFontSize(8.5)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(...COLORS.textSecondary)
    for (const gap of scope.collection_gaps) {
      const lines = doc.splitTextToSize(`•  ${gap}`, contentWidth - 4)
      doc.text(lines, MARGIN + 2, y)
      y += lines.length * 4.6 + 1.5
    }
  }
}

// ============================================
// RISK SUMMARY
// ============================================

function drawRiskSummary(ctx: Ctx) {
  const { doc, data, pw } = ctx
  const contentWidth = pw - MARGIN * 2
  let y = 30

  y = sectionHeading(ctx, y, "Risk Summary")

  const total = data.risks.critical + data.risks.high + data.risks.medium + data.risks.low

  const cardW = (contentWidth - 15) / 4
  const severities = [
    { label: "Critical", count: data.risks.critical, colors: SEVERITY_COLORS.critical },
    { label: "High", count: data.risks.high, colors: SEVERITY_COLORS.high },
    { label: "Medium", count: data.risks.medium, colors: SEVERITY_COLORS.medium },
    { label: "Low", count: data.risks.low, colors: SEVERITY_COLORS.low },
  ]

  severities.forEach((sev, i) => {
    const x = MARGIN + i * (cardW + 5)
    doc.setFillColor(...sev.colors.bg)
    doc.roundedRect(x, y, cardW, 34, 3, 3, "F")
    doc.setFillColor(...sev.colors.text)
    doc.rect(x, y, cardW, 3.5, "F")
    doc.setFontSize(20)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...sev.colors.text)
    doc.text(String(sev.count), x + cardW / 2, y + 20, { align: "center" })
    doc.setFontSize(9)
    doc.setFont("helvetica", "normal")
    // Full word, never an abbreviation or a colour swatch alone.
    doc.text(sev.label, x + cardW / 2, y + 29, { align: "center" })
  })
  y += 44

  if (total > 0) {
    y = subHeading(ctx, y, "Severity distribution")
    const barHeight = 9
    let barX = MARGIN
    const segments = [
      { count: data.risks.critical, color: COLORS.critical, label: "Critical" },
      { count: data.risks.high, color: COLORS.high, label: "High" },
      { count: data.risks.medium, color: COLORS.medium, label: "Medium" },
      { count: data.risks.low, color: COLORS.low, label: "Low" },
    ]

    for (const seg of segments) {
      if (seg.count === 0) continue
      const segW = (seg.count / total) * contentWidth
      doc.setFillColor(...seg.color)
      doc.rect(barX, y, segW, barHeight, "F")
      barX += segW
    }
    y += barHeight + 6

    segments.forEach((seg, i) => {
      const legendX = MARGIN + i * 44
      doc.setFillColor(...seg.color)
      doc.rect(legendX, y - 3.5, 4.5, 4.5, "F")
      doc.setFontSize(8)
      doc.setFont("helvetica", "normal")
      doc.setTextColor(...COLORS.textSecondary)
      // Label + count in text: the bar is never the only carrier of meaning.
      doc.text(`${seg.label} ${seg.count}`, legendX + 6.5, y)
    })
    y += 12
  }

  // ---- risk delta vs the previous snapshot of the same cluster ----
  const trend = data.trend_analysis
  if (trend?.risk_changes?.length) {
    y = ensureSpace(ctx, y, 40)
    y = subHeading(ctx, y, "Change since previous snapshot")
    for (const change of trend.risk_changes) {
      doc.setFillColor(...COLORS.bgLight)
      doc.roundedRect(MARGIN, y, contentWidth, 9, 1.5, 1.5, "F")
      doc.setFontSize(8.5)
      doc.setTextColor(...COLORS.text)
      doc.setFont("helvetica", "normal")
      doc.text(capitalise(change.severity), MARGIN + 4, y + 6)
      const arrow = change.change > 0 ? "worse" : change.change < 0 ? "better" : "no change"
      doc.setTextColor(...COLORS.textSecondary)
      doc.text(
        `${change.previous} → ${change.current}  (${change.change > 0 ? "+" : ""}${change.change}, ${arrow})`,
        pw - MARGIN - 4,
        y + 6,
        { align: "right" },
      )
      y += 11
    }
    y += 3
  }

  // ---- top namespaces: where the risk actually sits ----
  const topNamespaces = data.scope?.top_namespaces ?? []
  if (topNamespaces.length > 0) {
    y = listHeading(ctx, y, "Where the risk sits")
    doc.setFontSize(8)
    doc.setTextColor(...COLORS.textSecondary)
    doc.setFont("helvetica", "normal")
    doc.text("Cluster-wide is a scope, not a namespace, and is listed separately.", MARGIN, y)
    y += 7

    for (const ns of topNamespaces) {
      y = listRow(
        ctx,
        y,
        ns.namespace,
        `Critical ${ns.critical} · High ${ns.high} · ${ns.total} finding(s)`,
        { bold: true },
      )
    }
  }

  // ---- category breakdown (computed for every report type) ----
  const categories = data.scope?.categories ?? []
  if (categories.length > 0) {
    y = listHeading(ctx, y, "Findings by category")
    for (const entry of categories) {
      y = listRow(
        ctx,
        y,
        capitalise(entry.category.replace(/_/g, " ").toLowerCase()),
        `${entry.count} finding(s)`,
        { bold: true },
      )
    }
  }

}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// ============================================
// TOP FINDINGS
// ============================================

function drawTopFindings(ctx: Ctx) {
  const { doc, data, pw } = ctx
  const contentWidth = pw - MARGIN * 2
  let y = 30

  const groups = data.grouped_findings ?? []
  const shown = groups.slice(0, 10)
  const totalFindings = data.findings.length

  y = sectionHeading(ctx, y, "Top Security Findings")

  // Say exactly what this list is and how it was ordered.
  y = bodyText(
    ctx,
    y,
    `Top ${shown.length} of ${totalFindings} findings, ranked by severity and blast radius. Repeated findings are grouped: one row per rule, with the number of affected roles and the namespaces involved.`,
    { size: 8.5 },
  )
  y += 2

  // The concrete objects to go and fix, before the rule-level detail.
  const topRoles = data.scope?.top_roles ?? []
  if (topRoles.length > 0) {
    y = listHeading(ctx, y, "Most affected roles")
    for (const role of topRoles) {
      y = listRow(ctx, y, role.role, `Critical ${role.critical} · High ${role.high} · ${role.total} finding(s)`)
    }
    y += 4
  }

  for (const group of shown) {
    y = drawFindingGroup(ctx, y, group, contentWidth)
  }

  if (groups.length > shown.length) {
    y = ensureSpace(ctx, y, 12)
    doc.setFontSize(8)
    doc.setFont("helvetica", "italic")
    doc.setTextColor(...COLORS.textSecondary)
    doc.text(
      `${groups.length - shown.length} further finding group(s) omitted. Export as JSON or CSV for the complete set, or open the snapshot in KubeScope.`,
      MARGIN,
      y + 4,
    )
  }
}

function drawFindingGroup(ctx: Ctx, startY: number, group: FindingGroup, contentWidth: number): number {
  const { doc, pw } = ctx

  const sevColors = SEVERITY_COLORS[group.severity as keyof typeof SEVERITY_COLORS] ?? SEVERITY_COLORS.low

  // Measure first so a card is never split across a page break.
  doc.setFontSize(8)
  const whyLines = doc.splitTextToSize(`Why it matters: ${group.why_it_matters}`, contentWidth - 10)
  const fixLines = doc.splitTextToSize(`Remediation: ${group.remediation}`, contentWidth - 10)
  const scopeText = buildGroupScopeLine(group)
  const scopeLines = doc.splitTextToSize(scopeText, contentWidth - 10)
  const cardHeight = 20 + whyLines.length * 3.9 + fixLines.length * 3.9 + scopeLines.length * 3.9

  let y = ensureSpace(ctx, startY, cardHeight + 6)

  doc.setFillColor(...COLORS.bgLight)
  doc.roundedRect(MARGIN, y, contentWidth, cardHeight, 2, 2, "F")
  doc.setDrawColor(...sevColors.text)
  doc.setLineWidth(0.9)
  doc.line(MARGIN, y, MARGIN, y + cardHeight)

  // Severity badge — the full word, plus the count of affected objects.
  doc.setFillColor(...sevColors.bg)
  doc.roundedRect(MARGIN + 4, y + 3.5, 20, 6.5, 1, 1, "F")
  doc.setFontSize(6.5)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...sevColors.text)
  doc.text(capitalise(group.severity), MARGIN + 14, y + 8.1, { align: "center" })

  doc.setFontSize(9.5)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...COLORS.text)
  const titleLines = doc.splitTextToSize(group.title, contentWidth - 62)
  doc.text(titleLines[0], MARGIN + 27, y + 8.6)

  doc.setFontSize(7.5)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(...COLORS.textSecondary)
  doc.text(`${group.count} affected`, pw - MARGIN - 4, y + 8.6, { align: "right" })

  let textY = y + 15
  doc.setFontSize(7.5)
  doc.setTextColor(...COLORS.textSecondary)
  doc.text(scopeLines, MARGIN + 5, textY)
  textY += scopeLines.length * 3.9 + 1.5

  doc.setTextColor(...COLORS.text)
  doc.text(whyLines, MARGIN + 5, textY)
  textY += whyLines.length * 3.9 + 1.5

  doc.setTextColor(...COLORS.textSecondary)
  doc.text(fixLines, MARGIN + 5, textY)

  return y + cardHeight + 5
}

/** Affected roles / subjects / namespaces and the finding ids, in one line. */
function buildGroupScopeLine(group: FindingGroup): string {
  const parts: string[] = []

  const scopes = [...(group.cluster_scoped ? ["Cluster-wide"] : []), ...group.namespaces]
  parts.push(
    scopes.length > 0
      ? `Scope: ${scopes.slice(0, 4).join(", ")}${scopes.length > 4 ? ` +${scopes.length - 4} more` : ""}`
      : "Scope: not recorded",
  )

  if (group.roles.length > 0) {
    parts.push(
      `Roles: ${group.roles.slice(0, 3).join(", ")}${group.roles.length > 3 ? ` +${group.roles.length - 3} more` : ""}`,
    )
  }

  // Subject: N/A is explained rather than left blank — a role-level finding
  // legitimately has no bound subject.
  const subjects = group.subjects.filter((s) => s && s !== "N/A" && s !== "-")
  parts.push(
    subjects.length > 0
      ? `Subjects: ${subjects.slice(0, 3).join(", ")}${subjects.length > 3 ? ` +${subjects.length - 3} more` : ""}`
      : "Subjects: N/A (role-level finding — no subject is bound to this role)",
  )

  parts.push(
    `Finding ID: ${group.finding_ids.slice(0, 2).join(", ")}${
      group.finding_ids.length > 2 ? ` +${group.finding_ids.length - 2} more` : ""
    }`,
  )

  return parts.join("  ·  ")
}

// ============================================
// REMEDIATION PRIORITIES
// ============================================

function drawPriorities(ctx: Ctx) {
  const { doc, data, pw } = ctx
  const contentWidth = pw - MARGIN * 2
  let y = 30

  y = sectionHeading(ctx, y, "Remediation Priorities")
  y = bodyText(
    ctx,
    y,
    "Ordered by severity and by how much of the posture score each item is worth. Gains are computed by re-scoring the snapshot with the group resolved, using the same model as the KubeScope dashboard. They apply to the calculated score: the displayed score stays at its cap until every critical finding is closed.",
    { size: 8.5 },
  )
  y += 2

  const priorities = data.priorities ?? []
  for (const priority of priorities) {
    y = drawPriority(ctx, y, priority, contentWidth)
  }

  // Fall back to the generic list only when there is nothing evidence-backed.
  if (priorities.length === 0) {
    const recommendations = data.compliance?.recommendations ?? []
    for (const [index, rec] of recommendations.entries()) {
      y = ensureSpace(ctx, y, 20)
      doc.setFillColor(...COLORS.bgLight)
      const lines = doc.splitTextToSize(rec, contentWidth - 25)
      const height = Math.max(16, lines.length * 4.6 + 8)
      doc.roundedRect(MARGIN, y, contentWidth, height, 2, 2, "F")
      doc.setFillColor(...COLORS.accent)
      doc.circle(MARGIN + 8, y + 8, 4.5, "F")
      doc.setFontSize(8)
      doc.setFont("helvetica", "bold")
      doc.setTextColor(...COLORS.white)
      doc.text(String(index + 1), MARGIN + 8, y + 10, { align: "center" })
      doc.setFont("helvetica", "normal")
      doc.setTextColor(...COLORS.text)
      doc.text(lines, MARGIN + 17, y + 7)
      y += height + 4
    }
  }
}

function drawPriority(ctx: Ctx, startY: number, priority: RemediationPriority, contentWidth: number): number {
  const { doc, pw } = ctx

  doc.setFontSize(8)
  const whyLines = doc.splitTextToSize(priority.why_it_matters, contentWidth - 22)
  const actionLines = doc.splitTextToSize(`Action: ${priority.action}`, contentWidth - 22)
  const evidence = buildEvidenceLine(priority)
  const evidenceLines = doc.splitTextToSize(evidence, contentWidth - 22)
  const cardHeight = 18 + whyLines.length * 3.9 + actionLines.length * 3.9 + evidenceLines.length * 3.9

  let y = ensureSpace(ctx, startY, cardHeight + 6)

  doc.setFillColor(...COLORS.bgLight)
  doc.roundedRect(MARGIN, y, contentWidth, cardHeight, 2, 2, "F")

  doc.setFillColor(...COLORS.accent)
  doc.circle(MARGIN + 9, y + 9, 5, "F")
  doc.setFontSize(9)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...COLORS.white)
  doc.text(String(priority.rank), MARGIN + 9, y + 11.4, { align: "center" })

  doc.setFontSize(9.5)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...COLORS.text)
  const titleLines = doc.splitTextToSize(priority.title, contentWidth - 70)
  doc.text(titleLines[0], MARGIN + 18, y + 9)

  if (priority.expected_score_gain > 0) {
    doc.setFontSize(7.5)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...COLORS.low)
    // "calculated score" is explicit: while criticals remain open the
    // displayed score stays pinned at its cap, and claiming a rise in the
    // displayed number would be wrong.
    doc.text(`+${priority.expected_score_gain} pts calculated score`, pw - MARGIN - 4, y + 9, { align: "right" })
  }

  let textY = y + 15.5
  doc.setFontSize(7.5)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(...COLORS.text)
  doc.text(whyLines, MARGIN + 18, textY)
  textY += whyLines.length * 3.9 + 1.5

  doc.setTextColor(...COLORS.textSecondary)
  doc.text(actionLines, MARGIN + 18, textY)
  textY += actionLines.length * 3.9 + 1.5

  doc.text(evidenceLines, MARGIN + 18, textY)

  return y + cardHeight + 5
}

function buildEvidenceLine(priority: RemediationPriority): string {
  const parts: string[] = [`Evidence: ${priority.finding_count} finding(s)`]

  if (priority.affected_namespaces.length > 0) {
    parts.push(`Affected scope: ${priority.affected_namespaces.slice(0, 4).join(", ")}`)
  }
  if (priority.example_roles.length > 0) {
    parts.push(`Example roles: ${priority.example_roles.slice(0, 3).join(", ")}`)
  }
  parts.push(
    priority.example_subjects.length > 0
      ? `Example subjects: ${priority.example_subjects.slice(0, 2).join(", ")}`
      : "Subjects: none bound (role-level findings)",
  )
  parts.push(`Suggested owner: ${priority.suggested_owner}`)

  return parts.join("  ·  ")
}

// ============================================
// RBAC ACCESS MATRIX
// ============================================

function drawRBACTable(ctx: Ctx) {
  const { doc, data, pw, ph } = ctx
  const rows: FlatRBACRow[] = data.rbac_rows
  let y = 30

  y = sectionHeading(ctx, y, "RBAC Access Matrix")

  const displayRows = rows.slice(0, 100)
  y = bodyText(
    ctx,
    y,
    `Showing ${displayRows.length} of ${rows.length} subject-to-permission rows. "Cluster-wide" in the Scope column means the grant is not namespaced.`,
    { size: 8.5 },
  )

  autoTable(doc, {
    startY: y,
    head: [["Subject", "Type", "Scope", "Role", "Resource", "Verbs", "Risk"]],
    body: displayRows.map((r) => [r.subject, r.type, r.namespace, r.role, r.resource, r.verbs, capitalise(r.risk)]),
    margin: { left: MARGIN, right: MARGIN, top: 30, bottom: FOOTER_RESERVE },
    styles: { fontSize: 7, cellPadding: 2, lineColor: COLORS.border, lineWidth: 0.1, textColor: COLORS.text },
    headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontStyle: "bold", fontSize: 7 },
    alternateRowStyles: { fillColor: COLORS.bgLight },
    // Sums to 165mm against 170mm of usable width (A4 less 20mm margins),
    // leaving room for the cell borders so jsPDF-autotable never has to shrink
    // a column to make the row fit.
    columnStyles: {
      // "ServiceAccount" is 14 characters and must not break mid-word, which
      // fixes the Type column's minimum width; the remaining columns are sized
      // around it. Verbs wrap between commas, which reads naturally.
      0: { cellWidth: 32 },
      1: { cellWidth: 26 },
      2: { cellWidth: 20 },
      3: { cellWidth: 26 },
      4: { cellWidth: 21 },
      5: { cellWidth: 27 },
      6: { cellWidth: 14 },
    },
    // Keep the running header/footer identical on every page the table spills
    // onto, and label the continuation.
    didDrawPage(hookData) {
      if (hookData.pageNumber > 1) drawPageHeader(ctx, true)
    },
    didParseCell(cellData) {
      if (cellData.section === "body" && cellData.column.index === 6) {
        const risk = String(cellData.cell.raw).toLowerCase()
        const colors: Record<string, [number, number, number]> = {
          critical: COLORS.critical,
          high: COLORS.high,
          medium: COLORS.medium,
          low: COLORS.low,
        }
        if (colors[risk]) {
          cellData.cell.styles.textColor = colors[risk]
          if (risk === "critical" || risk === "high") cellData.cell.styles.fontStyle = "bold"
        }
      }
    },
  })

  if (rows.length > 100) {
    const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20
    const noteY = finalY + 8 > ph - FOOTER_RESERVE ? continueSection(ctx) : finalY + 8
    doc.setFontSize(8)
    doc.setFont("helvetica", "italic")
    doc.setTextColor(...COLORS.textSecondary)
    doc.text(`Showing 100 of ${rows.length} total rows. Export as CSV for the complete dataset.`, MARGIN, noteY)
  }
}

// ============================================
// SCOPE & METHODOLOGY
// ============================================

function drawScopeAndMethodology(ctx: Ctx) {
  const { doc, data, pw } = ctx
  const contentWidth = pw - MARGIN * 2
  let y = 30

  y = sectionHeading(ctx, y, "Scope & Methodology")

  y = subHeading(ctx, y, "Source snapshots")
  const sources = data.provenance?.sources ?? []
  if (sources.length === 0) {
    y = bodyText(ctx, y, "This report predates provenance tracking; its source snapshot was not recorded.", {
      size: 9,
    })
  } else {
    for (const source of sources) {
      y = ensureSpace(ctx, y, 26)
      doc.setFillColor(...COLORS.bgLight)
      doc.roundedRect(MARGIN, y, contentWidth, 22, 2, 2, "F")
      doc.setFontSize(9)
      doc.setFont("helvetica", "bold")
      doc.setTextColor(...COLORS.text)
      doc.text(`${source.cluster_name} — ${source.file_name}`, MARGIN + 4, y + 7)
      doc.setFont("helvetica", "normal")
      doc.setFontSize(7.5)
      doc.setTextColor(...COLORS.textSecondary)
      doc.text(
        `Snapshot ${source.scan_id} · captured ${formatTimestamp(source.snapshot_taken_at)} · ${
          source.is_latest ? "latest snapshot of this cluster" : "earlier snapshot — a newer one exists"
        }`,
        MARGIN + 4,
        y + 13,
      )
      doc.text(
        `${source.totals.roles} roles · ${source.totals.bindings} bindings · ${source.bound_subjects} bound subject(s) · ${source.namespace_count} namespaces + ${source.cluster_scoped_bindings} cluster-scoped binding(s)`,
        MARGIN + 4,
        y + 18,
      )
      y += 27
    }
  }

  y = ensureSpace(ctx, y, 40)
  y = subHeading(ctx, y, "How the score is calculated")
  y = bodyText(
    ctx,
    y,
    "The posture score is a weighted average of eight control-domain scores (cluster-admin sprawl, privilege escalation, secret access, workload execution, wildcards, identity hygiene, node access, and binding scope discipline). Each domain measures the fraction of the evaluated surface that is compromised, weighted by severity (critical 1.0, high 0.6, medium 0.3, low 0.1) and by scope (cluster-scoped grants count 1.5x). The headline score is then capped by the worst severity still open: any critical caps it at 74, any high at 89. The cap is reported, never hidden.",
    { size: 8.5 },
  )

  y = ensureSpace(ctx, y, 34)
  y = subHeading(ctx, y, "Terminology")
  y = bodyText(
    ctx,
    y,
    'Cluster-wide is a scope, not a namespace. ClusterRoles and ClusterRoleBindings apply across the whole cluster and are counted separately from namespaced objects throughout this report — a snapshot with seven namespaces and cluster-scoped grants is described as "7 namespaces + cluster-wide permissions", never as eight namespaces. Subject: N/A marks a role-level finding: the permission is dangerous but no subject is currently bound to the role. Those findings are real and are counted; they simply have no subject to name.',
    { size: 8.5 },
  )

  y = ensureSpace(ctx, y, 26)
  y = subHeading(ctx, y, "Coverage limits")
  y = bodyText(
    ctx,
    y,
    "This report covers Kubernetes RBAC objects only: Roles, ClusterRoles, RoleBindings, and ClusterRoleBindings, plus the subjects they bind. Pod Security concerns (hostPath mounts, privileged containers), admission control, network policy, and image provenance are out of scope and are not evaluated here. Fields listed as Not collected are absent from the snapshot format rather than empty in the cluster.",
    { size: 8.5 },
  )
}
