'use client'

import { useEffect, useState } from 'react'
import { getStageResults } from '@/app/actions/admin-generation'
import { BarChart } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useGenerationStore, StageId } from '@/stores/useGenerationStore'

interface StageResultsPreviewProps {
  courseId: string
  stage: number
}

interface StageData {
  totalDocuments?: number
  classifiedCount?: number
  priorities?: Array<{ id: string; priority: string }>
  summarizedDocuments?: number
  tokenSavings?: string
  analysisSummary?: string
  modulesCount?: number
  lessonsCount?: number
  // Stage 4 Clarifying Questions
  clarifyingQuestionsTotal?: number
  clarifyingQuestionsAnswered?: number
  clarifyingStatus?: 'pending' | 'active' | 'completed'
}

export default function StageResultsPreview({ courseId, stage }: StageResultsPreviewProps) {
  const [data, setData] = useState<StageData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Get stage status from store to trigger refetch when stage completes
  const stageId = `stage_${stage}` as StageId
  const stageStatus = useGenerationStore((state) => state.stages.get(stageId)?.status)

  useEffect(() => {
    let cancelled = false

    async function fetchResults() {
      try {
        setIsLoading(true)
        setError(null)
        const results = await getStageResults(courseId, stage)
        if (!cancelled) {
          setData(results?.data || results)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load results')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    fetchResults()

    return () => {
      cancelled = true
    }
  }, [courseId, stage, stageStatus]) // Re-fetch when stage status changes

  if (isLoading) {
    return <Skeleton className="h-40 w-full" />
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 p-4 text-red-500">
        Failed to load stage results: {error}
      </div>
    )
  }

  if (!data) {
    return null
  }

  return (
    <Card className="border-blue-100 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-900/10">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-blue-900 dark:text-blue-100">
          <BarChart className="h-4 w-4" />
          Stage {stage} Results
        </CardTitle>
      </CardHeader>
      <CardContent>
        {stage === 2 && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Documents:</span>
              <span className="font-medium">{data.totalDocuments}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Classified:</span>
              <span className="font-medium">{data.classifiedCount}</span>
            </div>
            {data.priorities && data.priorities.length > 0 && (
              <div className="mt-2 border-t border-blue-200 pt-2 dark:border-blue-800">
                <p className="mb-1 text-xs font-semibold">Priorities:</p>
                <div className="flex flex-wrap gap-1">
                  {data.priorities.map((p) => (
                    <span
                      key={p.id}
                      className="rounded-full bg-blue-200 px-2 py-0.5 text-xs dark:bg-blue-800"
                    >
                      {p.priority}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {stage === 3 && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Documents:</span>
              <span className="font-medium">{data.totalDocuments}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Summarized:</span>
              <span className="font-medium">{data.summarizedDocuments}</span>
            </div>
            {data.tokenSavings && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Token Savings:</span>
                <span className="font-medium text-green-600">{data.tokenSavings}</span>
              </div>
            )}
          </div>
        )}

        {stage === 4 && (
          <div className="space-y-2">
            {/* Clarifying Questions Progress */}
            {data.clarifyingQuestionsTotal !== undefined && data.clarifyingQuestionsTotal > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Clarifying Questions:</span>
                <span className="font-medium">
                  {data.clarifyingQuestionsAnswered ?? 0} / {data.clarifyingQuestionsTotal}
                </span>
              </div>
            )}
            {/* Analysis Summary */}
            {data.analysisSummary && (
              <div className="text-sm">
                <span className="text-muted-foreground mb-1 block">Analysis Summary:</span>
                <p className="rounded bg-white/50 p-2 text-sm italic dark:bg-black/20">
                  {typeof data.analysisSummary === 'string'
                    ? data.analysisSummary.substring(0, 150) + '...'
                    : 'Available'}
                </p>
              </div>
            )}
            {/* Fallback when no data yet */}
            {!data.analysisSummary && !data.clarifyingQuestionsTotal && (
              <p className="text-muted-foreground text-sm italic">Analysis in progress...</p>
            )}
          </div>
        )}

        {stage === 5 && (
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded bg-white/60 p-3 text-center dark:bg-black/20">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {data.modulesCount}
              </div>
              <div className="text-muted-foreground text-xs tracking-wider uppercase">Modules</div>
            </div>
            <div className="rounded bg-white/60 p-3 text-center dark:bg-black/20">
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {data.lessonsCount}
              </div>
              <div className="text-muted-foreground text-xs tracking-wider uppercase">Lessons</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
