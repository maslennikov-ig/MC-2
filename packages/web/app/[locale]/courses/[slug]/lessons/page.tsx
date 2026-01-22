import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import type { Locale } from '@/src/i18n/config'
import { getUserClient } from '@/lib/supabase/client-factory'
import { LessonsContent } from './_components/lessons-content'
import type { Metadata } from 'next'
import type { Database } from '@/types/database.generated'

// Force dynamic rendering to ensure auth state is fresh
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// Use Database types for strict typing
type SectionRow = Database['public']['Tables']['sections']['Row']
type LessonRow = Database['public']['Tables']['lessons']['Row']
type EnrichmentRow = Database['public']['Tables']['lesson_enrichments']['Row']

interface LessonsPageProps {
  params: Promise<{
    locale: Locale
    slug: string
  }>
}

// Generate dynamic metadata for SEO
export async function generateMetadata({ params }: LessonsPageProps): Promise<Metadata> {
  const { slug } = await params
  const supabase = await getUserClient()

  const { data: course } = await supabase.from('courses').select('title').eq('slug', slug).single()

  if (!course) {
    return { title: 'Уроки не найдены' }
  }

  return {
    title: `Уроки курса: ${course.title}`,
    description: `Список всех уроков курса "${course.title}"`,
  }
}

export default async function LessonsPage({ params }: LessonsPageProps) {
  const { locale, slug } = await params
  setRequestLocale(locale)

  const supabase = await getUserClient()

  // Fetch course
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('id, title, slug')
    .eq('slug', slug)
    .single()

  if (courseError || !course) {
    notFound()
  }

  // Fetch sections with all columns to satisfy type
  const { data: sectionsData } = await supabase
    .from('sections')
    .select('*')
    .eq('course_id', course.id)
    .order('order_index')

  const sections: SectionRow[] = sectionsData || []
  const sectionIds = sections.map((s) => s.id)

  // Fetch lessons only if sections exist
  let lessons: LessonRow[] = []
  if (sectionIds.length > 0) {
    const { data: lessonsData } = await supabase
      .from('lessons')
      .select('*')
      .in('section_id', sectionIds)
      .order('order_index')

    lessons = lessonsData || []
  }

  // Fetch enrichments for lessons
  const lessonIds = lessons.map((l) => l.id)
  let enrichments: EnrichmentRow[] = []
  if (lessonIds.length > 0) {
    const { data: enrichmentsData } = await supabase
      .from('lesson_enrichments')
      .select('*')
      .in('lesson_id', lessonIds)
      .eq('status', 'completed')

    enrichments = enrichmentsData || []
  }

  return (
    <LessonsContent
      course={course}
      sections={sections}
      lessons={lessons}
      enrichments={enrichments}
    />
  )
}
