"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { usePathname } from "next/navigation"
import { navigation } from "./docs-sidebar"

// Flatten navigation for prev/next
const flatNav = navigation.flatMap((section) => section.items)

export function DocsNav() {
  const pathname = usePathname()
  const currentIndex = flatNav.findIndex((item) => item.href === pathname)
  const prev = currentIndex > 0 ? flatNav[currentIndex - 1] : null
  const next = currentIndex < flatNav.length - 1 ? flatNav[currentIndex + 1] : null

  return (
    <motion.div
      className="flex items-center justify-between mt-16 pt-8 border-t border-border"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
    >
      {prev ? (
        <Link
          href={prev.href}
          className="group flex flex-col items-start gap-1 p-4 rounded-xl hover:bg-muted/50 transition-colors"
        >
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <ChevronLeft className="w-3 h-3" />
            Previous
          </span>
          <span className="font-medium group-hover:text-primary transition-colors">
            {prev.title}
          </span>
        </Link>
      ) : (
        <div />
      )}

      {next ? (
        <Link
          href={next.href}
          className="group flex flex-col items-end gap-1 p-4 rounded-xl hover:bg-muted/50 transition-colors"
        >
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            Next
            <ChevronRight className="w-3 h-3" />
          </span>
          <span className="font-medium group-hover:text-primary transition-colors">
            {next.title}
          </span>
        </Link>
      ) : (
        <div />
      )}
    </motion.div>
  )
}
