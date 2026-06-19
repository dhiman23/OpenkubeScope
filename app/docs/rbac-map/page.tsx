"use client"

import { motion } from "framer-motion"
import { DocsSearch } from "@/components/docs/docs-search"
import { DocsToc } from "@/components/docs/docs-toc"
import { DocsNav } from "@/components/docs/docs-nav"
import { ArrowRight, User, Link2, Shield, Key } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { Suspense } from "react"
import Loading from "./loading"

const tocItems = [
  { id: "visualization", title: "Visualization", level: 2 },
  { id: "rbac-chain", title: "The RBAC Chain", level: 2 },
  { id: "why-it-helps", title: "Why It Helps", level: 2 },
]

export default function RbacMapPage() {
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
              <span className="text-sm text-primary font-medium">Core Features</span>
              <h1 className="text-4xl font-bold tracking-tight mt-2">RBAC Map</h1>
              <p className="text-lg text-muted-foreground mt-4 leading-relaxed">
                Visualize the complete RBAC relationship chain with an interactive node-based diagram.
              </p>
            </motion.div>

            <motion.section
              className="mt-12"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <h2 id="visualization" className="text-2xl font-semibold scroll-mt-24">
                Visualization
              </h2>
              <p className="mt-4 text-muted-foreground leading-relaxed">
                The RBAC Map presents your cluster permissions as an interactive graph. Click on any 
                node to highlight its connections and understand the full permission chain at a glance.
              </p>
              <div className="mt-6 p-6 rounded-2xl bg-gradient-to-br from-muted/50 to-muted/20 border border-border">
                <div className="flex items-center justify-center gap-2 text-sm">
                  <span className="text-muted-foreground">Zoom</span>
                  <span className="text-xs text-muted-foreground/60">|</span>
                  <span className="text-muted-foreground">Pan</span>
                  <span className="text-xs text-muted-foreground/60">|</span>
                  <span className="text-muted-foreground">Click to select</span>
                  <span className="text-xs text-muted-foreground/60">|</span>
                  <span className="text-muted-foreground">Filter by type</span>
                </div>
              </div>
            </motion.section>

            <motion.section
              className="mt-12"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              <h2 id="rbac-chain" className="text-2xl font-semibold scroll-mt-24">
                The RBAC Chain
              </h2>
              <p className="mt-4 text-muted-foreground leading-relaxed">
                Kubernetes RBAC follows a clear permission chain. The RBAC Map visualizes this flow:
              </p>
              
              <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
                {[
                  { icon: User, label: "Subject", color: "text-blue-500 bg-blue-500/10" },
                  { icon: Link2, label: "Binding", color: "text-violet-500 bg-violet-500/10" },
                  { icon: Shield, label: "Role", color: "text-amber-500 bg-amber-500/10" },
                  { icon: Key, label: "Permissions", color: "text-green-500 bg-green-500/10" },
                ].map((item, i) => (
                  <motion.div
                    key={item.label}
                    className="flex items-center gap-3"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 + i * 0.1 }}
                  >
                    <div className={`w-12 h-12 rounded-xl ${item.color} flex items-center justify-center`}>
                      <item.icon className="w-6 h-6" />
                    </div>
                    <span className="font-medium">{item.label}</span>
                    {i < 3 && <ArrowRight className="w-5 h-5 text-muted-foreground/50 ml-2" />}
                  </motion.div>
                ))}
              </div>

              <div className="mt-8 p-4 rounded-xl bg-muted/30 border border-border">
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">Subject</strong> (User, Group, or ServiceAccount) is granted 
                  access via a <strong className="text-foreground">Binding</strong> which references a{" "}
                  <strong className="text-foreground">Role</strong> containing specific{" "}
                  <strong className="text-foreground">Permissions</strong> (resources + verbs).
                </p>
              </div>
            </motion.section>

            <motion.section
              className="mt-12"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              <h2 id="why-it-helps" className="text-2xl font-semibold scroll-mt-24">
                Why It Helps
              </h2>
              <div className="mt-6 space-y-4">
                {[
                  {
                    title: "Spot over-connected subjects",
                    desc: "Quickly identify users or service accounts with too many role bindings",
                  },
                  {
                    title: "Trace permission origins",
                    desc: "Click any permission to see exactly which roles and bindings grant it",
                  },
                  {
                    title: "Find unused roles",
                    desc: "Roles with no bindings are highlighted for potential cleanup",
                  },
                  {
                    title: "Audit cluster-admin usage",
                    desc: "See all paths to cluster-admin privileges at a glance",
                  },
                ].map((item, i) => (
                  <motion.div
                    key={item.title}
                    className="p-4 rounded-xl bg-muted/20 border border-border"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.6 + i * 0.1 }}
                  >
                    <h4 className="font-medium">{item.title}</h4>
                    <p className="text-sm text-muted-foreground mt-1">{item.desc}</p>
                  </motion.div>
                ))}
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
