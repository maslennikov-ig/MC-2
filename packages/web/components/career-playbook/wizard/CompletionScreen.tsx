'use client'

import Link from 'next/link'
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Info,
  Loader2,
  Pencil,
} from 'lucide-react'
import type { CareerPlaybookPlaybookStatus } from '@megacampus/shared-types'

import { CareerPlaybookDocumentShell } from '@/components/career-playbook/layout/document-workspace'
import { Button } from '@/components/ui/button'

export interface CompletionScreenCopy {
  title?: string
  description?: string
  fixedTitle?: string
  followupsTitle?: string
  freeformTitle?: string
  skipped?: string
  edit?: string
  generate?: string
  generationHandoffTitle?: string
  generationHandoffDescription?: string
  generationInProgressTitle?: string
  generationInProgressDescription?: string
  generationCompletedTitle?: string
  generationCompletedDescription?: string
  generationFailedTitle?: string
  generationFailedDescription?: string
  generationStarting?: string
  generationErrorTitle?: string
  viewGenerated?: string
  empty?: string
  reviewPanelTitle?: string
  documentPreviewLabel?: string
}

interface CompletionScreenProps {
  fixedAnswers: CompletionSummaryAnswer[]
  followupAnswers: CompletionSummaryAnswer[]
  freeformNotes: string[]
  onEditFixedAnswer: (questionKey: string) => void
  onEditFollowupAnswer: (questionId: string) => void
  onGenerate: () => void
  generationHandoffVisible?: boolean
  generationStatus?: CareerPlaybookPlaybookStatus
  generationProgress?: number | null
  generationError?: string | null
  isGenerationStarting?: boolean
  isEditingDisabled?: boolean
  viewGeneratedHref?: string
  copy?: CompletionScreenCopy
}

export interface CompletionSummaryAnswer {
  id: string
  title: string
  value: string
  skipped?: boolean
}

const defaultCopy: Required<CompletionScreenCopy> = {
  title: 'Готовы создать?',
  description: 'Проверьте собранный контекст перед генерацией должностной инструкции.',
  fixedTitle: 'Фиксированные ответы',
  followupsTitle: 'Уточнения',
  freeformTitle: 'Свободные заметки',
  skipped: 'Пропущено',
  edit: 'Редактировать',
  generate: 'Сгенерировать должностную инструкцию',
  generationHandoffTitle: 'Черновик готов к генерации',
  generationHandoffDescription:
    'Контекст сохранён. Генерация продолжится после подключения серверного обработчика.',
  generationInProgressTitle: 'Генерация выполняется',
  generationInProgressDescription: 'Должностная инструкция собирается из сохранённого контекста.',
  generationCompletedTitle: 'Генерация завершена',
  generationCompletedDescription: 'Должностная инструкция готова.',
  generationFailedTitle: 'Генерация не завершилась',
  generationFailedDescription: 'Проверьте собранный контекст и попробуйте снова.',
  generationStarting: 'Запускаем генерацию...',
  generationErrorTitle: 'Не удалось запустить генерацию',
  viewGenerated: 'Открыть должностную инструкцию',
  empty: 'Пока нет данных',
  reviewPanelTitle: 'Проверка',
  documentPreviewLabel: 'Черновик инструкции',
}

