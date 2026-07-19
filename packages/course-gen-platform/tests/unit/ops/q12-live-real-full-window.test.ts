import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// R8-B-2-iv-1: the FULL-WINDOW real run_live probe with the ratified DUAL-BIND fusion
// (found-defect #15 supersession). run_live drives the COMPLETE cutover window against ONE
// disposable postgres:17.10 loopback container -- ordinary lifecycles through the real-child
// execute_ordinary seam; the five in-process barrier legs (install -> verify-after-base ->
// verify-after-observability -> prepare-recovery -> activate) REAL against the container through
// an executor-owned --real-claim subprocess that runs CORE.run_claim(args, RealClaimExecutor);
// migrations REALLY applied at migration.base.apply / migration.observability.apply; the journaled
// 5-row post-activate cleanup segment with the REAL frozen barrier cleanup child; the REAL R8-B-1
// seam; a receipt-validating resume stub.
//
// DUAL-BIND (ratified #15): inside the claim bwrap the SINGLE physical controller run-root dir is
// bound to BOTH /opt/megacampus/backups/q12/<run-id> (run_claim custody; /opt manifest argv kept
// verbatim) AND /tmp/mc2-q12-barrier-XXXXXX/backups/q12/<run-id> (the barrier's test-mode trust
// root). RealClaimExecutor rewrites ONLY the barrier child's own argv to the /tmp view; test-mode
// is CA-ONLY (self-signed proxy cert), never a DB-command relaxation.
//
// The runner drives BOTH the live controller (run_live, real executor) AND the closed composer
// (run_joined_composer, no-I/O executor) on shared inputs (the same REAL expected catalog, the same
// W quiesce manifest, the same run id), so the forward journals are byte/order twins on the blessed
// exclusion set. Parity is computed HERE with the blessed helpers (design R3 constraint / §6a
// ruling 4 / §6b.2/§6b.3), copied verbatim from q12-live-controller.test.ts.
const REAL_PG17 = process.env.MC2_Q12_REAL_PG17 === '1';
const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const RUNNER = resolve(
  repoRoot,
  'packages/course-gen-platform/tests/unit/ops/fixtures/q12-live-real-full-window-runner.py'
);

const FORWARD_PREFIX = 76;
const CLEANUP_ROWS = 5;
const TOTAL_ROWS = FORWARD_PREFIX + CLEANUP_ROWS;

const BLESSED_EXCLUSIONS = [
  'capability_manifest_sha256',
  'entry_hash',
  'previous_hash',
  'resource_manifest_sha256',
] as const;

function withoutBlessedExclusions(row: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...row };
  for (const key of BLESSED_EXCLUSIONS) delete rest[key];
  return rest;
}

function withParityExclusions(row: Record<string, unknown>): Record<string, unknown> {
  const rest = withoutBlessedExclusions(row);
  if (row.command_id === 'writers.resume.forward' && row.outcome === 'accepted') {
    delete rest.accepted_object_sha256;
  }
  return rest;
}

function withConvergenceExclusions(row: Record<string, unknown>): Record<string, unknown> {
  const rest = withParityExclusions(row);
  if (row.command_id === 'barrier.cleanup') {
    delete rest.command_sha256;
    delete rest.accepted_object_sha256;
  }
  return rest;
}

const V2_RECEIPT_KEYS = [
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
];

type JournalRow = Record<string, unknown> & {
  seq: number;
  phase: string;
  outcome: string;
  command_id: string;
  command_sha256: string;
  lease_epoch: string;
  accepted_object_kind: string;
  accepted_object_sha256: string | null;
};

