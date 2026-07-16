import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const RESTORE = resolve(REPO_ROOT, 'deploy/postgres/restore-supabase-drill.sh');
const MANIFEST = resolve(REPO_ROOT, 'deploy/postgres/q12-source-manifest.ts');
const ROLE_BOOTSTRAP = resolve(REPO_ROOT, 'deploy/postgres/generate-role-bootstrap.ts');
const CLEANUP_HELPER = resolve(REPO_ROOT, 'deploy/postgres/run-restore-cleanup.ts');
const TEMP_HELPER = resolve(REPO_ROOT, 'deploy/postgres/create-private-temp-dir.py');
const PGTLE_SCANNER = resolve(REPO_ROOT, 'deploy/postgres/scan-pgtle-archive.py');
const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync('/tmp/mc2-supabase-restore-');
  roots.push(root);
  chmodSync(root, 0o700);
  return root;
}

function runTs(script: string, args: string[]): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, ['--import', 'tsx', script, ...args], {
    cwd: resolve(REPO_ROOT, 'packages/course-gen-platform'),
    env: { PATH: process.env.PATH, HOME: process.env.HOME, LC_ALL: 'C', TMPDIR: '/tmp' },
    encoding: 'utf8',
  });
}

function restoreScript(): string {
  expect(existsSync(RESTORE)).toBe(true);
  return existsSync(RESTORE) ? readFileSync(RESTORE, 'utf8') : '';
}

function trackedDockerLifecycle(): string {
  const script = restoreScript();
  const begin = '# BEGIN authoritative Docker lifecycle';
  const end = '# END authoritative Docker lifecycle';
  const start = script.indexOf(begin);
  const finish = script.indexOf(end);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(finish).toBeGreaterThan(start);
  return `${script.slice(start + begin.length, finish)}\n`;
}

function role(
  name: string,
  overrides: Partial<Record<string, boolean | number | string | null>> = {}
): Record<string, boolean | number | string | null> {
  return {
    name,
    rolsuper: false,
    rolinherit: true,
    rolcreaterole: false,
    rolcreatedb: false,
    rolcanlogin: false,
    rolreplication: false,
    rolconnlimit: -1,
    rolvaliduntil: null,
    rolbypassrls: false,
    ...overrides,
  };
}

function sourceManifest(): Record<string, unknown> {
  const database = {
    name: 'postgres',
    owner: 'postgres',
    encoding: 'UTF8',
    locale_provider: 'c',
    collate: 'C.UTF-8',
    ctype: 'C.UTF-8',
    provider_locale: null,
    builtin_locale: null,
    icu_locale: null,
    icu_rules: null,
    collation_version: null,
    tablespace: 'pg_default',
    connection_limit: -1,
    allow_connections: true,
    is_template: false,
    acl: [],
    settings: [['default_transaction_read_only', 'on']],
    comment: null,
    security_labels: [],
  };
  const view = {
    database,
    roles: [
      role('admin', { rolcanlogin: true }),
      role('anon'),
      role('authenticated'),
      role('postgres', { rolsuper: true, rolcanlogin: true, rolbypassrls: true }),
      role('supabase_admin', {
        rolsuper: true,
        rolcreaterole: true,
        rolcreatedb: true,
        rolcanlogin: true,
        rolbypassrls: true,
      }),
    ],
    role_settings: [
      { role: 'anon', database: null, name: 'statement_timeout', value: '3s' },
      {
        role: 'supabase_admin',
        database: null,
        name: 'search_path',
        value: '"$user", public, auth, extensions',
      },
    ],
    memberships: [
      {
        member: 'admin',
        role: 'authenticated',
        grantor: 'supabase_admin',
        admin_option: false,
        inherit_option: true,
        set_option: true,
      },
    ],
    pg_participants: [],
    parameter_acls: [],
    extensions: [
      { name: 'pg_cron', version: '1.6.4', schema: 'pg_catalog', owner: 'postgres' },
      { name: 'pg_net', version: '0.19.5', schema: 'extensions', owner: 'supabase_admin' },
      { name: 'pg_tle', version: '1.4.0', schema: 'pgtle', owner: 'supabase_admin' },
      { name: 'pgtap', version: '1.2.0', schema: 'extensions', owner: 'supabase_admin' },
    ],
    schemas: [],
    catalog: {},
  };
  return {
    schema: 'megacampus.supabase-source-manifest/v1',
    snapshot_id: '00000003-0000001B-1',
    baseline: view,
    cutover_snapshot: view,
  };
}

