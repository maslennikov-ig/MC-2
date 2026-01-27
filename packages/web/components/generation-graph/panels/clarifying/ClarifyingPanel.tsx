'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import DOMPurify from 'isomorphic-dompurify'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Sparkles, CheckCircle2, ArrowRight, AlertCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import confetti from 'canvas-confetti'
import { ErrorBoundary } from 'react-error-boundary'
import { QuestionCard } from './QuestionCard'
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
      staleTime: 0, // Always refetch to get latest answers
      refetchOnWindowFocus: false, // Предотвращает rate limit spam при переключении окон
    }
  )
  const submitAnswerMutation = trpc.clarifying.submitAnswer.useMutation()
  const submitMultipleAnswersMutation = trpc.clarifying.submitMultipleAnswers.useMutation()
  const skipQuestionMutation = trpc.clarifying.skipQuestion.useMutation()
  const approveAndProceedMutation = trpc.clarifying.approveAndProceed.useMutation()

  // Invalidate cache and refetch questions after any mutation
  const invalidateAndRefetch = useCallback(async () => {
    // Clear cache to force fresh fetch
    invalidateQueryCache('clarifying.getQuestions', { courseId })
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
  const [hasShownConfetti, setHasShownConfetti] = useState(false)
  const [processingQuestionId, setProcessingQuestionId] = useState<string | null>(null)
  const questionRefs = useRef<Map<string, HTMLDivElement>>(new Map())

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

  // CRITICAL-003 fix: Cleanup refs on unmount
  useEffect(() => {
    return () => {
      questionRefs.current.clear()
    }
  }, [])

  // Calculate progress
  const totalQuestions = questions.length
  const answeredCount = answeredQuestions.size
  const progress = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0

  const criticalQuestions = questions.filter((q) => q.priority === 'critical')
  const criticalAnswered = criticalQuestions.filter((q) => answeredQuestions.has(q.id)).length
  const allCriticalAnswered = criticalAnswered === criticalQuestions.length

  const isComplete = answeredCount === totalQuestions

  // Trigger confetti on 100% completion
  useEffect(() => {
    if (isComplete && !hasShownConfetti) {
      setHasShownConfetti(true)
      void confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#a855f7', '#8b5cf6', '#7c3aed'],
      })
    }
  }, [isComplete, hasShownConfetti])

  // HIGH-005 fix: Scroll helper - called directly from mutation callback to avoid race conditions
  const scrollToNextUnanswered = useCallback(
    (justAnsweredId: string) => {
      const nextUnanswered = questions.find(
        (q) => !answeredQuestions.has(q.id) && q.id !== justAnsweredId
      )
      if (nextUnanswered) {
        const element = questionRefs.current.get(nextUnanswered.id)
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }
    },
    [questions, answeredQuestions]
  )

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
        // HIGH-005 fix: Scroll only after THIS specific answer is saved
        scrollToNextUnanswered(questionId)
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
        // HIGH-005 fix: Scroll after skip as well
        scrollToNextUnanswered(questionId)
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
    const unanswered = questions.filter(
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

  return (
    <ErrorBoundary
      fallbackRender={() => <ClarifyingErrorFallback courseId={courseId} />}
      onError={(error) => {
        console.error('[ClarifyingPanel] Render error:', error)
      }}
    >
      <div className="space-y-4">
        {/* Header with Progress */}
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
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">
                  Прогресс: {answeredCount} / {totalQuestions}
                </span>
                <span className="font-medium text-purple-600 dark:text-purple-400">
                  {Math.round(progress)}%
                </span>
              </div>
              <Progress value={progress} className="h-2" />
              {criticalQuestions.length > 0 && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-medium text-red-600 dark:text-red-400">
                    Обязательные: {criticalAnswered} / {criticalQuestions.length}
                  </span>
                  {!allCriticalAnswered && (
                    <span className="text-slate-500 dark:text-slate-400">
                      (необходимо ответить для продолжения)
                    </span>
                  )}
                </div>
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

        {/* Questions List */}
        <div className="space-y-3">
          <AnimatePresence>
            {questions.map((question) => (
              <div
                key={question.id}
                ref={(node) => {
                  // CRITICAL-003 fix: Ref callback with cleanup
                  if (node) {
                    questionRefs.current.set(question.id, node)
                  } else {
                    // Cleanup when element unmounts (node becomes null)
                    questionRefs.current.delete(question.id)
                  }
                }}
              >
                <QuestionCard
                  question={question}
                  onAnswer={handleAnswer}
                  onSkip={handleSkip}
                  isAnswered={answeredQuestions.has(question.id)}
                  isProcessing={processingQuestionId === question.id}
                />
              </div>
            ))}
          </AnimatePresence>
        </div>

        {/* Continue Button */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: allCriticalAnswered ? 1 : 0.5 }}
          className="mt-6"
        >
          <Button
            size="lg"
            className="w-full shadow-lg"
            disabled={!allCriticalAnswered || approveAndProceedMutation.isPending}
            onClick={handleContinue}
          >
            {approveAndProceedMutation.isPending ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-white" />
                Обработка...
              </>
            ) : (
              <>
                Продолжить генерацию
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
          {!allCriticalAnswered && (
            <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">
              Ответьте на все обязательные вопросы для продолжения
            </p>
          )}
        </motion.div>
      </div>
    </ErrorBoundary>
  )
}
