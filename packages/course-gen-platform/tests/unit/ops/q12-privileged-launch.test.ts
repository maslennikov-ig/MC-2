import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { RUN_USER_NAMESPACE_SANDBOX } from './fixtures/q12-user-namespace-gate.js';

// Design D5 (docs/superpowers/specs/2026-07-26-q12-window-execution-identity-design.md): exactly one
// frozen window command needs root — `source.forward`, which must read the uid-1001 operator tree's
// 0400 files inside 0700 directories. It is reached through this root-owned argv whitelist, invoked
// with the operator account's EXISTING sudo rights (/etc/sudoers.d/claude-deploy already grants
// `ALL=(ALL) NOPASSWD: ALL`, so the launcher adds no privilege — it only narrows what that sudo is
// used for, fail-closed).
//
// Testing root behaviour without root: bwrap's unprivileged user namespace (the precedent this repo
// already uses for identity gates — q12-live-cutover.test.ts:1531) gives EUID 0, and a tmpfs /opt
// lets the launcher's HARDCODED absolute production constants resolve for real without touching the
// host. The one thing an unprivileged user namespace cannot express is a file owned by uid 1000: our
// own files necessarily stat as 0:0 inside it (that single mapping is all an unprivileged userns
// gets). So the REFUSAL suites run the production launcher verbatim — including its lock-identity
// refusal, which fires precisely because 0:0 != 1000:1000 — and the ACCEPT suite runs a harness copy
// whose only difference is the two controller-identity constants, asserted line by line below.
const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const LAUNCHER = resolve(REPO_ROOT, 'deploy/qdrant/q12-privileged-launch.sh');
const COMMAND_MANIFEST = JSON.parse(
  readFileSync(resolve(REPO_ROOT, 'deploy/qdrant/q12-command-manifest.json'), 'utf8')
) as { commands: Record<string, { argv: string[]; env: Record<string, string> }> };

const WRAPPER_PATH = '/opt/megacampus/deploy/qdrant/source-recovery-run.sh';
const LAUNCHER_PATH = '/opt/megacampus/deploy/qdrant/q12-privileged-launch.sh';
const CUTOVER_LOCK = '/opt/megacampus/backups/q12/cutover.lock';
const RUN_ID = '3f2b9c1e-5d47-4a80-9c11-6e8f0b2d7a35';

// The REAL frozen source.forward argv, rendered exactly as the controller resolves it. Binding the
// test to the manifest means a manifest move breaks this suite instead of silently drifting past it.
const FROZEN_SOURCE_FORWARD_ARGV = COMMAND_MANIFEST.commands['source.forward'].argv.map(value =>
  value
    .split('<run-id>')
    .join(RUN_ID)
    .split('<recovery-run-id>')
    .join('7c9d1a44-2f6b-4e11-8b0d-53a7e9c2f108')
    .split('<quiesce-manifest>')
    .join(`/opt/megacampus/backups/q12/${RUN_ID}/writer-quiesce-${RUN_ID}.json`)
);
const FROZEN_SOURCE_FORWARD_ENV = COMMAND_MANIFEST.commands['source.forward'].env;

// The stub that stands in for the wrapper at the frozen path: it records what the launcher actually
// exec'd (argv, env, descriptor surface) and whether the cutover lock is still FREE — the load-bearing
// negative. The launcher must open the lock as an identity handle and never flock it, because the
// controller holds LOCK_EX for the whole window and the child's own liveness proof
// (source-recovery-run.sh:405-410) requires a fresh flock to FAIL against the CONTROLLER's lock.
const WRAPPER_STUB = `#!/usr/bin/python3
import fcntl, json, os, sys

surface = {}
for raw in os.listdir("/proc/self/fd"):
    try:
        fd = int(raw)
        os.fstat(fd)
    except (OSError, ValueError):
        continue
    try:
        surface[fd] = os.readlink(f"/proc/self/fd/{fd}")
    except OSError:
        surface[fd] = None

fresh = os.open(${JSON.stringify(CUTOVER_LOCK)}, os.O_RDONLY)
try:
    fcntl.flock(fresh, fcntl.LOCK_EX | fcntl.LOCK_NB)
    fresh_flock_succeeded = True
except OSError:
    fresh_flock_succeeded = False
finally:
    os.close(fresh)

with open("/out/exec-record.json", "w") as handle:
    json.dump(
        {
            "argv": sys.argv,
            "env": dict(os.environ),
            "fds": sorted(surface),
            "leaseTarget": surface.get(9),
            "freshFlockSucceeded": fresh_flock_succeeded,
        },
        handle,
    )
`;

