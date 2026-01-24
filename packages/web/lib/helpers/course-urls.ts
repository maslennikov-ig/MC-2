/**
 * URL builders for course routes
 * Single source of truth for all course-related URLs
 */

import { z } from 'zod'

/**
 * Slug validation schema
 * Allows: lowercase letters, numbers, hyphens
 * Max length: 100 characters
 */
export const SlugSchema = z
  .string()
  .min(1, 'Slug cannot be empty')
  .max(100, 'Slug too long')
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/, 'Invalid slug format')

/**
 * Validate a slug string
 * @param slug - String to validate
 * @returns true if valid, false otherwise
 */
export function isValidSlug(slug: string): boolean {
  return SlugSchema.safeParse(slug).success
}

/**
 * Validate and sanitize a slug, throws if invalid
 * @param slug - String to validate
 * @param name - Name for error message (e.g., 'orgSlug', 'courseSlug')
 * @returns Validated slug
 * @throws Error if slug is invalid
 */
export function validateSlug(slug: string, name: string = 'slug'): string {
  const result = SlugSchema.safeParse(slug)
  if (!result.success) {
    throw new Error(`Invalid ${name}: ${result.error.issues[0]?.message || 'invalid format'}`)
  }
  return result.data
}

/**
 * Build URL for viewing a course
 * @param orgSlug - Organization slug
 * @param courseSlug - Course slug
 * @returns URL path like /courses/{org}/{course}
 */
export function buildCourseUrl(orgSlug: string, courseSlug: string): string {
  return `/courses/${orgSlug}/${courseSlug}`
}

/**
 * Build URL for course generation progress page
 * @param orgSlug - Organization slug
 * @param courseSlug - Course slug
 * @param workflow - Optional workflow view flag
 * @returns URL path like /courses/{org}/{course}/generating
 */
export function buildCourseGeneratingUrl(
  orgSlug: string,
  courseSlug: string,
  workflow?: boolean
): string {
  const base = `/courses/${orgSlug}/${courseSlug}/generating`
  return workflow ? `${base}?workflow=true` : base
}

/**
 * Build URL for course lessons page
 * @param orgSlug - Organization slug
 * @param courseSlug - Course slug
 * @returns URL path like /courses/{org}/{course}/lessons
 */
export function buildCourseLessonsUrl(orgSlug: string, courseSlug: string): string {
  return `/courses/${orgSlug}/${courseSlug}/lessons`
}

/**
 * Build URL for course visuals page
 * @param orgSlug - Organization slug
 * @param courseSlug - Course slug
 * @returns URL path like /courses/{org}/{course}/visuals
 */
export function buildCourseVisualsUrl(orgSlug: string, courseSlug: string): string {
  return `/courses/${orgSlug}/${courseSlug}/visuals`
}

/**
 * Build API URL for course operations
 * @param orgSlug - Organization slug
 * @param courseSlug - Course slug
 * @param action - Optional action path (e.g., 'cancel', 'progress')
 * @returns API URL path like /api/courses/{org}/{course} or /api/courses/{org}/{course}/{action}
 */
export function buildCourseApiUrl(orgSlug: string, courseSlug: string, action?: string): string {
  const base = `/api/courses/${orgSlug}/${courseSlug}`
  return action ? `${base}/${action}` : base
}

/**
 * Build OG image URL for course
 * @param orgSlug - Organization slug
 * @param courseSlug - Course slug
 * @returns API URL path like /api/og/course/{org}/{course}
 */
export function buildCourseOgImageUrl(orgSlug: string, courseSlug: string): string {
  return `/api/og/course/${orgSlug}/${courseSlug}`
}

/**
 * Parse course URL to extract org and course slugs
 * @param url - URL path like /courses/{org}/{course}
 * @returns Object with orgSlug and courseSlug, or null if invalid
 */
export function parseCourseUrl(url: string): { orgSlug: string; courseSlug: string } | null {
  const match = url.match(/^\/courses\/([^/]+)\/([^/]+)/)
  if (!match) return null
  return { orgSlug: match[1], courseSlug: match[2] }
}
