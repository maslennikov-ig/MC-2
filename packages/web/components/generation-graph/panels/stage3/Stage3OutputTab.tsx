'use client';

import React, { memo, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Scale, Loader2 } from 'lucide-react';
import { GRAPH_TRANSLATIONS } from '@/lib/generation-graph/translations';
import {
  PRIORITY_CONFIG,
  type DocumentPriority,
} from '@/lib/generation-graph/priority-config';
import { PrioritizationView } from '../output/PrioritizationView';
import type { Stage3OutputTabProps, Stage3OutputData } from './types';

// ============================================================================
// PRIORITY DISPLAY CONFIG (extends shared config with stacked bar colors)
// ============================================================================

/**
 * Extended priority config for Stage 3 stacked bar visualization.
 * Uses shared PRIORITY_CONFIG as base, adds solid bg colors for bars.
 */
const PRIORITY_BAR_COLORS: Record<DocumentPriority, { barBg: string }> = {
  CORE: { barBg: 'bg-amber-500' },
  IMPORTANT: { barBg: 'bg-blue-500' },
  SUPPLEMENTARY: { barBg: 'bg-slate-400' },
};

// ============================================================================
// TYPE GUARDS
// ============================================================================

function isStage3OutputData(data: unknown): data is Stage3OutputData {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.success === 'boolean' &&
    typeof d.courseId === 'string' &&
    Array.isArray(d.classifications)
  );
}

// ============================================================================
// SUBCOMPONENTS
// ============================================================================

interface HierarchyDistributionProps {
  coreCount: number;
  importantCount: number;
  supplementaryCount: number;
  total: number;
  locale: 'ru' | 'en';
}

/**
 * Stacked bar showing document distribution by priority
 * Uses shared PRIORITY_CONFIG for labels/icons/styling
 */
const HierarchyDistribution = memo<HierarchyDistributionProps>(
  function HierarchyDistribution({ coreCount, importantCount, supplementaryCount, total, locale }) {
    const t = GRAPH_TRANSLATIONS.stage3 as Record<string, { ru: string; en: string }>;

    // Calculate percentages
    const corePercent = total > 0 ? (coreCount / total) * 100 : 0;
    const importantPercent = total > 0 ? (importantCount / total) * 100 : 0;
    const suppPercent = total > 0 ? (supplementaryCount / total) * 100 : 0;

    // Build segments using shared PRIORITY_CONFIG
    const segments = [
      {
        key: 'CORE' as DocumentPriority,
        count: coreCount,
        percent: corePercent,
        config: PRIORITY_CONFIG.CORE,
        barBg: PRIORITY_BAR_COLORS.CORE.barBg,
      },
      {
        key: 'IMPORTANT' as DocumentPriority,
        count: importantCount,
        percent: importantPercent,
        config: PRIORITY_CONFIG.IMPORTANT,
        barBg: PRIORITY_BAR_COLORS.IMPORTANT.barBg,
      },
      {
        key: 'SUPPLEMENTARY' as DocumentPriority,
        count: supplementaryCount,
        percent: suppPercent,
        config: PRIORITY_CONFIG.SUPPLEMENTARY,
        barBg: PRIORITY_BAR_COLORS.SUPPLEMENTARY.barBg,
      },
    ].filter((seg) => seg.count > 0);

    return (
      <Card className="border-l-4 border-l-amber-500">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Scale className="h-4 w-4 text-amber-500" />
            {t.hierarchyDistribution?.[locale] ?? 'Document Hierarchy'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Stacked Bar */}
          <div className="h-6 w-full rounded-full overflow-hidden bg-muted flex">
            {segments.map((seg) => (
              <div
                key={seg.key}
                className={cn('h-full transition-all duration-500', seg.barBg)}
                style={{ width: `${seg.percent}%` }}
                title={`${seg.config.label[locale]}: ${seg.count}`}
              />
            ))}
          </div>

          {/* Legend */}
          <div className="grid grid-cols-3 gap-2">
            {segments.map((seg) => {
              const Icon = seg.config.icon;
              return (
                <div
                  key={seg.key}
                  className="flex items-center gap-2 p-2 rounded-md bg-muted/50"
                >
                  <div className={cn('w-3 h-3 rounded-sm', seg.barBg)} />
                  <Icon className={cn('h-3.5 w-3.5', seg.config.style.text)} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{seg.config.label[locale]}</div>
                    <div className="text-xs text-muted-foreground">
                      {seg.count} ({Math.round(seg.percent)}%)
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  }
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Stage3OutputTab Component
 *
 * Shows document classification results:
 * - Hierarchy Distribution: Stacked bar with CORE/IMPORTANT/SUPPLEMENTARY counts
 * - Priority Table: Wraps existing PrioritizationView for editing
 */
export const Stage3OutputTab = memo<Stage3OutputTabProps>(function Stage3OutputTab({
  courseId,
  outputData,
  isEditable = false,
  isLoading = false,
  onApprove,
  locale = 'ru',
}) {
  const t = GRAPH_TRANSLATIONS.stage3 as Record<string, { ru: string; en: string }>;

  // Parse output data
  const data = useMemo((): Stage3OutputData | null => {
    if (isStage3OutputData(outputData)) {
      return outputData;
    }
    return null;
  }, [outputData]);

  // Calculate counts from data or show zeros
  const counts = useMemo(() => {
    if (data) {
      return {
        core: data.coreCount,
        important: data.importantCount,
        supplementary: data.supplementaryCount,
        total: data.totalDocuments,
      };
    }
    return { core: 0, important: 0, supplementary: 0, total: 0 };
  }, [data]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500 mb-4" />
        <p className="text-sm text-muted-foreground">
          {locale === 'ru' ? 'Загрузка классификации...' : 'Loading classification...'}
        </p>
      </div>
    );
  }

  // Empty state - no course ID
  if (!courseId) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <Scale className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <p className="text-sm text-muted-foreground">
          {t.emptyOutput?.[locale] ?? 'No classification data available'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-1">
      {/* Hierarchy Distribution */}
      {counts.total > 0 && (
        <HierarchyDistribution
          coreCount={counts.core}
          importantCount={counts.important}
          supplementaryCount={counts.supplementary}
          total={counts.total}
          locale={locale}
        />
      )}

      {/* Priority Table - wraps existing PrioritizationView */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">
            {t.priorityTable?.[locale] ?? 'Document Priorities'}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <PrioritizationView
            courseId={courseId}
            editable={isEditable}
            readOnly={!isEditable}
            onApproved={onApprove}
          />
        </CardContent>
      </Card>
    </div>
  );
});

export default Stage3OutputTab;
