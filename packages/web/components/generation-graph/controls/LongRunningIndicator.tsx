import React, { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import { useGenerationRealtime } from '@/components/generation-monitoring/realtime-provider'
import { EmailNotificationRequest } from './EmailNotificationRequest'
import { useTranslations } from 'next-intl'
import { ACTIVE_STATUSES } from '@/lib/generation-graph/constants'
import type { Database } from '@megacampus/shared-types'

type GenerationStatus = Database['public']['Enums']['generation_status']

const LONG_RUNNING_THRESHOLD = 5 * 60 * 1000 // 5 minutes

export const LongRunningIndicator = () => {
  const { status } = useGenerationRealtime()
  const [startTime] = useState(Date.now())
  const [isLongRunning, setIsLongRunning] = useState(false)
  const t = useTranslations('generation')

  useEffect(() => {
    if (!status || !ACTIVE_STATUSES.includes(status as GenerationStatus)) return

    const interval = setInterval(() => {
      if (Date.now() - startTime > LONG_RUNNING_THRESHOLD) {
        setIsLongRunning(true)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [status, startTime])

  if (!isLongRunning) return null

  return (
    <div className="animate-in slide-in-from-top-2 absolute top-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-orange-200 bg-orange-50 px-3 py-2 text-orange-800 shadow-md">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 animate-pulse" />
        <span className="text-sm font-medium">{t('longRunning.message')}</span>
      </div>
      <div className="h-4 w-px bg-orange-200" />
      <div className="origin-left scale-90">
        <EmailNotificationRequest />
      </div>
    </div>
  )
}
