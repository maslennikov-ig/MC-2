import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// W7a increment 1: the deployed owner-custody executor must EXECUTE an ordinary command's manifest
// argv for real (the in-window residual W5 bounded), not fixture-project it. This is infra-free (a
// trivial shell child writing a marker), so it runs on every box — no MC2_Q12_REAL_PG17 needed.
// Later increments (pg.backup/restore/source.forward/reindex/deploy) add PG17/Qdrant-gated suites.
const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const RUNNER = resolve(
  repoRoot,
  'packages/course-gen-platform/tests/unit/ops/fixtures/q12-production-ordinary-runner.py'
);

function driveRunner(): Record<string, unknown> {
  const result = spawnSync('/usr/bin/python3', [RUNNER], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  expect(result.status, `runner stderr:\n${result.stderr}`).toBe(0);
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

describe('W7a: production owner-custody execute_ordinary really runs the command', () => {
  it('shells the resolved manifest argv (marker proves real execution) and honours the RESULT_KEYS capability binding', () => {
    const out = driveRunner();

    // The seam exists on the DEPLOYED executor (not just the test fixture).
    expect(out.hasExecuteOrdinary, 'owner_custody_executor().execute_ordinary must exist').toBe(
      true
    );
    expect(out.executed, `execute_ordinary raised: ${String(out.error)}`).toBe(true);

    // Real execution: the child actually ran and produced its side effect.
    expect(out.markerExists).toBe(true);
    expect(out.markerBody).toBe('ran');

    // Contract: exactly RESULT_KEYS, capability bound to sha256(complete_object(capability)) so the
    // append_ordinary_lifecycle `!= digest` gate passes, status accepted.
    expect(out.resultKeysMatch).toBe(true);
    expect(out.capabilityBinds).toBe(true);
    expect(out.statusAccepted).toBe(true);

    // We took the REAL branch, not the hardcoded "q12-joined-fixture" projection.
    expect(out.distinctFromFixtureProjection).toBe(true);
  });

  // Design D3 (2026-07-26 window execution identity): writers.quiesce's FROZEN env declares
  // Q12_EXTERNAL_QUIESCE_LEASE_FD=9, but the ordinary path passed no descriptor at all, so the C2
  // child died at its own validate_external_quiesce_lease. The seam must mirror _invoke_resume
  // (close_fds=True, pass_fds=(9,)) for exactly the commands whose frozen env declares the lease.
  it('hands the canonical FD9 cutover lease to a child whose frozen env declares it, without rewriting the command', () => {
    const out = driveRunner();
    const lease = out.leaseCase as Record<string, unknown>;

    expect(lease.executed, `lease-case execute_ordinary raised: ${String(lease.error)}`).toBe(true);

    // The child's descriptor surface is the assertion: exactly 0/1/2 plus the lease, and the lease
    // resolves to the canonical cutover lock the controller holds LOCK_EX on.
    expect(lease.childFds).toEqual([0, 1, 2, 9]);
    expect(lease.leaseTargetIsCanonicalLock).toBe(true);

    // D7: launch-time mechanics never rewrite what is recorded.
    expect(lease.childEnvVerbatim).toBe(true);
    expect(lease.commandNotMutated).toBe(true);
  });

  it('keeps every other ordinary child at 0/1/2 even while the controller holds the lease', () => {
    const out = driveRunner();
    const noLease = out.noLeaseCase as Record<string, unknown>;

    // migration.base.apply's frozen env declares no lease, so it inherits nothing extra — proven
    // with descriptor 9 open and LOCK_EX-held in the parent, i.e. the descriptor WAS available.
    expect(noLease.executed, `no-lease execute_ordinary raised: ${String(noLease.error)}`).toBe(
      true
    );
    expect(noLease.childFds).toEqual([0, 1, 2]);
    expect(noLease.childEnvVerbatim).toBe(true);
    expect(noLease.commandNotMutated).toBe(true);
  });

  it('fails closed when a command declares a lease descriptor other than the frozen 9', () => {
    const out = driveRunner();
    const guard = out.leaseDeclarationGuard as Record<string, unknown>;

    expect(guard.refused, `guard did not refuse: ${String(guard.reason)}`).toBe(true);
    expect(guard.reason).toBe('manifested child lease descriptor is frozen to 9: 8');
  });

  // Review P2: a lost lease surfaced as a bare OSError from inside subprocess, AFTER the intent and
  // capability rows were already journalled. Unreachable in practice (main() holds LOCK_EX on 9 for
  // the whole run) but the operator must read a reason, not a traceback.
  it('names the failure when the canonical lease descriptor is not held at all', () => {
    const out = driveRunner();
    const absent = out.leaseDescriptorAbsent as Record<string, unknown>;

    expect(absent.prepared, 'descriptor 9 must be closed for this probe to mean anything').toBe(
      true
    );
    expect(absent.refused, `not a named refusal: ${String(absent.reason)}`).toBe(true);
    expect(absent.reason).toBe(
      "manifested child requires the controller's inherited lease descriptor 9"
    );
  });
});
