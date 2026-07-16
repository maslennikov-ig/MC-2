import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const OPERATOR = resolve(REPO_ROOT, 'deploy/postgres/backup-supabase.sh');
const TEST_MODE = 'mc2-synthetic-local-backup-test-only';
const roots: string[] = [];

interface Fixture {
  root: string;
  backupParent: string;
  backupDir: string;
  urlFile: string;
  caFile: string;
  argsLog: string;
  restoreArgsLog: string;
  identityLog: string;
  substituteHook: string;
  readyFile: string;
  releaseFile: string;
  pgDump: string;
  pgDumpall: string;
  pgRestore: string;
  manifestGenerator: string;
  rolesArgsLog: string;
  rolesCounter: string;
  manifestArgsLog: string;
  env: NodeJS.ProcessEnv;
}

function executable(path: string, contents: string): void {
  writeFileSync(path, contents, { mode: 0o700 });
  chmodSync(path, 0o700);
}

function fixture(): Fixture {
  const root = mkdtempSync('/tmp/mc2-supabase-backup-');
  roots.push(root);
  chmodSync(root, 0o700);
  const backupParent = join(root, 'backup-parent');
  const backupDir = join(backupParent, 'backups');
  const secretDir = join(root, 'secrets');
  const binDir = join(root, 'bin');
  for (const directory of [backupParent, backupDir, secretDir, binDir]) {
    mkdirSync(directory, { mode: 0o700 });
    chmodSync(directory, 0o700);
  }

  const caFile = join(secretDir, 'prod-ca-2021.crt');
  const urlFile = join(secretDir, 'supabase-db-url');
  const baselineFile = join(secretDir, 'baseline.json');
  const expectedCatalogFile = join(secretDir, 'expected-post-migration-catalog.json');
  const password = 'synthetic-password-never-log';
  const databaseUrl =
    `postgresql://postgres.test:${password}@db.example.test:5432/postgres` +
    `?sslmode=verify-full&sslrootcert=${caFile}`;
  writeFileSync(caFile, 'synthetic CA only\n', { mode: 0o400 });
  writeFileSync(urlFile, `${databaseUrl}\n`, { mode: 0o600 });
  chmodSync(caFile, 0o400);
  chmodSync(urlFile, 0o600);
  writeFileSync(baselineFile, '{"baseline":{}}\n', { mode: 0o600 });
  writeFileSync(
    expectedCatalogFile,
    '{"schema_version":"megacampus.q12.expected-post-migration-catalog/v1"}\n',
    { mode: 0o400 }
  );
  chmodSync(baselineFile, 0o600);
  chmodSync(expectedCatalogFile, 0o400);

  const argsLog = join(root, 'pg-dump-args');
  const restoreArgsLog = join(root, 'pg-restore-args');
  const identityLog = join(root, 'pg-dump-identity');
  const readyFile = join(root, 'dump-ready');
  const releaseFile = join(root, 'dump-release');
  const pgDump = join(binDir, 'pg_dump');
  const pgDumpall = join(binDir, 'pg_dumpall');
  const pgRestore = join(binDir, 'pg_restore');
  const manifestGenerator = join(binDir, 'q12-source-manifest');
  const substituteHook = join(binDir, 'substitute-input');
  const rolesArgsLog = join(root, 'roles-args');
  const rolesCounter = join(root, 'roles-counter');
  const manifestArgsLog = join(root, 'manifest-args');

  executable(
    pgDump,
    `#!/usr/bin/env bash
set -eu
if [[ "\${1:-}" == --version && "$#" -eq 1 ]]; then
  printf 'pg_dump (PostgreSQL) %s\\n' "\${FAKE_PG_DUMP_VERSION:-17.7}"
  exit 0
fi
printf '%s\\n' "$*" > "$FAKE_ARGS_LOG"
[[ -z "\${FAKE_DUMP_STDERR:-}" ]] || printf '%s\\n' "$FAKE_DUMP_STDERR" >&2
[[ "\${PGSSLROOTCERT:-}" == /proc/self/fd/* ]] || exit 94
[[ -r "$PGSSLROOTCERT" ]] || exit 95
[[ -z "\${PGDATABASE:-}" ]] || exit 96
[[ "\${PGSERVICE:-}" == mc2_supabase_backup ]] || exit 97
[[ -r "\${PGSERVICEFILE:-}" ]] || exit 99
/usr/bin/grep -Fq "sslrootcert=$PGSSLROOTCERT" "$PGSERVICEFILE" || exit 100
! /usr/bin/grep -Fq "$FAKE_ORIGINAL_CA_PATH" "$PGSERVICEFILE" || exit 101
[[ -z "\${FAKE_SERVICE_FILE_COPY:-}" ]] || /usr/bin/cp "$PGSERVICEFILE" "$FAKE_SERVICE_FILE_COPY"
printf 'ca_fd=yes\\nurl_ca_fd=yes\\nca_content=%s\\n' "$(/usr/bin/cat "$PGSSLROOTCERT")" > "$FAKE_IDENTITY_LOG"
output=''
for argument in "$@"; do
  case "$argument" in
    --file=*) output="\${argument#--file=}" ;;
  esac
done
[[ -n "$output" ]] || exit 91
case "\${FAKE_DUMP_MODE:-success}" in
  failure)
    printf 'synthetic pg_dump failure\\n' >&2
    printf 'masked-partial' > "$output"
    exit 17
    ;;
  validation-failure)
    printf 'PGDMP' > "$output"
    /usr/bin/dd if=/dev/zero bs=2048 count=1 status=none >> "$output"
    ;;
  wait)
    printf 'PGDMP' > "$output"
    /usr/bin/dd if=/dev/zero bs=2048 count=1 status=none >> "$output"
    : > "$FAKE_READY_FILE"
    while [[ ! -e "$FAKE_RELEASE_FILE" ]]; do /usr/bin/sleep 0.02; done
    ;;
  crash)
    printf 'synthetic abrupt diagnostic\\n' >&2
    printf 'PGDMP-partial' > "$output"
    /usr/bin/kill -KILL "$PPID"
    ;;
  success)
    printf 'PGDMP' > "$output"
    /usr/bin/dd if=/dev/zero bs=2048 count=1 status=none >> "$output"
    ;;
  *) exit 92 ;;
esac
`
  );

  executable(
    pgDumpall,
    `#!/usr/bin/env bash
set -eu
if [[ "\${1:-}" == --version && "$#" -eq 1 ]]; then
  printf 'pg_dumpall (PostgreSQL) %s\\n' "\${FAKE_PG_DUMPALL_VERSION:-17.7}"
  exit 0
fi
printf '%s\\n' "$*" >> "$FAKE_ROLES_ARGS_LOG"
count=0
[[ ! -f "$FAKE_ROLES_COUNTER" ]] || count="$(/usr/bin/cat "$FAKE_ROLES_COUNTER")"
count=$((count + 1))
printf '%s' "$count" > "$FAKE_ROLES_COUNTER"
if [[ "\${FAKE_ROLES_LAYOUT:-synthetic}" == realistic ]]; then
  printf '%s\\n' '--' '-- PostgreSQL database cluster dump' '--'
  printf '\\n'
fi
printf '%s\\n' '\\restrict mc2nonce'
printf '%s\\n' 'CREATE ROLE admin NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT LOGIN;'
if [[ "\${FAKE_ROLES_LAYOUT:-synthetic}" == realistic ]]; then
  printf '\\n%s\\n' '-- Roles' '--'
fi
if [[ "\${FAKE_ROLES_DRIFT:-0}" == 1 && "$count" -eq 2 ]]; then
  printf '%s\\n' 'ALTER ROLE admin CONNECTION LIMIT 7;'
fi
printf '%s\\n' '\\unrestrict mc2nonce'
if [[ "\${FAKE_ROLES_LAYOUT:-synthetic}" == realistic ]]; then
  printf '\\n%s\\n' '--' '-- PostgreSQL database cluster dump complete' '--' ''
fi
`
  );

  executable(
    manifestGenerator,
    `#!/usr/bin/env bash
set -eu
printf '%s\\n' "$*" > "$FAKE_MANIFEST_ARGS_LOG"
output=''
snapshot=''
while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --output) output="$2"; shift 2 ;;
    --snapshot) snapshot="$2"; shift 2 ;;
    *) shift ;;
  esac
done
[[ -n "$output" && -n "$snapshot" ]] || exit 91
printf '{"schema":"megacampus.supabase-source-manifest/v1","snapshot_id":"%s","baseline":{},"cutover_snapshot":{}}\\n' "$snapshot" > "$output"
`
  );

  executable(
    pgRestore,
    `#!/usr/bin/env bash
set -eu
if [[ "\${1:-}" == --version && "$#" -eq 1 ]]; then
  printf 'pg_restore (PostgreSQL) %s\\n' "\${FAKE_PG_RESTORE_VERSION:-17.7}"
  exit 0
fi
if [[ -n "\${PGDATABASE:-}" ]]; then
  printf 'pg_restore list must not receive database credentials\\n' >&2
  exit 93
fi
printf '%s\\n' "$*" >> "$FAKE_RESTORE_ARGS_LOG"
if [[ "\${FAKE_RESTORE_MODE:-success}" == list-failure && "$*" == *--list* ]]; then
  printf 'synthetic pg_restore failure\\n' >&2
  exit 23
fi
if [[ "\${FAKE_RESTORE_MODE:-success}" == traversal-failure && "$*" == *--file=/dev/null* ]]; then
  printf 'synthetic full traversal failure\\n' >&2
  exit 42
fi
if [[ "\${FAKE_RESTORE_MODE:-success}" == list-stderr && "$*" == *--list* ]]; then
  printf 'synthetic list warning\\n' >&2
fi
if [[ "\${FAKE_RESTORE_MODE:-success}" == traversal-stderr && "$*" == *--file=/dev/null* ]]; then
  printf 'synthetic traversal warning\\n' >&2
fi
if [[ "$*" == *--list* ]]; then
  printf '; Archive created by synthetic test\\n'
  printf '1; 1259 16384 TABLE public synthetic postgres\\n'
elif [[ "$*" != *--file=/dev/null* ]]; then
  exit 98
fi
`
  );

  executable(
    substituteHook,
    `#!/usr/bin/env bash
set -eu
/usr/bin/mv -- "$FAKE_SUBSTITUTE_PATH" "$FAKE_SUBSTITUTE_PATH.opened"
if [[ "\${FAKE_SUBSTITUTE_KIND:-file}" == directory ]]; then
  /usr/bin/mkdir -m "$FAKE_SUBSTITUTE_MODE" "$FAKE_SUBSTITUTE_PATH"
elif [[ "\${FAKE_SUBSTITUTE_KIND:-file}" == symlink ]]; then
  /usr/bin/ln -s "$FAKE_SUBSTITUTE_PATH.opened" "$FAKE_SUBSTITUTE_PATH"
else
  printf '%s\\n' 'synthetic substituted input' > "$FAKE_SUBSTITUTE_PATH"
  /usr/bin/chmod "$FAKE_SUBSTITUTE_MODE" "$FAKE_SUBSTITUTE_PATH"
fi
`
  );

  return {
    root,
    backupParent,
    backupDir,
    urlFile,
    caFile,
    argsLog,
    restoreArgsLog,
    identityLog,
    substituteHook,
    readyFile,
    releaseFile,
    pgDump,
    pgDumpall,
    pgRestore,
    manifestGenerator,
    rolesArgsLog,
    rolesCounter,
    manifestArgsLog,
    env: {
      PATH: '/usr/bin:/bin',
      SUPABASE_BACKUP_URL_FILE: urlFile,
      SUPABASE_BACKUP_CA_FILE: caFile,
      SUPABASE_BACKUP_DIR: backupDir,
      SUPABASE_BACKUP_RETENTION_DAYS: '7',
      MC2_SUPABASE_BACKUP_TEST_MODE: TEST_MODE,
      MC2_SUPABASE_BACKUP_TEST_ROOT: root,
      MC2_SUPABASE_BACKUP_TEST_PG_DUMP: pgDump,
      MC2_SUPABASE_BACKUP_TEST_PG_DUMPALL: pgDumpall,
      MC2_SUPABASE_BACKUP_TEST_PG_RESTORE: pgRestore,
      MC2_SUPABASE_BACKUP_TEST_MANIFEST_GENERATOR: manifestGenerator,
      MC2_SUPABASE_BACKUP_TEST_BASELINE_FILE: baselineFile,
      MC2_SUPABASE_BACKUP_TEST_EXPECTED_CATALOG_FILE: expectedCatalogFile,
      FAKE_ARGS_LOG: argsLog,
      FAKE_RESTORE_ARGS_LOG: restoreArgsLog,
      FAKE_IDENTITY_LOG: identityLog,
      FAKE_ORIGINAL_CA_PATH: caFile,
      FAKE_READY_FILE: readyFile,
      FAKE_RELEASE_FILE: releaseFile,
      FAKE_ROLES_ARGS_LOG: rolesArgsLog,
      FAKE_ROLES_COUNTER: rolesCounter,
      FAKE_MANIFEST_ARGS_LOG: manifestArgsLog,
    },
  };
}

