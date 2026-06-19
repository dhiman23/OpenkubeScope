"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle2, XCircle, AlertCircle, ExternalLink } from "lucide-react"
import Link from "next/link"

export default function TestConfigPage() {
  const [connectionStatus, setConnectionStatus] = useState<"checking" | "success" | "error">("checking")
  const [googleOAuthStatus, setGoogleOAuthStatus] = useState<"checking" | "enabled" | "disabled">("checking")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    testConfiguration()
  }, [])

  const testConfiguration = async () => {
    const supabase = createClient()
    
    // Test 1: Check Supabase connection
    try {
      const { data, error } = await supabase.auth.getSession()
      if (error) throw error
      setConnectionStatus("success")
    } catch (err) {
      setConnectionStatus("error")
      setError(err instanceof Error ? err.message : "Connection failed")
      return
    }

    // Test 2: Check Google OAuth availability
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          skipBrowserRedirect: true,
        },
      })
      
      if (error) {
        if (error.message.includes("Provider") || error.message.includes("disabled")) {
          setGoogleOAuthStatus("disabled")
        } else {
          setGoogleOAuthStatus("disabled")
        }
      } else if (data.url) {
        setGoogleOAuthStatus("enabled")
      } else {
        setGoogleOAuthStatus("disabled")
      }
    } catch (err) {
      setGoogleOAuthStatus("disabled")
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
      case "enabled":
        return <CheckCircle2 className="w-5 h-5 text-green-500" />
      case "error":
      case "disabled":
        return <XCircle className="w-5 h-5 text-red-500" />
      default:
        return <AlertCircle className="w-5 h-5 text-yellow-500 animate-pulse" />
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Supabase Authentication Configuration</CardTitle>
          <CardDescription>
            Testing your Supabase setup and Google OAuth integration
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Supabase Connection Status */}
          <div className="flex items-start gap-4 p-4 rounded-lg border">
            {getStatusIcon(connectionStatus)}
            <div className="flex-1">
              <h3 className="font-semibold">Supabase Connection</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {connectionStatus === "checking" && "Checking connection..."}
                {connectionStatus === "success" && "Connected successfully to Supabase"}
                {connectionStatus === "error" && `Connection failed: ${error}`}
              </p>
            </div>
          </div>

          {/* Google OAuth Status */}
          <div className="flex items-start gap-4 p-4 rounded-lg border">
            {getStatusIcon(googleOAuthStatus)}
            <div className="flex-1">
              <h3 className="font-semibold">Google OAuth Provider</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {googleOAuthStatus === "checking" && "Checking Google OAuth..."}
                {googleOAuthStatus === "enabled" && "Google OAuth is properly configured"}
                {googleOAuthStatus === "disabled" && "Google OAuth is not enabled"}
              </p>
              
              {googleOAuthStatus === "disabled" && (
                <div className="mt-4 p-4 bg-muted rounded-lg">
                  <p className="text-sm font-medium mb-3">To enable Google OAuth:</p>
                  <ol className="text-sm space-y-2 list-decimal list-inside text-muted-foreground">
                    <li>Go to your Supabase project dashboard</li>
                    <li>Navigate to <strong>Authentication → Providers</strong></li>
                    <li>Find <strong>Google</strong> in the provider list</li>
                    <li>Toggle it on and add your Google OAuth credentials:
                      <ul className="ml-6 mt-1 space-y-1 list-disc list-inside">
                        <li>Client ID from Google Cloud Console</li>
                        <li>Client Secret from Google Cloud Console</li>
                      </ul>
                    </li>
                    <li>Add authorized redirect URI: <code className="text-xs bg-background px-1 py-0.5 rounded">https://moryguwjnqkfryoylzvg.supabase.co/auth/v1/callback</code></li>
                  </ol>
                  <Button 
                    className="mt-4 w-full bg-transparent" 
                    variant="outline"
                    onClick={() => window.open("https://supabase.com/dashboard/project/moryguwjnqkfryoylzvg/auth/providers", "_blank")}
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Open Supabase Authentication Settings
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Environment Variables */}
          <div className="p-4 rounded-lg border bg-muted/50">
            <h3 className="font-semibold mb-3">Environment Variables</h3>
            <div className="space-y-2 text-sm font-mono">
              <div>
                <span className="text-muted-foreground">NEXT_PUBLIC_SUPABASE_URL:</span>
                <span className="ml-2">{process.env.NEXT_PUBLIC_SUPABASE_URL || "Not set"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">NEXT_PUBLIC_SUPABASE_ANON_KEY:</span>
                <span className="ml-2">{process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "Set ✓" : "Not set"}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button onClick={testConfiguration} variant="outline" className="flex-1 bg-transparent">
              Retest Configuration
            </Button>
            <Link href="/auth/login" className="flex-1">
              <Button className="w-full">
                Go to Login
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
