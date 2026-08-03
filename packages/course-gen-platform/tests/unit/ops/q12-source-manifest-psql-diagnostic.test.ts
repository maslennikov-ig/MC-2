import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// mc2-0tcyw: on 2026-08-03 the nightly Supabase backup failed in the manifest phase and told the
// operator exactly this and nothing more:
//
//   source manifest failed: PostgreSQL 17 manifest query failed with status 1
//
// No relation, no SQL state, no reason. psql had said why, into a stderr the tool captured and
// then dropped on the failure path. An identical re-run passed, so the cause was transient — and
// with that message it was impossible to tell WHICH transient, or to tell one from a real defect.
//
// This drives the real tool at a port nothing listens on, so psql genuinely fails, and proves its
// own words survive into the message the operator reads.
const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const TOOL = resolve(REPO_ROOT, 'deploy/postgres/q12-source-manifest.ts');
const TSX = resolve(REPO_ROOT, 'packages/course-gen-platform/node_modules/.bin/tsx');
// The hardcoded interpreter the tool itself uses; without it there is nothing to test.
const PSQL = '/usr/lib/postgresql/17/bin/psql';

function captureAgainstUnreachableSource(): { status: number | null; stderr: string } {
  const result = spawnSync(TSX, [TOOL, 'capture-target', '--output', join('/tmp', 'unused.json')], {
    encoding: 'utf8',
    cwd: REPO_ROOT,
    env: {
      PATH: process.env.PATH,
      // A socket directory that does not exist fails in libpq before any network call, so this
      // stays deterministic and offline. An unbound TCP port is not equivalent: under WSL it
      // hangs instead of being refused.
      PGHOST: '/tmp/mc2-source-manifest-no-such-socket-dir',
      PGUSER: 'mc2_unreachable_probe',
    },
  });
  return { status: result.status, stderr: result.stderr };
}

// The behavioural test below needs the exact interpreter the tool hardcodes, and GitHub's runners
// carry PostgreSQL 16, so there it skips — like every other pg17 suite here. This source guard
// runs everywhere, so CI is not blind to a revert of the one line that matters.
describe('Supabase source manifest psql failure diagnostic (source guard)', () => {
  it('appends the captured stderr to the failure, not just the exit status', () => {
    const tool = readFileSync(TOOL, 'utf8');

    expect(tool).toContain('psqlDiagnostic(result.stderr)');
    // Anchored on the interpolation, which only the failure site has — the same words also appear
    // in the comment above it explaining why this guard exists.
    const site = tool.slice(
      tool.indexOf('PostgreSQL 17 manifest query failed with status ${result.status')
    );
    expect(site.slice(0, 200)).toContain('psqlDiagnostic');
  });
});

describe.skipIf(!existsSync(PSQL))('Supabase source manifest psql failure diagnostic', () => {
  it("carries psql's own reason into the failure the operator reads", () => {
    const result = captureAgainstUnreachableSource();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('PostgreSQL 17 manifest query failed with status');
    // The regression: everything after the status used to be discarded.
    expect(result.stderr).toContain('connection to server');
    expect(result.stderr).toContain('mc2-source-manifest-no-such-socket-dir');
  });

  it('keeps the diagnostic on the one line the log tail actually shows', () => {
    const result = captureAgainstUnreachableSource();

    const [line] = result.stderr
      .split('\n')
      .filter(entry => entry.includes('PostgreSQL 17 manifest query failed'));
    expect(line).toBeDefined();
    // The shell surfaces only the last ten lines of this stderr; a multi-line psql error pasted in
    // verbatim would push the failure itself out of that window.
    expect(line).toContain('connection to server');
    expect(line.length).toBeLessThanOrEqual(700);
  });
});
