import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// R8-B-2-iv-2: the REAL crash + fail-closed-refusal leg of the §6b.6 composed mid-barrier recovery,
// on the ratified DUAL-BIND fusion harness (one disposable postgres:17.10 loopback container). This is
// the REAL twin of the FIXTURE proof q12-live-controller.test.ts:1102-1145 ("mid-lifecycle barrier head
// (claimed-not-completed) fails closed WITH the standalone-supervisor pointer").
//
//   * PHASE CRASH — run_live crashes mid-`barrier.install` AT `capability_claimed` (the two-process
//     boundary): the delegated install claim durably journals its `capability_claimed/cutover` row and
//     then raises BEFORE the real barrier runs, so run_live rejects with the durable head left at
//     `barrier.install/capability_claimed/cutover`. The REAL install barrier never executes.
//   * PHASE REFUSAL — a SEPARATE lease session reacquires the released canonical FD-9 lease and runs
//     run_recover on that mid-lifecycle claimed head. run_recover FAILS CLOSED with the EXACT
//     `q12-live-cutover.sh install` standalone-supervisor pointer and leaves the durable journal
//     BYTE-for-byte unchanged (§6b.6 condition 7 / the R5-D2 pointer path).
//
// The supervisor + recover CONVERGENCE tail of §6b.6 (recovery_reacquired + a second capability_claimed
// + completed under cutover-recovery-1, then recover to the full composed journal) is NOT asserted here:
// the frozen barrier `install` command is cutover-only (q12-database-barrier.sh:420-433 pins the install
// input checkpoint to `lease_epoch == "cutover"`; only cleanup/rollback carry the recovery-epoch grammar
// at :444-598), so a REAL forward-op recovery-epoch re-claim cannot COMPLETE against the real barrier
// without a frozen-barrier edit (re-ratification). Empirically confirmed and reported in the artifact
// (.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-r8b-2-iv-2.md).
const REAL_PG17 = process.env.MC2_Q12_REAL_PG17 === '1';
const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const RUNNER = resolve(
  repoRoot,
  'packages/course-gen-platform/tests/unit/ops/fixtures/q12-live-real-composed-recovery-runner.py'
);

describe.runIf(REAL_PG17)(
  'Q12 R8-B-2-iv-2: real crash + fail-closed recover refusal on the §6b.6 mid-barrier head (real PostgreSQL 17.10)',
  () => {
    it('crashes run_live mid-barrier.install at capability_claimed, then run_recover fails closed with the standalone-supervisor pointer and leaves the journal byte-unchanged', () => {
      const result = spawnSync('/usr/bin/python3', [RUNNER], {
        encoding: 'utf8',
        timeout: 300_000,
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
        crash_rc: number;
        crash_error: string;
        crashed_rows_len: number;
        crashed_head: { command_id: string; outcome: string; lease_epoch: string };
        crashed_tail_shape: [string, string, string][];
        refusal_rc: number;
        refusal_error: string;
        journal_byte_unchanged: boolean;
        journal_after_crash_sha256: string;
        journal_after_refusal_sha256: string;
      };

      // Disposable source is the frozen full-Supabase inventory.
      expect(out.seed_counts).toEqual({ public: 47, auth: 22, storage: 5, cron: 8, net: 0 });
      expect(out.catalog_sha256).toMatch(/^[a-f0-9]{64}$/u);

      // ---- PHASE CRASH: run_live rejected at the two-process claim boundary ----
      expect(out.crash_rc).toBe(2);
      // delegate_claim surfaces the restartRequired boundary the crash seam injected.
      expect(out.crash_error).toMatch(/injected delegated restart at claim-row/u);
      // durable head left EXACTLY at barrier.install/capability_claimed/cutover (the REAL install
      // barrier never executed — the crash raises after the claim row is durable, before execute()).
      expect(out.crashed_head).toEqual({
        command_id: 'barrier.install',
        outcome: 'capability_claimed',
        lease_epoch: 'cutover',
      });
      // the crashed tail head is the install group's claimed row, and the install barrier NEVER
      // reached a completed row (the crash raised after the claim row, before the real barrier ran).
      const tail = out.crashed_tail_shape;
      expect(tail.at(-1)).toEqual(['barrier.install', 'capability_claimed', 'cutover']);
      expect(
        tail.some(([command, outcome]) => command === 'barrier.install' && outcome === 'completed')
      ).toBe(false);

      // ---- PHASE REFUSAL: run_recover fails closed on the mid-lifecycle claimed head ----
      expect(out.refusal_rc).toBe(2);
      expect(out.refusal_error).toMatch(/recover does not support resuming from/u);
      expect(out.refusal_error).toMatch(/command=barrier\.install/u);
      expect(out.refusal_error).toMatch(/outcome=capability_claimed/u);
      // the R5-D2 standalone-supervisor pointer is present (a MID-LIFECYCLE barrier head keeps it).
      expect(out.refusal_error).toMatch(/q12-live-cutover\.sh install/u);

      // ---- the refusal did NOT continue: the durable journal is byte-for-byte unchanged ----
      expect(out.journal_byte_unchanged).toBe(true);
      expect(out.journal_after_refusal_sha256).toBe(out.journal_after_crash_sha256);
    }, 320_000);
  }
);
