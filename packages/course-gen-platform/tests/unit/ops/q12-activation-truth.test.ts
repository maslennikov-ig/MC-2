/* eslint-disable max-lines -- single-file D6 probe suite fixed by the contract write zone */
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
  // Amended 2026-07-18 (RATIFIED cascade round): the accepted W tuple's field 4
  // was superseded 134255cecfb4361d5e9f1922d98f889ab7d3e01898b197dee096ab720039ed68 ->
  // 3673ee494549d6570c054af62660a9f96cb96ce7a9a08eafcf06c28e19d55ca9 by the ratified
  // frozen-barrier-fix round (see mc2-jz6y0.13-barrier-fix-review.md). This constant
  // is unused by any assertion in this suite (W_TUPLE is consumed only for
  // managed_inventory/lock_catalog/lock_order/command_manifest_sha256 below) but is
  // kept in sync with the tuple artifact to avoid a stale current-truth pin.
  activation_barrier_sha256: '3673ee494549d6570c054af62660a9f96cb96ce7a9a08eafcf06c28e19d55ca9',
  activation_sql_projection_sha256:
    'a42d6d39f3383c50de15b8aac5b1efd2e486c51bb6a47052a6d805d1589f224e',
  activation_normal_slice_sha256:
    'd413fbd79350f0bbd7e387f03cb242b2239640de1f7a8761ffa5fadd6a85b83f',
  activation_recovery_slice_sha256:
    'c41cf104c423623a56a3131c6e8d8148fae2db5af44772157c1e5a57be2d0063',
  // Amended 2026-07-28 (mc2-34eua): cron.job left the guarded set, so the locked relation set
  // went 79 -> 78. Prior 'cbfa2f092fe6370cd9929208029e083b3466d4fe9cf90c3b2801e8914285929a'.
  activation_lock_catalog_sha256:
    '05ee4e733ed59733d1effd20835089a2fa2996ba1a773b748ae515ba295dbf8f',
  // Amended 2026-07-28 (mc2-34eua); prior '26163c334f89331a54f3e0572da8e7e6e32bf83c7c266d2c32dc1b63138d3848'.
  activation_lock_order_sha256: 'de79e836a943bf9d4003a963bf3515b9401d5322b59067c8a6688e6c95de62ae',
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
  // Task 5
  assertTemplateAllowed(bundle: Map<string, string>, candidateSql: string): void;
  verifyGrantedLocks(input: {
    observed: Array<{ qualified_name: string; lock_mode: string; granted: boolean }>;
    expectedRelations: readonly string[];
  }): void;
  // Task 6
  assertActivationDigestsBound(
    provided: {
      normal_slice: string;
      recovery_slice: string;
      lock_catalog: string;
      lock_order: string;
    },
    wtuple: {
      activation_normal_slice_sha256: string;
      activation_recovery_slice_sha256: string;
      activation_lock_catalog_sha256: string;
      activation_lock_order_sha256: string;
    }
  ): void;
  assertCommonLockConflict(outcome: {
    probe_share_held: boolean;
    activation_blocked_while_share_held: boolean;
    activation_acquired_after_release: boolean;
    activation_committed: boolean;
  }): void;
  // Task 7
  INVENTORY_SCHEMA_VERSION: string;
  MANAGED_PROJECT_REF: string;
  MANAGED_SOURCE_DECISION_SHA256: string;
  PROBE_APP_IDENTITY: string;
  OBSERVED_ROW_KEYS: readonly string[];
  consumeManagedInventory(
    text: string,
    options: { expectedInventorySha256: string }
  ): Record<string, unknown>;
  projectObservedRow(raw: Record<string, unknown>): Record<string, unknown>;
  buildSessionObservation(
    inventory: Record<string, unknown>,
    rawRows: Array<Record<string, unknown>>,
    options: { probePid: number }
  ): { rows: Array<Record<string, unknown>>; sha256: string };
  // Task 8
  DB_PROJECTION_KEYS: readonly string[];
  HOST_PROJECTION_KEYS: readonly string[];
  buildDatabaseProjection(fields: Record<string, unknown>): Record<string, unknown>;
  buildHostProjection(fields: Record<string, unknown>): Record<string, unknown>;
  assertProjectionPreamble(input: { snapshot_cleared: unknown; fresh_read: unknown }): void;
  // Task 9
  validateEvidenceTable(input: {
    classification: string;
    activation_evidence_state: string;
    barrier_receipt_sha256: string | null;
    probe_receipt_sha256: string | null;
    activation_result_sha256: string | null;
    activation_process_projection_sha256: string | null;
    process_manifest_sha256: string | null;
    presence?: Record<string, 'present' | 'absent' | 'unsafe'>;
  }): void;
  assertCommittedReceiptPendingLegal(input: {
    barrier_is_predecessor_recovery_ready_guarded: boolean;
    process_manifest_present: boolean;
    zero_live_projection: boolean;
  }): void;
  // Task 10
  bindPreparedQuiescedPredecessor(input: {
    journal_entry_hash: string;
    checkpoint_sha256: string;
    writer_quiesce_manifest_sha256: string;
    is_unique_head: boolean;
    is_required_ancestor: boolean;
    rollback_final_writer_manifest_required?: boolean;
  }): { prepared_quiesced_predecessor_sha256: string; writer_quiesce_manifest_sha256: string };
  projectDockerObservation(input: {
    inspect: Array<Record<string, unknown>>;
    composePs: Array<Record<string, unknown>>;
  }): { sha256: string; total: number; held: number; final: number };
  // Task 11
  REQUEST_KEYS: readonly string[];
  validateRequest(request: Record<string, unknown>): Record<string, unknown>;
  assertRequestMatchesHostProjection(
    request: Record<string, unknown>,
    hostProjection: Record<string, unknown>
  ): void;
  buildDbLockedPayload(input: Record<string, unknown>): Record<string, unknown>;
  buildHostBoundPayload(input: Record<string, unknown>): Record<string, unknown>;
  buildSealedPayload(input: Record<string, unknown>): Record<string, unknown>;
  buildClosedPayload(input: Record<string, unknown>): Record<string, unknown>;
  validateHostProjectionPayload(payload: Record<string, unknown>): void;
  validatePredecisionPayload(payload: Record<string, unknown>): void;
  validateReleasePayload(payload: Record<string, unknown>): void;
  FRAME_SCHEMA_VERSION: string;
  ProbeProtocol: new (
    schemaVersion: string,
    runId: string
  ) => {
    emit(kind: string, payload: Record<string, unknown>): Record<string, unknown>;
    receive(frame: Record<string, unknown>): void;
    readonly done: boolean;
    readonly headHash: string | null;
  };
  // Task 12
  PRODUCTION_ARGV: readonly string[];
  assertProductionArgv(argv: readonly string[]): void;
  assertProductionEnv(env: Record<string, string>): void;
  assertRequiredFds(fdMap: Record<number, { access: string; lock_identity?: string }>): void;
  assertFd3NeverHashed(hashedFds: readonly number[]): void;
  // Task 13
  classifyRuntimeFd(entry: { kind: string; access: string }): boolean;
  assertRuntimeFdBaseline(input: {
    node_sha256: string;
    node_major: number;
    node_minor: number;
    libuv_version: string;
    kernel_generation: string;
    descriptors: Array<{ kind: string; access: string }>;
    baseline: {
      node_sha256: string;
      node_major: number;
      node_minor: number;
      libuv_version: string;
      kernel_generation: string;
    };
  }): void;
  // Task 14
  runProbeInspect(ctx: Record<string, unknown>): {
    frames: Array<Record<string, unknown>>;
    classification: string;
    activated: boolean;
    dbProjection: Record<string, unknown>;
    hostProjection: Record<string, unknown>;
  };
  // F1 — production inspect entrypoint + raw-I/O assembly + connection seam
  EXIT_REJECTED: number;
  main(runtime: Record<string, unknown>): Promise<number>;
  assembleInspect(io: Record<string, unknown>): Promise<{
    frames: Array<Record<string, unknown>>;
    classification: string;
    dbProjection: Record<string, unknown>;
    capability: Record<string, unknown>;
    sessionObservation: { rows: Array<Record<string, unknown>>; sha256: string };
  }>;
}

interface RunnerModule {
  buildSyntheticDockerInventory(options?: { corrupt?: string }): {
    inspect: Array<Record<string, unknown>>;
    composePs: Array<Record<string, unknown>>;
  };
  buildRootHostProjectionPayload(input: Record<string, unknown>): Record<string, unknown>;
  buildRootPredecisionPayload(input: Record<string, unknown>): Record<string, unknown>;
  buildRootReleasePayload(input: Record<string, unknown>): Record<string, unknown>;
}