const temporaryRoots: string[] = [];
afterEach(() => {
  while (temporaryRoots.length > 0) {
    rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
  }
});

interface SandboxOptions {
  readonly launcher?: string;
  readonly lockMode?: number;
  readonly lockAsSymlink?: boolean;
  readonly omitLock?: boolean;
}

interface SandboxResult {
  readonly status: number | null;
  readonly stderr: string;
  readonly record: Record<string, unknown> | null;
}

/** Runs the launcher as EUID 0 with the frozen absolute production paths materialised on a tmpfs. */
function runAsRoot(argv: readonly string[], options: SandboxOptions = {}): SandboxResult {
  const root = mkdtempSync(join(tmpdir(), 'mc2-q12-privileged-launch-'));
  temporaryRoots.push(root);

  const stub = join(root, 'source-recovery-run.sh');
  writeFileSync(stub, WRAPPER_STUB, { mode: 0o755 });
  const lock = join(root, 'cutover.lock');
  writeFileSync(lock, '', { mode: options.lockMode ?? 0o600 });
  chmodSync(lock, options.lockMode ?? 0o600);
  const out = join(root, 'out');
  mkdirSync(out);

  const binds = [
    '--ro-bind',
    options.launcher ?? LAUNCHER,
    LAUNCHER_PATH,
    '--ro-bind',
    stub,
    WRAPPER_PATH,
    '--bind',
    out,
    '/out',
  ];
  if (options.lockAsSymlink) {
    // A genuine symlink to a perfectly good lock: only its non-canonical shape may refuse it.
    binds.push(
      '--bind',
      lock,
      `${CUTOVER_LOCK}.real`,
      '--symlink',
      `${CUTOVER_LOCK}.real`,
      CUTOVER_LOCK
    );
  } else if (!options.omitLock) {
    binds.push('--bind', lock, CUTOVER_LOCK);
  }

  const child = spawnSync(
    '/usr/bin/bwrap',
    [
      '--unshare-user',
      '--uid',
      '0',
      '--gid',
      '0',
      '--ro-bind',
      '/usr',
      '/usr',
      '--ro-bind',
      '/etc',
      '/etc',
      '--symlink',
      'usr/bin',
      '/bin',
      '--symlink',
      'usr/lib',
      '/lib',
      '--symlink',
      'usr/lib64',
      '/lib64',
      '--symlink',
      'usr/sbin',
      '/sbin',
      '--proc',
      '/proc',
      '--dev',
      '/dev',
      '--tmpfs',
      '/opt',
      '--tmpfs',
      '/tmp',
      ...binds,
      '--',
      LAUNCHER_PATH,
      ...argv,
    ],
    {
      encoding: 'utf8',
      // A canary the launcher's `env -i` must scrub: nothing but the frozen four may reach the child.
      env: { PATH: '/usr/bin:/bin', MC2_LAUNCH_CANARY: 'must-not-reach-the-child' },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  let record: Record<string, unknown> | null = null;
  try {
    record = JSON.parse(readFileSync(join(out, 'exec-record.json'), 'utf8')) as Record<
      string,
      unknown
    >;
  } catch {
    record = null;
  }
  return { status: child.status, stderr: child.stderr ?? '', record };
}

/** The accept path needs a lock owned by the controller identity, which an unprivileged user
 * namespace can only express as 0:0 — so the two identity constants are retargeted, and nothing
 * else. The diff is asserted below so this copy can never quietly become a different program. */
function harnessCopyWithNamespaceControllerIdentity(): string {
  const root = mkdtempSync(join(tmpdir(), 'mc2-q12-privileged-launch-copy-'));
  temporaryRoots.push(root);
  const copy = join(root, 'q12-privileged-launch.sh');
  copyFileSync(LAUNCHER, copy);
  const original = readFileSync(LAUNCHER, 'utf8');
  const retargeted = original
    .replace("readonly CONTROLLER_UID='1000'", "readonly CONTROLLER_UID='0'")
    .replace("readonly CONTROLLER_GID='1000'", "readonly CONTROLLER_GID='0'");
  writeFileSync(copy, retargeted, { mode: 0o755 });

  const changed = original
    .split('\n')
    .map((line, index) => [line, retargeted.split('\n')[index]] as const)
    .filter(([before, after]) => before !== after);
  expect(changed).toEqual([
    ["readonly CONTROLLER_UID='1000'", "readonly CONTROLLER_UID='0'"],
    ["readonly CONTROLLER_GID='1000'", "readonly CONTROLLER_GID='0'"],
  ]);
  return copy;
}

const ROUTING_RUNNER = resolve(
  REPO_ROOT,
  'packages/course-gen-platform/tests/unit/ops/fixtures/q12-privileged-launch-routing-runner.py'
);

function driveRoutingRunner(): Record<string, Record<string, unknown> & string> {
  const child = spawnSync('/usr/bin/python3', [ROUTING_RUNNER, RUN_ID], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  expect(child.status, `routing runner stderr:\n${child.stderr}`).toBe(0);
  return JSON.parse(child.stdout) as Record<string, Record<string, unknown> & string>;
}

describe('Q12 privileged launcher: frozen constants and the install contract', () => {
  const source = () => readFileSync(LAUNCHER, 'utf8');

  it('pins the frozen wrapper path, the canonical window lock, and the controller identity', () => {
    const text = source();
    expect(text).toContain(`readonly WRAPPER='${WRAPPER_PATH}'`);
    expect(text).toContain(`readonly CUTOVER_LOCK='${CUTOVER_LOCK}'`);
    expect(text).toContain("readonly CONTROLLER_UID='1000'");
    expect(text).toContain("readonly CONTROLLER_GID='1000'");
    // The canonical lock is the run root's parent sibling: <run-root>/../cutover.lock.
    expect(CUTOVER_LOCK).toBe(
      resolve(`/opt/megacampus/backups/q12/${RUN_ID}`, '..', 'cutover.lock')
    );
  });

  it('documents the root-owned 0555 install and the never-flock rule so neither is "fixed" later', () => {
    const text = source();
    expect(text).toMatch(/0555/);
    expect(text.toLowerCase()).toContain('never');
    expect(text.toLowerCase()).toContain('flock');
    // The whole point: no acquisition anywhere in the script. `flock` may only appear in prose.
    const executable = text
      .split('\n')
      .filter(line => !line.trimStart().startsWith('#'))
      .join('\n');
    expect(executable).not.toMatch(/\bflock\b/);
  });

  // The launcher carries a STATIC copy of the frozen argv shape rather than parsing the manifest at
  // run time, and that is the safe choice, not a shortcut: q12-command-manifest.json lives in the
  // uid-1000-writable /opt/megacampus tree, so a root launcher that read its whitelist from there
  // would let the very account it constrains rewrite the whitelist. The launcher is root-owned 0555;
  // its shape must therefore be pinned HERE, so manifest drift fails a test instead of a window.
  it('pins its static argv shape to the frozen manifest, sentinel for sentinel', () => {
    const text = source();
    const readArray = (name: string): string[] => {
      const block = new RegExp(`readonly -a ${name}=\\(([^)]*)\\)`, 'm').exec(text);
      expect(block, `${name} must be declared in the launcher`).not.toBeNull();
      return [...block![1].matchAll(/'([^']*)'/g)].map(match => match[1]);
    };
    const flags = readArray('FROZEN_FLAGS');
    const values = readArray('FROZEN_VALUES');
    expect(flags.length).toBe(values.length);

    // Each sentinel stands for exactly one manifest token; everything else is compared literally.
    const SENTINELS: Record<string, string> = {
      '@OPERATION@': 'forward',
      '@SOURCE_RECOVERY_RUN_ID@': '<recovery-run-id>',
      '@Q12_RUN_ROOT@/secrets/db-capability':
        '/opt/megacampus/backups/q12/<run-id>/secrets/db-capability',
      '@EXTERNAL_QUIESCE_MANIFEST@': '<quiesce-manifest>',
      '@Q12_RUN_ROOT@/database-barrier-receipt.json':
        '/opt/megacampus/backups/q12/<run-id>/database-barrier-receipt.json',
    };
    const declared = [WRAPPER_PATH];
    flags.forEach((flag, index) => {
      declared.push(flag, SENTINELS[values[index]] ?? values[index]);
    });

    expect(declared).toEqual(COMMAND_MANIFEST.commands['source.forward'].argv);
  });
});

describe('Q12 privileged launcher: identity gate', () => {
  it('refuses by name when it is not root', () => {
    const child = spawnSync(LAUNCHER, [...FROZEN_SOURCE_FORWARD_ARGV], {
      encoding: 'utf8',
      env: { PATH: '/usr/sbin:/usr/bin:/sbin:/bin' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    expect(process.geteuid?.()).not.toBe(0);
    expect(child.status).not.toBe(0);
    expect(child.stderr).toContain('privileged launch must run as root');
  });
});

// The sandboxed halves need EUID 0 inside an unprivileged user namespace; see the gate fixture.
describe.runIf(RUN_USER_NAMESPACE_SANDBOX)(
  'Q12 privileged launcher: argv whitelist refuses every other shape by name',
  () => {
    it('refuses an empty argv', () => {
      const result = runAsRoot([]);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('privileged launch requires the frozen source.forward argv');
      expect(result.record).toBeNull();
    });

    it('refuses a different program at argv[0]', () => {
      const result = runAsRoot([
        '/opt/megacampus/deploy/qdrant/q12-writer-resume.py',
        '--operation',
        'forward',
      ]);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        'privileged launch accepts only the frozen source recovery wrapper'
      );
      expect(result.record).toBeNull();
    });

    it('refuses a relative or otherwise non-frozen path to the same file name', () => {
      const result = runAsRoot(['deploy/qdrant/source-recovery-run.sh', '--operation', 'forward']);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        'privileged launch accepts only the frozen source recovery wrapper'
      );
    });

    it.each([
      ['a truncated argv', [WRAPPER_PATH, '--run-id', RUN_ID]],
      ['a missing trailing flag/value pair', FROZEN_SOURCE_FORWARD_ARGV.slice(0, -2)],
      ['an extra flag/value pair', [...FROZEN_SOURCE_FORWARD_ARGV, '--writer-backend', 'systemd']],
      [
        'a duplicated flag',
        [...FROZEN_SOURCE_FORWARD_ARGV, '--manifest', '/tmp/attacker-manifest.json'],
      ],
    ])('refuses %s on arity', (_label, argv) => {
      const result = runAsRoot(argv);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        'privileged launch requires exactly 27 frozen source.forward arguments'
      );
      expect(result.record).toBeNull();
    });

    // P2 from the independent review: the whitelist used to constrain argv[0] and the operation
    // value only, so `--stop-writers` plus arbitrary --manifest/--production-root/--development-root
    // values were ACCEPTED and reached the wrapper verbatim as root. The shape is frozen now.
    it('refuses --stop-writers by name — the Q12 forward path must never stop writers', () => {
      const result = runAsRoot([...FROZEN_SOURCE_FORWARD_ARGV, '--stop-writers']);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('privileged launch refuses --stop-writers');
      expect(result.record).toBeNull();
    });

    it('refuses --stop-writers even in place of a frozen pair (arity would otherwise match)', () => {
      const argv = [...FROZEN_SOURCE_FORWARD_ARGV];
      argv[argv.length - 2] = '--stop-writers';
      const result = runAsRoot(argv);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('privileged launch refuses --stop-writers');
      expect(result.record).toBeNull();
    });

    it('refuses an unknown flag in a frozen flag position', () => {
      const argv = [...FROZEN_SOURCE_FORWARD_ARGV];
      argv[11] = '--writer-backend';
      const result = runAsRoot(argv);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('privileged launch argument 12 is not the frozen flag');
      expect(result.stderr).toContain('--manifest');
      expect(result.record).toBeNull();
    });

    it('refuses reordered flag/value pairs', () => {
      const argv = [...FROZEN_SOURCE_FORWARD_ARGV];
      // Swap --project-directory/--env-file wholesale: every token is legal, the ORDER is not.
      [argv[5], argv[6], argv[7], argv[8]] = [argv[7], argv[8], argv[5], argv[6]];
      const result = runAsRoot(argv);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('privileged launch argument 6 is not the frozen flag');
      expect(result.record).toBeNull();
    });

    it.each([
      ['--manifest', 12, '/tmp/attacker-manifest.json'],
      ['--production-root', 18, '/tmp/attacker-production-root'],
      ['--development-root', 16, '/tmp/attacker-development-root'],
      ['--plan-input', 10, '/tmp/attacker-plan-input.json'],
      ['--progress-directory', 14, '/tmp/attacker-progress'],
      ['--env-file', 8, '/tmp/attacker.env'],
      ['--project-directory', 6, '/tmp/attacker-project'],
      ['--capability-directory', 20, '/tmp/attacker-capability'],
    ])('refuses a tampered fixed value for %s', (flag, index, tampered) => {
      const argv = [...FROZEN_SOURCE_FORWARD_ARGV];
      argv[index] = tampered;
      const result = runAsRoot(argv);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        `privileged launch argument ${index + 1} is not the frozen value for ${flag}`
      );
      expect(result.record).toBeNull();
    });

    it.each(['quiesce-writers-only', 'resume-writers-only', 'rollback', 'forward-dry-run', ''])(
      'refuses --operation %s',
      operation => {
        const argv = [...FROZEN_SOURCE_FORWARD_ARGV];
        argv[2] = operation;
        const result = runAsRoot(argv);
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('privileged launch accepts only --operation forward');
        expect(result.record).toBeNull();
      }
    );

    it.each(['not-a-uuid', '../../etc/passwd', '', '3f2b9c1e5d474a809c116e8f0b2d7a35'])(
      'refuses a source recovery run id that is not a canonical uuid (%s)',
      runId => {
        const argv = [...FROZEN_SOURCE_FORWARD_ARGV];
        argv[4] = runId;
        const result = runAsRoot(argv);
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain(
          'privileged launch requires a canonical uuid source recovery run id'
        );
        expect(result.record).toBeNull();
      }
    );

    it.each([
      ['--q12-db-capability-file', 22, '/tmp/attacker/secrets/db-capability'],
      ['--database-barrier-receipt', 26, '/tmp/attacker/database-barrier-receipt.json'],
      // Inside the Q12 tree but NOT a run id — only the uuid check can refuse these two, and the
      // second one keeps the legal prefix while traversing straight back out of it.
      [
        '--q12-db-capability-file',
        22,
        '/opt/megacampus/backups/q12/not-a-run-id/secrets/db-capability',
      ],
      [
        '--database-barrier-receipt',
        26,
        `/opt/megacampus/backups/q12/${RUN_ID}/../../../../etc/database-barrier-receipt.json`,
      ],
    ])('refuses a %s outside the canonical Q12 run root', (flag, index, tampered) => {
      const argv = [...FROZEN_SOURCE_FORWARD_ARGV];
      argv[index] = tampered;
      const result = runAsRoot(argv);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        `privileged launch argument for ${flag} is not a canonical Q12 run-root path`
      );
      expect(result.record).toBeNull();
    });

    it('refuses Q12 run-root paths that disagree on the run id', () => {
      const argv = [...FROZEN_SOURCE_FORWARD_ARGV];
      argv[26] = `/opt/megacampus/backups/q12/9c9d1a44-2f6b-4e11-8b0d-53a7e9c2f108/database-barrier-receipt.json`;
      const result = runAsRoot(argv);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        'privileged launch Q12 run-root paths disagree on the run id'
      );
      expect(result.record).toBeNull();
    });

    it.each([
      ['outside the Q12 backups tree', '/tmp/attacker-quiesce.json'],
      ['relative', 'writer-quiesce.json'],
      [
        'traversing out with ..',
        `/opt/megacampus/backups/q12/${RUN_ID}/../../../etc/attacker.json`,
      ],
    ])('refuses an external quiesce manifest that is %s', (_label, tampered) => {
      const argv = [...FROZEN_SOURCE_FORWARD_ARGV];
      argv[24] = tampered;
      const result = runAsRoot(argv);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        'privileged launch requires an external quiesce manifest inside the Q12 backups tree'
      );
      expect(result.record).toBeNull();
    });
  }
);

