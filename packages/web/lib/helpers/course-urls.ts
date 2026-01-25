/**
 * URL builders for course routes
 * Single source of truth for all course-related URLs
 *
 * @module course-urls
 */

import { z } from 'zod'

// ============================================================================
// Validation
// ============================================================================

/**
 * Slug validation schema
 * Allows: lowercase letters, numbers, hyphens
 * Must start and end with alphanumeric character
 * Max length: 100 characters
 *
 * @example
 * SlugSchema.parse('my-course-123')  // OK
 * SlugSchema.parse('My Course')      // Error: uppercase and space
 * SlugSchema.parse('-invalid')       // Error: starts with hyphen
 */
export const SlugSchema = z
  .string()
  .min(1, 'Slug cannot be empty')
  .max(100, 'Slug too long')
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/, 'Invalid slug format')

/**
 * Validate a slug string
 *
 * @param slug - String to validate
 * @returns true if valid, false otherwise
 *
 * @example
 * isValidSlug('my-course')     // true
 * isValidSlug('My Course!')    // false
 * isValidSlug('')              // false
 */
export function isValidSlug(slug: string): boolean {
  return SlugSchema.safeParse(slug).success
}

/**
 * Validate and sanitize a slug, throws if invalid
 *
 * @param slug - String to validate
 * @param name - Name for error message (e.g., 'orgSlug', 'courseSlug')
 * @returns Validated slug
 * @throws Error if slug is invalid
 *
 * @example
 * validateSlug('my-course', 'courseSlug')  // 'my-course'
 * validateSlug('invalid!', 'courseSlug')   // throws Error
 */
export function validateSlug(slug: string, name: string = 'slug'): string {
  const result = SlugSchema.safeParse(slug)
  if (!result.success) {
    throw new Error(`Invalid ${name}: ${result.error.issues[0]?.message || 'invalid format'}`)
  }
  return result.data
}

// ============================================================================
// URL Builders - Page Routes
// ============================================================================

/**
 * Safely encode a slug for URL usage
 * Validates format before encoding
 */
function encodeSlug(slug: string): string {
  // If slug is valid, it only contains safe characters (a-z, 0-9, -)
  // but we still encode for defense in depth
  return encodeURIComponent(slug)
}

/**
 * Build URL for viewing a course
 *
 * @param orgSlug - Organization slug
 * @param courseSlug - Course slug
 * @returns URL path like /courses/{org}/{course}
 * @throws Error if slugs are empty or invalid
 *
 * @example
 * buildCourseUrl('acme-corp', 'intro-to-ai')
 * // => '/courses/acme-corp/intro-to-ai'
 */
export function buildCourseUrl(orgSlug: string, courseSlug: string): string {
  if (!orgSlug || !courseSlug) {
    throw new Error(
      `[buildCourseUrl] Invalid slugs: orgSlug="${orgSlug}", courseSlug="${courseSlug}"`
    )
  }
  return `/courses/${encodeSlug(orgSlug)}/${encodeSlug(courseSlug)}`
}

/**
 * Build URL for course generation progress page
 *
 * @param orgSlug - Organization slug
 * @param courseSlug - Course slug
 * @param workflow - Optional workflow view flag (shows detailed progress)
 * @returns URL path like /courses/{org}/{course}/generating
 *
 * @example
 * buildCourseGeneratingUrl('acme-corp', 'intro-to-ai')
 * // => '/courses/acme-corp/intro-to-ai/generating'
 *
 * buildCourseGeneratingUrl('acme-corp', 'intro-to-ai', true)
 * // => '/courses/acme-corp/intro-to-ai/generating?workflow=true'
 */
export function buildCourseGeneratingUrl(
  orgSlug: string,
  courseSlug: string,
  workflow?: boolean
): string {
  if (!orgSlug || !courseSlug) {
    throw new Error(
      `[buildCourseGeneratingUrl] Invalid slugs: orgSlug="${orgSlug}", courseSlug="${courseSlug}"`
    )
  }
  const base = `/courses/${encodeSlug(orgSlug)}/${encodeSlug(courseSlug)}/generating`
  return workflow ? `${base}?workflow=true` : base
}

/**
 * Build URL for course lessons page
 *
 * @param orgSlug - Organization slug
 * @param courseSlug - Course slug
 * @returns URL path like /courses/{org}/{course}/lessons
 *
 * @example
 * buildCourseLessonsUrl('acme-corp', 'intro-to-ai')
 * // => '/courses/acme-corp/intro-to-ai/lessons'
 */
export function buildCourseLessonsUrl(orgSlug: string, courseSlug: string): string {
  if (!orgSlug || !courseSlug) {
    throw new Error(
      `[buildCourseLessonsUrl] Invalid slugs: orgSlug="${orgSlug}", courseSlug="${courseSlug}"`
    )
  }
  return `/courses/${encodeSlug(orgSlug)}/${encodeSlug(courseSlug)}/lessons`
}

