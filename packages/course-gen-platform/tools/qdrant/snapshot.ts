import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { QdrantClient } from '@qdrant/js-client-rest';
import {
  acquireRecoveryLock,
  assertSharedMetricsDirectory,
  buildSnapshotManifest,
  parseSnapshotStorageMode,
  renderRecoveryMetrics,
  resolvePhysicalCollection,
  selectRetentionDeletions,
  SNAPSHOT_MANIFEST_SCHEMA,
  writeAtomicText,
  type RecoveryMetricState,
  type SnapshotManifest,
} from './snapshot-recovery.js';

const CLIENT_VERSION = '1.18.0';

type SnapshotClient = Pick<
  QdrantClient,
  | 'getAliases'
  | 'getCollection'
  | 'versionInfo'
  | 'createSnapshot'
  | 'listSnapshots'
  | 'deleteSnapshot'
>;

export interface SnapshotOperationOptions {
  client: SnapshotClient;
  logicalAlias: string;
  qdrantUrl: string;
  apiKey: string;
  storageMode: 'local' | 's3';
  remotePrefix?: string;
  manifestDirectory: string;
  metricStatePath: string;
  metricsPath: string;
  failureDirectory: string;
  lockPath: string;
  now?: Date;
  retentionDays?: number;
  fetchSnapshot?: (input: string | URL, init?: RequestInit) => Promise<Response>;
  existingManifests?: SnapshotManifest[];
  lockAlreadyHeld?: boolean;
}

export interface SnapshotOperationResult {
  manifest: SnapshotManifest;
  manifestPath: string;
  deletedSnapshots: string[];
}

function initialMetrics(): RecoveryMetricState {
  return {
    snapshotFailuresTotal: 0,
    restoreFailuresTotal: 0,
    lockContentionsTotal: 0,
    lastOperationSuccess: false,
  };
}

async function readMetricState(path: string): Promise<RecoveryMetricState> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as Partial<RecoveryMetricState>;
    return { ...initialMetrics(), ...parsed };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return initialMetrics();
    throw error;
  }
}

async function persistMetrics(
  statePath: string,
  metricsPath: string,
  state: RecoveryMetricState
): Promise<void> {
  await writeAtomicText(statePath, `${JSON.stringify(state, null, 2)}\n`);
  await writeAtomicText(metricsPath, renderRecoveryMetrics(state), {
    mode: 0o644,
    createParent: false,
  });
}

function redactMessage(error: unknown, secrets: readonly string[]): string {
  let message = error instanceof Error ? error.message : String(error);
  for (const secret of secrets) {
    if (secret) message = message.split(secret).join('[REDACTED]');
  }
  return message.replace(/(api[_-]?key|secret|credential)=([^\s&]+)/giu, '$1=[REDACTED]');
}

async function readExistingManifests(directory: string): Promise<SnapshotManifest[]> {
  let entries: string[];
  try {
    entries = await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }

  const manifests: SnapshotManifest[] = [];
  for (const entry of entries.sort()) {
    if (!entry.endsWith('.json') || entry === 'latest-manifest.json') continue;
    try {
      const manifest = JSON.parse(
        await readFile(join(directory, entry), 'utf8')
      ) as SnapshotManifest;
      if (manifest.schema_version === SNAPSHOT_MANIFEST_SCHEMA && manifest.status === 'success') {
        manifests.push(manifest);
      }
    } catch {
      // An unrelated or incomplete JSON file is never eligible for retention.
    }
  }
  return manifests;
}

function snapshotDownloadUrl(qdrantUrl: string, physicalCollection: string, name: string): URL {
  const base = new URL(qdrantUrl);
  base.pathname = `/collections/${encodeURIComponent(physicalCollection)}/snapshots/${encodeURIComponent(name)}`;
  base.search = '';
  base.username = '';
  base.password = '';
  return base;
}

