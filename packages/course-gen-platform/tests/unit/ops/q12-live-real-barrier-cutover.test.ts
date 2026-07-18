import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// R4 Sub-round C: the NON-NEGOTIABLE real-PG17 acceptance R2 deferred. Proves
// END-TO-END, on a disposable full-Supabase-shaped PostgreSQL 17.10 source, that
// R2's baseline.json producer plus a REAL, unmodified
// deploy/qdrant/q12-database-barrier.sh `install` cutover PASSES the REAL,
// unmodified deploy/postgres/q12-source-manifest.ts validateTransition -- no
// stubbing of the barrier, no stubbing of the DB mutation, no weakening of
// validateTransition. See the runner fixture for the full harness (an
// unprivileged user+mount+net namespace scoped to the barrier invocation, a
// disposable-source TLS+identity front end, and a real `docker exec` relay into
// the disposable container).
//
// CURRENT FINDING (recorded, not hidden): driving the frozen, byte-verified
// barrier for real against real PostgreSQL 17.10 surfaces a genuine defect in
// the barrier's own fresh-install ACL lockdown: `REVOKE ALL ON TYPE
// q12_guard.<name> FROM PUBLIC` iterates every pg_type row in the q12_guard
// namespace, including the four implicit array types Postgres auto-creates
// alongside every base/composite type (_active_run, _baseline,
// _migration_guards, _probe). PostgreSQL 17.10 categorically refuses to
// GRANT/REVOKE privileges on array types ("cannot set privileges of array
// types" / "Set the privileges of the element type instead" -- aclchk.c
// ExecGrant_Type_check), so the very first real fresh `install` aborts inside
// tx1 and rolls back cleanly (q12_guard schema absent afterward; cron/read-only
// unchanged). This is unavoidable without editing the frozen barrier.sh, which
// is out of scope for this stream (Option B: byte-untouched). R4 Sub-round C is
// therefore a sanctioned HARD STOP, not a failure to hide: the positive
// assertion below stays RED until the frozen barrier is amended in a future,
// explicitly authorized round.
const REAL_PG17 = process.env.MC2_Q12_REAL_PG17 === '1';
const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const RUNNER = resolve(
  repoRoot,
  'packages/course-gen-platform/tests/unit/ops/fixtures/q12-live-real-barrier-cutover-runner.py'
);

describe.runIf(REAL_PG17)(
  'Q12 R4 Sub-round C: real barrier.install cutover vs validateTransition (real PostgreSQL 17.10)',
  () => {
    it('the REAL barrier.install cutover PASSES the REAL validateTransition positive', () => {
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
        seed_counts: { public: number; auth: number; storage: number; cron: number; net: number };
        baseline_cron_active: number;
        baseline_cron_count: number;
        barrier_rc: number;
        barrier_stderr: string;
        receipt_state: string | null;
        post_install_cron_active: number;
        post_install_read_only: string;
        capture_rc: number;
        capture_stderr: string;
        post_mortem_q12_guard_schema_present: boolean;
      };

      // Seed shape: exactly the frozen inventory the barrier's expected-catalog
      // schema demands (public/auth/storage/cron/net).
      expect(out.seed_counts).toEqual({ public: 47, auth: 22, storage: 5, cron: 8, net: 0 });
      expect(out.baseline_cron_active).toBe(8);
      expect(out.baseline_cron_count).toBe(8);

      // THE NON-NEGOTIABLE ACCEPTANCE (currently RED -- see the file-header
      // finding: a real, reproducible barrier defect, not a harness gap).
      expect(out.barrier_rc, out.barrier_stderr).toBe(0);
      expect(out.receipt_state).toBe('maintenance_guarded');
      expect(out.post_install_cron_active).toBe(0);
      expect(out.post_install_read_only).toBe('on');
      expect(out.capture_rc, out.capture_stderr).toBe(0);
    }, 260_000);
  }
);
