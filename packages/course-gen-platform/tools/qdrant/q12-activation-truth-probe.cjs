#!/usr/bin/env node
'use strict';

// ===========================================================================
// Q12 D6 activation-truth — read-only PostgreSQL 17 inspection probe.
//
// Authority: docs/superpowers/specs/2026-07-15-q12-d6-activation-truth-contract.md
// (frozen normative bytes, sha256
// 2a2251ac0c03c042a61cc698728c012b9c68e0a9404df0e2f616eb3ec026aae5).
//
// This is a private, Root-spawned, long-lived, READ ONLY probe. It never
// mutates the database, journal, receipts, capabilities, final-writer state,
// or the retained lifecycle commands. It never grants, repairs, terminates,
// starts, stops, activates, recovers, or rolls back.
//
// Module contract: functions are exported via module.exports for tests; the
// CLI (`inspect`) is driven only when `require.main === module`.
// ===========================================================================

const crypto = require('node:crypto');

// ---------------------------------------------------------------------------
// Task 1 — canonical JSON, framing, hashing.
//
// Canonical JSON (contract "Canonical objects and frame envelope"): UTF-8 NFC,
// compact, recursively key-sorted, duplicate-key rejecting, integers/booleans/
// null only where schema permits. SHA-256 is lowercase 64-hex over the exact
// canonical bytes (no trailing LF; verified against the ratified W-tuple
// field 11 managed_inventory_sha256).
// ---------------------------------------------------------------------------

/**
 * Serialize a JS value into canonical JSON: compact, recursively key-sorted,
 * strings NFC-normalized, integers only. Throws on floats and non-permitted
 * types. JS object literals cannot carry duplicate keys; duplicate-key
 * rejection for raw text is enforced by parseCanonicalJson.
 * @param {unknown} value
 * @returns {string}
 */
function canonicalize(value) {
  if (value === null) return 'null';
  const type = typeof value;
  if (type === 'boolean') return value ? 'true' : 'false';
  if (type === 'string') return JSON.stringify(value.normalize('NFC'));
  if (type === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('canonicalize: non-finite numbers are not permitted');
    }
    if (!Number.isInteger(value)) {
      throw new Error('canonicalize: floats are not permitted in canonical JSON');
    }
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }
  if (type === 'object') {
    const keys = Object.keys(value).sort();
    const entries = keys.map(key => `${JSON.stringify(key.normalize('NFC'))}:${canonicalize(value[key])}`);
    return `{${entries.join(',')}}`;
  }
  throw new Error(`canonicalize: unsupported type ${type}`);
}

/**
 * Lowercase 64-hex SHA-256 over the exact UTF-8 (or raw) bytes.
 * @param {string | Uint8Array} input
 * @returns {string}
 */
function sha256Hex(input) {
  const hash = crypto.createHash('sha256');
  hash.update(typeof input === 'string' ? Buffer.from(input, 'utf8') : input);
  return hash.digest('hex');
}

/**
 * SHA-256 over the canonical bytes of a value.
 * @param {unknown} value
 * @returns {string}
 */
function canonicalHash(value) {
  return sha256Hex(canonicalize(value));
}

/**
 * Strict recursive-descent JSON parser that rejects duplicate object keys and
 * floats (fractional or exponent numbers), and refuses trailing content. Used
 * to read immutable request/inventory/catalog bytes safely.
 * @param {string} text
 * @returns {unknown}
 */
function parseCanonicalJson(text) {
  let i = 0;
  const n = text.length;

  function error(message) {
    return new Error(`parseCanonicalJson: ${message} at offset ${i}`);
  }
  function skipWs() {
    while (i < n) {
      const c = text[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') i += 1;
      else break;
    }
  }
  function parseValue() {
    skipWs();
    if (i >= n) throw error('unexpected end of input');
    const c = text[i];
    if (c === '{') return parseObject();
    if (c === '[') return parseArray();
    if (c === '"') return parseString();
    if (c === '-' || (c >= '0' && c <= '9')) return parseNumber();
    if (text.startsWith('true', i)) {
      i += 4;
      return true;
    }
    if (text.startsWith('false', i)) {
      i += 5;
      return false;
    }
    if (text.startsWith('null', i)) {
      i += 4;
      return null;
    }
    throw error(`unexpected token '${c}'`);
  }
  function parseObject() {
    i += 1; // consume '{'
    const result = {};
    const seen = new Set();
    skipWs();
    if (text[i] === '}') {
      i += 1;
      return result;
    }
    for (;;) {
      skipWs();
      if (text[i] !== '"') throw error('expected object key');
      const key = parseString();
      if (seen.has(key)) throw error(`duplicate key ${JSON.stringify(key)}`);
      seen.add(key);
      skipWs();
      if (text[i] !== ':') throw error("expected ':'");
      i += 1;
      result[key] = parseValue();
      skipWs();
      const sep = text[i];
      if (sep === ',') {
        i += 1;
        continue;
      }
      if (sep === '}') {
        i += 1;
        return result;
      }
      throw error("expected ',' or '}'");
    }
  }
  function parseArray() {
    i += 1; // consume '['
    const result = [];
    skipWs();
    if (text[i] === ']') {
      i += 1;
      return result;
    }
    for (;;) {
      result.push(parseValue());
      skipWs();
      const sep = text[i];
      if (sep === ',') {
        i += 1;
        continue;
      }
      if (sep === ']') {
        i += 1;
        return result;
      }
      throw error("expected ',' or ']'");
    }
  }
  function parseString() {
    i += 1; // consume opening quote
    let out = '';
    for (;;) {
      if (i >= n) throw error('unterminated string');
      const c = text[i];
      i += 1;
      if (c === '"') return out;
      if (c === '\\') {
        const esc = text[i];
        i += 1;
        switch (esc) {
          case '"':
            out += '"';
            break;
          case '\\':
            out += '\\';
            break;
          case '/':
            out += '/';
            break;
          case 'b':
            out += '\b';
            break;
          case 'f':
            out += '\f';
            break;
          case 'n':
            out += '\n';
            break;
          case 'r':
            out += '\r';
            break;
          case 't':
            out += '\t';
            break;
          case 'u': {
            const hex = text.slice(i, i + 4);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw error('invalid unicode escape');
            out += String.fromCharCode(parseInt(hex, 16));
            i += 4;
            break;
          }
          default:
            throw error(`invalid escape '\\${esc}'`);
        }
      } else {
        out += c;
      }
    }
  }
  function parseNumber() {
    const start = i;
    if (text[i] === '-') i += 1;
    while (i < n && text[i] >= '0' && text[i] <= '9') i += 1;
    let isFloat = false;
    if (text[i] === '.') {
      isFloat = true;
      i += 1;
      while (i < n && text[i] >= '0' && text[i] <= '9') i += 1;
    }
    if (text[i] === 'e' || text[i] === 'E') {
      isFloat = true;
      i += 1;
      if (text[i] === '+' || text[i] === '-') i += 1;
      while (i < n && text[i] >= '0' && text[i] <= '9') i += 1;
    }
    const raw = text.slice(start, i);
    if (isFloat) throw error(`floats are not permitted (${raw})`);
    return parseInt(raw, 10);
  }

  const value = parseValue();
  skipWs();
  if (i !== n) throw error('trailing content after JSON value');
  return value;
}

// ---------------------------------------------------------------------------
// Frame envelope. Every frame has exactly:
//   schema_version, sequence, kind, run_id, payload,
//   previous_frame_sha256, frame_sha256
// frame_sha256 hashes the canonical object without that field. Sequence starts
// at 1, increments by one, and chains the prior frame hash.
// ---------------------------------------------------------------------------

const HEX64 = /^[0-9a-f]{64}$/;

/**
 * @param {{schema_version: string, sequence: number, kind: string, run_id: string,
 *          payload: Record<string, unknown>, previous_frame_sha256: string | null}} input
 * @returns {Record<string, unknown>}
 */
function makeFrame(input) {
  const { schema_version, sequence, kind, run_id, payload, previous_frame_sha256 } = input;
  if (typeof schema_version !== 'string' || schema_version.length === 0) {
    throw new Error('makeFrame: schema_version must be a non-empty string');
  }
  if (typeof kind !== 'string' || kind.length === 0) {
    throw new Error('makeFrame: kind must be a non-empty string');
  }
  if (typeof run_id !== 'string' || run_id.length === 0) {
    throw new Error('makeFrame: run_id must be a non-empty string');
  }
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('makeFrame: payload must be an object');
  }
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error(`makeFrame: sequence must be an integer >= 1 (got ${sequence})`);
  }
  if (sequence === 1) {
    if (previous_frame_sha256 !== null) {
      throw new Error('makeFrame: previous_frame_sha256 must be null for sequence 1');
    }
  } else if (typeof previous_frame_sha256 !== 'string' || !HEX64.test(previous_frame_sha256)) {
    throw new Error('makeFrame: previous_frame_sha256 must be lowercase 64-hex for sequence > 1');
  }
  const frame = {
    schema_version,
    sequence,
    kind,
    run_id,
    payload,
    previous_frame_sha256,
  };
  frame.frame_sha256 = canonicalHash(frame);
  return frame;
}

/**
 * A chain of frames for one run: enforces sequence increment and previous-hash
 * chaining.
 */
class FrameChain {
  constructor(schemaVersion, runId) {
    this._schemaVersion = schemaVersion;
    this._runId = runId;
    this._sequence = 0;
    this._headHash = null;
  }

  append(kind, payload) {
    this._sequence += 1;
    const frame = makeFrame({
      schema_version: this._schemaVersion,
      sequence: this._sequence,
      kind,
      run_id: this._runId,
      payload,
      previous_frame_sha256: this._headHash,
    });
    this._headHash = frame.frame_sha256;
    return frame;
  }

  get length() {
    return this._sequence;
  }

  get headHash() {
    return this._headHash;
  }
}

// ---------------------------------------------------------------------------
// Task 2 — FD-11 SQL projection bundle: template splitting + allowlist guard.
//
// The projection SQL is a set of named READ-ONLY templates delimited by
// "--@template <name>" / "--@end <name>" markers. The probe only ever executes
// a template whose text is a member of the parsed bundle (contract "Allowed SQL
// is limited to fixed templates from FD 11").
// ---------------------------------------------------------------------------

