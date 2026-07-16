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
};

// ---------------------------------------------------------------------------
// CLI entrypoint (driven only under `require.main === module`). The full
// `inspect` main flow is assembled in Task 14.
// ---------------------------------------------------------------------------
if (require.main === module) {
  process.stderr.write('q12-activation-truth-probe: inspect flow not yet assembled\n');
  process.exit(2);
}
