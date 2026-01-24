/**
 * URL builders for course routes
 * Single source of truth for all course-related URLs
 */

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
