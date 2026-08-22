import { buildKnowledgeSyncPackage } from './package-builder';
import { createFetchRequest } from './delivery';
import { processKnowledgeSyncOutboxEntry } from './outbox';
import { reconcileCompletedKnowledgeObjects } from './reconciler';
import { claimKnowledgeSyncOutbox, createKnowledgeSyncOutboxRepository, createSupabaseReconcileRepository, loadKnowledgeSnapshot, readKnowledgeSyncRuntimeConfig } from './runtime-repository';
import { KnowledgeSyncPreparationError } from './errors';

/** Local/invoked delivery service. Nothing imports or schedules it automatically. */
export async function runKnowledgeSyncDeliveryBatch(options: { batchSize?: number; environment?: NodeJS.ProcessEnv } = {}) {
  const config = readKnowledgeSyncRuntimeConfig(options.environment);
  const entries = await claimKnowledgeSyncOutbox(config, options.batchSize);
  const repository = createKnowledgeSyncOutboxRepository();
  const request = createFetchRequest();
  const results: Array<{ id: string; result: 'delivered' | 'retryable' | 'terminal' | 'lost_lease' }> = [];
  for (const entry of entries) {
    const result = await processKnowledgeSyncOutboxEntry({
      entry, repository,
      buildPackage: async () => {
        const snapshot = await loadKnowledgeSnapshot(entry);
        const packageValue = await buildKnowledgeSyncPackage(snapshot, { environment: config.environment, externalProjectId: config.externalProjectId });
        if (packageValue.eventId !== entry.eventId) throw new KnowledgeSyncPreparationError('event_identity', false);
        return packageValue;
      },
      delivery: { endpoint: config.endpoint, hmacKey: config.hmacKey, externalSystemId: config.externalSystemId, request },
    });
    results.push({ id: entry.id, result });
  }
  return results;
}

/** Dry-run by default. Passing apply:true is the explicit local mutation gate. */
export async function runKnowledgeSyncReconciler(options: { apply?: boolean } = {}) {
  const config = readKnowledgeSyncRuntimeConfig();
  return reconcileCompletedKnowledgeObjects(createSupabaseReconcileRepository(config), options);
}
