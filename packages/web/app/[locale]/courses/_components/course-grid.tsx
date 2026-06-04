'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Sparkles } from 'lucide-react'

import { CatalogGrid } from '@/components/catalog/catalog-grid'
import { Button } from '@/components/ui/button'
import { useAuthModal } from '@/lib/hooks/use-auth-modal'
import { logger } from '@/lib/client-logger'
import type { Course } from '@/types/database'
import { checkFavorites, getCourseCovers, getCourses } from '../actions'
import { CourseCard } from './course-card'

interface User {
  id: string
  email?: string
  role?: string
}

interface CourseWithFavorite extends Course {
  orgSlug: string
  isFavorited?: boolean
  coverUrl?: string | null
}

interface CourseGridProps {
  courses: CourseWithFavorite[]
  user?: User
  currentPage: number
  hasMore: boolean
}

export function CourseGrid({
  courses: initialCourses,
  currentPage,
  hasMore,
  user,
}: CourseGridProps) {
  const authModal = useAuthModal()
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations('common.catalog')
  const tc = useTranslations('common')
  const [loadingMore, setLoadingMore] = useState(false)
  const [displayedCourses, setDisplayedCourses] = useState(initialCourses)
  const [currentLoadedPage, setCurrentLoadedPage] = useState(currentPage)
  const [hasMoreToLoad, setHasMoreToLoad] = useState(hasMore)
  const isSuperAdmin = user?.role === 'superadmin'

  useEffect(() => {
    setDisplayedCourses(initialCourses)
    setCurrentLoadedPage(currentPage)
    setHasMoreToLoad(hasMore)
  }, [currentPage, hasMore, initialCourses])

  const handleLoadMore = async () => {
    setLoadingMore(true)
    try {
      const nextPage = currentLoadedPage + 1
      const result = await getCourses({
        search: searchParams.get('search') || undefined,
        status: searchParams.get('status') || undefined,
        difficulty: searchParams.get('difficulty') || undefined,
        page: nextPage,
        limit: 12,
      })

      if (result.courses.length > 0) {
        const courseIds = result.courses.map((course) => course.id)
        const [favoritesMap, coversMap] = await Promise.all([
          user ? checkFavorites(courseIds) : Promise.resolve({} as Record<string, boolean>),
          getCourseCovers(courseIds),
        ])

        const coursesWithExtras = result.courses.map((course) => ({
          ...course,
          isFavorited: favoritesMap[course.id] || false,
          coverUrl: coversMap[course.id] || null,
        }))

        setDisplayedCourses((prev) => [...prev, ...coursesWithExtras])
        setCurrentLoadedPage(nextPage)
        setHasMoreToLoad(result.hasMore || false)
      }
    } catch (error) {
      logger.error('Error loading more courses:', error)
    } finally {
      setLoadingMore(false)
    }
  }

  const emptyAction = user ? (
    <Button
      onClick={() => router.push('/create')}
      className="!rounded-full bg-purple-600 px-6 text-white hover:bg-purple-700"
    >
      {t('createFirstCourse')}
    </Button>
  ) : (
    <div className="space-y-3">
      <p className="text-sm text-gray-500 dark:text-gray-400">{t('startCreating')}</p>
      <Button
        onClick={() => authModal.open('register', { returnTo: pathname })}
        className="!rounded-full bg-gradient-to-r from-purple-600 to-blue-600 px-6 text-white shadow-lg transition-all duration-200 hover:from-purple-700 hover:to-blue-700 hover:shadow-xl"
      >
        <Sparkles className="mr-2 h-4 w-4" aria-hidden />
        {t('registerFree')}
      </Button>
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        {t('alreadyHaveAccount')}{' '}
        <button
          onClick={() => authModal.open('login', { returnTo: pathname })}
          className="font-medium text-purple-600 hover:underline dark:text-purple-400"
        >
          {tc('auth.signIn')}
        </button>
      </p>
    </div>
  )

  return (
    <CatalogGrid
      items={displayedCourses}
      getKey={(course) => course.id}
      renderItem={(course, index) => (
        <CourseCard
          course={course}
          user={user || null}
          canDelete={isSuperAdmin || course.user_id === user?.id || course.user_id === null}
          isFavorited={course.isFavorited}
          index={index}
        />
      )}
      loadMore={{
        hasMore: hasMoreToLoad,
        isLoading: loadingMore,
        label: t('loadMore'),
        loadingLabel: tc('loading'),
        onLoadMore: () => {
          void handleLoadMore()
        },
      }}
      emptyState={{
        title: t('noCoursesFound'),
        action: emptyAction,
      }}
    />
  )
}
