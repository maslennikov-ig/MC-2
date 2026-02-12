'use client'

import { Rocket, WifiOff } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface CelestialHeaderProps {
  courseTitle: string
  overallProgress: number
  isConnected: boolean
  currentStage?: string | null
}

export function CelestialHeader({
  courseTitle,
  overallProgress,
  isConnected,
}: CelestialHeaderProps) {
  const t = useTranslations('generation.header')

  return (
    <div className="mx-auto mb-4 w-full max-w-4xl px-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-full bg-purple-500/20 p-1">
            <Rocket className="h-4 w-4 text-purple-500 dark:text-purple-400" />
          </div>
          <div>
            <h1 className="max-w-[300px] truncate text-base font-bold text-gray-900 sm:max-w-none dark:text-gray-100">
              {courseTitle}
            </h1>
            <div className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400">
              <span>{t('missionProgress')}</span>
              {!isConnected && (
                <span className="flex items-center gap-0.5 rounded bg-red-500/10 px-1 py-0.5 text-[10px] text-red-500">
                  <WifiOff className="h-2.5 w-2.5" /> {t('noConnection')}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold text-purple-600 dark:text-purple-400">
            {Math.round(overallProgress)}%
          </div>
        </div>
      </div>

      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
        <div
          className="absolute top-0 left-0 h-full bg-gradient-to-r from-purple-500 to-cyan-500 transition-all duration-500 ease-out"
          style={{ width: `${Math.round(overallProgress)}%` }}
        />
      </div>
    </div>
  )
}
