/**
 * Client-safe environment variables
 *
 * This file contains environment variables that can be safely imported
 * in client components without pulling in server-side dependencies.
 *
 * IMPORTANT: Do NOT add any imports that could pull in server-side code
 * (like next/headers, @supabase/ssr server clients, etc.)
 */

/**
 * Backend URL for course-gen-platform tRPC API
 * Used for clarifying questions and other backend calls
 */
export const BACKEND_URL = process.env.NEXT_PUBLIC_COURSEGEN_BACKEND_URL ||
  process.env.COURSEGEN_BACKEND_URL ||
  'http://localhost:3456'

/**
 * Full tRPC URL for backend
 */
export const TRPC_URL = `${BACKEND_URL}/trpc`
