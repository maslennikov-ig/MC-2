import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Q12 D6 activation-truth — DB probe stream (Stream 1) test suite.
//
// Authority: docs/superpowers/specs/2026-07-15-q12-d6-activation-truth-contract.md
// (frozen normative bytes, sha256 2a2251ac0c03c042a61cc698728c012b9c68e0a9404df0e2f616eb3ec026aae5)
// and the accepted W tuple artifact
// .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.10-q12-w-activation-tuple.md.
//
// Global constraints: no live/remote connection; synthetic secrets only;
// FD 3 never hashed/logged; SQL limited to the FD-11 allowlist; the frozen W
// tuple is the sole authority for lock catalog/order, SQL projection, slices,
// managed inventory, and the command manifest hash.
// ---------------------------------------------------------------------------

const require = createRequire(import.meta.url);
const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const PROBE_PATH = resolve(
  REPO_ROOT,
  'packages/course-gen-platform/tools/qdrant/q12-activation-truth-probe.cjs'
);

// Bound inputs (verbatim from the accepted W tuple artifact mc2-jz6y0.13.10).
const W_TUPLE = {
  w_integration_commit: '60910053455ac9af978c7951a562172e39623ca2',
  command_manifest_sha256: 'aaec6fc25a6996facbf6f07f579239ba0a2aa53fd5521c83cb3c87d12087a841',
  activation_barrier_path: 'deploy/qdrant/q12-database-barrier.sh',
  activation_barrier_sha256: '134255cecfb4361d5e9f1922d98f889ab7d3e01898b197dee096ab720039ed68',
  activation_sql_projection_sha256:
    'a42d6d39f3383c50de15b8aac5b1efd2e486c51bb6a47052a6d805d1589f224e',
  activation_normal_slice_sha256:
    'd413fbd79350f0bbd7e387f03cb242b2239640de1f7a8761ffa5fadd6a85b83f',
  activation_recovery_slice_sha256:
    'c41cf104c423623a56a3131c6e8d8148fae2db5af44772157c1e5a57be2d0063',
  activation_lock_catalog_sha256:
    'cbfa2f092fe6370cd9929208029e083b3466d4fe9cf90c3b2801e8914285929a',
  activation_lock_order_sha256: '26163c334f89331a54f3e0572da8e7e6e32bf83c7c266d2c32dc1b63138d3848',
  managed_inventory_schema_sha256:
    'f2bb0bee394111073a86e421bc11470531880c6ce0c0933a436080eaab6dd56d',
  managed_inventory_sha256: 'c90edb78341fb83a6d954212daca675f5bac89f17bd5611ceb6db3e56559bac6',
} as const;

interface ProbeModule {
  // Task 1
  canonicalize(value: unknown): string;
  sha256Hex(input: string | Uint8Array): string;
  canonicalHash(value: unknown): string;
  parseCanonicalJson(text: string): unknown;
  makeFrame(input: {
    schema_version: string;
    sequence: number;
    kind: string;
    run_id: string;
    payload: Record<string, unknown>;
    previous_frame_sha256: string | null;
  }): Record<string, unknown>;
  FrameChain: new (
    schemaVersion: string,
    runId: string
  ) => {
    append(kind: string, payload: Record<string, unknown>): Record<string, unknown>;
    readonly length: number;
    readonly headHash: string | null;
  };
  // Task 2
  splitProjectionTemplates(sql: string): Map<string, string>;
  assertProjectionAllowlist(sql: string): void;
  PROJECTION_TEMPLATE_NAMES: readonly string[];
  PROJECTION_FORBIDDEN: readonly string[];
  // Task 3
  PRODUCTION_ENDPOINT: {
    scheme: string;
    host: string;
    port: number;
    user: string;
    database: string;
  };
  PROD_CA_SHA256: string;
  parseProductionUrl(url: string): {
    scheme: string;
    host: string;
    port: number;
    user: string;
    database: string;
  };
  buildTlsConfig(
    caPem: string | Uint8Array,
    options: { serverName: string; expectedCaSha256: string }
  ): { rejectUnauthorized: true; servername: string; ca: string | Uint8Array };
  assertPostConnect(observed: {
    session_user: string;
    current_database: string;
    transaction_read_only: string;
    transaction_isolation: string;
    server_version_num: number;
  }): void;
  assertBackendContinuity(
    expected: { backend_pid: number; backend_start_utc: string },
    observed: { backend_pid: number; backend_start_utc: string }
  ): void;
  // Task 4
  CAPABILITY_SCHEMA_VERSION: string;
  VISIBILITY_PG_READ_ALL_STATS_DEFINITION_HASH: string;
  normalizeLockRow(raw: Record<string, unknown>): {
    qualified_name: string;
    oid: number;
    maintain: boolean;
    update: boolean;
    delete: boolean;
    truncate: boolean;
    lock_authorized: boolean;
  };
  assertLockRowsAuthorized(rows: Array<Record<string, unknown>>): void;
  resolveActivityVisibility(input: {
    member: boolean;
    wEquivalentDefinitionHash?: string | null;
  }): { mode: string; definition_hash: string };
  assertClearSnapshotExecuted(flag: unknown): void;
  buildCapabilityObject(input: {
    session_user: string;
    current_database: string;
    server_version_num: number;
    rows: Array<Record<string, unknown>>;
    visibility: { member: boolean; wEquivalentDefinitionHash?: string | null };
    clear_snapshot_executed: boolean;
  }): Record<string, unknown>;
}

