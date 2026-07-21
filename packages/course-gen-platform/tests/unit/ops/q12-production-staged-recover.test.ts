import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// W7a increment 4: the production staged-threading path must be RECOVER re-drive-safe (codesign
// §D2/§D3 resolve-once). A recover reconstructs the resolver from the persisted run-root authority
// (load_staged_values); re-driving a staged step with the SAME value is idempotent, with a DRIFTED
// value fails closed — and never corrupts the authority. This guards the new threaders
// (resolve_pg_backup_generation) against silent recover corruption. Infra-free (fake seam).
const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const RUNNER = resolve(
  repoRoot,
  'packages/course-gen-platform/tests/unit/ops/fixtures/q12-production-staged-recover-runner.py'
);

function driveRunner(): Record<string, unknown> {
  const result = spawnSync('/usr/bin/python3', [RUNNER], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  expect(result.status, `runner stderr:\n${result.stderr}`).toBe(0);
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

describe('W7a inc4: production staged threading is recover re-drive-safe (resolve-once)', () => {
  it('is idempotent on the same value and fails closed on drift without corrupting the authority', () => {
    const out = driveRunner();
    expect(out.idempotentSameValue).toBe(true);
    expect(out.driftFailsClosed).toBe(true);
    expect(out.authorityUncorrupted).toBe(true);
  });
});
