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
  isAnswered: boolean
}

interface ClarifyingPanelProps {
  courseId: string
  onComplete?: () => void
}

export function ClarifyingPanel({ courseId, onComplete }: ClarifyingPanelProps) {
  // Real tRPC hooks
  const { data: questionsData, isLoading } = trpc.clarifying.getQuestions.useQuery({ courseId })
  const submitAnswerMutation = trpc.clarifying.submitAnswer.useMutation()
  const skipQuestionMutation = trpc.clarifying.skipQuestion.useMutation()
  const approveAndProceedMutation = trpc.clarifying.approveAndProceed.useMutation()

  // Transform API response to Question format
  // XSS Protection: Sanitize all user-submitted and AI-generated text
  const questions: Question[] = (questionsData?.questions || []).map((q) => ({
    id: q.id,
    text: DOMPurify.sanitize(q.question_text),
    priority: q.question_priority as QuestionPriority,
    suggestedAnswers: Array.isArray(q.suggested_answers)
      ? q.suggested_answers.map((text) => ({
          text: DOMPurify.sanitize(text),
          rationale: undefined,
        }))
      : [],
    currentAnswer: q.user_answer ? DOMPurify.sanitize(q.user_answer) : undefined,
    isAnswered: q.status === 'answered',
  }))

  const [answeredQuestions, setAnsweredQuestions] = useState<Set<string>>(new Set())
  const [hasShownConfetti, setHasShownConfetti] = useState(false)
  const questionRefs = useRef<Map<string, HTMLDivElement>>(new Map())

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
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#a855f7', '#8b5cf6', '#7c3aed'],
      })
    }
  }, [isComplete, hasShownConfetti])

  // Auto-scroll to next unanswered question
  useEffect(() => {
    const firstUnanswered = questions.find((q) => !answeredQuestions.has(q.id))
    if (firstUnanswered) {
      const element = questionRefs.current.get(firstUnanswered.id)
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }, [answeredQuestions, questions])

  const handleAnswer = (
    questionId: string,
    answer: string,
    source: 'suggested' | 'modified' | 'custom'
  ) => {
    void submitAnswerMutation
      .mutateAsync({
        questionId,
        answer,
        answerSource: source,
      })
      .then(() => {
        setAnsweredQuestions((prev) => new Set(prev).add(questionId))
      })
  }

  const handleSkip = (questionId: string) => {
    void skipQuestionMutation.mutateAsync({ questionId }).then(() => {
      setAnsweredQuestions((prev) => new Set(prev).add(questionId))
    })
  }

  const handleAcceptAll = () => {
    // Auto-select first suggested answer for all unanswered questions
    questions.forEach((q) => {
      if (!answeredQuestions.has(q.id) && q.suggestedAnswers.length > 0) {
        handleAnswer(q.id, q.suggestedAnswers[0].text, 'suggested')
      }
    })
  }

  const handleContinue = () => {
    void approveAndProceedMutation.mutateAsync({ courseId }).then(() => {
      onComplete?.()
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
            onClick={handleAcceptAll}
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
