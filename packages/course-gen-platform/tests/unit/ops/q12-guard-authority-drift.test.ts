/**
 * The q12_guard authority, checked against the barrier that actually installs it
 * (mc2-qd12b).
 *
 * The failure this closes is not a wrong constant — it is a wrong constant
 * nobody could see. `supabase-restore-drill.test.ts` carries a positive fixture
 * that hand-duplicated `GUARD_FUNCTIONS`, and that case is `RUN_REAL_CONTROLLER`
 * gated: the gate turns itself on at uid 1000 and off on GitHub runners, so the
 * case never ran in CI. The fixture fell behind by five functions, six immutable
 * triggers and three ACL reconciliations at once, and each layer hid the next,
 * because `assertExactSet` stops at the first mismatch.
 *
 * Two things follow, and this file is the second of them:
 *   (a) the drill's fixture is now derived from these constants instead of
 *       retyping them, so it cannot drift from the manifest;
 *   (b) the constants themselves are compared here to
 *       `deploy/qdrant/q12-database-barrier.sh` — the bytes that really run the
 *       CREATE statements.
 *
 * This test is deliberately ungated: no docker, no Python, no uid 1000, no
 * database. It reads two files in the repository. A guard that runs only where
 * the defect cannot be introduced is not a guard.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  GUARD_CONSTRAINTS,
  GUARD_FUNCTIONS,
  GUARD_TABLES,
  GUARD_TRIGGERS,
} from '../../../../../deploy/postgres/q12-source-manifest.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const BARRIER = readFileSync(join(REPO_ROOT, 'deploy/qdrant/q12-database-barrier.sh'), 'utf8');

/** `CREATE FUNCTION q12_guard.<name>` — the bare names the barrier installs. */
function barrierFunctionNames(): string[] {
  return [
    ...new Set(
      Array.from(
        BARRIER.matchAll(/^CREATE (?:OR REPLACE )?FUNCTION q12_guard\.([a-z0-9_]+)/gm),
        match => match[1]
      )
    ),
  ].sort();
}

/** `CREATE TABLE q12_guard.<name>` — the guard-owned tables. */
function barrierTableNames(): string[] {
  return [
    ...new Set(
      Array.from(
        BARRIER.matchAll(/^CREATE TABLE(?: IF NOT EXISTS)? q12_guard\.([a-z0-9_]+)/gm),
        match => match[1]
      )
    ),
  ].sort();
}

/**
 * Triggers created INSIDE q12_guard, identified as `table.trigger`.
 *
 * Only the literal statements: the barrier also creates `q12_guard_row` /
 * `q12_guard_truncate` on the guarded relations OUTSIDE this schema, and those
 * go through `EXECUTE format(...)` in a loop, which is why they are matched at
 * line start and the dynamic ones are not.
 */
function barrierGuardSchemaTriggers(): string[] {
  return [
    ...new Set(
      Array.from(
        BARRIER.matchAll(/^CREATE TRIGGER ([a-z0-9_]+)[^\n]*? ON q12_guard\.([a-z0-9_]+)/gm),
        match => `${match[2]}.${match[1]}`
      )
    ),
  ].sort();
}

const functionName = (identity: string): string => identity.slice(0, identity.indexOf('('));

describe('q12_guard authority matches the barrier that installs it', () => {
  it('carries exactly the functions the barrier creates', () => {
    // The exact drift of 2026-07: the barrier had ten, this set had five, and
    // the only test that compared them was gated off on every CI runner.
    expect([...GUARD_FUNCTIONS].map(functionName).sort()).toEqual(barrierFunctionNames());
  });

  it('carries exactly the tables the barrier creates', () => {
    expect([...GUARD_TABLES].sort()).toEqual(barrierTableNames());
  });

  it('carries exactly the triggers the barrier creates inside q12_guard', () => {
    expect([...GUARD_TRIGGERS].sort()).toEqual(barrierGuardSchemaTriggers());
  });

  it('gives every guard table an append-only or a live-write trigger pair, never one of each', () => {
    // A table with a row trigger and no truncate trigger is a table that can be
    // emptied past the barrier. Stated as a shape so a new guard table cannot be
    // added half-protected.
    for (const table of GUARD_TABLES) {
      const triggers = [...GUARD_TRIGGERS]
        .filter(identity => identity.startsWith(`${table}.`))
        .map(identity => identity.slice(table.length + 1))
        .sort();

      expect(
        triggers,
        `q12_guard.${table} must carry a complete trigger pair, has: ${triggers.join(', ') || 'none'}`
      ).toEqual(
        triggers.includes('q12_guard_immutable')
          ? ['q12_guard_immutable', 'q12_guard_immutable_truncate']
          : ['q12_guard_row', 'q12_guard_truncate']
      );
    }
  });

  it('names every constraint against a table that exists', () => {
    for (const identity of GUARD_CONSTRAINTS) {
      const table = identity.slice(0, identity.indexOf('.'));
      expect(GUARD_TABLES.has(table), `${identity} names an unknown guard table`).toBe(true);
    }
  });

  it('gives every guard table a primary key constraint', () => {
    for (const table of GUARD_TABLES) {
      expect(GUARD_CONSTRAINTS.has(`${table}.${table}_pkey`), `${table} has no pkey entry`).toBe(
        true
      );
    }
  });
});
