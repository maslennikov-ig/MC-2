import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface HybridMetricsTextfileOptions {
  directory: string;
  service: string;
  instance: string;
}

interface HybridCounters {
  requests: number;
  fallbacks: number;
}

const SAFE_COMPONENT = /^[A-Za-z0-9_.-]+$/;
const updateQueues = new Map<string, Promise<void>>();

function requireSafeComponent(value: string, field: 'service' | 'instance'): string {
  if (!SAFE_COMPONENT.test(value)) {
    throw new Error(
      `Qdrant metrics ${field} must contain only letters, numbers, dot, dash or underscore`
    );
  }
  return value;
}

function resolveOptions(
  override?: HybridMetricsTextfileOptions
): HybridMetricsTextfileOptions | undefined {
  if (override) return override;
  const directory = process.env.QDRANT_METRICS_TEXTFILE_DIR;
  if (!directory) return undefined;
  return {
    directory,
    service: process.env.QDRANT_METRICS_SERVICE ?? 'application',
    instance: process.env.QDRANT_METRICS_INSTANCE ?? process.env.HOSTNAME ?? 'unknown',
  };
}

function parseCounter(exposition: string, metric: string): number {
  const match = exposition.match(new RegExp(`^${metric}\\{[^}]*\\} ([0-9]+)$`, 'm'));
  if (!match) return 0;
  const value = Number(match[1]);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid persisted ${metric} value`);
  }
  return value;
}

async function readCounters(path: string): Promise<HybridCounters> {
  try {
    const exposition = await readFile(path, 'utf8');
    return {
      requests: parseCounter(exposition, 'megacampus_qdrant_hybrid_requests_total'),
      fallbacks: parseCounter(exposition, 'megacampus_qdrant_hybrid_fallback_total'),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { requests: 0, fallbacks: 0 };
    throw error;
  }
}

function renderCounters(service: string, instance: string, counters: HybridCounters): string {
  const labels = `service="${service}",instance="${instance}"`;
  return [
    '# HELP megacampus_qdrant_hybrid_requests_total Hybrid Qdrant search attempts.',
    '# TYPE megacampus_qdrant_hybrid_requests_total counter',
    `megacampus_qdrant_hybrid_requests_total{${labels}} ${counters.requests}`,
    '# HELP megacampus_qdrant_hybrid_fallback_total Hybrid Qdrant searches degraded to dense-only.',
    '# TYPE megacampus_qdrant_hybrid_fallback_total counter',
    `megacampus_qdrant_hybrid_fallback_total{${labels}} ${counters.fallbacks}`,
    '',
  ].join('\n');
}

async function update(path: string, options: HybridMetricsTextfileOptions, fallbackUsed: boolean) {
  await mkdir(options.directory, { recursive: true, mode: 0o750 });
  const counters = await readCounters(path);
  counters.requests += 1;
  if (fallbackUsed) counters.fallbacks += 1;

  const temporaryPath = join(options.directory, `.${randomUUID()}.prom.tmp`);
  try {
    await writeFile(temporaryPath, renderCounters(options.service, options.instance, counters), {
      encoding: 'utf8',
      mode: 0o644,
      flag: 'wx',
    });
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

/** Persist one hybrid search outcome for node_exporter's textfile collector. */
export async function recordHybridSearchOutcome(
  fallbackUsed: boolean,
  override?: HybridMetricsTextfileOptions
): Promise<void> {
  const options = resolveOptions(override);
  if (!options) return;

  const service = requireSafeComponent(options.service, 'service');
  const instance = requireSafeComponent(options.instance, 'instance');
  const normalized = { ...options, service, instance };
  const path = join(options.directory, `${service}-${instance}.prom`);

  const previous = updateQueues.get(path) ?? Promise.resolve();
  const current = previous.then(() => update(path, normalized, fallbackUsed));
  updateQueues.set(path, current);
  try {
    await current;
  } finally {
    if (updateQueues.get(path) === current) updateQueues.delete(path);
  }
}
