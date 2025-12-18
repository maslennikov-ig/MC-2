// Этап 10: CourseViewerEnhanced (финальная версия)
import { notFound } from 'next/navigation'
import { getUserClient } from '@/lib/supabase/client-factory'
import CourseViewerEnhanced from '@/components/course/course-viewer-enhanced'
import { CourseErrorBoundary } from '@/components/common/error-boundary'
import type { Section, Lesson, Course, Asset } from '@/types/database'
import { PostgrestError } from '@supabase/supabase-js'
import { Database } from '@/types/database.generated'

// Force dynamic rendering to ensure auth state is fresh
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// Use generated types for better type safety
type SectionRow = Database['public']['Tables']['sections']['Row']
type LessonRow = Database['public']['Tables']['lessons']['Row']
type AssetRow = Database['public']['Tables']['assets']['Row']


interface CoursePageProps {
  params: Promise<{
    slug: string
  }>
}

export default async function CoursePage({ params }: CoursePageProps) {
  const { slug } = await params
  
  // Используем getUserClient для автоматического применения RLS
  const supabase = await getUserClient()
  
  const { data: course, error } = await supabase
    .from('courses')
    .select('*')
    .eq('slug', slug)
    .single() as { data: Course | null, error: PostgrestError | null }
  
  // Проверяем наличие курса
  if (error || !course) {
    notFound()
  }
  
  // Этап 4: Получаем секции и уроки
  const { data: sections, error: sectionsError } = await supabase
    .from('sections')
    .select('*')
    .eq('course_id', course.id)
    .order('order_index') as { data: SectionRow[] | null; error: PostgrestError | null }

  if (sectionsError) {
    const { logger } = await import('@/lib/logger')
    logger.error('Failed to load course sections:', {
      courseId: course.id,
      slug: slug,
      error: sectionsError.message,
      code: sectionsError.code
    })
  }

  // Fetch lessons only if we have sections to avoid empty .in() query
  let lessons: LessonRow[] | null = null
  let lessonsError: PostgrestError | null = null

  if (sections && sections.length > 0) {
    const sectionIds = sections.map((s: SectionRow) => s.id)
    const lessonsResult = await supabase
      .from('lessons')
      .select('*')
      .in('section_id', sectionIds)
      .order('order_index') as { data: LessonRow[] | null; error: PostgrestError | null }

    lessons = lessonsResult.data
    lessonsError = lessonsResult.error

    if (lessonsError) {
      const { logger } = await import('@/lib/logger')
      logger.error('Failed to load course lessons:', {
        courseId: course.id,
        slug: slug,
        sectionIds: sectionIds,
        error: lessonsError.message,
        code: lessonsError.code
      })
    }
  }
  
  // Temporarily use admin client to bypass RLS for assets
  // This ensures assets are loaded even for unpublished courses
  const { getAdminClient } = await import('@/lib/supabase/client-factory')
  const adminSupabase = getAdminClient()

  // Fetch assets only if we have lessons to avoid empty .in() query
  let assets: AssetRow[] | null = null
  let assetsError: PostgrestError | null = null

  if (lessons && lessons.length > 0) {
    const lessonIds = lessons.map((l: LessonRow) => l.id)
    const assetsResult = await adminSupabase
      .from('assets')
      .select('*')
      .in('lesson_id', lessonIds) as { data: AssetRow[] | null; error: PostgrestError | null }

    assets = assetsResult.data
    assetsError = assetsResult.error

    if (assetsError) {
      // Log error for monitoring but continue with empty assets list
      // This ensures the course page still renders even if assets fail to load
      const { logger } = await import('@/lib/logger')
      logger.warn('Failed to load course assets:', {
        courseId: course.id,
        slug: slug,
        lessonIds: lessonIds,
        error: assetsError.message,
        code: assetsError.code
      })
    }
  }
  
  // Группируем assets по lesson_id
  const assetsByLessonId = assets?.reduce((acc: Record<string, AssetRow[]>, asset: AssetRow) => {
    if (asset.lesson_id && !acc[asset.lesson_id]) {
      acc[asset.lesson_id] = []
    }
    if (asset.lesson_id) {
      acc[asset.lesson_id].push(asset)
    }
    return acc
  }, {} as Record<string, AssetRow[]>) || {}
  
  // Keep lessons as-is, the component will use the assets record
  
  // Подготовка данных для CourseViewerEnhanced
  const sectionsWithLessons: Section[] = sections?.map((section: SectionRow) => ({
    ...section,
    section_number: String(section.order_index || ''),
    order_number: section.order_index,
    lessons: lessons?.filter((l: LessonRow) => l.section_id === section.id).map(lesson => ({
      ...lesson,
      lesson_number: String(lesson.order_index || ''),
      course_id: course.id,
      order_number: lesson.order_index
    })) || []
  } as Section)) || []

  const lessonsForViewer: Lesson[] = lessons?.map((lesson: LessonRow) => ({
    ...lesson,
    lesson_number: String(lesson.order_index || ''),
    course_id: course.id,
    order_number: lesson.order_index
  } as Lesson)) || []

  // If course is still generating, redirect to generation page
  const isGenerating = course.generation_status &&
    !['completed', 'failed', 'cancelled'].includes(course.generation_status);

  if (isGenerating) {
    const { redirect } = await import('next/navigation')
    redirect(`/courses/generating/${slug}`)
  }

  return (
    <CourseErrorBoundary>
      <CourseViewerEnhanced 
        course={course}
        sections={sectionsWithLessons}
        lessons={lessonsForViewer}
        assets={assetsByLessonId as Record<string, Asset[]>}
      />
    </CourseErrorBoundary>
  )
}