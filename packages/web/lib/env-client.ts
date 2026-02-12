/**
 * Client-safe environment variables
 *
 * This file contains environment variables that can be safely imported
 * in client components without pulling in server-side dependencies.
 */
import { env } from './env-schema'

/**
 * Backend URL for course-gen-platform tRPC API
 *
 * Logic:
 * - If NEXT_PUBLIC_COURSEGEN_BACKEND_URL is set -> use it
 * - In browser, if not localhost -> use /api (Next.js proxy)
 * - Development fallback -> localhost:3456
 */
export const BACKEND_URL = (() => {
  const url = env.NEXT_PUBLIC_COURSEGEN_BACKEND_URL
  if (url) return url

  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return '/api'
    }
  }

  return 'http://localhost:3456'
})()

/**
 * Full tRPC URL for backend
 */
export const TRPC_URL = `${BACKEND_URL}/trpc`
