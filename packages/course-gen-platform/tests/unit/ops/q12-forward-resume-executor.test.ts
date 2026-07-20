import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';
import { RUN_REAL_CONTROLLER } from './fixtures/q12-real-controller-gate.js';

// Design §W1 — the REAL owner-custody forward-resume seam
// (deploy/qdrant/q12-lifecycle-core.py::OwnerCustodyExecutor.execute_forward_resume). This is the
// production RESUME half of the post-activate cutover: after the barrier cleanup produced the exact
// 10-key database-barrier-receipt/v2, the owner-custody child fail-closed VALIDATES that v2 receipt
// (byte twin of q12-writer-resume.py:1088-1134) and then drives the REAL writer-fleet resume
// (source-recovery-run.sh --operation resume-writers-only --resume-mode forward --run-id <run-id>)
// under the inherited FD9 cutover lease. The only boundary that cannot run in a unit — actually
// shelling the writer fleet — is isolated behind _invoke_resume; everything else runs for real.

const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const RUNNER = resolve(
  repoRoot,
  'packages/course-gen-platform/tests/unit/ops/fixtures/q12-forward-resume-runner.py'
);

const roots: string[] = [];
afterEach(() => {
  for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true });
});
function root(): string {
  const value = mkdtempSync('/tmp/mc2-q12-w1-root-');
  roots.push(value);
  return value;
}
function drive(mode: string): Record<string, unknown> {
  const result = spawnSync('/usr/bin/python3', [RUNNER, mode, root()], {
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
  'Q12 W1: OwnerCustodyExecutor.execute_forward_resume (real owner-custody resume)',
  () => {
    it('validates the v2 receipt, drives the frozen writers.resume.forward child under the FD9 lease, and binds the validated receipt sha', () => {
      const out = drive('--invoke');
      const resume = out.resume as Record<string, unknown>;

      // Receipt-sha binding: the resume child returns the sha256 of the exact v2 receipt on disk, so
      // the controller's `resume.validated_receipt_sha256 == receipt_sha256` gate passes.
      expect(resume.status).toBe('resumed');
      expect(resume.ok).toBe(true);
      expect(resume.validated_receipt_sha256).toBe(out.seeded_v2_sha256);
      expect(resume.validated_receipt_sha256).toMatch(HEX64);

      // The writer-fleet resume is driven exactly once, with the frozen manifest's
      // writers.resume.forward argv (only <run-id> substituted, to the cutover run id).
      expect(out.invoke_count).toBe(1);
      expect(out.resume_argv).toEqual([
        '/opt/megacampus/deploy/qdrant/source-recovery-run.sh',
        '--operation',
        'resume-writers-only',
        '--resume-mode',
        'forward',
        '--run-id',
        out.run_id,
      ]);

      // The frozen manifest env carries the FD9 external-quiesce lease the child inherits.
      const env = out.resume_env as Record<string, string>;
      expect(env.Q12_EXTERNAL_QUIESCE_LEASE_FD).toBe('9');
      expect(env.PATH).toBe('/usr/sbin:/usr/bin:/sbin:/bin');
      expect(env.LC_ALL).toBe('C');
      expect(env.LANG).toBe('C');
      expect(env.HOME).toBe('/root');
    });

    it('fails closed on a non-terminal v2 receipt BEFORE driving the writer fleet', () => {
      const out = drive('--tampered');
      expect(out.error_type).toBe('LifecycleError');
      expect(out.error as string).toMatch(/barrier receipt/u);
      // Fail-closed-before-drive: the writer-fleet resume child must NOT have been invoked.
      expect(out.invoke_count).toBe(0);
    });

    it('fails closed on a hash-consistent but semantically dirty probe projection BEFORE driving the writer fleet', () => {
      const out = drive('--tampered-projection');
      expect(out.error_type).toBe('LifecycleError');
      expect(out.error as string).toMatch(/nested projection is not exact/u);
      // Fail-closed-before-drive holds for the dirty-projection tamper class too (twins
      // q12-writer-resume.py:1122-1134, the cited authority).
      expect(out.invoke_count).toBe(0);
    });

    it('fails closed when the real writer-fleet resume child exits nonzero (real _invoke_resume)', () => {
      const out = drive('--child-nonzero');
      expect(out.error_type).toBe('LifecycleError');
      expect(out.error as string).toMatch(/resume/u);
    });

    it('wires main() live/recover to the owner-custody executor that passes the pre-flight', () => {
      const out = drive('--preflight');
      expect(out.factory_is_owner_custody).toBe(true);
      expect(out.factory_type).toBe('OwnerCustodyExecutor');
      // require_post_activate_executor no longer refuses the wired executor.
      expect(out.preflight_error).toBe('');
      expect(out.wired_has_forward_resume).toBe(true);
      expect(out.wired_has_barrier_cleanup).toBe(true);
      // The bare ProductionExecutor still lacks the resume hook (q12-production-executor-cleanup
      // fail-closed semantics preserved).
      expect(out.bare_has_forward_resume).toBe(false);
    });
  }
);
