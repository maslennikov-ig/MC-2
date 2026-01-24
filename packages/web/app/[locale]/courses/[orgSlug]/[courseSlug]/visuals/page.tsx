import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase/client-factory'
import { getCourseByOrgAndSlugWithRLS } from '@/lib/helpers/organization'
import { CourseVisualsManager } from '@/components/course/CourseVisualsManager'

interface Props {
  params: Promise<{ locale: string; orgSlug: string; courseSlug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { orgSlug, courseSlug } = await params
  const t = await getTranslations('course')

  const course = await getCourseByOrgAndSlugWithRLS(orgSlug, courseSlug)

  return {
    title: course
      ? `${t('visuals.pageTitle')} - ${course.title}`
      : `${t('visuals.pageTitle')} - ${courseSlug}`,
  }
}

export default async function CourseVisualsPage({ params }: Props) {
  const { orgSlug, courseSlug } = await params

  // Fetch course with RLS first
  const course = await getCourseByOrgAndSlugWithRLS(orgSlug, courseSlug)

  if (!course) {
    notFound()
  }

  const adminClient = getAdminClient()

  // Fetch course with sections and lessons
  const { data: courseWithSections } = await adminClient
    .from('courses')
    .select(
      `
      id,
      title,
      slug,
      organization_id,
      sections:sections(
        id,
        title,
        order_index,
        lessons:lessons(
          id,
          title,
          order_index
        )
      )
    `
    )
    .eq('id', course.id)
    .single()

  if (!courseWithSections) {
    notFound()
  }

  // Fetch existing enrichments (covers and cards)
  const { data: enrichments } = await adminClient
    .from('lesson_enrichments')
    .select('id, lesson_id, enrichment_type, status, title')
    .eq('course_id', course.id)
    .in('enrichment_type', ['cover', 'card'])

  // Map enrichments to lessons
  const lessonEnrichments = new Map<string, { cover?: string; card?: string }>()
  enrichments?.forEach((e) => {
    const current = lessonEnrichments.get(e.lesson_id) || {}
    if (e.enrichment_type === 'cover' && e.status === 'completed') {
      current.cover = e.id
    }
    if (e.enrichment_type === 'card' && e.status === 'completed' && e.title !== 'course-card') {
      current.card = e.id
    }
    lessonEnrichments.set(e.lesson_id, current)
  })

  // Check if course card exists
  const courseCard = enrichments?.find((e) => e.title === 'course-card' && e.status === 'completed')

  // Flatten lessons with section info
  const lessons =
    courseWithSections.sections
      ?.sort((a, b) => a.order_index - b.order_index)
      .flatMap(
        (section) =>
          section.lessons
            ?.sort((a, b) => a.order_index - b.order_index)
            .map((lesson) => ({
              id: lesson.id,
              title: lesson.title,
              sectionTitle: section.title,
              hasCover: !!lessonEnrichments.get(lesson.id)?.cover,
              hasCard: !!lessonEnrichments.get(lesson.id)?.card,
            })) || []
      ) || []

  return (
    <div className="container mx-auto px-4 py-8">
      <CourseVisualsManager
        courseId={course.id}
        courseTitle={course.title}
        courseSlug={course.slug}
        orgSlug={orgSlug}
        hasCourseCard={!!courseCard}
        lessons={lessons}
      />
    </div>
  )
}
