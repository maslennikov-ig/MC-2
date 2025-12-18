import { unstable_cache } from 'next/cache'
import { getAdminClient } from './supabase/client-factory'
import { globalDeduplicator, createCacheKey } from './request-deduplication'
import type { Course, Section, Lesson, Asset } from '../types/database'

// Cache configuration
const CACHE_TAGS = {
  COURSES: 'courses',
  COURSE: 'course',
  SECTIONS: 'sections',  
  LESSONS: 'lessons',
} as const

const CACHE_REVALIDATE_TIME = {
  COURSES: 300, // 5 minutes
  COURSE: 600,  // 10 minutes
  SECTIONS: 900, // 15 minutes
  LESSONS: 1800, // 30 minutes
} as const

// Cached query for all courses with deduplication
export const getCachedCourses = unstable_cache(
  async (): Promise<Course[]> => {
    return globalDeduplicator.execute(
      createCacheKey.query('courses', { include: 'sections,lessons' }),
      async () => {
        const supabase = getAdminClient()
        const { data: courses, error } = await supabase
          .from('courses')
          .select(`
            id,
            title,
            description,
            status,
            created_at,
            updated_at,
            sections (
              id
            )
          `)
          .order('created_at', { ascending: false })

        if (error) {
          // Error fetching courses
          return []
        }

        return (courses || []) as unknown as Course[]
      },
      CACHE_REVALIDATE_TIME.COURSES * 1000 // Convert to milliseconds
    )
  },
  ['courses-list'],
  {
    tags: [CACHE_TAGS.COURSES],
    revalidate: CACHE_REVALIDATE_TIME.COURSES,
  }
)

// Cached query for a specific course
export const getCachedCourse = unstable_cache(
  async (courseId: string): Promise<Course | null> => {
    const supabase = getAdminClient()
    const { data: course, error } = await supabase
      .from('courses')
      .select('*')
      .eq('id', courseId)
      .single()

    if (error || !course) {
      return null
    }

    return course as Course
  },
  ['course-by-id'],
  {
    tags: [CACHE_TAGS.COURSE],
    revalidate: CACHE_REVALIDATE_TIME.COURSE,
  }
)

// Cached query for course sections
export const getCachedSections = unstable_cache(
  async (courseId: string): Promise<Section[]> => {
    const supabase = getAdminClient()
    const { data: sections, error } = await supabase
      .from('sections')
      .select('*')
      .eq('course_id', courseId)
      .order('order_index', { ascending: true })

    if (error) {
      // Error fetching sections
      return []
    }

    // Map database sections to Section type
    return (sections || []).map(section => ({
      ...section,
      order_number: section.order_index,
      created_at: section.created_at || new Date().toISOString(),
      updated_at: section.updated_at || new Date().toISOString(),
      description: section.description || ''
    })) as Section[]
  },
  ['sections-by-course'],
  {
    tags: [CACHE_TAGS.SECTIONS],
    revalidate: CACHE_REVALIDATE_TIME.SECTIONS,
  }
)

// Cached query for lessons
export const getCachedLessons = unstable_cache(
  async (sectionIds: string[], courseId: string): Promise<Lesson[]> => {
    if (sectionIds.length === 0) return []

    const supabase = getAdminClient()
    const { data: lessons, error } = await supabase
      .from('lessons')
      .select('*')
      .in('section_id', sectionIds)
      .order('order_index', { ascending: true })

    if (error) {
      // Error fetching lessons
      return []
    }

    // Map database lessons to Lesson type
    // Note: course_id is not in the database but required by the Lesson type
    // We set it from the courseId parameter
    return (lessons || []).map(lesson => ({
      ...lesson,
      course_id: courseId, // Set from parameter - not in database
      order_number: lesson.order_index || 0,
      created_at: lesson.created_at || new Date().toISOString(),
      updated_at: lesson.updated_at || new Date().toISOString(),
      title: lesson.title || '',
      content: lesson.content || undefined,
      content_text: lesson.content_text || undefined
    })) as Lesson[]
  },
  ['lessons-by-sections'],
  {
    tags: [CACHE_TAGS.LESSONS],
    revalidate: CACHE_REVALIDATE_TIME.LESSONS,
  }
)

