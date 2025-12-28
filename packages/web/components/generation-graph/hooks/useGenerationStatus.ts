'use client';

import { useMemo } from 'react';
import type { EnrichmentStatus } from '@megacampus/shared-types';

/**
 * Generation phase for UI display
 */
export type GenerationPhase =
  | 'idle' // No generation in progress
  | 'queued' // Job created, waiting to start
  | 'generating' // Generation in progress
  | 'draft_review' // Draft ready for review (two-stage)
  | 'finalizing' // Final generation after draft approval
  | 'completed' // Generation successful
  | 'failed'; // Generation failed

/**
 * Generation status state
 */
export interface GenerationStatusState {
  /** Current generation phase */
  phase: GenerationPhase;
  /** Whether generation is in progress (any active phase) */
  isGenerating: boolean;
  /** Whether user action is required (draft review) */
  requiresAction: boolean;
  /** Whether the enrichment is in a terminal state */
  isTerminal: boolean;
  /** Progress percentage (0-100) if available */
  progress: number | null;
  /** Status message for display */
  statusMessage: string;
  /** Whether the status can be cancelled */
  canCancel: boolean;
  /** Whether regeneration is available */
  canRegenerate: boolean;
}

/**
 * Map database status to UI phase
 */
function statusToPhase(status: EnrichmentStatus): GenerationPhase {
  switch (status) {
    case 'pending':
      return 'queued';
    case 'draft_generating':
      return 'generating';
    case 'draft_ready':
      return 'draft_review';
    case 'generating':
      return 'finalizing';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    default:
      return 'idle';
  }
}

/**
 * Get localized status message
 */
function getStatusMessage(phase: GenerationPhase, locale: string): string {
  const messages: Record<GenerationPhase, { en: string; ru: string }> = {
    idle: { en: 'Ready', ru: 'Готово' },
    queued: { en: 'Queued...', ru: 'В очереди...' },
    generating: { en: 'Generating...', ru: 'Генерация...' },
    draft_review: { en: 'Draft ready for review', ru: 'Черновик готов к проверке' },
    finalizing: { en: 'Finalizing...', ru: 'Финализация...' },
    completed: { en: 'Completed', ru: 'Завершено' },
    failed: { en: 'Generation failed', ru: 'Ошибка генерации' },
  };

  return locale === 'ru' ? messages[phase].ru : messages[phase].en;
}

/**
 * Hook for optimistic handoff behavior during enrichment generation
 *
 * Provides UI-friendly status information and action availability
 * based on the current enrichment status.
 *
 * @param status - Current enrichment status from database
 * @param progress - Optional progress percentage (0-100)
 * @param locale - Current locale for messages ('en' | 'ru')
 * @returns Generation status state with phase and action availability
 *
 * @example
 * ```tsx
 * const { isGenerating, phase, statusMessage, canCancel } = useGenerationStatus(
 *   enrichment.status,
 *   enrichment.progress,
 *   locale
 * );
 *
 * if (isGenerating) {
 *   return <GenerationProgress message={statusMessage} />;
 * }
 * ```
 */
export function useGenerationStatus(
  status: EnrichmentStatus | null | undefined,
  progress?: number | null,
  locale: string = 'en'
): GenerationStatusState {
  return useMemo(() => {
    const phase = status ? statusToPhase(status) : 'idle';

    const isGenerating = phase === 'queued' || phase === 'generating' || phase === 'finalizing';
    const requiresAction = phase === 'draft_review';
    const isTerminal = phase === 'completed' || phase === 'failed' || phase === 'idle';

    return {
      phase,
      isGenerating,
      requiresAction,
      isTerminal,
      progress: progress ?? null,
      statusMessage: getStatusMessage(phase, locale),
      canCancel: isGenerating,
      canRegenerate: phase === 'completed' || phase === 'failed',
    };
  }, [status, progress, locale]);
}

/**
 * Check if any enrichments in a list are generating
 */
export function useAnyGenerating(
  enrichments: Array<{ status: EnrichmentStatus }> | null | undefined
): boolean {
  return useMemo(() => {
    const items = enrichments ?? [];
    return items.some((e) => {
      const phase = statusToPhase(e.status);
      return phase === 'queued' || phase === 'generating' || phase === 'finalizing';
    });
  }, [enrichments]);
}

/**
 * Check if any enrichments require action (draft review)
 */
export function useAnyRequireAction(
  enrichments: Array<{ status: EnrichmentStatus }> | null | undefined
): boolean {
  return useMemo(() => {
    const items = enrichments ?? [];
    return items.some((e) => statusToPhase(e.status) === 'draft_review');
  }, [enrichments]);
}