const probe = require(PROBE_PATH) as ProbeModule;

describe('Task 1 — canonical JSON + frame envelope + hashing', () => {
  it('serializes compact, recursively key-sorted, NFC, with no trailing LF', () => {
    const value = { b: 1, a: { d: true, c: null }, arr: [3, 2, 1] };
    expect(probe.canonicalize(value)).toBe('{"a":{"c":null,"d":true},"arr":[3,2,1],"b":1}');
  });

  it('normalizes strings to UTF-8 NFC before serializing', () => {
    // U+00E9 (é, NFC) vs U+0065 U+0301 (e + combining acute, NFD).
    const nfc = probe.canonicalize({ k: 'é' });
    const nfd = probe.canonicalize({ k: 'é' });
    expect(nfc).toBe(nfd);
    expect(nfc).toBe('{"k":"é"}');
  });

  it('hashes a known object to the digest computed from its canonical bytes', () => {
    const value = { sequence: 1, kind: 'db_locked' };
    const canonical = '{"kind":"db_locked","sequence":1}';
    const expected = createHash('sha256').update(canonical, 'utf8').digest('hex');
    expect(probe.canonicalize(value)).toBe(canonical);
    expect(probe.canonicalHash(value)).toBe(expected);
    expect(expected).toMatch(/^[0-9a-f]{64}$/);
  });

  it('reproduces the ratified managed-inventory hash (field 11) via canonicalHash', () => {
    const inventory = probe.parseCanonicalJson(
      readFileSync(resolve(REPO_ROOT, 'deploy/qdrant/q12-managed-session-inventory.json'), 'utf8')
    );
    expect(probe.canonicalHash(inventory)).toBe(W_TUPLE.managed_inventory_sha256);
  });

  it('rejects floats', () => {
    expect(() => probe.canonicalize({ k: 1.5 })).toThrow(/float/i);
  });

  it('rejects duplicate keys in parsed JSON text', () => {
    expect(() => probe.parseCanonicalJson('{"a":1,"a":2}')).toThrow(/duplicate/i);
  });

  it('rejects floats in parsed JSON text', () => {
    expect(() => probe.parseCanonicalJson('{"a":1.5}')).toThrow(/float/i);
  });

  it('builds a frame with exactly the envelope keys and a correct frame_sha256', () => {
    const frame = probe.makeFrame({
      schema_version: 'megacampus.q12.activation-truth-frame/v1',
      sequence: 1,
      kind: 'db_locked',
      run_id: 'run-0001',
      payload: { request_sha256: 'a'.repeat(64) },
      previous_frame_sha256: null,
    });
    expect(Object.keys(frame).sort()).toEqual(
      [
        'frame_sha256',
        'kind',
        'payload',
        'previous_frame_sha256',
        'run_id',
        'schema_version',
        'sequence',
      ].sort()
    );
    const withoutHash = { ...frame };
    delete (withoutHash as Record<string, unknown>).frame_sha256;
    expect(frame.frame_sha256).toBe(probe.canonicalHash(withoutHash));
  });

  it('chains sequence and previous_frame_sha256 across a frame chain', () => {
    const chain = new probe.FrameChain('megacampus.q12.activation-truth-frame/v1', 'run-0001');
    const first = chain.append('db_locked', { a: 1 });
    const second = chain.append('host_bound', { b: 2 });
    expect(first.sequence).toBe(1);
    expect(first.previous_frame_sha256).toBe(null);
    expect(second.sequence).toBe(2);
    expect(second.previous_frame_sha256).toBe(first.frame_sha256);
    expect(chain.length).toBe(2);
    expect(chain.headHash).toBe(second.frame_sha256);
  });

  it('rejects an out-of-order sequence and a wrong previous_frame_sha256', () => {
    expect(() =>
      probe.makeFrame({
        schema_version: 'megacampus.q12.activation-truth-frame/v1',
        sequence: 0,
        kind: 'db_locked',
        run_id: 'run-0001',
        payload: {},
        previous_frame_sha256: null,
      })
    ).toThrow(/sequence/i);
    expect(() =>
      probe.makeFrame({
        schema_version: 'megacampus.q12.activation-truth-frame/v1',
        sequence: 1,
        kind: 'db_locked',
        run_id: 'run-0001',
        payload: {},
        previous_frame_sha256: 'a'.repeat(64),
      })
    ).toThrow(/previous_frame_sha256/i);
  });
});

