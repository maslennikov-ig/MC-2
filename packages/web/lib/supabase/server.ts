import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { ENV } from '../env'
import { Database } from '@/types/database.generated'
import { logger } from '@/lib/logger'

/**
 * Creates a Supabase client for server-side operations
 * This client respects RLS policies and uses the anon key
 */
export async function createClient() {
  try {
    // Validate environment variables
    if (!ENV.SUPABASE_URL || !ENV.SUPABASE_ANON_KEY) {
      throw new Error('Missing required Supabase environment variables')
    }

    const cookieStore = await cookies()

    return createServerClient<Database>(
      ENV.SUPABASE_URL,
      ENV.SUPABASE_ANON_KEY,
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
            } catch (error) {
              // The `setAll` method was called from a Server Component.
              // This can be ignored if you have middleware refreshing
              // user sessions.
              if (process.env.NODE_ENV === 'development') {
                logger.debug('Cookie set error in Server Component (expected):', error)
              }
            }
          },
        },
        global: {
          headers: {
            'Accept': 'application/json',
            // Content-Type removed - it should be set per request, not globally
            // Global Content-Type breaks Storage operations
            'Prefer': 'return=representation'
          }
        }
      }
    )
  } catch (error) {
    logger.error('Failed to create Supabase client:', error)
    throw error
  }
}

/**
 * Creates an admin Supabase client for operations requiring elevated permissions
 * This client bypasses RLS policies - use with caution!
 */
export async function createAdminClient() {
  try {
    // Validate service role key
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')
    }

    // Use imported createSupabaseClient for service role
    return createSupabaseClient<Database>(
      ENV.SUPABASE_URL,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        },
        global: {
          headers: {
            'Accept': 'application/json',
            'Prefer': 'return=representation'
          }
        }
      }
    )
  } catch (error) {
    logger.error('Failed to create admin Supabase client:', error)
    throw error
  }
}

/**
 * Health check for Supabase connectivity
 */
export async function checkSupabaseConnection(): Promise<boolean> {
  try {
    const client = await createClient()
    const { error } = await client.from('courses').select('id').limit(1)
    return !error
  } catch {
    return false
  }
}