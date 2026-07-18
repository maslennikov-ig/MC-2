import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// Q12 source-manifest guard-surface reconciliation: proves, WITHOUT docker/a
// live PostgreSQL connection, that deploy/postgres/q12-source-manifest.ts's
// q12_guard allowlist (GUARD_FUNCTIONS/GUARD_TRIGGERS/approvedGuardIdentity/
// filterApprovedGuardCatalog/validateExactGuardDelta) exactly matches the
// REAL surface deploy/qdrant/q12-database-barrier.sh installs, and stays
// fail-closed against an unapproved extra object.
//
// The two fixture manifests below are not fabricated: their q12_guard-schema
// fragment (4 tables, 10 functions, 8 triggers, 4 indexes, 11 constraints,
// the full object_owners/object_acls sets) was captured via
// `verify-transition`'s own CLI contract against a disposable PostgreSQL
// 17.10 container where deploy/qdrant/q12-database-barrier.sh's own
// `CREATE SCHEMA q12_guard ... REVOKE ...` install program (lines 921-1509)
// was replayed byte-for-byte (bash-side `\$`/`\'` unescaped, and
// deploy/qdrant/q12-structural-catalog.sql substituted verbatim for the
// barrier's own `$STRUCTURAL_CATALOG_SQL` interpolation), then queried with
// deploy/postgres/q12-source-manifest.ts's OWN catalogSql() formulas scoped
// to `nspname='q12_guard'`. The non-guard scaffolding around it (cron_jobs,
// database.settings, empty schemas/relations on both sides) is synthetic but
// requires no reconciliation since neither baseline nor cutover carries any
// non-guard delta.
const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const TOOL = resolve(REPO_ROOT, 'deploy/postgres/q12-source-manifest.ts');
const TSX = resolve(REPO_ROOT, 'packages/course-gen-platform/node_modules/.bin/tsx');
const POSITIVE = resolve(__dirname, 'fixtures/q12-source-manifest-guard-surface-positive.json');
const NEGATIVE = resolve(__dirname, 'fixtures/q12-source-manifest-guard-surface-negative.json');

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

describe('Q12 source-manifest guard-surface reconciliation (no docker)', () => {
  it('accepts the REAL, complete, exact barrier-installed q12_guard surface', () => {
    const result = runVerifyTransition(POSITIVE);
    expect(result.stderr, result.stderr).toBe('');
    expect(result.stdout).toContain('baseline-to-cutover transition equality passed');
    expect(result.status).toBe(0);
  });

  it('still fails closed on a fabricated 11th q12_guard function (exact-set is not loosened)', () => {
    const result = runVerifyTransition(NEGATIVE);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('unexpected baseline-to-cutover delta: q12_guard function set');
  });
});
