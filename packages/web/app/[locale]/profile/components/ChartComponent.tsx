'use client'

import { memo, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import type { UserProfile } from '../page'

interface ChartComponentProps {
  data: UserProfile
}

const ChartComponent = memo(function ChartComponent({ data }: ChartComponentProps) {
  const t = useTranslations('profile.chart')

  // Calculate chart data
  const chartData = useMemo(() => {
    const total = (data.courses_enrolled || 0) + 10 // Add some baseline for visualization
    const completed = data.courses_completed || 0
    const inProgress = (data.courses_enrolled || 0) - completed
    const completionRate =
      (data.courses_enrolled || 0) > 0
        ? Math.round((completed / (data.courses_enrolled || 1)) * 100)
        : 0

    return {
      completed,
      inProgress,
      total,
      completionRate,
      learningHours: data.total_learning_hours || 0,
    }
  }, [data])

  // Generate mock weekly progress data
  const weeklyData = useMemo(() => {
    return [
      { day: t('mon'), hours: 2 },
      { day: t('tue'), hours: 3 },
      { day: t('wed'), hours: 1.5 },
      { day: t('thu'), hours: 4 },
      { day: t('fri'), hours: 2.5 },
      { day: t('sat'), hours: 5 },
      { day: t('sun'), hours: 3 },
    ]
  }, [t])

  const maxHours = Math.max(...weeklyData.map((d) => d.hours))

  return (
    <div className="space-y-6">
      {/* Progress Circle Chart */}
      <div className="flex items-center justify-between">
        <div className="relative">
          <svg className="h-32 w-32 -rotate-90 transform">
            <circle
              cx="64"
              cy="64"
              r="56"
              stroke="currentColor"
              strokeWidth="12"
              fill="none"
              className="text-gray-200 dark:text-gray-700"
            />
            <circle
              cx="64"
              cy="64"
              r="56"
              stroke="currentColor"
              strokeWidth="12"
              fill="none"
              strokeDasharray={`${chartData.completionRate * 3.52} 352`}
              className="text-purple-500 transition-all duration-1000"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="text-2xl font-bold">{chartData.completionRate}%</div>
              <div className="text-muted-foreground text-xs">{t('completed')}</div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 rounded-full bg-purple-500" />
            <span className="text-sm">{t('completedCount', { count: chartData.completed })}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 rounded-full bg-pink-500" />
            <span className="text-sm">{t('inProgressCount', { count: chartData.inProgress })}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 rounded-full bg-gray-300 dark:bg-gray-600" />
            <span className="text-sm">{t('totalHours', { count: chartData.learningHours })}</span>
          </div>
        </div>
      </div>

      {/* Weekly Activity Bar Chart */}
      <div className="space-y-2">
        <h4 className="text-muted-foreground text-sm font-medium">{t('weeklyActivity')}</h4>
        <div className="flex h-32 items-end justify-between gap-2">
          {weeklyData.map((day, index) => (
            <div key={day.day} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex w-full flex-col items-center">
                <span className="text-muted-foreground mb-1 text-xs">
                  {t('hoursShort', { hours: day.hours })}
                </span>
                <div
                  className="gradient-primary w-full rounded-t transition-all duration-500"
                  style={{
                    height: `${(day.hours / maxHours) * 80}px`,
                    animationDelay: `${index * 100}ms`,
                  }}
                />
              </div>
              <span className="text-muted-foreground text-xs">{day.day}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 gap-4 border-t pt-4">
        <div>
          <p className="text-muted-foreground text-xs">{t('averageDuration')}</p>
          <p className="text-lg font-semibold">
            {t('hoursPerDay', {
              hours: (weeklyData.reduce((acc, d) => acc + d.hours, 0) / 7).toFixed(1),
            })}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">{t('bestDay')}</p>
          <p className="text-lg font-semibold">
            {weeklyData.reduce((max, d) => (d.hours > max.hours ? d : max)).day}
          </p>
        </div>
      </div>
    </div>
  )
})

export default ChartComponent
