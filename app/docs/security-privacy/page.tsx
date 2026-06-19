"use client"

import { motion } from "framer-motion"
import { DocsSearch } from "@/components/docs/docs-search"
import { DocsToc } from "@/components/docs/docs-toc"
import { DocsNav } from "@/components/docs/docs-nav"
import { Shield, Eye, Lock, RefreshCw } from "lucide-react"
import { Suspense } from "react"
import Loading from "@/components/loading" // Declared the Loading component

const tocItems = [
  { id: "read-only", title: "Read-Only Analysis", level: 2 },
  { id: "data-handling", title: "Data Handling", level: 2 },
  { id: "future-plans", title: "Future Plans", level: 2 },
]

export default function SecurityPrivacyPage() {
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
              <span className="text-sm text-primary font-medium">Trust</span>
              <h1 className="text-4xl font-bold tracking-tight mt-2">Security & Privacy</h1>
              <p className="text-lg text-muted-foreground mt-4 leading-relaxed">
                KubeScope is designed with security and privacy as core principles. Your cluster data is handled with care.
              </p>
            </motion.div>

            <motion.section
              className="mt-12"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <h2 id="read-only" className="text-2xl font-semibold scroll-mt-24">
                Read-Only Analysis
              </h2>
              <div className="mt-6 grid sm:grid-cols-2 gap-4">
                {[
                  {
                    icon: Eye,
                    title: "Read-Only Access",
                    desc: "KubeScope only reads RBAC data. It never modifies your cluster configuration.",
                    color: "text-blue-500 bg-blue-500/10",
                  },
                  {
                    icon: Shield,
                    title: "No Cluster Changes",
                    desc: "We don't create, update, or delete any Kubernetes resources.",
                    color: "text-green-500 bg-green-500/10",
                  },
                ].map((item, i) => (
                  <motion.div
                    key={item.title}
                    className="p-6 rounded-2xl bg-muted/30 border border-border"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 + i * 0.1 }}
                  >
                    <div className={`w-10 h-10 rounded-xl ${item.color} flex items-center justify-center mb-4`}>
                      <item.icon className="w-5 h-5" />
                    </div>
                    <h4 className="font-medium">{item.title}</h4>
                    <p className="text-sm text-muted-foreground mt-2">{item.desc}</p>
                  </motion.div>
                ))}
              </div>
            </motion.section>

            <motion.section
              className="mt-12"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              <h2 id="data-handling" className="text-2xl font-semibold scroll-mt-24">
                Data Handling
              </h2>
              <p className="mt-4 text-muted-foreground leading-relaxed">
                In the current MVP, KubeScope uses a snapshot-based model:
              </p>
              <div className="mt-6 space-y-4">
                {[
                  {
                    icon: Lock,
                    title: "Snapshot Model",
                    desc: "You export RBAC data locally and upload it to KubeScope. We never connect directly to your cluster.",
                  },
                  {
                    icon: Shield,
                    title: "Client-Side Processing",
                    desc: "Analysis runs in your browser. Your RBAC data doesn't leave your machine.",
                  },
                  {
                    icon: Eye,
                    title: "No Persistent Storage",
                    desc: "Uploaded snapshots are processed in-memory and not stored on our servers.",
                  },
                ].map((item, i) => (
                  <motion.div
                    key={item.title}
                    className="flex items-start gap-4 p-4 rounded-xl bg-muted/20 border border-border"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 + i * 0.1 }}
                  >
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <item.icon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-medium">{item.title}</h4>
                      <p className="text-sm text-muted-foreground mt-1">{item.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.section>

            <motion.section
              className="mt-12"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              <h2 id="future-plans" className="text-2xl font-semibold scroll-mt-24">
                Future Plans
              </h2>
              <p className="mt-4 text-muted-foreground leading-relaxed">
                We're building additional features with the same security-first approach:
              </p>
              <div className="mt-6 p-6 rounded-2xl bg-gradient-to-br from-primary/5 to-transparent border border-border">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <RefreshCw className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-medium">Agent-Based Sync</h4>
                    <p className="text-sm text-muted-foreground mt-2">
                      Optional in-cluster agent for real-time RBAC monitoring. Will use read-only 
                      service accounts and encrypted communication. Coming in a future release.
                    </p>
                  </div>
                </div>
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