// The FD-11 SQL projection's own SHA-256 IS the request `projection_sql_sha256`
// (contract request key, separate from `w_activation_tuple_sha256`). NOTE: the
// plan's phrase "bound from the W tuple's activation_sql_projection_sha256"
// (field 5 = a42d6d39, the activation barrier's 8839-byte MUTATION SQL) is a
// plan imprecision — field 5 is incompatible with a read-only allowlist. The
// contract separates the two hashes; projection_sql_sha256 is this file's hash.
const PROJECTION_SQL = resolve(REPO_ROOT, 'deploy/qdrant/q12-activation-truth-projection.sql');
const PROJECTION_SQL_SHA256 = 'ba31de92256bc1f5444ab3b8dbcd814052b54664bd93fc16bc0de55a24050e6d';

// Accepted W lock catalog/order (fields 8/9) — the sole authority for the
// full-catalog SHARE lock relation set and order.
const LOCK_ORDER = resolve(
  REPO_ROOT,
  'deploy/qdrant/q12-activation-lock-order.test-reference.json'
);
const LOCK_CATALOG = resolve(
  REPO_ROOT,
  'deploy/qdrant/q12-activation-lock-catalog.test-reference.json'
);

describe('Task 2 — exact SQL projection bundle', () => {
  it('exists and its SHA-256 equals the request projection_sql_sha256', () => {
    const bytes = readFileSync(PROJECTION_SQL);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(PROJECTION_SQL_SHA256);
  });

  it('binds the accepted W catalog/order (fields 8/9) unchanged', () => {
    expect(createHash('sha256').update(readFileSync(LOCK_CATALOG)).digest('hex')).toBe(
      W_TUPLE.activation_lock_catalog_sha256
    );
    expect(createHash('sha256').update(readFileSync(LOCK_ORDER)).digest('hex')).toBe(
      W_TUPLE.activation_lock_order_sha256
    );
  });

  it('splits into exactly the expected named templates', () => {
    const sql = readFileSync(PROJECTION_SQL, 'utf8');
    const templates = probe.splitProjectionTemplates(sql);
    expect([...templates.keys()].sort()).toEqual([...probe.PROJECTION_TEMPLATE_NAMES].sort());
    expect(templates.get('transaction_begin')).toContain(
      'BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY'
    );
    expect(templates.get('transaction_begin')).toContain("SET LOCAL lock_timeout = '120s'");
    expect(templates.get('transaction_begin')).toContain("SET LOCAL statement_timeout = '180s'");
    expect(templates.get('transaction_begin')).toContain(
      "SET LOCAL idle_in_transaction_session_timeout = '300s'"
    );
    expect(templates.get('full_catalog_share_lock')).toContain('IN SHARE MODE');
    expect(templates.get('clear_snapshot')).toContain('pg_stat_clear_snapshot()');
  });

  it('bakes the full-catalog SHARE lock in the accepted byte order', () => {
    const sql = readFileSync(PROJECTION_SQL, 'utf8');
    const lockTemplate = probe.splitProjectionTemplates(sql).get('full_catalog_share_lock') ?? '';
    const order = JSON.parse(readFileSync(LOCK_ORDER, 'utf8')) as { relations: string[] };
    // Every relation appears, in the accepted order (ascending offsets).
    let cursor = -1;
    for (const relation of order.relations) {
      const at = lockTemplate.indexOf(relation, cursor + 1);
      expect(at, `relation ${relation} missing or out of order`).toBeGreaterThan(cursor);
      cursor = at;
    }
  });

  it('contains no forbidden constructs outside quoted literals/identifiers', () => {
    const sql = readFileSync(PROJECTION_SQL, 'utf8');
    // Strip line comments, single-quoted literals, and double-quoted identifiers
    // so quoted privilege names ('UPDATE' etc.) do not trip the scan.
    const stripped = sql
      .replace(/--[^\n]*/g, ' ')
      .replace(/'(?:[^']|'')*'/g, " '' ")
      .replace(/"(?:[^"]|"")*"/g, ' "" ');
    for (const forbidden of probe.PROJECTION_FORBIDDEN) {
      expect(
        new RegExp(`\\b${forbidden}\\b`, 'i').test(stripped),
        `forbidden construct ${forbidden} present`
      ).toBe(false);
    }
    // assertProjectionAllowlist accepts the real bundle and rejects tampering.
    expect(() => probe.assertProjectionAllowlist(sql)).not.toThrow();
    expect(() =>
      probe.assertProjectionAllowlist(sql + '\n--@template evil\nDROP TABLE x;\n--@end evil\n')
    ).toThrow();
  });
});

