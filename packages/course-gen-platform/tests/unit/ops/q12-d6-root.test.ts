import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// D6 activation-truth Root coordinator (Tasks 16-19) RED/GREEN gates.
//
// Every scenario runs against the production deploy/qdrant/q12-lifecycle-core.py
// through the synthetic driver fixtures/q12-d6-root-runner.py. No live/remote
// action occurs: secrets, descriptors, and epochs are synthetic. Pinned-server
// capability observations (atomic POSIX_SPAWN_CLOSEFROM on the server, real
// pidfd/ptrace/Yama policy) stay behind the separately authorized remote gate and
// are asserted here only as local capability presence, never faked green.

const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const RUNNER = join(
  repoRoot,
  'packages/course-gen-platform/tests/unit/ops/fixtures/q12-d6-root-runner.py'
);

interface RunnerResult {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

function runScenario(payload: Record<string, unknown>): RunnerResult {
  const probe = spawnSync('/usr/bin/python3', [RUNNER], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin', LC_ALL: 'C.UTF-8', LANG: 'C.UTF-8', HOME: '/var/empty' },
  });
  expect(probe.status, probe.stderr).toBe(0);
  return JSON.parse(probe.stdout) as RunnerResult;
}

describe('Task 16 — D6 posix_spawn boundary + FD map/close-from', () => {
  const mapped = { 1: 21, 2: 22, 3: 23, 4: 24, 5: 25, 6: 26, 7: 27, 9: 9, 10: 30, 11: 31 };

  it('builds the exact ordered posix_spawn file-action sequence', () => {
    const result = runScenario({ scenario: 'spawn_file_actions', sources: mapped });
    expect(result.ok, result.error).toBe(true);
    expect(result.closefrom_capability).toBe(true);
    expect(result.actions).toEqual([
      ['open', 0, '/dev/null', 0, 0],
      ['dup2', 21, 1],
      ['dup2', 22, 2],
      ['dup2', 23, 3],
      ['close', 23],
      ['dup2', 24, 4],
      ['close', 24],
      ['dup2', 25, 5],
      ['close', 25],
      ['dup2', 26, 6],
      ['close', 26],
      ['dup2', 27, 7],
      ['close', 27],
      ['dup2', 30, 10],
      ['close', 30],
      ['dup2', 31, 11],
      ['close', 31],
      ['close', 8],
      ['closefrom', 12],
    ]);
  });

  it('refuses a mapped source descriptor below the close-from line (no silent fallback)', () => {
    const result = runScenario({
      scenario: 'spawn_file_actions',
      sources: { ...mapped, 3: 5 },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/close-from|below|source descriptor/i);
  });

  it('rejects an incomplete descriptor map', () => {
    const result = runScenario({
      scenario: 'spawn_file_actions',
      sources: { 1: 21, 2: 22, 3: 23 },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/target|descriptor|map/i);
  });

  it('maps and close-froms descriptors under pressure leaving nothing above 11', () => {
    const result = runScenario({ scenario: 'spawn_under_pressure', pressure: 96 });
    expect(result.ok, result.error).toBe(true);
    expect(result.closefrom_capability).toBe(true);
    expect(result.exit_status).toBe(0);
    // FD 8 explicitly closed; every runtime descriptor above 11 close-from'd.
    expect(result.child_fds).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11]);
  });

  it('accepts a correctly-owned 0400 or 0600 secret source', () => {
    for (const mode of ['0400', '0600']) {
      const result = runScenario({
        scenario: 'validate_secret',
        mode,
        accept_modes: ['0400', '0600'],
        owner: 'self',
      });
      expect(result.ok, result.error).toBe(true);
      expect(typeof result.ino).toBe('number');
    }
  });

  it('rejects wrong owner, wrong mode, and a symlinked secret source', () => {
    const wrongOwner = runScenario({
      scenario: 'validate_secret',
      mode: '0400',
      accept_modes: ['0400', '0600'],
      owner: 'other',
    });
    expect(wrongOwner.ok).toBe(false);
    expect(wrongOwner.error).toMatch(/unsafe file identity/i);

    const wrongMode = runScenario({
      scenario: 'validate_secret',
      mode: '0644',
      accept_modes: ['0400', '0600'],
      owner: 'self',
    });
    expect(wrongMode.ok).toBe(false);
    expect(wrongMode.error).toMatch(/unsafe file identity/i);

    const symlinked = runScenario({
      scenario: 'validate_secret',
      mode: '0400',
      accept_modes: ['0400', '0600'],
      owner: 'self',
      symlink: true,
    });
    expect(symlinked.ok).toBe(false);
    expect(symlinked.error).toMatch(/symlink|ELOOP|NOFOLLOW|unsafe/i);
  });
});
