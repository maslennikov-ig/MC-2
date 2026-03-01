'use client'

import React, { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import dynamic from 'next/dynamic'
import { Network, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog'
import type { MindMapEnrichmentContent } from '@megacampus/shared-types'
import { toMarkmapNode } from '@/lib/helpers/mindmap-transform'

const MarkmapRenderer = dynamic(() => import('./MarkmapRenderer'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[280px] items-center justify-center">
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
 * - Inline markmap preview (280px)
 * - Full interactive markmap in Dialog (zoom, pan, fold/unfold)
 * - Dark mode support
 */
export function MindMapViewer({ content }: MindMapViewerProps) {
  const t = useTranslations('enrichments')
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const markmapData = useMemo(() => toMarkmapNode(content.root), [content.root])

  return (
    <>
      {/* Inline markmap preview */}
      <div className="overflow-hidden rounded-lg border border-sky-200 bg-sky-50/50 dark:border-sky-800/30 dark:bg-sky-900/10">
        <MarkmapRenderer data={markmapData} className="h-[280px]" />
      </div>

      {/* Footer: stats + view full button */}
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
          className="border-sky-300 text-sky-700 hover:bg-sky-50 dark:border-sky-700 dark:text-sky-300 dark:hover:bg-sky-900/30"
          onClick={() => setIsDialogOpen(true)}
        >
          {t('viewer.mindMap.viewFull')}
        </Button>
      </div>

      {/* Full-screen dialog with interactive markmap */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-6xl flex-col overflow-hidden">
          <DialogHeader className="shrink-0 border-b pb-3">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <Network className="h-5 w-5 text-sky-500" />
                {t('viewer.mindMap.title')}
              </DialogTitle>
              <DialogClose asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <X className="h-4 w-4" />
                  <span className="sr-only">{t('viewer.close')}</span>
                </Button>
              </DialogClose>
            </div>
          </DialogHeader>

          <div className="relative h-[60vh] shrink-0">
            {isDialogOpen && (
              <MarkmapRenderer
                data={markmapData}
                fitToViewLabel={t('viewer.mindMap.fitToView')}
                className="h-full"
              />
            )}
          </div>

          <p className="text-muted-foreground shrink-0 border-t pt-2 text-center text-xs">
            {t('viewer.mindMap.interactionHint')}
          </p>
        </DialogContent>
      </Dialog>
    </>
  )
}
