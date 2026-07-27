import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';
import { RUN_REAL_CONTROLLER } from './fixtures/q12-real-controller-gate.js';

// Design §6b.1 R8-B-1 — the REAL ProductionExecutor post-activate FILE-ARTIFACT seam (no docker,
// no PostgreSQL, no barrier child run). This exercises the production twin of the fixture's
// LiveOrdinaryExecutor.execute_barrier_cleanup: the actual
// deploy/qdrant/q12-lifecycle-core.py::ProductionExecutor.prepare_barrier_cleanup +
// execute_barrier_cleanup, driven against seeded producer artifacts on a temp run root. The REAL
// full-window barrier cleanup child (which produces the terminal proof against a live PG17) is
// downstream R8-B-2. See the runner fixture for the seeding contract.
//
// Two proofs:
//  1. FILE-ARTIFACT: the real seam archives the activate v1 receipt, promotes it in place to the
//     exact 10-key v2 (megacampus.q12.database-barrier-receipt/v2) binding the REAL on-disk
//     terminal-proof + probe-receipt digests, and deletes the db-capability — a byte twin of the
//     fixture's v2 for the same inputs.
//  2. RESUME FAIL-CLOSED: after R8-B-1 the pre-flight no longer fails for the file-artifact reason
//     (execute_barrier_cleanup is now on ProductionExecutor), but a production run still fails
//     closed with the resume-SPECIFIC named error because execute_forward_resume is deliberately
//     server-side/absent, and it fires at the pre-flight (before Engine construction / the
//     production run-root coupling).

const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const RUNNER = resolve(
  repoRoot,
  'packages/course-gen-platform/tests/unit/ops/fixtures/q12-production-executor-cleanup-runner.py'
);

const roots: string[] = [];

afterEach(() => {
  for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true });
});

function root(): string {
  const value = mkdtempSync('/tmp/mc2-q12-r8b1-root-');
  roots.push(value);
  return value;
}

