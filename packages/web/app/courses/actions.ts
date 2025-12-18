'use server'

import { getUserClient, getAdminClient } from '@/lib/supabase/client-factory'
import { getCurrentUser } from '@/lib/auth-helpers'
import { revalidatePath } from 'next/cache'
import type { CourseStructureData } from '@/types/database'
import { logger } from '@/lib/logger'
import { PostgrestError } from '@supabase/supabase-js'
import { generateSlug } from '@/lib/utils/slug'

// Type definitions
type StatisticsQueryResponse = {
  status: string;
  generation_status: string | null;
  total_lessons_count: number | null;
}


/**
 * Get courses with RLS enforcement
 * Uses user client that automatically applies RLS policies
 */
export async function getCourses({
  search,
  status,
  difficulty,
  favorites,
  sort = 'created_desc',
  page = 1,
  limit = 10
}: {
  search?: string
  status?: string
  difficulty?: string
  favorites?: boolean
  sort?: string
  page?: number
  limit?: number
}) {
  const offset = (page - 1) * limit

  // Get user client with RLS enforcement
  const supabase = await getUserClient()

  // SECURITY: First validate user authenticity with getUser()
  // getUser() validates JWT by contacting Supabase Auth server
  const { data: { user: authenticatedUser } } = await supabase.auth.getUser()

  // Declare session variable in outer scope for later use
  let session = null

  // Check if user is authenticated for debugging
  if (authenticatedUser) {
    logger.info(`Authenticated as: ${authenticatedUser.email} (ID: ${authenticatedUser.id})`)

    // Now get session to access JWT custom claims (user is already validated)
    const { data: { session: validatedSession } } = await supabase.auth.getSession()
    session = validatedSession

    if (session) {
      // Get role from JWT custom claims (added by custom_access_token_hook)
      // On server-side, custom claims are NOT in user object, need to decode JWT
      let userRole = 'student'
      try {
        const token = session.access_token
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
        userRole = payload.role || 'student'
        logger.info(`JWT payload role: ${payload.role}`)
      } catch (err) {
        logger.error(`Failed to decode JWT: ${err}`)
        userRole = 'student'
      }

      logger.info(`User role: ${userRole}`)
    }
  } else {
    logger.info('No authenticated user found')
  }
  
  // Build query - RLS will automatically filter based on user permissions
  // Note: We don't fetch sections/lessons here to avoid deep recursion and performance issues
  // The counts are stored in total_lessons_count and total_sections_count columns
  let query = supabase
    .from('courses')
    .select(`
      id,
      title,
      slug,
      course_description,
      course_structure,
      status,
      generation_status,
      language,
      difficulty,
      style,
      user_id,
      is_published,
      share_token,
      created_at,
      updated_at,
      total_lessons_count,
      total_sections_count,
      learning_outcomes,
      prerequisites,
      target_audience,
      estimated_lessons,
      estimated_sections
    `, { count: 'exact' })

  // Apply business filters (not access control)
  if (search) {
    query = query.ilike('title', `%${search}%`)
  }

  if (status && status !== 'all') {
    query = query.eq('status', status as 'draft' | 'published' | 'archived')
  }
  
  if (difficulty && difficulty !== 'all') {
    query = query.eq('difficulty', difficulty)
  }
  
  // Handle favorites
  if (favorites === true) {
    const user = await getCurrentUser()
    if (!user) {
      return { 
        courses: [], 
        totalCount: 0,
        currentPage: page,
        totalPages: 0,
        hasMore: false
      }
    }
    
    const userFavorites = await getUserFavorites(user.id)
    if (userFavorites.length === 0) {
      return { 
        courses: [], 
        totalCount: 0,
        currentPage: page,
        totalPages: 0,
        hasMore: false
      }
    }
    
    query = query.in('id', userFavorites)
  }
  
  // Apply sorting
  const [sortField, sortDirection] = sort.split('_')
  const ascending = sortDirection === 'asc'
  
  switch (sortField) {
    case 'created':
      query = query.order('created_at', { ascending })
      break
    case 'title':
      query = query.order('title', { ascending })
      break
    case 'lessons':
      query = query.order('total_lessons_count', { ascending, nullsFirst: false })
      break
    case 'difficulty':
      query = query.order('difficulty', { ascending })
      break
    default:
      query = query.order('created_at', { ascending: false })
  }
  
  // Apply pagination
  query = query.range(offset, offset + limit - 1)
  
  // Execute query - RLS policies are automatically applied
  const { data: courses, error, count } = await query
  
  if (error) {
    logger.error('Error fetching courses:', error)
    return { 
      courses: [], 
      totalCount: 0,
      currentPage: page,
      totalPages: 0,
      hasMore: false
    }
  }
  
  // Process courses
  const processedCourses = courses?.map((course) => {
    // Use the cached counts from the database columns
    const sectionsCount = course.total_sections_count || 0
    const lessonsCount = course.total_lessons_count || 0
    
    let description = course.course_description
    let learningOutcomes = course.learning_outcomes
    let prerequisites = course.prerequisites
    let targetAudience = course.target_audience
    
    if (course.course_structure && typeof course.course_structure === 'object') {
      const structure = course.course_structure as CourseStructureData
      if (structure.course_description) {
        description = structure.course_description
      }
      if (structure.learning_outcomes) {
        // Convert array to string if needed
        learningOutcomes = Array.isArray(structure.learning_outcomes) 
          ? structure.learning_outcomes.join(', ') 
          : structure.learning_outcomes
      }
      if (structure.prerequisites) {
        // Convert array to string if needed
        prerequisites = Array.isArray(structure.prerequisites)
          ? structure.prerequisites.join(', ')
          : structure.prerequisites
      }
      if (structure.target_audience) {
        targetAudience = structure.target_audience
      }
    }
    
    const slug = course.slug || generateSlug(course.title)

    const processedCourse = {
      ...course,
      slug,
      course_description: description,
      course_structure: course.course_structure as Record<string, unknown> | null,
      status: (course.status || 'draft') as 'draft' | 'published' | 'archived',
      generation_status: course.generation_status as 'pending' | 'initializing' | 'processing_documents' | 'analyzing_task' | 'generating_structure' | 'generating_content' | 'finalizing' | 'completed' | 'failed' | 'cancelled' | null,
      language: course.language || 'en',
      difficulty: course.difficulty || 'intermediate',
      style: course.style || 'academic',
      is_published: course.is_published || false,
      created_at: course.created_at || new Date().toISOString(),
      updated_at: course.updated_at || new Date().toISOString(),
      learning_outcomes: learningOutcomes,
      prerequisites: prerequisites,
      target_audience: targetAudience,
      actual_sections_count: sectionsCount,
      actual_lessons_count: lessonsCount,
      sectionsCount,
      lessonsCount,
      estimatedDuration: lessonsCount * 5
    }
    
    return processedCourse
  }) || []
  
  const totalPages = Math.ceil((count || 0) / limit)
  
  // Get user favorites if logged in
  const user = await getCurrentUser()
  let userFavorites: string[] = []
  if (user?.id) {
    userFavorites = await getUserFavorites(user.id)
  }
  
  // Add favorite status to courses
  const coursesWithFavorites = processedCourses.map(course => ({
    ...course,
    isFavorite: userFavorites.includes(course.id)
  }))
  
  logger.info(`Returning ${coursesWithFavorites.length} courses out of ${count} total for user ${authenticatedUser?.email || 'unknown'}`)
  
  return { 
    courses: coursesWithFavorites, 
    totalCount: count || 0,
    currentPage: page,
    totalPages,
    hasMore: page < totalPages
  }
}

