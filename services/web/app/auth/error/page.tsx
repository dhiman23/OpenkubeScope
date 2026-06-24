"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { motion } from "framer-motion"
import { AlertTriangle, ArrowLeft, Shield, Info } from "lucide-react"
import { Suspense } from "react"

function AuthErrorContent() {
  const searchParams = useSearchParams()
  const error = searchParams.get("error")
  const errorDescription = searchParams.get("error_description")

  const getErrorMessage = () => {
    if (errorDescription) return errorDescription
    
    switch (error) {
      case "access_denied":
        return "Access was denied. You may have cancelled the sign-in process."
      case "unauthorized_client":
        return "The OAuth provider is not properly configured."
      case "server_error":
        return "The authentication server encountered an error."
      case "session_exchange_failed":
        return "Failed to establish a session. Please try again."
      default:
        return "Something went wrong during the authentication process."
    }
  }

  const isConfigError = error === "unauthorized_client" || 
    errorDescription?.includes("provider") || 
    errorDescription?.includes("blocked")

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6 relative overflow-hidden">
      {/* Background gradient effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-1/4 w-1/2 h-1/2 bg-destructive/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-1/4 w-1/2 h-1/2 bg-destructive/5 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative z-10"
      >
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <span className="text-2xl font-bold">KubeScope</span>
        </div>

        <Card className="border-destructive/20 shadow-xl">
          <CardHeader className="text-center pb-4">
            <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6 text-destructive" />
            </div>
            <CardTitle className="text-2xl">Authentication Error</CardTitle>
            <CardDescription>
              {getErrorMessage()}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="bg-muted/50 p-3 rounded-lg text-xs font-mono text-muted-foreground">
                Error code: {error}
              </div>
            )}

            {isConfigError && (
              <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-lg">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-blue-500 mb-2">Configuration Required</p>
                    <p className="text-muted-foreground mb-2">
                      Google OAuth needs to be configured in your Supabase project:
                    </p>
                    <ol className="text-muted-foreground space-y-1 list-decimal list-inside">
                      <li>Go to Supabase Dashboard</li>
                      <li>Navigate to Authentication → Providers</li>
                      <li>Enable Google provider</li>
                      <li>Add your Google OAuth credentials</li>
                    </ol>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-3">
              <Link href="/auth/login">
                <Button className="w-full rounded-xl">
                  Try again
                </Button>
              </Link>
              <Link href="/">
                <Button variant="outline" className="w-full rounded-xl bg-transparent">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to home
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <AuthErrorContent />
    </Suspense>
  )
}
