import { createBrowserClient } from "@supabase/ssr"

export function createClient() {
  // Use the injected environment variables that are available on the client
  const supabaseUrl = typeof window !== 'undefined' 
    ? (window as any).__NEXT_PUBLIC_SUPABASE_URL__ || process.env.NEXT_PUBLIC_SUPABASE_URL
    : process.env.NEXT_PUBLIC_SUPABASE_URL
  
  const supabaseAnonKey = typeof window !== 'undefined'
    ? (window as any).__NEXT_PUBLIC_SUPABASE_ANON_KEY__ || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  if (!supabaseUrl || !supabaseAnonKey) {
    // During build/prerender, env vars may not be available.
    // Return a dummy client that will be replaced at runtime.
    if (typeof window === 'undefined') {
      console.warn('Missing Supabase environment variables during prerender')
      return createBrowserClient(
        'https://placeholder.supabase.co',
        'placeholder-anon-key'
      )
    }
    console.error('Missing Supabase environment variables')
    throw new Error('Missing Supabase environment variables')
  }
  
  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}
