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
import type {
  CareerPlaybookGenerationProgress,
  CareerPlaybookGenerationProgressStage,
  CareerPlaybookPlaybookStatus,
} from '@megacampus/shared-types'

import { CareerPlaybookDocumentShell } from '@/components/career-playbook/layout/document-workspace'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'

export interface CompletionScreenCopy {
  title?: string
  description?: string
  fixedTitle?: string
  businessContextTitle?: string
  followupsTitle?: string
  freeformTitle?: string
  completeness?: string
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
  generationRedirectHint?: string
  generationCanLeaveHint?: string
  generationStepLabels?: Partial<Record<CareerPlaybookGenerationProgressStage, string>>
  viewGenerated?: string
  empty?: string
  reviewPanelTitle?: string
  documentPreviewLabel?: string
}

interface CompletionScreenProps {
  fixedAnswers: CompletionSummaryAnswer[]
  businessContextNotes?: string[]
  followupAnswers: CompletionSummaryAnswer[]
  freeformNotes: string[]
  onEditFixedAnswer: (questionKey: string) => void
  onEditBusinessContext?: () => void
  onEditFollowupAnswer: (questionId: string) => void
  onGenerate: () => void
  generationHandoffVisible?: boolean
  generationStatus?: CareerPlaybookPlaybookStatus
  generationProgress?: number | null
  generationProgressDetails?: CareerPlaybookGenerationProgress | null
  completenessScore?: number | null
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
  businessContextTitle: 'Контекст бизнеса',
  followupsTitle: 'Уточнения',
  freeformTitle: 'Свободные заметки',
  completeness: 'Полнота',
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
  generationRedirectHint: 'После завершения мы автоматически откроем готовую инструкцию.',
  generationCanLeaveHint: 'Можно оставить страницу открытой или вернуться позже: статус сохранён.',
  generationStepLabels: {
    queued: 'Ставим генерацию в очередь',
    preparing_context: 'Подготавливаем сохранённый контекст',
    building_profile: 'Уточняем профиль роли',
    generating_foundation: 'Генерируем основу инструкции',
    reviewing_foundation: 'Проверяем основу инструкции',
    generating_operations: 'Генерируем операционные разделы',
    reviewing_operations: 'Проверяем операционные разделы',
    generating_people: 'Генерируем разделы про людей и компетенции',
    reviewing_people: 'Проверяем разделы про людей и компетенции',
    generating_growth: 'Генерируем развитие и онбординг',
    reviewing_growth: 'Проверяем развитие и онбординг',
    generating_system: 'Генерируем процессы и зависимости',
    reviewing_system: 'Проверяем процессы и зависимости',
    generating_wrap: 'Генерируем финальные разделы',
    reviewing_wrap: 'Проверяем финальные разделы',
    assembling: 'Собираем финальный документ',
    final_review: 'Финально проверяем инструкцию',
    completed: 'Готово, открываем инструкцию',
    failed: 'Генерация остановилась',
  },
  viewGenerated: 'Открыть должностную инструкцию',
  empty: 'Пока нет данных',
  reviewPanelTitle: 'Проверка',
  documentPreviewLabel: 'Черновик инструкции',
}

