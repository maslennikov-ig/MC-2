'use client'

import { createBrowserClient } from '@supabase/ssr'
import { Database } from '@/types/database.generated'
import { createContext, useContext, useEffect, useState } from 'react'
import { SupabaseClient, Session } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'

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
        flowType: 'pkce'
        // Use default cookie-based storage for SSR compatibility
        // Do NOT provide custom storage implementation as it prevents SSR
      }
      // NOTE: Do NOT set global Accept header here - it breaks array queries (406 error)
      // The .single() method automatically sets the correct header when needed
    }
  )

  return browserClient
}

export function SupabaseProvider({ 
  children 
}: { 
  children: React.ReactNode 
}) {
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()
  const supabase = getSupabaseClient()

  useEffect(() => {
    let mounted = true

    // Get initial session
    const initSession = async () => {
      try {
        // Always use getSession first to get cached session
        const { data: { session: cachedSession } } = await supabase.auth.getSession()
        
        if (cachedSession && mounted) {
          setSession(cachedSession)
          
          // Then validate with getUser in background
          supabase.auth.getUser().then(({ data: { user }, error }) => {
            if (mounted) {
              if (error || !user) {
                // Session invalid, clear it
                setSession(null)
                supabase.auth.signOut()
              }
            }
          })
        } else if (mounted) {
          setSession(null)
        }
      } catch {
        // Session init error handled silently
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

    // Listen to auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!mounted) return

      // Auth state changed: event
      
      if (event === 'TOKEN_REFRESHED') {
        // Token refreshed successfully
      }
      
      setSession(newSession)
      
      // Force router refresh on auth changes
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        router.refresh()
      }
    })

    // Set up token refresh interval
    const refreshInterval = setInterval(async () => {
      if (mounted) {
        // Check current session from Supabase directly
        const { data: { session: currentSession } } = await supabase.auth.getSession()
        if (currentSession) {
          // Proactive token refresh
          const { data, error } = await supabase.auth.refreshSession()
          if (error) {
            // Token refresh error handled silently
          } else if (data.session) {
            setSession(data.session)
          }
        }
      }
    }, 10 * 60 * 1000) // Refresh every 10 minutes

    // Refresh on window focus
    const handleFocus = async () => {
      if (mounted) {
        // Check current session from Supabase directly
        const { data: { session: currentSession } } = await supabase.auth.getSession()
        if (currentSession) {
          // Window focused, refreshing session
          const { data, error } = await supabase.auth.refreshSession()
          if (!error && data.session) {
            setSession(data.session)
          }
        }
      }
    }

    window.addEventListener('focus', handleFocus)

    return () => {
      mounted = false
      subscription.unsubscribe()
      clearInterval(refreshInterval)
      window.removeEventListener('focus', handleFocus)
    }
  }, [supabase, router])

  return (
    <Context.Provider value={{ supabase, session, isLoading }}>
      {children}
    </Context.Provider>
  )
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