const PROJECTION_TEMPLATE_NAMES = Object.freeze([
  'transaction_begin',
  'clear_snapshot',
  'connection_identity',
  'capability_lock_rows',
  'activity_visibility',
  'full_catalog_share_lock',
  'lock_projection',
  'active_run_singleton',
  'structural_catalog',
  'database_default',
  'cron_jobs',
  'global_pg_net_queue',
  'prepared_xacts',
  'session_activity',
  'transaction_commit',
  'transaction_rollback',
]);

// Mutation/capability verbs and calls that must never appear outside quoted
// literals/identifiers. UPDATE/DELETE/TRUNCATE/MAINTAIN are permitted only as
// quoted has_table_privilege(...) privilege names, which are stripped before
// scanning.
const PROJECTION_FORBIDDEN = Object.freeze([
  'CREATE',
  'ALTER',
  'DROP',
  'INSERT',
  'UPDATE',
  'DELETE',
  'TRUNCATE',
  'MERGE',
  'COPY',
  'GRANT',
  'REVOKE',
  'CALL',
  'REINDEX',
  'CLUSTER',
  'VACUUM',
  'REFRESH',
  'set_config',
  'pg_advisory_unlock',
  'pg_advisory_lock',
  'pg_terminate_backend',
  'pg_cancel_backend',
  'pg_reload_conf',
]);

/**
 * Split the FD-11 projection SQL into its named templates. Rejects unknown
 * markers, duplicate template names, and mismatched open/close markers.
 * @param {string} sql
 * @returns {Map<string, string>}
 */
function splitProjectionTemplates(sql) {
  const templates = new Map();
  const lines = sql.split('\n');
  let current = null;
  let buffer = [];
  for (const line of lines) {
    const open = line.match(/^--@template\s+(\S+)\s*$/);
    const close = line.match(/^--@end\s+(\S+)\s*$/);
    if (open) {
      if (current !== null) {
        throw new Error(`splitProjectionTemplates: nested template '${open[1]}' inside '${current}'`);
      }
      current = open[1];
      buffer = [];
      continue;
    }
    if (close) {
      if (current === null || close[1] !== current) {
        throw new Error(`splitProjectionTemplates: unmatched --@end ${close[1]}`);
      }
      if (templates.has(current)) {
        throw new Error(`splitProjectionTemplates: duplicate template '${current}'`);
      }
      templates.set(current, buffer.join('\n').trim());
      current = null;
      continue;
    }
    if (current !== null) buffer.push(line);
  }
  if (current !== null) {
    throw new Error(`splitProjectionTemplates: template '${current}' not closed`);
  }
  return templates;
}

/**
 * Remove line comments, single-quoted literals, and double-quoted identifiers
 * so quoted privilege names do not trip the forbidden-construct scan.
 * @param {string} sql
 * @returns {string}
 */
function stripSqlLiterals(sql) {
  return sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/'(?:[^']|'')*'/g, " '' ")
    .replace(/"(?:[^"]|"")*"/g, ' "" ');
}

/**
 * Assert the projection bundle contains only the expected named templates and
 * no forbidden constructs. Throws on any deviation.
 * @param {string} sql
 */
function assertProjectionAllowlist(sql) {
  const templates = splitProjectionTemplates(sql);
  const names = [...templates.keys()].sort();
  const expected = [...PROJECTION_TEMPLATE_NAMES].sort();
  if (names.length !== expected.length || names.some((name, index) => name !== expected[index])) {
    throw new Error(
      `assertProjectionAllowlist: template set mismatch (got ${names.join(',')})`
    );
  }
  const stripped = stripSqlLiterals(sql);
  for (const forbidden of PROJECTION_FORBIDDEN) {
    if (new RegExp(`\\b${forbidden}\\b`, 'i').test(stripped)) {
      throw new Error(`assertProjectionAllowlist: forbidden construct '${forbidden}'`);
    }
  }
}

// ---------------------------------------------------------------------------
// Task 3 — immutable database and TLS identity (contract "Immutable database
// and TLS identity"). The production endpoint is fixed; TLS is verify-full with
// the pinned CA digest; post-connect identity/read-only/isolation/version must
// all hold or the run fails. A disconnect or pooler backend change invalidates
// the epoch and forbids transparent reconnect.
// ---------------------------------------------------------------------------

const PRODUCTION_ENDPOINT = Object.freeze({
  scheme: 'postgresql',
  host: 'aws-1-us-east-2.pooler.supabase.com',
  port: 5432,
  user: 'postgres.diqooqbuchsliypgwksu',
  database: 'postgres',
});

const PROD_CA_SHA256 = '700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7';

/**
 * Strictly parse the production DSN and reject any deviation from the frozen
 * endpoint. Returns only endpoint identity; the FD-3 password is never returned
 * here (contract: FD 3 is never hashed or logged).
 * @param {string} url
 * @returns {{scheme: string, host: string, port: number, user: string, database: string}}
 */
function parseProductionUrl(url) {
  if (typeof url !== 'string' || url.length === 0) {
    throw new Error('parseProductionUrl: url must be a non-empty string');
  }
  const schemeSep = url.indexOf('://');
  if (schemeSep < 0) throw new Error('parseProductionUrl: missing scheme separator');
  const scheme = url.slice(0, schemeSep);
  if (scheme !== PRODUCTION_ENDPOINT.scheme) {
    throw new Error(`parseProductionUrl: scheme must be '${PRODUCTION_ENDPOINT.scheme}'`);
  }
  const rest = url.slice(schemeSep + 3);
  if (rest.includes('?')) throw new Error('parseProductionUrl: query component is forbidden');
  if (rest.includes('#')) throw new Error('parseProductionUrl: fragment component is forbidden');
  const at = rest.lastIndexOf('@');
  if (at < 0) throw new Error('parseProductionUrl: missing userinfo');
  const userinfo = rest.slice(0, at);
  const hostPortPath = rest.slice(at + 1);
  const user = userinfo.includes(':') ? userinfo.slice(0, userinfo.indexOf(':')) : userinfo;
  if (user !== PRODUCTION_ENDPOINT.user) {
    throw new Error('parseProductionUrl: URL user does not match the frozen endpoint');
  }
  const slash = hostPortPath.indexOf('/');
  if (slash < 0) throw new Error('parseProductionUrl: missing database path');
  const hostPort = hostPortPath.slice(0, slash);
  const path = hostPortPath.slice(slash);
  const colon = hostPort.lastIndexOf(':');
  if (colon < 0) throw new Error('parseProductionUrl: missing port');
  const host = hostPort.slice(0, colon);
  const portText = hostPort.slice(colon + 1);
  if (host !== PRODUCTION_ENDPOINT.host) {
    throw new Error('parseProductionUrl: host does not match the frozen endpoint');
  }
  if (!/^[0-9]+$/.test(portText)) throw new Error('parseProductionUrl: invalid port');
  const port = parseInt(portText, 10);
  if (port !== PRODUCTION_ENDPOINT.port) {
    throw new Error('parseProductionUrl: port does not match the frozen endpoint');
  }
  if (path !== `/${PRODUCTION_ENDPOINT.database}`) {
    throw new Error('parseProductionUrl: database path does not match the frozen endpoint');
  }
  return {
    scheme,
    host,
    port,
    user,
    database: PRODUCTION_ENDPOINT.database,
  };
}

/**
 * Build the verify-full TLS config. Refuses any CA whose SHA-256 is not the
 * pinned digest (a synthetic CA fails against PROD_CA_SHA256 by design).
 * @param {string | Uint8Array} caPem
 * @param {{serverName: string, expectedCaSha256: string}} options
 * @returns {{rejectUnauthorized: true, servername: string, ca: string | Uint8Array}}
 */
function buildTlsConfig(caPem, options) {
  const { serverName, expectedCaSha256 } = options;
  if (typeof serverName !== 'string' || serverName.length === 0) {
    throw new Error('buildTlsConfig: serverName must be a non-empty string');
  }
  if (typeof expectedCaSha256 !== 'string' || !HEX64.test(expectedCaSha256)) {
    throw new Error('buildTlsConfig: expectedCaSha256 must be lowercase 64-hex');
  }
  const actual = sha256Hex(caPem);
  if (actual !== expectedCaSha256) {
    throw new Error('buildTlsConfig: CA SHA-256 does not match the pinned digest');
  }
  return { rejectUnauthorized: true, servername: serverName, ca: caPem };
}

/**
 * Assert the post-connect identity holds (contract "Immutable database and TLS
 * identity" post-connect block). Throws on any deviation.
 * @param {{session_user: string, current_database: string, transaction_read_only: string,
 *          transaction_isolation: string, server_version_num: number}} observed
 */
function assertPostConnect(observed) {
  if (observed.session_user !== 'postgres') {
    throw new Error("assertPostConnect: session_user must be 'postgres'");
  }
  if (observed.current_database !== 'postgres') {
    throw new Error("assertPostConnect: current_database must be 'postgres'");
  }
  if (observed.transaction_read_only !== 'on') {
    throw new Error("assertPostConnect: transaction_read_only must be 'on'");
  }
  if (observed.transaction_isolation !== 'read committed') {
    throw new Error("assertPostConnect: transaction_isolation must be 'read committed'");
  }
  const version = observed.server_version_num;
  if (!Number.isInteger(version) || version < 170000 || version >= 180000) {
    throw new Error('assertPostConnect: server_version_num must be >= 170000 and < 180000');
  }
}

/**
 * Assert the backend epoch is continuous. A changed backend PID or backend
 * start invalidates the epoch; transparent reconnect is forbidden.
 * @param {{backend_pid: number, backend_start_utc: string}} expected
 * @param {{backend_pid: number, backend_start_utc: string}} observed
 */
function assertBackendContinuity(expected, observed) {
  if (
    expected.backend_pid !== observed.backend_pid ||
    expected.backend_start_utc !== observed.backend_start_utc
  ) {
    throw new Error('assertBackendContinuity: backend/pooler epoch changed; reconnect forbidden');
  }
}

// ---------------------------------------------------------------------------
// Task 4 — read-only capability projection (contract "Required read-only
// capability projection; no new grants"). The capability object has exactly
// nine keys; each per-OID lock row must be authorized; activity visibility is
// proven only by pg_read_all_stats membership or a W-accepted equivalent digest
// (D6 cannot invent one); a missing capability is a hard stop.
// ---------------------------------------------------------------------------

const CAPABILITY_SCHEMA_VERSION = 'megacampus.q12.activation-truth-capability/v1';

const STRONG_PRIVILEGE_FIELDS = Object.freeze(['maintain', 'update', 'delete', 'truncate']);

