"use client"

import { ArrowDown, ArrowUp, Minus } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * A delta against a named baseline.
 *
 * Renders nothing when `delta` is null — a first snapshot has no baseline, and
 * showing "+0" would imply one exists.
 */
export function TrendDelta({
  delta,
  higherIsWorse = false,
  baselineLabel,
  suffix = "",
  className,
}: {
  delta: number | null | undefined
  higherIsWorse?: boolean
  baselineLabel?: string
  suffix?: string
  className?: string
}) {
  if (delta === null || delta === undefined) return null

  const isFlat = delta === 0
  const isGood = higherIsWorse ? delta < 0 : delta > 0
  const Icon = isFlat ? Minus : delta > 0 ? ArrowUp : ArrowDown

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium tabular",
        isFlat ? "text-muted-foreground" : isGood ? "text-sev-pass" : "text-sev-high",
        className,
      )}
      title={baselineLabel ? `Compared with ${baselineLabel}` : undefined}
    >
      <Icon className="w-3 h-3" aria-hidden />
      {isFlat ? "no change" : `${delta > 0 ? "+" : ""}${delta}${suffix}`}
      {baselineLabel && <span className="text-muted-foreground font-normal">vs {baselineLabel}</span>}
    </span>
  )
}
