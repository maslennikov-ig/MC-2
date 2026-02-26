/**
 * Tests Mermaid render gate in processJudgeDecision
 * @module stages/stage6-lesson-content/nodes/judge-mermaid-render-gate.test
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JudgeContext } from '@/stages/stage6-lesson-content/nodes/judge-node-helpers';
import { DecisionAction } from '@/stages/stage6-lesson-content/judge/decision-engine';

vi.mock('@/shared/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/shared/trace-logger', () => ({
  logTrace: vi.fn(),
}));

vi.mock('@/stages/stage6-lesson-content/judge/judge-output-builder', () => ({
  buildEnrichedJudgeOutput: vi.fn(() => ({ judge: [] })),
  extractJudgeModels: vi.fn(() => []),
}));

vi.mock('@/stages/stage6-lesson-content/judge/judge-progress', () => ({
  buildJudgeProgressSummary: vi.fn(() => ({ attempts: [] })),
}));

vi.mock('@/stages/stage6-lesson-content/judge/judge-helpers', () => ({
  buildLessonContent: vi.fn((state, contentBody, qualityScore) => ({
    lesson_id: state.lessonSpec.lesson_id,
    course_id: state.courseId,
    content: contentBody,
    metadata: {
      total_words: 100,
      total_tokens: 100,
      cost_usd: 0,
      quality_score: qualityScore,
      rag_chunks_used: 0,
      generation_duration_ms: 0,
      model_used: 'test-model',
      archetype_used: 'conceptual',
      temperature_used: 0.7,
    },
    status: 'completed',
    created_at: new Date(),
    updated_at: new Date(),
  })),
}));

vi.mock('@/stages/stage6-lesson-content/nodes/judge-refinement-helpers', () => ({
  executeTargetedRefinementFlow: vi.fn(),
  buildReviewInfo: vi.fn(),
}));

vi.mock('@/stages/stage6-lesson-content/utils/mermaid-render-validator', () => ({
  validateMermaidRenderInLessonContentBody: vi.fn(),
}));

vi.mock('@/stages/stage6-lesson-content/utils/mermaid-fix-pipeline', () => ({
  runMermaidFixPipeline: vi.fn(),
}));

import {
  finalizeJudgeResult,
  processJudgeDecision,
} from '@/stages/stage6-lesson-content/nodes/judge-node-helpers';
import { logTrace } from '@/shared/trace-logger';
import { runMermaidFixPipeline } from '@/stages/stage6-lesson-content/utils/mermaid-fix-pipeline';
import { validateMermaidRenderInLessonContentBody } from '@/stages/stage6-lesson-content/utils/mermaid-render-validator';

const mockValidateMermaidRenderInLessonContentBody =
  validateMermaidRenderInLessonContentBody as ReturnType<typeof vi.fn>;
const mockRunMermaidFixPipeline = runMermaidFixPipeline as ReturnType<typeof vi.fn>;
const mockLogTrace = logTrace as ReturnType<typeof vi.fn>;

function buildContext(overrides: Partial<JudgeContext> = {}): JudgeContext {
  return {
    state: {
      lessonSpec: {
        lesson_id: '1.1',
        title: 'Test Lesson',
      },
      courseId: 'course-1',
      language: 'en',
      retryCount: 0,
      regenerateCount: 0,
      progressSummary: null,
    } as JudgeContext['state'],
    contentBody: {
      intro: `Intro content long enough for tests.

\`\`\`mermaid
flowchart TD
  A --> B
\`\`\``,
      sections: [{ title: 'Section 1', content: 'Section content with some details.' }],
      examples: [],
      exercises: [],
    } as JudgeContext['contentBody'],
    startTime: Date.now(),
    verdict: {
      judgeModel: 'test-judge',
      overallScore: 0.92,
      confidence: 'high',
      recommendation: 'ACCEPT',
      criteriaScores: {
        learning_objective_alignment: 0.9,
        pedagogical_structure: 0.9,
        factual_accuracy: 0.9,
        clarity_readability: 0.9,
        engagement_examples: 0.9,
        completeness: 0.9,
      },
      issues: [],
      strengths: [],
      passed: true,
      durationMs: 10,
      tokensUsed: 100,
      temperature: 0.2,
    },
    decision: {
      action: DecisionAction.ACCEPT,
      reason: 'high score',
      maxIterations: 0,
      targetScore: 0.9,
      factors: {
        scoreThreshold: '>=0.90',
        issueAnalysis: 'none',
        confidenceLevel: 'high',
        iterationHistory: 'initial',
      },
    },
    cascadeResult: {
      stage: 'heuristic',
      totalTokensUsed: 0,
      finalScore: 0.92,
      finalRecommendation: 'ACCEPT',
      heuristicResults: null,
      singleJudgeVerdict: null,
      clevResult: null,
      terminatedEarly: true,
      earlyTerminationReason: null,
    } as unknown as JudgeContext['cascadeResult'],
    ...overrides,
  };
}

describe('processJudgeDecision Mermaid render gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunMermaidFixPipeline.mockResolvedValue({
      content: 'Mermaid remediated summary.',
      modified: true,
      metrics: {
        diagramsTotal: 1,
        diagramsAutoWrapped: 0,
        diagramsFixedRegex: 0,
        diagramsFixedLLM: 0,
        diagramsFallback: 1,
        durationMs: 3,
      },
    });
  });

  it('remediates Mermaid-only failures and keeps ACCEPT without regeneration', async () => {
    mockValidateMermaidRenderInLessonContentBody
      .mockResolvedValueOnce({
        passed: false,
        totalBlocks: 1,
        failedBlocks: 1,
        fallbackComments: 0,
        diagnostics: [
          {
            blockIndex: 0,
            diagramType: 'flowchart-v2',
            parseValid: true,
            renderValid: false,
            svgHasRenderableContent: false,
            errors: ['SVG has no renderable nodes'],
            codeSnippet: 'flowchart TD A-->B',
          },
        ],
      })
      .mockResolvedValueOnce({
        passed: true,
        totalBlocks: 0,
        failedBlocks: 0,
        fallbackComments: 0,
        diagnostics: [],
      });

    const result = await processJudgeDecision(buildContext());

    expect(result.finalRecommendation).toBe('ACCEPT');
    expect(result.needsRegeneration).toBe(false);
    expect(result.needsHumanReview).toBe(false);
    expect(result.finalContent).not.toBeNull();
    expect(result.finalContent?.content.intro).toContain('Mermaid remediated summary');
    expect(result.mermaidRenderValidation?.passed).toBe(true);
    expect(result.mermaidRenderValidation?.remediation).toEqual(
      expect.objectContaining({
        attempted: true,
        transformed: true,
        strategy: expect.any(String),
      })
    );
  });

  it('includes Mermaid remediation metadata in judge trace output', async () => {
    mockValidateMermaidRenderInLessonContentBody
      .mockResolvedValueOnce({
        passed: false,
        totalBlocks: 1,
        failedBlocks: 1,
        fallbackComments: 0,
        diagnostics: [
          {
            blockIndex: 0,
            diagramType: 'flowchart-v2',
            parseValid: true,
            renderValid: false,
            svgHasRenderableContent: false,
            errors: ['SVG has no renderable nodes'],
            codeSnippet: 'flowchart TD A-->B',
          },
        ],
      })
      .mockResolvedValueOnce({
        passed: true,
        totalBlocks: 0,
        failedBlocks: 0,
        fallbackComments: 0,
        diagnostics: [],
      });

    const processed = await processJudgeDecision(buildContext());
    await finalizeJudgeResult(processed);

    expect(mockLogTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        stepName: 'judge_complete',
        outputData: expect.objectContaining({
          mermaidRenderGate: expect.objectContaining({
            remediation: expect.objectContaining({
              attempted: true,
              transformed: true,
            }),
          }),
        }),
      })
    );
  });

  it('keeps ACCEPT when Mermaid render validation passes immediately', async () => {
    mockValidateMermaidRenderInLessonContentBody.mockResolvedValue({
      passed: true,
      totalBlocks: 1,
      failedBlocks: 0,
      fallbackComments: 0,
      diagnostics: [],
    });

    const result = await processJudgeDecision(buildContext());

    expect(result.finalRecommendation).toBe('ACCEPT');
    expect(result.needsRegeneration).toBe(false);
    expect(result.finalContent).not.toBeNull();
    expect(result.mermaidRenderValidation?.passed).toBe(true);
    expect(result.mermaidRenderValidation?.remediation).toBeNull();
    expect(mockRunMermaidFixPipeline).not.toHaveBeenCalled();
  });

  it('keeps non-Mermaid REGENERATE behavior unchanged', async () => {
    const context = buildContext({
      decision: {
        action: DecisionAction.REGENERATE,
        reason: 'low quality',
        maxIterations: 0,
        targetScore: 0.9,
        factors: {
          scoreThreshold: '<0.90',
          issueAnalysis: 'major factual issues',
          confidenceLevel: 'high',
          iterationHistory: 'initial',
        },
      },
    });

    const result = await processJudgeDecision(context);

    expect(result.finalRecommendation).toBe('REGENERATE');
    expect(result.needsRegeneration).toBe(true);
    expect(result.needsHumanReview).toBe(false);
    expect(result.finalContent).toBeNull();
    expect(mockValidateMermaidRenderInLessonContentBody).not.toHaveBeenCalled();
    expect(mockRunMermaidFixPipeline).not.toHaveBeenCalled();
  });

  it('records remediation metadata when Mermaid gate crashes but does not force regenerate', async () => {
    mockValidateMermaidRenderInLessonContentBody.mockRejectedValue(
      new Error('render validator crashed')
    );

    const result = await processJudgeDecision(buildContext());

    expect(result.finalRecommendation).toBe('ACCEPT');
    expect(result.needsRegeneration).toBe(false);
    expect(result.finalContent).not.toBeNull();
    expect(result.mermaidRenderValidation).toEqual(
      expect.objectContaining({
        passed: false,
        remediation: expect.objectContaining({
          attempted: true,
          transformed: false,
          strategy: 'none',
        }),
      })
    );
  });
});
