// Client-side exports. Everything a user can see on screen they can take with
// them — CSV for spreadsheets and ticket systems, JSON for pipelines.

import type { Scan, RBACFinding } from "./rbac-scanner"
import { mitreForFinding } from "./mitre"

function triggerDownload(content: string, filename: string, mime: string): void {
  if (typeof window === "undefined") return
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function csvCell(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value)
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (rows.length === 0) return ""
  const cols = columns ?? Object.keys(rows[0])
  const header = cols.map(csvCell).join(",")
  const body = rows.map((row) => cols.map((col) => csvCell(row[col])).join(",")).join("\n")
  return `${header}\n${body}`
}

function slug(scan: Scan): string {
  return (scan.clusterName || scan.fileName || "snapshot").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()
}

export function downloadFindingsCsv(scan: Scan, findings?: RBACFinding[]): void {
  const list = findings ?? scan.dataset?.findings ?? []
  const rows = list.map((f) => ({
    id: f.id,
    severity: f.severity,
    title: f.title,
    category: f.category,
    namespace: f.namespace || "cluster-wide",
    role: f.role,
    subject: f.subject,
    impactedSubjects: (f.impactedSubjects ?? []).length,
    affectedResources: (f.affectedResources ?? []).join(" "),
    mitre: mitreForFinding(f).map((m) => m.techniqueId).join(" "),
    remediation: f.remediation,
  }))
  triggerDownload(toCsv(rows), `${slug(scan)}-findings.csv`, "text/csv;charset=utf-8")
}

export function downloadScanJson(scan: Scan): void {
  triggerDownload(JSON.stringify(scan, null, 2), `${slug(scan)}-snapshot.json`, "application/json")
}

export function downloadCsv(rows: Record<string, unknown>[], filename: string, columns?: string[]): void {
  triggerDownload(toCsv(rows, columns), filename, "text/csv;charset=utf-8")
}

export function downloadText(content: string, filename: string): void {
  triggerDownload(content, filename, "text/plain;charset=utf-8")
}

/** Finding rendered as Markdown — the fallback when no ticket integration is configured. */
export function findingAsMarkdown(finding: RBACFinding, url: string): string {
  const mitre = mitreForFinding(finding)
    .map((m) => `${m.techniqueId} ${m.technique} (${m.tacticId} ${m.tactic})`)
    .join("\n- ")
  return [
    `## [${finding.severity.toUpperCase()}] ${finding.title}`,
    "",
    `**Namespace:** ${finding.namespace || "cluster-wide"}`,
    `**Role:** ${finding.role}`,
    `**Category:** ${finding.category}`,
    `**Impacted subjects:** ${(finding.impactedSubjects ?? []).length}`,
    "",
    `### Description`,
    finding.description,
    "",
    `### MITRE ATT&CK`,
    `- ${mitre}`,
    "",
    `### Remediation`,
    finding.remediation,
    "",
    `---`,
    `Source: ${url}`,
  ].join("\n")
}