function exactGuardTransitionManifest(): Record<string, unknown> {
  const tables = ['active_run', 'baseline', 'migration_guards', 'probe'];
  const columns = [
    'active_run.singleton',
    'active_run.run_id',
    'active_run.capability_sha256',
    'active_run.expected_catalog_sha256',
    'active_run.expected_catalog',
    'active_run.activated',
    'baseline.singleton',
    'baseline.baseline',
    'baseline.baseline_sha256',
    'migration_guards.migration',
    'migration_guards.catalog_sha256',
    'migration_guards.migration_file_sha256',
    'migration_guards.stable_expected',
    'migration_guards.relation_set',
    'probe.probe_id',
    'probe.touched_at',
  ];
  const constraints = [
    'active_run.active_run_pkey',
    'active_run.active_run_singleton_check',
    'active_run.active_run_capability_sha256_check',
    'active_run.active_run_expected_catalog_sha256_check',
    'baseline.baseline_pkey',
    'baseline.baseline_singleton_check',
    'baseline.baseline_baseline_sha256_check',
    'migration_guards.migration_guards_pkey',
    'migration_guards.migration_guards_catalog_sha256_check',
    'migration_guards.migration_guards_migration_file_sha256_check',
    'probe.probe_pkey',
  ];
  const functions = [
    'assert_capability',
    'enforce_write_barrier',
    'extend_guard',
    'verify_capability',
    'verify_expected_guards',
  ];
  const functionIdentity = (name: string): string =>
    name === 'extend_guard'
      ? 'extend_guard(p_migration text, p_expected_relations jsonb, p_migration_file_sha256 text, p_expected_catalog_sha256 text)'
      : name === 'verify_expected_guards'
        ? 'verify_expected_guards(p_after_migration text)'
        : `${name}()`;
  const cronJobs = Array.from({ length: 8 }, (_, index) => ({
    jobid: index + 1,
    active: true,
    command_sha256: `${index}`.padStart(64, '0'),
  }));
  const relationAcl = [
    'DELETE',
    'INSERT',
    'REFERENCES',
    'SELECT',
    'TRIGGER',
    'TRUNCATE',
    'UPDATE',
  ].map(privilege => ({ grantor: 'postgres', grantee: 'postgres', privilege, grantable: true }));
  const baseRelation = {
    schema: 'public',
    name: 'items',
    oid: 100,
    kind: 'r',
    parent_oid: null,
    owner: 'postgres',
    classification: 'authoritative',
    acl: relationAcl,
    row_count: '0',
    row_sha256: 'a'.repeat(64),
  };
  const emptyCatalog = {
    indexes: [],
    constraints: [],
    functions: [],
    triggers: [],
    policies: [],
    default_acls: [],
    object_owners: [],
    object_acls: [],
    comments: [],
    security_labels: [],
  };
  const baseline = {
    database: { settings: [], size_bytes: 10 },
    cron_jobs: cronJobs,
    schemas: [],
    relations: [baseRelation],
    catalog: emptyCatalog,
    pg_net_queue_count: '0',
  };
  const objectOwners = [
    { object_type: 'schema', schema: null, identity: 'q12_guard', owner: 'postgres' },
    ...tables.map(identity => ({
      object_type: 'relation',
      schema: 'q12_guard',
      identity,
      owner: 'postgres',
    })),
    ...tables.map(identity => ({
      object_type: 'index',
      schema: 'q12_guard',
      identity: `${identity}_pkey`,
      owner: 'postgres',
    })),
    ...columns.map(identity => ({
      object_type: 'column',
      schema: 'q12_guard',
      identity,
      owner: 'postgres',
    })),
    ...functions.map(identity => ({
      object_type: 'function',
      schema: 'q12_guard',
      identity: functionIdentity(identity),
      owner: 'postgres',
    })),
    ...[...tables, ...tables.map(name => `_${name}`)].map(identity => ({
      object_type: 'type',
      schema: 'q12_guard',
      identity,
      owner: 'postgres',
    })),
    ...constraints.map(identity => ({
      object_type: 'constraint',
      schema: 'q12_guard',
      identity,
      owner: 'postgres',
    })),
    {
      object_type: 'trigger',
      schema: 'q12_guard',
      identity: 'probe.q12_guard_row',
      owner: 'postgres',
    },
    {
      object_type: 'trigger',
      schema: 'q12_guard',
      identity: 'probe.q12_guard_truncate',
      owner: 'postgres',
    },
    {
      object_type: 'trigger',
      schema: 'public',
      identity: 'items.q12_guard_row',
      owner: 'postgres',
    },
    {
      object_type: 'trigger',
      schema: 'public',
      identity: 'items.q12_guard_truncate',
      owner: 'postgres',
    },
  ];
  const aclRows = (
    object_type: string,
    identity: string,
    privileges: string[],
    schema = 'q12_guard'
  ) =>
    privileges.map(privilege => ({
      object_type,
      schema,
      identity,
      grantor: 'postgres',
      grantee: 'postgres',
      privilege,
      grantable: true,
    }));
  const objectAcls = [
    ...aclRows('schema', 'q12_guard', ['CREATE', 'USAGE'], null as unknown as string),
    ...tables.flatMap(name =>
      aclRows('relation', name, [
        'DELETE',
        'INSERT',
        'REFERENCES',
        'SELECT',
        'TRIGGER',
        'TRUNCATE',
        'UPDATE',
      ])
    ),
    ...functions.flatMap(name => aclRows('function', functionIdentity(name), ['EXECUTE'])),
    ...[...tables, ...tables.map(name => `_${name}`)].flatMap(name =>
      aclRows('type', name, ['USAGE'])
    ),
  ];
  const guardDefinition = 'EXECUTE FUNCTION q12_guard.enforce_write_barrier()';
  const cutover = structuredClone(baseline) as Record<string, any>;
  cutover.database.settings = [['default_transaction_read_only', 'on']];
  cutover.cron_jobs = cronJobs.map(job => ({ ...job, active: false }));
  cutover.schemas = [{ name: 'q12_guard', owner: 'postgres' }];
  cutover.relations.push(
    ...tables.map((name, index) => ({
      schema: 'q12_guard',
      name,
      oid: 200 + index,
      kind: 'r',
      parent_oid: null,
      owner: 'postgres',
      classification: 'non_authoritative_operational',
      acl: relationAcl,
    }))
  );
  cutover.catalog = {
    ...emptyCatalog,
    indexes: tables.map(name => ({ schema: 'q12_guard', name: `${name}_pkey` })),
    constraints: constraints.map(identity => ({
      schema: 'q12_guard',
      table: identity.split('.')[0],
      name: identity.split('.')[1],
    })),
    functions: functions.map(identity => ({
      schema: 'q12_guard',
      identity: functionIdentity(identity),
      owner: 'postgres',
      definition: 'SECURITY DEFINER',
    })),
    triggers: [
      { schema: 'public', table: 'items', name: 'q12_guard_row', definition: guardDefinition },
      { schema: 'public', table: 'items', name: 'q12_guard_truncate', definition: guardDefinition },
      { schema: 'q12_guard', table: 'probe', name: 'q12_guard_row', definition: guardDefinition },
      {
        schema: 'q12_guard',
        table: 'probe',
        name: 'q12_guard_truncate',
        definition: guardDefinition,
      },
    ],
    object_owners: objectOwners,
    object_acls: objectAcls,
  };
  return {
    schema: 'megacampus.supabase-source-manifest/v1',
    snapshot_id: '00000003-0000001B-1',
    baseline,
    cutover_snapshot: cutover,
  };
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function manifestScript(): string {
  expect(existsSync(MANIFEST)).toBe(true);
  return existsSync(MANIFEST) ? readFileSync(MANIFEST, 'utf8') : '';
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('allowlisted Supabase role bootstrap', () => {
  it('creates only reviewed missing roles and replays the exact membership grantor/options', () => {
    const root = tempRoot();
    const manifest = join(root, 'source-manifest.json');
    const image = join(root, 'image-roles.json');
    const output = join(root, 'bootstrap.sql');
    writeJson(manifest, sourceManifest());
    writeJson(image, {
      roles: [
        role('anon'),
        role('authenticated'),
        role('postgres', { rolsuper: true, rolcanlogin: true, rolbypassrls: true }),
        role('supabase_admin', {
          rolsuper: true,
          rolcreaterole: true,
          rolcreatedb: true,
          rolcanlogin: true,
          rolbypassrls: true,
        }),
      ],
      pg_participants: [],
      memberships: [],
      parameter_acls: [],
    });

    const result = runTs(ROLE_BOOTSTRAP, [
      '--manifest',
      manifest,
      '--image-inventory',
      image,
      '--output',
      output,
    ]);

    expect(
      result.status,
      `${result.error?.message ?? ''}\n${result.stdout}\n${result.stderr}`
    ).toBe(0);
    const sql = readFileSync(output, 'utf8');
    expect(sql).toContain('CREATE ROLE "admin"');
    expect(sql).toContain('LOGIN');
    expect(sql).not.toContain('PASSWORD');
    expect(sql).toContain('SET ROLE "supabase_admin";');
    expect(sql).toContain(
      'GRANT "authenticated" TO "admin" WITH ADMIN FALSE, INHERIT TRUE, SET TRUE;'
    );
    expect(sql).toContain('RESET ROLE;');
    expect(sql).toContain(`ALTER ROLE "anon" SET "statement_timeout" TO '3s';`);
    // search_path is replayed verbatim: quoting collapses the list into one
    // quoted element and breaks restored-inventory equality.
    expect(sql).toContain(
      `ALTER ROLE "supabase_admin" SET "search_path" TO "$user", public, auth, extensions;`
    );
    expect(sql).not.toContain('CREATE ROLE "anon"');
  });

  it('rejects missing roles outside the exact eight-role allowlist', () => {
    const root = tempRoot();
    const manifest = join(root, 'source-manifest.json');
    const image = join(root, 'image-roles.json');
    const output = join(root, 'bootstrap.sql');
    const source = sourceManifest();
    const cutover = source.cutover_snapshot as { roles: Array<Record<string, unknown>> };
    cutover.roles.push(role('unexpected_missing_role'));
    writeJson(manifest, source);
    writeJson(image, {
      roles: [
        role('anon'),
        role('authenticated'),
        role('postgres', { rolsuper: true, rolcanlogin: true, rolbypassrls: true }),
        role('supabase_admin', {
          rolsuper: true,
          rolcreaterole: true,
          rolcreatedb: true,
          rolcanlogin: true,
          rolbypassrls: true,
        }),
      ],
      pg_participants: [],
      memberships: [],
      parameter_acls: [],
    });

    const result = runTs(ROLE_BOOTSTRAP, [
      '--manifest',
      manifest,
      '--image-inventory',
      image,
      '--output',
      output,
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('unexpected missing source role');
    expect(existsSync(output)).toBe(false);
  });

  it('rejects source superuser drift and non-allowlisted role settings before SQL output', () => {
    const root = tempRoot();
    const manifest = join(root, 'source-manifest.json');
    const image = join(root, 'image-roles.json');
    const output = join(root, 'bootstrap.sql');
    const source = sourceManifest();
    const cutover = source.cutover_snapshot as {
      roles: Array<Record<string, unknown>>;
      role_settings: Array<Record<string, unknown>>;
    };
    cutover.roles[0].rolsuper = true;
    cutover.role_settings.push({
      role: 'admin',
      database: null,
      name: 'search_path',
      value: 'public',
    });
    writeJson(manifest, source);
    writeJson(image, {
      roles: [
        role('anon'),
        role('authenticated'),
        role('postgres', { rolsuper: true, rolcanlogin: true, rolbypassrls: true }),
        role('supabase_admin', {
          rolsuper: true,
          rolcreaterole: true,
          rolcreatedb: true,
          rolcanlogin: true,
          rolbypassrls: true,
        }),
      ],
      pg_participants: [],
      memberships: [],
      parameter_acls: [],
    });

    const result = runTs(ROLE_BOOTSTRAP, [
      '--manifest',
      manifest,
      '--image-inventory',
      image,
      '--output',
      output,
    ]);

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).not.toContain('postgresql://');
    expect(existsSync(output)).toBe(false);
  });

  it('rejects elevated role attributes outside the exact per-role privilege allowlist', () => {
    const root = tempRoot();
    const manifest = join(root, 'source-manifest.json');
    const image = join(root, 'image-roles.json');
    const output = join(root, 'bootstrap.sql');
    const source = sourceManifest();
    const cutover = source.cutover_snapshot as { roles: Array<Record<string, unknown>> };
    cutover.roles.find(item => item.name === 'anon')!.rolcanlogin = true;
    writeJson(manifest, source);
    writeJson(image, {
      roles: [
        role('anon'),
        role('authenticated'),
        role('postgres', { rolsuper: true, rolcanlogin: true, rolbypassrls: true }),
        role('supabase_admin', {
          rolsuper: true,
          rolcreaterole: true,
          rolcreatedb: true,
          rolcanlogin: true,
          rolbypassrls: true,
        }),
      ],
      pg_participants: [],
      memberships: [],
      parameter_acls: [],
    });

    const result = runTs(ROLE_BOOTSTRAP, [
      '--manifest',
      manifest,
      '--image-inventory',
      image,
      '--output',
      output,
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('role privilege allowlist');
    expect(existsSync(output)).toBe(false);
  });

  it('replays custom-to-builtin memberships and PUBLIC parameter ACLs with exact options', () => {
    const root = tempRoot();
    const manifest = join(root, 'source-manifest.json');
    const image = join(root, 'image-roles.json');
    const output = join(root, 'bootstrap.sql');
    const source = sourceManifest();
    const cutover = source.cutover_snapshot as {
      memberships: unknown[];
      parameter_acls: unknown[];
    };
    cutover.memberships.push({
      member: 'admin',
      role: 'pg_read_all_data',
      grantor: 'supabase_admin',
      admin_option: false,
      inherit_option: true,
      set_option: false,
    });
    const pgParticipant = role('pg_read_all_data');
    (cutover as { pg_participants: unknown[] }).pg_participants.push(pgParticipant);
    cutover.parameter_acls.push({
      parameter: 'statement_timeout',
      grantor: 'supabase_admin',
      grantee: 'PUBLIC',
      privilege: 'SET',
      grantable: false,
    });
    writeJson(manifest, source);
    writeJson(image, {
      roles: [
        role('anon'),
        role('authenticated'),
        role('postgres', { rolsuper: true, rolcanlogin: true, rolbypassrls: true }),
        role('supabase_admin', {
          rolsuper: true,
          rolcreaterole: true,
          rolcreatedb: true,
          rolcanlogin: true,
          rolbypassrls: true,
        }),
      ],
      pg_participants: [pgParticipant],
      memberships: [],
      parameter_acls: [],
    });

    const result = runTs(ROLE_BOOTSTRAP, [
      '--manifest',
      manifest,
      '--image-inventory',
      image,
      '--output',
      output,
    ]);

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    const sql = readFileSync(output, 'utf8');
    expect(sql).toContain(
      'GRANT "pg_read_all_data" TO "admin" WITH ADMIN FALSE, INHERIT TRUE, SET FALSE;'
    );
    expect(sql).toContain('GRANT SET ON PARAMETER "statement_timeout" TO PUBLIC;');
  });

  it('rejects string-only image roles instead of bypassing exact attribute equality', () => {
    const root = tempRoot();
    const manifest = join(root, 'source-manifest.json');
    const image = join(root, 'image-roles.json');
    const output = join(root, 'bootstrap.sql');
    writeJson(manifest, sourceManifest());
    writeJson(image, { roles: ['anon'], pg_participants: [], memberships: [], parameter_acls: [] });

    const result = runTs(ROLE_BOOTSTRAP, [
      '--manifest',
      manifest,
      '--image-inventory',
      image,
      '--output',
      output,
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('image.roles[0] must be an object');
    expect(existsSync(output)).toBe(false);
  });

  it('rejects missing or attribute-drifted pg_* participants', () => {
    const root = tempRoot();
    const manifest = join(root, 'source-manifest.json');
    const image = join(root, 'image-roles.json');
    const output = join(root, 'bootstrap.sql');
    const source = sourceManifest();
    const cutover = source.cutover_snapshot as {
      memberships: unknown[];
      pg_participants: unknown[];
    };
    const participant = role('pg_read_all_data');
    cutover.memberships.push({
      member: 'admin',
      role: 'pg_read_all_data',
      grantor: 'supabase_admin',
      admin_option: false,
      inherit_option: true,
      set_option: false,
    });
    cutover.pg_participants.push(participant);
    writeJson(manifest, source);
    writeJson(image, {
      roles: [
        role('anon'),
        role('authenticated'),
        role('postgres', { rolsuper: true, rolcanlogin: true, rolbypassrls: true }),
        role('supabase_admin', {
          rolsuper: true,
          rolcreaterole: true,
          rolcreatedb: true,
          rolcanlogin: true,
          rolbypassrls: true,
        }),
      ],
      pg_participants: [{ ...participant, rolinherit: false }],
      memberships: [],
      parameter_acls: [],
    });

    const result = runTs(ROLE_BOOTSTRAP, [
      '--manifest',
      manifest,
      '--image-inventory',
      image,
      '--output',
      output,
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('pg participant inventory drift');
    expect(existsSync(output)).toBe(false);
  });
});

describe('source manifest exact comparison', () => {
  it('captures canonical owner, ACL, comment, and security-label sets and hashes', () => {
    const script = manifestScript();

    for (const field of ['object_owners', 'object_acls', 'comments', 'security_labels']) {
      expect(script).toContain(`'${field}'`);
      expect(script).toContain(`catalog[\`\${key}_sha256\`]`);
    }
    expect(script).toContain('aclexplode');
    expect(script).toContain('pg_seclabel');
    expect(script).toContain('att.attacl');
    expect(script).toContain('objsubid');
    expect(script).toContain("c.relkind IN ('i','I')");
    for (const type of ['extension', 'constraint', 'trigger', 'policy', 'column', 'index']) {
      expect(script).toContain(`'${type}' object_type`);
    }
  });

  it('captures memberships involving builtin roles without treating builtin attributes as source roles', () => {
    const script = manifestScript();

    expect(script).not.toContain("member.rolname !~ '^pg_' AND granted.rolname !~ '^pg_'");
    expect(script).toContain("member.rolname !~ '^pg_' OR granted.rolname !~ '^pg_'");
    expect(script).toContain("rolname !~ '^pg_'");
  });

  it('accepts only the declared target database name difference and exact extension owners', () => {
    const root = tempRoot();
    const sourcePath = join(root, 'source.json');
    const targetPath = join(root, 'target.json');
    const source = sourceManifest();
    const target = structuredClone(source);
    const targetCutover = target.cutover_snapshot as {
      database: Record<string, unknown>;
      extensions: Array<Record<string, unknown>>;
    };
    targetCutover.database.name = 'restore_test';
    writeJson(sourcePath, source);
    writeJson(targetPath, target);

    const accepted = runTs(MANIFEST, [
      'compare',
      '--source',
      sourcePath,
      '--target',
      targetPath,
      '--view',
      'cutover_snapshot',
      '--target-database',
      'restore_test',
    ]);
    expect(
      accepted.status,
      `${accepted.error?.message ?? ''}\n${accepted.stdout}\n${accepted.stderr}`
    ).toBe(0);

    targetCutover.extensions[1].owner = 'postgres';
    writeJson(targetPath, target);
    const drift = runTs(MANIFEST, [
      'compare',
      '--source',
      sourcePath,
      '--target',
      targetPath,
      '--view',
      'cutover_snapshot',
      '--target-database',
      'restore_test',
    ]);
    expect(drift.status).not.toBe(0);
    expect(drift.stderr).toContain('manifest mismatch');
  });

  it('compares restored partition ancestry by stable identity while preserving source physical OIDs', () => {
    const root = tempRoot();
    const sourcePath = join(root, 'source-partitions.json');
    const targetPath = join(root, 'target-partitions.json');
    const source = sourceManifest();
    const sourceCutover = source.cutover_snapshot as Record<string, unknown>;
    sourceCutover.relations = [
      {
        schema: 'public',
        name: 'events',
        oid: 100,
        kind: 'p',
        parent_oid: null,
        owner: 'postgres',
        classification: 'authoritative',
      },
      {
        schema: 'public',
        name: 'events_2026',
        oid: 101,
        kind: 'r',
        parent_oid: 100,
        owner: 'postgres',
        classification: 'authoritative',
      },
    ];
    sourceCutover.relations_sha256 = 'source-physical-oid-hash';
    const target = structuredClone(source);
    const targetCutover = target.cutover_snapshot as {
      database: Record<string, unknown>;
      relations: Array<Record<string, unknown>>;
      relations_sha256: string;
    };
    targetCutover.database.name = 'restore_test';
    targetCutover.relations[0].oid = 900;
    targetCutover.relations[1].oid = 901;
    targetCutover.relations[1].parent_oid = 900;
    targetCutover.relations_sha256 = 'target-physical-oid-hash';
    writeJson(sourcePath, source);
    writeJson(targetPath, target);

    const accepted = runTs(MANIFEST, [
      'compare',
      '--source',
      sourcePath,
      '--target',
      targetPath,
      '--view',
      'cutover_snapshot',
      '--target-database',
      'restore_test',
    ]);
    expect(accepted.status, accepted.stderr).toBe(0);

    targetCutover.relations[1].parent_oid = null;
    writeJson(targetPath, target);
    const ancestryDrift = runTs(MANIFEST, [
      'compare',
      '--source',
      sourcePath,
      '--target',
      targetPath,
      '--view',
      'cutover_snapshot',
      '--target-database',
      'restore_test',
    ]);
    expect(ancestryDrift.status).not.toBe(0);
    expect(ancestryDrift.stderr).toContain('manifest mismatch');
  });

  it('rejects stale frozen physical OIDs even when guarded relation identities still match', async () => {
    const manifest = (await import(pathToFileURL(MANIFEST).href)) as {
      assertFrozenGuardedRelations: (
        expected: Array<Record<string, unknown>>,
        actual: Array<Record<string, unknown>>
      ) => void;
    };
    const expected = [
      {
        schema: 'public',
        name: 'events',
        oid: 100,
        relkind: 'p',
        parent_oid: null,
        owner: 'postgres',
      },
      {
        schema: 'public',
        name: 'events_2026',
        oid: 101,
        relkind: 'r',
        parent_oid: 100,
        owner: 'postgres',
      },
    ];
    const stalePhysicalOids = [
      {
        schema: 'public',
        name: 'events',
        oid: 900,
        kind: 'p',
        parent_oid: null,
        owner: 'postgres',
        classification: 'authoritative',
      },
      {
        schema: 'public',
        name: 'events_2026',
        oid: 901,
        kind: 'r',
        parent_oid: 900,
        owner: 'postgres',
        classification: 'authoritative',
      },
    ];

    expect(() => manifest.assertFrozenGuardedRelations(expected, stalePhysicalOids)).toThrow(
      'authoritative guarded relation set differs from frozen expected catalog'
    );
  });

  it('rejects column ACL/comment/label and index-owner drift by stable identity', () => {
    const root = tempRoot();
    const sourcePath = join(root, 'source-catalog.json');
    const targetPath = join(root, 'target-catalog.json');
    const source = sourceManifest();
    const view = source.cutover_snapshot as { catalog: Record<string, unknown[]> };
    view.catalog.object_owners = [
      { object_type: 'index', schema: 'public', identity: 'courses_pkey', owner: 'postgres' },
    ];
    view.catalog.object_acls = [
      {
        object_type: 'column',
        schema: 'public',
        identity: 'courses.id',
        grantor: 'postgres',
        grantee: 'authenticated',
        privilege: 'SELECT',
        grantable: false,
      },
    ];
    view.catalog.comments = [
      { object_type: 'column', schema: 'public', identity: 'courses.id', comment: 'id' },
    ];
    view.catalog.security_labels = [
      {
        object_type: 'column',
        schema: 'public',
        identity: 'courses.id',
        provider: 'dummy',
        label: 'trusted',
      },
    ];
    source.baseline = structuredClone(source.cutover_snapshot);
    const target = structuredClone(source);
    const targetView = target.cutover_snapshot as {
      database: Record<string, unknown>;
      catalog: Record<string, Array<Record<string, unknown>>>;
    };
    targetView.database.name = 'restore_test';
    // postgres and supabase_admin collapse into one platform-actor token
    // (.13.14 trusted provider plane), so the detected drift must target a
    // non-platform role.
    targetView.catalog.object_owners[0].owner = 'anon';
    writeJson(sourcePath, source);
    writeJson(targetPath, target);

    const result = runTs(MANIFEST, [
      'compare',
      '--source',
      sourcePath,
      '--target',
      targetPath,
      '--view',
      'cutover_snapshot',
      '--target-database',
      'restore_test',
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('manifest mismatch');
  });

  it('tolerates owner drift between the two platform-admin actors', () => {
    const root = tempRoot();
    const sourcePath = join(root, 'source-catalog.json');
    const targetPath = join(root, 'target-catalog.json');
    const source = sourceManifest();
    const view = source.cutover_snapshot as { catalog: Record<string, unknown[]> };
    view.catalog.object_owners = [
      { object_type: 'index', schema: 'public', identity: 'courses_pkey', owner: 'postgres' },
    ];
    source.baseline = structuredClone(source.cutover_snapshot);
    const target = structuredClone(source);
    const targetView = target.cutover_snapshot as {
      database: Record<string, unknown>;
      catalog: Record<string, Array<Record<string, unknown>>>;
    };
    targetView.database.name = 'restore_test';
    targetView.catalog.object_owners[0].owner = 'supabase_admin';
    writeJson(sourcePath, source);
    writeJson(targetPath, target);

    const result = runTs(MANIFEST, [
      'compare',
      '--source',
      sourcePath,
      '--target',
      targetPath,
      '--view',
      'cutover_snapshot',
      '--target-database',
      'restore_test',
    ]);

    expect(result.status, result.stderr).toBe(0);
  });

  it('requires exact cluster-global role, setting, membership, and parameter ACL equality before restore', () => {
    const root = tempRoot();
    const sourcePath = join(root, 'source.json');
    const inventoryPath = join(root, 'inventory.json');
    const source = sourceManifest();
    const cutover = source.cutover_snapshot as {
      roles: unknown[];
      role_settings: Array<{ database: string | null }>;
      memberships: unknown[];
      parameter_acls: unknown[];
    };
    writeJson(sourcePath, source);
    writeJson(inventoryPath, {
      roles: cutover.roles,
      pg_participants: cutover.pg_participants,
      role_settings: cutover.role_settings.filter(setting => setting.database === null),
      memberships: cutover.memberships,
      parameter_acls: cutover.parameter_acls,
    });

    const accepted = runTs(MANIFEST, [
      'verify-inventory',
      '--source',
      sourcePath,
      '--inventory',
      inventoryPath,
    ]);
    expect(accepted.status, `${accepted.stdout}\n${accepted.stderr}`).toBe(0);

    writeJson(inventoryPath, {
      roles: cutover.roles,
      pg_participants: cutover.pg_participants,
      role_settings: [
        ...cutover.role_settings,
        { role: 'anon', database: null, name: 'search_path', value: 'public' },
      ],
      memberships: cutover.memberships,
      parameter_acls: cutover.parameter_acls,
    });
    const drift = runTs(MANIFEST, [
      'verify-inventory',
      '--source',
      sourcePath,
      '--inventory',
      inventoryPath,
    ]);
    expect(drift.status).not.toBe(0);
    expect(drift.stderr).toContain('cluster-global inventory mismatch');
  });

  it('rejects an unexpected baseline-to-cutover delta before manifest publication', () => {
    const root = tempRoot();
    const manifestPath = join(root, 'transition.json');
    const manifest = sourceManifest();
    const baseline = manifest.baseline as Record<string, unknown>;
    const cutover = structuredClone(baseline);
    baseline.cron_jobs = Array.from({ length: 8 }, (_, index) => ({
      jobid: index + 1,
      active: true,
      command_sha256: `${index}`.padStart(64, '0'),
    }));
    cutover.cron_jobs = (baseline.cron_jobs as Array<Record<string, unknown>>).map(job => ({
      ...job,
      active: false,
    }));
    (cutover.database as { settings: unknown[] }).settings = [
      ['default_transaction_read_only', 'on'],
    ];
    cutover.server_version = 'unexpected-drift';
    manifest.cutover_snapshot = cutover;
    writeJson(manifestPath, manifest);

    const result = runTs(MANIFEST, ['verify-transition', '--manifest', manifestPath]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('unexpected baseline-to-cutover delta');
  });

  it('uses field-aware exact q12_guard delta sets and never hides unrelated prefix objects', () => {
    const script = manifestScript();
    expect(script).not.toContain("item.name.startsWith('q12_guard_')");
    expect(script).toContain(
      "const GUARD_TABLES = new Set(['active_run', 'baseline', 'migration_guards', 'probe'])"
    );
    expect(script).toContain("item.name === 'q12_guard_row' || item.name === 'q12_guard_truncate'");
    expect(script).toContain('extra q12_guard ${key} object');
    expect(script).toContain("item.definition.includes('q12_guard.enforce_write_barrier()')");
  });

  it('accepts only the complete exact guard object/ACL/trigger multiset', () => {
    const root = tempRoot();
    const path = join(root, 'transition.json');
    writeJson(path, exactGuardTransitionManifest());

    const accepted = runTs(MANIFEST, ['verify-transition', '--manifest', path]);

    expect(accepted.status, accepted.stderr).toBe(0);
  });

  it.each([
    ['function', (cutover: Record<string, any>) => cutover.catalog.functions.pop()],
    ['table', (cutover: Record<string, any>) => cutover.relations.pop()],
    ['ACL', (cutover: Record<string, any>) => cutover.catalog.object_acls.pop()],
    ['guard trigger', (cutover: Record<string, any>) => cutover.catalog.triggers.pop()],
    [
      'unrelated q12_guard prefix',
      (cutover: Record<string, any>) =>
        cutover.catalog.indexes.push({ schema: 'public', name: 'q12_guard_unrelated' }),
    ],
  ])('rejects a missing or unrelated %s transition object', (_label, mutate) => {
    const root = tempRoot();
    const path = join(root, 'transition.json');
    const manifest = exactGuardTransitionManifest();
    mutate(manifest.cutover_snapshot as Record<string, any>);
    writeJson(path, manifest);

    const result = runTs(MANIFEST, ['verify-transition', '--manifest', path]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('unexpected baseline-to-cutover delta');
  });
});

describe('Supabase-compatible isolated restore entrypoint', () => {
  it('never executes mutable sibling Docker lifecycle bytes before invalid-argv refusal', () => {
    const root = tempRoot();
    const restore = join(root, 'restore-supabase-drill.sh');
    const sibling = join(root, 'restore-docker-lifecycle.sh');
    const marker = join(root, 'executed-before-preflight');
    writeFileSync(restore, restoreScript(), { mode: 0o700 });
    chmodSync(restore, 0o700);
    writeFileSync(sibling, '#!/usr/bin/bash\n: >"$MC2_TAMPER_MARKER"\n', { mode: 0o700 });
    chmodSync(sibling, 0o700);

    const result = spawnSync('/usr/bin/bash', [restore, '--unsupported', 'value'], {
      env: { PATH: '/usr/bin:/bin', MC2_TAMPER_MARKER: marker },
      encoding: 'utf8',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('unsupported restore argument');
    expect(existsSync(marker)).toBe(false);
  });

  it('pins the approved linux/amd64 child image and exact isolated resource shape', () => {
    const script = restoreScript();

    expect(script).toContain(
      'public.ecr.aws/supabase/postgres@sha256:d00c45c73f9c3d130ea4f379d8ae7748b0711d628eea690d27d03198ed609f2f'
    );
    expect(script).toContain(
      'sha256:4c6d67181e482549bab276e8ae933f807be59ea1c371c225d85c189b0c14b9de'
    );
    expect(script).toContain(
      'network create --opt com.docker.network.bridge.enable_ip_masquerade=false'
    );
    expect(script).not.toContain('network create --internal');
    expect(script).toContain('127.0.0.1::5432');
    expect(script).toContain('/var/lib/postgresql/data');
    expect(script).toContain('POSTGRES_PASSWORD_FILE=/run/secrets/initial-password');
  });

  it('adopts only returned Docker resource identities before cleanup can remove them', () => {
    const script = restoreScript();
    const lifecycle = trackedDockerLifecycle();

    expect(script).not.toContain('source "$DOCKER_LIFECYCLE"');
    expect(script).toContain('create_restore_docker_resources');
    expect(lifecycle).toContain('>"$TEMP_ROOT/network-create.identity"');
    expect(lifecycle).toContain('>"$TEMP_ROOT/volume-create.identity"');
    expect(lifecycle).toContain('>"$TEMP_ROOT/container-create.identity"');
    expect(lifecycle.indexOf('restore_docker_fault_after_create network')).toBeLessThan(
      lifecycle.indexOf('IFS= read -r output <"$TEMP_ROOT/network-create.identity"')
    );
    expect(lifecycle).toContain('restore_docker_discover container');
    expect(lifecycle).toContain('restore_docker_resource_matches network');
    expect(lifecycle).toContain('"$DOCKER" volume rm --force -- "$identity"');
  });

  it.each(['network', 'volume', 'container'])(
    'cleans exact-label resources when interrupted after daemon %s create and retries safely',
    faultKind => {
      const root = tempRoot();
      const lifecycle = join(root, 'restore-docker-lifecycle-inline.sh');
      writeFileSync(lifecycle, trackedDockerLifecycle(), { mode: 0o600 });
      const state = join(root, 'docker-state');
      const fakeDocker = join(root, 'docker');
      mkdirSync(state, { mode: 0o700 });
      writeFileSync(
        fakeDocker,
        `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const state = process.env.FAKE_DOCKER_STATE;
const argv = process.argv.slice(2);
const records = () => fs.readdirSync(state).map(name => JSON.parse(fs.readFileSync(path.join(state, name), 'utf8')));
const labels = () => argv.flatMap((value, index) => value === '--label' ? [argv[index + 1]] : []).reduce((all, item) => { const split = item.indexOf('='); all[item.slice(0, split)] = item.slice(split + 1); return all; }, {});
const save = (kind, id, name) => fs.writeFileSync(path.join(state, kind + '-' + id), JSON.stringify({ kind, id, name, labels: labels() }));
const collision = name => records().some(item => item.name === name);
const create = (kind, id, name, output = id) => { if (collision(name)) process.exit(1); save(kind, id, name); process.stdout.write(output + '\\n'); };
const remove = (kind, id) => { const record = records().find(item => item.kind === kind && item.id === id); if (!record) process.exit(1); fs.unlinkSync(path.join(state, kind + '-' + id)); };
const filtered = kind => records().filter(item => item.kind === kind && argv.filter(value => value.startsWith('label=com.megacampus.q12.restore-')).every(filter => { const label = filter.slice(6); const split = label.indexOf('='); return item.labels[label.slice(0, split)] === label.slice(split + 1); }));
if (argv[0] === 'network' && argv[1] === 'create') create('network', 'a'.repeat(64), argv.at(-1));
else if (argv[0] === 'volume' && argv[1] === 'create') create('volume', argv.at(-1), argv.at(-1));
else if (argv[0] === 'run') create('container', 'c'.repeat(64), argv[argv.indexOf('--name') + 1]);
else if (argv[0] === 'ps') process.stdout.write(filtered('container').map(item => item.id).join('\\n') + (filtered('container').length ? '\\n' : ''));
else if (argv[0] === 'network' && argv[1] === 'ls') process.stdout.write(filtered('network').map(item => item.id).join('\\n') + (filtered('network').length ? '\\n' : ''));
else if (argv[0] === 'volume' && argv[1] === 'ls') process.stdout.write(filtered('volume').map(item => item.id).join('\\n') + (filtered('volume').length ? '\\n' : ''));
else if (argv[0] === 'inspect' || (argv[0] === 'network' && argv[1] === 'inspect') || (argv[0] === 'volume' && argv[1] === 'inspect')) { const id = argv.at(-1); const item = records().find(value => value.id === id); if (!item) process.exit(1); const name = item.kind === 'container' ? '/' + item.name : item.name; process.stdout.write(item.labels['com.megacampus.q12.restore-run'] + '|' + item.labels['com.megacampus.q12.restore-resource'] + '|' + name + '\\n'); }
else if (argv[0] === 'rm') remove('container', argv.at(-1));
else if (argv[0] === 'network' && argv[1] === 'rm') remove('network', argv.at(-1));
else if (argv[0] === 'volume' && argv[1] === 'rm') remove('volume', argv.at(-1));
else process.exit(2);
`,
        { mode: 0o700 }
      );
      chmodSync(fakeDocker, 0o700);
      const runId = '11111111-2222-4333-8444-555555555555';
      const harness = `set -Eeuo pipefail
DOCKER=$1
RUN_ID=$2
RESTORE_IMAGE=synthetic-image
TEMP_ROOT=$3
CONTAINER_ID=''
NETWORK_ID=''
VOLUME_NAME=''
source $4
trap 'cleanup_restore_docker_resources' EXIT HUP INT TERM
create_restore_docker_resources
trap - EXIT HUP INT TERM
cleanup_restore_docker_resources`;
      const interrupted = spawnSync(
        '/usr/bin/bash',
        ['-c', harness, 'g7-docker-harness', fakeDocker, runId, root, lifecycle],
        {
          env: {
            PATH: '/usr/bin:/bin',
            FAKE_DOCKER_STATE: state,
            MC2_RESTORE_FAULT_AFTER_CREATE: faultKind,
          },
          encoding: 'utf8',
        }
      );
      expect(interrupted.status).not.toBe(0);
      expect(readdirSync(state), interrupted.stderr).toEqual([]);

      const retry = spawnSync(
        '/usr/bin/bash',
        ['-c', harness, 'g7-docker-harness', fakeDocker, runId, root, lifecycle],
        { env: { PATH: '/usr/bin:/bin', FAKE_DOCKER_STATE: state }, encoding: 'utf8' }
      );
      expect(retry.status, retry.stderr).toBe(0);
      expect(readdirSync(state)).toEqual([]);
    }
  );

  it('preserves an unlabeled foreign Docker resource that collides with the deterministic name', () => {
    const root = tempRoot();
    const lifecycle = join(root, 'restore-docker-lifecycle-inline.sh');
    writeFileSync(lifecycle, trackedDockerLifecycle(), { mode: 0o600 });
    const state = join(root, 'docker-state');
    mkdirSync(state, { mode: 0o700 });
    const runId = '11111111-2222-4333-8444-555555555555';
    const foreignId = 'f'.repeat(64);
    writeJson(join(state, `network-${foreignId}`), {
      kind: 'network',
      id: foreignId,
      name: `mc2-supabase-restore-net-${runId}`,
      labels: {},
    });
    const fakeDocker = join(root, 'docker');
    writeFileSync(
      fakeDocker,
      `#!${process.execPath}
const fs=require('node:fs'); const path=require('node:path'); const state=process.env.FAKE_DOCKER_STATE; const argv=process.argv.slice(2); const records=()=>fs.readdirSync(state).map(name=>JSON.parse(fs.readFileSync(path.join(state,name),'utf8'))); if(argv[0]==='network'&&argv[1]==='create') process.exit(1); if(argv[0]==='network'&&argv[1]==='ls') process.exit(0); process.exit(2);`,
      { mode: 0o700 }
    );
    chmodSync(fakeDocker, 0o700);
    const result = spawnSync(
      '/usr/bin/bash',
      [
        '-c',
        `set -Eeuo pipefail; DOCKER=$1; RUN_ID=$2; RESTORE_IMAGE=x; TEMP_ROOT=$3; CONTAINER_ID=''; NETWORK_ID=''; VOLUME_NAME=''; source $4; trap 'cleanup_restore_docker_resources' EXIT; create_restore_docker_resources`,
        'g7-foreign-harness',
        fakeDocker,
        runId,
        root,
        lifecycle,
      ],
      { env: { PATH: '/usr/bin:/bin', FAKE_DOCKER_STATE: state }, encoding: 'utf8' }
    );
    expect(result.status).not.toBe(0);
    expect(readdirSync(state)).toEqual([`network-${foreignId}`]);
  });

  it('restores in one strict transaction as direct supabase_admin without owner or ACL suppression', () => {
    const script = restoreScript();

    expect(script).toContain("PG_RESTORE='/usr/lib/postgresql/17/bin/pg_restore'");
    expect(script).toContain('--exit-on-error');
    expect(script).toContain('--single-transaction');
    expect(script).toContain('--username=supabase_admin');
    expect(script).toContain('session_user = current_user');
    expect(script).toContain('default_transaction_read_only=off');
    expect(script).not.toContain('--no-owner');
    expect(script).not.toContain('--no-acl');
  });

  it('uses isolated cron overrides then compares cutover and cleaned baseline manifests', () => {
    const script = restoreScript();

    expect(script).toContain('cron.database_name=restore_test');
    expect(script).toContain('cron.launch_active_jobs=off');
    expect(script).toContain('prove_isolated_settings');
    expect(script).toContain("current_setting('cron.database_name')");
    expect(script).toContain("current_setting('cron.launch_active_jobs')");
    expect(script).toContain('--view cutover_snapshot');
    expect(script).toContain('--view baseline');
    expect(script.indexOf('--view cutover_snapshot')).toBeLessThan(
      script.indexOf('--view baseline')
    );
  });

  it('authenticates cleanup directly as synthetic postgres and sets the capability for the session', () => {
    const script = restoreScript();

    expect(existsSync(CLEANUP_HELPER)).toBe(true);
    const helper = existsSync(CLEANUP_HELPER) ? readFileSync(CLEANUP_HELPER, 'utf8') : '';
    expect(helper).toContain("SELECT set_config('megacampus.q12_capability', $1, false)");
    expect(helper).toContain(
      'SELECT run_id::text, expected_catalog_sha256, activated FROM q12_guard.verify_capability()'
    );
    expect(helper).toContain("current_setting('transaction_read_only')");
    expect(script).not.toContain('\\set q12_capability');
    expect(script).not.toContain('escaped_capability');
    expect(script).toContain('cleanup failure overrides restore success');
  });

  it('never places the raw capability in SQL text or the nonsecret result', async () => {
    expect(existsSync(CLEANUP_HELPER)).toBe(true);
    if (!existsSync(CLEANUP_HELPER)) return;
    const module = (await import(`${pathToFileURL(CLEANUP_HELPER).href}?test=${Date.now()}`)) as {
      runCleanupSession: (
        client: { query: (config: { text: string; values?: unknown[] }) => Promise<unknown> },
        input: { capability: string; cleanupSql: string; runId: string }
      ) => Promise<{ database_barrier_expected_catalog_sha256: string }>;
    };
    const capability = 'synthetic-capability-must-never-appear-in-sql-or-output';
    const statements: Array<{ text: string; values?: unknown[] }> = [];
    const expectedHash = 'a'.repeat(64);
    const client = {
      query(config: { text: string; values?: unknown[] }): Promise<unknown> {
        statements.push(config);
        if (config.text.includes('verify_capability')) {
          return Promise.resolve({
            rows: [
              {
                run_id: '11111111-2222-4333-8444-555555555555',
                expected_catalog_sha256: expectedHash,
                activated: false,
              },
            ],
          });
        }
        if (config.text.includes('session_user')) {
          return Promise.resolve({ rows: [{ direct_postgres: true, read_write: true }] });
        }
        return Promise.resolve({ rows: [] });
      },
    };

    const result = await module.runCleanupSession(client, {
      capability,
      cleanupSql: 'BEGIN; SELECT 1; COMMIT;',
      runId: '11111111-2222-4333-8444-555555555555',
    });

    expect(statements[0]?.values).toEqual([capability]);
    expect(statements.map(statement => statement.text).join('\n')).not.toContain(capability);
    expect(JSON.stringify(result)).not.toContain(capability);
    expect(result.database_barrier_expected_catalog_sha256).toBe(expectedHash);
  });

  it('proves exact pgtle package/control versions before archive restore', () => {
    const script = restoreScript();

    expect(script).toContain('basejump-supabase_test_helpers=0.0.6');
    expect(script).toContain('supabase-dbdev=0.0.5');
    expect(script.indexOf('basejump-supabase_test_helpers=0.0.6')).toBeLessThan(
      script.indexOf('strict archive restore failed')
    );
  });

  it('accepts exactly one context-bound pgTLE control and SQL function per frozen package', () => {
    const sql = `CREATE FUNCTION pgtle."basejump-supabase_test_helpers.control"() RETURNS text
LANGUAGE sql AS $body$
default_version = '0.0.6'
$body$;
CREATE FUNCTION pgtle."basejump-supabase_test_helpers--0.0.6.sql"() RETURNS text LANGUAGE sql AS $body$SELECT 'ok'$body$;
CREATE FUNCTION pgtle."supabase-dbdev.control"() RETURNS text
LANGUAGE sql AS $body$
default_version = '0.0.5'
$body$;
CREATE FUNCTION pgtle."supabase-dbdev--0.0.5.sql"() RETURNS text LANGUAGE sql AS $body$SELECT 'ok'$body$;
`;
    const result = spawnSync('/usr/bin/python3', [PGTLE_SCANNER], { input: sql, encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
  });

  it('accepts the real installed pgTLE version chain and upgrade scripts', () => {
    // pg_tle retains every installed version plus upgrade scripts; the live
    // source carries basejump 0.0.1..0.0.6 and dbdev 0.0.2..0.0.5 chains, and
    // pg_dump renders control bodies as a mid-line nested dollar quote.
    const sql = `CREATE FUNCTION pgtle."basejump-supabase_test_helpers.control"() RETURNS text
    LANGUAGE sql
    AS $_X$SELECT $_pgtle_i_$default_version = '0.0.6'
comment = 'A collection of functions designed to make testing easier'
relocatable = false
requires = 'pgtap,pg_tle'
$_pgtle_i_$$_X$;
CREATE FUNCTION pgtle."basejump-supabase_test_helpers--0.0.1.sql"() RETURNS text LANGUAGE sql AS $body$SELECT 'ok'$body$;
CREATE FUNCTION pgtle."basejump-supabase_test_helpers--0.0.1--0.0.2.sql"() RETURNS text LANGUAGE sql AS $body$SELECT 'ok'$body$;
CREATE FUNCTION pgtle."basejump-supabase_test_helpers--0.0.4--0.0.6.sql"() RETURNS text LANGUAGE sql AS $body$SELECT 'ok'$body$;
CREATE FUNCTION pgtle."basejump-supabase_test_helpers--0.0.6.sql"() RETURNS text LANGUAGE sql AS $body$SELECT 'ok'$body$;
CREATE FUNCTION pgtle."supabase-dbdev.control"() RETURNS text
LANGUAGE sql AS $body$
default_version = '0.0.5'
$body$;
CREATE FUNCTION pgtle."supabase-dbdev--0.0.2.sql"() RETURNS text LANGUAGE sql AS $body$SELECT 'ok'$body$;
CREATE FUNCTION pgtle."supabase-dbdev--0.0.5.sql"() RETURNS text LANGUAGE sql AS $body$SELECT 'ok'$body$;
`;
    const result = spawnSync('/usr/bin/python3', [PGTLE_SCANNER], { input: sql, encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
  });

  it.each([
    ['unrelated comment', `-- basejump-supabase_test_helpers 0.0.6\n-- supabase-dbdev 0.0.5\n`],
    [
      'duplicate control',
      `CREATE FUNCTION pgtle."basejump-supabase_test_helpers.control"() RETURNS text LANGUAGE sql AS $x$default_version = '0.0.6'$x$;\nCREATE FUNCTION pgtle."basejump-supabase_test_helpers.control"() RETURNS text LANGUAGE sql AS $x$default_version = '0.0.6'$x$;\nCREATE FUNCTION pgtle."basejump-supabase_test_helpers--0.0.6.sql"() RETURNS text LANGUAGE sql AS $x$x$;\nCREATE FUNCTION pgtle."supabase-dbdev.control"() RETURNS text LANGUAGE sql AS $x$default_version = '0.0.5'$x$;\nCREATE FUNCTION pgtle."supabase-dbdev--0.0.5.sql"() RETURNS text LANGUAGE sql AS $x$x$;\n`,
    ],
    [
      'duplicate pinned version script',
      `CREATE FUNCTION pgtle."basejump-supabase_test_helpers.control"() RETURNS text LANGUAGE sql AS $x$default_version = '0.0.6'$x$;\nCREATE FUNCTION pgtle."basejump-supabase_test_helpers--0.0.6.sql"() RETURNS text LANGUAGE sql AS $x$x$;\nCREATE FUNCTION pgtle."basejump-supabase_test_helpers--0.0.6.sql"() RETURNS text LANGUAGE sql AS $x$x$;\nCREATE FUNCTION pgtle."supabase-dbdev.control"() RETURNS text LANGUAGE sql AS $x$default_version = '0.0.5'$x$;\nCREATE FUNCTION pgtle."supabase-dbdev--0.0.5.sql"() RETURNS text LANGUAGE sql AS $x$x$;\n`,
    ],
    [
      'context confusion',
      `CREATE FUNCTION pgtle."basejump-supabase_test_helpers.control"() RETURNS text LANGUAGE sql AS $body$SELECT 'missing'$body$;\n-- default_version = '0.0.6'\nCREATE FUNCTION public.unrelated() RETURNS text LANGUAGE sql AS $body$\ndefault_version = '0.0.6'\n$body$;\nCREATE FUNCTION pgtle."basejump-supabase_test_helpers--0.0.6.sql"() RETURNS text LANGUAGE sql AS $body$SELECT 'ok'$body$;\nCREATE FUNCTION pgtle."supabase-dbdev.control"() RETURNS text LANGUAGE sql AS $body$\ndefault_version = '0.0.5'\n$body$;\nCREATE FUNCTION pgtle."supabase-dbdev--0.0.5.sql"() RETURNS text LANGUAGE sql AS $body$SELECT 'ok'$body$;\n`,
    ],
  ])('rejects pgTLE evidence from %s', (_label, sql) => {
    const result = spawnSync('/usr/bin/python3', [PGTLE_SCANNER], { input: sql, encoding: 'utf8' });
    expect(result.status).not.toBe(0);
  });

  it('cleans an unadopted temp directory when the parent is signalled', async () => {
    expect(existsSync(TEMP_HELPER)).toBe(true);
    if (!existsSync(TEMP_HELPER)) return;
    const root = tempRoot();
    const observer = join(root, 'created-path');
    const harness = spawn(
      '/usr/bin/bash',
      [
        '-c',
        `set -Eeuo pipefail
trap 'exit 143' TERM
coproc MC2_TEMP { /usr/bin/python3 "$1" --parent /tmp --prefix mc2-supabase-restore-signal-test-; }
IFS= read -r candidate <&"\${MC2_TEMP[0]}"
printf '%s\\n' "$candidate" >"$2"
kill -TERM $$
printf 'adopt\\n' >&"\${MC2_TEMP[1]}"`,
        'signal-harness',
        TEMP_HELPER,
        observer,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    await once(harness, 'close');
    const created = readFileSync(observer, 'utf8').trim();
    for (let attempt = 0; attempt < 50 && existsSync(created); attempt += 1) {
      await new Promise(resolvePromise => setTimeout(resolvePromise, 10));
    }
    expect(existsSync(created)).toBe(false);
  });

  it.each(['directory', 'file'])(
    'cleans a %s when signalled after creation but before ownership assignment',
    kind => {
      const prefix = `mc2-supabase-restore-post-create-${kind}-${process.pid}-`;
      const result = spawnSync(
        '/usr/bin/python3',
        [TEMP_HELPER, '--parent', '/tmp', '--prefix', prefix, '--kind', kind],
        {
          env: { PATH: '/usr/bin:/bin', MC2_PRIVATE_TEMP_TEST_SIGNAL_AFTER_CREATE: '1' },
          encoding: 'utf8',
        }
      );
      expect(result.status).not.toBe(0);
      expect(readdirSync('/tmp').filter(name => name.startsWith(prefix))).toEqual([]);
    }
  );
});
