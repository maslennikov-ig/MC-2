import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

// R2: the Task-9 baseline.json producer (LivePlanExecutor.produce_run_root_baseline) and the
// fixture-only client-override lockdown it depends on in q12-source-manifest.ts. Design
// docs/superpowers/specs/2026-07-17-q12-live-controller-design.md §6a. The full
// validateTransition POSITIVE (baseline + real barrier.install cutover) is R4's pinned
// acceptance; R2 proves the producer captures/writes correctly, the three validateTransition
// negatives bite with distinct named errors, and the client-override seam is fail-closed.

const REAL_PG17 = process.env.MC2_Q12_REAL_PG17 === '1';
const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const TSX = resolve(repoRoot, 'packages/course-gen-platform/node_modules/.bin/tsx');
const TOOL = resolve(repoRoot, 'deploy/postgres/q12-source-manifest.ts');
const RUNNER = resolve(
  repoRoot,
  'packages/course-gen-platform/tests/unit/ops/fixtures/q12-live-baseline-producer-runner.py'
);
const VALID_SNAPSHOT = '00000000-00000000-1';
const PROD_OUTPUT = '/opt/megacampus/backups/q12/00000000-0000-4000-8000-000000000000/m.json';

const dirs: string[] = [];
afterEach(() => {
  for (const value of dirs.splice(0)) rmSync(value, { recursive: true, force: true });
});
function fixtureDir(): string {
  const value = mkdtempSync('/tmp/mc2-q12-plan-baseline-');
  dirs.push(value);
  return value;
}

function runTool(output: string, env: Record<string, string | undefined>) {
  return spawnSync(TSX, [TOOL, 'capture', '--snapshot', VALID_SNAPSHOT, '--output', output], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { PATH: process.env.PATH, LC_ALL: 'C', LANG: 'C', ...env },
  });
}

describe('Q12 baseline producer — client-override seam lockdown (R2)', () => {
  it('honors MC2_Q12_MANIFEST_PSQL only for a fixture-namespace output path (override IS used)', () => {
    const dir = fixtureDir();
    const sentinel = join(dir, 'override-invoked');
    const wrapper = join(dir, 'psql-override.sh');
    writeFileSync(wrapper, `#!/bin/sh\ntouch ${sentinel}\nexit 3\n`, { mode: 0o755 });
    const result = runTool(join(dir, 'm.json'), { MC2_Q12_MANIFEST_PSQL: wrapper });
    // The override binary was actually invoked for the fixture output path.
    expect(existsSync(sentinel)).toBe(true);
    expect(result.stderr).not.toMatch(/fixture-only client override/u);
  });

  it('HARD-FAILS (never silently falls back) when the override is set against a production path', () => {
    const dir = fixtureDir();
    const sentinel = join(dir, 'override-invoked');
    const wrapper = join(dir, 'psql-override.sh');
    writeFileSync(wrapper, `#!/bin/sh\ntouch ${sentinel}\nexit 3\n`, { mode: 0o755 });
    const result = runTool(PROD_OUTPUT, { MC2_Q12_MANIFEST_PSQL: wrapper });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(
      /MC2_Q12_MANIFEST_PSQL is a fixture-only client override and is refused outside the \/tmp\/mc2-q12- output namespace/u
    );
    // Fail-closed: the override binary is NEVER invoked for a production path.
    expect(existsSync(sentinel)).toBe(false);
  });

  it('uses the hardcoded client for a production path with no override set', () => {
    const result = runTool(PROD_OUTPUT, { MC2_Q12_MANIFEST_PSQL: undefined });
    expect(result.status).not.toBe(0);
    // The hardcoded /usr/lib/postgresql/17/bin/psql is attempted (query failure), NOT the
    // fixture-override refusal.
    expect(result.stderr).toMatch(/PostgreSQL 17 manifest query failed/u);
    expect(result.stderr).not.toMatch(/fixture-only client override/u);
  });
});

describe.runIf(REAL_PG17)('Q12 baseline producer against disposable PostgreSQL 17.10 (R2)', () => {
  it('captures a 0400 pre-maintenance baseline and the three validateTransition negatives bite', () => {
    const result = spawnSync('/usr/bin/python3', [RUNNER], {
      encoding: 'utf8',
      timeout: 240_000,
      env: {
        PATH: process.env.PATH,
        LC_ALL: 'C',
        LANG: 'C',
        MC2_Q12_PLAN_DOCKER: '/usr/bin/docker',
      },
      maxBuffer: 16 * 1024 * 1024,
    });
    expect(result.status, result.stderr).toBe(0);
    const out = JSON.parse(result.stdout) as {
      baseline_mode: string;
      baseline_cron_active: number;
      baseline_cron_count: number;
      intermediate_removed: boolean;
      neg1a: { rc: number; msg: string };
      neg1b: { rc: number; msg: string };
      neg2: { rc: number; msg: string };
    };
    // Positive-lite: the producer captured the pre-maintenance source (cron active) and
    // published baseline.json owner-only 0400, cleaning up the intermediate manifest.
    expect(out.baseline_mode).toBe('0o400');
    expect(out.baseline_cron_count).toBe(8);
    expect(out.baseline_cron_active).toBe(8);
    expect(out.intermediate_removed).toBe(true);
    // The gate bites, each with a DISTINCT named validateTransition error.
    expect(out.neg1a.rc).not.toBe(0);
    expect(out.neg1a.msg).toMatch(/unexpected baseline-to-cutover delta: q12_guard schema/u);
    expect(out.neg1b.rc).not.toBe(0);
    expect(out.neg1b.msg).toMatch(/unexpected baseline-to-cutover delta: cron cardinality/u);
    expect(out.neg2.rc).not.toBe(0);
    expect(out.neg2.msg).toMatch(/baseline\.cron_jobs must be an array/u);
  }, 260_000);
});
