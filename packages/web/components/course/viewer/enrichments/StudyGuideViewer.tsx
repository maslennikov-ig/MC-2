'use client'

import React, { useState } from 'react'
import { useTranslations } from 'next-intl'
import { BookOpen, ChevronRight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog'
import { MarkdownRendererFull } from '@/components/markdown'
import type { StudyGuideEnrichmentContent } from '@megacampus/shared-types'
import { cn } from '@/lib/utils'

interface StudyGuideViewerProps {
  content: StudyGuideEnrichmentContent
}

/**
 * StudyGuideViewer
 *
 * Renders a NotebookLM study guide (Markdown) with:
 * - Scrollable preview (max-height) in card context
 * - Optional Table of Contents from content.sections
 * - "Read Full" button that opens a Dialog with full markdown
 * - Dark mode support
 */
export function StudyGuideViewer({ content }: StudyGuideViewerProps) {
  const t = useTranslations('enrichments')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [activeSectionIndex, setActiveSectionIndex] = useState<number | null>(null)

  const hasSections = content.sections && content.sections.length > 0

  return (
    <>
      {/* Table of Contents (if sections available) */}
      {hasSections && (
        <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800/30 dark:bg-emerald-900/20">
          <p className="mb-2 text-xs font-semibold tracking-wider text-emerald-700 uppercase dark:text-emerald-400">
            {t('viewer.studyGuide.tableOfContents')}
          </p>
          <ul className="space-y-1">
            {content.sections!.map((section, index) => (
              <li key={index}>
                <button
                  onClick={() => setActiveSectionIndex(activeSectionIndex === index ? null : index)}
                  className={cn(
                    'flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-sm transition-colors',
                    activeSectionIndex === index
                      ? 'bg-emerald-200 text-emerald-900 dark:bg-emerald-800/50 dark:text-emerald-100'
                      : 'text-emerald-700 hover:bg-emerald-100 dark:text-emerald-300 dark:hover:bg-emerald-800/30'
                  )}
                >
                  <ChevronRight
                    className={cn(
                      'h-3 w-3 shrink-0 transition-transform',
                      activeSectionIndex === index && 'rotate-90'
                    )}
                  />
                  <span className="line-clamp-1">{section.title}</span>
                </button>
                {activeSectionIndex === index && (
                  <div className="mt-1 ml-4 text-xs text-emerald-600 dark:text-emerald-400">
                    <MarkdownRendererFull content={section.content} preset="preview" />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Scrollable preview of markdown */}
      <div className="relative max-h-48 overflow-hidden">
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <MarkdownRendererFull content={content.markdown} preset="preview" />
        </div>
        {/* Fade-out gradient at bottom */}
        <div className="pointer-events-none absolute right-0 bottom-0 left-0 h-16 bg-gradient-to-t from-white to-transparent dark:from-slate-900" />
      </div>

      {/* Footer: word count + read full button */}
      <div className="mt-3 flex items-center justify-between">
        {content.word_count && (
          <Badge
            variant="outline"
            className="border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300"
          >
            <BookOpen className="mr-1 h-3 w-3" />
            {t('viewer.studyGuide.wordCount', { count: content.word_count })}
          </Badge>
        )}
        <Button
          size="sm"
          variant="outline"
          className="ml-auto border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-900/30"
          onClick={() => setIsDialogOpen(true)}
        >
          {t('viewer.studyGuide.readFull')}
        </Button>
      </div>

      {/* Full-screen dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col overflow-hidden">
          <DialogHeader className="shrink-0 border-b pb-3">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-emerald-500" />
                {t('viewer.studyGuide.title')}
              </DialogTitle>
              <DialogClose asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <X className="h-4 w-4" />
                  <span className="sr-only">{t('viewer.close')}</span>
                </Button>
              </DialogClose>
            </div>
            {content.word_count && (
              <p className="text-muted-foreground text-sm">
                {t('viewer.studyGuide.wordCount', { count: content.word_count })}
              </p>
            )}
          </DialogHeader>
          <div className="flex-1 overflow-y-auto py-4">
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <MarkdownRendererFull content={content.markdown} preset="lesson" />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
