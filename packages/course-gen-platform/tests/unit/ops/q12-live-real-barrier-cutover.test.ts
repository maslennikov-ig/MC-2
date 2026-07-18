import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// R4 Sub-round C (frozen-barrier-fix round): the NON-NEGOTIABLE real-PG17
// acceptance that R2 deferred and R4 Sub-round C (270f62a46) sanctioned-hard-
// stopped on. Proves END-TO-END, on a disposable full-Supabase-shaped
// PostgreSQL 17.10 source, that a REAL deploy/qdrant/q12-database-barrier.sh
// `install` cutover reaches `maintenance_guarded` -- no stubbing of the
// barrier, no stubbing of the DB mutation. See the runner fixture for the full
// harness (an unprivileged user+mount+net namespace scoped to the barrier
// invocation, a disposable-source TLS+identity front end, and a real `docker
// exec` relay into the disposable container).
//
// HISTORY (recorded, not hidden): driving the frozen barrier for real against
// real PostgreSQL 17.10 originally surfaced two real, stacked defects, fixed
// across this round and the immediately preceding one:
//   1. ACL array-type lockdown (fixed in c4c05d762, preceding round): `REVOKE
//      ALL ON TYPE q12_guard.<name> FROM PUBLIC` iterated every pg_type row in
//      the q12_guard namespace, including the four implicit array types
//      Postgres auto-creates alongside every base/composite type
//      (_active_run, _baseline, _migration_guards, _probe). PostgreSQL 17.10
//      categorically refuses to GRANT/REVOKE privileges on array types
//      ("cannot set privileges of array types"), so the very first real fresh
//      `install` aborted inside tx1. Fixed by excluding `typcategory = 'A'`
//      rows from the four owner-only ACL scans/loops.
//   2. Catalog-fd double consumption (this round): the barrier opens the
//      expected-catalog file into fd 13 once, then reads it TWICE -- once via
//      `cat <&13` (a consuming read, advancing the shared open-file-
//      description's offset to EOF) for its own bash-side jq validation, and
//      once by fd number inside the install Node runner
//      (`fs.readFileSync(Number(catalogFd))`). The second read landed at EOF
//      and returned an empty string, so `set_config('megacampus.q12_expected
//      _catalog','')` made the very first `current_setting(...)::jsonb` cast
//      inside tx1 fail with "invalid input syntax for type json". Fixed by
//      reading the bash-side validation copy via `/proc/self/fd/13` (a fresh,
//      independent file description) instead of consuming the shared fd.
//   3. Two further bounded, execution-enabling, PG-dialect-mechanics defects
//      surfaced only once (1) and (2) stopped masking them, both inside
//      `verify_install_resume_state()`/the prepare-recovery readiness check:
//      an operator-precedence bug (`saved->'database_settings' - 'setconfig'`
//      parses as `saved -> ('database_settings' - 'setconfig')` because
//      Postgres's additive `-` binds tighter than `->`, so two "unknown"-
//      typed string literals hit an ambiguous-operator error) and a missing
//      scalar guard (the same expression assumed `saved->'database_settings'`
//      is always a jsonb object, but on the very first install it is the
//      jsonb scalar `null`, and jsonb `-` refuses scalars). Both fixed
//      minimally (explicit parens; a `jsonb_typeof(...)='object'` guard
//      mirroring the pattern already used three times in the same function).
//
// SCOPE OF THIS ROUND: the mandated acceptance is the barrier reaching
// `maintenance_guarded` end-to-end (receipt + q12_guard install surface
// below), NOT the full R4 chain through `deploy/postgres/q12-source-
// manifest.ts` validateTransition. That tool is frozen/out of scope for this
// round (its hardcoded q12_guard function allowlist is a known, separate,
// pre-existing 5-vs-10 drift against the barrier's real function set,
// unrelated to any fix in this round) and remains a distinct, tracked,
// deferred concern for a future round. `capture_rc`/`capture_stderr` are
// captured for diagnostic visibility only and are not asserted on here.
const REAL_PG17 = process.env.MC2_Q12_REAL_PG17 === '1';
const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const RUNNER = resolve(
  repoRoot,
  'packages/course-gen-platform/tests/unit/ops/fixtures/q12-live-real-barrier-cutover-runner.py'
);

describe.runIf(REAL_PG17)(
  'Q12 R4 Sub-round C: real barrier.install reaches maintenance_guarded (real PostgreSQL 17.10)',
  () => {
    it('the REAL barrier.install cutover reaches maintenance_guarded END-TO-END', () => {
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
        receipt: {
          schema_version: string;
          run_id: string;
          state: string;
          zero_guard_residue: boolean;
          expected_catalog_sha256: string;
          last_command: string;
          rollback_probes_verified: boolean;
          probe_receipt_sha256: string | null;
        } | null;
        receipt_state: string | null;
        post_install_cron_active: number;
        post_install_read_only: string;
        capture_rc: number;
        capture_stderr: string;
        post_mortem_q12_guard_schema_present: boolean;
        post_mortem_q12_guard_tables: string[];
        post_mortem_q12_guard_functions: string[];
        post_mortem_q12_guard_event_trigger_count: number;
      };

      // Seed shape: exactly the frozen inventory the barrier's expected-catalog
      // schema demands (public/auth/storage/cron/net).
      expect(out.seed_counts).toEqual({ public: 47, auth: 22, storage: 5, cron: 8, net: 0 });
      expect(out.baseline_cron_active).toBe(8);
      expect(out.baseline_cron_count).toBe(8);

      // THE NON-NEGOTIABLE ACCEPTANCE FOR THIS ROUND: the real barrier.install
      // reaches maintenance_guarded end-to-end (see file header for scope).
      expect(out.barrier_rc, out.barrier_stderr).toBe(0);
      expect(out.receipt_state).toBe('maintenance_guarded');
      expect(out.receipt).toEqual({
        schema_version: 'megacampus.q12.database-barrier-receipt/v1',
        run_id: '123e4567-e89b-42d3-a456-426614174000',
        state: 'maintenance_guarded',
        zero_guard_residue: false,
        expected_catalog_sha256: out.receipt?.expected_catalog_sha256,
        last_command: 'install',
        rollback_probes_verified: false,
        probe_receipt_sha256: null,
      });
      expect(out.receipt?.expected_catalog_sha256).toMatch(/^[a-f0-9]{64}$/u);
      expect(out.post_install_cron_active).toBe(0);
      expect(out.post_install_read_only).toBe('on');
      expect(out.post_mortem_q12_guard_schema_present).toBe(true);
      expect(out.post_mortem_q12_guard_tables).toEqual([
        'active_run',
        'baseline',
        'migration_guards',
        'probe',
      ]);
      expect(out.post_mortem_q12_guard_functions).toEqual([
        'assert_capability',
        'assert_controller_binding',
        'enforce_ddl_barrier',
        'enforce_write_barrier',
        'extend_guard',
        'quiesce_client_backends',
        'verify_activated_state',
        'verify_capability',
        'verify_expected_guards',
        'verify_install_resume_state',
      ]);
      expect(out.post_mortem_q12_guard_event_trigger_count).toBe(1);

      // Diagnostic only, not asserted: capture_rc against the frozen, out-of-
      // scope q12-source-manifest.ts validateTransition (see file header).
    }, 260_000);
  }
);