// Production endpoint (contract "Immutable database and TLS identity").
const PROD_URL =
  'postgresql://postgres.diqooqbuchsliypgwksu@aws-1-us-east-2.pooler.supabase.com:5432/postgres';
const PROD_CA_SHA256 = '700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7';

describe('Task 3 — connection identity + TLS + post-connect asserts (unit)', () => {
  it('accepts exactly the production URL', () => {
    expect(probe.parseProductionUrl(PROD_URL)).toEqual({
      scheme: 'postgresql',
      host: 'aws-1-us-east-2.pooler.supabase.com',
      port: 5432,
      user: 'postgres.diqooqbuchsliypgwksu',
      database: 'postgres',
    });
    expect(probe.PROD_CA_SHA256).toBe(PROD_CA_SHA256);
  });

  it('rejects any deviation from the production endpoint', () => {
    const deviations = [
      'postgres://postgres.diqooqbuchsliypgwksu@aws-1-us-east-2.pooler.supabase.com:5432/postgres',
      'postgresql://postgres.diqooqbuchsliypgwksu@aws-1-us-east-2.pooler.supabase.com:6543/postgres',
      'postgresql://postgres.diqooqbuchsliypgwksu@aws-1-us-east-2.pooler.supabase.com:5432/other',
      'postgresql://postgres@aws-1-us-east-2.pooler.supabase.com:5432/postgres',
      'postgresql://postgres.diqooqbuchsliypgwksu@evil.example.com:5432/postgres',
      PROD_URL + '?sslmode=require',
      PROD_URL + '#frag',
    ];
    for (const url of deviations) {
      expect(() => probe.parseProductionUrl(url), url).toThrow();
    }
  });

  it('builds verify-full TLS and rejects a CA whose hash is not the pinned digest', () => {
    const syntheticCa =
      '-----BEGIN CERTIFICATE-----\nsynthetic-ca-for-tests\n-----END CERTIFICATE-----\n';
    // A synthetic CA fails the pinned production digest by design (reject path).
    expect(() =>
      probe.buildTlsConfig(syntheticCa, {
        serverName: probe.PRODUCTION_ENDPOINT.host,
        expectedCaSha256: PROD_CA_SHA256,
      })
    ).toThrow(/ca/i);
    // The accept mechanism: a CA that matches its own expected digest yields a
    // verify-full config bound to the pinned server name.
    const selfHash = createHash('sha256').update(syntheticCa).digest('hex');
    const config = probe.buildTlsConfig(syntheticCa, {
      serverName: probe.PRODUCTION_ENDPOINT.host,
      expectedCaSha256: selfHash,
    });
    expect(config.rejectUnauthorized).toBe(true);
    expect(config.servername).toBe('aws-1-us-east-2.pooler.supabase.com');
    expect(config.ca).toBe(syntheticCa);
  });

  it('accepts a valid post-connect identity and rejects each deviation', () => {
    const ok = {
      session_user: 'postgres',
      current_database: 'postgres',
      transaction_read_only: 'on',
      transaction_isolation: 'read committed',
      server_version_num: 170010,
    };
    expect(() => probe.assertPostConnect(ok)).not.toThrow();
    expect(() => probe.assertPostConnect({ ...ok, session_user: 'authenticator' })).toThrow();
    expect(() => probe.assertPostConnect({ ...ok, current_database: 'other' })).toThrow();
    expect(() => probe.assertPostConnect({ ...ok, transaction_read_only: 'off' })).toThrow();
    expect(() =>
      probe.assertPostConnect({ ...ok, transaction_isolation: 'serializable' })
    ).toThrow();
    expect(() => probe.assertPostConnect({ ...ok, server_version_num: 180000 })).toThrow();
    expect(() => probe.assertPostConnect({ ...ok, server_version_num: 160099 })).toThrow();
  });

  it('forbids transparent reconnect on a backend/pooler change', () => {
    const epoch = { backend_pid: 4242, backend_start_utc: '2026-07-16T00:00:00.000Z' };
    expect(() => probe.assertBackendContinuity(epoch, { ...epoch })).not.toThrow();
    expect(() => probe.assertBackendContinuity(epoch, { ...epoch, backend_pid: 9999 })).toThrow(
      /epoch|backend/i
    );
    expect(() =>
      probe.assertBackendContinuity(epoch, {
        ...epoch,
        backend_start_utc: '2026-07-16T00:00:01.000Z',
      })
    ).toThrow(/epoch|backend/i);
  });
});

