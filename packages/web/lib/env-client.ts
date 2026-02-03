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
 *
 * Logic:
 * - If NEXT_PUBLIC_COURSEGEN_BACKEND_URL is set → use it
 * - In browser, if not localhost → use /api (Next.js proxy)
 * - Development fallback → localhost:3456
 */
export const BACKEND_URL = (() => {
  const url = process.env.NEXT_PUBLIC_COURSEGEN_BACKEND_URL;

  // If env var is set, use it
  if (url) return url;

  // In browser, check if we're accessing from non-localhost (LAN or production)
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    if (!isLocalhost) {
      // Use relative URL - Next.js API routes proxy to backend
      return '/api';
    }
  }

  // Development fallback (server-side or localhost browser)
  return process.env.COURSEGEN_BACKEND_URL || 'http://localhost:3456';
})();

/**
 * Full tRPC URL for backend
 */
export const TRPC_URL = `${BACKEND_URL}/trpc`
