/**
 * Layer 3 worker validation only warns when Stage 4 really is uninitialized.
 * @module stages/stage4-analysis/worker-validation-fsm-fallback.test
 *
 * mc2-51epl warning 5. Two courses that were fine got the line, and one that was
 * not got a fallback that its own database guard could never accept:
 * `initialize_fsm_with_outbox` updates `courses` only where the status is NULL,
 * `pending`, `completed`, `failed` or `cancelled`, and raises 23505 otherwise.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  warn: vi.fn(),
  currentStatus: 'stage_4_init' as string | null,
  courseMissing: false,
  handleFsmInit: vi.fn(async () => ({})),
}));

vi.mock('@/shared/logger', () => {
  const logger = {
    warn: harness.warn,
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
  return { logger, default: logger };
});

vi.mock('@/shared/supabase/admin', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () =>
            harness.courseMissing
              ? { data: null, error: { message: 'no rows' } }
              : { data: { generation_status: harness.currentStatus }, error: null },
        }),
      }),
    }),
  }),
}));

vi.mock('@/shared/fsm/fsm-initialization-command-handler', () => ({
  InitializeFSMCommandHandler: class {
    handle = harness.handleFsmInit;
  },
}));

vi.mock('@/orchestrator/metrics', () => ({
  metricsStore: { recordLayer3Activation: vi.fn() },
}));

import { validateAndInitializeStage4 } from '@/stages/stage4-analysis/handler-helpers';

const { warn, handleFsmInit } = harness;
const messages = (): string[] => warn.mock.calls.map(call => String(call[1]));

async function run(status: string | null): Promise<void> {
  harness.currentStatus = status;
  harness.courseMissing = false;
  await validateAndInitializeStage4('course-1', 'user-1', 'org-1', 'job-1');
}

describe('validateAndInitializeStage4', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(['stage_4_init', 'stage_4_analyzing', 'stage_4_awaiting_approval'])(
    'says nothing for %s',
    async status => {
      await run(status);
      expect(warn).not.toHaveBeenCalled();
      expect(handleFsmInit).not.toHaveBeenCalled();
    }
  );

  it.each([
    // Phase 0.5 is waiting on the user. Nothing is wrong and nothing is missing.
    'stage_4_clarifying',
    // A finished Stage 4 being analysed again starts from here.
    'stage_4_complete',
  ])('says nothing for %s either, which it used to call uninitialized', async status => {
    await run(status);
    expect(warn).not.toHaveBeenCalled();
    expect(handleFsmInit).not.toHaveBeenCalled();
  });

  it.each(['pending', 'completed', 'failed', 'cancelled', null])(
    'initializes as fallback from %s, which the RPC accepts',
    async status => {
      await run(status);
      expect(messages()).toContain(
        'Worker validation: Stage 4 not initialized, initializing as fallback'
      );
      expect(handleFsmInit).toHaveBeenCalledTimes(1);
      expect(handleFsmInit).toHaveBeenCalledWith(
        expect.objectContaining({ initialState: 'stage_4_init', initiatedBy: 'WORKER' })
      );
    }
  );

  it.each(['stage_2_processing', 'stage_3_summarizing', 'stage_5_generating', 'finalizing'])(
    'does not attempt a fallback from %s, because the RPC would refuse it',
    async status => {
      await run(status);
      expect(handleFsmInit).not.toHaveBeenCalled();
      expect(messages().join(' ')).toContain('the FSM cannot be re-initialized from here');
    }
  );

  it('still throws when the course is gone', async () => {
    harness.courseMissing = true;

    await expect(validateAndInitializeStage4('gone', 'u', 'o', 'j')).rejects.toThrow(
      /Course not found/u
    );
  });
});
