/**
 * AssetDock Component
 * Semantic zoom-aware enrichment status display for lesson nodes
 *
 * Displays enrichment summary with 3 zoom levels:
 * - Dot Mode (zoom < 0.4): Single colored dot
 * - Count Mode (0.4 ≤ zoom < 0.6): Badge with enrichment count
 * - Icons Mode (zoom ≥ 0.6): Individual enrichment type icons
 *
 * @module components/generation-graph/nodes/AssetDock
 */

import React from 'react';
import { useViewport } from '@xyflow/react';
import { useTranslations } from 'next-intl';
import type { EnrichmentSummaryForNode } from '@megacampus/shared-types';
import {
  ENRICHMENT_TYPE_CONFIG,
  ENRICHMENT_STATUS_CONFIG,
  type EnrichmentType,
  type EnrichmentStatus,
} from '@/lib/generation-graph/enrichment-config';

export interface AssetDockProps {
  /** Enrichment summary data for this lesson */
  enrichments?: EnrichmentSummaryForNode[];
  /** Whether any enrichment has errors */
  hasErrors?: boolean;
  /** Whether any enrichment is generating */
  isGenerating?: boolean;
  /** Total enrichment count */
  count?: number;
}

/**
 * AssetDock component - shows enrichment status on lesson nodes
 */
export const AssetDock: React.FC<AssetDockProps> = ({
  enrichments = [],
  hasErrors = false,
  isGenerating = false,
  count = 0,
}) => {
  const { zoom } = useViewport();
  const t = useTranslations('enrichments');

  // Empty state - return null if no enrichments
  if (enrichments.length === 0) {
    return null;
  }

  // Determine overall state for dot/count modes
  const getDotColor = (): string => {
    if (hasErrors) return 'bg-red-500 dark:bg-red-400';
    if (isGenerating) return 'bg-blue-500 dark:bg-blue-400';

    // Check if all enrichments are completed
    const allCompleted = enrichments.every(
      (e) => ENRICHMENT_STATUS_CONFIG[e.status as EnrichmentStatus].isComplete
    );

    if (allCompleted) return 'bg-green-500 dark:bg-green-400';
    return 'bg-slate-400 dark:bg-slate-500';
  };

  const getBadgeColor = (): string => {
    if (hasErrors) return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700';
    if (isGenerating) return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700';

    const allCompleted = enrichments.every(
      (e) => ENRICHMENT_STATUS_CONFIG[e.status as EnrichmentStatus].isComplete
    );

    if (allCompleted) return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700';
    return 'bg-slate-100 dark:bg-slate-900/30 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700';
  };

  // Localized enrichment count tooltip
  const enrichmentCountText = t('assetDock.enrichmentCount', { count });

  // Dot Mode: zoom < 0.4
  if (zoom < 0.4) {
    return (
      <div className="flex items-center justify-center h-[14px]">
        <div
          className={`
            w-1.5 h-1.5 rounded-full transition-all duration-300
            ${getDotColor()}
            ${isGenerating ? 'animate-pulse' : ''}
          `}
          title={enrichmentCountText}
          role="img"
          aria-label={enrichmentCountText}
        />
      </div>
    );
  }

  // Count Mode: 0.4 ≤ zoom < 0.6
  if (zoom < 0.6) {
    return (
      <div className="flex items-center justify-center h-[14px]">
        <div
          className={`
            px-1.5 py-0.5 rounded text-[10px] font-medium border transition-all duration-300
            ${getBadgeColor()}
            ${isGenerating ? 'animate-pulse' : ''}
          `}
          title={enrichmentCountText}
          role="img"
          aria-label={enrichmentCountText}
        >
          {count}
        </div>
      </div>
    );
  }

  // Icons Mode: zoom ≥ 0.6
  // Display up to 5 icons (one per enrichment type)
  // Sort by type order for consistency
  const sortedEnrichments = [...enrichments].sort(
    (a, b) => ENRICHMENT_TYPE_CONFIG[a.type as EnrichmentType].order - ENRICHMENT_TYPE_CONFIG[b.type as EnrichmentType].order
  );

  return (
    <div className="flex items-center gap-1 h-[14px] px-1">
      {sortedEnrichments.slice(0, 5).map((enrichment) => {
        const config = ENRICHMENT_TYPE_CONFIG[enrichment.type as EnrichmentType];
        const statusConfig = ENRICHMENT_STATUS_CONFIG[enrichment.status as EnrichmentStatus];
        const Icon = config.icon;

        // Determine icon color based on status
        const getIconColor = (): string => {
          // Error takes priority
          if (statusConfig.isError) {
            return 'text-red-500 dark:text-red-400';
          }
          // Use type color for normal states
          return config.color;
        };

        // Build localized tooltip with type name and status suffix
        const typeName = t(`types.${enrichment.type}`);
        const statusSuffix = statusConfig.animate
          ? ` (${t('assetDock.generating')})`
          : statusConfig.isError
            ? ` (${t('assetDock.error')})`
            : '';
        const tooltipText = `${typeName}${statusSuffix}`;

        return (
          <div
            key={enrichment.type}
            title={tooltipText}
            role="img"
            aria-label={tooltipText}
          >
            <Icon
              className={`
                w-3.5 h-3.5 transition-all duration-300
                ${getIconColor()}
                ${statusConfig.animate ? 'animate-pulse' : ''}
              `}
            />
          </div>
        );
      })}
    </div>
  );
};

export default AssetDock;
