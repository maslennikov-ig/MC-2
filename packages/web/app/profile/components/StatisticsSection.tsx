'use client'

import { memo, lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { UserProfile } from '../page'

// Fallback component for when chart fails to load
const ChartFallback = memo(function ChartFallback() {
  return <div className="text-muted-foreground">Графики временно недоступны</div>
})

// Lazy load chart component only when needed
const ChartComponent = lazy(() =>
  import('./ChartComponent').catch(() => ({
    default: ChartFallback
  }))
)

interface StatisticsSectionProps {
  profile: UserProfile
}

// Individual stat card component
const StatCard = memo(function StatCard({
  value,
  label,
  delay = 0
}: {
  value: number
  label: string
  delay?: number
}) {
  const [isVisible, setIsVisible] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const currentRef = cardRef.current
    if (!currentRef) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(currentRef)

    return () => {
      observer.disconnect()
    }
  }, [])

  return (
    <Card
      ref={cardRef}
      className={`bg-muted rounded-lg p-4 shadow-sm hover:shadow-lg transition-shadow duration-300 group relative overflow-hidden ${
        isVisible ? 'animate-slideUp' : 'opacity-0'
      }`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="absolute inset-0 gradient-subtle opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      <div className="relative z-10">
        <div className="text-2xl font-bold text-foreground">
          {value}
        </div>
        <p className="text-sm text-muted-foreground mt-1">{label}</p>
      </div>
    </Card>
  )
})

const StatisticsSection = memo(function StatisticsSection({ profile }: StatisticsSectionProps) {
  const [showCharts, setShowCharts] = useState(false)
  const sectionRef = useRef<HTMLDivElement>(null)

  // Lazy load charts when section becomes visible
  useEffect(() => {
    const currentRef = sectionRef.current
    if (!currentRef) return

    let timeoutId: NodeJS.Timeout | undefined

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !showCharts) {
          // Delay chart loading for better perceived performance
          timeoutId = setTimeout(() => {
            setShowCharts(true)
          }, 500)
          observer.disconnect()
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(currentRef)

    return () => {
      observer.disconnect()
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [showCharts])

  // Performance mark for statistics section
  useEffect(() => {
    if (typeof window !== 'undefined' && 'performance' in window) {
      performance.mark('statistics-section-start')
      return () => {
        performance.mark('statistics-section-end')
        performance.measure(
          'statistics-section-render',
          'statistics-section-start',
          'statistics-section-end'
        )
      }
    }
    return undefined
  }, [])

  const stats = [
    { value: profile.courses_enrolled || 0, label: 'Курсов начато' },
    { value: profile.courses_completed || 0, label: 'Курсов завершено' },
    { value: profile.total_learning_hours || 0, label: 'Часов обучения' }
  ]

  return (
    <div ref={sectionRef} className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <StatCard
            key={stat.label}
            value={stat.value}
            label={stat.label}
            delay={index * 100}
          />
        ))}
      </div>

      <Card className="bg-card border rounded-xl p-6 shadow-sm hover:shadow-lg transition-shadow duration-300" style={{ animationDelay: '300ms' }}>
        <h3 className="text-lg font-semibold mb-4 text-foreground">
          Прогресс обучения
        </h3>
        {showCharts ? (
          <Suspense
            fallback={
              <div className="space-y-4">
                <Skeleton className="h-48 w-full" />
                <div className="flex gap-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-20" />
                </div>
              </div>
            }
          >
            <ChartComponent data={profile} />
          </Suspense>
        ) : (
          <p className="text-muted-foreground">
            Статистика обучения будет доступна после прохождения первого курса.
          </p>
        )}
      </Card>
    </div>
  )
})

export default StatisticsSection