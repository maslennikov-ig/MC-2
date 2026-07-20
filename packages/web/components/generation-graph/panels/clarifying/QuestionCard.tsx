'use client'

import { useTranslations } from 'next-intl'
import { useState, useEffect } from 'react'
import { usePrevious } from '@/lib/hooks/use-previous'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
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
import { CategoryBadge } from '@/components/ui/category-badge'
import { DocumentEvidenceDetails } from './DocumentEvidenceDetails'
// MEDIUM-003: Import types from Single Source of Truth
import type {
  DocumentEvidenceQuestionMetadata,
  QuestionPriority,
  QuestionType,
} from '@megacampus/shared-types'

type CardMode = 'unanswered' | 'answered' | 'editing'

interface SuggestedAnswer {
  text: string
  value?: string
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
  category?: string
  evidenceMetadata?: DocumentEvidenceQuestionMetadata
  evidenceMetadataInvalid?: boolean
  answerSource?: 'suggested' | 'modified' | 'custom' | 'system'
}

interface QuestionCardProps {
  question: Question
  onAnswer: (
    questionId: string,
    answer: string | string[], // string[] for multi_choice
    source: 'suggested' | 'modified' | 'custom',
    selectedSuggestionIndex?: number,
    selectedSuggestionIndexes?: number[] // For multi_choice
  ) => Promise<boolean> | boolean | void
  onSkip?: (questionId: string) => void
  isAnswered: boolean
  isProcessing?: boolean
  /** When true, shows the card in read-only mode (no editing allowed) */
  readOnly?: boolean
}

// MEDIUM-003: Typed config objects with Record for exhaustiveness checking
interface PriorityConfigItem {
  card: string
  badge: string
  icon: typeof AlertCircle
  iconColor: string
}

interface TypeConfigItem {
  icon: typeof Lightbulb
  color: string
}

const priorityConfig: Record<QuestionPriority, PriorityConfigItem> = {
  critical: {
    card: 'border-l-2 border-l-red-500 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900',
    badge: '',
    icon: AlertCircle,
    iconColor: 'text-red-500 dark:text-red-400',
  },
  important: {
    card: 'border-l-2 border-l-amber-400 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900',
    badge: '',
    icon: AlertTriangle,
    iconColor: 'text-amber-500 dark:text-amber-400',
  },
  nice_to_have: {
    card: 'border-l-2 border-l-slate-300 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900',
    badge: '',
    icon: Info,
    iconColor: 'text-slate-400 dark:text-slate-500',
  },
}

const typeConfig: Record<QuestionType, TypeConfigItem> = {
  open: {
    icon: Lightbulb,
    color: 'text-slate-500 dark:text-slate-400',
  },
  single_choice: {
    icon: CircleDot,
    color: 'text-slate-500 dark:text-slate-400',
  },
  multi_choice: {
    icon: CheckSquare,
    color: 'text-slate-500 dark:text-slate-400',
  },
}

