import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// W5 (plan Task 5): rehearse the newly-wired PRODUCTION value machinery end-to-end against a
// disposable PostgreSQL 17.10 source — resolve_window_values(production) opening the REAL W3 window
// snapshot + baseline, persist/load staged-values authority with byte-identical pg.backup
// command_sha256 (D3 recover determinism), clean coordinator release, and the D4 acceptance oracle.
// This drives the real production functions (no fakes) as an integration.
//
// IN-WINDOW-only residual (#21, bounded to W7 / a future full-window production harness): the full
// run_live forward window with the real database-barrier dual-bind and the real data-movement
// children (pg.backup/pg.restore/source.forward/reindex.*/deploy.*) against the real source + target
// + Qdrant + nginx are NOT rehearsed here — they need the production stack and the owner-gated window.
const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const RUNNER = resolve(
  repoRoot,
  'packages/course-gen-platform/tests/unit/ops/fixtures/q12-w5-production-rehearsal-runner.py'
);
const REAL_PG17 = process.env.MC2_Q12_REAL_PG17 === '1';

describe.runIf(REAL_PG17)(
  'Q12 W5: production value machinery against disposable PostgreSQL 17.10',
  () => {
    it('drives the production fork + staged authority + recover determinism + D4 oracle for real', () => {
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
      const out = JSON.parse(result.stdout) as Record<string, boolean | string>;
      // (1) production fork opened a real snapshot + baseline and returned a resolver
      expect(out.snapshot_shaped).toBe(true);
      expect(out.baseline_ok).toBe(true);
      expect(out.is_resolver).toBe(true);
      expect(out.no_libpq_at_rest).toBe(true);
      // (2) staged authority persisted owner-only 0400
      expect(out.auth_mode).toBe('0o400');
      // (3) recover twin recomputes byte-identical pg.backup command_sha256 (D3 determinism)
      expect(out.determinism_ok).toBe(true);
      // (4) the held source session releases cleanly
      expect(out.released).toBe(true);
      // (5) the D4 oracle accepts a terminal run and rejects a non-zero child
      expect(out.oracle_accepted).toBe(true);
      expect(out.oracle_rejected_nonzero).toBe(true);
    }, 260_000);
  }
);
