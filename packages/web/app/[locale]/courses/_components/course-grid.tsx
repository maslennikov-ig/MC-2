'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { CourseCard } from './course-card'
import { Button } from '@/components/ui/button'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Loader2, Sparkles } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useAuthModal } from '@/lib/hooks/use-auth-modal'
interface User {
  id: string
  email?: string
  role?: string
}
import { getCourses, checkFavorites, getCourseCovers } from '../actions'
import type { Course } from '@/types/database'
import { logger } from '@/lib/client-logger'

interface CourseWithFavorite extends Course {
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
  user,
  currentPage,
  hasMore,
}: CourseGridProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const authModal = useAuthModal()
  const [loadingMore, setLoadingMore] = useState(false)
  const [displayedCourses, setDisplayedCourses] = useState(initialCourses)
  const [currentLoadedPage, setCurrentLoadedPage] = useState(currentPage)
  const [hasMoreToLoad, setHasMoreToLoad] = useState(hasMore)
  const isSuperAdmin = user?.role === 'superadmin'

  // Reset when initial courses change (e.g., due to filters)
  useEffect(() => {
    setDisplayedCourses(initialCourses)
    setCurrentLoadedPage(currentPage)
    setHasMoreToLoad(hasMore)
  }, [initialCourses, currentPage, hasMore])

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
        const courseIds = result.courses.map((c) => c.id)

        // Fetch favorites and covers in parallel (not sequentially)
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

  return (
    <div>
      {/* Course grid - responsive with fewer columns for wider cards */}
      <div className="mb-8 grid auto-rows-fr grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        <AnimatePresence mode="popLayout">
          {displayedCourses.map((course, index) => (
            <motion.div
              key={course.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{
                duration: 0.3,
                delay: index * 0.05,
                ease: 'easeOut',
              }}
              layout
            >
              <CourseCard
                course={course}
                user={user || null}
                canDelete={isSuperAdmin || course.user_id === user?.id || course.user_id === null}
                isFavorited={course.isFavorited}
                index={index}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Load More Button */}
      {hasMoreToLoad && (
        <div className="flex justify-center gap-2">
          <Button
            onClick={() => void handleLoadMore()}
            disabled={loadingMore}
            variant="outline"
            size="lg"
            className="border-gray-300 bg-white text-gray-900 transition-colors duration-200 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900/50 dark:text-white dark:hover:bg-slate-800"
          >
            {loadingMore ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Загрузка...
              </>
            ) : (
              'Загрузить еще'
            )}
          </Button>
        </div>
      )}

      {/* Empty state */}
      {displayedCourses.length === 0 && (
        <div className="py-12 text-center">
          <div className="mx-auto max-w-md rounded-lg border border-gray-200 bg-white p-12 shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
            <p className="mb-4 text-lg text-gray-600 dark:text-gray-400">Курсы не найдены</p>
            {user ? (
              <Button
                onClick={() => router.push('/create')}
                className="!rounded-full bg-purple-600 px-6 text-white hover:bg-purple-700"
              >
                Создать первый курс
              </Button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Начните создавать курсы с помощью AI
                </p>
                <Button
                  onClick={() => authModal.open('register', { returnTo: pathname })}
                  className="!rounded-full bg-gradient-to-r from-purple-600 to-blue-600 px-6 text-white shadow-lg transition-all duration-200 hover:from-purple-700 hover:to-blue-700 hover:shadow-xl"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  Зарегистрироваться бесплатно
                </Button>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Уже есть аккаунт?{' '}
                  <button
                    onClick={() => authModal.open('login', { returnTo: pathname })}
                    className="font-medium text-purple-600 hover:underline dark:text-purple-400"
                  >
                    Войти
                  </button>
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
