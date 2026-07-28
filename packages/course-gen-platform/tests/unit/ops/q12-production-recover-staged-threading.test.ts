import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// W7a: the production staged threading (codesign §D2/§D3) must fire on the RECOVER re-drive path,
// not only on run_live's first drive. Two recover heads re-drive a staged step — head 1
// (barrier.install/completed -> writers.quiesce, which re-drives pg.backup) and head 4
// (barrier.prepare-recovery/completed -> source.forward). Without the threading the NEXT command
// fails closed with "unresolved command placeholder", and that happens AFTER C2 has quiesced the
// production writers. Infra-free: fake authority-read seams, real drive_forward_sequence.
const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const RUNNER = resolve(
  repoRoot,
  'packages/course-gen-platform/tests/unit/ops/fixtures/q12-production-recover-staged-threading-runner.py'
);

type Head = {
  reached: boolean;
  resolved?: boolean;
  error?: string;
};

function driveRunner(): { head1: Head; head4: Head } {
  const result = spawnSync('/usr/bin/python3', [RUNNER], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  expect(result.status, `runner stderr:\n${result.stderr}`).toBe(0);
  return JSON.parse(result.stdout) as { head1: Head; head4: Head };
}

describe('W7a: production staged threading fires on the recover re-drive path', () => {
  it('head 1 (re-drives pg.backup): pg.restore resolves <immutable-generation> without a caller-supplied hook', () => {
    const { head1 } = driveRunner();
    expect(head1.reached).toBe(true);
    expect(head1.error).toBeUndefined();
    expect(head1.resolved).toBe(true);
  });

  it('head 4 (re-drives source.forward): reindex.plan resolves the accepted coverage binding', () => {
    const { head4 } = driveRunner();
    expect(head4.reached).toBe(true);
    expect(head4.error).toBeUndefined();
    expect(head4.resolved).toBe(true);
  });
});
