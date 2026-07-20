import { describe, expect, it } from 'vitest';
import {
  allocateEvidenceBudget,
  type EvidenceBudgetDocument,
} from '@/stages/stage4-analysis/evidence/budget';
import {
  allocateStage4Budget,
  validateStage4Budget,
} from '@/stages/stage4-analysis/phases/stage4-budget-allocator';

const id = (value: number) => `40000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;

function document(
  value: number,
  overrides: Partial<EvidenceBudgetDocument> = {}
): EvidenceBudgetDocument {
  return {
    documentId: id(value),
    priority: 'SUPPLEMENTARY',
    originalTokens: 2_000,
    summaryTokens: 200,
    hasFullText: true,
    hasSummary: true,
    importanceScore: 0.5,
    ...overrides,
  };
}

const options = {
  modelContext: 1_000_000,
  promptReserve: 10_000,
  outputReserve: 20_000,
  maxBatchTokens: 32_000,
};

describe('allocateEvidenceBudget', () => {
  it('returns a deterministic empty plan for zero documents', () => {
    expect(allocateEvidenceBudget([], options)).toEqual({
      effectiveBudget: 670_000,
      totalAllocatedTokens: 0,
      promptReserve: 10_000,
      outputReserve: 20_000,
      allocations: [],
      batches: [],
    });
  });

  it('allocates one small CORE document as full text', () => {
    const result = allocateEvidenceBudget(
      [document(1, { priority: 'CORE', originalTokens: 12_000, summaryTokens: 1_200 })],
      options
    );

    expect(result.allocations).toEqual([
      expect.objectContaining({
        documentId: id(1),
        mode: 'full_text',
        allocatedTokens: 12_000,
        reason: 'core_full_text_fits',
      }),
    ]);
  });

  it('routes an oversized CORE document through bounded hierarchical processing', () => {
    const result = allocateEvidenceBudget(
      [document(1, { priority: 'CORE', originalTokens: 900_000, summaryTokens: 60_000 })],
      options
    );

    expect(result.allocations[0]).toEqual(
      expect.objectContaining({
        mode: 'hierarchical_summary',
        allocatedTokens: 32_000,
        reason: 'core_requires_hierarchical_summary',
      })
    );
    expect(result.batches.every(batch => batch.tokenLimit <= 32_000)).toBe(true);
  });

  it('uses priority and stable document IDs for deterministic mixed allocation', () => {
    const input = [
      document(4, { priority: 'SUPPLEMENTARY' }),
      document(2, { priority: 'IMPORTANT', importanceScore: 0.7 }),
      document(1, { priority: 'CORE', originalTokens: 10_000 }),
      document(3, { priority: 'IMPORTANT', importanceScore: 0.9 }),
    ];

    const first = allocateEvidenceBudget(input, options);
    const second = allocateEvidenceBudget([...input].reverse(), options);

    expect(second).toEqual(first);
    expect(first.allocations.map(item => item.documentId)).toEqual([id(1), id(3), id(2), id(4)]);
    expect(first.allocations.map(item => item.mode)).toEqual([
      'full_text',
      'summary',
      'summary',
      'summary',
    ]);
  });

  it('keeps missing content visible as metadata-only rather than dropping it', () => {
    const result = allocateEvidenceBudget(
      [
        document(1, {
          priority: 'CORE',
          originalTokens: 0,
          summaryTokens: 0,
          hasFullText: false,
          hasSummary: false,
        }),
      ],
      options
    );

    expect(result.allocations[0]).toEqual(
      expect.objectContaining({
        mode: 'metadata_only',
        allocatedTokens: 0,
        reason: 'content_unavailable',
      })
    );
  });

  it.each([
    { originalTokens: -1, summaryTokens: 0 },
    { originalTokens: 100, summaryTokens: 101 },
    { originalTokens: Number.NaN, summaryTokens: 10 },
    { originalTokens: 1.5, summaryTokens: 1 },
  ])('marks invalid token metadata explicitly: %o', invalid => {
    const result = allocateEvidenceBudget([document(1, { priority: 'CORE', ...invalid })], options);

    expect(result.allocations[0]).toEqual(
      expect.objectContaining({ mode: 'metadata_only', reason: 'invalid_token_metadata' })
    );
  });

  it('subtracts prompt and output reserves from the smaller model/hard context limit', () => {
    const result = allocateEvidenceBudget(
      [document(1, { priority: 'CORE', originalTokens: 100_000 })],
      { ...options, modelContext: 128_000, promptReserve: 8_000, outputReserve: 16_000 }
    );

    expect(result.effectiveBudget).toBe(104_000);
    expect(
      result.totalAllocatedTokens + result.promptReserve + result.outputReserve
    ).toBeLessThanOrEqual(128_000);
  });

  it('is bounded and deterministic for 1,000 documents without losing any ID', () => {
    const fixture = Array.from({ length: 1_000 }, (_, index) =>
      document(index + 1, {
        priority: index === 0 ? 'CORE' : index < 301 ? 'IMPORTANT' : 'SUPPLEMENTARY',
        originalTokens: 10_000 + index,
        summaryTokens: 500 + (index % 17),
        importanceScore: (1_000 - index) / 1_000,
      })
    );

    const first = allocateEvidenceBudget(fixture, options);
    const second = allocateEvidenceBudget([...fixture].reverse(), options);

    expect(first).toEqual(second);
    expect(first.allocations).toHaveLength(1_000);
    expect(new Set(first.allocations.map(item => item.documentId)).size).toBe(1_000);
    expect(
      first.totalAllocatedTokens + first.promptReserve + first.outputReserve
    ).toBeLessThanOrEqual(Math.min(options.modelContext, 700_000));
    expect(first.batches.every(batch => batch.allocatedTokens <= batch.tokenLimit)).toBe(true);
  });
});

describe('legacy Stage 4 budget bridge', () => {
  const tierConfig = {
    standard: { modelId: 'standard', fallbackModelId: 'standard-fallback', maxContext: 260_000 },
    extended: {
      modelId: 'extended',
      fallbackModelId: 'extended-fallback',
      maxContext: 1_000_000,
      cacheReadEnabled: false,
    },
  };

  it('does not send an oversized CORE document as full text before evidence preflight', () => {
    const allocation = allocateStage4Budget(
      [
        {
          file_id: id(1),
          priority: 'CORE',
          original_tokens: 900_000,
          summary_tokens: 32_000,
        },
      ],
      'en',
      tierConfig
    );

    expect(allocation.documents[0]).toEqual(
      expect.objectContaining({ mode: 'summary', tokens: 32_000 })
    );
    expect(allocation.breakdown.core.mode).toBe('summary');
    expect(validateStage4Budget(allocation)).toBe(true);
  });

  it('reserves the system prompt when validating the legacy allocation', () => {
    expect(() =>
      validateStage4Budget({
        modelSelection: {
          modelId: 'extended',
          fallbackModelId: 'extended-fallback',
          tier: 'extended',
          maxContext: 700_000,
          cacheReadEnabled: false,
        },
        documents: [],
        totalTokens: 695_000,
        breakdown: {
          core: { count: 1, tokens: 695_000, mode: 'full_text' },
          important: { count: 0, fullTextCount: 0, summaryCount: 0, tokens: 0 },
          supplementary: { count: 0, tokens: 0, mode: 'summary' },
        },
      })
    ).toThrow(/effective context/i);
  });
});
