"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  setWorkspaceMode,
  setOnboardingCompleted,
  ensureDemoWorkspace,
  setActiveWorkspace,
  getDisplayName,
} from "@/lib/workspace-manager"
import { Zap, Upload } from "lucide-react"

export default function StartSetupPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const displayName = getDisplayName()

  const handleDemoStart = async () => {
    setIsLoading(true)
    
    setWorkspaceMode("demo")
    const demoWorkspace = ensureDemoWorkspace()
    setActiveWorkspace(demoWorkspace.id)
    setOnboardingCompleted(true)
    
    await new Promise(resolve => setTimeout(resolve, 300))
    router.push("/app")
  }

  const handleRealDataContinue = async () => {
    setIsLoading(true)
    setWorkspaceMode("real")
    
    await new Promise(resolve => setTimeout(resolve, 300))
    router.push("/onboarding/workspace")
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Animated background */}
      <motion.div
        className="absolute inset-0 opacity-30"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(59, 130, 246, 0.15), transparent 70%)",
        }}
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 8, repeat: Infinity }}
      />

      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-4">
        {/* Header */}
        <motion.div
          className="text-center mb-16 max-w-2xl"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-4xl font-bold mb-4">
            Welcome, {displayName} 👋
          </h1>
          <p className="text-xl text-muted-foreground">
            How would you like to start?
          </p>
        </motion.div>

        {/* Cards grid */}
        <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          {/* Demo card */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            whileHover={{ y: -8 }}
          >
            <Button
              onClick={handleDemoStart}
              disabled={isLoading}
              variant="outline"
              className="h-auto w-full p-8 flex flex-col items-start border-white/20 hover:border-primary/50 hover:bg-primary/5 transition-all relative overflow-hidden group bg-transparent"
            >
              {/* Gradient border animation */}
              <motion.div
                className="absolute inset-0 opacity-0 group-hover:opacity-100"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, rgba(59, 130, 246, 0.5), transparent)",
                }}
                animate={{ x: [-100, 100] }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              />

              <div className="relative z-10 w-full text-left">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-2xl font-bold">Try Demo Workspace</h3>
                  <Badge className="bg-primary/20 text-primary border-0">
                    Fastest
                  </Badge>
                </div>
                <p className="text-muted-foreground mb-6">
                  Explore KubeScope using realistic sample RBAC data.
                </p>
                <div className="flex items-center gap-2 text-primary font-semibold">
                  <Zap className="w-4 h-4" />
                  Start Demo
                </div>
              </div>
            </Button>
          </motion.div>

          {/* Real data card */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            whileHover={{ y: -8 }}
          >
            <Button
              onClick={handleRealDataContinue}
              disabled={isLoading}
              className="h-auto w-full p-8 flex flex-col items-start bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 hover:border-primary/60 text-foreground relative overflow-hidden group"
            >
              {/* Animated gradient background */}
              <motion.div
                className="absolute inset-0 opacity-0 group-hover:opacity-30 bg-gradient-to-br from-primary to-transparent"
                animate={{ scale: [0.8, 1.2] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              />

              <div className="relative z-10 w-full text-left">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-2xl font-bold">Upload RBAC Snapshot</h3>
                  <Badge className="bg-primary text-primary-foreground border-0">
                    Real Data
                  </Badge>
                </div>
                <p className="text-muted-foreground mb-6">
                  Upload exported RBAC snapshot (zip/json) to analyze your cluster.
                </p>
                <div className="flex items-center gap-2 font-semibold">
                  <Upload className="w-4 h-4" />
                  Continue
                </div>
              </div>
            </Button>
          </motion.div>
        </div>

        {/* Bottom text */}
        <motion.p
          className="text-center text-sm text-muted-foreground max-w-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.5 }}
        >
          You can switch between demo and real data anytime. Choose what works best for you right now.
        </motion.p>
      </div>
    </div>
  )
}
