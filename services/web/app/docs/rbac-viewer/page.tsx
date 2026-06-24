"use client"

import { motion } from "framer-motion"
import { DocsSearch } from "@/components/docs/docs-search"
import { DocsToc } from "@/components/docs/docs-toc"
import { DocsNav } from "@/components/docs/docs-nav"
import { Search, Filter, Table2 } from "lucide-react"
import { useSearchParams } from "next/navigation"
import React, { Suspense } from "react"

const tocItems = [
  { id: "overview", title: "Overview", level: 2 },
  { id: "search-filters", title: "Search & Filters", level: 2 },
  { id: "example-searches", title: "Example Searches", level: 2 },
]

const Loading = () => null;

export default function RbacViewerPage() {
  return (
    <Suspense fallback={<Loading />}>
      <div className="flex gap-10 px-6 py-16 lg:pl-12">
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
              <h1 className="text-4xl font-bold tracking-tight mt-2">RBAC Viewer</h1>
              <p className="text-lg text-muted-foreground mt-4 leading-relaxed">
                Browse and search all your Kubernetes RBAC bindings in a powerful, filterable table view.
              </p>
            </motion.div>

            <motion.section
              className="mt-12"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <h2 id="overview" className="text-2xl font-semibold scroll-mt-24">
                Overview
              </h2>
              <p className="mt-4 text-muted-foreground leading-relaxed">
                The RBAC Viewer presents all role bindings and cluster role bindings in a unified table. 
                Each row shows the complete chain from subject to permissions, making it easy to understand 
                who has access to what.
              </p>
              <div className="mt-6 p-6 rounded-2xl bg-muted/30 border border-border">
                <div className="flex items-center gap-3 mb-4">
                  <Table2 className="w-5 h-5 text-primary" />
                  <span className="font-medium">Table Columns</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    { col: "Subject", desc: "User, Group, or ServiceAccount" },
                    { col: "Type", desc: "RoleBinding or ClusterRoleBinding" },
                    { col: "Role", desc: "The Role or ClusterRole referenced" },
                    { col: "Namespace", desc: "Scope of the binding" },
                    { col: "Resources", desc: "API resources granted" },
                    { col: "Verbs", desc: "Actions allowed" },
                  ].map((item) => (
                    <div key={item.col} className="flex items-start gap-2">
                      <span className="font-mono text-primary">{item.col}</span>
                      <span className="text-muted-foreground">- {item.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.section>

            <motion.section
              className="mt-12"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              <h2 id="search-filters" className="text-2xl font-semibold scroll-mt-24">
                Search & Filters
              </h2>
              <p className="mt-4 text-muted-foreground leading-relaxed">
                Use the search bar to instantly filter across all columns. Combine with dropdown filters 
                to narrow down results by binding type, namespace, or role.
              </p>
              <div className="mt-6 grid sm:grid-cols-2 gap-4">
                <div className="flex items-start gap-4 p-4 rounded-xl bg-muted/30 border border-border">
                  <Search className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-medium">Full-text Search</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Search subjects, roles, resources, and verbs simultaneously
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-4 p-4 rounded-xl bg-muted/30 border border-border">
                  <Filter className="w-5 h-5 text-violet-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-medium">Column Filters</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Filter by specific binding type, namespace, or role
                    </p>
                  </div>
                </div>
              </div>
            </motion.section>

            <motion.section
              className="mt-12"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              <h2 id="example-searches" className="text-2xl font-semibold scroll-mt-24">
                Example Searches
              </h2>
              <p className="mt-4 text-muted-foreground leading-relaxed">
                Try these searches to quickly find common security concerns:
              </p>
              <div className="mt-6 space-y-3">
                {[
                  { query: "secrets", desc: "Find all bindings with access to secrets" },
                  { query: "cluster-admin", desc: "Identify subjects with full cluster access" },
                  { query: "pods/exec", desc: "Find who can execute commands in pods" },
                  { query: "delete", desc: "See all delete permissions across the cluster" },
                  { query: "*", desc: "Find wildcard permissions (security risk)" },
                ].map((item, i) => (
                  <motion.div
                    key={item.query}
                    className="flex items-center gap-4 p-3 rounded-xl bg-muted/20 border border-border"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.6 + i * 0.1 }}
                  >
                    <code className="text-sm font-mono text-primary bg-primary/10 px-3 py-1 rounded-lg">
                      {item.query}
                    </code>
                    <span className="text-sm text-muted-foreground">{item.desc}</span>
                  </motion.div>
                ))}
              </div>
            </motion.section>

            <DocsNav />
          </div>
        </motion.article>

        <DocsToc items={tocItems} />
      </div>
    </Suspense>
  )
}
