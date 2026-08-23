import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/helixa/runtime-repository', () => ({
  claimKnowledgeSyncOutbox: vi.fn(),
  createKnowledgeSyncOutboxRepository: vi.fn(),
  createSupabaseReconcileRepository: vi.fn(),
  loadKnowledgeSnapshot: vi.fn(),
  readKnowledgeSyncRuntimeConfig: vi.fn(),
}));

import {
  createKnowledgeSyncDeliveryScheduler,
  isKnowledgeSyncDeliverySchedulerEnabled,
} from '@/integrations/helixa/scheduler';
import { runKnowledgeSyncDeliveryBatch } from '@/integrations/helixa/service';

describe('Helixa knowledge-sync local scheduler', () => {
  it('requires the exact true opt-in value', () => {
    expect(isKnowledgeSyncDeliverySchedulerEnabled({})).toBe(false);
    expect(
      isKnowledgeSyncDeliverySchedulerEnabled({ HELIXA_KNOWLEDGE_SYNC_SCHEDULER_ENABLED: 'TRUE' })
    ).toBe(false);
    expect(
      isKnowledgeSyncDeliverySchedulerEnabled({ HELIXA_KNOWLEDGE_SYNC_SCHEDULER_ENABLED: 'true' })
    ).toBe(true);
  });

  it('is disabled by default', () => {
    const setInterval = vi.fn();
    const scheduler = createKnowledgeSyncDeliveryScheduler({
      runBatch: vi.fn(),
      timers: { setInterval, clearInterval: vi.fn() },
    });

    expect(scheduler.start()).toBe(false);
    expect(setInterval).not.toHaveBeenCalled();
  });

  it('does not overlap ticks and stop clears future work', async () => {
    let tick!: () => void;
    const release = Promise.withResolvers<void>();
    const runBatch = vi.fn(() => release.promise);
    const clearInterval = vi.fn();
    const scheduler = createKnowledgeSyncDeliveryScheduler({
      enabled: true,
      intervalMs: 100,
      runBatch,
      timers: {
        setInterval: vi.fn(callback => {
          tick = callback as () => void;
          return 'timer' as never;
        }),
        clearInterval,
      },
    });

    expect(scheduler.start()).toBe(true);
    tick();
    tick();
    expect(runBatch).toHaveBeenCalledTimes(1);

    scheduler.stop();
    expect(clearInterval).toHaveBeenCalledWith('timer');
    release.resolve();
    await Promise.resolve();
    tick();
    expect(runBatch).toHaveBeenCalledTimes(1);
  });
});

describe('Helixa knowledge-sync delivery injection', () => {
  it('uses the injected request receiver rather than fetch', async () => {
    const request = vi.fn().mockResolvedValue({ status: 202, body: '' });
    const markDelivered = vi.fn().mockResolvedValue(true);

    const results = await runKnowledgeSyncDeliveryBatch({
      dependencies: {
        config: {
          endpoint: 'http://local-fake/megacampus',
          hmacKey: 'test-only-key',
          externalSystemId: 'system-a',
          environment: 'test',
          externalProjectId: null,
          bindingId: 'binding-a',
          organizationId: 'org-a',
          destinationBindingId: 'destination-a',
        },
        claim: async () => [
          {
            id: 'outbox-a',
            eventId: 'event-a',
            objectKind: 'COURSE' as const,
            objectId: 'course-a',
            organizationId: 'org-a',
            completedAt: '2026-08-23T00:00:00.000Z',
            rawBody: Buffer.from('{"fake":true}'),
            attempts: 1,
            leaseToken: 'lease-a',
            bindingId: 'binding-a',
          },
        ],
        repository: {
          persistRawBodyOnce: vi.fn(),
          markDelivered,
          reschedule: vi.fn(),
          markTerminal: vi.fn(),
        },
        loadSnapshot: vi.fn(),
        request,
      },
    });

    expect(results).toEqual([{ id: 'outbox-a', result: 'delivered' }]);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'http://local-fake/megacampus',
        body: Buffer.from('{"fake":true}'),
      })
    );
    expect(markDelivered).toHaveBeenCalledWith('outbox-a', 'lease-a');
  });
});