function run(item: Fixture, extra: NodeJS.ProcessEnv = {}): ReturnType<typeof spawnSync> {
  return spawnSync(
    '/usr/bin/bash',
    [
      OPERATOR,
      '--q12-run-id',
      '11111111-2222-4333-8444-555555555555',
      '--snapshot',
      '00000003-0000001B-1',
    ],
    {
      env: { ...item.env, ...extra },
      encoding: 'utf8',
    }
  );
}

function published(directory: string): string[] {
  return generationNames(directory);
}

function generationNames(directory: string): string[] {
  return readdirSync(directory).filter(name =>
    /^generation-\d{8}T\d{6}Z-[0-9a-f-]{36}$/.test(name)
  );
}

function cloneCompleteGeneration(
  item: Fixture,
  sourceName: string,
  targetName: string,
  committed: boolean
): string {
  const target = join(item.backupDir, targetName);
  cpSync(join(item.backupDir, sourceName), target, { recursive: true });
  chmodSync(target, 0o700);
  for (const name of readdirSync(target)) chmodSync(join(target, name), 0o600);
  const checksumsPath = join(target, 'checksums.json');
  const checksums = JSON.parse(readFileSync(checksumsPath, 'utf8')) as Record<string, unknown>;
  checksums.generation = targetName;
  writeFileSync(checksumsPath, `${JSON.stringify(checksums)}\n`, { mode: 0o600 });
  chmodSync(checksumsPath, 0o600);
  if (committed) {
    const receipt = join(item.backupDir, '.committed', targetName);
    writeFileSync(receipt, `${targetName}\n`, { mode: 0o600 });
    chmodSync(receipt, 0o600);
  }
  return target;
}

