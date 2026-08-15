"use client"

import { useState } from "react"
import Link from "next/link"
import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Map as MapIcon,
  Shield,
  Ticket,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type { RBACFinding } from "@/lib/rbac-scanner"
import { attackImpact, blastRadius, mitreForFinding } from "@/lib/mitre"
import { findingAsMarkdown } from "@/lib/export"
import type { FindingState } from "@/lib/finding-status"
import { SeverityBadge } from "@/components/posture/severity"

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1600)
      }}
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-sev-pass" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copied" : label}
    </button>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  )
}

export function FindingCard({
  finding,
  scanId,
  state,
  reason,
  expanded,
  onToggle,
  onSetState,
}: {
  finding: RBACFinding
  scanId: string
  state: FindingState
  reason?: string
  expanded: boolean
  onToggle: () => void
  onSetState: (state: FindingState, opts?: { reason?: string; expiresAt?: string | null }) => void
}) {
  const [suppressOpen, setSuppressOpen] = useState(false)
  const [suppressReason, setSuppressReason] = useState("")
  const [suppressExpiry, setSuppressExpiry] = useState("")

  const namespace = !finding.namespace || finding.namespace === "*" ? "cluster-wide" : finding.namespace
  const radius = blastRadius(finding)
  const mitre = mitreForFinding(finding)
  const deepLink =
    typeof window === "undefined"
      ? `/app/scans/${scanId}/findings/${finding.id}`
      : `${window.location.origin}/app/scans/${scanId}/findings/${finding.id}`

  return (
    <div
      id={finding.id}
      className={cn(
        "data-card overflow-hidden scroll-mt-32",
        state === "suppressed" && "opacity-60",
        state === "resolved" && "border-sev-pass/40",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-muted/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronDown
          className={cn("w-4 h-4 mt-1 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")}
        />
        <SeverityBadge severity={finding.severity} className="mt-0.5 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="font-medium block leading-snug">{finding.title}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {namespace} · {String(finding.category).replace(/_/g, " ").toLowerCase()}
            {mitre[0] && ` · ${mitre[0].tacticId}`}
            {radius.subjects > 0 && ` · ${radius.subjects} subject${radius.subjects === 1 ? "" : "s"}`}
          </span>
        </span>
        {state !== "open" && (
          <span
            className={cn(
              "shrink-0 text-[11px] px-2 py-0.5 rounded-full font-medium",
              state === "resolved" ? "bg-sev-pass-bg text-sev-pass" : "bg-muted text-muted-foreground",
            )}
          >
            {state === "resolved" ? "Resolved" : "Suppressed"}
          </span>
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 space-y-5 border-t border-border">
          <section className="space-y-1.5 pt-4">
            <h4 className="text-[11px] uppercase tracking-wide text-muted-foreground">Affected</h4>
            <Field label="Namespace">{namespace}</Field>
            <Field label="Role">
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{finding.role}</code>
            </Field>
            <Field label="Subject type">{finding.subjectType}</Field>
            <Field label="Impacted subjects">
              {radius.subjects > 0 ? (
                <span>
                  {radius.subjects}
                  <Link
                    href={`/app/scans/${scanId}/viewer?q=${encodeURIComponent(finding.role)}`}
                    className="ml-2 text-primary hover:underline text-xs"
                  >
                    view in Viewer
                  </Link>
                </span>
              ) : (
                <span className="text-muted-foreground">
                  none — this role is not bound to any subject in the snapshot
                </span>
              )}
            </Field>
          </section>

          <section>
            <h4 className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">Attack impact</h4>
            <p className="text-sm leading-relaxed">{attackImpact(finding)}</p>
            <p className="mt-2 text-xs text-muted-foreground tabular">
              Blast radius: {radius.clusterWide ? "cluster-wide" : `namespace ${namespace}`} ·{" "}
              {radius.subjects} subject{radius.subjects === 1 ? "" : "s"} · {radius.resources} resource
              {radius.resources === 1 ? "" : "s"}
            </p>
          </section>

          <section>
            <h4 className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">MITRE ATT&CK</h4>
            <ul className="space-y-1">
              {mitre.map((technique) => (
                <li key={technique.techniqueId} className="text-sm flex items-start gap-2">
                  <Shield className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
                  <span>
                    <span className="text-muted-foreground">{technique.tacticId}</span> {technique.tactic} →{" "}
                    <span className="text-muted-foreground">{technique.techniqueId}</span> {technique.technique}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {(finding.affectedResources ?? []).length > 0 && (
            <section>
              <h4 className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">Affected resources</h4>
              <div className="flex flex-wrap gap-1.5">
                {finding.affectedResources.map((resource) => (
                  <code key={resource} className="text-xs bg-muted px-1.5 py-0.5 rounded">
                    {resource === "*" ? "All resources" : resource}
                  </code>
                ))}
              </div>
            </section>
          )}

          {finding.evidence && (
            <section>
              <h4 className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">Evidence</h4>
              <pre className="text-xs bg-muted rounded-xl p-3 overflow-x-auto">
                {JSON.stringify(finding.evidence, null, 2)}
              </pre>
            </section>
          )}

          <section>
            <div className="flex items-center justify-between gap-4 mb-1.5">
              <h4 className="text-[11px] uppercase tracking-wide text-muted-foreground">Recommendation</h4>
              <CopyButton text={finding.remediation} />
            </div>
            <p className="text-sm leading-relaxed">{finding.remediation}</p>
          </section>

          {state === "suppressed" && reason && (
            <section className="rounded-xl bg-muted/60 p-3">
              <p className="text-xs text-muted-foreground">Suppressed — reason recorded</p>
              <p className="text-sm mt-0.5">{reason}</p>
            </section>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Link
              href={`/app/scans/${scanId}/map?focus=${encodeURIComponent(`role:ClusterRole/${finding.role}`)}`}
            >
              <Button variant="outline" size="sm" className="rounded-xl bg-transparent">
                <MapIcon className="w-3.5 h-3.5 mr-1.5" />
                View in Map
              </Button>
            </Link>

            <Button
              variant="outline"
              size="sm"
              className="rounded-xl bg-transparent"
              onClick={async () => {
                await navigator.clipboard.writeText(findingAsMarkdown(finding, deepLink))
              }}
              title="No ticket integration is configured yet — this copies the finding as Markdown."
            >
              <Ticket className="w-3.5 h-3.5 mr-1.5" />
              Copy as ticket
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="rounded-xl bg-transparent"
              onClick={async () => {
                await navigator.clipboard.writeText(deepLink)
              }}
            >
              <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
              Copy link
            </Button>

            {state === "open" ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl bg-transparent"
                  onClick={() => onSetState("resolved")}
                >
                  <Check className="w-3.5 h-3.5 mr-1.5" />
                  Mark resolved
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-xl text-muted-foreground"
                  onClick={() => setSuppressOpen(true)}
                >
                  Suppress
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl bg-transparent"
                onClick={() => onSetState("open")}
              >
                <X className="w-3.5 h-3.5 mr-1.5" />
                Reopen
              </Button>
            )}
          </div>
        </div>
      )}

      <Dialog open={suppressOpen} onOpenChange={setSuppressOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Suppress this finding</DialogTitle>
            <DialogDescription>
              A reason is required. Suppression removes the finding from the security score, so an unexplained
              suppression is how a security tool quietly becomes a rubber stamp.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="suppress-reason">Reason</Label>
              <Input
                id="suppress-reason"
                value={suppressReason}
                onChange={(e) => setSuppressReason(e.target.value)}
                placeholder="e.g. Accepted risk — reviewed by platform team, ticket PLAT-482"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="suppress-expiry">Expires (optional)</Label>
              <Input
                id="suppress-expiry"
                type="date"
                value={suppressExpiry}
                onChange={(e) => setSuppressExpiry(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                After this date the finding reverts to open automatically.
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Stored in this browser only. Shared, attributable suppression needs a backend table — see the design
              spec.
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSuppressOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!suppressReason.trim()}
              onClick={() => {
                onSetState("suppressed", {
                  reason: suppressReason,
                  expiresAt: suppressExpiry ? new Date(suppressExpiry).toISOString() : null,
                })
                setSuppressOpen(false)
                setSuppressReason("")
                setSuppressExpiry("")
              }}
            >
              Suppress
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
