import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { Database } from '@/types/database.generated'
import { supabaseAdmin } from '@/lib/supabase-admin'

export interface SupabaseClientOptions {
  useServiceRole?: boolean
  requireAuth?: boolean
}

/**
 * Factory for creating appropriate Supabase clients based on context
 * 
 * Best practices for scalability:
 * - Use RLS-enabled clients by default for user operations
 * - Service role only for admin operations and background tasks
 * - Connection pooling handled by Supabase
 */
export async function getSupabaseClient(options: SupabaseClientOptions = {}) {
  // Admin operations that need to bypass RLS
  if (options.useServiceRole) {
    return supabaseAdmin
  }
  
  // User operations with RLS enforcement - use the new SSR approach
  const cookieStore = await cookies()
  
  const client = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
  
  return client
}

/**
 * Get user client with automatic RLS enforcement
 * Use for all user-facing operations
 */
export async function getUserClient() {
  const cookieStore = await cookies()
  
  const client = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // Server Component - can't set cookies
          }
        },
      },
    }
  )
  
  // CRITICAL: Establish auth context for RLS
  await client.auth.getUser()
  
  return client
}

/**
 * Alias for getUserClient for compatibility
 */
export const createClient = getUserClient

/**
 * Get admin client that bypasses RLS
 * Use only for:
 * - System statistics
 * - Background jobs
 * - n8n webhook operations
 * - Data migrations
 */
export function getAdminClient() {
  return supabaseAdmin
}