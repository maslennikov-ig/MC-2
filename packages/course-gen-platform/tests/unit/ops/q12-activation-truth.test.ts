import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

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
