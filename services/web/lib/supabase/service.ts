import { createClient as createSupabaseClient } from "@supabase/supabase-js"

/**
 * Server-only Supabase client using the service role key.
 * Bypasses RLS. NEVER import this from client code or expose via API responses.
 * Used by Stripe webhook handlers and server-side scan-limit enforcement.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL environment variables"
    )
  }

  return createSupabaseClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
