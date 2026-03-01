'use client'

import { useState } from 'react'
import { CourseCard } from './course-card'
import { CourseStatistics } from './course-statistics'
import { CoursesFiltersImproved } from './courses-filters-improved'
import { Button } from '@/components/ui/button'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  Filter,
  TrendingUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'
interface User {
  id: string
  email?: string
  role?: string
}
import type { GetCoursesResponse, Course } from '@/types/database'

// Extended Course type with org slug for URL building
interface CourseWithOrg extends Course {
  orgSlug: string
}

interface CoursesContentClientProps {
  coursesData: GetCoursesResponse
  user: User | null
  params: {
    search?: string
    status?: string
    difficulty?: string
    favorites?: string
    sort?: string
    page?: string
    view?: 'grid' | 'list'
  }
}

export function CoursesContentClient({ coursesData, user, params }: CoursesContentClientProps) {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(params.view || 'grid')
  const [loadingMore, setLoadingMore] = useState(false)
  const router = useRouter()

  const isSuperAdmin = user?.role === 'superadmin'

  const handlePageChange = (page: number) => {
    const searchParams = new URLSearchParams(window.location.search)
    searchParams.set('page', page.toString())
    router.replace(`?${searchParams.toString()}`)
  }

  const handleLoadMore = () => {
    setLoadingMore(true)
    const nextPage = (coursesData.currentPage || 1) + 1
    handlePageChange(nextPage)
  }

  const renderPagination = () => {
    const currentPage = coursesData.currentPage || 1
    const totalPages = coursesData.totalPages || 1

    if (totalPages <= 1) return null

    const maxVisiblePages = 7
    const halfVisible = Math.floor(maxVisiblePages / 2)

    let startPage = Math.max(1, currentPage - halfVisible)
    let endPage = Math.min(totalPages, currentPage + halfVisible)

    if (currentPage <= halfVisible) {
      endPage = Math.min(totalPages, maxVisiblePages)
    }
    if (currentPage > totalPages - halfVisible) {
      startPage = Math.max(1, totalPages - maxVisiblePages + 1)
    }

    const pages = []
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i)
    }

    return (
      <div className="mt-12 flex items-center justify-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => handlePageChange(1)}
          disabled={currentPage === 1}
          className="border-slate-700 bg-slate-900/50 text-white hover:bg-slate-800 disabled:opacity-30"
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>

        <Button
          variant="outline"
          size="icon"
          onClick={() => handlePageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="border-slate-700 bg-slate-900/50 text-white hover:bg-slate-800 disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        {startPage > 1 && (
          <>
            <Button
              variant="outline"
              onClick={() => handlePageChange(1)}
              className="min-w-[40px] border-slate-700 bg-slate-900/50 text-white hover:bg-slate-800"
            >
              1
            </Button>
            {startPage > 2 && <span className="px-2 text-gray-500">...</span>}
          </>
        )}

        {pages.map((page) => (
          <Button
            key={page}
            variant={page === currentPage ? 'default' : 'outline'}
            onClick={() => handlePageChange(page)}
            className={cn(
              'min-w-[40px]',
              page === currentPage
                ? 'border-0 bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700'
                : 'border-slate-700 bg-slate-900/50 text-white hover:bg-slate-800'
            )}
          >
            {page}
          </Button>
        ))}

        {endPage < totalPages && (
          <>
            {endPage < totalPages - 1 && <span className="px-2 text-gray-500">...</span>}
            <Button
              variant="outline"
              onClick={() => handlePageChange(totalPages)}
              className="min-w-[40px] border-slate-700 bg-slate-900/50 text-white hover:bg-slate-800"
            >
              {totalPages}
            </Button>
          </>
        )}

        <Button
          variant="outline"
          size="icon"
          onClick={() => handlePageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="border-slate-700 bg-slate-900/50 text-white hover:bg-slate-800 disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>

        <Button
          variant="outline"
          size="icon"
          onClick={() => handlePageChange(totalPages)}
          disabled={currentPage === totalPages}
          className="border-slate-700 bg-slate-900/50 text-white hover:bg-slate-800 disabled:opacity-30"
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  return (
    <>
      {/* Statistics */}
      <div>
        <CourseStatistics
          statistics={{
            totalCount: coursesData.totalCount || 0,
            completedCount:
              coursesData.courses?.filter((c: Course) => c.generation_status === 'completed')
                .length || 0,
            inProgressCount:
              coursesData.courses?.filter(
                (c: Course) =>
                  c.generation_status &&
                  [
                    'initializing',
                    'processing_documents',
                    'analyzing_task',
                    'generating_structure',
                    'generating_content',
                    'finalizing',
                  ].includes(c.generation_status)
              ).length || 0,
            structureReadyCount:
              coursesData.courses?.filter(
                (c: Course) => c.generation_status === 'generating_structure'
              ).length || 0,
            draftCount:
              coursesData.courses?.filter((c: Course) => c.status === 'draft').length || 0,
            totalLessons:
              coursesData.courses?.reduce(
                (acc: number, c: Course) => acc + (c.actual_lessons_count || 0),
                0
              ) || 0,
            totalHours: Math.round(
              ((coursesData.courses?.reduce(
                (acc: number, c: Course) => acc + (c.actual_lessons_count || 0),
                0
              ) || 0) *
                5) /
                60
            ),
          }}
        />
      </div>

      {/* Filters */}
      <div>
        <CoursesFiltersImproved
          initialSearch={params.search}
          initialStatus={params.status}
          initialDifficulty={params.difficulty}
          initialSort={params.sort}
          totalCount={coursesData.totalCount}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
      </div>

      {/* Course grid/list with view transition */}
      <AnimatePresence mode="wait">
        {viewMode === 'grid' ? (
          <motion.div
            key="grid"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
          >
            {(coursesData.courses as CourseWithOrg[]).map((course) => (
              <CourseCard
                key={course.id}
                course={course}
                user={user}
                canDelete={isSuperAdmin || course.user_id === user?.id || course.user_id === null}
                viewMode="grid"
              />
            ))}
          </motion.div>
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            {(coursesData.courses as CourseWithOrg[]).map((course) => (
              <CourseCard
                key={course.id}
                course={course}
                user={user}
                canDelete={isSuperAdmin || course.user_id === user?.id || course.user_id === null}
                viewMode="list"
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty state */}
      {coursesData.courses.length === 0 && (
        <div className="py-16 text-center">
          <div className="mx-auto max-w-md rounded-2xl border border-slate-800 bg-slate-900/50 p-16 backdrop-blur-sm">
            <Filter className="mx-auto mb-4 h-16 w-16 text-gray-500" />
            <h3 className="mb-2 text-xl font-semibold text-white">Курсы не найдены</h3>
            <p className="mb-6 text-gray-400">
              Попробуйте изменить фильтры или создайте свой первый курс
            </p>
            <Button
              onClick={() => router.push('/create')}
              className="bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700"
            >
              Создать курс
            </Button>
          </div>
        </div>
      )}

      {/* Pagination or load more */}
      {coursesData.totalPages > 1 && (
        <div>
          {coursesData.hasMore ? (
            <div className="mt-12 flex justify-center">
              <Button
                onClick={handleLoadMore}
                disabled={loadingMore}
                size="lg"
                className="bg-gradient-to-r from-purple-600 to-blue-600 px-8 text-white hover:from-purple-700 hover:to-blue-700"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Загрузка...
                  </>
                ) : (
                  <>
                    Загрузить еще
                    <ChevronRight className="ml-2 h-5 w-5" />
                  </>
                )}
              </Button>
            </div>
          ) : (
            renderPagination()
          )}
        </div>
      )}

      {/* Quick stats footer */}
      <div className="mt-16 border-t border-slate-800 py-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap items-center justify-center gap-8 text-sm text-gray-500">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-purple-400" />
              <span>Обновлено сегодня</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-white">{coursesData.totalCount}</span>
              <span>курсов доступно</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-white">
                {coursesData.courses.reduce(
                  (acc: number, c: Course) => acc + (c.actual_lessons_count || 0),
                  0
                )}
              </span>
              <span>уроков создано</span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