describe.runIf(REAL_PG17)(
  'Q12 R8-B-2-iv-1: full-window real run_live probe with the DUAL-BIND fusion (real PostgreSQL 17.10)',
  () => {
    it('drives the whole forward window (5 real barrier legs + 2 real migrations) + journaled cleanup + R8-B-1 seam + resume, byte-parity with the composer twin, and proves the three #15 dual-bind conditions', () => {
      const result = spawnSync('/usr/bin/python3', [RUNNER], {
        encoding: 'utf8',
        timeout: 560_000,
        env: {
          PATH: process.env.PATH,
          LC_ALL: 'C',
          LANG: 'C',
          MC2_Q12_PLAN_DOCKER: '/usr/bin/docker',
        },
        maxBuffer: 64 * 1024 * 1024,
      });
      expect(result.status, result.stderr).toBe(0);
      const out = JSON.parse(result.stdout) as {
        seed_counts: { public: number; auth: number; storage: number; cron: number; net: number };
        catalog_sha256: string;
        run_id: string;
        live_rc: number;
        live_stderr: string;
        live_journal: JournalRow[];
        composer_journal: JournalRow[];
        quiesce_window_marker_mode: string;
        quiesce_window_marker: Record<string, unknown>;
        v2_receipt: Record<string, unknown>;
        v2_receipt_keys: string[];
        v2_receipt_sha256: string;
        capability_exists_after: boolean;
        post_activate_cleanup_status: string;
        post_activate_resume_status: string;
        post_activate_resume_validated_sha256: string;
        activate_db_state: { activated: boolean; cron_active: number; read_only: string };
        guard_residue_db: {
          schema_count: number;
          relation_count: number;
          function_count: number;
          event_trigger_count: number;
        };
        child_executions: number;
        dual_bind_same_inode: boolean;
        install_argv_opt_verbatim: boolean;
        install_command_sha256_binds_opt_argv: boolean;
        input_checkpoint_view_independent: boolean;
      };

      // Disposable source is the frozen full-Supabase inventory; run_live rc=0.
      expect(out.seed_counts).toEqual({ public: 47, auth: 22, storage: 5, cron: 8, net: 0 });
      expect(out.catalog_sha256).toMatch(/^[a-f0-9]{64}$/u);
      expect(out.live_rc, out.live_stderr).toBe(0);

      // ---- 81-row journal shape ---------------------------------------------------------------
      expect(out.live_journal).toHaveLength(TOTAL_ROWS);
      expect(out.composer_journal).toHaveLength(FORWARD_PREFIX);
      const cleanupRows = out.live_journal.slice(FORWARD_PREFIX);
      expect(cleanupRows.map(r => r.command_id)).toEqual(Array(CLEANUP_ROWS).fill('barrier.cleanup'));
      expect(cleanupRows.map(r => r.outcome)).toEqual([
        'intent',
        'capability_issued',
        'capability_claimed',
        'capability_completed',
        'accepted',
      ]);
      for (const row of cleanupRows) expect(row.phase).toBe('guard_cleanup_complete');

      // ---- 76-row PREFIX parity vs the composer twin (blessed exclusions) ----------------------
      expect(out.live_journal.slice(0, FORWARD_PREFIX).map(withParityExclusions)).toEqual(
        out.composer_journal.map(withParityExclusions)
      );
      // The cleanup segment is byte-deterministic under the convergence exclusions (only the
      // per-run command_sha256 + accepted_object_sha256 on barrier.cleanup rows are dropped).
      const cleanupProjected = cleanupRows.map(withConvergenceExclusions);
      for (let i = 0; i < cleanupProjected.length; i += 1) {
        expect(cleanupProjected[i].lease_epoch).toBe('cutover');
        expect(cleanupProjected[i].quiesce_manifest_sha256).toBeDefined();
      }

      // ---- quiesce-window marker 0400 on disk --------------------------------------------------
      expect(out.quiesce_window_marker_mode).toBe('400');
      expect(out.quiesce_window_marker).toEqual({
        schema_version: 'megacampus.q12.quiesce-window-mode/v1',
        run_id: out.run_id,
        mode: 'cutover',
      });

      // ---- terminal accepted cleanup row binds the EXACT 10-key v2 receipt ---------------------
      const terminal = cleanupRows[CLEANUP_ROWS - 1];
      expect(terminal.command_id).toBe('barrier.cleanup');
      expect(terminal.outcome).toBe('accepted');
      expect(terminal.accepted_object_kind).toBe('database_barrier_receipt');
      expect(terminal.accepted_object_sha256).toBe(out.v2_receipt_sha256);
      expect(out.v2_receipt_keys).toEqual(V2_RECEIPT_KEYS);
      const v2 = out.v2_receipt;
      expect(v2.schema_version).toBe('megacampus.q12.database-barrier-receipt/v2');
      expect(v2.run_id).toBe(out.run_id);
      expect(v2.state).toBe('guard_cleanup_complete');
      expect(v2.zero_guard_residue).toBe(true);
      expect(v2.last_command).toBe('cleanup');
      expect(v2.rollback_probes_verified).toBe(true);
      expect(v2.database_capability_deleted).toBe(true);
      expect(v2.expected_catalog_sha256).toBe(out.catalog_sha256);
      expect(v2.terminal_proof_sha256).toMatch(/^[a-f0-9]{64}$/u);
      expect(v2.probe_receipt_sha256).toMatch(/^[a-f0-9]{64}$/u);

      // ---- db-capability deleted by the CONTROLLER (R8-B-1 seam) -------------------------------
      expect(out.capability_exists_after).toBe(false);

      // ---- receipt-validating resume stub ------------------------------------------------------
      expect(out.post_activate_cleanup_status).toBe('guard_cleanup_complete');
      expect(out.post_activate_resume_status).toBe('resumed');
      expect(out.post_activate_resume_validated_sha256).toBe(out.v2_receipt_sha256);

      // ---- the real DB really transitioned & really cleaned up --------------------------------
      expect(out.activate_db_state).toEqual({ activated: true, cron_active: 8, read_only: 'off' });
      expect(out.guard_residue_db).toEqual({
        schema_count: 0,
        relation_count: 0,
        function_count: 0,
        event_trigger_count: 0,
      });
      expect(out.child_executions).toBeGreaterThan(0);

      // ---- #15 (i): ONE physical dir, TWO views; same inode ------------------------------------
      expect(out.dual_bind_same_inode).toBe(true);
      // ---- #15 (ii): the journal rows / command_sha256 still bind the /opt manifest argv --------
      expect(out.install_argv_opt_verbatim).toBe(true);
      expect(out.install_command_sha256_binds_opt_argv).toBe(true);
      // ---- #15 (iv): the claim-published per-leg input checkpoint validates under barrier view --
      expect(out.input_checkpoint_view_independent).toBe(true);
    }, 580_000);
  }
);
