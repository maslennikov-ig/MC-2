'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Check, Circle, MessageSquare, ListChecks } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MockQuestion } from './mockData'
import type { QuestionPriority, QuestionType } from '@megacampus/shared-types'

interface MockVariant1MinimalProps {
  questions: MockQuestion[]
}

const priorityIndicator: Record<QuestionPriority, string> = {
  critical: 'bg-red-500',
  important: 'bg-amber-400',
  nice_to_have: 'bg-slate-300',
}

const typeIcons: Record<QuestionType, typeof MessageSquare> = {
  open: MessageSquare,
  single_choice: Circle,
  multi_choice: ListChecks,
}

interface QuestionCardProps {
  question: MockQuestion
  onAnswer: (answer: string | string[]) => void
}

function QuestionCard({ question, onAnswer }: QuestionCardProps) {
  const [localAnswer, setLocalAnswer] = useState<string>(question.currentAnswer || '')
  const [localAnswers, setLocalAnswers] = useState<string[]>(question.currentAnswers || [])
  const [isEditing, setIsEditing] = useState(!question.isAnswered)

  const TypeIcon = typeIcons[question.type]
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

  const handleOpenSubmit = () => {
    if (localAnswer.trim()) {
      onAnswer(localAnswer)
      setIsEditing(false)
    }
  }

  const handleMultiSubmit = () => {
    if (localAnswers.length > 0) {
      onAnswer(localAnswers)
      setIsEditing(false)
    }
  }

  return (
    <Card
      className={cn(
        'relative overflow-hidden transition-all duration-200',
        'border-slate-200 dark:border-slate-700',
        isAnswered && 'bg-slate-50 dark:bg-slate-900/50'
      )}
    >
      {/* Priority indicator - thin left border */}
      <div
        className={cn('absolute top-0 bottom-0 left-0 w-1', priorityIndicator[question.priority])}
      />

      <CardContent className="p-4 pl-5">
        {/* Header */}
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <TypeIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {question.text}
            </p>
          </div>

          {isAnswered && (
            <div className="flex flex-shrink-0 items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <Check className="h-4 w-4" />
              <span className="text-xs font-medium">Отвечено</span>
            </div>
          )}

          {question.priority === 'critical' && !isAnswered && (
            <div
              className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-red-500"
              title="Обязательный"
            />
          )}
        </div>

        {/* Content */}
        {isAnswered ? (
          <div className="pl-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {question.type === 'multi_choice'
                  ? (question.currentAnswers || localAnswers).join(', ')
                  : question.currentAnswer || localAnswer}
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditing(true)}
                className="h-8 px-2 text-slate-500 hover:text-slate-700"
              >
                Изменить
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 pl-6">
            {question.type === 'single_choice' && (
              <RadioGroup
                value={localAnswer}
                onValueChange={handleSingleSelect}
                className="space-y-2"
              >
                {question.suggestedAnswers.map((answer, idx) => (
                  <div key={idx} className="flex items-center space-x-2">
                    <RadioGroupItem value={answer.text} id={`${question.id}-${idx}`} />
                    <Label
                      htmlFor={`${question.id}-${idx}`}
                      className="cursor-pointer text-sm text-slate-600 dark:text-slate-300"
                    >
                      {answer.text}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            )}

            {question.type === 'multi_choice' && (
              <div className="space-y-2">
                {question.suggestedAnswers.map((answer, idx) => (
                  <div key={idx} className="flex items-center space-x-2">
                    <Checkbox
                      id={`${question.id}-${idx}`}
                      checked={localAnswers.includes(answer.text)}
                      onCheckedChange={(checked) => handleMultiSelect(answer.text, !!checked)}
                    />
                    <Label
                      htmlFor={`${question.id}-${idx}`}
                      className="cursor-pointer text-sm text-slate-600 dark:text-slate-300"
                    >
                      {answer.text}
                    </Label>
                  </div>
                ))}
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
              <div className="space-y-2">
                {question.suggestedAnswers.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
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
                        {answer.text}
                      </Button>
                    ))}
                  </div>
                )}
                <Textarea
                  value={localAnswer}
                  onChange={(e) => setLocalAnswer(e.target.value)}
                  placeholder="Введите ваш ответ..."
                  className="min-h-[80px] text-sm"
                />
                <Button size="sm" onClick={handleOpenSubmit} disabled={!localAnswer.trim()}>
                  Ответить
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function MockVariant1Minimal({ questions }: MockVariant1MinimalProps) {
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

  return (
    <div className="space-y-4">
      {/* Progress indicator */}
      <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-300">
        <span>
          Отвечено: {answered} из {total}
        </span>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-red-500" />
            Обязательный
          </span>
          <span className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-amber-400" />
            Важный
          </span>
          <span className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-slate-300" />
            Желательный
          </span>
        </div>
      </div>

      {/* Questions */}
      <div className="space-y-3">
        {localQuestions.map((question) => (
          <QuestionCard
            key={question.id}
            question={question}
            onAnswer={(answer) => handleAnswer(question.id, answer)}
          />
        ))}
      </div>
    </div>
  )
}
