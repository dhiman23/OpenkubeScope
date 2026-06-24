"use client"

import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { 
  ArrowRight, 
  Play, 
  Upload, 
  Sparkles,
  Zap,
  Database
} from "lucide-react"
import { 
  getDisplayName, 
  setWorkspaceMode, 
  setOnboardingCompleted 
} from "@/lib/workspace-manager"

export default function SetupPage() {
  const [displayName, setDisplayName] = useState<string>("")
  const [hoveredCard, setHoveredCard] = useState<string | null>(null)
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    const loadDisplayName = async () => {
      const savedName = await getDisplayName()
      if (savedName) {
        setDisplayName(savedName)
      }
    }
    loadDisplayName()
  }, [])

  const handleDemoStart = async () => {
    setSelectedOption("demo")
    await setWorkspaceMode("demo")
    await setOnboardingCompleted(true)
    router.push("/app")
  }

  const handleUploadStart = async () => {
    setSelectedOption("real")
    await setWorkspaceMode("real")
    await setOnboardingCompleted(true)
    router.push("/app/clusters?upload=true")
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
        delayChildren: 0.2,
      },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
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
        className="relative z-10 w-full max-w-3xl mx-4"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Header */}
        <motion.div className="text-center mb-10" variants={itemVariants}>
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
            className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-primary to-cyan-500 flex items-center justify-center"
          >
            <Sparkles className="w-8 h-8 text-white" />
          </motion.div>
          
          <h1 className="text-3xl md:text-4xl font-bold mb-3">
            {displayName ? `Welcome, ${displayName}` : "Welcome"} 👋
          </h1>
          <p className="text-lg text-muted-foreground">
            How would you like to start?
          </p>
        </motion.div>

        {/* Option Cards */}
        <motion.div 
          className="grid md:grid-cols-2 gap-6"
          variants={itemVariants}
        >
          {/* Demo Workspace Card */}
          <motion.div
            className={`relative group cursor-pointer ${selectedOption === "demo" ? "pointer-events-none" : ""}`}
            onMouseEnter={() => setHoveredCard("demo")}
            onMouseLeave={() => setHoveredCard(null)}
            onClick={handleDemoStart}
            whileHover={{ y: -4 }}
            whileTap={{ scale: 0.98 }}
          >
            {/* Animated border gradient */}
            <motion.div
              className="absolute -inset-[1px] rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
              style={{
                background: "linear-gradient(135deg, #0891b2, #22d3ee, #06b6d4, #0891b2)",
                backgroundSize: "300% 300%",
              }}
              animate={hoveredCard === "demo" ? {
                backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
              } : {}}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "linear",
              }}
            />
            
            {/* Glow effect */}
            <motion.div
              className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              style={{
                boxShadow: "0 0 40px -10px rgba(34, 211, 238, 0.4)",
              }}
            />
            
            <div className="relative glass-card p-8 h-full flex flex-col">
              {/* Badge */}
              <div className="absolute top-4 right-4">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
                  <Zap className="w-3.5 h-3.5" />
                  Fastest
                </span>
              </div>

              {/* Icon */}
              <motion.div
                className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/20 to-cyan-500/20 flex items-center justify-center mb-6"
                animate={hoveredCard === "demo" ? { scale: [1, 1.05, 1] } : {}}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Play className="w-7 h-7 text-primary" />
              </motion.div>

              {/* Content */}
              <h2 className="text-xl font-semibold mb-2">Try Demo Workspace</h2>
              <p className="text-muted-foreground mb-8 flex-grow">
                Explore KubeScope using realistic sample RBAC data.
              </p>

              {/* Button */}
              <Button
                className="w-full h-12 rounded-xl text-base font-medium relative overflow-hidden group/btn"
                disabled={selectedOption === "demo"}
              >
                {selectedOption === "demo" ? (
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
                    Loading...
                  </motion.div>
                ) : (
                  <>
                    Start Demo
                    <ArrowRight className="w-4 h-4 ml-2 group-hover/btn:translate-x-1 transition-transform" />
                  </>
                )}
              </Button>
            </div>
          </motion.div>

          {/* Upload Snapshot Card */}
          <motion.div
            className={`relative group cursor-pointer ${selectedOption === "real" ? "pointer-events-none" : ""}`}
            onMouseEnter={() => setHoveredCard("upload")}
            onMouseLeave={() => setHoveredCard(null)}
            onClick={handleUploadStart}
            whileHover={{ y: -4 }}
            whileTap={{ scale: 0.98 }}
          >
            {/* Animated border gradient */}
            <motion.div
              className="absolute -inset-[1px] rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
              style={{
                background: "linear-gradient(135deg, #8b5cf6, #a78bfa, #7c3aed, #8b5cf6)",
                backgroundSize: "300% 300%",
              }}
              animate={hoveredCard === "upload" ? {
                backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
              } : {}}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "linear",
              }}
            />
            
            {/* Glow effect */}
            <motion.div
              className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              style={{
                boxShadow: "0 0 40px -10px rgba(139, 92, 246, 0.4)",
              }}
            />
            
            <div className="relative glass-card p-8 h-full flex flex-col">
              {/* Badge */}
              <div className="absolute top-4 right-4">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-500/10 text-violet-400 text-sm font-medium">
                  <Database className="w-3.5 h-3.5" />
                  Real Data
                </span>
              </div>

              {/* Icon */}
              <motion.div
                className="w-14 h-14 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 flex items-center justify-center mb-6"
                animate={hoveredCard === "upload" ? { scale: [1, 1.05, 1] } : {}}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Upload className="w-7 h-7 text-violet-400" />
              </motion.div>

              {/* Content */}
              <h2 className="text-xl font-semibold mb-2">Upload RBAC Snapshot</h2>
              <p className="text-muted-foreground mb-8 flex-grow">
                Upload exported RBAC snapshot (zip/json) to analyze your cluster.
              </p>

              {/* Button */}
              <Button
                variant="outline"
                className="w-full h-12 rounded-xl text-base font-medium border-violet-500/30 hover:bg-violet-500/10 hover:border-violet-500/50 relative overflow-hidden group/btn bg-transparent"
                disabled={selectedOption === "real"}
              >
                {selectedOption === "real" ? (
                  <motion.div
                    className="flex items-center gap-2"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <motion.div
                      className="w-5 h-5 border-2 border-violet-400/30 border-t-violet-400 rounded-full"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    />
                    Loading...
                  </motion.div>
                ) : (
                  <>
                    Upload Snapshot
                    <ArrowRight className="w-4 h-4 ml-2 group-hover/btn:translate-x-1 transition-transform" />
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        </motion.div>

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
