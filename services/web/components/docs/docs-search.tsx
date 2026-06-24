"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Search, X, FileText } from "lucide-react"
import { Input } from "@/components/ui/input"
import { useRouter } from "next/navigation"
import { navigation } from "./docs-sidebar"

const allPages = navigation.flatMap((section) =>
  section.items.map((item) => ({
    ...item,
    section: section.title,
  }))
)

export function DocsSearch() {
  const [query, setQuery] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  const router = useRouter()

  const filteredPages = query
    ? allPages.filter(
        (page) =>
          page.title.toLowerCase().includes(query.toLowerCase()) ||
          page.section.toLowerCase().includes(query.toLowerCase())
      )
    : []

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setIsOpen(true)
      }
      if (e.key === "Escape") {
        setIsOpen(false)
        setQuery("")
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  const handleSelect = (href: string) => {
    router.push(href)
    setIsOpen(false)
    setQuery("")
  }

  return (
    <>
      {/* Search trigger */}
      <motion.button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors text-left"
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
      >
        <Search className="w-4 h-4 text-muted-foreground" />
        <span className="flex-1 text-sm text-muted-foreground">Search documentation...</span>
        <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded bg-background text-xs text-muted-foreground border border-border">
          <span className="text-xs">Cmd</span>K
        </kbd>
      </motion.button>

      {/* Search modal */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsOpen(false)
                setQuery("")
              }}
            />
            <motion.div
              className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-lg z-50 px-4"
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
            >
              <div className="bg-background border border-border rounded-2xl shadow-2xl overflow-hidden">
                <div className="flex items-center gap-3 px-4 border-b border-border">
                  <Search className="w-4 h-4 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search documentation..."
                    className="flex-1 border-0 bg-transparent focus-visible:ring-0 px-0"
                    autoFocus
                  />
                  {query && (
                    <button onClick={() => setQuery("")}>
                      <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                    </button>
                  )}
                </div>

                {query && (
                  <div className="max-h-80 overflow-y-auto p-2">
                    {filteredPages.length > 0 ? (
                      <div className="space-y-1">
                        {filteredPages.map((page) => (
                          <button
                            key={page.href}
                            onClick={() => handleSelect(page.href)}
                            className="flex items-center gap-3 w-full px-3 py-2 rounded-xl hover:bg-muted/50 transition-colors text-left"
                          >
                            <FileText className="w-4 h-4 text-muted-foreground" />
                            <div>
                              <p className="text-sm font-medium">{page.title}</p>
                              <p className="text-xs text-muted-foreground">{page.section}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="px-3 py-8 text-center">
                        <p className="text-sm text-muted-foreground">No results found</p>
                      </div>
                    )}
                  </div>
                )}

                {!query && (
                  <div className="p-4 text-center">
                    <p className="text-sm text-muted-foreground">Start typing to search</p>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
