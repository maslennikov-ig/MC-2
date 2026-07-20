import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// Q12 defect-7 in-round bounded plumbing fix: deploy/postgres/q12-source-
// manifest.ts's validateTransition() sorted the CUTOVER projections of
// database.settings, schemas, and relations (via sortedArray()) before
// comparing them to their BASELINE counterparts, but never sorted the
// baseline side the same way -- baseline kept catalogSql()'s natural SQL
// capture order. Since the final acceptance (the byte-strict
// canonical(baseline) !== canonical(cutover) check) compares full arrays,
// not sets, a content-identical relation/schema set that merely differs in
// SEQUENCE between baseline and cutover spuriously failed. This mirrors the
// tool's own already-symmetric cron_jobs idiom (baselineJobs/cutoverJobs,
// both sortedArray()'d) at the three sites that were missing it.
//
// These fixtures are NOT captured from a live PostgreSQL source (unlike
// q12-source-manifest-guard-surface-*.json); they reuse that fixture's real,
// barrier-derived q12_guard scaffold verbatim (so the q12_guard-specific
// checks still pass unmodified) and add a minimal, synthetic pair of
// non-guard `public` relations/schemas -- deliberately listed in
// NON-canonical order on the baseline side and in canonical order on the
// cutover side -- to exercise exactly the sequence-only divergence the fix
// addresses, without requiring docker or a live database.
const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const TOOL = resolve(REPO_ROOT, 'deploy/postgres/q12-source-manifest.ts');
const TOOL_SOURCE = readFileSync(TOOL, 'utf8');
const TSX = resolve(REPO_ROOT, 'packages/course-gen-platform/node_modules/.bin/tsx');
const POSITIVE = resolve(
  __dirname,
  'fixtures/q12-source-manifest-baseline-order-symmetry-positive.json'
);
const CONTENT_NEGATIVE = resolve(
  __dirname,
  'fixtures/q12-source-manifest-baseline-order-symmetry-content-negative.json'
);

function runVerifyTransition(manifestPath: string): {
  status: number | null;
  stderr: string;
  stdout: string;
} {
  const result = spawnSync(TSX, [TOOL, 'verify-transition', '--manifest', manifestPath], {
    encoding: 'utf8',
    cwd: REPO_ROOT,
  });
  return { status: result.status, stderr: result.stderr, stdout: result.stdout };
}

describe('Q12 source-manifest validateTransition: baseline-vs-cutover order symmetry (no docker)', () => {
  it('passes when baseline.relations/baseline.schemas differ from cutover only in SEQUENCE, not content', () => {
    const result = runVerifyTransition(POSITIVE);
    expect(result.stderr, result.stderr).toBe('');
    expect(result.stdout).toContain('baseline-to-cutover transition equality passed');
    expect(result.status).toBe(0);
  });

  it('still fails closed when a genuine relation/schema CONTENT change rides along with the same order shuffle', () => {
    const result = runVerifyTransition(CONTENT_NEGATIVE);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('unexpected baseline-to-cutover delta');
  });

  // database.settings has the same sortedArray(baseline...)/reassign shape as
  // relations/schemas for defensive consistency with the cron_jobs idiom, but
  // it is NOT independently reproducible as a pass/fail fixture: immediately
  // after the sort, validateTransition unconditionally overwrites
  // `cutoverDatabase.settings = structuredClone(baselineDatabase.settings)`,
  // so cutover's settings array is always a literal clone of baseline's --
  // by construction the two can never diverge in order at the final
  // comparison, regardless of whether baseline was sorted first. This is
  // asserted STRUCTURALLY instead (the code path itself), per the fix's own
  // documented fallback for a site with no constructible functional case.
  it('sorts the baseline database.settings counterpart before the cutover clone, structurally', () => {
    const settingsSortIndex = TOOL_SOURCE.indexOf(
      "baselineDatabase.settings = sortedArray(baselineDatabase.settings, 'baseline.database.settings');"
    );
    const cloneIndex = TOOL_SOURCE.indexOf(
      'cutoverDatabase.settings = structuredClone(baselineDatabase.settings);'
    );
    expect(settingsSortIndex).toBeGreaterThan(-1);
    expect(cloneIndex).toBeGreaterThan(-1);
    // The baseline sort must run BEFORE the cutover clone reads from it, or
    // the clone would carry forward the pre-sort (unsorted) order instead.
    expect(settingsSortIndex).toBeLessThan(cloneIndex);
  });

  it('sorts the baseline schemas and relations counterparts the same canonical way as their cutover projections', () => {
    expect(TOOL_SOURCE).toContain(
      "baseline.schemas = sortedArray(baseline.schemas, 'baseline.schemas');"
    );
    expect(TOOL_SOURCE).toContain(
      "baseline.relations = sortedArray(baseline.relations, 'baseline.relations');"
    );
  });
});
