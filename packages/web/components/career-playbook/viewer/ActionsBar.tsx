'use client'

import { BookOpen, Download, Share2, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'

export interface ActionsBarCopy {
  pdf?: string
  share?: string
  createCourse?: string
  delete?: string
}

interface ActionsBarProps {
  actionMessage?: string | null
  copy?: ActionsBarCopy
  onPdf: () => void
  onShare: () => void
  onCreateCourse: () => void
  onDelete: () => void
}

const defaultCopy: Required<ActionsBarCopy> = {
  pdf: 'PDF',
  share: 'Share',
  createCourse: 'Create course',
  delete: 'Delete',
}

export function ActionsBar({
  actionMessage,
  copy,
  onPdf,
  onShare,
  onCreateCourse,
  onDelete,
}: ActionsBarProps) {
  const labels = { ...defaultCopy, ...copy }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2" aria-label="Career Playbook actions">
        <Button type="button" variant="outline" size="sm" onClick={onPdf}>
          <Download className="mr-2 h-4 w-4" aria-hidden />
          {labels.pdf}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onShare}>
          <Share2 className="mr-2 h-4 w-4" aria-hidden />
          {labels.share}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCreateCourse}>
          <BookOpen className="mr-2 h-4 w-4" aria-hidden />
          {labels.createCourse}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onDelete}
          className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
        >
          <Trash2 className="mr-2 h-4 w-4" aria-hidden />
          {labels.delete}
        </Button>
      </div>

      {actionMessage ? (
        <p role="status" className="min-h-5 text-xs leading-5 text-slate-600 dark:text-slate-300">
          {actionMessage}
        </p>
      ) : null}
    </div>
  )
}
