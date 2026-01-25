'use client'

import React, { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export interface DownstreamStagesInfo {
  hasStage5: boolean
  hasStage6: boolean
  stage6LessonsCount: number
}

export interface CascadeStageDeleteModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  downstreamInfo: DownstreamStagesInfo
  locale?: 'ru' | 'en'
  isDeleting?: boolean
  /** Source stage being edited (4 or 5). Affects description text. Default: 4 */
  sourceStage?: 4 | 5
}

const translations = {
  ru: {
    title: 'Каскадное удаление',
    warning: 'Внимание',
    descriptionStage4:
      'Редактирование Stage 4 требует удаления существующих данных downstream stages:',
    descriptionStage5: 'Редактирование Stage 5 требует удаления существующих данных Stage 6:',
    stage5: 'Stage 5 (структура курса)',
    stage6: 'Stage 6 (содержимое уроков)',
    lessonsCount: '{count} уроков будет удалено',
    confirmLabel: 'Я понимаю, что данные будут удалены безвозвратно',
    cancel: 'Отмена',
    confirm: 'Удалить и продолжить',
    deleting: 'Удаление...',
  },
  en: {
    title: 'Cascade Deletion',
    warning: 'Warning',
    descriptionStage4: 'Editing Stage 4 requires deleting existing downstream stages data:',
    descriptionStage5: 'Editing Stage 5 requires deleting existing Stage 6 data:',
    stage5: 'Stage 5 (course structure)',
    stage6: 'Stage 6 (lesson contents)',
    lessonsCount: '{count} lessons will be deleted',
    confirmLabel: 'I understand that data will be permanently deleted',
    cancel: 'Cancel',
    confirm: 'Delete and continue',
    deleting: 'Deleting...',
  },
}

export const CascadeStageDeleteModal: React.FC<CascadeStageDeleteModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  downstreamInfo,
  locale = 'ru',
  isDeleting = false,
  sourceStage = 4,
}) => {
  const [confirmed, setConfirmed] = useState(false)
  const t = translations[locale]
  const description = sourceStage === 5 ? t.descriptionStage5 : t.descriptionStage4

  const handleClose = () => {
    setConfirmed(false)
    onClose()
  }

  const handleConfirm = () => {
    if (confirmed) {
      onConfirm()
    }
  }

  // Reset confirmation when modal opens/closes
  React.useEffect(() => {
    if (!isOpen) {
      setConfirmed(false)
    }
  }, [isOpen])

  return (
    <AlertDialog open={isOpen} onOpenChange={handleClose}>
      <AlertDialogContent className="border-2 border-red-300 dark:border-red-700">
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20">
              <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-500" />
            </div>
            <div>
              <AlertDialogTitle className="text-lg font-semibold">
                {t.warning}: {t.title}
              </AlertDialogTitle>
            </div>
          </div>
        </AlertDialogHeader>

        <AlertDialogDescription asChild>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-slate-700 dark:text-slate-300">{description}</p>

            {/* List of stages to be deleted */}
            <ul className="space-y-2 pl-4">
              {downstreamInfo.hasStage5 && (
                <li className="flex items-center gap-2 text-sm text-slate-900 dark:text-slate-100">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                  {t.stage5}
                </li>
              )}
              {downstreamInfo.hasStage6 && (
                <li className="flex items-center gap-2 text-sm text-slate-900 dark:text-slate-100">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                  {t.stage6}
                  {downstreamInfo.stage6LessonsCount > 0 && (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      (
                      {t.lessonsCount.replace(
                        '{count}',
                        downstreamInfo.stage6LessonsCount.toString()
                      )}
                      )
                    </span>
                  )}
                </li>
              )}
            </ul>

            {/* Confirmation checkbox */}
            <div
              className={cn(
                'flex items-start space-x-3 rounded-md border-2 p-3 transition-colors',
                confirmed
                  ? 'border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/10'
                  : 'border-slate-200 dark:border-slate-700'
              )}
            >
              <Checkbox
                id="confirm-delete"
                checked={confirmed}
                onCheckedChange={(checked) => setConfirmed(checked === true)}
                disabled={isDeleting}
              />
              <Label
                htmlFor="confirm-delete"
                className={cn(
                  'cursor-pointer text-sm select-none',
                  confirmed
                    ? 'text-red-700 dark:text-red-400'
                    : 'text-slate-700 dark:text-slate-300'
                )}
              >
                {t.confirmLabel}
              </Label>
            </div>
          </div>
        </AlertDialogDescription>

        <AlertDialogFooter className="mt-6">
          <AlertDialogCancel onClick={handleClose} disabled={isDeleting}>
            {t.cancel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={!confirmed || isDeleting}
            className={cn(
              'bg-red-600 text-white hover:bg-red-700',
              'disabled:bg-slate-300 disabled:text-slate-500'
            )}
          >
            {isDeleting ? t.deleting : t.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
