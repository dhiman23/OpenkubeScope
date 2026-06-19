import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  const error = requestUrl.searchParams.get("error")
  const errorDescription = requestUrl.searchParams.get("error_description")

  // Handle OAuth errors
  if (error) {
    const errorUrl = new URL("/auth/error", requestUrl.origin)
    errorUrl.searchParams.set("error", error)
    if (errorDescription) {
      errorUrl.searchParams.set("error_description", errorDescription)
    }
    return NextResponse.redirect(errorUrl)
  }

  if (code) {
    const supabase = await createClient()
    const { error: sessionError } = await supabase.auth.exchangeCodeForSession(code)
    
    if (sessionError) {
      const errorUrl = new URL("/auth/error", requestUrl.origin)
      errorUrl.searchParams.set("error", "session_exchange_failed")
      errorUrl.searchParams.set("error_description", sessionError.message)
      return NextResponse.redirect(errorUrl)
    }
  }

  return NextResponse.redirect(new URL("/app", requestUrl.origin))
}
