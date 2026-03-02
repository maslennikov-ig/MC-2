'use client'

import React, { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import dynamic from 'next/dynamic'
import { Network, X, Maximize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { MindMapEnrichmentContent } from '@megacampus/shared-types'
import { toMarkmapNode } from '@/lib/helpers/mindmap-transform'
import { cn } from '@/lib/utils'

const MarkmapRenderer = dynamic(() => import('./MarkmapRenderer'), {
  ssr: false,
  loading: () => (
    <div className="flex aspect-video items-center justify-center">
      <div className="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
    </div>
  ),
})

interface MindMapViewerProps {
  content: MindMapEnrichmentContent
}

/**
 * MindMapViewer
 *
 * Renders a NotebookLM mind map with:
 * - Inline markmap preview (aspect-video)
 * - CSS-based fullscreen toggle (preserves fold/zoom state)
 * - Dark mode support
 */
export function MindMapViewer({ content }: MindMapViewerProps) {
  const t = useTranslations('enrichments')
  const [isFullscreen, setIsFullscreen] = useState(false)

  const markmapData = useMemo(() => toMarkmapNode(content.root), [content.root])

  return (
    <>
      {/* Backdrop overlay — only in fullscreen */}
      {isFullscreen && (
        <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setIsFullscreen(false)} />
      )}

      {/* Main container — switches between inline and fullscreen via CSS */}
      <div
        className={cn(isFullscreen && 'fixed inset-0 z-50 flex flex-col bg-white dark:bg-gray-900')}
      >
        {/* Fullscreen header */}
        {isFullscreen && (
          <div className="flex shrink-0 items-center justify-between border-b px-4 py-2">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Network className="h-4 w-4 text-sky-500" />
              {t('viewer.mindMap.title')}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setIsFullscreen(false)}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">{t('viewer.close')}</span>
            </Button>
          </div>
        )}

        {/* Markmap — ONE instance, always mounted, container changes */}
        <div
          className={cn(
            isFullscreen
              ? 'min-h-0 flex-1'
              : 'overflow-hidden rounded-lg border border-sky-200 bg-sky-50/50 dark:border-sky-800/30 dark:bg-sky-900/10'
          )}
        >
          <MarkmapRenderer
            data={markmapData}
            className={isFullscreen ? 'h-full' : 'aspect-video'}
            fitToViewLabel={t('viewer.mindMap.fitToView')}
          />
        </div>

        {/* Fullscreen footer hint */}
        {isFullscreen && (
          <p className="text-muted-foreground shrink-0 border-t px-4 py-1.5 text-center text-xs">
            {t('viewer.mindMap.interactionHint')}
          </p>
        )}
      </div>

      {/* Stats + fullscreen button — only when NOT fullscreen */}
      {!isFullscreen && (
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {content.total_nodes != null && (
              <Badge
                variant="outline"
                className="border-sky-300 text-sky-700 dark:border-sky-700 dark:text-sky-300"
              >
                <Network className="mr-1 h-3 w-3" />
                {t('viewer.mindMap.nodeCount', { count: content.total_nodes })}
              </Badge>
            )}
            {content.max_depth != null && (
              <Badge
                variant="outline"
                className="border-sky-200 text-sky-600 dark:border-sky-800 dark:text-sky-400"
              >
                {t('viewer.mindMap.depth', { depth: content.max_depth })}
              </Badge>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 border-sky-300 text-sky-700 hover:bg-sky-50 dark:border-sky-700 dark:text-sky-300 dark:hover:bg-sky-900/30"
            onClick={() => setIsFullscreen(true)}
          >
            <Maximize2 className="h-3.5 w-3.5" />
            {t('viewer.mindMap.viewFull')}
          </Button>
        </div>
      )}
    </>
  )
}
