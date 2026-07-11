import { randomUUID } from 'node:crypto';
import {
  chmod,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  rmdir,
  stat,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export interface DocumentEvidenceTextfileOptions {
  directory: string;
  service: string;
  instance: string;
}

type ProcessingMode =
  | 'full_text'
  | 'hierarchical_summary'
  | 'summary'
  | 'targeted_retrieval'
  | 'metadata_only';

type Stage4Event = {
  stage: 'stage4';
  status: 'accepted' | 'failed';
  mode: 'shadow' | 'active';
  runDelta: 0 | 1;
  observedAtUnixMilliseconds: number;
  coverage: { source: number; assessed: number; degraded: number; failed: number };
  documentDeltas: { source: number; assessed: number; degraded: number; failed: number };
  processingModes: Record<ProcessingMode, number>;
  batches: number;
  inputTokens: number;
  outputTokens: number;
  modelCalls: number;
  costUsd: number;
  durationSeconds: number;
  conflicts: { critical: number; important: number; informational: number };
  decisions?: { user: number; system: number; degradedAutomatic: number };
  criticalConflictState?: {
    unresolved: number;
    oldestUnixSeconds: number;
    observedAtUnixMilliseconds: number;
  };
};

type Stage5Event = {
  stage: 'stage5';
  status:
    | 'not_applicable'
    | 'applied'
    | 'no_relevant_evidence'
    | 'degraded'
    | 'failed_open_with_decision';
  retrievals: number;
  fallbacks: number;
};

type Stage6Event = {
  stage: 'stage6';
  status: 'success' | 'empty' | 'cached' | 'fallback' | 'failed';
  retrievals?: number;
  fallbacks?: number;
};

export type DocumentEvidenceMetricEvent = Stage4Event | Stage5Event | Stage6Event;

const SAFE_COMPONENT = /^[A-Za-z0-9_.-]+$/u;
const PROCESSING_MODES: ProcessingMode[] = [
  'full_text',
  'hierarchical_summary',
  'summary',
  'targeted_retrieval',
  'metadata_only',
];
const STAGE5_STATUSES = new Set<Stage5Event['status']>([
  'not_applicable',
  'applied',
  'no_relevant_evidence',
  'degraded',
  'failed_open_with_decision',
]);
const STAGE6_STATUSES = new Set<Stage6Event['status']>([
  'success',
  'empty',
  'cached',
  'fallback',
  'failed',
]);
const updateQueues = new Map<string, Promise<void>>();

type MetricState = Map<string, number>;

function requireSafeComponent(value: string, field: 'service' | 'instance'): string {
  if (!SAFE_COMPONENT.test(value) || value.length > 64) {
    throw new Error(`Evidence metrics ${field} contains an unsafe component`);
  }
  return value;
}

function resolveOptions(
  override?: DocumentEvidenceTextfileOptions
): DocumentEvidenceTextfileOptions | undefined {
  if (override) return override;
  const directory = process.env.QDRANT_METRICS_TEXTFILE_DIR;
  if (!directory) return undefined;
  return {
    directory,
    service: process.env.QDRANT_METRICS_SERVICE ?? 'application',
    instance: process.env.QDRANT_METRICS_INSTANCE ?? 'unknown',
  };
}

function requireCount(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Evidence metrics ${field} must be a non-negative safe integer`);
  }
  return value;
}

function requireNumber(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Evidence metrics ${field} must be a non-negative finite number`);
  }
  return value;
}

function labels(values: Record<string, string>): string {
  return `{${Object.entries(values)
    .map(([key, value]) => `${key}="${value}"`)
    .join(',')}}`;
}

function key(name: string, metricLabels?: Record<string, string>): string {
  return `${name}${metricLabels ? labels(metricLabels) : ''}`;
}

function increment(state: MetricState, metric: string, value: number): void {
  state.set(metric, (state.get(metric) ?? 0) + value);
}

function stripBaseLabels(metric: string, service: string, instance: string): string {
  const opening = metric.indexOf('{');
  const expected = `{service="${service}",instance="${instance}"`;
  if (opening < 0 || !metric.startsWith(expected, opening)) {
    throw new Error('Persisted document evidence metric has unexpected base labels');
  }
  const name = metric.slice(0, opening);
  const remainder = metric.slice(opening + expected.length);
  if (remainder === '}') return name;
  if (!remainder.startsWith(',')) {
    throw new Error('Persisted document evidence metric has malformed base labels');
  }
  return `${name}{${remainder.slice(1)}`;
}

