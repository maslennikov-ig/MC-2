import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmod, mkdir, open, rename } from 'node:fs/promises';
import { dirname } from 'node:path';

export const SNAPSHOT_MANIFEST_SCHEMA = 'megacampus.qdrant.snapshot-manifest/v1' as const;

interface AliasDescription {
  alias_name: string;
  collection_name: string;
}

export interface SnapshotDescription {
  name: string;
  creation_time?: string | null;
  size: number;
  checksum?: string | null;
}

export interface SnapshotManifest {
  schema_version: typeof SNAPSHOT_MANIFEST_SCHEMA;
  status: 'success';
  logical_alias: string;
  physical_collection: string;
  snapshot_name: string;
  point_count: number;
  size_bytes: number;
  server_checksum?: string;
  sha256?: string;
  created_at: string;
  storage_mode: 'local' | 's3';
  remote_object: string;
  server_version: string;
  client_version: string;
}

export function resolvePhysicalCollection(
  aliases: readonly AliasDescription[],
  logicalAlias: string
): string {
  const matches = aliases.filter(candidate => candidate.alias_name === logicalAlias);
  if (matches.length !== 1) {
    throw new Error(
      `Alias ${logicalAlias} must resolve to exactly one physical collection; found ${matches.length}`
    );
  }
  return matches[0].collection_name;
}

function requireSafeName(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || /[\r\n\0]/u.test(normalized)) {
    throw new Error(`${label} is invalid`);
  }
  return normalized;
}

