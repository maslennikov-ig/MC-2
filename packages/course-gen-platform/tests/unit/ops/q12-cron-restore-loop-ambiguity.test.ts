import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// Found-defect #13 (R8-B-2-ii defrost) RED/GREEN isolation repro on real
// PostgreSQL 17.10.
//
// The frozen q12-database-barrier.sh write_restore_sql loop (shared by activate +
// rollback) restores each captured cron job with an `UPDATE cron.job ...` inside a
// plpgsql `FOR job IN ...` loop. With the UPDATE target table UNALIASED, PostgreSQL's
// default plpgsql.variable_conflict=error cannot decide whether `job` in
// `(job->>'active')` / `(job->>'jobid')` is the loop variable or the implicit
// whole-row alias of the `cron.job` target -- it raises
// `column reference "job" is ambiguous`, aborting real activate/rollback in the
// restore loop. Aliasing the target (`cron.job AS restore_target`) removes the
// implicit `job` table alias so `job` unambiguously resolves to the loop variable.
//
// This gated test drives fixtures/q12-cron-restore-loop-ambiguity-runner.py, which
// stands up a disposable postgres:17.10 container with a bare cron.job table and runs
// BOTH restore-loop SQL forms:
//   * OLD (unaliased) -> raises `column reference "job" is ambiguous` (the RED); and
//   * NEW (aliased)   -> succeeds and flips active to the captured value (the GREEN).
// It also asserts the live barrier bytes carry the NEW aliased statement and not the
// OLD unaliased form, so the repro is bound to the real fix (fails if reverted).
const REAL_PG17 = process.env.MC2_Q12_REAL_PG17 === '1';
const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const RUNNER = resolve(
  repoRoot,
  'packages/course-gen-platform/tests/unit/ops/fixtures/q12-cron-restore-loop-ambiguity-runner.py'
);

describe.runIf(REAL_PG17)(
  'Q12 found-defect #13: cron.job restore-loop variable/column ambiguity (real PostgreSQL 17.10)',
  () => {
    it('OLD unaliased UPDATE cron.job is ambiguous; NEW aliased restore_target form is clean', () => {
      const result = spawnSync('/usr/bin/python3', [RUNNER], {
        encoding: 'utf8',
        timeout: 180_000,
        env: {
          PATH: process.env.PATH,
          LC_ALL: 'C',
          LANG: 'C',
          MC2_Q12_PLAN_DOCKER: '/usr/bin/docker',
        },
        maxBuffer: 8 * 1024 * 1024,
      });
      expect(result.status, result.stderr).toBe(0);
      const out = JSON.parse(result.stdout) as {
        setup_rc: number;
        setup_stderr: string;
        fix_present_in_barrier: boolean;
        old_form_absent_from_barrier: boolean;
        old_rc: number;
        old_stderr: string;
        new_rc: number;
        new_stderr: string;
        active_after_new: string;
      };

      // The live barrier carries the ratified aliased form (and not the old one).
      expect(out.fix_present_in_barrier).toBe(true);
      expect(out.old_form_absent_from_barrier).toBe(true);

      expect(out.setup_rc, out.setup_stderr).toBe(0);

      // RED: the old unaliased form fails with the real ambiguity error.
      expect(out.old_rc).not.toBe(0);
      expect(out.old_stderr).toMatch(/column reference "job" is ambiguous/u);
      expect(out.old_stderr).toMatch(/PL\/pgSQL variable or a table column/u);

      // GREEN: the aliased form runs clean and restores the captured active value.
      expect(out.new_rc, out.new_stderr).toBe(0);
      expect(out.new_stderr).toBe('');
      expect(out.active_after_new).toBe('t');
    }, 200_000);
  }
);
