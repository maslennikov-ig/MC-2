'use client'

import { Card } from '@/components/ui/card'
import { BookOpen, CheckCircle, GraduationCap, Sparkles } from 'lucide-react'

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
  const {
    totalCount,
    completedCount,
    totalLessons,
  } = statistics

  // Компактная версия - только ключевые метрики в одну строку
  if (compact) {
    return (
      <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400 mb-6">
        <div className="flex items-center gap-1.5">
          <BookOpen className="h-4 w-4" />
          <span className="font-medium">{totalCount}</span>
          <span>курсов</span>
        </div>
        <div className="h-4 w-px bg-gray-300 dark:bg-gray-700" />
        <div className="flex items-center gap-1.5">
          <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
          <span className="font-medium">{completedCount}</span>
          <span>завершено</span>
        </div>
        <div className="h-4 w-px bg-gray-300 dark:bg-gray-700" />
        <div className="flex items-center gap-1.5">
          <GraduationCap className="h-4 w-4" />
          <span className="font-medium">{totalLessons}</span>
          <span>уроков</span>
        </div>
      </div>
    )
  }

  // Минималистичная карточная версия - только важные метрики
  const statsData = [
    {
      label: 'Всего курсов',
      value: totalCount,
      icon: BookOpen,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-100 dark:bg-purple-500/10'
    },
    {
      label: 'Завершено',
      value: completedCount,
      icon: CheckCircle,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-100 dark:bg-green-500/10'
    },
    {
      label: 'Всего уроков',
      value: totalLessons,
      icon: GraduationCap,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-500/10'
    }
  ]

  return (
    <div className="mb-6">
      {/* Компактный заголовок со значком */}
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-400" />
        <span className="text-xs text-gray-600 dark:text-gray-400 uppercase tracking-wider font-medium">
          Ваша статистика
        </span>
      </div>

      {/* Компактная сетка 1x3 */}
      <div className="grid grid-cols-3 gap-3">
        {statsData.map((stat, index) => (
          <Card
            key={index}
            className="bg-white/50 dark:bg-slate-900/30 border-gray-200/50 dark:border-slate-800/50 backdrop-blur-sm hover:bg-white/70 dark:hover:bg-slate-900/50 transition-all duration-200"
          >
            <div className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div className={`p-1.5 rounded-lg ${stat.bgColor}`}>
                  <stat.icon className={`h-3.5 w-3.5 ${stat.color}`} />
                </div>
                <span className="text-xl font-bold text-gray-900 dark:text-white">
                  {stat.value}
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {stat.label}
              </p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}