// Immutable definition of the pg_read_all_stats visibility mode.
const VISIBILITY_PG_READ_ALL_STATS_DEFINITION_HASH = canonicalHash({
  mode: 'pg_read_all_stats_member',
  predicate: "pg_has_role(session_user, 'pg_read_all_stats', 'MEMBER')",
});

function assertBoolean(value, field) {
  if (typeof value !== 'boolean') {
    throw new Error(`normalizeLockRow: required field '${field}' is a security-restricted null`);
  }
  return value;
}

/**
 * Normalize a per-OID lock row and derive lock_authorized as the OR of the four
 * strong privileges. Rejects missing/null privilege fields.
 * @param {Record<string, unknown>} raw
 */
function normalizeLockRow(raw) {
  if (raw === null || typeof raw !== 'object') {
    throw new Error('normalizeLockRow: row must be an object');
  }
  const qualified_name = raw.qualified_name;
  if (typeof qualified_name !== 'string' || qualified_name.length === 0) {
    throw new Error('normalizeLockRow: qualified_name must be a non-empty string');
  }
  if (!Number.isInteger(raw.oid)) {
    throw new Error(`normalizeLockRow: oid must be an integer for ${qualified_name}`);
  }
  const maintain = assertBoolean(raw.maintain, 'maintain');
  const update = assertBoolean(raw.update, 'update');
  const del = assertBoolean(raw.delete, 'delete');
  const truncate = assertBoolean(raw.truncate, 'truncate');
  const lock_authorized = maintain || update || del || truncate;
  return {
    qualified_name,
    oid: raw.oid,
    maintain,
    update,
    delete: del,
    truncate,
    lock_authorized,
  };
}

/**
 * Assert every per-OID row is lock-authorized, the set is non-empty, and no
 * qualified_name repeats. Any unauthorized/duplicate/empty set fails before
 * classification.
 * @param {Array<Record<string, unknown>>} rows
 */
function assertLockRowsAuthorized(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('assertLockRowsAuthorized: no rows (empty lock catalog projection)');
  }
  const seen = new Set();
  for (const raw of rows) {
    const row = normalizeLockRow(raw);
    if (seen.has(row.qualified_name)) {
      throw new Error(`assertLockRowsAuthorized: duplicate relation ${row.qualified_name}`);
    }
    seen.add(row.qualified_name);
    if (!row.lock_authorized) {
      throw new Error(`assertLockRowsAuthorized: relation ${row.qualified_name} is not authorized`);
    }
  }
}

/**
 * Resolve the activity-visibility mode. Only pg_read_all_stats membership or a
 * W-accepted equivalent digest is accepted; anything else is a hard stop.
 * @param {{member: boolean, wEquivalentDefinitionHash?: string | null}} input
 * @returns {{mode: string, definition_hash: string}}
 */
function resolveActivityVisibility(input) {
  if (input.member === true) {
    return {
      mode: 'pg_read_all_stats_member',
      definition_hash: VISIBILITY_PG_READ_ALL_STATS_DEFINITION_HASH,
    };
  }
  const wHash = input.wEquivalentDefinitionHash;
  if (typeof wHash === 'string' && HEX64.test(wHash)) {
    return { mode: 'w_accepted_equivalent', definition_hash: wHash };
  }
  throw new Error('resolveActivityVisibility: no proven activity visibility (missing capability)');
}

/**
 * @param {unknown} flag
 */
function assertClearSnapshotExecuted(flag) {
  if (flag !== true) {
    throw new Error('assertClearSnapshotExecuted: pg_stat_clear_snapshot() did not execute');
  }
}

/**
 * Build the nine-key capability object and its derived hashes (contract keys:
 * schema_version, session_user, current_database, server_version_num,
 * lock_relation_count, lock_privilege_sha256, activity_visibility_mode,
 * activity_visibility_sha256, clear_snapshot_executed).
 * @param {{session_user: string, current_database: string, server_version_num: number,
 *          rows: Array<Record<string, unknown>>,
 *          visibility: {member: boolean, wEquivalentDefinitionHash?: string | null},
 *          clear_snapshot_executed: boolean}} input
 */
function buildCapabilityObject(input) {
  assertClearSnapshotExecuted(input.clear_snapshot_executed);
  assertLockRowsAuthorized(input.rows);
  const normalized = input.rows
    .map(normalizeLockRow)
    .sort((a, b) => (a.qualified_name < b.qualified_name ? -1 : a.qualified_name > b.qualified_name ? 1 : 0));
  const visibility = resolveActivityVisibility(input.visibility);
  return {
    schema_version: CAPABILITY_SCHEMA_VERSION,
    session_user: input.session_user,
    current_database: input.current_database,
    server_version_num: input.server_version_num,
    lock_relation_count: normalized.length,
    lock_privilege_sha256: canonicalHash(normalized),
    activity_visibility_mode: visibility.mode,
    activity_visibility_sha256: visibility.definition_hash,
    clear_snapshot_executed: true,
  };
}

// ---------------------------------------------------------------------------
// Task 5 — transaction, full-catalog SHARE lock, allowlist enforcement
// (contract "Database transaction, lock and SQL allowlist"). Only templates
// whose exact text is a member of the FD-11 bundle may execute; every accepted
// catalog relation must carry a granted ShareLock (locking a proper subset such
// as q12_guard.active_run alone is forbidden).
// ---------------------------------------------------------------------------

/**
 * Assert a candidate SQL string is exactly one of the FD-11 bundle templates.
 * @param {Map<string, string>} bundle
 * @param {string} candidateSql
 */
function assertTemplateAllowed(bundle, candidateSql) {
  const candidate = String(candidateSql).trim();
  for (const text of bundle.values()) {
    if (text.trim() === candidate) return;
  }
  throw new Error('assertTemplateAllowed: SQL is not in the FD-11 template allowlist');
}

/**
 * Verify the observed pg_locks projection contains exactly one granted ShareLock
 * per accepted relation, with no missing/extra/ungranted/wrong-mode entry.
 * @param {{observed: Array<{qualified_name: string, lock_mode: string, granted: boolean}>,
 *          expectedRelations: readonly string[]}} input
 */
