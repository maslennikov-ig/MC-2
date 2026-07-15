import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const MANIFEST = resolve(REPO_ROOT, 'deploy/qdrant/q12-command-manifest.json');
const SUPERVISOR = resolve(REPO_ROOT, 'deploy/qdrant/q12-live-cutover.sh');
const LAUNCHER = resolve(REPO_ROOT, 'deploy/qdrant/q12-capability-run.sh');
const CORE = resolve(REPO_ROOT, 'deploy/qdrant/q12-lifecycle-core.py');

const BARRIER_IDS = [
  'barrier.install',
  'barrier.verify-after-base',
  'barrier.verify-after-observability',
  'barrier.prepare-recovery',
  'barrier.activate',
] as const;

const BASE_ENV = {
  PATH: '/usr/sbin:/usr/bin:/sbin:/bin',
  LC_ALL: 'C',
  LANG: 'C',
  HOME: '/root',
};
const LEASE_ENV = { ...BASE_ENV, Q12_EXTERNAL_QUIESCE_LEASE_FD: '9' };

const OPERATOR_PREFIX = [
  '/opt/megacampus/deploy/qdrant/operator-compose.sh',
  '--project-directory',
  '/opt/megacampus',
  '-f',
  '/opt/megacampus/docker-compose.infra.yml',
  '--env-file',
  '/opt/megacampus/.env.production',
  '--profile',
  'operator',
  'run',
  '--rm',
  '--no-deps',
  '-T',
] as const;
const WORKER_PREFIX = [...OPERATOR_PREFIX.slice(0, 10), '--no-deps'] as const;

const REINDEX_MOUNTS = [
  '-v',
  '/opt/megacampus/backups/q12/<run-id>/secrets/db-capability:/run/secrets/q12_db_capability:ro',
  '-e',
  'Q12_DB_CAPABILITY_FILE=/run/secrets/q12_db_capability',
  '-v',
  '/opt/megacampus/backups/q12/<run-id>/database-barrier-receipt.json:/run/secrets/q12_database_barrier_receipt:ro',
  '-e',
  'Q12_DATABASE_BARRIER_RECEIPT_FILE=/run/secrets/q12_database_barrier_receipt',
  '-v',
  '/opt/megacampus/backups/q12/<run-id>/database-barrier-probe-receipt.json:/run/secrets/q12_database_barrier_probe_receipt:ro',
  '-e',
  'Q12_DATABASE_BARRIER_PROBE_RECEIPT_FILE=/run/secrets/q12_database_barrier_probe_receipt',
] as const;

const RECOVERY_BINDING = [
  '--recovery-manifest-path',
  '/var/lib/megacampus-source-recovery/state/manifest.json',
  '--recovery-journal-path',
  '/var/lib/megacampus-source-recovery/state/progress/journal.json',
  '--recovery-run-id',
  '<recovery-run-id>',
  '--recovery-manifest-sha256',
  '<accepted-recovery-manifest-sha256>',
  '--accepted-coverage-fingerprint',
  '<accepted-coverage-fingerprint>',
  '--accepted-coverage-run',
  '<accepted-coverage-run>',
] as const;

const REINDEX_ARTIFACT = '/var/lib/megacampus-qdrant-recovery/reindex/<run-id>.json';
const DB_CAPABILITY = '/opt/megacampus/backups/q12/<run-id>/secrets/db-capability';
const MIGRATION_SHARED = [
  '--',
  '--db-url-file',
  '/opt/megacampus/secrets/supabase_db_url',
  '--ca-file',
  '/opt/megacampus/secrets/prod-ca-2021.crt',
  '--q12-db-capability-file',
  DB_CAPABILITY,
  '--allow-remote',
  '--confirm',
] as const;

