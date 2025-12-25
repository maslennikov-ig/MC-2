'use client';

import React, { memo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  ShieldCheck,
  Wrench,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  Scale,
  Eye,
  XCircle,
} from 'lucide-react';
import type {
  SelfReviewResult,
  JudgeVerdictDisplay,
  SelfReviewStatus,
  JudgeVerdictType,
  IndividualJudgeVote,
} from '@megacampus/shared-types';

// =============================================================================
// TYPES
// =============================================================================

interface Stage6QualityTabProps {
  /** Self-review result from Gate 1 */
  selfReviewResult?: SelfReviewResult;
  /** Judge result from Gate 2 */
  judgeResult?: JudgeVerdictDisplay;
  /** Original content before fixes (for diff view) */
  originalContent?: string;
  /** Fixed content after self-review (for diff view) */
  fixedContent?: string;
  /** Locale for translations */
  locale?: 'ru' | 'en';
}

// =============================================================================
// GATE 1: SELF-REVIEWER COMPONENT
// =============================================================================

interface SelfReviewGateProps {
  result?: SelfReviewResult;
  onViewDiff?: () => void;
  locale: 'ru' | 'en';
}

/**
 * SelfReviewGate - Visual representation of Gate 1 (Auto-Correction)
 *
 * Displays self-review status with color-coded cards:
 * - PASS: Green banner
 * - FIXED: Blue card with View Diff button
 * - FLAG_TO_JUDGE: Amber card with warnings
 * - PASS_WITH_FLAGS: Amber card with informational flags
 * - REGENERATE: Red card (critical failure)
 */
