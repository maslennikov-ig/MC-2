import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

// Q12 R8 SERVER CUSTODY REHEARSAL DRIVER — no-docker unit coverage (mc2-jz6y0.13).
//
// Exercises the driver deliverables that are testable WITHOUT docker / sudo / prod:
//   * rehearsal-verify.py  — the outcome assertions against a CAPTURED real 81-row run
//     root (produced by the fusion full-window harness; staged with the barrier's on-disk
//     0400/0600 modes because git cannot preserve them), plus tamper-detection;
//   * rehearsal-ns-launch.sh --dry-run — the ratified `sudo unshare -m ... setpriv` command
//     construction + the UUIDv4 run-id gate (NO sudo/unshare/prod);
//   * rehearsal-resume.py --dry-run — the fleet-sim self-test + the source-recovery-run.sh
//     resume-writers-only invocation assembly (NO source-recovery-run.sh, NO prod).
//
// The privileged ns-launch, the disposable-container setup, and the live resume are covered
// by rehearsal-setup.py's own local run and by qdrant-source-recovery-runtime.test.ts; they
// run on the orchestrator's server against the REAL /opt custody root.

const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const REHEARSAL = resolve(repoRoot, 'deploy/qdrant/rehearsal');
const VERIFY = join(REHEARSAL, 'rehearsal-verify.py');
const NS_LAUNCH = join(REHEARSAL, 'rehearsal-ns-launch.sh');
const RESUME = join(REHEARSAL, 'rehearsal-resume.py');
const SETUP = join(REHEARSAL, 'rehearsal-setup.py');
const QDRANT = resolve(repoRoot, 'deploy/qdrant');
// The captured real 81-row run root is stored as a byte-exact tar (a raw .json tree would be
// reformatted by prettier, breaking the receipt sha256 the accepted-row binding depends on).
const FIXTURE_TAR = resolve(
  repoRoot,
  'packages/course-gen-platform/tests/unit/ops/fixtures/q12-rehearsal/run-root.tar'
);
const RUN_ID = '123e4567-e89b-42d3-a456-426614174000';

const scratches: string[] = [];
afterEach(() => {
  while (scratches.length) rmSync(scratches.pop()!, { recursive: true, force: true });
});

// Extract the captured fixture tar into a tmp run root with the barrier's real on-disk modes.
function stageRunRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mc2-q12-rehearsal-fx-'));
  scratches.push(dir);
  const root = join(dir, 'run-root');
  mkdirSync(root, { recursive: true });
  const untar = spawnSync('tar', ['-C', root, '-xf', FIXTURE_TAR], { encoding: 'utf8' });
  if (untar.status !== 0) throw new Error(`fixture untar failed: ${untar.stderr}`);
  for (const name of [
    'quiesce-window-mode.json',
    'database-barrier-receipt.json',
    'database-barrier-receipt-v1-before-cleanup.json',
    'database-barrier-baseline.json',
    'database-barrier-probe-receipt.json',
    'database-barrier-cleanup-terminal-proof.json',
    'expected-post-migration-catalog.json',
  ]) {
    chmodSync(join(root, name), 0o400);
  }
  chmodSync(join(root, 'phase.jsonl'), 0o600);
  chmodSync(join(root, 'phase-checkpoint.json'), 0o600);
  return root;
}

function runVerify(root: string): { status: number; out: Record<string, unknown> } {
  const result = spawnSync('/usr/bin/python3', [VERIFY, '--run-root', root, '--json'], {
    encoding: 'utf8',
  });
  return { status: result.status ?? -1, out: JSON.parse(result.stdout) };
}

