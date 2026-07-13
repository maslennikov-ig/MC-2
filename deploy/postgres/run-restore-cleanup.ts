#!/usr/bin/env -S pnpm exec tsx
import { createRequire } from 'node:module';
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute } from 'node:path';

interface QueryResult {
  rows: Array<Record<string, unknown>>;
}

export interface CleanupClient {
  query(config: { text: string; values?: unknown[] }): Promise<unknown>;
}

interface CleanupInput {
  capability: string;
  cleanupSql: string;
  runId: string;
}

interface CleanupResult {
  activated: false;
  database_barrier_expected_catalog_sha256: string;
  run_id: string;
  schema: 'megacampus.q12.database-barrier-cleanup-result/v1';
}

const RUN_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SET_CAPABILITY_SQL = "SELECT set_config('megacampus.q12_capability', $1, false)";
const VERIFY_CAPABILITY_SQL =
  'SELECT run_id::text, expected_catalog_sha256, activated FROM q12_guard.verify_capability()';
const PROVE_SESSION_SQL =
  "SELECT session_user = current_user AND session_user = 'postgres' AS direct_postgres, current_setting('transaction_read_only') = 'off' AS read_write";

function fail(message: string): never {
  throw new Error(message);
}

function rows(result: unknown, label: string): Array<Record<string, unknown>> {
  if (
    result === null ||
    typeof result !== 'object' ||
    !Array.isArray((result as QueryResult).rows)
  ) {
    fail(`${label} returned an invalid result`);
  }
  return (result as QueryResult).rows;
}

export async function runCleanupSession(
  client: CleanupClient,
  input: CleanupInput
): Promise<CleanupResult> {
  if (!RUN_ID_PATTERN.test(input.runId)) fail('run id is invalid');
  if (!input.capability || /[\0\n\r]/.test(input.capability)) fail('capability shape is invalid');
  if (!input.cleanupSql || input.cleanupSql.includes(input.capability))
    fail('cleanup SQL is invalid');

  await client.query({ text: SET_CAPABILITY_SQL, values: [input.capability] });
  const verifierRows = rows(
    await client.query({ text: VERIFY_CAPABILITY_SQL }),
    'database barrier verifier'
  );
  if (verifierRows.length !== 1) fail('database barrier verifier cardinality mismatch');
  const verifier = verifierRows[0];
  if (
    verifier.run_id !== input.runId ||
    verifier.activated !== false ||
    typeof verifier.expected_catalog_sha256 !== 'string' ||
    !SHA256_PATTERN.test(verifier.expected_catalog_sha256)
  ) {
    fail('database barrier verifier identity mismatch');
  }
  const proofRows = rows(await client.query({ text: PROVE_SESSION_SQL }), 'cleanup session proof');
  if (
    proofRows.length !== 1 ||
    proofRows[0]?.direct_postgres !== true ||
    proofRows[0]?.read_write !== true
  ) {
    fail('cleanup session actor or read-only proof failed');
  }
  await client.query({ text: input.cleanupSql });
  return {
    activated: false,
    database_barrier_expected_catalog_sha256: verifier.expected_catalog_sha256,
    run_id: input.runId,
    schema: 'megacampus.q12.database-barrier-cleanup-result/v1',
  };
}

function parseArguments(args: string[]): Map<string, string> {
  const parsed = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith('--') || value === undefined || parsed.has(key))
      fail('invalid helper arguments');
    parsed.set(key, value);
  }
  const exact = ['--capability-file', '--cleanup-sql', '--result', '--run-id', '--service-file'];
  if (JSON.stringify([...parsed.keys()].sort()) !== JSON.stringify(exact))
    fail('helper argument set mismatch');
  return parsed;
}

function readOwnedFile(path: string, mode: number, label: string): string {
  if (!isAbsolute(path) || realpathSync(path) !== path) fail(`${label} path is invalid`);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(fd);
    if (
      !before.isFile() ||
      before.uid !== process.getuid() ||
      before.gid !== process.getgid() ||
      (before.mode & 0o777) !== mode
    ) {
      fail(`${label} metadata mismatch`);
    }
    const value = readFileSync(fd, 'utf8');
    const after = fstatSync(fd);
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size) {
      fail(`${label} changed while open`);
    }
    return value;
  } finally {
    closeSync(fd);
  }
}