function parseExposition(exposition: string, service: string, instance: string): MetricState {
  const state: MetricState = new Map();
  for (const line of exposition.split('\n')) {
    if (!line.startsWith('megacampus_document_evidence_')) continue;
    const separator = line.lastIndexOf(' ');
    if (separator < 1) throw new Error('Invalid persisted document evidence metric');
    const value = Number(line.slice(separator + 1));
    if (!Number.isFinite(value) || value < 0) {
      throw new Error('Invalid persisted document evidence metric value');
    }
    state.set(stripBaseLabels(line.slice(0, separator), service, instance), value);
  }
  return state;
}

async function readState(
  path: string,
  options: DocumentEvidenceTextfileOptions
): Promise<MetricState> {
  try {
    return parseExposition(await readFile(path, 'utf8'), options.service, options.instance);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Map();
    throw error;
  }
}

function applyStage4(state: MetricState, event: Stage4Event): void {
  if (event.status !== 'accepted' && event.status !== 'failed') {
    throw new Error('Evidence metrics Stage 4 status is not allowlisted');
  }
  if (event.mode !== 'shadow' && event.mode !== 'active') {
    throw new Error('Evidence metrics Stage 4 mode is not allowlisted');
  }
  const source = requireCount(event.coverage.source, 'source count');
  const assessed = requireCount(event.coverage.assessed, 'assessed count');
  const degraded = requireCount(event.coverage.degraded, 'degraded count');
  const failed = requireCount(event.coverage.failed, 'failed count');
  const covered = assessed + degraded + failed;
  if (covered > source || (event.status === 'accepted' && covered !== source)) {
    throw new Error('Evidence metrics coverage must be exact');
  }

  const runDelta = requireCount(event.runDelta, 'run delta');
  if (runDelta > 1) throw new Error('Evidence metrics run delta must be zero or one');
  increment(
    state,
    key('megacampus_document_evidence_runs_total', {
      stage: 'stage4',
      status: event.status,
    }),
    runDelta
  );
  increment(
    state,
    key('megacampus_document_evidence_run_mode_total', { mode: event.mode }),
    runDelta
  );
  for (const [outcome, value] of [
    ['source', event.documentDeltas.source],
    ['assessed', event.documentDeltas.assessed],
    ['degraded', event.documentDeltas.degraded],
    ['failed', event.documentDeltas.failed],
  ] as const) {
    increment(
      state,
      key('megacampus_document_evidence_documents_total', { outcome }),
      requireCount(value, `${outcome} document delta`)
    );
  }
  for (const mode of PROCESSING_MODES) {
    increment(
      state,
      key('megacampus_document_evidence_processing_mode_total', { mode }),
      requireCount(event.processingModes[mode], `${mode} count`)
    );
  }
  increment(
    state,
    'megacampus_document_evidence_batches_total',
    requireCount(event.batches, 'batches')
  );
  increment(
    state,
    key('megacampus_document_evidence_tokens_total', { direction: 'input' }),
    requireCount(event.inputTokens, 'input tokens')
  );
  increment(
    state,
    key('megacampus_document_evidence_tokens_total', { direction: 'output' }),
    requireCount(event.outputTokens, 'output tokens')
  );
  increment(
    state,
    'megacampus_document_evidence_model_calls_total',
    requireCount(event.modelCalls, 'model calls')
  );
  increment(
    state,
    'megacampus_document_evidence_cost_usd_total',
    requireNumber(event.costUsd, 'cost')
  );
  increment(
    state,
    'megacampus_document_evidence_duration_seconds_total',
    requireNumber(event.durationSeconds, 'duration')
  );
  for (const severity of ['critical', 'important', 'informational'] as const) {
    increment(
      state,
      key('megacampus_document_evidence_conflicts_total', { severity }),
      requireCount(event.conflicts[severity], `${severity} conflicts`)
    );
  }
  state.delete(key('megacampus_document_evidence_decisions_total', { actor: 'user' }));
  state.delete(key('megacampus_document_evidence_decisions_total', { actor: 'system' }));
  state.delete('megacampus_document_evidence_degraded_automatic_decisions_total');
}

function applyStage5(state: MetricState, event: Stage5Event): void {
  if (!STAGE5_STATUSES.has(event.status)) {
    throw new Error('Evidence metrics Stage 5 status is not allowlisted');
  }
  increment(
    state,
    key('megacampus_document_evidence_stage5_outcomes_total', { status: event.status }),
    1
  );
  increment(
    state,
    key('megacampus_document_evidence_retrieval_total', {
      stage: 'stage5',
      outcome: 'request',
    }),
    requireCount(event.retrievals, 'Stage 5 retrievals')
  );
  increment(
    state,
    key('megacampus_document_evidence_retrieval_total', {
      stage: 'stage5',
      outcome: 'fallback',
    }),
    requireCount(event.fallbacks, 'Stage 5 fallbacks')
  );
}

