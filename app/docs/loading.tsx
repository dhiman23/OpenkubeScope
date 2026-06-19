"use client"

import { motion } from "framer-motion"

export default function DocsLoading() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-16">
      <div className="animate-pulse space-y-8">
        {/* Search skeleton */}
        <div className="h-12 bg-muted/50 rounded-xl" />
        
        {/* Title skeleton */}
        <div className="space-y-4">
          <div className="h-10 bg-muted/50 rounded-lg w-3/4" />
          <div className="h-4 bg-muted/30 rounded w-1/2" />
        </div>
        
        {/* Content skeletons */}
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="h-6 bg-muted/40 rounded w-1/3" />
            <div className="h-4 bg-muted/30 rounded w-full" />
            <div className="h-4 bg-muted/30 rounded w-5/6" />
            <div className="h-4 bg-muted/30 rounded w-4/6" />
          </div>
          
          <div className="space-y-3">
            <div className="h-6 bg-muted/40 rounded w-1/4" />
            <div className="h-4 bg-muted/30 rounded w-full" />
            <div className="h-4 bg-muted/30 rounded w-3/4" />
          </div>
          
          <div className="h-32 bg-muted/20 rounded-xl" />
        </div>
      </div>
    </div>
  )
}
