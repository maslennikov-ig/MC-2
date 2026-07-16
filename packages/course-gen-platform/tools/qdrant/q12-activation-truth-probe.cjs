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

module.exports = {
  canonicalize,
  sha256Hex,
  canonicalHash,
  parseCanonicalJson,
  makeFrame,
  FrameChain,
  HEX64,
};

// ---------------------------------------------------------------------------
// CLI entrypoint (driven only under `require.main === module`). The full
// `inspect` main flow is assembled in Task 14.
// ---------------------------------------------------------------------------
if (require.main === module) {
  process.stderr.write('q12-activation-truth-probe: inspect flow not yet assembled\n');
  process.exit(2);
}
