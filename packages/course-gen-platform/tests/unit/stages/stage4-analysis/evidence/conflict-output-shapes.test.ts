/**
 * Contract: Stage 4 does not fail over the wrapper around a model's answer,
 * and when it does fail it says why.
 *
 * A live run (mc2-2pplo, 2026-08-15) reached accepted evidence and then died
 * at conflict detection. The map prompt named the three fields and never named
 * the envelope, so `~deepseek/deepseek-v4-flash-latest` answered with a bare
 * array of propositions. The strict object schema rejected all three attempts,
 * and the only thing logged was "failed within the bounded execution policy" —
 * the ZodError was attached as a `cause` the logger never prints, so finding it
 * cost a replay against the surviving run.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  ConflictDetectionExecutionError,
  createProductionConflictDetectionPort,
  CONFLICT_MAP_SYSTEM_PROMPT,
  CONFLICT_REDUCE_SYSTEM_PROMPT,
  CONFLICT_CLASSIFY_SYSTEM_PROMPT,
} from '@/stages/stage4-analysis/evidence/conflict-detector';

const CLAIM_A = '11111111-1111-4111-8111-111111111111';
const CLAIM_B = '22222222-2222-4222-8222-222222222222';
const DOC_A = '33333333-3333-4333-8333-333333333333';

function usage() {
  return { input_tokens: 10, output_tokens: 5, total_cost_usd: 0.001 };
}

function mapInput() {
  return {
    language: 'ru' as const,
    claims: [
      {
        claim_id: CLAIM_A,
        statement: 'Фотосинтез идёт в хлоропластах',
        document_id: DOC_A,
        authority_scope: 'course_source' as const,
        priority: 'CORE' as const,
        content_quality: 0.9,
        confidence: 0.9,
      },
    ],
    max_input_tokens: 2_000,
    max_output_tokens: 500,
    max_model_calls: 3,
  };
}

describe('conflict detection output shapes', () => {
  it('accepts the bare array of propositions the live model returned', async () => {
    // The exact shape of the live answer, wrapper and all.
    const invoke = vi.fn(async () => ({
      content: JSON.stringify([
        { claim_id: CLAIM_A, proposition_key: 'photosynthesis_site', value_key: 'chloroplast' },
      ]),
      usage: usage(),
    }));
    const port = createProductionConflictDetectionPort({ invoke, maxRetries: 0 });

    const result = await port.mapBatch(mapInput());

    expect(result.propositions).toEqual([
      { claim_id: CLAIM_A, proposition_key: 'photosynthesis_site', value_key: 'chloroplast' },
    ]);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('still accepts the wrapped object', async () => {
    const invoke = vi.fn(async () => ({
      content: JSON.stringify({
        propositions: [
          { claim_id: CLAIM_A, proposition_key: 'photosynthesis_site', value_key: 'chloroplast' },
        ],
      }),
      usage: usage(),
    }));
    const port = createProductionConflictDetectionPort({ invoke, maxRetries: 0 });

    await expect(port.mapBatch(mapInput())).resolves.toMatchObject({
      propositions: [expect.objectContaining({ claim_id: CLAIM_A })],
    });
  });

  it('applies the same tolerance to the reduction answer', async () => {
    const invoke = vi.fn(async () => ({
      content: JSON.stringify([
        { child_cluster_ids: ['cluster-a', 'cluster-b'], canonical_value_key: 'chloroplast' },
      ]),
      usage: usage(),
    }));
    const port = createProductionConflictDetectionPort({ invoke, maxRetries: 0 });

    await expect(
      port.reduceValueGroups({
        language: 'ru',
        proposition_key: 'photosynthesis_site',
        clusters: [
          { cluster_id: 'cluster-a', canonical_value_key: 'chloroplast', claim_ids: [CLAIM_A] },
          { cluster_id: 'cluster-b', canonical_value_key: 'хлоропласт', claim_ids: [CLAIM_B] },
        ],
        max_input_tokens: 2_000,
        max_output_tokens: 500,
        max_model_calls: 3,
      })
    ).resolves.toMatchObject({
      partitions: [expect.objectContaining({ canonical_value_key: 'chloroplast' })],
    });
  });

  it('applies the same tolerance to the classification answer', async () => {
    const invoke = vi.fn(async () => ({ content: JSON.stringify([]), usage: usage() }));
    const port = createProductionConflictDetectionPort({ invoke, maxRetries: 0 });

    await expect(
      port.classifyProposition({
        language: 'ru',
        proposition_key: 'photosynthesis_site',
        clusters: [
          { cluster_id: 'cluster-a', canonical_value_key: 'chloroplast', claim_ids: [CLAIM_A] },
          { cluster_id: 'cluster-b', canonical_value_key: 'строма', claim_ids: [CLAIM_B] },
        ],
        max_input_tokens: 2_000,
        max_output_tokens: 500,
        max_model_calls: 3,
      })
    ).resolves.toMatchObject({ conflicts: [] });
  });

  it('retries a mapping that skips a claim instead of ending the stage', async () => {
    // The bijection used to be checked after the port returned, outside the
    // retry budget built for exactly this. One dropped claim id killed a live
    // run at Stage 4 with two unused attempts in hand.
    const input = {
      ...mapInput(),
      claims: [mapInput().claims[0], { ...mapInput().claims[0], claim_id: CLAIM_B }],
    };
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({
        content: JSON.stringify([{ claim_id: CLAIM_A, proposition_key: 'p', value_key: 'v' }]),
        usage: usage(),
      })
      .mockResolvedValueOnce({
        content: JSON.stringify([
          { claim_id: CLAIM_A, proposition_key: 'p', value_key: 'v' },
          { claim_id: CLAIM_B, proposition_key: 'p', value_key: 'w' },
        ]),
        usage: usage(),
      });
    const port = createProductionConflictDetectionPort({ invoke, maxRetries: 1 });

    const result = await port.mapBatch(input);

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(result.propositions.map(item => item.claim_id).sort()).toEqual(
      [CLAIM_A, CLAIM_B].sort()
    );
  });

  it('refuses a mapping that repeats a claim', async () => {
    const invoke = vi.fn(async () => ({
      content: JSON.stringify([
        { claim_id: CLAIM_A, proposition_key: 'p', value_key: 'v' },
        { claim_id: CLAIM_A, proposition_key: 'p', value_key: 'w' },
      ]),
      usage: usage(),
    }));
    const port = createProductionConflictDetectionPort({ invoke, maxRetries: 0 });

    await expect(port.mapBatch(mapInput())).rejects.toThrow(/bounded retry policy/);
  });

  it('still rejects an item that is wrong inside the envelope', async () => {
    const invoke = vi.fn(async () => ({
      content: JSON.stringify([{ claim_id: 'not-a-uuid', proposition_key: 'x', value_key: 'y' }]),
      usage: usage(),
    }));
    const port = createProductionConflictDetectionPort({ invoke, maxRetries: 0 });

    await expect(port.mapBatch(mapInput())).rejects.toThrow(/bounded retry policy/);
  });

  it('tells the model the envelope instead of leaving it to guess', () => {
    expect(CONFLICT_MAP_SYSTEM_PROMPT).toContain('{"propositions"');
    expect(CONFLICT_REDUCE_SYSTEM_PROMPT).toContain('{"partitions"');
    expect(CONFLICT_CLASSIFY_SYSTEM_PROMPT).toContain('{"conflicts"');
  });

  it('puts the real reason in the message, not only in an unread cause', () => {
    const error = new ConflictDetectionExecutionError(
      { batches: 0, conflicts: { critical: 0, important: 0, informational: 0 } },
      { cause: new Error('Expected object, received array') }
    );

    expect(error.message).toContain('Expected object, received array');
  });

  it('says so plainly when nothing was recorded', () => {
    const error = new ConflictDetectionExecutionError({
      batches: 0,
      conflicts: { critical: 0, important: 0, informational: 0 },
    });

    expect(error.message).toContain('no cause recorded');
  });
});