const probe = require(PROBE_PATH) as ProbeModule;
const RUNNER_PATH = resolve(
  REPO_ROOT,
  'packages/course-gen-platform/tests/unit/ops/fixtures/q12-activation-truth-runner.cjs'
);

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
// Amended 2026-07-28 (mc2-34eua): cron.job left both the per-OID privilege list and the
// full-catalog SHARE lock list. Prior '36d280347650689de1d6c613f164c2eaa622f0eb567b134dd5b3b2cdad5332af'.
const PROJECTION_SQL_SHA256 = 'd5046e313e99a36938ddd9820fb3bf5cc78b8c1a92265b72242b689af3aa3e40';

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
// Host loopback port the disposable PG17 publishes 5432 on (set in beforeAll);
// used only by the F1 end-to-end test's injected pg connection seam.
let pgPort = 0;

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
      // Publish 5432 on a random host loopback port for the F1 end-to-end pg
      // connection seam; disable the logical replication launcher so the bare
      // PG17 session set matches the frozen managed-session inventory.
      '-p',
      '127.0.0.1::5432',
      POSTGRES_IMAGE,
      '-c',
      'max_logical_replication_workers=0',
    ]);
    expect(started.status, started.stderr).toBe(0);
    const portOut = docker(['port', CONTAINER, '5432/tcp']);
    const portMatch = portOut.stdout.trim().match(/:(\d+)\s*$/);
    pgPort = portMatch ? Number(portMatch[1]) : 0;
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
    // mc2-34eua: cron.job left the lock order (it is no longer trigger-guarded), so `cron` is no
    // longer implied by ORDER_RELATIONS — but the read-only projection templates still READ the cron
    // inventory, which is precisely the privilege-free guarantee that was retained. Name the schema
    // explicitly rather than deriving it from the lock set.
    const schemas = [...new Set([...ORDER_RELATIONS.map(r => r.split('.')[0]), 'cron'])];
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
    // pg_stat_clear_snapshot() returns void; prove it executes without error via
    // a following marker select in the same session.
    expect(psql("SELECT pg_catalog.pg_stat_clear_snapshot(); SELECT 'cleared';")).toContain(
      'cleared'
    );
    const member = psql(
      "SELECT pg_catalog.pg_has_role('postgres', 'pg_read_all_stats', 'MEMBER');"
    );
    expect(member).toBe('t');
    const resolved = probe.resolveActivityVisibility({ member: member === 't' });
    expect(resolved.mode).toBe('pg_read_all_stats_member');
    expect(resolved.definition_hash).toBe(probe.VISIBILITY_PG_READ_ALL_STATS_DEFINITION_HASH);
  });

  it('Task 5 — acquires the full-catalog SHARE lock and verifies every granted lock', () => {
    const { psql } = dockerFns;
    const lockTemplate = PROJECTION_TEMPLATES.get('full_catalog_share_lock') ?? '';
    const lockProjection = PROJECTION_TEMPLATES.get('lock_projection') ?? '';
    const out = psql(
      `BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY;
       SET LOCAL lock_timeout = '120s';
       SET LOCAL statement_timeout = '180s';
       SET LOCAL idle_in_transaction_session_timeout = '300s';
       ${lockTemplate}
       SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) ORDER BY (t.qualified_name))
       FROM ( ${lockProjection.replace(/;\s*$/, '')} ) t;
       COMMIT;`
    );
    const line = out.split('\n').find(l => l.trim().startsWith('[')) as string;
    const observed = JSON.parse(line) as Array<{
      qualified_name: string;
      lock_mode: string;
      granted: boolean;
    }>;
    expect(observed.length).toBe(ORDER_RELATIONS.length);
    expect(() =>
      probe.verifyGrantedLocks({ observed, expectedRelations: ORDER_RELATIONS })
    ).not.toThrow();
  });

  it('Task 5 — locking only q12_guard.active_run fails the full-catalog verification', () => {
    const { psql } = dockerFns;
    const lockProjection = PROJECTION_TEMPLATES.get('lock_projection') ?? '';
    const out = psql(
      `BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY;
       SET LOCAL lock_timeout = '120s';
       LOCK TABLE q12_guard.active_run IN SHARE MODE;
       SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) ORDER BY (t.qualified_name))
       FROM ( ${lockProjection.replace(/;\s*$/, '')} ) t;
       COMMIT;`
    );
    const line = out.split('\n').find(l => l.trim().startsWith('[')) as string;
    const observed = JSON.parse(line) as Array<{
      qualified_name: string;
      lock_mode: string;
      granted: boolean;
    }>;
    expect(() =>
      probe.verifyGrantedLocks({ observed, expectedRelations: ORDER_RELATIONS })
    ).toThrow();
  });

  it('Task 5 — the allowlist guard accepts bundle templates and rejects foreign SQL', () => {
    const lockTemplate = PROJECTION_TEMPLATES.get('full_catalog_share_lock') ?? '';
    expect(() => probe.assertTemplateAllowed(PROJECTION_TEMPLATES, lockTemplate)).not.toThrow();
    expect(() =>
      probe.assertTemplateAllowed(PROJECTION_TEMPLATES, 'DROP TABLE q12_guard.active_run;')
    ).toThrow(/allowlist|template/i);
    expect(() =>
      probe.assertTemplateAllowed(PROJECTION_TEMPLATES, 'SELECT pg_sleep(1);')
    ).toThrow();
  });

  it('Task 6 — probe SHARE conflicts with activation ACCESS EXCLUSIVE (wait-winner ordering)', async () => {
    const { psql, spawnPsql, waitForOutput, waitForExit } = dockerFns;
    const common = 'supabase_migrations.schema_migrations';
    const probeSession = spawnPsql(
      `BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY;
       LOCK TABLE ${common} IN SHARE MODE;
       \\echo Q12_PROBE_SHARE_HELD
       SELECT pg_sleep(4);
       COMMIT;
       \\echo Q12_PROBE_RELEASED`,
      'q12-d6-probe-share'
    );
    await waitForOutput(probeSession, 'Q12_PROBE_SHARE_HELD');
    const activation = spawnPsql(
      `BEGIN;
       \\echo Q12_ACT_STARTED
       LOCK TABLE ${common} IN ACCESS EXCLUSIVE MODE;
       \\echo Q12_ACT_LOCK_ACQUIRED
       INSERT INTO ${common}(id) VALUES (987654);
       COMMIT;
       \\echo Q12_ACT_COMMITTED`,
      'q12-d6-activation-slice'
    );
    await waitForOutput(activation, 'Q12_ACT_STARTED');
    // Prove the activation slice is blocked on the common relation before any
    // mutation while the probe holds SHARE.
    let waiting = '0';
    for (let attempt = 0; attempt < 40; attempt += 1) {
      waiting = psql(
        `SELECT count(*) FROM pg_catalog.pg_locks
         WHERE relation = '${common}'::regclass
           AND mode = 'AccessExclusiveLock' AND NOT granted;`
      );
      if (waiting === '1') break;
      await new Promise(r => setTimeout(r, 100));
    }
    expect(waiting).toBe('1');
    expect(activation.output()).not.toContain('Q12_ACT_LOCK_ACQUIRED');
    // Probe releases; only then may activation acquire and commit.
    expect(await waitForExit(probeSession), probeSession.output()).toBe(0);
    await waitForOutput(activation, 'Q12_ACT_LOCK_ACQUIRED');
    await waitForOutput(activation, 'Q12_ACT_COMMITTED');
    expect(await waitForExit(activation), activation.output()).toBe(0);
    const probeReleasedFirst =
      probeSession.output().includes('Q12_PROBE_RELEASED') &&
      activation.output().includes('Q12_ACT_LOCK_ACQUIRED');
    expect(() =>
      probe.assertCommonLockConflict({
        probe_share_held: true,
        activation_blocked_while_share_held: waiting === '1',
        activation_acquired_after_release: probeReleasedFirst,
        activation_committed: activation.output().includes('Q12_ACT_COMMITTED'),
      })
    ).not.toThrow();
    // Clean the inserted mutation row so the fixture stays reusable.
    psql(`DELETE FROM ${common} WHERE id = 987654;`);
  }, 60_000);

  it('Task 7 — projects the probe backend row from real pg_stat_activity', () => {
    const { psql } = dockerFns;
    const out = psql(
      `SELECT pg_catalog.pg_stat_clear_snapshot();
       SELECT pg_catalog.jsonb_build_object(
         'role', sa.usename, 'database', sa.datname, 'backend_type', sa.backend_type,
         'application_identity', sa.application_name, 'client_class', 'probe',
         'state', sa.state,
         'xact_start_is_null', (sa.xact_start IS NULL),
         'backend_xid_is_null', (sa.backend_xid IS NULL),
         'backend_xmin_is_null', (sa.backend_xmin IS NULL),
         'pid', sa.pid,
         'backend_start_utc', pg_catalog.to_char(sa.backend_start AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
       )::text
       FROM pg_catalog.pg_stat_activity sa
       WHERE sa.pid = pg_catalog.pg_backend_pid();`,
      'megacampus-q12-activation-truth'
    );
    const line = out.split('\n').find(l => l.trim().startsWith('{')) as string;
    const raw = JSON.parse(line) as Record<string, unknown>;
    const projected = probe.projectObservedRow(raw);
    expect(Object.keys(projected).sort()).toEqual([...probe.OBSERVED_ROW_KEYS].sort());
    expect(projected.role).toBe('postgres');
    expect(projected.database).toBe('postgres');
    expect(projected.application_identity).toBe('megacampus-q12-activation-truth');
    expect(projected.state).toBe('active');
    expect(typeof projected.pid).toBe('number');
  });

  it('Task 8 — builds a database projection with net-queue-zero and prepared-zero invariants', () => {
    const { psql } = dockerFns;
    const counts = psql(
      `SELECT
         (SELECT pg_catalog.count(*) FROM net.http_request_queue)::int8 || '|' ||
         (SELECT pg_catalog.count(*) FROM pg_catalog.pg_prepared_xacts)::int8 || '|' ||
         (SELECT pg_catalog.count(*) FROM cron.job)::int8;`
    );
    const line = counts.split('\n').find(l => l.includes('|')) as string;
    const [netQueue, prepared, cron] = line.split('|').map(Number);
    expect(netQueue).toBe(0);
    expect(prepared).toBe(0);
    expect(cron).toBe(8);
    const fields = makeDbFields({
      global_pg_net_queue_count: netQueue,
      prepared_xact_count: prepared,
      active_cron_count: cron,
    });
    expect(() => probe.buildDatabaseProjection(fields)).not.toThrow();
    expect(() =>
      probe.buildDatabaseProjection({ ...fields, global_pg_net_queue_count: 1 })
    ).toThrow(/net|queue/i);
  });

  it('Task 14 — drives the full inspect protocol for each classification against PG17', () => {
    const runner = require(RUNNER_PATH) as RunnerModule;
    const { psql } = dockerFns;
    const HH = 'a'.repeat(64);

    // Real DB facts: acquire the full-catalog SHARE lock and project pg_locks.
    const lockTemplate = PROJECTION_TEMPLATES.get('full_catalog_share_lock') ?? '';
    const lockProjection = PROJECTION_TEMPLATES.get('lock_projection') ?? '';
    const capTemplate = PROJECTION_TEMPLATES.get('capability_lock_rows') ?? '';
    const lockOut = psql(
      `BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY;
       SET LOCAL lock_timeout = '120s';
       ${lockTemplate}
       SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) ORDER BY (t.qualified_name))
       FROM ( ${lockProjection.replace(/;\s*$/, '')} ) t;
       COMMIT;`
    );
    const observed = JSON.parse(lockOut.split('\n').find(l => l.trim().startsWith('[')) as string);
    const capOut = psql(
      `BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY;
       SELECT pg_catalog.pg_stat_clear_snapshot();
       SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
         'qualified_name', s.qualified_name, 'oid', s.oid,
         'maintain', s.priv_maintain, 'update', s.priv_update,
         'delete', s.priv_delete, 'truncate', s.priv_truncate
       ) ORDER BY s.qualified_name)
       FROM ( ${capTemplate.replace(/;\s*$/, '')} ) s;
       COMMIT;`
    );
    const capRows = JSON.parse(capOut.split('\n').find(l => l.trim().startsWith('[')) as string);
    const capability = probe.buildCapabilityObject({
      session_user: 'postgres',
      current_database: 'postgres',
      server_version_num: 170010,
      rows: capRows,
      visibility: { member: true },
      clear_snapshot_executed: true,
    });
    const countsLine = psql(
      `SELECT (SELECT pg_catalog.count(*) FROM net.http_request_queue)::int8 || '|' ||
              (SELECT pg_catalog.count(*) FROM pg_catalog.pg_prepared_xacts)::int8 || '|' ||
              (SELECT pg_catalog.count(*) FROM cron.job)::int8;`
    )
      .split('\n')
      .find(l => l.includes('|')) as string;
    const [netQueue, prepared, cron] = countsLine.split('|').map(Number);
    expect(netQueue).toBe(0);

    // Synthetic session observation (bare PG17 lacks the managed provider plane).
    const inventory = probe.consumeManagedInventory(
      readFileSync(resolve(REPO_ROOT, 'deploy/qdrant/q12-managed-session-inventory.json'), 'utf8'),
      { expectedInventorySha256: W_TUPLE.managed_inventory_sha256 }
    );
    const sessionObservation = probe.buildSessionObservation(
      inventory,
      [
        {
          role: 'postgres',
          database: 'postgres',
          backend_type: 'client backend',
          application_identity: 'megacampus-q12-activation-truth',
          state: 'active',
          xact_start_is_null: false,
          backend_xid_is_null: true,
          backend_xmin_is_null: false,
          pid: 4242,
          backend_start_utc: '2026-07-16T00:00:00.000Z',
        },
      ],
      { probePid: 4242 }
    );
    // 10+5 Docker truth from the fixture runner.
    const docker = runner.buildSyntheticDockerInventory();
    const dockerObservation = probe.projectDockerObservation(docker);
    expect(dockerObservation.total).toBe(15);
    // Disconnect invalidation: a changed backend epoch forbids reconnect.
    expect(() =>
      probe.assertBackendContinuity(
        { backend_pid: 4242, backend_start_utc: '2026-07-16T00:00:00.000Z' },
        { backend_pid: 9999, backend_start_utc: '2026-07-16T00:00:00.000Z' }
      )
    ).toThrow();

    const lockProjectionSha = probe.canonicalHash(observed);
    const scenarios = [
      {
        evidence_state: 'prepared_guarded',
        classification: 'precommit_rollback',
        barrier: HH,
        probe: HH,
        result: null,
        proc: HH,
        manifest: null,
        activated: false,
        plannedR: { journal: HH, checkpoint: HH },
        actualR: { journal: HH, checkpoint: HH },
      },
      {
        evidence_state: 'complete_receipt',
        classification: 'committed_finish_forward',
        barrier: HH,
        probe: HH,
        result: HH,
        proc: HH,
        manifest: HH,
        activated: true,
        plannedR: { journal: null, checkpoint: null },
        actualR: { journal: null, checkpoint: null },
      },
      {
        evidence_state: 'incident_observed',
        classification: 'drift_incident',
        barrier: HH,
        probe: HH,
        result: HH,
        proc: HH,
        manifest: HH,
        presence: {
          barrier_receipt: 'present',
          probe_receipt: 'present',
          activation_result: 'present',
          process_manifest: 'present',
        },
        activated: false,
        plannedR: { journal: null, checkpoint: null },
        actualR: { journal: null, checkpoint: null },
      },
    ] as const;

    for (const s of scenarios) {
      const evidenceFields = {
        activation_evidence_state: s.evidence_state,
        barrier_receipt_sha256: s.barrier,
        probe_receipt_sha256: s.probe,
        activation_result_sha256: s.result,
        activation_process_projection_sha256: s.proc,
        process_manifest_sha256: s.manifest,
      };
      const request = {
        schema_version: 'megacampus.q12.activation-truth-request/v1',
        run_id: 'run-scenario',
        release_sha: HH,
        lease_epoch: 7,
        predecessor_journal_entry_hash: HH,
        predecessor_checkpoint_sha256: HH,
        previous_terminal_seal_sha256: null,
        abandoned_predecision_sha256: null,
        expected_catalog_sha256: HH,
        expected_post_migration_catalog_sha256: HH,
        database_capability_sha256: HH,
        activation_capability_sha256: HH,
        prepared_quiesced_predecessor_sha256: HH,
        writer_quiesce_manifest_sha256: HH,
        ...evidenceFields,
        w_activation_tuple_sha256: HH,
        projection_sql_sha256: HH,
        spawn_capability_sha256: HH,
        runtime_fd_baseline_sha256: HH,
      };
      const ctx = {
        request,
        postConnect: {
          session_user: 'postgres',
          current_database: 'postgres',
          transaction_read_only: 'on',
          transaction_isolation: 'read committed',
          server_version_num: 170010,
        },
        lockVerification: { observed, expectedRelations: ORDER_RELATIONS },
        capability,
        fd9_identity_sha256: HH,
        sessionObservationSha: sessionObservation.sha256,
        dbFields: makeDbFields({
          run_id: 'run-scenario',
          lock_projection_sha256: lockProjectionSha,
          capability_projection_sha256: probe.canonicalHash(capability),
          session_observation_sha256: sessionObservation.sha256,
          global_pg_net_queue_count: netQueue,
          prepared_xact_count: prepared,
          active_cron_count: cron,
        }),
        evidence: { classification: s.classification, ...evidenceFields, presence: s.presence },
        hostFields: makeHostFields({
          run_id: 'run-scenario',
          lease_epoch: 7,
          ...evidenceFields,
          docker_observation_sha256: dockerObservation.sha256,
        }),
        rootPayloads: {
          hostProjection: runner.buildRootHostProjectionPayload({
            classification: s.classification,
            request_sha256: HH,
            initial_database_projection_sha256: HH,
            host_projection_sha256: HH,
            prepared_quiesced_predecessor_sha256: HH,
          }),
          predecision: runner.buildRootPredecisionPayload({
            classification: s.classification,
            request_sha256: HH,
            predecision_sha256: HH,
            planned_r_journal_entry_hash: s.plannedR.journal,
            planned_r_checkpoint_sha256: s.plannedR.checkpoint,
            predecessor_journal_entry_hash: HH,
            predecessor_checkpoint_sha256: HH,
          }),
          release: runner.buildRootReleasePayload({
            request_sha256: HH,
            predecision_sha256: HH,
            sealed_frame_sha256: HH,
            actual_r_journal_entry_hash: s.actualR.journal,
            actual_r_checkpoint_sha256: s.actualR.checkpoint,
          }),
        },
        actualR: s.actualR,
        activated: s.activated,
      };
      const result = probe.runProbeInspect(ctx);
      expect(result.frames.length).toBe(7);
      // Verify the chain links across all seven frames.
      for (let i = 1; i < result.frames.length; i += 1) {
        expect(result.frames[i].previous_frame_sha256).toBe(result.frames[i - 1].frame_sha256);
        expect(result.frames[i].sequence).toBe(i + 1);
      }
      expect(result.classification).toBe(s.classification);
      expect(result.activated).toBe(s.activated);
      expect((result.frames[6].payload as Record<string, unknown>).transaction_end).toBe(
        'read_only_commit'
      );
    }
  });

  it('F2 — coalesces provider nulls to inventory sentinels; background rows are not drift', () => {
    const { psql } = dockerFns;
    const template = PROJECTION_TEMPLATES.get('session_activity') ?? '';
    const out = psql(
      `SELECT pg_catalog.pg_stat_clear_snapshot();
       SELECT pg_catalog.jsonb_build_object(
         'probe_pid', pg_catalog.pg_backend_pid(),
         'rows', pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) ORDER BY t.pid)
       )
       FROM ( ${template.replace(/;\s*$/, '')} ) t
       WHERE t.backend_type IN
             ('autovacuum launcher', 'background writer', 'checkpointer', 'walwriter')
          OR t.pid = pg_catalog.pg_backend_pid();`,
      'megacampus-q12-activation-truth'
    );
    const line = out.split('\n').find(l => l.trim().startsWith('{')) as string;
    const parsed = JSON.parse(line) as {
      probe_pid: number;
      rows: Array<Record<string, unknown>>;
    };
    const backgroundRows = parsed.rows.filter(r => r.backend_type !== 'client backend');
    expect(backgroundRows.length).toBeGreaterThan(0);
    // Real background workers report NULL usename/datname/application_name/state;
    // the template must coalesce them to the inventory sentinels.
    for (const row of backgroundRows) {
      expect(row.role, JSON.stringify(row)).toBe('');
      expect(row.database).toBe('');
      expect(row.application_identity).toBe('');
      expect(row.state).toBe('none');
    }
    // The full observation (background rows + the probe backend) is NOT drift.
    const inventory = probe.consumeManagedInventory(
      readFileSync(resolve(REPO_ROOT, 'deploy/qdrant/q12-managed-session-inventory.json'), 'utf8'),
      { expectedInventorySha256: W_TUPLE.managed_inventory_sha256 }
    );
    expect(() =>
      probe.buildSessionObservation(inventory, parsed.rows, { probePid: parsed.probe_pid })
    ).not.toThrow();
  });

  it('F3 — the real capability template output feeds normalizeLockRow correctly', () => {
    const { psql } = dockerFns;
    const capTemplate = PROJECTION_TEMPLATES.get('capability_lock_rows') ?? '';
    const out = psql(
      `BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY;
       SELECT pg_catalog.jsonb_build_object(
         'qualified_name', s.qualified_name, 'oid', s.oid,
         'maintain', s.priv_maintain, 'update', s.priv_update,
         'delete', s.priv_delete, 'truncate', s.priv_truncate
       )::text
       FROM ( ${capTemplate.replace(/;\s*$/, '')} ) s
       LIMIT 1;
       COMMIT;`
    );
    const rowLine = out.split('\n').find(l => l.trim().startsWith('{')) as string;
    const raw = JSON.parse(rowLine) as Record<string, unknown>;
    const normalized = probe.normalizeLockRow(raw);
    expect(normalized.lock_authorized).toBe(true);
    expect(typeof normalized.oid).toBe('number');
  });

  it('F1 — assembleInspect runs the full raw-I/O flow end-to-end against PG17', async () => {
    const runner = require(RUNNER_PATH) as RunnerModule;
    const { Client } = require('pg') as typeof import('pg');
    const HH = 'a'.repeat(64);
    const projectionSqlText = readFileSync(PROJECTION_SQL, 'utf8');
    const inventory = probe.consumeManagedInventory(
      readFileSync(resolve(REPO_ROOT, 'deploy/qdrant/q12-managed-session-inventory.json'), 'utf8'),
      { expectedInventorySha256: W_TUPLE.managed_inventory_sha256 }
    );
    const request = {
      schema_version: 'megacampus.q12.activation-truth-request/v1',
      run_id: 'run-f1e2e',
      release_sha: HH,
      lease_epoch: 7,
      predecessor_journal_entry_hash: HH,
      predecessor_checkpoint_sha256: HH,
      previous_terminal_seal_sha256: null,
      abandoned_predecision_sha256: null,
      expected_catalog_sha256: HH,
      expected_post_migration_catalog_sha256: HH,
      database_capability_sha256: HH,
      activation_capability_sha256: HH,
      prepared_quiesced_predecessor_sha256: HH,
      writer_quiesce_manifest_sha256: HH,
      activation_evidence_state: 'prepared_guarded',
      barrier_receipt_sha256: HH,
      probe_receipt_sha256: HH,
      activation_result_sha256: null,
      activation_process_projection_sha256: HH,
      process_manifest_sha256: null,
      w_activation_tuple_sha256: HH,
      projection_sql_sha256: PROJECTION_SQL_SHA256,
      spawn_capability_sha256: HH,
      runtime_fd_baseline_sha256: HH,
    };
    // Synthetic Root frames chained reactively on each probe frame (the FD-6
    // control-pipe seam stands in for the Root coordinator, precommit path).
    const rootResponder = (prevSha: string, kind: string, seq: number): Record<string, unknown> => {
      let payload: Record<string, unknown>;
      if (kind === 'host_projection') {
        payload = runner.buildRootHostProjectionPayload({
          classification: 'precommit_rollback',
          request_sha256: HH,
          initial_database_projection_sha256: HH,
          host_projection_sha256: HH,
          prepared_quiesced_predecessor_sha256: HH,
        });
      } else if (kind === 'predecision') {
        payload = runner.buildRootPredecisionPayload({
          classification: 'precommit_rollback',
          request_sha256: HH,
          predecision_sha256: HH,
          planned_r_journal_entry_hash: HH,
          planned_r_checkpoint_sha256: HH,
          predecessor_journal_entry_hash: HH,
          predecessor_checkpoint_sha256: HH,
        });
      } else {
        payload = runner.buildRootReleasePayload({
          request_sha256: HH,
          predecision_sha256: HH,
          sealed_frame_sha256: HH,
          actual_r_journal_entry_hash: HH,
          actual_r_checkpoint_sha256: HH,
        });
      }
      return probe.makeFrame({
        schema_version: probe.FRAME_SCHEMA_VERSION,
        sequence: seq,
        kind,
        run_id: request.run_id,
        payload,
        previous_frame_sha256: prevSha,
      });
    };

    const client = new Client({
      host: '127.0.0.1',
      port: pgPort,
      user: 'postgres',
      password: POSTGRES_PASSWORD,
      database: 'postgres',
      application_name: 'megacampus-q12-activation-truth',
    });
    await client.connect();
    try {
      const result = await probe.assembleInspect({
        request,
        projectionSql: projectionSqlText,
        connection: client,
        expectedRelations: ORDER_RELATIONS,
        inventory,
        rootResponder,
        identities: { fd9_identity_sha256: HH },
        closeConnection: () => Promise.resolve(),
      });
      expect(result.frames.length).toBe(7);
      for (let i = 1; i < result.frames.length; i += 1) {
        expect(result.frames[i].previous_frame_sha256).toBe(result.frames[i - 1].frame_sha256);
        expect(result.frames[i].sequence).toBe(i + 1);
      }
      expect(result.classification).toBe('precommit_rollback');
      expect(result.dbProjection.global_pg_net_queue_count).toBe(0);
      expect(result.dbProjection.prepared_xact_count).toBe(0);
      expect(result.dbProjection.active_cron_count as number).toBe(8);
      expect(result.sessionObservation.rows.length).toBeGreaterThan(0);
      expect(result.capability.lock_relation_count).toBe(ORDER_RELATIONS.length);
      const closed = result.frames[6].payload as Record<string, unknown>;
      expect(closed.transaction_end).toBe('read_only_commit');
      expect(closed.connection_closed).toBe(true);
    } finally {
      await client.end();
    }
  }, 60_000);

  function buildPrecommitScenario(): {
    request: Record<string, unknown>;
    rootResponder: (prevSha: string, kind: string, seq: number) => Record<string, unknown>;
    inventory: Record<string, unknown>;
    projectionSqlText: string;
  } {
    const runner = require(RUNNER_PATH) as RunnerModule;
    const HH = 'a'.repeat(64);
    const projectionSqlText = readFileSync(PROJECTION_SQL, 'utf8');
    const inventory = probe.consumeManagedInventory(
      readFileSync(resolve(REPO_ROOT, 'deploy/qdrant/q12-managed-session-inventory.json'), 'utf8'),
      { expectedInventorySha256: W_TUPLE.managed_inventory_sha256 }
    );
    const request = {
      schema_version: 'megacampus.q12.activation-truth-request/v1',
      run_id: 'run-df1',
      release_sha: HH,
      lease_epoch: 7,
      predecessor_journal_entry_hash: HH,
      predecessor_checkpoint_sha256: HH,
      previous_terminal_seal_sha256: null,
      abandoned_predecision_sha256: null,
      expected_catalog_sha256: HH,
      expected_post_migration_catalog_sha256: HH,
      database_capability_sha256: HH,
      activation_capability_sha256: HH,
      prepared_quiesced_predecessor_sha256: HH,
      writer_quiesce_manifest_sha256: HH,
      activation_evidence_state: 'prepared_guarded',
      barrier_receipt_sha256: HH,
      probe_receipt_sha256: HH,
      activation_result_sha256: null,
      activation_process_projection_sha256: HH,
      process_manifest_sha256: null,
      w_activation_tuple_sha256: HH,
      projection_sql_sha256: PROJECTION_SQL_SHA256,
      spawn_capability_sha256: HH,
      runtime_fd_baseline_sha256: HH,
    };
    const rootResponder = (prevSha: string, kind: string, seq: number): Record<string, unknown> => {
      let payload: Record<string, unknown>;
      if (kind === 'host_projection') {
        payload = runner.buildRootHostProjectionPayload({
          classification: 'precommit_rollback',
          request_sha256: HH,
          initial_database_projection_sha256: HH,
          host_projection_sha256: HH,
          prepared_quiesced_predecessor_sha256: HH,
        });
      } else if (kind === 'predecision') {
        payload = runner.buildRootPredecisionPayload({
          classification: 'precommit_rollback',
          request_sha256: HH,
          predecision_sha256: HH,
          planned_r_journal_entry_hash: HH,
          planned_r_checkpoint_sha256: HH,
          predecessor_journal_entry_hash: HH,
          predecessor_checkpoint_sha256: HH,
        });
      } else {
        payload = runner.buildRootReleasePayload({
          request_sha256: HH,
          predecision_sha256: HH,
          sealed_frame_sha256: HH,
          actual_r_journal_entry_hash: HH,
          actual_r_checkpoint_sha256: HH,
        });
      }
      return probe.makeFrame({
        schema_version: probe.FRAME_SCHEMA_VERSION,
        sequence: seq,
        kind,
        run_id: request.run_id,
        payload,
        previous_frame_sha256: prevSha,
      });
    };
    return { request, rootResponder, inventory, projectionSqlText };
  }

  it('DF1 — clears the snapshot + does a fresh full read before EACH of db_locked/host_bound/sealed', async () => {
    const { request, rootResponder, inventory, projectionSqlText } = buildPrecommitScenario();
    const { Client } = require('pg') as typeof import('pg');
    const client = new Client({
      host: '127.0.0.1',
      port: pgPort,
      user: 'postgres',
      password: POSTGRES_PASSWORD,
      database: 'postgres',
      application_name: 'megacampus-q12-activation-truth',
    });
    await client.connect();
    let sessionActivityReads = 0;
    let clearCalls = 0;
    const proxy = {
      query: (sql: string) => {
        if (/pg_stat_activity/.test(sql)) sessionActivityReads += 1;
        if (/pg_stat_clear_snapshot/.test(sql)) clearCalls += 1;
        return client.query(sql);
      },
    };
    try {
      const result = await probe.assembleInspect({
        request,
        projectionSql: projectionSqlText,
        connection: proxy,
        expectedRelations: ORDER_RELATIONS,
        inventory,
        rootResponder,
        identities: { fd9_identity_sha256: 'a'.repeat(64) },
        closeConnection: () => Promise.resolve(),
      });
      expect(result.frames.length).toBe(7);
      // One complete fresh read (incl. pg_stat_activity) before each frame point.
      expect(sessionActivityReads).toBe(3);
      // Clears: the initial capability read + three per-frame projection reads.
      expect(clearCalls).toBeGreaterThanOrEqual(4);
      const hostBound = result.frames[2].payload as Record<string, unknown>;
      const sealed = result.frames[4].payload as Record<string, unknown>;
      expect(hostBound.bound_database_projection_sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(sealed.final_database_projection_sha256).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      await client.end();
    }
  }, 60_000);

  it('DF1 — a session appearing after db_locked is surfaced by the sealed-side fresh read as drift', async () => {
    const { request, rootResponder, inventory, projectionSqlText } = buildPrecommitScenario();
    const { Client } = require('pg') as typeof import('pg');
    const client = new Client({
      host: '127.0.0.1',
      port: pgPort,
      user: 'postgres',
      password: POSTGRES_PASSWORD,
      database: 'postgres',
      application_name: 'megacampus-q12-activation-truth',
    });
    await client.connect();
    // Model the non-MVCC pg_stat_activity behaviour: a backend outside the frozen
    // inventory appears only on reads AFTER db_locked (reads 2 and 3). A single
    // reused initial read would miss it; the per-frame fresh read surfaces it.
    let sessionActivityReads = 0;
    const intruderRow = {
      role: 'postgres',
      database: 'postgres',
      backend_type: 'client backend',
      application_identity: 'q12-intruder-app',
      state: 'active',
      xact_start_is_null: true,
      backend_xid_is_null: true,
      backend_xmin_is_null: true,
      pid: 999999,
      backend_start_utc: '2026-07-16T00:00:00.000Z',
    };
    const proxy = {
      query: async (sql: string) => {
        const result = await client.query(sql);
        if (/pg_stat_activity/.test(sql)) {
          sessionActivityReads += 1;
          if (sessionActivityReads >= 2) {
            return { ...result, rows: [...result.rows, intruderRow] };
          }
        }
        return result;
      },
    };
    try {
      await expect(
        probe.assembleInspect({
          request,
          projectionSql: projectionSqlText,
          connection: proxy,
          expectedRelations: ORDER_RELATIONS,
          inventory,
          rootResponder,
          identities: { fd9_identity_sha256: 'a'.repeat(64) },
          closeConnection: () => Promise.resolve(),
        })
      ).rejects.toThrow(/drift|unknown/i);
    } finally {
      await client.end();
    }
  }, 60_000);

  // @@CONTAINER_TESTS_END
});

