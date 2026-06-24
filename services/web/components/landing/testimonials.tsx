"use client"

import { motion } from "framer-motion"

export function Testimonials() {
  return (
    <section className="relative py-32 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-muted/20 to-background" />
      
      <div className="relative container mx-auto px-6">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
            Why RBAC Governance Matters
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Role-Based Access Control (RBAC) is the foundational framework for managing permissions and privileges in Kubernetes environments. Proper RBAC implementation ensures that users, service accounts, and applications have precisely the permissions they need—no more, no less. This principle of least privilege is critical for maintaining security posture, enabling compliance, and preventing unauthorized access that could lead to data breaches or infrastructure compromise.
          </p>
          <p className="mt-6 text-base text-muted-foreground/80">
            Effective RBAC governance reduces operational risk and simplifies security audits across distributed systems.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {/* Free Plan */}
          <motion.div
            className="glass-card p-8 transition-all duration-300 hover:glow-sm relative"
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0 }}
            whileHover={{ y: -4 }}
          >
            <div className="mb-6">
              <h3 className="text-2xl font-bold mb-2">KubeScope Base</h3>
              <div className="text-3xl font-bold text-primary">Free</div>
              <p className="text-sm text-muted-foreground mt-2">Perfect for individuals and learning</p>
            </div>
            
            <div className="space-y-4 mb-8">
              <div className="flex items-start gap-3">
                <span className="text-primary font-bold mt-0.5">✓</span>
                <span className="text-sm">1 lifetime RBAC scan</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-primary font-bold mt-0.5">✓</span>
                <span className="text-sm">RBAC Viewer + basic risk highlights</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-primary font-bold mt-0.5">✓</span>
                <span className="text-sm">Export basic findings (CSV)</span>
              </div>
            </div>
            
            <button className="w-full py-2.5 px-4 border border-border rounded-lg hover:bg-muted/50 transition-colors font-medium">
              Start Free
            </button>
          </motion.div>

          {/* Unlimited Plan */}
          <motion.div
            className="glass-card p-8 transition-all duration-300 hover:glow-sm border-2 border-primary relative"
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            whileHover={{ y: -4 }}
          >
            <div className="absolute top-0 right-4 -translate-y-1/2">
              <span className="bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full">
                RECOMMENDED
              </span>
            </div>
            
            <div className="mb-6">
              <h3 className="text-2xl font-bold mb-2">KubeScope Unlimited</h3>
              <div className="text-3xl font-bold text-primary">$15<span className="text-lg text-muted-foreground">/month</span></div>
              <p className="text-sm text-muted-foreground mt-2">For teams and production clusters</p>
            </div>
            
            <div className="space-y-4 mb-8">
              <div className="flex items-start gap-3">
                <span className="text-primary font-bold mt-0.5">✓</span>
                <span className="text-sm">Everything in Free, plus:</span>
              </div>
              <div className="flex items-start gap-3 ml-6">
                <span className="text-primary font-bold mt-0.5">✓</span>
                <span className="text-sm">Unlimited RBAC scans</span>
              </div>
              <div className="flex items-start gap-3 ml-6">
                <span className="text-primary font-bold mt-0.5">✓</span>
                <span className="text-sm">RBAC Map + permission visualization</span>
              </div>
              <div className="flex items-start gap-3 ml-6">
                <span className="text-primary font-bold mt-0.5">✓</span>
                <span className="text-sm">Full risk findings breakdown</span>
              </div>
              <div className="flex items-start gap-3 ml-6">
                <span className="text-primary font-bold mt-0.5">✓</span>
                <span className="text-sm">Priority updates & upcoming integrations</span>
              </div>
            </div>
            
            <button className="w-full py-2.5 px-4 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity font-medium">
              Upgrade to Unlimited
            </button>
          </motion.div>

          {/* Pro Plan - Coming Soon */}
          <motion.div
            className="glass-card p-8 transition-all duration-300 border-2 border-amber-500/50 relative flex items-center justify-center min-h-96"
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            <div className="absolute top-0 right-4 -translate-y-1/2">
              <span className="bg-amber-500 text-amber-950 text-xs font-semibold px-3 py-1 rounded-full">
                MOST POWERFUL
              </span>
            </div>
            
            <div className="text-center">
              <h3 className="text-2xl font-bold mb-2">KubeScope Unlimited Pro</h3>
              <p className="text-lg text-muted-foreground mb-4">Coming Soon</p>
              <p className="text-sm text-muted-foreground max-w-xs">
                Advanced automation, enterprise integrations, and dedicated support features launching soon
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