export function CompletionScreen({
  fixedAnswers,
  followupAnswers,
  freeformNotes,
  onEditFixedAnswer,
  onEditFollowupAnswer,
  onGenerate,
  generationHandoffVisible = false,
  generationStatus,
  generationProgress = null,
  generationError = null,
  isGenerationStarting = false,
  isEditingDisabled = false,
  viewGeneratedHref,
  copy,
}: CompletionScreenProps) {
  const labels = { ...defaultCopy, ...copy }
  const isGenerating = generationStatus === 'generating'
  const isCompleted = generationStatus === 'completed'
  const isFailed = generationStatus === 'failed'
  const shouldShowStatus = !isFailed && (generationHandoffVisible || isGenerating || isCompleted)
  const generationStatusTitle = isCompleted
    ? labels.generationCompletedTitle
    : isGenerating
      ? labels.generationInProgressTitle
      : labels.generationHandoffTitle
  const generationStatusDescription = isCompleted
    ? labels.generationCompletedDescription
    : isGenerating
      ? labels.generationInProgressDescription
      : labels.generationHandoffDescription
  const generationStatusProgress =
    typeof generationProgress === 'number' ? `${Math.round(generationProgress)}%` : null
  const visibleGenerationError =
    generationError ?? (isFailed ? labels.generationFailedDescription : null)
  const generationErrorTitle = isFailed ? labels.generationFailedTitle : labels.generationErrorTitle

  return (
    <CareerPlaybookDocumentShell
      testId="career-playbook-review-shell"
      navigation={
        <aside className="career-playbook-panel p-4">
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
            {labels.reviewPanelTitle}
          </p>
          <div className="mt-4 grid gap-3">
            <ReviewMetric label={labels.fixedTitle} value={fixedAnswers.length} />
            <ReviewMetric label={labels.followupsTitle} value={followupAnswers.length} />
            <ReviewMetric label={labels.freeformTitle} value={freeformNotes.length} />
          </div>
        </aside>
      }
      document={
        <article
          data-testid="career-playbook-document-preview"
          className="career-playbook-document min-h-[34rem] px-5 py-6 md:px-8 md:py-8"
        >
          <header className="career-playbook-document-rule space-y-5 border-b pb-5">
            <span className="career-playbook-pill inline-flex items-center gap-2 px-3 py-1.5 text-[13px] leading-5 font-medium text-slate-600 dark:text-slate-300">
              <FileText className="h-4 w-4 text-purple-600 dark:text-purple-300" aria-hidden />
              {labels.documentPreviewLabel}
            </span>
            <div className="flex items-start gap-3">
              <CheckCircle2
                className="mt-1 h-5 w-5 text-emerald-600 dark:text-emerald-400"
                aria-hidden
              />
              <div className="min-w-0 space-y-2">
                <h2 className="text-[28px] leading-9 font-semibold text-slate-950 dark:text-slate-50">
                  {labels.title}
                </h2>
                <p className="text-[15px] leading-7 text-slate-600 dark:text-slate-300">
                  {labels.description}
                </p>
              </div>
            </div>
          </header>

          <div className="mt-6 space-y-6">
            <SummarySection title={labels.fixedTitle} empty={labels.empty}>
              {fixedAnswers.map((answer) => (
                <SummaryRow
                  key={answer.id}
                  title={answer.title}
                  value={answer.value}
                  editLabel={`${labels.edit} ${answer.title}`}
                  onEdit={() => onEditFixedAnswer(answer.id)}
                  isEditDisabled={isEditingDisabled}
                />
              ))}
            </SummarySection>

            <SummarySection title={labels.followupsTitle} empty={labels.empty}>
              {followupAnswers.map((answer) => (
                <SummaryRow
                  key={answer.id}
                  title={answer.title}
                  value={answer.skipped ? labels.skipped : answer.value}
                  editLabel={`${labels.edit} ${answer.title}`}
                  onEdit={() => onEditFollowupAnswer(answer.id)}
                  isEditDisabled={isEditingDisabled}
                />
              ))}
            </SummarySection>

            <SummarySection title={labels.freeformTitle} empty={labels.empty}>
              {freeformNotes.map((note, index) => (
                <div
                  key={`${note}-${index}`}
                  className="career-playbook-muted-card p-3 text-sm leading-6 break-words whitespace-pre-wrap text-slate-800 dark:text-slate-100"
                >
                  {note}
                </div>
              ))}
            </SummarySection>
          </div>
        </article>
      }
      panel={
        <aside className="career-playbook-panel p-4">
          <div className="space-y-3">
            {shouldShowStatus ? (
              <div
                role="status"
                className="flex gap-2 rounded-md border border-purple-200 bg-purple-50/80 p-3 text-sm text-purple-950 dark:border-purple-900 dark:bg-purple-950/30 dark:text-purple-100"
              >
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <div className="space-y-1">
                  <p className="font-semibold">
                    {generationStatusTitle}
                    {generationStatusProgress ? (
                      <span className="ml-2 font-medium">{generationStatusProgress}</span>
                    ) : null}
                  </p>
                  <p className="leading-6">{generationStatusDescription}</p>
                </div>
              </div>
            ) : null}
            {visibleGenerationError ? (
              <div
                role="alert"
                className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <div className="space-y-1">
                  <p className="font-semibold">{generationErrorTitle}</p>
                  <p className="leading-6">{visibleGenerationError}</p>
                </div>
              </div>
            ) : null}

            <Button
              type="button"
              onClick={onGenerate}
              disabled={isGenerationStarting || isGenerating || isCompleted}
              className="w-full"
            >
              {isGenerationStarting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <ClipboardCheck className="mr-2 h-4 w-4" aria-hidden />
              )}
              {isGenerationStarting ? labels.generationStarting : labels.generate}
            </Button>
            {isCompleted && viewGeneratedHref ? (
              <Button asChild variant="secondary" className="w-full">
                <Link href={viewGeneratedHref}>
                  <BookOpen className="mr-2 h-4 w-4" aria-hidden />
                  {labels.viewGenerated}
                </Link>
              </Button>
            ) : null}
          </div>
        </aside>
      }
    />
  )
}

function ReviewMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="career-playbook-muted-card flex items-center justify-between gap-3 px-3 py-2">
      <span className="text-sm text-slate-600 dark:text-slate-300">{label}</span>
      <span className="text-sm font-semibold text-slate-950 tabular-nums dark:text-slate-50">
        {value}
      </span>
    </div>
  )
}

function SummarySection({
  title,
  empty,
  children,
}: {
  title: string
  empty: string
  children: React.ReactNode[]
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      {children.length > 0 ? (
        <div className="grid gap-3">{children}</div>
      ) : (
        <p className="career-playbook-muted-card p-3 text-sm text-slate-500 dark:text-slate-400">
          {empty}
        </p>
      )}
    </section>
  )
}

function SummaryRow({
  title,
  value,
  editLabel,
  isEditDisabled,
  onEdit,
}: {
  title: string
  value: string
  editLabel: string
  isEditDisabled?: boolean
  onEdit: () => void
}) {
  return (
    <div className="career-playbook-muted-card grid gap-3 p-3 sm:grid-cols-[1fr_auto] sm:items-start">
      <div className="min-w-0 space-y-1">
        <p className="text-xs font-medium text-slate-500 uppercase dark:text-slate-400">{title}</p>
        <p className="text-sm leading-6 break-words whitespace-pre-wrap text-slate-900 dark:text-slate-100">
          {value}
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onEdit}
        aria-label={editLabel}
        disabled={isEditDisabled}
      >
        <Pencil className="h-4 w-4" aria-hidden />
      </Button>
    </div>
  )
}
