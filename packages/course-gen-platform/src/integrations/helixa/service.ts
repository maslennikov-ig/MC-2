import { buildKnowledgeSyncPackage } from './package-builder';
import { createFetchRequest, type DeliveryConfig } from './delivery';
import { processKnowledgeSyncOutboxEntry } from './outbox';
import { reconcileCompletedKnowledgeObjects } from './reconciler';
import {
  claimKnowledgeSyncOutbox,
  createKnowledgeSyncOutboxRepository,
  createSupabaseReconcileRepository,
  loadKnowledgeSnapshot,
  readKnowledgeSyncRuntimeConfig,
  type KnowledgeSyncRuntimeConfig,
} from './runtime-repository';
import { KnowledgeSyncPreparationError } from './errors';
import {
  createKnowledgeSyncDeliveryScheduler,
  isKnowledgeSyncDeliverySchedulerEnabled,
  type KnowledgeSyncDeliveryCounters,
  type KnowledgeSyncDeliveryScheduler,
} from './scheduler';

/** Local/invoked delivery service. Nothing imports or schedules it automatically. */
export interface KnowledgeSyncDeliveryBatchDependencies {
  config?: KnowledgeSyncRuntimeConfig;
  claim?: typeof claimKnowledgeSyncOutbox;
  repository?: ReturnType<typeof createKnowledgeSyncOutboxRepository>;
  loadSnapshot?: typeof loadKnowledgeSnapshot;
  request?: DeliveryConfig['request'];
}

export async function runKnowledgeSyncDeliveryBatch(
  options: {
    batchSize?: number;
    environment?: NodeJS.ProcessEnv;
    dependencies?: KnowledgeSyncDeliveryBatchDependencies;
  } = {}
) {
  const dependencies = options.dependencies;
  const config = dependencies?.config ?? readKnowledgeSyncRuntimeConfig(options.environment);
  const claim = dependencies?.claim ?? claimKnowledgeSyncOutbox;
  const entries = await claim(config, options.batchSize);
  const repository = dependencies?.repository ?? createKnowledgeSyncOutboxRepository();
  const readSnapshot = (entry: Parameters<typeof loadKnowledgeSnapshot>[0]) =>
    (dependencies?.loadSnapshot ?? loadKnowledgeSnapshot)(entry);
  const request = dependencies?.request ?? createFetchRequest();
  const results: Array<{
    id: string;
    result: 'delivered' | 'retryable' | 'terminal' | 'lost_lease';
  }> = [];
  for (const entry of entries) {
    const result = await processKnowledgeSyncOutboxEntry({
      entry,
      repository,
      buildPackage: async () => {
        const snapshot = await readSnapshot(entry);
        const packageValue = await buildKnowledgeSyncPackage(snapshot, {
          environment: config.environment,
          externalProjectId: config.externalProjectId,
        });
        if (packageValue.eventId !== entry.eventId)
          throw new KnowledgeSyncPreparationError('event_identity', false);
        return packageValue;
      },
      delivery: {
        endpoint: config.endpoint,
        hmacKey: config.hmacKey,
        externalSystemId: config.externalSystemId,
        request,
      },
    });
    results.push({ id: entry.id, result });
  }
  return results;
}

/** Starts only when the exact local opt-in flag and complete runtime configuration are present. */
export function startKnowledgeSyncDeliveryScheduler(
  options: {
    environment?: NodeJS.ProcessEnv;
    intervalMs?: number;
    onCounters?(counters: KnowledgeSyncDeliveryCounters): void;
  } = {}
): KnowledgeSyncDeliveryScheduler | null {
  const environment = options.environment ?? process.env;
  if (!isKnowledgeSyncDeliverySchedulerEnabled(environment)) return null;

  // Validate before a timer exists: an enabled scheduler never runs with partial authority.
  readKnowledgeSyncRuntimeConfig(environment);
  const scheduler = createKnowledgeSyncDeliveryScheduler({
    enabled: true,
    intervalMs: options.intervalMs,
    runBatch: () => runKnowledgeSyncDeliveryBatch({ environment }),
    onCounters: options.onCounters ? counters => options.onCounters?.(counters) : undefined,
  });
  scheduler.start();
  return scheduler;
}

/** Dry-run by default. Passing apply:true is the explicit local mutation gate. */
export async function runKnowledgeSyncReconciler(options: { apply?: boolean } = {}) {
  const config = readKnowledgeSyncRuntimeConfig();
  return reconcileCompletedKnowledgeObjects(createSupabaseReconcileRepository(config), options);
}
