'use client'

import { memo, useMemo } from 'react'
import type { UserProfile } from '../page'

interface ChartComponentProps {
  data: UserProfile
}

const ChartComponent = memo(function ChartComponent({ data }: ChartComponentProps) {
  // Calculate chart data
  const chartData = useMemo(() => {
    const total = (data.courses_enrolled || 0) + 10 // Add some baseline for visualization
    const completed = data.courses_completed || 0
    const inProgress = (data.courses_enrolled || 0) - completed
    const completionRate = (data.courses_enrolled || 0) > 0
      ? Math.round((completed / (data.courses_enrolled || 1)) * 100)
      : 0

    return {
      completed,
      inProgress,
      total,
      completionRate,
      learningHours: data.total_learning_hours || 0
    }
  }, [data])

  // Generate mock weekly progress data
  const weeklyData = useMemo(() => {
    return [
      { day: 'Пн', hours: 2 },
      { day: 'Вт', hours: 3 },
      { day: 'Ср', hours: 1.5 },
      { day: 'Чт', hours: 4 },
      { day: 'Пт', hours: 2.5 },
      { day: 'Сб', hours: 5 },
      { day: 'Вс', hours: 3 }
    ]
  }, [])

  const maxHours = Math.max(...weeklyData.map(d => d.hours))

  return (
    <div className="space-y-6">
      {/* Progress Circle Chart */}
      <div className="flex items-center justify-between">
        <div className="relative">
          <svg className="w-32 h-32 transform -rotate-90">
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
              <div className="text-xs text-muted-foreground">Завершено</div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-purple-500" />
            <span className="text-sm">Завершено: {chartData.completed}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-pink-500" />
            <span className="text-sm">В процессе: {chartData.inProgress}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-gray-300 dark:bg-gray-600" />
            <span className="text-sm">Всего часов: {chartData.learningHours}</span>
          </div>
        </div>
      </div>

      {/* Weekly Activity Bar Chart */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-muted-foreground">Активность за неделю</h4>
        <div className="h-32 flex items-end justify-between gap-2">
          {weeklyData.map((day, index) => (
            <div key={day.day} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex flex-col items-center">
                <span className="text-xs text-muted-foreground mb-1">
                  {day.hours}ч
                </span>
                <div
                  className="w-full gradient-primary rounded-t transition-all duration-500"
                  style={{
                    height: `${(day.hours / maxHours) * 80}px`,
                    animationDelay: `${index * 100}ms`
                  }}
                />
              </div>
              <span className="text-xs text-muted-foreground">{day.day}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 gap-4 pt-4 border-t">
        <div>
          <p className="text-xs text-muted-foreground">Средняя продолжительность</p>
          <p className="text-lg font-semibold">
            {(weeklyData.reduce((acc, d) => acc + d.hours, 0) / 7).toFixed(1)} ч/день
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Лучший день</p>
          <p className="text-lg font-semibold">
            {weeklyData.reduce((max, d) => d.hours > max.hours ? d : max).day}
          </p>
        </div>
      </div>
    </div>
  )
})

export default ChartComponent