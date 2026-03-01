'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import { Check, RotateCcw, Pencil, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface DraftReviewActionsProps {
  isEditing: boolean
  isApproving: boolean
  hasEdits: boolean
  onApprove: () => void
  onRegenerate: () => void
  onStartEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: () => void
  className?: string
}

/**
 * Action buttons for two-stage draft review flow
 *
 * Provides Approve, Regenerate, and Edit actions based on current state.
 * Shows different actions when in edit mode vs view mode.
 */
export function DraftReviewActions({
  isEditing,
  isApproving,
  hasEdits,
  onApprove,
  onRegenerate,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  className,
}: DraftReviewActionsProps) {
  const t = useTranslations('enrichments')

  // Edit mode actions
  if (isEditing) {
    return (
      <div className={cn('flex gap-2', className)}>
        <Button variant="outline" onClick={onCancelEdit} className="flex-1">
          {t('draft.cancel')}
        </Button>
        <Button onClick={onSaveEdit} disabled={!hasEdits} className="flex-1">
          <Check className="mr-2 h-4 w-4" />
          {t('draft.save')}
        </Button>
      </div>
    )
  }

  // View mode actions
  return (
    <div className={cn('flex gap-2', className)}>
      <Button variant="outline" onClick={onStartEdit}>
        <Pencil className="mr-2 h-4 w-4" />
        {t('draft.edit')}
      </Button>
      <Button variant="outline" onClick={onRegenerate}>
        <RotateCcw className="mr-2 h-4 w-4" />
        {t('draft.regenerate')}
      </Button>
      <Button onClick={onApprove} disabled={isApproving} className="flex-1">
        {isApproving ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t('draft.approving')}
          </>
        ) : (
          <>
            <Check className="mr-2 h-4 w-4" />
            {t('draft.approve')}
          </>
        )}
      </Button>
    </div>
  )
}

/**
 * Compact action bar for bottom of detail view
 */
export function DraftActionBar({
  status,
  onApprove,
  onRegenerate,
  isApproving,
  className,
}: {
  status: 'draft_ready' | 'completed' | 'failed'
  onApprove?: () => void
  onRegenerate?: () => void
  isApproving?: boolean
  className?: string
}) {
  const t = useTranslations('enrichments')

  return (
    <div className={cn('flex gap-2 border-t bg-white p-4 dark:bg-slate-950', className)}>
      {status === 'draft_ready' && onApprove && (
        <Button onClick={onApprove} disabled={isApproving} className="flex-1">
          {isApproving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Check className="mr-2 h-4 w-4" />
          )}
          {t('draft.approve')}
        </Button>
      )}

      {(status === 'completed' || status === 'failed') && onRegenerate && (
        <Button variant="outline" onClick={onRegenerate}>
          <RotateCcw className="mr-2 h-4 w-4" />
          {t('draft.regenerate')}
        </Button>
      )}
    </div>
  )
}
