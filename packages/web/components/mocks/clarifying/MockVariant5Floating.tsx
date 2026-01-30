'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Check, Circle, MessageSquare, ListChecks, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import type { MockQuestion } from './mockData'
import type { QuestionPriority, QuestionType } from '@megacampus/shared-types'

interface MockVariant5FloatingProps {
  questions: MockQuestion[]
}

const prioritySections: Record<
  QuestionPriority,
  { title: string; description: string; bgColor: string; borderColor: string }
> = {
  critical: {
    title: 'Обязательные',
    description: 'Необходимо ответить для продолжения',
    bgColor: 'bg-red-50 dark:bg-red-950/20',
    borderColor: 'border-red-200 dark:border-red-900',
  },
  important: {
    title: 'Важные',
    description: 'Рекомендуется ответить для лучшего результата',
    bgColor: 'bg-amber-50 dark:bg-amber-950/20',
    borderColor: 'border-amber-200 dark:border-amber-900',
  },
  nice_to_have: {
    title: 'Дополнительные',
    description: 'Опционально, помогут уточнить детали',
    bgColor: 'bg-slate-50 dark:bg-slate-900/30',
    borderColor: 'border-slate-200 dark:border-slate-800',
  },
}

const typeIcons: Record<QuestionType, typeof MessageSquare> = {
  open: MessageSquare,
  single_choice: Circle,
  multi_choice: ListChecks,
}

interface FloatingCardProps {
  question: MockQuestion
  onAnswer: (answer: string | string[]) => void
}

function FloatingCard({ question, onAnswer }: FloatingCardProps) {
  const [localAnswer, setLocalAnswer] = useState<string>(question.currentAnswer || '')
  const [localAnswers, setLocalAnswers] = useState<string[]>(question.currentAnswers || [])
  const [isExpanded, setIsExpanded] = useState(!question.isAnswered)

  const TypeIcon = typeIcons[question.type]
  const isAnswered = question.isAnswered

  const handleSingleSelect = (value: string) => {
    setLocalAnswer(value)
    onAnswer(value)
    setIsExpanded(false)
  }

  const handleMultiSelect = (value: string, checked: boolean) => {
    const newAnswers = checked ? [...localAnswers, value] : localAnswers.filter((a) => a !== value)
    setLocalAnswers(newAnswers)
  }

  const handleMultiSubmit = () => {
    if (localAnswers.length > 0) {
      onAnswer(localAnswers)
      setIsExpanded(false)
    }
  }

  const handleOpenSubmit = () => {
    if (localAnswer.trim()) {
      onAnswer(localAnswer)
      setIsExpanded(false)
    }
  }

  const displayAnswer =
    question.type === 'multi_choice'
      ? (question.currentAnswers || localAnswers).join(', ')
      : question.currentAnswer || localAnswer

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
    >
      <Card
        className={cn(
          'shadow-sm transition-shadow duration-200 hover:shadow-md',
          'border-slate-200 dark:border-slate-700',
          isAnswered && 'bg-white/80 dark:bg-slate-900/80'
        )}
      >
        <CardContent className="p-0">
          {/* Header - always visible */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex w-full items-center gap-3 p-4 text-left"
          >
            <div
              className={cn(
                'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-colors',
                isAnswered
                  ? 'bg-emerald-100 dark:bg-emerald-900/30'
                  : 'bg-slate-100 dark:bg-slate-800'
              )}
            >
              {isAnswered ? (
                <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <TypeIcon className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  'text-sm font-medium',
                  isAnswered
                    ? 'text-slate-500 dark:text-slate-400'
                    : 'text-slate-700 dark:text-slate-200'
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

            <div className="flex-shrink-0">
              {isExpanded ? (
                <ChevronUp className="h-5 w-5 text-slate-400" />
              ) : (
                <ChevronDown className="h-5 w-5 text-slate-400" />
              )}
            </div>
          </button>

          {/* Expandable content */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="border-t border-slate-100 px-4 pt-0 pb-4 dark:border-slate-800">
                  <div className="space-y-3 pt-4">
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
                              'flex items-center space-x-3 rounded-lg p-2.5 transition-colors',
                              'hover:bg-slate-50 dark:hover:bg-slate-800/50',
                              answer.is_recommended && 'bg-purple-50/50 dark:bg-purple-950/20'
                            )}
                          >
                            <RadioGroupItem
                              value={answer.text}
                              id={`float-${question.id}-${idx}`}
                            />
                            <Label
                              htmlFor={`float-${question.id}-${idx}`}
                              className="flex-1 cursor-pointer text-sm text-slate-600 dark:text-slate-300"
                            >
                              {answer.text}
                              {answer.is_recommended && (
                                <span className="ml-2 text-xs text-purple-500">Рекомендуется</span>
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
                              'flex items-center space-x-3 rounded-lg p-2.5 transition-colors',
                              'hover:bg-slate-50 dark:hover:bg-slate-800/50',
                              answer.is_recommended && 'bg-purple-50/50 dark:bg-purple-950/20'
                            )}
                          >
                            <Checkbox
                              id={`float-${question.id}-${idx}`}
                              checked={
                                localAnswers.includes(answer.text) ||
                                (question.currentAnswers || []).includes(answer.text)
                              }
                              onCheckedChange={(checked) =>
                                handleMultiSelect(answer.text, !!checked)
                              }
                            />
                            <Label
                              htmlFor={`float-${question.id}-${idx}`}
                              className="flex-1 cursor-pointer text-sm text-slate-600 dark:text-slate-300"
                            >
                              {answer.text}
                              {answer.is_recommended && (
                                <span className="ml-2 text-xs text-purple-500">Рекомендуется</span>
                              )}
                            </Label>
                          </div>
                        ))}
                        <Button
                          size="sm"
                          onClick={handleMultiSubmit}
                          disabled={localAnswers.length === 0}
                          className="mt-3 w-full"
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
                                  answer.is_recommended &&
                                    'border-purple-200 dark:border-purple-800'
                                )}
                              >
                                {answer.text.length > 25
                                  ? answer.text.slice(0, 25) + '...'
                                  : answer.text}
                              </Button>
                            ))}
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
                          disabled={!localAnswer.trim()}
                          className="w-full"
                        >
                          {isAnswered ? 'Обновить' : 'Ответить'}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </motion.div>
  )
}

