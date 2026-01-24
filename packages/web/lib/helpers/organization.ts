import { getAdminClient, getUserClient } from '@/lib/supabase/client-factory'
import { logger } from '@/lib/logger'

/**
 * Get organization by slug
 * @param slug - Organization slug
 * @returns Organization data or null
 */
export async function getOrganizationBySlug(slug: string) {
  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('organizations')
    .select('id, slug, name')
    .eq('slug', slug)
    .single()

  if (error) {
    logger.warn('Organization not found by slug', { slug, error: error.message })
    return null
  }

  return data
}

/**
 * Get course by organization slug and course slug
 * Uses admin client for data fetch, validates organization ownership
 * @param orgSlug - Organization slug
 * @param courseSlug - Course slug
 * @returns Course data with organization info, or null if not found
 */
export async function getCourseByOrgAndSlug(orgSlug: string, courseSlug: string) {
  const supabase = getAdminClient()

  // First, get the organization by slug
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('id, slug, name')
    .eq('slug', orgSlug)
    .single()

  if (orgError || !org) {
    logger.warn('Organization not found', { orgSlug, error: orgError?.message })
    return null
  }

  // Then, get the course within that organization
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('*')
    .eq('organization_id', org.id)
    .eq('slug', courseSlug)
    .single()

  if (courseError || !course) {
    logger.warn('Course not found in organization', {
      orgSlug,
      courseSlug,
      organizationId: org.id,
      error: courseError?.message,
    })
    return null
  }

  return {
    ...course,
    organization: org,
  }
}

/**
 * Get course by organization slug and course slug with RLS
 * Uses user client for RLS enforcement
 * @param orgSlug - Organization slug
 * @param courseSlug - Course slug
 * @returns Course data with organization info, or null if not found/not accessible
 */
export async function getCourseByOrgAndSlugWithRLS(orgSlug: string, courseSlug: string) {
  const supabase = await getUserClient()

  // First, get the organization by slug using admin client (orgs are public)
  const adminClient = getAdminClient()
  const { data: org, error: orgError } = await adminClient
    .from('organizations')
    .select('id, slug, name')
    .eq('slug', orgSlug)
    .single()

  if (orgError || !org) {
    logger.warn('Organization not found', { orgSlug, error: orgError?.message })
    return null
  }

  // Then, get the course within that organization with RLS
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('*')
    .eq('organization_id', org.id)
    .eq('slug', courseSlug)
    .single()

  if (courseError || !course) {
    logger.warn('Course not found or not accessible', {
      orgSlug,
      courseSlug,
      organizationId: org.id,
      error: courseError?.message,
    })
    return null
  }

  return {
    ...course,
    organization: org,
  }
}

/**
 * Get organization slug for a course by course ID
 * @param courseId - Course UUID
 * @returns Organization slug or null
 */
export async function getOrgSlugByCourseId(courseId: string): Promise<string | null> {
  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('courses')
    .select('organization_id, organizations!inner(slug)')
    .eq('id', courseId)
    .single()

  if (error || !data) {
    logger.warn('Could not get org slug for course', { courseId, error: error?.message })
    return null
  }

  // Type assertion for the joined data
  const orgData = data.organizations as unknown as { slug: string }
  return orgData?.slug || null
}

/**
 * Get organization slug by organization ID
 * @param organizationId - Organization UUID
 * @returns Organization slug or null
 */
export async function getOrgSlugById(organizationId: string): Promise<string | null> {
  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('organizations')
    .select('slug')
    .eq('id', organizationId)
    .single()

  if (error || !data) {
    logger.warn('Could not get org by ID', { organizationId, error: error?.message })
    return null
  }

  return data.slug
}