describe('Q12 R8 rehearsal-verify.py', () => {
  it('passes every outcome assertion on the captured real 81-row run root', () => {
    const { status, out } = runVerify(stageRunRoot());
    expect(out.failures, JSON.stringify(out.failures)).toEqual([]);
    expect(out.ok).toBe(true);
    expect(status).toBe(0);
    expect(out.journal_rows).toBe(81);
    expect(out.marker_mode).toBe('400');
    expect(out.baseline_mode).toBe('400');
    expect(out.v2_receipt_keys).toEqual([
      'database_capability_deleted',
      'expected_catalog_sha256',
      'last_command',
      'probe_receipt_sha256',
      'rollback_probes_verified',
      'run_id',
      'schema_version',
      'state',
      'terminal_proof_sha256',
      'zero_guard_residue',
    ]);
    expect(out.cleanup_head).toEqual([
      ['barrier.cleanup', 'guard_cleanup_complete', 'intent'],
      ['barrier.cleanup', 'guard_cleanup_complete', 'capability_issued'],
      ['barrier.cleanup', 'guard_cleanup_complete', 'capability_claimed'],
      ['barrier.cleanup', 'guard_cleanup_complete', 'capability_completed'],
      ['barrier.cleanup', 'guard_cleanup_complete', 'accepted'],
    ]);
  });

  it('fails when the journal row-count drifts from 81', () => {
    const root = stageRunRoot();
    const journal = join(root, 'phase.jsonl');
    chmodSync(journal, 0o600);
    const rows = readFileSync(journal, 'utf8').trimEnd().split('\n');
    writeFileSync(journal, `${rows.slice(0, 80).join('\n')}\n`, { mode: 0o600 });
    const { status, out } = runVerify(root);
    expect(status).toBe(1);
    expect(out.ok).toBe(false);
    expect((out.failures as string[]).some(f => f.includes('row-count 80'))).toBe(true);
  });

  it('fails the #16 invariant when the baseline is not the barrier 0400 full-structural artifact', () => {
    const root = stageRunRoot();
    chmodSync(join(root, 'database-barrier-baseline.json'), 0o600);
    const { status, out } = runVerify(root);
    expect(status).toBe(1);
    expect((out.failures as string[]).some(f => f.includes('baseline mode 600'))).toBe(true);
  });

  it('fails when the accepted row does not bind the v2 receipt', () => {
    const root = stageRunRoot();
    const receipt = join(root, 'database-barrier-receipt.json');
    chmodSync(receipt, 0o600);
    const value = JSON.parse(readFileSync(receipt, 'utf8'));
    value.zero_guard_residue = false; // mutate -> sha256 changes -> accepted binding breaks
    writeFileSync(receipt, `${JSON.stringify(value)}`, { mode: 0o400 });
    const { out } = runVerify(root);
    expect(out.ok).toBe(false);
    expect((out.failures as string[]).some(f => f.includes('accepted_object_sha256'))).toBe(true);
  });
});

describe('Q12 R8 rehearsal-ns-launch.sh --dry-run', () => {
  it('builds the ratified private-mount-namespace command without any sudo/unshare/prod', () => {
    const result = spawnSync(
      'bash',
      [
        NS_LAUNCH,
        '--run-id',
        RUN_ID,
        '--run-root',
        `/opt/megacampus/backups/q12/${RUN_ID}`,
        '--dry-run',
        '--',
        '/opt/megacampus/deploy/qdrant/q12-live-cutover.sh',
        '--run-id',
        RUN_ID,
      ],
      { encoding: 'utf8' }
    );
    expect(result.status).toBe(0);
    const combined = result.stdout + result.stderr;
    // The exact ratified shape: sudo unshare -m + fakehosts /etc/hosts bind + /opt->/tmp
    // trust mount --bind + setpriv --reuid=1000 --regid=1000 --init-groups.
    expect(combined).toContain('sudo unshare -m /bin/sh -c');
    expect(combined).toContain('mount --bind');
    expect(combined).toContain('/etc/hosts');
    expect(combined).toContain('setpriv --reuid=1000 --regid=1000 --init-groups');
    expect(combined).toContain(`/opt/megacampus/backups/q12/${RUN_ID}`);
    expect(combined).toContain('aws-1-us-east-2.pooler.supabase.com');
  });

  it('rejects a run-id that is not a RFC 4122 UUIDv4 (barrier :72 regex)', () => {
    const result = spawnSync(
      'bash',
      [NS_LAUNCH, '--run-id', 'not-a-uuid', '--run-root', '/opt/x', '--dry-run', '--', 'true'],
      { encoding: 'utf8' }
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('UUIDv4');
  });
});

describe('Q12 R8 rehearsal-resume.py --dry-run', () => {
  it('self-tests the fleet-sim and assembles the resume-writers-only invocation without prod', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mc2-q12-rehearsal-resume-'));
    scratches.push(dir);
    const result = spawnSync(
      '/usr/bin/python3',
      [
        RESUME,
        '--run-root',
        dir,
        '--run-id',
        RUN_ID,
        '--leg',
        'recovery-epoch',
        '--bindir',
        join(dir, 'fleet'),
      ],
      { encoding: 'utf8' }
    );
    expect(result.status).toBe(0);
    const out = JSON.parse(result.stdout) as {
      leg: string;
      dry_run: boolean;
      fleet_sim_self_test: { context_rc: number; context_show: string; ps_rc: number };
      invocation: string[];
      env: Record<string, string>;
    };
    expect(out.leg).toBe('recovery-epoch');
    expect(out.dry_run).toBe(true);
    expect(out.fleet_sim_self_test.context_rc).toBe(0);
    expect(out.fleet_sim_self_test.context_show).toBe('default');
    expect(out.fleet_sim_self_test.ps_rc).toBe(0);
    expect(out.invocation).toContain('resume-writers-only');
    expect(out.invocation).toContain(RUN_ID);
    expect(out.env.SOURCE_RECOVERY_LOCAL_TEST).toBe('1');
    expect(out.env.SOURCE_RECOVERY_WRITER_BACKEND).toBe('compose');
    expect(out.env.SOURCE_RECOVERY_Q12_RUN_ROOT).toBe(dir);
  });
});

