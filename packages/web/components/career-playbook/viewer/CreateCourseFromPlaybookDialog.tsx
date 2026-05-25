'use client'

import { type ReactNode, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { AlertCircle, Loader2 } from 'lucide-react'

import { createCourseFromPlaybook } from '@/components/career-playbook/library/client-adapter'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

interface CreateCourseFromPlaybookDialogProps {
  playbookId: string
  trigger: ReactNode
}

export function CreateCourseFromPlaybookDialog({
  playbookId,
  trigger,
}: CreateCourseFromPlaybookDialogProps) {
  const router = useRouter()
  const t = useTranslations('career-playbook.library.createCourseDialog')
  const [open, setOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreateCourse = async () => {
    if (isSubmitting) return

    setIsSubmitting(true)
    setError(null)

    try {
      const result = await createCourseFromPlaybook({
        playbookId,
        includeWebResearch: true,
      })
      router.push(result.redirectUrl)
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : t('genericError'))
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (isSubmitting) return
        setOpen(nextOpen)
        if (!nextOpen) setError(null)
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="career-playbook-muted-card p-4 text-sm text-slate-700 dark:text-slate-300">
          {t('addMaterialsLater')}
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" aria-hidden />
            <AlertTitle>{t('errorTitle')}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <DialogFooter className="gap-2 sm:space-x-0">
          <Button
            type="button"
            className="rounded-md"
            onClick={() => {
              void handleCreateCourse()
            }}
            disabled={isSubmitting}
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {isSubmitting ? t('loading') : t('startWithoutMaterials')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