// ===========================================================================
// Disposable PostgreSQL 17.10 container harness (contract "Required RED/
// capability and verification gates"). Gated by MC2_Q12_REAL_PG17=1; modeled on
// tests/unit/ops/q12-structural-catalog-pg17.test.ts. Synthetic fixtures only;
// no live/remote connection of any kind.
// ===========================================================================
const REAL_PG17 = process.env.MC2_Q12_REAL_PG17 === '1';
const POSTGRES_IMAGE = 'postgres:17.10-bookworm';
const POSTGRES_PASSWORD = 'q12-d6-local-pg17-fixture-only';
const CONTAINER = `mc2-q12-d6-pg17-${process.pid}-${Date.now()}`;

interface CommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
}
interface AsyncPsql {
  child: import('node:child_process').ChildProcessWithoutNullStreams;
  output: () => string;
}

const PROJECTION_TEMPLATES = (() => {
  try {
    return probe.splitProjectionTemplates(readFileSync(PROJECTION_SQL, 'utf8'));
  } catch {
    return new Map<string, string>();
  }
})();
const ORDER_RELATIONS = (() => {
  try {
    return (JSON.parse(readFileSync(LOCK_ORDER, 'utf8')) as { relations: string[] }).relations;
  } catch {
    return [] as string[];
  }
})();

async function importChildProcess() {
  return await import('node:child_process');
}

let dockerFns: {
  docker: (args: string[], input?: string, timeout?: number) => CommandResult;
  psqlResult: (sql: string, appName?: string) => CommandResult;
  psql: (sql: string, appName?: string) => string;
  spawnPsql: (sql: string, appName: string) => AsyncPsql;
  waitForOutput: (session: AsyncPsql, marker: string, timeout?: number) => Promise<void>;
  waitForExit: (session: AsyncPsql, timeout?: number) => Promise<number | null>;
};