const HEX = 'a'.repeat(64);
function makeDbFields(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: 'megacampus.q12.activation-truth-db-projection/v1',
    run_id: 'run-0001',
    server_version_num: 170010,
    session_user: 'postgres',
    current_database: 'postgres',
    transaction_isolation: 'read committed',
    transaction_read_only: 'on',
    backend_pid: 4242,
    connection_identity_sha256: HEX,
    capability_projection_sha256: HEX,
    active_run_sha256: HEX,
    guard_projection_sha256: HEX,
    structural_catalog_sha256: HEX,
    database_default_sha256: HEX,
    cron_jobs_sha256: HEX,
    active_cron_count: 8,
    global_pg_net_queue_count: 0,
    prepared_xact_count: 0,
    session_inventory_sha256: HEX,
    session_observation_sha256: HEX,
    lock_projection_sha256: HEX,
    ...overrides,
  };
}
function makeHostFields(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: 'megacampus.q12.activation-truth-host-projection/v1',
    run_id: 'run-0001',
    lease_epoch: 7,
    activation_evidence_state: 'prepared_guarded',
    fd9_identity_sha256: HEX,
    probe_pidfd_identity_sha256: HEX,
    spawn_capability_sha256: HEX,
    runtime_fd_baseline_sha256: HEX,
    activation_process_projection_sha256: HEX,
    prepared_quiesced_predecessor_sha256: HEX,
    writer_quiesce_manifest_sha256: HEX,
    writer_inventory_sha256: HEX,
    docker_observation_sha256: HEX,
    barrier_receipt_sha256: HEX,
    probe_receipt_sha256: HEX,
    activation_result_sha256: null,
    process_manifest_sha256: null,
    w_activation_tuple_sha256: HEX,
    ...overrides,
  };
}

