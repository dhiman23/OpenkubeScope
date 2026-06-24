"use client"

import { motion } from "framer-motion"
import { DocsSearch } from "@/components/docs/docs-search"
import { DocsToc } from "@/components/docs/docs-toc"
import { DocsNav } from "@/components/docs/docs-nav"
import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { useSearchParams } from "next/navigation"
import { Suspense } from "react"
import Loading from "./loading"

const tocItems = [
  { id: "general", title: "General", level: 2 },
  { id: "security", title: "Security", level: 2 },
  { id: "features", title: "Features", level: 2 },
]

const faqs = [
  {
    category: "General",
    id: "general",
    questions: [
      {
        q: "Is KubeScope like Portainer or Rancher?",
        a: "No. KubeScope is focused specifically on RBAC auditing and visualization. It doesn't manage deployments, pods, or other workloads. Think of it as a specialized security tool for understanding and auditing your cluster permissions.",
      },
      {
        q: "What Kubernetes distributions are supported?",
        a: "KubeScope works with any Kubernetes distribution that uses standard RBAC (Role, ClusterRole, RoleBinding, ClusterRoleBinding). This includes EKS, GKE, AKS, self-hosted clusters, k3s, and more.",
      },
      {
        q: "Do I need to install anything in my cluster?",
        a: "No. The current version uses a snapshot-based approach. You export RBAC resources using kubectl and upload them to KubeScope. No agent or operator installation required.",
      },
    ],
  },
  {
    category: "Security",
    id: "security",
    questions: [
      {
        q: "Does KubeScope modify my cluster?",
        a: "No. KubeScope is completely read-only. It only analyzes RBAC data you provide. It never creates, updates, or deletes any Kubernetes resources.",
      },
      {
        q: "Where is my data stored?",
        a: "In the current version, analysis runs entirely in your browser. Uploaded snapshots are processed in-memory and not persisted on any server. Your RBAC data stays on your machine.",
      },
      {
        q: "Is it safe to upload my RBAC data?",
        a: "RBAC data contains permission information, not secrets or sensitive application data. However, we recommend removing any custom annotations that might contain sensitive information before uploading.",
      },
    ],
  },
  {
    category: "Features",
    id: "features",
    questions: [
      {
        q: "Is multi-cluster support available?",
        a: "Multi-cluster support is planned for a future release. Currently, you can analyze one cluster at a time by uploading separate snapshots.",
      },
      {
        q: "Can I schedule automatic scans?",
        a: "Automatic scanning will be available with the upcoming agent-based sync feature. This will allow real-time monitoring and scheduled audits.",
      },
      {
        q: "What export formats are supported?",
        a: "CSV export is currently available. PDF report generation is coming soon and will include executive summaries, risk breakdowns, and remediation recommendations.",
      },
    ],
  },
]

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <motion.div
      className="border border-border rounded-xl overflow-hidden"
      initial={false}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors"
      >
        <span className="font-medium pr-4">{question}</span>
        <ChevronDown
          className={cn(
            "w-5 h-5 text-muted-foreground flex-shrink-0 transition-transform",
            isOpen && "rotate-180"
          )}
        />
      </button>
      <motion.div
        initial={false}
        animate={{ height: isOpen ? "auto" : 0, opacity: isOpen ? 1 : 0 }}
        transition={{ duration: 0.2 }}
        className="overflow-hidden"
      >
        <div className="px-4 pb-4 text-muted-foreground">
          {answer}
        </div>
      </motion.div>
    </motion.div>
  )
}

export default function FaqPage() {
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
              <span className="text-sm text-primary font-medium">Help</span>
              <h1 className="text-4xl font-bold tracking-tight mt-2">FAQ</h1>
              <p className="text-lg text-muted-foreground mt-4 leading-relaxed">
                Frequently asked questions about KubeScope.
              </p>
            </motion.div>

            {faqs.map((section, sectionIndex) => (
              <motion.section
                key={section.id}
                className="mt-12"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 + sectionIndex * 0.1 }}
              >
                <h2 id={section.id} className="text-2xl font-semibold scroll-mt-24 mb-6">
                  {section.category}
                </h2>
                <div className="space-y-3">
                  {section.questions.map((faq, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 + sectionIndex * 0.1 + i * 0.05 }}
                    >
                      <FaqItem question={faq.q} answer={faq.a} />
                    </motion.div>
                  ))}
                </div>
              </motion.section>
            ))}

            <DocsNav />
          </div>
        </motion.article>

        <DocsToc items={tocItems} />
      </div>
    </Suspense>
  )
}