function applyStage6(state: MetricState, event: Stage6Event): void {
  if (!STAGE6_STATUSES.has(event.status)) {
    throw new Error('Evidence metrics Stage 6 status is not allowlisted');
  }
  increment(
    state,
    key('megacampus_document_evidence_stage6_outcomes_total', { status: event.status }),
    1
  );
  increment(
    state,
    key('megacampus_document_evidence_retrieval_total', {
      stage: 'stage6',
      outcome: 'request',
    }),
    requireCount(event.retrievals ?? 1, 'Stage 6 retrievals')
  );
  increment(
    state,
    key('megacampus_document_evidence_retrieval_total', {
      stage: 'stage6',
      outcome: 'fallback',
    }),
    requireCount(event.fallbacks ?? (event.status === 'fallback' ? 1 : 0), 'Stage 6 fallbacks')
  );
}

function applyEvent(state: MetricState, event: DocumentEvidenceMetricEvent): void {
  if (event.stage === 'stage4') applyStage4(state, event);
  else if (event.stage === 'stage5') applyStage5(state, event);
  else if (event.stage === 'stage6') applyStage6(state, event);
  else throw new Error('Evidence metrics stage is not allowlisted');
}

function addBaseLabels(metric: string, service: string, instance: string): string {
  const opening = metric.indexOf('{');
  const base = `service="${service}",instance="${instance}"`;
  if (opening < 0) return `${metric}{${base}}`;
  return `${metric.slice(0, opening + 1)}${base},${metric.slice(opening + 1)}`;
}

function render(state: MetricState, service: string, instance: string): string {
  return `${[...state.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([metric, value]) => `${addBaseLabels(metric, service, instance)} ${value}`)
    .join('\n')}\n`;
}

async function update(
  path: string,
  options: DocumentEvidenceTextfileOptions,
  event: DocumentEvidenceMetricEvent
): Promise<void> {
  const lock = await acquireOwnedLock(`${path}.lock`);
  try {
    await lock.heartbeat();
    const state = await readState(path, options);
    applyEvent(state, event);
    await lock.write(path, render(state, options.service, options.instance), 0o644);
  } finally {
    await lock.release();
  }
}

interface OwnedLockOptions {
  staleAfterMilliseconds?: number;
  maxAttempts?: number;
}

interface OwnedLock {
  ownerPath: string;
  assertOwned(): Promise<void>;
  heartbeat(): Promise<void>;
  write(path: string, content: string, mode: number): Promise<void>;
  release(): Promise<void>;
}

async function acquireOwnedLock(
  path: string,
  options: OwnedLockOptions = {}
): Promise<OwnedLock> {
  const staleAfterMilliseconds = options.staleAfterMilliseconds ?? 30_000;
  const maxAttempts = options.maxAttempts ?? 400;
  const token = randomUUID();
  const ownerName = `owner-${token}`;
  const ownerPath = join(path, ownerName);
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const acquirePath = `${path}.acquire-${token}`;
    try {
      await mkdir(acquirePath, { mode: 0o700 });
      await writeFile(join(acquirePath, ownerName), token, { mode: 0o600, flag: 'wx' });
      await rename(acquirePath, path);
      const assertOwned = async (): Promise<void> => {
        try {
          await stat(ownerPath);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            throw new Error('Evidence metrics lock ownership was fenced');
          }
          throw error;
        }
      };
      return {
        ownerPath,
        assertOwned,
        async heartbeat() {
          await assertOwned();
          const now = new Date();
          await utimes(ownerPath, now, now);
        },
        async write(targetPath, content, mode) {
          const temporaryPath = join(
            dirname(targetPath),
            `.${randomUUID()}.evidence.prom.tmp`
          );
          try {
            await writeFile(temporaryPath, content, { encoding: 'utf8', mode, flag: 'wx' });
            await chmod(temporaryPath, mode);
            await assertOwned();
            await rename(temporaryPath, targetPath);
          } finally {
            await rm(temporaryPath, { force: true });
          }
        },
        async release() {
          try {
            await rm(ownerPath);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
            throw error;
          }
          try {
            await rmdir(path);
          } catch (error) {
            if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes((error as NodeJS.ErrnoException).code ?? '')) {
              throw error;
            }
          }
        },
      };
    } catch (error) {
      await rm(acquirePath, { recursive: true, force: true });
      if (!['EEXIST', 'ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code ?? '')) {
        throw error;
      }
      try {
        const owners = (await readdir(path)).filter(name => name.startsWith('owner-'));
        if (owners.length === 0) {
          await delay(10);
          continue;
        }
        if (owners.length !== 1) throw new Error('Evidence metrics lock has invalid ownership');
        const details = await stat(join(path, owners[0]));
        if (Date.now() - details.mtimeMs > staleAfterMilliseconds) {
          const stalePath = `${path}.stale-${randomUUID()}`;
          await rename(path, stalePath);
          await rm(stalePath, { recursive: true, force: true });
        }
      } catch (statError) {
        if ((statError as NodeJS.ErrnoException).code !== 'ENOENT') throw statError;
      }
      await delay(10);
    }
  }
  throw new Error('Evidence metrics owned lock is unavailable');
}

