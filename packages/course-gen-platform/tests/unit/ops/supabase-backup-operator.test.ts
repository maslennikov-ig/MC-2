import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
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
  const password = 'synthetic-password-never-log';
  const databaseUrl =
    `postgresql://postgres.test:${password}@db.example.test:5432/postgres` +
    `?sslmode=verify-full&sslrootcert=${caFile}`;
  writeFileSync(caFile, 'synthetic CA only\n', { mode: 0o400 });
  writeFileSync(urlFile, `${databaseUrl}\n`, { mode: 0o600 });
  chmodSync(caFile, 0o400);
  chmodSync(urlFile, 0o600);

  const argsLog = join(root, 'pg-dump-args');
  const restoreArgsLog = join(root, 'pg-restore-args');
  const identityLog = join(root, 'pg-dump-identity');
  const readyFile = join(root, 'dump-ready');
  const releaseFile = join(root, 'dump-release');
  const pgDump = join(binDir, 'pg_dump');
  const pgRestore = join(binDir, 'pg_restore');
  const substituteHook = join(binDir, 'substitute-input');

  executable(
    pgDump,
    `#!/usr/bin/env bash
set -eu
printf '%s\\n' "$*" > "$FAKE_ARGS_LOG"
[[ "\${PGSSLROOTCERT:-}" == /proc/self/fd/* ]] || exit 94
[[ -r "$PGSSLROOTCERT" ]] || exit 95
[[ "$PGDATABASE" == *"sslrootcert=$PGSSLROOTCERT"* ]] || exit 96
[[ "$PGDATABASE" != *"$FAKE_ORIGINAL_CA_PATH"* ]] || exit 97
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
    printf 'synthetic pg_dump failure for %s\\n' "$PGDATABASE" >&2
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
    printf 'synthetic abrupt diagnostic for %s\\n' "$PGDATABASE" >&2
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
    pgRestore,
    `#!/usr/bin/env bash
set -eu
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
    env: {
      PATH: '/usr/bin:/bin',
      SUPABASE_BACKUP_URL_FILE: urlFile,
      SUPABASE_BACKUP_CA_FILE: caFile,
      SUPABASE_BACKUP_DIR: backupDir,
      SUPABASE_BACKUP_RETENTION_DAYS: '7',
      MC2_SUPABASE_BACKUP_TEST_MODE: TEST_MODE,
      MC2_SUPABASE_BACKUP_TEST_ROOT: root,
      MC2_SUPABASE_BACKUP_TEST_PG_DUMP: pgDump,
      MC2_SUPABASE_BACKUP_TEST_PG_RESTORE: pgRestore,
      FAKE_ARGS_LOG: argsLog,
      FAKE_RESTORE_ARGS_LOG: restoreArgsLog,
      FAKE_IDENTITY_LOG: identityLog,
      FAKE_ORIGINAL_CA_PATH: caFile,
      FAKE_READY_FILE: readyFile,
      FAKE_RELEASE_FILE: releaseFile,
    },
  };
}

function run(item: Fixture, extra: NodeJS.ProcessEnv = {}): ReturnType<typeof spawnSync> {
  return spawnSync('/usr/bin/bash', [OPERATOR], {
    env: { ...item.env, ...extra },
    encoding: 'utf8',
  });
}

function published(directory: string): string[] {
  return readdirSync(directory).filter(name => /^supabase-\d{8}T\d{6}Z-\d+\.dump$/.test(name));
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
  it('uses fixed distro PostgreSQL commands while confining only test overrides', () => {
    const operator = readFileSync(OPERATOR, 'utf8');

    expect(operator.startsWith('#!/usr/bin/bash\n')).toBe(true);
    expect(operator).toContain('export LC_ALL=C');
    expect(operator).toContain("PG_DUMP='/usr/bin/pg_dump'");
    expect(operator).toContain("PG_RESTORE='/usr/bin/pg_restore'");
    expect(operator).toContain("require_test_command 'pg_dump'");
    expect(operator).not.toContain('[[ -x "$PG_DUMP" && ! -L "$PG_DUMP" ]]');
    expect(operator).not.toContain('[[ -x "$PG_RESTORE" && ! -L "$PG_RESTORE" ]]');
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

  it('publishes one validated custom archive with owner-only permissions', () => {
    const item = fixture();
    const result = run(item);

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^Supabase backup published: supabase-/m);
    expect(`${result.stdout}${result.stderr}`).not.toContain('synthetic-password-never-log');
    const files = published(item.backupDir);
    expect(files).toHaveLength(1);
    expect(lstatSync(join(item.backupDir, files[0]!)).mode & 0o777).toBe(0o600);
    expect(lstatSync(join(item.backupDir, files[0]!)).size).toBeGreaterThan(1024);
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
    const first = spawn('/usr/bin/bash', [OPERATOR], {
      env: { ...item.env, FAKE_DUMP_MODE: 'wait' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
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
    const residue = readdirSync(item.backupDir);
    expect(residue.every(name => name.startsWith('.supabase-backup.tmp.'))).toBe(true);
    expect(residue.some(name => name.includes('.stderr.'))).toBe(false);
    for (const name of residue) {
      expect(readFileSync(join(item.backupDir, name), 'utf8')).not.toContain(
        'synthetic-password-never-log'
      );
    }

    const recovered = run(item);
    expect(recovered.status).toBe(0);
    expect(
      readdirSync(item.backupDir).filter(name => name.startsWith('.supabase-backup.tmp.'))
    ).toEqual([]);
  });

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
    const finalName = 'supabase-20300101T000000Z-777.dump';
    const existing = join(item.backupDir, finalName);
    writeFileSync(existing, 'racer-content-must-survive', { mode: 0o600 });

    const result = run(item, { MC2_SUPABASE_BACKUP_TEST_FINAL_NAME: finalName });
    expect(result.status).toBe(73);
    expect(result.stderr).toContain('refusing to replace an existing backup path');
    expect(readFileSync(existing, 'utf8')).toBe('racer-content-must-survive');
    expect(result.stdout).not.toContain('published');
  });

  it('treats a colliding symlink-to-directory as the final name, not a target directory', () => {
    const item = fixture();
    const finalName = 'supabase-20300101T000000Z-778.dump';
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
    expect(existsSync(oldOwned)).toBe(false);
    for (const path of [unrelated, historical, linked]) expect(existsSync(path)).toBe(true);
  });
});
