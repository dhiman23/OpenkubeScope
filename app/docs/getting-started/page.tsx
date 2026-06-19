"use client"

import { motion } from "framer-motion"
import { DocsSearch } from "@/components/docs/docs-search"
import { DocsToc } from "@/components/docs/docs-toc"
import { DocsNav } from "@/components/docs/docs-nav"
import { ArrowRight, Sparkles, Upload } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { useSearchParams } from "next/navigation"
import { Suspense } from "react"
import Loading from "./loading"

const tocItems = [
  { id: "what-is-kubescope", title: "What is KubeScope?", level: 2 },
  { id: "quick-start", title: "Quick Start", level: 2 },
  { id: "demo-workspace", title: "Demo Workspace", level: 3 },
  { id: "upload-snapshot", title: "Upload Snapshot", level: 3 },
]

export default function GettingStartedPage() {
  return (
    <div className="flex gap-10 px-6 py-16 lg:pl-12">
      <Suspense fallback={<Loading />}>
        <motion.article
          className="flex-1 max-w-3xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <DocsSearch />

          <div className="mt-10">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <span className="text-sm text-primary font-medium">Introduction</span>
              <h1 className="text-4xl font-bold tracking-tight mt-2">Getting Started</h1>
              <p className="text-lg text-muted-foreground mt-4 leading-relaxed">
                Get up and running with KubeScope in under 30 seconds. Understand your Kubernetes RBAC permissions with clarity.
              </p>
            </motion.div>

            <motion.section
              className="mt-12"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <h2 id="what-is-kubescope" className="text-2xl font-semibold scroll-mt-24">
                What is KubeScope?
              </h2>
              <p className="mt-4 text-muted-foreground leading-relaxed">
                KubeScope is a premium Kubernetes RBAC auditing platform. It helps you visualize, 
                understand, and secure your cluster permissions without modifying anything.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "Visualize RBAC relationships with interactive maps",
                  "Identify security risks and overprivileged roles",
                  "Search across all bindings, roles, and subjects",
                  "Export comprehensive audit reports",
                ].map((item, i) => (
                  <motion.li
                    key={i}
                    className="flex items-start gap-3 text-muted-foreground"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 + i * 0.1 }}
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                    {item}
                  </motion.li>
                ))}
              </ul>
            </motion.section>

            <motion.section
              className="mt-12"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              <h2 id="quick-start" className="text-2xl font-semibold scroll-mt-24">
                Quick Start
              </h2>
              <p className="mt-4 text-muted-foreground leading-relaxed">
                Choose how you want to explore KubeScope. Try our demo workspace to see it in action, 
                or upload your own RBAC snapshot for real analysis.
              </p>

              <div className="grid sm:grid-cols-2 gap-4 mt-8">
                <motion.div
                  className="relative group p-6 rounded-2xl border border-border bg-card hover:border-primary/50 transition-all duration-300"
                  whileHover={{ y: -2 }}
                >
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                      <Sparkles className="w-5 h-5 text-primary" />
                    </div>
                    <h3 id="demo-workspace" className="font-semibold scroll-mt-24">Demo Workspace</h3>
                    <p className="text-sm text-muted-foreground mt-2">
                      Explore with sample data. No setup required.
                    </p>
                    <Link href="/app/onboarding">
                      <Button variant="ghost" size="sm" className="mt-4 -ml-2 group/btn">
                        Try Demo
                        <ArrowRight className="w-4 h-4 ml-1 group-hover/btn:translate-x-1 transition-transform" />
                      </Button>
                    </Link>
                  </div>
                </motion.div>

                <motion.div
                  className="relative group p-6 rounded-2xl border border-border bg-card hover:border-primary/50 transition-all duration-300"
                  whileHover={{ y: -2 }}
                >
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-violet-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative">
                    <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center mb-4">
                      <Upload className="w-5 h-5 text-violet-500" />
                    </div>
                    <h3 id="upload-snapshot" className="font-semibold scroll-mt-24">Upload Snapshot</h3>
                    <p className="text-sm text-muted-foreground mt-2">
                      Analyze your real cluster RBAC data.
                    </p>
                    <Link href="/docs/upload-snapshot">
                      <Button variant="ghost" size="sm" className="mt-4 -ml-2 group/btn">
                        Learn how
                        <ArrowRight className="w-4 h-4 ml-1 group-hover/btn:translate-x-1 transition-transform" />
                      </Button>
                    </Link>
                  </div>
                </motion.div>
              </div>
            </motion.section>

            <DocsNav />
          </div>
        </motion.article>
      </Suspense>

      <DocsToc items={tocItems} />
    </div>
  )
}
