/* eslint-disable @typescript-eslint/require-await -- async test doubles mirror production ports */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  buildPhase1DocumentSummaries,
  runDocumentEvidencePhase,
} from '@/stages/stage4-analysis/orchestrator-phase-helpers';
import { ConflictDetectionExecutionError } from '@/stages/stage4-analysis/evidence/conflict-detector';
import {
  attachDocumentEvidenceSnapshot,
  selectSemanticDocumentSummaries,
  type AnalysisContext,
  validateLegacyBudgetForEvidencePreflight,
} from '@/stages/stage4-analysis/orchestrator-helpers';
import { resolveDownstreamDocumentSummaries } from '@/stages/stage4-analysis/evidence/downstream-context';
import { allocateStage4Budget } from '@/stages/stage4-analysis/phases/stage4-budget-allocator';
import { validateJobInput } from '@/stages/stage4-analysis/utils/validators';

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

const documentId = (value: number) =>
  `40000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;

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

const durableTotals = (revision: number, userDecisions = 0) => ({
  databaseStartUnixMilliseconds: 1_700_000_000_000,
  generation: 10,
  revision,
  runs: { accepted: 1, failed: 0 },
  documents: { source: 1, assessed: 1, degraded: 0, failed: 0 },
  latestCoverage: { source: 1, assessed: 1, degraded: 0, failed: 0 },
  processingModes: {
    full_text: 0,
    hierarchical_summary: 0,
    summary: 1,
    targeted_retrieval: 0,
    metadata_only: 0,
  },
  batches: 3,
  inputTokens: 150,
  outputTokens: 30,
  modelCalls: 3,
  costUsd: 0.15,
  durationSeconds: 1,
  conflicts: { critical: 1, important: 1, informational: 1 },
  decisions: { user: userDecisions, system: 0, degradedAutomatic: 0 },
});

describe('Stage 4 document evidence live wiring', () => {
  it('lets an enabled 1,000-document evidence corpus reach bounded preflight', () => {
    const documents = Array.from({ length: 1_000 }, (_, index) => ({
      file_id: `40000000-0000-4000-8000-${(index + 1).toString().padStart(12, '0')}`,
      priority: index === 0 ? ('CORE' as const) : ('SUPPLEMENTARY' as const),
      original_tokens: index === 0 ? 900_000 : 10_000,
      summary_tokens: 1_000,
    }));
    const allocation = allocateStage4Budget(documents, 'en', {
      standard: { modelId: 'standard', fallbackModelId: 'fallback', maxContext: 260_000 },
      extended: {
        modelId: 'extended',
        fallbackModelId: 'fallback',
        maxContext: 1_000_000,
        cacheReadEnabled: false,
      },
    });

    expect(validateLegacyBudgetForEvidencePreflight(allocation, true)).toBe(false);
    expect(() => validateLegacyBudgetForEvidencePreflight(allocation, false)).toThrow(
      /effective context/i
    );
  });

  it('uses one immutable synthetic advisory digest only for an overflowed accepted run', () => {
    const analysisContext = context();
    const original = analysisContext.resolvedDocumentSummaries;
    expect(resolveDownstreamDocumentSummaries(original, undefined)).toBe(original);

    analysisContext.documentEvidencePreflight = {
      ...skippedResult,
      status: 'accepted',
      runId: '10000000-0000-4000-8000-000000000001',
      downstreamRepresentation: {
        kind: 'synthetic_advisory',
        runId: '10000000-0000-4000-8000-000000000001',
        representationHash: 'sha256:representation',
        promptContent: 'SYNTHETIC ADVISORY DOCUMENT EVIDENCE\nBounded digest',
        tokenCount: 12,
        targetTokens: 24_000,
        sourceCount: 1_000,
        sourceDocumentIds: Array.from({ length: 1_000 }, (_, index) => documentId(index + 1)),
        sourceOutcomes: [],
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
    } as never;

    const downstream = resolveDownstreamDocumentSummaries(
      original,
      analysisContext.documentEvidencePreflight.downstreamRepresentation
    );
    expect(downstream).toHaveLength(1);
    expect(downstream[0]).toEqual(
      expect.objectContaining({
        file_name: 'Synthetic advisory evidence digest (not an uploaded document)',
        processed_content: 'SYNTHETIC ADVISORY DOCUMENT EVIDENCE\nBounded digest',
      })
    );
  });

  it('keeps a shadow representation out of semantic downstream inputs', () => {
    const analysisContext = context();
    analysisContext.documentEvidenceMode = 'shadow';
    analysisContext.documentEvidencePreflight = {
      ...skippedResult,
      status: 'accepted',
      runId: '10000000-0000-4000-8000-000000000001',
      downstreamRepresentation: {
        kind: 'synthetic_advisory',
        runId: '10000000-0000-4000-8000-000000000001',
        representationHash: 'sha256:shadow',
        promptContent: 'shadow digest',
        tokenCount: 2,
        targetTokens: 24_000,
        sourceCount: 1,
        sourceDocumentIds: [summary.document_id],
        sourceOutcomes: [],
        coverage: { source_count: 1, assessed_count: 1, degraded_count: 0, failed_count: 0 },
        materialSourceRefs: [],
        claims: [],
        constraints: [],
        limitations: [],
      },
    } as never;

    const selected = resolveDownstreamDocumentSummaries(
      analysisContext.resolvedDocumentSummaries,
      analysisContext.documentEvidenceMode === 'active'
        ? analysisContext.documentEvidencePreflight.downstreamRepresentation
        : undefined
    );
    expect(selected).toBe(analysisContext.resolvedDocumentSummaries);
  });

  it('routes the same bounded representation into Phase 2, Phase 3, and Phase 4 callers', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/stages/stage4-analysis/orchestrator-phase-helpers.ts'),
      'utf8'
    );
    expect(source.match(/resolveDownstreamDocumentSummaries\(/gu)).toHaveLength(3);
  });

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

  it('carries an audited source failure without forwarding stored derivatives', async () => {
    const unrecoverable = {
      ...summary,
      processed_content: 'Stored derivative must not be reused',
      summary_source_version_hash: summary.source_version_hash,
      sourceFailure: {
        reason: 'source_file_unrecoverable' as const,
        recoveryRunId: '90000000-0000-4000-8000-000000000009',
      },
    };
    const analysisContext = context([unrecoverable]);
    const runPreflight = vi.fn(async input => {
      expect(input.sources[0]).toEqual(
        expect.objectContaining({ sourceFailure: unrecoverable.sourceFailure })
      );
      expect(input.sources[0].stage3Summary).toBeUndefined();
      expect(input.sources[0].stage3SummaryVersionHash).toBeUndefined();
      return skippedResult;
    });

    await runDocumentEvidencePhase(analysisContext, {
      enabled: true,
      runPreflight,
      preflightDependencies: {} as never,
    });

    expect(runPreflight).toHaveBeenCalledTimes(1);
  });

  it('excludes audited failures from legacy budget and pre-preflight Phase 1 input', () => {
    const failed = {
      ...summary,
      document_id: documentId(2),
      file_name: 'Lost.pdf',
      processed_content: '',
      sourceFailure: {
        reason: 'source_file_unrecoverable' as const,
        recoveryRunId: '90000000-0000-4000-8000-000000000009',
      },
    };

    expect(selectSemanticDocumentSummaries([failed, summary])).toEqual([summary]);
    expect(buildPhase1DocumentSummaries([failed, summary])).toEqual([
      {
        document_id: summary.document_id,
        file_name: summary.file_name,
        processed_content: summary.processed_content,
      },
    ]);

    const initializationSource = readFileSync(
      resolve(process.cwd(), 'src/stages/stage4-analysis/orchestrator-helpers.ts'),
      'utf8'
    );
    expect(initializationSource).toContain(
      'selectSemanticDocumentSummaries(originalDocumentSummaries)'
    );
    expect(initializationSource).toContain('prepareDocumentInfos(semanticDocumentSummaries)');
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

  it('requests a durable bounded digest only for active legacy overflow', async () => {
    const analysisContext = context();
    analysisContext.legacyBudgetFits = false;
    const runPreflight = vi.fn(async () => skippedResult);

    await runDocumentEvidencePhase(analysisContext, {
      enabled: true,
      mode: 'active',
      runPreflight,
      preflightDependencies: {} as never,
    });

    expect(runPreflight.mock.calls[0][0].requireBoundedDownstreamContext).toBe(true);
    expect(analysisContext.documentEvidenceMode).toBe('active');
  });

  it('runs conflict detection and the decision gate only after an active accepted preflight', async () => {
    const analysisContext = context();
    const accepted = {
      ...skippedResult,
      status: 'accepted' as const,
      runId: '10000000-0000-4000-8000-000000000001',
      coverage: { source_count: 1, assessed_count: 1, degraded_count: 0, failed_count: 0 },
    };
    const detectConflicts = vi.fn(async () => ({ conflicts: [], issues: [] }));
    const resolveDecisions = vi.fn(async () => ({
      pauseRequired: true,
      requiredQuestionIds: ['80000000-0000-4000-8000-000000000001'],
      currentDecisionIds: [],
      unresolvedInformationalConflictIds: ['60000000-0000-4000-8000-000000000001'],
    }));

    await runDocumentEvidencePhase(analysisContext, {
      enabled: true,
      mode: 'active',
      runPreflight: vi.fn(async () => accepted),
      preflightDependencies: {} as never,
      detectConflicts,
      conflictDependencies: {} as never,
      resolveDecisions,
      decisionDependencies: {} as never,
      decisionMode: 'manual',
    });

    expect(detectConflicts).toHaveBeenCalledTimes(1);
    expect(resolveDecisions).toHaveBeenCalledTimes(1);
    expect(analysisContext.documentEvidenceDecisions).toEqual(
      expect.objectContaining({ pauseRequired: true })
    );
  });

  it('persists shadow conflicts and metrics without creating decisions or downstream context', async () => {
    const analysisContext = context();
    const detectConflicts = vi.fn(async () => ({
      conflicts: [{ severity: 'important' }],
      issues: [],
      batchCount: 2,
      usage: { model_calls: 3, input_tokens: 40, output_tokens: 5, total_cost_usd: 0.02 },
    }));
    const resolveDecisions = vi.fn();
    const publishMetrics = vi.fn(async () => undefined);
    await runDocumentEvidencePhase(analysisContext, {
      enabled: true,
      mode: 'shadow',
      runPreflight: vi.fn(async () => ({
        ...skippedResult,
        status: 'accepted' as const,
        runId: '10000000-0000-4000-8000-000000000001',
      })),
      preflightDependencies: {} as never,
      detectConflicts: detectConflicts as never,
      conflictDependencies: {} as never,
      resolveDecisions: resolveDecisions as never,
      decisionDependencies: {} as never,
      publishMetrics,
      loadCriticalConflictState: vi.fn(async () => ({
        unresolved: 0,
        oldestUnixSeconds: 0,
        observedAtUnixMilliseconds: 1_700_000_000_000,
      })),
    });
    expect(detectConflicts).toHaveBeenCalledOnce();
    expect(resolveDecisions).not.toHaveBeenCalled();
    expect(analysisContext.documentEvidenceDecisions).toBeUndefined();
    expect(analysisContext.documentEvidenceMode).toBe('shadow');
    expect(publishMetrics).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'shadow',
        conflicts: { critical: 0, important: 1, informational: 0 },
        batches: 2,
        inputTokens: 40,
        outputTokens: 5,
        modelCalls: 3,
        costUsd: 0.02,
      }),
      analysisContext.orchestrationLogger
    );
  });

  it('publishes one bounded Stage 4 completion outcome after decisions', async () => {
    const analysisContext = context();
    const publishMetrics = vi.fn(async () => undefined);
    const accepted = {
      ...skippedResult,
      status: 'accepted' as const,
      runId: '10000000-0000-4000-8000-000000000001',
      coverage: { source_count: 1, assessed_count: 1, degraded_count: 0, failed_count: 0 },
      cards: [{ processing_mode: 'summary' }],
      batchDocumentIds: [[summary.document_id]],
      generationMetrics: {
        ...skippedResult.generationMetrics,
        modelCalls: 2,
        inputTokens: 100,
        outputTokens: 20,
        totalCostUsd: 0.1,
      },
    };

    await runDocumentEvidencePhase(analysisContext, {
      enabled: true,
      mode: 'active',
      runPreflight: vi.fn(async () => accepted as never),
      preflightDependencies: {} as never,
      detectConflicts: vi.fn(async () => ({
        conflicts: [
          { severity: 'critical' },
          { severity: 'important' },
          { severity: 'informational' },
        ],
        issues: [],
        batchCount: 2,
        usage: { model_calls: 1, input_tokens: 50, output_tokens: 10, total_cost_usd: 0.05 },
      })) as never,
      conflictDependencies: {} as never,
      resolveDecisions: vi.fn(async () => ({
        pauseRequired: true,
        requiredQuestionIds: ['80000000-0000-4000-8000-000000000001'],
        currentDecisionIds: [],
        unresolvedInformationalConflictIds: [],
        decisionSummary: { user: 0, system: 0, degradedAutomatic: 0 },
        unresolvedCriticalConflictCount: 1,
      })) as never,
      decisionDependencies: {} as never,
      publishMetrics,
      loadCriticalConflictState: vi.fn(async () => ({
        unresolved: 1,
        oldestUnixSeconds: 1_700_000_000,
        observedAtUnixMilliseconds: 1_700_000_001_000,
      })),
      loadDurableTotals: vi.fn(async () => durableTotals(1)),
    });

    expect(publishMetrics).toHaveBeenCalledOnce();
    expect(publishMetrics).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'stage4',
        status: 'accepted',
        coverage: { source: 1, assessed: 1, degraded: 0, failed: 0 },
        processingModes: expect.objectContaining({ summary: 1 }),
        batches: 3,
        inputTokens: 150,
        outputTokens: 30,
        modelCalls: 3,
        costUsd: 0.15000000000000002,
        conflicts: { critical: 1, important: 1, informational: 1 },
        decisions: { user: 0, system: 0, degradedAutomatic: 0 },
        durableTotals: durableTotals(1),
        criticalConflictState: {
          unresolved: 1,
          oldestUnixSeconds: 1_700_000_000,
          observedAtUnixMilliseconds: 1_700_000_001_000,
        },
      }),
      analysisContext.orchestrationLogger
    );
  });

  it('publishes zero work deltas on accepted replay and reconciles one appended user decision', async () => {
    const analysisContext = context();
    const publishMetrics = vi.fn(async () => undefined);
    const firstAccepted = {
      ...skippedResult,
      status: 'accepted' as const,
      runId: '10000000-0000-4000-8000-000000000001',
      coverage: { source_count: 1, assessed_count: 1, degraded_count: 0, failed_count: 0 },
      cards: [{ processing_mode: 'summary' }],
      batchDocumentIds: [[summary.document_id]],
      generationMetrics: {
        ...skippedResult.generationMetrics,
        modelCalls: 2,
        inputTokens: 100,
        outputTokens: 20,
        totalCostUsd: 0.1,
      },
      metricDeltas: {
        acceptedRun: 1,
        documents: { source: 1, assessed: 1, degraded: 0, failed: 0 },
        processingModes: {
          full_text: 0,
          hierarchical_summary: 0,
          summary: 1,
          targeted_retrieval: 0,
          metadata_only: 0,
        },
        batches: 1,
        generationMetrics: {
          ...skippedResult.generationMetrics,
          modelCalls: 2,
          inputTokens: 100,
          outputTokens: 20,
          totalCostUsd: 0.1,
        },
      },
    };
    const replayedAccepted = {
      ...firstAccepted,
      metricDeltas: {
        acceptedRun: 0,
        documents: { source: 0, assessed: 0, degraded: 0, failed: 0 },
        processingModes: {
          full_text: 0,
          hierarchical_summary: 0,
          summary: 0,
          targeted_retrieval: 0,
          metadata_only: 0,
        },
        batches: 0,
        generationMetrics: skippedResult.generationMetrics,
      },
    };
    const resolveDecisions = vi
      .fn()
      .mockResolvedValueOnce({
        pauseRequired: true,
        requiredQuestionIds: ['80000000-0000-4000-8000-000000000001'],
        currentDecisionIds: [],
        unresolvedInformationalConflictIds: [],
        decisionSummary: { user: 0, system: 0, degradedAutomatic: 0 },
      })
      .mockResolvedValueOnce({
        pauseRequired: false,
        requiredQuestionIds: [],
        currentDecisionIds: ['70000000-0000-4000-8000-000000000001'],
        unresolvedInformationalConflictIds: [],
        decisionSummary: { user: 1, system: 0, degradedAutomatic: 0 },
      });
    const overrides = {
      enabled: true,
      mode: 'active' as const,
      runPreflight: vi
        .fn()
        .mockResolvedValueOnce(firstAccepted as never)
        .mockResolvedValueOnce(replayedAccepted as never),
      preflightDependencies: {} as never,
      detectConflicts: vi.fn(async () => ({
        conflicts: [],
        issues: [],
        batchCount: 0,
        usage: { model_calls: 0, input_tokens: 0, output_tokens: 0, total_cost_usd: 0 },
        metricDeltas: {
          batches: 0,
          usage: { model_calls: 0, input_tokens: 0, output_tokens: 0, total_cost_usd: 0 },
          conflicts: { critical: 0, important: 0, informational: 0 },
        },
      })) as never,
      conflictDependencies: {} as never,
      resolveDecisions: resolveDecisions as never,
      decisionDependencies: {} as never,
      decisionMode: 'manual' as const,
      publishMetrics,
      loadCriticalConflictState: vi.fn(async () => ({
        unresolved: 0,
        oldestUnixSeconds: 0,
        observedAtUnixMilliseconds: performance.timeOrigin + performance.now(),
      })),
      loadDurableTotals: vi
        .fn()
        .mockResolvedValueOnce(durableTotals(1))
        .mockResolvedValueOnce(durableTotals(2, 1)),
    };

    await runDocumentEvidencePhase(analysisContext, overrides);
    await runDocumentEvidencePhase(analysisContext, overrides);

    const first = publishMetrics.mock.calls[0][0] as Record<string, unknown>;
    const resumed = publishMetrics.mock.calls[1][0] as Record<string, unknown>;
    expect(first).toEqual(
      expect.objectContaining({
        runDelta: 1,
        documentDeltas: { source: 1, assessed: 1, degraded: 0, failed: 0 },
        batches: 1,
        inputTokens: 100,
        decisions: { user: 0, system: 0, degradedAutomatic: 0 },
        durableTotals: durableTotals(1),
      })
    );
    expect(resumed).toEqual(
      expect.objectContaining({
        runDelta: 0,
        documentDeltas: { source: 0, assessed: 0, degraded: 0, failed: 0 },
        batches: 0,
        inputTokens: 0,
        decisions: { user: 1, system: 0, degradedAutomatic: 0 },
        durableTotals: durableTotals(2, 1),
      })
    );
  });

  it('publishes one bounded Stage 4 failure outcome and preserves the product error', async () => {
    const analysisContext = context();
    const publishMetrics = vi.fn(async () => undefined);
    const failure = new Error('private failure body');

    await expect(
      runDocumentEvidencePhase(analysisContext, {
        enabled: true,
        mode: 'active',
        runPreflight: vi.fn(async () => {
          throw failure;
        }),
        preflightDependencies: {} as never,
        publishMetrics,
      })
    ).rejects.toBe(failure);

    expect(publishMetrics).toHaveBeenCalledOnce();
    expect(publishMetrics).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'stage4', status: 'failed' }),
      analysisContext.orchestrationLogger
    );
  });

  it('publishes typed conflict execution usage in the bounded Stage 4 failure outcome', async () => {
    const analysisContext = context();
    const publishMetrics = vi.fn(async () => undefined);
    const failure = new ConflictDetectionExecutionError({
      batches: 1,
      usage: { model_calls: 2, input_tokens: 11, output_tokens: 4, total_cost_usd: 0.03 },
      conflicts: { critical: 0, important: 0, informational: 0 },
    });

    await expect(
      runDocumentEvidencePhase(analysisContext, {
        enabled: true,
        mode: 'active',
        runPreflight: vi.fn(async () => ({
          ...skippedResult,
          status: 'accepted' as const,
          runId: '10000000-0000-4000-8000-000000000001',
        })),
        preflightDependencies: {} as never,
        detectConflicts: vi.fn(async () => {
          throw failure;
        }) as never,
        conflictDependencies: {} as never,
        publishMetrics,
      })
    ).rejects.toBe(failure);

    expect(publishMetrics).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'stage4',
        status: 'failed',
        batches: 1,
        modelCalls: 2,
        inputTokens: 11,
        outputTokens: 4,
        costUsd: 0.03,
      }),
      analysisContext.orchestrationLogger
    );
  });

  it('reconciles an answered critical conflict when the resumed analysis reruns Stage 4', async () => {
    const publishMetrics = vi.fn(async () => undefined);
    const loadCriticalConflictState = vi
      .fn()
      .mockResolvedValueOnce({
        unresolved: 1,
        oldestUnixSeconds: 1_700_000_000,
        observedAtUnixMilliseconds: 1_700_000_001_000,
      })
      .mockResolvedValueOnce({
        unresolved: 0,
        oldestUnixSeconds: 0,
        observedAtUnixMilliseconds: 1_700_000_002_000,
      });
    const accepted = {
      ...skippedResult,
      status: 'accepted' as const,
      runId: '10000000-0000-4000-8000-000000000001',
    };
    const phaseOverrides = {
      enabled: true,
      mode: 'active' as const,
      runPreflight: vi.fn(async () => accepted),
      preflightDependencies: {} as never,
      detectConflicts: vi.fn(async () => ({
        conflicts: [],
        issues: [],
        batchCount: 0,
        usage: { model_calls: 0, input_tokens: 0, output_tokens: 0, total_cost_usd: 0 },
      })) as never,
      conflictDependencies: {} as never,
      resolveDecisions: vi.fn(async () => ({
        pauseRequired: false,
        requiredQuestionIds: [],
        currentDecisionIds: [],
        unresolvedInformationalConflictIds: [],
      })) as never,
      decisionDependencies: {} as never,
      publishMetrics,
      loadCriticalConflictState,
    };

    await runDocumentEvidencePhase(context(), phaseOverrides);
    await runDocumentEvidencePhase(context(), phaseOverrides);

    expect(loadCriticalConflictState).toHaveBeenCalledTimes(2);
    expect(publishMetrics.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        criticalConflictState: {
          unresolved: 1,
          oldestUnixSeconds: 1_700_000_000,
          observedAtUnixMilliseconds: 1_700_000_001_000,
        },
      })
    );
    expect(publishMetrics.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        criticalConflictState: {
          unresolved: 0,
          oldestUnixSeconds: 0,
          observedAtUnixMilliseconds: 1_700_000_002_000,
        },
      })
    );

    const approvalSource = readFileSync(
      resolve(process.cwd(), 'src/server/routers/clarifying-approval-helpers.ts'),
      'utf8'
    );
    const orchestratorSource = readFileSync(
      resolve(process.cwd(), 'src/stages/stage4-analysis/orchestrator.ts'),
      'utf8'
    );
    expect(approvalSource).toContain('JobType.STRUCTURE_ANALYSIS');
    expect(approvalSource).toContain('createAnalysisJob');
    expect(orchestratorSource).toContain('await runDocumentEvidencePhase(context)');
  });

  it('records bounded automatic retries and runs the gate only on the final immutable run', async () => {
    const analysisContext = context();
    const degradedCard = {
      document_id: summary.document_id,
      coverage_status: 'degraded',
    } as never;
    const runPreflight = vi
      .fn()
      .mockResolvedValueOnce({
        ...skippedResult,
        status: 'accepted',
        runId: '10000000-0000-4000-8000-000000000001',
        cards: [degradedCard],
      })
      .mockResolvedValueOnce({
        ...skippedResult,
        status: 'accepted',
        runId: '10000000-0000-4000-8000-000000000002',
        cards: [degradedCard],
      })
      .mockResolvedValueOnce({
        ...skippedResult,
        status: 'accepted',
        runId: '10000000-0000-4000-8000-000000000003',
        cards: [degradedCard],
      });
    const getDegradedRetryState = vi
      .fn()
      .mockResolvedValueOnce({ attempt: 0, maxAttempts: 2 })
      .mockResolvedValueOnce({ attempt: 1, maxAttempts: 2 })
      .mockResolvedValueOnce({ attempt: 2, maxAttempts: 2 });
    const recordAutomaticRetry = vi
      .fn()
      .mockResolvedValueOnce({
        decisionId: '70000000-0000-4000-8000-000000000001',
        documentId: summary.document_id,
        attempt: 1,
        maxAttempts: 2,
      })
      .mockResolvedValueOnce({
        decisionId: '70000000-0000-4000-8000-000000000002',
        documentId: summary.document_id,
        attempt: 2,
        maxAttempts: 2,
      });
    const getPendingRetryDirectives = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          decisionId: '70000000-0000-4000-8000-000000000001',
          documentId: summary.document_id,
          attempt: 1,
          maxAttempts: 2,
        },
      ])
      .mockResolvedValueOnce([
        {
          decisionId: '70000000-0000-4000-8000-000000000002',
          documentId: summary.document_id,
          attempt: 2,
          maxAttempts: 2,
        },
      ]);
    const consumeRetryDirectives = vi.fn(async () => undefined);
    const resolveDecisions = vi.fn(async input => {
      expect(input.runId).toBe('10000000-0000-4000-8000-000000000003');
      return {
        pauseRequired: false,
        requiredQuestionIds: [],
        currentDecisionIds: [],
        unresolvedInformationalConflictIds: [],
      };
    });

    await runDocumentEvidencePhase(analysisContext, {
      enabled: true,
      mode: 'active',
      decisionMode: 'automatic',
      runPreflight,
      preflightDependencies: {} as never,
      retryCoordinator: {
        getDegradedRetryState,
        recordAutomaticRetry,
        getPendingRetryDirectives,
        consumeRetryDirectives,
      } as never,
      detectConflicts: vi.fn(async () => ({ conflicts: [], issues: [] })) as never,
      conflictDependencies: {} as never,
      resolveDecisions,
      decisionDependencies: {} as never,
    });

    expect(runPreflight).toHaveBeenCalledTimes(3);
    expect(recordAutomaticRetry).toHaveBeenCalledTimes(2);
    expect(consumeRetryDirectives).toHaveBeenCalledTimes(2);
    expect(runPreflight.mock.calls[1][0].retryDirectives).toEqual([
      expect.objectContaining({ attempt: 1 }),
    ]);
    expect(resolveDecisions).toHaveBeenCalledTimes(1);
  });

  it('makes source_file_unrecoverable terminal in automatic mode without a retry run', async () => {
    const analysisContext = context([
      {
        ...summary,
        processed_content: '',
        sourceFailure: {
          reason: 'source_file_unrecoverable' as const,
          recoveryRunId: '90000000-0000-4000-8000-000000000009',
        },
      },
    ]);
    const failedCard = {
      document_id: summary.document_id,
      coverage_status: 'failed',
      coverage_reason: 'source_file_unrecoverable',
      processing_mode: 'metadata_only',
    } as never;
    const firstRunId = '10000000-0000-4000-8000-000000000001';
    const retryDecisionId = '70000000-0000-4000-8000-000000000001';
    const retryDirective = {
      decisionId: retryDecisionId,
      documentId: summary.document_id,
      attempt: 1,
      maxAttempts: 2,
    };
    const runPreflight = vi
      .fn()
      .mockResolvedValueOnce({
        ...skippedResult,
        status: 'accepted',
        runId: firstRunId,
        coverage: { source_count: 1, assessed_count: 0, degraded_count: 0, failed_count: 1 },
        cards: [failedCard],
      })
      .mockResolvedValueOnce({
        ...skippedResult,
        status: 'accepted',
        runId: '10000000-0000-4000-8000-000000000002',
        cards: [],
      });
    const getDegradedRetryState = vi.fn(async () => ({ attempt: 0, maxAttempts: 2 }));
    const recordAutomaticRetry = vi.fn(async () => retryDirective);
    const getPendingRetryDirectives = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([retryDirective]);
    const consumeRetryDirectives = vi.fn(async () => undefined);
    const resolveDecisions = vi.fn(async input => {
      expect(input.runId).toBe(firstRunId);
      return {
        pauseRequired: false,
        requiredQuestionIds: [],
        currentDecisionIds: ['80000000-0000-4000-8000-000000000001'],
        unresolvedInformationalConflictIds: [],
        decisionSummary: { user: 0, system: 1, degradedAutomatic: 1 },
      };
    });

    await runDocumentEvidencePhase(analysisContext, {
      enabled: true,
      mode: 'active',
      decisionMode: 'automatic',
      runPreflight,
      preflightDependencies: {} as never,
      retryCoordinator: {
        getDegradedRetryState,
        recordAutomaticRetry,
        getPendingRetryDirectives,
        consumeRetryDirectives,
      } as never,
      detectConflicts: vi.fn(async () => ({ conflicts: [], issues: [] })) as never,
      conflictDependencies: {} as never,
      resolveDecisions,
      decisionDependencies: {} as never,
    });

    expect(runPreflight).toHaveBeenCalledTimes(1);
    expect(getDegradedRetryState).not.toHaveBeenCalled();
    expect(recordAutomaticRetry).not.toHaveBeenCalled();
    expect(consumeRetryDirectives).not.toHaveBeenCalled();
    expect(resolveDecisions).toHaveBeenCalledTimes(1);
    expect(analysisContext.documentEvidencePreflight?.runId).toBe(firstRunId);
    expect(analysisContext.documentEvidenceDecisions?.currentDecisionIds).toEqual([
      '80000000-0000-4000-8000-000000000001',
    ]);
  });

  it('recovers every durable pending retry after a crash before preflight and links the accepted run', async () => {
    const secondSummary = {
      ...summary,
      document_id: documentId(2),
      file_name: 'Appendix.pdf',
      source_version_hash: 'sha256:source-2',
    };
    const analysisContext = context([summary, secondSummary]);
    const pending = [
      {
        decisionId: '70000000-0000-4000-8000-000000000001',
        documentId: summary.document_id,
        attempt: 1,
        maxAttempts: 2,
      },
      {
        decisionId: '70000000-0000-4000-8000-000000000002',
        documentId: secondSummary.document_id,
        attempt: 1,
        maxAttempts: 2,
      },
    ];
    const runPreflight = vi.fn(async input => {
      expect(input.retryDirectives).toEqual(pending);
      return {
        ...skippedResult,
        status: 'accepted' as const,
        runId: '10000000-0000-4000-8000-000000000010',
      };
    });
    const consumeRetryDirectives = vi.fn(async input => {
      expect(input).toEqual({
        courseId: analysisContext.courseId,
        organizationId: analysisContext.organizationId,
        targetRunId: '10000000-0000-4000-8000-000000000010',
        decisionIds: pending.map(value => value.decisionId),
      });
    });

    await runDocumentEvidencePhase(analysisContext, {
      enabled: true,
      mode: 'active',
      decisionMode: 'manual',
      runPreflight,
      preflightDependencies: {} as never,
      retryCoordinator: {
        getPendingRetryDirectives: vi.fn(async () => pending),
        consumeRetryDirectives,
      } as never,
      detectConflicts: vi.fn(async () => ({ conflicts: [], issues: [] })) as never,
      conflictDependencies: {} as never,
      resolveDecisions: vi.fn(async () => ({
        pauseRequired: false,
        requiredQuestionIds: [],
        currentDecisionIds: [],
        unresolvedInformationalConflictIds: [],
      })) as never,
      decisionDependencies: {} as never,
    });

    expect(runPreflight).toHaveBeenCalledTimes(1);
    expect(consumeRetryDirectives).toHaveBeenCalledTimes(1);
  });

  it('allows evidence preflight to own an enumerated missing-content outcome', async () => {
    const missing = {
      ...summary,
      processed_content: '',
      summary_metadata: { ...summary.summary_metadata, original_tokens: 0, summary_tokens: 0 },
    };
    expect(() =>
      validateJobInput(
        {
          topic: 'Policy',
          language: 'en',
          lesson_duration_minutes: 15,
          document_summaries: [missing],
        },
        { allowMissingDocumentContent: true }
      )
    ).not.toThrow();
    const analysisContext = context([missing]);
    const runPreflight = vi.fn(async input => {
      expect(input.sources[0].stage3Summary).toBeUndefined();
      return skippedResult;
    });

    await runDocumentEvidencePhase(analysisContext, {
      enabled: true,
      runPreflight,
      preflightDependencies: {} as never,
    });
    expect(runPreflight).toHaveBeenCalledTimes(1);
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

  it('keeps ordinary-question generation category-aware and attaches accepted decision IDs', () => {
    const phaseSource = readFileSync(
      resolve(process.cwd(), 'src/stages/stage4-analysis/orchestrator-phase-helpers.ts'),
      'utf8'
    );
    const helperSource = readFileSync(
      resolve(process.cwd(), 'src/stages/stage4-analysis/orchestrator-helpers.ts'),
      'utf8'
    );
    expect(phaseSource).toMatch(/question_category\s*!==\s*'document_conflicts'/u);
    expect(helperSource).toMatch(/decisions\?\.currentDecisionIds/u);
  });
});