function verifyGrantedLocks(input) {
  const { observed, expectedRelations } = input;
  const expected = new Set(expectedRelations);
  if (expected.size !== expectedRelations.length) {
    throw new Error('verifyGrantedLocks: expectedRelations contains duplicates');
  }
  const seen = new Set();
  for (const row of observed) {
    if (!expected.has(row.qualified_name)) {
      throw new Error(`verifyGrantedLocks: unexpected/extra lock on ${row.qualified_name}`);
    }
    if (seen.has(row.qualified_name)) {
      throw new Error(`verifyGrantedLocks: duplicate lock row for ${row.qualified_name}`);
    }
    seen.add(row.qualified_name);
    if (row.lock_mode !== 'ShareLock') {
      throw new Error(`verifyGrantedLocks: relation ${row.qualified_name} is not in SHARE mode`);
    }
    if (row.granted !== true) {
      throw new Error(`verifyGrantedLocks: relation ${row.qualified_name} lock is not granted`);
    }
  }
  for (const relation of expectedRelations) {
    if (!seen.has(relation)) {
      throw new Error(`verifyGrantedLocks: missing granted SHARE lock on expected ${relation}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Task 6 — common-lock proof against W activation slices (contract "Accepted W
// dependency and common-lock proof"). D6 binds the exact accepted slice/catalog/
// order digests (any W byte/slice/catalog/order/control-flow digest change
// invalidates D6), and the probe's SHARE on the common catalog conflicts with
// activation's accepted incompatible lock (wait-winner ordering).
// ---------------------------------------------------------------------------

/**
 * Assert the provided activation slice/catalog/order digests equal the accepted
 * W tuple. Any mismatch invalidates D6.
 * @param {{normal_slice: string, recovery_slice: string, lock_catalog: string, lock_order: string}} provided
 * @param {{activation_normal_slice_sha256: string, activation_recovery_slice_sha256: string,
 *          activation_lock_catalog_sha256: string, activation_lock_order_sha256: string}} wtuple
 */
function assertActivationDigestsBound(provided, wtuple) {
  const pairs = [
    ['normal_slice', provided.normal_slice, wtuple.activation_normal_slice_sha256],
    ['recovery_slice', provided.recovery_slice, wtuple.activation_recovery_slice_sha256],
    ['lock_catalog', provided.lock_catalog, wtuple.activation_lock_catalog_sha256],
    ['lock_order', provided.lock_order, wtuple.activation_lock_order_sha256],
  ];
  for (const [name, got, expected] of pairs) {
    if (typeof got !== 'string' || !HEX64.test(got) || got !== expected) {
      throw new Error(`assertActivationDigestsBound: ${name} digest does not match accepted W`);
    }
  }
}

/**
 * Assert the observed race outcome proves the common-lock conflict and ordering:
 * the probe held SHARE, activation blocked before any mutation, activation only
 * acquired the incompatible lock after the probe released, and then committed.
 * @param {{probe_share_held: boolean, activation_blocked_while_share_held: boolean,
 *          activation_acquired_after_release: boolean, activation_committed: boolean}} outcome
 */
function assertCommonLockConflict(outcome) {
  if (outcome.probe_share_held !== true) {
    throw new Error('assertCommonLockConflict: probe did not hold SHARE');
  }
  if (outcome.activation_blocked_while_share_held !== true) {
    throw new Error('assertCommonLockConflict: activation was not blocked while SHARE was held');
  }
  if (outcome.activation_acquired_after_release !== true) {
    throw new Error('assertCommonLockConflict: activation did not acquire only after release');
  }
  if (outcome.activation_committed !== true) {
    throw new Error('assertCommonLockConflict: activation did not commit after acquiring');
  }
}

// ---------------------------------------------------------------------------
// Task 7 — exact managed-provider and session projection (contract "Exact
// managed-provider and session projection"). D6 consumes the immutable
// hash-bound inventory and projects each observed pg_stat_activity row into the
// exact eleven-key shape, detecting drift (unknown identity, disallowed state,
// transaction-free violations) without ever controlling the trusted plane.
//
// Modeling boundary: the projection layer receives already-normalized identity
// fields (provider-background sentinels: empty role/database and state 'none').
// A genuine JSON null in a required field is a security-restricted null and
// fails here; the provider null->sentinel normalization is applied upstream at
// the SQL layer (coalesce) because bare PG17 cannot reproduce the frozen
// Supabase provider inventory.
// ---------------------------------------------------------------------------

const INVENTORY_SCHEMA_VERSION = 'megacampus.q12.managed-session-inventory/v1';
const MANAGED_PROJECT_REF = 'diqooqbuchsliypgwksu';
const MANAGED_DATABASE = 'postgres';
const MANAGED_SOURCE_DECISION_SHA256 =
  '7188d792af79ec881c16ef0729394e5c1f5c2c67aa6d59b86bec1bdf91308b27';
const PROBE_APP_IDENTITY = 'megacampus-q12-activation-truth';

const INVENTORY_TOP_KEYS = Object.freeze([
  'database',
  'identities',
  'project_ref',
  'provider_plane_trusted',
  'schema_version',
  'source_decision_sha256',
]);
const IDENTITY_KEYS = Object.freeze([
  'allowed_states',
  'application_identity',
  'backend_type',
  'client_class',
  'database',
  'role',
  'transaction_free_required',
]);
const OBSERVED_ROW_KEYS = Object.freeze([
  'application_identity',
  'backend_start_utc',
  'backend_type',
  'backend_xid_is_null',
  'backend_xmin_is_null',
  'client_class',
  'database',
  'pid',
  'role',
  'state',
  'xact_start_is_null',
]);

const RFC3339_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function sameKeySet(obj, expectedSortedKeys) {
  const keys = Object.keys(obj).sort();
  return (
    keys.length === expectedSortedKeys.length && keys.every((k, i) => k === expectedSortedKeys[i])
  );
}

function identityFourTupleKey(row) {
  return JSON.stringify([row.role, row.database, row.backend_type, row.application_identity]);
}

/**
 * Consume the immutable managed-session inventory, validate its exact key sets
 * and fixed scalars, and bind its canonical hash to the accepted W field 11.
 * @param {string} text
 * @param {{expectedInventorySha256: string}} options
 */
function consumeManagedInventory(text, options) {
  const parsed = parseCanonicalJson(text);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('consumeManagedInventory: inventory must be a JSON object');
  }
  if (!sameKeySet(parsed, INVENTORY_TOP_KEYS)) {
    throw new Error('consumeManagedInventory: unexpected top-level key set');
  }
  if (parsed.schema_version !== INVENTORY_SCHEMA_VERSION) {
    throw new Error('consumeManagedInventory: wrong schema_version');
  }
  if (parsed.project_ref !== MANAGED_PROJECT_REF) {
    throw new Error('consumeManagedInventory: wrong project_ref');
  }
  if (parsed.database !== MANAGED_DATABASE) {
    throw new Error('consumeManagedInventory: wrong database');
  }
  if (parsed.source_decision_sha256 !== MANAGED_SOURCE_DECISION_SHA256) {
    throw new Error('consumeManagedInventory: wrong source_decision_sha256');
  }
  if (parsed.provider_plane_trusted !== true) {
    throw new Error('consumeManagedInventory: provider_plane_trusted must be true');
  }
  if (!Array.isArray(parsed.identities) || parsed.identities.length === 0) {
    throw new Error('consumeManagedInventory: identities must be a non-empty array');
  }
  const seen = new Set();
  for (const identity of parsed.identities) {
    if (identity === null || typeof identity !== 'object' || Array.isArray(identity)) {
      throw new Error('consumeManagedInventory: identity must be an object');
    }
    if (!sameKeySet(identity, IDENTITY_KEYS)) {
      throw new Error('consumeManagedInventory: unexpected identity key set');
    }
    for (const field of ['role', 'database', 'backend_type', 'application_identity', 'client_class']) {
      if (typeof identity[field] !== 'string') {
        throw new Error(`consumeManagedInventory: identity field '${field}' must be a string`);
      }
    }
    if (
      !Array.isArray(identity.allowed_states) ||
      identity.allowed_states.some(s => typeof s !== 'string')
    ) {
      throw new Error('consumeManagedInventory: allowed_states must be a string array');
    }
    if (typeof identity.transaction_free_required !== 'boolean') {
      throw new Error('consumeManagedInventory: transaction_free_required must be boolean');
    }
    const key = identityFourTupleKey(identity);
    if (seen.has(key)) {
      throw new Error('consumeManagedInventory: duplicate identity ambiguity');
    }
    seen.add(key);
  }
  const actual = canonicalHash(parsed);
  if (actual !== options.expectedInventorySha256) {
    throw new Error('consumeManagedInventory: inventory hash does not match the accepted field 11');
  }
  return parsed;
}

/**
 * Project one observed activity row into the exact eleven-key shape. Rejects a
 * security-restricted null in any required field and lowercases the state.
 * @param {Record<string, unknown>} raw
 */
function projectObservedRow(raw) {
  if (raw === null || typeof raw !== 'object') {
    throw new Error('projectObservedRow: row must be an object');
  }
  for (const field of ['role', 'database', 'backend_type', 'application_identity', 'client_class']) {
    if (typeof raw[field] !== 'string') {
      throw new Error(`projectObservedRow: required field '${field}' is a security-restricted null`);
    }
  }
  if (typeof raw.state !== 'string' || raw.state.length === 0) {
    throw new Error('projectObservedRow: required field state is a security-restricted null');
  }
  for (const field of ['xact_start_is_null', 'backend_xid_is_null', 'backend_xmin_is_null']) {
    if (typeof raw[field] !== 'boolean') {
      throw new Error(`projectObservedRow: null predicate '${field}' must be a boolean`);
    }
  }
  if (!Number.isInteger(raw.pid)) {
    throw new Error('projectObservedRow: pid must be an integer');
  }
  if (typeof raw.backend_start_utc !== 'string' || !RFC3339_MS.test(raw.backend_start_utc)) {
    throw new Error('projectObservedRow: backend_start_utc must be UTC RFC3339 milliseconds');
  }
  return {
    role: raw.role,
    database: raw.database,
    backend_type: raw.backend_type,
    application_identity: raw.application_identity,
    client_class: raw.client_class,
    state: raw.state.toLowerCase(),
    xact_start_is_null: raw.xact_start_is_null,
    backend_xid_is_null: raw.backend_xid_is_null,
    backend_xmin_is_null: raw.backend_xmin_is_null,
    pid: raw.pid,
    backend_start_utc: raw.backend_start_utc,
  };
}

function observedSortKey(row) {
  return [
    row.role,
    row.database,
    row.backend_type,
    row.application_identity,
    row.client_class,
  ].join(' ');
}

/**
 * Build the canonical, drift-checked session observation. Each observed row must
 * resolve to a known inventory identity by its (role, database, backend_type,
 * application_identity) 4-tuple; its state must be allowed; a transaction-free-
 * required identity must carry the three null predicates; the sole non-
 * transaction-free exception is the probe backend.
 * @param {Record<string, unknown>} inventory
 * @param {Array<Record<string, unknown>>} rawRows
 * @param {{probePid: number}} options
 * @returns {{rows: Array<Record<string, unknown>>, sha256: string}}
 */
function buildSessionObservation(inventory, rawRows, options) {
  const index = new Map();
  for (const identity of inventory.identities) {
    index.set(identityFourTupleKey(identity), identity);
  }
  let probeRows = 0;
  const projected = [];
  for (const raw of rawRows) {
    const identity = index.get(identityFourTupleKey(raw));
    if (identity === undefined) {
      throw new Error('buildSessionObservation: unknown managed identity (drift)');
    }
    const isProbe = raw.application_identity === PROBE_APP_IDENTITY && raw.pid === options.probePid;
    const state = typeof raw.state === 'string' ? raw.state.toLowerCase() : raw.state;
    if (!identity.allowed_states.includes(state)) {
      throw new Error(`buildSessionObservation: disallowed state '${state}' (drift)`);
    }
    if (identity.transaction_free_required === true) {
      if (
        raw.xact_start_is_null !== true ||
        raw.backend_xid_is_null !== true ||
        raw.backend_xmin_is_null !== true
      ) {
        throw new Error('buildSessionObservation: transaction-free predicate is false (drift)');
      }
    }
    if (isProbe) {
      probeRows += 1;
      if (
        identity.client_class !== 'probe' ||
        state !== 'active' ||
        raw.role !== 'postgres' ||
        raw.database !== 'postgres'
      ) {
        throw new Error('buildSessionObservation: probe backend identity mismatch (drift)');
      }
    }
    projected.push(projectObservedRow({ ...raw, client_class: identity.client_class }));
  }
  if (probeRows !== 1) {
    throw new Error('buildSessionObservation: exactly one probe backend row is required');
  }
  projected.sort((a, b) => {
    const ka = observedSortKey(a);
    const kb = observedSortKey(b);
    if (ka < kb) return -1;
    if (ka > kb) return 1;
    return a.pid - b.pid;
  });
  return { rows: projected, sha256: canonicalHash(projected) };
}

// ---------------------------------------------------------------------------
// Task 8 — database and host projection key sets and initial invariants
// (contract "Database and host projections"). Both projections carry their
// exact key set in every classification; the global pg_net queue count and the
// prepared-transaction count are exactly zero; every required (non-evidence)
// field is non-null. A snapshot clear plus a complete fresh read precede
// db_locked, host_bound, and sealed.
// ---------------------------------------------------------------------------

const DB_PROJECTION_KEYS = Object.freeze([
  'schema_version',
  'run_id',
  'server_version_num',
  'session_user',
  'current_database',
  'transaction_isolation',
  'transaction_read_only',
  'backend_pid',
  'connection_identity_sha256',
  'capability_projection_sha256',
  'active_run_sha256',
  'guard_projection_sha256',
  'structural_catalog_sha256',
  'database_default_sha256',
  'cron_jobs_sha256',
  'active_cron_count',
  'global_pg_net_queue_count',
  'prepared_xact_count',
  'session_inventory_sha256',
  'session_observation_sha256',
  'lock_projection_sha256',
]);

const HOST_PROJECTION_KEYS = Object.freeze([
  'schema_version',
  'run_id',
  'lease_epoch',
  'activation_evidence_state',
  'fd9_identity_sha256',
  'probe_pidfd_identity_sha256',
  'spawn_capability_sha256',
  'runtime_fd_baseline_sha256',
  'activation_process_projection_sha256',
  'prepared_quiesced_predecessor_sha256',
  'writer_quiesce_manifest_sha256',
  'writer_inventory_sha256',
  'docker_observation_sha256',
  'barrier_receipt_sha256',
  'probe_receipt_sha256',
  'activation_result_sha256',
  'process_manifest_sha256',
  'w_activation_tuple_sha256',
]);

// The four host evidence fields that may be JSON null under the H/N table
// (Task 9). activation_process_projection_sha256 is required non-null in every
// classification.
const HOST_EVIDENCE_NULLABLE = Object.freeze([
  'barrier_receipt_sha256',
  'probe_receipt_sha256',
  'activation_result_sha256',
  'process_manifest_sha256',
]);

function assertExactKeySet(fields, keys, label) {
  if (fields === null || typeof fields !== 'object' || Array.isArray(fields)) {
    throw new Error(`${label}: fields must be an object`);
  }
  const actual = Object.keys(fields).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((k, i) => k !== expected[i])) {
    throw new Error(`${label}: key set mismatch`);
  }
}

/**
 * Assemble and validate the database projection. Enforces the global net-queue
 * and prepared-transaction zero invariants and rejects any missing/extra key.
 * @param {Record<string, unknown>} fields
 */
function buildDatabaseProjection(fields) {
  assertExactKeySet(fields, DB_PROJECTION_KEYS, 'buildDatabaseProjection');
  if (fields.global_pg_net_queue_count !== 0) {
    throw new Error('buildDatabaseProjection: global_pg_net_queue_count must be exactly zero');
  }
  if (fields.prepared_xact_count !== 0) {
    throw new Error('buildDatabaseProjection: prepared_xact_count must be exactly zero');
  }
  if (!Number.isInteger(fields.active_cron_count) || fields.active_cron_count < 0) {
    throw new Error('buildDatabaseProjection: active_cron_count must be a non-negative integer');
  }
  const projection = {};
  for (const key of DB_PROJECTION_KEYS) projection[key] = fields[key];
  return projection;
}

/**
 * Assemble and validate the host projection. Rejects any missing/extra key and
 * any null in a required (non-evidence) field.
 * @param {Record<string, unknown>} fields
 */
function buildHostProjection(fields) {
  assertExactKeySet(fields, HOST_PROJECTION_KEYS, 'buildHostProjection');
  for (const key of HOST_PROJECTION_KEYS) {
    if (HOST_EVIDENCE_NULLABLE.includes(key)) continue;
    if (fields[key] === null || fields[key] === undefined) {
      throw new Error(`buildHostProjection: required field '${key}' must be non-null`);
    }
  }
  const projection = {};
  for (const key of HOST_PROJECTION_KEYS) projection[key] = fields[key];
  return projection;
}

/**
 * Assert a snapshot clear and a complete fresh read preceded an authority-
 * bearing projection.
 * @param {{snapshot_cleared: unknown, fresh_read: unknown}} input
 */
function assertProjectionPreamble(input) {
  if (input.snapshot_cleared !== true) {
    throw new Error('assertProjectionPreamble: snapshot clear did not precede the read');
  }
  if (input.fresh_read !== true) {
    throw new Error('assertProjectionPreamble: a complete fresh read did not occur');
  }
}

// ---------------------------------------------------------------------------
// Task 9 — H/N classification evidence table (contract "Database and host
// projections" evidence table + "Classifications"). H means one lowercase
// 64-hex SHA-256 over the exact safely-opened canonical bytes; N means JSON
// null. The validator is a pure function of (classification, safely-revalidated
// object presence) and refuses any H/N free choice. An unsafe present object
// stops before terminal-seal publication rather than converting to null.
// ---------------------------------------------------------------------------

const EVIDENCE_STATES_BY_CLASSIFICATION = Object.freeze({
  precommit_rollback: ['prepared_guarded'],
  committed_finish_forward: ['complete_receipt', 'committed_receipt_pending'],
  drift_incident: ['incident_observed'],
});

// Deterministic H/N patterns for the non-incident evidence states.
const DETERMINISTIC_EVIDENCE_PATTERNS = Object.freeze({
  prepared_guarded: {
    barrier_receipt_sha256: 'H',
    probe_receipt_sha256: 'H',
    activation_result_sha256: 'N',
    activation_process_projection_sha256: 'H',
    process_manifest_sha256: 'N',
  },
  complete_receipt: {
    barrier_receipt_sha256: 'H',
    probe_receipt_sha256: 'H',
    activation_result_sha256: 'H',
    activation_process_projection_sha256: 'H',
    process_manifest_sha256: 'H',
  },
  committed_receipt_pending: {
    barrier_receipt_sha256: 'H',
    probe_receipt_sha256: 'H',
    activation_result_sha256: 'N',
    activation_process_projection_sha256: 'H',
    process_manifest_sha256: 'H',
  },
});

// Map of the four presence-driven incident fields to their presence keys.
const INCIDENT_PRESENCE_FIELDS = Object.freeze({
  barrier_receipt_sha256: 'barrier_receipt',
  probe_receipt_sha256: 'probe_receipt',
  activation_result_sha256: 'activation_result',
  process_manifest_sha256: 'process_manifest',
});

function isH(value) {
  return typeof value === 'string' && HEX64.test(value);
}

function assertHnField(fieldName, value, expected) {
  if (expected === 'H') {
    if (!isH(value)) throw new Error(`validateEvidenceTable: ${fieldName} must be H (64-hex)`);
  } else if (value !== null) {
    throw new Error(`validateEvidenceTable: ${fieldName} must be N (null)`);
  }
}

/**
 * Validate the host evidence fields against the exact H/N table for the given
 * classification/state.
 * @param {{classification: string, activation_evidence_state: string,
 *          barrier_receipt_sha256: string | null, probe_receipt_sha256: string | null,
 *          activation_result_sha256: string | null,
 *          activation_process_projection_sha256: string | null,
 *          process_manifest_sha256: string | null,
 *          presence?: Record<string, 'present' | 'absent' | 'unsafe'>}} input
 */
function validateEvidenceTable(input) {
  const allowedStates = EVIDENCE_STATES_BY_CLASSIFICATION[input.classification];
  if (!allowedStates || !allowedStates.includes(input.activation_evidence_state)) {
    throw new Error('validateEvidenceTable: classification/evidence-state mismatch');
  }
  // activation_process_projection_sha256 is H in every classification.
  assertHnField(
    'activation_process_projection_sha256',
    input.activation_process_projection_sha256,
    'H'
  );
  if (input.activation_evidence_state === 'incident_observed') {
    const presence = input.presence;
    if (presence === undefined) {
      throw new Error('validateEvidenceTable: incident requires a safe-presence map');
    }
    for (const [field, presenceKey] of Object.entries(INCIDENT_PRESENCE_FIELDS)) {
      const state = presence[presenceKey];
      if (state === 'unsafe') {
        throw new Error(
          `validateEvidenceTable: ${field} object is unsafe; stop before terminal seal (incident)`
        );
      }
      if (state !== 'present' && state !== 'absent') {
        throw new Error(`validateEvidenceTable: missing safe-presence for ${presenceKey}`);
      }
      assertHnField(field, input[field], state === 'present' ? 'H' : 'N');
    }
    return;
  }
  const pattern = DETERMINISTIC_EVIDENCE_PATTERNS[input.activation_evidence_state];
  for (const field of Object.keys(pattern)) {
    assertHnField(field, input[field], pattern[field]);
  }
}

/**
 * committed_receipt_pending is legal only with the exact predecessor
 * recovery_ready_guarded barrier receipt, the exact process manifest, and a
 * zero-live projection; any absence/mismatch reclassifies to drift_incident.
 * @param {{barrier_is_predecessor_recovery_ready_guarded: boolean,
 *          process_manifest_present: boolean, zero_live_projection: boolean}} input
 */
function assertCommittedReceiptPendingLegal(input) {
  if (
    input.barrier_is_predecessor_recovery_ready_guarded !== true ||
    input.process_manifest_present !== true ||
    input.zero_live_projection !== true
  ) {
    throw new Error('assertCommittedReceiptPendingLegal: conditions unmet -> drift_incident');
  }
}

// ---------------------------------------------------------------------------
// Task 10 — pre-R writer ancestry + Docker 10+5 truth (contract "Exact pre-R
// writer ancestry and Docker truth"). Pre-R D6 binds the exact accepted
// prepared_quiesced predecessor as the unique current head / required ancestor
// and never requires a rollback final-writer manifest. The Docker observation
// is ten final + five held = fifteen unique IDs, all stopped, restart "no".
// ---------------------------------------------------------------------------

const STOPPED_DOCKER_STATUSES = Object.freeze(['exited', 'created', 'dead']);

/**
 * Bind the prepared_quiesced predecessor. Requires the unique journal/checkpoint
 * head and the exact required ancestor; refuses a rollback final-writer manifest
 * as a precondition (that is Task 9 / .13.13 output).
 * @param {{journal_entry_hash: string, checkpoint_sha256: string,
 *          writer_quiesce_manifest_sha256: string, is_unique_head: boolean,
 *          is_required_ancestor: boolean, rollback_final_writer_manifest_required?: boolean}} input
 */
function bindPreparedQuiescedPredecessor(input) {
  for (const field of ['journal_entry_hash', 'checkpoint_sha256', 'writer_quiesce_manifest_sha256']) {
    if (typeof input[field] !== 'string' || !HEX64.test(input[field])) {
      throw new Error(`bindPreparedQuiescedPredecessor: ${field} must be lowercase 64-hex`);
    }
  }
  if (input.rollback_final_writer_manifest_required === true) {
    throw new Error(
      'bindPreparedQuiescedPredecessor: pre-R must not require a rollback final-writer manifest (Task 9)'
    );
  }
  if (input.is_unique_head !== true) {
    throw new Error('bindPreparedQuiescedPredecessor: predecessor is not the unique current head');
  }
  if (input.is_required_ancestor !== true) {
    throw new Error('bindPreparedQuiescedPredecessor: predecessor is not the required ancestor');
  }
  return {
    prepared_quiesced_predecessor_sha256: canonicalHash({
      journal_entry_hash: input.journal_entry_hash,
      checkpoint_sha256: input.checkpoint_sha256,
    }),
    writer_quiesce_manifest_sha256: input.writer_quiesce_manifest_sha256,
  };
}

/**
 * Project the 10+5 Docker observation from synthetic `docker inspect` /
 * `docker compose ps` inventories. Any running container, non-"no" restart
 * policy, wrong count, missing/duplicate ID, or compose mismatch is drift.
 * @param {{inspect: Array<Record<string, unknown>>, composePs: Array<Record<string, unknown>>}} input
 */
function projectDockerObservation(input) {
  const { inspect, composePs } = input;
  if (!Array.isArray(inspect) || !Array.isArray(composePs)) {
    throw new Error('projectDockerObservation: inspect and composePs must be arrays');
  }
  const ids = new Set();
  const canonical = [];
  let finalCount = 0;
  let heldCount = 0;
  for (const entry of inspect) {
    const id = entry && entry.Id;
    if (typeof id !== 'string' || id.length === 0) {
      throw new Error('projectDockerObservation: container Id must be a non-empty string');
    }
    if (ids.has(id)) {
      throw new Error(`projectDockerObservation: duplicate container Id ${id}`);
    }
    ids.add(id);
    const category = entry.category;
    if (category === 'final') finalCount += 1;
    else if (category === 'held') heldCount += 1;
    else throw new Error(`projectDockerObservation: unknown category for ${id}`);
    const status = entry.State && entry.State.Status;
    if (!STOPPED_DOCKER_STATUSES.includes(status)) {
      throw new Error(`projectDockerObservation: container ${id} is not stopped (${status})`);
    }
    const restart = (entry.HostConfig && entry.HostConfig.RestartPolicy) || {};
    if (restart.Name !== 'no' || restart.MaximumRetryCount !== 0) {
      throw new Error(`projectDockerObservation: container ${id} restart policy is not "no"/0`);
    }
    canonical.push({
      id,
      category,
      status,
      restart_name: restart.Name,
      restart_max_retry: restart.MaximumRetryCount,
    });
  }
  if (finalCount !== 10 || heldCount !== 5 || ids.size !== 15) {
    throw new Error(
      `projectDockerObservation: expected 10 final + 5 held = 15 (got ${finalCount}/${heldCount}/${ids.size})`
    );
  }
  // Compose ps is only a completeness cross-check: same ID set, no missing/extra.
  const composeIds = new Set();
  for (const row of composePs) {
    const id = row && row.ID;
    if (typeof id !== 'string' || !ids.has(id) || composeIds.has(id)) {
      throw new Error('projectDockerObservation: compose ps cross-check failed');
    }
    composeIds.add(id);
  }
  if (composeIds.size !== ids.size) {
    throw new Error('projectDockerObservation: compose ps is missing recorded containers');
  }
  canonical.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    sha256: canonicalHash(canonical),
    total: ids.size,
    final: finalCount,
    held: heldCount,
  };
}

// ---------------------------------------------------------------------------
// Task 11 — request schema + frame payloads + protocol sequence (contract
// "Canonical objects and frame envelope" (request), "Exact frame payloads").
// The request is only a bound input; its evidence state and five evidence
// fields obey the H/N table and must equal the later host projection byte-for-
// byte. The probe emits db_locked -> host_bound -> sealed -> closed, chained by
// sequence and previous_frame_sha256.
// ---------------------------------------------------------------------------

const FRAME_SCHEMA_VERSION = 'megacampus.q12.activation-truth-frame/v1';

const REQUEST_KEYS = Object.freeze([
  'schema_version',
  'run_id',
  'release_sha',
  'lease_epoch',
  'predecessor_journal_entry_hash',
  'predecessor_checkpoint_sha256',
  'previous_terminal_seal_sha256',
  'abandoned_predecision_sha256',
  'expected_catalog_sha256',
  'expected_post_migration_catalog_sha256',
  'database_capability_sha256',
  'activation_capability_sha256',
  'prepared_quiesced_predecessor_sha256',
  'writer_quiesce_manifest_sha256',
  'activation_evidence_state',
  'barrier_receipt_sha256',
  'probe_receipt_sha256',
  'activation_result_sha256',
  'activation_process_projection_sha256',
  'process_manifest_sha256',
  'w_activation_tuple_sha256',
  'projection_sql_sha256',
  'spawn_capability_sha256',
  'runtime_fd_baseline_sha256',
]);

const EVIDENCE_STATE_TO_CLASSIFICATION = Object.freeze({
  prepared_guarded: 'precommit_rollback',
  complete_receipt: 'committed_finish_forward',
  committed_receipt_pending: 'committed_finish_forward',
  incident_observed: 'drift_incident',
});

const REQUEST_REQUIRED_HASHES = Object.freeze([
  'release_sha',
  'predecessor_journal_entry_hash',
  'predecessor_checkpoint_sha256',
  'expected_catalog_sha256',
  'expected_post_migration_catalog_sha256',
  'database_capability_sha256',
  'activation_capability_sha256',
  'prepared_quiesced_predecessor_sha256',
  'writer_quiesce_manifest_sha256',
  'activation_process_projection_sha256',
  'w_activation_tuple_sha256',
  'projection_sql_sha256',
  'spawn_capability_sha256',
  'runtime_fd_baseline_sha256',
]);

function isHashOrNull(value) {
  return value === null || (typeof value === 'string' && HEX64.test(value));
}
function requireHash(obj, name, label) {
  if (typeof obj[name] !== 'string' || !HEX64.test(obj[name])) {
    throw new Error(`${label}: ${name} must be lowercase 64-hex`);
  }
}
function requireHashOrNull(obj, name, label) {
  if (!isHashOrNull(obj[name])) {
    throw new Error(`${label}: ${name} must be lowercase 64-hex or null`);
  }
}

/**
 * Validate the immutable request against its exact 24-key schema, restart-rule
 * nullability, and the evidence H/N table for its evidence state.
 * @param {Record<string, unknown>} request
 */
function validateRequest(request) {
  assertExactKeySet(request, REQUEST_KEYS, 'validateRequest');
  if (typeof request.schema_version !== 'string' || request.schema_version.length === 0) {
    throw new Error('validateRequest: schema_version must be a non-empty string');
  }
  if (typeof request.run_id !== 'string' || request.run_id.length === 0) {
    throw new Error('validateRequest: run_id must be a non-empty string');
  }
  if (!Number.isInteger(request.lease_epoch) || request.lease_epoch < 0) {
    throw new Error('validateRequest: lease_epoch must be a non-negative integer');
  }
  for (const name of REQUEST_REQUIRED_HASHES) requireHash(request, name, 'validateRequest');
  requireHashOrNull(request, 'previous_terminal_seal_sha256', 'validateRequest');
  requireHashOrNull(request, 'abandoned_predecision_sha256', 'validateRequest');
  const classification = EVIDENCE_STATE_TO_CLASSIFICATION[request.activation_evidence_state];
  if (classification === undefined) {
    throw new Error('validateRequest: unknown activation_evidence_state');
  }
  if (request.activation_evidence_state === 'incident_observed') {
    for (const name of [
      'barrier_receipt_sha256',
      'probe_receipt_sha256',
      'activation_result_sha256',
      'process_manifest_sha256',
    ]) {
      requireHashOrNull(request, name, 'validateRequest');
    }
  } else {
    validateEvidenceTable({
      classification,
      activation_evidence_state: request.activation_evidence_state,
      barrier_receipt_sha256: request.barrier_receipt_sha256,
      probe_receipt_sha256: request.probe_receipt_sha256,
      activation_result_sha256: request.activation_result_sha256,
      activation_process_projection_sha256: request.activation_process_projection_sha256,
      process_manifest_sha256: request.process_manifest_sha256,
    });
  }
  const clean = {};
  for (const key of REQUEST_KEYS) clean[key] = request[key];
  return clean;
}

const REQUEST_HOST_EVIDENCE_FIELDS = Object.freeze([
  'activation_evidence_state',
  'barrier_receipt_sha256',
  'probe_receipt_sha256',
  'activation_result_sha256',
  'activation_process_projection_sha256',
  'process_manifest_sha256',
]);

/**
 * Assert the request evidence state + five evidence fields equal the host
 * projection byte-for-byte; any disagreement is drift_incident.
 * @param {Record<string, unknown>} request
 * @param {Record<string, unknown>} hostProjection
 */
function assertRequestMatchesHostProjection(request, hostProjection) {
  for (const field of REQUEST_HOST_EVIDENCE_FIELDS) {
    if (request[field] !== hostProjection[field]) {
      throw new Error(`assertRequestMatchesHostProjection: ${field} mismatch (drift_incident)`);
    }
  }
}

function requireAllHash(input, names, label) {
  for (const name of names) requireHash(input, name, label);
}

function buildDbLockedPayload(input) {
  requireAllHash(
    input,
    [
      'request_sha256',
      'initial_database_projection_sha256',
      'capability_projection_sha256',
      'lock_projection_sha256',
      'fd9_identity_sha256',
    ],
    'buildDbLockedPayload'
  );
  return {
    request_sha256: input.request_sha256,
    initial_database_projection_sha256: input.initial_database_projection_sha256,
    capability_projection_sha256: input.capability_projection_sha256,
    lock_projection_sha256: input.lock_projection_sha256,
    fd9_identity_sha256: input.fd9_identity_sha256,
  };
}

function buildHostBoundPayload(input) {
  requireAllHash(
    input,
    [
      'request_sha256',
      'initial_database_projection_sha256',
      'bound_database_projection_sha256',
      'host_projection_sha256',
      'session_observation_sha256',
      'fd9_identity_sha256',
    ],
    'buildHostBoundPayload'
  );
  return {
    request_sha256: input.request_sha256,
    initial_database_projection_sha256: input.initial_database_projection_sha256,
    bound_database_projection_sha256: input.bound_database_projection_sha256,
    host_projection_sha256: input.host_projection_sha256,
    session_observation_sha256: input.session_observation_sha256,
    fd9_identity_sha256: input.fd9_identity_sha256,
  };
}

function buildSealedPayload(input) {
  requireAllHash(
    input,
    [
      'request_sha256',
      'predecision_sha256',
      'initial_database_projection_sha256',
      'final_database_projection_sha256',
      'host_projection_sha256',
      'fd9_identity_sha256',
    ],
    'buildSealedPayload'
  );
  requireHashOrNull(input, 'actual_r_journal_entry_hash', 'buildSealedPayload');
  requireHashOrNull(input, 'actual_r_checkpoint_sha256', 'buildSealedPayload');
  return {
    request_sha256: input.request_sha256,
    predecision_sha256: input.predecision_sha256,
    initial_database_projection_sha256: input.initial_database_projection_sha256,
    final_database_projection_sha256: input.final_database_projection_sha256,
    host_projection_sha256: input.host_projection_sha256,
    actual_r_journal_entry_hash: input.actual_r_journal_entry_hash,
    actual_r_checkpoint_sha256: input.actual_r_checkpoint_sha256,
    fd9_identity_sha256: input.fd9_identity_sha256,
  };
}

function buildClosedPayload(input) {
  requireAllHash(
    input,
    [
      'request_sha256',
      'predecision_sha256',
      'sealed_frame_sha256',
      'release_frame_sha256',
      'fd9_identity_sha256',
    ],
    'buildClosedPayload'
  );
  requireHashOrNull(input, 'actual_r_journal_entry_hash', 'buildClosedPayload');
  requireHashOrNull(input, 'actual_r_checkpoint_sha256', 'buildClosedPayload');
  return {
    request_sha256: input.request_sha256,
    predecision_sha256: input.predecision_sha256,
    sealed_frame_sha256: input.sealed_frame_sha256,
    release_frame_sha256: input.release_frame_sha256,
    actual_r_journal_entry_hash: input.actual_r_journal_entry_hash,
    actual_r_checkpoint_sha256: input.actual_r_checkpoint_sha256,
    transaction_end: 'read_only_commit',
    connection_closed: true,
    fd9_identity_sha256: input.fd9_identity_sha256,
  };
}

const CLASSIFICATION_ACTION_PAIRS = Object.freeze({
  precommit_rollback: 'append_r_then_seal',
  committed_finish_forward: 'seal_finish_forward',
  drift_incident: 'abort_incident',
});

function validateHostProjectionPayload(payload) {
  assertExactKeySet(
    payload,
    [
      'request_sha256',
      'initial_database_projection_sha256',
      'host_projection_sha256',
      'proposed_classification',
      'prepared_quiesced_predecessor_sha256',
    ],
    'validateHostProjectionPayload'
  );
  if (CLASSIFICATION_ACTION_PAIRS[payload.proposed_classification] === undefined) {
    throw new Error('validateHostProjectionPayload: unknown proposed_classification');
  }
  requireAllHash(
    payload,
    [
      'request_sha256',
      'initial_database_projection_sha256',
      'host_projection_sha256',
      'prepared_quiesced_predecessor_sha256',
    ],
    'validateHostProjectionPayload'
  );
}

function validatePredecisionPayload(payload) {
  assertExactKeySet(
    payload,
    [
      'request_sha256',
      'predecision_sha256',
      'classification',
      'action',
      'planned_r_journal_entry_hash',
      'planned_r_checkpoint_sha256',
      'predecessor_journal_entry_hash',
      'predecessor_checkpoint_sha256',
    ],
    'validatePredecisionPayload'
  );
  const expectedAction = CLASSIFICATION_ACTION_PAIRS[payload.classification];
  if (expectedAction === undefined || expectedAction !== payload.action) {
    throw new Error('validatePredecisionPayload: classification/action pairing is invalid');
  }
  requireAllHash(
    payload,
    ['request_sha256', 'predecision_sha256', 'predecessor_journal_entry_hash', 'predecessor_checkpoint_sha256'],
    'validatePredecisionPayload'
  );
  if (payload.classification === 'precommit_rollback') {
    requireHash(payload, 'planned_r_journal_entry_hash', 'validatePredecisionPayload');
    requireHash(payload, 'planned_r_checkpoint_sha256', 'validatePredecisionPayload');
  } else {
    if (payload.planned_r_journal_entry_hash !== null || payload.planned_r_checkpoint_sha256 !== null) {
      throw new Error('validatePredecisionPayload: planned R hashes must be null for non-precommit');
    }
  }
}

function validateReleasePayload(payload) {
  assertExactKeySet(
    payload,
    [
      'request_sha256',
      'predecision_sha256',
      'sealed_frame_sha256',
      'actual_r_journal_entry_hash',
      'actual_r_checkpoint_sha256',
      'expected_transaction_end',
      'expected_connection_close',
    ],
    'validateReleasePayload'
  );
  requireAllHash(
    payload,
    ['request_sha256', 'predecision_sha256', 'sealed_frame_sha256'],
    'validateReleasePayload'
  );
  requireHashOrNull(payload, 'actual_r_journal_entry_hash', 'validateReleasePayload');
  requireHashOrNull(payload, 'actual_r_checkpoint_sha256', 'validateReleasePayload');
  if (payload.expected_transaction_end !== 'read_only_commit') {
    throw new Error("validateReleasePayload: expected_transaction_end must be 'read_only_commit'");
  }
  if (payload.expected_connection_close !== true) {
    throw new Error('validateReleasePayload: expected_connection_close must be true');
  }
}

const PROTOCOL_ORDER = Object.freeze([
  ['probe', 'db_locked'],
  ['root', 'host_projection'],
  ['probe', 'host_bound'],
  ['root', 'predecision'],
  ['probe', 'sealed'],
  ['root', 'release'],
  ['probe', 'closed'],
]);

/**
 * Probe-side protocol state machine. Enforces the exact ordered sequence and
 * chains every frame by sequence + previous_frame_sha256; any direction,
 * sequence, kind, or hash mismatch is an incident.
 */
class ProbeProtocol {
  constructor(schemaVersion, runId) {
    this._schemaVersion = schemaVersion;
    this._runId = runId;
    this._index = 0;
    this._seq = 0;
    this._head = null;
  }

  emit(kind, payload) {
    const expected = PROTOCOL_ORDER[this._index];
    if (!expected || expected[0] !== 'probe') {
      throw new Error(`ProbeProtocol: unexpected emit at step ${this._index}`);
    }
    if (expected[1] !== kind) {
      throw new Error(`ProbeProtocol: expected to emit '${expected[1]}', got '${kind}'`);
    }
    this._seq += 1;
    const frame = makeFrame({
      schema_version: this._schemaVersion,
      sequence: this._seq,
      kind,
      run_id: this._runId,
      payload,
      previous_frame_sha256: this._head,
    });
    this._head = frame.frame_sha256;
    this._index += 1;
    return frame;
  }

  receive(frame) {
    const expected = PROTOCOL_ORDER[this._index];
    if (!expected || expected[0] !== 'root') {
      throw new Error(`ProbeProtocol: unexpected receive at step ${this._index}`);
    }
    if (frame.kind !== expected[1]) {
      throw new Error(`ProbeProtocol: expected to receive '${expected[1]}', got '${frame.kind}'`);
    }
    if (frame.sequence !== this._seq + 1) {
      throw new Error('ProbeProtocol: out-of-order sequence');
    }
    if (frame.previous_frame_sha256 !== this._head) {
      throw new Error('ProbeProtocol: broken previous_frame_sha256 chain');
    }
    const withoutHash = {};
    for (const key of Object.keys(frame)) {
      if (key !== 'frame_sha256') withoutHash[key] = frame[key];
    }
    if (frame.frame_sha256 !== canonicalHash(withoutHash)) {
      throw new Error('ProbeProtocol: frame_sha256 does not match canonical bytes');
    }
    this._seq += 1;
    this._head = frame.frame_sha256;
    this._index += 1;
  }

  get done() {
    return this._index === PROTOCOL_ORDER.length;
  }

  get headHash() {
    return this._head;
  }
}

// ---------------------------------------------------------------------------
// Task 12 — production CLI negatives (contract "Fixed retained commands and
// production process", "Root spawn boundary", "Secrets, observability and
// recovery limits"). The only accepted argv/env are fixed; the probe validates
// FD 3-7 and 9-11 identities/access and the FD 9 lock identity before any DB
// work; FD 3 (the password-bearing URL) is never hashed or logged.
// ---------------------------------------------------------------------------

const PRODUCTION_ARGV = Object.freeze([
  '/usr/bin/node',
  '/opt/megacampus/packages/course-gen-platform/tools/qdrant/q12-activation-truth-probe.cjs',
  'inspect',
]);

const PRODUCTION_ENV_KEYS = Object.freeze(['HOME', 'LANG', 'LC_ALL', 'PATH']);

const FD_ACCESS_CONTRACT = Object.freeze({
  3: 'read',
  4: 'read',
  5: 'read',
  6: 'read',
  7: 'write',
  9: 'lock',
  10: 'read',
  11: 'read',
});

/**
 * @param {readonly string[]} argv
 */
function assertProductionArgv(argv) {
  if (
    !Array.isArray(argv) ||
    argv.length !== PRODUCTION_ARGV.length ||
    argv.some((token, index) => token !== PRODUCTION_ARGV[index])
  ) {
    throw new Error('assertProductionArgv: argv is not the exact accepted production argv');
  }
}

/**
 * @param {Record<string, string>} env
 */
function assertProductionEnv(env) {
  if (env === null || typeof env !== 'object') {
    throw new Error('assertProductionEnv: env must be an object');
  }
  if ('NODE_OPTIONS' in env) {
    throw new Error('assertProductionEnv: NODE_OPTIONS must be absent');
  }
  const keys = Object.keys(env).sort();
  if (keys.length !== PRODUCTION_ENV_KEYS.length || keys.some((k, i) => k !== PRODUCTION_ENV_KEYS[i])) {
    throw new Error('assertProductionEnv: only PATH, LC_ALL, LANG, and HOME are accepted');
  }
  if (env.LC_ALL !== 'C.UTF-8') throw new Error("assertProductionEnv: LC_ALL must be 'C.UTF-8'");
  if (env.LANG !== 'C.UTF-8') throw new Error("assertProductionEnv: LANG must be 'C.UTF-8'");
  if (typeof env.PATH !== 'string' || env.PATH.length === 0) {
    throw new Error('assertProductionEnv: PATH must be a non-empty string');
  }
  if (typeof env.HOME !== 'string' || env.HOME.length === 0) {
    throw new Error('assertProductionEnv: HOME must be a fixed non-writable path');
  }
}

/**
 * Validate the required FD 3-7 and 9-11 identities/access modes and the FD 9
 * lock identity. FD 8 is closed/reserved and must not appear.
 * @param {Record<number, {access: string, lock_identity?: string}>} fdMap
 */
function assertRequiredFds(fdMap) {
  const required = Object.keys(FD_ACCESS_CONTRACT).map(Number);
  const provided = Object.keys(fdMap).map(Number);
  for (const fd of provided) {
    if (!(fd in FD_ACCESS_CONTRACT)) {
      throw new Error(`assertRequiredFds: FD ${fd} is extra/reserved and must not be present`);
    }
  }
  for (const fd of required) {
    const entry = fdMap[fd];
    if (entry === undefined) {
      throw new Error(`assertRequiredFds: required FD ${fd} is missing`);
    }
    if (entry.access !== FD_ACCESS_CONTRACT[fd]) {
      throw new Error(`assertRequiredFds: FD ${fd} access must be '${FD_ACCESS_CONTRACT[fd]}'`);
    }
    if (fd === 9 && (typeof entry.lock_identity !== 'string' || !HEX64.test(entry.lock_identity))) {
      throw new Error('assertRequiredFds: FD 9 must carry a lock identity (64-hex)');
    }
  }
}

/**
 * Assert FD 3 is never among the hashed descriptors (the password-bearing URL
 * hash would be an offline oracle).
 * @param {readonly number[]} hashedFds
 */
function assertFd3NeverHashed(hashedFds) {
  if (Array.isArray(hashedFds) && hashedFds.includes(3)) {
    throw new Error('assertFd3NeverHashed: FD 3 (secret URL) must never be hashed or logged');
  }
}

// ---------------------------------------------------------------------------
// Task 13 — probe runtime-created FD baseline (contract "Root spawn boundary,
// FDs and capability gates" probe side). The probe validates an approved
// runtime-created FD baseline keyed by node SHA-256, Node major/minor, libuv
// version, and kernel generation, allowing only the pinned anonymous epoll/
// eventfd/pipe descriptor classes and access modes; unknown descriptors fail.
// ---------------------------------------------------------------------------

const RUNTIME_FD_ALLOWED = Object.freeze({
  epoll: ['read', 'readwrite'],
  eventfd: ['read', 'readwrite'],
  pipe: ['read', 'write', 'readwrite'],
});

/**
 * @param {{kind: string, access: string}} entry
 * @returns {boolean}
 */
function classifyRuntimeFd(entry) {
  const allowed = RUNTIME_FD_ALLOWED[entry.kind];
  return allowed !== undefined && allowed.includes(entry.access);
}

/**
 * Assert the runtime-created FD baseline: the runtime identity must equal the
 * immutable baseline (node SHA-256 + Node major/minor + libuv + kernel gen), and
 * every runtime-created descriptor must be an allowed anonymous class/access.
 * @param {{node_sha256: string, node_major: number, node_minor: number,
 *          libuv_version: string, kernel_generation: string,
 *          descriptors: Array<{kind: string, access: string}>,
 *          baseline: {node_sha256: string, node_major: number, node_minor: number,
 *                     libuv_version: string, kernel_generation: string}}} input
 */
function assertRuntimeFdBaseline(input) {
  const b = input.baseline;
  if (
    input.node_sha256 !== b.node_sha256 ||
    input.node_major !== b.node_major ||
    input.node_minor !== b.node_minor ||
    input.libuv_version !== b.libuv_version ||
    input.kernel_generation !== b.kernel_generation
  ) {
    throw new Error('assertRuntimeFdBaseline: runtime identity does not match the approved baseline');
  }
  for (const entry of input.descriptors) {
    if (!classifyRuntimeFd(entry)) {
      throw new Error(
        `assertRuntimeFdBaseline: unknown runtime-created descriptor ${entry.kind}/${entry.access}`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Task 14 — probe inspect main flow (contract "Classifications", "Race closure
// and restart authority" probe-visible parts). runProbeInspect wires Tasks
// 1-13 into the full db_locked -> host_bound -> sealed -> closed protocol: it
// validates the request, the post-connect identity, the full-catalog SHARE
// lock, builds the database/host projections, checks the evidence table, and
// drives the chained protocol against Root frames. The DB reads are supplied by
// the caller (real disposable PG17 in tests); Root frames are supplied by the
// fixture runner. No live/remote action occurs.
// ---------------------------------------------------------------------------

/**
 * @param {Record<string, unknown>} ctx
 */
function runProbeInspect(ctx) {
  const request = validateRequest(ctx.request);
  assertPostConnect(ctx.postConnect);
  verifyGrantedLocks(ctx.lockVerification);
  const dbProjection = buildDatabaseProjection(ctx.dbFields);
  validateEvidenceTable(ctx.evidence);
  const hostProjection = buildHostProjection(ctx.hostFields);
  assertRequestMatchesHostProjection(request, hostProjection);

  const request_sha256 = canonicalHash(request);
  const initialDbSha = canonicalHash(dbProjection);
  const hostSha = canonicalHash(hostProjection);
  const capabilitySha = canonicalHash(ctx.capability);
  const fd9 = ctx.fd9_identity_sha256;
  const actualR = ctx.actualR || { journal: null, checkpoint: null };

  const proto = new ProbeProtocol(FRAME_SCHEMA_VERSION, request.run_id);

  const dbLocked = proto.emit(
    'db_locked',
    buildDbLockedPayload({
      request_sha256,
      initial_database_projection_sha256: initialDbSha,
      capability_projection_sha256: capabilitySha,
      lock_projection_sha256: ctx.dbFields.lock_projection_sha256,
      fd9_identity_sha256: fd9,
    })
  );

  validateHostProjectionPayload(ctx.rootPayloads.hostProjection);
  const rootHost = makeFrame({
    schema_version: FRAME_SCHEMA_VERSION,
    sequence: 2,
    kind: 'host_projection',
    run_id: request.run_id,
    payload: ctx.rootPayloads.hostProjection,
    previous_frame_sha256: dbLocked.frame_sha256,
  });
  proto.receive(rootHost);

  const hostBound = proto.emit(
    'host_bound',
    buildHostBoundPayload({
      request_sha256,
      initial_database_projection_sha256: initialDbSha,
      bound_database_projection_sha256: ctx.boundDbSha || initialDbSha,
      host_projection_sha256: hostSha,
      session_observation_sha256: ctx.sessionObservationSha,
      fd9_identity_sha256: fd9,
    })
  );

  validatePredecisionPayload(ctx.rootPayloads.predecision);
  const predecisionFrame = makeFrame({
    schema_version: FRAME_SCHEMA_VERSION,
    sequence: 4,
    kind: 'predecision',
    run_id: request.run_id,
    payload: ctx.rootPayloads.predecision,
    previous_frame_sha256: hostBound.frame_sha256,
  });
  proto.receive(predecisionFrame);
  const predecision_sha256 = ctx.rootPayloads.predecision.predecision_sha256;

  const sealed = proto.emit(
    'sealed',
    buildSealedPayload({
      request_sha256,
      predecision_sha256,
      initial_database_projection_sha256: initialDbSha,
      final_database_projection_sha256: initialDbSha,
      host_projection_sha256: hostSha,
      actual_r_journal_entry_hash: actualR.journal,
      actual_r_checkpoint_sha256: actualR.checkpoint,
      fd9_identity_sha256: fd9,
    })
  );

  validateReleasePayload(ctx.rootPayloads.release);
  const releaseFrame = makeFrame({
    schema_version: FRAME_SCHEMA_VERSION,
    sequence: 6,
    kind: 'release',
    run_id: request.run_id,
    payload: ctx.rootPayloads.release,
    previous_frame_sha256: sealed.frame_sha256,
  });
  proto.receive(releaseFrame);

  const closed = proto.emit(
    'closed',
    buildClosedPayload({
      request_sha256,
      predecision_sha256,
      sealed_frame_sha256: sealed.frame_sha256,
      release_frame_sha256: releaseFrame.frame_sha256,
      actual_r_journal_entry_hash: actualR.journal,
      actual_r_checkpoint_sha256: actualR.checkpoint,
      fd9_identity_sha256: fd9,
    })
  );

  if (!proto.done) {
    throw new Error('runProbeInspect: protocol did not complete');
  }
  return {
    frames: [dbLocked, rootHost, hostBound, predecisionFrame, sealed, releaseFrame, closed],
    classification: ctx.rootPayloads.predecision.classification,
    activated: ctx.activated === true,
    dbProjection,
    hostProjection,
  };
}

module.exports = {
  canonicalize,
  sha256Hex,
  canonicalHash,
  parseCanonicalJson,
  makeFrame,
  FrameChain,
  HEX64,
  PROJECTION_TEMPLATE_NAMES,
  PROJECTION_FORBIDDEN,
  splitProjectionTemplates,
  stripSqlLiterals,
  assertProjectionAllowlist,
  PRODUCTION_ENDPOINT,
  PROD_CA_SHA256,
  parseProductionUrl,
  buildTlsConfig,
  assertPostConnect,
  assertBackendContinuity,
  CAPABILITY_SCHEMA_VERSION,
  VISIBILITY_PG_READ_ALL_STATS_DEFINITION_HASH,
  normalizeLockRow,
  assertLockRowsAuthorized,
  resolveActivityVisibility,
  assertClearSnapshotExecuted,
  buildCapabilityObject,
  assertTemplateAllowed,
  verifyGrantedLocks,
  assertActivationDigestsBound,
  assertCommonLockConflict,
  INVENTORY_SCHEMA_VERSION,
  MANAGED_PROJECT_REF,
  MANAGED_DATABASE,
  MANAGED_SOURCE_DECISION_SHA256,
  PROBE_APP_IDENTITY,
  INVENTORY_TOP_KEYS,
  IDENTITY_KEYS,
  OBSERVED_ROW_KEYS,
  consumeManagedInventory,
  projectObservedRow,
  buildSessionObservation,
  DB_PROJECTION_KEYS,
  HOST_PROJECTION_KEYS,
  buildDatabaseProjection,
  buildHostProjection,
  assertProjectionPreamble,
  EVIDENCE_STATES_BY_CLASSIFICATION,
  validateEvidenceTable,
  assertCommittedReceiptPendingLegal,
  bindPreparedQuiescedPredecessor,
  projectDockerObservation,
  FRAME_SCHEMA_VERSION,
  REQUEST_KEYS,
  EVIDENCE_STATE_TO_CLASSIFICATION,
  validateRequest,
  assertRequestMatchesHostProjection,
  buildDbLockedPayload,
  buildHostBoundPayload,
  buildSealedPayload,
  buildClosedPayload,
  validateHostProjectionPayload,
  validatePredecisionPayload,
  validateReleasePayload,
  ProbeProtocol,
  PRODUCTION_ARGV,
  PRODUCTION_ENV_KEYS,
  FD_ACCESS_CONTRACT,
  assertProductionArgv,
  assertProductionEnv,
  assertRequiredFds,
  assertFd3NeverHashed,
  RUNTIME_FD_ALLOWED,
  classifyRuntimeFd,
  assertRuntimeFdBaseline,
  runProbeInspect,
};

// ---------------------------------------------------------------------------
// CLI entrypoint (driven only under `require.main === module`). The full
// `inspect` main flow is assembled in Task 14.
// ---------------------------------------------------------------------------
if (require.main === module) {
  process.stderr.write('q12-activation-truth-probe: inspect flow not yet assembled\n');
  process.exit(2);
}