/**
 * Delete course with RLS enforcement
 */
export async function deleteCourse(courseSlug: string) {
  const supabase = await getUserClient()
  const user = await getCurrentUser()
  
  if (!user) {
    throw new Error('Unauthorized')
  }
  
  try {
    // Get course - RLS will check access
    const { data: course, error: fetchError } = await supabase
      .from('courses')
      .select('id, title')
      .eq('slug', courseSlug)
      .single() as { data: { id: string; title: string } | null; error: PostgrestError | null }
    
    if (fetchError || !course) {
      throw new Error('Course not found or access denied')
    }
    
    // For cascade deletes, we need admin client
    // but first verify user has permission via RLS
    const adminClient = getAdminClient()
    
    // Delete in correct order
    const courseId = course.id

    // Note: Tests/questions tables will be added in future database schema updates
    // Currently these tables don't exist in the database: tests, questions, user_favorites

    // 1. Delete assets
    await adminClient.from('assets').delete().eq('course_id', courseId)

    // 3. Delete lessons
    const { data: sectionsData } = await adminClient
      .from('sections')
      .select('id')
      .eq('course_id', courseId)
    
    if (sectionsData && sectionsData.length > 0) {
      const sectionIds = sectionsData.map(s => s.id)
      await adminClient.from('lessons').delete().in('section_id', sectionIds)
    }
    
    // 4. Delete sections
    await adminClient.from('sections').delete().eq('course_id', courseId)

    // Note: Document processing tables will be added in future database schema updates
    // Currently these tables don't exist in the database

    // 5. Finally, delete the course using user client to enforce RLS
    const { error: deleteError } = await supabase
      .from('courses')
      .delete()
      .eq('id', courseId)
    
    if (deleteError) {
      // RLS will block if user doesn't have permission
      throw new Error('Insufficient permissions to delete this course')
    }
    
    revalidatePath('/courses')
    return { success: true, deletedTitle: course.title }
  } catch (error) {
    logger.error('Error deleting course:', error)
    throw error instanceof Error ? error : new Error('Failed to delete course')
  }
}

