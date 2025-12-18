import { Metadata } from "next"
import { Suspense } from 'react'
import { getCurrentUser } from '@/lib/auth-helpers'
import { getCourses, getCoursesStatistics, checkFavorites } from './actions'
import { CoursesHeader } from './_components/courses-header'
import { CoursesFilters } from './_components/courses-filters'
import { CourseGrid } from './_components/course-grid'
import { CoursesLoading } from './_components/courses-loading'
import { CourseStatistics } from './_components/course-statistics'

// Force dynamic rendering to ensure auth state is fresh
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export const metadata: Metadata = {
  title: "Каталог курсов",
  description: "Просмотрите все доступные курсы, созданные с помощью искусственного интеллекта. Найдите подходящий курс по вашей тематике и уровню сложности.",
  keywords: ["каталог курсов", "онлайн обучение", "курсы AI", "образовательные программы"],
  openGraph: {
    title: "Каталог курсов | MegaCampusAI",
    description: "Просмотрите все доступные курсы, созданные с помощью искусственного интеллекта",
    url: "/courses",
    type: "website",
  },
  twitter: {
    title: "Каталог курсов | MegaCampusAI",
    description: "Просмотрите все доступные курсы, созданные с помощью искусственного интеллекта",
  },
  alternates: {
    canonical: "/courses",
  },
}

interface PageProps {
  searchParams: Promise<{
    search?: string
    status?: string
    difficulty?: string
    favorites?: string
    sort?: string
    page?: string
  }>
}

export default async function CoursesPage({ searchParams }: PageProps) {
  const params = await searchParams
  const user = await getCurrentUser()

  // Fetch courses using server action
  const coursesData = await getCourses({
    search: params.search,
    status: params.status,
    difficulty: params.difficulty,
    favorites: params.favorites === 'true',
    sort: params.sort || 'created_desc',
    page: parseInt(params.page || '1'),
    limit: 10
  })

  // Get full statistics (not filtered by pagination)
  const statistics = await getCoursesStatistics()

  // Check favorites for all courses if user is authenticated
  let favoritesMap: Record<string, boolean> = {}
  if (user) {
    const courseIds = coursesData.courses.map(c => c.id)
    favoritesMap = await checkFavorites(courseIds)
  }

  // Add favorites status to courses
  const coursesWithFavorites = coursesData.courses.map(course => ({
    ...course,
    isFavorited: favoritesMap[course.id] || false
  }))

  // Favorites have been mapped to courses
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-purple-50/20 to-gray-50 dark:from-slate-950 dark:via-purple-950/20 dark:to-slate-950 transition-colors duration-200">
      <div className="relative z-10">
        {/* Header with auth status */}
        <CoursesHeader />
        
        {/* Main content */}
        <main className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Page title */}
          <div className="text-center mb-6">
            <h1 className="text-4xl font-bold mb-2 text-gray-900 dark:text-white transition-colors duration-200">
              Каталог курсов
            </h1>
            <p className="text-gray-600 dark:text-gray-400 transition-colors duration-200">
              Изучайте курсы, созданные с помощью искусственного интеллекта
            </p>
          </div>
          
          {/* Statistics */}
          <CourseStatistics 
            statistics={statistics}
          />
          
          {/* Filters */}
          <CoursesFilters 
            initialSearch={params.search}
            initialStatus={params.status}
            initialDifficulty={params.difficulty}
            initialSort={params.sort || 'created_desc'}
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