async function downloadAndChecksum(
  url: URL,
  apiKey: string,
  fetchSnapshot: (input: string | URL, init?: RequestInit) => Promise<Response>
): Promise<{ sha256: string; sizeBytes: number }> {
  const response = await fetchSnapshot(url, {
    method: 'GET',
    headers: { 'api-key': apiKey },
    redirect: 'error',
  });
  if (!response.ok) {
    throw new Error(`Authenticated snapshot download failed with HTTP ${response.status}`);
  }
  if (!response.body) throw new Error('Authenticated snapshot download returned no body');
  const hash = createHash('sha256');
  const reader = response.body.getReader();
  let sizeBytes = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    hash.update(chunk.value);
    sizeBytes += chunk.value.byteLength;
  }
  return { sha256: hash.digest('hex'), sizeBytes };
}

function artifactName(now: Date, snapshotName: string): string {
  const timestamp = now.toISOString().replace(/[:.]/gu, '-');
  return `${timestamp}-${basename(snapshotName)}.json`;
}

export async function runSnapshotOperation(
  options: SnapshotOperationOptions
): Promise<SnapshotOperationResult> {
  await assertSharedMetricsDirectory(dirname(options.metricsPath));
  const now = options.now ?? new Date();
  let state = await readMetricState(options.metricStatePath);
  let lock: Awaited<ReturnType<typeof acquireRecoveryLock>> | undefined;

  try {
    if (!options.lockAlreadyHeld) {
      try {
        lock = await acquireRecoveryLock(options.lockPath);
      } catch (error) {
        state = { ...state, lockContentionsTotal: state.lockContentionsTotal + 1 };
        await persistMetrics(options.metricStatePath, options.metricsPath, state);
        throw error;
      }
    }

    const aliases = (await options.client.getAliases()).aliases;
    const physicalCollection = resolvePhysicalCollection(aliases, options.logicalAlias);
    const info = await options.client.getCollection(physicalCollection);
    const serverVersion = (await options.client.versionInfo()).version;
    const created = await options.client.createSnapshot(physicalCollection, { wait: true });
    if (!created) throw new Error('Qdrant returned no snapshot description');

    const listed = await options.client.listSnapshots(physicalCollection);
    const confirmed = listed.find(candidate => candidate.name === created.name);
    if (!confirmed) throw new Error('Created snapshot was not returned by listSnapshots');

    const downloaded = await downloadAndChecksum(
      snapshotDownloadUrl(options.qdrantUrl, physicalCollection, confirmed.name),
      options.apiKey,
      options.fetchSnapshot ?? fetch
    );
    if (downloaded.sizeBytes !== confirmed.size) {
      throw new Error('Downloaded snapshot size does not match Qdrant metadata');
    }
    if (
      confirmed.checksum &&
      confirmed.checksum.toLowerCase() !== downloaded.sha256.toLowerCase()
    ) {
      throw new Error('Downloaded snapshot checksum does not match Qdrant metadata');
    }

    const manifest = buildSnapshotManifest({
      logicalAlias: options.logicalAlias,
      physicalCollection,
      snapshot: confirmed,
      pointCount: info.points_count ?? 0,
      createdAt: now,
      storageMode: options.storageMode,
      remotePrefix: options.remotePrefix,
      locallyVerifiedSha256: downloaded.sha256,
      serverVersion,
      clientVersion: CLIENT_VERSION,
    });
    const manifestPath = join(options.manifestDirectory, artifactName(now, manifest.snapshot_name));
    const serializedManifest = `${JSON.stringify(manifest, null, 2)}\n`;
    await writeAtomicText(manifestPath, serializedManifest);
    await writeAtomicText(
      join(options.manifestDirectory, 'latest-manifest.json'),
      serializedManifest
    );

    const previous =
      options.existingManifests ?? (await readExistingManifests(options.manifestDirectory));
    const deletions = selectRetentionDeletions([...previous, manifest], {
      now,
      retentionDays: options.retentionDays ?? 30,
      physicalCollection,
      storageMode: options.storageMode,
      ownedPrefix: options.remotePrefix,
    });
    const listedNames = new Set(listed.map(candidate => candidate.name));
    const deletedSnapshots: string[] = [];
    for (const snapshotName of deletions) {
      if (!listedNames.has(snapshotName)) continue;
      const deleted = await options.client.deleteSnapshot(physicalCollection, snapshotName, {
        wait: true,
      });
      if (!deleted) throw new Error(`Qdrant refused retention deletion for ${snapshotName}`);
      deletedSnapshots.push(snapshotName);
    }

    state = {
      ...state,
      lastOperationSuccess: true,
      lastSuccessfulSnapshotEpochSeconds: Math.floor(now.getTime() / 1000),
    };
    await persistMetrics(options.metricStatePath, options.metricsPath, state);
    return { manifest, manifestPath, deletedSnapshots };
  } catch (error) {
    state = {
      ...state,
      snapshotFailuresTotal: state.snapshotFailuresTotal + 1,
      lastOperationSuccess: false,
    };
    await persistMetrics(options.metricStatePath, options.metricsPath, state);
    const evidence = {
      schema_version: 'megacampus.qdrant.recovery-failure/v1',
      operation: 'snapshot',
      status: 'failed',
      occurred_at: now.toISOString(),
      error: redactMessage(error, [options.apiKey]),
    };
    await writeAtomicText(
      join(options.failureDirectory, `${now.toISOString().replace(/[:.]/gu, '-')}-snapshot.json`),
      `${JSON.stringify(evidence, null, 2)}\n`
    );
    throw new Error('Qdrant snapshot operation failed; redacted evidence was retained', {
      cause: error,
    });
  } finally {
    await lock?.release();
  }
}

