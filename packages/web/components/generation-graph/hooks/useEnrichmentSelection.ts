'use client';

import { useMemo } from 'react';
import type { EnrichmentType } from '@megacampus/shared-types';

/**
 * Enrichment selection state for count-based routing
 */
export interface EnrichmentSelectionState {
  /** Total count of enrichments for the lesson */
  count: number;
  /** Whether the lesson has no enrichments (show EmptyStateCards) */
  isEmpty: boolean;
  /** Whether the lesson has exactly one enrichment (auto-select) */
  hasSingle: boolean;
  /** Whether the lesson has multiple enrichments (show list) */
  hasMultiple: boolean;
  /** Counts by enrichment type */
  countByType: Record<EnrichmentType, number>;
  /** Types that are present */
  presentTypes: EnrichmentType[];
  /** Types that are missing (can be added) */
  missingTypes: EnrichmentType[];
}

/**
 * All available enrichment types
 */
const ALL_ENRICHMENT_TYPES: EnrichmentType[] = ['quiz', 'video', 'audio', 'presentation', 'document'];

/**
 * Hook for count-based routing logic in the enrichment inspector
 *
 * Determines what view to show based on enrichment count:
 * - 0 enrichments: EmptyStateCards
 * - 1 enrichment: Auto-select and show detail (optional)
 * - 2+ enrichments: Show list
 *
 * @param enrichments - Array of enrichments for the current lesson
 * @returns Selection state with counts and routing helpers
 *
 * @example
 * ```tsx
 * const { isEmpty, hasMultiple, countByType } = useEnrichmentSelection(enrichments);
 *
 * if (isEmpty) return <EmptyStateCards />;
 * if (hasMultiple) return <EnrichmentList />;
 * ```
 */
export function useEnrichmentSelection(
  enrichments: Array<{ type: EnrichmentType }> | null | undefined
): EnrichmentSelectionState {
  return useMemo(() => {
    const items = enrichments ?? [];
    const count = items.length;

    // Count by type
    const countByType: Record<EnrichmentType, number> = {
      quiz: 0,
      video: 0,
      audio: 0,
      presentation: 0,
      document: 0,
    };

    for (const enrichment of items) {
      if (enrichment.type in countByType) {
        countByType[enrichment.type]++;
      }
    }

    // Determine present and missing types
    const presentTypes = ALL_ENRICHMENT_TYPES.filter((type) => countByType[type] > 0);
    const missingTypes = ALL_ENRICHMENT_TYPES.filter((type) => countByType[type] === 0);

    return {
      count,
      isEmpty: count === 0,
      hasSingle: count === 1,
      hasMultiple: count > 1,
      countByType,
      presentTypes,
      missingTypes,
    };
  }, [enrichments]);
}

/**
 * Get the first enrichment ID if there's exactly one
 * Useful for auto-selecting single enrichments
 */
export function useSingleEnrichmentId(
  enrichments: Array<{ id: string }> | null | undefined
): string | null {
  return useMemo(() => {
    const items = enrichments ?? [];
    return items.length === 1 ? items[0].id : null;
  }, [enrichments]);
}