// Combined cached query for full course data
export const getCachedCourseData = unstable_cache(
  async (courseId: string): Promise<{
    course: Course | null
    sections: Section[]
    lessons: Lesson[]
    assets?: Record<string, Asset[]>
  }> => {
    const course = await getCachedCourse(courseId)
    
    if (!course) {
      return { course: null, sections: [], lessons: [] }
    }

    const sections = await getCachedSections(courseId)
    const sectionIds = sections.map(s => s.id)
    const lessons = await getCachedLessons(sectionIds, courseId)

    // Fetch assets for all lessons
    const lessonIds = lessons.map(l => l.id)
    // Fetching assets for lessons
    
    const supabase = getAdminClient()
    const { data: assets, error: assetsError } = await supabase
      .from('assets')
      .select('*')
      .in('lesson_id', lessonIds)
    
    // Group assets by lesson_id
    const assetsByLesson: Record<string, Asset[]> = {}
    if (assets && !assetsError) {
      assets.forEach((asset) => {
        if (asset.lesson_id) {
          if (!assetsByLesson[asset.lesson_id]) {
            assetsByLesson[asset.lesson_id] = []
          }
          assetsByLesson[asset.lesson_id].push({
            id: asset.id,
            lesson_id: asset.lesson_id,
            url: asset.download_url,
            file_id: asset.file_id,
            filename: asset.filename,
            duration_seconds: asset.duration_seconds,
            size_bytes: asset.file_size_bytes,
            metadata: asset.metadata
          } as Asset)
        }
      })
    }

    return {
      course,
      sections,
      lessons,
      assets: assetsByLesson
    }
  },
  ['full-course-data'],
  {
    tags: [CACHE_TAGS.COURSE, CACHE_TAGS.SECTIONS, CACHE_TAGS.LESSONS],
    revalidate: CACHE_REVALIDATE_TIME.COURSE,
  }
)

// Cache invalidation utilities
export const revalidateCacheTag = (tag: string) => {
  // This would be used in API routes to invalidate cache
  // when data is mutated
  return { tag }
}

// Cache key generators for consistent caching
export const generateCacheKey = {
  courses: () => 'courses-list',
  course: (id: string) => `course-${id}`,
  sections: (courseId: string) => `sections-${courseId}`,
  lessons: (sectionIds: string[]) => `lessons-${sectionIds.join('-')}`,
  fullCourse: (courseId: string) => `full-course-${courseId}`,
}

// Memory cache for client-side caching
interface MemoryCacheEntry<T> {
  data: T
  timestamp: number
  ttl: number
}

class MemoryCache {
  private cache = new Map<string, MemoryCacheEntry<unknown>>()

  set<T>(key: string, data: T, ttlSeconds: number = 300): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlSeconds * 1000
    })
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    
    if (!entry) return null
    
    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key)
      return null
    }
    
    return entry.data as T
  }

  clear(): void {
    this.cache.clear()
  }

  delete(key: string): void {
    this.cache.delete(key)
  }

  // Clean expired entries
  cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key)
      }
    }
  }
}

export const memoryCache = new MemoryCache()

// Client-side cached query wrapper
export function createCachedQuery<T>(
  queryFn: () => Promise<T>,
  cacheKey: string,
  ttlSeconds: number = 300
): () => Promise<T> {
  return async (): Promise<T> => {
    // Try memory cache first
    const cached = memoryCache.get<T>(cacheKey)
    if (cached !== null) {
      return cached
    }

    // Execute query and cache result
    const result = await queryFn()
    memoryCache.set(cacheKey, result, ttlSeconds)
    
    return result
  }
}