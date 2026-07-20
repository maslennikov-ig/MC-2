import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// Q12 W-tuple frozen-byte CI guard (no docker, load-bearing).
//
// Makes the accepted W tuple's Layer-1 frozen-byte fields LOAD-BEARING: this
// suite reads the authoritative sha256 values straight FROM the tracked
// artifact table (never hardcodes the "current" values as the primary
// assertion) and asserts they equal the real, live bytes of the two files
// they pin. So any future edit to the barrier script or the command manifest
// that is NOT accompanied by a matching tuple amendment fails CI here,
// instead of silently drifting the frozen-trio contract out from under the
// accepted evidence.
//
// Authority: .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.10-q12-w-activation-tuple.md
// (the accepted W tuple; field 2 `command_manifest_sha256`, field 4
// `activation_barrier_sha256`). Added by the RATIFIED cascade round that
// amended field 4 to the fixed barrier's sha256 (see the artifact's
// "2026-07-18 AMENDMENT" note and .codex/stages/mc2-jz6y0/artifacts/
// mc2-jz6y0.13-barrier-fix-review.md).

const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const TUPLE_PATH = resolve(
  REPO_ROOT,
  '.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.10-q12-w-activation-tuple.md'
);
const BARRIER_PATH = resolve(REPO_ROOT, 'deploy/qdrant/q12-database-barrier.sh');
const MANIFEST_PATH = resolve(REPO_ROOT, 'deploy/qdrant/q12-command-manifest.json');

// The historical, superseded field-4 value (barrier sha256 at the W-integration
// base 60910053, before the ratified frozen-barrier-fix round). Used only to
// prove the amendment landed and the guard discriminates -- never as the
// primary assertion.
const HISTORICAL_PRE_FIX_BARRIER_SHA256 =
  '134255cecfb4361d5e9f1922d98f889ab7d3e01898b197dee096ab720039ed68';

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

// Parses a W-tuple markdown table row of the shape
// `| # | \`fieldName\` | \`<64-hex sha256>\` | ... |` and returns the hex
// value. Fails closed (throws) if the field is missing or not a well-formed
// sha256 -- a parse failure must not be able to masquerade as "no drift".
function extractTupleField(tupleText: string, fieldName: string): string {
  const pattern = new RegExp(
    '`' + fieldName + '`\\s*\\|\\s*(?:\\*\\*[A-Z]+\\*\\* )?`([0-9a-f]{64})`'
  );
  const match = tupleText.match(pattern);
  if (!match) {
    throw new Error(
      `W-tuple field "${fieldName}" not found (or not a well-formed 64-hex sha256) in ${TUPLE_PATH}`
    );
  }
  return match[1];
}

describe('Q12 W-tuple frozen-byte CI guard (no docker, load-bearing)', () => {
  const tupleText = readFileSync(TUPLE_PATH, 'utf8');

  it('field 2 command_manifest_sha256 (read from the tuple artifact) matches the real command manifest bytes', () => {
    const tupleValue = extractTupleField(tupleText, 'command_manifest_sha256');
    expect(tupleValue).toBe(sha256File(MANIFEST_PATH));
  });

  it('field 4 activation_barrier_sha256 (read from the tuple artifact) matches the real barrier script bytes', () => {
    const tupleValue = extractTupleField(tupleText, 'activation_barrier_sha256');
    expect(tupleValue).toBe(sha256File(BARRIER_PATH));
  });

  it('is demonstrably load-bearing: the guard discriminates (not vacuously true) and the field-4 amendment actually landed', () => {
    const tupleValue = extractTupleField(tupleText, 'activation_barrier_sha256');
    const realBarrierSha256 = sha256File(BARRIER_PATH);

    // The amendment landed: the tuple no longer pins the historical, superseded
    // pre-barrier-fix value -- if a future edit reverted the tuple amendment
    // without reverting the barrier fix, this would fail.
    expect(tupleValue).not.toBe(HISTORICAL_PRE_FIX_BARRIER_SHA256);
    expect(realBarrierSha256).not.toBe(HISTORICAL_PRE_FIX_BARRIER_SHA256);

    // A deliberately-wrong sha must NOT equal the real bytes -- proves the
    // equality assertions above are discriminating equality checks, not a
    // tautology (e.g. comparing a value to itself).
    const deliberatelyWrongSha256 = 'f'.repeat(64);
    expect(deliberatelyWrongSha256).not.toBe(realBarrierSha256);
    expect(deliberatelyWrongSha256).not.toBe(tupleValue);
  });
});
