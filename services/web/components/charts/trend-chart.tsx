"use client"

import { useRouter } from "next/navigation"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

export interface TrendPoint {
  scanId: string
  timestamp: number
  dateLabel: string
  score: number
  critical: number
  high: number
}

/**
 * Score over time.
 *
 * The X axis is real elapsed time, not snapshot index, so a gap in scanning
 * shows up as a gap. With fewer than two snapshots the chart is replaced by a
 * prompt rather than a misleading flat line.
 */
export function TrendChart({ points, height = 220 }: { points: TrendPoint[]; height?: number }) {
  const router = useRouter()

  if (points.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-10" style={{ minHeight: height }}>
        <p className="text-sm font-medium">Not enough history yet</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-xs">
          Upload a second snapshot of this cluster to see how its posture is moving.
        </p>
      </div>
    )
  }

  const sorted = [...points].sort((a, b) => a.timestamp - b.timestamp)
  const min = Math.max(0, Math.min(...sorted.map((p) => p.score)) - 10)
  const max = Math.min(100, Math.max(...sorted.map((p) => p.score)) + 10)

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart
        data={sorted}
        margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
        onClick={(state: { activePayload?: { payload: TrendPoint }[] }) => {
          const point = state?.activePayload?.[0]?.payload
          if (point?.scanId) router.push(`/app/scans/${point.scanId}`)
        }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="dateLabel"
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickLine={false}
          axisLine={{ stroke: "var(--border)" }}
        />
        <YAxis
          domain={[min, max]}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickLine={false}
          axisLine={false}
          width={44}
        />
        <Tooltip
          contentStyle={{
            background: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            fontSize: 12,
          }}
          labelStyle={{ color: "var(--muted-foreground)" }}
          formatter={(value: number, name: string) => [value, name === "score" ? "Security score" : name]}
        />
        <Line
          type="monotone"
          dataKey="score"
          stroke="var(--chart-1)"
          strokeWidth={2}
          dot={{ r: 3, fill: "var(--chart-1)" }}
          activeDot={{ r: 5 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

/** Compact inline trend for cluster cards. */
export function Sparkline({ points, width = 140, height = 32 }: { points: number[]; width?: number; height?: number }) {
  if (points.length < 2) return null
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const step = width / (points.length - 1)
  const path = points
    .map((value, i) => `${i === 0 ? "M" : "L"} ${i * step} ${height - ((value - min) / range) * height}`)
    .join(" ")

  const improving = points[points.length - 1] >= points[0]

  return (
    <svg width={width} height={height} className="overflow-visible" aria-hidden>
      <path
        d={path}
        fill="none"
        stroke={improving ? "var(--sev-pass)" : "var(--sev-high)"}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={(points.length - 1) * step}
        cy={height - ((points[points.length - 1] - min) / range) * height}
        r={2.5}
        fill={improving ? "var(--sev-pass)" : "var(--sev-high)"}
      />
    </svg>
  )
}
