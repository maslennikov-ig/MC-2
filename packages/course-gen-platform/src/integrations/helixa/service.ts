import { randomUUID } from 'node:crypto';

import {
  buildKnowledgeSyncPackage,
  buildKnowledgeSyncV2Package,
  buildKnowledgeSyncTombstone,
  buildKnowledgeSyncManifestPages,
  serializeKnowledgeSyncPackage,
} from './package-builder';
import { createFetchRequest, deliverClaimedKnowledgeSync, type DeliveryConfig } from './delivery';
import type { KnowledgeManifestResendObject } from './contract';
import { processKnowledgeSyncOutboxEntry } from './outbox';
import { reconcileCompletedKnowledgeObjects } from './reconciler';
import {
  claimKnowledgeSyncOutbox,
  createKnowledgeSyncOutboxRepository,
  createSupabaseReconcileRepository,
  loadKnowledgeSnapshot,
  readKnowledgeSyncRuntimeConfig,
  readKnowledgeSyncBindingConfig,
  synchronizeKnowledgeSyncCaptureGate,
  loadKnowledgeSyncManifestInventory,
  enqueueKnowledgeSyncManifestResend,
  runSupabaseKnowledgeSyncV2Reconciler,
  type KnowledgeSyncRuntimeConfig,
} from './runtime-repository';
import { KnowledgeSyncPreparationError } from './errors';
import {
  createKnowledgeSyncDeliveryScheduler,
  createKnowledgeSyncMaintenanceScheduler,
  isKnowledgeSyncDeliverySchedulerEnabled,
  isKnowledgeSyncContractV2Enabled,
  type KnowledgeSyncDeliveryCounters,
  type KnowledgeSyncDeliveryScheduler,
  type KnowledgeSyncDeliverySchedulerOptions,
} from './scheduler';

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
  // The real claim function synchronizes the durable capture mode before either protocol's claim.
  const entries = await (dependencies?.claim ?? claimKnowledgeSyncOutbox)(
    config,
    options.batchSize
  );
  const repository = dependencies?.repository ?? createKnowledgeSyncOutboxRepository();
  const request = dependencies?.request ?? createFetchRequest();
  const results: Array<{
    id: string;
    result: 'delivered' | 'retryable' | 'terminal' | 'lost_lease';
  }> = [];
  for (const entry of entries) {
    // SQL keeps the queues separate; this also fences injected/misrouted claims.
    if (entry.contractVersion === 2 && config.contractV2 !== true) continue;
    const result = await processKnowledgeSyncOutboxEntry({
      entry,
      repository,
      buildPackage: async () => {
        if (entry.contractVersion === 2 && entry.eventType?.endsWith('_RETRACTED'))
          return buildKnowledgeSyncTombstone(entry, config);
        const snapshot = await (dependencies?.loadSnapshot ?? loadKnowledgeSnapshot)(entry);
        const packageValue =
          entry.contractVersion === 2
            ? await buildKnowledgeSyncV2Package(snapshot, entry, config)
            : await buildKnowledgeSyncPackage(snapshot, config);
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

export interface KnowledgeSyncManifestDependencies {
  config?: KnowledgeSyncRuntimeConfig;
  loadInventory?: typeof loadKnowledgeSyncManifestInventory;
  enqueueResend?: typeof enqueueKnowledgeSyncManifestResend;
  request?: DeliveryConfig['request'];
}

function parseManifestResponse(body: string): {
  status: string;
  resend: KnowledgeManifestResendObject[];
  retracted: number;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new KnowledgeSyncPreparationError('contract', false);
  }
  const value = parsed as { status?: unknown; resend?: unknown; retracted?: unknown } | null;
  if (
    value === null ||
    typeof value !== 'object' ||
    typeof value.status !== 'string' ||
    !Array.isArray(value.resend) ||
    !Number.isSafeInteger(value.retracted) ||
    (value.retracted as number) < 0
  ) {
    throw new KnowledgeSyncPreparationError('contract', false);
  }
  const seen = new Set<string>();
  const resend: KnowledgeManifestResendObject[] = [];
  for (const item of value.resend as unknown[]) {
    const object = item as { kind?: unknown; id?: unknown } | null;
    if (
      object === null ||
      typeof object !== 'object' ||
      (object.kind !== 'COURSE' && object.kind !== 'ROLE_GUIDE') ||
      typeof object.id !== 'string' ||
      !object.id
    ) {
      throw new KnowledgeSyncPreparationError('contract', false);
    }
    const identity = `${object.kind}:${object.id}`;
    if (!seen.has(identity)) {
      resend.push({ kind: object.kind, id: object.id });
      seen.add(identity);
    }
  }
  return { status: value.status, resend, retracted: value.retracted as number };
}

/** Every page is derived from one current DB snapshot, never independent paged reads. */
export async function runKnowledgeSyncManifest(
  options: {
    environment?: NodeJS.ProcessEnv;
    manifestId?: string;
    sentAt?: string;
    dependencies?: KnowledgeSyncManifestDependencies;
  } = {}
) {
  const dependencies = options.dependencies;
  const config = dependencies?.config ?? readKnowledgeSyncRuntimeConfig(options.environment);
  if (config.contractV2 !== true)
    return { status: 'disabled', pageCount: 0, objects: 0, enqueued: 0, retracted: 0 };
  const objects = await (dependencies?.loadInventory ?? loadKnowledgeSyncManifestInventory)(config);
  const pages = buildKnowledgeSyncManifestPages(objects, {
    organizationId: config.organizationId,
    environment: config.environment,
    manifestId: options.manifestId ?? randomUUID(),
    sentAt: options.sentAt ?? new Date().toISOString(),
  });
  const delivery = { ...config, request: dependencies?.request ?? createFetchRequest() };
  let lastBody = '';
  for (const page of pages) {
    const response = await deliverClaimedKnowledgeSync(
      { id: page.eventId, eventId: page.eventId, rawBody: serializeKnowledgeSyncPackage(page) },
      delivery
    );
    lastBody = response.body;
  }
  const response = parseManifestResponse(lastBody);
  // SQL rechecks live read access/identity and captures current revision, without incrementing it.
  const enqueued = response.resend.length
    ? await (dependencies?.enqueueResend ?? enqueueKnowledgeSyncManifestResend)(
        config,
        response.resend
      )
    : 0;
  return {
    status: response.status,
    pageCount: pages.length,
    objects: objects.length,
    enqueued,
    retracted: response.retracted,
  };
}

export interface KnowledgeSyncReconcilerDependencies {
  config?: KnowledgeSyncRuntimeConfig;
  synchronizeCaptureGate?: typeof synchronizeKnowledgeSyncCaptureGate;
  runV2Reconciler?: typeof runSupabaseKnowledgeSyncV2Reconciler;
  sendManifest?: typeof runKnowledgeSyncManifest;
}

/** Dry-run remains the manual default; V2 always follows the invocation with a manifest. */
export async function runKnowledgeSyncReconciler(
  options: {
    apply?: boolean;
    environment?: NodeJS.ProcessEnv;
    dependencies?: KnowledgeSyncReconcilerDependencies;
  } = {}
) {
  const dependencies = options.dependencies;
  const config = dependencies?.config ?? readKnowledgeSyncRuntimeConfig(options.environment);
  await (dependencies?.synchronizeCaptureGate ?? synchronizeKnowledgeSyncCaptureGate)(config);
  if (config.contractV2 !== true)
    return reconcileCompletedKnowledgeObjects(createSupabaseReconcileRepository(config), options);
  try {
    return await (dependencies?.runV2Reconciler ?? runSupabaseKnowledgeSyncV2Reconciler)(
      config,
      options.apply === true
    );
  } finally {
    await (dependencies?.sendManifest ?? runKnowledgeSyncManifest)({ dependencies: { config } });
  }
}

export interface KnowledgeSyncSchedulerDependencies {
  synchronizeCaptureGate?: typeof synchronizeKnowledgeSyncCaptureGate;
  runBatch?: typeof runKnowledgeSyncDeliveryBatch;
  runReconciler?: typeof runKnowledgeSyncReconciler;
  timers?: KnowledgeSyncDeliverySchedulerOptions['timers'];
}

/** Capture mode is independent of delivery opt-in and is durable before any timer exists. */
export async function startKnowledgeSyncDeliveryScheduler(
  options: {
    environment?: NodeJS.ProcessEnv;
    intervalMs?: number;
    onCounters?(counters: KnowledgeSyncDeliveryCounters): void;
    onMaintenanceFailure?(error: unknown): void;
    dependencies?: KnowledgeSyncSchedulerDependencies;
  } = {}
): Promise<KnowledgeSyncDeliveryScheduler | null> {
  const environment = options.environment ?? process.env;
  const enabled = isKnowledgeSyncDeliverySchedulerEnabled(environment);
  const hasBinding = Boolean(
    environment.HELIXA_KNOWLEDGE_SYNC_BINDING_ID &&
      environment.HELIXA_KNOWLEDGE_SYNC_ORGANIZATION_ID &&
      environment.HELIXA_DESTINATION_BINDING_ID
  );
  if (!enabled && !isKnowledgeSyncContractV2Enabled(environment) && !hasBinding) return null;
  const dependencies = options.dependencies;
  if (!enabled) {
    await (dependencies?.synchronizeCaptureGate ?? synchronizeKnowledgeSyncCaptureGate)(
      readKnowledgeSyncBindingConfig(environment)
    );
    return null;
  }
  const config = readKnowledgeSyncRuntimeConfig(environment);
  await (dependencies?.synchronizeCaptureGate ?? synchronizeKnowledgeSyncCaptureGate)(config);
  const delivery = createKnowledgeSyncDeliveryScheduler({
    enabled: true,
    intervalMs: options.intervalMs,
    immediate: config.contractV2 === true,
    runBatch: () => (dependencies?.runBatch ?? runKnowledgeSyncDeliveryBatch)({ environment }),
    onCounters: options.onCounters ? counters => options.onCounters?.(counters) : undefined,
    timers: dependencies?.timers,
  });
  const maintenance =
    config.contractV2 === true
      ? createKnowledgeSyncMaintenanceScheduler({
          enabled: true,
          intervalMs: options.intervalMs,
          runMaintenance: async () => {
            if (!isKnowledgeSyncContractV2Enabled(environment)) return;
            await (dependencies?.runReconciler ?? runKnowledgeSyncReconciler)({
              apply: true,
              environment,
            });
          },
          onFailure: options.onMaintenanceFailure,
          timers: dependencies?.timers,
        })
      : null;
  delivery.start();
  maintenance?.start();
  return {
    start() {
      return false;
    },
    stop() {
      delivery.stop();
      maintenance?.stop();
    },
    isRunning() {
      return delivery.isRunning() || maintenance?.isRunning() === true;
    },
  };
}
