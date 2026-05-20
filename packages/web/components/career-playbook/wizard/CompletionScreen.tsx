'use client'

import Link from 'next/link'
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  Info,
  Loader2,
  Pencil,
  WandSparkles,
} from 'lucide-react'
import type { CareerPlaybookPlaybookStatus } from '@megacampus/shared-types'

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
  description: 'Проверьте собранный контекст перед генерацией Role Guide.',
  fixedTitle: 'Фиксированные ответы',
  followupsTitle: 'Уточнения',
  freeformTitle: 'Свободные заметки',
  skipped: 'Пропущено',
  edit: 'Редактировать',
  generate: 'Сгенерировать Role Guide',
  generationHandoffTitle: 'Черновик готов к генерации',
  generationHandoffDescription:
    'Контекст сохранён. Генерация продолжится после подключения backend-обработчика.',
  generationInProgressTitle: 'Генерация выполняется',
  generationInProgressDescription: 'Role Guide собирается из сохранённого контекста.',
  generationCompletedTitle: 'Генерация завершена',
  generationCompletedDescription: 'Role Guide готов.',
  generationFailedTitle: 'Генерация не завершилась',
  generationFailedDescription: 'Проверьте собранный контекст и попробуйте снова.',
  generationStarting: 'Запускаем генерацию...',
  generationErrorTitle: 'Не удалось запустить генерацию',
  viewGenerated: 'Открыть Role Guide',
  empty: 'Пока нет данных',
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
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-6">
      <div className="flex flex-col gap-4 rounded-md border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-950">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xl font-semibold text-slate-950 dark:text-slate-50">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
            <h2>{labels.title}</h2>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            {labels.description}
          </p>
          {shouldShowStatus ? (
            <div
              role="status"
              className="flex max-w-2xl gap-2 rounded-md border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900 dark:border-teal-900 dark:bg-teal-950/30 dark:text-teal-100"
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
              className="flex max-w-2xl gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div className="space-y-1">
                <p className="font-semibold">{generationErrorTitle}</p>
                <p className="leading-6">{visibleGenerationError}</p>
              </div>
            </div>
          ) : null}
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-stretch">
          <Button
            type="button"
            onClick={onGenerate}
            disabled={isGenerationStarting || isGenerating || isCompleted}
            className="min-w-52"
          >
            {isGenerationStarting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <WandSparkles className="mr-2 h-4 w-4" aria-hidden />
            )}
            {isGenerationStarting ? labels.generationStarting : labels.generate}
          </Button>
          {isCompleted && viewGeneratedHref ? (
            <Button asChild variant="secondary" className="min-w-52">
              <Link href={viewGeneratedHref}>
                <BookOpen className="mr-2 h-4 w-4" aria-hidden />
                {labels.viewGenerated}
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

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
            className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm leading-6 break-words whitespace-pre-wrap text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
          >
            {note}
          </div>
        ))}
      </SummarySection>
    </section>
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
        <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
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
    <div className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1fr_auto] sm:items-start dark:border-slate-800 dark:bg-slate-900">
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
