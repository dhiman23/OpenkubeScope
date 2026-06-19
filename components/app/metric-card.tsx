"use client"

import { motion, useMotionValue, useTransform, animate } from "framer-motion"
import { useEffect, useRef, memo } from "react"
import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

interface MetricCardProps {
  title: string
  value: number
  icon: LucideIcon
  trend?: {
    value: number
    isPositive: boolean
  }
  color?: "default" | "success" | "warning" | "destructive"
  delay?: number
}

export const MetricCard = memo(function MetricCard({
  title,
  value,
  icon: Icon,
  trend,
  color = "default",
  delay = 0,
}: MetricCardProps) {
  const nodeRef = useRef<HTMLSpanElement>(null)
  const prevValue = useRef(0)

  useEffect(() => {
    const node = nodeRef.current
    if (!node) return

    const controls = animate(prevValue.current, value, {
      duration: 1,
      delay,
      ease: [0.16, 1, 0.3, 1],
      onUpdate(v) {
        node.textContent = Math.round(v).toLocaleString()
      },
    })

    prevValue.current = value
    return () => controls.stop()
  }, [value, delay])

  const colorClasses = {
    default: "text-primary",
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
  }

  const bgClasses = {
    default: "bg-primary/10",
    success: "bg-success/10",
    warning: "bg-warning/10",
    destructive: "bg-destructive/10",
  }

  return (
    <motion.div
      className="relative group"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      whileHover={{ y: -4 }}
    >
      <div className="relative glass-card p-6 transition-all duration-300 group-hover:glow-sm overflow-hidden">
        {/* Hover gradient */}
        <div
          className={cn(
            "absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300",
            bgClasses[color]
          )}
          style={{ filter: "blur(40px)" }}
        />

        <div className="relative z-10">
          <div className="flex items-start justify-between">
            <div className={cn("p-2 rounded-xl", bgClasses[color])}>
              <Icon className={cn("w-5 h-5", colorClasses[color])} />
            </div>
            {trend && (
              <span
                className={cn(
                  "text-xs font-medium px-2 py-1 rounded-full",
                  trend.isPositive
                    ? "bg-success/10 text-success"
                    : "bg-destructive/10 text-destructive"
                )}
              >
                {trend.isPositive ? "+" : "-"}
                {Math.abs(trend.value)}%
              </span>
            )}
          </div>

          <div className="mt-4">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="mt-1 text-3xl font-bold tracking-tight">
              <span ref={nodeRef}>0</span>
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  )
})
