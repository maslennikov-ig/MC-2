'use client';

import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  FileText,
  Puzzle,
  Image,
  Type,
  Sparkles,
  Eye,
  CheckCircle2,
  Clock,
  XCircle,
  TrendingUp,
  Loader2,
} from 'lucide-react';
import { GRAPH_TRANSLATIONS } from '@/lib/generation-graph/translations';
import { formatNumber, MARKDOWN_TRUNCATE_LIMIT } from '@/lib/generation-graph/format-utils';
import { MetricCard } from '../shared/MetricCard';
import type { Stage2OutputTabProps, Stage2OutputData, DocumentStats } from './types';

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Runtime type guard for Stage2OutputData
 * Validates that the data has the required structure before use
 */
function isStage2OutputData(data: unknown): data is Stage2OutputData {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.vectorStatus === 'string' &&
    ['pending', 'indexing', 'indexed', 'failed'].includes(d.vectorStatus as string)
  );
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * Stage 2 Output translation keys used in this component
 */
type Stage2OutputTranslationKey =
  | 'executiveSummary'
  | 'summaryEmpty'
  | 'knowledgeAtoms'
  | 'atomPages'
  | 'atomChunks'
  | 'atomVisuals'
  | 'atomTokens'
  | 'qualityHealth'
  | 'qualityHigh'
  | 'qualityHighDesc'
  | 'qualityMedium'
  | 'qualityMediumDesc'
  | 'qualityLow'
  | 'qualityLowDesc'
  | 'inspectMarkdown'
  | 'contentTruncated'
  | 'vectorStatus'
  | 'vectorIndexed'
  | 'vectorPending'
  | 'vectorFailed';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get translation helper with safe fallback
 */
function getTranslation(key: Stage2OutputTranslationKey, locale: 'ru' | 'en'): string {
  const translations = GRAPH_TRANSLATIONS.stage2;
  if (!translations) return key;
  const entry = translations[key as keyof typeof translations];
  if (!entry) return key;
  return (entry as { ru: string; en: string })[locale] || key;
}

/**
 * Get quality configuration based on score
 */
function getQualityConfig(score: number): {
  color: 'emerald' | 'cyan' | 'amber';
  label: 'qualityHigh' | 'qualityMedium' | 'qualityLow';
  desc: 'qualityHighDesc' | 'qualityMediumDesc' | 'qualityLowDesc';
} {
  if (score >= 80) {
    return { color: 'emerald', label: 'qualityHigh', desc: 'qualityHighDesc' };
  }
  if (score >= 60) {
    return { color: 'cyan', label: 'qualityMedium', desc: 'qualityMediumDesc' };
  }
  return { color: 'amber', label: 'qualityLow', desc: 'qualityLowDesc' };
}

/**
 * Get vector status config for badge styling
 */
function getVectorStatusConfig(status: Stage2OutputData['vectorStatus']): {
  icon: React.ReactNode;
  colorClass: string;
  labelKey: 'vectorIndexed' | 'vectorPending' | 'vectorFailed';
} {
  switch (status) {
    case 'indexed':
      return {
        icon: <CheckCircle2 className="h-3.5 w-3.5" />,
        colorClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
        labelKey: 'vectorIndexed',
      };
    case 'pending':
    case 'indexing':
      return {
        icon: <Clock className="h-3.5 w-3.5 animate-pulse" />,
        colorClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800',
        labelKey: 'vectorPending',
      };
    case 'failed':
      return {
        icon: <XCircle className="h-3.5 w-3.5" />,
        colorClass: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800',
        labelKey: 'vectorFailed',
      };
    default:
      return {
        icon: <Clock className="h-3.5 w-3.5" />,
        colorClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700',
        labelKey: 'vectorPending',
      };
  }
}

// ============================================================================
// SUBCOMPONENTS
// ============================================================================

interface ExecutiveSummaryCardProps {
  summaryText: string | undefined;
  t: (key: Stage2OutputTranslationKey) => string;
}

/**
 * Executive Summary Card with gradient border
 */
