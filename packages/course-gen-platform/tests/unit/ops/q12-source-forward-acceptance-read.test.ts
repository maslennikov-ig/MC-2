import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// W7a real leg (read half): the DEPLOYED OwnerCustodyExecutor.read_source_forward_acceptance BASE
// seam must READ the on-disk source.forward acceptance authority (written by the TS emit-entrypoint
// into the run_root) and return the exact (recovery_manifest_sha256, coverage_fingerprint,
// coverage_run) triple — coverage_run being the `catalog:<recovery-run-id>` authority token
// (amendment 2026-07-25) — mirroring the proven read_pg_backup_generation pattern (parse + validate +
// fail-closed). Infra-free (a plain JSON file in a /tmp run_root); the real values are window-grade.
const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const RUNNER = resolve(
  repoRoot,
  'packages/course-gen-platform/tests/unit/ops/fixtures/q12-source-forward-acceptance-read-runner.py'
);

function driveRunner(): Record<string, unknown> {
  const result = spawnSync('/usr/bin/python3', [RUNNER], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  expect(result.status, `runner stderr:\n${result.stderr}`).toBe(0);
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

describe('W7a real leg: read_source_forward_acceptance reads the on-disk authority (fail-closed)', () => {
  it('returns the exact triple for a valid authority and fails closed on missing/malformed input', () => {
    const out = driveRunner();

    expect(out.hasSeam, 'OwnerCustodyExecutor.read_source_forward_acceptance must exist').toBe(
      true
    );
    expect(out.readOk, `read raised: ${String(out.error)}`).toBe(true);
    expect(out.missingFailsClosed).toBe(true);
    expect(out.malformedShaFailsClosed).toBe(true);
    expect(out.malformedRunFailsClosed).toBe(true);
    expect(out.legacyTripleFailsClosed).toBe(true);
  });
});
