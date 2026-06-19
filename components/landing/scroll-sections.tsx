"use client"

import { motion, useScroll, useTransform } from "framer-motion"
import { useRef } from "react"
import { Search, Map, FileWarning, Download } from "lucide-react"

const sections = [
  {
    id: "search",
    title: "Search Permissions Like Google",
    description: "Instantly find who has access to what. Search by subject, namespace, resource, or verb with real-time filtering.",
    icon: Search,
    features: [
      "Fuzzy search across all RBAC resources",
      "Filter by namespace, subject type, risk level",
      "Instant results with highlighted matches",
    ],
    mockContent: (
      <div className="space-y-3">
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-muted/50">
          <Search className="w-4 h-4 text-muted-foreground" />
          <span className="text-muted-foreground">Search permissions...</span>
        </div>
        <div className="space-y-2">
          {["admin-user", "developer", "readonly-sa"].map((user, i) => (
            <motion.div
              key={user}
              className="flex items-center justify-between px-4 py-3 rounded-xl bg-card border border-border"
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${i === 0 ? 'bg-destructive' : i === 1 ? 'bg-warning' : 'bg-success'}`} />
                <span className="font-medium">{user}</span>
              </div>
              <span className="text-xs text-muted-foreground">default</span>
            </motion.div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: "map",
    title: "RBAC Map View",
    description: "Visualize the complete permission chain from subject to resource. See exactly how access is granted.",
    icon: Map,
    features: [
      "Subject → Binding → Role → Permissions",
      "Interactive node-based visualization",
      "Highlight dangerous permission paths",
    ],
    mockContent: (
      <div className="space-y-4">
        {/* Vertical stacked nodes for better mobile support */}
        <motion.div
          className="flex items-center gap-3"
          initial={{ opacity: 0, x: -20 }}
          whileInView={{ opacity: 1, x: 0 }}
        >
          <div className="px-4 py-2 rounded-xl bg-primary/20 border border-primary/30 shrink-0">
            <span className="text-sm font-medium">admin-user</span>
          </div>
          <div className="flex-1 h-px bg-border border-dashed" />
        </motion.div>
        
        <motion.div
          className="flex items-center gap-3 pl-8"
          initial={{ opacity: 0, x: -20 }}
          whileInView={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="w-2 h-2 rounded-full bg-border" />
          <div className="px-4 py-2 rounded-xl bg-card border border-border">
            <span className="text-sm">ClusterRoleBinding</span>
          </div>
          <div className="flex-1 h-px bg-border border-dashed" />
        </motion.div>
        
        <motion.div
          className="flex items-center gap-3 pl-16"
          initial={{ opacity: 0, x: -20 }}
          whileInView={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="w-2 h-2 rounded-full bg-destructive" />
          <div className="px-4 py-2 rounded-xl bg-destructive/20 border border-destructive/30">
            <span className="text-sm font-medium text-destructive">cluster-admin</span>
          </div>
        </motion.div>
        
        <motion.div
          className="mt-4 p-3 rounded-xl bg-muted/50 text-xs text-muted-foreground"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          Subject → Binding → Role chain visualization
        </motion.div>
      </div>
    ),
  },
  {
    id: "risk",
    title: "Risk Findings + Export Report",
    description: "Automatically detect dangerous permissions. Export comprehensive reports for audits and compliance.",
    icon: FileWarning,
    features: [
      "Auto-detect risky permissions",
      "Severity categorization (High/Medium/Low)",
      "Export to PDF, CSV, or share via link",
    ],
    mockContent: (
      <div className="space-y-3">
        {[
          { severity: "High", count: 3, color: "bg-destructive" },
          { severity: "Medium", count: 8, color: "bg-warning" },
          { severity: "Low", count: 12, color: "bg-success" },
        ].map((item, i) => (
          <motion.div
            key={item.severity}
            className="flex items-center justify-between px-4 py-3 rounded-xl bg-card border border-border"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${item.color}`} />
              <span className="font-medium">{item.severity} Risk</span>
            </div>
            <span className="px-3 py-1 rounded-full bg-muted text-sm">{item.count} findings</span>
          </motion.div>
        ))}
        <motion.button
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-medium"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Download className="w-4 h-4" />
          Export Report
        </motion.button>
      </div>
    ),
  },
]

function ScrollSection({ section, index }: { section: typeof sections[0]; index: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  })
  
  const y = useTransform(scrollYProgress, [0, 1], [100, -100])
  const opacity = useTransform(scrollYProgress, [0, 0.3, 0.7, 1], [0, 1, 1, 0])

  const Icon = section.icon

  return (
    <motion.div
      ref={ref}
      className="py-32"
      style={{ opacity }}
    >
      <div className={`container mx-auto px-6 flex flex-col ${index % 2 === 0 ? 'lg:flex-row' : 'lg:flex-row-reverse'} items-center gap-16`}>
        {/* Content */}
        <div className="flex-1 space-y-6">
          <motion.div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary"
            style={{ y }}
          >
            <Icon className="w-4 h-4" />
            <span className="text-sm font-medium">Feature {index + 1}</span>
          </motion.div>
          
          <motion.h2 
            className="text-4xl md:text-5xl font-bold tracking-tight text-balance"
            style={{ y }}
          >
            {section.title}
          </motion.h2>
          
          <motion.p 
            className="text-lg text-muted-foreground max-w-md"
            style={{ y }}
          >
            {section.description}
          </motion.p>
          
          <motion.ul className="space-y-3" style={{ y }}>
            {section.features.map((feature, i) => (
              <motion.li
                key={i}
                className="flex items-center gap-3 text-muted-foreground"
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                {feature}
              </motion.li>
            ))}
          </motion.ul>
        </div>

        {/* Mock UI */}
        <motion.div 
          className="flex-1 w-full max-w-md"
          style={{ y: useTransform(scrollYProgress, [0, 1], [50, -50]) }}
        >
          <div className="glass-card p-6 premium-shadow-lg">
            {section.mockContent}
          </div>
        </motion.div>
      </div>
    </motion.div>
  )
}

export function ScrollSections() {
  return (
    <section className="relative">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-muted/30 via-background to-muted/30" />
      
      <div className="relative">
        {sections.map((section, index) => (
          <ScrollSection key={section.id} section={section} index={index} />
        ))}
      </div>
    </section>
  )
}
