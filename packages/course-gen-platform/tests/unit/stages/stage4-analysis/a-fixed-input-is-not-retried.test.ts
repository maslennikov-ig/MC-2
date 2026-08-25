/**
 * Contract: a phase that rejected its input does not re-read the same input
 * twice more before giving up.
 *
 * `executePhaseWithRetry` has always had a bail-out for deterministic failures.
 * It matched on words — "validation failed", "zod", "mismatch" — and a ZodError's
 * message is a JSON array of issues, which contains none of them. So the guard
 * missed the one error class it was written for.
 *
 * The cost is not just the 3s of backoff. The course died reporting "Phase
 * phase2_scope failed after 3 attempts", which reads as a flaky model and sent
 * the first look at mc2-4m29k in the wrong direction; the input had been fixed
 * since attempt one.
 */

import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('@/stages/stage4-analysis/phases/phase-2-scope', () => ({ runPhase2Scope: vi.fn() }));
vi.mock('@/stages/stage4-analysis/phases/phase-3-expert', () => ({ runPhase3Expert: vi.fn() }));
vi.mock('@/stages/stage4-analysis/phases/phase-4-synthesis', () => ({
  runPhase4Synthesis: vi.fn(),
}));
vi.mock('@/shared/trace-logger', () => ({ logTrace: vi.fn() }));

import { executePhaseWithRetry } from '@/stages/stage4-analysis/orchestrator-phase-helpers';

const silentLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as unknown as Parameters<typeof executePhaseWithRetry>[2];

function zodErrorFrom(schema: z.ZodTypeAny, value: unknown): z.ZodError {
  const result = schema.safeParse(value);
  if (result.success) throw new Error('the fixture must fail');
  return result.error;
}

describe('executePhaseWithRetry', () => {
  it('gives up after one attempt when the input itself was rejected', async () => {
    const error = zodErrorFrom(z.object({ complexity: z.enum(['narrow', 'medium']) }), {
      complexity: 'beginner',
    });
    // Reproduces the shape of the message that fooled the old guard: no "zod",
    // no "validation failed", just the issues.
    expect(error.message.toLowerCase()).not.toContain('zod');
    expect(error.message.toLowerCase()).not.toContain('validation failed');

    const phase = vi.fn().mockRejectedValue(error);

    await expect(executePhaseWithRetry('phase2_scope', phase, silentLogger)).rejects.toThrow(error);
    expect(phase).toHaveBeenCalledTimes(1);
  });

  it('still gives up on a ZodError that lost its prototype crossing a boundary', async () => {
    const crossRealm = Object.assign(new Error('[\n  {\n    "code": "invalid_type"\n  }\n]'), {
      name: 'ZodError',
    });
    const phase = vi.fn().mockRejectedValue(crossRealm);

    await expect(executePhaseWithRetry('phase2_scope', phase, silentLogger)).rejects.toThrow(
      crossRealm
    );
    expect(phase).toHaveBeenCalledTimes(1);
  });

  it('still retries a failure that might not repeat', async () => {
    const phase = vi
      .fn()
      .mockRejectedValueOnce(new Error('upstream connect timeout'))
      .mockResolvedValue('done');

    await expect(executePhaseWithRetry('phase2_scope', phase, silentLogger)).resolves.toBe('done');
    expect(phase).toHaveBeenCalledTimes(2);
  });
});