function generationRun(
  item: Fixture,
  extra: NodeJS.ProcessEnv = {},
  args: string[] = [
    '--q12-run-id',
    '11111111-2222-4333-8444-555555555555',
    '--snapshot',
    '00000003-0000001B-1',
  ]
): ReturnType<typeof spawnSync> {
  return spawnSync('/usr/bin/bash', [OPERATOR, ...args], {
    env: {
      ...item.env,
      ...extra,
    },
    encoding: 'utf8',
  });
}

async function waitFor(path: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!existsSync(path)) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${path}`);
    await new Promise(resolvePromise => setTimeout(resolvePromise, 20));
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('fail-closed Supabase backup operator', () => {
  it('pins the production pair to explicit PostgreSQL 17 commands while confining test overrides', () => {
    const operator = readFileSync(OPERATOR, 'utf8');

    expect(operator.startsWith('#!/usr/bin/bash\n')).toBe(true);
    expect(operator).toContain('export LC_ALL=C');
    expect(operator).toContain("readonly REQUIRED_PG_MAJOR='17'");
    expect(operator).toContain("PG_DUMP='/usr/lib/postgresql/17/bin/pg_dump'");
    expect(operator).toContain("PG_RESTORE='/usr/lib/postgresql/17/bin/pg_restore'");
    expect(operator).toContain("require_test_command 'pg_dump'");
    expect(operator).toContain('[[ -x "$PG_DUMP" ]]');
    expect(operator).toContain('[[ -x "$PG_RESTORE" ]]');
    const main = operator.slice(operator.indexOf('main() {'));
    expect(main.indexOf('configure_commands')).toBeLessThan(
      main.indexOf("open_validated_input 'URL credential'")
    );
    expect(main.indexOf('configure_commands')).toBeLessThan(
      main.indexOf("open_validated_input 'CA'")
    );
  });

  it('rejects the synthetic retention clock outside the exact protected test mode', () => {
    const result = spawnSync(
      '/usr/bin/bash',
      [
        OPERATOR,
        '--q12-run-id',
        '11111111-2222-4333-8444-555555555555',
        '--snapshot',
        '00000003-0000001B-1',
      ],
      {
        env: {
          PATH: '/usr/bin:/bin',
          MC2_SUPABASE_BACKUP_TEST_NOW_EPOCH: '1901234567',
        },
        encoding: 'utf8',
      }
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('test retention clock requires the exact protected test mode');
  });

  it('fails before credential handling when a protected client command is absent', () => {
    const item = fixture();
    rmSync(item.pgRestore);
    rmSync(item.urlFile);

    const result = run(item);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('pg_restore test override must be a regular non-symlink file');
    expect(result.stderr).not.toContain('URL credential file');
    expect(existsSync(item.argsLog)).toBe(false);
  });

  it('rejects a same-major PostgreSQL 18 pair before credential handling or pg_dump', () => {
    const item = fixture();
    rmSync(item.urlFile);

    const result = run(item, {
      FAKE_PG_DUMP_VERSION: '18.1',
      FAKE_PG_RESTORE_VERSION: '18.1',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('pg_dump must report required PostgreSQL major 17');
    expect(result.stderr).not.toContain('URL credential file');
    expect(existsSync(item.argsLog)).toBe(false);
  });

  it('rejects mismatched PostgreSQL client majors before credential handling or pg_dump', () => {
    const item = fixture();
    rmSync(item.urlFile);

    const result = run(item, {
      FAKE_PG_DUMP_VERSION: '17.7',
      FAKE_PG_RESTORE_VERSION: '18.1',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('pg_dump and pg_restore must report the same PostgreSQL major');
    expect(result.stderr).not.toContain('URL credential file');
    expect(existsSync(item.argsLog)).toBe(false);
  });

  it('rejects multiline pg_dump version output before credential handling or pg_dump', () => {
    const item = fixture();
    rmSync(item.urlFile);
    rmSync(item.caFile);

    const result = run(item, {
      FAKE_PG_DUMP_VERSION: '17.7\nunexpected second line',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('pg_dump version output is invalid');
    expect(result.stderr).not.toContain('URL credential file');
    expect(result.stderr).not.toContain('CA file');
    expect(existsSync(item.argsLog)).toBe(false);
    expect(existsSync(item.restoreArgsLog)).toBe(false);
  });

  it('rejects multiline pg_restore version output before credential handling or pg_dump', () => {
    const item = fixture();
    rmSync(item.urlFile);
    rmSync(item.caFile);

    const result = run(item, {
      FAKE_PG_RESTORE_VERSION: '17.7\r\nunexpected second line',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('pg_restore version output is invalid');
    expect(result.stderr).not.toContain('URL credential file');
    expect(result.stderr).not.toContain('CA file');
    expect(existsSync(item.argsLog)).toBe(false);
    expect(existsSync(item.restoreArgsLog)).toBe(false);
  });

  it('accepts canonical PostgreSQL 17 versions with a same-line packaging suffix', () => {
    const item = fixture();
    const version = '17.7 (Ubuntu 17.7-1.pgdg24.04+1)';

    const result = run(item, {
      FAKE_PG_DUMP_VERSION: version,
      FAKE_PG_RESTORE_VERSION: version,
    });

    expect(result.status).toBe(0);
    expect(published(item.backupDir)).toHaveLength(1);
  });

  it('reproduces the masked gzip pipeline bug and refuses to publish a failed pg_dump', () => {
    const item = fixture();
    const legacy = join(item.root, 'legacy.sql.gz');
    const reproduced = spawnSync(
      '/usr/bin/bash',
      ['-c', `set -e; (exit 17) | /usr/bin/gzip > '${legacy}'`],
      { encoding: 'utf8' }
    );

    expect(reproduced.status).toBe(0);
    expect(lstatSync(legacy).size).toBe(20);

    const result = run(item, { FAKE_DUMP_MODE: 'failure' });
    expect(result.status).toBe(17);
    expect(result.stderr).toContain('pg_dump failed with status 17');
    expect(result.stderr).not.toContain('synthetic-password-never-log');
    expect(published(item.backupDir)).toEqual([]);
    expect(readdirSync(item.backupDir).filter(name => name.includes('.tmp.'))).toEqual([]);
  });

  it('rejects an invalid archive before atomic publication', () => {
    const item = fixture();
    const result = run(item, {
      FAKE_DUMP_MODE: 'validation-failure',
      FAKE_RESTORE_MODE: 'list-failure',
    });

    expect(result.status).toBe(23);
    expect(result.stderr).toContain('pg_restore validation failed with status 23');
    expect(result.stderr).not.toContain('synthetic-password-never-log');
    expect(result.stdout).not.toContain('published');
    expect(published(item.backupDir)).toEqual([]);
  });

  it('rejects an archive whose TOC lists but whose full offline traversal fails', () => {
    const item = fixture();
    const result = run(item, {
      FAKE_DUMP_MODE: 'validation-failure',
      FAKE_RESTORE_MODE: 'traversal-failure',
    });

    expect(result.status).toBe(42);
    expect(result.stderr).toContain('pg_restore full traversal failed with status 42');
    expect(result.stdout).not.toContain('published');
    expect(published(item.backupDir)).toEqual([]);
  });

  it.each([
    ['list-stderr', 'pg_restore validation emitted stderr'],
    ['traversal-stderr', 'pg_restore full traversal emitted stderr'],
  ])('rejects successful archive validation with nonempty %s', (mode, message) => {
    const item = fixture();
    const result = run(item, { FAKE_RESTORE_MODE: mode });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(message);
    expect(published(item.backupDir)).toEqual([]);
  });

  it('publishes one validated custom archive with owner-only permissions', () => {
    const item = fixture();
    const result = run(item);

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^Supabase backup published: generation-/m);
    expect(`${result.stdout}${result.stderr}`).not.toContain('synthetic-password-never-log');
    const files = published(item.backupDir);
    expect(files).toHaveLength(1);
    const generation = join(item.backupDir, files[0]);
    expect(lstatSync(generation).mode & 0o777).toBe(0o700);
    expect(lstatSync(join(generation, 'database.dump')).mode & 0o777).toBe(0o600);
    expect(lstatSync(join(generation, 'database.dump')).size).toBeGreaterThan(1024);
    const dumpArgs = readFileSync(item.argsLog, 'utf8');
    expect(dumpArgs).toContain('--format=custom');
    expect(dumpArgs).toContain('--file=');
    expect(dumpArgs).not.toContain('synthetic-password-never-log');
    expect(readFileSync(item.identityLog, 'utf8')).toBe(
      'ca_fd=yes\nurl_ca_fd=yes\nca_content=synthetic CA only\n'
    );
    const restoreArgs = readFileSync(item.restoreArgsLog, 'utf8');
    expect(restoreArgs).toContain('--list');
    expect(restoreArgs).toContain('--file=/dev/null');
  });

  it('takes one nonblocking lock across the complete dump window', async () => {
    const item = fixture();
    const first = spawn(
      '/usr/bin/bash',
      [
        OPERATOR,
        '--q12-run-id',
        '11111111-2222-4333-8444-555555555555',
        '--snapshot',
        '00000003-0000001B-1',
      ],
      {
        env: { ...item.env, FAKE_DUMP_MODE: 'wait' },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    await waitFor(item.readyFile);

    const second = run(item);
    expect(second.status).toBe(75);
    expect(second.stderr).toContain('backup already running');
    expect(published(item.backupDir)).toEqual([]);

    writeFileSync(item.releaseFile, 'release');
    const firstStatus = await new Promise<number | null>(resolvePromise => {
      first.once('exit', code => resolvePromise(code));
    });
    expect(firstStatus).toBe(0);
    expect(published(item.backupDir)).toHaveLength(1);
  });

  it('requires owner-only URL credentials and an explicit non-symlink CA', () => {
    const item = fixture();
    chmodSync(item.urlFile, 0o644);
    const exposed = run(item);
    expect(exposed.status).not.toBe(0);
    expect(exposed.stderr).toContain('URL credential file must be owner-only mode 0400 or 0600');

    chmodSync(item.urlFile, 0o600);
    const realCa = join(item.root, 'real-ca.crt');
    writeFileSync(realCa, 'synthetic CA only\n', { mode: 0o400 });
    rmSync(item.caFile);
    symlinkSync(realCa, item.caFile);
    const linked = run(item);
    expect(linked.status).not.toBe(0);
    expect(linked.stderr).toContain('CA file must be a regular non-symlink file');
    expect(published(item.backupDir)).toEqual([]);
  });

  it('requires verify-full and the exact explicit CA path in the URL', () => {
    const item = fixture();
    const unsafe =
      'postgresql://postgres.test:synthetic-password-never-log@db.example.test/postgres';
    writeFileSync(item.urlFile, `${unsafe}?sslmode=require&sslrootcert=${item.caFile}\n`, {
      mode: 0o600,
    });

    const result = run(item);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('URL must contain exact sslmode=verify-full');
    expect(`${result.stdout}${result.stderr}`).not.toContain('synthetic-password-never-log');
    expect(published(item.backupDir)).toEqual([]);
  });

  it('rejects unsafe parent-directory permissions for credential inputs', () => {
    const item = fixture();
    chmodSync(join(item.root, 'secrets'), 0o770);

    const result = run(item);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('parent directory must not be group/world writable');
    expect(published(item.backupDir)).toEqual([]);
  });

  it('rejects an unsafe backup parent before taking the directory lock', () => {
    const item = fixture();
    chmodSync(item.backupParent, 0o770);

    const result = run(item);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'backup directory parent directory must not be group/world writable'
    );
    expect(published(item.backupDir)).toEqual([]);
  });

  it.each([
    ['URL credential', 'url', 0o600],
    ['CA', 'ca', 0o400],
  ] as const)('fails closed when the validated %s path is substituted', (label, target, mode) => {
    const item = fixture();
    const path = target === 'url' ? item.urlFile : item.caFile;
    const result = run(item, {
      MC2_SUPABASE_BACKUP_TEST_PRE_DUMP_HOOK: item.substituteHook,
      FAKE_SUBSTITUTE_PATH: path,
      FAKE_SUBSTITUTE_MODE: mode.toString(8),
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`${label} file path identity changed after open`);
    expect(existsSync(item.argsLog)).toBe(false);
    expect(published(item.backupDir)).toEqual([]);
  });

  it('rejects a same-inode URL symlink swap after no-follow descriptor adoption', () => {
    const item = fixture();
    const result = run(item, {
      MC2_SUPABASE_BACKUP_TEST_PRE_DUMP_HOOK: item.substituteHook,
      FAKE_SUBSTITUTE_PATH: item.urlFile,
      FAKE_SUBSTITUTE_MODE: '600',
      FAKE_SUBSTITUTE_KIND: 'symlink',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('URL credential file must be a regular non-symlink file');
    expect(existsSync(item.argsLog)).toBe(false);
    expect(published(item.backupDir)).toEqual([]);
  });

  it('fails closed when the locked backup directory pathname is substituted', () => {
    const item = fixture();
    const result = run(item, {
      MC2_SUPABASE_BACKUP_TEST_PRE_DUMP_HOOK: item.substituteHook,
      FAKE_SUBSTITUTE_PATH: item.backupDir,
      FAKE_SUBSTITUTE_MODE: '700',
      FAKE_SUBSTITUTE_KIND: 'directory',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('backup directory path identity changed after lock');
    expect(existsSync(item.argsLog)).toBe(false);
    expect(published(item.backupDir)).toEqual([]);
  });

  it('never turns crash residue into a published backup', () => {
    const item = fixture();
    const crashed = run(item, { FAKE_DUMP_MODE: 'crash' });

    expect(crashed.signal).toBe('SIGKILL');
    expect(published(item.backupDir)).toEqual([]);
    const residue = readdirSync(item.backupDir).filter(name => name !== '.committed');
    expect(residue.every(name => name.startsWith('.generation.'))).toBe(true);
    expect(residue.some(name => name.includes('.stderr.'))).toBe(false);
    expect(residue.join('\n')).not.toContain('synthetic-password-never-log');

    const recovered = run(item);
    expect(recovered.status).toBe(0);
    expect(readdirSync(item.backupDir).filter(name => name.startsWith('.generation.'))).toEqual([]);
  });

  it.each([
    ['directory', false],
    ['file', true],
  ] as const)(
    'leaves no unowned temporary when the %s helper is signalled at create-assignment boundary',
    (kind, generationCommitted) => {
      const item = fixture();
      const result = run(item, { MC2_PRIVATE_TEMP_TEST_SIGNAL_AFTER_CREATE: kind });

      expect(result.status).not.toBe(0);
      expect(readdirSync(item.backupDir).filter(name => name.startsWith('.generation.'))).toEqual(
        []
      );
      expect(readdirSync(item.backupDir).filter(name => name.includes('.tmp.'))).toEqual([]);
      expect(published(item.backupDir)).toHaveLength(generationCommitted ? 1 : 0);
      expect(existsSync(join(item.backupDir, 'latest.json'))).toBe(false);
    }
  );

  it('startup cleanup removes only exact owned mode-0600 non-symlink temporaries', () => {
    const item = fixture();
    const owned = join(item.backupDir, '.supabase-backup.tmp.stderr.Abc123');
    const wrongMode = join(item.backupDir, '.supabase-backup.tmp.archive.Def456');
    const target = join(item.backupDir, 'manual-residue');
    const linked = join(item.backupDir, '.supabase-backup.tmp.list.Ghi789');
    const unrelated = join(item.backupDir, '.supabase-backup.tmp.other.Jkl012');
    writeFileSync(owned, 'synthetic old diagnostic', { mode: 0o600 });
    writeFileSync(wrongMode, 'keep wrong mode', { mode: 0o644 });
    writeFileSync(target, 'keep symlink target', { mode: 0o600 });
    symlinkSync(target, linked);
    writeFileSync(unrelated, 'keep unrelated', { mode: 0o600 });

    const result = run(item, { FAKE_DUMP_MODE: 'failure' });
    expect(result.status).toBe(17);
    expect(existsSync(owned)).toBe(false);
    for (const path of [wrongMode, target, linked, unrelated]) expect(existsSync(path)).toBe(true);
  });

  it('publishes with atomic no-replace semantics and preserves collision content', () => {
    const item = fixture();
    const finalName = 'generation-20300101T000000Z-11111111-2222-4333-8444-555555555555';
    const existing = join(item.backupDir, finalName);
    writeFileSync(existing, 'racer-content-must-survive', { mode: 0o600 });

    const result = run(item, { MC2_SUPABASE_BACKUP_TEST_FINAL_NAME: finalName });
    expect(result.status).toBe(73);
    expect(result.stderr).toContain('refusing to replace an existing generation path');
    expect(readFileSync(existing, 'utf8')).toBe('racer-content-must-survive');
    expect(result.stdout).not.toContain('published');
  });

  it('treats a colliding symlink-to-directory as the final name, not a target directory', () => {
    const item = fixture();
    const finalName = 'generation-20300101T000000Z-11111111-2222-4333-8444-555555555555';
    const collisionDirectory = join(item.root, 'collision-directory');
    mkdirSync(collisionDirectory, { mode: 0o700 });
    symlinkSync(collisionDirectory, join(item.backupDir, finalName));

    const result = run(item, { MC2_SUPABASE_BACKUP_TEST_FINAL_NAME: finalName });
    expect(result.status).toBe(73);
    expect(readdirSync(collisionDirectory)).toEqual([]);
    expect(result.stdout).not.toContain('published');
  });

  it('runs exact-pattern non-symlink retention only after successful validation', () => {
    const item = fixture();
    const oldOwned = join(item.backupDir, 'supabase-20200101T000000Z-101.dump');
    const unrelated = join(item.backupDir, 'manual-20200101.dump');
    const historical = join(item.backupDir, 'supabase-2026-06-27.sql.gz');
    const linked = join(item.backupDir, 'supabase-20200101T000001Z-102.dump');
    writeFileSync(oldOwned, 'old-owned', { mode: 0o600 });
    writeFileSync(unrelated, 'manual', { mode: 0o600 });
    writeFileSync(historical, 'historical', { mode: 0o600 });
    symlinkSync(unrelated, linked);
    const old = new Date('2020-01-01T00:00:00Z');
    utimesSync(oldOwned, old, old);

    const failed = run(item, { FAKE_DUMP_MODE: 'failure' });
    expect(failed.status).toBe(17);
    for (const path of [oldOwned, unrelated, historical, linked])
      expect(existsSync(path)).toBe(true);

    const success = run(item);
    expect(success.status).toBe(0);
    expect(existsSync(oldOwned)).toBe(true);
    for (const path of [unrelated, historical, linked]) expect(existsSync(path)).toBe(true);
  });
});

describe('Q12 immutable Supabase backup generations', () => {
  it('binds pg_dump and the source manifest to one exported snapshot and publishes four files', () => {
    const item = fixture();

    const result = generationRun(item);

    expect(result.status).toBe(0);
    const generations = generationNames(item.backupDir);
    expect(generations).toHaveLength(1);
    const generation = join(item.backupDir, generations[0]);
    expect(readdirSync(generation).sort()).toEqual([
      'checksums.json',
      'database.dump',
      'roles.sql',
      'source-manifest.json',
    ]);
    expect(readFileSync(item.argsLog, 'utf8')).toContain('--snapshot=00000003-0000001B-1');
    expect(readFileSync(join(item.root, 'manifest-args'), 'utf8')).toContain(
      '--snapshot 00000003-0000001B-1'
    );
    expect(readFileSync(join(item.root, 'roles-args'), 'utf8').trim().split('\n')).toEqual([
      '--roles-only --no-role-passwords --no-password',
      '--roles-only --no-role-passwords --no-password',
    ]);
    for (const name of readdirSync(generation)) {
      expect(lstatSync(join(generation, name)).mode & 0o777).toBe(0o600);
    }
    expect(lstatSync(generation).mode & 0o777).toBe(0o700);
  });

  it('decomposes the connection service file into discrete libpq parameters', () => {
    const item = fixture();
    const serviceCopy = join(item.root, 'service-file-copy');

    const result = run(item, { FAKE_SERVICE_FILE_COPY: serviceCopy });

    expect(result.status).toBe(0);
    const serviceFile = readFileSync(serviceCopy, 'utf8');
    // libpq never URI-expands dbname inside a service file, so an embedded
    // postgresql:// URI silently falls back to the local unix socket.
    expect(serviceFile).not.toContain('postgresql://');
    const lines = serviceFile.trim().split('\n');
    expect(lines[0]).toBe('[mc2_supabase_backup]');
    expect(lines).toContain('host=db.example.test');
    expect(lines).toContain('port=5432');
    expect(lines).toContain('user=postgres.test');
    expect(lines).toContain('password=synthetic-password-never-log');
    expect(lines).toContain('dbname=postgres');
    expect(lines).toContain('sslmode=verify-full');
    expect(lines.some(line => /^sslrootcert=\/proc\/self\/fd\/\d+$/.test(line))).toBe(true);
    expect(lines).toHaveLength(8);
  });

  it('refuses a password that percent-decodes to leading or trailing whitespace', () => {
    const item = fixture();
    writeFileSync(
      item.urlFile,
      `postgresql://postgres.test:secret%20@db.example.test:5432/postgres` +
        `?sslmode=verify-full&sslrootcert=${item.caFile}\n`,
      { mode: 0o600 }
    );
    chmodSync(item.urlFile, 0o600);

    const result = run(item);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('connection service file composition failed');
    expect(`${result.stdout}${result.stderr}`).not.toContain('secret');
  });

  it('refuses a password whose percent-encoding is not valid UTF-8', () => {
    const item = fixture();
    writeFileSync(
      item.urlFile,
      `postgresql://postgres.test:bad%FFbad@db.example.test:5432/postgres` +
        `?sslmode=verify-full&sslrootcert=${item.caFile}\n`,
      { mode: 0o600 }
    );
    chmodSync(item.urlFile, 0o600);

    const result = run(item);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('connection service file composition failed');
  });

  it('percent-decodes service parameters into libpq-literal values', () => {
    const item = fixture();
    const serviceCopy = join(item.root, 'service-file-copy');
    writeFileSync(
      item.urlFile,
      `postgresql://postgres.test:p%40ss%3Dw%20rd%23x@db.example.test:5432/postgres` +
        `?sslmode=verify-full&sslrootcert=${item.caFile}\n`,
      { mode: 0o600 }
    );
    chmodSync(item.urlFile, 0o600);

    const result = run(item, { FAKE_SERVICE_FILE_COPY: serviceCopy });

    expect(result.status).toBe(0);
    const lines = readFileSync(serviceCopy, 'utf8').trim().split('\n');
    expect(lines).toContain('password=p@ss=w rd#x');
  });

  it('references version-renamed pg_database locale columns only through to_jsonb', () => {
    // PG17 renamed daticulocale to datlocale and PG15 lacks daticurules, so a
    // direct column reference makes the catalog SQL fail on a real server.
    const manifestTool = readFileSync(
      resolve(REPO_ROOT, 'deploy/postgres/q12-source-manifest.ts'),
      'utf8'
    );
    expect(manifestTool).not.toMatch(/d\.daticulocale/);
    expect(manifestTool).not.toMatch(/d\.daticurules/);
    expect(manifestTool).toContain("to_jsonb(d)->>'daticulocale'");
    expect(manifestTool).toContain("to_jsonb(d)->>'datlocale'");
  });

  it('fails closed when normalized password-free role exports drift', () => {
    const item = fixture();

    const result = generationRun(item, { FAKE_ROLES_DRIFT: '1' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('normalized role exports changed across the shared snapshot');
    expect(generationNames(item.backupDir)).toEqual([]);
    expect(existsSync(join(item.backupDir, 'latest.json'))).toBe(false);
  });

  it('accepts the real PostgreSQL 17 roles header/footer without deleting audit text', () => {
    const item = fixture();

    const result = generationRun(item, { FAKE_ROLES_LAYOUT: 'realistic' });

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    const generation = join(item.backupDir, generationNames(item.backupDir)[0]);
    const roles = readFileSync(join(generation, 'roles.sql'), 'utf8');
    expect(roles).toContain('-- PostgreSQL database cluster dump');
    expect(roles).toContain('-- PostgreSQL database cluster dump complete');
    expect(roles).toContain('\\restrict mc2nonce');
    expect(roles).toContain('\\unrestrict mc2nonce');
  });

  it('rejects every pg_dump stderr byte because the initial warning allowlist is empty', () => {
    const item = fixture();

    const result = generationRun(item, { FAKE_DUMP_STDERR: 'synthetic warning' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('pg_dump stderr is not allowlisted');
    expect(`${result.stdout}${result.stderr}`).not.toContain('synthetic-password-never-log');
    expect(generationNames(item.backupDir)).toEqual([]);
  });

  it('uses no-replace generation publication and retains post-publication incident evidence', () => {
    const item = fixture();
    const hook = join(item.root, 'bin', 'fail-before-pointer');
    executable(hook, '#!/usr/bin/env bash\nexit 61\n');

    const result = generationRun(item, {
      MC2_SUPABASE_BACKUP_TEST_POST_GENERATION_HOOK: hook,
    });

    expect(result.status).toBe(61);
    expect(result.stderr).toContain('post-generation hook failed before latest pointer commit');
    expect(generationNames(item.backupDir)).toHaveLength(1);
    expect(existsSync(join(item.backupDir, 'latest.json'))).toBe(false);
    expect(readdirSync(item.backupDir).filter(name => name.startsWith('.generation.'))).toEqual([]);
  });

  it('commits latest.json only after the immutable generation and binds its checksum manifest', () => {
    const item = fixture();

    const result = generationRun(item);

    expect(result.status).toBe(0);
    const pointerPath = join(item.backupDir, 'latest.json');
    expect(existsSync(pointerPath)).toBe(true);
    if (!existsSync(pointerPath)) return;
    const pointer = JSON.parse(readFileSync(pointerPath, 'utf8')) as {
      generation: string;
      checksums_sha256: string;
    };
    expect(pointer.generation).toBe(generationNames(item.backupDir)[0]);
    expect(pointer.generation).not.toContain('/');
    expect(pointer.checksums_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(readdirSync(item.backupDir).some(name => name.startsWith('latest.json.'))).toBe(false);

    const operator = readFileSync(OPERATOR, 'utf8');
    expect(operator).toContain('RENAME_NOREPLACE');
    expect(operator).toContain('generation_committed=1');
    expect(operator).not.toContain('"$BACKUP_DIR"/supabase-*.dump');
  });

  it.each([
    ['Amsterdam spring DST', '2030-04-01T00:30:00+02:00'],
    ['Amsterdam fall DST', '2030-10-28T00:30:00+01:00'],
  ])(
    'applies exactly 20160 elapsed minutes across %s only to committed complete non-latest generations',
    (_label, nowIso) => {
      const item = fixture();
      const nowEpoch = Math.floor(Date.parse(nowIso) / 1000);
      const seedName = 'generation-20300101T000000Z-11111111-2222-4333-8444-555555555555';
      const seed = generationRun(item, {
        MC2_SUPABASE_BACKUP_TEST_FINAL_NAME: seedName,
        MC2_SUPABASE_BACKUP_TEST_NOW_EPOCH: String(nowEpoch),
        SUPABASE_BACKUP_RETENTION_DAYS: '14',
        TZ: 'Europe/Amsterdam',
      });
      expect(seed.status, `${seed.stdout}\n${seed.stderr}`).toBe(0);

      const expiredName = 'generation-20300102T000000Z-11111111-2222-4333-8444-555555555555';
      const boundaryName = 'generation-20300103T000000Z-11111111-2222-4333-8444-555555555555';
      const incompleteName = 'generation-20300104T000000Z-11111111-2222-4333-8444-555555555555';
      const incidentName = 'generation-20300105T000000Z-11111111-2222-4333-8444-555555555555';
      const expired = cloneCompleteGeneration(item, seedName, expiredName, true);
      const belowBoundary = cloneCompleteGeneration(item, seedName, boundaryName, true);
      const incomplete = cloneCompleteGeneration(item, seedName, incompleteName, true);
      const incident = cloneCompleteGeneration(item, seedName, incidentName, false);
      rmSync(join(incomplete, 'database.dump'));
      const minute = 60;
      const threshold = 14 * 1440 * minute;
      const expiredAt = new Date((nowEpoch - threshold - 30) * 1000);
      const belowBoundaryAt = new Date((nowEpoch - threshold + 30) * 1000);
      const oldIncidentAt = new Date((nowEpoch - threshold - minute) * 1000);
      utimesSync(expired, expiredAt, expiredAt);
      utimesSync(belowBoundary, belowBoundaryAt, belowBoundaryAt);
      utimesSync(incomplete, oldIncidentAt, oldIncidentAt);
      utimesSync(incident, oldIncidentAt, oldIncidentAt);
      expect(
        spawnSync(
          '/usr/bin/find',
          [expired, '-maxdepth', '0', '-type', 'd', '!', '-newermt', `@${nowEpoch - threshold}`],
          { encoding: 'utf8' }
        ).stdout.trim()
      ).toBe(expired);
      expect(lstatSync(expired).mode & 0o777).toBe(0o700);
      expect(existsSync(join(item.backupDir, '.committed', expiredName))).toBe(true);

      const latestName = 'generation-20300106T000000Z-11111111-2222-4333-8444-555555555555';
      const ageLatestHook = join(item.root, 'bin', 'age-latest-generation');
      executable(
        ageLatestHook,
        `#!/usr/bin/env bash\n/usr/bin/touch -d '@${nowEpoch - 16 * 86400}' '${join(item.backupDir, latestName)}'\n`
      );
      const retainedLatest = generationRun(item, {
        MC2_SUPABASE_BACKUP_TEST_FINAL_NAME: latestName,
        MC2_SUPABASE_BACKUP_TEST_POST_GENERATION_HOOK: ageLatestHook,
        MC2_SUPABASE_BACKUP_TEST_NOW_EPOCH: String(nowEpoch),
        SUPABASE_BACKUP_RETENTION_DAYS: '14',
        TZ: 'Europe/Amsterdam',
      });
      expect(retainedLatest.status, `${retainedLatest.stdout}\n${retainedLatest.stderr}`).toBe(0);

      expect(existsSync(expired)).toBe(false);
      expect(existsSync(join(item.backupDir, '.committed', expiredName))).toBe(false);
      expect(existsSync(belowBoundary)).toBe(true);
      expect(existsSync(incomplete)).toBe(true);
      expect(existsSync(incident)).toBe(true);
      expect(existsSync(join(item.backupDir, latestName))).toBe(true);
    }
  );

  it('rejects a latest pointer whose referenced four-file generation is no longer complete', () => {
    const item = fixture();
    const firstName = 'generation-20300101T000000Z-11111111-2222-4333-8444-555555555555';
    const secondName = 'generation-20300102T000000Z-11111111-2222-4333-8444-555555555555';
    const first = generationRun(item, {
      MC2_SUPABASE_BACKUP_TEST_FINAL_NAME: firstName,
    });
    expect(first.status, `${first.stdout}\n${first.stderr}`).toBe(0);
    rmSync(join(item.backupDir, firstName, 'database.dump'));

    const second = generationRun(item, {
      MC2_SUPABASE_BACKUP_TEST_FINAL_NAME: secondName,
    });

    expect(second.status).not.toBe(0);
    expect(second.stderr).toContain('latest pointer generation completeness validation failed');
    expect(generationNames(item.backupDir)).toEqual([firstName]);
  });

  it('rejects a latest pointer with fields beyond the exact immutable reference contract', () => {
    const item = fixture();
    const firstName = 'generation-20300101T000000Z-11111111-2222-4333-8444-555555555555';
    const secondName = 'generation-20300102T000000Z-11111111-2222-4333-8444-555555555555';
    const first = generationRun(item, {
      MC2_SUPABASE_BACKUP_TEST_FINAL_NAME: firstName,
    });
    expect(first.status, `${first.stdout}\n${first.stderr}`).toBe(0);
    const pointerPath = join(item.backupDir, 'latest.json');
    const pointer = JSON.parse(readFileSync(pointerPath, 'utf8')) as Record<string, unknown>;
    writeFileSync(pointerPath, `${JSON.stringify({ ...pointer, path: '/unexpected' })}\n`, {
      mode: 0o600,
    });

    const second = generationRun(item, {
      MC2_SUPABASE_BACKUP_TEST_FINAL_NAME: secondName,
    });

    expect(second.status).not.toBe(0);
    expect(second.stderr).toContain('latest pointer exact field set mismatch');
    expect(generationNames(item.backupDir)).toEqual([firstName]);
  });

  it('does not publish a generation or pointer containing a synthetic credential', () => {
    const item = fixture();

    const result = generationRun(item);

    expect(result.status).toBe(0);
    const pointerPath = join(item.backupDir, 'latest.json');
    expect(existsSync(pointerPath)).toBe(true);
    if (!existsSync(pointerPath)) return;
    const trackedOutput = `${result.stdout}${result.stderr}${readFileSync(pointerPath, 'utf8')}`;
    expect(trackedOutput).not.toContain('synthetic-password-never-log');
    const generation = join(item.backupDir, generationNames(item.backupDir)[0]);
    for (const name of readdirSync(generation)) {
      expect(readFileSync(join(generation, name), 'utf8')).not.toContain(
        'synthetic-password-never-log'
      );
    }
  });
});
