// Этап 10: CourseViewerEnhanced (финальная версия)
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server';
import { Locale } from '@/src/i18n/config';
import { getUserClient } from '@/lib/supabase/client-factory'
import { logger } from '@/lib/logger'
import CourseViewerEnhanced from '@/components/course/course-viewer-enhanced'
import { CourseErrorBoundary } from '@/components/common/error-boundary'
import {
  groupAssetsByLessonId,
  groupEnrichmentsByLessonId,
  prepareSectionsForViewer,
  prepareLessonsForViewer,
} from '@/lib/course-data-utils'
import type { Course, Asset } from '@/types/database'
import { PostgrestError } from '@supabase/supabase-js'
import { Database } from '@/types/database.generated'

// Force dynamic rendering to ensure auth state is fresh
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// Use generated types for better type safety
type SectionRow = Database['public']['Tables']['sections']['Row']
type LessonRow = Database['public']['Tables']['lessons']['Row']
type AssetRow = Database['public']['Tables']['assets']['Row']
type EnrichmentRow = Database['public']['Tables']['lesson_enrichments']['Row']


interface CoursePageProps {
  params: Promise<{
    locale: Locale
    slug: string
  }>
}

export default async function CoursePage({ params }: CoursePageProps) {
  const { locale, slug } = await params
  setRequestLocale(locale); // Enable static rendering
  
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
    logger.error('Failed to load course sections', {
      courseId: course.id,
      slug,
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
      logger.error('Failed to load course lessons', {
        courseId: course.id,
        slug,
        sectionIds,
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
      logger.warn('Failed to load course assets', {
        courseId: course.id,
        slug,
        lessonIds,
        error: assetsError.message,
        code: assetsError.code
      })
    }
  }

  // Fetch enrichments only if we have lessons to avoid empty .in() query
  let enrichments: EnrichmentRow[] | null = null
  let enrichmentsError: string | undefined

  if (lessons && lessons.length > 0) {
    const lessonIds = lessons.map((l: LessonRow) => l.id)
    const enrichmentsResult = await adminSupabase
      .from('lesson_enrichments')
      .select('*')
      .in('lesson_id', lessonIds)
      .eq('status', 'completed')
      .order('order_index') as { data: EnrichmentRow[] | null; error: PostgrestError | null }

    enrichments = enrichmentsResult.data

    if (enrichmentsResult.error) {
      // Track error message for UI display
      enrichmentsError = enrichmentsResult.error.message
      // Log error for monitoring but continue with empty enrichments list
      // This ensures the course page still renders even if enrichments fail to load
      logger.warn('Failed to load lesson enrichments', {
        courseId: course.id,
        slug,
        error: enrichmentsResult.error.message,
        code: enrichmentsResult.error.code
      })
    }
  }

  // Use shared utilities for data transformation
  const assetsByLessonId = groupAssetsByLessonId(assets)
  const enrichmentsByLessonId = groupEnrichmentsByLessonId(enrichments)
  const sectionsWithLessons = prepareSectionsForViewer(sections, lessons, course.id)
  const lessonsForViewer = prepareLessonsForViewer(lessons, course.id)

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
        enrichments={enrichmentsByLessonId}
        enrichmentsLoadError={enrichmentsError}
      />
    </CourseErrorBoundary>
  )
}