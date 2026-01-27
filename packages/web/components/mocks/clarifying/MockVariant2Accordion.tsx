'use client'

import { useState } from 'react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Check, Circle, MessageSquare, ListChecks } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MockQuestion } from './mockData'
import type { QuestionPriority, QuestionType } from '@megacampus/shared-types'

interface MockVariant2AccordionProps {
  questions: MockQuestion[]
}

const priorityLabels: Record<QuestionPriority, { label: string; color: string }> = {
  critical: { label: 'Обязательный', color: 'text-red-600 dark:text-red-400' },
  important: { label: 'Важный', color: 'text-amber-600 dark:text-amber-400' },
  nice_to_have: { label: 'Желательный', color: 'text-slate-500 dark:text-slate-400' },
}

const typeIcons: Record<QuestionType, typeof MessageSquare> = {
  open: MessageSquare,
  single_choice: Circle,
  multi_choice: ListChecks,
}

interface QuestionAccordionItemProps {
  question: MockQuestion
  onAnswer: (answer: string | string[]) => void
}

function QuestionAccordionItem({ question, onAnswer }: QuestionAccordionItemProps) {
  const [localAnswer, setLocalAnswer] = useState<string>(question.currentAnswer || '')
  const [localAnswers, setLocalAnswers] = useState<string[]>(question.currentAnswers || [])

  const TypeIcon = typeIcons[question.type]
  const priority = priorityLabels[question.priority]
  const isAnswered = question.isAnswered

  const handleSingleSelect = (value: string) => {
    setLocalAnswer(value)
    onAnswer(value)
  }

  const handleMultiSelect = (value: string, checked: boolean) => {
    const newAnswers = checked ? [...localAnswers, value] : localAnswers.filter((a) => a !== value)
    setLocalAnswers(newAnswers)
  }

  const handleOpenSubmit = () => {
    if (localAnswer.trim()) {
      onAnswer(localAnswer)
    }
  }

  const handleMultiSubmit = () => {
    if (localAnswers.length > 0) {
      onAnswer(localAnswers)
    }
  }

  const displayAnswer =
    question.type === 'multi_choice'
      ? (question.currentAnswers || localAnswers).join(', ')
      : question.currentAnswer || localAnswer

  return (
    <AccordionItem
      value={question.id}
      className={cn(
        'mb-2 rounded-lg border px-4',
        isAnswered
          ? 'border-slate-200 bg-slate-50/50 dark:border-slate-700 dark:bg-slate-900/30'
          : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900'
      )}
    >
      <AccordionTrigger className="py-3 hover:no-underline">
        <div className="flex min-w-0 flex-1 items-center gap-3 text-left">
          {isAnswered ? (
            <Check className="h-5 w-5 flex-shrink-0 text-emerald-500" />
          ) : (
            <TypeIcon className="h-5 w-5 flex-shrink-0 text-slate-400" />
          )}

          <div className="min-w-0 flex-1">
            <div className="mb-0.5 flex items-center gap-2">
              <span className={cn('text-xs font-medium', priority.color)}>{priority.label}</span>
            </div>
            <p
              className={cn(
                'truncate text-sm',
                isAnswered
                  ? 'text-slate-500 dark:text-slate-400'
                  : 'font-medium text-slate-700 dark:text-slate-200'
              )}
            >
              {question.text}
            </p>
            {isAnswered && displayAnswer && (
              <p className="mt-0.5 truncate text-xs text-slate-400 dark:text-slate-500">
                {displayAnswer}
              </p>
            )}
          </div>
        </div>
      </AccordionTrigger>

      <AccordionContent className="pb-4">
        <div className="space-y-3 pt-2">
          {/* Full question text if truncated */}
          <p className="text-sm text-slate-600 dark:text-slate-300">{question.text}</p>

          {/* Answer section */}
          {question.type === 'single_choice' && (
            <RadioGroup
              value={localAnswer || question.currentAnswer}
              onValueChange={handleSingleSelect}
              className="space-y-2"
            >
              {question.suggestedAnswers.map((answer, idx) => (
                <div
                  key={idx}
                  className={cn(
                    'flex items-center space-x-2 rounded-md p-2 transition-colors',
                    answer.is_recommended && 'bg-purple-50 dark:bg-purple-950/30'
                  )}
                >
                  <RadioGroupItem value={answer.text} id={`acc-${question.id}-${idx}`} />
                  <Label
                    htmlFor={`acc-${question.id}-${idx}`}
                    className="flex-1 cursor-pointer text-sm text-slate-600 dark:text-slate-300"
                  >
                    {answer.text}
                    {answer.is_recommended && (
                      <span className="ml-2 text-xs text-purple-600 dark:text-purple-400">
                        Рекомендуется
                      </span>
                    )}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          )}

          {question.type === 'multi_choice' && (
            <div className="space-y-2">
              {question.suggestedAnswers.map((answer, idx) => (
                <div
                  key={idx}
                  className={cn(
                    'flex items-center space-x-2 rounded-md p-2 transition-colors',
                    answer.is_recommended && 'bg-purple-50 dark:bg-purple-950/30'
                  )}
                >
                  <Checkbox
                    id={`acc-${question.id}-${idx}`}
                    checked={
                      localAnswers.includes(answer.text) ||
                      (question.currentAnswers || []).includes(answer.text)
                    }
                    onCheckedChange={(checked) => handleMultiSelect(answer.text, !!checked)}
                  />
                  <Label
                    htmlFor={`acc-${question.id}-${idx}`}
                    className="flex-1 cursor-pointer text-sm text-slate-600 dark:text-slate-300"
                  >
                    {answer.text}
                    {answer.is_recommended && (
                      <span className="ml-2 text-xs text-purple-600 dark:text-purple-400">
                        Рекомендуется
                      </span>
                    )}
                  </Label>
                </div>
              ))}
              <Button
                size="sm"
                onClick={handleMultiSubmit}
                disabled={localAnswers.length === 0 && !question.currentAnswers?.length}
                className="mt-2"
              >
                {isAnswered ? 'Обновить' : 'Подтвердить'}
              </Button>
            </div>
          )}

          {question.type === 'open' && (
            <div className="space-y-3">
              {question.suggestedAnswers.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Варианты для вдохновения:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {question.suggestedAnswers.map((answer, idx) => (
                      <Button
                        key={idx}
                        variant="outline"
                        size="sm"
                        onClick={() => setLocalAnswer(answer.text)}
                        className={cn(
                          'h-7 text-xs',
                          answer.is_recommended && 'border-purple-300 dark:border-purple-700'
                        )}
                      >
                        {answer.text.length > 40 ? answer.text.slice(0, 40) + '...' : answer.text}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              <Textarea
                value={localAnswer || question.currentAnswer || ''}
                onChange={(e) => setLocalAnswer(e.target.value)}
                placeholder="Введите ваш ответ..."
                className="min-h-[80px] text-sm"
              />
              <Button
                size="sm"
                onClick={handleOpenSubmit}
                disabled={!localAnswer.trim() && !question.currentAnswer}
              >
                {isAnswered ? 'Обновить' : 'Ответить'}
              </Button>
            </div>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  )
}

export function MockVariant2Accordion({ questions }: MockVariant2AccordionProps) {
  const [localQuestions, setLocalQuestions] = useState(questions)

  // Open unanswered questions by default
  const defaultOpenValues = localQuestions.filter((q) => !q.isAnswered).map((q) => q.id)
  const [openValues, setOpenValues] = useState<string[]>(defaultOpenValues)

  const handleAnswer = (questionId: string, answer: string | string[]) => {
    setLocalQuestions((prev) =>
      prev.map((q) =>
        q.id === questionId
          ? {
              ...q,
              isAnswered: true,
              ...(Array.isArray(answer) ? { currentAnswers: answer } : { currentAnswer: answer }),
            }
          : q
      )
    )
    // Close answered question
    setOpenValues((prev) => prev.filter((v) => v !== questionId))
  }

  const answered = localQuestions.filter((q) => q.isAnswered).length
  const total = localQuestions.length
  const criticalAnswered = localQuestions.filter(
    (q) => q.priority === 'critical' && q.isAnswered
  ).length
  const criticalTotal = localQuestions.filter((q) => q.priority === 'critical').length

  return (
    <div className="space-y-4">
      {/* Progress summary */}
      <div className="flex items-center justify-between rounded-lg bg-slate-100 p-3 dark:bg-slate-800">
        <div className="flex items-center gap-4">
          <div className="text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">{answered}</span>
            <span className="text-slate-500 dark:text-slate-400"> из {total} отвечено</span>
          </div>
          <div className="text-sm">
            <span className="font-medium text-red-600 dark:text-red-400">{criticalAnswered}</span>
            <span className="text-slate-500 dark:text-slate-400">
              {' '}
              из {criticalTotal} обязательных
            </span>
          </div>
        </div>
        {answered === total && (
          <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
            Все вопросы отвечены
          </span>
        )}
      </div>

      {/* Accordion */}
      <Accordion type="multiple" value={openValues} onValueChange={setOpenValues}>
        {localQuestions.map((question) => (
          <QuestionAccordionItem
            key={question.id}
            question={question}
            onAnswer={(answer) => handleAnswer(question.id, answer)}
          />
        ))}
      </Accordion>
    </div>
  )
}
