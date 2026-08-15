"use client"

import { useState } from "react"
import { Info, X } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * The one way this product renders data it does not have.
 *
 * A bare "—" is indistinguishable from a zero, a loading state, or a bug. Every
 * absent field instead says what is missing, why it matters, and how to collect
 * it — which is also the design spec's rule: "Absent data is displayed as
 * absent, never as zero", and never without a route to fixing it.
 */

export type NotCollectedField =
  | "kubernetesVersion"
  | "duration"
  | "hostPath"
  | "privileged"
  | "workloads"
  | "environment"
  | "anonymousAccess"

interface FieldCopy {
  label: string
  /** Why a reader should care that this is missing. */
  why: string
  /** What to do about it. */
  how: string
  /** Where the instructions live. */
  href: string
}

export const NOT_COLLECTED_COPY: Record<NotCollectedField, FieldCopy> = {
  kubernetesVersion: {
    label: "Kubernetes version",
    why: "Version-specific RBAC defaults and known escalation paths cannot be checked without it.",
    how: "Add metadata.json to the collector output — an RBAC snapshot alone does not carry the cluster version.",
    href: "/docs/upload-snapshot#metadata",
  },
  duration: {
    label: "Scan duration",
    why: "Without start and end times a slow or partial collection looks identical to a fast, complete one.",
    how: "Upgrade the scanner service; it records scan timings from v2 snapshots onward.",
    href: "/docs/upload-snapshot#metadata",
  },
  hostPath: {
    label: "HostPath mounts",
    why: "HostPath mounts break container isolation, but they are a Pod Security property and are not present in RBAC objects.",
    how: "Collect workload manifests as well as RBAC objects to evaluate Pod Security alongside this report.",
    href: "/docs/security-privacy#scope",
  },
  privileged: {
    label: "Privileged containers",
    why: "A privileged container is equivalent to root on the node, which no RBAC rule can constrain.",
    how: "Collect workload manifests as well as RBAC objects to evaluate Pod Security alongside this report.",
    href: "/docs/security-privacy#scope",
  },
  workloads: {
    label: "Workloads",
    why: "Without workloads a ServiceAccount's permissions cannot be tied to what is actually running.",
    how: "Include Deployments, StatefulSets, DaemonSets and Pods in the snapshot to map identities to workloads.",
    href: "/docs/upload-snapshot#workloads",
  },
  environment: {
    label: "Environment",
    why: "Production and development clusters warrant different thresholds; unlabelled clusters are all treated alike.",
    how: "Label the cluster from the clusters page to mark it as production, staging, or development.",
    href: "/app/clusters",
  },
  anonymousAccess: {
    label: "Anonymous access",
    why: "Anonymous API access is decided by API-server flags, which are not visible in an RBAC snapshot.",
    how: "Collect API-server configuration to evaluate anonymous and unauthenticated access.",
    href: "/docs/security-privacy#scope",
  },
}

/**
 * Inline "Not collected" value with an info affordance.
 *
 * Renders in place of a number: the label stays, the value reads "Not
 * collected", and the info button opens the explanation plus how to collect it.
 */
export function NotCollected({
  field,
  className,
  compact = false,
}: {
  field: NotCollectedField
  className?: string
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const copy = NOT_COLLECTED_COPY[field]
  const panelId = `not-collected-${field}`

  return (
    <span className={cn("relative inline-flex items-center gap-1", className)}>
      <span className={cn("text-muted-foreground", compact ? "text-xs" : "text-sm font-medium")}>Not collected</span>

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Why is ${copy.label} not collected?`}
        className="inline-flex items-center justify-center rounded-full p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
      >
        <Info className="w-3.5 h-3.5" aria-hidden="true" />
      </button>

      {open && (
        <span
          id={panelId}
          role="dialog"
          aria-label={`${copy.label} — not collected`}
          className="absolute left-0 top-full z-40 mt-2 w-72 rounded-xl border border-border bg-popover p-3 text-left shadow-lg"
        >
          <span className="flex items-start justify-between gap-2">
            <span className="text-sm font-medium text-foreground">{copy.label}</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="rounded-md p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">{copy.why}</span>
          <span className="mt-2 block text-xs text-foreground">{copy.how}</span>
          <a
            href={copy.href}
            className="mt-2 inline-block text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            How to collect this →
          </a>
        </span>
      )}
    </span>
  )
}

/** Block form, for a whole widget whose data source is unavailable. */
export function NotCollectedPanel({ field, className }: { field: NotCollectedField; className?: string }) {
  const copy = NOT_COLLECTED_COPY[field]

  return (
    <div className={cn("rounded-xl border border-dashed border-border p-4", className)}>
      <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        <Info className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
        {copy.label} — not collected
      </p>
      <p className="mt-1.5 text-xs text-muted-foreground">{copy.why}</p>
      <p className="mt-1.5 text-xs text-foreground">{copy.how}</p>
      <a
        href={copy.href}
        className="mt-2.5 inline-block text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
      >
        How to collect this →
      </a>
    </div>
  )
}
