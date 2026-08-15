"use client"

import { cn } from "@/lib/utils"
import { BAND_LABEL, scoreBand } from "@/lib/scoring"
import { BAND_STROKE, BAND_TEXT } from "./severity"

type Size = "sm" | "md" | "lg"

const DIMENSIONS: Record<Size, { box: number; stroke: number; value: string; label: string }> = {
  sm: { box: 24, stroke: 3, value: "text-[10px]", label: "hidden" },
  md: { box: 48, stroke: 4, value: "text-sm", label: "text-[10px]" },
  lg: { box: 72, stroke: 6, value: "text-xl", label: "text-[11px]" },
}

/**
 * The score ring, at three fixed sizes.
 *
 * The band word ("Moderate") sits under the number at md/lg so the score never
 * has to be interpreted from colour alone.
 */
export function ScoreRing({
  score,
  size = "lg",
  showBand = true,
  className,
}: {
  /** null renders an explicit "not computed" ring — never a zero. */
  score: number | null
  size?: Size
  showBand?: boolean
  className?: string
}) {
  const dim = DIMENSIONS[size]

  if (score === null) {
    return (
      <div
        className={cn("inline-flex flex-col items-center justify-center", className)}
        title="Score needs the full snapshot — open the analysis to compute it."
      >
        <div
          className="rounded-full border-dashed border-muted-foreground/30 flex items-center justify-center"
          style={{ width: dim.box, height: dim.box, borderWidth: dim.stroke }}
        >
          <span className={cn("font-semibold text-muted-foreground", dim.value)}>—</span>
        </div>
        {showBand && size !== "sm" && (
          <span className={cn("mt-1 font-medium text-muted-foreground", dim.label)}>Not computed</span>
        )}
      </div>
    )
  }

  const band = scoreBand(score)
  const radius = (dim.box - dim.stroke) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(100, score))
  const dash = (clamped / 100) * circumference

  return (
    <div className={cn("inline-flex flex-col items-center justify-center", className)}>
      <div className="relative" style={{ width: dim.box, height: dim.box }}>
        <svg width={dim.box} height={dim.box} className="-rotate-90" role="img" aria-label={`Security score ${clamped} out of 100, ${BAND_LABEL[band]}`}>
          <circle
            cx={dim.box / 2}
            cy={dim.box / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={dim.stroke}
            className="text-muted-foreground/20"
          />
          <circle
            cx={dim.box / 2}
            cy={dim.box / 2}
            r={radius}
            fill="none"
            stroke={BAND_STROKE[band]}
            strokeWidth={dim.stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference - dash}`}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn("font-semibold tabular", dim.value, BAND_TEXT[band])}>{clamped}</span>
        </div>
      </div>
      {showBand && size !== "sm" && (
        <span className={cn("mt-1 font-medium text-muted-foreground", dim.label)}>{BAND_LABEL[band]}</span>
      )}
    </div>
  )
}
