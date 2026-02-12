import 'server-only'
import { env } from './env-schema'

export { env }

// Backward-compatible typed environment variables
// 20+ consumers import { ENV } from '@/lib/env'
export const ENV = {
  SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_ANON_KEY: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NODE_ENV: env.NODE_ENV,
  NEXT_PUBLIC_APP_URL: env.NEXT_PUBLIC_APP_URL,
  COURSEGEN_BACKEND_URL: env.COURSEGEN_BACKEND_URL,
} as const

/**
 * Server-only environment variables
 * SECURITY: This function should ONLY be used in server-side code
 */
export function getServerEnv() {
  return {
    SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
  }
}

/**
 * Get tRPC URL for course generation backend
 */
export function getTrpcUrl(): string {
  return `${env.COURSEGEN_BACKEND_URL}/trpc`
}
