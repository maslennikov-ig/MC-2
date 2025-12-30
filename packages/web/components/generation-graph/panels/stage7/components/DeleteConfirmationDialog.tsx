'use client';

import React from 'react';
import { useLocale } from 'next-intl';
import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export interface DeleteConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting?: boolean;
}

/**
 * Confirmation dialog for deleting an enrichment/activity
 *
 * Warns user that this action cannot be undone before proceeding with deletion.
 * Shows loading state during async delete operation.
 *
 * @example
 * ```tsx
 * <DeleteConfirmationDialog
 *   open={showDeleteDialog}
 *   onOpenChange={setShowDeleteDialog}
 *   onConfirm={handleDelete}
 *   onCancel={() => setShowDeleteDialog(false)}
 *   isDeleting={isDeleting}
 * />
 * ```
 */
export function DeleteConfirmationDialog({
  open,
  onOpenChange,
  onConfirm,
  onCancel,
  isDeleting = false,
}: DeleteConfirmationDialogProps) {
  const locale = useLocale();

  const title = locale === 'ru' ? 'Удалить активность?' : 'Delete Activity?';
  const description =
    locale === 'ru'
      ? 'Это действие нельзя отменить. Активность будет безвозвратно удалена вместе со всеми связанными данными.'
      : 'This action cannot be undone. The activity will be permanently deleted along with all associated data.';
  const cancelLabel = locale === 'ru' ? 'Отмена' : 'Cancel';
  const confirmLabel = locale === 'ru' ? 'Удалить' : 'Delete';
  const deletingLabel = locale === 'ru' ? 'Удаление...' : 'Deleting...';

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-red-100 dark:bg-red-900/30">
              <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <AlertDialogTitle>{title}</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="pt-2">{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel} disabled={isDeleting}>
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isDeleting}
            className="bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800 disabled:opacity-50"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {deletingLabel}
              </>
            ) : (
              confirmLabel
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