function normalizeRemotePrefix(prefix: string): string {
  const normalized = prefix.trim().replace(/^\/+|\/+$/gu, '');
  if (
    !normalized ||
    normalized.includes('..') ||
    normalized.includes('://') ||
    /[?#@\r\n\0]/u.test(normalized)
  ) {
    throw new Error('remotePrefix must be a sanitized object prefix without credentials');
  }
  return normalized;
}

export function buildSnapshotManifest(input: {
  logicalAlias: string;
  physicalCollection: string;
  snapshot: SnapshotDescription;
  pointCount: number;
  createdAt: Date;
  storageMode: 'local' | 's3';
  remotePrefix: string;
  locallyVerifiedSha256?: string;
  serverVersion: string;
  clientVersion: string;
}): SnapshotManifest {
  const snapshotName = requireSafeName(input.snapshot.name, 'snapshot name');
  const remotePrefix = normalizeRemotePrefix(input.remotePrefix);
  if (!Number.isSafeInteger(input.pointCount) || input.pointCount < 0) {
    throw new Error('pointCount must be a non-negative safe integer');
  }
  if (!Number.isSafeInteger(input.snapshot.size) || input.snapshot.size < 0) {
    throw new Error('snapshot size must be a non-negative safe integer');
  }
  if (
    input.locallyVerifiedSha256 !== undefined &&
    !/^[a-f0-9]{64}$/u.test(input.locallyVerifiedSha256)
  ) {
    throw new Error('locallyVerifiedSha256 must be a lowercase SHA-256 digest');
  }

  return {
    schema_version: SNAPSHOT_MANIFEST_SCHEMA,
    status: 'success',
    logical_alias: requireSafeName(input.logicalAlias, 'logical alias'),
    physical_collection: requireSafeName(input.physicalCollection, 'physical collection'),
    snapshot_name: snapshotName,
    point_count: input.pointCount,
    size_bytes: input.snapshot.size,
    ...(input.snapshot.checksum ? { server_checksum: input.snapshot.checksum } : {}),
    ...(input.locallyVerifiedSha256 ? { sha256: input.locallyVerifiedSha256 } : {}),
    created_at: input.createdAt.toISOString(),
    storage_mode: input.storageMode,
    remote_object: `${remotePrefix}/${snapshotName}`,
    server_version: requireSafeName(input.serverVersion, 'server version'),
    client_version: requireSafeName(input.clientVersion, 'client version'),
  };
}

export function selectRetentionDeletions(
  manifests: readonly SnapshotManifest[],
  options: {
    now: Date;
    retentionDays: number;
    physicalCollection: string;
    ownedPrefix: string;
  }
): string[] {
  if (!Number.isSafeInteger(options.retentionDays) || options.retentionDays < 1) {
    throw new Error('retentionDays must be a positive integer');
  }
  const prefix = normalizeRemotePrefix(options.ownedPrefix) + '/';
  const eligible = manifests
    .filter(
      manifest =>
        manifest.schema_version === SNAPSHOT_MANIFEST_SCHEMA &&
        manifest.status === 'success' &&
        manifest.physical_collection === options.physicalCollection &&
        manifest.remote_object.startsWith(prefix)
    )
    .sort(
      (left, right) =>
        Date.parse(left.created_at) - Date.parse(right.created_at) ||
        left.snapshot_name.localeCompare(right.snapshot_name)
    );

  if (eligible.length <= 1) return [];
  const newest = eligible.at(-1)!.snapshot_name;
  const cutoff = options.now.getTime() - options.retentionDays * 24 * 60 * 60 * 1000;

  return eligible
    .filter(
      manifest => manifest.snapshot_name !== newest && Date.parse(manifest.created_at) < cutoff
    )
    .map(manifest => manifest.snapshot_name);
}

export interface RecoveryMetricState {
  snapshotFailuresTotal: number;
  restoreFailuresTotal: number;
  lockContentionsTotal: number;
  lastOperationSuccess: boolean;
  lastSuccessfulSnapshotEpochSeconds?: number;
  lastSuccessfulRestoreDrillEpochSeconds?: number;
}

function metric(name: string, value: number): string {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be non-negative`);
  return `${name} ${value}`;
}

export function renderRecoveryMetrics(state: RecoveryMetricState): string {
  return [
    '# HELP megacampus_qdrant_snapshot_failures_total Failed snapshot operations.',
    '# TYPE megacampus_qdrant_snapshot_failures_total counter',
    metric('megacampus_qdrant_snapshot_failures_total', state.snapshotFailuresTotal),
    '# HELP megacampus_qdrant_restore_drill_failures_total Failed restore drill operations.',
    '# TYPE megacampus_qdrant_restore_drill_failures_total counter',
    metric('megacampus_qdrant_restore_drill_failures_total', state.restoreFailuresTotal),
    '# HELP megacampus_qdrant_recovery_lock_contentions_total Rejected overlapping recovery runs.',
    '# TYPE megacampus_qdrant_recovery_lock_contentions_total counter',
    metric('megacampus_qdrant_recovery_lock_contentions_total', state.lockContentionsTotal),
    '# HELP megacampus_qdrant_recovery_last_operation_success Whether the latest operation succeeded.',
    '# TYPE megacampus_qdrant_recovery_last_operation_success gauge',
    metric('megacampus_qdrant_recovery_last_operation_success', state.lastOperationSuccess ? 1 : 0),
    ...(state.lastSuccessfulSnapshotEpochSeconds === undefined
      ? []
      : [
          '# HELP megacampus_qdrant_last_successful_snapshot_unixtime_seconds Last successful snapshot time.',
          '# TYPE megacampus_qdrant_last_successful_snapshot_unixtime_seconds gauge',
          metric(
            'megacampus_qdrant_last_successful_snapshot_unixtime_seconds',
            state.lastSuccessfulSnapshotEpochSeconds
          ),
        ]),
    ...(state.lastSuccessfulRestoreDrillEpochSeconds === undefined
      ? []
      : [
          '# HELP megacampus_qdrant_last_successful_restore_drill_unixtime_seconds Last successful restore drill time.',
          '# TYPE megacampus_qdrant_last_successful_restore_drill_unixtime_seconds gauge',
          metric(
            'megacampus_qdrant_last_successful_restore_drill_unixtime_seconds',
            state.lastSuccessfulRestoreDrillEpochSeconds
          ),
        ]),
    '',
  ].join('\n');
}

export async function writeAtomicText(targetPath: string, content: string): Promise<void> {
  const directory = dirname(targetPath);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporaryPath = `${targetPath}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temporaryPath, 'wx', 0o600);
  try {
    await handle.writeFile(content, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporaryPath, targetPath);
  await chmod(targetPath, 0o600);
}

export interface RecoveryLock {
  release(): Promise<void>;
}

export async function acquireRecoveryLock(lockPath: string): Promise<RecoveryLock> {
  await mkdir(dirname(lockPath), { recursive: true, mode: 0o700 });
  const handle = await open(lockPath, 'a', 0o600);
  const result = spawnSync('/usr/bin/flock', ['--nonblock', '3'], {
    stdio: ['ignore', 'ignore', 'pipe', handle.fd],
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    await handle.close();
    throw new Error('Qdrant recovery operation is already running');
  }

  let released = false;
  return {
    async release() {
      if (released) return;
      released = true;
      await handle.close();
    },
  };
}
