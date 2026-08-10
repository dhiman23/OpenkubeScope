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

      </div>
    </section>
  )
}