describe('F1 — production inspect entrypoint + connection seam (unit)', () => {
  const HH = 'a'.repeat(64);
  const projectionSqlText = readFileSync(PROJECTION_SQL, 'utf8');
  function makeF1Request(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      schema_version: 'megacampus.q12.activation-truth-request/v1',
      run_id: 'run-f1',
      release_sha: HH,
      lease_epoch: 7,
      predecessor_journal_entry_hash: HH,
      predecessor_checkpoint_sha256: HH,
      previous_terminal_seal_sha256: null,
      abandoned_predecision_sha256: null,
      expected_catalog_sha256: HH,
      expected_post_migration_catalog_sha256: HH,
      database_capability_sha256: HH,
      activation_capability_sha256: HH,
      prepared_quiesced_predecessor_sha256: HH,
      writer_quiesce_manifest_sha256: HH,
      activation_evidence_state: 'prepared_guarded',
      barrier_receipt_sha256: HH,
      probe_receipt_sha256: HH,
      activation_result_sha256: null,
      activation_process_projection_sha256: HH,
      process_manifest_sha256: null,
      w_activation_tuple_sha256: HH,
      projection_sql_sha256: PROJECTION_SQL_SHA256,
      spawn_capability_sha256: HH,
      runtime_fd_baseline_sha256: HH,
      ...overrides,
    };
  }
  const FDMAP = {
    3: { access: 'read' },
    4: { access: 'read' },
    5: { access: 'read' },
    6: { access: 'read' },
    7: { access: 'write' },
    9: { access: 'lock', lock_identity: HH },
    10: { access: 'read' },
    11: { access: 'read' },
  };

  it('is a real child-process entrypoint (not a stub) that rejects a non-production invocation', () => {
    const { spawnSync } = require('node:child_process') as typeof import('node:child_process');
    const result = spawnSync(process.execPath, [PROBE_PATH, 'inspect'], {
      encoding: 'utf8',
      env: { PATH: '/usr/bin', LC_ALL: 'C.UTF-8', LANG: 'C.UTF-8', HOME: '/nonexistent' },
      timeout: 20_000,
    });
    // A defined non-zero exit (rejection), never the old "not yet assembled" stub (2).
    expect(result.status).toBe(probe.EXIT_REJECTED);
    expect(result.status).not.toBe(2);
    expect(`${result.stderr}`).toContain('q12-activation-truth-probe');
  });

  it('runs argv/env/FD/request/SQL-hash preflight, then rejects a non-production URL with zero DB work', async () => {
    let connectCalls = 0;
    const runtime = {
      argv: [...probe.PRODUCTION_ARGV],
      env: { PATH: '/usr/bin', LC_ALL: 'C.UTF-8', LANG: 'C.UTF-8', HOME: '/nonexistent' },
      fdMap: FDMAP,
      readFd: (fd: number) => {
        if (fd === 5) return Buffer.from(JSON.stringify(makeF1Request()), 'utf8');
        if (fd === 11) return Buffer.from(projectionSqlText, 'utf8');
        if (fd === 3) return Buffer.from('postgresql://postgres@localhost:5432/postgres', 'utf8');
        if (fd === 4) return Buffer.from('synthetic-ca-bytes', 'utf8');
        throw new Error(`unexpected fd ${fd}`);
      },
      connect: () => {
        connectCalls += 1;
        throw new Error('connect must not be reached for a non-production URL');
      },
      log: () => {},
    };
    const code = await probe.main(runtime);
    expect(code).toBe(probe.EXIT_REJECTED);
    expect(connectCalls).toBe(0);
  });

  it('rejects a request whose projection_sql_sha256 does not match the FD-11 bytes before connecting', async () => {
    let connectCalls = 0;
    const runtime = {
      argv: [...probe.PRODUCTION_ARGV],
      env: { PATH: '/usr/bin', LC_ALL: 'C.UTF-8', LANG: 'C.UTF-8', HOME: '/nonexistent' },
      fdMap: FDMAP,
      readFd: (fd: number) => {
        if (fd === 5)
          return Buffer.from(JSON.stringify(makeF1Request({ projection_sql_sha256: HH })));
        if (fd === 11) return Buffer.from(projectionSqlText, 'utf8');
        if (fd === 3)
          return Buffer.from(
            'postgresql://postgres.diqooqbuchsliypgwksu@aws-1-us-east-2.pooler.supabase.com:5432/postgres'
          );
        if (fd === 4) return Buffer.from('synthetic-ca-bytes');
        throw new Error(`unexpected fd ${fd}`);
      },
      connect: () => {
        connectCalls += 1;
        throw new Error('connect must not be reached on SQL-hash mismatch');
      },
      log: () => {},
    };
    expect(await probe.main(runtime)).toBe(probe.EXIT_REJECTED);
    expect(connectCalls).toBe(0);
  });
});