interface PrioritySectionProps {
  priority: QuestionPriority
  questions: MockQuestion[]
  onAnswer: (questionId: string, answer: string | string[]) => void
}

function PrioritySection({ priority, questions, onAnswer }: PrioritySectionProps) {
  const section = prioritySections[priority]
  const answered = questions.filter((q) => q.isAnswered).length
  const total = questions.length
  const isComplete = answered === total

  if (questions.length === 0) return null

  return (
    <div className={cn('rounded-xl border p-4', section.bgColor, section.borderColor)}>
      {/* Section header */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {section.title}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">{section.description}</p>
        </div>
        <div
          className={cn(
            'rounded-full px-2.5 py-1 text-xs font-medium',
            isComplete
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
              : 'bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-300'
          )}
        >
          {answered}/{total}
        </div>
      </div>

      {/* Questions */}
      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {questions.map((question) => (
            <FloatingCard
              key={question.id}
              question={question}
              onAnswer={(answer) => onAnswer(question.id, answer)}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}

export function MockVariant5Floating({ questions }: MockVariant5FloatingProps) {
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

  const criticalQuestions = localQuestions.filter((q) => q.priority === 'critical')
  const importantQuestions = localQuestions.filter((q) => q.priority === 'important')
  const niceToHaveQuestions = localQuestions.filter((q) => q.priority === 'nice_to_have')

  const totalAnswered = localQuestions.filter((q) => q.isAnswered).length
  const totalQuestions = localQuestions.length

  return (
    <div className="space-y-4">
      {/* Overall progress */}
      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        <span className="text-sm text-slate-600 dark:text-slate-300">Общий прогресс</span>
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {localQuestions.map((q) => (
              <div
                key={q.id}
                className={cn(
                  'h-2 w-2 rounded-full transition-colors duration-300',
                  q.isAnswered ? 'bg-emerald-400' : 'bg-slate-200 dark:bg-slate-600'
                )}
              />
            ))}
          </div>
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {totalAnswered}/{totalQuestions}
          </span>
        </div>
      </div>

      {/* Priority sections */}
      <div className="space-y-4">
        <PrioritySection
          priority="critical"
          questions={criticalQuestions}
          onAnswer={handleAnswer}
        />
        <PrioritySection
          priority="important"
          questions={importantQuestions}
          onAnswer={handleAnswer}
        />
        <PrioritySection
          priority="nice_to_have"
          questions={niceToHaveQuestions}
          onAnswer={handleAnswer}
        />
      </div>
    </div>
  )
}
