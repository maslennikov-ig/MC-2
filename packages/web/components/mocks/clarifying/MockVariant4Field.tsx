'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Check, AlertCircle, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MockQuestion } from './mockData'
import type { QuestionPriority } from '@megacampus/shared-types'

interface MockVariant4FieldProps {
  questions: MockQuestion[]
}

const priorityIcons: Record<QuestionPriority, { icon: typeof AlertCircle | null; color: string }> =
  {
    critical: { icon: AlertCircle, color: 'text-red-500' },
    important: { icon: Star, color: 'text-amber-500' },
    nice_to_have: { icon: null, color: '' },
  }

interface FieldQuestionProps {
  question: MockQuestion
  onAnswer: (answer: string | string[]) => void
}

function FieldQuestion({ question, onAnswer }: FieldQuestionProps) {
  const [localAnswer, setLocalAnswer] = useState<string>(question.currentAnswer || '')
  const [localAnswers, setLocalAnswers] = useState<string[]>(question.currentAnswers || [])
  const [isEditing, setIsEditing] = useState(!question.isAnswered)

  const priority = priorityIcons[question.priority]
  const PriorityIcon = priority.icon
  const isAnswered = question.isAnswered && !isEditing

  const handleSingleSelect = (value: string) => {
    setLocalAnswer(value)
    onAnswer(value)
    setIsEditing(false)
  }

  const handleMultiSelect = (value: string, checked: boolean) => {
    const newAnswers = checked ? [...localAnswers, value] : localAnswers.filter((a) => a !== value)
    setLocalAnswers(newAnswers)
  }

  const handleMultiSubmit = () => {
    if (localAnswers.length > 0) {
      onAnswer(localAnswers)
      setIsEditing(false)
    }
  }

  const handleOpenSubmit = () => {
    if (localAnswer.trim()) {
      onAnswer(localAnswer)
      setIsEditing(false)
    }
  }

  return (
    <div
      className={cn(
        'group rounded-lg border transition-all duration-200',
        isAnswered
          ? 'border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/30'
          : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900'
      )}
    >
      {/* Field Header */}
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Label className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {question.text}
            </Label>
            {PriorityIcon && (
              <PriorityIcon className={cn('h-4 w-4 flex-shrink-0', priority.color)} />
            )}
          </div>
          {question.type === 'open' && !isAnswered && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Свободный ответ</p>
          )}
        </div>

        {isAnswered && (
          <div className="flex flex-shrink-0 items-center gap-2">
            <Check className="h-4 w-4 text-emerald-500" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsEditing(true)}
              className="h-7 px-2 text-xs text-slate-500 hover:text-slate-700"
            >
              Изменить
            </Button>
          </div>
        )}
      </div>

      {/* Field Content */}
      <div className="px-4 pb-4">
        {isAnswered ? (
          <div className="rounded-md border border-slate-100 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {question.type === 'multi_choice'
                ? (question.currentAnswers || localAnswers).join(', ')
                : question.currentAnswer || localAnswer}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {question.type === 'single_choice' && (
              <RadioGroup
                value={localAnswer}
                onValueChange={handleSingleSelect}
                className="grid gap-2"
              >
                {question.suggestedAnswers.map((answer, idx) => (
                  <Label
                    key={idx}
                    htmlFor={`field-${question.id}-${idx}`}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors',
                      localAnswer === answer.text
                        ? 'border-purple-400 bg-purple-50 dark:border-purple-700 dark:bg-purple-950/30'
                        : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'
                    )}
                  >
                    <RadioGroupItem
                      value={answer.text}
                      id={`field-${question.id}-${idx}`}
                      className="flex-shrink-0"
                    />
                    <span className="flex-1 text-sm text-slate-700 dark:text-slate-200">
                      {answer.text}
                    </span>
                    {answer.is_recommended && (
                      <span className="flex-shrink-0 text-xs text-purple-600 dark:text-purple-400">
                        Рекомендуется
                      </span>
                    )}
                  </Label>
                ))}
              </RadioGroup>
            )}

            {question.type === 'multi_choice' && (
              <div className="space-y-2">
                <div className="grid gap-2">
                  {question.suggestedAnswers.map((answer, idx) => {
                    const isSelected = localAnswers.includes(answer.text)
                    return (
                      <Label
                        key={idx}
                        htmlFor={`field-${question.id}-${idx}`}
                        className={cn(
                          'flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors',
                          isSelected
                            ? 'border-purple-400 bg-purple-50 dark:border-purple-700 dark:bg-purple-950/30'
                            : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'
                        )}
                      >
                        <Checkbox
                          id={`field-${question.id}-${idx}`}
                          checked={isSelected}
                          onCheckedChange={(checked) => handleMultiSelect(answer.text, !!checked)}
                          className="flex-shrink-0"
                        />
                        <span className="flex-1 text-sm text-slate-700 dark:text-slate-200">
                          {answer.text}
                        </span>
                        {answer.is_recommended && (
                          <span className="flex-shrink-0 text-xs text-purple-600 dark:text-purple-400">
                            Рекомендуется
                          </span>
                        )}
                      </Label>
                    )
                  })}
                </div>
                <Button
                  size="sm"
                  onClick={handleMultiSubmit}
                  disabled={localAnswers.length === 0}
                  className="mt-2"
                >
                  Подтвердить
                </Button>
              </div>
            )}

            {question.type === 'open' && (
              <div className="space-y-3">
                {question.suggestedAnswers.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {question.suggestedAnswers.map((answer, idx) => (
                      <Button
                        key={idx}
                        variant="outline"
                        size="sm"
                        onClick={() => setLocalAnswer(answer.text)}
                        className={cn(
                          'h-7 text-xs',
                          answer.is_recommended && 'border-purple-300 dark:border-purple-700',
                          localAnswer === answer.text && 'bg-purple-50 dark:bg-purple-950/30'
                        )}
                      >
                        {answer.text.length > 30 ? answer.text.slice(0, 30) + '...' : answer.text}
                      </Button>
                    ))}
                  </div>
                )}
                <Textarea
                  value={localAnswer}
                  onChange={(e) => setLocalAnswer(e.target.value)}
                  placeholder="Введите ваш ответ..."
                  className="min-h-[100px] resize-none text-sm"
                />
                <div className="flex justify-end">
                  <Button size="sm" onClick={handleOpenSubmit} disabled={!localAnswer.trim()}>
                    Ответить
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function MockVariant4Field({ questions }: MockVariant4FieldProps) {
  const [localQuestions, setLocalQuestions] = useState(questions)

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
  }

  const answered = localQuestions.filter((q) => q.isAnswered).length
  const total = localQuestions.length
  const criticalAnswered = localQuestions.filter(
    (q) => q.priority === 'critical' && q.isAnswered
  ).length
  const criticalTotal = localQuestions.filter((q) => q.priority === 'critical').length

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/30">
            <span className="text-sm font-semibold text-purple-700 dark:text-purple-300">
              {answered}
            </span>
          </div>
          <span className="text-slate-600 dark:text-slate-400">из {total}</span>
        </div>

        <div className="h-4 w-px bg-slate-200 dark:bg-slate-700" />

        <div className="flex items-center gap-2 text-xs">
          <AlertCircle className="h-4 w-4 text-red-500" />
          <span className="text-slate-600 dark:text-slate-400">
            Обязательных: {criticalAnswered}/{criticalTotal}
          </span>
        </div>

        {answered === total && (
          <>
            <div className="h-4 w-px bg-slate-200 dark:bg-slate-700" />
            <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <Check className="h-4 w-4" />
              Готово
            </span>
          </>
        )}
      </div>

      {/* Questions */}
      <div className="space-y-3">
        {localQuestions.map((question) => (
          <FieldQuestion
            key={question.id}
            question={question}
            onAnswer={(answer) => handleAnswer(question.id, answer)}
          />
        ))}
      </div>
    </div>
  )
}
