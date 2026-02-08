'use client'

import React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { RotateCcw, Loader2, AlertTriangle } from 'lucide-react'
import { useRestartStage } from '../hooks/useRestartStage'
import { useTranslations } from 'next-intl'

interface RestartConfirmDialogProps {
  open: boolean
  onClose: () => void
  orgSlug: string
  courseSlug: string
  stageNumber: number
  stageName: string
  onSuccess?: () => void
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
  orgSlug,
  courseSlug,
  stageNumber,
  stageName,
  onSuccess,
}: RestartConfirmDialogProps) => {
  const { restartStage, isRestarting, error } = useRestartStage(orgSlug, courseSlug)
  const t = useTranslations('generation')

  const handleConfirm = async () => {
    const result = await restartStage(stageNumber)
    if (result.success) {
      onSuccess?.()
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[425px]" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-orange-500" />
            {t('restart.confirmTitle')}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="text-muted-foreground pt-2 text-sm">
              <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <span className="text-sm text-amber-800">{t('restart.warningMessage')}</span>
              </div>
              <p className="text-slate-600">
                {t('restart.confirmDescription', { stageName, stageNumber })}
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">
            {error.message}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={isRestarting} autoFocus>
            {t('restart.cancelButton')}
          </Button>
          <Button
            variant="destructive"
            onClick={() => void handleConfirm()}
            disabled={isRestarting}
          >
            {isRestarting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('restart.restartingButton')}
              </>
            ) : (
              <>
                <RotateCcw className="mr-2 h-4 w-4" />
                {t('restart.restartButton')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
