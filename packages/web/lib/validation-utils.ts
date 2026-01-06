/**
 * Validation Utilities
 * @module lib/validation-utils
 *
 * Centralized validation helpers for common patterns.
 * Extracted from organization-helpers to allow reuse across all API routes.
 */

import { z } from 'zod';

// ============================================================================
// UUID VALIDATION (ISSUE-005, ISSUE-007)
// ============================================================================

/**
 * Cached UUID regex pattern (RFC 4122)
 *
 * Pre-compiled regex for better performance when validating
 * multiple UUIDs in the same request.
 *
 * @see https://tools.ietf.org/html/rfc4122
 */
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * UUID validation schema using Zod
 */
export const uuidSchema = z.string().uuid();

/**
 * Validation result type
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Check if a string is a valid UUID
 *
 * Uses cached regex for optimal performance.
 *
 * @param value - String to validate
 * @returns true if valid UUID format
 *
 * @example
 * ```typescript
 * if (!isValidUUID(orgId)) {
 *   return NextResponse.json({ error: 'Invalid organization ID' }, { status: 400 });
 * }
 * ```
 */
export function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

/**
 * Validate UUID format with detailed error message
 *
 * Uses Zod for comprehensive validation including
 * version and variant checks.
 *
 * @param value - String to validate
 * @param fieldName - Human-readable field name for error messages
 * @returns Validation result with optional error message
 *
 * @example
 * ```typescript
 * const result = validateUUID(orgId, 'organization ID');
 * if (!result.valid) {
 *   return NextResponse.json({ error: result.error }, { status: 400 });
 * }
 * ```
 */
export function validateUUID(value: string, fieldName = 'ID'): ValidationResult {
  const result = uuidSchema.safeParse(value);
  if (!result.success) {
    return { valid: false, error: `Invalid ${fieldName} format` };
  }
  return { valid: true };
}

/**
 * Validate multiple UUIDs at once
 *
 * Efficient for validating path params with multiple IDs.
 *
 * @param values - Map of field names to values
 * @returns Validation result for all fields
 *
 * @example
 * ```typescript
 * const result = validateMultipleUUIDs({
 *   'organization ID': orgId,
 *   'user ID': userId,
 * });
 * if (!result.valid) {
 *   return NextResponse.json({ error: result.error }, { status: 400 });
 * }
 * ```
 */
export function validateMultipleUUIDs(values: Record<string, string>): ValidationResult {
  for (const [fieldName, value] of Object.entries(values)) {
    if (!isValidUUID(value)) {
      return { valid: false, error: `Invalid ${fieldName} format` };
    }
  }
  return { valid: true };
}