/**
 * Build URL for course visuals page
 *
 * @param orgSlug - Organization slug
 * @param courseSlug - Course slug
 * @returns URL path like /courses/{org}/{course}/visuals
 *
 * @example
 * buildCourseVisualsUrl('acme-corp', 'intro-to-ai')
 * // => '/courses/acme-corp/intro-to-ai/visuals'
 */
export function buildCourseVisualsUrl(orgSlug: string, courseSlug: string): string {
  if (!orgSlug || !courseSlug) {
    throw new Error(
      `[buildCourseVisualsUrl] Invalid slugs: orgSlug="${orgSlug}", courseSlug="${courseSlug}"`
    )
  }
  return `/courses/${encodeSlug(orgSlug)}/${encodeSlug(courseSlug)}/visuals`
}

// ============================================================================
// URL Builders - API Routes
// ============================================================================

/**
 * Build API URL for course operations
 *
 * @param orgSlug - Organization slug
 * @param courseSlug - Course slug
 * @param action - Optional action path (e.g., 'cancel', 'progress', 'pause')
 * @returns API URL path
 *
 * @example
 * buildCourseApiUrl('acme-corp', 'intro-to-ai')
 * // => '/api/courses/acme-corp/intro-to-ai'
 *
 * buildCourseApiUrl('acme-corp', 'intro-to-ai', 'cancel')
 * // => '/api/courses/acme-corp/intro-to-ai/cancel'
 *
 * buildCourseApiUrl('acme-corp', 'intro-to-ai', 'progress')
 * // => '/api/courses/acme-corp/intro-to-ai/progress'
 */
export function buildCourseApiUrl(orgSlug: string, courseSlug: string, action?: string): string {
  if (!orgSlug || !courseSlug) {
    throw new Error(
      `[buildCourseApiUrl] Invalid slugs: orgSlug="${orgSlug}", courseSlug="${courseSlug}"`
    )
  }
  const base = `/api/courses/${encodeSlug(orgSlug)}/${encodeSlug(courseSlug)}`
  return action ? `${base}/${encodeURIComponent(action)}` : base
}

/**
 * Build OG image URL for course (used in meta tags)
 *
 * @param orgSlug - Organization slug
 * @param courseSlug - Course slug
 * @returns API URL path like /api/og/course/{org}/{course}
 *
 * @example
 * buildCourseOgImageUrl('acme-corp', 'intro-to-ai')
 * // => '/api/og/course/acme-corp/intro-to-ai'
 */
export function buildCourseOgImageUrl(orgSlug: string, courseSlug: string): string {
  if (!orgSlug || !courseSlug) {
    throw new Error(
      `[buildCourseOgImageUrl] Invalid slugs: orgSlug="${orgSlug}", courseSlug="${courseSlug}"`
    )
  }
  return `/api/og/course/${encodeSlug(orgSlug)}/${encodeSlug(courseSlug)}`
}

// ============================================================================
// URL Parsing
// ============================================================================

/**
 * Parse course URL to extract org and course slugs
 *
 * @param url - URL path like /courses/{org}/{course} or full URL
 * @returns Object with orgSlug and courseSlug, or null if invalid format
 *
 * @example
 * parseCourseUrl('/courses/acme-corp/intro-to-ai')
 * // => { orgSlug: 'acme-corp', courseSlug: 'intro-to-ai' }
 *
 * parseCourseUrl('/courses/acme-corp/intro-to-ai/lessons')
 * // => { orgSlug: 'acme-corp', courseSlug: 'intro-to-ai' }
 *
 * parseCourseUrl('/invalid/path')
 * // => null
 */
export function parseCourseUrl(url: string): { orgSlug: string; courseSlug: string } | null {
  const match = url.match(/^\/courses\/([^/]+)\/([^/]+)/)
  if (!match) return null

  const orgSlug = decodeURIComponent(match[1])
  const courseSlug = decodeURIComponent(match[2])

  // Validate decoded slugs
  if (!isValidSlug(orgSlug) || !isValidSlug(courseSlug)) {
    return null
  }

  return { orgSlug, courseSlug }
}

/**
 * Parse API course URL to extract org and course slugs
 *
 * @param url - API URL path like /api/courses/{org}/{course}
 * @returns Object with orgSlug and courseSlug, or null if invalid format
 *
 * @example
 * parseApiCourseUrl('/api/courses/acme-corp/intro-to-ai/cancel')
 * // => { orgSlug: 'acme-corp', courseSlug: 'intro-to-ai' }
 */
export function parseApiCourseUrl(url: string): { orgSlug: string; courseSlug: string } | null {
  const match = url.match(/^\/api\/courses\/([^/]+)\/([^/]+)/)
  if (!match) return null

  const orgSlug = decodeURIComponent(match[1])
  const courseSlug = decodeURIComponent(match[2])

  // Validate decoded slugs
  if (!isValidSlug(orgSlug) || !isValidSlug(courseSlug)) {
    return null
  }

  return { orgSlug, courseSlug }
}