function drive(mode: string, runRoot: string, controller?: string): Record<string, unknown> {
  const args = [RUNNER, mode, runRoot];
  if (controller) args.push(controller);
  const result = spawnSync('/usr/bin/python3', args, {
    encoding: 'utf8',
    timeout: 60_000,
    env: { PATH: process.env.PATH, LC_ALL: 'C', LANG: 'C' },
    maxBuffer: 16 * 1024 * 1024,
  });
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

const HEX64 = /^[a-f0-9]{64}$/u;

describe.runIf(RUN_REAL_CONTROLLER)(
  'Q12 R8-B-1: REAL ProductionExecutor post-activate FILE-ARTIFACT seam',
  () => {
    it('archives v1, promotes the exact 10-key v2 byte twin, and deletes the db-capability', () => {
      const out = drive('--file-artifact', root());

      // prepare_barrier_cleanup returns the fixture-shaped {argv, command_sha256} for the frozen
      // q12-database-barrier.sh cleanup invocation.
      const command = out.command as { argv: string[]; command_sha256: string };
      expect(Array.isArray(command.argv)).toBe(true);
      expect(command.argv).toContain('cleanup');
      expect(command.argv[command.argv.length - 2]).toBe(
        '--expected-post-migration-catalog-sha256'
      );
      expect(command.argv[command.argv.length - 1]).toBe(out.expected_catalog_sha256);
      expect(command.argv).toContain('--q12-db-capability-file');
      expect(command.command_sha256).toMatch(HEX64);

      // The 10-key v2 receipt is byte-identical to the independently recomputed contract projection.
      expect(out.v2_matches_expected).toBe(true);
      expect(out.v2_keys).toEqual([
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
      expect(out.v2_mode).toBe(0o400);

      const v2 = JSON.parse(out.v2_bytes_utf8 as string) as Record<string, unknown>;
      expect(v2.schema_version).toBe('megacampus.q12.database-barrier-receipt/v2');
      expect(v2.run_id).toBe(out.run_id);
      expect(v2.state).toBe('guard_cleanup_complete');
      expect(v2.zero_guard_residue).toBe(true);
      expect(v2.last_command).toBe('cleanup');
      expect(v2.rollback_probes_verified).toBe(true);
      expect(v2.database_capability_deleted).toBe(true);
      expect(v2.expected_catalog_sha256).toBe(out.expected_catalog_sha256);
      // The digests bind the REAL on-disk producer artifacts, not fabricated values.
      expect(v2.terminal_proof_sha256).toBe(out.seeded_terminal_sha256);
      expect(v2.probe_receipt_sha256).toBe(out.seeded_probe_sha256);
      expect(v2.terminal_proof_sha256).toMatch(HEX64);
      expect(v2.probe_receipt_sha256).toMatch(HEX64);

      // The v1 activate receipt is archived byte-exact at the frozen barrier's archive path (0400).
      expect(out.archive_matches_seeded_v1).toBe(true);
      expect(out.archive_mode).toBe(0o400);

      // The db-capability is deleted.
      expect(out.capability_exists).toBe(false);
      expect(out.capability_mode).toBe(null);

      // The returned cleanup outcome shape orchestrate_post_activate_cleanup consumes.
      const outcome = out.outcome as Record<string, unknown>;
      expect(outcome.status).toBe('guard_cleanup_complete');
      expect(outcome.ok).toBe(true);
      expect(outcome.cleanup_receipt_sha256).toMatch(HEX64);
      expect(outcome.terminal_proof_sha256).toBe(out.seeded_terminal_sha256);
      expect(outcome.probe_receipt_sha256).toBe(out.seeded_probe_sha256);
      expect(outcome.cleanup_receipt_path).toBe(
        resolve(roots[roots.length - 1], 'database-barrier-receipt.json')
      );
      expect(outcome.cleanup_receipt_archive_path).toBe(
        resolve(roots[roots.length - 1], 'database-barrier-receipt-v1-before-cleanup.json')
      );
    });

    it('production run_live fails closed with the resume-specific named error at the pre-flight', () => {
      const out = drive('--resume-failclosed', root(), 'run_live');
      expect(out.error_type).toBe('LifecycleError');
      expect(out.error).toBe(
        'writers.resume.forward requires the server-side owner-custody executor (not wired here)'
      );
      // Pre-flight fires BEFORE Engine construction: a /tmp run root under production=true would
      // otherwise raise "production run root mismatch"; getting the resume-specific error proves the
      // pre-flight ran first and left the run root untouched.
      expect(out.error).not.toMatch(/production run root mismatch/u);
      expect(out.run_root_created_journal).toBe(false);
      // The file-artifact check now passes (execute_barrier_cleanup present); only resume is absent.
      expect(out.has_execute_barrier_cleanup).toBe(true);
      expect(out.has_execute_forward_resume).toBe(false);
    });

    it('production run_recover fails closed with the same resume-specific named error', () => {
      const out = drive('--resume-failclosed', root(), 'run_recover');
      expect(out.error_type).toBe('LifecycleError');
      expect(out.error).toBe(
        'writers.resume.forward requires the server-side owner-custody executor (not wired here)'
      );
      expect(out.run_root_created_journal).toBe(false);
    });
  }
);

// mc2-fjcj2 — R8-B-2, the half R8-B-1 deliberately deferred and nobody tracked: the frozen
// `q12-database-barrier.sh cleanup` child was never invoked by ANY production code path.
// orchestrate_post_activate_cleanup calls executor.execute_barrier_cleanup, production resolves
// that to ProductionExecutor's FILE-ARTIFACT seam, and that seam opens by READING the 18-key
// terminal proof only the child produces — so a real window failed closed on a missing proof AFTER
// activate, i.e. past the point of no return with the writers still stopped. The fixtures ran the
// child themselves (q12-retained-barrier-runner.py RealBarrierCleanupChild and the real-PG17
// full-window runner), which is why every suite stayed green: the same fixture-stands-in-for-
// production shape as mc2-orsez.
//
// The owner-custody executor now owns the child, and the ORDER is part of the contract: the frozen
// child refuses unless database-barrier-receipt-v1-before-cleanup.json already exists byte-exact
// (q12-database-barrier.sh:640-645), which the inherited file-artifact seam only published AFTER the
// child. So the archive must be published BEFORE the launch.
describe.runIf(RUN_REAL_CONTROLLER)(
  'Q12 R8-B-2: the owner-custody executor runs the frozen barrier cleanup child',
  () => {
    it('is owned by production code, not by a fixture', () => {
      const out = drive('--owner-custody-ownership', root());
      expect(out.owner_custody_defines_execute_barrier_cleanup).toBe(true);
      expect(out.owner_custody_defines_child_invoker).toBe(true);
      // The inherited file-artifact seam stays where it is; R8-B-2 wraps it, never replaces it.
      expect(out.production_defines_execute_barrier_cleanup).toBe(true);
    });

    it('publishes the v1 archive BEFORE launching the child, then promotes the exact v2', () => {
      const out = drive('--owner-custody-cleanup', root());

      // (a) the frozen child's predecessor-archive gate is satisfied at launch time, byte-exact.
      expect(out.archive_existed_at_child_launch).toBe(true);
      expect(out.archive_matched_v1_at_child_launch).toBe(true);
      expect(out.archive_mode_at_child_launch).toBe(0o400);
      // (b) the child was launched with the frozen argv prepare_barrier_cleanup resolved, verbatim.
      expect(out.child_argv).toEqual((out.command as Record<string, unknown>).argv);
      // (c) and only after it returned did the inherited seam promote the exact 10-key v2 and
      //     delete the db-capability.
      expect(out.terminal_proof_existed_at_child_launch).toBe(false);
      expect(out.v2_matches_expected).toBe(true);
      expect(out.capability_exists).toBe(false);
    });

    // This drives the REAL invoke_barrier_cleanup_child: a real subprocess, the real returncode
    // handling, the real scrub and the real env. Faking the raise here would make the scrub
    // assertion vacuous — a mutation dropping the redactor passed until this was tightened.
    it('fails closed with the child own scrubbed words and mutates nothing', () => {
      const out = drive('--owner-custody-child-fails', root());

      expect(out.child_ran).toBe(true);
      expect(out.error_type).toBe('LifecycleError');
      expect(out.error).toMatch(/barrier cleanup child failed with status 3/u);
      // The child's own reason must survive — a blind refusal after activate is the worst case.
      expect(out.error).toMatch(/refused for a named reason/u);
      // ...but its secrets must not: a 64-hex run of secret shape and a DSN password are redacted.
      expect(out.error).toContain('***');
      expect(out.error).not.toContain('b'.repeat(64));
      expect(out.error).not.toContain('hunter2');
      // Nothing was promoted: the receipt is still the activate v1 and the capability still exists.
      expect(out.receipt_still_v1).toBe(true);
      expect(out.capability_exists).toBe(true);
    });

    // barrier.cleanup is not a manifest command, so this executor chooses the child's env. The
    // manifest's frozen HOME=/root is unusable for a uid-1000 child (mc2-wwc9l), and the barrier
    // refuses outright if any MC2_Q12_* test override leaks in (q12-database-barrier.sh:115-117).
    it('gives the child a usable HOME and no test overrides', () => {
      const out = drive('--owner-custody-child-fails', root());

      expect(out.child_ran).toBe(true);
      expect(out.child_home).toBe(out.expected_home);
      expect(out.child_home).not.toBe('/root');
      expect(out.child_env_has_test_overrides).toBe(false);
      expect(out.child_env_keys).toEqual(['HOME', 'LANG', 'LC_ALL', 'PATH']);
    });
  }
);