const SelfReviewGate = memo(function SelfReviewGate({
  result,
  onViewDiff,
  locale,
}: SelfReviewGateProps) {
  const t = (key: string) => {
    // Fallback translations for self-review
    const translations: Record<string, { ru: string; en: string }> = {
      gate1Title: { ru: 'ЭТАП 1: Автокоррекция (SelfReviewer)', en: 'GATE 1: Auto-Correction (SelfReviewer)' },
      pending: { ru: 'Ожидание...', en: 'Pending...' },
      passTitle: { ru: 'Проблем не найдено', en: 'No issues found' },
      passDesc: { ru: 'Готово к финальной оценке', en: 'Ready for final assessment' },
      fixedTitle: { ru: 'Исправлено автоматически', en: 'Auto-Fixed' },
      fixedDesc: { ru: 'проблем исправлено', en: 'issues corrected' },
      viewDiff: { ru: 'Посмотреть изменения', en: 'View Diff' },
      flagTitle: { ru: 'Требует внимания', en: 'Needs Review' },
      flagDesc: { ru: 'Передано судьям для оценки', en: 'Forwarded to judges for evaluation' },
      passWithFlagsTitle: { ru: 'Прошло с замечаниями', en: 'Passed with Flags' },
      passWithFlagsDesc: { ru: 'Содержимое приемлемо, но есть наблюдения', en: 'Content acceptable with observations' },
      regenerateTitle: { ru: 'Требуется перегенерация', en: 'Regeneration Required' },
      regenerateDesc: { ru: 'Критические ошибки, требуется полная переработка', en: 'Critical errors, full regeneration needed' },
      tokensUsed: { ru: 'Токены', en: 'Tokens' },
      duration: { ru: 'Время', en: 'Duration' },
    };
    return translations[key]?.[locale] || key;
  };

  if (!result) {
    return (
      <Card className="border-slate-300 dark:border-slate-700">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">
            {t('gate1Title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
            <div className="h-4 w-4 animate-pulse rounded-full bg-slate-300 dark:bg-slate-700" />
            <span className="text-sm">{t('pending')}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Status-specific configuration
  const statusConfig: Record<
    SelfReviewStatus,
    {
      icon: React.ElementType;
      color: string;
      bgColor: string;
      title: string;
      description: string;
    }
  > = {
    PASS: {
      icon: ShieldCheck,
      color: 'text-emerald-700 dark:text-emerald-400',
      bgColor: 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20',
      title: t('passTitle'),
      description: t('passDesc'),
    },
    FIXED: {
      icon: Wrench,
      color: 'text-blue-700 dark:text-blue-400',
      bgColor: 'border-blue-500 bg-blue-50 dark:bg-blue-950/20',
      title: t('fixedTitle'),
      description: `${result.issues?.length || 0} ${t('fixedDesc')}`,
    },
    FLAG_TO_JUDGE: {
      icon: AlertTriangle,
      color: 'text-amber-700 dark:text-amber-400',
      bgColor: 'border-amber-500 bg-amber-50 dark:bg-amber-950/20',
      title: t('flagTitle'),
      description: t('flagDesc'),
    },
    PASS_WITH_FLAGS: {
      icon: AlertTriangle,
      color: 'text-amber-700 dark:text-amber-400',
      bgColor: 'border-amber-500 bg-amber-50 dark:bg-amber-950/20',
      title: t('passWithFlagsTitle'),
      description: t('passWithFlagsDesc'),
    },
    REGENERATE: {
      icon: RefreshCw,
      color: 'text-red-700 dark:text-red-400',
      bgColor: 'border-red-500 bg-red-50 dark:bg-red-950/20',
      title: t('regenerateTitle'),
      description: t('regenerateDesc'),
    },
  };

  const config = statusConfig[result.status];
  const IconComponent = config.icon;

  return (
    <Card className={cn('border-2', config.bgColor)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">
            {t('gate1Title')}
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {result.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Status banner */}
        <div className="flex items-start gap-3">
          <IconComponent className={cn('h-6 w-6 flex-shrink-0', config.color)} />
          <div className="flex-1">
            <h4 className={cn('font-semibold', config.color)}>{config.title}</h4>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{config.description}</p>
          </div>
        </div>

        {/* Reasoning */}
        {result.reasoning && (
          <div className="rounded-md bg-slate-100 dark:bg-slate-800 p-3">
            <p className="text-sm text-slate-700 dark:text-slate-300">{result.reasoning}</p>
          </div>
        )}

        {/* Issues list */}
        {result.issues && result.issues.length > 0 && (
          <div className="space-y-2">
            <h5 className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide">
              {locale === 'ru' ? 'Обнаружено' : 'Issues Found'}
            </h5>
            <ul className="space-y-1">
              {result.issues.slice(0, 3).map((issue, idx) => (
                <li key={idx} className="text-sm text-slate-600 dark:text-slate-400">
                  <span className="font-medium">{issue.location}:</span> {issue.description}
                </li>
              ))}
              {result.issues.length > 3 && (
                <li className="text-xs text-slate-500 dark:text-slate-500">
                  {locale === 'ru' ? `+${result.issues.length - 3} ещё` : `+${result.issues.length - 3} more`}
                </li>
              )}
            </ul>
          </div>
        )}

        {/* View Diff button for FIXED status */}
        {result.status === 'FIXED' && onViewDiff && (
          <Button variant="outline" size="sm" onClick={onViewDiff} className="w-full">
            <Eye className="h-4 w-4 mr-2" />
            {t('viewDiff')}
          </Button>
        )}

        {/* Metrics */}
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-500">
          <span>
            {t('tokensUsed')}: {result.tokensUsed || 0}
          </span>
          <span>
            {t('duration')}: {result.durationMs ? `${Math.round(result.durationMs)}ms` : 'N/A'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
});

// =============================================================================
// CRITERIA LABELS (LOCALIZED)
// =============================================================================

const CRITERIA_LABELS: Record<string, { ru: string; en: string }> = {
  coherence: { ru: 'Согласованность', en: 'Coherence' },
  accuracy: { ru: 'Точность', en: 'Accuracy' },
  completeness: { ru: 'Полнота', en: 'Completeness' },
  readability: { ru: 'Читаемость', en: 'Readability' },
  engagement: { ru: 'Вовлечённость', en: 'Engagement' },
  structure: { ru: 'Структура', en: 'Structure' },
  examples: { ru: 'Примеры', en: 'Examples' },
  exercises: { ru: 'Упражнения', en: 'Exercises' },
  depth: { ru: 'Глубина', en: 'Depth' },
  clarity: { ru: 'Ясность', en: 'Clarity' },
  style: { ru: 'Стиль', en: 'Style' },
  pedagogical_value: { ru: 'Педагогическая ценность', en: 'Pedagogical Value' },
  factual_accuracy: { ru: 'Фактическая точность', en: 'Factual Accuracy' },
};

/**
 * Get localized criterion label
 */
function getCriterionLabel(criterion: string, locale: 'ru' | 'en'): string {
  const labels = CRITERIA_LABELS[criterion.toLowerCase()];
  if (labels) return labels[locale];
  // Fallback: capitalize and replace underscores
  return criterion.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// =============================================================================
// INDIVIDUAL JUDGE VOTE CARD
// =============================================================================

interface JudgeVoteCardProps {
  vote: IndividualJudgeVote;
  isTieBreaker?: boolean;
  locale: 'ru' | 'en';
}

const JudgeVoteCard = memo(function JudgeVoteCard({
  vote,
  isTieBreaker = false,
  locale,
}: JudgeVoteCardProps) {
  const verdictColors: Record<string, string> = {
    ACCEPT: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
    ACCEPT_WITH_MINOR_REVISION: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    ITERATIVE_REFINEMENT: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
    REGENERATE: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    ESCALATE_TO_HUMAN: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  };

  const scorePercent = Math.round((vote.score > 1 ? vote.score : vote.score * 100));
  const scoreColor = scorePercent >= 80 ? 'text-emerald-600 dark:text-emerald-400' :
                     scorePercent >= 60 ? 'text-yellow-600 dark:text-yellow-400' :
                     'text-red-600 dark:text-red-400';

  return (
    <div
      className={cn(
        'rounded-lg border p-3',
        isTieBreaker
          ? 'border-purple-400 bg-purple-50 dark:bg-purple-950/20'
          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
      )}
    >
      {/* Header: Model + Score */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {vote.judgeId}
          </span>
          {isTieBreaker && (
            <Badge className="text-[10px] bg-purple-600 text-white">
              {locale === 'ru' ? 'Решающий' : 'Tie-breaker'}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('text-lg font-bold', scoreColor)}>
            {scorePercent}%
          </span>
          <Badge className={cn('text-xs', verdictColors[vote.verdict] || verdictColors.ACCEPT)}>
            {vote.verdict}
          </Badge>
        </div>
      </div>

      {/* Model name */}
      <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mb-2">
        {vote.modelDisplayName || vote.modelId}
      </p>

      {/* Criteria (if expanded or always show) */}
      {vote.criteria && Object.keys(vote.criteria).length > 0 && (
        <div className="space-y-1.5 mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
          {Object.entries(vote.criteria).map(([criterion, rawScore]) => {
            const score = rawScore as number;
            const scoreValue = score > 1 ? score : score * 100;
            return (
              <div key={criterion} className="space-y-0.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600 dark:text-slate-400">
                    {getCriterionLabel(criterion, locale)}
                  </span>
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {Math.round(scoreValue)}%
                  </span>
                </div>
                <Progress value={scoreValue} className="h-1" />
              </div>
            );
          })}
        </div>
      )}

      {/* Reasoning (collapsible) */}
      {vote.reasoning && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300">
            {locale === 'ru' ? 'Комментарий судьи' : 'Judge reasoning'}
          </summary>
          <p className="mt-2 text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900 p-2 rounded">
            {vote.reasoning}
          </p>
        </details>
      )}
    </div>
  );
});
JudgeVoteCard.displayName = 'JudgeVoteCard';

// =============================================================================
// GATE 2: JUDGE COMPONENT
// =============================================================================

interface JudgeGateProps {
  result?: JudgeVerdictDisplay;
  isDisabled: boolean;
  locale: 'ru' | 'en';
}

/**
 * JudgeGate - Visual representation of Gate 2 (Final Assessment)
 *
 * Shows ALL judge votes (not just first) with:
 * - Individual judge cards with scores
 * - Localized criteria names
 * - Consensus method and final verdict
 * - Cascade stage indicator
 */
const JudgeGate = memo(function JudgeGate({ result, isDisabled, locale }: JudgeGateProps) {
  const t = (key: string) => {
    const translations: Record<string, { ru: string; en: string }> = {
      gate2Title: { ru: 'ЭТАП 2: Финальная оценка (Judge)', en: 'GATE 2: Final Assessment (Judge)' },
      skipped: { ru: 'Пропущено (требуется перегенерация)', en: 'Skipped (Regeneration Required)' },
      pending: { ru: 'Ожидание...', en: 'Pending...' },
      finalScore: { ru: 'Итоговая оценка', en: 'Final Score' },
      consensus: { ru: 'Консенсус', en: 'Consensus' },
      heuristic: { ru: 'Эвристика', en: 'Heuristic' },
      singleJudge: { ru: 'Один судья', en: 'Single Judge' },
      clevVoting: { ru: 'CLEV Голосование', en: 'CLEV Voting' },
      unanimous: { ru: 'Единогласно', en: 'Unanimous' },
      majority: { ru: 'Большинством', en: 'Majority' },
      tieBreaker: { ru: 'Решающий голос', en: 'Tie-Breaker' },
      judgeVotes: { ru: 'Оценки судей', en: 'Judge Votes' },
    };
    return translations[key]?.[locale] || key;
  };

  if (isDisabled) {
    return (
      <Card className="opacity-50 pointer-events-none border-slate-300 dark:border-slate-700">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">
            {t('gate2Title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
            <XCircle className="h-4 w-4" />
            <span className="text-sm">{t('skipped')}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!result) {
    return (
      <Card className="border-slate-300 dark:border-slate-700">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">
            {t('gate2Title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
            <div className="h-4 w-4 animate-pulse rounded-full bg-slate-300 dark:bg-slate-700" />
            <span className="text-sm">{t('pending')}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Verdict color mapping
  const verdictColors: Record<JudgeVerdictType, string> = {
    ACCEPT: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
    ACCEPT_WITH_MINOR_REVISION: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    ITERATIVE_REFINEMENT: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
    REGENERATE: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    ESCALATE_TO_HUMAN: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  };

  const consensusLabels: Record<string, string> = {
    unanimous: t('unanimous'),
    majority: t('majority'),
    'tie-breaker': t('tieBreaker'),
  };

  const cascadeLabels: Record<string, string> = {
    heuristic: t('heuristic'),
    single_judge: t('singleJudge'),
    clev_voting: t('clevVoting'),
  };

  // Calculate final score from votes if votingResult.finalScore is 0 or invalid
  const calculateFinalScore = (): number => {
    const rawScore = result.votingResult.finalScore;
    // If rawScore is valid (not 0 and defined), use it
    if (rawScore && rawScore > 0) {
      return rawScore > 1 ? rawScore : rawScore * 100;
    }
    // Fallback: average of vote scores
    const votes = result.votingResult.votes;
    if (votes.length === 0) return 0;
    const avgScore = votes.reduce((sum, v) => sum + (v.score > 1 ? v.score : v.score * 100), 0) / votes.length;
    return Math.round(avgScore);
  };

  const finalScorePercent = Math.round(calculateFinalScore());

  return (
    <Card className="border-2 border-cyan-500 bg-cyan-50 dark:bg-cyan-950/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">
            {t('gate2Title')}
          </CardTitle>
          {result.cascadeStage && (
            <Badge variant="outline" className="text-xs">
              {cascadeLabels[result.cascadeStage] || result.cascadeStage}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Final Score & Verdict */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wide">
              {t('finalScore')}
            </div>
            <div className="text-2xl font-bold text-cyan-700 dark:text-cyan-400">
              {finalScorePercent}%
            </div>
          </div>
          <Badge className={verdictColors[result.votingResult.finalVerdict]}>
            {result.votingResult.finalVerdict}
          </Badge>
        </div>

        {/* Consensus Method */}
        <div className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-slate-500 dark:text-slate-400" />
          <span className="text-xs text-slate-600 dark:text-slate-400">
            {t('consensus')}: {consensusLabels[result.votingResult.consensusMethod] || result.votingResult.consensusMethod}
          </span>
        </div>

        {/* ALL Judge Votes */}
        {result.votingResult.votes.length > 0 && (
          <div className="space-y-3">
            <h5 className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide">
              {t('judgeVotes')} ({result.votingResult.votes.length})
            </h5>
            <div className="space-y-2">
              {result.votingResult.votes.map((vote, idx) => (
                <JudgeVoteCard
                  key={vote.judgeId || `judge-${idx}`}
                  vote={vote}
                  isTieBreaker={result.votingResult.tieBreakerId === vote.judgeId}
                  locale={locale}
                />
              ))}
            </div>
          </div>
        )}

        {/* Heuristic Issues */}
        {!result.heuristicsPassed && result.heuristicsIssues && result.heuristicsIssues.length > 0 && (
          <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3">
            <h5 className="text-xs font-medium text-amber-800 dark:text-amber-300 mb-2">
              {locale === 'ru' ? 'Эвристические проблемы' : 'Heuristic Issues'}
            </h5>
            <ul className="space-y-1">
              {result.heuristicsIssues.map((issue, idx) => (
                <li key={idx} className="text-sm text-amber-700 dark:text-amber-400">
                  • {issue}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
});
JudgeGate.displayName = 'JudgeGate';

// =============================================================================
// CONNECTING ARROW
// =============================================================================

const ConnectingArrow = memo(function ConnectingArrow() {
  return (
    <div className="flex justify-center py-2">
      <ChevronDown className="h-6 w-6 text-cyan-500 dark:text-cyan-400 animate-pulse" />
    </div>
  );
});

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * Stage6QualityTab - Two-Gate Waterfall layout for Quality tab
 *
 * Design Decision: "SelfReviewer runs *before* Judge - UI must show linear dependency.
 * Do NOT place them side-by-side."
 *
 * Layout:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ GATE 1: Auto-Correction (SelfReviewer)                          │
 * │ ┌─────────────────────────────────────────────────────────────┐ │
 * │ │ Status card (green/blue/amber/red based on result)          │ │
 * │ └─────────────────────────────────────────────────────────────┘ │
 * │                              ↓                                   │
 * │ GATE 2: Final Assessment (Judge)                                │
 * │ ┌─────────────────────────────────────────────────────────────┐ │
 * │ │ Rubric grid, verdict, critique                              │ │
 * │ └─────────────────────────────────────────────────────────────┘ │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Logic: If Gate 1 = REGENERATE, Gate 2 is disabled/grayed (Judge never ran).
 */
export const Stage6QualityTab = memo(function Stage6QualityTab({
  selfReviewResult,
  judgeResult,
  originalContent,
  fixedContent,
  locale = 'en',
}: Stage6QualityTabProps) {
  const [showDiffModal, setShowDiffModal] = useState(false);

  // Determine if Gate 2 should be disabled
  const isGate2Disabled = selfReviewResult?.status === 'REGENERATE';

  const handleViewDiff = () => {
    setShowDiffModal(true);
    // TODO: Implement diff viewer modal
    console.log('View Diff:', { originalContent, fixedContent });
  };

  return (
    <div className="space-y-4 p-6">
      {/* Gate 1: Self-Reviewer */}
      <SelfReviewGate
        result={selfReviewResult}
        onViewDiff={handleViewDiff}
        locale={locale}
      />

      {/* Connecting Arrow */}
      <ConnectingArrow />

      {/* Gate 2: Judge */}
      <JudgeGate result={judgeResult} isDisabled={isGate2Disabled} locale={locale} />

      {/* TODO: Implement DiffViewer modal */}
      {showDiffModal && (
        <div
          key="diff-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="diff-modal-title"
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"
        >
          <div className="bg-white dark:bg-slate-900 rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-auto">
            <h3 id="diff-modal-title" className="text-lg font-semibold mb-4">
              {locale === 'ru' ? 'Сравнение изменений' : 'Diff Viewer'}
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              {locale === 'ru' ? 'Модуль просмотра изменений будет реализован позже' : 'Diff viewer will be implemented later'}
            </p>
            <Button onClick={() => setShowDiffModal(false)}>
              {locale === 'ru' ? 'Закрыть' : 'Close'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
});
