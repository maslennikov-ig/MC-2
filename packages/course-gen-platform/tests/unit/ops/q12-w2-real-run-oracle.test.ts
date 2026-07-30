import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// Design W2-oracle (co-design docs/superpowers/specs/2026-07-20-q12-w2-w3-staged-execution-codesign.md
// D4 LOCKED, plan Task 4). A real cutover run is accepted iff (1) every real child exited 0 AND (2)
// the barrier receipt v2 reached guard_cleanup_complete (state machine intact) AND (3) the emitted
// source.forward acceptance authority is well formed and its coverage token names this run's recovery
// run. Condition (3) was an `org:course:run` triple in `recovery_journal["coverage"]` until the
// owner-approved amendment 2026-07-25 made acceptance file_catalog truth: no journal `coverage` key
// exists (the progress-journal schema is strict) and the authority is
// `<run-root>/source-forward-acceptance.json` with `coverage_run = catalog:<recovery-run-id>`.
// Byte-parity does NOT gate a real run (the fixture parity suite stays the mechanics oracle, checked
// separately). This suite encodes D4 structurally; the real-evidence leg is exercised at W5/W7.
const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const CORE = join(repoRoot, 'deploy/qdrant/q12-lifecycle-core.py');
const ENV = { PATH: process.env.PATH ?? '/usr/bin:/bin', LC_ALL: 'C', LANG: 'C' };
const RECOVERY_RUN_ID = '11111111-1111-4111-8111-111111111111';

const HEADER = [
  'import importlib.util, sys, json',
  's=importlib.util.spec_from_file_location("q12", sys.argv[1])',
  'm=importlib.util.module_from_spec(s); sys.modules[s.name]=m; s.loader.exec_module(m)',
  'GOOD_RECEIPT={"state":"guard_cleanup_complete"}',
  `RRID="${RECOVERY_RUN_ID}"`,
  'GOOD_AUTHORITY={"schema":"megacampus.q12.source-forward-acceptance/v1",' +
    '"recovery_manifest_sha256":"a"*64,"coverage_fingerprint":"b"*64,' +
    '"coverage_run":"catalog:"+RRID}',
];

function run(lines: string[]): { status: number | null; stdout: string; stderr: string } {
  const child = spawnSync('/usr/bin/python3', ['-c', [...HEADER, ...lines].join('\n'), CORE], {
    encoding: 'utf8',
    env: ENV,
  });
  return { status: child.status, stdout: child.stdout, stderr: child.stderr };
}

describe('Q12 W2-oracle: accept_real_run (D4 LOCKED)', () => {
  it('accepts when all children exit 0, the receipt is terminal, and the authority names the run', () => {
    const { status, stdout, stderr } = run([
      'm.accept_real_run([0, 0, 0], GOOD_RECEIPT, GOOD_AUTHORITY, RRID)', // must NOT raise
      'print("W2_ORACLE_ACCEPT_OK")',
    ]);
    expect(stderr).toBe('');
    expect(status).toBe(0);
    expect(stdout).toContain('W2_ORACLE_ACCEPT_OK');
  });

  it('rejects when any real child exited non-zero', () => {
    const { status, stdout, stderr } = run([
      'refused=False',
      'try:\n m.accept_real_run([0, 1, 0], GOOD_RECEIPT, GOOD_AUTHORITY, RRID)' +
        '\nexcept m.LifecycleError:\n refused=True',
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
      'try:\n m.accept_real_run([0,0,0], {"state":"guard_install_complete"}, GOOD_AUTHORITY, RRID)' +
        '\nexcept m.LifecycleError:\n refused=True',
      'assert refused, "non-terminal receipt was not rejected"',
      'print("W2_ORACLE_RECEIPT_OK")',
    ]);
    expect(stderr).toBe('');
    expect(status).toBe(0);
    expect(stdout).toContain('W2_ORACLE_RECEIPT_OK');
  });

  it('rejects a missing, malformed, or foreign-run acceptance authority', () => {
    const { status, stdout, stderr } = run([
      'bad=[{}, dict(GOOD_AUTHORITY, coverage_run=""),',
      // the retired org:course:run ledger triple is no longer an authority
      ' dict(GOOD_AUTHORITY, coverage_run=RRID+":course-x:run-y"),',
      // a catalog token naming a different recovery run
      ' dict(GOOD_AUTHORITY, coverage_run="catalog:22222222-2222-4222-8222-222222222222"),',
      // upper-case hex (RRID itself is all digits, so a letter-bearing UUID is required here)
      ' dict(GOOD_AUTHORITY, coverage_run="catalog:AB111111-1111-4111-8111-111111111111"),',
      ' dict(GOOD_AUTHORITY, recovery_manifest_sha256="not-a-sha"),',
      ' dict(GOOD_AUTHORITY, coverage_fingerprint="c"*63)]',
      'refused=0',
      'for candidate in bad:',
      ' try:\n  m.accept_real_run([0,0,0], GOOD_RECEIPT, candidate, RRID)' +
        '\n except m.LifecycleError:\n  refused+=1',
      'assert refused==len(bad), refused',
      'print("W2_ORACLE_COVERAGE_OK")',
    ]);
    expect(stderr).toBe('');
    expect(status).toBe(0);
    expect(stdout).toContain('W2_ORACLE_COVERAGE_OK');
  });

  // Byte-parity independence: a real run whose acceptance values differ from any fixture golden is
  // still accepted — the oracle checks the state machine + authority shape, never fixture bytes (D4).
  it('does not gate a real run on fixture byte-parity (arbitrary valid authority accepted)', () => {
    const { status, stdout, stderr } = run([
      'm.accept_real_run([0], GOOD_RECEIPT, dict(GOOD_AUTHORITY, recovery_manifest_sha256="f"*64,' +
        ' coverage_fingerprint="e"*64), RRID)',
      'print("W2_ORACLE_NOPARITY_OK")',
    ]);
    expect(stderr).toBe('');
    expect(status).toBe(0);
    expect(stdout).toContain('W2_ORACLE_NOPARITY_OK');
  });
});
