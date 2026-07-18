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
// manifest.ts` validateTransition. `capture_rc`/`capture_stderr` are captured
// for diagnostic visibility only and are not asserted on here.
//
// UPDATE (guard-surface reconciliation round, base 3596aa72): the
// then-hardcoded 5-vs-10 q12_guard function allowlist noted above is fixed
// (GUARD_FUNCTIONS/GUARD_TRIGGERS/ACL exact-sets reconciled to the barrier's
// real install -- see q12-source-manifest-guard-surface.test.ts for the
// no-docker positive/negative proof). Driving the REAL end-to-end capture
// with that fix applied surfaced two further, layered, pre-existing defects
// in q12-source-manifest.ts's OWN catalogSql() capture query, unrelated to
// the allowlist and out of scope for the allowlist-reconciliation mandate:
//   1. FIXED (this round): `object_owners`/`object_acls`/`comments`/
//      `security_labels` each UNION ALL several branches into one shared
//      `identity` output column; several branches project a bare `name`-typed
//      source column (e.g. `n.nspname`, `c.relname`, `t.typname`, `e.extname`)
//      un-cast, alongside branches that already produce `text` via `||`
//      concatenation (e.g. function identity with arguments). PostgreSQL
//      resolves the UNION's output column type to `name` in that mix
//      (confirmed via `pg_typeof`), silently truncating every row -- even the
//      `text`-computed ones -- to NAMEDATALEN-1 (63) bytes. This corrupted
//      `extend_guard(...)`'s captured identity specifically, which the
//      now-complete allowlist compares in full (not just by function name),
//      newly exposing a bug that no prior round's capture ever reached.
//      Fixed by adding explicit `::text` casts to every bare `name`-typed
//      branch column feeding those four UNION blocks.
//   2. STILL OPEN, NOT fixed here (STOP-and-report, distinct concern): with
//      (1) fixed, capture progresses past every q12_guard-specific check and
//      fails on a single, unrelated relation -- `cron.job`'s row_sha256
//      differs between baseline and cutover (confirmed via a temporary
//      reportManifestDiff probe). This is expected content drift (the
//      barrier's cutover deactivates every cron job, so `cron.job`'s row
//      bytes legitimately change), but validateTransition only normalizes
//      the separate top-level `cron_jobs` summary array's `active` flag
//      before comparing -- it does not equivalently normalize the
//      `relations` section's authoritative row-content hash for `cron.job`.
//      This is a cron-activation-state modeling gap, not a q12_guard-surface
//      allowlist question, so it is out of scope for the guard-surface
//      reconciliation round and is tracked as a distinct, deferred defect.
//
// UPDATE (defect-4 fold-in, same source-manifest round): the "STILL OPEN"
// cron.job row_sha256 defect above is FIXED -- relationHash() now excludes
// ONLY the `active` column, ONLY for the pg_cron authoritative relation
// cron.job, so the SANCTIONED barrier.install active-flip no longer diverges
// cron.job's row_sha256 between baseline and cutover (see the focused,
// no-barrier real-PG17 proof in q12-cron-row-hash-normalization.test.ts /
// fixtures/q12-cron-row-hash-normalization-runner.py: an active-only flip
// leaves row_sha256 unchanged; a real command tamper on top of that same
// flip still changes it -- fail-closed). Driving the REAL end-to-end capture
// here (this test) with that fix applied surfaced a DIFFERENT, unrelated,
// pre-existing defect (a 7th defect, STOP-and-report, NOT chased per the
// defect-4 mandate's own scope boundary): with cron.job's row_sha256 now
// matching (confirmed via a temporary reportManifestDiff probe -- the
// `relations` arrays are set-equal, zero source-only/target-only entries),
// capture STILL fails, now solely because the derived `relations_sha256`
// digest is ORDER-sensitive while `relations` itself is not: baseline.relations
// keeps catalogSql()'s natural SQL order (`ORDER BY nspname,relname,relkind`,
// never reordered for the baseline view), but validateTransition's own
// `cutoverRelations = sortedArray(cutover.relations, ...)` re-sorts the
// CUTOVER view by `canonical()`-string `localeCompare` (a key-alphabetical,
// content-driven order, not schema/name) before the q12_guard filter, and
// that resorted order is what becomes the final `cutover.relations` — so the
// two views' relation arrays are set-equal but sequence-different, and the
// order-sensitive `relations_sha256` hash diverges even though the content is
// identical. This was never reached by any prior round because the
// (now-fixed) cron.job content mismatch always failed first and masked it.
// This is a relations-ordering/hash-derivation defect in validateTransition
// itself, wholly unrelated to cron/active and out of scope for this
// tightly-bounded cron normalization; it is NOT fixed here.
//
// UPDATE (defect-7 in-round bounded plumbing fix, same source-manifest
// round): the "7th defect" above is FIXED -- validateTransition sorted the
// CUTOVER projections of `database.settings`, `schemas`, and `relations` via
// its own `sortedArray()` helper before comparing them to baseline, but never
// sorted the BASELINE counterpart the same way (baseline kept catalogSql()'s
// natural SQL capture order), so a content-identical set that merely
// sequenced differently spuriously diverged at the byte-strict final
// comparison. Fixed, behavior-preservingly, by sorting the baseline
// counterpart with the SAME `sortedArray()` call and reassigning it, at all
// three sites -- mirroring this function's own already-symmetric cron_jobs
// idiom (`baselineJobs`/`cutoverJobs`, both `sortedArray()`'d) immediately
// above. See q12-source-manifest-baseline-order-symmetry.test.ts for the
// no-docker RED->GREEN proof (a synthetic, non-canonically-ordered baseline
// relation/schema pair) and its accompanying content-divergence negative
// (fail-closed preserved: a genuine content change riding along the same
// order shuffle still fails).
//
// Fourth order-symmetry site (RESOLVED, orchestrator-authorized): the same
// class also existed at this function's own cron_jobs handling -- it sorts
// BOTH `baselineJobs`/`cutoverJobs` into LOCALs and reassigns
// `cutover.cron_jobs = normalizedCutoverJobs`, but never reassigned
// `baseline.cron_jobs` to the sorted `baselineJobs`, so baseline kept SQL
// capture order (ascending jobid) while cutover ended in canonical-string
// order and the two diverged at the byte-strict comparison exactly like the
// three sites. Fixed as the ratified 4th site (`baseline.cron_jobs =
// baselineJobs`, provably order-only via the per-index before===normalized
// equality). With all four sites symmetric, the REAL end-to-end capture now
// reaches capture_rc=0 -- the full R4 Sub-round C validateTransition POSITIVE
// (asserted below), the acceptance R2 deferred.
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

      // R4 Sub-round C acceptance (defect-3/4/7 all landed): the real
      // baseline->barrier.install-cutover q12-source-manifest.ts capture now
      // passes validateTransition end-to-end — the full validateTransition
      // POSITIVE that R2 deferred. No q12_guard-surface rejection, no cron
      // active-flip false positive, no baseline-vs-cutover ordering divergence.
      expect(out.capture_rc, out.capture_stderr).toBe(0);
      expect(out.capture_stderr).not.toMatch(/baseline-to-cutover delta|source manifest failed/u);
    }, 260_000);
  }
);
