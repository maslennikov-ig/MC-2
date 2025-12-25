/**
 * Stage6ControlTower Example Usage
 *
 * This file demonstrates how to use the Stage6ControlTower component
 * in the Module Dashboard.
 *
 * DO NOT import this file in production code - it's for documentation only.
 */

import React from 'react';
import { Stage6ControlTower } from './Stage6ControlTower';

/**
 * Example 1: Module with mixed status (some completed, some active, some pending)
 */
export function ExampleMixedStatus() {
  return (
    <Stage6ControlTower
      moduleTitle="Module 3: React Hooks"
      moduleId="mod-abc123"
      stats={{
        totalTokens: 1_200_000, // 1.2M tokens
        avgQuality: 92, // 92% quality
        statusCounts: {
          completed: 8,
          active: 1,
          pending: 1,
          failed: 0,
        },
        totalDurationMs: 765_000, // 12m 45s
        estimatedRemainingMs: 120_000, // ~2m left
      }}
      modelTier="high"
      locale="ru"
      onRegenerateAll={() => {
        console.log('Regenerate all lessons clicked');
        // TODO: Implement regeneration logic
      }}
      onExportAll={() => {
        console.log('Export all lessons clicked');
        // TODO: Implement export logic
      }}
    />
  );
}

/**
 * Example 2: Module with all lessons completed
 */
export function ExampleAllCompleted() {
  return (
    <Stage6ControlTower
      moduleTitle="Module 1: Introduction to JavaScript"
      moduleId="mod-xyz789"
      stats={{
        totalTokens: 850_000, // 850K tokens
        avgQuality: 88, // 88% quality
        statusCounts: {
          completed: 10,
          active: 0,
          pending: 0,
          failed: 0,
        },
        totalDurationMs: 600_000, // 10m
        // No estimatedRemainingMs when all completed
      }}
      modelTier="medium"
      locale="en"
      onRegenerateAll={() => console.log('Regenerate all')}
      onExportAll={() => console.log('Export all')}
    />
  );
}

/**
 * Example 3: Module with errors
 */
export function ExampleWithErrors() {
  return (
    <Stage6ControlTower
      moduleTitle="Module 5: Advanced TypeScript"
      moduleId="mod-def456"
      stats={{
        totalTokens: 2_500_000, // 2.5M tokens
        avgQuality: 75, // Lower quality due to errors
        statusCounts: {
          completed: 6,
          active: 1,
          pending: 1,
          failed: 2,
        },
        totalDurationMs: 1_200_000, // 20m
        estimatedRemainingMs: 300_000, // ~5m left
      }}
      modelTier="high"
      locale="ru"
      onRegenerateAll={() => console.log('Regenerate all')}
      onExportAll={() => console.log('Export all')}
    />
  );
}

/**
 * Example 4: Module just starting (all pending)
 */
export function ExampleAllPending() {
  return (
    <Stage6ControlTower
      moduleTitle="Module 2: CSS Fundamentals"
      moduleId="mod-ghi789"
      stats={{
        totalTokens: 0, // No tokens used yet
        avgQuality: 0, // No quality score yet
        statusCounts: {
          completed: 0,
          active: 0,
          pending: 12,
          failed: 0,
        },
        totalDurationMs: 0,
        // estimatedRemainingMs not available for pending lessons
      }}
      modelTier="medium"
      locale="ru"
      onRegenerateAll={() => console.log('Regenerate all')}
      onExportAll={() => console.log('Export all')}
    />
  );
}

/**
 * Usage in Module Dashboard Container:
 *
 * ```tsx
 * import { Stage6ControlTower } from '@/components/generation-graph/panels/stage6/dashboard/Stage6ControlTower';
 *
 * function ModuleDashboard({ moduleId }: { moduleId: string }) {
 *   const { data, isLoading } = useModuleDashboardData(moduleId);
 *
 *   if (isLoading) return <Skeleton />;
 *   if (!data) return <ErrorState />;
 *
 *   return (
 *     <div className="flex flex-col h-full">
 *       {/* Control Tower - sticky header *\/}
 *       <Stage6ControlTower
 *         moduleTitle={data.title}
 *         moduleId={data.moduleId}
 *         stats={{
 *           totalTokens: data.aggregates.totalTokensUsed,
 *           avgQuality: data.aggregates.avgQualityScore ?? 0,
 *           statusCounts: {
 *             completed: data.aggregates.completedLessons,
 *             active: data.aggregates.activeLessons,
 *             pending: data.aggregates.pendingLessons,
 *             failed: data.aggregates.errorLessons,
 *           },
 *           totalDurationMs: data.aggregates.totalDurationMs,
 *           estimatedRemainingMs: data.aggregates.estimatedTimeRemainingMs,
 *         }}
 *         modelTier="high"
 *         locale="ru"
 *         onRegenerateAll={handleRegenerateAll}
 *         onExportAll={handleExportAll}
 *       />
 *
 *       {/* Lesson Matrix Table *\/}
 *       <div className="flex-1 overflow-auto">
 *         <LessonMatrixTable lessons={data.lessons} />
 *       </div>
 *     </div>
 *   );
 * }
 * ```
 */
