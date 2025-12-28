'use client';

import React from 'react';
import { useLocale } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
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

export interface DiscardChangesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmation dialog for discarding unsaved changes
 *
 * Used when navigating away from a dirty form (create or edit).
 * Warns user about losing unsaved work.
 *
 * @example
 * ```tsx
 * <DiscardChangesDialog
 *   open={showDiscard}
 *   onOpenChange={setShowDiscard}
 *   onConfirm={() => { setShowDiscard(false); goBack(); }}
 *   onCancel={() => setShowDiscard(false)}
 * />
 * ```
 */
export function DiscardChangesDialog({
  open,
  onOpenChange,
  onConfirm,
  onCancel,
}: DiscardChangesDialogProps) {
  const locale = useLocale();

  const title = locale === 'ru' ? 'Отменить изменения?' : 'Discard Changes?';
  const description =
    locale === 'ru'
      ? 'У вас есть несохраненные изменения. Вы уверены, что хотите покинуть эту страницу? Все изменения будут потеряны.'
      : 'You have unsaved changes. Are you sure you want to leave this page? All changes will be lost.';
  const cancelLabel = locale === 'ru' ? 'Остаться' : 'Stay';
  const confirmLabel = locale === 'ru' ? 'Отменить изменения' : 'Discard Changes';

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-amber-100 dark:bg-amber-900/30">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <AlertDialogTitle>{title}</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="pt-2">{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800"
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Hook to manage discard dialog state
 */
export function useDiscardDialog(isDirty: boolean, onDiscard: () => void) {
  const [showDialog, setShowDialog] = React.useState(false);
  const [pendingAction, setPendingAction] = React.useState<(() => void) | null>(null);

  const handleNavigation = React.useCallback(
    (action: () => void) => {
      if (isDirty) {
        setPendingAction(() => action);
        setShowDialog(true);
      } else {
        action();
      }
    },
    [isDirty]
  );

  const handleConfirm = React.useCallback(() => {
    setShowDialog(false);
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
    onDiscard();
  }, [pendingAction, onDiscard]);

  const handleCancel = React.useCallback(() => {
    setShowDialog(false);
    setPendingAction(null);
  }, []);

  return {
    showDialog,
    setShowDialog,
    handleNavigation,
    handleConfirm,
    handleCancel,
  };
}
