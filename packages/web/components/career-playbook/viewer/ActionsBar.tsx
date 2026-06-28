'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { BookOpen, Copy, Download, ExternalLink, Share2, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface ActionsBarCopy {
  actionsLabel?: string
  pdf?: string
  share?: string
  shareLinkLabel?: string
  shareCopyButton?: string
  createCourse?: string
  openCourse?: string
  delete?: string
}

interface ActionsBarProps {
  actionMessage?: string | null
  copy?: ActionsBarCopy
  onPdf: () => void
  onShare: () => void
  publicShareUrl?: string | null
  onCopyShareLink?: () => void
  onCreateCourse: () => void
  createCourseAction?: (trigger: ReactNode) => ReactNode
  canCreateCourse?: boolean
  openCourseHref?: string | null
  onDelete: () => void
}

const defaultCopy: Required<ActionsBarCopy> = {
  actionsLabel: 'Role Guide actions',
  pdf: 'PDF',
  share: 'Share',
  shareLinkLabel: 'Public link',
  shareCopyButton: 'Copy',
  createCourse: 'Create course',
  openCourse: 'Open course',
  delete: 'Delete',
}

export function ActionsBar({
  actionMessage,
  copy,
  onPdf,
  onShare,
  publicShareUrl,
  onCopyShareLink,
  onCreateCourse,
  createCourseAction,
  canCreateCourse = true,
  openCourseHref,
  onDelete,
}: ActionsBarProps) {
  const labels = { ...defaultCopy, ...copy }
  const createCourseButton =
    canCreateCourse && !openCourseHref ? (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={createCourseAction ? undefined : onCreateCourse}
        data-testid="career-playbook-create-course-trigger"
      >
        <BookOpen className="mr-2 h-4 w-4" aria-hidden />
        {labels.createCourse}
      </Button>
    ) : null
  const openCourseButton = openCourseHref ? (
    <Button asChild variant="outline" size="sm">
      <Link href={openCourseHref}>
        <ExternalLink className="mr-2 h-4 w-4" aria-hidden />
        {labels.openCourse}
      </Link>
    </Button>
  ) : null

  return (
    <div className="flex flex-col gap-2">
      <div
        className="career-playbook-panel flex flex-wrap items-center gap-2 p-2"
        aria-label={labels.actionsLabel}
      >
        <Button type="button" variant="outline" size="sm" onClick={onPdf}>
          <Download className="mr-2 h-4 w-4" aria-hidden />
          {labels.pdf}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onShare}>
          <Share2 className="mr-2 h-4 w-4" aria-hidden />
          {labels.share}
        </Button>
        {openCourseButton}
        {createCourseButton
          ? createCourseAction
            ? createCourseAction(createCourseButton)
            : createCourseButton
          : null}
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

      {publicShareUrl ? (
        <div className="career-playbook-muted-card grid gap-2 p-3">
          <Label htmlFor="career-playbook-public-share-url" className="text-xs font-medium">
            {labels.shareLinkLabel}
          </Label>
          <div className="flex min-w-0 gap-2">
            <Input
              id="career-playbook-public-share-url"
              value={publicShareUrl}
              readOnly
              className="min-w-0 flex-1 font-mono text-xs"
              onFocus={(event) => event.currentTarget.select()}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCopyShareLink}
              disabled={!onCopyShareLink}
            >
              <Copy className="mr-2 h-4 w-4" aria-hidden />
              {labels.shareCopyButton}
            </Button>
          </div>
        </div>
      ) : null}

      {actionMessage ? (
        <p role="status" className="min-h-5 text-xs leading-5 text-slate-600 dark:text-slate-300">
          {actionMessage}
        </p>
      ) : null}
    </div>
  )
}