async function updateStage4Aggregate(
  options: DocumentEvidenceTextfileOptions,
  event: Stage4Event
): Promise<void> {
  const aggregateOptions = { ...options, service: 'stage4', instance: 'aggregate' };
  const path = join(options.directory, 'evidence-stage4-state.prom');
  const lockPath = join(options.directory, '.evidence-stage4-state.lock');
  const lock = await acquireOwnedLock(lockPath);
  try {
    await lock.heartbeat();
    const state = await readState(path, aggregateOptions);
    const coverageObservedAt = requireNumber(
      event.observedAtUnixMilliseconds,
      'Stage 4 coverage reconciliation time'
    );
    const priorCoverageObservedAt =
      state.get('megacampus_document_evidence_coverage_reconciliation_unixtime_milliseconds') ?? 0;
    if (coverageObservedAt > priorCoverageObservedAt) {
      const covered = event.coverage.assessed + event.coverage.degraded + event.coverage.failed;
      state.set(
        'megacampus_document_evidence_coverage_ratio',
        event.coverage.source === 0 ? 1 : covered / event.coverage.source
      );
      state.set(
        'megacampus_document_evidence_coverage_reconciliation_unixtime_milliseconds',
        coverageObservedAt
      );
    }
    if (event.decisions) {
      for (const actor of ['user', 'system'] as const) {
        const metric = key('megacampus_document_evidence_decisions_total', { actor });
        state.set(
          metric,
          Math.max(
            state.get(metric) ?? 0,
            requireCount(event.decisions[actor], `${actor} durable decision total`)
          )
        );
      }
      const degradedMetric = 'megacampus_document_evidence_degraded_automatic_decisions_total';
      state.set(
        degradedMetric,
        Math.max(
          state.get(degradedMetric) ?? 0,
          requireCount(
            event.decisions.degradedAutomatic,
            'degraded automatic durable decision total'
          )
        )
      );
    }
    const reconciliation = event.criticalConflictState;
    if (reconciliation) {
      const observedAt = requireNumber(
        reconciliation.observedAtUnixMilliseconds,
        'critical conflict reconciliation time'
      );
      const priorObservedAt =
        state.get('megacampus_document_evidence_critical_reconciliation_unixtime_milliseconds') ??
        0;
      if (observedAt > priorObservedAt) {
        const unresolved = requireCount(reconciliation.unresolved, 'unresolved critical conflicts');
        const oldest = requireCount(
          reconciliation.oldestUnixSeconds,
          'oldest unresolved critical timestamp'
        );
        if ((unresolved === 0) !== (oldest === 0)) {
          throw new Error('Evidence metrics critical conflict reconciliation is inconsistent');
        }
        state.set('megacampus_document_evidence_unresolved_critical_conflicts', unresolved);
        state.set(
          'megacampus_document_evidence_oldest_unresolved_critical_unixtime_seconds',
          oldest
        );
        state.set(
          'megacampus_document_evidence_critical_reconciliation_unixtime_milliseconds',
          observedAt
        );
      }
    }
    await lock.write(path, render(state, aggregateOptions.service, aggregateOptions.instance), 0o644);
  } finally {
    await lock.release();
  }
}

/** Publish one bounded evidence outcome into the accepted node_exporter textfile directory. */
export async function publishDocumentEvidenceMetrics(
  event: DocumentEvidenceMetricEvent,
  override?: DocumentEvidenceTextfileOptions
): Promise<void> {
  const options = resolveOptions(override);
  if (!options) return;
  const service = requireSafeComponent(options.service, 'service');
  const instance = requireSafeComponent(options.instance, 'instance');
  const normalized = { ...options, service, instance };
  const path = join(options.directory, `evidence-${service}-${instance}.prom`);
  const previous = updateQueues.get(path) ?? Promise.resolve();
  const current = previous.then(() => update(path, normalized, event));
  updateQueues.set(path, current);
  try {
    await current;
  } finally {
    if (updateQueues.get(path) === current) updateQueues.delete(path);
  }
  if (event.stage === 'stage4') {
    await updateStage4Aggregate(normalized, event);
  }
}

/** Keep product work available when the optional textfile sink cannot be updated. */
export async function publishDocumentEvidenceMetricsSafely(
  event: DocumentEvidenceMetricEvent,
  logger: { warn(value: Record<string, never>, message: string): void },
  override?: DocumentEvidenceTextfileOptions
): Promise<void> {
  try {
    await publishDocumentEvidenceMetrics(event, override);
  } catch {
    logger.warn({}, 'Document evidence metrics update failed');
  }
}

export const documentEvidenceTextfileTesting = { acquireOwnedLock };
