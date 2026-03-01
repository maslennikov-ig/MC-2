'use client'

import React, { useState } from 'react'
import { useTranslations } from 'next-intl'
import { AlertCircle, X } from 'lucide-react'
import { toast } from 'sonner'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useEnrichmentInspectorStore } from '../../../stores/enrichment-inspector-store'
import type { CreateEnrichmentType } from '../../../stores/enrichment-inspector-store'
import { useStaticGraph } from '../../../contexts/StaticGraphContext'
import { createEnrichment } from '@/app/actions/enrichment-actions'
import { cn } from '@/lib/utils'
import { getErrorMessage } from '@/lib/utils/sanitize-error'
import { DiscardChangesDialog, useDiscardDialog } from '../components/DiscardChangesDialog'
import { DynamicEnrichmentForm } from '../forms/DynamicEnrichmentForm'
import type { CreateableEnrichmentType } from '../forms/enrichment-form-config'

export interface CreateViewProps {
  type: CreateEnrichmentType
  lessonId: string
  className?: string
}

export function CreateView({ type, lessonId, className }: CreateViewProps) {
  const t = useTranslations('enrichments')
  const { goBack, setDirty, dirty: isDirty } = useEnrichmentInspectorStore()
  const { courseInfo } = useStaticGraph()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    showDialog,
    handleNavigation,
    handleConfirm,
    handleCancel: handleDialogCancel,
  } = useDiscardDialog(isDirty, () => setDirty(false))

  const handleSubmit = async (settings: Record<string, unknown>) => {
    if (!courseInfo?.id) {
      setError(t('errors.generationFailed'))
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const result = await createEnrichment({
        lessonId,
        courseId: courseInfo.id,
        enrichmentType: type as CreateableEnrichmentType,
        settings,
      })

      if (result.success) {
        toast.success(t('inspector.createSuccess'))
        goBack()
      } else {
        setError(result.error ?? t('errors.generationFailed'))
      }
    } catch (err) {
      console.error('Failed to create enrichment:', err)
      setError(getErrorMessage(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancel = () => {
    handleNavigation(goBack)
  }

  const dismissError = () => setError(null)

  return (
    <>
      <ScrollArea className={cn('h-full flex-1', className)} data-testid="create-view">
        <div className="space-y-4 p-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>{t('errors.generationFailed')}</AlertTitle>
              <AlertDescription className="flex items-start justify-between gap-2">
                <span>{error}</span>
                <button
                  onClick={dismissError}
                  className="text-destructive-foreground/70 hover:text-destructive-foreground shrink-0"
                >
                  <X className="h-4 w-4" />
                </button>
              </AlertDescription>
            </Alert>
          )}

          <DynamicEnrichmentForm
            type={type as CreateableEnrichmentType}
            onSubmit={(settings) => void handleSubmit(settings)}
            onCancel={handleCancel}
            onDirtyChange={setDirty}
            isSubmitting={isSubmitting}
          />
        </div>
      </ScrollArea>

      <DiscardChangesDialog
        open={showDialog}
        onOpenChange={(open) => !open && handleDialogCancel()}
        onConfirm={handleConfirm}
        onCancel={handleDialogCancel}
      />
    </>
  )
}
