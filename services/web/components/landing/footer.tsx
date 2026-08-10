"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import { Github } from "lucide-react"

const GITHUB_URL = "https://github.com/dhiman23/OpenkubeScope"

// Only routes that exist. Placeholder entries (Changelog, Roadmap, Blog,
// About, Careers, Privacy, ...) were dropped rather than left as href="#".
const footerLinks = {
  Product: [{ label: "Features", href: "/features" }],
  Resources: [
    { label: "Documentation", href: "/docs" },
    { label: "Guides", href: "/docs/getting-started" },
    { label: "Upload a snapshot", href: "/docs/upload-snapshot" },
    { label: "FAQ", href: "/docs/faq" },
  ],
  Legal: [{ label: "Security & Privacy", href: "/docs/security-privacy" }],
}

export function Footer() {
  return (
    <footer className="relative border-t border-border">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background to-muted/30" />
      
      <div className="relative container mx-auto px-6 py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 lg:gap-16">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
            >
              <Link href="/" className="flex items-center gap-2">
                <div className="w-8 h-8 flex items-center justify-center">
                  <img src="/kubescope-icon.png" alt="KubeScope" className="w-8 h-8 logo-img" />
                </div>
                <span className="font-semibold text-lg">KubeScope</span>
              </Link>
              <p className="mt-4 text-sm text-muted-foreground max-w-xs">
                The modern way to understand and audit Kubernetes RBAC permissions.
              </p>
              <div className="mt-6 flex items-center gap-4">
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="GitHub"
                >
                  <Github className="w-5 h-5" />
                </a>
              </div>
            </motion.div>
          </div>

          {/* Links */}
          {Object.entries(footerLinks).map(([category, links], index) => (
            <motion.div
              key={category}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
            >
              <h3 className="font-semibold mb-4">{category}</h3>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>

        {/* Bottom */}
        <motion.div
          className="mt-16 pt-8 border-t border-border flex flex-col md:flex-row items-center justify-between gap-4"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
        >
          <p className="text-sm text-muted-foreground">
            {new Date().getFullYear()} KubeScope. All rights reserved.
          </p>
          <p className="text-sm text-muted-foreground">
            Made with precision for Kubernetes security
          </p>
        </motion.div>
      </div>
    </footer>
  )
}
