import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { RUN_USER_NAMESPACE_SANDBOX } from './fixtures/q12-user-namespace-gate.js';

// Review P2 (2026-07-26): the controller escalates `source.forward` through the root-owned launcher,
// but nothing checked that the launcher is actually INSTALLED and that the sudo authority still
// works. A staging miss therefore landed at C5 — after C2 had already stopped all ten production
// writers, with the window open and the point of no return ahead. The preflight has to fire where
// `require_post_activate_executor` fires: the first statements of run_live/run_recover, before the
// genesis row and before any run-root mutation.
const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const CORE = resolve(REPO_ROOT, 'deploy/qdrant/q12-lifecycle-core.py');
const RUNNER = resolve(
  REPO_ROOT,
  'packages/course-gen-platform/tests/unit/ops/fixtures/q12-privileged-launcher-preflight-runner.py'
);

interface Outcome {
  readonly refused: boolean;
  readonly reason?: string;
}
interface Report {
  readonly case: string;
  readonly euid: number;
  readonly result: Outcome;
  readonly alsoMissingKey?: Outcome;
  readonly alsoProductionShapedRunRoot?: Outcome;
  readonly expectedPath?: string;
  /** The binary the probe actually shelled in this run (a stub for the sudo-authority cases). */
  readonly probedBinary?: string;
  /** The binary production uses, read back from the module constant to prove the stub is local. */
  readonly productionBinary?: string;
}

function drive(testCase: string): Report {
  const child = spawnSync('/usr/bin/python3', [RUNNER, testCase], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  expect(child.status, `runner stderr:\n${child.stderr}`).toBe(0);
  return JSON.parse(child.stdout) as Report;
}

/** Same case, but as EUID 0 inside an unprivileged user namespace, where files we create stat as
 * 0:0 — the only way to exercise the root-owned half without being root. */
function driveAsRoot(testCase: string): Report {
  const child = spawnSync(
    '/usr/bin/bwrap',
    [
      '--unshare-user',
      '--uid',
      '0',
      '--gid',
      '0',
      '--ro-bind',
      '/',
      '/',
      '--proc',
      '/proc',
      '--dev',
      '/dev',
      '--tmpfs',
      '/tmp',
      '--',
      '/usr/bin/python3',
      RUNNER,
      testCase,
    ],
    { encoding: 'utf8', env: { PATH: '/usr/bin:/bin' }, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  expect(child.status, `sandboxed runner stderr:\n${child.stderr}`).toBe(0);
  return JSON.parse(child.stdout) as Report;
}

describe('Q12 controller preflight: the privileged launcher must be installed before C1', () => {
  it('is wired as a pre-flight in run_live and run_recover, before any journal row', () => {
    const source = readFileSync(CORE, 'utf8');
    // Both controllers must call it, and it must sit with the existing pre-flight — i.e. before
    // Engine construction (the first run-root mutation) and before the genesis append.
    for (const entry of ['def run_live(', 'def run_recover(']) {
      const body = source.slice(source.indexOf(entry));
      const preflight = body.indexOf('require_privileged_launcher(request)');
      const engine = body.indexOf('Engine(request, executor)');
      expect(preflight, `${entry} must call require_privileged_launcher`).toBeGreaterThan(0);
      expect(engine).toBeGreaterThan(0);
      expect(preflight).toBeLessThan(engine);
    }
  });

  it('is a no-op for non-production runs, so fixture runs need no root-owned launcher', () => {
    const report = drive('non-production');
    expect(report.result.refused).toBe(false);
    expect(report.result.reason).toBeUndefined();
    expect(report.alsoMissingKey!.refused).toBe(false);
    expect(report.alsoMissingKey!.reason).toBeUndefined();
    expect(report.alsoProductionShapedRunRoot!.refused).toBe(false);
    expect(report.alsoProductionShapedRunRoot!.reason).toBeUndefined();
  });

  // A host-staging refusal must never mask a request-shape refusal: a production request whose run
  // root is not THE production run root cannot reach C5, and Engine owns that rule
  // ("production run root mismatch"). q12-live-controller.test.ts asserts the same ordering from the
  // controller side.
  it('leaves a non-production run root to Engine, so its named refusal is not masked', () => {
    const report = drive('non-production-run-root');
    expect(report.result.refused).toBe(false);
    expect(report.result.reason).toBeUndefined();
  });

  it('resolves the launcher as the controller sibling and refuses a non-root-owned one', () => {
    const report = drive('production-derives-sibling');
    expect(report.euid).not.toBe(0);
    expect(report.expectedPath).toBe(resolve(REPO_ROOT, 'deploy/qdrant/q12-privileged-launch.sh'));
    expect(report.result.refused, `not refused: ${String(report.result.reason)}`).toBe(true);
    expect(report.result.reason).toBe('privileged launcher must be owned by root');
  });

  it.each([
    ['absent', 'privileged launcher is not installed'],
    ['symlink', 'privileged launcher must be a regular non-symlink file'],
    ['directory', 'privileged launcher must be a regular non-symlink file'],
  ])('refuses an %s launcher by name', (testCase, reason) => {
    const report = drive(testCase);
    expect(report.result.refused, `not refused: ${String(report.result.reason)}`).toBe(true);
    expect(report.result.reason).toBe(reason);
  });

  // mc2-f2il0: this used to drive the probe against the HOST's real sudoers and assert a refusal —
  // true on a dev box where `sudo -n` needs interactive auth, false on a GitHub runner where sudo is
  // passwordless. develop's CI went red on 2026-07-26 and stayed red on exactly this assertion while
  // the same commit passed locally. The probe's contract is "non-zero exit => named refusal, zero
  // exit => pass", so BOTH directions are now pinned deterministically by pointing the probe's
  // binary at a stub, which holds on any host and no longer depends on who may become root here.
  it('refuses when the sudo authority is unavailable', () => {
    const report = drive('sudo-authority-refused');
    expect(report.result.refused, `not refused: ${String(report.result.reason)}`).toBe(true);
    expect(report.result.reason).toBe(
      'privileged launch authority is unavailable: sudo -n could not run as root'
    );
  });

  it('passes when the sudo authority is available', () => {
    const report = drive('sudo-authority-granted');
    expect(report.result.refused, `refused: ${String(report.result.reason)}`).toBe(false);
    expect(report.result.reason).toBeUndefined();
  });

  it('probes the real sudo binary, so a stubbed run still exercises the production path', () => {
    const report = drive('sudo-authority-refused');
    expect(report.probedBinary).toBe('/bin/false');
    expect(report.productionBinary).toBe('/usr/bin/sudo');
  });

  describe.runIf(RUN_USER_NAMESPACE_SANDBOX)('the root-owned half', () => {
    it.each([
      ['mode', 'privileged launcher must be mode 0555'],
      ['writable-mode', 'privileged launcher must be mode 0555'],
    ])('refuses a root-owned launcher with the wrong %s', (testCase, reason) => {
      const report = driveAsRoot(testCase);
      expect(report.euid).toBe(0);
      expect(report.result.refused, `not refused: ${String(report.result.reason)}`).toBe(true);
      expect(report.result.reason).toBe(reason);
    });

    it('accepts a root-owned 0555 launcher', () => {
      const report = driveAsRoot('installed');
      expect(report.euid).toBe(0);
      expect(report.result.refused, `refused: ${String(report.result.reason)}`).toBe(false);
      expect(report.result.reason).toBeUndefined();
    });
  });
});
