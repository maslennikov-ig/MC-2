import { Metadata } from 'next'
import { Suspense } from 'react'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { Locale, defaultLocale, locales } from '@/src/i18n/config'
import { getCurrentUser } from '@/lib/auth-helpers'
import { getCourses, getCoursesStatistics, checkFavorites, getCourseCovers } from '../actions'
import { CoursesHeader } from '../_components/courses-header'
import { CoursesFilters } from '../_components/courses-filters'
import { CourseGrid } from '../_components/course-grid'
import { CoursesLoading } from '../_components/courses-loading'
import { CourseStatistics } from '../_components/course-statistics'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

type PageProps = {
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'common.catalog' })
  const pagePath = getCoursesLibraryPagePath(locale)

  return {
    title: t('title'),
    description: t('metaDescription'),
    keywords: t('metaKeywords').split(', '),
    alternates: {
      canonical: pagePath,
      languages: Object.fromEntries(
        locales.map((language) => [language, getCoursesLibraryPagePath(language)])
      ),
    },
    openGraph: {
      title: `${t('title')} | MegaCampusAI`,
      description: t('metaDescription'),
      url: pagePath,
      type: 'website',
    },
    twitter: {
      title: `${t('title')} | MegaCampusAI`,
      description: t('metaDescription'),
    },
  }
}

export default async function CoursesLibraryPage({ params, searchParams }: PageProps) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('common.catalog')

  const searchParamsResolved = await searchParams
  const user = await getCurrentUser()

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

  const courseIds = coursesData.courses.map((course) => course.id)
  const [favoritesMap, coversMap] = await Promise.all([
    user ? checkFavorites(courseIds) : Promise.resolve({} as Record<string, boolean>),
    getCourseCovers(courseIds),
  ])

  const coursesWithFavorites = coursesData.courses.map((course) => ({
    ...course,
    isFavorited: favoritesMap[course.id] || false,
    coverUrl: coversMap[course.id] || null,
  }))

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-purple-50/20 to-gray-50 transition-colors duration-200 dark:from-slate-950 dark:via-purple-950/20 dark:to-slate-950">
      <div className="relative z-10">
        <CoursesHeader />

        <main className="mx-auto max-w-[1920px] px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-6 text-center">
            <h1 className="mb-2 text-4xl font-bold text-gray-900 transition-colors duration-200 dark:text-white">
              {t('title')}
            </h1>
            <p className="text-gray-600 transition-colors duration-200 dark:text-gray-400">
              {t('description')}
            </p>
          </div>

          <CourseStatistics statistics={statistics} />

          <CoursesFilters
            initialSearch={searchParamsResolved.search}
            initialStatus={searchParamsResolved.status}
            initialDifficulty={searchParamsResolved.difficulty}
            initialSort={searchParamsResolved.sort || 'created_desc'}
            totalCount={coursesData.totalCount}
          />

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

function getCoursesLibraryPagePath(locale: Locale) {
  return locale === defaultLocale ? '/courses/library' : `/${locale}/courses/library`
}
