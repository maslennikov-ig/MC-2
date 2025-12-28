'use client';

import React from 'react';
import { useLocale } from 'next-intl';
import { Check, RotateCcw, Pencil, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface DraftReviewActionsProps {
  isEditing: boolean;
  isApproving: boolean;
  hasEdits: boolean;
  onApprove: () => void;
  onRegenerate: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  className?: string;
}

/**
 * Action buttons for two-stage draft review flow
 *
 * Provides Approve, Regenerate, and Edit actions based on current state.
 * Shows different actions when in edit mode vs view mode.
 *
 * @example
 * ```tsx
 * <DraftReviewActions
 *   isEditing={review.isEditing}
 *   isApproving={approval.isApproving}
 *   hasEdits={review.hasEdits}
 *   onApprove={handleApprove}
 *   onRegenerate={handleRegenerate}
 *   onStartEdit={review.startEditing}
 *   onCancelEdit={review.cancelEditing}
 *   onSaveEdit={handleSaveEdit}
 * />
 * ```
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
  const locale = useLocale();

  const approveLabel = locale === 'ru' ? 'Одобрить' : 'Approve';
  const regenerateLabel = locale === 'ru' ? 'Переделать' : 'Regenerate';
  const editLabel = locale === 'ru' ? 'Редактировать' : 'Edit';
  const cancelLabel = locale === 'ru' ? 'Отмена' : 'Cancel';
  const saveLabel = locale === 'ru' ? 'Сохранить' : 'Save';
  const approvingLabel = locale === 'ru' ? 'Одобрение...' : 'Approving...';

  // Edit mode actions
  if (isEditing) {
    return (
      <div className={cn('flex gap-2', className)}>
        <Button variant="outline" onClick={onCancelEdit} className="flex-1">
          {cancelLabel}
        </Button>
        <Button onClick={onSaveEdit} disabled={!hasEdits} className="flex-1">
          <Check className="w-4 h-4 mr-2" />
          {saveLabel}
        </Button>
      </div>
    );
  }

  // View mode actions
  return (
    <div className={cn('flex gap-2', className)}>
      <Button variant="outline" onClick={onStartEdit}>
        <Pencil className="w-4 h-4 mr-2" />
        {editLabel}
      </Button>
      <Button variant="outline" onClick={onRegenerate}>
        <RotateCcw className="w-4 h-4 mr-2" />
        {regenerateLabel}
      </Button>
      <Button onClick={onApprove} disabled={isApproving} className="flex-1">
        {isApproving ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            {approvingLabel}
          </>
        ) : (
          <>
            <Check className="w-4 h-4 mr-2" />
            {approveLabel}
          </>
        )}
      </Button>
    </div>
  );
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
  status: 'draft_ready' | 'completed' | 'failed';
  onApprove?: () => void;
  onRegenerate?: () => void;
  isApproving?: boolean;
  className?: string;
}) {
  const locale = useLocale();

  const approveLabel = locale === 'ru' ? 'Одобрить' : 'Approve';
  const regenerateLabel = locale === 'ru' ? 'Переделать' : 'Regenerate';

  return (
    <div className={cn('flex gap-2 p-4 border-t bg-white dark:bg-slate-950', className)}>
      {status === 'draft_ready' && onApprove && (
        <Button onClick={onApprove} disabled={isApproving} className="flex-1">
          {isApproving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Check className="w-4 h-4 mr-2" />
          )}
          {approveLabel}
        </Button>
      )}

      {(status === 'completed' || status === 'failed') && onRegenerate && (
        <Button variant="outline" onClick={onRegenerate}>
          <RotateCcw className="w-4 h-4 mr-2" />
          {regenerateLabel}
        </Button>
      )}
    </div>
  );
}