describe.runIf(REAL_PG17)('D6 probe against disposable PostgreSQL 17.10', () => {
  beforeAll(async () => {
    const { spawn, spawnSync } = await importChildProcess();
    const docker = (args: string[], input?: string, timeout = 120_000): CommandResult => {
      const r = spawnSync('docker', args, {
        encoding: 'utf8',
        input,
        timeout,
        maxBuffer: 32 * 1024 * 1024,
      });
      return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
    };
    const psqlResult = (sql: string, appName = 'q12-d6-fixture'): CommandResult =>
      docker(
        [
          'exec',
          '-i',
          '-e',
          `PGPASSWORD=${POSTGRES_PASSWORD}`,
          '-e',
          `PGAPPNAME=${appName}`,
          CONTAINER,
          'psql',
          '-X',
          '-h',
          '127.0.0.1',
          '-v',
          'ON_ERROR_STOP=1',
          '-U',
          'postgres',
          '-d',
          'postgres',
          '-At',
        ],
        `${sql.trim()}\n`
      );
    const psql = (sql: string, appName = 'q12-d6-fixture'): string => {
      const r = psqlResult(sql, appName);
      expect(r.status, r.stderr || r.stdout).toBe(0);
      return r.stdout.trim();
    };
    const spawnPsql = (sql: string, appName: string): AsyncPsql => {
      const child = spawn(
        'docker',
        [
          'exec',
          '-i',
          '-e',
          `PGPASSWORD=${POSTGRES_PASSWORD}`,
          '-e',
          `PGAPPNAME=${appName}`,
          CONTAINER,
          'psql',
          '-X',
          '-h',
          '127.0.0.1',
          '-v',
          'ON_ERROR_STOP=1',
          '-U',
          'postgres',
          '-d',
          'postgres',
          '-At',
        ],
        { stdio: ['pipe', 'pipe', 'pipe'] }
      );
      let output = '';
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', c => {
        output += c;
      });
      child.stderr.on('data', c => {
        output += c;
      });
      child.stdin.end(`${sql.trim()}\n`);
      return { child, output: () => output };
    };
    const waitForOutput = async (session: AsyncPsql, marker: string, timeout = 15_000) => {
      const started = Date.now();
      while (!session.output().includes(marker)) {
        if (session.child.exitCode !== null) {
          throw new Error(`psql exited before ${marker}: ${session.output()}`);
        }
        if (Date.now() - started > timeout) {
          session.child.kill('SIGKILL');
          throw new Error(`timed out waiting for ${marker}: ${session.output()}`);
        }
        await new Promise(r => setTimeout(r, 50));
      }
    };
    const waitForExit = async (session: AsyncPsql, timeout = 30_000): Promise<number | null> => {
      if (session.child.exitCode !== null) return session.child.exitCode;
      return await new Promise((resolveExit, rejectExit) => {
        const timer = setTimeout(() => {
          session.child.kill('SIGKILL');
          rejectExit(new Error(`timed out waiting for psql: ${session.output()}`));
        }, timeout);
        session.child.once('exit', code => {
          clearTimeout(timer);
          resolveExit(code);
        });
      });
    };
    dockerFns = { docker, psqlResult, psql, spawnPsql, waitForOutput, waitForExit };

    const started = docker([
      'run',
      '-d',
      '--rm',
      '--name',
      CONTAINER,
      '-e',
      `POSTGRES_PASSWORD=${POSTGRES_PASSWORD}`,
      POSTGRES_IMAGE,
    ]);
    expect(started.status, started.stderr).toBe(0);
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const probeReady = psqlResult("SELECT current_setting('server_version_num')");
      if (probeReady.status === 0 && probeReady.stdout.trim().startsWith('17')) {
        ready = true;
        break;
      }
      await new Promise(r => setTimeout(r, 200));
    }
    expect(ready, docker(['logs', CONTAINER]).stdout).toBe(true);

    // Synthetic catalog fixture: the accepted-order relations as empty tables,
    // plus q12_guard.active_run singleton and cron.job / net.http_request_queue
    // stand-ins so the read-only projection templates execute.
    const schemas = [...new Set(ORDER_RELATIONS.map(r => r.split('.')[0]))];
    const createSchemas = schemas.map(s => `CREATE SCHEMA IF NOT EXISTS ${s};`).join('\n');
    const createTables = ORDER_RELATIONS.filter(
      r => r !== 'cron.job' && r !== 'net.http_request_queue'
    )
      .map(r => `CREATE TABLE ${r}(id integer PRIMARY KEY);`)
      .join('\n');
    psql(`
      ${createSchemas}
      ${createTables}
      CREATE TABLE cron.job(jobid bigint PRIMARY KEY, schedule text, jobname text, active boolean);
      CREATE TABLE net.http_request_queue(id bigint PRIMARY KEY);
      CREATE SCHEMA IF NOT EXISTS q12_guard;
      CREATE TABLE q12_guard.active_run(run_id text PRIMARY KEY, activated boolean NOT NULL);
      INSERT INTO q12_guard.active_run(run_id, activated) VALUES ('run-fixture', false);
      INSERT INTO cron.job(jobid, schedule, jobname, active) VALUES
        (1,'* * * * *','q12-cron-1',true),(2,'* * * * *','q12-cron-2',true),
        (3,'* * * * *','q12-cron-3',true),(4,'* * * * *','q12-cron-4',true),
        (5,'* * * * *','q12-cron-5',true),(6,'* * * * *','q12-cron-6',true),
        (7,'* * * * *','q12-cron-7',true),(8,'* * * * *','q12-cron-8',true);
    `);
  }, 180_000);

  afterAll(() => {
    dockerFns?.docker(['rm', '-f', CONTAINER], undefined, 30_000);
  });

  it('Task 3 — proves PG17 identity, read-only, isolation, and version bounds', () => {
    const { psql } = dockerFns;
    // Prove the transaction actually enters READ ONLY / read committed, then
    // read the identity as a single delimited row (psql prints BEGIN/SET/COMMIT
    // command tags on other lines, so select the line that carries the row).
    const output = psql(
      `BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY;
       SET LOCAL lock_timeout = '120s';
       SELECT 'Q12ROW|' || session_user || '|' || current_database() || '|' ||
              current_setting('server_version_num') || '|' ||
              current_setting('transaction_isolation') || '|' ||
              current_setting('transaction_read_only');
       COMMIT;`
    );
    const rowLine = output.split('\n').find(line => line.startsWith('Q12ROW|'));
    expect(rowLine, output).toBeDefined();
    const [, session_user, current_database, versionStr, isolation, readOnly] = (
      rowLine as string
    ).split('|');
    expect(session_user).toBe('postgres');
    expect(current_database).toBe('postgres');
    expect(isolation).toBe('read committed');
    expect(readOnly).toBe('on');
    const server_version_num = Number(versionStr);
    expect(server_version_num).toBeGreaterThanOrEqual(170000);
    expect(server_version_num).toBeLessThan(180000);
    expect(() =>
      probe.assertPostConnect({
        session_user,
        current_database,
        transaction_read_only: readOnly,
        transaction_isolation: isolation,
        server_version_num,
      })
    ).not.toThrow();
    // Reject path: a PG18 report fails the version bound.
    expect(() =>
      probe.assertPostConnect({
        session_user,
        current_database,
        transaction_read_only: readOnly,
        transaction_isolation: isolation,
        server_version_num: 180000,
      })
    ).toThrow();
  });

  it('Task 4 — projects capability + per-OID lock privilege over the fixture catalog', () => {
    const { psql } = dockerFns;
    const template = PROJECTION_TEMPLATES.get('capability_lock_rows') ?? '';
    const json = psql(
      `BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY;
       SELECT pg_catalog.pg_stat_clear_snapshot();
       SELECT pg_catalog.jsonb_agg(t.row ORDER BY (t.row->>'qualified_name'))
       FROM (
         SELECT pg_catalog.jsonb_build_object(
           'qualified_name', s.qualified_name,
           'oid', s.oid,
           'maintain', s.priv_maintain,
           'update', s.priv_update,
           'delete', s.priv_delete,
           'truncate', s.priv_truncate
         ) AS row
         FROM (
           ${template.replace(/;\s*$/, '')}
         ) s
       ) t;
       COMMIT;`
    );
    const rowLine = json.split('\n').find(line => line.trim().startsWith('['));
    expect(rowLine, json).toBeDefined();
    const rawRows = JSON.parse(rowLine as string) as Array<Record<string, unknown>>;
    expect(rawRows.length).toBe(ORDER_RELATIONS.length);
    // As the owning superuser postgres, every relation is lock-authorized.
    const capability = probe.buildCapabilityObject({
      session_user: 'postgres',
      current_database: 'postgres',
      server_version_num: 170010,
      rows: rawRows,
      visibility: { member: true },
      clear_snapshot_executed: true,
    });
    expect(Object.keys(capability).sort()).toEqual(
      [
        'activity_visibility_mode',
        'activity_visibility_sha256',
        'clear_snapshot_executed',
        'current_database',
        'lock_privilege_sha256',
        'lock_relation_count',
        'schema_version',
        'server_version_num',
        'session_user',
      ].sort()
    );
    expect(capability.lock_relation_count).toBe(ORDER_RELATIONS.length);
    expect(capability.schema_version).toBe(probe.CAPABILITY_SCHEMA_VERSION);
    expect(capability.activity_visibility_mode).toBe('pg_read_all_stats_member');
  });

  it('Task 4 — a revoked strong privilege makes a relation fail the lock gate', () => {
    const { psql } = dockerFns;
    const target = ORDER_RELATIONS.find(r => r.startsWith('public.')) as string;
    psql(`
      DROP ROLE IF EXISTS q12_unpriv;
      CREATE ROLE q12_unpriv NOLOGIN;
      GRANT MAINTAIN, UPDATE, DELETE, TRUNCATE ON ${target} TO q12_unpriv;
    `);
    try {
      const authorized = psql(
        `SELECT pg_catalog.has_table_privilege('q12_unpriv', '${target}', 'UPDATE');`
      );
      expect(authorized).toBe('t');
      psql(`REVOKE MAINTAIN, UPDATE, DELETE, TRUNCATE ON ${target} FROM q12_unpriv;`);
      const rowJson = psql(
        `SELECT pg_catalog.jsonb_build_object(
           'qualified_name', '${target}',
           'oid', ('${target}')::regclass::oid::int8,
           'maintain', pg_catalog.has_table_privilege('q12_unpriv', '${target}', 'MAINTAIN'),
           'update', pg_catalog.has_table_privilege('q12_unpriv', '${target}', 'UPDATE'),
           'delete', pg_catalog.has_table_privilege('q12_unpriv', '${target}', 'DELETE'),
           'truncate', pg_catalog.has_table_privilege('q12_unpriv', '${target}', 'TRUNCATE')
         )::text;`
      );
      const rowLine = rowJson.split('\n').find(line => line.trim().startsWith('{')) as string;
      const raw = JSON.parse(rowLine) as Record<string, unknown>;
      const normalized = probe.normalizeLockRow(raw);
      expect(normalized.lock_authorized).toBe(false);
      expect(() => probe.assertLockRowsAuthorized([raw])).toThrow(/authorized/i);
    } finally {
      psql('DROP ROLE IF EXISTS q12_unpriv;');
    }
  });

  it('Task 4 — clears the stats snapshot and proves pg_read_all_stats membership', () => {
    const { psql } = dockerFns;
    expect(psql('SELECT pg_catalog.pg_stat_clear_snapshot() IS NULL;')).toBe('t');
    const member = psql(
      "SELECT pg_catalog.pg_has_role('postgres', 'pg_read_all_stats', 'MEMBER');"
    );
    expect(member).toBe('t');
    const resolved = probe.resolveActivityVisibility({ member: member === 't' });
    expect(resolved.mode).toBe('pg_read_all_stats_member');
    expect(resolved.definition_hash).toBe(probe.VISIBILITY_PG_READ_ALL_STATS_DEFINITION_HASH);
  });

  // @@CONTAINER_TESTS_END
});

