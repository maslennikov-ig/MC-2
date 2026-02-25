'use client'

import { useMemo } from 'react'
import { useMessages } from 'next-intl'
import type { DefaultLayoutTranslations } from '@vidstack/react/player/layouts/default'

/**
 * Extract Vidstack player translations from next-intl messages.
 * Reads `enrichments.videoPlayer` key structure.
 */
export function useVidstackTranslations(): Partial<DefaultLayoutTranslations> | undefined {
  const messages = useMessages()
  return useMemo(() => {
    const raw = (messages as Record<string, unknown>)?.enrichments
    if (!raw || typeof raw !== 'object') return undefined
    const vp = (raw as Record<string, unknown>)?.videoPlayer
    if (!vp || typeof vp !== 'object') return undefined
    return vp as Partial<DefaultLayoutTranslations>
  }, [messages])
}
