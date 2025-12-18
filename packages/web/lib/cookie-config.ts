/**
 * Centralized cookie configuration for consistent security settings
 * Ensures all cookies follow security best practices
 */

import { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies'

/**
 * Get secure cookie options based on environment
 * Always uses httpOnly for security, and secure flag in production
 */
export function getSecureCookieOptions(
  options?: Partial<Omit<ResponseCookie, 'name' | 'value'>>
): Omit<ResponseCookie, 'name' | 'value'> {
  const isProduction = process.env.NODE_ENV === 'production'
  
  // Base secure settings - always applied
  const baseOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax' as const,
    path: '/',
    // Set max age to 30 days by default
    maxAge: 30 * 24 * 60 * 60,
    ...options, // Allow overrides for specific needs
  }

  // In production, enforce secure flag regardless of override
  if (isProduction) {
    baseOptions.secure = true
  }

  return baseOptions
}

/**
 * Cookie configuration for different types of cookies
 */
export const COOKIE_CONFIG = {
  // Authentication cookies - shorter lived, stricter settings
  auth: () => getSecureCookieOptions({
    maxAge: 7 * 24 * 60 * 60, // 7 days
    sameSite: 'lax',
  }),
  
  // Session cookies - no maxAge (expires with browser session)
  session: () => getSecureCookieOptions({
    maxAge: undefined,
    sameSite: 'lax',
  }),
  
  // Preference cookies - longer lived, less strict
  preferences: () => getSecureCookieOptions({
    maxAge: 365 * 24 * 60 * 60, // 1 year
    httpOnly: false, // Can be read by client-side JS for UI preferences
  }),
  
  // Analytics cookies - if needed
  analytics: () => getSecureCookieOptions({
    maxAge: 2 * 365 * 24 * 60 * 60, // 2 years
    httpOnly: false,
    sameSite: 'none', // For cross-site analytics
  }),
  
  // Default secure settings for any cookie
  default: () => getSecureCookieOptions(),
}

/**
 * Cookie names constants to avoid typos
 */
export const COOKIE_NAMES = {
  SESSION: 'session',
  AUTH_TOKEN: 'auth-token',
  REFRESH_TOKEN: 'refresh-token',
  USER_PREFERENCES: 'user-prefs',
  THEME: 'theme',
  LOCALE: 'locale',
} as const

/**
 * Helper to validate cookie name format
 */
export function isValidCookieName(name: string): boolean {
  // Cookie names should not contain special characters
  return /^[a-zA-Z0-9\-_]+$/.test(name)
}

/**
 * Helper to sanitize cookie values
 */
export function sanitizeCookieValue(value: string): string {
  // Remove any control characters or semicolons that could break cookie parsing
  return value.replace(/[\x00-\x1F\x7F;,\s]/g, '')
}