describe.runIf(RUN_USER_NAMESPACE_SANDBOX)(
  'Q12 privileged launcher: the window lock must be the controller-owned canonical file',
  () => {
    it('refuses a lock that is not owned by the controller identity', () => {
      // Verbatim production launcher: inside the user namespace the lock stats 0:0, not 1000:1000.
      const result = runAsRoot([...FROZEN_SOURCE_FORWARD_ARGV]);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        'privileged launch requires the canonical controller-owned cutover lock'
      );
      expect(result.record).toBeNull();
    });

    it('refuses a symlinked lock', () => {
      const result = runAsRoot([...FROZEN_SOURCE_FORWARD_ARGV], {
        launcher: harnessCopyWithNamespaceControllerIdentity(),
        lockAsSymlink: true,
      });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        'privileged launch requires the canonical controller-owned cutover lock'
      );
      expect(result.record).toBeNull();
    });

    it('refuses a lock whose mode is not 0600', () => {
      const result = runAsRoot([...FROZEN_SOURCE_FORWARD_ARGV], {
        launcher: harnessCopyWithNamespaceControllerIdentity(),
        lockMode: 0o644,
      });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        'privileged launch requires the canonical controller-owned cutover lock'
      );
      expect(result.record).toBeNull();
    });

    it('refuses an absent lock', () => {
      const result = runAsRoot([...FROZEN_SOURCE_FORWARD_ARGV], {
        launcher: harnessCopyWithNamespaceControllerIdentity(),
        omitLock: true,
      });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        'privileged launch requires the canonical controller-owned cutover lock'
      );
      expect(result.record).toBeNull();
    });
  }
);

