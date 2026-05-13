'use client'

import { CheckCircle2, Info, Pencil, WandSparkles } from 'lucide-react'
import type {
  CareerPlaybookFixedAnswer,
  CareerPlaybookFollowupAnswer,
} from '@megacampus/shared-types'

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
  empty?: string
}

interface CompletionScreenProps {
  fixedAnswers: CareerPlaybookFixedAnswer[]
  followupAnswers: CareerPlaybookFollowupAnswer[]
  freeformNotes: string[]
  onEditFixedAnswer: (questionKey: string) => void
  onEditFollowupAnswer: (questionId: string) => void
  onGenerate: () => void
  generationHandoffVisible?: boolean
  copy?: CompletionScreenCopy
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
  copy,
}: CompletionScreenProps) {
  const labels = { ...defaultCopy, ...copy }

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
          {generationHandoffVisible ? (
            <div
              role="status"
              className="flex max-w-2xl gap-2 rounded-md border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900 dark:border-teal-900 dark:bg-teal-950/30 dark:text-teal-100"
            >
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div className="space-y-1">
                <p className="font-semibold">{labels.generationHandoffTitle}</p>
                <p className="leading-6">{labels.generationHandoffDescription}</p>
              </div>
            </div>
          ) : null}
        </div>
        <Button
          type="button"
          onClick={onGenerate}
          disabled={generationHandoffVisible}
          className="min-w-52"
        >
          <WandSparkles className="mr-2 h-4 w-4" aria-hidden />
          {labels.generate}
        </Button>
      </div>

      <SummarySection title={labels.fixedTitle} empty={labels.empty}>
        {fixedAnswers.map((answer) => (
          <SummaryRow
            key={answer.question_key}
            title={answer.question_key}
            value={formatValue(answer.value)}
            editLabel={`${labels.edit} ${answer.question_key}`}
            onEdit={() => onEditFixedAnswer(answer.question_key)}
          />
        ))}
      </SummarySection>

      <SummarySection title={labels.followupsTitle} empty={labels.empty}>
        {followupAnswers.map((answer) => (
          <SummaryRow
            key={answer.question_id}
            title={answer.question_text}
            value={answer.skipped ? labels.skipped : formatValue(answer.value)}
            editLabel={`${labels.edit} ${answer.question_text}`}
            onEdit={() => onEditFollowupAnswer(answer.question_id)}
          />
        ))}
      </SummarySection>

      <SummarySection title={labels.freeformTitle} empty={labels.empty}>
        {freeformNotes.map((note, index) => (
          <div
            key={`${note}-${index}`}
            className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
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
  onEdit,
}: {
  title: string
  value: string
  editLabel: string
  onEdit: () => void
}) {
  return (
    <div className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1fr_auto] sm:items-start dark:border-slate-800 dark:bg-slate-900">
      <div className="min-w-0 space-y-1">
        <p className="text-xs font-medium text-slate-500 uppercase dark:text-slate-400">{title}</p>
        <p className="text-sm leading-6 whitespace-pre-wrap text-slate-900 dark:text-slate-100">
          {value}
        </p>
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={onEdit} aria-label={editLabel}>
        <Pencil className="h-4 w-4" aria-hidden />
      </Button>
    </div>
  )
}

function formatValue(
  value: CareerPlaybookFixedAnswer['value'] | CareerPlaybookFollowupAnswer['value']
) {
  if (Array.isArray(value)) return value.join(', ')
  return value ?? ''
}
