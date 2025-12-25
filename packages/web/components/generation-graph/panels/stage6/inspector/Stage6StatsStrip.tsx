'use client';

import React, { memo } from 'react';
import { cn } from '@/lib/utils';
import { getTierModelName } from '@/lib/generation-graph/constants';
import { STAGE6_NODE_LABELS } from '@megacampus/shared-types';
import type { Stage6NodeName } from '@megacampus/shared-types';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Coins, Clock, Zap, ShieldCheck, AlertTriangle } from 'lucide-react';

interface Stage6StatsStripProps {
  tokens: number;
  durationMs: number;
  /** Subscription tier: 'trial' | 'free' | 'basic' | 'standard' | 'premium' */
  modelTier: string;
  quality: number;
  tokensBreakdown?: Record<Stage6NodeName, number>;
  locale?: 'ru' | 'en';
}

// Format tokens compactly: 14500 → "14.5K"
function formatTokensCompact(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return String(tokens);
}

// Format duration: 42000ms → "42s", 125000ms → "2m 5s"
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
}

const QualityIndicator = memo(({ quality }: { quality: number }) => {
  const isGood = quality >= 85;
  const isWarning = quality < 70;

  return (
    <span
      className={cn(
        'flex items-center gap-1 font-medium',
        isGood && 'text-emerald-600 dark:text-emerald-400',
        isWarning && 'text-amber-600 dark:text-amber-400',
        !isGood && !isWarning && 'text-foreground'
      )}
    >
      {isGood && <ShieldCheck className="h-3.5 w-3.5" />}
      {isWarning && <AlertTriangle className="h-3.5 w-3.5" />}
      {quality}%
    </span>
  );
});
QualityIndicator.displayName = 'QualityIndicator';

const TokensMetric = memo(
  ({
    tokens,
    tokensBreakdown,
    locale = 'en',
  }: {
    tokens: number;
    tokensBreakdown?: Record<Stage6NodeName, number>;
    locale?: 'ru' | 'en';
  }) => {
    const hasBreakdown = tokensBreakdown && Object.keys(tokensBreakdown).length > 0;

    // Simple display without tooltip when no breakdown
    if (!hasBreakdown) {
      return (
        <div className="flex items-center gap-1.5 text-sm">
          <Coins className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
          <span className="font-medium">{formatTokensCompact(tokens)}</span>
          <span className="text-muted-foreground">
            {locale === 'ru' ? 'токенов' : 'tokens'}
          </span>
        </div>
      );
    }

    // With breakdown tooltip
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 text-sm cursor-help">
              <Coins className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
              <span className="font-medium">{formatTokensCompact(tokens)}</span>
              <span className="text-muted-foreground">
                {locale === 'ru' ? 'токенов' : 'tokens'}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <div className="space-y-1">
              <div className="text-xs font-semibold text-muted-foreground uppercase">
                {locale === 'ru' ? 'Токены по нодам' : 'Token Breakdown'}
              </div>
              {Object.entries(tokensBreakdown).map(([nodeName, nodeTokens]) => {
                // STAGE6_NODE_LABELS has { ru, description } - use ru for Russian, nodeName for English (fallback)
                const label = locale === 'ru'
                  ? (STAGE6_NODE_LABELS[nodeName as Stage6NodeName]?.ru || nodeName)
                  : nodeName;
                return (
                  <div
                    key={nodeName}
                    className="flex items-center justify-between text-sm gap-3"
                  >
                    <span className="text-muted-foreground">{label}:</span>
                    <span className="font-mono font-medium">
                      {formatTokensCompact(nodeTokens)}
                    </span>
                  </div>
                );
              })}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
);
TokensMetric.displayName = 'TokensMetric';

const TimeMetric = memo(
  ({ durationMs, locale: _locale = 'en' }: { durationMs: number; locale?: 'ru' | 'en' }) => {
    return (
      <div className="flex items-center gap-1.5 text-sm">
        <Clock className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
        <span className="font-medium">{formatDuration(durationMs)}</span>
      </div>
    );
  }
);
TimeMetric.displayName = 'TimeMetric';

const ModelTierMetric = memo(
  ({ modelTier, locale = 'en' }: { modelTier: string; locale?: 'ru' | 'en' }) => {
    const tierName = getTierModelName(modelTier, locale);

    return (
      <div className="flex items-center gap-1.5 text-sm">
        <Zap className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
        <span className="font-medium">{tierName}</span>
      </div>
    );
  }
);
ModelTierMetric.displayName = 'ModelTierMetric';

const QualityMetric = memo(
  ({ quality, locale = 'en' }: { quality: number; locale?: 'ru' | 'en' }) => {
    return (
      <div className="flex items-center gap-1.5 text-sm">
        <span className="text-muted-foreground">
          {locale === 'ru' ? 'Качество' : 'Quality'}:
        </span>
        <QualityIndicator quality={quality} />
      </div>
    );
  }
);
QualityMetric.displayName = 'QualityMetric';

export const Stage6StatsStrip = memo(
  ({
    tokens,
    durationMs,
    modelTier,
    quality,
    tokensBreakdown,
    locale = 'en',
  }: Stage6StatsStripProps) => {
    return (
      <div className="sticky top-0 z-10 flex items-center gap-4 px-4 py-2 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-700">
        <TokensMetric
          tokens={tokens}
          tokensBreakdown={tokensBreakdown}
          locale={locale}
        />

        <div className="h-4 w-px bg-border" />

        <TimeMetric durationMs={durationMs} locale={locale} />

        <div className="h-4 w-px bg-border" />

        <ModelTierMetric modelTier={modelTier} locale={locale} />

        <div className="h-4 w-px bg-border" />

        <QualityMetric quality={quality} locale={locale} />
      </div>
    );
  }
);
Stage6StatsStrip.displayName = 'Stage6StatsStrip';