const ORDINARY_ARGV: Record<string, readonly string[]> = {
  'operator.self-check': [...OPERATOR_PREFIX, 'qdrant-operator', 'self-check'],
  'writers.quiesce': [
    '/opt/megacampus/deploy/qdrant/source-recovery-run.sh',
    '--operation',
    'quiesce-writers-only',
    '--run-id',
    '<run-id>',
  ],
  'pg.backup': [
    '/opt/megacampus/deploy/postgres/backup-supabase.sh',
    '--q12-run-id',
    '<run-id>',
    '--snapshot',
    '<exported-id>',
  ],
  'pg.restore': [
    '/opt/megacampus/deploy/postgres/restore-supabase-drill.sh',
    '--generation',
    '<immutable-generation>',
    '--run-id',
    '<run-id>',
    '--q12-db-capability-file',
    DB_CAPABILITY,
  ],
  'migration.base.apply': [
    '/usr/bin/pnpm',
    '--filter',
    '@megacampus/course-gen-platform',
    'migration:document-evidence-approved:apply',
    ...MIGRATION_SHARED,
    'APPLY REMOTE DOCUMENT EVIDENCE BASE 20260711120000 20260711130000 20260711140000',
  ],
  'migration.observability.apply': [
    '/usr/bin/pnpm',
    '--filter',
    '@megacampus/course-gen-platform',
    'migration:document-evidence-observability:apply',
    ...MIGRATION_SHARED,
    'APPLY REMOTE DOCUMENT EVIDENCE OBSERVABILITY 20260711150000 20260711151000',
  ],
  'source.forward': [
    '/opt/megacampus/deploy/qdrant/source-recovery-run.sh',
    '--operation',
    'forward',
    '--run-id',
    '<recovery-run-id>',
    '--project-directory',
    '/opt/megacampus',
    '--env-file',
    '/opt/megacampus/.env.production',
    '--plan-input',
    '/var/lib/megacampus-source-recovery/plan-input.json',
    '--manifest',
    '/var/lib/megacampus-source-recovery/state/manifest.json',
    '--progress-directory',
    '/var/lib/megacampus-source-recovery/state/progress',
    '--development-root',
    '/opt/megacampus/data/uploads-dev',
    '--production-root',
    '/opt/megacampus/data/uploads',
    '--capability-directory',
    '/opt/megacampus/data/source-recovery-capability',
    '--q12-db-capability-file',
    DB_CAPABILITY,
    '--external-quiesce-manifest',
    '<quiesce-manifest>',
    '--database-barrier-receipt',
    '/opt/megacampus/backups/q12/<run-id>/database-barrier-receipt.json',
  ],
  'reindex.plan': [
    ...OPERATOR_PREFIX,
    ...REINDEX_MOUNTS,
    'qdrant-operator',
    'reindex',
    'plan',
    '--run-id',
    '<run-id>',
    '--artifact',
    REINDEX_ARTIFACT,
    ...RECOVERY_BINDING,
  ],
  'reindex.worker.create': [
    ...WORKER_PREFIX,
    ...REINDEX_MOUNTS,
    '-d',
    '--name',
    'megacampus-qdrant-reindex-<run-id>',
    '-e',
    'BULLMQ_QUEUE_NAME=qdrant-reindex-<run-id>',
    '-e',
    'QDRANT_REINDEX_TARGET_COLLECTION=course_embeddings_v1',
    'qdrant-operator',
    'reindex-worker',
  ],
  'reindex.execute': [
    ...OPERATOR_PREFIX,
    ...REINDEX_MOUNTS,
    '-e',
    'BULLMQ_QUEUE_NAME=qdrant-reindex-<run-id>',
    'qdrant-operator',
    'reindex',
    'execute',
    '--target-collection',
    'course_embeddings_v1',
    '--run-id',
    '<run-id>',
    '--artifact',
    REINDEX_ARTIFACT,
    ...RECOVERY_BINDING,
  ],
  'reindex.verify': [
    ...OPERATOR_PREFIX,
    ...REINDEX_MOUNTS,
    'qdrant-operator',
    'reindex',
    'verify',
    '--target-collection',
    'course_embeddings_v1',
    '--run-id',
    '<run-id>',
    '--artifact',
    REINDEX_ARTIFACT,
    ...RECOVERY_BINDING,
  ],
  'deploy.prepare': [
    '/opt/megacampus/scripts/deploy_blue_green.sh',
    '--q12-mode',
    'prepare-quiesced',
    '--run-id',
    '<run-id>',
    '--release-sha',
    '<release-sha>',
    '--external-quiesce-manifest',
    '<quiesce-manifest>',
  ],
  'deploy.commit': [
    '/opt/megacampus/scripts/deploy_blue_green.sh',
    '--q12-mode',
    'commit-quiesced',
    '--run-id',
    '<run-id>',
    '--release-sha',
    '<release-sha>',
    '--external-quiesce-manifest',
    '<quiesce-manifest>',
  ],
  'writers.resume.forward': [
    '/opt/megacampus/deploy/qdrant/source-recovery-run.sh',
    '--operation',
    'resume-writers-only',
    '--resume-mode',
    'forward',
    '--run-id',
    '<run-id>',
  ],
  'writers.resume.rollback': [
    '/opt/megacampus/deploy/qdrant/source-recovery-run.sh',
    '--operation',
    'resume-writers-only',
    '--resume-mode',
    'rollback',
    '--run-id',
    '<run-id>',
  ],
};

