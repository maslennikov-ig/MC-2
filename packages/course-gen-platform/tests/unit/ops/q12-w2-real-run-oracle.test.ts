import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// Design W2-oracle (co-design docs/superpowers/specs/2026-07-20-q12-w2-w3-staged-execution-codesign.md
// D4 LOCKED, plan Task 4). A real cutover run is accepted iff (1) every real child exited 0 AND (2)
// the barrier receipt v2 reached guard_cleanup_complete (state machine intact) AND (3) coverage
// evidence (org:course:run) is present in the recovery journal. Byte-parity does NOT gate a real run
// (the fixture parity suite stays the mechanics oracle, checked separately). This suite encodes D4
// structurally; the real-evidence leg (real children, real receipt, real journal) is exercised at
// W5 (rehearsal) / W7 (owner-gated window).
const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const CORE = join(repoRoot, 'deploy/qdrant/q12-lifecycle-core.py');
const ENV = { PATH: process.env.PATH ?? '/usr/bin:/bin', LC_ALL: 'C', LANG: 'C' };

const HEADER = [
  'import importlib.util, sys, json',
  's=importlib.util.spec_from_file_location("q12", sys.argv[1])',
  'm=importlib.util.module_from_spec(s); sys.modules[s.name]=m; s.loader.exec_module(m)',
  'GOOD_RECEIPT={"state":"guard_cleanup_complete"}',
  'GOOD_JOURNAL={"coverage":"11111111-1111-4111-8111-111111111111:course-x:run-y"}',
];

function run(lines: string[]): { status: number | null; stdout: string; stderr: string } {
  const child = spawnSync('/usr/bin/python3', ['-c', [...HEADER, ...lines].join('\n'), CORE], {
    encoding: 'utf8',
    env: ENV,
  });
  return { status: child.status, stdout: child.stdout, stderr: child.stderr };
}

describe('Q12 W2-oracle: accept_real_run (D4 LOCKED)', () => {
  it('accepts when all children exit 0, the receipt is terminal, and coverage is present', () => {
    const { status, stdout, stderr } = run([
      'm.accept_real_run([0, 0, 0], GOOD_RECEIPT, GOOD_JOURNAL)', // must NOT raise
      'print("W2_ORACLE_ACCEPT_OK")',
    ]);
    expect(stderr).toBe('');
    expect(status).toBe(0);
    expect(stdout).toContain('W2_ORACLE_ACCEPT_OK');
  });

  it('rejects when any real child exited non-zero', () => {
    const { status, stdout, stderr } = run([
      'refused=False',
      'try:\n m.accept_real_run([0, 1, 0], GOOD_RECEIPT, GOOD_JOURNAL)\nexcept m.LifecycleError:\n refused=True',
      'assert refused, "non-zero child exit was not rejected"',
      'print("W2_ORACLE_CHILD_OK")',
    ]);
    expect(stderr).toBe('');
    expect(status).toBe(0);
    expect(stdout).toContain('W2_ORACLE_CHILD_OK');
  });

  it('rejects when the barrier receipt did not reach guard_cleanup_complete', () => {
    const { status, stdout, stderr } = run([
      'refused=False',
      'try:\n m.accept_real_run([0,0,0], {"state":"guard_install_complete"}, GOOD_JOURNAL)' +
        '\nexcept m.LifecycleError:\n refused=True',
      'assert refused, "non-terminal receipt was not rejected"',
      'print("W2_ORACLE_RECEIPT_OK")',
    ]);
    expect(stderr).toBe('');
    expect(status).toBe(0);
    expect(stdout).toContain('W2_ORACLE_RECEIPT_OK');
  });

  it('rejects when coverage evidence (org:course:run) is absent or malformed', () => {
    const { status, stdout, stderr } = run([
      'refused=0',
      'for bad in [{}, {"coverage":""}, {"coverage":"only:two"}, {"coverage":"a::c"}]:',
      ' try:\n  m.accept_real_run([0,0,0], GOOD_RECEIPT, bad)\n except m.LifecycleError:\n  refused+=1',
      'assert refused==4, refused',
      'print("W2_ORACLE_COVERAGE_OK")',
    ]);
    expect(stderr).toBe('');
    expect(status).toBe(0);
    expect(stdout).toContain('W2_ORACLE_COVERAGE_OK');
  });

  // Byte-parity independence: a real run whose coverage differs from any fixture golden is still
  // accepted — the oracle checks the state machine + evidence, never fixture bytes (D4).
  it('does not gate a real run on fixture byte-parity (arbitrary valid coverage accepted)', () => {
    const { status, stdout, stderr } = run([
      'm.accept_real_run([0], GOOD_RECEIPT, {"coverage":"org-Z:course-Z:run-Z"})',
      'print("W2_ORACLE_NOPARITY_OK")',
    ]);
    expect(stderr).toBe('');
    expect(status).toBe(0);
    expect(stdout).toContain('W2_ORACLE_NOPARITY_OK');
  });
});