/**
 * Toggle course publish status with RLS enforcement
 */
export async function togglePublishCourse(courseSlug: string, isPublished: boolean) {
  const supabase = await getUserClient()
  
  try {
    // Update using user client - RLS will check permissions
    const { error } = await supabase
      .from('courses')
      .update({ is_published: !isPublished })
      .eq('slug', courseSlug)
      .select()
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error('Course not found or access denied')
      }
      throw new Error('Failed to update course')
    }
    
    revalidatePath('/courses')
    return { success: true }
  } catch (error) {
    logger.error('Error toggling publish status:', error)
    throw error instanceof Error ? error : new Error('Failed to update course')
  }
}

/**
 * Get user favorites - returns empty array as user_favorites table doesn't exist
 * Note: User favorites functionality will be implemented when table is added to database schema
 */
export async function getUserFavorites(_userId: string) {
  // user_favorites table doesn't exist in database
  // Return empty array to maintain compatibility
  return []
}

/**
 * Get courses statistics with RLS enforcement
 * Uses user client to get stats only for courses user can access
 */
export async function getCoursesStatistics() {
  const supabase = await getUserClient()

  // Use cached counts to avoid deep joins and performance issues
  const { data, error } = await supabase
    .from('courses')
    .select(`
      status,
      generation_status,
      total_lessons_count
    `) as { data: StatisticsQueryResponse[] | null; error: PostgrestError | null }
  
  if (error) {
    logger.error('Error fetching statistics:', error)
    return {
      totalCount: 0,
      completedCount: 0,
      inProgressCount: 0,
      structureReadyCount: 0,
      draftCount: 0,
      totalLessons: 0,
      totalHours: 0
    }
  }
  
  // Use the cached total_lessons_count from database
  const totalLessonsCount = data?.reduce((acc: number, course: StatisticsQueryResponse) => {
    return acc + (course.total_lessons_count || 0)
  }, 0) || 0
  
  return {
    totalCount: data?.length || 0,
    completedCount: data?.filter(c => c.status === 'completed').length || 0,
    inProgressCount: data?.filter(c => c.status === 'generating' || c.status === 'processing').length || 0,
    structureReadyCount: data?.filter(c => c.status === 'structure_ready').length || 0,
    draftCount: data?.filter(c => c.status === 'draft').length || 0,
    totalLessons: totalLessonsCount,
    totalHours: Math.round((totalLessonsCount * 5) / 60)
  }
}

