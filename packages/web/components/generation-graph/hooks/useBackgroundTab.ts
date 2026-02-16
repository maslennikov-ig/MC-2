import { useEffect } from 'react'
import { useGenerationRealtime } from '@/components/generation-monitoring/realtime-provider'
import { ACTIVE_STATUSES } from '@/lib/generation-graph/constants'
import type { Database } from '@megacampus/shared-types'

type GenerationStatus = Database['public']['Enums']['generation_status']

export const useBackgroundTab = () => {
  const { status } = useGenerationRealtime()

  useEffect(() => {
    if (!status || !ACTIVE_STATUSES.includes(status as GenerationStatus)) return

    const handleVisibilityChange = () => {
      if (document.hidden) {
        document.title = 'Generating... | MegaCampus'
      } else {
        document.title = 'Course Generation | MegaCampus'
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      document.title = 'Course Generation | MegaCampus'
    }
  }, [status])
}
