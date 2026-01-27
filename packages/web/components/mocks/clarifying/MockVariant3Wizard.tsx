'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Check, ChevronLeft, ChevronRight, Circle, MessageSquare, ListChecks } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MockQuestion } from './mockData'
import type { QuestionPriority, QuestionType } from '@megacampus/shared-types'

interface MockVariant3WizardProps {
  questions: MockQuestion[]
}

const priorityConfig: Record<QuestionPriority, { label: string; dotColor: string }> = {
  critical: { label: 'Обязательный', dotColor: 'bg-red-500' },
  important: { label: 'Важный', dotColor: 'bg-amber-400' },
  nice_to_have: { label: 'Желательный', dotColor: 'bg-slate-300' },
}

const typeIcons: Record<QuestionType, typeof MessageSquare> = {
  open: MessageSquare,
  single_choice: Circle,
  multi_choice: ListChecks,
}

export function MockVariant3Wizard({ questions }: MockVariant3WizardProps) {
  const [localQuestions, setLocalQuestions] = useState(questions)
  const [currentIndex, setCurrentIndex] = useState(() => {
    // Start at first unanswered question
    const firstUnanswered = questions.findIndex((q) => !q.isAnswered)
    return firstUnanswered >= 0 ? firstUnanswered : 0
  })
  const [localAnswer, setLocalAnswer] = useState<string>('')
  const [localAnswers, setLocalAnswers] = useState<string[]>([])

  const currentQuestion = localQuestions[currentIndex]
  const TypeIcon = typeIcons[currentQuestion.type]
  const priority = priorityConfig[currentQuestion.priority]

  const answered = localQuestions.filter((q) => q.isAnswered).length
  const total = localQuestions.length
  const progress = (answered / total) * 100

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
      resetLocalState(localQuestions[currentIndex - 1])
    }
  }

  const handleNext = () => {
    if (currentIndex < localQuestions.length - 1) {
      setCurrentIndex(currentIndex + 1)
      resetLocalState(localQuestions[currentIndex + 1])
    }
  }

  const resetLocalState = (question: MockQuestion) => {
    setLocalAnswer(question.currentAnswer || '')
    setLocalAnswers(question.currentAnswers || [])
  }

  const handleAnswer = (answer: string | string[]) => {
    setLocalQuestions((prev) =>
      prev.map((q, idx) =>
        idx === currentIndex
          ? {
              ...q,
              isAnswered: true,
              ...(Array.isArray(answer) ? { currentAnswers: answer } : { currentAnswer: answer }),
            }
          : q
      )
    )

    // Auto-advance to next unanswered question
    const nextUnanswered = localQuestions.findIndex((q, idx) => idx > currentIndex && !q.isAnswered)
    if (nextUnanswered >= 0) {
      setCurrentIndex(nextUnanswered)
      resetLocalState(localQuestions[nextUnanswered])
    } else if (currentIndex < localQuestions.length - 1) {
      handleNext()
    }
  }

  const handleSingleSelect = (value: string) => {
    setLocalAnswer(value)
    handleAnswer(value)
  }

  const handleMultiSelect = (value: string, checked: boolean) => {
    const newAnswers = checked ? [...localAnswers, value] : localAnswers.filter((a) => a !== value)
    setLocalAnswers(newAnswers)
  }

  const handleMultiSubmit = () => {
    if (localAnswers.length > 0) {
      handleAnswer(localAnswers)
    }
  }

  const handleOpenSubmit = () => {
    if (localAnswer.trim()) {
      handleAnswer(localAnswer)
    }
  }

  // Initialize local state on mount
  useState(() => {
    resetLocalState(currentQuestion)
  })

  return (
    <div className="flex gap-4">
      {/* Sidebar - Question list */}
      <div className="hidden w-48 flex-shrink-0 md:block">
        <div className="space-y-1">
          {localQuestions.map((q, idx) => (
            <button
              key={q.id}
              onClick={() => {
                setCurrentIndex(idx)
                resetLocalState(localQuestions[idx])
              }}
              className={cn(
                'w-full rounded-lg px-3 py-2 text-left text-sm transition-colors',
                'flex items-center gap-2',
                idx === currentIndex
                  ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
              )}
            >
              {q.isAnswered ? (
                <Check className="h-4 w-4 flex-shrink-0 text-emerald-500" />
              ) : (
                <div
                  className={cn(
                    'h-4 w-4 rounded-full border-2',
                    priorityConfig[q.priority].dotColor
                  )}
                />
              )}
              <span className="truncate">
                {idx + 1}. {q.text.slice(0, 20)}...
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="min-w-0 flex-1">
        {/* Progress */}
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-slate-600 dark:text-slate-400">
              Вопрос {currentIndex + 1} из {total}
            </span>
            <span className="text-slate-600 dark:text-slate-400">Отвечено: {answered}</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Question card */}
        <Card className="border-slate-200 dark:border-slate-700">
          <CardHeader className="pb-3">
            <div className="mb-2 flex items-center gap-2">
              <div className={cn('h-2 w-2 rounded-full', priority.dotColor)} />
              <span className="text-xs font-medium text-slate-500 uppercase dark:text-slate-400">
                {priority.label}
              </span>
              {currentQuestion.isAnswered && (
                <span className="ml-auto flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                  <Check className="h-3 w-3" />
                  Отвечено
                </span>
              )}
            </div>
            <CardTitle className="flex items-start gap-2 text-lg font-medium text-slate-800 dark:text-slate-100">
              <TypeIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-slate-400" />
              {currentQuestion.text}
            </CardTitle>
          </CardHeader>

          <CardContent className="pt-0">
            {/* Answer options */}
            {currentQuestion.type === 'single_choice' && (
              <RadioGroup
                value={localAnswer || currentQuestion.currentAnswer}
                onValueChange={handleSingleSelect}
                className="space-y-3"
              >
                {currentQuestion.suggestedAnswers.map((answer, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      'flex cursor-pointer items-start space-x-3 rounded-lg border p-3 transition-colors',
                      localAnswer === answer.text || currentQuestion.currentAnswer === answer.text
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/30'
                        : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'
                    )}
                  >
                    <RadioGroupItem
                      value={answer.text}
                      id={`wiz-${currentQuestion.id}-${idx}`}
                      className="mt-0.5"
                    />
                    <Label
                      htmlFor={`wiz-${currentQuestion.id}-${idx}`}
                      className="flex-1 cursor-pointer text-sm text-slate-700 dark:text-slate-200"
                    >
                      {answer.text}
                      {answer.rationale && (
                        <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                          {answer.rationale}
                        </span>
                      )}
                      {answer.is_recommended && (
                        <span className="mt-1 inline-block text-xs font-medium text-purple-600 dark:text-purple-400">
                          Рекомендуется
                        </span>
                      )}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            )}

            {currentQuestion.type === 'multi_choice' && (
              <div className="space-y-3">
                {currentQuestion.suggestedAnswers.map((answer, idx) => {
                  const isSelected =
                    localAnswers.includes(answer.text) ||
                    (currentQuestion.currentAnswers || []).includes(answer.text)
                  return (
                    <div
                      key={idx}
                      className={cn(
                        'flex cursor-pointer items-start space-x-3 rounded-lg border p-3 transition-colors',
                        isSelected
                          ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/30'
                          : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'
                      )}
                      onClick={() => handleMultiSelect(answer.text, !isSelected)}
                    >
                      <Checkbox
                        id={`wiz-${currentQuestion.id}-${idx}`}
                        checked={isSelected}
                        onCheckedChange={(checked) => handleMultiSelect(answer.text, !!checked)}
                        className="mt-0.5"
                      />
                      <Label
                        htmlFor={`wiz-${currentQuestion.id}-${idx}`}
                        className="flex-1 cursor-pointer text-sm text-slate-700 dark:text-slate-200"
                      >
                        {answer.text}
                        {answer.rationale && (
                          <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                            {answer.rationale}
                          </span>
                        )}
                        {answer.is_recommended && (
                          <span className="mt-1 inline-block text-xs font-medium text-purple-600 dark:text-purple-400">
                            Рекомендуется
                          </span>
                        )}
                      </Label>
                    </div>
                  )
                })}
                <Button
                  onClick={handleMultiSubmit}
                  disabled={localAnswers.length === 0}
                  className="mt-4 w-full"
                >
                  Подтвердить выбор
                </Button>
              </div>
            )}

            {currentQuestion.type === 'open' && (
              <div className="space-y-4">
                {currentQuestion.suggestedAnswers.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Варианты для вдохновения:
                    </p>
                    <div className="grid gap-2">
                      {currentQuestion.suggestedAnswers.map((answer, idx) => (
                        <Button
                          key={idx}
                          variant="outline"
                          size="sm"
                          onClick={() => setLocalAnswer(answer.text)}
                          className={cn(
                            'h-auto justify-start px-3 py-2 text-left',
                            answer.is_recommended && 'border-purple-300 dark:border-purple-700'
                          )}
                        >
                          <span className="text-xs">{answer.text}</span>
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                <Textarea
                  value={localAnswer || currentQuestion.currentAnswer || ''}
                  onChange={(e) => setLocalAnswer(e.target.value)}
                  placeholder="Введите ваш развёрнутый ответ..."
                  className="min-h-[120px] text-sm"
                />
                <Button
                  onClick={handleOpenSubmit}
                  disabled={!localAnswer.trim()}
                  className="w-full"
                >
                  {currentQuestion.isAnswered ? 'Обновить ответ' : 'Ответить'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Navigation - fixed on mobile */}
        <div className="-mx-4 mt-4 flex items-center justify-between border-t border-slate-200 bg-white p-4 md:mx-0 md:border-0 md:bg-transparent md:p-0 dark:border-slate-800 dark:bg-slate-950">
          <Button
            variant="outline"
            onClick={handlePrev}
            disabled={currentIndex === 0}
            className="min-h-[44px] min-w-[44px]"
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            <span className="hidden sm:inline">Назад</span>
          </Button>

          {/* Mobile step indicator */}
          <div className="flex items-center gap-1 md:hidden">
            {localQuestions.map((q, idx) => (
              <div
                key={q.id}
                className={cn(
                  'h-2 w-2 rounded-full transition-colors',
                  idx === currentIndex
                    ? 'bg-purple-500'
                    : q.isAnswered
                      ? 'bg-emerald-400'
                      : 'bg-slate-300 dark:bg-slate-600'
                )}
              />
            ))}
          </div>

          <Button
            variant="outline"
            onClick={handleNext}
            disabled={currentIndex === localQuestions.length - 1}
            className="min-h-[44px] min-w-[44px]"
          >
            <span className="hidden sm:inline">Далее</span>
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
