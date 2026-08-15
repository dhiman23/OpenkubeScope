"use client"

import { cn } from "@/lib/utils"
import { SEVERITY_FILL, SEVERITY_LABEL, SEVERITY_ORDER, SEVERITY_TEXT, type Severity } from "@/components/posture/severity"

/**
 * Findings distribution.
 *
 * Bar length is LINEAR in the count. The previous dashboard multiplied the
 * Critical bar by 3, High by 2 and Medium by 1.5, which made the bars
 * impossible to compare and — in a security product — destroys trust the first
 * time someone checks the arithmetic. Severity is encoded by colour, label and
 * sort order; never by exaggerating length.
 */
export function DistributionBars({
  counts,
  onSelect,
  className,
}: {
  counts: Record<Severity, number>
  onSelect?: (severity: Severity) => void
  className?: string
}) {
  const total = SEVERITY_ORDER.reduce((sum, s) => sum + (counts[s] || 0), 0)

  if (total === 0) {
    return <p className={cn("text-sm text-muted-foreground", className)}>No findings in this snapshot.</p>
  }

  return (
    <div className={cn("space-y-3", className)}>
      {SEVERITY_ORDER.map((severity) => {
        const count = counts[severity] || 0
        const pct = (count / total) * 100
        const Row = onSelect ? "button" : "div"
        return (
          <Row
            key={severity}
            {...(onSelect ? { onClick: () => onSelect(severity), type: "button" as const } : {})}
            className={cn(
              "w-full text-left space-y-1.5",
              onSelect && "rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            <div className="flex items-center justify-between text-sm">
              <span className={cn("font-medium", SEVERITY_TEXT[severity])}>{SEVERITY_LABEL[severity]}</span>
              <span className="tabular text-muted-foreground">
                <span className="text-foreground font-medium">{count}</span> · {Math.round(pct)}%
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={cn("h-full rounded-full", SEVERITY_FILL[severity])}
                style={{ width: `${pct}%` }}
              />
            </div>
          </Row>
        )
      })}
    </div>
  )
}
