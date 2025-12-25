'use client';

import React, { memo } from 'react';
import { GRAPH_TRANSLATIONS } from '@/lib/generation-graph/translations';
import { getTierModelName } from '@/lib/generation-graph/constants';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Coins, Clock, Gauge, RefreshCw, Download } from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Stage6ControlTowerProps - Props for the Control Tower header component
 *
 * Compact 80px sticky header bar that replaces 4 large metric cards.
 * Displays module title, progress, tokens/cost, quality, time, and actions.
 *
 * Design Philosophy: "Editorial IDE" with Blue/Cyan theme
 */
export interface Stage6ControlTowerProps {
  /** Module title (e.g., "Module 3: React Hooks") */
  moduleTitle: string;
  /** Module UUID */
  moduleId: string;
  /** Aggregated statistics */
  stats: {
    /** Total tokens consumed (formatted as "1.2M tokens"). Optional */
    totalTokens?: number;
    /** Average quality score 0-100 (NOT decimal, show as "92%") */
    avgQuality: number;
    /** Status breakdown */
    statusCounts: {
      completed: number;
      active: number;
      pending: number;
      failed: number;
    };
    /** Total processing duration in milliseconds */
    totalDurationMs: number;
    /** Estimated time remaining (optional) */
    estimatedRemainingMs?: number;
  };
  /** Subscription tier: 'trial' | 'free' | 'basic' | 'standard' | 'premium' */
  modelTier: string;
  /** Locale for translations */
  locale?: 'ru' | 'en';
  /** Callback for "Regenerate All" action */
  onRegenerateAll: () => void;
  /** Callback for "Export All" action */
  onExportAll: () => void;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Format tokens: 1234567 → "1.2M"
 * Uses compact format for display in Control Tower
 */
function formatTokensCompact(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return String(tokens);
}

/**
 * Format duration: 765000ms → "12m 45s"
 * Shows minutes and seconds for better readability
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * Stage6ControlTower - Compact header for Module Dashboard
 *
 * Replaces 4 large metric cards with a single 80px sticky header bar.
 * Shows module title, status breakdown with progress bar, tokens, quality, time, and actions.
 *
 * Features:
 * - Blue/Cyan theme matching "Editorial IDE" design
 * - Status breakdown with progress bar (completed/active/pending/failed)
 * - Tokens display (formatted as "1.2M tokens" NOT USD)
 * - Quality display (as percentage "92%" NOT decimal 0.92)
 * - Model tier display (uses getTierModelName from constants)
 * - Time display (formatted as "12m 45s", shows "~2m left" if estimatedRemainingMs provided)
 * - Actions: Regenerate All + Export buttons (disabled if active > 0)
 *
 * @example
 * ```tsx
 * <Stage6ControlTower
 *   moduleTitle="Module 3: React Hooks"
 *   moduleId="mod-xyz"
 *   stats={{
 *     totalTokens: 1200000,
 *     avgQuality: 92,
 *     statusCounts: { completed: 8, active: 1, pending: 1, failed: 0 },
 *     totalDurationMs: 765000,
 *     estimatedRemainingMs: 120000,
 *   }}
 *   modelTier="high"
 *   locale="ru"
 *   onRegenerateAll={() => console.log('Regenerate all')}
 *   onExportAll={() => console.log('Export all')}
 * />
 * ```
 */
export const Stage6ControlTower = memo<Stage6ControlTowerProps>(function Stage6ControlTower({
  moduleTitle,
  stats,
  modelTier = 'standard',
  locale = 'ru',
  onRegenerateAll,
  onExportAll,
}) {
  const t = GRAPH_TRANSLATIONS.stage6;

  // Calculate progress percentage
  const totalLessons =
    stats.statusCounts.completed +
    stats.statusCounts.active +
    stats.statusCounts.pending +
    stats.statusCounts.failed;
  const readyLessons = stats.statusCounts.completed;
  const progressPercentage = totalLessons > 0 ? (readyLessons / totalLessons) * 100 : 0;

  // Actions disabled when there are active lessons
  const hasActiveLessons = stats.statusCounts.active > 0;

  // Get model tier name
  const tierName = getTierModelName(modelTier, locale);

  return (
    <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border">
      <div className="px-6 py-4">
        {/* Header Row: Module Title */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-foreground">{moduleTitle}</h2>

          {/* Actions */}
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="compact"
              onClick={onRegenerateAll}
              disabled={hasActiveLessons}
            >
              <RefreshCw size={14} />
              {t?.controlTower?.regenerateAll?.[locale] ?? 'Regenerate All'}
            </Button>
            <Button
              variant="default"
              size="compact"
              onClick={onExportAll}
              disabled={hasActiveLessons}
              className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              <Download size={14} />
              {t?.controlTower?.exportAll?.[locale] ?? 'Export'}
            </Button>
          </div>
        </div>

        {/* Metrics Row: 4 compact cards */}
        <div className="grid grid-cols-4 gap-3">
          {/* Card 1: Status Breakdown with Progress Bar */}
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {readyLessons}/{totalLessons}
                </span>
                <span>{t?.controlTower?.ready?.[locale] ?? 'Ready'}</span>
              </div>
            </div>

            {/* Progress Bar */}
            <Progress value={progressPercentage} className="h-2 mb-2" />

            {/* Status counts */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {stats.statusCounts.completed > 0 && (
                <Badge variant="outline" className="bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800">
                  {stats.statusCounts.completed} {t?.status?.completed?.[locale] ?? 'completed'}
                </Badge>
              )}
              {stats.statusCounts.active > 0 && (
                <Badge variant="outline" className="bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800">
                  {stats.statusCounts.active} {t?.status?.active?.[locale] ?? 'active'}
                </Badge>
              )}
              {stats.statusCounts.pending > 0 && (
                <Badge variant="outline" className="bg-gray-50 dark:bg-gray-800/30 text-gray-700 dark:text-gray-400 border-gray-200 dark:border-gray-700">
                  {stats.statusCounts.pending} {t?.status?.pending?.[locale] ?? 'pending'}
                </Badge>
              )}
              {stats.statusCounts.failed > 0 && (
                <Badge variant="outline" className="bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800">
                  {stats.statusCounts.failed} {t?.status?.error?.[locale] ?? 'failed'}
                </Badge>
              )}
            </div>
          </div>

          {/* Card 2: Tokens Used */}
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center gap-2 mb-1">
              <Coins className="h-4 w-4 text-cyan-500 dark:text-cyan-400" />
              <span className="text-xs font-medium text-muted-foreground">
                {t?.controlTower?.tokensUsed?.[locale] ?? 'Tokens'}
              </span>
            </div>
            <div className="text-lg font-mono font-semibold text-foreground">
              {stats.totalTokens !== undefined
                ? formatTokensCompact(stats.totalTokens)
                : '-'}
            </div>
            <div className="text-xs text-muted-foreground">{tierName}</div>
          </div>

          {/* Card 3: Quality Score */}
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center gap-2 mb-1">
              <Gauge className="h-4 w-4 text-blue-500 dark:text-blue-400" />
              <span className="text-xs font-medium text-muted-foreground">
                {t?.controlTower?.quality?.[locale] ?? 'Quality'}
              </span>
            </div>
            <div className="text-lg font-mono font-semibold text-foreground">
              {Math.round(stats.avgQuality)}%
            </div>
            <div className="text-xs text-muted-foreground">
              {t?.status?.completed?.[locale] ?? 'completed'}
            </div>
          </div>

          {/* Card 4: Time */}
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-blue-500 dark:text-blue-400" />
              <span className="text-xs font-medium text-muted-foreground">
                {t?.controlTower?.time?.[locale] ?? 'Time'}
              </span>
            </div>
            <div className="text-lg font-mono font-semibold text-foreground">
              {formatDuration(stats.totalDurationMs)}
            </div>
            {stats.estimatedRemainingMs !== undefined && stats.estimatedRemainingMs > 0 && (
              <div className="text-xs text-muted-foreground">
                ~{formatDuration(stats.estimatedRemainingMs)} {t?.controlTower?.remaining?.[locale] ?? 'left'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

Stage6ControlTower.displayName = 'Stage6ControlTower';

export default Stage6ControlTower;
