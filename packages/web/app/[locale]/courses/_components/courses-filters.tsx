'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition, useCallback, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Search, X, Heart, ArrowUpDown } from 'lucide-react'
import { useDebouncedCallback } from 'use-debounce'

interface CoursesFiltersProps {
  initialSearch?: string
  initialStatus?: string
  initialDifficulty?: string
  initialSort?: string
  totalCount?: number
}

export function CoursesFilters({
  initialSearch = '',
  initialStatus = 'all',
  initialDifficulty = 'all',
  initialSort = 'created_desc',
  totalCount = 0,
}: CoursesFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const t = useTranslations('common.catalog')
  const tc = useTranslations('common')
  const [search, setSearch] = useState(initialSearch)
  // Prevent hydration mismatch: Radix UI Select generates different IDs on server vs client
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const updateFilters = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString())

      Object.entries(updates).forEach(([key, value]) => {
        if (value && value !== 'all') {
          params.set(key, value)
        } else {
          params.delete(key)
        }
      })

      // Reset to page 1 when filters change
      params.delete('page')

      startTransition(() => {
        router.push(`/courses/library?${params.toString()}`)
      })
    },
    [router, searchParams]
  )

  const debouncedSearch = useDebouncedCallback((value: string) => {
    updateFilters({ search: value })
  }, 300)

  const handleSearchChange = (value: string) => {
    setSearch(value)
    debouncedSearch(value)
  }

  const clearSearch = () => {
    setSearch('')
    updateFilters({ search: '' })
  }

  return (
    <div className="mb-6 space-y-3">
      <div className="flex flex-col items-center gap-4 lg:flex-row">
        {/* Search input */}
        <div className="relative max-w-md flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transform text-gray-400 dark:text-gray-500" />
          <Input
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="border-gray-300 bg-white pr-10 pl-10 text-gray-900 transition-colors duration-200 placeholder:text-gray-500 focus:border-purple-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-white dark:placeholder:text-gray-400 dark:focus:border-purple-500"
            style={{ paddingLeft: '2.5rem' }}
            disabled={isPending}
          />
          {search && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-1/2 right-1 h-7 w-7 -translate-y-1/2 transform text-gray-400 transition-colors duration-200 hover:text-gray-600 dark:text-gray-400 dark:hover:text-white"
              onClick={clearSearch}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Status filter */}
        {mounted ? (
          <Select
            value={initialStatus}
            onValueChange={(value) => updateFilters({ status: value })}
            disabled={isPending}
          >
            <SelectTrigger
              className="w-full border-gray-300 bg-white text-gray-900 transition-colors duration-200 sm:w-[180px] dark:border-slate-700 dark:bg-slate-900/50 dark:text-white"
              aria-label={t('filterByStatus')}
            >
              <SelectValue placeholder={t('allStatuses')} />
            </SelectTrigger>
            <SelectContent className="border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900">
              <SelectItem
                value="all"
                className="text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-800"
              >
                {t('allStatuses')}
              </SelectItem>
              <SelectItem
                value="draft"
                className="text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-800"
              >
                {t('status.draft')}
              </SelectItem>
              <SelectItem
                value="generating"
                className="text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-800"
              >
                {t('status.generating')}
              </SelectItem>
              <SelectItem
                value="completed"
                className="text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-800"
              >
                {t('status.completed')}
              </SelectItem>
              <SelectItem
                value="failed"
                className="text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-800"
              >
                {t('status.failed')}
              </SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <Skeleton className="h-10 w-full rounded-lg sm:w-[180px]" />
        )}

        {/* Difficulty filter */}
        {mounted ? (
          <Select
            value={initialDifficulty}
            onValueChange={(value) => updateFilters({ difficulty: value })}
            disabled={isPending}
          >
            <SelectTrigger
              className="w-full border-gray-300 bg-white text-gray-900 transition-colors duration-200 sm:w-[180px] dark:border-slate-700 dark:bg-slate-900/50 dark:text-white"
              aria-label={t('filterByDifficulty')}
            >
              <SelectValue placeholder={t('anyDifficulty')} />
            </SelectTrigger>
            <SelectContent className="border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900">
              <SelectItem
                value="all"
                className="text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-800"
              >
                {t('anyDifficulty')}
              </SelectItem>
              <SelectItem
                value="beginner"
                className="text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-800"
              >
                {t('difficulty.beginner')}
              </SelectItem>
              <SelectItem
                value="intermediate"
                className="text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-800"
              >
                {t('difficulty.intermediate')}
              </SelectItem>
              <SelectItem
                value="advanced"
                className="text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-800"
              >
                {t('difficulty.advanced')}
              </SelectItem>
              <SelectItem
                value="master"
                className="text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-800"
              >
                {t('difficulty.master')}
              </SelectItem>
              <SelectItem
                value="expert"
                className="text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-800"
              >
                {t('difficulty.expert')}
              </SelectItem>
              <SelectItem
                value="mixed"
                className="text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-800"
              >
                {t('difficulty.mixed')}
              </SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <Skeleton className="h-10 w-full rounded-lg sm:w-[180px]" />
        )}

        {/* Sort dropdown */}
        {mounted ? (
          <Select
            value={initialSort}
            onValueChange={(value) => updateFilters({ sort: value })}
            disabled={isPending}
          >
            <SelectTrigger
              className="w-full border-gray-300 bg-white text-gray-900 transition-colors duration-200 sm:w-[200px] dark:border-slate-700 dark:bg-slate-900/50 dark:text-white"
              aria-label={t('sortCourses')}
            >
              <ArrowUpDown className="mr-2 h-4 w-4" />
              <SelectValue placeholder={t('sort')} />
            </SelectTrigger>
            <SelectContent className="border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900">
              <SelectItem
                value="created_desc"
                className="text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-800"
              >
                {t('sortOptions.created_desc')}
              </SelectItem>
              <SelectItem
                value="created_asc"
                className="text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-800"
              >
                {t('sortOptions.created_asc')}
              </SelectItem>
              <SelectItem
                value="title_asc"
                className="text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-800"
              >
                {t('sortOptions.title_asc')}
              </SelectItem>
              <SelectItem
                value="title_desc"
                className="text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-800"
              >
                {t('sortOptions.title_desc')}
              </SelectItem>
              <SelectItem
                value="lessons_desc"
                className="text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-800"
              >
                {t('sortOptions.lessons_desc')}
              </SelectItem>
              <SelectItem
                value="lessons_asc"
                className="text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-800"
              >
                {t('sortOptions.lessons_asc')}
              </SelectItem>
              <SelectItem
                value="difficulty_asc"
                className="text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-800"
              >
                {t('sortOptions.difficulty_asc')}
              </SelectItem>
              <SelectItem
                value="difficulty_desc"
                className="text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-800"
              >
                {t('sortOptions.difficulty_desc')}
              </SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <Skeleton className="h-10 w-full rounded-lg sm:w-[200px]" />
        )}

        {/* Favorites filter button */}
        <Button
          variant="outline"
          className="h-10 rounded-lg border-gray-300 bg-white text-gray-900 shadow-sm transition-colors duration-200 hover:border-gray-400 hover:bg-gray-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-white dark:hover:border-slate-600 dark:hover:bg-slate-800"
          disabled={isPending}
          onClick={() =>
            updateFilters({ favorites: searchParams.get('favorites') === 'true' ? '' : 'true' })
          }
        >
          <Heart
            className={`mr-2 h-4 w-4 ${searchParams.get('favorites') === 'true' ? 'fill-red-500 text-red-500' : ''}`}
          />
          {t('favorites')}
        </Button>

        {/* Results counter */}
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600 transition-colors duration-200 dark:text-gray-400">
            {t('resultsCount', { count: totalCount, total: totalCount })}
          </span>
        </div>
      </div>

      {/* Loading indicator */}
      {isPending && (
        <div className="text-sm text-gray-600 transition-colors duration-200 dark:text-gray-400">
          {tc('loading')}
        </div>
      )}
    </div>
  )
}