describe('Task 13 — runtime FD baseline (unit)', () => {
  const baseline = {
    node_sha256: 'a'.repeat(64),
    node_major: 24,
    node_minor: 18,
    libuv_version: '1.51.0',
    kernel_generation: '6.6-wsl2',
  };
  const descriptors = [
    { kind: 'epoll', access: 'read' },
    { kind: 'eventfd', access: 'readwrite' },
    { kind: 'pipe', access: 'read' },
    { kind: 'pipe', access: 'write' },
  ];

  it('classifies only pinned anonymous epoll/eventfd/pipe descriptor classes', () => {
    expect(probe.classifyRuntimeFd({ kind: 'epoll', access: 'read' })).toBe(true);
    expect(probe.classifyRuntimeFd({ kind: 'pipe', access: 'write' })).toBe(true);
    expect(probe.classifyRuntimeFd({ kind: 'eventfd', access: 'readwrite' })).toBe(true);
    expect(probe.classifyRuntimeFd({ kind: 'socket', access: 'read' })).toBe(false);
    expect(probe.classifyRuntimeFd({ kind: 'pipe', access: 'execute' })).toBe(false);
  });

  it('accepts a matching baseline with allowed descriptors and rejects deviations', () => {
    expect(() =>
      probe.assertRuntimeFdBaseline({ ...baseline, descriptors, baseline })
    ).not.toThrow();
    expect(() =>
      probe.assertRuntimeFdBaseline({
        ...baseline,
        node_sha256: 'b'.repeat(64),
        descriptors,
        baseline,
      })
    ).toThrow(/baseline|identity/i);
    expect(() =>
      probe.assertRuntimeFdBaseline({
        ...baseline,
        descriptors: [...descriptors, { kind: 'socket', access: 'read' }],
        baseline,
      })
    ).toThrow(/unknown|descriptor/i);
  });

  it('enumerates real runtime descriptors on Linux without misclassifying the pinned set', () => {
    const status = readFileSync('/proc/self/status', 'utf8');
    expect(status.length).toBeGreaterThan(0);
    expect(() => descriptors.forEach(d => probe.classifyRuntimeFd(d))).not.toThrow();
  });
});

