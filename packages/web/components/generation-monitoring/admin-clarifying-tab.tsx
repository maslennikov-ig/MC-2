'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSupabase } from '@/lib/supabase/browser-client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CategoryBadge } from '@/components/ui/category-badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Loader2, CheckCircle, AlertCircle, MessageSquare, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useGenerationRealtime } from './realtime-provider'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { Database } from '@/types/database.generated'

type ClarifyingQuestion = Database['public']['Tables']['clarifying_questions']['Row']

type TraceRow = {
  step_name: string
  output_data: Record<string, unknown> | null
  created_at: string
  duration_ms: number | null
}

type SufficiencyVerdict = {
  round: number
  is_sufficient: boolean
  confidence: number
  gaps: string[]
  created_at: string
  duration_ms: number | null
}

export function AdminClarifyingTab() {
  const { courseId } = useGenerationRealtime()
  const { supabase } = useSupabase()
  const [questions, setQuestions] = useState<ClarifyingQuestion[]>([])
  const [verdicts, setVerdicts] = useState<SufficiencyVerdict[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // Query 1: All clarifying questions for this course
      const { data: questionsData, error: qError } = await supabase
        .from('clarifying_questions')
        .select('*')
        .eq('course_id', courseId)
        .order('iteration_round')
        .order('order_index')

      if (qError) {
        console.error('[AdminClarifyingTab] Failed to fetch questions:', qError)
        setError('Failed to load clarifying questions')
        toast.error('Failed to load clarifying questions')
        return
      }

      // Query 2: Sufficiency verdicts from generation_trace
      const { data: verdictsData, error: vError } = await supabase
        .from('generation_trace')
        .select('step_name, output_data, created_at, duration_ms')
        .eq('course_id', courseId)
        .eq('stage', 'stage_4')
        .eq('phase', 'stage_4_clarifying')
        .like('step_name', 'sufficiency%')
        .order('created_at')
        .returns<TraceRow[]>()

      if (vError) {
        console.error('[AdminClarifyingTab] Failed to fetch verdicts:', vError)
        // Continue without verdicts (non-critical)
      }

      setQuestions(questionsData || [])

      // Parse verdicts from trace data
      const parsedVerdicts: SufficiencyVerdict[] = []
      for (const trace of verdictsData || []) {
        const output = trace.output_data
        if (output) {
          // Extract round from step_name (e.g., "sufficiency_check_round_1" -> 1)
          const roundMatch = trace.step_name.match(/round_(\d+)/)
          const round = roundMatch ? parseInt(roundMatch[1], 10) : 0

          parsedVerdicts.push({
            round,
            is_sufficient: Boolean(output.is_sufficient),
            confidence: typeof output.confidence === 'number' ? output.confidence : 0,
            gaps: Array.isArray(output.gaps) ? output.gaps.map(String) : [],
            created_at: trace.created_at,
            duration_ms: trace.duration_ms,
          })
        }
      }

      setVerdicts(parsedVerdicts)
    } catch (err) {
      console.error('[AdminClarifyingTab] Unexpected error:', err)
      setError('An unexpected error occurred')
      toast.error('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }, [courseId, supabase])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  // Calculate summary stats
  const totalQuestions = questions.length
  const answeredCount = questions.filter((q) => q.status === 'answered').length
  const skippedCount = questions.filter((q) => q.status === 'skipped').length
  const rounds = questions.length > 0 ? Math.max(...questions.map((q) => q.iteration_round)) : 0

  // Group questions by round
  const questionsByRound = questions.reduce(
    (acc, q) => {
      if (!acc[q.iteration_round]) {
        acc[q.iteration_round] = []
      }
      acc[q.iteration_round].push(q)
      return acc
    },
    {} as Record<number, ClarifyingQuestion[]>
  )

  return (
    <Card className="flex h-full flex-col border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
      <CardHeader className="border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-slate-900 dark:text-slate-100">Clarifying Q&A</CardTitle>
            <CardDescription className="text-slate-500 dark:text-slate-400">
              Questions and answers from Stage 4 clarifying phase
            </CardDescription>
          </div>
          <Button
            onClick={() => void fetchData()}
            variant="outline"
            size="sm"
            disabled={loading}
            className="border-slate-200 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-700"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-6">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400 dark:text-slate-500" />
              <p className="text-sm text-slate-500 dark:text-slate-400">Loading questions...</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <AlertCircle className="h-8 w-8 text-red-500 dark:text-red-400" />
              <p className="text-sm text-slate-600 dark:text-slate-400">{error}</p>
              <Button
                onClick={() => void fetchData()}
                variant="outline"
                size="sm"
                className="border-slate-200 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-700"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry
              </Button>
            </div>
          </div>
        ) : questions.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <MessageSquare className="h-8 w-8 text-slate-400 dark:text-slate-500" />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Для этого курса не генерировались уточняющие вопросы
              </p>
            </div>
          </div>
        ) : (
          <ScrollArea className="h-full pr-4">
            <div className="space-y-6">
              {/* Summary Card */}
              <Card className="border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50">
                <CardContent className="pt-6">
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Total Questions</p>
                      <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                        {totalQuestions}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Answered</p>
                      <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                        {answeredCount}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Skipped</p>
                      <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                        {skippedCount}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Rounds</p>
                      <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                        {rounds} / 3
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Per-round Accordion */}
              <Accordion
                type="multiple"
                defaultValue={Object.keys(questionsByRound).map((r) => `round-${r}`)}
                className="space-y-4"
              >
                {Object.entries(questionsByRound)
                  .sort(([a], [b]) => Number(a) - Number(b))
                  .map(([round, roundQuestions]) => {
                    const roundAnswered = roundQuestions.filter(
                      (q) => q.status === 'answered'
                    ).length

                    return (
                      <AccordionItem
                        key={`round-${round}`}
                        value={`round-${round}`}
                        className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
                      >
                        <AccordionTrigger className="px-4 hover:no-underline">
                          <div className="flex items-center gap-3">
                            <Badge
                              variant="outline"
                              className="border-blue-500/20 bg-blue-500/10 text-blue-600 dark:border-blue-500/30 dark:bg-blue-900/30 dark:text-blue-400"
                            >
                              Round {round}
                            </Badge>
                            <span className="text-sm text-slate-600 dark:text-slate-400">
                              {roundAnswered} / {roundQuestions.length} answered
                            </span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-4 pb-4">
                          <div className="rounded-lg border border-slate-200 dark:border-slate-700">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-slate-50 dark:bg-slate-900/50">
                                  <TableHead className="w-12">#</TableHead>
                                  <TableHead className="w-32">Category</TableHead>
                                  <TableHead className="w-24">Priority</TableHead>
                                  <TableHead>Question</TableHead>
                                  <TableHead>Answer</TableHead>
                                  <TableHead className="w-24">Source</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {roundQuestions.map((q) => (
                                  <TableRow key={q.id}>
                                    <TableCell className="font-medium text-slate-600 dark:text-slate-400">
                                      {q.order_index + 1}
                                    </TableCell>
                                    <TableCell>
                                      <CategoryBadge category={q.question_category} />
                                    </TableCell>
                                    <TableCell>
                                      <PriorityBadge priority={q.question_priority} />
                                    </TableCell>
                                    <TableCell className="text-sm text-slate-700 dark:text-slate-300">
                                      {q.question_text}
                                    </TableCell>
                                    <TableCell className="text-sm text-slate-700 dark:text-slate-300">
                                      {displayAnswer(q.user_answer, q.status)}
                                    </TableCell>
                                    <TableCell>
                                      {q.answer_source ? (
                                        <Badge
                                          variant="outline"
                                          className="border-slate-200 bg-slate-50 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                        >
                                          {q.answer_source}
                                        </Badge>
                                      ) : (
                                        <span className="text-xs text-slate-400">—</span>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    )
                  })}
              </Accordion>

              {/* Sufficiency Verdicts Card */}
              {verdicts.length > 0 && (
                <Card className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                  <CardHeader>
                    <CardTitle className="text-lg text-slate-900 dark:text-slate-100">
                      Sufficiency Verdicts
                    </CardTitle>
                    <CardDescription className="text-slate-500 dark:text-slate-400">
                      AI assessment of whether collected information is sufficient
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {verdicts.map((verdict, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/50"
                        >
                          {verdict.is_sufficient ? (
                            <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-600 dark:text-green-400" />
                          ) : (
                            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400" />
                          )}
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Badge
                                variant="outline"
                                className="border-blue-500/20 bg-blue-500/10 text-blue-600 dark:border-blue-500/30 dark:bg-blue-900/30 dark:text-blue-400"
                              >
                                Round {verdict.round}
                              </Badge>
                              <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                {verdict.is_sufficient ? 'Sufficient' : 'Insufficient'}
                              </span>
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                (confidence: {(verdict.confidence * 100).toFixed(1)}%)
                              </span>
                              {verdict.duration_ms && (
                                <span className="text-xs text-slate-400 dark:text-slate-500">
                                  • {(verdict.duration_ms / 1000).toFixed(2)}s
                                </span>
                              )}
                            </div>
                            {verdict.gaps.length > 0 && (
                              <div className="mt-2">
                                <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                                  Identified gaps:
                                </p>
                                <ul className="mt-1 list-inside list-disc space-y-1 text-xs text-slate-600 dark:text-slate-400">
                                  {verdict.gaps.map((gap, gapIdx) => (
                                    <li key={gapIdx}>{gap}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}

// Helper: Display answer based on status and user_answer structure
function displayAnswer(userAnswer: unknown, status: string): string {
  if (status === 'skipped') return '(пропущен)'
  if (status === 'pending') return '(ожидает ответа)'
  if (!userAnswer) return '(нет ответа)'

  if (typeof userAnswer === 'string') return userAnswer

  if (typeof userAnswer === 'object' && userAnswer !== null) {
    const a = userAnswer as Record<string, unknown>
    if (typeof a.value === 'string') return a.value
    if (Array.isArray(a.values)) return a.values.join(', ')
  }

  return '(неизвестный формат)'
}

// Helper: Priority badge with color
function PriorityBadge({ priority }: { priority: string }) {
  const colorMap: Record<string, string> = {
    critical: 'border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300',
    important: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    nice_to_have: 'border-slate-200 bg-slate-50 text-slate-700 dark:text-slate-300',
  }

  const colorClass =
    colorMap[priority] || 'border-slate-200 bg-slate-50 text-slate-700 dark:text-slate-300'

  return (
    <Badge variant="outline" className={`text-xs ${colorClass}`}>
      {priority.replace(/_/g, ' ')}
    </Badge>
  )
}
