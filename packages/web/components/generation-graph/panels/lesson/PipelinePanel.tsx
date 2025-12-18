'use client';

import React from 'react';
import {
  PipelineNodeState,
  Stage6NodeName,
} from '@megacampus/shared-types';
import { VerticalPipelineStepper } from '../../components/VerticalPipelineStepper';
import { cn } from '@/lib/utils';

// =============================================================================
// Types
// =============================================================================

interface PipelinePanelProps {
  /** Pipeline nodes with detailed state */
  nodes: PipelineNodeState[];
  /** Currently active node (null if pending or completed) */
  currentNode: Stage6NodeName | null;
  /** Callback when user clicks retry button on a failed node */
  onRetryNode?: (node: Stage6NodeName) => void;
  /** Callback when user clicks to view node output */
  onViewOutput?: (node: Stage6NodeName, output: unknown) => void;
  /** Additional CSS classes */
  className?: string;
}

// =============================================================================
// Component
// =============================================================================

/**
 * PipelinePanel - Left side of Lesson Inspector
 *
 * Displays:
 * - Pipeline stepper (vertical, scrollable) - Shows detailed node states
 *
 * Layout:
 * - Stepper: full height, scrollable if content overflows
 *
 * Features:
 * - Full dark mode support
 * - Responsive layout
 * - Node retry buttons for errors
 * - Output preview buttons
 *
 * Used in: Lesson Inspector (left panel)
 */
export function PipelinePanel({
  nodes,
  currentNode,
  onRetryNode,
  onViewOutput,
  className,
}: PipelinePanelProps) {
  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Конвейер генерации
        </h2>
      </div>

      {/* Pipeline Stepper (scrollable) */}
      <div className="flex-1 overflow-y-auto px-4 py-4 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600 scrollbar-track-transparent">
        <VerticalPipelineStepper
          nodes={nodes}
          currentNode={currentNode}
          onRetryNode={onRetryNode}
          onViewOutput={onViewOutput}
        />
      </div>
    </div>
  );
}
