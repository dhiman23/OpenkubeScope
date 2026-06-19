"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ExternalLink, CheckCircle2, Copy, Shield } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { useToast } from "@/hooks/use-toast"

export default function SetupGuidePage() {
  const { toast } = useToast()
  const supabaseUrl = "https://moryguwjnqkfryoylzvg.supabase.co"
  const redirectUri = `${supabaseUrl}/auth/v1/callback`
  const productionUrl = "https://kubescope.dev"
  const [showAdvanced, setShowAdvanced] = useState(false)
  
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast({
      description: "Copied to clipboard!",
    })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-3">Authentication Setup Guide</h1>
          <p className="text-muted-foreground text-lg">
            Choose how users will sign in to KubeScope
          </p>
        </div>

        {/* Option 1: Email/Password */}
        <Card className="p-8 mb-6 border-2 border-primary/20 bg-primary/5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold mb-2">Option 1: Email/Password (Ready Now)</h2>
              <p className="text-muted-foreground mb-4">
                This is already configured and working! Users can sign up and sign in with email/password immediately.
              </p>
              <div className="bg-background/50 rounded-lg p-4 mb-4">
                <p className="text-sm font-medium mb-2">Status: <span className="text-primary">✓ Active</span></p>
                <p className="text-sm text-muted-foreground">No additional setup required</p>
              </div>
              <Link href="/auth/login">
                <Button className="rounded-xl">
                  Try It Now
                </Button>
              </Link>
            </div>
          </div>
        </Card>

        {/* Option 2: Google OAuth */}
        <Card className="p-8">
          <div className="flex items-start gap-4 mb-6">
            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
              <Shield className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold mb-2">Option 2: Google OAuth (5-10 min setup)</h2>
              <p className="text-muted-foreground">
                Allow users to sign in with their Google account
              </p>
            </div>
          </div>

          {/* Step 1 */}
          <div className="space-y-6">
            <div className="border-l-2 border-primary/20 pl-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                  1
                </div>
                <h3 className="text-lg font-semibold">Create Google OAuth Credentials</h3>
              </div>
              <div className="space-y-3 ml-10">
                <p className="text-sm text-muted-foreground">Go to Google Cloud Console and create OAuth 2.0 credentials:</p>
                <a 
                  href="https://console.cloud.google.com/apis/credentials" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-block"
                >
                  <Button variant="outline" className="rounded-xl gap-2 bg-transparent">
                    Open Google Cloud Console
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                </a>
                <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
                  <li>Click "Create Credentials" → "OAuth client ID"</li>
                  <li>Choose "Web application"</li>
                  <li>Add these authorized redirect URIs:</li>
                </ul>
                <div className="space-y-2">
                  <div className="bg-muted/50 rounded-lg p-3 font-mono text-sm flex items-center justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground mb-1">Supabase Callback:</p>
                      <code className="break-all">{redirectUri}</code>
                    </div>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      onClick={() => copyToClipboard(redirectUri)}
                      className="flex-shrink-0"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="bg-primary/10 rounded-lg p-3 font-mono text-sm flex items-center justify-between gap-2 border border-primary/20">
                    <div className="flex-1">
                      <p className="text-xs text-primary font-medium mb-1">Production Domain:</p>
                      <code className="break-all">{productionUrl}</code>
                    </div>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      onClick={() => copyToClipboard(productionUrl)}
                      className="flex-shrink-0"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                  <p className="text-sm font-medium text-blue-400 mb-2">Important: Authorized JavaScript Origins</p>
                  <p className="text-xs text-muted-foreground mb-2">Also add these to "Authorized JavaScript origins" in Google Cloud Console:</p>
                  <div className="space-y-1 text-xs font-mono">
                    <p>• https://kubescope.dev</p>
                    <p>• https://moryguwjnqkfryoylzvg.supabase.co</p>
                    <p className="text-muted-foreground mt-2">• http://localhost:3000 (for local development)</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">Copy the Client ID and Client Secret</p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="border-l-2 border-primary/20 pl-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                  2
                </div>
                <h3 className="text-lg font-semibold">Enable Google Provider in Supabase</h3>
              </div>
              <div className="space-y-3 ml-10">
                <p className="text-sm text-muted-foreground">Configure Google OAuth in your Supabase project:</p>
                <a 
                  href="https://supabase.com/dashboard/project/moryguwjnqkfryoylzvg/auth/providers" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-block"
                >
                  <Button variant="outline" className="rounded-xl gap-2 bg-transparent">
                    Open Supabase Dashboard
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                </a>
                <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
                  <li>Find "Google" in the providers list</li>
                  <li>Toggle it ON</li>
                  <li>Paste your Client ID and Client Secret</li>
                  <li>Click "Save"</li>
                </ul>
              </div>
            </div>

            {/* Step 3 */}
            <div className="border-l-2 border-primary/20 pl-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                  3
                </div>
                <h3 className="text-lg font-semibold">Test It!</h3>
              </div>
              <div className="space-y-3 ml-10">
                <p className="text-sm text-muted-foreground">Once configured, test the Google sign-in:</p>
                <Link href="/auth/login">
                  <Button variant="outline" className="rounded-xl bg-transparent">
                    Go to Login Page
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </Card>

        {/* Back to Login */}
        <div className="text-center mt-8">
          <Link href="/auth/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Back to Login
          </Link>
        </div>
      </div>
    </div>
  )
}
