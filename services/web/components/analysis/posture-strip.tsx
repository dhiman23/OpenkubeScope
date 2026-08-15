"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronRight, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { getTimeAgo } from "@/lib/format-utils"
import { BAND_LABEL, scoreBand } from "@/lib/scoring"
import { ScoreRing } from "@/components/posture/score-ring"
import { TrendDelta } from "@/components/posture/trend-delta"
import { useScan } from "@/components/scan/scan-context"

function Tile({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("data-card p-5 flex flex-col justify-between min-h-[148px]", className)}>{children}</div>
}

/**
 * Posture detail.
 *
 * This used to be row 1 and repeated the security score, critical count and
 * high count that the scan context bar already pins to the top of every
 * analysis page — the first screenful of the dashboard restated what was
 * directly above it. Those two tiles are gone: severity counts live in the
 * context bar (and drive "Fix first"), and this section now carries only what
 * the bar does not — the score's justification, compliance, and the snapshot's
 * place in the cluster's history.
 */
export function PostureStrip() {
  const { scan, score, previousScore, previous, compliance, scanId } = useScan()
  const [breakdownOpen, setBreakdownOpen] = useState(false)

  const baselineLabel = previous
    ? new Date(previous.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : undefined

  return (
    <>
      <section aria-labelledby="posture-heading" className="space-y-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="posture-heading" className="text-lg font-semibold">
            Posture detail
          </h2>
          <p className="text-xs text-muted-foreground">Severity counts are in the scan bar above.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Tile>
            <div className="flex items-start gap-4">
              <ScoreRing score={score.score} size="lg" showBand={false} />
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Security score</p>
                <p className="text-2xl font-semibold tabular leading-tight">
                  {score.score}
                  <span className="text-base text-muted-foreground font-normal"> /100</span>
                </p>
                <p className="text-sm text-muted-foreground">{BAND_LABEL[score.band]}</p>
                <TrendDelta
                  delta={previousScore ? score.score - previousScore.score : null}
                  baselineLabel={baselineLabel}
                  className="mt-1"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => setBreakdownOpen(true)}
              className="mt-3 inline-flex items-center gap-1 self-start rounded text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Why this score?
              <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </Tile>

          <Tile>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Compliance</p>
              <p className="mt-2 text-4xl font-semibold tabular leading-none">
                {compliance.percentage}
                <span className="text-xl text-muted-foreground font-normal">%</span>
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {compliance.passed} of {compliance.total} CIS controls passing
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Measured separately from the score — a cluster can score {score.score} and still pass most controls.
              </p>
            </div>
            <Link
              href={`/app/scans/${scanId}/inventory#compliance`}
              className="mt-3 inline-flex items-center gap-1 rounded text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              View controls
              <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          </Tile>

          <Tile>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">This snapshot</p>
              <p className="mt-2 text-lg font-semibold leading-tight">{getTimeAgo(scan.createdAt)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(scan.createdAt).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
            {previous ? (
              <Link
                href={`/app/scans/${scanId}/compare/${previous.id}`}
                className="mt-3 inline-flex items-center gap-1 rounded text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Compare with {baselineLabel}
                <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
              </Link>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">
                First snapshot of this cluster — nothing to compare yet.
              </p>
            )}
          </Tile>
        </div>
      </section>

      <ScoreBreakdown open={breakdownOpen} onOpenChange={setBreakdownOpen} />
    </>
  )
}

const BANDS: { range: string; label: string; meaning: string }[] = [
  { range: "90–100", label: "Strong", meaning: "No critical or high findings; wildcards and escalation paths are rare." },
  { range: "75–89", label: "Moderate", meaning: "High-severity findings remain, but no unresolved criticals." },
  { range: "50–74", label: "Weak", meaning: "At least one unresolved critical finding is open." },
  { range: "0–49", label: "Critical", meaning: "Critical findings affect a large share of the evaluated surface." },
]

/**
 * "Why this score?"
 *
 * Opens with the one sentence a reader needs — what was calculated, what is
 * displayed, and why they differ — before any table. The methodology is kept
 * but demoted behind a disclosure, because the question being asked is "can I
 * defend this number?", not "how is it defined?".
 */
function ScoreBreakdown({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { score, previousScore, scanId, scan } = useScan()
  const [methodologyOpen, setMethodologyOpen] = useState(false)

  const previousById = new Map((previousScore?.domains ?? []).map((d) => [d.id, d.score]))
  const criticalCount = scan.riskCounts?.critical ?? 0
  const drivers = [...score.domains].filter((d) => d.findingCount > 0).sort((a, b) => a.score - b.score).slice(0, 3)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between gap-4">
            <span>Why this score?</span>
            <span className="tabular text-2xl font-semibold">
              {score.score}
              <span className="text-base text-muted-foreground font-normal"> /100</span>
            </span>
          </SheetTitle>
          <SheetDescription className="sr-only">
            How this snapshot&apos;s security score was calculated and what is holding it down.
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6 space-y-5">
          {/* The factual summary, first and in plain words. */}
          <div className="rounded-xl border border-border p-4">
            <p className="text-sm font-medium text-foreground">
              {score.cappedBy ? (
                <>
                  Calculated score: {score.uncappedScore}. Displayed score: {score.score} because unresolved{" "}
                  {score.cappedBy} findings cap the posture score.
                </>
              ) : (
                <>
                  Calculated score: {score.uncappedScore}. No cap applied — no unresolved critical or high findings.
                </>
              )}
            </p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {score.cappedBy ? (
                <>
                  The domain model measures what fraction of the evaluated surface is compromised, so a large cluster
                  dilutes: {score.uncappedScore} would read as &ldquo;{BAND_LABEL[scoreBand(score.uncappedScore)]}
                  &rdquo; while {criticalCount} critical finding{criticalCount === 1 ? "" : "s"} are still open. The cap
                  is reported here rather than folded silently into the number.
                </>
              ) : (
                <>The score is a weighted average of eight control domains, each bounded and individually explainable.</>
              )}
            </p>

            {criticalCount > 0 && (
              <Link href={`/app/scans/${scanId}/findings?severity=critical&status=open`} onClick={() => onOpenChange(false)}>
                <Button size="sm" className="mt-3 rounded-xl">
                  View critical findings
                  <ChevronRight className="w-3.5 h-3.5 ml-1" aria-hidden="true" />
                </Button>
              </Link>
            )}
          </div>

          {score.domains.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Domain attribution needs the full snapshot, which this view did not load.
            </p>
          ) : (
            <>
              {/* Top drivers, before the full table. */}
              {drivers.length > 0 && (
                <div>
                  <h3 className="text-xs uppercase tracking-wide text-muted-foreground">What is costing the most</h3>
                  <ul className="mt-2 space-y-1.5">
                    {drivers.map((domain) => (
                      <li key={domain.id}>
                        <Link
                          href={`/app/scans/${scanId}/findings?domain=${domain.id}`}
                          onClick={() => onOpenChange(false)}
                          className="group flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 hover:border-primary/60 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">{domain.label}</span>
                            <span className="block text-xs text-muted-foreground">
                              {domain.findingCount} finding{domain.findingCount === 1 ? "" : "s"}
                              {domain.criticalCount > 0 && ` · ${domain.criticalCount} critical`} · weight{" "}
                              {domain.weight}
                            </span>
                          </span>
                          <span className="shrink-0 tabular text-sm font-semibold">{domain.score}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <h3 className="text-xs uppercase tracking-wide text-muted-foreground">All control domains</h3>
                <div className="mt-2 rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <caption className="sr-only">
                      Security score by control domain, with weight, domain score and contribution.
                    </caption>
                    <thead className="bg-muted/60 text-xs uppercase tracking-wide text-foreground/80">
                      <tr>
                        <th scope="col" className="text-left font-semibold px-3 py-2">
                          Domain
                        </th>
                        <th scope="col" className="text-right font-semibold px-3 py-2">
                          Weight
                        </th>
                        <th scope="col" className="text-right font-semibold px-3 py-2">
                          Score
                        </th>
                        <th scope="col" className="text-right font-semibold px-3 py-2">
                          Contribution
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {score.domains.map((domain) => {
                        const prev = previousById.get(domain.id)
                        return (
                          <tr key={domain.id} className="border-t border-border">
                            <th scope="row" className="px-3 py-2.5 text-left font-normal">
                              <span className="block font-medium">{domain.label}</span>
                              <span className="block text-xs text-muted-foreground">
                                {domain.findingCount} finding{domain.findingCount === 1 ? "" : "s"}
                                {domain.criticalCount > 0 && ` · ${domain.criticalCount} critical`}
                              </span>
                            </th>
                            <td className="px-3 py-2.5 text-right tabular text-muted-foreground">{domain.weight}</td>
                            <td className="px-3 py-2.5 text-right tabular font-medium">
                              {domain.score}
                              {prev !== undefined && <TrendDelta delta={domain.score - prev} className="justify-end" />}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular text-muted-foreground">
                              {domain.contribution}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {score.suppressedCount > 0 && (
                <p className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                  {score.suppressedCount} suppressed finding{score.suppressedCount === 1 ? "" : "s"} excluded
                  {score.suppressedGain > 0 && ` (+${score.suppressedGain} points)`}. Suppression never silently
                  inflates a score.
                </p>
              )}

              {score.topOpportunity && (
                <div className="rounded-xl border border-border p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Biggest opportunity</p>
                  <p className="mt-1 font-medium">{score.topOpportunity.label}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{score.topOpportunity.description}</p>
                  <Link
                    href={`/app/scans/${scanId}/findings?domain=${score.topOpportunity.id}`}
                    onClick={() => onOpenChange(false)}
                  >
                    <Button variant="outline" size="sm" className="mt-3 rounded-xl bg-transparent">
                      View {score.topOpportunity.findingCount} findings
                      <ChevronRight className="w-3.5 h-3.5 ml-1" aria-hidden="true" />
                    </Button>
                  </Link>
                </div>
              )}

              {/* Methodology: kept, but behind a disclosure. */}
              <div className="rounded-xl border border-border">
                <button
                  type="button"
                  onClick={() => setMethodologyOpen((value) => !value)}
                  aria-expanded={methodologyOpen}
                  aria-controls="score-methodology"
                  className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
                >
                  How this score is calculated
                  <ChevronRight
                    className={cn("w-4 h-4 shrink-0 transition-transform", methodologyOpen && "rotate-90")}
                    aria-hidden="true"
                  />
                </button>

                {methodologyOpen && (
                  <div id="score-methodology" className="space-y-3 border-t border-border px-4 py-3">
                    <p className="text-sm text-muted-foreground">
                      Each domain scores <span className="font-medium text-foreground">100 × (1 − affected ÷ evaluated)</span>,
                      where a finding&apos;s weight is its severity (critical 1.0, high 0.6, medium 0.3, low 0.1)
                      multiplied by its scope (cluster-scoped 1.5×, namespaced 1.0×). The total is the weighted average
                      across all eight domains.
                    </p>
                    <p className="text-sm text-muted-foreground">
                      A naive deduction (100 − 12 × critical) floors every serious cluster at zero and cannot be broken
                      down, so &ldquo;why {score.score}?&rdquo; would have no answer.
                    </p>

                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">What the bands mean</p>
                      <ul className="mt-1.5 space-y-1">
                        {BANDS.map((band) => (
                          <li key={band.label} className="flex gap-2 text-xs">
                            <span className="w-16 shrink-0 tabular text-muted-foreground">{band.range}</span>
                            <span className="w-16 shrink-0 font-medium">{band.label}</span>
                            <span className="text-muted-foreground">{band.meaning}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Evaluated surface: {score.evaluatedSurface} roles. Scoring is deterministic — the same snapshot
                      always produces the same score. Per-namespace scores are computed without the cap, so namespaces
                      can still be ranked against each other.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
