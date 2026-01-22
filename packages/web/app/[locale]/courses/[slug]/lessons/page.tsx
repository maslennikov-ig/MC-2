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

  // Fetch course first (needed for other queries)
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('id, title, slug')
    .eq('slug', slug)
    .single()

  if (courseError || !course) {
    notFound()
  }

  // Fetch user auth in parallel with data queries
  const userPromise = supabase.auth.getUser()

  // Use nested select to fetch all data in ONE query (optimized from N+1)
  const { data: sectionsWithLessons } = await supabase
    .from('sections')
    .select(
      `
      *,
      lessons (
        *,
        lesson_enrichments (*)
      )
    `
    )
    .eq('course_id', course.id)
    .order('order_index')

  // Flatten the nested data structure
  const sections: SectionRow[] = (sectionsWithLessons || []).map((s) => {
    const { lessons: _, ...section } = s
    return section as SectionRow
  })

  // Extract and flatten lessons from all sections
  type LessonWithEnrichments = LessonRow & { lesson_enrichments: EnrichmentRow[] }
  const allLessons: LessonWithEnrichments[] = (sectionsWithLessons || []).flatMap(
    (s) => (s.lessons as LessonWithEnrichments[]) || []
  )
  const lessons: LessonRow[] = allLessons.map((l) => {
    const { lesson_enrichments: _, ...lesson } = l
    return lesson
  })

  // Extract enrichments (only completed ones)
  const enrichments: EnrichmentRow[] = allLessons.flatMap((l) =>
    (l.lesson_enrichments || []).filter((e) => e.status === 'completed')
  )

  // Get user progress (await the earlier promise)
  const {
    data: { user },
  } = await userPromise
  let lessonsCompleted: string[] = []

  if (user) {
    const { data: progressData } = await supabase.rpc('get_lesson_progress', {
      p_user_id: user.id,
      p_course_id: course.id,
    })

    // RPC returns JSONB, type cast to expected shape
    const progress = progressData as { lessons_completed?: string[] } | null
    if (progress?.lessons_completed) {
      lessonsCompleted = progress.lessons_completed
    }
  }

  return (
    <LessonsContent
      course={course}
      sections={sections}
      lessons={lessons}
      enrichments={enrichments}
      lessonsCompleted={lessonsCompleted}
    />
  )
}
