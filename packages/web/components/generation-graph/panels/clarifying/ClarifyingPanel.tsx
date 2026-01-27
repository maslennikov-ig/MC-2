'use client'

import { useState, useEffect, useRef } from 'react'
import DOMPurify from 'isomorphic-dompurify'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Sparkles, CheckCircle2, ArrowRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import confetti from 'canvas-confetti'
import { QuestionCard } from './QuestionCard'
import { trpc } from '@/lib/trpc/client'
import { toast } from 'sonner'

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

export function ClarifyingPanel({ courseId, onComplete }: ClarifyingPanelProps) {
  // Real tRPC hooks
  const { data: questionsData, isLoading } = trpc.clarifying.getQuestions.useQuery(
    { courseId },
    {
      staleTime: 5 * 60 * 1000, // 5 минут - вопросы статичны в рамках сессии
      refetchOnWindowFocus: false, // Предотвращает rate limit spam при переключении окон
    }
  )
  const submitAnswerMutation = trpc.clarifying.submitAnswer.useMutation()
  const skipQuestionMutation = trpc.clarifying.skipQuestion.useMutation()
  const approveAndProceedMutation = trpc.clarifying.approveAndProceed.useMutation()

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
    // Extract answer from JSONB format
    const userAnswer = q.user_answer
    let currentAnswer: string | undefined
    let currentAnswers: string[] | undefined

    if (userAnswer) {
      if (typeof userAnswer === 'string') {
        // Legacy format
        currentAnswer = DOMPurify.sanitize(userAnswer)
      } else if (userAnswer.value) {
        currentAnswer = DOMPurify.sanitize(userAnswer.value)
      } else if (userAnswer.values) {
        currentAnswers = userAnswer.values.map((v) => DOMPurify.sanitize(v))
        currentAnswer = currentAnswers.join(', ') // Display format
      }
    }

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
  const questionRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const prevAnsweredCount = useRef(0)

  // Clean up stale refs when questions change (memory leak fix)
  useEffect(() => {
    const currentIds = new Set(questions.map((q) => q.id))
    for (const id of questionRefs.current.keys()) {
      if (!currentIds.has(id)) {
        questionRefs.current.delete(id)
      }
    }
  }, [questions])

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

  // Auto-scroll to next unanswered question ONLY when user answers
  useEffect(() => {
    const currentCount = answeredQuestions.size

    // Scroll only when answer count increases (user answered a question)
    if (currentCount > prevAnsweredCount.current) {
      prevAnsweredCount.current = currentCount

      const firstUnanswered = questions.find((q) => !answeredQuestions.has(q.id))
      if (firstUnanswered) {
        const element = questionRefs.current.get(firstUnanswered.id)
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }
    } else {
      // Sync counter on initialization (when questions load)
      prevAnsweredCount.current = currentCount
    }
  }, [answeredQuestions, questions])

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

    void submitAnswerMutation
      .mutateAsync(payload)
      .then(() => {
        setAnsweredQuestions((prev) => new Set(prev).add(questionId))
      })
      .catch((error: Error) => {
        toast.error('Не удалось сохранить ответ', {
          description: error.message || 'Попробуйте ещё раз',
        })
      })
  }

  const handleSkip = (questionId: string) => {
    void skipQuestionMutation
      .mutateAsync({ questionId })
      .then(() => {
        setAnsweredQuestions((prev) => new Set(prev).add(questionId))
      })
      .catch((error: Error) => {
        toast.error('Не удалось пропустить вопрос', {
          description: error.message || 'Попробуйте ещё раз',
        })
      })
  }

  const handleAcceptAll = async () => {
    // Auto-select first suggested answer for all unanswered questions
    // Sequential submission with delay to avoid rate limiting (30 req/min backend limit)
    const unanswered = questions.filter(
      (q) => !answeredQuestions.has(q.id) && q.suggestedAnswers.length > 0
    )

    for (const q of unanswered) {
      try {
        await submitAnswerMutation.mutateAsync({
          questionId: q.id,
          answer: q.suggestedAnswers[0].text,
          answerSource: 'suggested',
          selectedSuggestionIndex: 0,
        })
        setAnsweredQuestions((prev) => new Set(prev).add(q.id))
        // Small delay to avoid rate limit (100ms between requests)
        await new Promise((r) => setTimeout(r, 100))
      } catch (error) {
        console.error(`Failed to submit answer for ${q.id}:`, error)
        toast.error('Ошибка при автоматическом ответе', {
          description: `Не удалось ответить на вопрос. Продолжаем с остальными.`,
        })
        // Continue with other questions on failure
      }
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
            disabled={submitAnswerMutation.isPending}
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
              ref={(el) => {
                if (el) questionRefs.current.set(question.id, el)
              }}
            >
              <QuestionCard
                question={question}
                onAnswer={handleAnswer}
                onSkip={handleSkip}
                isAnswered={answeredQuestions.has(question.id)}
                isProcessing={submitAnswerMutation.isPending || skipQuestionMutation.isPending}
              />
            </div>
          ))}
        </AnimatePresence>
      </div>

      {/* Continue Button */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: allCriticalAnswered ? 1 : 0.5 }}
        className="sticky bottom-4 mt-6"
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
  )
}