const ExecutiveSummaryCard = memo<ExecutiveSummaryCardProps>(
  function ExecutiveSummaryCard({ summaryText, t }) {
    const displayText = summaryText || t('summaryEmpty');
    const isEmpty = !summaryText;

    return (
      <Card className="relative overflow-hidden">
        {/* Gradient border effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-indigo-500 opacity-10 dark:opacity-20" />
        <div className="absolute inset-[1px] bg-white dark:bg-slate-900 rounded-[7px]" />

        <CardHeader className="relative pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <Sparkles className="h-3.5 w-3.5 text-white" />
            </div>
            {t('executiveSummary')}
          </CardTitle>
        </CardHeader>
        <CardContent className="relative px-4 pb-4 pt-0">
          <p
            className={cn(
              'text-sm leading-relaxed',
              isEmpty
                ? 'text-slate-500 dark:text-slate-400 italic'
                : 'text-slate-700 dark:text-slate-300'
            )}
          >
            {displayText}
          </p>
        </CardContent>
      </Card>
    );
  }
);

interface KnowledgeAtomsGridProps {
  stats: DocumentStats | undefined;
  t: (key: Stage2OutputTranslationKey) => string;
}

/**
 * Knowledge Atoms 2x2 Grid
 */
const KnowledgeAtomsGrid = memo<KnowledgeAtomsGridProps>(
  function KnowledgeAtomsGrid({ stats, t }) {
    const metrics = useMemo(() => {
      const pages = stats?.pages ?? 0;
      const chunks = stats?.chunksCreated ?? 0;
      const visuals = (stats?.images ?? 0) + (stats?.tables ?? 0);
      const tokens = stats?.tokensEmbedded ?? 0;

      return [
        {
          icon: <FileText className="h-full w-full" />,
          label: t('atomPages'),
          value: pages,
        },
        {
          icon: <Puzzle className="h-full w-full" />,
          label: t('atomChunks'),
          value: chunks,
        },
        {
          icon: <Image className="h-full w-full" />,
          label: t('atomVisuals'),
          value: visuals,
        },
        {
          icon: <Type className="h-full w-full" />,
          label: t('atomTokens'),
          value: formatNumber(tokens),
        },
      ];
    }, [stats, t]);

    return (
      <Card className="overflow-hidden">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
              <Puzzle className="h-3.5 w-3.5 text-white" />
            </div>
            {t('knowledgeAtoms')}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          <div className="grid grid-cols-2 gap-3">
            {metrics.map((metric, index) => (
              <MetricCard
                key={metric.label}
                icon={metric.icon}
                label={metric.label}
                value={metric.value}
                animationDelay={index * 100}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }
);

interface QualityHealthSectionProps {
  qualityScore: number;
  markdownContent: string | undefined;
  t: (key: Stage2OutputTranslationKey) => string;
}

/**
 * Quality Health Section with progress bar and markdown inspector
 */
const QualityHealthSection = memo<QualityHealthSectionProps>(
  function QualityHealthSection({ qualityScore, markdownContent, t }) {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // Reset loading when dialog opens
    useEffect(() => {
      if (isDialogOpen) {
        setIsLoading(true);
        // Simulate async load for large content
        const timer = setTimeout(() => setIsLoading(false), 100);
        return () => clearTimeout(timer);
      }
      return undefined;
    }, [isDialogOpen]);

    // Score is 0-1, convert to percentage
    const scorePercent = Math.round(qualityScore * 100);
    const qualityConfig = getQualityConfig(scorePercent);

    const progressColorClass = useMemo(() => {
      switch (qualityConfig.color) {
        case 'emerald':
          return 'bg-emerald-500 dark:bg-emerald-400';
        case 'cyan':
          return 'bg-cyan-500 dark:bg-cyan-400';
        case 'amber':
          return 'bg-amber-500 dark:bg-amber-400';
        default:
          return 'bg-blue-500';
      }
    }, [qualityConfig.color]);

    const bgColorClass = useMemo(() => {
      switch (qualityConfig.color) {
        case 'emerald':
          return 'bg-emerald-100 dark:bg-emerald-900/30';
        case 'cyan':
          return 'bg-cyan-100 dark:bg-cyan-900/30';
        case 'amber':
          return 'bg-amber-100 dark:bg-amber-900/30';
        default:
          return 'bg-slate-100 dark:bg-slate-800';
      }
    }, [qualityConfig.color]);

    return (
      <Card className="overflow-hidden">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <TrendingUp className="h-3.5 w-3.5 text-white" />
            </div>
            {t('qualityHealth')}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0 space-y-4">
          {/* Quality Score Display */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {t(qualityConfig.label)}
              </span>
              <span className={cn(
                'text-lg font-mono font-bold',
                qualityConfig.color === 'emerald' && 'text-emerald-600 dark:text-emerald-400',
                qualityConfig.color === 'cyan' && 'text-cyan-600 dark:text-cyan-400',
                qualityConfig.color === 'amber' && 'text-amber-600 dark:text-amber-400'
              )}>
                {scorePercent}%
              </span>
            </div>

            {/* Custom Progress Bar */}
            <div className={cn('relative h-3 w-full overflow-hidden rounded-full', bgColorClass)}>
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500 ease-out',
                  progressColorClass
                )}
                style={{ width: `${scorePercent}%` }}
              />
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t(qualityConfig.desc)}
            </p>
          </div>

          {/* Inspect Markdown Button */}
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <span id="markdown-preview-desc" className="sr-only">
              {t('inspectMarkdown')}
            </span>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                disabled={!markdownContent}
                aria-label={t('inspectMarkdown')}
                aria-describedby="markdown-preview-desc"
              >
                <Eye className="h-4 w-4" aria-hidden="true" />
                {t('inspectMarkdown')}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[80vh]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" aria-hidden="true" />
                  {t('inspectMarkdown')}
                </DialogTitle>
              </DialogHeader>
              {isLoading ? (
                <div className="h-[60vh] flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <ScrollArea className="h-[60vh] w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-4">
                  <pre className="text-sm font-mono text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">
                    {markdownContent?.slice(0, MARKDOWN_TRUNCATE_LIMIT) || ''}
                    {(markdownContent?.length ?? 0) > MARKDOWN_TRUNCATE_LIMIT && (
                      <div className="text-amber-600 dark:text-amber-400 mt-4 text-xs">
                        ... ({t('contentTruncated') || 'содержимое обрезано, превышает 100KB'})
                      </div>
                    )}
                  </pre>
                </ScrollArea>
              )}
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    );
  }
);

interface VectorStatusBadgeProps {
  status: Stage2OutputData['vectorStatus'];
  t: (key: Stage2OutputTranslationKey) => string;
}

/**
 * Vector Indexing Status Badge
 */
const VectorStatusBadge = memo<VectorStatusBadgeProps>(
  function VectorStatusBadge({ status, t }) {
    const config = getVectorStatusConfig(status);

    return (
      <div className="flex items-center justify-center py-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {t('vectorStatus')}:
          </span>
          <Badge
            className={cn(
              'text-xs font-medium gap-1.5',
              config.colorClass
            )}
          >
            {config.icon}
            {t(config.labelKey)}
          </Badge>
        </div>
      </div>
    );
  }
);

// ============================================================================
// EMPTY STATE
// ============================================================================

interface EmptyStateProps {
  t: (key: Stage2OutputTranslationKey) => string;
}

const EmptyState = memo<EmptyStateProps>(function EmptyState({ t }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
        <Sparkles className="h-6 w-6 text-slate-400 dark:text-slate-500" />
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400 max-w-[240px]">
        {t('summaryEmpty')}
      </p>
    </div>
  );
});

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Stage2OutputTab Component
 *
 * Shows "Proof of Quality" - the results of document processing:
 * - Executive Summary: AI-generated summary of the document
 * - Knowledge Atoms: Metrics grid (pages, chunks, visuals, tokens)
 * - Quality Health: Processing quality score with progress bar
 * - Vector Status: Indexing status badge
 * - Markdown Inspector: Dialog to view raw processed markdown
 */
export const Stage2OutputTab = memo<Stage2OutputTabProps>(function Stage2OutputTab({
  outputData,
  courseId: _courseId, // Available for future use
  documentId: _documentId, // Available for future use
  locale = 'ru',
}) {
  // Type guard and data extraction with runtime validation
  const data = useMemo(() => {
    return isStage2OutputData(outputData) ? outputData : undefined;
  }, [outputData]);

  // Translation helper
  const t = useCallback(
    (key: Stage2OutputTranslationKey) => getTranslation(key, locale),
    [locale]
  );

  // Extract key values with defaults
  const summaryText = data?.summarization?.summaryText;
  const qualityScore = (() => {
    const raw = data?.summarization?.qualityScore ?? 0;
    return Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0;
  })();
  const stats = data?.stats;
  const markdownContent = data?.markdownContent;
  const vectorStatus = data?.vectorStatus ?? 'pending';

  // ============================================================================
  // EMPTY STATE
  // ============================================================================

  if (!data) {
    return <EmptyState t={t} />;
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="space-y-4 p-1">
      {/* Section A: Executive Summary */}
      <ExecutiveSummaryCard summaryText={summaryText} t={t} />

      {/* Section B: Knowledge Atoms Grid */}
      <KnowledgeAtomsGrid stats={stats} t={t} />

      {/* Section C: Quality Health */}
      <QualityHealthSection
        qualityScore={qualityScore}
        markdownContent={markdownContent}
        t={t}
      />

      {/* Section D: Vector Status Badge */}
      <VectorStatusBadge status={vectorStatus} t={t} />
    </div>
  );
});

export default Stage2OutputTab;