function parseService(contents: string): {
  database: string;
  host: string;
  passfile: string;
  port: number;
  user: string;
} {
  const lines = contents.trimEnd().split('\n');
  if (lines.shift() !== '[mc2_restore_cleanup]') fail('cleanup service name mismatch');
  const settings = new Map<string, string>();
  for (const line of lines) {
    const separator = line.indexOf('=');
    if (separator < 1) fail('cleanup service syntax is invalid');
    const key = line.slice(0, separator);
    if (settings.has(key)) fail('cleanup service contains duplicate keys');
    settings.set(key, line.slice(separator + 1));
  }
  if (
    JSON.stringify([...settings.keys()].sort()) !==
    JSON.stringify(['dbname', 'host', 'passfile', 'port', 'sslmode', 'user'])
  ) {
    fail('cleanup service field set mismatch');
  }
  const port = Number(settings.get('port'));
  if (
    settings.get('host') !== '127.0.0.1' ||
    settings.get('dbname') !== 'restore_test' ||
    settings.get('user') !== 'postgres' ||
    settings.get('sslmode') !== 'disable' ||
    !Number.isSafeInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    fail('cleanup service identity mismatch');
  }
  return {
    database: 'restore_test',
    host: '127.0.0.1',
    passfile: settings.get('passfile')!,
    port,
    user: 'postgres',
  };
}

function readPassword(path: string, port: number): string {
  const contents = readOwnedFile(path, 0o600, 'cleanup password file').trimEnd();
  const prefix = `127.0.0.1:${port}:restore_test:postgres:`;
  if (!contents.startsWith(prefix)) fail('cleanup password identity mismatch');
  const password = contents.slice(prefix.length);
  if (!/^[0-9a-f]{64}$/.test(password)) fail('cleanup password shape mismatch');
  return password;
}

function writeResult(path: string, result: CleanupResult): void {
  if (!isAbsolute(path) || dirname(realpathSync(dirname(path))) !== dirname(path)) {
    fail('cleanup result parent is invalid');
  }
  const parent = openSync(dirname(path), constants.O_RDONLY | constants.O_DIRECTORY);
  try {
    const metadata = fstatSync(parent);
    if (
      metadata.uid !== process.getuid() ||
      metadata.gid !== process.getgid() ||
      (metadata.mode & 0o777) !== 0o700
    ) {
      fail('cleanup result parent metadata mismatch');
    }
    const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    try {
      writeFileSync(fd, `${JSON.stringify(result)}\n`, 'utf8');
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    fsyncSync(parent);
  } finally {
    closeSync(parent);
  }
}

async function main(): Promise<void> {
  const argumentsMap = parseArguments(process.argv.slice(2));
  const runId = argumentsMap.get('--run-id')!;
  const capability = readOwnedFile(
    argumentsMap.get('--capability-file')!,
    0o400,
    'capability'
  ).trimEnd();
  const cleanupSql = readOwnedFile(argumentsMap.get('--cleanup-sql')!, 0o600, 'cleanup SQL');
  const service = parseService(
    readOwnedFile(argumentsMap.get('--service-file')!, 0o600, 'cleanup service')
  );
  const password = readPassword(service.passfile, service.port);
  const packageRequire = createRequire(
    new URL('../../packages/course-gen-platform/package.json', import.meta.url)
  );
  const { Client } = packageRequire('pg') as {
    Client: new (config: Record<string, unknown>) => CleanupClient & {
      connect(): Promise<void>;
      end(): Promise<void>;
    };
  };
  const client = new Client({
    database: service.database,
    host: service.host,
    options: '-c default_transaction_read_only=off',
    password,
    port: service.port,
    ssl: false,
    user: service.user,
  });
  try {
    await client.connect();
    const result = await runCleanupSession(client, { capability, cleanupSql, runId });
    writeResult(argumentsMap.get('--result')!, result);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch(() => {
    process.stderr.write('isolated cleanup helper failed\n');
    process.exitCode = 1;
  });
}
