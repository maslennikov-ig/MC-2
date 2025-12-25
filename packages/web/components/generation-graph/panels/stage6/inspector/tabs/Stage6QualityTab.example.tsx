'use client';

import React from 'react';
import { Stage6QualityTab } from './Stage6QualityTab';
import type { SelfReviewResult, JudgeVerdictDisplay } from '@megacampus/shared-types';

/**
 * Example usage of Stage6QualityTab component
 *
 * This file demonstrates the Two-Gate Waterfall layout with different
 * self-review and judge result combinations.
 */

// =============================================================================
// EXAMPLE DATA
// =============================================================================

const selfReviewPassExample: SelfReviewResult = {
  status: 'PASS',
  reasoning: 'Content passed all integrity checks. No issues found.',
  issues: [],
  tokensUsed: 150,
  durationMs: 1200,
  heuristicsPassed: true,
  patchedContent: null,
};

const selfReviewFixedExample: SelfReviewResult = {
  status: 'FIXED',
  reasoning: 'Auto-corrected 2 hygiene issues (chatbot artifacts removed).',
  issues: [
    {
      type: 'HYGIENE',
      severity: 'FIXABLE',
      location: 'Section 2',
      description: 'Removed "As an AI assistant" phrasing',
    },
    {
      type: 'HYGIENE',
      severity: 'FIXABLE',
      location: 'Section 3',
      description: 'Fixed markdown formatting error',
    },
  ],
  patchedContent: { /* Full patched content object */ },
  tokensUsed: 450,
  durationMs: 2300,
  heuristicsPassed: true,
};

const selfReviewFlagExample: SelfReviewResult = {
  status: 'FLAG_TO_JUDGE',
  reasoning: 'Detected potential hallucination. Requires judge evaluation.',
  issues: [
    {
      type: 'HALLUCINATION',
      severity: 'COMPLEX',
      location: 'Section 3',
      description: 'Content may contradict RAG context',
    },
  ],
  tokensUsed: 320,
  durationMs: 1800,
  heuristicsPassed: true,
  patchedContent: null,
};

const selfReviewRegenerateExample: SelfReviewResult = {
  status: 'REGENERATE',
  reasoning: 'Critical integrity failure: content appears truncated.',
  issues: [
    {
      type: 'TRUNCATION',
      severity: 'CRITICAL',
      location: 'Global',
      description: 'Content ends mid-sentence, likely truncated',
    },
  ],
  tokensUsed: 200,
  durationMs: 1500,
  heuristicsPassed: false,
  patchedContent: null,
};

const judgeResultExample: JudgeVerdictDisplay = {
  votingResult: {
    votes: [
      {
        judgeId: 'judge-1',
        modelId: 'claude-3.5-sonnet',
        modelDisplayName: 'Claude 3.5 Sonnet',
        verdict: 'ACCEPT_WITH_MINOR_REVISION',
        score: 0.88,
        criteria: {
          coherence: 0.92,
          accuracy: 0.85,
          completeness: 0.90,
          readability: 0.85,
        },
        reasoning: 'Strong content with minor clarity issues in Section 3. Recommend targeted fix.',
        evaluatedAt: new Date(),
      },
      {
        judgeId: 'judge-2',
        modelId: 'gpt-4o',
        modelDisplayName: 'GPT-4o',
        verdict: 'ACCEPT_WITH_MINOR_REVISION',
        score: 0.86,
        criteria: {
          coherence: 0.88,
          accuracy: 0.84,
          completeness: 0.87,
          readability: 0.85,
        },
        reasoning: 'Good overall quality. Section 3 needs better examples.',
        evaluatedAt: new Date(),
      },
    ],
    consensusMethod: 'unanimous',
    finalVerdict: 'ACCEPT_WITH_MINOR_REVISION',
    finalScore: 0.87,
    isThirdJudgeInvoked: false,
  },
  heuristicsPassed: true,
  cascadeStage: 'clev_voting',
  stageReason: 'Required CLEV voting due to moderate content complexity',
};

// =============================================================================
// EXAMPLE COMPONENTS
// =============================================================================

export function Stage6QualityTabPassExample() {
  return (
    <div className="p-8 bg-slate-50 dark:bg-slate-950">
      <h2 className="text-lg font-bold mb-4">Example: PASS Status</h2>
      <Stage6QualityTab
        selfReviewResult={selfReviewPassExample}
        judgeResult={judgeResultExample}
        locale="en"
      />
    </div>
  );
}

export function Stage6QualityTabFixedExample() {
  return (
    <div className="p-8 bg-slate-50 dark:bg-slate-950">
      <h2 className="text-lg font-bold mb-4">Example: FIXED Status</h2>
      <Stage6QualityTab
        selfReviewResult={selfReviewFixedExample}
        judgeResult={judgeResultExample}
        originalContent="Original content before fixes..."
        fixedContent="Fixed content after self-review..."
        locale="en"
      />
    </div>
  );
}

export function Stage6QualityTabFlagExample() {
  return (
    <div className="p-8 bg-slate-50 dark:bg-slate-950">
      <h2 className="text-lg font-bold mb-4">Example: FLAG_TO_JUDGE Status</h2>
      <Stage6QualityTab
        selfReviewResult={selfReviewFlagExample}
        judgeResult={judgeResultExample}
        locale="en"
      />
    </div>
  );
}

export function Stage6QualityTabRegenerateExample() {
  return (
    <div className="p-8 bg-slate-50 dark:bg-slate-950">
      <h2 className="text-lg font-bold mb-4">Example: REGENERATE Status (Gate 2 Disabled)</h2>
      <Stage6QualityTab
        selfReviewResult={selfReviewRegenerateExample}
        judgeResult={undefined} // Judge never ran
        locale="en"
      />
    </div>
  );
}

export function Stage6QualityTabRussianExample() {
  return (
    <div className="p-8 bg-slate-50 dark:bg-slate-950">
      <h2 className="text-lg font-bold mb-4">Пример: Русская локализация</h2>
      <Stage6QualityTab
        selfReviewResult={selfReviewFixedExample}
        judgeResult={judgeResultExample}
        locale="ru"
      />
    </div>
  );
}

// Default export for Storybook/testing
export default function Stage6QualityTabExamples() {
  return (
    <div className="space-y-8">
      <Stage6QualityTabPassExample />
      <Stage6QualityTabFixedExample />
      <Stage6QualityTabFlagExample />
      <Stage6QualityTabRegenerateExample />
      <Stage6QualityTabRussianExample />
    </div>
  );
}
