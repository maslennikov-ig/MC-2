'use client'

import { createBrowserClient } from '@supabase/ssr'
import { Database } from '@/types/database.generated'
import { createContext, useContext, useEffect, useState } from 'react'
import { SupabaseClient, Session } from '@supabase/supabase-js'

type SupabaseContext = {
  supabase: SupabaseClient<Database>
  session: Session | null
  isLoading: boolean
}

const Context = createContext<SupabaseContext | undefined>(undefined)

// Global singleton client for the browser
let browserClient: SupabaseClient<Database> | null = null

// Configuration version - increment to force client recreation after config changes
const CLIENT_CONFIG_VERSION = 2

// Track which version the current client was created with
let clientVersion = 0

// Reset singleton on HMR in development to pick up config changes
if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  // @ts-expect-error - HMR dispose callback
  if (import.meta.hot) {
    // @ts-expect-error - HMR dispose callback
    import.meta.hot.dispose(() => {
      browserClient = null
      clientVersion = 0
    })
  }
}

function getSupabaseClient() {
  // Recreate client if version changed (config update)
  if (browserClient && clientVersion === CLIENT_CONFIG_VERSION) {
    return browserClient
  }

  // Reset old client if exists
  if (browserClient) {
    browserClient = null
  }

  clientVersion = CLIENT_CONFIG_VERSION
  browserClient = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        // Use default cookie-based storage for SSR compatibility
        // Do NOT provide custom storage implementation as it prevents SSR
      },
      // NOTE: Do NOT set global Accept header here - it breaks array queries (406 error)
      // The .single() method automatically sets the correct header when needed
    }
  )

  return browserClient
}

export function SupabaseProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const supabase = getSupabaseClient()

  useEffect(() => {
    let mounted = true

    // Get initial session from cache
    // NOTE: Middleware handles token refresh on server requests,
    // so we only need to read cached session here
    const initSession = async () => {
      try {
        const {
          data: { session: cachedSession },
        } = await supabase.auth.getSession()

        if (cachedSession && mounted) {
          setSession(cachedSession)

          // Validate session with getUser in background
          // This ensures we don't show stale session data
          supabase.auth.getUser().then(({ data: { user }, error }) => {
            if (mounted && (error || !user)) {
              // Session invalid, clear it
              setSession(null)
              supabase.auth.signOut()
            }
          })
        } else if (mounted) {
          setSession(null)
        }
      } catch {
        if (mounted) {
          setSession(null)
        }
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    initSession()

    // Listen to auth state changes and update React state
    // NOTE: We do NOT call router.refresh() here because:
    // 1. Middleware already handles token refresh on every server request
    // 2. router.refresh() causes full page reload with loading spinner
    // 3. UI should react to session changes via React state, not page reload
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mounted) return

      // Update React state - this will re-render components using useSupabase()
      setSession(newSession)

      // Log auth events for debugging (dev only)
      if (process.env.NODE_ENV === 'development') {
        console.log('[Auth]', event, newSession ? 'session exists' : 'no session')
      }
    })

    // NOTE: We removed handleFocus and refreshInterval because:
    // 1. Middleware refreshes tokens on every server request (navigation, data fetch)
    // 2. Supabase client has autoRefreshToken: true which handles background refresh
    // 3. Redundant client-side refresh caused unnecessary reloads and UX issues

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [supabase])

  return <Context.Provider value={{ supabase, session, isLoading }}>{children}</Context.Provider>
}

export const useSupabase = () => {
  const context = useContext(Context)
  if (context === undefined) {
    throw new Error('useSupabase must be used inside SupabaseProvider')
  }
  return context
}

// Export singleton getter for components that need direct access
export { getSupabaseClient }
