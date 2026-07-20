import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// R8-B-2-iv-3 (b', ratified after found-defect #19): the REAL SATISFIABLE cleanup-crash recover
// probe on the ratified DUAL-BIND fusion harness. This is the REAL twin of the FIXTURE head-8
// precedent q12-live-controller.test.ts:1046 ("mid-cleanup crash (barrier.cleanup/capability_claimed):
// recover resumes the cleanup segment and converges").
//
//   * TWIN     — an uninterrupted real run_live (container A) → the 81-row oracle.
//   * CRASH    — a fresh root/container B drives the window through activate INTO the cleanup segment,
//     then crashes mid-cleanup AT barrier.cleanup/capability_claimed (epoch CUTOVER): the controller
//     journals intent/capability_issued/capability_claimed durably, then execute_barrier_cleanup raises
//     BEFORE the real barrier cleanup child runs. run_live rejects; durable head =
//     barrier.cleanup/capability_claimed/cutover (76 forward + 3 cleanup = 79 rows).
//   * RECOVER  — run_recover on that same container B / run root resumes the cleanup segment UNDER
//     CUTOVER (NO supervisor, NO recovery epoch — the controller's only cleanup path): the real frozen
//     barrier cleanup child runs FOR REAL (accepting database-barrier-input-checkpoint-cleanup-cutover.json),
//     drops q12_guard, promotes the exact 10-key v2 receipt, deletes the db capability (real R8-B-1
//     seam), and the controller appends capability_completed + accepted → 81 rows, +0 vs the twin.
//
// Found-defect #19 (ACCEPTED/RATIFIED): the +2 recovery-epoch composed story (recovery_reacquired +
// a second capability_claimed under cutover-recovery-1) is UNREACHABLE from the controller fusion for
// EITHER direction — forward: controller mints, barrier install child rejects (#18); cleanup: barrier
// cleanup child accepts, controller never mints (barrier.cleanup ∉ OPERATIONS; the cleanup driver is
// hardcoded cutover-only). It is deferred to the SERVER REHEARSAL (W-side / source-recovery-run.sh
// custody). See the artifact (.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-r8b-2-iv-2.md).
const REAL_PG17 = process.env.MC2_Q12_REAL_PG17 === '1';
const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const RUNNER = resolve(
  repoRoot,
  'packages/course-gen-platform/tests/unit/ops/fixtures/q12-live-real-cleanup-recovery-runner.py'
);

const FORWARD_PREFIX = 76;
const CLEANUP_ROWS = 5;
const TOTAL_ROWS = FORWARD_PREFIX + CLEANUP_ROWS; // 81
const CRASH_ROWS = FORWARD_PREFIX + 3; // intent + capability_issued + capability_claimed durable = 79

// The blessed/parity/convergence exclusion helpers, copied VERBATIM from q12-live-controller.test.ts
// (via q12-live-real-full-window.test.ts). NO broadening — a divergence outside these is a defect.
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
  lease_epoch: string;
  accepted_object_kind: string;
  accepted_object_sha256: string | null;
};

