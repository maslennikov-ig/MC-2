'use client';

import React from 'react';
import { MetricsGrid } from './shared/MetricsGrid';

interface ProcessTabProps {
  duration?: number;
  tokens?: number;
  /** Cost removed - V5 design shows tokens only */
  model?: string;
  status?: string;
  attemptNumber?: number;
  retryCount?: number;
  qualityScore?: number;
}

/**
 * ProcessTab Component
 *
 * Displays processing metrics for a graph node using MetricCard components.
 * Shows duration, tokens, cost, model, status, retries, and quality score.
 */
export const ProcessTab = ({
  duration,
  tokens,
  model,
  status,
  attemptNumber,
  retryCount,
  qualityScore,
}: ProcessTabProps) => {
  return (
    <div>
      <MetricsGrid
        duration={duration}
        tokens={tokens}
        model={model}
        status={status}
        attemptNumber={attemptNumber}
        retryCount={retryCount}
        qualityScore={qualityScore}
      />
    </div>
  );
};
