/* eslint-disable @typescript-eslint/require-await -- deterministic ports mirror async production */
import { describe, expect, it, vi } from 'vitest';
import type { DocumentEvidenceCard } from '@megacampus/shared-types';
import type { StructuredEvidencePort } from '@/stages/stage4-analysis/evidence/card-generator';
import {
  buildDownstreamEvidenceRepresentation,
  estimateDownstreamReduceInputTokens,
  type DownstreamContextCheckpointEvent,
} from '@/stages/stage4-analysis/evidence/downstream-context';
import { buildDocumentsContext } from '@/stages/stage4-analysis/phases/phase-2-scope';

const runId = '10000000-0000-4000-8000-000000000001';
const documentId = (value: number) =>
  `40000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;
type ReduceInput = Parameters<StructuredEvidencePort['reduceSummary']>[0];

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

function oversizedMaterialCard(language: 'ru' | 'en'): DocumentEvidenceCard {
  const result = card(1, language === 'ru' ? 'Краткое резюме' : 'Short summary');
  const word = language === 'ru' ? 'материал' : 'material';
  result.key_claims = Array.from({ length: 18 }, (_, index) => ({
    claim_id: `50000000-0000-4000-8000-${(index + 1).toString().padStart(12, '0')}`,
    statement: `claim-${index.toString().padStart(2, '0')} ${`${word}-${index} `.repeat(45)}`,
    confidence: 0.9,
    source_refs: [
      {
        document_id: result.document_id,
        version_hash: 'sha256:oversized-source',
        chunk_id: `chunk-${index}`,
      },
    ],
  }));
  result.constraints = Array.from(
    { length: 12 },
    (_, index) =>
      `constraint-${index.toString().padStart(2, '0')} ${`${word}-${index} `.repeat(45)}`
  );
  result.limitations = Array.from(
    { length: 10 },
    (_, index) =>
      `limitation-${index.toString().padStart(2, '0')} ${`${word}-${index} `.repeat(45)}`
  );
  return result;
}

function rows(events: DownstreamContextCheckpointEvent[]) {
  return events.map(event => ({
    batch_key: event.batchKey,
    input_hash: event.inputHash,
    structured_checkpoint: event.structuredCheckpoint,
    cursor: event.cursor,
  }));
}

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
    const reduceSummary = vi.fn(async (input: ReduceInput) => {
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
    const reduceSummary = vi.fn(async (input: ReduceInput) => ({
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

  it.each(['en', 'ru'] as const)(
    'processes every oversized CORE material item once in bounded %s per-card hierarchy',
    async language => {
      const source = oversizedMaterialCard(language);
      const maxBatchTokens = 320;
      const materialUnitIds: string[] = [];
      const materialUnitContent = new Map<string, string>();
      const reduceSummary = vi.fn(async (input: ReduceInput) => {
        expect(
          estimateDownstreamReduceInputTokens(input.units, input.topic, input.language)
        ).toBeLessThanOrEqual(maxBatchTokens);
        if (input.topic === 'Per-document advisory evidence digest') {
          materialUnitIds.push(
            ...input.units
              .map(unit => unit.unitId)
              .filter((unitId: string) => unitId.includes(':material:'))
          );
          for (const unit of input.units.filter(unit => unit.unitId.includes(':material:'))) {
            materialUnitContent.set(unit.unitId, unit.summary);
          }
        }
        return {
          value: {
            unitIds: input.units.map(unit => unit.unitId),
            summary: `Bounded ${language} level ${input.level}`,
          },
          usage: { inputTokens: 100, outputTokens: 10, costUsd: 0 },
        };
      });

      const result = await buildDownstreamEvidenceRepresentation({
        runId,
        cards: [source],
        coverage: coverage(1),
        language,
        modelId: 'test/model',
        evidenceVersion: 'evidence-v1',
        targetTokens: 220,
        maxBatchTokens,
        maxRetries: 0,
        port: { extractMap: vi.fn(), reduceSummary },
      });

      const materialItems = new Set(
        materialUnitIds.map(unitId => unitId.replace(/:part:\d+$/, ''))
      );
      expect(materialUnitIds).toHaveLength(new Set(materialUnitIds).size);
      expect(materialItems.size).toBe(
        1 + source.key_claims.length + source.constraints.length + source.limitations.length + 1
      );
      const reconstructed = [...materialItems].map(itemId =>
        [...materialUnitContent.entries()]
          .filter(([unitId]) => unitId.startsWith(`${itemId}:part:`))
          .sort(([left], [right]) => {
            const leftPart = Number(left.match(/:part:(\d+)$/)?.[1]);
            const rightPart = Number(right.match(/:part:(\d+)$/)?.[1]);
            return leftPart - rightPart;
          })
          .map(([, summary]) => summary.slice(summary.indexOf('\ncontent=') + 9))
          .join('')
      );
      expect(reconstructed.sort()).toEqual(
        [
          source.summary ?? '[no assessed summary]',
          ...source.key_claims.map(claim => claim.statement),
          ...source.constraints,
          ...source.limitations,
          `${source.coverage_status} (${source.coverage_reason})`,
        ].sort()
      );
      expect(result.sourceMaterials).toEqual([
        {
          documentId: source.document_id,
          keyClaims: source.key_claims,
          constraints: source.constraints,
          limitations: source.limitations,
        },
      ]);
      expect(result.claims).toEqual(source.key_claims.map(claim => claim.statement).sort());
      expect(result.constraints).toEqual([...source.constraints].sort());
      expect(result.limitations).toEqual([...source.limitations].sort());
      expect(result.materialSourceRefs).toEqual(
        source.key_claims
          .flatMap(claim => claim.source_refs)
          .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
      );
    }
  );

  it('resumes committed per-card chunks and reductions without duplicate calls', async () => {
    const source = oversizedMaterialCard('en');
    const makePort = (calls: string[]) => ({
      extractMap: vi.fn(),
      reduceSummary: vi.fn(async (input: ReduceInput) => {
        calls.push(
          `${input.topic}:${input.level}:${input.units.map(unit => unit.unitId).join(',')}`
        );
        return {
          value: {
            unitIds: input.units.map(unit => unit.unitId),
            summary: `Bounded level ${input.level}`,
          },
          usage: { inputTokens: 100, outputTokens: 10, costUsd: 0 },
        };
      }),
    });
    const common = {
      runId,
      cards: [source],
      coverage: coverage(1),
      language: 'en' as const,
      modelId: 'test/model',
      evidenceVersion: 'evidence-v1',
      targetTokens: 220,
      maxBatchTokens: 320,
      maxRetries: 0,
    };
    const baselineCalls: string[] = [];
    const baseline = await buildDownstreamEvidenceRepresentation({
      ...common,
      port: makePort(baselineCalls),
    });

    const persisted: DownstreamContextCheckpointEvent[] = [];
    const beforeCrashCalls: string[] = [];
    await expect(
      buildDownstreamEvidenceRepresentation({
        ...common,
        port: makePort(beforeCrashCalls),
        onCheckpoint: async event => {
          persisted.push(structuredClone(event));
          if (
            event.structuredCheckpoint.kind === 'downstream_context_reduction' &&
            event.structuredCheckpoint.stage === 'card'
          ) {
            throw new Error('simulated durable checkpoint acknowledgement loss');
          }
        },
      })
    ).rejects.toThrow('simulated durable checkpoint acknowledgement loss');

    const resumedCalls: string[] = [];
    const resumedEvents: DownstreamContextCheckpointEvent[] = [];
    const resumed = await buildDownstreamEvidenceRepresentation({
      ...common,
      port: makePort(resumedCalls),
      checkpointRows: rows(persisted),
      onCheckpoint: async event => resumedEvents.push(structuredClone(event)),
    });

    expect(new Set([...beforeCrashCalls, ...resumedCalls]).size).toBe(
      beforeCrashCalls.length + resumedCalls.length
    );
    expect([...beforeCrashCalls, ...resumedCalls]).toEqual(baselineCalls);
    expect(resumed).toEqual(baseline);

    const completeReplayPort = makePort([]);
    const replay = await buildDownstreamEvidenceRepresentation({
      ...common,
      port: completeReplayPort,
      checkpointRows: rows([...persisted, ...resumedEvents]),
    });
    expect(completeReplayPort.reduceSummary).not.toHaveBeenCalled();
    expect(JSON.stringify(replay)).toBe(JSON.stringify(baseline));
  });

  it('rejects foreign unit IDs returned by the per-card hierarchy', async () => {
    const source = oversizedMaterialCard('en');
    await expect(
      buildDownstreamEvidenceRepresentation({
        runId,
        cards: [source],
        coverage: coverage(1),
        language: 'en',
        modelId: 'test/model',
        evidenceVersion: 'evidence-v1',
        targetTokens: 220,
        maxBatchTokens: 320,
        maxRetries: 0,
        port: {
          extractMap: vi.fn(),
          reduceSummary: vi.fn(async (input: ReduceInput) => ({
            value: {
              unitIds: [...input.units.map(unit => unit.unitId), 'foreign-unit'],
              summary: 'x',
            },
            usage: { inputTokens: 100, outputTokens: 10, costUsd: 0 },
          })),
        },
      })
    ).rejects.toThrow('allowlisted unit set');
  });

  it('restores durable cross-document reductions and the immutable complete digest', async () => {
    const cards = Array.from({ length: 20 }, (_, index) =>
      card(index + 1, `Long evidence ${index + 1} `.repeat(100))
    );
    const events: DownstreamContextCheckpointEvent[] = [];
    const port = {
      extractMap: vi.fn(),
      reduceSummary: vi.fn(async (input: ReduceInput) => ({
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
    const checkpointRows = rows(events);
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
