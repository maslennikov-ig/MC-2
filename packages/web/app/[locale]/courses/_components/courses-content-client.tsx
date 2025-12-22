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
  TrendingUp
} from 'lucide-react'
import { cn } from '@/lib/utils'
interface User {
  id: string
  email?: string
  role?: string
}
import type { GetCoursesResponse, Course } from '@/types/database'

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

export function CoursesContentClient({ 
  coursesData, 
  user, 
  params 
}: CoursesContentClientProps) {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(params.view || 'grid')
  const [loadingMore, setLoadingMore] = useState(false)
  
  const isSuperAdmin = user?.role === 'superadmin'
  
  const handlePageChange = (page: number) => {
    const searchParams = new URLSearchParams(window.location.search)
    searchParams.set('page', page.toString())
    window.history.pushState(null, '', `?${searchParams.toString()}`)
    window.location.reload()
  }
  
  const handleLoadMore = async () => {
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
      <div className="flex items-center justify-center gap-2 mt-12">
        <Button
          variant="outline"
          size="icon"
          onClick={() => handlePageChange(1)}
          disabled={currentPage === 1}
          className="bg-slate-900/50 border-slate-700 text-white hover:bg-slate-800 disabled:opacity-30"
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        
        <Button
          variant="outline"
          size="icon"
          onClick={() => handlePageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="bg-slate-900/50 border-slate-700 text-white hover:bg-slate-800 disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        
        {startPage > 1 && (
          <>
            <Button
              variant="outline"
              onClick={() => handlePageChange(1)}
              className="bg-slate-900/50 border-slate-700 text-white hover:bg-slate-800 min-w-[40px]"
            >
              1
            </Button>
            {startPage > 2 && <span className="text-gray-500 px-2">...</span>}
          </>
        )}
        
        {pages.map(page => (
          <Button
            key={page}
            variant={page === currentPage ? 'default' : 'outline'}
            onClick={() => handlePageChange(page)}
            className={cn(
              "min-w-[40px]",
              page === currentPage 
                ? 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white border-0' 
                : 'bg-slate-900/50 border-slate-700 text-white hover:bg-slate-800'
            )}
          >
            {page}
          </Button>
        ))}
        
        {endPage < totalPages && (
          <>
            {endPage < totalPages - 1 && <span className="text-gray-500 px-2">...</span>}
            <Button
              variant="outline"
              onClick={() => handlePageChange(totalPages)}
              className="bg-slate-900/50 border-slate-700 text-white hover:bg-slate-800 min-w-[40px]"
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
          className="bg-slate-900/50 border-slate-700 text-white hover:bg-slate-800 disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        
        <Button
          variant="outline"
          size="icon"
          onClick={() => handlePageChange(totalPages)}
          disabled={currentPage === totalPages}
          className="bg-slate-900/50 border-slate-700 text-white hover:bg-slate-800 disabled:opacity-30"
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    )
  }
  
  return (
    <>
      {/* Enhanced Statistics with animations */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <CourseStatistics
          statistics={{
            totalCount: coursesData.totalCount || 0,
            completedCount: coursesData.courses?.filter((c: Course) => c.generation_status === 'completed').length || 0,
            inProgressCount: coursesData.courses?.filter((c: Course) => c.generation_status && ['initializing', 'processing_documents', 'analyzing_task', 'generating_structure', 'generating_content', 'finalizing'].includes(c.generation_status)).length || 0,
            structureReadyCount: coursesData.courses?.filter((c: Course) => c.generation_status === 'generating_structure').length || 0,
            draftCount: coursesData.courses?.filter((c: Course) => c.status === 'draft').length || 0,
            totalLessons: coursesData.courses?.reduce((acc: number, c: Course) => acc + (c.actual_lessons_count || 0), 0) || 0,
            totalHours: Math.round((coursesData.courses?.reduce((acc: number, c: Course) => acc + (c.actual_lessons_count || 0), 0) || 0) * 5 / 60)
          }}
        />
      </motion.div>
      
      {/* Improved Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <CoursesFiltersImproved 
          initialSearch={params.search}
          initialStatus={params.status}
          initialDifficulty={params.difficulty}
          initialSort={params.sort}
          totalCount={coursesData.totalCount}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
      </motion.div>
      
      {/* Course grid/list with improved animations */}
      <AnimatePresence mode="wait">
        {viewMode === 'grid' ? (
          <motion.div
            key="grid"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5"
          >
            {coursesData.courses.map((course: Course, index: number) => (
              <motion.div
                key={course.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ 
                  duration: 0.3,
                  delay: index * 0.03,
                  ease: [0.43, 0.13, 0.23, 0.96]
                }}
                layout
                whileHover={{ y: -5 }}
              >
                <CourseCard 
                  course={course}
                  user={user}
                  canDelete={
                    isSuperAdmin || 
                    course.user_id === user?.id ||
                    course.user_id === null
                  }
                  viewMode="grid"
                />
              </motion.div>
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
            {coursesData.courses.map((course: Course, index: number) => (
              <motion.div
                key={course.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ 
                  duration: 0.3,
                  delay: index * 0.05,
                  ease: [0.43, 0.13, 0.23, 0.96]
                }}
                whileHover={{ x: 5 }}
              >
                <CourseCard 
                  course={course}
                  user={user}
                  canDelete={
                    isSuperAdmin || 
                    course.user_id === user?.id ||
                    course.user_id === null
                  }
                  viewMode="list"
                />
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Empty state with animation */}
      {coursesData.courses.length === 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="text-center py-16"
        >
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-16 max-w-md mx-auto backdrop-blur-sm">
            <Filter className="h-16 w-16 text-gray-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">
              Курсы не найдены
            </h3>
            <p className="text-gray-400 mb-6">
              Попробуйте изменить фильтры или создайте свой первый курс
            </p>
            <Button 
              onClick={() => window.location.href = '/create'}
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
            >
              Создать курс
            </Button>
          </div>
        </motion.div>
      )}
      
      {/* Improved pagination or load more */}
      {coursesData.totalPages > 1 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          {coursesData.hasMore ? (
            <div className="flex justify-center mt-12">
              <Button
                onClick={handleLoadMore}
                disabled={loadingMore}
                size="lg"
                className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white px-8"
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
        </motion.div>
      )}
      
      {/* Quick stats footer */}
      <motion.div 
        className="border-t border-slate-800 mt-16 py-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.5 }}
      >
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap justify-center items-center gap-8 text-sm text-gray-500">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-purple-400" />
              <span>Обновлено сегодня</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-white font-medium">{coursesData.totalCount}</span>
              <span>курсов доступно</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-white font-medium">
                {coursesData.courses.reduce((acc: number, c: Course) => acc + (c.actual_lessons_count || 0), 0)}
              </span>
              <span>уроков создано</span>
            </div>
          </div>
        </div>
      </motion.div>
    </>
  )
}