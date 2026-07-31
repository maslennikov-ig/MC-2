/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-argument -- async in-memory ports intentionally mirror production interfaces */
import { describe, expect, it, vi } from 'vitest';
import type { DocumentEvidenceCard } from '@megacampus/shared-types';
import {
  runDocumentEvidencePreflight,
  type DocumentEvidencePreflightSource,
  type DocumentEvidencePreflightRepository,
} from '@/stages/stage4-analysis/evidence/preflight';
import {
  hierarchicalSummarizeEvidence,
  type StructuredEvidenceCheckpoint,
} from '@/stages/stage4-analysis/evidence/card-generator';

const ids = {
  course: '20000000-0000-4000-8000-000000000001',
  organization: '30000000-0000-4000-8000-000000000001',
};
const documentId = (value: number) =>
  `40000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;
const runId = (value: number) => `10000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;

function source(
  value: number,
  overrides: Partial<DocumentEvidencePreflightSource> = {}
): DocumentEvidencePreflightSource {
  return {
    documentId: documentId(value),
    documentName: `Document ${value}.pdf`,
    sourceVersionHash: `sha256:source-${value}`,
    priority: value === 1 ? 'CORE' : 'SUPPLEMENTARY',
    authorityScope: 'course_source',
    contentQuality: 0.8,
    originalTokens: 4_000,
    summaryTokens: 400,
    fullText: `Full text ${value}`,
    stage3Summary: `Summary ${value}`,
    stage3SummaryVersionHash: `sha256:source-${value}`,
    importanceScore: 1 / value,
    ...overrides,
  };
}

function assessedCard(input: {
  source: DocumentEvidencePreflightSource;
  allocatedTokens: number;
  processingMode: DocumentEvidenceCard['processing_mode'];
  reusableSummary?: string;
}): DocumentEvidenceCard {
  return {
    document_id: input.source.documentId,
    document_name: input.source.documentName,
    priority: input.source.priority,
    authority_scope: input.source.authorityScope,
    content_quality: input.source.contentQuality,
    course_relevance: 0.8,
    processing_mode: input.processingMode,
    summary: input.reusableSummary ?? `Generated ${input.source.documentId}`,
    key_claims: [
      {
        claim_id: `50000000-0000-4000-8000-${input.source.documentId.slice(-12)}`,
        statement: `Claim for ${input.source.documentName}`,
        confidence: 0.8,
        source_refs: [
          {
            document_id: input.source.documentId,
            version_hash: input.source.sourceVersionHash,
          },
        ],
      },
    ],
    terminology: [],
    constraints: [],
    limitations: [],
    coverage_status: 'assessed',
    coverage_reason: input.reusableSummary
      ? 'stage3_summary_version_verified'
      : 'evidence_card_generated',
    token_counts: {
      original: input.source.originalTokens,
      summary: input.source.summaryTokens,
      allocated: input.allocatedTokens,
    },
  };
}

class MemoryRepository implements DocumentEvidencePreflightRepository {
  readonly runs = new Map<
    string,
    {
      id: string;
      status: 'processing' | 'accepted';
      source_manifest: unknown[];
      source_count: number;
      batch_count: number;
      model_calls: number;
      input_tokens: number;
      output_tokens: number;
      total_cost_usd: number;
    }
  >();
  readonly cards = new Map<string, DocumentEvidenceCard[]>();
  readonly persistHistory: string[][] = [];
  readonly checkpoints: Array<Record<string, unknown>> = [];

  async getOrCreateRun(
    input: Parameters<DocumentEvidencePreflightRepository['getOrCreateRun']>[0]
  ) {
    const key = `${input.courseId}:${input.inputFingerprint}:${input.evidenceVersion}`;
    const existing = this.runs.get(key);
    if (existing) return { run: existing, reused: true };
    const run = {
      id: runId(this.runs.size + 1),
      status: 'processing' as const,
      source_manifest: input.sourceManifest,
      source_count: input.sourceManifest.length,
      batch_count: 0,
      model_calls: 0,
      input_tokens: 0,
      output_tokens: 0,
      total_cost_usd: 0,
    };
    this.runs.set(key, run);
    return { run, reused: false };
  }

  async commitBatch(input: Parameters<DocumentEvidencePreflightRepository['commitBatch']>[0]) {
    const run = [...this.runs.values()].find(candidate => candidate.id === input.runId);
    if (!run) throw new Error('unknown run');
    const expectedIds = run.source_manifest
      .map(item => (item as { document_id: string }).document_id)
      .sort();
    const actualIds = input.cards.map(card => card.document_id).sort();
    if (
      actualIds.length !== new Set(actualIds).size ||
      JSON.stringify(actualIds) !== JSON.stringify(expectedIds)
    ) {
      throw new Error('exact source set required for every checkpoint');
    }
    const existing = this.checkpoints.find(
      checkpoint => checkpoint.run_id === input.runId && checkpoint.batch_key === input.batchKey
    );
    if (existing) {
      if (existing.input_hash !== input.inputHash) throw new Error('different input hash');
      return { checkpoint: existing, run, reused: true };
    }
    this.cards.set(input.runId, structuredClone(input.cards));
    this.persistHistory.push(input.cards.map(card => card.document_id));
    Object.assign(run, {
      batch_count: input.batchCount,
      model_calls: input.modelCalls,
      input_tokens: input.inputTokens,
      output_tokens: input.outputTokens,
      total_cost_usd: input.totalCostUsd,
    });
    const checkpoint = {
      run_id: input.runId,
      batch_key: input.batchKey,
      input_hash: input.inputHash,
      structured_checkpoint: structuredClone(input.structuredCheckpoint),
      cursor: structuredClone(input.cursor),
    };
    this.checkpoints.push(checkpoint);
    return { checkpoint, coverage: coverage(input.cards), run, reused: false };
  }

