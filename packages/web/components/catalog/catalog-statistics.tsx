'use client'

import type { LucideIcon } from 'lucide-react'
import { Sparkles } from 'lucide-react'

import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export type CatalogStatisticTone = 'purple' | 'green' | 'blue' | 'amber' | 'rose' | 'slate'

export interface CatalogStatisticItem {
  id: string
  label: string
  value: number | string
  icon: LucideIcon
  tone?: CatalogStatisticTone
}

interface CatalogStatisticsProps {
  title: string
  items: CatalogStatisticItem[]
  compact?: boolean
  titleIcon?: LucideIcon
  className?: string
}

const toneClasses: Record<CatalogStatisticTone, { text: string; bg: string }> = {
  purple: {
    text: 'text-purple-600 dark:text-purple-400',
    bg: 'bg-purple-100 dark:bg-purple-500/10',
  },
  green: {
    text: 'text-green-600 dark:text-green-400',
    bg: 'bg-green-100 dark:bg-green-500/10',
  },
  blue: {
    text: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-100 dark:bg-blue-500/10',
  },
  amber: {
    text: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-100 dark:bg-amber-500/10',
  },
  rose: {
    text: 'text-rose-600 dark:text-rose-400',
    bg: 'bg-rose-100 dark:bg-rose-500/10',
  },
  slate: {
    text: 'text-slate-600 dark:text-slate-400',
    bg: 'bg-slate-100 dark:bg-slate-500/10',
  },
}

export function CatalogStatistics({
  className,
  compact = false,
  items,
  title,
  titleIcon: TitleIcon = Sparkles,
}: CatalogStatisticsProps) {
  if (compact) {
    return (
      <div className={cn('mb-6 flex flex-wrap items-center gap-4 text-sm', className)}>
        {items.map((item, index) => {
          const tone = toneClasses[item.tone ?? 'slate']
          const Icon = item.icon

          return (
            <div key={item.id} className="flex items-center gap-4">
              {index > 0 ? <div className="h-4 w-px bg-gray-300 dark:bg-gray-700" /> : null}
              <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                <Icon className={cn('h-4 w-4', tone.text)} aria-hidden />
                <span className="font-medium">{item.value}</span>
                <span>{item.label}</span>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className={cn('mb-6', className)}>
      <div className="mb-3 flex items-center gap-2">
        <TitleIcon className="h-4 w-4 text-purple-600 dark:text-purple-400" aria-hidden />
        <span className="text-xs font-medium tracking-wider text-gray-600 uppercase dark:text-gray-400">
          {title}
        </span>
      </div>

      <div
        data-testid="catalog-statistics-grid"
        className="grid grid-cols-[repeat(auto-fit,minmax(12rem,16rem))] gap-3"
      >
        {items.map((item) => {
          const Icon = item.icon
          const tone = toneClasses[item.tone ?? 'slate']

          return (
            <Card
              key={item.id}
              className="border-gray-200/50 bg-white/50 backdrop-blur-sm transition-all duration-200 hover:bg-white/70 dark:border-slate-800/50 dark:bg-slate-900/30 dark:hover:bg-slate-900/50"
            >
              <div className="p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className={cn('rounded-lg p-1.5', tone.bg)}>
                    <Icon className={cn('h-3.5 w-3.5', tone.text)} aria-hidden />
                  </div>
                  <span className="text-xl font-bold text-gray-900 dark:text-white">
                    {item.value}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{item.label}</p>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
