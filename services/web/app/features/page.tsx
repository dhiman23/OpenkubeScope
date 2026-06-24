'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { Upload, Brain, AlertTriangle, Eye, Network, Folders, BarChart3, FileText, Shield, Zap, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

const features = [
  {
    icon: Upload,
    title: "RBAC Snapshot Upload",
    description: "Upload Kubernetes RBAC data as .json or .zip. Supports kubectl output and raw manifests with deterministic, reproducible results.",
    details: "Simply export your cluster's RBAC configuration and upload it to KubeScope. Our engine handles all formats automatically."
  },
  {
    icon: Brain,
    title: "Deep RBAC Core Engine",
    description: "Normalizes all RBAC formats into a single truth model. Resolves Roles → Rules, Bindings → Roles, Subjects → Effective permissions with perfect accuracy.",
    details: "Our proprietary engine performs comprehensive analysis of your entire RBAC hierarchy, ensuring no permission chains are missed."
  },
  {
    icon: AlertTriangle,
    title: "Accurate Risk Detection",
    description: "Automatically detects cluster-admin access, wildcards, secrets access, pod/exec permissions, and privilege escalation paths with severity levels.",
    details: "Identifies high-risk patterns including overly permissive rules, unnecessary wildcards, and potential privilege escalation vectors."
  },
  {
    icon: Eye,
    title: "RBAC Viewer",
    description: "Table view of actual effective permissions with Subject, Namespace, Resource, Verb, and risk severity. Powerful search, filters, and sorting.",
    details: "Drill down into permissions with advanced filtering and search capabilities. Understand exactly what access each user, group, or service account has."
  },
  {
    icon: Network,
    title: "RBAC Relationship Map",
    description: "Visual chain showing Subject → Binding → Role → Permissions. Instantly understand why access exists and highlight dangerous paths.",
    details: "Trace the complete permission chain from any subject to their effective permissions. Identify and visualize complex permission dependencies."
  },
  {
    icon: Folders,
    title: "Workspace-Based Scanning",
    description: "Multiple isolated workspaces per user. Each workspace has its own scans with independent dashboard and viewer data for team collaboration.",
    details: "Organize scans by project, environment, or team. Each workspace maintains separate scan history and findings for streamlined collaboration."
  },
  {
    icon: BarChart3,
    title: "Dashboard with Real Metrics",
    description: "Live totals from active scans: Subjects, Roles, Bindings, Risk counts by severity, and recent scan history. Only real data, no demo inflation.",
    details: "Get real-time insights into your RBAC configuration with comprehensive metrics and analytics dashboards."
  },
  {
    icon: FileText,
    title: "Risk Findings & Reports",
    description: "Centralized risk list grouped by severity. Expand to see impacted subjects and export findings as CSV for compliance and audits.",
    details: "Generate compliance-ready reports for auditors. Export findings in multiple formats for integration with your compliance workflows."
  },
  {
    icon: Shield,
    title: "Security-First by Design",
    description: "No cluster access required. No credentials stored. No agents needed for MVP. Designed for air-gapped and restricted environments.",
    details: "KubeScope respects your security boundaries. Upload snapshots without granting cluster access or storing sensitive credentials."
  },
  {
    icon: Zap,
    title: "KubeScope Agent (Pro+)",
    description: "Optional continuous Kubernetes agent running as non-root with read-only RBAC permissions. One included in Pro+, additional agents available.",
    details: "Deploy lightweight agents for continuous RBAC monitoring. Agents run with minimal permissions and zero cluster access overhead."
  },
]

export default function FeaturesPage() {
  return (
    <main className="relative min-h-screen pt-20">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-muted/20 to-background" />
      
      <div className="relative container mx-auto px-6 py-12">
        {/* Header with back button */}
        <motion.div
          className="mb-12"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
          
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            KubeScope Features
          </h1>
          <p className="text-lg text-muted-foreground max-w-3xl leading-relaxed">
            Comprehensive Kubernetes RBAC analysis and visualization platform. Understand your access control, identify risks, and maintain compliance.
          </p>
        </motion.div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 gap-8 mb-16">
          {features.map((feature, index) => {
            const Icon = feature.icon
            return (
              <motion.div
                key={feature.title}
                className="glass-card p-8 rounded-xl border border-border/50 hover:border-border transition-all duration-300 hover:shadow-lg hover:glow-sm"
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.08 }}
                whileHover={{ y: -4 }}
              >
                <div className="flex gap-4 mb-4">
                  <div className="flex-shrink-0 w-14 h-14 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    <Icon className="w-7 h-7" />
                  </div>
                </div>
                
                <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
                <p className="text-muted-foreground mb-4 leading-relaxed">
                  {feature.description}
                </p>
                <p className="text-sm text-muted-foreground/80 leading-relaxed border-t border-border/50 pt-4">
                  {feature.details}
                </p>
              </motion.div>
            )
          })}
        </div>

        {/* CTA Section */}
        <motion.div
          className="glass-card p-12 rounded-xl border border-primary/50 text-center max-w-2xl mx-auto"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-2xl font-bold mb-4">Ready to Understand Your RBAC?</h2>
          <p className="text-muted-foreground mb-8 leading-relaxed">
            Start with KubeScope Base for free, or upgrade to Unlimited Pro for advanced features and integrations.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/app">
              <Button size="lg" className="rounded-lg w-full sm:w-auto">
                Get Started Free
              </Button>
            </Link>
            <Link href="/#pricing">
              <Button size="lg" variant="outline" className="rounded-lg w-full sm:w-auto">
                View Pricing
              </Button>
            </Link>
          </div>
        </motion.div>
      </div>
    </main>
  )
}
