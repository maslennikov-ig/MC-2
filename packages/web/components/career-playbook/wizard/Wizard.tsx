'use client'

import { ArrowLeft, ArrowRight, CheckCircle2, Circle, ClipboardCheck } from 'lucide-react'
import {
  CareerPlaybookDocumentPreview,
  CareerPlaybookDocumentShell,
  type CareerPlaybookPreviewSection,
} from '@/components/career-playbook/layout/document-workspace'
import { Button } from '@/components/ui/button'
import { ProgressIndicator } from './ProgressIndicator'
import {
  getQuestionKey,
  QuestionRenderer,
  type CareerPlaybookWizardQuestion,
  type CareerPlaybookWizardValue,
  type QuestionRendererCopy,
} from './QuestionRenderer'

interface WizardCopy extends QuestionRendererCopy {
  back?: string
  next?: string
  finish?: string
  draftSaved?: string
  questionLabel?: string
  answeredLabel?: string
  ofLabel?: string
  navigationLabel?: string
  documentPreviewLabel?: string
  documentPreviewTitle?: string
  documentPreviewSubtitle?: string
  documentPreviewEmpty?: string
  questionPanelLabel?: string
}

export interface WizardProps {
  questions: CareerPlaybookWizardQuestion[]
  answers: Record<string, CareerPlaybookWizardValue | undefined>
  currentIndex: number
  onAnswerChange: (questionKey: string, value: CareerPlaybookWizardValue) => void
  onNext: () => void
  onPrevious: () => void
  onQuestionSelect?: (questionKey: string) => void
  isSaving?: boolean
  copy?: WizardCopy
}

const defaultCopy: Required<WizardCopy> = {
  back: 'Назад',
  next: 'Далее',
  finish: 'Завершить',
  draftSaved: 'Черновик сохраняется',
  questionLabel: 'Вопрос',
  answeredLabel: 'Отвечено',
  ofLabel: 'из',
  navigationLabel: 'Вопросы',
  documentPreviewLabel: 'Черновик инструкции',
  documentPreviewTitle: 'Должностная инструкция',
  documentPreviewSubtitle: 'Ответы собираются в структуру будущего документа.',
  documentPreviewEmpty: 'Появится после ответа',
  questionPanelLabel: 'Текущий вопрос',
  openPlaceholder: 'Введите ответ',
  chooseOneLabel: 'Выберите один вариант',
  chooseManyLabel: 'Можно выбрать несколько',
  otherOptionLabel: 'Другое',
  otherOptionPlaceholder: 'Введите свой вариант',
  roleSuggestionsLabel: 'Подходящие роли',
  roleSuggestionsHint: 'Можно выбрать подсказку или оставить свой вариант.',
  roleSuggestionsPopularLabel: 'Популярные роли',
  roleSuggestionsNoResultsLabel: 'Нет точного совпадения',
  roleSuggestionsManualTemplate: 'Использовать "{value}"',
  roleSuggestionsMatchPopular: 'Популярная роль',
  roleSuggestionsMatchLabel: 'Название роли',
  roleSuggestionsMatchAlias: 'Синоним',
  roleSuggestionsMatchAcronym: 'Сокращение',
  roleSuggestionsMatchKeyword: 'Связанный запрос',
}

