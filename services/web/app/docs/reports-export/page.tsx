"use client"

import { motion } from "framer-motion"
import { DocsSearch } from "@/components/docs/docs-search"
import { DocsToc } from "@/components/docs/docs-toc"
import { DocsNav } from "@/components/docs/docs-nav"
import { FileSpreadsheet, FileText, CheckCircle2, Clock } from "lucide-react"
import { Suspense } from "react"
import Loading from "@/components/loading" // Added import for Loading component

const tocItems = [
  { id: "export-formats", title: "Export Formats", level: 2 },
  { id: "csv-export", title: "CSV Export", level: 2 },
  { id: "pdf-reports", title: "PDF Reports", level: 2 },
]

export default function ReportsExportPage() {
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
              <h1 className="text-4xl font-bold tracking-tight mt-2">Reports & Export</h1>
              <p className="text-lg text-muted-foreground mt-4 leading-relaxed">
                Generate comprehensive reports and export your RBAC audit data for compliance and documentation.
              </p>
            </motion.div>

            <motion.section
              className="mt-12"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <h2 id="export-formats" className="text-2xl font-semibold scroll-mt-24">
                Export Formats
              </h2>
              <p className="mt-4 text-muted-foreground leading-relaxed">
                KubeScope supports multiple export formats to fit your workflow:
              </p>
              <div className="mt-6 grid sm:grid-cols-2 gap-4">
                <div className="p-6 rounded-2xl bg-muted/30 border border-border">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                      <FileSpreadsheet className="w-5 h-5 text-green-500" />
                    </div>
                    <div>
                      <h4 className="font-medium">CSV Export</h4>
                      <div className="flex items-center gap-1 text-xs text-green-500">
                        <CheckCircle2 className="w-3 h-3" />
                        Available now
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Export RBAC data to CSV for spreadsheet analysis or integration with other tools.
                  </p>
                </div>
                <div className="p-6 rounded-2xl bg-muted/30 border border-border">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-violet-500" />
                    </div>
                    <div>
                      <h4 className="font-medium">PDF Reports</h4>
                      <div className="flex items-center gap-1 text-xs text-amber-500">
                        <Clock className="w-3 h-3" />
                        Coming soon
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Generate formatted PDF reports for compliance documentation and stakeholder sharing.
                  </p>
                </div>
              </div>
            </motion.section>

            <motion.section
              className="mt-12"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              <h2 id="csv-export" className="text-2xl font-semibold scroll-mt-24">
                CSV Export
              </h2>
              <p className="mt-4 text-muted-foreground leading-relaxed">
                The CSV export includes all RBAC bindings with their complete permission chains:
              </p>
              <div className="mt-6 p-4 rounded-xl bg-muted/20 border border-border font-mono text-sm overflow-x-auto">
                <div className="text-muted-foreground">
                  Subject, SubjectType, Binding, BindingType, Role, Namespace, Resources, Verbs
                </div>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                Export options include filtering by namespace, role type, or risk level before generating the file.
              </p>
            </motion.section>

            <motion.section
              className="mt-12"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              <h2 id="pdf-reports" className="text-2xl font-semibold scroll-mt-24">
                PDF Reports
              </h2>
              <p className="mt-4 text-muted-foreground leading-relaxed">
                PDF reports will include:
              </p>
              <ul className="mt-4 space-y-2">
                {[
                  "Executive summary with key metrics",
                  "Risk findings with severity breakdown",
                  "Complete RBAC binding inventory",
                  "Visualizations and charts",
                  "Remediation recommendations",
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-muted-foreground">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  PDF export is currently in development and will be available in a future release.
                </p>
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
