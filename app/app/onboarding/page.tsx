"use client"

import React from "react"

import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, Sparkles } from "lucide-react"
import { getDisplayName, setDisplayName as saveDisplayName } from "@/lib/workspace-manager"

export default function OnboardingPage() {
  const [displayName, setDisplayName] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [existingName, setExistingName] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    const loadDisplayName = async () => {
      const savedName = await getDisplayName()
      if (savedName && savedName !== "User") {
        setExistingName(savedName)
      }
    }
    loadDisplayName()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!displayName.trim()) return
    
    setIsSubmitting(true)
    await saveDisplayName(displayName.trim())
    router.push("/app/onboarding/setup")
  }

  const handleSkip = () => {
    router.push("/app/onboarding/setup")
  }

  const handleContinue = () => {
    router.push("/app/onboarding/setup")
  }

  return (
    <main className="relative min-h-screen flex items-center justify-center overflow-hidden bg-background">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-muted/30" />
      
      {/* Static glow orbs */}
      <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full bg-primary/10 blur-3xl opacity-40" />
      <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full bg-cyan-500/10 blur-3xl opacity-40" />

      {/* Noise texture */}
      <div className="absolute inset-0 noise pointer-events-none" />

      {/* Content */}
      <motion.div
        className="relative z-10 w-full max-w-lg mx-4"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      >
        <AnimatePresence mode="wait">
          {existingName ? (
            /* Returning user */
            <motion.div
              key="returning"
              className="glass-card p-10 text-center"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.5 }}
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-primary to-cyan-500 flex items-center justify-center"
              >
                <Sparkles className="w-8 h-8 text-white" />
              </motion.div>
              
              <motion.h1
                className="text-3xl font-bold mb-3"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                Welcome, {existingName} 👋
              </motion.h1>
              
              <motion.p
                className="text-muted-foreground mb-8"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                Great to see you again. Ready to secure your clusters?
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
              >
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Button
                    onClick={handleContinue}
                    className="h-12 px-8 rounded-xl text-base font-medium"
                  >
                    Continue to Dashboard
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </motion.div>
              </motion.div>

              <motion.button
                className="mt-6 text-sm text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setExistingName(null)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
              >
                Not {existingName}? Change name
              </motion.button>
            </motion.div>
          ) : (
            /* New user */
            <motion.div
              key="new"
              className="glass-card p-10"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.5 }}
            >
              {/* Logo */}
              <motion.div
                className="flex items-center justify-center gap-3 mb-8"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-cyan-500 flex items-center justify-center">
                  <span className="text-white font-bold">K</span>
                </div>
                <span className="font-semibold text-xl">KubeScope</span>
              </motion.div>

              {/* Header */}
              <motion.div
                className="text-center mb-8"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <h1 className="text-3xl font-bold mb-3">Welcome to KubeScope</h1>
                <p className="text-muted-foreground">
                  Let&apos;s personalize your experience
                </p>
              </motion.div>

              {/* Form */}
              <motion.form
                onSubmit={handleSubmit}
                className="space-y-6"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                <div className="space-y-3">
                  <Label htmlFor="name" className="text-base">
                    What should we call you?
                  </Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="e.g., Sajal"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="h-14 rounded-xl text-lg px-5"
                    autoFocus
                    autoComplete="off"
                  />
                </div>

                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Button
                    type="submit"
                    className="w-full h-14 rounded-xl text-base font-medium relative overflow-hidden group"
                    disabled={isSubmitting || !displayName.trim()}
                  >
                    {isSubmitting ? (
                      <motion.div
                        className="flex items-center gap-2"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                      >
                        <motion.div
                          className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        />
                        Getting things ready...
                      </motion.div>
                    ) : (
                      <>
                        Get Started
                        <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                    
                    {/* Shimmer effect on hover */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Button>
                </motion.div>

                <motion.button
                  type="button"
                  className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
                  onClick={handleSkip}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Skip for now
                </motion.button>
              </motion.form>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Decorative elements */}
        <motion.div
          className="absolute -top-20 -right-20 w-40 h-40 rounded-full border border-border/20"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.8 }}
        />
        <motion.div
          className="absolute -bottom-16 -left-16 w-32 h-32 rounded-full border border-border/10"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.9 }}
        />
      </motion.div>
    </main>
  )
}
