"use client"

import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { ArrowRight, Play } from "lucide-react"
import Link from "next/link"
import { useAuth } from "@/app/providers/AuthProvider"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { useToast } from "@/hooks/use-toast"


const floatingCards = [
  { title: "Secrets Access", delay: 0, x: -120, y: -60 },
  { title: "Cluster Admin", delay: 0.2, x: 120, y: -40 },
  { title: "RBAC Map", delay: 0.4, x: 0, y: 80 },
]

export function Hero() {
  const { user } = useAuth()
  const router = useRouter()
  const { toast } = useToast()
  const [isSigningIn, setIsSigningIn] = useState(false)

  const handleGetStarted = () => {
    // Signed in -> dashboard; otherwise -> login page (username/password).
    router.push(user ? "/app" : "/auth/login")
  }

  const getButtonText = () => {
    if (user) return "Go to Dashboard"
    return "Sign in"
  }

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-muted/30" />
      
      {/* Animated gradient orbs */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full bg-primary/10 blur-[120px]"
          animate={{
            x: [0, 50, 0],
            y: [0, 30, 0],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-primary/5 blur-[100px]"
          animate={{
            x: [0, -30, 0],
            y: [0, -50, 0],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </div>

      {/* Noise texture overlay */}
      <div className="absolute inset-0 noise pointer-events-none" />

      <div className="relative z-10 container mx-auto px-6 py-32">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass text-sm text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
              Kubernetes Security Made Simple
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            className="mt-8 text-5xl md:text-7xl font-bold tracking-tight text-balance"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            Know Who Has Access.{" "}
            <span className="text-gradient">Instantly.</span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            className="mt-6 text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto text-balance"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            KubeScope maps Kubernetes permissions in seconds—search, visualize, export.
          </motion.p>

          {/* CTAs */}
          <motion.div
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <Button 
              onClick={handleGetStarted}
              disabled={isSigningIn}
              size="lg" 
              className="group relative overflow-hidden rounded-xl px-8 py-6 text-base font-medium transition-all duration-300 hover:scale-105 hover:glow-md bg-white text-gray-900 hover:bg-gray-100"
            >
              <span className="relative z-10 flex items-center gap-2">
                {isSigningIn ? (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="w-5 h-5 mr-2 border-2 border-gray-900 border-t-transparent rounded-full"
                    />
                    Signing in...
                  </>
                ) : (
                  <>
                    {getButtonText()}
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </>
                )}
              </span>
            </Button>
            <Link href="/docs/getting-started">
              <Button 
                variant="outline" 
                size="lg"
                className="group rounded-xl px-8 py-6 text-base font-medium transition-all duration-300 hover:scale-105 hover:bg-accent bg-transparent"
              >
                <Play className="w-4 h-4 mr-2" />
                View Docs
              </Button>
            </Link>
          </motion.div>
        </div>

        {/* Floating glass cards */}
        <div className="relative mt-20 h-[300px] max-w-3xl mx-auto">
          {floatingCards.map((card, index) => (
            <motion.div
              key={card.title}
              className="absolute left-1/2 top-1/2 glass-card px-6 py-4 cursor-default"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ 
                opacity: 1, 
                scale: 1,
                x: card.x - 60,
                y: card.y,
              }}
              transition={{
                duration: 0.8,
                delay: 0.5 + card.delay,
                ease: [0.16, 1, 0.3, 1],
              }}
              whileHover={{ 
                scale: 1.05,
              }}
            >
              <motion.div
                animate={{
                  y: [0, -10, 0],
                }}
                transition={{
                  duration: 4 + index,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${
                    index === 0 ? 'bg-destructive' : 
                    index === 1 ? 'bg-warning' : 
                    'bg-primary'
                  }`} />
                  <span className="font-medium text-foreground">{card.title}</span>
                </div>
                <div className="mt-2 flex gap-2">
                  {[...Array(3)].map((_, i) => (
                    <div 
                      key={i} 
                      className="h-2 rounded-full bg-muted"
                      style={{ width: `${40 + Math.random() * 40}px` }}
                    />
                  ))}
                </div>
              </motion.div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
      >
        <motion.div
          className="w-6 h-10 rounded-full border-2 border-muted-foreground/30 flex items-start justify-center p-2"
          animate={{ y: [0, 5, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <motion.div 
            className="w-1 h-2 rounded-full bg-muted-foreground/50"
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        </motion.div>
      </motion.div>
    </section>
  )
}
