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
