import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../../../../..');
const BASE = 'deploy/qdrant-offhost-backup';
const VALIDATOR = resolve(ROOT, BASE, 'qdrant-offhost-validate.py');
const temporaryDirectories: string[] = [];

function source(path: string): string {
  return readFileSync(resolve(ROOT, path), 'utf8');
}

function temporaryDirectory(): string {
  const directory = mkdtempSync('/tmp/mc2-qdrant-offhost-');
  temporaryDirectories.push(directory);
  return directory;
}

function createGeneration(options: { tampered?: boolean } = {}): string {
  const directory = temporaryDirectory();
  const snapshotName = 'course_embeddings_v1-test.snapshot';
  const snapshot = Buffer.from(options.tampered ? 'altered snapshot' : 'verified snapshot');
  const expected = Buffer.from('verified snapshot');
  writeFileSync(join(directory, snapshotName), snapshot, { mode: 0o600 });
  const manifest = {
    schema_version: 'megacampus.qdrant.snapshot-manifest/v1',
    status: 'success',
    logical_alias: 'course_embeddings',
    physical_collection: 'course_embeddings_v1',
    snapshot_name: snapshotName,
    point_count: 13_712,
    size_bytes: expected.byteLength,
    sha256: createHash('sha256').update(expected).digest('hex'),
    created_at: '2026-08-09T04:00:00.000Z',
    storage_mode: 'local',
    server_version: '1.18.2',
    client_version: '1.18.0',
  };
  writeFileSync(join(directory, 'latest-manifest.json'), `${JSON.stringify(manifest)}\n`, {
    mode: 0o600,
  });
  chmodSync(directory, 0o700);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('off-host Qdrant backup contract', () => {
  it('validates an exact fresh generation and rejects changed snapshot bytes', () => {
    const good = spawnSync(
      'python3',
      [
        VALIDATOR,
        'verify',
        '--generation',
        createGeneration(),
        '--now',
        '2026-08-09T06:00:00Z',
        '--max-age-seconds',
        '28800',
      ],
      { encoding: 'utf8' }
    );
    expect(good.status, good.stderr).toBe(0);
    expect(JSON.parse(good.stdout)).toMatchObject({
      point_count: 13_712,
      server_version: '1.18.2',
      size_bytes: 17,
    });

    const changed = spawnSync(
      'python3',
      [
        VALIDATOR,
        'verify',
        '--generation',
        createGeneration({ tampered: true }),
        '--now',
        '2026-08-09T06:00:00Z',
        '--max-age-seconds',
        '28800',
      ],
      { encoding: 'utf8' }
    );
    expect(changed.status).not.toBe(0);
    expect(changed.stderr).toMatch(/size|sha-256/iu);
  });

  it('uses a restricted pull credential and never copies a Qdrant API key off-host', () => {
    const exporter = source(`${BASE}/source-command.sh`);
    const backup = source(`${BASE}/megacampus-qdrant-offhost-backup.sh`);

    expect(exporter).toContain('SSH_ORIGINAL_COMMAND');
    expect(exporter).toContain('CONTAINER=megacampus-qdrant');
    expect(exporter).toContain('/usr/bin/docker inspect "$CONTAINER"');
    expect(exporter).toContain('latest-manifest.json');
    expect(exporter).toContain('metadata | export\\ [0-9]*\\ [a-f0-9]*');
    expect(exporter).toContain('publish-backup');
    expect(exporter).toContain('publish-restore');
    expect(exporter).toContain('flock -n');
    expect(exporter).toContain('/usr/bin/nice -n 15');
    expect(exporter).toContain('/usr/bin/ionice -c 3');
    expect(exporter).toContain('/usr/bin/chown root:root "$temporary"');
    expect(exporter).not.toMatch(/cat .*qdrant.*api.*key/iu);
    expect(backup).toContain('BatchMode=yes');
    expect(backup).toContain('StrictHostKeyChecking=yes');
    expect(backup).toContain('UserKnownHostsFile="$KNOWN_HOSTS"');
    expect(backup).not.toMatch(/QDRANT_(?:API_KEY|S3_)/u);
  });

  it('bounds destination storage and load and keeps backup and restore schedules apart', () => {
    const backup = source(`${BASE}/megacampus-qdrant-offhost-backup.sh`);
    const backupService = source(`${BASE}/megacampus-qdrant-offhost-backup.service`);
    const backupTimer = source(`${BASE}/megacampus-qdrant-offhost-backup.timer`);
    const restoreService = source(`${BASE}/megacampus-qdrant-offhost-restore.service`);
    const restoreTimer = source(`${BASE}/megacampus-qdrant-offhost-restore.timer`);

    expect(backup).toContain('KEEP="${KEEP:-14}"');
    expect(backup).toContain('RETENTION_DAYS="${RETENTION_DAYS:-14}"');
    expect(backup).toContain('MIN_FREE_MB="${MIN_FREE_MB:-10240}"');
    expect(backup).toContain('source_metadata=$(ssh_command metadata)');
    expect(backup).toContain('require_free_space_for_snapshot "$source_size"');
    expect(backup).toMatch(
      /verify_generation[\s\S]+write_receipt[\s\S]+verify_generation[\s\S]+require_free_space[\s\S]+mv "\$work" "\$destination"/u
    );
    expect(backup).toContain('MAX_SOURCE_AGE_SECONDS="${MAX_SOURCE_AGE_SECONDS:-28800}"');
    expect(backup).toContain(
      'qdrant/qdrant:v1.18.2@sha256:75eab8c4ba42096724fdcfde8b4de0b5713d529dde32f285a1f86fdcb2c9e50c'
    );
    expect(backup).toMatch(/"\$QDRANT_IMAGE" \\\n\s+\.\/entrypoint\.sh \\\n\s+--snapshot/u);

    for (const unit of [backupService, restoreService]) {
      expect(unit).toContain(
        'LoadCredential=qdrant_offhost_ssh_key:/root/.ssh/megacampus-qdrant-offhost-backup'
      );
      expect(unit).toContain(
        'LoadCredential=qdrant_offhost_known_hosts:/root/.ssh/megacampus-qdrant-offhost-known_hosts'
      );
      expect(unit).toContain('Environment=SSH_KEY=%d/qdrant_offhost_ssh_key');
      expect(unit).toContain('Environment=KNOWN_HOSTS=%d/qdrant_offhost_known_hosts');
      expect(unit).toContain('ProtectHome=true');
      expect(unit).toContain('Nice=15');
      expect(unit).toContain('IOSchedulingClass=idle');
      expect(unit).toContain('CPUWeight=10');
      expect(unit).toContain('IOWeight=10');
      expect(unit).toContain('CPUQuota=25%');
    }
    expect(backupTimer).toContain('OnCalendar=*-*-* 04:20:00');
    expect(restoreTimer).toContain('OnCalendar=monthly');
    expect(backupTimer).toContain('Persistent=true');
    expect(restoreTimer).toContain('Persistent=true');
  });

  it('keeps root-owned off-host metrics protected while application metrics remain group-writable', () => {
    const metricsContract = source(
      'packages/course-gen-platform/tools/qdrant/snapshot-recovery.ts'
    );
    const operatorEntrypoint = source(
      'packages/course-gen-platform/docker/qdrant-operator/entrypoint.sh'
    );
    const runbook = source('docs/operations/qdrant-self-hosted.md');

    expect(metricsContract).toContain('0o3775');
    expect(metricsContract).toContain('mode 3775');
    expect(operatorEntrypoint).toContain('== 3775');
    expect(runbook).toContain('install -d -o root -g megacampus-metrics -m 3775');
    expect(runbook).toMatch(/sticky/iu);
  });

  it('alerts independently on stale off-host copies and restore drills and documents rollback', () => {
    const alerts = source('ops/qdrant/prometheus/alerts.yml');
    const alertTests = source('ops/qdrant/prometheus/alert-tests.yml');
    const runbook = source(`${BASE}/README.md`);

    for (const name of ['QdrantOffHostSnapshotStale', 'QdrantOffHostRestoreDrillStale']) {
      expect(alerts).toContain(`alert: ${name}`);
      expect(alertTests).toContain(`alertname: ${name}`);
    }
    expect(alerts).toContain('megacampus_qdrant_offhost_last_successful_snapshot_unixtime_seconds');
    expect(alerts).toContain(
      'megacampus_qdrant_offhost_last_successful_restore_drill_unixtime_seconds'
    );
    expect(runbook).toMatch(/14 days/iu);
    expect(runbook).toMatch(/rollback/iu);
    expect(runbook).toMatch(/not.*disaster recovery/iu);
  });
});
