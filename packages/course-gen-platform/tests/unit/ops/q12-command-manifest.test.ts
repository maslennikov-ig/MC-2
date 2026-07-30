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

function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function uuid5(namespace: string, name: string): string {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const hash = createHash('sha1')
    .update(Buffer.concat([ns, Buffer.from(name, 'utf8')]))
    .digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const PROBE_RUN_ID = '3b241101-e2bb-4255-8caf-4136c566a962';
const PROBE_QUIESCE = '/tmp/q12-probe-writer-quiesce.json';
const PROBE_RELEASE = '0123456789abcdef0123456789abcdef01234567';
const PROBE_CATALOG = 'a'.repeat(64);

function expectedDerivedValues(): Record<string, string> {
  const digest = (salt: string) => sha256Hex(`q12:${salt}:${PROBE_RUN_ID}`);
  const snapshot = digest('snapshot-export');
  return {
    '<exported-id>': `${snapshot.slice(0, 8)}-${snapshot.slice(8, 16)}-1`,
    '<immutable-generation>': `q12fixture-generation-${digest('backup-generation').slice(0, 16)}`,
    '<recovery-run-id>': uuid5(PROBE_RUN_ID, 'q12-source-recovery'),
    '<accepted-recovery-manifest-sha256>': digest('recovery-manifest'),
    '<accepted-coverage-fingerprint>': digest('coverage-fingerprint'),
    '<accepted-coverage-run>': `catalog:${uuid5(PROBE_RUN_ID, 'q12-source-recovery')}`,
    '<quiesce-manifest>': PROBE_QUIESCE,
  };
}

function resolveProbe(script: string): { status: number | null; stdout: string; stderr: string } {
  const preamble = [
    'import importlib.util, json, sys',
    `spec = importlib.util.spec_from_file_location('q12core', ${JSON.stringify(CORE)})`,
    'core = importlib.util.module_from_spec(spec)',
    "sys.modules['q12core'] = core",
    'spec.loader.exec_module(core)',
    `REQUEST = {'run_id': '${PROBE_RUN_ID}', 'expected_catalog_sha256': '${PROBE_CATALOG}', 'release_sha': '${PROBE_RELEASE}'}`,
  ].join('\n');
  return spawnSync('/usr/bin/python3', ['-c', `${preamble}\n${script}`], { encoding: 'utf8' });
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

  it('resolves every ordinary command through the one manifest with derived single authorities', () => {
    const probe = resolveProbe(
      [
        'manifest = core.load_manifest()',
        `values = core.derive_joined_fixture_values(REQUEST['run_id'], ${JSON.stringify(PROBE_QUIESCE)})`,
        'resolved = {command_id: core.resolved_command(manifest, command_id, REQUEST, values) for command_id in core.MANIFEST_COMMAND_IDS}',
        "print(json.dumps({'values': values, 'resolved': resolved}))",
      ].join('\n')
    );
    expect(probe.stderr).toBe('');
    expect(probe.status).toBe(0);
    const output = JSON.parse(probe.stdout) as {
      values: Record<string, string>;
      resolved: Record<string, { argv: string[]; command_sha256: string }>;
    };
    expect(output.values).toEqual(expectedDerivedValues());
    const substitutions: Record<string, string> = {
      '<run-id>': PROBE_RUN_ID,
      '<expected-post-migration-catalog-sha256>': PROBE_CATALOG,
      '<release-sha>': PROBE_RELEASE,
      ...expectedDerivedValues(),
    };
    for (const id of ALL_IDS) {
      const resolved = output.resolved[id];
      expect(resolved, id).toBeDefined();
      const source = manifest.commands[id].argv;
      const expected = source.map(value => {
        let rendered = value;
        for (const [token, replacement] of Object.entries(substitutions)) {
          rendered = rendered.split(token).join(replacement);
        }
        return rendered;
      });
      expect(resolved.argv, id).toEqual(expected);
      expect(
        resolved.argv.every(value => !value.includes('<') && !value.includes('>')),
        id
      ).toBe(true);
      expect(resolved.command_sha256, id).toBe(argvHash(resolved.argv));
    }
  });

  it('fails closed on unresolved placeholders and caller-offered substitutions', () => {
    const unresolved = resolveProbe(
      [
        'manifest = core.load_manifest()',
        'try:',
        "    core.resolved_command(manifest, 'pg.backup', REQUEST, {})",
        "    print('accepted')",
        'except core.LifecycleError as error:',
        '    print(f"rejected: {error}")',
      ].join('\n')
    );
    expect(unresolved.status).toBe(0);
    expect(unresolved.stdout).toContain('rejected: unresolved command placeholder');
    const foreign = resolveProbe(
      [
        'manifest = core.load_manifest()',
        `values = core.derive_joined_fixture_values(REQUEST['run_id'], ${JSON.stringify(PROBE_QUIESCE)})`,
        "values['<caller-injected>'] = 'attack'",
        'try:',
        "    core.resolved_command(manifest, 'pg.backup', REQUEST, values)",
        "    print('accepted')",
        'except core.LifecycleError as error:',
        '    print(f"rejected: {error}")',
      ].join('\n')
    );
    expect(foreign.status).toBe(0);
    expect(foreign.stdout).toContain('rejected: unknown substitution placeholder');
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

// D6 (Q12 activation-truth classifier) is a private child of the Root supervisor.
// It adds no command to the manifest and does not touch the five retained barrier
// entries. These assertions pin the whole accepted twenty-command manifest and the
// five retained entries to their frozen bytes so any D6 Root change that would alter
// the command surface fails here instead of silently mutating the manifest.
const D6_COMMAND_MANIFEST_SHA256 =
  'aaec6fc25a6996facbf6f07f579239ba0a2aa53fd5521c83cb3c87d12087a841';

function barrierArgv(subcommand: readonly string[]): string[] {
  return [
    '/opt/megacampus/deploy/qdrant/q12-database-barrier.sh',
    ...subcommand,
    '--run-id',
    '<run-id>',
    '--db-url-file',
    '/opt/megacampus/secrets/supabase_db_url',
    '--ca-file',
    '/opt/megacampus/secrets/prod-ca-2021.crt',
    '--q12-db-capability-file',
    '/opt/megacampus/backups/q12/<run-id>/secrets/db-capability',
    '--expected-post-migration-catalog',
    '/opt/megacampus/backups/q12/<run-id>/expected-post-migration-catalog.json',
    '--expected-post-migration-catalog-sha256',
    '<expected-post-migration-catalog-sha256>',
  ];
}

const RETAINED_BARRIERS: Record<
  (typeof BARRIER_IDS)[number],
  { argv: string[]; argv_sha256: string }
> = {
  'barrier.install': {
    argv: barrierArgv(['install']),
    argv_sha256: '0caafb416a252f5b00d606e813ac2d4c021415e1137ecb6b7c5383e058db373b',
  },
  'barrier.verify-after-base': {
    argv: barrierArgv(['verify-extended', '--after-migration', '20260711140000']),
    argv_sha256: 'a9eb8d69416dbc8102e473d1b6c9716d5604392b4140581a18b65137210eea1e',
  },
  'barrier.verify-after-observability': {
    argv: barrierArgv(['verify-extended', '--after-migration', '20260711151000']),
    argv_sha256: '0dfd3b80aac5674cbb77a1c708e8f4751dff96f4465362c3a4c0862b78ab321d',
  },
  'barrier.prepare-recovery': {
    argv: barrierArgv(['prepare-recovery']),
    argv_sha256: 'b45a23caaa74f197a0779e52b460079c53ea246ba1951456fd8f04856673021c',
  },
  'barrier.activate': {
    argv: barrierArgv(['activate']),
    argv_sha256: 'f267f1dc9889ae85171257b2ddaf553cb372fe97be9deb7e201b7e5bcc69c191',
  },
};

describe('Q12 D6 keeps the retained commands and manifest byte-stable', () => {
  const manifestBytes = readFileSync(MANIFEST);
  const manifest = JSON.parse(manifestBytes.toString('utf8')) as {
    schema_version: string;
    commands: Record<string, { argv: string[]; argv_sha256: string; env: Record<string, string> }>;
  };

  it('pins the accepted twenty-command manifest to the W-tuple sha256', () => {
    expect(createHash('sha256').update(manifestBytes).digest('hex')).toBe(
      D6_COMMAND_MANIFEST_SHA256
    );
    expect(manifest.schema_version).toBe('megacampus.q12.command-manifest/v1');
    expect(Object.keys(manifest.commands)).toEqual(ALL_IDS);
    expect(Object.keys(manifest.commands)).toHaveLength(20);
    expect(Object.keys(manifest.commands).slice(0, 5)).toEqual([...BARRIER_IDS]);
  });

  it('keeps the five retained barrier entries byte-identical under D6', () => {
    for (const id of BARRIER_IDS) {
      const command = manifest.commands[id];
      expect(command.argv, id).toEqual(RETAINED_BARRIERS[id].argv);
      expect(command.argv_sha256, id).toBe(RETAINED_BARRIERS[id].argv_sha256);
      expect(command.argv_sha256, id).toBe(argvHash(command.argv));
      expect(command.env, id).toEqual(BASE_ENV);
    }
  });

  it('introduces no D6 command, shorthand namespace, systemd unit, or cron job', () => {
    for (const shorthand of [
      'install',
      'verify-after-base',
      'verify-after-observability',
      'prepare-recovery',
      'activate',
    ]) {
      expect(Object.keys(manifest.commands)).not.toContain(shorthand);
    }
    const probe = resolveProbe(
      [
        'manifest = core.load_manifest()',
        "print(json.dumps({'ids': list(core.MANIFEST_COMMAND_IDS), 'keys': list(manifest['commands'].keys())}))",
      ].join('\n')
    );
    expect(probe.stderr).toBe('');
    expect(probe.status).toBe(0);
    const output = JSON.parse(probe.stdout) as { ids: string[]; keys: string[] };
    expect(output.ids).toEqual(ALL_IDS);
    expect(output.keys).toEqual(ALL_IDS);
    const source = readFileSync(CORE, 'utf8');
    for (const scheduling of ['systemctl', 'systemd', 'crontab', '.service', '.timer']) {
      expect(source, scheduling).not.toContain(scheduling);
    }
  });
});