describe('Task 4 — capability projection + visibility (unit)', () => {
  const baseRow = {
    qualified_name: 'public.q12_relation',
    oid: 16384,
    maintain: false,
    update: true,
    delete: false,
    truncate: false,
  };

  it('normalizes a lock row and derives lock_authorized as the OR of strong privileges', () => {
    expect(probe.normalizeLockRow(baseRow).lock_authorized).toBe(true);
    expect(
      probe.normalizeLockRow({ ...baseRow, update: false, maintain: true }).lock_authorized
    ).toBe(true);
    expect(
      probe.normalizeLockRow({
        ...baseRow,
        maintain: false,
        update: false,
        delete: false,
        truncate: false,
      }).lock_authorized
    ).toBe(false);
  });

  it('rejects a security-restricted null in any required privilege field', () => {
    expect(() => probe.normalizeLockRow({ ...baseRow, update: null })).toThrow(/null/i);
    expect(() => probe.normalizeLockRow({ ...baseRow, maintain: undefined })).toThrow();
  });

  it('fails the lock gate on an unauthorized, duplicate, or empty row set', () => {
    expect(() => probe.assertLockRowsAuthorized([baseRow])).not.toThrow();
    expect(() =>
      probe.assertLockRowsAuthorized([
        { ...baseRow, maintain: false, update: false, delete: false, truncate: false },
      ])
    ).toThrow(/authorized/i);
    expect(() => probe.assertLockRowsAuthorized([baseRow, baseRow])).toThrow(/duplicate/i);
    expect(() => probe.assertLockRowsAuthorized([])).toThrow(/empty|no rows/i);
  });

  it('resolves visibility only via pg_read_all_stats or a W-accepted equivalent digest', () => {
    expect(probe.resolveActivityVisibility({ member: true }).mode).toBe('pg_read_all_stats_member');
    const wHash = 'b'.repeat(64);
    expect(
      probe.resolveActivityVisibility({ member: false, wEquivalentDefinitionHash: wHash })
    ).toEqual({ mode: 'w_accepted_equivalent', definition_hash: wHash });
    // No membership and no accepted equivalent is a hard stop (D6 cannot invent).
    expect(() => probe.resolveActivityVisibility({ member: false })).toThrow(/visibility/i);
    expect(() =>
      probe.resolveActivityVisibility({ member: false, wEquivalentDefinitionHash: 'not-hex' })
    ).toThrow();
  });

  it('blocks when the snapshot clear did not execute', () => {
    expect(() => probe.assertClearSnapshotExecuted(true)).not.toThrow();
    expect(() => probe.assertClearSnapshotExecuted(false)).toThrow(/snapshot/i);
  });

  it('builds the 9-key capability object with derived hashes', () => {
    const capability = probe.buildCapabilityObject({
      session_user: 'postgres',
      current_database: 'postgres',
      server_version_num: 170010,
      rows: [baseRow],
      visibility: { member: true },
      clear_snapshot_executed: true,
    });
    expect(capability.lock_relation_count).toBe(1);
    expect(capability.activity_visibility_sha256).toBe(
      probe.VISIBILITY_PG_READ_ALL_STATS_DEFINITION_HASH
    );
    expect(capability.lock_privilege_sha256).toBe(
      probe.canonicalHash([probe.normalizeLockRow(baseRow)])
    );
    expect(() =>
      probe.buildCapabilityObject({
        session_user: 'postgres',
        current_database: 'postgres',
        server_version_num: 170010,
        rows: [{ ...baseRow, update: false, maintain: false, delete: false, truncate: false }],
        visibility: { member: true },
        clear_snapshot_executed: true,
      })
    ).toThrow(/authorized/i);
  });
});