export function CompletionScreen({
  fixedAnswers,
  businessContextNotes = [],
  followupAnswers,
  freeformNotes,
  onEditFixedAnswer,
  onEditBusinessContext,
  onEditFollowupAnswer,
  onGenerate,
  generationHandoffVisible = false,
  generationStatus,
  generationProgress = null,
  generationProgressDetails = null,
  completenessScore = null,
  generationError = null,
  isGenerationStarting = false,
  isEditingDisabled = false,
  viewGeneratedHref,
  copy,
}: CompletionScreenProps) {
  const labels = {
    ...defaultCopy,
    ...copy,
    generationStepLabels: {
      ...defaultCopy.generationStepLabels,
      ...copy?.generationStepLabels,
    },
  }
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
    typeof generationProgressDetails?.percent === 'number'
      ? `${Math.round(generationProgressDetails.percent)}%`
      : typeof generationProgress === 'number'
        ? `${Math.round(generationProgress)}%`
        : null
  const generationProgressValue =
    typeof generationProgressDetails?.percent === 'number'
      ? generationProgressDetails.percent
      : generationProgress
  const activeGenerationStep =
    generationProgressDetails?.stage && labels.generationStepLabels[generationProgressDetails.stage]
      ? labels.generationStepLabels[generationProgressDetails.stage]
      : isCompleted
        ? labels.generationStepLabels.completed
        : isFailed
          ? labels.generationStepLabels.failed
          : isGenerating
            ? labels.generationInProgressDescription
            : labels.generationHandoffDescription
  const completenessPercent =
    typeof completenessScore === 'number'
      ? `${Math.min(Math.max(Math.round(completenessScore * 100), 0), 100)}%`
      : null
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
            <ReviewMetric label={labels.businessContextTitle} value={businessContextNotes.length} />
            <ReviewMetric label={labels.followupsTitle} value={followupAnswers.length} />
            <ReviewMetric label={labels.freeformTitle} value={freeformNotes.length} />
            {completenessPercent ? (
              <ReviewMetric label={labels.completeness} value={completenessPercent} />
            ) : null}
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

          <div className="mt-6">
            {shouldShowStatus || isFailed ? (
              <GenerationProgressCard
                title={generationStatusTitle}
                description={activeGenerationStep ?? generationStatusDescription}
                percent={generationProgressValue}
                percentLabel={generationStatusProgress}
                redirectHint={
                  isFailed
                    ? labels.generationFailedDescription
                    : isCompleted
                      ? labels.generationCompletedDescription
                      : labels.generationRedirectHint
                }
                canLeaveHint={labels.generationCanLeaveHint}
                isCompleted={isCompleted}
                isFailed={isFailed}
                isStarting={isGenerationStarting}
                generateLabel={labels.generate}
                generationStartingLabel={labels.generationStarting}
                viewGeneratedLabel={labels.viewGenerated}
                viewGeneratedHref={viewGeneratedHref}
                onGenerate={onGenerate}
              />
            ) : (
              <div className="career-playbook-muted-card grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {labels.generationHandoffTitle}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {labels.description}
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={onGenerate}
                  disabled={isGenerationStarting || isGenerating || isCompleted}
                  className="w-full sm:w-auto"
                >
                  {isGenerationStarting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <ClipboardCheck className="mr-2 h-4 w-4" aria-hidden />
                  )}
                  {isGenerationStarting ? labels.generationStarting : labels.generate}
                </Button>
              </div>
            )}
          </div>

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

            <SummarySection title={labels.businessContextTitle} empty={labels.empty}>
              {businessContextNotes.map((note, index) => (
                <div key={`${note}-${index}`} className="career-playbook-muted-card p-3">
                  <p className="text-sm leading-6 break-words whitespace-pre-wrap text-slate-800 dark:text-slate-100">
                    {note}
                  </p>
                  {onEditBusinessContext ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={onEditBusinessContext}
                      disabled={isEditingDisabled}
                      className="mt-2 h-8 px-2 text-xs"
                    >
                      <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                      {labels.edit}
                    </Button>
                  ) : null}
                </div>
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
              <div className="flex gap-2 rounded-md border border-purple-200 bg-purple-50/80 p-3 text-sm text-purple-950 dark:border-purple-900 dark:bg-purple-950/30 dark:text-purple-100">
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
          </div>
        </aside>
      }
    />
  )
}

function GenerationProgressCard({
  title,
  description,
  percent,
  percentLabel,
  redirectHint,
  canLeaveHint,
  isCompleted,
  isFailed,
  isStarting,
  generateLabel,
  generationStartingLabel,
  viewGeneratedLabel,
  viewGeneratedHref,
  onGenerate,
}: {
  title: string
  description: string
  percent: number | null
  percentLabel: string | null
  redirectHint: string
  canLeaveHint: string
  isCompleted: boolean
  isFailed: boolean
  isStarting: boolean
  generateLabel: string
  generationStartingLabel: string
  viewGeneratedLabel: string
  viewGeneratedHref?: string
  onGenerate: () => void
}) {
  const percentValue =
    typeof percent === 'number'
      ? Math.min(Math.max(Math.round(percent), 0), 100)
      : isCompleted || isFailed
        ? 100
        : 66
  const isActive = !isCompleted && !isFailed

  return (
    <section
      role="status"
      className="rounded-md border border-purple-200 bg-purple-50/70 p-4 text-purple-950 dark:border-purple-900 dark:bg-purple-950/30 dark:text-purple-100"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            {isCompleted ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
            ) : isFailed ? (
              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-300" />
            ) : (
              <Loader2 className="h-4 w-4 animate-spin text-purple-600 dark:text-purple-300" />
            )}
            <p className="text-sm font-semibold">{title}</p>
            {percentLabel ? <span className="text-sm font-medium">{percentLabel}</span> : null}
          </div>
          <p className="text-sm leading-6">{description}</p>
          {!isFailed ? (
            <p className="text-xs leading-5 text-purple-800 dark:text-purple-200">{redirectHint}</p>
          ) : null}
          {!isCompleted && !isFailed ? (
            <p className="text-xs leading-5 text-purple-800 dark:text-purple-200">{canLeaveHint}</p>
          ) : null}
        </div>

        <div className="w-full shrink-0 space-y-3 sm:w-72">
          <Progress
            value={percentValue}
            aria-label={title}
            className="h-2 bg-purple-200/80 dark:bg-purple-900/60"
          />
          {isCompleted && viewGeneratedHref ? (
            <Button asChild className="w-full">
              <Link href={viewGeneratedHref}>
                <BookOpen className="mr-2 h-4 w-4" aria-hidden />
                {viewGeneratedLabel}
              </Link>
            </Button>
          ) : (
            <Button
              type="button"
              onClick={onGenerate}
              disabled={isStarting || isActive}
              className="w-full"
            >
              {isStarting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <ClipboardCheck className="mr-2 h-4 w-4" aria-hidden />
              )}
              {isStarting ? generationStartingLabel : generateLabel}
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}

function ReviewMetric({ label, value }: { label: string; value: number | string }) {
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
