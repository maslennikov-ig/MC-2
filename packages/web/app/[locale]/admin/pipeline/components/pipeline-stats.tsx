'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Activity, CheckCircle, DollarSign, Clock } from 'lucide-react'
import { trpc } from '@/lib/trpc/react'
import { useTranslations } from 'next-intl'
import { formatDuration } from '@/lib/utils/format'

/**
 * PipelineStats Component
 *
 * Displays 4 key metrics for pipeline performance:
 * 1. Total Generations - Count of all generation attempts
 * 2. Success Rate - Percentage of successful completions
 * 3. Total Cost - USD spent on generations
 * 4. Avg Time - Average completion time per generation
 *
 * Data is fetched via Server Action from tRPC endpoint.
 * Shows loading skeletons while data is being fetched.
 */
export function PipelineStats() {
  const t = useTranslations('admin')
  const { data: stats, isLoading, error } = trpc.pipelineAdmin.getPipelineStats.useQuery()

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
              <Skeleton className="mt-1 h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="border-destructive bg-destructive/10 rounded-lg border p-4">
        <p className="text-destructive text-sm">{error.message}</p>
      </div>
    )
  }

  if (!stats) return null

  const successRate =
    stats.totalGenerations > 0
      ? ((stats.successCount / stats.totalGenerations) * 100).toFixed(1)
      : '0'

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
      <Card className="admin-gradient-border admin-stagger-item overflow-visible">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle
            className="text-sm font-medium"
            style={{ color: 'rgb(var(--admin-text-secondary))' }}
          >
            {t('pipeline.stats.totalGenerations')}
          </CardTitle>
          <Activity className="admin-icon-glow h-5 w-5 text-cyan-400" />
        </CardHeader>
        <CardContent>
          <div className="bg-gradient-to-br from-cyan-400 to-cyan-600 bg-clip-text text-3xl font-bold text-transparent">
            {stats.totalGenerations}
          </div>
          <p className="mt-1 text-xs" style={{ color: 'rgb(var(--admin-text-tertiary))' }}>
            {t('pipeline.stats.last30days')}
          </p>
        </CardContent>
      </Card>

      <Card className="admin-gradient-border admin-stagger-item overflow-visible">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle
            className="text-sm font-medium"
            style={{ color: 'rgb(var(--admin-text-secondary))' }}
          >
            {t('pipeline.stats.successRate')}
          </CardTitle>
          <CheckCircle className="admin-icon-glow h-5 w-5 text-green-400" />
        </CardHeader>
        <CardContent>
          <div className="bg-gradient-to-br from-green-400 to-emerald-600 bg-clip-text text-3xl font-bold text-transparent">
            {successRate}%
          </div>
          <p className="mt-1 text-xs" style={{ color: 'rgb(var(--admin-text-tertiary))' }}>
            {stats.successCount} {t('pipeline.stats.succeeded')}, {stats.failureCount}{' '}
            {t('pipeline.stats.failed')}
          </p>
        </CardContent>
      </Card>

      <Card className="admin-gradient-border admin-stagger-item overflow-visible">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle
            className="text-sm font-medium"
            style={{ color: 'rgb(var(--admin-text-secondary))' }}
          >
            {t('pipeline.stats.totalCost')}
          </CardTitle>
          <DollarSign className="admin-icon-glow h-5 w-5 text-amber-400" />
        </CardHeader>
        <CardContent>
          <div className="bg-gradient-to-br from-amber-400 to-orange-600 bg-clip-text text-3xl font-bold text-transparent">
            ${stats.totalCost.toFixed(2)}
          </div>
          <p className="mt-1 text-xs" style={{ color: 'rgb(var(--admin-text-tertiary))' }}>
            {t('pipeline.stats.usdSpent')}
          </p>
        </CardContent>
      </Card>

      <Card className="admin-gradient-border admin-stagger-item overflow-visible">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle
            className="text-sm font-medium"
            style={{ color: 'rgb(var(--admin-text-secondary))' }}
          >
            {t('pipeline.stats.avgTime')}
          </CardTitle>
          <Clock className="admin-icon-glow h-5 w-5 text-purple-400" />
        </CardHeader>
        <CardContent>
          <div className="bg-gradient-to-br from-purple-400 to-pink-600 bg-clip-text text-3xl font-bold text-transparent">
            {formatDuration(stats.avgCompletionTime)}
          </div>
          <p className="mt-1 text-xs" style={{ color: 'rgb(var(--admin-text-tertiary))' }}>
            {t('pipeline.stats.perGeneration')}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
