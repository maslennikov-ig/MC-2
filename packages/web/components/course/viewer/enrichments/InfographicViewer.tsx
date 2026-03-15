'use client'

import React, { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { ZoomIn, ZoomOut, RotateCcw, X, Maximize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog'
import type { InfographicEnrichmentContent } from '@megacampus/shared-types'
import { cn } from '@/lib/utils'

interface InfographicViewerProps {
  content: InfographicEnrichmentContent
}

const ZOOM_STEP = 0.25
const ZOOM_MIN = 0.5
const ZOOM_MAX = 3

/**
 * InfographicViewer
 *
 * Displays a NotebookLM-generated infographic image with:
 * - Thumbnail preview in card context
 * - Click to open full-screen Dialog
 * - Zoom in/out/reset controls
 * - Double-click to toggle 1x/2x zoom
 * - Dark mode support
 */
export function InfographicViewer({ content }: InfographicViewerProps) {
  const t = useTranslations('enrichments')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [zoomLevel, setZoomLevel] = useState(1)

  const handleZoomIn = useCallback(() => {
    setZoomLevel((prev) => Math.min(prev + ZOOM_STEP, ZOOM_MAX))
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoomLevel((prev) => Math.max(prev - ZOOM_STEP, ZOOM_MIN))
  }, [])

  const handleZoomReset = useCallback(() => {
    setZoomLevel(1)
  }, [])

  const handleDoubleClick = useCallback(() => {
    setZoomLevel((prev) => (prev === 1 ? 2 : 1))
  }, [])

  const handleOpenDialog = useCallback(() => {
    setZoomLevel(1)
    setIsDialogOpen(true)
  }, [])

  return (
    <>
      {/* Thumbnail preview */}
      <div
        className={cn(
          'group relative cursor-pointer overflow-hidden rounded-lg border',
          'border-rose-200 bg-rose-50/50 dark:border-rose-800/30 dark:bg-rose-900/10'
        )}
        onClick={handleOpenDialog}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleOpenDialog()
          }
        }}
        aria-label={t('viewer.infographic.open')}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- user content with unknown dimensions */}
        <img
          src={content.imageUrl}
          alt={content.altText ?? t('viewer.infographic.defaultAlt')}
          className="h-auto max-h-48 w-full object-contain transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />
        {/* Hover overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors duration-200 group-hover:bg-black/20">
          <div className="flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-sm font-medium text-gray-800 opacity-0 shadow-md transition-opacity duration-200 group-hover:opacity-100 dark:bg-slate-800/90 dark:text-gray-200">
            <Maximize2 className="h-4 w-4" />
            {t('viewer.infographic.open')}
          </div>
        </div>
      </div>

      {/* Full-screen dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="flex max-h-[95vh] max-w-5xl flex-col overflow-hidden">
          <DialogHeader className="shrink-0 border-b pb-3">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-base">
                {content.altText ?? t('viewer.infographic.title')}
              </DialogTitle>
              <div className="flex items-center gap-1">
                {/* Zoom controls */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleZoomOut}
                  disabled={zoomLevel <= ZOOM_MIN}
                  aria-label={t('viewer.infographic.zoomOut')}
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-muted-foreground w-12 text-center text-xs">
                  {Math.round(zoomLevel * 100)}%
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleZoomIn}
                  disabled={zoomLevel >= ZOOM_MAX}
                  aria-label={t('viewer.infographic.zoomIn')}
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleZoomReset}
                  title={t('viewer.infographic.zoomReset')}
                  aria-label={t('viewer.infographic.zoomReset')}
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
                <DialogClose asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <X className="h-4 w-4" />
                    <span className="sr-only">{t('viewer.close')}</span>
                  </Button>
                </DialogClose>
              </div>
            </div>
          </DialogHeader>

          {/* Zoomable image area */}
          <div
            className="flex flex-1 items-start justify-center overflow-auto p-4"
            style={{ touchAction: 'none' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- user content with unknown dimensions */}
            <img
              src={content.imageUrl}
              alt={content.altText ?? t('viewer.infographic.defaultAlt')}
              style={{
                transform: `scale(${zoomLevel})`,
                transformOrigin: 'top center',
                transition: 'transform 0.2s ease',
                maxWidth: '100%',
                height: 'auto',
                cursor: zoomLevel < ZOOM_MAX ? 'zoom-in' : 'zoom-out',
              }}
              onDoubleClick={handleDoubleClick}
              draggable={false}
            />
          </div>

          {/* Dimensions hint */}
          {content.dimensions && (
            <div className="shrink-0 border-t px-4 py-2 text-center">
              <span className="text-muted-foreground text-xs">
                {content.dimensions.width} × {content.dimensions.height}px
              </span>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
