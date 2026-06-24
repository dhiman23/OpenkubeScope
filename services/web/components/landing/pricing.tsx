"use client"

import Link from "next/link"
import { Check, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"

const baseFeatures = [
  "1 lifetime RBAC scan",
  "RBAC Viewer + basic risk highlights",
  "Export basic findings (CSV)",
]

const unlimitedFeatures = [
  "Everything in Free, plus:",
  "Unlimited RBAC scans",
  "RBAC Map + permission visualization",
  "Full risk findings breakdown",
  "Priority updates & upcoming integrations",
]

export function Pricing() {
  return (
    <section id="pricing" className="relative py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight">
            Simple pricing for every team
          </h2>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            Effective RBAC governance reduces operational risk and simplifies security audits across your clusters.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Base */}
          <div className="relative rounded-2xl border border-border/60 bg-card p-8 md:p-10 flex flex-col">
            <div>
              <h3 className="text-2xl font-semibold">KubeScope Base</h3>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-5xl font-bold text-cyan-600 dark:text-cyan-400">Free</span>
              </div>
              <p className="mt-3 text-muted-foreground">Perfect for individuals and learning</p>
            </div>

            <ul className="mt-8 space-y-4 flex-1">
              {baseFeatures.map((feature) => (
                <li key={feature} className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
                  <span className="text-foreground/90">{feature}</span>
                </li>
              ))}
            </ul>

            <Button
              asChild
              variant="outline"
              size="lg"
              className="mt-10 w-full h-12 rounded-xl border-foreground/15 hover:border-cyan-500 hover:text-cyan-600 dark:hover:text-cyan-400"
            >
              <Link href="/auth/signup">Start Free</Link>
            </Button>
          </div>

          {/* Unlimited */}
          <div className="relative rounded-2xl border-2 border-cyan-500/60 bg-card p-8 md:p-10 flex flex-col shadow-lg shadow-cyan-500/10">
            <div className="absolute -top-3 right-6">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-600 text-white text-xs font-semibold tracking-wide">
                <Sparkles className="h-3.5 w-3.5" />
                RECOMMENDED
              </span>
            </div>

            <div>
              <h3 className="text-2xl font-semibold">KubeScope Unlimited</h3>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-5xl font-bold text-cyan-600 dark:text-cyan-400">$15</span>
                <span className="text-lg text-muted-foreground">/month</span>
              </div>
              <p className="mt-3 text-muted-foreground">For teams and production clusters</p>
            </div>

            <ul className="mt-8 space-y-4 flex-1">
              {unlimitedFeatures.map((feature, i) => (
                <li key={feature} className="flex items-start gap-3">
                  {i === 0 ? (
                    <Check className="h-5 w-5 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
                  ) : (
                    <Check className="h-5 w-5 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5 ml-4" />
                  )}
                  <span className={i === 0 ? "font-medium" : "text-foreground/90"}>
                    {feature}
                  </span>
                </li>
              ))}
            </ul>

            <Button
              asChild
              size="lg"
              className="mt-10 w-full h-12 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white"
            >
              <Link href="/app/billing?upgrade=1">Upgrade to Unlimited</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
