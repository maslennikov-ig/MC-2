/**
 * API Fetch Utilities
 *
 * Shared utilities for making HTTP requests with fallback URLs.
 * Handles Docker network vs public URL fallback pattern.
 *
 * @module lib/api-fetch-utils
 */

import { ENV } from '@/lib/env'

/**
 * Options for fetchWithFallback
 */
export interface FetchWithFallbackOptions extends Omit<RequestInit, 'signal'> {
  /** Internal Docker network URL */
  internalUrl: string
  /** Public fallback URL */
  publicUrl: string
  /** Timeout in milliseconds (default: 5000) */
  timeout?: number
}

/**
 * Result of fetchWithFallback
 */
export interface FetchWithFallbackResult {
  /** The fetch response */
  response: Response
  /** Which URL was successfully used */
  usedUrl: 'internal' | 'public'
}

/**
 * Fetch with automatic fallback from internal Docker URL to public URL
 *
 * Pattern: Try internal Docker network URL first, then fall back to public URL.
 * Includes timeout handling with proper cleanup.
 *
 * @param options - Fetch configuration including URLs, timeout, and standard RequestInit options
 * @returns Promise resolving to response and which URL was used ('internal' or 'public')
 * @throws Error if both internal and public URLs fail or request times out
 *
 * @example
 * ```ts
 * const { response, usedUrl } = await fetchWithFallback({
 *   internalUrl: 'http://api:4000/readiness',
 *   publicUrl: `${ENV.COURSEGEN_BACKEND_URL}/readiness`,
 *   method: 'GET',
 *   cache: 'no-store',
 *   timeout: 5000,
 * })
 * ```
 */
export async function fetchWithFallback(
  options: FetchWithFallbackOptions
): Promise<FetchWithFallbackResult> {
  const {
    internalUrl,
    publicUrl,
    timeout = 5000,
    ...fetchOptions
  } = options

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    let response: Response
    let usedUrl: 'internal' | 'public'

    // Try internal URL first (Docker network)
    try {
      response = await fetch(internalUrl, {
        ...fetchOptions,
        signal: controller.signal,
      })
      usedUrl = 'internal'
    } catch {
      // Internal URL failed, try public URL
      response = await fetch(publicUrl, {
        ...fetchOptions,
        signal: controller.signal,
      })
      usedUrl = 'public'
    }

    return { response, usedUrl }
  } finally {
    // Always clear timeout to prevent zombie timers
    clearTimeout(timeoutId)
  }
}

/**
 * Common API server URL configurations
 *
 * Centralized URL definitions for internal Docker network and public endpoints.
 */
export const API_URLS = {
  /** Worker health check endpoints */
  health: {
    internal: 'http://api:4000/health',
    public: `${ENV.COURSEGEN_BACKEND_URL}/health`,
  },
  /** Worker readiness check endpoints */
  readiness: {
    internal: 'http://api:4000/readiness',
    public: `${ENV.COURSEGEN_BACKEND_URL}/readiness`,
  },
} as const

/**
 * Default timeouts for API requests (in milliseconds)
 */
export const API_TIMEOUTS = {
  /** Timeout for readiness check */
  READINESS: 5000,
  /** Timeout for health check */
  HEALTH: 5000,
  /** Timeout for general API requests */
  DEFAULT: 10000,
} as const
