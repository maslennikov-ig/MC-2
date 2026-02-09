/**
 * UUID Validation Utilities
 *
 * Lightweight module for UUID validation without heavy dependencies.
 * Extracted from validation.ts to avoid pulling isomorphic-dompurify/jsdom
 * into API routes (which breaks Next.js build with ENOENT on default-stylesheet.css).
 */

import { z } from 'zod'

/** Cached UUID regex pattern (RFC 4122) */
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** UUID validation schema */
export const uuidSchema = z.string().uuid()

interface UuidValidationResult {
  valid: boolean
  error?: string
}

/** Check if a string is a valid UUID using cached regex */
export function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value)
}

/** Validate UUID format with detailed error message */
export function validateUUID(value: string, fieldName = 'ID'): UuidValidationResult {
  const result = uuidSchema.safeParse(value)
  if (!result.success) {
    return { valid: false, error: `Invalid ${fieldName} format` }
  }
  return { valid: true }
}

/** Validate multiple UUIDs at once */
export function validateMultipleUUIDs(values: Record<string, string>): UuidValidationResult {
  for (const [fieldName, value] of Object.entries(values)) {
    if (!isValidUUID(value)) {
      return { valid: false, error: `Invalid ${fieldName} format` }
    }
  }
  return { valid: true }
}
