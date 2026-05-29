'use client'

import { useTranslations } from 'next-intl'
import { BookOpen, CheckCircle, GraduationCap } from 'lucide-react'

import { CatalogStatistics } from '@/components/catalog/catalog-statistics'

interface Statistics {
  totalCount: number
  completedCount: number
  inProgressCount: number
  structureReadyCount: number
  draftCount: number
  totalLessons: number
  totalHours: number
}

interface CourseStatisticsProps {
  statistics: Statistics
  compact?: boolean
}

export function CourseStatistics({ statistics, compact = false }: CourseStatisticsProps) {
  const { completedCount, totalCount, totalLessons } = statistics
  const t = useTranslations('common.catalog.statistics')

  return (
    <CatalogStatistics
      compact={compact}
      title={t('title')}
      items={[
        {
          id: 'total',
          label: compact ? t('courses') : t('totalCourses'),
          value: totalCount,
          icon: BookOpen,
          tone: 'purple',
        },
        {
          id: 'completed',
          label: compact ? t('completedLabel') : t('completed'),
          value: completedCount,
          icon: CheckCircle,
          tone: 'green',
        },
        {
          id: 'lessons',
          label: compact ? t('lessonsLabel') : t('totalLessons'),
          value: totalLessons,
          icon: GraduationCap,
          tone: 'blue',
        },
      ]}
    />
  )
}
