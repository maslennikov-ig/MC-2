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
import { getCourses, checkFavorites } from '../actions'
import type { Course } from '@/types/database'
import { logger } from '@/lib/logger'

interface CourseWithFavorite extends Course {
  isFavorited?: boolean
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
  hasMore
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
        limit: 10
      })

      if (result.courses.length > 0) {
        // Check favorites for new courses if user is authenticated
        let coursesWithFavorites = result.courses
        if (user) {
          const courseIds = result.courses.map(c => c.id)
          const favoritesMap = await checkFavorites(courseIds)
          coursesWithFavorites = result.courses.map(course => ({
            ...course,
            isFavorited: favoritesMap[course.id] || false
          }))
        }

        setDisplayedCourses(prev => [...prev, ...coursesWithFavorites])
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
      {/* Course grid - responsive with more columns on wider screens */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5 mb-8 auto-rows-fr">
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
                ease: "easeOut"
              }}
              layout
            >
              <CourseCard
                course={course}
                user={user || null}
                canDelete={
                  isSuperAdmin ||
                  course.user_id === user?.id ||
                  course.user_id === null
                }
                isFavorited={course.isFavorited}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      
      {/* Load More Button */}
      {hasMoreToLoad && (
        <div className="flex justify-center gap-2">
          <Button
            onClick={handleLoadMore}
            disabled={loadingMore}
            variant="outline"
            size="lg"
            className="bg-white dark:bg-slate-900/50 border-gray-300 dark:border-slate-700 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors duration-200"
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
        <div className="text-center py-12">
          <div className="bg-white dark:bg-slate-900/50 border border-gray-200 dark:border-slate-800 rounded-lg p-12 max-w-md mx-auto shadow-sm">
            <p className="text-gray-600 dark:text-gray-400 text-lg mb-4">
              Курсы не найдены
            </p>
            {user ? (
              <Button 
                onClick={() => router.push('/create')}
                className="bg-purple-600 hover:bg-purple-700 text-white !rounded-full px-6"
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
                  className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 !rounded-full px-6"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  Зарегистрироваться бесплатно
                </Button>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Уже есть аккаунт?{' '}
                  <button
                    onClick={() => authModal.open('login', { returnTo: pathname })}
                    className="text-purple-600 dark:text-purple-400 hover:underline font-medium"
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