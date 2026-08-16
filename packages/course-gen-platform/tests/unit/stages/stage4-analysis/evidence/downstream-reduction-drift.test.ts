/* eslint-disable @typescript-eslint/require-await -- deterministic ports mirror async production */
/**
 * Contract: a reduction that loses a unit is a bad answer, not a bad stage —
 * and when it does end the stage, it says which unit.
 *
 * The check on the reduced unit set sat after the retry loop, outside the
 * budget written for exactly this kind of answer, so one dropped id ended
 * Stage 4 with attempts still in hand. It is the same shape as the conflict
 * detector's allowlist check, found the same week (mc2-2pplo, f05fd9435).
 *
 * The message said only "Downstream reduction changed the allowlisted unit
 * set", which names the rule and not one fact you could act on.
 */

import { describe, expect, it, vi } from 'vitest';
import type { DocumentEvidenceCard } from '@megacampus/shared-types';

import type { StructuredEvidencePort } from '@/stages/stage4-analysis/evidence/card-generator';
import { buildDownstreamEvidenceRepresentation } from '@/stages/stage4-analysis/evidence/downstream-context';

type ReduceInput = Parameters<StructuredEvidencePort['reduceSummary']>[0];

const runId = '10000000-0000-4000-8000-000000000001';
const documentId = (value: number) =>
  `40000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;

function card(value: number, summary: string): DocumentEvidenceCard {
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
    token_counts: { original: 1_000, summary: 100, allocated: 100 },
  };
}

/** Enough cards, long enough, that the hierarchy has to reduce them. */
function crowd(): DocumentEvidenceCard[] {
  return Array.from({ length: 40 }, (_, index) =>
    card(index + 1, `Summary ${index + 1} `.repeat(20))
  );
}

function build(port: StructuredEvidencePort, maxRetries: number) {
  return buildDownstreamEvidenceRepresentation({
    runId,
    cards: crowd(),
    coverage: { source_count: 40, assessed_count: 40, degraded_count: 0, failed_count: 0 },
    language: 'en',
    modelId: 'test/model',
    evidenceVersion: 'evidence-v1',
    targetTokens: 2_000,
    maxBatchTokens: 1_000,
    maxRetries,
    port,
  });
}

describe('downstream reduction that loses a unit', () => {
  it('spends a retry on it instead of ending the stage', async () => {
    let dropped = false;
    const reduceSummary = vi.fn(async (input: ReduceInput) => {
      // Lose one id, exactly once, the way a model does.
      const ids = input.units.map(unit => unit.unitId);
      const answer = !dropped && ids.length > 1 ? ((dropped = true), ids.slice(1)) : ids;
      return {
        value: { unitIds: answer, summary: `Reduced ${input.level} ${input.units.length}` },
        usage: { inputTokens: 100, outputTokens: 10, costUsd: 0 },
      };
    });

    await expect(build({ extractMap: vi.fn(), reduceSummary }, 2)).resolves.toBeDefined();

    expect(dropped).toBe(true);
  });

  it('names the unit it lost when the retries are gone', async () => {
    const reduceSummary = vi.fn(async (input: ReduceInput) => {
      const ids = input.units.map(unit => unit.unitId);
      return {
        value: { unitIds: ids.slice(1), summary: 'Reduced' },
        usage: { inputTokens: 100, outputTokens: 10, costUsd: 0 },
      };
    });

    await expect(build({ extractMap: vi.fn(), reduceSummary }, 0)).rejects.toThrow(/dropped .+/);
  });

  it('names an id the model invented', async () => {
    const reduceSummary = vi.fn(async (input: ReduceInput) => ({
      value: {
        unitIds: [...input.units.map(unit => unit.unitId), 'unit-from-nowhere'],
        summary: 'Reduced',
      },
      usage: { inputTokens: 100, outputTokens: 10, costUsd: 0 },
    }));

    await expect(build({ extractMap: vi.fn(), reduceSummary }, 0)).rejects.toThrow(
      /invented unit-from-nowhere/
    );
  });
});
