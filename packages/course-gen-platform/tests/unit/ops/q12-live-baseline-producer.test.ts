import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// R2: the Task-9 baseline.json producer (LivePlanExecutor.produce_run_root_baseline). Design
// docs/superpowers/specs/2026-07-17-q12-live-controller-design.md §6a. The producer reuses the
// held-snapshot coordinator + q12-source-manifest.ts capture (its own projection, which
// validateTransition later diffs the backup-time cutover against) through the real hardcoded
// host PostgreSQL 17 client over libpq — the tool is byte-untouched. The full validateTransition
// POSITIVE (baseline + real barrier.install cutover) is R4's pinned acceptance; R2 proves the
// producer captures/writes 0400 correctly and the three validateTransition negatives bite with
// distinct named errors.

const REAL_PG17 = process.env.MC2_Q12_REAL_PG17 === '1';
const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const RUNNER = resolve(
  repoRoot,
  'packages/course-gen-platform/tests/unit/ops/fixtures/q12-live-baseline-producer-runner.py'
);

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
    // Positive-lite: the producer captured the pre-maintenance source (cron active) through the
    // real host client and published baseline.json owner-only 0400, removing the intermediate.
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