/**
 * Get user's own courses
 */
export async function getUserCourses(userId?: string) {
  const supabase = await getUserClient()
  
  let query = supabase
    .from('courses')
    .select('*')
    .order('created_at', { ascending: false })
  
  // If userId provided, filter by it (for public profiles)
  if (userId) {
    query = query.eq('user_id', userId).eq('is_published', true)
  }
  
  const { data, error } = await query
  
  if (error) {
    logger.error('Error fetching user courses:', error)
    return []
  }
  
  return data || []
}

/**
 * Check if user can access a course
 * RLS will handle the actual permission check
 */
export async function canUserAccessCourse(
  courseId: string
): Promise<boolean> {
  const supabase = await getUserClient()
  
  // Try to fetch the course - RLS will determine access
  const { data, error } = await supabase
    .from('courses')
    .select('id')
    .eq('id', courseId)
    .single()
  
  return !error && !!data
}

/**
 * Toggle publish status for a course
 */
export async function togglePublishStatus(courseId: string) {
  logger.info(`togglePublishStatus: Starting for courseId=${courseId}`)

  const supabase = await getUserClient()
  const user = await getCurrentUser()

  if (!user) {
    logger.error('togglePublishStatus: No authenticated user')
    throw new Error('Unauthorized')
  }

  try {
    // First get current status
    const { data: course, error: fetchError } = await supabase
      .from('courses')
      .select('is_published, user_id')
      .eq('id', courseId)
      .single()

    if (fetchError || !course) {
      logger.error('togglePublishStatus: Course not found or access denied', fetchError)
      throw new Error('Course not found or access denied')
    }

    // Check if user owns the course
    if (course.user_id !== user.id) {
      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()

      if (!profile || (profile.role !== 'admin' && profile.role !== 'superadmin')) {
        throw new Error('Unauthorized to change publish status')
      }
    }

    // Toggle the status
    const newStatus = !course.is_published
    const { error: updateError } = await supabase
      .from('courses')
      .update({ is_published: newStatus })
      .eq('id', courseId)

    if (updateError) {
      logger.error('togglePublishStatus: Failed to update', updateError)
      throw updateError
    }

    logger.info(`togglePublishStatus: Successfully updated courseId=${courseId} to is_published=${newStatus}`)
    return { success: true, isPublished: newStatus }
  } catch (error) {
    logger.error('togglePublishStatus: Error', error)
    throw error
  }
}

/**
 * Toggle favorite status for a course
 */
export async function toggleFavorite(courseId: string) {
  logger.info(`toggleFavorite: Starting for courseId=${courseId}`)

  const user = await getCurrentUser()

  if (!user) {
    logger.warn('toggleFavorite: No authenticated user')
    return { error: 'Not authenticated' }
  }

  logger.info(`toggleFavorite: User ${user.email} (${user.id}) toggling favorite for course ${courseId}`)

  try {
    // user_favorites table doesn't exist in database
    // Return error for now until table is added
    logger.warn(`toggleFavorite: user_favorites table not available`)
    return { error: 'Favorites feature is not available yet' }
  } catch (error) {
    logger.error('toggleFavorite: Caught error:', error)
    return { error: 'Failed to update favorite status' }
  }
}

/**
 * Check if courses are favorited by the current user
 */
export async function checkFavorites(courseIds: string[]) {
  const user = await getCurrentUser()

  if (!user || courseIds.length === 0) {
    logger.info(`checkFavorites: No user or empty courseIds. User: ${user?.email}, courseIds: ${courseIds.length}`)
    return {}
  }

  logger.info(`checkFavorites: Checking favorites for user ${user.email} with ${courseIds.length} courses`)

  try {
    // user_favorites table doesn't exist in database
    // Return all courses as not favorited
    const favoritesMap: Record<string, boolean> = {}
    courseIds.forEach(id => {
      favoritesMap[id] = false
    })

    logger.info(`checkFavorites: Favorites feature not available - returning all as unfavorited`)
    return favoritesMap
  } catch (error) {
    logger.error('Error checking favorites:', error)
    return {}
  }
}