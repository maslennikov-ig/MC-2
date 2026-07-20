import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// R8-B-2-i: the real-PG17 barrier VERIFY chain, extending the R4 install harness
// (q12-live-real-barrier-cutover.test.ts / ...-runner.py) through the frozen
// `verify-extended` subcommand. Proves END-TO-END, against the SAME disposable,
// full-Supabase-shaped PostgreSQL 17.10 source the R4 install leg stands up, that:
//   1. install reaches maintenance_guarded (the R4 acceptance, re-driven);
//   2. a REAL base migration (public.document_evidence_runs) applied under the
//      stored q12_guard capability plus a REAL q12_guard.extend_guard, followed by
//      a REAL `q12-database-barrier.sh verify-extended --after-migration
//      20260711140000`, reaches 20260711140000_guard_verified; and
//   3. a REAL observability migration (public.document_evidence_observability_totals)
//      + extend_guard, followed by verify-extended --after-migration 20260711151000,
//      reaches 20260711151000_guard_verified.
// Neither verify-extended is stubbed: each drives the frozen barrier's real DB
// command through the same unprivileged user+mount+net namespace + pooler-identity
// TLS proxy the R4 install leg uses (no MC2_Q12_BARRIER_TEST_MODE relaxation of the
// DB command). The migration structural hashes baked into the immutable expected
// catalog are the REAL captured post-migration structural sha256s, so the frozen
// q12_guard.verify_expected_guards checkpoint comparison is exact.
//
// BYTE-MATCH CONTRACT: the produced verify-extended receipts match, key-for-key and
// value-for-value, the frozen receipt shape the forward-path predecessor gate
// consumes -- state=<migration>_guard_verified, last_command=verify-extended,
// zero_guard_residue=false, rollback_probes_verified=true, probe_receipt_sha256 a
// bound hex64 (q12-database-barrier.sh:347-357, the prepare-recovery predecessor
// gate that is verify-after-observability's real forward successor). The guard
// surface (four q12_guard tables, ten functions, the single event trigger, and the
// exact migration_guards row set) is proven by verify-extended returning rc 0 --
// its own exhaustive q12_guard.verify_expected_guards guard-surface asserts must all
// hold against the real database -- and re-read here as an independent post-mortem.
const REAL_PG17 = process.env.MC2_Q12_REAL_PG17 === '1';
const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const RUNNER = resolve(
  repoRoot,
  'packages/course-gen-platform/tests/unit/ops/fixtures/q12-live-real-verify-chain-runner.py'
);

const GUARD_TABLES = ['active_run', 'baseline', 'migration_guards', 'probe'];
const GUARD_FUNCTIONS = [
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
];

interface GuardSurface {
  tables: string[];
  functions: string[];
  event_trigger_count: number;
  migration_guards: Array<{
    migration: string;
    catalog_sha256: string;
    migration_file_sha256: string;
  }>;
}

interface VerifyReceipt {
  schema_version: string;
  run_id: string;
  state: string;
  zero_guard_residue: boolean;
  expected_catalog_sha256: string;
  last_command: string;
  rollback_probes_verified: boolean;
  probe_receipt_sha256: string | null;
}

