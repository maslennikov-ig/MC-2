export const HELIXA_KNOWLEDGE_SYNC_SCHEDULER_ENABLED =
  'HELIXA_KNOWLEDGE_SYNC_SCHEDULER_ENABLED' as const;

export type KnowledgeSyncDeliveryResult = 'delivered' | 'retryable' | 'terminal' | 'lost_lease';

export interface KnowledgeSyncDeliveryCounters {
  delivered: number;
  retryable: number;
  terminal: number;
  lostLease: number;
  batchFailures: number;
}

export interface KnowledgeSyncDeliveryScheduler {
  start(): boolean;
  stop(): void;
  isRunning(): boolean;
}

type TimerHandle = ReturnType<typeof setInterval>;

export interface KnowledgeSyncDeliverySchedulerOptions {
  enabled?: boolean;
  intervalMs?: number;
  runBatch(): Promise<ReadonlyArray<{ result: KnowledgeSyncDeliveryResult }>>;
  onCounters?(counters: KnowledgeSyncDeliveryCounters, error?: unknown): void;
  timers?: {
    setInterval(callback: () => void, intervalMs: number): TimerHandle;
    clearInterval(handle: TimerHandle): void;
  };
}

export function isKnowledgeSyncDeliverySchedulerEnabled(
  environment: NodeJS.ProcessEnv = process.env
): boolean {
  return environment[HELIXA_KNOWLEDGE_SYNC_SCHEDULER_ENABLED] === 'true';
}

function counters(
  results: ReadonlyArray<{ result: KnowledgeSyncDeliveryResult }>
): KnowledgeSyncDeliveryCounters {
  return results.reduce<KnowledgeSyncDeliveryCounters>(
    (total, item) => {
      if (item.result === 'delivered') total.delivered += 1;
      if (item.result === 'retryable') total.retryable += 1;
      if (item.result === 'terminal') total.terminal += 1;
      if (item.result === 'lost_lease') total.lostLease += 1;
      return total;
    },
    { delivered: 0, retryable: 0, terminal: 0, lostLease: 0, batchFailures: 0 }
  );
}

function failedBatchCounters(): KnowledgeSyncDeliveryCounters {
  return { delivered: 0, retryable: 0, terminal: 0, lostLease: 0, batchFailures: 1 };
}

export function createKnowledgeSyncDeliveryScheduler(
  options: KnowledgeSyncDeliverySchedulerOptions
): KnowledgeSyncDeliveryScheduler {
  const timerApi = options.timers ?? { setInterval, clearInterval };
  const intervalMs = options.intervalMs ?? 30_000;
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 100) {
    throw new TypeError('Knowledge sync delivery scheduler interval must be at least 100ms');
  }

  let timer: TimerHandle | null = null;
  let runningTick = false;
  let stopped = false;

  const report = (snapshot: KnowledgeSyncDeliveryCounters, error?: unknown): void => {
    try {
      options.onCounters?.(snapshot, error);
    } catch {
      // An observer must not escape the fire-and-forget scheduler boundary.
    }
  };

  const tick = (): void => {
    if (stopped || runningTick) return;
    runningTick = true;
    let batch: Promise<ReadonlyArray<{ result: KnowledgeSyncDeliveryResult }>>;
    try {
      batch = options.runBatch();
    } catch (error) {
      report(failedBatchCounters(), error);
      runningTick = false;
      return;
    }
    void batch
      .then(
        results => report(counters(results)),
        error => report(failedBatchCounters(), error)
      )
      .finally(() => {
        runningTick = false;
      });
  };

  return {
    start() {
      if (!options.enabled || timer !== null || stopped) return false;
      timer = timerApi.setInterval(tick, intervalMs);
      return true;
    },
    stop() {
      stopped = true;
      if (timer !== null) timerApi.clearInterval(timer);
      timer = null;
    },
    isRunning() {
      return timer !== null && !stopped;
    },
  };
}
