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
});
