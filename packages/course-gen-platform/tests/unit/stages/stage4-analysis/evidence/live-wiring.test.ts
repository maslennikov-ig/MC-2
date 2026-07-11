/* eslint-disable @typescript-eslint/require-await -- async test doubles mirror production ports */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { runDocumentEvidencePhase } from '@/stages/stage4-analysis/orchestrator-phase-helpers';
import {
  attachDocumentEvidenceSnapshot,
  type AnalysisContext,
} from '@/stages/stage4-analysis/orchestrator-helpers';

const summary = {
  document_id: '40000000-0000-4000-8000-000000000001',
  file_name: 'Policy.pdf',
  source_version_hash: 'sha256:source',
  processed_content: 'Stage 3 summary',
  processing_method: 'balanced' as const,
  summary_metadata: {
    original_tokens: 5_000,
    summary_tokens: 500,
    compression_ratio: 0.1,
    quality_score: 0.8,
  },
  stage3_priority: 'CORE' as const,
  stage3_importance_score: 0.9,
};

function context(documents = [summary]): AnalysisContext {
  return {
    courseId: '20000000-0000-4000-8000-000000000001',
    organizationId: '30000000-0000-4000-8000-000000000001',
    userId: '50000000-0000-4000-8000-000000000001',
    input: { topic: 'Policy', language: 'en' } as AnalysisContext['input'],
    startTime: 0,
    supabase: {} as AnalysisContext['supabase'],
    orchestrationLogger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as never,
    budgetAllocation: null,
    originalDocumentSummaries: documents,
    resolvedDocumentSummaries: structuredClone(documents),
    phase1Output: { course_category: { primary: 'policy' } } as never,
    clarifyingAnswers: [],
  };
}

const skippedResult = {
  status: 'skipped' as const,
  coverage: { source_count: 0, assessed_count: 0, degraded_count: 0, failed_count: 0 },
  cards: [],
  candidateConflicts: [] as [],
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
};

describe('Stage 4 document evidence live wiring', () => {
  it('is called strictly after classification and before the existing Phase 0.5 boundary', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/stages/stage4-analysis/orchestrator.ts'),
      'utf8'
    );
    expect(source.indexOf('await runClassificationPhase(context)')).toBeLessThan(
      source.indexOf('await runDocumentEvidencePhase(context)')
    );
    expect(source.indexOf('await runDocumentEvidencePhase(context)')).toBeLessThan(
      source.indexOf('await runClarifyingPhase(context)')
    );
  });

  it('keeps disabled mode byte-equivalent and performs no persistence', async () => {
    const analysisContext = context();
    const before = JSON.stringify(analysisContext);
    const runPreflight = vi.fn();

    await runDocumentEvidencePhase(analysisContext, { enabled: false, runPreflight });

    expect(runPreflight).not.toHaveBeenCalled();
    expect(JSON.stringify(analysisContext)).toBe(before);
  });

  it('keeps the zero-document path as a no-op even when enabled', async () => {
    const analysisContext = context([]);
    const runPreflight = vi.fn();
    await runDocumentEvidencePhase(analysisContext, { enabled: true, runPreflight });
    expect(runPreflight).not.toHaveBeenCalled();
    expect(analysisContext.documentEvidencePreflight).toBeUndefined();
  });

  it('persists shadow evidence without changing downstream summaries or answers', async () => {
    const analysisContext = context();
    const summariesBefore = structuredClone(analysisContext.resolvedDocumentSummaries);
    const answersBefore = structuredClone(analysisContext.clarifyingAnswers);
    const runPreflight = vi.fn(async () => skippedResult);

    await runDocumentEvidencePhase(analysisContext, {
      enabled: true,
      mode: 'shadow',
      runPreflight,
      preflightDependencies: {} as never,
    });

    expect(runPreflight).toHaveBeenCalledTimes(1);
    const preflightInput = runPreflight.mock.calls[0][0];
    expect(preflightInput.sources[0]).toEqual(
      expect.objectContaining({
        documentId: summary.document_id,
        sourceVersionHash: summary.source_version_hash,
        stage3Summary: summary.processed_content,
      })
    );
    expect(preflightInput.sources[0].stage3SummaryVersionHash).toBeUndefined();
    expect(analysisContext.documentEvidencePreflight).toEqual(skippedResult);
    expect(analysisContext.resolvedDocumentSummaries).toEqual(summariesBefore);
    expect(analysisContext.clarifyingAnswers).toEqual(answersBefore);
  });

  it('adds only the compact accepted audit snapshot to final output, including shadow runs', () => {
    const accepted = {
      ...skippedResult,
      status: 'accepted' as const,
      runId: '10000000-0000-4000-8000-000000000001',
      coverage: { source_count: 1, assessed_count: 1, degraded_count: 0, failed_count: 0 },
    };
    const baseline = { course_category: { primary: 'policy' } } as never;
    const result = attachDocumentEvidenceSnapshot(baseline, accepted);

    expect(result).toEqual({
      course_category: { primary: 'policy' },
      document_evidence: {
        accepted_run_id: accepted.runId,
        coverage: accepted.coverage,
        current_decision_ids: [],
        unresolved_informational_conflict_ids: [],
        enrichment_status: 'not_applicable',
      },
    });
  });
});