describe.runIf(RUN_USER_NAMESPACE_SANDBOX)(
  'Q12 privileged launcher: the accepted frozen command',
  () => {
    const accept = () =>
      runAsRoot([...FROZEN_SOURCE_FORWARD_ARGV], {
        launcher: harnessCopyWithNamespaceControllerIdentity(),
      });

    it('execs the frozen argv byte-identically', () => {
      const result = accept();
      expect(result.status, `launcher stderr:\n${result.stderr}`).toBe(0);
      expect(result.record).not.toBeNull();
      expect(result.record!.argv).toEqual([...FROZEN_SOURCE_FORWARD_ARGV]);
    });

    it('rebuilds exactly the frozen env with env -i, scrubbing everything else', () => {
      const result = accept();
      expect(result.record!.env).toEqual(FROZEN_SOURCE_FORWARD_ENV);
    });

    it('hands the child the cutover lock on descriptor 9 as an identity handle', () => {
      const result = accept();
      expect(result.record!.fds).toEqual([0, 1, 2, 9]);
      expect(result.record!.leaseTarget).toBe(CUTOVER_LOCK);
    });

    it('never locks it — a fresh flock still succeeds when nobody else holds it', () => {
      // Load-bearing and counter-intuitive: in the real window the CONTROLLER holds LOCK_EX, and the
      // child's liveness proof (source-recovery-run.sh:405-410) requires a fresh flock to FAIL because
      // of that. If the launcher took the lock itself the acquisition would fail closed against the
      // controller. Here nobody holds it, so a fresh flock MUST succeed — proving the launcher opened
      // the descriptor without locking it.
      const result = accept();
      expect(result.record!.freshFlockSucceeded).toBe(true);
    });
  }
);

