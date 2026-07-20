'use client'

import { useTranslations } from 'next-intl'
import { FileWarning } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface DocumentConflictSectionProps {
  pendingRequiredCount: number
  readOnly?: boolean
  onReviewFirst: () => void
}

export function DocumentConflictSection({
  pendingRequiredCount,
  readOnly = false,
  onReviewFirst,
}: DocumentConflictSectionProps) {
  const t = useTranslations('generation.clarifying.documentEvidence')

  return (
    <section
      role="region"
      aria-labelledby="document-conflict-section-title"
      className="rounded-xl border border-orange-300 bg-orange-50/65 p-4 dark:border-orange-900 dark:bg-orange-950/20"
    >
      <div className="flex items-start gap-3">
        <FileWarning className="mt-0.5 h-5 w-5 shrink-0 text-orange-700 dark:text-orange-300" />
        <div className="min-w-0">
          <h2
            id="document-conflict-section-title"
            className="font-semibold text-orange-950 dark:text-orange-100"
          >
            {t('sectionTitle')}
          </h2>
          <p className="mt-1 text-sm text-orange-900/80 dark:text-orange-200/80">
            {t('sectionDescription')}
          </p>
        </div>
      </div>
      {pendingRequiredCount > 0 && !readOnly && (
        <div
          role="alert"
          className="mt-3 flex flex-col gap-3 rounded-lg border border-orange-300 bg-white/75 p-3 sm:flex-row sm:items-center sm:justify-between dark:border-orange-800 dark:bg-slate-950/35"
        >
          <p
            data-testid="pending-conflict-summary"
            className="text-sm font-medium text-slate-900 dark:text-slate-100"
          >
            {t('pendingSummary', { count: pendingRequiredCount })}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={onReviewFirst}>
            {t('reviewFirst')}
          </Button>
        </div>
      )}
    </section>
  )
}
