'use client'

import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Heart } from 'lucide-react'

import { CatalogFilters } from '@/components/catalog/catalog-filters'

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
  const searchParams = useSearchParams()
  const t = useTranslations('common.catalog')
  const tc = useTranslations('common')

  return (
    <CatalogFilters
      basePath="/courses/library"
      initialSearch={initialSearch}
      loadingLabel={tc('loading')}
      resultsLabel={t('resultsCount', { count: totalCount, total: totalCount })}
      searchPlaceholder={t('searchPlaceholder')}
      totalCount={totalCount}
      selectFilters={[
        {
          key: 'status',
          value: initialStatus,
          label: t('allStatuses'),
          ariaLabel: t('filterByStatus'),
          options: [
            { value: 'all', label: t('allStatuses') },
            { value: 'draft', label: t('status.draft') },
            { value: 'generating', label: t('status.generating') },
            { value: 'completed', label: t('status.completed') },
            { value: 'failed', label: t('status.failed') },
          ],
        },
        {
          key: 'difficulty',
          value: initialDifficulty,
          label: t('anyDifficulty'),
          ariaLabel: t('filterByDifficulty'),
          options: [
            { value: 'all', label: t('anyDifficulty') },
            { value: 'beginner', label: t('difficulty.beginner') },
            { value: 'intermediate', label: t('difficulty.intermediate') },
            { value: 'advanced', label: t('difficulty.advanced') },
            { value: 'master', label: t('difficulty.master') },
            { value: 'expert', label: t('difficulty.expert') },
            { value: 'mixed', label: t('difficulty.mixed') },
          ],
        },
      ]}
      sortFilter={{
        key: 'sort',
        value: initialSort,
        label: t('sort'),
        ariaLabel: t('sortCourses'),
        options: [
          { value: 'created_desc', label: t('sortOptions.created_desc') },
          { value: 'created_asc', label: t('sortOptions.created_asc') },
          { value: 'title_asc', label: t('sortOptions.title_asc') },
          { value: 'title_desc', label: t('sortOptions.title_desc') },
          { value: 'lessons_desc', label: t('sortOptions.lessons_desc') },
          { value: 'lessons_asc', label: t('sortOptions.lessons_asc') },
          { value: 'difficulty_asc', label: t('sortOptions.difficulty_asc') },
          { value: 'difficulty_desc', label: t('sortOptions.difficulty_desc') },
        ],
      }}
      toggles={[
        {
          key: 'favorites',
          label: t('favorites'),
          active: searchParams.get('favorites') === 'true',
          icon: Heart,
        },
      ]}
    />
  )
}
