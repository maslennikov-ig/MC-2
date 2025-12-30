import { NextRequest, NextResponse } from 'next/server'
import { getUserClient } from '@/lib/supabase/client-factory'
import { logger } from '@/lib/logger'
import { authenticateRequest } from '@/lib/auth'
import { Course } from '@/types/database'
import { PostgrestError } from '@supabase/supabase-js'
import { PAGINATION } from '@/lib/constants'
import { Database } from '@/types/database.generated'

// Use generated types from database
type SectionRow = Database['public']['Tables']['sections']['Row']
type LessonRow = Database['public']['Tables']['lessons']['Row']

interface SectionCountItem {
  course_id: string;
  count?: number;
}

interface LessonCountItem {
  course_id: string;
  count?: number;
}

interface CourseWithCounts extends Course {
  sections_count: number;
  lessons_count: number;
  is_owner: boolean;
}

interface SupabaseResponse<T> {
  data: T[] | null;
  error: PostgrestError | null;
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
      ? supabase.from('courses').select(`
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
        `).or(dataFilter)
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
    
    const { data: courses, error } = await dataQuery
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1) as SupabaseResponse<Course>

    if (error) {
      logger.error('Error fetching paginated courses:', error)
      return NextResponse.json({ error: 'Failed to fetch courses' }, { status: 500 })
    }

    // Optimize: Get all section and lesson counts in bulk to avoid N+1 queries
    let coursesWithCounts = courses || []
    
    if (courses && courses.length > 0) {
      const courseIds = courses.map((c: Course) => c.id)
      
      // Single query to get all section counts  
      let sectionsData: Pick<SectionRow, 'course_id' | 'id'>[] | null = null
      // RPC function doesn't exist, use direct query
      const { data: sectionsResult } = await supabase
        .from('sections')
        .select('course_id, id')
        .in('course_id', courseIds) as SupabaseResponse<Pick<SectionRow, 'course_id' | 'id'>>
      sectionsData = sectionsResult
      
      // Single query to get all lesson counts
      let lessonsData = null
      // RPC function doesn't exist, use fallback method
      {
        // Get all sections first, then lessons
        const { data: allSections } = await supabase
          .from('sections')
          .select('id, course_id')
          .in('course_id', courseIds) as SupabaseResponse<Pick<SectionRow, 'id' | 'course_id'>>
        
        if (allSections && allSections.length > 0) {
          const sectionIds = allSections.map((s: Pick<SectionRow, 'id' | 'course_id'>) => s.id)
          const { data: allLessons } = await supabase
            .from('lessons')
            .select('section_id, id')
            .in('section_id', sectionIds) as SupabaseResponse<Pick<LessonRow, 'section_id' | 'id'>>
          
          // Group lessons by course_id
          const lessonsByCourse = new Map()
          allLessons?.forEach((lesson: Pick<LessonRow, 'section_id' | 'id'>) => {
            const section = allSections.find((s: Pick<SectionRow, 'id' | 'course_id'>) => s.id === lesson.section_id)
            if (section) {
              const courseId = section.course_id
              lessonsByCourse.set(courseId, (lessonsByCourse.get(courseId) || 0) + 1)
            }
          })
          
          lessonsData = { data: Array.from(lessonsByCourse.entries()).map(([course_id, count]) => ({ course_id, count })) }
        } else {
          lessonsData = { data: [] }
        }
      }

      // Create lookup maps for efficient assignment
      const sectionsMap = new Map()
      const lessonsMap = new Map()
      
      if (sectionsData) {
        if (Array.isArray(sectionsData) && sectionsData.length > 0) {
          const firstItem = sectionsData[0] as Pick<SectionRow, 'course_id' | 'id'> | SectionCountItem
          if (firstItem && 'course_id' in firstItem && typeof firstItem.course_id === 'string') {
            // Check if it's count data or raw sections
            if ('count' in firstItem) {
              // Data from RPC or aggregation
              (sectionsData as SectionCountItem[]).forEach((item: SectionCountItem) => {
                sectionsMap.set(item.course_id, item.count || 1)
              })
            } else {
              // Data from direct section query - group by course_id
              (sectionsData as Pick<SectionRow, 'course_id' | 'id'>[]).forEach((section: Pick<SectionRow, 'course_id' | 'id'>) => {
                sectionsMap.set(section.course_id, (sectionsMap.get(section.course_id) || 0) + 1)
              })
            }
          }
        }
      }
      
      if (lessonsData?.data) {
        lessonsData.data.forEach((item: LessonCountItem) => {
          lessonsMap.set(item.course_id, item.count || 0)
        })
      }
      
      // Combine data efficiently
      coursesWithCounts = courses.map((course: Course): CourseWithCounts => ({
        ...course,
        sections_count: sectionsMap.get(course.id) || 0,
        lessons_count: lessonsMap.get(course.id) || 0,
        is_owner: user ? course.user_id === user.id : false,
      }))
    }

    return NextResponse.json({
      courses: coursesWithCounts,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
        hasMore: offset + limit < (count || 0)
      }
    })
  } catch (error) {
    logger.error('Unexpected error in paginated courses:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}