const LEASE_ENV_IDS = new Set([
  'writers.quiesce',
  'writers.resume.forward',
  'writers.resume.rollback',
]);

const ALL_IDS = [...BARRIER_IDS, ...Object.keys(ORDINARY_ARGV)];

function argvHash(argv: readonly string[]): string {
  return createHash('sha256').update(JSON.stringify(argv)).digest('hex');
}

describe('Q12 canonical command manifest', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as {
    schema_version: string;
    commands: Record<string, { argv: string[]; argv_sha256: string; env: Record<string, string> }>;
  };

  it('contains exactly the frozen twenty commands in amendment order', () => {
    expect(Object.keys(manifest)).toEqual(['schema_version', 'commands']);
    expect(manifest.schema_version).toBe('megacampus.q12.command-manifest/v1');
    expect(Object.keys(manifest.commands)).toEqual(ALL_IDS);
  });

  it('keeps the five barrier entries byte-stable with their canonical shape', () => {
    for (const id of BARRIER_IDS) {
      const command = manifest.commands[id];
      expect(command.env).toEqual(BASE_ENV);
      expect(command.argv[0]).toBe('/opt/megacampus/deploy/qdrant/q12-database-barrier.sh');
      expect(command.argv_sha256).toBe(argvHash(command.argv));
      expect(command.argv).not.toContain('--');
    }
    expect(manifest.commands['barrier.prepare-recovery'].argv).not.toContain('--after-migration');
  });

  it('freezes the fifteen ordinary entries to the amendment literal argv', () => {
    for (const [id, expected] of Object.entries(ORDINARY_ARGV)) {
      const command = manifest.commands[id];
      expect(command, id).toBeDefined();
      expect(command.argv, id).toEqual([...expected]);
      expect(command.argv_sha256, id).toBe(argvHash(command.argv));
      expect(command.env, id).toEqual(LEASE_ENV_IDS.has(id) ? LEASE_ENV : BASE_ENV);
    }
  });

  it('carries no shell metacharacters or unresolved reference prose anywhere', () => {
    for (const id of ALL_IDS) {
      const command = manifest.commands[id];
      expect(
        command.argv.every(value => !/[;&|`$()\n]/.test(value)),
        id
      ).toBe(true);
      expect(
        command.argv.every(
          value => !/RECOVERY_BINDING|SOURCE_RESUME|SOURCE_ROLLBACK|EXPECTED_CATALOG/.test(value)
        ),
        id
      ).toBe(true);
    }
  });

  it('deployed wrappers enter only the production core and expose no test bypass', () => {
    for (const wrapper of [SUPERVISOR, LAUNCHER]) {
      const source = readFileSync(wrapper, 'utf8');
      expect(source).toContain('/usr/bin/python3');
      expect(source).toContain('q12-lifecycle-core.py');
      expect(source).not.toMatch(
        /fixture|test[-_ ]?mode|manifest[-_ ]?override|executor[-_ ]?override/i
      );
      const rejected = spawnSync('/usr/bin/bash', [wrapper, '--fixture'], {
        encoding: 'utf8',
        env: { PATH: '/usr/bin:/bin', LC_ALL: 'C', LANG: 'C' },
      });
      expect(rejected.status).not.toBe(0);
    }
    const help = spawnSync('/usr/bin/python3', [CORE, '--help'], { encoding: 'utf8' });
    expect(help.status).toBe(0);
    expect(help.stdout).not.toMatch(/fixture|test|override|inject/i);
  });

  it('freezes the exact public launcher argv surface', () => {
    const source = readFileSync(CORE, 'utf8');
    for (const option of [
      '--run-id',
      '--command-id',
      '--lease-fd',
      '--checkpoint',
      '--capability',
    ]) {
      expect(source).toContain(option);
    }
    for (const forbidden of [
      '--request',
      '--manifest',
      '--executor',
      '--command',
      '--env',
      '--path',
    ]) {
      expect(source).not.toContain(`add_argument('${forbidden}'`);
      expect(source).not.toContain(`add_argument("${forbidden}"`);
    }
  });
});