export function Wizard({
  questions,
  answers,
  currentIndex,
  onAnswerChange,
  onNext,
  onPrevious,
  onQuestionSelect,
  isSaving = false,
  copy,
}: WizardProps) {
  const labels = { ...defaultCopy, ...copy }
  const safeIndex = Math.min(Math.max(currentIndex, 0), Math.max(questions.length - 1, 0))
  const currentQuestion = questions[safeIndex]
  const currentQuestionKey = currentQuestion ? getQuestionKey(currentQuestion) : ''
  const currentValue = answers[currentQuestionKey]
  const answeredCount = questions.filter((question) =>
    hasAnswer(answers[getQuestionKey(question)])
  ).length
  const canGoNext = currentQuestion
    ? !isQuestionRequired(currentQuestion) || hasAnswer(currentValue)
    : false
  const isLastQuestion = safeIndex === questions.length - 1
  const allQuestionsAnswered = questions.every((question) =>
    hasAnswer(answers[getQuestionKey(question)])
  )
  const primaryActionLabel = isLastQuestion || allQuestionsAnswered ? labels.finish : labels.next
  const previewSections: CareerPlaybookPreviewSection[] = questions.map((question) => {
    const questionKey = getQuestionKey(question)
    const value = formatAnswerPreview(answers[questionKey])

    return {
      id: questionKey,
      title: question.question_text,
      value: value === '-' ? '' : value,
      muted: !hasAnswer(answers[questionKey]),
    }
  })

  if (!currentQuestion) {
    return null
  }

  return (
    <CareerPlaybookDocumentShell
      navigation={
        <aside className="career-playbook-panel p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-[13px] leading-5 font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
              {labels.navigationLabel}
            </p>
            <span className="text-[13px] leading-5 font-semibold text-slate-700 tabular-nums dark:text-slate-300">
              {answeredCount} {labels.ofLabel} {questions.length}
            </span>
          </div>
          <ol className="grid gap-2">
            {questions.map((question, index) => {
              const questionKey = getQuestionKey(question)
              const answered = hasAnswer(answers[questionKey])
              const active = index === safeIndex

              return (
                <li key={questionKey}>
                  <button
                    type="button"
                    onClick={() => onQuestionSelect?.(questionKey)}
                    aria-current={active ? 'step' : undefined}
                    className={`career-playbook-rail-item grid min-h-[52px] w-full grid-cols-[auto_1fr] items-start gap-2 px-3 py-2.5 text-left text-[15px] transition-colors ${
                      active
                        ? 'career-playbook-rail-item-active text-slate-950 dark:text-slate-50'
                        : 'text-slate-700 hover:border-purple-200 hover:bg-purple-50/60 dark:text-slate-300 dark:hover:border-purple-500/40 dark:hover:bg-purple-950/20'
                    }`}
                  >
                    {answered ? (
                      <CheckCircle2
                        className="mt-0.5 h-4 w-4 text-emerald-600 dark:text-emerald-400"
                        aria-hidden
                      />
                    ) : (
                      <Circle className="mt-0.5 h-4 w-4 text-slate-400" aria-hidden />
                    )}
                    <span className="line-clamp-2 leading-5">{question.question_text}</span>
                  </button>
                </li>
              )
            })}
          </ol>
        </aside>
      }
      document={
        <CareerPlaybookDocumentPreview
          label={labels.documentPreviewLabel}
          title={labels.documentPreviewTitle}
          subtitle={labels.documentPreviewSubtitle}
          emptyLabel={labels.documentPreviewEmpty}
          sections={previewSections}
          footer={
            isSaving ? (
              <p className="text-[13px] leading-5 text-slate-500 dark:text-slate-400">
                {labels.draftSaved}
              </p>
            ) : null
          }
        />
      }
      panel={
        <aside
          data-testid="career-playbook-question-panel"
          className="career-playbook-panel space-y-4 p-4"
        >
          <div className="career-playbook-soft-card p-3">
            <ProgressIndicator
              answeredCount={answeredCount}
              currentIndex={safeIndex}
              totalCount={questions.length}
              copy={labels}
            />
          </div>

          <div className="flex items-center gap-2 text-[13px] leading-5 font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
            <ClipboardCheck className="h-4 w-4 text-purple-600 dark:text-purple-300" aria-hidden />
            {labels.questionPanelLabel}
          </div>

          <div className="career-playbook-soft-card p-4">
            <QuestionRenderer
              question={currentQuestion}
              value={currentValue}
              onValueChange={(value) => onAnswerChange(currentQuestionKey, value)}
              copy={labels}
            />
          </div>

          <div className="flex min-h-11 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between xl:flex-col 2xl:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={onPrevious}
              disabled={safeIndex === 0}
              className="w-full min-w-28 2xl:w-auto"
            >
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
              {labels.back}
            </Button>

            <Button
              type="button"
              onClick={onNext}
              disabled={!canGoNext}
              className="w-full min-w-28 2xl:w-auto"
            >
              {primaryActionLabel}
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
            </Button>
          </div>
        </aside>
      }
    />
  )
}

function hasAnswer(value: CareerPlaybookWizardValue | undefined) {
  if (Array.isArray(value)) {
    return value.some((item) => item.trim().length > 0)
  }

  return typeof value === 'string' && value.trim().length > 0
}

function isQuestionRequired(question: CareerPlaybookWizardQuestion) {
  return !('is_required' in question) || question.is_required !== false
}

function formatAnswerPreview(value: CareerPlaybookWizardValue | undefined) {
  if (Array.isArray(value)) {
    return value.filter((item) => item.trim().length > 0).join(', ')
  }

  return value?.trim() || '-'
}
