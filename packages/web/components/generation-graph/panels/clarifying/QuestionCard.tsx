'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  AlertCircle,
  AlertTriangle,
  Info,
  Check,
  Edit2,
  X,
  Lightbulb,
  CircleDot,
  CheckSquare,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
// MEDIUM-003: Import types from Single Source of Truth
import type { QuestionPriority, QuestionType } from '@megacampus/shared-types'

type CardMode = 'unanswered' | 'answered' | 'editing'

interface SuggestedAnswer {
  text: string
  rationale?: string
  is_recommended?: boolean
}

interface Question {
  id: string
  text: string
  type: QuestionType
  priority: QuestionPriority
  suggestedAnswers: SuggestedAnswer[]
  currentAnswer?: string
  currentAnswers?: string[] // For multi_choice
}

interface QuestionCardProps {
  question: Question
  onAnswer: (
    questionId: string,
    answer: string | string[], // string[] for multi_choice
    source: 'suggested' | 'modified' | 'custom',
    selectedSuggestionIndex?: number,
    selectedSuggestionIndexes?: number[] // For multi_choice
  ) => void
  onSkip?: (questionId: string) => void
  isAnswered: boolean
  isProcessing?: boolean
}

// MEDIUM-003: Typed config objects with Record for exhaustiveness checking
interface PriorityConfigItem {
  card: string
  badge: string
  icon: typeof AlertCircle
  label: string
  iconColor: string
}

interface TypeConfigItem {
  icon: typeof Lightbulb
  label: string
  color: string
  helperText: string
}

const priorityConfig: Record<QuestionPriority, PriorityConfigItem> = {
  critical: {
    card: 'border-l-4 border-l-red-500 border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20',
    badge: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    icon: AlertCircle,
    label: 'ОБЯЗАТЕЛЬНЫЙ',
    iconColor: 'text-red-500 dark:text-red-400',
  },
  important: {
    card: 'border-l-4 border-l-amber-500 border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
    icon: AlertTriangle,
    label: 'ВАЖНЫЙ',
    iconColor: 'text-amber-500 dark:text-amber-400',
  },
  nice_to_have: {
    card: 'border-l-4 border-l-slate-300 border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/20',
    badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    icon: Info,
    label: 'ЖЕЛАТЕЛЬНЫЙ',
    iconColor: 'text-slate-500 dark:text-slate-400',
  },
}

const typeConfig: Record<QuestionType, TypeConfigItem> = {
  open: {
    icon: Lightbulb,
    label: 'ОТКРЫТЫЙ ВОПРОС',
    color: 'text-blue-600 dark:text-blue-400',
    helperText: 'Рекомендуемый ответ (можно изменить)',
  },
  single_choice: {
    icon: CircleDot,
    label: 'ВЫБОР ОДНОГО ВАРИАНТА',
    color: 'text-purple-600 dark:text-purple-400',
    helperText: 'Выберите один вариант',
  },
  multi_choice: {
    icon: CheckSquare,
    label: 'ВЫБОР НЕСКОЛЬКИХ ВАРИАНТОВ',
    color: 'text-indigo-600 dark:text-indigo-400',
    helperText: 'Выберите один или несколько вариантов',
  },
}

