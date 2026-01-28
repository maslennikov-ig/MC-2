'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import DOMPurify from 'isomorphic-dompurify'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Sparkles, CheckCircle2, AlertCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import confetti from 'canvas-confetti'
import { ErrorBoundary } from 'react-error-boundary'
import { QuestionCard } from './QuestionCard'
import { WizardProgress, WizardSidebar, WizardNavigation } from './wizard'
import { trpc, invalidateQueryCache } from '@/lib/trpc/client'
import { toast } from 'sonner'
import { z } from 'zod'

type QuestionPriority = 'critical' | 'important' | 'nice_to_have'
type QuestionType = 'open' | 'single_choice' | 'multi_choice'

interface SuggestedAnswer {
  text: string
  rationale?: string
  is_recommended?: boolean
}

interface UserAnswerValue {
  value?: string
  values?: string[]
}

interface Question {
  id: string
  text: string
  type: QuestionType
  priority: QuestionPriority
  suggestedAnswers: SuggestedAnswer[]
  currentAnswer?: string
  currentAnswers?: string[] // For multi_choice
  isAnswered: boolean
}

interface ClarifyingPanelProps {
  courseId: string
  onComplete?: () => void
}

// HIGH-004 fix: Zod schema for validating JSONB user_answer
const UserAnswerSchema = z.union([
  z.object({ value: z.string() }),
  z.object({ values: z.array(z.string()) }),
  z.string(), // Legacy format
])

/**
 * Safely parse user_answer from JSONB with Zod validation
 */
function parseUserAnswer(raw: unknown): { currentAnswer?: string; currentAnswers?: string[] } {
  if (!raw) return {}

  try {
    const validated = UserAnswerSchema.parse(raw)

    if (typeof validated === 'string') {
      return { currentAnswer: DOMPurify.sanitize(validated) }
    }
    if ('value' in validated) {
      return { currentAnswer: DOMPurify.sanitize(validated.value) }
    }
    if ('values' in validated) {
      const sanitizedValues = validated.values.map((v) => DOMPurify.sanitize(v))
      return {
        currentAnswers: sanitizedValues,
        currentAnswer: sanitizedValues.join(', '),
      }
    }
  } catch {
    console.warn('[ClarifyingPanel] Invalid user_answer format:', raw)
  }
  return {}
}

// MEDIUM-006 fix: Error boundary fallback
function ClarifyingErrorFallback({ courseId: _courseId }: { courseId: string }) {
  // _courseId available for future error reporting
  return (
    <Card className="p-6">
      <div className="space-y-4 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-red-500" />
        <h3 className="text-lg font-semibold">Ошибка загрузки вопросов</h3>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Не удалось отобразить вопросы для курса. Попробуйте обновить страницу.
        </p>
        <Button onClick={() => window.location.reload()}>Обновить страницу</Button>
      </div>
    </Card>
  )
}

