'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RotateCcw, Loader2, AlertTriangle } from 'lucide-react';
import { useRestartStage } from '../hooks/useRestartStage';
import { useTranslation } from '@/lib/generation-graph/useTranslation';

interface RestartConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  courseSlug: string;
  stageNumber: number;
  stageName: string;
  onSuccess?: () => void;
}

/**
 * Confirmation dialog for restarting a pipeline stage.
 *
 * Shows a warning about data loss and requires explicit confirmation
 * before restarting from the specified stage.
 */
export const RestartConfirmDialog = ({
  open,
  onClose,
  courseSlug,
  stageNumber,
  stageName,
  onSuccess,
}: RestartConfirmDialogProps) => {
  const { restartStage, isRestarting, error } = useRestartStage(courseSlug);
  const { t } = useTranslation();

  const handleConfirm = async () => {
    const result = await restartStage(stageNumber);
    if (result.success) {
      onSuccess?.();
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-orange-500" />
            {t('restart.confirmTitle')}
          </DialogTitle>
          <DialogDescription className="pt-2">
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md mb-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-amber-800 text-sm">
                {t('restart.warningMessage')}
              </div>
            </div>
            <p className="text-slate-600">
              {t('restart.confirmDescription')
                .replace('{{stageName}}', stageName)
                .replace('{{stageNumber}}', String(stageNumber))}
            </p>
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="text-red-600 text-sm bg-red-50 p-3 rounded-md border border-red-200">
            {error.message}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isRestarting}
          >
            {t('restart.cancelButton')}
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isRestarting}
          >
            {isRestarting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('restart.restartingButton')}
              </>
            ) : (
              <>
                <RotateCcw className="w-4 h-4 mr-2" />
                {t('restart.restartButton')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
