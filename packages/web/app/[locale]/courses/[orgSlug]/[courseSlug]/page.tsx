// Stage 10: CourseViewerEnhanced (final version)
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { Locale } from '@/src/i18n/config'
import { getAdminClient } from '@/lib/supabase/client-factory'
import { getCourseByOrgAndSlugWithRLS } from '@/lib/helpers/organization'
import { buildCourseOgImageUrl } from '@/lib/helpers/course-urls'
import { logger } from '@/lib/logger'
import CourseViewerEnhanced from '@/components/course/course-viewer-enhanced'
import { CourseErrorBoundary } from '@/components/common/error-boundary'
import {
  groupAssetsByLessonId,
  groupEnrichmentsByLessonId,
  prepareSectionsForViewer,
  prepareLessonsForViewer,
} from '@/lib/course-data-utils'
import type { Course } from '@/types/database'
import { PostgrestError } from '@supabase/supabase-js'
import { Database } from '@/types/database.generated'
import { z } from 'zod'
import type { Metadata } from 'next'

/** Minimal schema for Course validation - validates critical fields only */
const CourseSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  slug: z.string().min(1),
})

// Force dynamic rendering to ensure auth state is fresh
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// Generate dynamic metadata for OG sharing
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale; orgSlug: string; courseSlug: string }>
}): Promise<Metadata> {
  const { orgSlug, courseSlug } = await params

  try {
    const supabase = getAdminClient()

    // First get the org
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', orgSlug)
      .single()

    if (!org) {
      return {
        title: 'Курс не найден',
      }
    }

    const { data: course } = await supabase
      .from('courses')
      .select('title, course_description')
      .eq('organization_id', org.id)
      .eq('slug', courseSlug)
      .single()

    if (!course) {
      return {
        title: 'Курс не найден',
      }
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://ai.megacampus.ru'
    const ogImageUrl = `${baseUrl}${buildCourseOgImageUrl(orgSlug, courseSlug)}`

    return {
      title: course.title,
      description: course.course_description || `Онлайн курс: ${course.title}`,
      openGraph: {
        title: course.title,
        description: course.course_description || `Онлайн курс: ${course.title}`,
        images: [
          {
            url: ogImageUrl,
            width: 1200,
            height: 630,
            alt: course.title,
          },
        ],
        type: 'website',
        siteName: 'MegaCampusAI',
      },
      twitter: {
        card: 'summary_large_image',
        title: course.title,
        description: course.course_description || `Онлайн курс: ${course.title}`,
        images: [ogImageUrl],
      },
    }
  } catch {
    return {
      title: 'Курс',
    }
  }
}

// Use generated types for better type safety
type SectionRow = Database['public']['Tables']['sections']['Row']
type LessonRow = Database['public']['Tables']['lessons']['Row']
type AssetRow = Database['public']['Tables']['assets']['Row']
type EnrichmentRow = Database['public']['Tables']['lesson_enrichments']['Row']
type LessonContentRow = Database['public']['Tables']['lesson_contents']['Row']

interface CoursePageProps {
  params: Promise<{
    locale: Locale
    orgSlug: string
    courseSlug: string
  }>
  searchParams: Promise<{
    lesson?: string
  }>
}

export default async function CoursePage({ params, searchParams }: CoursePageProps) {
  const { locale, orgSlug, courseSlug } = await params
  const { lesson: initialLessonLabel } = await searchParams
  setRequestLocale(locale) // Enable static rendering

  // Use getCourseByOrgAndSlugWithRLS for automatic RLS enforcement
  const courseWithOrg = await getCourseByOrgAndSlugWithRLS(orgSlug, courseSlug)

  if (!courseWithOrg) {
    notFound()
  }

  // Validate critical fields at runtime
  const validationResult = CourseSchema.safeParse(courseWithOrg)
  if (!validationResult.success) {
    logger.error('Invalid course data from database', {
      orgSlug,
      courseSlug,
      errors: validationResult.error.errors,
    })
    notFound()
  }

  // Type assertion is now safe - we validated the structure
  const course = courseWithOrg as Course

  // Use admin client for fetching related data
  const adminSupabase = getAdminClient()

  // Stage 4: Fetch sections and lessons
  const { data: sections, error: sectionsError } = (await adminSupabase
    .from('sections')
    .select('*')
    .eq('course_id', course.id)
    .order('order_index')) as { data: SectionRow[] | null; error: PostgrestError | null }

  if (sectionsError) {
    logger.error('Failed to load course sections', {
      courseId: course.id,
      orgSlug,
      courseSlug,
      error: sectionsError.message,
      code: sectionsError.code,
    })
  }

  // Fetch lessons only if we have sections to avoid empty .in() query
  let lessons: LessonRow[] | null = null
  let lessonsError: PostgrestError | null = null

  if (sections && sections.length > 0) {
    const sectionIds = sections.map((s: SectionRow) => s.id)
    const lessonsResult = (await adminSupabase
      .from('lessons')
      .select('*')
      .in('section_id', sectionIds)
      .order('order_index')) as { data: LessonRow[] | null; error: PostgrestError | null }

    lessons = lessonsResult.data
    lessonsError = lessonsResult.error

    if (lessonsError) {
      logger.error('Failed to load course lessons', {
        courseId: course.id,
        orgSlug,
        courseSlug,
        sectionIds,
        error: lessonsError.message,
        code: lessonsError.code,
      })
    }
  }

  // Fetch assets, enrichments, and lesson contents in parallel (performance optimization)
  let assets: AssetRow[] | null = null
  let enrichments: EnrichmentRow[] | null = null
  let lessonContents: LessonContentRow[] | null = null
  let enrichmentsError: string | undefined

  if (lessons && lessons.length > 0) {
    const lessonIds = lessons.map((l: LessonRow) => l.id)

    // Execute all three queries in parallel for faster page load
    const [assetsResult, enrichmentsResult, lessonContentsResult] = await Promise.all([
      adminSupabase.from('assets').select('*').in('lesson_id', lessonIds),
      adminSupabase
        .from('lesson_enrichments')
        .select('*')
        .in('lesson_id', lessonIds)
        .not('status', 'in', '(failed,cancelled)')
        .order('order_index'),
      adminSupabase
        .from('lesson_contents')
        .select('*')
        .in('lesson_id', lessonIds)
        .eq('status', 'completed')
        .order('created_at', { ascending: false }),
    ])

    assets = assetsResult.data
    enrichments = enrichmentsResult.data
    lessonContents = lessonContentsResult.data

    // Log errors but continue with empty lists (graceful degradation)
    if (assetsResult.error) {
      logger.warn('Failed to load course assets', {
        courseId: course.id,
        orgSlug,
        courseSlug,
        lessonIds,
        error: assetsResult.error.message,
        code: assetsResult.error.code,
      })
    }

    if (enrichmentsResult.error) {
      enrichmentsError = enrichmentsResult.error.message
      logger.warn('Failed to load lesson enrichments', {
        courseId: course.id,
        orgSlug,
        courseSlug,
        error: enrichmentsResult.error.message,
        code: enrichmentsResult.error.code,
      })
    }

    if (lessonContentsResult.error) {
      logger.warn('Failed to load lesson contents', {
        courseId: course.id,
        orgSlug,
        courseSlug,
        error: lessonContentsResult.error.message,
        code: lessonContentsResult.error.code,
      })
    }
  }

  // Group lesson contents by lesson_id (take the latest completed one per lesson)
  const lessonContentsByLessonId: Record<string, LessonContentRow> = {}
  if (lessonContents) {
    for (const lc of lessonContents) {
      // Only keep the first (latest) content per lesson
      if (!lessonContentsByLessonId[lc.lesson_id]) {
        lessonContentsByLessonId[lc.lesson_id] = lc
      }
    }
  }

  // Use shared utilities for data transformation
  const assetsByLessonId = groupAssetsByLessonId(assets)
  const enrichmentsByLessonId = groupEnrichmentsByLessonId(enrichments)
  const sectionsWithLessons = prepareSectionsForViewer(sections, lessons, course.id)
  const lessonsForViewer = prepareLessonsForViewer(lessons, course.id)

  return (
    <CourseErrorBoundary>
      <CourseViewerEnhanced
        course={course}
        sections={sectionsWithLessons}
        lessons={lessonsForViewer}
        assets={assetsByLessonId}
        enrichments={enrichmentsByLessonId}
        enrichmentsLoadError={enrichmentsError}
        lessonContents={lessonContentsByLessonId}
        initialLessonLabel={initialLessonLabel}
      />
    </CourseErrorBoundary>
  )
}
