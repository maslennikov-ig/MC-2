import { NextRequest, NextResponse } from 'next/server'
import { getUserClient } from '@/lib/supabase/client-factory'
import { logger } from '@/lib/logger'
import { authenticateRequest } from '@/lib/auth'
import { Course } from '@/types/database'
import { PostgrestError } from '@supabase/supabase-js'
import { PAGINATION } from '@/lib/constants'

interface CourseWithCounts extends Course {
  sections_count: number
  lessons_count: number
  is_owner: boolean
}

interface SupabaseResponse<T> {
  data: T[] | null
  error: PostgrestError | null
}

const ITEMS_PER_PAGE = PAGINATION.ITEMS_PER_PAGE

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || String(ITEMS_PER_PAGE))
    const offset = (page - 1) * limit
    const onlyMine = searchParams.get('mine') === 'true'

    // Get authenticated user if available
    const user = await authenticateRequest(request)

    // Build query based on auth status and filter
    // Using visibility field: 'private' (owner only), 'organization' (same org), 'public' (all)
    let countFilter = ''
    let dataFilter = ''

    if (onlyMine && user) {
      // Show only user's courses
      countFilter = `user_id.eq.${user.id}`
      dataFilter = `user_id.eq.${user.id}`
    } else if (!user) {
      // Not authenticated - show only public courses
      countFilter = 'visibility.eq.public'
      dataFilter = 'visibility.eq.public'
    } else {
      // Authenticated - show user's courses + public courses
      // Note: organization visibility is handled by RLS policy based on user's organization
      countFilter = `user_id.eq.${user.id},visibility.eq.public`
      dataFilter = `user_id.eq.${user.id},visibility.eq.public`
    }

    // Use appropriate client for user-based filtering
    const supabase = await getUserClient()

    // Get total count
    const countQuery = countFilter
      ? supabase.from('courses').select('*', { count: 'exact', head: true }).or(countFilter)
      : supabase.from('courses').select('*', { count: 'exact', head: true })

    const { count } = await countQuery

    // Get paginated courses with JOIN to avoid N+1 queries
    const dataQuery = dataFilter
      ? supabase
          .from('courses')
          .select(
            `
          id,
          title,
          slug,
          course_description,
          status,
          created_at,
          updated_at,
          language,
          difficulty,
          target_audience,
          style,
          prerequisites,
          learning_outcomes,
          course_structure,
          total_lessons_count,
          total_sections_count,
          user_id,
          is_published,
          visibility,
          share_token
        `
          )
          .or(dataFilter)
      : supabase.from('courses').select(`
          id,
          title,
          slug,
          course_description,
          status,
          created_at,
          updated_at,
          language,
          difficulty,
          target_audience,
          style,
          prerequisites,
          learning_outcomes,
          course_structure,
          total_lessons_count,
          total_sections_count,
          user_id,
          is_published,
          visibility,
          share_token
        `)

    const { data: courses, error } = (await dataQuery
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)) as SupabaseResponse<Course>

    if (error) {
      logger.error('Error fetching paginated courses:', error)
      return NextResponse.json({ error: 'Failed to fetch courses' }, { status: 500 })
    }

    // Use pre-computed counts from courses table (total_sections_count, total_lessons_count)
    const coursesWithCounts: CourseWithCounts[] = (courses || []).map(
      (course: Course): CourseWithCounts => ({
        ...course,
        sections_count: course.total_sections_count || 0,
        lessons_count: course.total_lessons_count || 0,
        is_owner: user ? course.user_id === user.id : false,
      })
    )

    return NextResponse.json({
      courses: coursesWithCounts,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
        hasMore: offset + limit < (count || 0),
      },
    })
  } catch (error) {
    logger.error('Unexpected error in paginated courses:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