describe.runIf(REAL_PG17)(
  "Q12 R8-B-2-iv-3 (b'): real cutover cleanup-crash recover convergence on the §6b.6 head-8 leg (real PostgreSQL 17.10)",
  () => {
    it('crashes run_live mid-cleanup at barrier.cleanup/capability_claimed/cutover, then run_recover resumes the cleanup segment under cutover and converges byte-for-byte to the uninterrupted twin (+0, existing exclusions only)', () => {
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
        run_id: string;
        twin_seed_counts: {
          public: number;
          auth: number;
          storage: number;
          cron: number;
          net: number;
        };
        crash_seed_counts: {
          public: number;
          auth: number;
          storage: number;
          cron: number;
          net: number;
        };
        twin_catalog_sha256: string;
        crash_catalog_sha256: string;
        twin_journal: JournalRow[];
        crash_rc: number;
        crash_error: string;
        crashed_rows: JournalRow[];
        recover_rc: number;
        recover_error: string;
        recovered_rows: JournalRow[];
        activate_archive_state: string;
        guard_residue_db: {
          schema_count: number;
          relation_count: number;
          function_count: number;
          event_trigger_count: number;
        };
        v2_receipt: Record<string, unknown>;
        v2_receipt_keys: string[];
        v2_receipt_sha256: string;
        capability_exists_after: boolean;
        post_activate_cleanup_status: string;
        post_activate_resume_status: string;
        post_activate_resume_validated_sha256: string;
        child_executions: number;
      };

      // Disposable sources are the frozen full-Supabase inventory (both containers).
      expect(out.twin_seed_counts).toEqual({ public: 47, auth: 22, storage: 5, cron: 8, net: 0 });
      expect(out.crash_seed_counts).toEqual(out.twin_seed_counts);
      expect(out.twin_catalog_sha256).toMatch(/^[a-f0-9]{64}$/u);

      // ---- TWIN: the uninterrupted 81-row oracle ----------------------------------------------
      expect(out.twin_journal).toHaveLength(TOTAL_ROWS);
      const twinCleanup = out.twin_journal.slice(FORWARD_PREFIX);
      expect(twinCleanup.map(r => [r.command_id, r.outcome, r.lease_epoch])).toEqual([
        ['barrier.cleanup', 'intent', 'cutover'],
        ['barrier.cleanup', 'capability_issued', 'cutover'],
        ['barrier.cleanup', 'capability_claimed', 'cutover'],
        ['barrier.cleanup', 'capability_completed', 'cutover'],
        ['barrier.cleanup', 'accepted', 'cutover'],
      ]);

      // ---- CRASH: run_live rejected mid-cleanup at the claimed boundary -----------------------
      expect(out.crash_rc, out.crash_error).toBe(2);
      expect(out.crash_error).toMatch(
        /injected crash mid-cleanup at barrier\.cleanup\/capability_claimed\/cutover/u
      );
      expect(out.crashed_rows).toHaveLength(CRASH_ROWS);
      const crashHead = out.crashed_rows.at(-1)!;
      expect([crashHead.command_id, crashHead.outcome, crashHead.lease_epoch]).toEqual([
        'barrier.cleanup',
        'capability_claimed',
        'cutover',
      ]);
      // the crashed cleanup segment reached exactly intent → capability_issued → capability_claimed
      // (all cutover), and NEVER a capability_completed row (the real barrier cleanup child never ran).
      expect(out.crashed_rows.slice(FORWARD_PREFIX).map(r => [r.outcome, r.lease_epoch])).toEqual([
        ['intent', 'cutover'],
        ['capability_issued', 'cutover'],
        ['capability_claimed', 'cutover'],
      ]);
      expect(
        out.crashed_rows.some(
          r => r.command_id === 'barrier.cleanup' && r.outcome === 'capability_completed'
        )
      ).toBe(false);

      // ---- RECOVER: resumes the cleanup segment under CUTOVER → 81 rows, +0 vs the twin -------
      expect(out.recover_rc, out.recover_error).toBe(0);
      expect(out.recovered_rows).toHaveLength(TOTAL_ROWS);
      // explicit row-count arithmetic: +0 (cutover in-process resume, NOT the +2 recovery-epoch shape).
      expect(out.recovered_rows.length).toBe(out.twin_journal.length);
      expect(out.recovered_rows.length).toBe(CRASH_ROWS + 2);

      // the pre-crash rows (76 forward + 3 cleanup) are preserved BYTE-FOR-BYTE — recover APPENDED only.
      expect(out.recovered_rows.slice(0, CRASH_ROWS)).toEqual(out.crashed_rows);
      // recover appended exactly capability_completed + accepted, both under CUTOVER (no recovery epoch).
      expect(
        out.recovered_rows.slice(CRASH_ROWS).map(r => [r.command_id, r.outcome, r.lease_epoch])
      ).toEqual([
        ['barrier.cleanup', 'capability_completed', 'cutover'],
        ['barrier.cleanup', 'accepted', 'cutover'],
      ]);
      // NO recovery-epoch rows anywhere in the recovered journal (the whole point of #19's cleanup leg).
      expect(out.recovered_rows.some(r => r.outcome === 'recovery_reacquired')).toBe(false);
      for (const row of out.recovered_rows) {
        expect(row.lease_epoch).toBe('cutover');
      }

      // ---- the CONVERGENCE oracle (fixture head-8 MADE REAL): recovered == twin under the EXISTING
      //      blessed/parity/convergence exclusions ONLY. A divergence outside them is a FOUND DEFECT.
      expect(out.recovered_rows.map(withConvergenceExclusions)).toEqual(
        out.twin_journal.map(withConvergenceExclusions)
      );

      // ---- the REAL cleanup child + R8-B-1 seam completed during RECOVER ----------------------
      // the barrier really dropped q12_guard (zero residue), promoted the exact 10-key v2 receipt,
      // and the CONTROLLER deleted the db capability.
      expect(out.activate_archive_state).toBe('activated');
      expect(out.guard_residue_db).toEqual({
        schema_count: 0,
        relation_count: 0,
        function_count: 0,
        event_trigger_count: 0,
      });
      expect(out.capability_exists_after).toBe(false);
      // NB: child_executions counts forward-barrier launch_claim children; the recover leg drives ONLY
      // the cleanup segment (via --real-cleanup, not launch_claim), so it is legitimately 0 here — the
      // real-cleanup-ran evidence is the zero guard residue + deleted capability + promoted v2 receipt.

      // ---- terminal accepted cleanup row binds the EXACT 10-key v2 receipt --------------------
      const terminal = out.recovered_rows.at(-1)!;
      expect(terminal.command_id).toBe('barrier.cleanup');
      expect(terminal.outcome).toBe('accepted');
      expect(terminal.accepted_object_kind).toBe('database_barrier_receipt');
      expect(terminal.accepted_object_sha256).toBe(out.v2_receipt_sha256);
      expect(out.v2_receipt_keys).toEqual(V2_RECEIPT_KEYS);
      const v2 = out.v2_receipt;
      expect(v2.schema_version).toBe('megacampus.q12.database-barrier-receipt/v2');
      expect(v2.state).toBe('guard_cleanup_complete');
      expect(v2.zero_guard_residue).toBe(true);
      expect(v2.database_capability_deleted).toBe(true);

      // ---- receipt-validating resume stub ran on the recovered run ----------------------------
      expect(out.post_activate_cleanup_status).toBe('guard_cleanup_complete');
      expect(out.post_activate_resume_status).toBe('resumed');
      expect(out.post_activate_resume_validated_sha256).toBe(out.v2_receipt_sha256);
    }, 580_000);
  }
);
