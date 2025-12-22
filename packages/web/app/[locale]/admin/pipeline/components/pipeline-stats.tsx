'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity, CheckCircle, DollarSign, Clock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getPipelineStats } from '@/app/actions/pipeline-admin';
import type { PipelineStats as PipelineStatsType } from '@megacampus/shared-types';
import { useTranslations } from 'next-intl';

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
  const t = useTranslations('admin');
  const [stats, setStats] = useState<PipelineStatsType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadStats() {
      try {
        setIsLoading(true);
        const data = await getPipelineStats();
        setStats(data.result?.data || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load stats');
      } finally {
        setIsLoading(false);
      }
    }

    loadStats();
  }, []);

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
              <Skeleton className="h-3 w-32 mt-1" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (!stats) return null;

  const successRate =
    stats.totalGenerations > 0
      ? ((stats.successCount / stats.totalGenerations) * 100).toFixed(1)
      : '0';

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
      <Card className="admin-gradient-border admin-stagger-item overflow-visible">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium" style={{ color: 'rgb(var(--admin-text-secondary))' }}>
            {t('pipeline.stats.totalGenerations')}
          </CardTitle>
          <Activity className="h-5 w-5 admin-icon-glow text-cyan-400" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold bg-gradient-to-br from-cyan-400 to-cyan-600 bg-clip-text text-transparent">
            {stats.totalGenerations}
          </div>
          <p className="text-xs mt-1" style={{ color: 'rgb(var(--admin-text-tertiary))' }}>
            {t('pipeline.stats.last30days')}
          </p>
        </CardContent>
      </Card>

      <Card className="admin-gradient-border admin-stagger-item overflow-visible">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium" style={{ color: 'rgb(var(--admin-text-secondary))' }}>
            {t('pipeline.stats.successRate')}
          </CardTitle>
          <CheckCircle className="h-5 w-5 admin-icon-glow text-green-400" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold bg-gradient-to-br from-green-400 to-emerald-600 bg-clip-text text-transparent">
            {successRate}%
          </div>
          <p className="text-xs mt-1" style={{ color: 'rgb(var(--admin-text-tertiary))' }}>
            {stats.successCount} {t('pipeline.stats.succeeded')}, {stats.failureCount} {t('pipeline.stats.failed')}
          </p>
        </CardContent>
      </Card>

      <Card className="admin-gradient-border admin-stagger-item overflow-visible">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium" style={{ color: 'rgb(var(--admin-text-secondary))' }}>
            {t('pipeline.stats.totalCost')}
          </CardTitle>
          <DollarSign className="h-5 w-5 admin-icon-glow text-amber-400" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold bg-gradient-to-br from-amber-400 to-orange-600 bg-clip-text text-transparent">
            ${stats.totalCost.toFixed(2)}
          </div>
          <p className="text-xs mt-1" style={{ color: 'rgb(var(--admin-text-tertiary))' }}>
            {t('pipeline.stats.usdSpent')}
          </p>
        </CardContent>
      </Card>

      <Card className="admin-gradient-border admin-stagger-item overflow-visible">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium" style={{ color: 'rgb(var(--admin-text-secondary))' }}>
            {t('pipeline.stats.avgTime')}
          </CardTitle>
          <Clock className="h-5 w-5 admin-icon-glow text-purple-400" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold bg-gradient-to-br from-purple-400 to-pink-600 bg-clip-text text-transparent">
            {formatDuration(stats.avgCompletionTime)}
          </div>
          <p className="text-xs mt-1" style={{ color: 'rgb(var(--admin-text-tertiary))' }}>
            {t('pipeline.stats.perGeneration')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Format duration in milliseconds to human-readable string
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}
