import { describe, expect, it } from 'vitest';

import {
  DEFAULT_QDRANT_RECOVERY_WINDOW_MS,
  getQdrantRecoveryDecision,
} from '@/stages/stage2-document-processing/qdrant-recovery-policy';

describe('qdrant recovery policy', () => {
  it('uses a three hour recovery window by default', () => {
    expect(DEFAULT_QDRANT_RECOVERY_WINDOW_MS).toBe(3 * 60 * 60 * 1000);
  });

  it('starts recovery with a five minute delayed retry', () => {
    const now = Date.parse('2026-06-25T12:00:00.000Z');

    const decision = getQdrantRecoveryDecision(undefined, now);

    expect(decision.action).toBe('delay');
    expect(decision.startedAt).toBe('2026-06-25T12:00:00.000Z');
    expect(decision.nextRetryCount).toBe(1);
    expect(decision.delayMs).toBe(5 * 60 * 1000);
  });

  it('caps the final retry delay to the remaining three hour window', () => {
    const startedAt = '2026-06-25T12:00:00.000Z';
    const now = Date.parse('2026-06-25T14:50:00.000Z');

    const decision = getQdrantRecoveryDecision({ startedAt, retryCount: 8 }, now);

    expect(decision.action).toBe('delay');
    expect(decision.startedAt).toBe(startedAt);
    expect(decision.nextRetryCount).toBe(9);
    expect(decision.delayMs).toBe(10 * 60 * 1000);
  });

  it('exhausts recovery after three hours', () => {
    const startedAt = '2026-06-25T12:00:00.000Z';
    const now = Date.parse('2026-06-25T15:00:00.001Z');

    const decision = getQdrantRecoveryDecision({ startedAt, retryCount: 9 }, now);

    expect(decision.action).toBe('exhausted');
    expect(decision.startedAt).toBe(startedAt);
    expect(decision.retryCount).toBe(9);
  });
});