export function ClarifyingPanel({ courseId, onComplete }: ClarifyingPanelProps) {
  // Real tRPC hooks
  const {
    data: questionsData,
    isLoading,
    refetch: refetchQuestions,
  } = trpc.clarifying.getQuestions.useQuery(
    { courseId },
    {
      staleTime: Infinity, // Questions never change after generation, only answers do
      refetchOnWindowFocus: false, // Предотвращает rate limit spam при переключении окон
    }
  )

  // FIX: Poll for questions when cache returned empty array
  // This handles race condition where panel opens before questions are generated
  useEffect(() => {
    // Only poll if not loading and no questions yet
    if (isLoading || questionsData?.questions?.length) {
      return
    }

    // Poll every 2 seconds until questions appear
    // IMPORTANT: Must invalidate cache first, otherwise staleTime: Infinity
    // prevents actual network request even when refetch() is called
    const interval = setInterval(() => {
      invalidateQueryCache('clarifying.getQuestions', { courseId })
      invalidateQueryCache('clarifying.getProgress', { courseId })
      void refetchQuestions()
    }, 2000)

    return () => clearInterval(interval)
  }, [isLoading, questionsData?.questions?.length, refetchQuestions, courseId])
  const submitAnswerMutation = trpc.clarifying.submitAnswer.useMutation()
  const submitMultipleAnswersMutation = trpc.clarifying.submitMultipleAnswers.useMutation()
  const skipQuestionMutation = trpc.clarifying.skipQuestion.useMutation()
  const approveAndProceedMutation = trpc.clarifying.approveAndProceed.useMutation()

  // Invalidate cache and refetch questions after any mutation
  const invalidateAndRefetch = useCallback(async () => {
    // Clear cache to force fresh fetch
    invalidateQueryCache('clarifying.getQuestions', { courseId })
    // Also invalidate progress cache so node in graph updates
    invalidateQueryCache('clarifying.getProgress', { courseId })
    // Refetch with fresh data
    await refetchQuestions()
  }, [courseId, refetchQuestions])

  // Transform API response to Question format
  // XSS Protection: Sanitize all user-submitted and AI-generated text
  // Extended type for new fields not yet in generated types
  interface ExtendedQuestionFromAPI {
    id: string
    course_id: string
    question_text: string
    question_type?: QuestionType
    question_priority: string
    question_category: string | null
    suggested_answers: Array<
      string | { text: string; rationale?: string; is_recommended?: boolean }
    > | null
    user_answer: UserAnswerValue | string | null
    answer_source: string | null
    selected_suggestion_index: number | null
    user_modification: string | null
    iteration_round: number
    status: string
    order_index: number
    created_at: string | null
    answered_at: string | null
    metadata: Record<string, unknown> | null
  }

  const questions: Question[] = (questionsData?.questions || []).map((rawQ) => {
    const q = rawQ as unknown as ExtendedQuestionFromAPI

    // HIGH-004 fix: Use Zod-validated parser instead of inline logic
    const { currentAnswer, currentAnswers } = parseUserAnswer(q.user_answer)

    return {
      id: q.id,
      text: DOMPurify.sanitize(q.question_text),
      type: (q.question_type as QuestionType) || 'open',
      priority: q.question_priority as QuestionPriority,
      suggestedAnswers: Array.isArray(q.suggested_answers)
        ? q.suggested_answers.map(
            (item: string | { text: string; rationale?: string; is_recommended?: boolean }) => ({
              text: DOMPurify.sanitize(typeof item === 'string' ? item : item.text),
              rationale: typeof item === 'string' ? undefined : item.rationale,
              is_recommended: typeof item === 'string' ? undefined : item.is_recommended,
            })
          )
        : [],
      currentAnswer,
      currentAnswers,
      isAnswered: q.status === 'answered',
    }
  })

  const [answeredQuestions, setAnsweredQuestions] = useState<Set<string>>(new Set())

  // Sort questions by priority
  const sortedQuestions = useMemo(
    () =>
      [...questions].sort((a, b) => {
        const order = { critical: 0, important: 1, nice_to_have: 2 }
        return order[a.priority] - order[b.priority]
      }),
    [questions]
  )

  // Current question index state - start with first unanswered
  const [currentIndex, setCurrentIndex] = useState(() => {
    const firstUnanswered = sortedQuestions.findIndex((q) => !answeredQuestions.has(q.id))
    return firstUnanswered >= 0 ? firstUnanswered : 0
  })

  // Priority counts for WizardProgress
  const priorityCounts = useMemo(
    () => ({
      critical: {
        total: sortedQuestions.filter((q) => q.priority === 'critical').length,
        answered: sortedQuestions.filter(
          (q) => q.priority === 'critical' && answeredQuestions.has(q.id)
        ).length,
      },
      important: {
        total: sortedQuestions.filter((q) => q.priority === 'important').length,
        answered: sortedQuestions.filter(
          (q) => q.priority === 'important' && answeredQuestions.has(q.id)
        ).length,
      },
      nice_to_have: {
        total: sortedQuestions.filter((q) => q.priority === 'nice_to_have').length,
        answered: sortedQuestions.filter(
          (q) => q.priority === 'nice_to_have' && answeredQuestions.has(q.id)
        ).length,
      },
    }),
    [sortedQuestions, answeredQuestions]
  )
  // Track if confetti was ever shown for this course (persisted in localStorage)
  const confettiStorageKey = `clarifying_confetti_shown_${courseId}`
  const [hasShownConfetti, setHasShownConfetti] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(confettiStorageKey) === 'true'
  })
  const wasAlreadyCompleteOnMount = useRef<boolean | null>(null)
  const [processingQuestionId, setProcessingQuestionId] = useState<string | null>(null)

  // BUG FIX: Sync answeredQuestions with API data on load
  // Use questionsData as dependency (stable reference from tRPC) instead of questions array
  useEffect(() => {
    if (!questionsData?.questions) return

    const alreadyAnsweredIds = (questionsData.questions as Array<{ id: string; status: string }>)
      .filter((q) => q.status === 'answered')
      .map((q) => q.id)

    if (alreadyAnsweredIds.length > 0) {
      setAnsweredQuestions((prev) => {
        // Check if already synced to prevent unnecessary updates
        const needsUpdate = alreadyAnsweredIds.some((id) => !prev.has(id))
        if (!needsUpdate) return prev

        const next = new Set(prev)
        alreadyAnsweredIds.forEach((id) => next.add(id))
        return next
      })
    }
  }, [questionsData])

  // Calculate progress
  const totalQuestions = sortedQuestions.length
  const answeredCount = answeredQuestions.size

  const criticalQuestions = sortedQuestions.filter((q) => q.priority === 'critical')
  const criticalAnswered = criticalQuestions.filter((q) => answeredQuestions.has(q.id)).length
  const allCriticalAnswered = criticalAnswered === criticalQuestions.length

  const isComplete = answeredCount === totalQuestions

  // Trigger confetti on 100% completion - only ONCE ever per course
  useEffect(() => {
    // On first render with data, check if already complete
    if (wasAlreadyCompleteOnMount.current === null && totalQuestions > 0) {
      wasAlreadyCompleteOnMount.current = isComplete
    }

    // Only show confetti if:
    // 1. All questions are answered
    // 2. Haven't shown confetti ever (persisted in localStorage)
    // 3. Questions were NOT already complete when component mounted (user completed them now)
    if (isComplete && !hasShownConfetti && wasAlreadyCompleteOnMount.current === false) {
      setHasShownConfetti(true)
      // Persist to localStorage so confetti never shows again for this course
      localStorage.setItem(`clarifying_confetti_shown_${courseId}`, 'true')
      void confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#a855f7', '#8b5cf6', '#7c3aed'],
      })
    }
  }, [isComplete, hasShownConfetti, totalQuestions, courseId])

  // Navigation handlers
  const handlePrev = () => {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1)
  }

  const handleNext = () => {
    if (currentIndex < sortedQuestions.length - 1) setCurrentIndex(currentIndex + 1)
  }

  const handleSelectQuestion = (index: number) => {
    setCurrentIndex(index)
  }

  const handleAnswer = (
    questionId: string,
    answer: string | string[],
    source: 'suggested' | 'modified' | 'custom',
    selectedSuggestionIndex?: number,
    selectedSuggestionIndexes?: number[]
  ) => {
    // Determine if this is a multi_choice answer
    const isMultiChoice = Array.isArray(answer)

    // Build mutation payload based on answer type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: any = {
      questionId,
      answerSource: source,
    }

    if (isMultiChoice) {
      payload.answers = answer
      payload.selectedSuggestionIndexes = selectedSuggestionIndexes
    } else {
      payload.answer = answer
      payload.selectedSuggestionIndex = selectedSuggestionIndex
    }

    // Track which question is being processed for per-card loading state
    setProcessingQuestionId(questionId)

    void submitAnswerMutation
      .mutateAsync(payload)
      .then(async () => {
        setAnsweredQuestions((prev) => new Set(prev).add(questionId))

        // Auto-advance to next unanswered question
        const nextUnanswered = sortedQuestions.findIndex(
          (q, idx) => idx > currentIndex && !answeredQuestions.has(q.id)
        )
        if (nextUnanswered >= 0) {
          setCurrentIndex(nextUnanswered)
        }

        // Invalidate cache to force refetch with updated currentAnswer
        await invalidateAndRefetch()
      })
      .catch((error: Error) => {
        toast.error('Не удалось сохранить ответ', {
          description: error.message || 'Попробуйте ещё раз',
        })
      })
      .finally(() => {
        setProcessingQuestionId(null)
      })
  }

  const handleSkip = (questionId: string) => {
    setProcessingQuestionId(questionId)

    void skipQuestionMutation
      .mutateAsync({ questionId })
      .then(async () => {
        setAnsweredQuestions((prev) => new Set(prev).add(questionId))

        // Auto-advance to next unanswered question
        const nextUnanswered = sortedQuestions.findIndex(
          (q, idx) => idx > currentIndex && !answeredQuestions.has(q.id)
        )
        if (nextUnanswered >= 0) {
          setCurrentIndex(nextUnanswered)
        }

        // Invalidate cache to force refetch with updated status
        await invalidateAndRefetch()
      })
      .catch((error: Error) => {
        toast.error('Не удалось пропустить вопрос', {
          description: error.message || 'Попробуйте ещё раз',
        })
      })
      .finally(() => {
        setProcessingQuestionId(null)
      })
  }

  const handleAcceptAll = async () => {
    // Auto-select first suggested answer for all unanswered questions
    // Uses batch endpoint to submit all answers in a single API call (fixes HIGH-002 rate limit issue)
    const unanswered = sortedQuestions.filter(
      (q) => !answeredQuestions.has(q.id) && q.suggestedAnswers.length > 0
    )

    if (unanswered.length === 0) {
      return
    }

    // Build batch submission payload
    const submissions = unanswered.map((q) => ({
      questionId: q.id,
      answer: q.suggestedAnswers[0].text,
      answerSource: 'suggested' as const,
      selectedSuggestionIndex: 0,
    }))

    try {
      const result = await submitMultipleAnswersMutation.mutateAsync({ submissions })

      // Update local state for all successful answers
      const successfulIds = submissions
        .map((s) => s.questionId)
        .filter((id) => !result.failedIds.includes(id))

      setAnsweredQuestions((prev) => {
        const newSet = new Set(prev)
        successfulIds.forEach((id) => newSet.add(id))
        return newSet
      })

      // Invalidate cache to sync with other components (node badges, etc.)
      await invalidateAndRefetch()

      // Show feedback
      if (result.failedIds.length > 0) {
        toast.warning('Некоторые ответы не сохранены', {
          description: `Сохранено ${result.successCount} из ${submissions.length} ответов`,
        })
      } else {
        toast.success('Все рекомендации приняты', {
          description: `Сохранено ${result.successCount} ответов`,
        })
      }
    } catch (error) {
      console.error('Failed to submit batch answers:', error)
      toast.error('Ошибка при автоматическом ответе', {
        description: (error as Error).message || 'Попробуйте ещё раз',
      })
    }
  }

  const handleContinue = () => {
    void approveAndProceedMutation
      .mutateAsync({ courseId })
      .then(() => {
        onComplete?.()
      })
      .catch((error: Error) => {
        toast.error('Не удалось продолжить генерацию', {
          description: error.message || 'Убедитесь, что все обязательные вопросы отвечены',
        })
      })
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-purple-600" />
      </div>
    )
  }

  // Get current question (ensure it exists)
  const currentQuestion = sortedQuestions[currentIndex]

  if (!currentQuestion && sortedQuestions.length > 0) {
    // Reset to first question if index is invalid
    setCurrentIndex(0)
    return null
  }

  return (
    <ErrorBoundary
      fallbackRender={() => <ClarifyingErrorFallback courseId={courseId} />}
      onError={(error) => {
        console.error('[ClarifyingPanel] Render error:', error)
      }}
    >
      <div className="space-y-4">
        {/* Header */}
        <Card className="border-purple-200 bg-gradient-to-r from-purple-50 to-blue-50 dark:border-purple-800 dark:from-purple-950/20 dark:to-blue-950/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                <CardTitle className="text-lg">Уточняющие вопросы</CardTitle>
              </div>
              {isComplete && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400"
                >
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="text-sm font-medium">Все вопросы отвечены!</span>
                </motion.div>
              )}
            </div>
          </CardHeader>
        </Card>

        {/* Quick Actions */}
        {!isComplete && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleAcceptAll()}
              disabled={submitAnswerMutation.isPending || submitMultipleAnswersMutation.isPending}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Принять все рекомендации
            </Button>
          </div>
        )}

        {/* Wizard Layout */}
        <div className="flex gap-4">
          {/* Sidebar (hidden on mobile) */}
          <WizardSidebar
            questions={sortedQuestions.map((q) => ({
              id: q.id,
              text: q.text,
              priority: q.priority,
              isAnswered: answeredQuestions.has(q.id),
            }))}
            currentIndex={currentIndex}
            onSelect={handleSelectQuestion}
          />

          {/* Main content */}
          <div className="min-w-0 flex-1">
            {/* Progress */}
            <WizardProgress
              currentIndex={currentIndex}
              totalQuestions={totalQuestions}
              answeredCount={answeredCount}
              priorityCounts={priorityCounts}
            />

            {/* Current question - ONLY ONE card */}
            {currentQuestion && (
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentQuestion.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                >
                  <QuestionCard
                    question={currentQuestion}
                    onAnswer={handleAnswer}
                    onSkip={handleSkip}
                    isAnswered={answeredQuestions.has(currentQuestion.id)}
                    isProcessing={processingQuestionId === currentQuestion.id}
                  />
                </motion.div>
              </AnimatePresence>
            )}

            {/* Navigation */}
            <WizardNavigation
              currentIndex={currentIndex}
              totalQuestions={totalQuestions}
              questionsStatus={sortedQuestions.map((q) => ({
                isAnswered: answeredQuestions.has(q.id),
                priority: q.priority,
              }))}
              onPrev={handlePrev}
              onNext={handleNext}
              canContinue={allCriticalAnswered}
              onContinue={handleContinue}
              isProcessing={approveAndProceedMutation.isPending}
            />
          </div>
        </div>
      </div>
    </ErrorBoundary>
  )
}