async function readCredential(path: string): Promise<string> {
  const metadata = await stat(path);
  if (!metadata.isFile() || (metadata.mode & 0o077) !== 0) {
    throw new Error('Qdrant credential file must be a regular owner-only file');
  }
  const value = (await readFile(path, 'utf8')).trim();
  if (!value || /[\r\n]/u.test(value)) throw new Error('Qdrant credential file is invalid');
  return value;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function runCli(): Promise<void> {
  const qdrantUrl = requiredEnv('QDRANT_URL');
  const apiKey = await readCredential(requiredEnv('QDRANT_API_KEY_FILE'));
  const root =
    process.env.QDRANT_RECOVERY_STATE_DIR?.trim() || '/var/lib/megacampus-qdrant-recovery';
  const metricsDirectory = requiredEnv('QDRANT_METRICS_TEXTFILE_DIR');
  const storageMode = parseSnapshotStorageMode(process.env.QDRANT_SNAPSHOT_STORAGE_MODE);
  const remotePrefix =
    storageMode === 's3' ? requiredEnv('QDRANT_SNAPSHOT_OBJECT_PREFIX') : undefined;
  const client = new QdrantClient({
    url: qdrantUrl,
    apiKey,
    checkCompatibility: false,
    timeout: 60_000,
  });
  const result = await runSnapshotOperation({
    client,
    logicalAlias: process.env.QDRANT_COLLECTION_NAME?.trim() || 'course_embeddings',
    qdrantUrl,
    apiKey,
    storageMode,
    remotePrefix,
    manifestDirectory: join(root, 'manifests'),
    metricStatePath: join(root, 'metrics-state.json'),
    metricsPath: join(metricsDirectory, 'megacampus_qdrant_recovery.prom'),
    failureDirectory: join(root, 'failures'),
    lockPath:
      process.env.QDRANT_RECOVERY_LOCK_PATH?.trim() || '/run/lock/megacampus-qdrant-recovery.lock',
    lockAlreadyHeld: process.env.QDRANT_RECOVERY_LOCK_HELD === '1',
  });
  process.stdout.write(`${JSON.stringify(result.manifest)}\n`);
}

function isDirectExecution(): boolean {
  return (
    process.argv[1] !== undefined &&
    resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
  );
}

if (isDirectExecution()) {
  runCli().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Qdrant snapshot failed'}\n`);
    process.exitCode = 1;
  });
}