describe('Task 12 — production CLI/env/FD negatives (unit)', () => {
  const ARGV = [
    '/usr/bin/node',
    '/opt/megacampus/packages/course-gen-platform/tools/qdrant/q12-activation-truth-probe.cjs',
    'inspect',
  ];
  const ENV = { PATH: '/usr/bin', LC_ALL: 'C.UTF-8', LANG: 'C.UTF-8', HOME: '/nonexistent' };
  const FDS = {
    3: { access: 'read' },
    4: { access: 'read' },
    5: { access: 'read' },
    6: { access: 'read' },
    7: { access: 'write' },
    9: { access: 'lock', lock_identity: 'a'.repeat(64) },
    10: { access: 'read' },
    11: { access: 'read' },
  };

  it('accepts only the exact production argv', () => {
    expect(probe.PRODUCTION_ARGV).toEqual(ARGV);
    expect(() => probe.assertProductionArgv(ARGV)).not.toThrow();
    expect(() => probe.assertProductionArgv([...ARGV, 'extra'])).toThrow();
    expect(() => probe.assertProductionArgv(ARGV.slice(0, 2))).toThrow();
    expect(() => probe.assertProductionArgv([ARGV[0], ARGV[1], 'observe'])).toThrow();
  });

  it('rejects NODE_OPTIONS, inherited env, and wrong locale', () => {
    expect(() => probe.assertProductionEnv(ENV)).not.toThrow();
    expect(() => probe.assertProductionEnv({ ...ENV, NODE_OPTIONS: '--inspect' })).toThrow(
      /NODE_OPTIONS/i
    );
    expect(() => probe.assertProductionEnv({ ...ENV, INHERITED: 'x' })).toThrow();
    expect(() => probe.assertProductionEnv({ ...ENV, LC_ALL: 'en_US.UTF-8' })).toThrow();
    const noHome = { ...ENV } as Record<string, string>;
    delete noHome.HOME;
    expect(() => probe.assertProductionEnv(noHome)).toThrow(/HOME/i);
  });

  it('validates FD 3-7 and 9-11 identities/access and the FD9 lock identity', () => {
    expect(() => probe.assertRequiredFds(FDS)).not.toThrow();
    const missing = { ...FDS } as Record<number, { access: string; lock_identity?: string }>;
    delete missing[5];
    expect(() => probe.assertRequiredFds(missing)).toThrow(/fd\s*5|required/i);
    expect(() => probe.assertRequiredFds({ ...FDS, 7: { access: 'read' } })).toThrow(
      /fd\s*7|access/i
    );
    // FD 8 is closed/reserved; it must not appear.
    expect(() => probe.assertRequiredFds({ ...FDS, 8: { access: 'read' } })).toThrow(
      /fd\s*8|extra|reserved/i
    );
    expect(() => probe.assertRequiredFds({ ...FDS, 9: { access: 'lock' } })).toThrow(/lock/i);
  });

  it('forbids ever hashing FD 3 (the password-bearing URL)', () => {
    expect(() => probe.assertFd3NeverHashed([4, 5, 9, 10, 11])).not.toThrow();
    expect(() => probe.assertFd3NeverHashed([3, 4])).toThrow(/fd\s*3|secret|hash/i);
  });
});

describe('Task 11 — request + frame payloads + protocol (unit)', () => {
  const HX = 'e'.repeat(64);
  function makeRequest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      schema_version: 'megacampus.q12.activation-truth-request/v1',
      run_id: 'run-0001',
      release_sha: HX,
      lease_epoch: 7,
      predecessor_journal_entry_hash: HX,
      predecessor_checkpoint_sha256: HX,
      previous_terminal_seal_sha256: null,
      abandoned_predecision_sha256: null,
      expected_catalog_sha256: HX,
      expected_post_migration_catalog_sha256: HX,
      database_capability_sha256: HX,
      activation_capability_sha256: HX,
      prepared_quiesced_predecessor_sha256: HX,
      writer_quiesce_manifest_sha256: HX,
      activation_evidence_state: 'prepared_guarded',
      barrier_receipt_sha256: HX,
      probe_receipt_sha256: HX,
      activation_result_sha256: null,
      activation_process_projection_sha256: HX,
      process_manifest_sha256: null,
      w_activation_tuple_sha256: HX,
      projection_sql_sha256: HX,
      spawn_capability_sha256: HX,
      runtime_fd_baseline_sha256: HX,
      ...overrides,
    };
  }

  it('validates a request with the exact 24-key set and hash-or-null restart fields', () => {
    expect(Object.keys(probe.validateRequest(makeRequest())).sort()).toEqual(
      [...probe.REQUEST_KEYS].sort()
    );
    expect(probe.REQUEST_KEYS.length).toBe(24);
    // previous_terminal_seal / abandoned_predecision may be a hash or null.
    expect(() =>
      probe.validateRequest(makeRequest({ previous_terminal_seal_sha256: HX }))
    ).not.toThrow();
    const missing = makeRequest();
    delete missing.projection_sql_sha256;
    expect(() => probe.validateRequest(missing)).toThrow();
    expect(() => probe.validateRequest(makeRequest({ extra: 1 }))).toThrow();
  });

  it('enforces the request evidence H/N table for its evidence state', () => {
    // prepared_guarded requires activation_result=N; providing H is a violation.
    expect(() => probe.validateRequest(makeRequest({ activation_result_sha256: HX }))).toThrow();
  });

  it('requires the request evidence to equal the host projection byte-for-byte', () => {
    const request = makeRequest();
    const host = makeHostFields({
      activation_evidence_state: 'prepared_guarded',
      barrier_receipt_sha256: HX,
      probe_receipt_sha256: HX,
      activation_result_sha256: null,
      activation_process_projection_sha256: HX,
      process_manifest_sha256: null,
    });
    expect(() => probe.assertRequestMatchesHostProjection(request, host)).not.toThrow();
    expect(() =>
      probe.assertRequestMatchesHostProjection(
        request,
        makeHostFields({
          activation_evidence_state: 'prepared_guarded',
          barrier_receipt_sha256: 'f'.repeat(64),
          probe_receipt_sha256: HX,
          activation_result_sha256: null,
          activation_process_projection_sha256: HX,
          process_manifest_sha256: null,
        })
      )
    ).toThrow(/drift|mismatch/i);
  });

  it('builds the four probe payloads with exactly the contract keys', () => {
    const db = probe.buildDbLockedPayload({
      request_sha256: HX,
      initial_database_projection_sha256: HX,
      capability_projection_sha256: HX,
      lock_projection_sha256: HX,
      fd9_identity_sha256: HX,
    });
    expect(Object.keys(db).sort()).toEqual(
      [
        'capability_projection_sha256',
        'fd9_identity_sha256',
        'initial_database_projection_sha256',
        'lock_projection_sha256',
        'request_sha256',
      ].sort()
    );
    const closed = probe.buildClosedPayload({
      request_sha256: HX,
      predecision_sha256: HX,
      sealed_frame_sha256: HX,
      release_frame_sha256: HX,
      actual_r_journal_entry_hash: HX,
      actual_r_checkpoint_sha256: HX,
      fd9_identity_sha256: HX,
    });
    expect(closed.transaction_end).toBe('read_only_commit');
    expect(closed.connection_closed).toBe(true);
    expect(() => probe.buildHostBoundPayload({ request_sha256: HX })).toThrow();
    expect(() =>
      probe.buildSealedPayload({
        request_sha256: HX,
        predecision_sha256: HX,
        initial_database_projection_sha256: HX,
        final_database_projection_sha256: HX,
        host_projection_sha256: HX,
        actual_r_journal_entry_hash: HX,
        actual_r_checkpoint_sha256: HX,
        fd9_identity_sha256: HX,
      })
    ).not.toThrow();
  });

  it('validates Root payloads incl. predecision pairing and release literals', () => {
    expect(() =>
      probe.validateHostProjectionPayload({
        request_sha256: HX,
        initial_database_projection_sha256: HX,
        host_projection_sha256: HX,
        proposed_classification: 'precommit_rollback',
        prepared_quiesced_predecessor_sha256: HX,
      })
    ).not.toThrow();
    // precommit requires both planned R hashes non-null.
    expect(() =>
      probe.validatePredecisionPayload({
        request_sha256: HX,
        predecision_sha256: HX,
        classification: 'precommit_rollback',
        action: 'append_r_then_seal',
        planned_r_journal_entry_hash: HX,
        planned_r_checkpoint_sha256: HX,
        predecessor_journal_entry_hash: HX,
        predecessor_checkpoint_sha256: HX,
      })
    ).not.toThrow();
    // precommit with null planned hashes is invalid.
    expect(() =>
      probe.validatePredecisionPayload({
        request_sha256: HX,
        predecision_sha256: HX,
        classification: 'precommit_rollback',
        action: 'append_r_then_seal',
        planned_r_journal_entry_hash: null,
        planned_r_checkpoint_sha256: null,
        predecessor_journal_entry_hash: HX,
        predecessor_checkpoint_sha256: HX,
      })
    ).toThrow();
    // wrong classification/action pairing.
    expect(() =>
      probe.validatePredecisionPayload({
        request_sha256: HX,
        predecision_sha256: HX,
        classification: 'precommit_rollback',
        action: 'seal_finish_forward',
        planned_r_journal_entry_hash: HX,
        planned_r_checkpoint_sha256: HX,
        predecessor_journal_entry_hash: HX,
        predecessor_checkpoint_sha256: HX,
      })
    ).toThrow();
    // finish-forward requires null planned hashes.
    expect(() =>
      probe.validatePredecisionPayload({
        request_sha256: HX,
        predecision_sha256: HX,
        classification: 'committed_finish_forward',
        action: 'seal_finish_forward',
        planned_r_journal_entry_hash: null,
        planned_r_checkpoint_sha256: null,
        predecessor_journal_entry_hash: HX,
        predecessor_checkpoint_sha256: HX,
      })
    ).not.toThrow();
    expect(() =>
      probe.validateReleasePayload({
        request_sha256: HX,
        predecision_sha256: HX,
        sealed_frame_sha256: HX,
        actual_r_journal_entry_hash: HX,
        actual_r_checkpoint_sha256: HX,
        expected_transaction_end: 'read_only_commit',
        expected_connection_close: true,
      })
    ).not.toThrow();
    expect(() =>
      probe.validateReleasePayload({
        request_sha256: HX,
        predecision_sha256: HX,
        sealed_frame_sha256: HX,
        actual_r_journal_entry_hash: HX,
        actual_r_checkpoint_sha256: HX,
        expected_transaction_end: 'rollback',
        expected_connection_close: true,
      })
    ).toThrow();
  });

  it('drives the probe protocol through a chained precommit sequence', () => {
    const p = new probe.ProbeProtocol(probe.FRAME_SCHEMA_VERSION, 'run-0001');
    const chain = new probe.FrameChain(probe.FRAME_SCHEMA_VERSION, 'run-0001');
    const dbLocked = p.emit('db_locked', { request_sha256: HX });
    expect(dbLocked.sequence).toBe(1);
    // Root replies with a properly chained host_projection frame (seq 2).
    const hostProjection = chain.append('db_locked', { request_sha256: HX }); // seq1 mirror
    // Build the root frame manually chained on the probe's db_locked frame.
    const rootHost = probe.makeFrame({
      schema_version: probe.FRAME_SCHEMA_VERSION,
      sequence: 2,
      kind: 'host_projection',
      run_id: 'run-0001',
      payload: { host_projection_sha256: HX },
      previous_frame_sha256: dbLocked.frame_sha256 as string,
    });
    void hostProjection;
    expect(() => p.receive(rootHost)).not.toThrow();
    const hostBound = p.emit('host_bound', { request_sha256: HX });
    expect(hostBound.sequence).toBe(3);
    expect(hostBound.previous_frame_sha256).toBe(rootHost.frame_sha256);
    // Out-of-order / wrong-chain frames are rejected.
    const badChain = probe.makeFrame({
      schema_version: probe.FRAME_SCHEMA_VERSION,
      sequence: 4,
      kind: 'predecision',
      run_id: 'run-0001',
      payload: {},
      previous_frame_sha256: 'a'.repeat(64),
    });
    expect(() => p.receive(badChain)).toThrow(/chain|previous/i);
    const wrongKind = probe.makeFrame({
      schema_version: probe.FRAME_SCHEMA_VERSION,
      sequence: 4,
      kind: 'release',
      run_id: 'run-0001',
      payload: {},
      previous_frame_sha256: hostBound.frame_sha256 as string,
    });
    expect(() => p.receive(wrongKind)).toThrow(/kind|order|expected/i);
  });
});

