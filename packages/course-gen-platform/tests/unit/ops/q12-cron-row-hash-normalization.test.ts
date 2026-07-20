import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// Defect-4 fold-in (source-manifest round): a scoped `active`-column normalization
// in deploy/postgres/q12-source-manifest.ts's relationHash() so that
// barrier.install's SANCTIONED cron.job.active true->false maintenance delta no
// longer diverges cron.job's RELATIONS-section row_sha256 between baseline and
// cutover. validateTransition already normalizes this exact delta at the
// top-level `cron_jobs` SUMMARY (its exactField set is
// {jobid,username,command_sha256} -- no `active`); this fold-in makes the
// separate RELATIONS-section row hash coherent with that same normalization by
// excluding ONLY the `active` column, ONLY for the pg_cron authoritative
// relation cron.job.
//
// This is a FOCUSED fixture (see the runner's own header), not the full R4
// Sub-round C barrier harness: it drives the REAL, unmodified
// `q12-source-manifest.ts capture` command (real PostgreSQL 17.10, real
// extensions.digest) against a disposable source with a real cron.job table,
// with no q12_guard barrier installed at all, so it needs no capability/
// write-barrier workaround and has no dependency on the SEPARATE, out-of-scope,
// pre-existing relations-array ordering defect that q12-live-real-barrier-
// cutover.test.ts's own end-to-end run surfaces (see that file's header).
const REAL_PG17 = process.env.MC2_Q12_REAL_PG17 === '1';
const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const RUNNER = resolve(
  repoRoot,
  'packages/course-gen-platform/tests/unit/ops/fixtures/q12-cron-row-hash-normalization-runner.py'
);

describe.runIf(REAL_PG17)(
  'Q12 source-manifest cron.job relations row_sha256 `active` normalization (real PostgreSQL 17.10)',
  () => {
    it('the SANCTIONED active-only flip leaves row_sha256 unchanged, but a real command tamper still changes it (fail closed)', () => {
      const result = spawnSync('/usr/bin/python3', [RUNNER], {
        encoding: 'utf8',
        timeout: 180_000,
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
        baseline: { row_sha256: string; row_count: string };
        sanctioned: { row_sha256: string; row_count: string };
        tampered: { row_sha256: string; row_count: string };
      };
      expect(out.baseline.row_count).toBe('2');
      expect(out.sanctioned.row_count).toBe('2');
      expect(out.tampered.row_count).toBe('2');
      expect(out.baseline.row_sha256).toMatch(/^[0-9a-f]{64}$/u);

      // THE FIX: flipping ONLY `active` (the exact barrier.install maintenance
      // delta) leaves cron.job's row_sha256 unchanged.
      expect(out.sanctioned.row_sha256).toBe(out.baseline.row_sha256);

      // THE MANDATORY TAMPER NEGATIVE: a REAL content change (command mutated
      // on top of the same active flip) still changes row_sha256 -- excluding
      // `active` does not accidentally hide any other column.
      expect(out.tampered.row_sha256).not.toBe(out.baseline.row_sha256);
      expect(out.tampered.row_sha256).not.toBe(out.sanctioned.row_sha256);
    }, 200_000);
  }
);
