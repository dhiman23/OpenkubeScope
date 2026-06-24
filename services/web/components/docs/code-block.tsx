"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Check, Copy } from "lucide-react"
import { cn } from "@/lib/utils"

interface CodeBlockProps {
  children: string
  language?: string
  filename?: string
}

export function CodeBlock({ children, language = "json", filename }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(children)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative group rounded-xl overflow-hidden border border-border bg-muted/30 my-4">
      {filename && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/50">
          <span className="text-xs text-muted-foreground font-mono">{filename}</span>
          <span className="text-xs text-muted-foreground">{language}</span>
        </div>
      )}
      <div className="relative">
        <pre className={cn(
          "p-4 overflow-x-auto text-sm",
          !filename && "pt-10"
        )}>
          <code className="font-mono text-foreground/90">{children}</code>
        </pre>
        <motion.button
          onClick={handleCopy}
          className={cn(
            "absolute top-3 right-3 p-2 rounded-lg transition-colors",
            "bg-muted hover:bg-muted/80",
            "opacity-0 group-hover:opacity-100"
          )}
          whileTap={{ scale: 0.95 }}
        >
          {copied ? (
            <Check className="w-4 h-4 text-green-500" />
          ) : (
            <Copy className="w-4 h-4 text-muted-foreground" />
          )}
        </motion.button>
      </div>
    </div>
  )
}
