/**
 * BestEffortWarning Usage Examples
 *
 * This file demonstrates how to use the BestEffortWarning component
 * with different quality statuses and scenarios.
 */

import React from 'react';
import { BestEffortWarning } from './BestEffortWarning';
import type { BestEffortDisplay } from '@megacampus/shared-types';

// Example 1: Acceptable quality (yellow/amber)
const acceptableResult: BestEffortDisplay = {
  isActive: true,
  selectedIteration: 3,
  selectionReason: 'Наивысший балл среди всех итераций',
  finalScore: 7.2,
  targetThreshold: 8.0,
  qualityStatus: 'acceptable',
  statusLabel: 'Приемлемое качество, но ниже порога',
  warningMessage: 'Целевой порог 8.0 не достигнут после 3 итераций. Выбран лучший результат.',
  requiresReview: false,
};

// Example 2: Below standard (orange/red) with review required
const belowStandardResult: BestEffortDisplay = {
  isActive: true,
  selectedIteration: 5,
  selectionReason: 'Последняя итерация',
  finalScore: 6.5,
  targetThreshold: 8.0,
  qualityStatus: 'below_standard',
  statusLabel: 'Качество ниже стандарта',
  warningMessage: 'Качество значительно ниже целевого порога. Рекомендуется ручная проверка и доработка.',
  requiresReview: true,
};

// Example 3: Meets threshold (shouldn't happen in best-effort, but supported)
const meetsThresholdResult: BestEffortDisplay = {
  isActive: true,
  selectedIteration: 2,
  selectionReason: 'Достигнут порог',
  finalScore: 8.1,
  targetThreshold: 8.0,
  qualityStatus: 'meets_threshold',
  statusLabel: 'Порог достигнут',
  warningMessage: null,
  requiresReview: false,
};

export function BestEffortWarningExamples() {
  return (
    <div className="space-y-6 p-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold mb-2">Acceptable Quality</h2>
        <BestEffortWarning result={acceptableResult} />
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-2">Below Standard (Requires Review)</h2>
        <BestEffortWarning result={belowStandardResult} />
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-2">Meets Threshold</h2>
        <BestEffortWarning result={meetsThresholdResult} />
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-2">Dismissible Example</h2>
        <BestEffortWarning
          result={acceptableResult}
          onDismiss={() => console.log('Warning dismissed')}
        />
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-2">Not Active (No Display)</h2>
        <BestEffortWarning
          result={{ ...acceptableResult, isActive: false }}
        />
        <p className="text-sm text-slate-500 mt-2">
          (Component returns null when isActive is false)
        </p>
      </div>
    </div>
  );
}

/**
 * Integration Example: Using in a generation result display
 */
export function GenerationResultWithWarning() {
  // This would come from your API/state
  const bestEffortData: BestEffortDisplay = acceptableResult;

  return (
    <div className="space-y-4">
      {/* Show warning at the top of results */}
      <BestEffortWarning result={bestEffortData} />

      {/* Rest of your generation results UI */}
      <div className="p-4 border rounded-lg">
        <h3 className="font-medium">Результаты генерации</h3>
        {/* ... other content ... */}
      </div>
    </div>
  );
}