describe('Task 10 — writer ancestry + 10+5 Docker truth (unit)', () => {
  const runner = require(RUNNER_PATH) as RunnerModule;
  const HEXP = 'd'.repeat(64);
  const predecessor = {
    journal_entry_hash: HEXP,
    checkpoint_sha256: HEXP,
    writer_quiesce_manifest_sha256: HEXP,
    is_unique_head: true,
    is_required_ancestor: true,
  };

  it('binds the prepared_quiesced predecessor as the unique required ancestor', () => {
    const bound = probe.bindPreparedQuiescedPredecessor(predecessor);
    expect(bound.writer_quiesce_manifest_sha256).toBe(HEXP);
    expect(bound.prepared_quiesced_predecessor_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects a non-unique head, a non-ancestor, or a required rollback manifest', () => {
    expect(() =>
      probe.bindPreparedQuiescedPredecessor({ ...predecessor, is_unique_head: false })
    ).toThrow(/head/i);
    expect(() =>
      probe.bindPreparedQuiescedPredecessor({ ...predecessor, is_required_ancestor: false })
    ).toThrow(/ancestor/i);
    // Pre-R must NOT require or invent a rollback final-writer manifest.
    expect(() =>
      probe.bindPreparedQuiescedPredecessor({
        ...predecessor,
        rollback_final_writer_manifest_required: true,
      })
    ).toThrow(/rollback|task 9|pre-?r/i);
  });

  it('projects the 10+5 Docker truth from synthetic inspect/compose data', () => {
    const { inspect, composePs } = runner.buildSyntheticDockerInventory();
    const observation = probe.projectDockerObservation({ inspect, composePs });
    expect(observation.total).toBe(15);
    expect(observation.final).toBe(10);
    expect(observation.held).toBe(5);
    expect(observation.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('detects Docker drift: running, wrong restart policy, missing/duplicate/miscount', () => {
    for (const corrupt of [
      'running',
      'restart-policy',
      'missing-compose',
      'duplicate-id',
      'wrong-count',
    ]) {
      const { inspect, composePs } = runner.buildSyntheticDockerInventory({ corrupt });
      expect(() => probe.projectDockerObservation({ inspect, composePs }), corrupt).toThrow();
    }
  });
});

describe('Task 9 — H/N evidence table (unit)', () => {
  const H = 'c'.repeat(64);
  const precommit = {
    classification: 'precommit_rollback',
    activation_evidence_state: 'prepared_guarded',
    barrier_receipt_sha256: H,
    probe_receipt_sha256: H,
    activation_result_sha256: null,
    activation_process_projection_sha256: H,
    process_manifest_sha256: null,
  };
  const completeReceipt = {
    classification: 'committed_finish_forward',
    activation_evidence_state: 'complete_receipt',
    barrier_receipt_sha256: H,
    probe_receipt_sha256: H,
    activation_result_sha256: H,
    activation_process_projection_sha256: H,
    process_manifest_sha256: H,
  };
  const pending = {
    classification: 'committed_finish_forward',
    activation_evidence_state: 'committed_receipt_pending',
    barrier_receipt_sha256: H,
    probe_receipt_sha256: H,
    activation_result_sha256: null,
    activation_process_projection_sha256: H,
    process_manifest_sha256: H,
  };

  it('accepts the three deterministic H/N patterns', () => {
    expect(() => probe.validateEvidenceTable(precommit)).not.toThrow();
    expect(() => probe.validateEvidenceTable(completeReceipt)).not.toThrow();
    expect(() => probe.validateEvidenceTable(pending)).not.toThrow();
  });

  it('rejects any single H<->N deviation in a deterministic pattern', () => {
    expect(() =>
      probe.validateEvidenceTable({ ...precommit, activation_result_sha256: H })
    ).toThrow();
    expect(() =>
      probe.validateEvidenceTable({ ...precommit, barrier_receipt_sha256: null })
    ).toThrow();
    expect(() =>
      probe.validateEvidenceTable({ ...completeReceipt, process_manifest_sha256: null })
    ).toThrow();
    expect(() =>
      probe.validateEvidenceTable({ ...pending, activation_result_sha256: H })
    ).toThrow();
    // activation_process_projection is always H.
    expect(() =>
      probe.validateEvidenceTable({ ...precommit, activation_process_projection_sha256: null })
    ).toThrow();
    // wrong evidence state for the classification.
    expect(() =>
      probe.validateEvidenceTable({ ...precommit, activation_evidence_state: 'incident_observed' })
    ).toThrow();
  });

  it('resolves incident_observed strictly from safe object presence, never a free choice', () => {
    const base = {
      classification: 'drift_incident',
      activation_evidence_state: 'incident_observed',
      activation_process_projection_sha256: H,
    };
    // present -> H, absent -> N.
    expect(() =>
      probe.validateEvidenceTable({
        ...base,
        barrier_receipt_sha256: H,
        probe_receipt_sha256: null,
        activation_result_sha256: null,
        process_manifest_sha256: H,
        presence: {
          barrier_receipt: 'present',
          probe_receipt: 'absent',
          activation_result: 'absent',
          process_manifest: 'present',
        },
      })
    ).not.toThrow();
    // present object but N value -> deviation.
    expect(() =>
      probe.validateEvidenceTable({
        ...base,
        barrier_receipt_sha256: null,
        probe_receipt_sha256: null,
        activation_result_sha256: null,
        process_manifest_sha256: null,
        presence: {
          barrier_receipt: 'present',
          probe_receipt: 'absent',
          activation_result: 'absent',
          process_manifest: 'absent',
        },
      })
    ).toThrow();
    // unsafe object stops before terminal seal (no null conversion).
    expect(() =>
      probe.validateEvidenceTable({
        ...base,
        barrier_receipt_sha256: null,
        probe_receipt_sha256: null,
        activation_result_sha256: null,
        process_manifest_sha256: null,
        presence: {
          barrier_receipt: 'unsafe',
          probe_receipt: 'absent',
          activation_result: 'absent',
          process_manifest: 'absent',
        },
      })
    ).toThrow(/unsafe|incident/i);
  });

  it('permits committed_receipt_pending only with predecessor receipt + manifest + zero-live', () => {
    expect(() =>
      probe.assertCommittedReceiptPendingLegal({
        barrier_is_predecessor_recovery_ready_guarded: true,
        process_manifest_present: true,
        zero_live_projection: true,
      })
    ).not.toThrow();
    expect(() =>
      probe.assertCommittedReceiptPendingLegal({
        barrier_is_predecessor_recovery_ready_guarded: false,
        process_manifest_present: true,
        zero_live_projection: true,
      })
    ).toThrow(/drift/i);
    expect(() =>
      probe.assertCommittedReceiptPendingLegal({
        barrier_is_predecessor_recovery_ready_guarded: true,
        process_manifest_present: false,
        zero_live_projection: true,
      })
    ).toThrow(/drift/i);
    expect(() =>
      probe.assertCommittedReceiptPendingLegal({
        barrier_is_predecessor_recovery_ready_guarded: true,
        process_manifest_present: true,
        zero_live_projection: false,
      })
    ).toThrow(/drift/i);
  });
});

describe('Task 8 — database/host projection key sets + invariants (unit)', () => {
  it('accepts a complete database projection and rejects missing/extra keys', () => {
    const fields = makeDbFields();
    expect(Object.keys(probe.buildDatabaseProjection(fields)).sort()).toEqual(
      [...probe.DB_PROJECTION_KEYS].sort()
    );
    const missing = { ...fields };
    delete missing.lock_projection_sha256;
    expect(() => probe.buildDatabaseProjection(missing)).toThrow();
    expect(() => probe.buildDatabaseProjection({ ...fields, extra: 1 })).toThrow();
  });

  it('enforces net-queue-zero and prepared-zero invariants', () => {
    expect(() =>
      probe.buildDatabaseProjection(makeDbFields({ global_pg_net_queue_count: 3 }))
    ).toThrow(/net|queue/i);
    expect(() => probe.buildDatabaseProjection(makeDbFields({ prepared_xact_count: 2 }))).toThrow(
      /prepared/i
    );
  });

  it('accepts a host projection with evidence nulls and rejects a required null', () => {
    const fields = makeHostFields();
    expect(Object.keys(probe.buildHostProjection(fields)).sort()).toEqual(
      [...probe.HOST_PROJECTION_KEYS].sort()
    );
    // activation_process_projection_sha256 is required non-null in all classes.
    expect(() =>
      probe.buildHostProjection(makeHostFields({ activation_process_projection_sha256: null }))
    ).toThrow();
    expect(() =>
      probe.buildHostProjection(makeHostFields({ w_activation_tuple_sha256: null }))
    ).toThrow();
    const missing = makeHostFields();
    delete missing.docker_observation_sha256;
    expect(() => probe.buildHostProjection(missing)).toThrow();
  });

  it('requires a snapshot clear and a fresh read before each authority projection', () => {
    expect(() =>
      probe.assertProjectionPreamble({ snapshot_cleared: true, fresh_read: true })
    ).not.toThrow();
    expect(() =>
      probe.assertProjectionPreamble({ snapshot_cleared: false, fresh_read: true })
    ).toThrow(/snapshot/i);
    expect(() =>
      probe.assertProjectionPreamble({ snapshot_cleared: true, fresh_read: false })
    ).toThrow(/read/i);
  });
});

describe('Task 7 — managed inventory + session projection + drift (unit)', () => {
  const INVENTORY_TEXT = readFileSync(
    resolve(REPO_ROOT, 'deploy/qdrant/q12-managed-session-inventory.json'),
    'utf8'
  );
  const PROBE_PID = 4242;
  const probeRow = {
    role: 'postgres',
    database: 'postgres',
    backend_type: 'client backend',
    application_identity: 'megacampus-q12-activation-truth',
    client_class: 'probe',
    state: 'active',
    xact_start_is_null: false,
    backend_xid_is_null: true,
    backend_xmin_is_null: false,
    pid: PROBE_PID,
    backend_start_utc: '2026-07-16T00:00:00.000Z',
  };
  const bgRow = {
    role: '',
    database: '',
    backend_type: 'background writer',
    application_identity: '',
    client_class: 'provider-background',
    state: 'none',
    xact_start_is_null: true,
    backend_xid_is_null: true,
    backend_xmin_is_null: true,
    pid: 55,
    backend_start_utc: '2026-07-16T00:00:00.000Z',
  };
  const postgrestRow = {
    role: 'authenticator',
    database: 'postgres',
    backend_type: 'client backend',
    application_identity: 'postgrest',
    client_class: 'application-client',
    state: 'idle',
    xact_start_is_null: true,
    backend_xid_is_null: true,
    backend_xmin_is_null: true,
    pid: 77,
    backend_start_utc: '2026-07-16T00:00:00.000Z',
  };

  it('consumes the immutable inventory and binds its ratified hash (field 11)', () => {
    const inventory = probe.consumeManagedInventory(INVENTORY_TEXT, {
      expectedInventorySha256: W_TUPLE.managed_inventory_sha256,
    });
    expect((inventory.identities as unknown[]).length).toBe(14);
    expect(inventory.project_ref).toBe('diqooqbuchsliypgwksu');
    expect(inventory.source_decision_sha256).toBe(
      '7188d792af79ec881c16ef0729394e5c1f5c2c67aa6d59b86bec1bdf91308b27'
    );
  });

  it('rejects a tampered inventory or a wrong expected hash', () => {
    // Altering real content changes the canonical hash and/or fails validation.
    const tampered = INVENTORY_TEXT.replace(
      '"provider_plane_trusted": true',
      '"provider_plane_trusted": false'
    );
    expect(tampered).not.toBe(INVENTORY_TEXT);
    expect(() =>
      probe.consumeManagedInventory(tampered, {
        expectedInventorySha256: W_TUPLE.managed_inventory_sha256,
      })
    ).toThrow();
    expect(() =>
      probe.consumeManagedInventory(INVENTORY_TEXT, { expectedInventorySha256: 'f'.repeat(64) })
    ).toThrow(/hash|inventory/i);
  });

  it('projects an observed row to exactly the 11 keys and lowercases state', () => {
    const projected = probe.projectObservedRow({ ...postgrestRow, state: 'IDLE' });
    expect(Object.keys(projected).sort()).toEqual([...probe.OBSERVED_ROW_KEYS].sort());
    expect(projected.state).toBe('idle');
    expect(() => probe.projectObservedRow({ ...postgrestRow, state: null })).toThrow(/null/i);
    expect(() => probe.projectObservedRow({ ...postgrestRow, xact_start_is_null: null })).toThrow(
      /null/i
    );
  });

  it('builds a sorted, deterministic session observation with the probe exception', () => {
    const inventory = probe.consumeManagedInventory(INVENTORY_TEXT, {
      expectedInventorySha256: W_TUPLE.managed_inventory_sha256,
    });
    const a = probe.buildSessionObservation(inventory, [probeRow, bgRow, postgrestRow], {
      probePid: PROBE_PID,
    });
    const b = probe.buildSessionObservation(inventory, [postgrestRow, probeRow, bgRow], {
      probePid: PROBE_PID,
    });
    expect(a.sha256).toBe(b.sha256);
    expect(a.rows.length).toBe(3);
    // bytewise ascending by the first five identity fields then pid.
    const sortKeys = a.rows.map(r =>
      [r.role, r.database, r.backend_type, r.application_identity, r.client_class, r.pid].join(' ')
    );
    expect([...sortKeys].sort()).toEqual(sortKeys);
  });

  it('detects drift on unknown identity, disallowed state, and transaction-free violations', () => {
    const inventory = probe.consumeManagedInventory(INVENTORY_TEXT, {
      expectedInventorySha256: W_TUPLE.managed_inventory_sha256,
    });
    // Unknown 4-tuple identity.
    expect(() =>
      probe.buildSessionObservation(
        inventory,
        [probeRow, { ...postgrestRow, application_identity: 'intruder' }],
        { probePid: PROBE_PID }
      )
    ).toThrow(/unknown|identity/i);
    // Disallowed state for the probe (only 'active' is allowed).
    expect(() =>
      probe.buildSessionObservation(inventory, [{ ...probeRow, state: 'idle' }], {
        probePid: PROBE_PID,
      })
    ).toThrow(/state/i);
    // A required transaction-free background worker with a live transaction.
    expect(() =>
      probe.buildSessionObservation(
        inventory,
        [probeRow, { ...bgRow, xact_start_is_null: false }],
        { probePid: PROBE_PID }
      )
    ).toThrow(/transaction[-_ ]?free|drift/i);
    // Missing probe row.
    expect(() =>
      probe.buildSessionObservation(inventory, [bgRow, postgrestRow], { probePid: PROBE_PID })
    ).toThrow(/probe/i);
  });
});

describe('Task 6 — common-lock digest binding + conflict outcome (unit)', () => {
  const provided = {
    normal_slice: W_TUPLE.activation_normal_slice_sha256,
    recovery_slice: W_TUPLE.activation_recovery_slice_sha256,
    lock_catalog: W_TUPLE.activation_lock_catalog_sha256,
    lock_order: W_TUPLE.activation_lock_order_sha256,
  };

  it('binds exactly the accepted W slice/catalog/order digests', () => {
    expect(() => probe.assertActivationDigestsBound(provided, W_TUPLE)).not.toThrow();
    for (const key of Object.keys(provided) as Array<keyof typeof provided>) {
      expect(() =>
        probe.assertActivationDigestsBound({ ...provided, [key]: 'f'.repeat(64) }, W_TUPLE)
      ).toThrow(new RegExp(key));
    }
  });

  it('requires the full conflict + ordering outcome', () => {
    const ok = {
      probe_share_held: true,
      activation_blocked_while_share_held: true,
      activation_acquired_after_release: true,
      activation_committed: true,
    };
    expect(() => probe.assertCommonLockConflict(ok)).not.toThrow();
    for (const key of Object.keys(ok) as Array<keyof typeof ok>) {
      expect(() => probe.assertCommonLockConflict({ ...ok, [key]: false })).toThrow();
    }
  });
});

describe('Task 5 — transaction/lock/allowlist (unit)', () => {
  const expected = ['public.a', 'public.b', 'public.c'];
  const grantAll = expected.map(qualified_name => ({
    qualified_name,
    lock_mode: 'ShareLock',
    granted: true,
  }));

  it('accepts a complete set of granted SHARE locks', () => {
    expect(() =>
      probe.verifyGrantedLocks({ observed: grantAll, expectedRelations: expected })
    ).not.toThrow();
  });

  it('rejects a missing, ungranted, wrong-mode, extra, or duplicate lock', () => {
    expect(() =>
      probe.verifyGrantedLocks({ observed: grantAll.slice(0, 2), expectedRelations: expected })
    ).toThrow(/missing|expected/i);
    expect(() =>
      probe.verifyGrantedLocks({
        observed: [...grantAll.slice(0, 2), { ...grantAll[2], granted: false }],
        expectedRelations: expected,
      })
    ).toThrow(/granted/i);
    expect(() =>
      probe.verifyGrantedLocks({
        observed: [...grantAll.slice(0, 2), { ...grantAll[2], lock_mode: 'AccessExclusiveLock' }],
        expectedRelations: expected,
      })
    ).toThrow(/mode|share/i);
    expect(() =>
      probe.verifyGrantedLocks({
        observed: [
          ...grantAll,
          { qualified_name: 'public.d', lock_mode: 'ShareLock', granted: true },
        ],
        expectedRelations: expected,
      })
    ).toThrow(/extra|unexpected/i);
    expect(() =>
      probe.verifyGrantedLocks({
        observed: [...grantAll, grantAll[0]],
        expectedRelations: expected,
      })
    ).toThrow(/duplicate|extra|unexpected/i);
  });

  it('enforces the allowlist against a simple in-memory bundle', () => {
    const bundle = new Map([
      ['a', 'SELECT 1;'],
      ['b', 'LOCK TABLE x IN SHARE MODE;'],
    ]);
    expect(() => probe.assertTemplateAllowed(bundle, 'SELECT 1;')).not.toThrow();
    expect(() => probe.assertTemplateAllowed(bundle, 'SELECT 2;')).toThrow();
  });
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
