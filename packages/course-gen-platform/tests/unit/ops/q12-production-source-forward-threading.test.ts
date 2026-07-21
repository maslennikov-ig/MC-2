import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// W7a increment 3: the production drive-loop must THREAD the staged resolver between source.forward
// and reindex.plan. Codesign §D2/§D3: resolve_source_forward_acceptance reads the acceptance
// authority (via the executor's isolable read_source_forward_acceptance seam), advances the
// resolver's on_source_forward_accepted (recovery-manifest sha + coverage fingerprint/run), and
// re-persists — unblocking reindex.plan's three <accepted-*> placeholders. Infra-free (fake seam);
// the real acceptance read is MC2_Q12_REAL_PG17/W7-gated (plan Increment 5), and the base seam
// fail-closes with an explicit W5/W7 refusal (never a silent stub).
const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const RUNNER = resolve(
  repoRoot,
  'packages/course-gen-platform/tests/unit/ops/fixtures/q12-production-source-forward-threading-runner.py'
);

function driveRunner(): Record<string, unknown> {
  const result = spawnSync('/usr/bin/python3', [RUNNER], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  expect(result.status, `runner stderr:\n${result.stderr}`).toBe(0);
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

describe('W7a inc3: production drive-loop threads on_source_forward_accepted (source.forward → reindex.plan)', () => {
  it('reads the acceptance authority, advances the resolver, unblocks reindex.plan, and persists it', () => {
    const out = driveRunner();

    expect(out.hasThreader, 'resolve_source_forward_acceptance must exist').toBe(true);
    expect(out.hasSeam, 'OwnerCustodyExecutor.read_source_forward_acceptance must exist').toBe(
      true
    );
    // The real acceptance read is gated: the base seam must fail closed with a named W5/W7 refusal.
    expect(out.baseSeamGated, 'base read_source_forward_acceptance must fail-closed W5/W7').toBe(
      true
    );

    // The real gap this closes: reindex.plan cannot resolve until the staged step runs.
    expect(out.reindexBlockedBefore).toBe(true);

    expect(out.threaded, `threader raised: ${String(out.error)}`).toBe(true);
    expect(out.acceptanceResolved).toBe(true);
    expect(out.reindexResolvesAfter).toBe(true);

    expect(out.authorityPersisted).toBe(true);
    expect(out.authorityMode).toBe('0o400');
    expect(out.recoverDeterministic).toBe(true);
  });
});
