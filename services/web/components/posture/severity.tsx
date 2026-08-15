"use client"

import { cn } from "@/lib/utils"
import type { RBACFinding } from "@/lib/rbac-scanner"
import type { ScoreBand } from "@/lib/scoring"

export type Severity = RBACFinding["severity"]

// Severity is never encoded by colour alone: every usage below pairs the colour
// with a glyph and a text label so it survives colour-blindness and greyscale
// screenshots pasted into tickets.

export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low"]

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
}

export const SEVERITY_TEXT: Record<Severity, string> = {
  critical: "text-sev-critical",
  high: "text-sev-high",
  medium: "text-sev-medium",
  low: "text-sev-low",
}

export const SEVERITY_BG: Record<Severity, string> = {
  critical: "bg-sev-critical-bg",
  high: "bg-sev-high-bg",
  medium: "bg-sev-medium-bg",
  low: "bg-sev-low-bg",
}

export const SEVERITY_FILL: Record<Severity, string> = {
  critical: "bg-sev-critical",
  high: "bg-sev-high",
  medium: "bg-sev-medium",
  low: "bg-sev-low",
}

export const BAND_TEXT: Record<ScoreBand, string> = {
  strong: "text-band-strong",
  moderate: "text-band-moderate",
  weak: "text-band-weak",
  critical: "text-band-critical",
}

export const BAND_STROKE: Record<ScoreBand, string> = {
  strong: "var(--band-strong)",
  moderate: "var(--band-moderate)",
  weak: "var(--band-weak)",
  critical: "var(--band-critical)",
}

export function SeverityDot({ severity, className }: { severity: Severity; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block w-2 h-2 rounded-full shrink-0", SEVERITY_FILL[severity], className)}
    />
  )
}

/**
 * Severity badge.
 *
 * `compact` used to truncate the label to a single letter, which rendered as
 * "•••• C" beside a dot row — unreadable, and colour plus an initial is not an
 * accessible way to convey severity. Compact now only tightens the padding and
 * type size; the word is always spelled out, and the dot is decorative.
 */
export function SeverityBadge({
  severity,
  className,
  compact = false,
}: {
  severity: Severity
  className?: string
  compact?: boolean
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium",
        compact ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-xs",
        SEVERITY_BG[severity],
        SEVERITY_TEXT[severity],
        className,
      )}
    >
      <SeverityDot severity={severity} />
      {SEVERITY_LABEL[severity]}
    </span>
  )
}

/** 4-dot risk glyph plus text — used in the viewer's Risk column. */
export function RiskGlyph({ level, className }: { level: 0 | 1 | 2 | 3 | 4; className?: string }) {
  const severity: Severity = level >= 4 ? "critical" : level === 3 ? "high" : level === 2 ? "medium" : "low"
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span className="flex gap-0.5" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              i <= level ? SEVERITY_FILL[severity] : "bg-muted-foreground/25",
            )}
          />
        ))}
      </span>
      {/* Spelled out: "Crit" and "Med" beside a dot row read as noise, and the
          dots alone would make severity a colour-only signal. */}
      <span className={cn("text-xs font-medium", SEVERITY_TEXT[severity])}>{SEVERITY_LABEL[severity]}</span>
    </span>
  )
}