  async listItems(runIdValue: string) {
    return structuredClone(this.cards.get(runIdValue) ?? []);
  }

  async listBatchCheckpoints(runIdValue: string) {
    return structuredClone(this.checkpoints.filter(checkpoint => checkpoint.run_id === runIdValue));
  }

  async finalizeRun(input: Parameters<DocumentEvidencePreflightRepository['finalizeRun']>[0]) {
    for (const run of this.runs.values()) {
      if (run.id === input.runId) run.status = 'accepted';
    }
    return { id: input.runId, status: input.status };
  }
}

function coverage(cards: DocumentEvidenceCard[]) {
  return {
    source_count: cards.length,
    assessed_count: cards.filter(card => card.coverage_status === 'assessed').length,
    degraded_count: cards.filter(card => card.coverage_status === 'degraded').length,
    failed_count: cards.filter(card => card.coverage_status === 'failed').length,
  };
}

const baseOptions = {
  courseId: ids.course,
  organizationId: ids.organization,
  topic: 'Procurement policy',
  evidenceVersion: 'evidence-v1',
  modelId: 'test/stage4-model',
  modelContext: 128_000,
  promptReserve: 8_000,
  outputReserve: 8_000,
  maxBatchTokens: 5_000,
  maxRetries: 2,
};

describe('runDocumentEvidencePreflight', () => {
  it('materializes an approved unrecoverable source before budget or derivative use', async () => {
    const repository = new MemoryRepository();
    const generateCard = vi.fn(async input => assessedCard(input));
    const loadSourceContents = vi.fn(
      async () => new Map([[documentId(1), 'Loaded derivative that must not become evidence']])
    );
    const failed = source(1, {
      originalTokens: 100_000,
      summaryTokens: 50_000,
      fullText: 'Parsed derivative that must be ignored',
      stage3Summary: 'Stage 3 derivative that must be ignored',
      sourceFailure: {
        reason: 'source_file_unrecoverable',
        recoveryRunId: '90000000-0000-4000-8000-000000000009',
      },
    });

    const result = await runDocumentEvidencePreflight(
      {
        ...baseOptions,
        modelContext: 20_000,
        sources: [failed, source(2)],
      },
      { repository, generateCard, loadSourceContents }
    );

    expect(result.coverage).toEqual({
      source_count: 2,
      assessed_count: 1,
      degraded_count: 0,
      failed_count: 1,
    });
    expect(result.cards[0]).toMatchObject({
      document_id: documentId(1),
      coverage_status: 'failed',
      coverage_reason: 'source_file_unrecoverable',
      processing_mode: 'metadata_only',
      summary: null,
      key_claims: [],
      terminology: [],
      constraints: [],
      token_counts: { allocated: 0 },
    });
    expect(generateCard).toHaveBeenCalledTimes(1);
    expect(generateCard.mock.calls[0][0].source.documentId).toBe(documentId(2));
    expect(generateCard.mock.calls[0][0].allocatedTokens).toBeGreaterThan(0);
    expect(loadSourceContents).not.toHaveBeenCalled();
  });

  it('changes run identity when an audited source becomes recoverable', async () => {
    const repository = new MemoryRepository();
    const generateCard = vi.fn(async input => assessedCard(input));
    const failedSource = source(1, {
      sourceFailure: {
        reason: 'source_file_unrecoverable',
        recoveryRunId: '90000000-0000-4000-8000-000000000009',
      },
    });

    const failed = await runDocumentEvidencePreflight(
      { ...baseOptions, sources: [failedSource] },
      { repository, generateCard }
    );
    const recovered = await runDocumentEvidencePreflight(
      { ...baseOptions, sources: [source(1)] },
      { repository, generateCard }
    );

    expect(recovered.runId).not.toBe(failed.runId);
    expect(recovered.inputFingerprint).not.toBe(failed.inputFingerprint);
    expect(recovered.cards[0].coverage_status).toBe('assessed');
  });

  it('creates a new immutable run fingerprint for a durable retry decision and reuses that retry', async () => {
    const repository = new MemoryRepository();
    const dependencies = {
      repository,
      generateCard: async (input: Parameters<typeof assessedCard>[0]) => assessedCard(input),
    };
    const baseline = await runDocumentEvidencePreflight(
      { ...baseOptions, sources: [source(1)] },
      dependencies
    );
    const retryDirective = {
      decisionId: '70000000-0000-4000-8000-000000000001',
      documentId: documentId(1),
      attempt: 1,
      maxAttempts: 2,
    };
    const retry = await runDocumentEvidencePreflight(
      { ...baseOptions, sources: [source(1)], retryDirective },
      dependencies
    );
    const replay = await runDocumentEvidencePreflight(
      { ...baseOptions, sources: [source(1)], retryDirective },
      dependencies
    );

    expect(retry.runId).not.toBe(baseline.runId);
    expect(retry.inputFingerprint).not.toBe(baseline.inputFingerprint);
    expect(replay.runId).toBe(retry.runId);
    expect(repository.runs.size).toBe(2);
  });
  it('persists exact normalized source/card set equality and one durable outcome per source', async () => {
    const repository = new MemoryRepository();
    const result = await runDocumentEvidencePreflight(
      { ...baseOptions, sources: [source(3), source(1), source(2)] },
      { repository, generateCard: async input => assessedCard(input) }
    );

    const expectedIds = [documentId(1), documentId(2), documentId(3)];
    expect(result.status).toBe('accepted');
    expect(result.cards.map(card => card.document_id)).toEqual(expectedIds);
    expect(result.coverage).toEqual({
      source_count: 3,
      assessed_count: 3,
      degraded_count: 0,
      failed_count: 0,
    });
    expect(repository.persistHistory.at(-1)).toEqual(expectedIds);
    expect(new Set(result.cards.map(card => card.document_id)).size).toBe(3);
  });

  it('uses deterministic bounded batches and convergent hierarchical reduce levels', async () => {
    const repository = new MemoryRepository();
    const sources = Array.from({ length: 25 }, (_, index) =>
      source(index + 1, {
        priority: index === 0 ? 'CORE' : 'SUPPLEMENTARY',
        originalTokens: index === 0 ? 50_000 : 2_000,
        summaryTokens: index === 0 ? 8_000 : 400,
      })
    );
    const first = await runDocumentEvidencePreflight(
      { ...baseOptions, sources },
      { repository, generateCard: async input => assessedCard(input) }
    );
    const second = await runDocumentEvidencePreflight(
      { ...baseOptions, sources: [...sources].reverse() },
      { repository, generateCard: async input => assessedCard(input) }
    );

    expect(second.batchDocumentIds).toEqual(first.batchDocumentIds);
    expect(first.metricDeltas).toEqual(
      expect.objectContaining({
        acceptedRun: 1,
        documents: { source: 25, assessed: 25, degraded: 0, failed: 0 },
      })
    );
    expect(first.metricDeltas.batches).toBeGreaterThan(0);
    expect(second.metricDeltas).toEqual({
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
      generationMetrics: {
        modelCalls: 0,
        retryCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalCostUsd: 0,
        mapChunks: 0,
        reduceLevels: 0,
      },
    });
    expect(first.batchAllocatedTokens.every(tokens => tokens <= baseOptions.maxBatchTokens)).toBe(
      true
    );
    expect(first.reductionLevelWidths.at(-1)).toBe(1);
    expect(
      first.reductionLevelWidths.every(
        (width, index, levels) => index === 0 || width < levels[index - 1]
      )
    ).toBe(true);
  });

  it('resumes after a checkpoint without regenerating completed cards or duplicating items', async () => {
    const repository = new MemoryRepository();
    const generateCard = vi.fn(async input => assessedCard(input));
    let interrupted = false;

    await expect(
      runDocumentEvidencePreflight(
        { ...baseOptions, maxBatchTokens: 4_000, sources: [source(1), source(2), source(3)] },
        {
          repository,
          generateCard,
          afterCheckpoint: async ({ batchIndex }) => {
            if (batchIndex === 0 && !interrupted) {
              interrupted = true;
              throw new Error('simulated worker stop');
            }
          },
        }
      )
    ).rejects.toThrow('simulated worker stop');

    const callsAfterStop = generateCard.mock.calls.length;
    const resumed = await runDocumentEvidencePreflight(
      { ...baseOptions, maxBatchTokens: 4_000, sources: [source(1), source(2), source(3)] },
      { repository, generateCard }
    );

    expect(callsAfterStop).toBeGreaterThan(0);
    expect(generateCard).toHaveBeenCalledTimes(3);
    expect(resumed.cards).toHaveLength(3);
    expect(new Set(resumed.cards.map(card => card.document_id)).size).toBe(3);
  });

  it('fingerprints semantic classification but ignores runtime Phase 1 metadata and prose', async () => {
    const repository = new MemoryRepository();
    const deps = {
      repository,
      generateCard: async (input: Parameters<typeof assessedCard>[0]) => assessedCard(input),
    };

    const first = await runDocumentEvidencePreflight(
      {
        ...baseOptions,
        classificationContext: {
          course_category: {
            primary: 'professional',
            confidence: 0.8,
            reasoning: 'first runtime explanation',
          },
          topic_analysis: {
            determined_topic: 'Procurement policy',
            complexity: 'medium',
            target_audience: 'advanced',
          },
          phase_metadata: { duration_ms: 10, model_used: 'model-a', tokens: { total: 100 } },
        },
        sources: [source(1)],
      },
      deps
    );
    const runtimeOnlyChange = await runDocumentEvidencePreflight(
      {
        ...baseOptions,
        classificationContext: {
          course_category: {
            primary: 'professional',
            confidence: 0.99,
            reasoning: 'different model prose',
          },
          topic_analysis: {
            determined_topic: 'Procurement policy',
            complexity: 'medium',
            target_audience: 'advanced',
          },
          phase_metadata: { duration_ms: 999, model_used: 'model-b', tokens: { total: 9999 } },
        },
        sources: [source(1)],
      },
      deps
    );
    const semanticChange = await runDocumentEvidencePreflight(
      {
        ...baseOptions,
        classificationContext: {
          course_category: { primary: 'academic' },
          topic_analysis: {
            determined_topic: 'Procurement policy',
            complexity: 'medium',
            target_audience: 'advanced',
          },
        },
        sources: [source(1)],
      },
      deps
    );

    expect(runtimeOnlyChange.runId).toBe(first.runId);
    expect(semanticChange.runId).not.toBe(first.runId);
  });

  it('records disappeared or unrecoverable content as an explicit failed outcome', async () => {
    const repository = new MemoryRepository();
    const missing = source(1, {
      fullText: undefined,
      stage3Summary: undefined,
      originalTokens: 0,
      summaryTokens: 0,
    });
    const result = await runDocumentEvidencePreflight(
      { ...baseOptions, sources: [missing] },
      { repository, generateCard: async input => assessedCard(input) }
    );

    expect(result.cards[0]).toEqual(
      expect.objectContaining({
        document_id: missing.documentId,
        coverage_status: 'failed',
        coverage_reason: 'source_content_unavailable',
        summary: null,
      })
    );
  });

  it('uses one card-generation owner and records an honest failure without outer retries', async () => {
    const repository = new MemoryRepository();
    const attempts = new Map<string, number>();
    const result = await runDocumentEvidencePreflight(
      { ...baseOptions, sources: [source(1), source(2)] },
      {
        repository,
        generateCard: async input => {
          const count = (attempts.get(input.source.documentId) ?? 0) + 1;
          attempts.set(input.source.documentId, count);
          if (input.source.documentId === documentId(1) && count < 3) throw new Error('transient');
          if (input.source.documentId === documentId(2)) throw new Error('permanent');
          return assessedCard(input);
        },
      }
    );

    expect(attempts.get(documentId(1))).toBe(1);
    expect(attempts.get(documentId(2))).toBe(1);
    expect(result.cards.find(card => card.document_id === documentId(1))?.coverage_status).toBe(
      'failed'
    );
    expect(result.cards.find(card => card.document_id === documentId(2))).toEqual(
      expect.objectContaining({
        coverage_status: 'failed',
        coverage_reason: 'card_generation_failed_after_retries',
      })
    );
  });

  it('performs targeted verification with tenant/course filters and document grouping', async () => {
    const repository = new MemoryRepository();
    const verifyTargetedSources = vi.fn(async input => ({
      verifiedDocumentIds: input.documentIds,
    }));
    await runDocumentEvidencePreflight(
      { ...baseOptions, sources: [source(1), source(2)] },
      { repository, generateCard: async input => assessedCard(input), verifyTargetedSources }
    );

    expect(verifyTargetedSources).toHaveBeenCalledTimes(2);
    expect(verifyTargetedSources.mock.calls.map(([input]) => input)).toEqual([
      {
        query: 'Claim for Document 1.pdf',
        organizationId: ids.organization,
        courseId: ids.course,
        documentIds: [documentId(1)],
        groupByDocument: true,
      },
      {
        query: 'Claim for Document 2.pdf',
        organizationId: ids.organization,
        courseId: ids.course,
        documentIds: [documentId(2)],
        groupByDocument: true,
      },
    ]);
  });

  it('attaches targeted source refs only to the claim that produced the query', async () => {
    const evidenceSource = source(1);
    const result = await runDocumentEvidencePreflight(
      { ...baseOptions, sources: [evidenceSource] },
      {
        repository: new MemoryRepository(),
        generateCard: async input => {
          const card = assessedCard(input);
          return {
            ...card,
            key_claims: [
              { ...card.key_claims[0], claim_id: runId(91), statement: 'Claim alpha' },
              { ...card.key_claims[0], claim_id: runId(92), statement: 'Claim beta' },
            ],
          };
        },
        verifyTargetedSources: async input => ({
          verifiedDocumentIds: input.documentIds,
          sourceRefs: [
            {
              documentId: evidenceSource.documentId,
              chunkId: input.query === 'Claim alpha' ? 'chunk-alpha' : 'chunk-beta',
            },
          ],
        }),
      }
    );

    expect(
      result.cards[0].key_claims[0].source_refs.map(ref => ref.chunk_id).filter(Boolean)
    ).toEqual(['chunk-alpha']);
    expect(
      result.cards[0].key_claims[1].source_refs.map(ref => ref.chunk_id).filter(Boolean)
    ).toEqual(['chunk-beta']);
  });

  it('restores a committed verification ledger without a second Qdrant call after restart', async () => {
    const repository = new MemoryRepository();
    const firstVerifier = vi.fn(async input => ({
      verifiedDocumentIds: input.documentIds,
      sourceRefs: [{ documentId: input.documentIds[0], chunkId: 'durable-chunk' }],
    }));
    let stopped = false;
    await expect(
      runDocumentEvidencePreflight(
        { ...baseOptions, sources: [source(1)] },
        {
          repository,
          generateCard: async input => assessedCard(input),
          verifyTargetedSources: firstVerifier,
          afterCheckpoint: async () => {
            if (!stopped) {
              stopped = true;
              throw new Error('stop after durable verification');
            }
          },
        }
      )
    ).rejects.toThrow('stop after durable verification');
    const persisted = await repository.listItems(runId(1));
    expect(persisted[0].key_claims[0].source_refs).toEqual(
      expect.arrayContaining([expect.objectContaining({ chunk_id: 'durable-chunk' })])
    );

    const outageVerifier = vi.fn(async () => {
      throw new Error('qdrant unavailable after restart');
    });
    const resumed = await runDocumentEvidencePreflight(
      { ...baseOptions, sources: [source(1)] },
      {
        repository,
        generateCard: async input => assessedCard(input),
        verifyTargetedSources: outageVerifier,
      }
    );

    expect(outageVerifier).not.toHaveBeenCalled();
    expect(resumed.cards).toEqual(persisted);
  });

  it('rejects cross-source IDs returned by targeted verification', async () => {
    const repository = new MemoryRepository();
    await expect(
      runDocumentEvidencePreflight(
        { ...baseOptions, sources: [source(1)] },
        {
          repository,
          generateCard: async input => assessedCard(input),
          verifyTargetedSources: async () => ({ verifiedDocumentIds: [documentId(999)] }),
        }
      )
    ).rejects.toThrow(/out-of-scope document/i);
  });

  it('maps every oversized source chunk, bounds calls, retries, and reduces to one summary', async () => {
    const repository = new MemoryRepository();
    const fullText = Array.from({ length: 20_000 }, (_, index) => `${index % 10}`).join('');
    const requests: Array<{ text: string; stage: 'map' | 'reduce' }> = [];
    let firstMapAttempts = 0;
    const structuredPort = {
      async extractMap(request: { unit: { unitId: string; inputHash: string; text: string } }) {
        requests.push({ stage: 'map', text: request.unit.text });
        if (firstMapAttempts < 2) {
          firstMapAttempts += 1;
          throw new Error('transient summarizer failure');
        }
        return {
          value: {
            unitId: request.unit.unitId,
            inputHash: request.unit.inputHash,
            summary: `mapped-${request.unit.unitId.slice(-6)}`,
            claims: [
              {
                statement: `Claim ${request.unit.unitId}`,
                confidence: 0.9,
                unitIds: [request.unit.unitId],
              },
            ],
            terminology: ['approval'],
            constraints: ['Approval is required.'],
            limitations: [],
            courseRelevance: 0.9,
          },
          usage: {
            inputTokens: Math.ceil(request.unit.text.length / 4),
            outputTokens: 20,
            costUsd: 0.001,
          },
        };
      },
      async reduceSummary(request: {
        units: Array<{ unitId: string; summary: string }>;
        level: number;
      }) {
        const text = JSON.stringify(request.units);
        requests.push({ stage: 'reduce', text });
        return {
          value: {
            unitIds: request.units.map(unit => unit.unitId),
            summary: `reduced-level-${request.level}`,
          },
          usage: { inputTokens: Math.ceil(text.length / 4), outputTokens: 10, costUsd: 0.001 },
        };
      },
    };
    const result = await runDocumentEvidencePreflight(
      {
        ...baseOptions,
        language: 'en',
        maxBatchTokens: 1_000,
        sources: [
          source(1, {
            originalTokens: 5_000,
            summaryTokens: 0,
            stage3Summary: undefined,
            stage3SummaryVersionHash: undefined,
            fullText,
          }),
        ],
      },
      {
        repository,
        structuredPort,
      }
    );

    const successfulMapRequests = requests.filter(request => request.stage === 'map').slice(2);
    expect(successfulMapRequests.map(request => request.text).join('')).toBe(fullText);
    expect(requests.every(request => Math.ceil(request.text.length / 4) <= 1_000)).toBe(true);
    expect(requests.some(request => request.stage === 'reduce')).toBe(true);
    expect(result.cards[0]).toEqual(
      expect.objectContaining({
        coverage_status: 'assessed',
        coverage_reason: 'hierarchical_structured_evidence_complete',
        summary: expect.stringMatching(/^reduced-level-/),
      })
    );
    expect(result.cards[0].key_claims).toHaveLength(successfulMapRequests.length);
    expect(
      result.cards[0].key_claims.every(
        claim => claim.claim_id.split('-')[2]?.startsWith('8') && claim.source_refs[0]?.chunk_id
      )
    ).toBe(true);
    expect(result.generationMetrics.mapChunks).toBeGreaterThan(1);
    expect(result.generationMetrics.reduceLevels).toBeGreaterThan(0);
    expect(result.generationMetrics.retryCount).toBe(2);
    expect(result.generationMetrics.modelCalls).toBe(requests.length);
    expect(result.generationMetrics.totalCostUsd).toBeGreaterThan(0);
  });

  it('restores validated map and reduce outputs without replaying committed model calls', async () => {
    const evidenceSource = source(1, {
      originalTokens: 5_000,
      summaryTokens: 0,
      stage3Summary: undefined,
      stage3SummaryVersionHash: undefined,
      fullText: 'x'.repeat(20_000),
    });
    const port = {
      async extractMap(input: { unit: { unitId: string; inputHash: string } }) {
        return {
          value: {
            unitId: input.unit.unitId,
            inputHash: input.unit.inputHash,
            summary: `summary-${input.unit.unitId}`,
            claims: [],
            terminology: [],
            constraints: [],
            limitations: [],
            courseRelevance: 0.1,
          },
          usage: { inputTokens: 100, outputTokens: 10, costUsd: 0.001 },
        };
      },
      async reduceSummary(input: { units: Array<{ unitId: string }>; level: number }) {
        return {
          value: {
            unitIds: input.units.map(unit => unit.unitId),
            summary: `reduced-${input.level}`,
          },
          usage: { inputTokens: 50, outputTokens: 5, costUsd: 0.001 },
        };
      },
    };
    let latest: StructuredEvidenceCheckpoint | undefined;
    const first = await hierarchicalSummarizeEvidence({
      source: evidenceSource,
      topic: 'Policy',
      language: 'en',
      maxBatchTokens: 1_000,
      targetTokens: 1_000,
      maxRetries: 0,
      modelId: 'test/model',
      port,
      onCheckpoint: async event => {
        latest = structuredClone(event.structuredCheckpoint);
      },
    });
    expect(latest?.reductions.length).toBeGreaterThan(0);
    const replayPort = { extractMap: vi.fn(), reduceSummary: vi.fn() };
    const resumed = await hierarchicalSummarizeEvidence({
      source: evidenceSource,
      topic: 'Policy',
      language: 'en',
      maxBatchTokens: 1_000,
      targetTokens: 1_000,
      maxRetries: 0,
      modelId: 'test/model',
      port: replayPort,
      initialCheckpoint: first.checkpoint,
    });

    expect(replayPort.extractMap).not.toHaveBeenCalled();
    expect(replayPort.reduceSummary).not.toHaveBeenCalled();
    expect(resumed.summary).toBe(first.summary);
    expect(resumed.metrics.modelCalls).toBe(0);
  });

  it('accepts an actual token decrease when reducing one oversized summary below target', async () => {
    const evidenceSource = source(1, {
      originalTokens: 500,
      summaryTokens: 0,
      stage3Summary: undefined,
      stage3SummaryVersionHash: undefined,
      fullText: 'source '.repeat(200),
    });
    const reduceSummary = vi.fn(async input => ({
      value: { unitIds: input.units.map(unit => unit.unitId), summary: 'short result' },
      usage: { inputTokens: 100, outputTokens: 3, costUsd: 0 },
    }));
    const result = await hierarchicalSummarizeEvidence({
      source: evidenceSource,
      topic: 'Policy',
      language: 'en',
      maxBatchTokens: 1_000,
      targetTokens: 10,
      maxRetries: 0,
      modelId: 'test/model',
      port: {
        async extractMap(input) {
          return {
            value: {
              unitId: input.unit.unitId,
              inputHash: input.unit.inputHash,
              summary: 'oversized '.repeat(100),
              claims: [],
              terminology: [],
              constraints: [],
              limitations: [],
              courseRelevance: 0.5,
            },
            usage: { inputTokens: 300, outputTokens: 100, costUsd: 0 },
          };
        },
        reduceSummary,
      },
    });

    expect(reduceSummary).toHaveBeenCalledTimes(1);
    expect(result.summary).toBe('short result');
  });

  it('treats checkpoint persistence failure as fatal infrastructure, not excerpt degradation', async () => {
    const repository = new MemoryRepository();
    const originalCommit = repository.commitBatch.bind(repository);
    repository.commitBatch = async input => {
      if (input.batchKey.includes(':map:')) throw new Error('database unavailable');
      return originalCommit(input);
    };
    await expect(
      runDocumentEvidencePreflight(
        {
          ...baseOptions,
          maxBatchTokens: 1_000,
          sources: [
            source(1, {
              stage3Summary: undefined,
              stage3SummaryVersionHash: undefined,
              fullText: 'x'.repeat(8_000),
            }),
          ],
        },
        {
          repository,
          structuredPort: {
            async extractMap(input) {
              return {
                value: {
                  unitId: input.unit.unitId,
                  inputHash: input.unit.inputHash,
                  summary: 'summary',
                  claims: [],
                  terminology: [],
                  constraints: [],
                  limitations: [],
                  courseRelevance: 0,
                },
                usage: { inputTokens: 10, outputTokens: 2, costUsd: 0 },
              };
            },
            async reduceSummary(input) {
              return {
                value: { unitIds: input.units.map(unit => unit.unitId), summary: 'reduced' },
                usage: { inputTokens: 10, outputTokens: 2, costUsd: 0 },
              };
            },
          },
        }
      )
    ).rejects.toThrow(/checkpoint failed.*database unavailable/i);
  });

  it('degrades instead of accepting unknown injected structured fields', async () => {
    const result = await runDocumentEvidencePreflight(
      {
        ...baseOptions,
        sources: [
          source(1, {
            stage3Summary: undefined,
            stage3SummaryVersionHash: undefined,
            fullText: 'source text',
          }),
        ],
      },
      {
        repository: new MemoryRepository(),
        structuredPort: {
          async extractMap(input) {
            return {
              value: {
                unitId: input.unit.unitId,
                inputHash: input.unit.inputHash,
                summary: 'summary',
                claims: [],
                terminology: [],
                constraints: [],
                limitations: [],
                courseRelevance: 0,
                poisoned: true,
              },
              usage: { inputTokens: 2, outputTokens: 1, costUsd: 0 },
            };
          },
          async reduceSummary() {
            throw new Error('not reached');
          },
        },
        extractor: {
          async extract() {
            throw new Error('fallback extraction refused');
          },
        },
      }
    );
    expect(result.cards[0].coverage_status).toBe('failed');
    expect(result.cards[0].coverage_reason).toBe(
      'structured_evidence_generation_failed_after_retries'
    );
  });

  it('extracts non-empty stable claims even when a matching Stage 3 summary skips map/reduce', async () => {
    const structuredPort = { extractMap: vi.fn(), reduceSummary: vi.fn() };
    let extractionAttempts = 0;
    const extractor = {
      async extract(input: { documentId: string; sourceVersionHash: string; summary: string }) {
        extractionAttempts += 1;
        if (extractionAttempts === 1) throw new Error('transient extraction failure');
        return {
          courseRelevance: 0.85,
          claims: [
            {
              statement: '  Approval   is mandatory. ',
              confidence: 0.95,
              sourceRefs: [
                {
                  documentId: input.documentId,
                  versionHash: input.sourceVersionHash,
                  chunkId: 'chunk-1',
                },
              ],
            },
          ],
          terminology: ['Approval'],
          constraints: ['Approval is mandatory.'],
          limitations: [],
          inputTokens: Math.ceil(input.summary.length / 4),
          outputTokens: 30,
          costUsd: 0.003,
        };
      },
    };
    const first = await runDocumentEvidencePreflight(
      { ...baseOptions, sources: [source(1)] },
      { repository: new MemoryRepository(), structuredPort, extractor }
    );
    extractionAttempts = 1;
    const second = await runDocumentEvidencePreflight(
      { ...baseOptions, sources: [source(1)] },
      { repository: new MemoryRepository(), structuredPort, extractor }
    );

    expect(structuredPort.extractMap).not.toHaveBeenCalled();
    expect(first.cards[0].key_claims).toHaveLength(1);
    expect(first.cards[0].key_claims[0]).toEqual(
      expect.objectContaining({
        claim_id: second.cards[0].key_claims[0].claim_id,
        statement: 'Approval is mandatory.',
        source_refs: [
          expect.objectContaining({
            document_id: documentId(1),
            version_hash: 'sha256:source-1',
            chunk_id: 'chunk-1',
          }),
        ],
      })
    );
    expect(first.generationMetrics.retryCount).toBe(1);
    expect(first.generationMetrics.modelCalls).toBe(2);
  });

  it('splits an oversized matching Stage 3 summary before structured extraction', async () => {
    const largeSummary = 'validated-summary '.repeat(2_000);
    const mapTexts: string[] = [];
    const extractor = { extract: vi.fn() };
    const structuredPort = {
      async extractMap(input: { unit: { unitId: string; inputHash: string; text: string } }) {
        mapTexts.push(input.unit.text);
        return {
          value: {
            unitId: input.unit.unitId,
            inputHash: input.unit.inputHash,
            summary: 'bounded summary',
            claims: [],
            terminology: [],
            constraints: [],
            limitations: [],
            courseRelevance: 0.1,
          },
          usage: { inputTokens: 100, outputTokens: 10, costUsd: 0 },
        };
      },
      async reduceSummary(input: { units: Array<{ unitId: string }> }) {
        return {
          value: { unitIds: input.units.map(unit => unit.unitId), summary: 'reduced summary' },
          usage: { inputTokens: 100, outputTokens: 10, costUsd: 0 },
        };
      },
    };
    const result = await runDocumentEvidencePreflight(
      {
        ...baseOptions,
        maxBatchTokens: 1_000,
        sources: [
          source(1, {
            originalTokens: 10_000,
            summaryTokens: 5_000,
            stage3Summary: largeSummary,
            stage3SummaryVersionHash: 'sha256:source-1',
          }),
        ],
      },
      { repository: new MemoryRepository(), structuredPort, extractor }
    );

    expect(mapTexts.length).toBeGreaterThan(1);
    expect(mapTexts.join('')).toBe(largeSummary);
    expect(extractor.extract).not.toHaveBeenCalled();
    expect(result.cards[0].coverage_reason).toBe('stage3_summary_hierarchically_reduced');
  });

  it('records the executed hierarchical mode and regenerated summary token count', async () => {
    const result = await runDocumentEvidencePreflight(
      {
        ...baseOptions,
        sources: [
          source(2, {
            stage3Summary: 'unversioned summary',
            stage3SummaryVersionHash: undefined,
            fullText: 'authoritative full text',
            summaryTokens: 400,
          }),
        ],
      },
      {
        repository: new MemoryRepository(),
        structuredPort: {
          async extractMap(input) {
            return {
              value: {
                unitId: input.unit.unitId,
                inputHash: input.unit.inputHash,
                summary: 'regenerated evidence',
                claims: [],
                terminology: [],
                constraints: [],
                limitations: [],
                courseRelevance: 0.8,
              },
              usage: { inputTokens: 10, outputTokens: 2, costUsd: 0 },
            };
          },
          async reduceSummary() {
            throw new Error('single map result should fit');
          },
        },
      }
    );

    expect(result.cards[0]).toEqual(
      expect.objectContaining({
        processing_mode: 'hierarchical_summary',
        summary: 'regenerated evidence',
        token_counts: expect.objectContaining({ summary: expect.any(Number) }),
      })
    );
    expect(result.cards[0].token_counts.summary).toBeGreaterThan(0);
    expect(result.cards[0].token_counts.summary).toBeLessThan(400);
  });

  it('rejects an out-of-scope extraction reference instead of accepting a poisoned card', async () => {
    await expect(
      runDocumentEvidencePreflight(
        { ...baseOptions, sources: [source(1)] },
        {
          repository: new MemoryRepository(),
          extractor: {
            async extract() {
              return {
                courseRelevance: 0.8,
                claims: [
                  {
                    statement: 'Poisoned claim.',
                    confidence: 0.9,
                    sourceRefs: [{ documentId: documentId(999), versionHash: 'sha256:foreign' }],
                  },
                ],
                terminology: [],
                constraints: [],
                limitations: [],
                inputTokens: 10,
                outputTokens: 10,
                costUsd: 0,
              };
            },
          },
        }
      )
    ).rejects.toThrow(/out-of-scope source reference/i);
  });

  it('bounds targeted verification batches and degrades honestly during a Qdrant outage', async () => {
    const repository = new MemoryRepository();
    const verifyTargetedSources = vi.fn(async () => {
      throw new Error('qdrant unavailable');
    });
    const sources = Array.from({ length: 205 }, (_, index) => source(index + 1));
    const result = await runDocumentEvidencePreflight(
      { ...baseOptions, sources, maxVerificationDocumentIds: 100 },
      { repository, generateCard: async input => assessedCard(input), verifyTargetedSources }
    );

    expect(verifyTargetedSources.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(
      verifyTargetedSources.mock.calls.every(
        ([input]) => input.documentIds.length > 0 && input.documentIds.length <= 100
      )
    ).toBe(true);
    expect(verifyTargetedSources.mock.calls.flatMap(([input]) => input.documentIds)).toEqual(
      sources.map(item => item.documentId).sort()
    );
    expect(result.coverage).toEqual({
      source_count: 205,
      assessed_count: 0,
      degraded_count: 205,
      failed_count: 0,
    });
    expect(
      result.cards.every(card => card.coverage_reason === 'targeted_verification_unavailable')
    ).toBe(true);
  });

  it('reuses a Stage 3 summary only when its version hash matches the source', async () => {
    const repository = new MemoryRepository();
    const generateCard = vi.fn(async input => assessedCard(input));
    await runDocumentEvidencePreflight(
      {
        ...baseOptions,
        sources: [source(1), source(2, { stage3SummaryVersionHash: 'sha256:stale-summary' })],
      },
      { repository, generateCard }
    );

    const firstInput = generateCard.mock.calls.find(
      ([input]) => input.source.documentId === documentId(1)
    )?.[0];
    const secondInput = generateCard.mock.calls.find(
      ([input]) => input.source.documentId === documentId(2)
    )?.[0];
    expect(firstInput?.reusableSummary).toBe('Summary 1');
    expect(secondInput?.reusableSummary).toBeUndefined();
  });

  it('is a true no-op for zero documents', async () => {
    const repository = new MemoryRepository();
    const generateCard = vi.fn();
    const result = await runDocumentEvidencePreflight(
      { ...baseOptions, sources: [] },
      { repository, generateCard }
    );

    expect(result).toEqual(
      expect.objectContaining({ status: 'skipped', cards: [], candidateConflicts: [] })
    );
    expect(repository.runs.size).toBe(0);
    expect(generateCard).not.toHaveBeenCalled();
  });

  it('rejects duplicate source IDs before any durable write', async () => {
    const repository = new MemoryRepository();
    await expect(
      runDocumentEvidencePreflight(
        { ...baseOptions, sources: [source(1), source(1)] },
        { repository, generateCard: async input => assessedCard(input) }
      )
    ).rejects.toThrow(/duplicate source document/i);
    expect(repository.runs.size).toBe(0);
  });

  it('resumes a deterministic 1,000-source run with exact full-ledger checkpoints', async () => {
    const repository = new MemoryRepository();
    const generateCard = vi.fn(async input => assessedCard(input));
    const sources = Array.from({ length: 1_000 }, (_, index) =>
      source(index + 1, {
        priority: index === 0 ? 'CORE' : index < 301 ? 'IMPORTANT' : 'SUPPLEMENTARY',
        originalTokens: 2_000,
        summaryTokens: 200,
      })
    );
    let stopped = false;
    const structuredPort = {
      extractMap: vi.fn(),
      reduceSummary: vi.fn(async input => ({
        value: {
          unitIds: input.units.map(unit => unit.unitId),
          summary: `Bounded advisory level ${input.level} for ${input.units.length} inputs`,
        },
        usage: { inputTokens: 100, outputTokens: 10, costUsd: 0 },
      })),
    };
    await expect(
      runDocumentEvidencePreflight(
        {
          ...baseOptions,
          sources,
          maxBatchTokens: 10_000,
          requireBoundedDownstreamContext: true,
        },
        {
          repository,
          generateCard,
          structuredPort,
          afterCheckpoint: async ({ batchIndex }) => {
            if (batchIndex === 2 && !stopped) {
              stopped = true;
              throw new Error('simulated large-corpus stop');
            }
          },
        }
      )
    ).rejects.toThrow('simulated large-corpus stop');

    const resumed = await runDocumentEvidencePreflight(
      {
        ...baseOptions,
        sources: [...sources].reverse(),
        maxBatchTokens: 10_000,
        requireBoundedDownstreamContext: true,
      },
      { repository, generateCard, structuredPort }
    );

    expect(generateCard).toHaveBeenCalledTimes(1_000);
    expect(resumed.cards).toHaveLength(1_000);
    expect(new Set(resumed.cards.map(card => card.document_id)).size).toBe(1_000);
    expect(
      repository.persistHistory.every(idsForCheckpoint => idsForCheckpoint.length === 1_000)
    ).toBe(true);
    expect(resumed.downstreamRepresentation).toEqual(
      expect.objectContaining({
        kind: 'synthetic_advisory',
        sourceCount: 1_000,
        sourceDocumentIds: sources.map(item => item.documentId).sort(),
      })
    );
    expect(resumed.downstreamRepresentation!.tokenCount).toBeLessThanOrEqual(24_000);

    const replayPort = { extractMap: vi.fn(), reduceSummary: vi.fn() };
    const acceptedRestart = await runDocumentEvidencePreflight(
      {
        ...baseOptions,
        sources,
        maxBatchTokens: 10_000,
        requireBoundedDownstreamContext: true,
      },
      { repository, generateCard, structuredPort: replayPort }
    );
    expect(replayPort.reduceSummary).not.toHaveBeenCalled();
    expect(acceptedRestart.downstreamRepresentation).toEqual(resumed.downstreamRepresentation);
    // This case simulates 1,000 sources twice and takes ~11s alone; under full-suite parallelism on
    // a CI runner it exceeded the 30s default and failed the deploy on 2026-07-31 while passing in
    // isolation. The work is deterministic, so a longer bound costs nothing and removes a red check
    // that carried no signal.
  }, 120_000);
});
