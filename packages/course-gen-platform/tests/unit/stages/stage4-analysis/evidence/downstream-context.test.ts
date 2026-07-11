/* eslint-disable @typescript-eslint/require-await -- deterministic ports mirror async production */
import { describe, expect, it, vi } from 'vitest';
import type { DocumentEvidenceCard } from '@megacampus/shared-types';
import {
  buildDownstreamEvidenceRepresentation,
  type DownstreamContextCheckpointEvent,
} from '@/stages/stage4-analysis/evidence/downstream-context';
import { buildDocumentsContext } from '@/stages/stage4-analysis/phases/phase-2-scope';

const runId = '10000000-0000-4000-8000-000000000001';
const documentId = (value: number) =>
  `40000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;

function card(value: number, summary = `Summary ${value}`): DocumentEvidenceCard {
  return {
    document_id: documentId(value),
    document_name: `Document ${value}.pdf`,
    priority: value === 1 ? 'CORE' : 'SUPPLEMENTARY',
    authority_scope: 'course_source',
    content_quality: 0.8,
    course_relevance: 0.8,
    processing_mode: 'hierarchical_summary',
    summary,
    key_claims: [
      {
        claim_id: `50000000-0000-4000-8000-${value.toString().padStart(12, '0')}`,
        statement: `Material claim ${value}`,
        confidence: 0.9,
        source_refs: [{ document_id: documentId(value), version_hash: `sha256:source-${value}` }],
      },
    ],
    terminology: [],
    constraints: [`Constraint ${value}`],
    limitations: [`Limitation ${value}`],
    coverage_status: 'assessed',
    coverage_reason: 'hierarchical_structured_evidence_complete',
    token_counts: { original: 1_000, summary: 100, allocated: 100 },
  };
}

const coverage = (count: number) => ({
  source_count: count,
  assessed_count: count,
  degraded_count: 0,
  failed_count: 0,
});

describe('buildDownstreamEvidenceRepresentation', () => {
  it('labels the synthetic digest as supplemental while preserving normal document wording', () => {
    const synthetic = buildDocumentsContext([
      'SYNTHETIC ADVISORY DOCUMENT EVIDENCE — NOT AN UPLOADED DOCUMENT\nDigest',
    ]);
    const regular = buildDocumentsContext(['Regular uploaded source']);

    expect(synthetic).toContain('supplements the baseline');
    expect(synthetic).not.toContain('PRIMARY source');
    expect(regular).toContain('PRIMARY source');
  });

  it('reduces all 1,000 card summaries exactly once into a bounded synthetic advisory digest', async () => {
    const cards = Array.from({ length: 1_000 }, (_, index) =>
      card(index + 1, `Summary ${index + 1} `.repeat(20))
    );
    const firstLevelIds: string[] = [];
    const reduceSummary = vi.fn(async input => {
      if (input.level === 1) firstLevelIds.push(...input.units.map(unit => unit.unitId));
      return {
        value: {
          unitIds: input.units.map(unit => unit.unitId),
          summary: `Reduced ${input.level} ${input.units.length}`,
        },
        usage: { inputTokens: 100, outputTokens: 10, costUsd: 0 },
      };
    });

    const result = await buildDownstreamEvidenceRepresentation({
      runId,
      cards,
      coverage: coverage(cards.length),
      language: 'en',
      modelId: 'test/model',
      evidenceVersion: 'evidence-v1',
      targetTokens: 2_000,
      maxBatchTokens: 1_000,
      maxRetries: 0,
      port: { extractMap: vi.fn(), reduceSummary },
    });

    expect(firstLevelIds).toHaveLength(1_000);
    expect(new Set(firstLevelIds)).toEqual(new Set(cards.map(item => item.document_id)));
    expect(result.kind).toBe('synthetic_advisory');
    expect(result.sourceCount).toBe(1_000);
    expect(result.sourceDocumentIds).toEqual(cards.map(item => item.document_id));
    expect(result.sourceOutcomes).toHaveLength(1_000);
    expect(result.sourceOutcomes.every(outcome => outcome.coverageStatus === 'assessed')).toBe(
      true
    );
    expect(result.promptContent).toContain('SYNTHETIC ADVISORY DOCUMENT EVIDENCE');
    expect(result.promptContent).toContain(`accepted_run_id=${runId}`);
    expect(result.tokenCount).toBeLessThanOrEqual(result.targetTokens);
    expect(result.materialSourceRefs).toHaveLength(1_000);
    expect(result.constraints).toHaveLength(1_000);
    expect(result.limitations).toHaveLength(1_000);
  });

  it('reduces one oversized CORE card below the downstream target without slicing', async () => {
    const reduceSummary = vi.fn(async input => ({
      value: { unitIds: input.units.map(unit => unit.unitId), summary: 'Bounded CORE advisory' },
      usage: { inputTokens: 900, outputTokens: 5, costUsd: 0 },
    }));
    const result = await buildDownstreamEvidenceRepresentation({
      runId,
      cards: [card(1, 'Oversized CORE evidence '.repeat(400))],
      coverage: coverage(1),
      language: 'en',
      modelId: 'test/model',
      evidenceVersion: 'evidence-v1',
      targetTokens: 200,
      maxBatchTokens: 5_000,
      maxRetries: 0,
      port: { extractMap: vi.fn(), reduceSummary },
    });

    expect(reduceSummary).toHaveBeenCalledTimes(1);
    expect(result.promptContent).toContain('Bounded CORE advisory');
    expect(result.tokenCount).toBeLessThanOrEqual(200);
  });

  it('restores durable cross-document reductions and the immutable complete digest', async () => {
    const cards = Array.from({ length: 20 }, (_, index) =>
      card(index + 1, `Long evidence ${index + 1} `.repeat(100))
    );
    const events: DownstreamContextCheckpointEvent[] = [];
    const port = {
      extractMap: vi.fn(),
      reduceSummary: vi.fn(async input => ({
        value: {
          unitIds: input.units.map(unit => unit.unitId),
          summary: `Reduced ${input.level} ${input.units.length}`,
        },
        usage: { inputTokens: 100, outputTokens: 10, costUsd: 0 },
      })),
    };
    const first = await buildDownstreamEvidenceRepresentation({
      runId,
      cards,
      coverage: coverage(cards.length),
      language: 'ru',
      modelId: 'test/model',
      evidenceVersion: 'evidence-v1',
      targetTokens: 300,
      maxBatchTokens: 1_000,
      maxRetries: 0,
      port,
      onCheckpoint: async event => events.push(structuredClone(event)),
    });
    const checkpointRows = events.map(event => ({
      batch_key: event.batchKey,
      input_hash: event.inputHash,
      structured_checkpoint: event.structuredCheckpoint,
      cursor: event.cursor,
    }));
    const replayPort = { extractMap: vi.fn(), reduceSummary: vi.fn() };
    const resumed = await buildDownstreamEvidenceRepresentation({
      runId,
      cards,
      coverage: coverage(cards.length),
      language: 'ru',
      modelId: 'test/model',
      evidenceVersion: 'evidence-v1',
      targetTokens: 300,
      maxBatchTokens: 1_000,
      maxRetries: 0,
      port: replayPort,
      checkpointRows,
    });

    expect(replayPort.reduceSummary).not.toHaveBeenCalled();
    expect(resumed).toEqual(first);
  });
});