describe.runIf(REAL_PG17)(
  'Q12 R8-B-2-i/ii/iii: real barrier verify-extended + prepare-recovery + activate + cleanup chain (real PostgreSQL 17.10)',
  () => {
    it('drives verify-base, verify-obs, prepare-recovery, activate, and the REAL frozen cleanup END-TO-END, then the R8-B-1 seam consumes the REAL terminal proof (incl. #14 anti-weakening SQLSTATE probe + cleanup idempotence)', () => {
      const result = spawnSync('/usr/bin/python3', [RUNNER], {
        encoding: 'utf8',
        timeout: 360_000,
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
        catalog_sha256: string;
        baseline_structural_sha256: string;
        after_base_structural_sha256: string;
        after_obs_structural_sha256: string;
        install_rc: number;
        install_stderr: string;
        install_receipt_state: string | null;
        base_migration_rc: number;
        base_migration_stderr: string;
        verify_base_rc: number;
        verify_base_stderr: string;
        verify_base_receipt: VerifyReceipt | null;
        verify_base_receipt_state: string | null;
        surface_after_base: GuardSurface;
        obs_migration_rc: number;
        obs_migration_stderr: string;
        verify_obs_rc: number;
        verify_obs_stderr: string;
        verify_obs_receipt: VerifyReceipt | null;
        verify_obs_receipt_state: string | null;
        surface_after_obs: GuardSurface;
        post_verify_cron_active: number;
        post_verify_read_only: string;
        prepare_recovery_rc: number;
        prepare_recovery_receipt_state: string | null;
        prepare_db_state: { activated: boolean; cron_active: number; read_only: string };
        activate_rc: number;
        activate_stderr: string;
        activate_receipt: VerifyReceipt | null;
        activate_receipt_state: string | null;
        activate_db_state: { activated: boolean; cron_active: number; read_only: string };
        probe_receipt_sha256: string;
        guard_probe_active_run: { rc: number; stderr: string };
        guard_probe_baseline: { rc: number; stderr: string };
        guard_probe_migration_guards: { rc: number; stderr: string };
        // ---- R8-B-2-iii: real frozen barrier cleanup + R8-B-1 seam ----
        cleanup_rc: number;
        cleanup_stdout: string;
        cleanup_stderr: string;
        cleanup_terminal_proof: Record<string, unknown> | null;
        cleanup_terminal_proof_key_count: number;
        cleanup_intent_journal_entry_hash: string;
        guard_residue_db: {
          schema_count: number;
          relation_count: number;
          function_count: number;
          event_trigger_count: number;
        };
        cleanup_rerun_rc: number;
        cleanup_rerun_stdout: string;
        cleanup_rerun_stderr: string;
        cleanup_terminal_proof_sha256_after_barrier: string | null;
        cleanup_terminal_proof_sha256_after_rerun: string | null;
        seam_command: { argv: string[]; command_sha256: string };
        seam_outcome: Record<string, unknown>;
        v2_receipt: Record<string, unknown>;
        v2_receipt_keys: string[];
        v2_bytes_utf8: string;
        v2_matches_expected_contract: boolean;
        archive_matches_activate_receipt: boolean;
        capability_exists_after_seam: boolean;
      };

      // The disposable source is the frozen R4 inventory, and install re-reaches
      // maintenance_guarded (the harness this round extends).
      expect(out.seed_counts).toEqual({ public: 47, auth: 22, storage: 5, cron: 8, net: 0 });
      expect(out.install_rc, out.install_stderr).toBe(0);
      expect(out.install_receipt_state).toBe('maintenance_guarded');

      // The immutable expected catalog binds REAL, distinct post-migration
      // structural hashes -- what the frozen q12_guard.verify_expected_guards
      // recomputes and compares at each checkpoint.
      for (const sha of [
        out.baseline_structural_sha256,
        out.after_base_structural_sha256,
        out.after_obs_structural_sha256,
        out.catalog_sha256,
      ]) {
        expect(sha).toMatch(/^[a-f0-9]{64}$/u);
      }
      expect(out.after_base_structural_sha256).not.toBe(out.baseline_structural_sha256);
      expect(out.after_obs_structural_sha256).not.toBe(out.after_base_structural_sha256);

      // ---- verify-after-base: REAL migration + REAL verify-extended -------------
      expect(out.base_migration_rc, out.base_migration_stderr).toBe(0);
      expect(out.verify_base_rc, out.verify_base_stderr).toBe(0);
      expect(out.verify_base_receipt_state).toBe('20260711140000_guard_verified');
      // Byte-for-byte the frozen verify-extended receipt shape the forward
      // prepare-recovery predecessor gate consumes.
      expect(out.verify_base_receipt).toEqual({
        schema_version: 'megacampus.q12.database-barrier-receipt/v1',
        run_id: '123e4567-e89b-42d3-a456-426614174000',
        state: '20260711140000_guard_verified',
        zero_guard_residue: false,
        expected_catalog_sha256: out.catalog_sha256,
        last_command: 'verify-extended',
        rollback_probes_verified: true,
        probe_receipt_sha256: out.verify_base_receipt?.probe_receipt_sha256,
      });
      expect(out.verify_base_receipt?.probe_receipt_sha256).toMatch(/^[a-f0-9]{64}$/u);

      // Guard surface after base: the four q12_guard tables, ten functions, single
      // event trigger, and EXACTLY the base migration guard row (its catalog hash is
      // the real after-base structural hash).
      expect(out.surface_after_base.tables).toEqual(GUARD_TABLES);
      expect(out.surface_after_base.functions).toEqual(GUARD_FUNCTIONS);
      expect(out.surface_after_base.event_trigger_count).toBe(1);
      expect(out.surface_after_base.migration_guards.map(row => row.migration)).toEqual([
        '20260711140000',
      ]);
      expect(out.surface_after_base.migration_guards[0].catalog_sha256).toBe(
        out.after_base_structural_sha256
      );

      // ---- verify-after-observability: REAL migration + REAL verify-extended ----
      expect(out.obs_migration_rc, out.obs_migration_stderr).toBe(0);
      expect(out.verify_obs_rc, out.verify_obs_stderr).toBe(0);
      expect(out.verify_obs_receipt_state).toBe('20260711151000_guard_verified');
      expect(out.verify_obs_receipt).toEqual({
        schema_version: 'megacampus.q12.database-barrier-receipt/v1',
        run_id: '123e4567-e89b-42d3-a456-426614174000',
        state: '20260711151000_guard_verified',
        zero_guard_residue: false,
        expected_catalog_sha256: out.catalog_sha256,
        last_command: 'verify-extended',
        rollback_probes_verified: true,
        probe_receipt_sha256: out.verify_obs_receipt?.probe_receipt_sha256,
      });
      expect(out.verify_obs_receipt?.probe_receipt_sha256).toMatch(/^[a-f0-9]{64}$/u);

      // Guard surface after observability: the base guard is retained and the
      // observability guard is appended (its catalog hash is the real post-obs
      // structural hash, equal to expected_post_migration_catalog_sha256).
      expect(out.surface_after_obs.tables).toEqual(GUARD_TABLES);
      expect(out.surface_after_obs.functions).toEqual(GUARD_FUNCTIONS);
      expect(out.surface_after_obs.event_trigger_count).toBe(1);
      expect(out.surface_after_obs.migration_guards.map(row => row.migration)).toEqual([
        '20260711140000',
        '20260711151000',
      ]);
      expect(
        out.surface_after_obs.migration_guards.find(row => row.migration === '20260711151000')
          ?.catalog_sha256
      ).toBe(out.after_obs_structural_sha256);

      // The maintenance barrier is intact throughout the read-only verify chain.
      expect(out.post_verify_cron_active).toBe(0);
      expect(out.post_verify_read_only).toBe('on');

      // ---- prepare-recovery + activate (R8-B-2-ii): the real forward cutover ---------
      // prepare-recovery re-validates the verify-obs receipt as predecessor and reaches
      // recovery_ready_guarded against the still-guarded DB (activated false, guard live).
      expect(out.prepare_recovery_rc).toBe(0);
      expect(out.prepare_recovery_receipt_state).toBe('recovery_ready_guarded');
      expect(out.prepare_db_state).toEqual({ activated: false, cron_active: 0, read_only: 'on' });

      // activate (normal path, write_restore_sql false) REACHES `activated`: sets
      // activated=true under the append-only guard, restores the captured cron/read_only
      // baseline, and verifies verify_activated_state. Byte-for-byte the frozen receipt
      // shape with last_command=activate, rollback_probes_verified=true.
      expect(out.activate_rc, out.activate_stderr).toBe(0);
      expect(out.activate_receipt_state).toBe('activated');
      expect(out.activate_receipt).toEqual({
        schema_version: 'megacampus.q12.database-barrier-receipt/v1',
        run_id: '123e4567-e89b-42d3-a456-426614174000',
        state: 'activated',
        zero_guard_residue: false,
        expected_catalog_sha256: out.catalog_sha256,
        last_command: 'activate',
        rollback_probes_verified: true,
        probe_receipt_sha256: out.probe_receipt_sha256,
      });
      // On activation the captured baseline is restored: cron re-activated (8 jobs),
      // default_transaction_read_only back off, and the guard flag now activated.
      expect(out.activate_db_state).toEqual({ activated: true, cron_active: 8, read_only: 'off' });

      // ---- found-defect #14 anti-weakening probe: the durable guard is NOT weakened ---
      // Post-activate, with the guard triggers live and the capability supplied, EVERY
      // q12_guard-table write still trips the append-only guard (SQLSTATE P0001) and NONE
      // regresses to the pre-#14 42703 `record "old" has no field "run_id"`. The
      // run_id-less baseline / migration_guards are the exact rows the #14 nested-IF fix
      // stopped from evaluating OLD.run_id; the active_run non-flip UPDATE lands on the
      // same RAISE via inner fall-through -- proof the fix preserved the guarantee.
      // The probes run PRE-CLEANUP (the guard is still live post-activate); after the cleanup leg
      // DROP SCHEMA q12_guard the guard is gone. Defrost P3: the anti-weakening probe now asserts
      // the LITERAL SQLSTATE, not just the message. Each guarded write trips the append-only guard
      // as SQLSTATE P0001 (plpgsql raise_exception) -- captured by a DO/EXCEPTION handler that emits
      // 'Q12_PROBE_SQLSTATE=%' then re-RAISEs (so rc still != 0). A regression to the pre-#14 42703
      // 'record "old" has no field "run_id"' would surface both a wrong SQLSTATE and that message.
      for (const probe of [
        out.guard_probe_active_run,
        out.guard_probe_baseline,
        out.guard_probe_migration_guards,
      ]) {
        expect(probe.rc).not.toBe(0);
        expect(probe.stderr).toContain('Q12 durable guard truth is append-only');
        expect(probe.stderr).toContain('Q12_PROBE_SQLSTATE=P0001');
        expect(probe.stderr).not.toContain('has no field "run_id"');
      }

      // ---- R8-B-2-iii: the REAL frozen barrier `cleanup` off the activated state ------------------
      // The frozen barrier (bytes bdb9d935, no MC2_Q12_BARRIER_TEST_MODE relaxation of the DB command)
      // runs cleanup off the activated container: real DROP SCHEMA q12_guard CASCADE, proves zero guard
      // residue, and publishes the 18-key terminal proof. The controller supplies the journal to the
      // claimed boundary + the v1-before-cleanup archive; the barrier validates them for real.
      expect(out.cleanup_rc, out.cleanup_stderr).toBe(0);
      expect(out.cleanup_terminal_proof_key_count).toBe(18);
      const proof = out.cleanup_terminal_proof as Record<string, unknown>;
      expect(Object.keys(proof).sort()).toEqual(
        [
          'completed_at',
          'cron_jobs_sha256',
          'database_barrier_baseline_sha256',
          'database_barrier_rollback_intent_sha256',
          'database_capability_sha256',
          'database_default_sha256',
          'expected_post_migration_catalog_sha256',
          'guard_residue',
          'input_checkpoint_sha256',
          'intent_journal_entry_hash',
          'operation',
          'predecessor_receipt_archive_sha256',
          'predecessor_receipt_sha256',
          'required_phase_receipts_sha256',
          'run_id',
          'schema_version',
          'state',
          'structural_catalog_sha256',
        ].sort()
      );
      expect(proof.schema_version).toBe('megacampus.q12.database-barrier-terminal-proof/v1');
      expect(proof.run_id).toBe('123e4567-e89b-42d3-a456-426614174000');
      expect(proof.operation).toBe('cleanup');
      expect(proof.state).toBe('guard_cleanup_complete');
      // Post-cleanup the migrated tables remain but q12_guard is excluded from the structural catalog,
      // so the terminal structural hash equals the expected post-migration (after-obs) catalog hash.
      expect(proof.expected_post_migration_catalog_sha256).toBe(out.after_obs_structural_sha256);
      expect(proof.structural_catalog_sha256).toBe(out.after_obs_structural_sha256);
      // Cleanup binds neither a rollback intent nor required-phase-receipts (both null for cleanup).
      expect(proof.database_barrier_rollback_intent_sha256).toBe(null);
      expect(proof.required_phase_receipts_sha256).toBe(null);
      // The controller-journaled intent row's hash is bound into the terminal proof.
      expect(proof.intent_journal_entry_hash).toBe(out.cleanup_intent_journal_entry_hash);
      expect(proof.completed_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u);
      for (const key of [
        'database_barrier_baseline_sha256',
        'predecessor_receipt_sha256',
        'predecessor_receipt_archive_sha256',
        'input_checkpoint_sha256',
        'database_default_sha256',
        'cron_jobs_sha256',
        'database_capability_sha256',
      ]) {
        expect(proof[key]).toMatch(/^[a-f0-9]{64}$/u);
      }
      // The 18-key proof's residue object is all-zero.
      expect(proof.guard_residue).toEqual({
        q12_guard_schema_count: 0,
        q12_guard_relation_count: 0,
        q12_guard_function_count: 0,
        q12_guard_type_count: 0,
        q12_guard_trigger_count: 0,
        q12_guard_event_trigger_count: 0,
        barrier_era_session_count: 0,
      });
      // q12_guard is REALLY gone (independent live pg_namespace/pg_class/pg_proc query, not just the
      // proof's self-report).
      expect(out.guard_residue_db).toEqual({
        schema_count: 0,
        relation_count: 0,
        function_count: 0,
        event_trigger_count: 0,
      });

      // ---- Cleanup re-drive idempotence: the terminal proof is re-validated exact, not re-produced --
      // A second cleanup drive hits the barrier's early terminal-proof re-validation branch (before any
      // DB work) and exits 0 with the same-cutover-epoch proof unchanged byte-for-byte.
      expect(out.cleanup_rerun_rc, out.cleanup_rerun_stderr).toBe(0);
      expect(out.cleanup_rerun_stdout).toContain('guard_cleanup_complete proof already verified');
      expect(out.cleanup_terminal_proof_sha256_after_barrier).toMatch(/^[a-f0-9]{64}$/u);
      expect(out.cleanup_terminal_proof_sha256_after_rerun).toBe(
        out.cleanup_terminal_proof_sha256_after_barrier
      );

      // ---- R8-B-1 seam consumes the REAL terminal proof END-TO-END ------------------------------
      // The REAL ProductionExecutor archives the v1 activate receipt, promotes it IN PLACE to the exact
      // 10-key megacampus.q12.database-barrier-receipt/v2 binding the REAL barrier-produced terminal
      // proof + probe digests, and deletes the db-capability -- fed the REAL run_root the barrier just
      // populated (not a seeded fixture proof).
      expect(out.seam_command.argv).toContain('cleanup');
      expect(out.seam_command.command_sha256).toMatch(/^[a-f0-9]{64}$/u);
      const seam = out.seam_outcome;
      expect(seam.status).toBe('guard_cleanup_complete');
      expect(seam.ok).toBe(true);
      expect(seam.terminal_proof_sha256).toBe(out.cleanup_terminal_proof_sha256_after_barrier);
      expect(seam.probe_receipt_sha256).toBe(out.probe_receipt_sha256);
      expect(seam.cleanup_receipt_sha256).toMatch(/^[a-f0-9]{64}$/u);
      // The promoted v2 is EXACTLY the 10 keys, byte-matching the fixture contract for the same inputs.
      expect(out.v2_receipt_keys).toEqual([
        'database_capability_deleted',
        'expected_catalog_sha256',
        'last_command',
        'probe_receipt_sha256',
        'rollback_probes_verified',
        'run_id',
        'schema_version',
        'state',
        'terminal_proof_sha256',
        'zero_guard_residue',
      ]);
      expect(out.v2_matches_expected_contract).toBe(true);
      const v2 = out.v2_receipt;
      expect(v2.schema_version).toBe('megacampus.q12.database-barrier-receipt/v2');
      expect(v2.run_id).toBe('123e4567-e89b-42d3-a456-426614174000');
      expect(v2.state).toBe('guard_cleanup_complete');
      expect(v2.zero_guard_residue).toBe(true);
      expect(v2.last_command).toBe('cleanup');
      expect(v2.rollback_probes_verified).toBe(true);
      expect(v2.database_capability_deleted).toBe(true);
      expect(v2.expected_catalog_sha256).toBe(out.catalog_sha256);
      // The digests bind the REAL on-disk barrier producer artifacts, not fabricated values.
      expect(v2.terminal_proof_sha256).toBe(out.cleanup_terminal_proof_sha256_after_barrier);
      expect(v2.probe_receipt_sha256).toBe(out.probe_receipt_sha256);
      // The v1 archive is byte-exact to the pre-cleanup activate receipt.
      expect(out.archive_matches_activate_receipt).toBe(true);
      // The db-capability is deleted.
      expect(out.capability_exists_after_seam).toBe(false);
    }, 380_000);
  }
);
