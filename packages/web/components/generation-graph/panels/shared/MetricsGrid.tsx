'use client';

import React from 'react';
import { Clock, Zap, Cpu, Activity, RefreshCw, TrendingUp } from 'lucide-react';
import { MetricCard } from './MetricCard';
import { cn } from '@/lib/utils';

export interface MetricsGridProps {
  /** Processing duration in milliseconds */
  duration?: number;
  /** Tokens consumed */
  tokens?: number;
  /** Cost removed - V5 design shows tokens only */
  /** LLM model name */
  model?: string;
  /** Node status */
  status?: string;
  /** Attempt number (1, 2, 3...) */
  attemptNumber?: number;
  /** Retry count */
  retryCount?: number;
  /** Quality score (0-100) */
  qualityScore?: number;
}

/**
 * Format duration to human-readable string
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}m ${seconds}s`;
}

/**
 * Format tokens with thousand separators
 */
function formatTokens(count: number): string {
  return count.toLocaleString();
}

/**
 * Cost display removed - V5 design shows tokens only
 */

/**
 * Get variant based on status
 */
function getStatusVariant(status?: string): 'default' | 'success' | 'warning' | 'error' {
  if (!status) return 'default';

  switch (status.toLowerCase()) {
    case 'completed':
      return 'success';
    case 'error':
    case 'failed':
      return 'error';
    case 'awaiting':
      return 'warning';
    default:
      return 'default';
  }
}

/**
 * MetricsGrid Component
 *
 * Responsive grid layout for metric cards with:
 * - 3 columns on desktop (lg:grid-cols-3)
 * - 2 columns on tablet (md:grid-cols-2)
 * - 1 column on mobile
 * - Staggered animation delays
 * - Optional quality score progress bar
 */
export const MetricsGrid = ({
  duration,
  tokens,
  model,
  status,
  attemptNumber,
  retryCount,
  qualityScore,
}: MetricsGridProps) => {
  const statusVariant = getStatusVariant(status);
  let animationIndex = 0;

  return (
    <div className="space-y-4">
      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Duration */}
        {duration !== undefined && (
          <MetricCard
            icon={<Clock className="w-5 h-5" />}
            label="Duration"
            value={formatDuration(duration)}
            variant="default"
            animationDelay={animationIndex++ * 50}
          />
        )}

        {/* Tokens */}
        {tokens !== undefined && (
          <MetricCard
            icon={<Zap className="w-5 h-5" />}
            label="Tokens"
            value={formatTokens(tokens)}
            variant="default"
            animationDelay={animationIndex++ * 50}
          />
        )}

        {/* Cost display removed - show tokens only per V5 design requirements */}

        {/* Model */}
        {model && (
          <MetricCard
            icon={<Cpu className="w-5 h-5" />}
            label="Model"
            value={model}
            variant="default"
            animationDelay={animationIndex++ * 50}
          />
        )}

        {/* Status */}
        {status && (
          <MetricCard
            icon={<Activity className="w-5 h-5" />}
            label="Status"
            value={status.charAt(0).toUpperCase() + status.slice(1)}
            variant={statusVariant}
            animationDelay={animationIndex++ * 50}
          />
        )}

        {/* Attempt Number */}
        {attemptNumber !== undefined && (
          <MetricCard
            icon={<RefreshCw className="w-5 h-5" />}
            label="Attempt"
            value={`#${attemptNumber}`}
            variant="default"
            animationDelay={animationIndex++ * 50}
          />
        )}

        {/* Retry Count */}
        {retryCount !== undefined && retryCount > 0 ? (
          <MetricCard
            icon={<RefreshCw className="w-5 h-5" />}
            label="Retries"
            value={retryCount}
            variant={retryCount > 2 ? 'warning' : 'default'}
            animationDelay={animationIndex++ * 50}
          />
        ) : null}
      </div>

      {/* Quality Score Progress Bar */}
      {qualityScore !== undefined && (
        <div
          className={cn(
            'opacity-0 animate-fade-in',
            'rounded-lg p-4 border',
            'border-slate-200 dark:border-slate-700/50',
            'bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900'
          )}
          style={{
            animationDelay: `${animationIndex * 50}ms`,
            animationFillMode: 'forwards',
          }}
        >
          <div className="flex items-center gap-3 mb-3">
            <TrendingUp className="w-5 h-5 text-cyan-400" />
            <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
              Quality Score
            </div>
          </div>

          {/* Progress Bar */}
          <div className="relative h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full bg-gradient-to-r transition-all duration-500',
                qualityScore >= 80
                  ? 'from-emerald-500 to-emerald-400'
                  : qualityScore >= 60
                    ? 'from-cyan-500 to-cyan-400'
                    : 'from-amber-500 to-amber-400'
              )}
              style={{ width: `${qualityScore}%` }}
            />
          </div>

          {/* Score Value */}
          <div className="flex justify-end mt-2">
            <div
              className={cn(
                'text-sm font-mono font-semibold',
                qualityScore >= 80
                  ? 'text-emerald-400'
                  : qualityScore >= 60
                    ? 'text-cyan-400'
                    : 'text-amber-400'
              )}
            >
              {qualityScore}%
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
