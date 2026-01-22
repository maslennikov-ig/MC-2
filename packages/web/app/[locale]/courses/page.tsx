import { Metadata } from 'next'
import { Suspense } from 'react'
import { setRequestLocale } from 'next-intl/server'
import { Locale } from '@/src/i18n/config'
import { getCurrentUser } from '@/lib/auth-helpers'
import { getCourses, getCoursesStatistics, checkFavorites, getCourseCovers } from './actions'
import { CoursesHeader } from './_components/courses-header'
import { CoursesFilters } from './_components/courses-filters'
import { CourseGrid } from './_components/course-grid'
import { CoursesLoading } from './_components/courses-loading'
import { CourseStatistics } from './_components/course-statistics'

// Force dynamic rendering to ensure auth state is fresh
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export const metadata: Metadata = {
  title: 'Каталог курсов',
  description:
    'Просмотрите все доступные курсы, созданные с помощью искусственного интеллекта. Найдите подходящий курс по вашей тематике и уровню сложности.',
  keywords: ['каталог курсов', 'онлайн обучение', 'курсы AI', 'образовательные программы'],
  openGraph: {
    title: 'Каталог курсов | MegaCampusAI',
    description: 'Просмотрите все доступные курсы, созданные с помощью искусственного интеллекта',
    url: '/courses',
    type: 'website',
  },
  twitter: {
    title: 'Каталог курсов | MegaCampusAI',
    description: 'Просмотрите все доступные курсы, созданные с помощью искусственного интеллекта',
  },
  alternates: {
    canonical: '/courses',
  },
}

interface PageProps {
  params: Promise<{ locale: Locale }>
  searchParams: Promise<{
    search?: string
    status?: string
    difficulty?: string
    favorites?: string
    sort?: string
    page?: string
  }>
}

export default async function CoursesPage({ params, searchParams }: PageProps) {
  const { locale } = await params
  setRequestLocale(locale) // Enable static rendering

  const searchParamsResolved = await searchParams
  const user = await getCurrentUser()

  // Fetch courses and statistics in parallel (independent queries)
  const [coursesData, statistics] = await Promise.all([
    getCourses({
      search: searchParamsResolved.search,
      status: searchParamsResolved.status,
      difficulty: searchParamsResolved.difficulty,
      favorites: searchParamsResolved.favorites === 'true',
      sort: searchParamsResolved.sort || 'created_desc',
      page: parseInt(searchParamsResolved.page || '1'),
      limit: 12,
    }),
    getCoursesStatistics(),
  ])

  // Get course IDs for batch queries
  const courseIds = coursesData.courses.map((c) => c.id)

  // Fetch favorites and covers in parallel (both depend on courseIds)
  const [favoritesMap, coversMap] = await Promise.all([
    user ? checkFavorites(courseIds) : Promise.resolve({} as Record<string, boolean>),
    getCourseCovers(courseIds),
  ])

  // Add favorites status and cover to courses
  const coursesWithFavorites = coursesData.courses.map((course) => ({
    ...course,
    isFavorited: favoritesMap[course.id] || false,
    coverUrl: coversMap[course.id] || null,
  }))

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-purple-50/20 to-gray-50 transition-colors duration-200 dark:from-slate-950 dark:via-purple-950/20 dark:to-slate-950">
      <div className="relative z-10">
        {/* Header with auth status */}
        <CoursesHeader />

        {/* Main content */}
        <main className="mx-auto max-w-[1920px] px-4 py-8 sm:px-6 lg:px-8">
          {/* Page title */}
          <div className="mb-6 text-center">
            <h1 className="mb-2 text-4xl font-bold text-gray-900 transition-colors duration-200 dark:text-white">
              Каталог курсов
            </h1>
            <p className="text-gray-600 transition-colors duration-200 dark:text-gray-400">
              Изучайте курсы, созданные с помощью искусственного интеллекта
            </p>
          </div>

          {/* Statistics */}
          <CourseStatistics statistics={statistics} />

          {/* Filters */}
          <CoursesFilters
            initialSearch={searchParamsResolved.search}
            initialStatus={searchParamsResolved.status}
            initialDifficulty={searchParamsResolved.difficulty}
            initialSort={searchParamsResolved.sort || 'created_desc'}
            totalCount={coursesData.totalCount}
          />

          {/* Course grid with loading state */}
          <Suspense fallback={<CoursesLoading />}>
            <CourseGrid
              courses={coursesWithFavorites}
              user={user || undefined}
              currentPage={coursesData.currentPage || 1}
              hasMore={coursesData.hasMore || false}
            />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
