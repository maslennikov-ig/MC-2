import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// W7a increment 2: the deployed production drive-loop must THREAD the staged resolver between
// pg.backup and pg.restore. Codesign §D2/§D3: resolve_pg_backup_generation reads the generation
// authority (via the executor's isolable read_pg_backup_generation seam), advances the resolver's
// on_pg_backup_done, and re-persists the run-root staged authority — unblocking pg.restore's
// <immutable-generation>. Infra-free (fake authority seam), so it runs on every box; the real
// latest.json/PG17 leg is MC2_Q12_REAL_PG17/W7-gated (plan Increment 5).
const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const RUNNER = resolve(
  repoRoot,
  'packages/course-gen-platform/tests/unit/ops/fixtures/q12-production-staged-threading-runner.py'
);

function driveRunner(): Record<string, unknown> {
  const result = spawnSync('/usr/bin/python3', [RUNNER], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  expect(result.status, `runner stderr:\n${result.stderr}`).toBe(0);
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

describe('W7a inc2: production drive-loop threads on_pg_backup_done (pg.backup → pg.restore)', () => {
  it('reads the generation authority, advances the resolver, unblocks pg.restore, and persists it', () => {
    const out = driveRunner();

    // The staged threader + its isolable executor seam must exist on the DEPLOYED surfaces.
    expect(out.hasThreader, 'resolve_pg_backup_generation must exist').toBe(true);
    expect(out.hasSeam, 'OwnerCustodyExecutor.read_pg_backup_generation must exist').toBe(true);

    // The real gap this closes: pg.restore cannot resolve until the staged step runs.
    expect(out.restoreBlockedBefore).toBe(true);

    expect(out.threaded, `threader raised: ${String(out.error)}`).toBe(true);
    expect(out.generationResolved).toBe(true);
    expect(out.restoreResolvesAfter).toBe(true);

    // §D3 single authority: persisted, owner-only, and a recover reload recomputes the identical
    // pg.restore command_sha256 (compose↔claim determinism).
    expect(out.authorityPersisted).toBe(true);
    expect(out.authorityMode).toBe('0o400');
    expect(out.recoverDeterministic).toBe(true);
  });
});