// The dry-run path prints the ns command but NEVER executes the inner `sh -c`, so a shift
// miscount in the inner script is invisible there. This test binds to the EXACT inner script
// (--emit-inner), runs it with `mount`/`setpriv` STUBBED (no root needed), and asserts the
// full run_live argv (entrypoint + every arg, in order) survives the shift — the exact hole a
// byte-review had to catch.
describe('Q12 R8 rehearsal-ns-launch.sh inner ns-script (setpriv-stubbed exec)', () => {
  it('preserves the FULL run_live argv through the ns shift (entrypoint not dropped)', () => {
    const emit = spawnSync('/bin/bash', [NS_LAUNCH, '--emit-inner'], { encoding: 'utf8' });
    expect(emit.status, emit.stderr).toBe(0);
    const inner = emit.stdout.trimEnd();
    expect(inner).toContain('exec setpriv');
    expect(inner).toContain('shift ');

    const stub = mkdtempSync(join(tmpdir(), 'mc2-q12-rehearsal-stub-'));
    writeFileSync(join(stub, 'mount'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    writeFileSync(
      join(stub, 'setpriv'),
      '#!/bin/sh\nfor a in "$@"; do printf "%s\\n" "$a"; done\n',
      {
        mode: 0o755,
      }
    );

    // Positionals: $0=FAKEHOSTS $1=RUN_ROOT $2=TRUST_VIEW $3..=the run_live argv.
    const launchArgv = [
      '/opt/megacampus/deploy/qdrant/q12-live-cutover.sh',
      'live',
      '--run-id',
      'RID',
    ];
    const res = spawnSync(
      '/bin/sh',
      ['-c', inner, 'FAKEHOSTS', 'RUN_ROOT', 'TRUST_VIEW', ...launchArgv],
      { encoding: 'utf8', env: { ...process.env, PATH: `${stub}:${process.env.PATH ?? ''}` } }
    );
    rmSync(stub, { recursive: true, force: true });
    expect(res.status, res.stderr).toBe(0);

    // The setpriv stub saw: --reuid=… --regid=… --init-groups <post-shift argv>.
    const emitted = res.stdout.trimEnd().split('\n');
    const initGroups = emitted.indexOf('--init-groups');
    expect(initGroups).toBeGreaterThanOrEqual(0);
    const postShift = emitted.slice(initGroups + 1);
    // shift 3 (the P1 bug) drops launchArgv[0] (the run_live entrypoint); shift 2 keeps it.
    expect(postShift).toEqual(launchArgv);
  });
});

// Found-defect #20: the rehearsal DRIVER must be SERVER-SELF-CONTAINED. megacampus-prod
// carries only the /opt/megacampus/deploy/ subset — NOT the packages/ test tree, no
// node_modules/tsx, no cwd=REPO. So rehearsal-setup.py's server-import surface must resolve
// against ONLY deploy/qdrant/rehearsal/ + deploy/qdrant/*.sql — never a packages/…/fixtures
// runner. These checks need NO docker (the catalog leg still needs docker for a full local
// run; the import surface itself does not).
describe('Q12 R8 rehearsal driver server-import surface (found-defect #20)', () => {
  it('no rehearsal driver .py references the packages tree or LOADS a *-runner.py fixture', () => {
    const pys = readdirSync(REHEARSAL).filter(name => name.endsWith('.py'));
    expect(pys).toContain('rehearsal-setup.py');
    for (const name of pys) {
      const src = readFileSync(join(REHEARSAL, name), 'utf8');
      // The undeployed test tree must never be on the server-import path.
      expect(src, `${name} references the packages/course-gen-platform test tree`).not.toContain(
        'packages/course-gen-platform'
      );
      // A *-runner.py string LITERAL (quoted) is an importlib load of a fixture runner; prose
      // provenance in comments/docstrings uses the bare name and is not matched.
      expect(src, `${name} loads a *-runner.py fixture`).not.toMatch(/runner\.py['"]/);
    }
  });

  it('rehearsal-setup.py --check-imports resolves on a DEPLOY-ONLY subset with NO packages/', () => {
    // Stage an /opt-like tree carrying ONLY the deploy/qdrant subset the driver needs — the
    // rehearsal/ dir + the deploy-side .sql/.sh siblings — and deliberately NO packages/ tree.
    const dir = mkdtempSync(join(tmpdir(), 'mc2-q12-deploy-subset-'));
    scratches.push(dir);
    const optQdrant = join(dir, 'opt', 'megacampus', 'deploy', 'qdrant');
    const optRehearsal = join(optQdrant, 'rehearsal');
    mkdirSync(optRehearsal, { recursive: true });
    for (const name of readdirSync(REHEARSAL)) {
      // Copy ONLY regular files (the driver source). A `__pycache__/` dir exists under
      // rehearsal/ after ANY python run (the server + CI both have it); copyFileSync on a
      // directory throws EISDIR — skip non-regular entries so the test isn't falsely fragile.
      if (!statSync(join(REHEARSAL, name)).isFile()) continue;
      copyFileSync(join(REHEARSAL, name), join(optRehearsal, name));
    }
    // The deploy-side siblings the driver reads (structural catalog + recovery wrapper etc.).
    // The .sql/.sh extension filter already excludes dirs, but guard isFile() too (defensive,
    // matches the rehearsal/ loop) so no non-regular entry can EISDIR here either.
    for (const name of readdirSync(QDRANT)) {
      if (
        (name.endsWith('.sql') || name.endsWith('.sh')) &&
        statSync(join(QDRANT, name)).isFile()
      ) {
        copyFileSync(join(QDRANT, name), join(optQdrant, name));
      }
    }
    // Sanity: the staged subset has NO packages/ tree at all.
    expect(readdirSync(join(dir, 'opt', 'megacampus', 'deploy'))).toEqual(['qdrant']);

    const stagedSetup = join(optRehearsal, 'rehearsal-setup.py');
    // --help must not require any packages path.
    const help = spawnSync('/usr/bin/python3', [stagedSetup, '--help'], { encoding: 'utf8' });
    expect(help.status, help.stderr).toBe(0);
    // --check-imports actually LOADS the vendored helper (the real server-import surface) with
    // no packages/ present and prints the resolved deploy-side paths.
    const check = spawnSync('/usr/bin/python3', [stagedSetup, '--check-imports'], {
      encoding: 'utf8',
    });
    expect(check.status, check.stderr).toBe(0);
    // It must NOT have failed on a packages/…/fixtures/…-runner.py path.
    expect(check.stderr).not.toMatch(/packages\/.*fixtures/);
    const out = JSON.parse(check.stdout) as {
      check_imports: string;
      structural_catalog: string;
      symbols: string[];
    };
    expect(out.check_imports).toBe('ok');
    // The catalog leg reads deploy/qdrant/q12-structural-catalog.sql (server-present), NOT packages/.
    expect(out.structural_catalog).toContain('deploy/qdrant/q12-structural-catalog.sql');
    expect(out.structural_catalog).not.toContain('packages/');
    expect(out.symbols).toEqual(
      expect.arrayContaining(['SEED_SQL', 'canonical', 'sha256_hex', '_build_expected_catalog'])
    );
  });
});