export function QuestionCard({
  question,
  onAnswer,
  onSkip,
  isAnswered,
  isProcessing = false,
}: QuestionCardProps) {
  // Determine initial mode based on isAnswered prop
  const [mode, setMode] = useState<CardMode>(isAnswered ? 'answered' : 'unanswered')

  // BUG FIX: Sync mode with isAnswered prop changes
  // Track previous isAnswered value to detect when answer was just saved
  const prevIsAnswered = useRef(isAnswered)
  // Track previous answer to detect when answer was updated (for edit mode)
  const prevAnswer = useRef(question.currentAnswer)
  const prevAnswers = useRef(question.currentAnswers)

  useEffect(() => {
    // Case 1: If isAnswered just changed from false to true (new answer saved)
    if (isAnswered && !prevIsAnswered.current) {
      setMode('answered')
    }

    // Case 2: If we're in editing mode and currentAnswer/currentAnswers changed (edit saved)
    // This happens when user edits an existing answer and data is refetched
    if (mode === 'editing') {
      const answerChanged = question.currentAnswer !== prevAnswer.current
      const answersChanged =
        JSON.stringify(question.currentAnswers) !== JSON.stringify(prevAnswers.current)

      if (answerChanged || answersChanged) {
        setMode('answered')
      }
    }

    prevIsAnswered.current = isAnswered
    prevAnswer.current = question.currentAnswer
    prevAnswers.current = question.currentAnswers
  }, [isAnswered, question.currentAnswer, question.currentAnswers, mode])

  // Selection state (Phase 1: not saved yet)
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState<number | null>(null)
  const [selectedSuggestionIndexes, setSelectedSuggestionIndexes] = useState<number[]>([])
  const [customText, setCustomText] = useState('')
  const [hasCustomInput, setHasCustomInput] = useState(false)
  const [isCustomSelected, setIsCustomSelected] = useState(false)

  const priorityConf = priorityConfig[question.priority]
  const typeConf = typeConfig[question.type]
  const PriorityIcon = priorityConf.icon
  const TypeIcon = typeConf.icon
  const canSkip = question.priority === 'nice_to_have' && onSkip

  // Check if confirm button should be enabled
  const hasSelection = (() => {
    if (question.type === 'open') {
      return selectedSuggestionIndex !== null || customText.trim().length > 0
    }
    if (question.type === 'single_choice') {
      return selectedSuggestionIndex !== null || (isCustomSelected && customText.trim().length > 0)
    }
    if (question.type === 'multi_choice') {
      return (
        selectedSuggestionIndexes.length > 0 || (isCustomSelected && customText.trim().length > 0)
      )
    }
    return false
  })()

  // === OPEN QUESTION HANDLERS ===
  const handleAcceptSuggested = () => {
    if (question.suggestedAnswers.length > 0) {
      setSelectedSuggestionIndex(0)
      setHasCustomInput(false)
      setCustomText('')
    }
  }

  const handleModifySuggested = () => {
    if (question.suggestedAnswers.length > 0) {
      setCustomText(question.suggestedAnswers[0].text)
      setHasCustomInput(true)
      setSelectedSuggestionIndex(0) // Track that it's modified from suggestion
    }
  }

  const handleCustomTextChange = (value: string) => {
    setCustomText(value)
    setHasCustomInput(true)
    // Clear suggestion if user types from scratch
    if (!selectedSuggestionIndex && value.trim()) {
      setSelectedSuggestionIndex(null)
    }
  }

  // === SINGLE CHOICE HANDLERS ===
  const handleSingleChoiceSelect = (index: number) => {
    if (isProcessing || mode === 'answered') return
    setSelectedSuggestionIndex(index)
    setIsCustomSelected(false)
    setCustomText('')
  }

  const handleCustomSelectSingle = () => {
    if (isProcessing || mode === 'answered') return
    setSelectedSuggestionIndex(null)
    setIsCustomSelected(true)
  }

  // === MULTI CHOICE HANDLERS ===
  const handleMultiChoiceToggle = (index: number) => {
    if (isProcessing || mode === 'answered') return
    setSelectedSuggestionIndexes((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    )
  }

  const handleCustomToggleMulti = () => {
    if (isProcessing || mode === 'answered') return
    setIsCustomSelected((prev) => !prev)
    if (isCustomSelected) {
      setCustomText('')
    }
  }

  // === CONFIRM ANSWER (Phase 2: Save to backend) ===
  const handleConfirmAnswer = () => {
    if (!hasSelection || isProcessing) return

    // Optimistically switch to answered mode
    // If save fails, ClarifyingPanel will show error toast
    setMode('answered')

    if (question.type === 'open') {
      if (hasCustomInput && customText.trim()) {
        // Custom or modified answer
        const source = selectedSuggestionIndex !== null ? 'modified' : 'custom'
        onAnswer(question.id, customText.trim(), source, selectedSuggestionIndex ?? undefined)
      } else if (selectedSuggestionIndex !== null) {
        // Accepted suggested answer
        const answer = question.suggestedAnswers[selectedSuggestionIndex].text
        onAnswer(question.id, answer, 'suggested', selectedSuggestionIndex)
      }
    } else if (question.type === 'single_choice') {
      if (isCustomSelected && customText.trim()) {
        // User typed custom answer
        onAnswer(question.id, customText.trim(), 'custom')
      } else if (selectedSuggestionIndex !== null) {
        // User selected from suggestions
        const answer = question.suggestedAnswers[selectedSuggestionIndex].text
        onAnswer(question.id, answer, 'suggested', selectedSuggestionIndex)
      }
    } else if (question.type === 'multi_choice') {
      const answers = selectedSuggestionIndexes.map((idx) => question.suggestedAnswers[idx].text)
      if (isCustomSelected && customText.trim()) {
        answers.push(customText.trim())
      }
      if (answers.length > 0) {
        // If has custom → 'modified', else 'suggested'
        const source = isCustomSelected ? 'modified' : 'suggested'
        onAnswer(question.id, answers, source, undefined, selectedSuggestionIndexes)
      }
    }
  }

  // === EDIT MODE ===
  const handleEnterEditMode = () => {
    setMode('editing')
    // Pre-populate previous answer
    if (question.type === 'open' && question.currentAnswer) {
      setCustomText(question.currentAnswer)
      setHasCustomInput(true)
    } else if (question.type === 'single_choice' && question.currentAnswer) {
      const idx = question.suggestedAnswers.findIndex((s) => s.text === question.currentAnswer)
      if (idx !== -1) {
        setSelectedSuggestionIndex(idx)
        setIsCustomSelected(false)
      } else {
        // Answer was custom
        setSelectedSuggestionIndex(null)
        setIsCustomSelected(true)
        setCustomText(question.currentAnswer)
      }
    } else if (question.type === 'multi_choice' && question.currentAnswers) {
      // Find indexes of current answers
      const indexes = question.currentAnswers
        .map((ans) => question.suggestedAnswers.findIndex((s) => s.text === ans))
        .filter((idx) => idx !== -1)
      setSelectedSuggestionIndexes(indexes)
      // Check if any answer was custom (not in suggestions)
      const customAnswers = question.currentAnswers.filter(
        (ans) => !question.suggestedAnswers.some((s) => s.text === ans)
      )
      if (customAnswers.length > 0) {
        setIsCustomSelected(true)
        setCustomText(customAnswers[0]) // Take first custom answer
      } else {
        setIsCustomSelected(false)
      }
    }
  }

  const handleCancelEdit = () => {
    setMode('answered')
    // Reset selection state
    setSelectedSuggestionIndex(null)
    setSelectedSuggestionIndexes([])
    setCustomText('')
    setHasCustomInput(false)
    setIsCustomSelected(false)
  }

  // === RENDER ANSWERED STATE (Read Mode) ===
  const renderAnsweredState = () => {
    if (!question.currentAnswer && !question.currentAnswers) return null

    return (
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        className="space-y-3"
      >
        <div className="rounded-lg border-2 border-emerald-500 bg-emerald-50 p-4 dark:bg-emerald-950/30">
          <div className="mb-2 flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
              Ваш ответ:
            </span>
          </div>

          {question.type === 'multi_choice' && question.currentAnswers ? (
            <ul className="space-y-2">
              {question.currentAnswers.map((answer, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400">•</span>
                  <span className="text-sm text-emerald-900 dark:text-emerald-100">{answer}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-emerald-900 dark:text-emerald-100">
              {question.currentAnswer}
            </p>
          )}
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={handleEnterEditMode}
          disabled={isProcessing}
          className="w-full py-3"
        >
          <Edit2 className="mr-2 h-4 w-4" />
          Изменить ответ
        </Button>
      </motion.div>
    )
  }

  // === RENDER OPEN QUESTION (Unanswered/Editing) ===
  const renderOpenQuestion = () => {
    const hasSuggestion = question.suggestedAnswers.length > 0
    const suggestedAnswer = hasSuggestion ? question.suggestedAnswers[0] : null

    return (
      <div className="space-y-4">
        {/* Suggested Answer Section */}
        {suggestedAnswer && !hasCustomInput && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/20"
          >
            <div className="mb-2 flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span className="text-xs font-medium text-blue-900 dark:text-blue-100">
                💡 Рекомендуемый ответ:
              </span>
            </div>
            <p className="mb-2 text-sm text-blue-900 dark:text-blue-100">{suggestedAnswer.text}</p>
            {suggestedAnswer.rationale && (
              <p className="mb-3 text-xs text-blue-700 dark:text-blue-300">
                Потому что: {suggestedAnswer.rationale}
              </p>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleAcceptSuggested}
                disabled={isProcessing}
                className="py-3"
              >
                <Check className="mr-1 h-3.5 w-3.5" />
                Принять рекомендацию
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleModifySuggested}
                disabled={isProcessing}
                className="py-3"
              >
                <Edit2 className="mr-1 h-3.5 w-3.5" />
                Скорректировать
              </Button>
            </div>
          </motion.div>
        )}

        {/* Visual selection indicator for accepted suggestion */}
        {selectedSuggestionIndex !== null && !hasCustomInput && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-lg border-2 border-purple-500 bg-purple-50 p-3 dark:bg-purple-950/20"
          >
            <p className="text-sm font-medium text-purple-900 dark:text-purple-100">
              ✓ Выбран рекомендованный ответ
            </p>
          </motion.div>
        )}

        {/* Divider */}
        {suggestedAnswer && (
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
            <span className="text-xs text-slate-500 dark:text-slate-400">или</span>
            <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
          </div>
        )}

        {/* Custom Input Section */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
            ✏️ Ваш вариант:
          </label>
          <Textarea
            value={customText}
            onChange={(e) => handleCustomTextChange(e.target.value)}
            placeholder="Введите свой ответ..."
            className="min-h-[100px]"
            disabled={isProcessing}
          />
        </div>
      </div>
    )
  }

  // === RENDER SINGLE CHOICE QUESTION (Unanswered/Editing) ===
  const renderSingleChoiceQuestion = () => {
    return (
      <div className="space-y-2">
        {question.suggestedAnswers.map((suggestion, index) => {
          const isSelected = selectedSuggestionIndex === index
          const isRecommended = suggestion.is_recommended

          return (
            <button
              key={index}
              type="button"
              onClick={() => handleSingleChoiceSelect(index)}
              disabled={isProcessing}
              className={cn(
                'w-full rounded-lg border-2 p-4 text-left transition-all',
                'min-h-[56px] touch-manipulation', // Mobile touch target
                'hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/20',
                'disabled:cursor-not-allowed disabled:opacity-50',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2',
                isSelected
                  ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/20'
                  : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
              )}
            >
              <div className="flex items-start gap-3">
                {/* Radio button visual */}
                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                  {isSelected ? (
                    <CircleDot className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  ) : (
                    <div className="h-5 w-5 rounded-full border-2 border-slate-300 dark:border-slate-600" />
                  )}
                </div>

                <div className="flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {suggestion.text}
                    </p>
                    {isRecommended && (
                      <Badge
                        variant="secondary"
                        className="shrink-0 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                      >
                        Рекомендуем
                      </Badge>
                    )}
                  </div>
                  {suggestion.rationale && (
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                      → {suggestion.rationale}
                    </p>
                  )}
                </div>
              </div>
            </button>
          )
        })}

        {/* Custom option divider */}
        <div className="mt-4 flex items-center gap-2">
          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
          <span className="text-xs text-slate-500 dark:text-slate-400">или</span>
          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        </div>

        {/* Custom input option */}
        <button
          type="button"
          onClick={handleCustomSelectSingle}
          disabled={isProcessing}
          className={cn(
            'w-full rounded-lg border-2 p-4 text-left transition-all',
            'min-h-[56px] touch-manipulation',
            'hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/20',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2',
            isCustomSelected
              ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/20'
              : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
          )}
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
              {isCustomSelected ? (
                <CircleDot className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              ) : (
                <div className="h-5 w-5 rounded-full border-2 border-slate-300 dark:border-slate-600" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Свой вариант</p>
            </div>
          </div>
        </button>

        {/* Custom text input (shown when custom selected) */}
        {isCustomSelected && (
          <div className="mt-2 ml-8">
            <Textarea
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="Введите свой вариант..."
              className="min-h-[80px]"
              disabled={isProcessing}
            />
          </div>
        )}
      </div>
    )
  }

  // === RENDER MULTI CHOICE QUESTION (Unanswered/Editing) ===
  const renderMultiChoiceQuestion = () => {
    const selectedCount = selectedSuggestionIndexes.length

    return (
      <div className="space-y-2">
        {selectedCount > 0 && (
          <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
            Выбрано: {selectedCount} {selectedCount === 1 ? 'вариант' : 'вариантов'}
          </p>
        )}

        {question.suggestedAnswers.map((suggestion, index) => {
          const isSelected = selectedSuggestionIndexes.includes(index)
          const isRecommended = suggestion.is_recommended

          return (
            <button
              key={index}
              type="button"
              onClick={() => handleMultiChoiceToggle(index)}
              disabled={isProcessing}
              className={cn(
                'w-full rounded-lg border-2 p-4 text-left transition-all',
                'min-h-[56px] touch-manipulation', // Mobile touch target
                'hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/20',
                'disabled:cursor-not-allowed disabled:opacity-50',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2',
                isSelected
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/20'
                  : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
              )}
            >
              <div className="flex items-start gap-3">
                {/* Checkbox visual */}
                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                  {isSelected ? (
                    <CheckSquare className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  ) : (
                    <div className="h-5 w-5 rounded border-2 border-slate-300 dark:border-slate-600" />
                  )}
                </div>

                <div className="flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {suggestion.text}
                    </p>
                    {isRecommended && (
                      <Badge
                        variant="secondary"
                        className="shrink-0 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                      >
                        Рекомендуем
                      </Badge>
                    )}
                  </div>
                  {suggestion.rationale && (
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                      {suggestion.rationale}
                    </p>
                  )}
                </div>
              </div>
            </button>
          )
        })}

        {/* Custom option divider */}
        <div className="mt-4 flex items-center gap-2">
          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
          <span className="text-xs text-slate-500 dark:text-slate-400">дополнительно</span>
          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        </div>

        {/* Custom input option */}
        <button
          type="button"
          onClick={handleCustomToggleMulti}
          disabled={isProcessing}
          className={cn(
            'w-full rounded-lg border-2 p-4 text-left transition-all',
            'min-h-[56px] touch-manipulation',
            'hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/20',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2',
            isCustomSelected
              ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/20'
              : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
          )}
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
              {isCustomSelected ? (
                <CheckSquare className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              ) : (
                <div className="h-5 w-5 rounded border-2 border-slate-300 dark:border-slate-600" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Свой вариант</p>
            </div>
          </div>
        </button>

        {/* Custom text input (shown when custom selected) */}
        {isCustomSelected && (
          <div className="mt-2 ml-8">
            <Textarea
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="Введите дополнительный вариант..."
              className="min-h-[80px]"
              disabled={isProcessing}
            />
          </div>
        )}
      </div>
    )
  }

  // === RENDER ACTION BUTTONS ===
  const renderActionButtons = () => {
    if (mode === 'answered') return null

    const isEditing = mode === 'editing'
    const confirmLabel = isEditing ? 'Подтвердить изменения' : 'Подтвердить ответ'

    return (
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={handleConfirmAnswer}
          disabled={!hasSelection || isProcessing}
          className="flex-1 py-3"
        >
          {isProcessing ? (
            <>
              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-white" />
              Сохранение...
            </>
          ) : (
            <>
              <Check className="mr-2 h-4 w-4" />
              {confirmLabel}
            </>
          )}
        </Button>

        {isEditing && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleCancelEdit}
            disabled={isProcessing}
            className="py-3"
          >
            <X className="mr-1 h-4 w-4" />
            Отмена
          </Button>
        )}

        {canSkip && !isEditing && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onSkip(question.id)}
            disabled={isProcessing}
            className="py-3"
          >
            Пропустить
          </Button>
        )}
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className={cn(priorityConf.card, 'relative overflow-hidden')}>
        {/* Loading overlay (MEDIUM-004 fix) */}
        {isProcessing && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 dark:bg-slate-900/60">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-purple-600 dark:border-purple-400" />
          </div>
        )}
        <CardContent className="space-y-4 p-4">
          {/* Type & Priority Header */}
          <div className="space-y-2">
            {/* Question Type Indicator */}
            <div className="flex items-center gap-2">
              <TypeIcon className={cn('h-5 w-5', typeConf.color)} />
              <span className={cn('text-xs font-bold uppercase', typeConf.color)}>
                {typeConf.label}
              </span>
            </div>

            {/* Priority Badge */}
            <div className="flex items-start gap-2">
              <PriorityIcon className={cn('mt-0.5 h-5 w-5 shrink-0', priorityConf.iconColor)} />
              <div className="flex-1">
                <Badge className={cn(priorityConf.badge, 'text-xs')}>{priorityConf.label}</Badge>
              </div>
              {isAnswered && mode === 'answered' && (
                <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <Check className="h-4 w-4" />
                  <span className="text-xs font-medium">Отвечено</span>
                </div>
              )}
            </div>
          </div>

          {/* Question Text */}
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              {question.text}
            </p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{typeConf.helperText}</p>
          </div>

          {/* Main Content (Conditional based on mode) */}
          <AnimatePresence mode="wait">
            {mode === 'answered' ? (
              <motion.div
                key="answered"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {renderAnsweredState()}
              </motion.div>
            ) : (
              <motion.div
                key="selection"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                {/* Question Type Specific UI */}
                {question.type === 'open' && renderOpenQuestion()}
                {question.type === 'single_choice' && renderSingleChoiceQuestion()}
                {question.type === 'multi_choice' && renderMultiChoiceQuestion()}

                {/* Action Buttons */}
                {renderActionButtons()}
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </motion.div>
  )
}
