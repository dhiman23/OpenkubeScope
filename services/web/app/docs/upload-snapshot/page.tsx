"use client"

import { motion } from "framer-motion"
import { DocsSearch } from "@/components/docs/docs-search"
import { DocsToc } from "@/components/docs/docs-toc"
import { DocsNav } from "@/components/docs/docs-nav"
import { CodeBlock } from "@/components/docs/code-block"
import { FileJson, Archive, CheckCircle2 } from "lucide-react"
import { Suspense } from "react"
import Loading from "@/components/loading" // Import the Loading component

const tocItems = [
  { id: "supported-formats", title: "Supported Formats", level: 2 },
  { id: "required-files", title: "Required Files", level: 2 },
  { id: "how-to-export", title: "How to Export", level: 2 },
  { id: "after-upload", title: "After Upload", level: 2 },
]

export default function UploadSnapshotPage() {
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
              <h1 className="text-4xl font-bold tracking-tight mt-2">Upload RBAC Snapshot</h1>
              <p className="text-lg text-muted-foreground mt-4 leading-relaxed">
                Export your cluster RBAC resources and upload them to KubeScope for comprehensive analysis.
              </p>
            </motion.div>

            <motion.section
              className="mt-12"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <h2 id="supported-formats" className="text-2xl font-semibold scroll-mt-24">
                Supported Formats
              </h2>
              <div className="mt-6 grid sm:grid-cols-2 gap-4">
                <div className="flex items-start gap-4 p-4 rounded-xl bg-muted/30 border border-border">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Archive className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-medium">.zip Archive</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Contains multiple JSON files for each RBAC resource type
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-4 p-4 rounded-xl bg-muted/30 border border-border">
                  <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                    <FileJson className="w-5 h-5 text-violet-500" />
                  </div>
                  <div>
                    <h4 className="font-medium">.json File</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Single JSON containing all RBAC resources
                    </p>
                  </div>
                </div>
              </div>
            </motion.section>

            <motion.section
              className="mt-12"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              <h2 id="required-files" className="text-2xl font-semibold scroll-mt-24">
                Required Files
              </h2>
              <p className="mt-4 text-muted-foreground leading-relaxed">
                Your snapshot should include these Kubernetes RBAC resources:
              </p>
              <div className="mt-6 space-y-3">
                {[
                  { file: "roles.json", desc: "Namespace-scoped role definitions" },
                  { file: "rolebindings.json", desc: "Namespace-scoped role bindings" },
                  { file: "clusterroles.json", desc: "Cluster-wide role definitions" },
                  { file: "clusterrolebindings.json", desc: "Cluster-wide role bindings" },
                ].map((item, i) => (
                  <motion.div
                    key={item.file}
                    className="flex items-center gap-4 p-3 rounded-xl bg-muted/20"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 + i * 0.1 }}
                  >
                    <code className="text-sm font-mono text-primary bg-primary/10 px-2 py-1 rounded">
                      {item.file}
                    </code>
                    <span className="text-sm text-muted-foreground">{item.desc}</span>
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
              <h2 id="how-to-export" className="text-2xl font-semibold scroll-mt-24">
                How to Export
              </h2>
              <p className="mt-4 text-muted-foreground leading-relaxed">
                Use kubectl to export your RBAC resources:
              </p>
              <CodeBlock language="bash" filename="terminal">
{`# Export all RBAC resources
kubectl get roles -A -o json > roles.json
kubectl get rolebindings -A -o json > rolebindings.json
kubectl get clusterroles -o json > clusterroles.json
kubectl get clusterrolebindings -o json > clusterrolebindings.json

# Create zip archive
zip rbac-snapshot.zip *.json`}
              </CodeBlock>
            </motion.section>

            <motion.section
              className="mt-12"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
            >
              <h2 id="after-upload" className="text-2xl font-semibold scroll-mt-24">
                After Upload
              </h2>
              <p className="mt-4 text-muted-foreground leading-relaxed">
                Once you upload your snapshot, KubeScope will:
              </p>
              <div className="mt-6 space-y-3">
                {[
                  "Parse and validate all RBAC resources",
                  "Build relationship graphs between subjects, roles, and permissions",
                  "Analyze for security risks and overprivileged access",
                  "Generate an interactive visualization of your RBAC structure",
                ].map((item, i) => (
                  <motion.div
                    key={i}
                    className="flex items-center gap-3"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.7 + i * 0.1 }}
                  >
                    <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                    <span className="text-muted-foreground">{item}</span>
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
