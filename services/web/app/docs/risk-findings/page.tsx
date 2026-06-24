"use client"

import { motion } from "framer-motion"
import { DocsSearch } from "@/components/docs/docs-search"
import { DocsToc } from "@/components/docs/docs-toc"
import { DocsNav } from "@/components/docs/docs-nav"
import { AlertTriangle, AlertCircle, AlertOctagon, Info } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { Suspense } from "react"
import Loading from "./loading"

const tocItems = [
  { id: "severity-levels", title: "Severity Levels", level: 2 },
  { id: "common-findings", title: "Common Findings", level: 2 },
  { id: "remediation", title: "Remediation", level: 2 },
]

export default function RiskFindingsPage() {
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
              <h1 className="text-4xl font-bold tracking-tight mt-2">Risk Findings</h1>
              <p className="text-lg text-muted-foreground mt-4 leading-relaxed">
                KubeScope automatically analyzes your RBAC configuration and identifies potential security risks.
              </p>
            </motion.div>

            <motion.section
              className="mt-12"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <h2 id="severity-levels" className="text-2xl font-semibold scroll-mt-24">
                Severity Levels
              </h2>
              <p className="mt-4 text-muted-foreground leading-relaxed">
                Findings are categorized by severity to help you prioritize remediation:
              </p>
              <div className="mt-6 space-y-3">
                {[
                  { 
                    level: "Critical", 
                    icon: AlertOctagon, 
                    color: "text-red-500 bg-red-500/10 border-red-500/20",
                    desc: "Immediate action required. Cluster-wide security breach risk."
                  },
                  { 
                    level: "High", 
                    icon: AlertTriangle, 
                    color: "text-orange-500 bg-orange-500/10 border-orange-500/20",
                    desc: "Significant risk. Could lead to privilege escalation."
                  },
                  { 
                    level: "Medium", 
                    icon: AlertCircle, 
                    color: "text-amber-500 bg-amber-500/10 border-amber-500/20",
                    desc: "Moderate risk. Should be reviewed and addressed."
                  },
                  { 
                    level: "Low", 
                    icon: Info, 
                    color: "text-blue-500 bg-blue-500/10 border-blue-500/20",
                    desc: "Informational. Best practice recommendations."
                  },
                ].map((item, i) => (
                  <motion.div
                    key={item.level}
                    className={`flex items-start gap-4 p-4 rounded-xl border ${item.color}`}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 + i * 0.1 }}
                  >
                    <item.icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-semibold">{item.level}</h4>
                      <p className="text-sm opacity-80 mt-1">{item.desc}</p>
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
              <h2 id="common-findings" className="text-2xl font-semibold scroll-mt-24">
                Common Findings
              </h2>
              <p className="mt-4 text-muted-foreground leading-relaxed">
                KubeScope detects these common RBAC security issues:
              </p>
              <div className="mt-6 overflow-hidden rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Finding</th>
                      <th className="px-4 py-3 text-left font-medium">Severity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {[
                      { finding: "cluster-admin binding", severity: "Critical" },
                      { finding: "Wildcard (*) permissions", severity: "High" },
                      { finding: "Secrets access", severity: "High" },
                      { finding: "pods/exec permission", severity: "High" },
                      { finding: "create pods permission", severity: "Medium" },
                      { finding: "Unused ClusterRoles", severity: "Low" },
                    ].map((item) => (
                      <tr key={item.finding} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs">{item.finding}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                            item.severity === "Critical" ? "bg-red-500/10 text-red-500" :
                            item.severity === "High" ? "bg-orange-500/10 text-orange-500" :
                            item.severity === "Medium" ? "bg-amber-500/10 text-amber-500" :
                            "bg-blue-500/10 text-blue-500"
                          }`}>
                            {item.severity}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.section>

            <motion.section
              className="mt-12"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
            >
              <h2 id="remediation" className="text-2xl font-semibold scroll-mt-24">
                Remediation
              </h2>
              <p className="mt-4 text-muted-foreground leading-relaxed">
                Each finding includes specific remediation guidance. Click on any finding to see:
              </p>
              <ul className="mt-4 space-y-2">
                {[
                  "Detailed explanation of the risk",
                  "Affected subjects and bindings",
                  "Recommended actions to fix",
                  "Links to Kubernetes documentation",
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-muted-foreground">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                    {item}
                  </li>
                ))}
              </ul>
            </motion.section>

            <DocsNav />
          </div>
        </motion.article>
      </Suspense>

      <DocsToc items={tocItems} />
    </div>
  )
}