export function QuestionCard({
  question,
  onAnswer,
  onSkip: _onSkip, // Skip is now handled in WizardNavigation, kept for API compatibility
  isAnswered,
  isProcessing = false,
  readOnly = false,
}: QuestionCardProps) {
  const t = useTranslations('generation.clarifying')
  const isDocumentEvidence = question.category === 'document_conflicts'
  const isSystemDecision = isDocumentEvidence && question.answerSource === 'system'
  const effectiveReadOnly = readOnly || isSystemDecision

  // Determine initial mode based on isAnswered prop (or readOnly)
  // In readOnly mode, always show answered state
  const [mode, setMode] = useState<CardMode>(
    isAnswered || effectiveReadOnly ? 'answered' : 'unanswered'
  )

  // BUG FIX: Sync mode with isAnswered prop changes
  // Track previous isAnswered value to detect when answer was just saved
  const prevIsAnswered = usePrevious(isAnswered)
  useEffect(() => {
    // Case 1: If isAnswered just changed from false to true (new answer saved)
    if (isAnswered && prevIsAnswered === false) {
      setMode('answered')
    }
  }, [isAnswered, prevIsAnswered])

  // Selection state (Phase 1: not saved yet)
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState<number | null>(null)
  const [selectedSuggestionIndexes, setSelectedSuggestionIndexes] = useState<number[]>([])
  const [customText, setCustomText] = useState('')
  const [hasCustomInput, setHasCustomInput] = useState(false)
  const [isCustomSelected, setIsCustomSelected] = useState(false)

  const priorityConf = priorityConfig[question.priority]
  const typeConf = typeConfig[question.type]
  const TypeIcon = typeConf.icon

  // i18n labels resolved inside component (cannot call hooks outside)
  const typeI18nKey: Record<QuestionType, string> = {
    open: 'open_ended',
    single_choice: 'single_choice',
    multi_choice: 'multiple_choice',
  }
  const typeLabel = t(`questionType.${typeI18nKey[question.type]}` as Parameters<typeof t>[0])
  const typeHelperText = t(
    `questionType.${typeI18nKey[question.type]}Helper` as Parameters<typeof t>[0]
  )
  const priorityLabel = t(`priorityLabel.${question.priority}`)

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
    if (question.suggestedAnswers.length > 0 && !isProcessing) {
      // Оптимистично переключаем в answered режим
      setSelectedSuggestionIndex(0)
      setHasCustomInput(false)
      setCustomText('')
      setMode('answered')

      // Сразу сохраняем на сервер
      const answer = question.suggestedAnswers[0].text
      onAnswer(question.id, answer, 'suggested', 0)
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
  const handleConfirmAnswer = async () => {
    if (!hasSelection || isProcessing) return

    let saved = false

    if (question.type === 'open') {
      if (hasCustomInput && customText.trim()) {
        // Custom or modified answer
        const source = selectedSuggestionIndex !== null ? 'modified' : 'custom'
        saved =
          (await onAnswer(
            question.id,
            customText.trim(),
            source,
            selectedSuggestionIndex ?? undefined
          )) !== false
      } else if (selectedSuggestionIndex !== null) {
        // Accepted suggested answer
        const answer = question.suggestedAnswers[selectedSuggestionIndex].text
        saved =
          (await onAnswer(question.id, answer, 'suggested', selectedSuggestionIndex)) !== false
      }
    } else if (question.type === 'single_choice') {
      if (isCustomSelected && customText.trim()) {
        // User typed custom answer
        saved = (await onAnswer(question.id, customText.trim(), 'custom')) !== false
      } else if (selectedSuggestionIndex !== null) {
        // User selected from suggestions
        const answer = question.suggestedAnswers[selectedSuggestionIndex].text
        saved =
          (await onAnswer(question.id, answer, 'suggested', selectedSuggestionIndex)) !== false
      }
    } else if (question.type === 'multi_choice') {
      const answers = selectedSuggestionIndexes.map((idx) => question.suggestedAnswers[idx].text)
      const hasCustom = isCustomSelected && customText.trim()
      if (hasCustom) {
        answers.push(customText.trim())
      }
      if (answers.length > 0) {
        // Determine source based on combination of selections:
        // - Only custom text (no suggestions) → 'custom'
        // - Suggestions + custom text → 'modified'
        // - Only suggestions → 'suggested'
        let source: 'suggested' | 'modified' | 'custom' = 'suggested'
        if (hasCustom && selectedSuggestionIndexes.length === 0) {
          source = 'custom'
        } else if (hasCustom && selectedSuggestionIndexes.length > 0) {
          source = 'modified'
        }
        saved =
          (await onAnswer(question.id, answers, source, undefined, selectedSuggestionIndexes)) !==
          false
      }
    }

    if (saved) setMode('answered')
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
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-800 dark:bg-emerald-950/20">
          <div className="mb-2 flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {isSystemDecision ? t('documentEvidence.systemDecision') : t('yourAnswer')}
            </span>
          </div>

          {isSystemDecision && (
            <p
              data-testid="system-decision-description"
              className="mb-3 text-xs text-slate-600 dark:text-slate-400"
            >
              {t('documentEvidence.systemDecisionDescription')}
            </p>
          )}

          {question.type === 'multi_choice' && question.currentAnswers ? (
            <ul className="space-y-2">
              {question.currentAnswers.map((answer, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400">•</span>
                  <span className="text-sm text-slate-800 dark:text-slate-100">{answer}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-800 dark:text-slate-100">{question.currentAnswer}</p>
          )}
        </div>

        {/* Hide edit button in read-only mode */}
        {!effectiveReadOnly && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleEnterEditMode}
            disabled={isProcessing}
            className="w-full py-3"
          >
            <Edit2 className="mr-2 h-4 w-4" />
            {t('editAnswer')}
          </Button>
        )}
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
                {'\uD83D\uDCA1'} {t('suggestedAnswer')}
              </span>
            </div>
            <p className="mb-2 text-sm text-blue-900 dark:text-blue-100">{suggestedAnswer.text}</p>
            {suggestedAnswer.rationale && (
              <p className="mb-3 text-xs text-blue-700 dark:text-blue-300">
                {t('because', { rationale: suggestedAnswer.rationale })}
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
                {t('acceptSuggestion')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleModifySuggested}
                disabled={isProcessing}
                className="py-3"
              >
                <Edit2 className="mr-1 h-3.5 w-3.5" />
                {t('adjustAnswer')}
              </Button>
            </div>
          </motion.div>
        )}

        {/* Divider */}
        {suggestedAnswer && (
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
            <span className="text-xs text-slate-500 dark:text-slate-400">{t('or')}</span>
            <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
          </div>
        )}

        {/* Custom Input Section */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
            {'\u270F\uFE0F'} {t('yourVariant')}
          </label>
          <Textarea
            value={customText}
            onChange={(e) => handleCustomTextChange(e.target.value)}
            placeholder={t('enterYourAnswer')}
            className="min-h-[100px]"
            disabled={isProcessing}
          />
        </div>
      </div>
    )
  }

  // === RENDER SINGLE CHOICE QUESTION (Unanswered/Editing) ===
  const renderSingleChoiceQuestion = () => {
    if (isDocumentEvidence) {
      return (
        <RadioGroup
          value={selectedSuggestionIndex === null ? '' : String(selectedSuggestionIndex)}
          onValueChange={(value) => handleSingleChoiceSelect(Number(value))}
          onKeyDown={(event) => {
            if (!['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(event.key)) return
            const currentValue = Number((event.target as HTMLButtonElement).value)
            if (!Number.isInteger(currentValue)) return
            const direction = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1
            const nextIndex =
              (currentValue + direction + question.suggestedAnswers.length) %
              question.suggestedAnswers.length
            event.preventDefault()
            handleSingleChoiceSelect(nextIndex)
            document.getElementById(`document-conflict-${question.id}-${nextIndex}`)?.focus()
          }}
          className="space-y-2"
          aria-label={question.text}
          required={question.priority !== 'nice_to_have'}
          disabled={isProcessing}
        >
          {question.suggestedAnswers.map((suggestion, index) => {
            const isSelected = selectedSuggestionIndex === index
            const optionId = `document-conflict-${question.id}-${index}`

            return (
              <div
                key={optionId}
                className={cn(
                  'flex min-h-[56px] items-start gap-3 rounded-lg border-2 p-4 transition-colors',
                  isSelected
                    ? 'border-orange-500 bg-orange-50 dark:border-orange-500 dark:bg-orange-950/25'
                    : 'border-slate-200 bg-white hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900'
                )}
              >
                <RadioGroupItem value={String(index)} id={optionId} className="mt-0.5" />
                <Label htmlFor={optionId} className="min-w-0 flex-1 cursor-pointer">
                  <span className="flex items-start justify-between gap-2">
                    <span
                      data-testid={`document-option-${index}`}
                      className="text-sm font-medium text-slate-900 dark:text-slate-100"
                    >
                      {suggestion.text}
                    </span>
                    {suggestion.is_recommended && (
                      <Badge
                        variant="secondary"
                        className="shrink-0 bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200"
                      >
                        {t('recommended')}
                      </Badge>
                    )}
                  </span>
                  {suggestion.rationale && (
                    <span className="mt-1 block text-xs text-slate-600 dark:text-slate-400">
                      {suggestion.rationale}
                    </span>
                  )}
                </Label>
              </div>
            )
          })}
        </RadioGroup>
      )
    }

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
                'hover:border-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800',
                'disabled:cursor-not-allowed disabled:opacity-50',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2',
                isSelected
                  ? 'border-slate-400 bg-slate-50 dark:border-slate-500 dark:bg-slate-800'
                  : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
              )}
            >
              <div className="flex items-start gap-3">
                {/* Radio button visual */}
                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                  {isSelected ? (
                    <CircleDot className="h-5 w-5 text-slate-700 dark:text-slate-300" />
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
                        {t('recommended')}
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
          <span className="text-xs text-slate-500 dark:text-slate-400">{t('or')}</span>
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
            'hover:border-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2',
            isCustomSelected
              ? 'border-slate-400 bg-slate-50 dark:border-slate-500 dark:bg-slate-800'
              : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
          )}
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
              {isCustomSelected ? (
                <CircleDot className="h-5 w-5 text-slate-700 dark:text-slate-300" />
              ) : (
                <div className="h-5 w-5 rounded-full border-2 border-slate-300 dark:border-slate-600" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {t('ownVariant')}
              </p>
            </div>
          </div>
        </button>

        {/* Custom text input (shown when custom selected) */}
        {isCustomSelected && (
          <div className="mt-2 ml-8">
            <Textarea
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder={t('enterYourVariant')}
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
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {t('selected', { count: selectedCount })}
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
                'hover:border-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800',
                'disabled:cursor-not-allowed disabled:opacity-50',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2',
                isSelected
                  ? 'border-slate-400 bg-slate-50 dark:border-slate-500 dark:bg-slate-800'
                  : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
              )}
            >
              <div className="flex items-start gap-3">
                {/* Checkbox visual */}
                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                  {isSelected ? (
                    <CheckSquare className="h-5 w-5 text-slate-700 dark:text-slate-300" />
                  ) : (
                    <div className="h-5 w-5 rounded-sm border-2 border-slate-300 dark:border-slate-600" />
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
                        {t('recommended')}
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
          <span className="text-xs text-slate-500 dark:text-slate-400">{t('additionally')}</span>
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
            'hover:border-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2',
            isCustomSelected
              ? 'border-slate-400 bg-slate-50 dark:border-slate-500 dark:bg-slate-800'
              : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
          )}
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
              {isCustomSelected ? (
                <CheckSquare className="h-5 w-5 text-slate-700 dark:text-slate-300" />
              ) : (
                <div className="h-5 w-5 rounded-sm border-2 border-slate-300 dark:border-slate-600" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {t('ownVariant')}
              </p>
            </div>
          </div>
        </button>

        {/* Custom text input (shown when custom selected) */}
        {isCustomSelected && (
          <div className="mt-2 ml-8">
            <Textarea
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder={t('enterAdditionalVariant')}
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
    const confirmLabel = isEditing ? t('confirmChanges') : t('confirmAnswer')

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
              {t('saving')}
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
            {t('cancelEdit')}
          </Button>
        )}
      </div>
    )
  }

  return (
    <motion.div
      id={`clarifying-question-${question.id}`}
      tabIndex={-1}
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
          <div className="mb-3 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <TypeIcon className="h-4 w-4" />
            <span>{typeLabel}</span>
            <span>•</span>
            <div
              className={cn('h-2 w-2 rounded-full', {
                'bg-red-500': question.priority === 'critical',
                'bg-amber-400': question.priority === 'important',
                'bg-slate-300 dark:bg-slate-500': question.priority === 'nice_to_have',
              })}
            />
            <span>{priorityLabel}</span>
            {question.category && (
              <>
                <span>•</span>
                <CategoryBadge category={question.category} size="sm" />
              </>
            )}
            {isAnswered && mode === 'answered' && (
              <span className="ml-auto flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                <Check className="h-3 w-3" />
                {t('answeredBadge')}
              </span>
            )}
            {isDocumentEvidence && (
              <Badge variant="outline" className="ml-auto" data-testid="document-decision-badge">
                {isSystemDecision
                  ? t('documentEvidence.systemDecision')
                  : question.priority === 'nice_to_have'
                    ? t('documentEvidence.informationalDecision')
                    : t('documentEvidence.requiredDecision')}
              </Badge>
            )}
          </div>

          {question.evidenceMetadata && (
            <DocumentEvidenceDetails metadata={question.evidenceMetadata} />
          )}

          {/* Question Text */}
          <div className="mb-4">
            <p
              data-testid="clarifying-question-text"
              className="text-base font-medium text-slate-800 dark:text-slate-100"
            >
              {question.text}
            </p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{typeHelperText}</p>
          </div>

          {/* Main Content (Conditional based on mode) */}
          {question.evidenceMetadataInvalid ? (
            <div
              role="alert"
              data-testid="invalid-document-decision"
              className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-950 dark:border-red-800 dark:bg-red-950/30 dark:text-red-100"
            >
              <p className="font-semibold">{t('documentEvidence.invalidTitle')}</p>
              <p className="mt-1 text-sm">{t('documentEvidence.invalidDescription')}</p>
            </div>
          ) : (
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
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
