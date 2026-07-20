/* eslint-disable @typescript-eslint/require-await -- phase spies mirror async production */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runPhase2Scope: vi.fn(),
  runPhase3Expert: vi.fn(),
  runPhase4Synthesis: vi.fn(),
}));

vi.mock('@/stages/stage4-analysis/phases/phase-2-scope', () => ({
  runPhase2Scope: mocks.runPhase2Scope,
}));
vi.mock('@/stages/stage4-analysis/phases/phase-3-expert', () => ({
  runPhase3Expert: mocks.runPhase3Expert,
}));
vi.mock('@/stages/stage4-analysis/phases/phase-4-synthesis', () => ({
  runPhase4Synthesis: mocks.runPhase4Synthesis,
}));
vi.mock('@/stages/stage4-analysis/utils/validators', async importOriginal => {
  const original =
    await importOriginal<typeof import('@/stages/stage4-analysis/utils/validators')>();
  return {
    ...original,
    startPhase: vi.fn(),
    completePhase: vi.fn(),
    updateCourseProgress: vi.fn(),
  };
});
vi.mock('@/stages/stage4-analysis/utils/observability', () => ({
  getAndClearTraceData: vi.fn(() => undefined),
}));
vi.mock('@/shared/trace-logger', () => ({ logTrace: vi.fn() }));
vi.mock('@/stages/stage4-analysis/phases/phase-2-scope-helpers', () => ({
  detectSectionBreakdownOverlap: vi.fn(async () => ({
    hasOverlap: false,
    overlappingPairs: [],
  })),
  buildOverlapFeedback: vi.fn(() => ''),
}));

import {
  runExpertPhase,
  runScopePhase,
  runSynthesisPhase,
} from '@/stages/stage4-analysis/orchestrator-phase-helpers';
import type { AnalysisContext } from '@/stages/stage4-analysis/orchestrator-helpers';

const documentId = (value: number) =>
  `40000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;

function phaseMetadata() {
  return {
    duration_ms: 1,
    model_used: 'test/model',
    tokens: { input: 1, output: 1, total: 2 },
    quality_score: 1,
    retry_count: 0,
  };
}

describe('bounded downstream evidence phase callers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runPhase2Scope.mockResolvedValue({
      recommended_structure: {
        estimated_content_hours: 10,
        scope_reasoning: 'x'.repeat(100),
        lesson_duration_minutes: 15,
        calculation_explanation: 'x'.repeat(50),
        total_lessons: 10,
        total_sections: 2,
        scope_warning: null,
        sections_breakdown: [],
      },
      phase_metadata: phaseMetadata(),
    });
    mocks.runPhase3Expert.mockResolvedValue({
      pedagogical_strategy: {
        assessment_approach: 'x'.repeat(50),
        progression_logic: 'x'.repeat(100),
      },
      research_flags: [],
      phase_metadata: phaseMetadata(),
    });
    mocks.runPhase4Synthesis.mockResolvedValue({
      generation_guidance: { tone: 'technical professional' },
      phase_metadata: { ...phaseMetadata(), document_count: 1 },
    });
  });

  it('passes the same immutable bounded synthetic digest to Phase 2, Phase 3, and Phase 4', async () => {
    const representationHash = 'sha256:immutable-representation';
    const promptContent = [
      'SYNTHETIC ADVISORY DOCUMENT EVIDENCE — NOT AN UPLOADED DOCUMENT',
      'accepted_run_id=10000000-0000-4000-8000-000000000001',
      `provenance_handle=${representationHash}`,
      'source_count=1000',
      'Bounded advisory digest',
    ].join('\n');
    const originalDocuments = Array.from({ length: 1_000 }, (_, index) => ({
      document_id: documentId(index + 1),
      file_name: `Document ${index + 1}.pdf`,
      source_version_hash: `sha256:${index + 1}`,
      processed_content: 'oversized '.repeat(1_000),
      processing_method: 'balanced' as const,
      summary_metadata: {
        original_tokens: 10_000,
        summary_tokens: 1_000,
        compression_ratio: 0.1,
        quality_score: 0.8,
      },
      stage3_priority: index === 0 ? ('CORE' as const) : ('SUPPLEMENTARY' as const),
      stage3_importance_score: 0.5,
    }));
    const context = {
      courseId: '20000000-0000-4000-8000-000000000001',
      organizationId: '30000000-0000-4000-8000-000000000001',
      userId: '50000000-0000-4000-8000-000000000001',
      input: { topic: 'Policy baseline', language: 'en' },
      startTime: 0,
      supabase: {},
      orchestrationLogger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
      budgetAllocation: null,
      originalDocumentSummaries: originalDocuments,
      resolvedDocumentSummaries: originalDocuments,
      legacyBudgetFits: false,
      documentEvidenceMode: 'active',
      phase1Output: {
        course_category: { primary: 'professional' },
        topic_analysis: { determined_topic: 'Policy baseline' },
        phase_metadata: phaseMetadata(),
      },
      documentEvidencePreflight: {
        status: 'accepted',
        runId: '10000000-0000-4000-8000-000000000001',
        coverage: {
          source_count: 1_000,
          assessed_count: 1_000,
          degraded_count: 0,
          failed_count: 0,
        },
        cards: [],
        candidateConflicts: [],
        batchDocumentIds: [],
        batchAllocatedTokens: [],
        reductionLevelWidths: [],
        generationMetrics: {
          modelCalls: 0,
          retryCount: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalCostUsd: 0,
          mapChunks: 0,
          reduceLevels: 0,
        },
        downstreamRepresentation: {
          kind: 'synthetic_advisory',
          runId: '10000000-0000-4000-8000-000000000001',
          representationHash,
          promptContent,
          tokenCount: 100,
          targetTokens: 24_000,
          sourceCount: 1_000,
          sourceDocumentIds: originalDocuments.map(document => document.document_id),
          sourceOutcomes: originalDocuments.map(document => ({
            documentId: document.document_id,
            coverageStatus: 'assessed',
            coverageReason: 'hierarchical_structured_evidence_complete',
          })),
          coverage: {
            source_count: 1_000,
            assessed_count: 1_000,
            degraded_count: 0,
            failed_count: 0,
          },
          materialSourceRefs: [],
          claims: [],
          constraints: [],
          limitations: [],
        },
      },
      clarifyingAnswers: [],
    } as unknown as AnalysisContext;

    await runScopePhase(context);
    await runExpertPhase(context);
    await runSynthesisPhase(context);

    const phase2Input = mocks.runPhase2Scope.mock.calls[0][0];
    const phase3Input = mocks.runPhase3Expert.mock.calls[0][0];
    const phase4Input = mocks.runPhase4Synthesis.mock.calls[0][0];
    expect(phase2Input.document_summaries).toEqual([promptContent]);
    expect(phase3Input.document_summaries).toEqual([promptContent]);
    expect(phase3Input.budget_context).toEqual({
      documents: [
        {
          file_name: 'Synthetic advisory evidence digest (not an uploaded document)',
          mode: 'summary',
          priority: 'SUPPLEMENTARY',
          tokens: 100,
        },
      ],
      totalTokens: 100,
    });
    expect(phase4Input.document_summaries).toHaveLength(1);
    expect(phase4Input.document_summaries[0]).toEqual(
      expect.objectContaining({
        source_version_hash: representationHash,
        processed_content: promptContent,
      })
    );
    expect(JSON.stringify([phase2Input, phase3Input, phase4Input])).not.toContain(
      'Content truncated'
    );
  });
});
