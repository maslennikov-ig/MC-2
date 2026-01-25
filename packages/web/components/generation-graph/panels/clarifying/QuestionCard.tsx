'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, AlertTriangle, Info, Check, Edit2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'

type QuestionPriority = 'critical' | 'important' | 'nice_to_have'

interface SuggestedAnswer {
  text: string
  rationale?: string
}

interface Question {
  id: string
  text: string
  priority: QuestionPriority
  suggestedAnswers: SuggestedAnswer[]
  currentAnswer?: string
}

interface QuestionCardProps {
  question: Question
  onAnswer: (
    questionId: string,
    answer: string,
    source: 'suggested' | 'modified' | 'custom'
  ) => void
  onSkip?: (questionId: string) => void
  isAnswered: boolean
  isProcessing?: boolean
}

const priorityConfig = {
  critical: {
    card: 'border-l-4 border-l-red-500 border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20',
    badge: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    icon: AlertCircle,
    label: 'ОБЯЗАТЕЛЬНЫЙ',
  },
  important: {
    card: 'border-l-4 border-l-amber-500 border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
    icon: AlertTriangle,
    label: 'ВАЖНЫЙ',
  },
  nice_to_have: {
    card: 'border-l-4 border-l-slate-300 border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/20',
    badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    icon: Info,
    label: 'ЖЕЛАТЕЛЬНЫЙ',
  },
}

export function QuestionCard({
  question,
  onAnswer,
  onSkip,
  isAnswered,
  isProcessing = false,
}: QuestionCardProps) {
  const [mode, setMode] = useState<'select' | 'modify' | 'custom'>('select')
  const [modifiedAnswer, setModifiedAnswer] = useState('')
  const [customAnswer, setCustomAnswer] = useState('')
  const [selectedSuggestion, setSelectedSuggestion] = useState<number | null>(null)

  const config = priorityConfig[question.priority]
  const Icon = config.icon
  const canSkip = question.priority === 'nice_to_have' && onSkip

  const handleSuggestionClick = (index: number) => {
    if (isAnswered || isProcessing) return

    setSelectedSuggestion(index)
    const answer = question.suggestedAnswers[index].text
    onAnswer(question.id, answer, 'suggested')
  }

  const handleModify = () => {
    if (selectedSuggestion !== null) {
      setModifiedAnswer(question.suggestedAnswers[selectedSuggestion].text)
      setMode('modify')
    }
  }

  const handleSaveModified = () => {
    if (modifiedAnswer.trim()) {
      onAnswer(question.id, modifiedAnswer, 'modified')
      setMode('select')
    }
  }

  const handleSaveCustom = () => {
    if (customAnswer.trim()) {
      onAnswer(question.id, customAnswer, 'custom')
      setMode('select')
    }
  }

  const handleCancelEdit = () => {
    setMode('select')
    setModifiedAnswer('')
    setCustomAnswer('')
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className={cn(config.card, 'overflow-hidden')}>
        <CardContent className="p-4">
          {/* Header */}
          <div className="mb-3 flex items-start justify-between">
            <div className="flex flex-1 items-start gap-2">
              <Icon className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="flex-1">
                <p className="mb-1 text-sm font-medium">{question.text}</p>
                <Badge className={cn(config.badge, 'text-xs')}>{config.label}</Badge>
              </div>
            </div>
            {isAnswered && (
              <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <Check className="h-4 w-4" />
                <span className="text-xs font-medium">Отвечено</span>
              </div>
            )}
          </div>

          {/* Current Answer (if answered) */}
          {isAnswered && question.currentAnswer && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950/30"
            >
              <p className="text-sm text-emerald-900 dark:text-emerald-100">
                <strong>Ваш ответ:</strong> {question.currentAnswer}
              </p>
            </motion.div>
          )}

          {/* Answer Selection */}
          {!isAnswered && mode === 'select' && (
            <div className="space-y-2">
              <p className="mb-2 text-xs text-slate-600 dark:text-slate-400">
                Выберите подходящий вариант или введите свой:
              </p>

              {/* Suggested Answers */}
              {question.suggestedAnswers.map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => handleSuggestionClick(index)}
                  disabled={isProcessing}
                  className={cn(
                    'w-full rounded-lg border-2 p-3 text-left transition-all',
                    'hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/20',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    selectedSuggestion === index
                      ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/20'
                      : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
                  )}
                >
                  <p className="mb-1 text-sm font-medium">{suggestion.text}</p>
                  {suggestion.rationale && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {suggestion.rationale}
                    </p>
                  )}
                </button>
              ))}

              {/* Action Buttons */}
              <div className="mt-3 flex gap-2">
                {selectedSuggestion !== null && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleModify}
                    disabled={isProcessing}
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                    Скорректировать
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setMode('custom')}
                  disabled={isProcessing}
                >
                  Свой вариант
                </Button>
                {canSkip && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onSkip(question.id)}
                    disabled={isProcessing}
                    className="ml-auto"
                  >
                    Пропустить
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Modify Mode */}
          {mode === 'modify' && (
            <div className="space-y-2">
              <label className="text-xs text-slate-600 dark:text-slate-400">
                Отредактируйте ответ:
              </label>
              <Textarea
                value={modifiedAnswer}
                onChange={(e) => setModifiedAnswer(e.target.value)}
                placeholder="Скорректируйте текст..."
                className="min-h-[80px]"
                disabled={isProcessing}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleSaveModified}
                  disabled={!modifiedAnswer.trim() || isProcessing}
                >
                  <Check className="h-3.5 w-3.5" />
                  Сохранить
                </Button>
                <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                  <X className="h-3.5 w-3.5" />
                  Отмена
                </Button>
              </div>
            </div>
          )}

          {/* Custom Mode */}
          {mode === 'custom' && (
            <div className="space-y-2">
              <label className="text-xs text-slate-600 dark:text-slate-400">
                Введите свой ответ:
              </label>
              <Textarea
                value={customAnswer}
                onChange={(e) => setCustomAnswer(e.target.value)}
                placeholder="Ваш ответ..."
                className="min-h-[80px]"
                disabled={isProcessing}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleSaveCustom}
                  disabled={!customAnswer.trim() || isProcessing}
                >
                  <Check className="h-3.5 w-3.5" />
                  Сохранить
                </Button>
                <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                  <X className="h-3.5 w-3.5" />
                  Отмена
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