describe('Q12 controller routing: only source.forward is escalated', () => {
  it('prefixes exactly the frozen source.forward argv with sudo -n -- <launcher>', () => {
    const out = driveRoutingRunner();
    const forward = out.sourceForward as unknown as Record<string, unknown>;

    expect(forward.executed, `execute_ordinary raised: ${String(forward.error)}`).toBe(true);
    expect(out.sudoBin).toBe('/usr/bin/sudo');
    // The launcher is the controller's own sibling, so in production this is
    // /opt/megacampus/deploy/qdrant/q12-privileged-launch.sh — the same precedent launch_claim uses
    // for q12-capability-run.sh.
    expect(out.launcherPath).toBe(resolve(REPO_ROOT, 'deploy/qdrant/q12-privileged-launch.sh'));
    expect(forward.launchArgv).toEqual([
      '/usr/bin/sudo',
      '-n',
      '--',
      out.launcherPath,
      ...FROZEN_SOURCE_FORWARD_ARGV,
    ]);
  });

  it('leaves the recorded command and env untouched (§D7)', () => {
    const out = driveRoutingRunner();
    const forward = out.sourceForward as unknown as Record<string, unknown>;

    expect(forward.commandNotMutated).toBe(true);
    expect(forward.launchEnv).toEqual(FROZEN_SOURCE_FORWARD_ENV);
    expect(forward.frozenArgv).toEqual([...FROZEN_SOURCE_FORWARD_ARGV]);
    // command_sha256 is the journal's binding and covers the MANIFEST argv only; the launch prefix
    // must not reach it.
    expect(forward.launchCommandSha256).toBe(
      createHash('sha256')
        .update(JSON.stringify([...FROZEN_SOURCE_FORWARD_ARGV]))
        .digest('hex')
    );
  });

  it.each(['migrationBaseApply', 'writersQuiesce'])(
    'keeps %s on the direct launch — there is no generic escalation hook',
    key => {
      const out = driveRoutingRunner();
      const command = out[key] as unknown as Record<string, unknown>;

      expect(command.executed, `execute_ordinary raised: ${String(command.error)}`).toBe(true);
      expect(command.launchArgv).toEqual(command.frozenArgv);
      expect(command.launchEnv).toEqual(command.frozenEnv);
      expect(command.commandNotMutated).toBe(true);
    }
  );
});
