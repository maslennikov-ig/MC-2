import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

/**
 * Environment gate for the suites that need EUID 0 inside an UNPRIVILEGED user namespace.
 *
 * `q12-privileged-launch.test.ts` drives the root-owned launcher, whose first assertion is
 * `EUID -eq 0`. It reaches root without root the way this repo already does for identity gates
 * (`q12-live-cutover.test.ts:1531`): `bwrap --unshare-user --uid 0 --gid 0`, with a tmpfs `/opt`
 * so the launcher's hardcoded absolute production constants resolve without touching the host.
 *
 * Two things a generic runner may not provide: the `bwrap` binary, and permission to create
 * unprivileged user namespaces (`kernel.unprivileged_userns_clone=0`, some container runtimes'
 * seccomp profiles, or a missing `CAP_SYS_ADMIN` path for nested namespaces). Neither is a defect
 * in the launcher, so those cases SKIP there instead of erroring — mirroring the
 * `MC2_Q12_REAL_PG17` / `MC2_Q12_REAL_CONTROLLER` convention.
 *
 * This is a FUNCTIONAL probe, not a guess: it actually enters the namespace and asks the kernel who
 * it is, so a box where the namespace is created but the uid map is refused also skips. Override
 * explicitly with `MC2_Q12_USERNS_SANDBOX=1` (force run) or `=0` (force skip).
 *
 * Note the ungated half of that suite: the frozen-constant/install-contract assertions (pure file
 * reads — the ones that catch a future edit to the 1000/1000 controller identity), the not-root
 * refusal (which needs no sandbox precisely because we are not root), and the controller-routing
 * cases all run everywhere.
 */
function probeUserNamespaceRoot(): boolean {
  if (!existsSync('/usr/bin/bwrap')) {
    return false;
  }
  const probe = spawnSync(
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
      '--symlink',
      'usr/bin',
      '/bin',
      '--symlink',
      'usr/lib',
      '/lib',
      '--symlink',
      'usr/lib64',
      '/lib64',
      '--proc',
      '/proc',
      '--tmpfs',
      '/opt',
      '--',
      '/usr/bin/id',
      '-u',
    ],
    { encoding: 'utf8', env: { PATH: '/usr/bin:/bin' }, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  return probe.status === 0 && probe.stdout.trim() === '0';
}

export const RUN_USER_NAMESPACE_SANDBOX: boolean =
  process.env.MC2_Q12_USERNS_SANDBOX !== undefined
    ? process.env.MC2_Q12_USERNS_SANDBOX === '1'
    : probeUserNamespaceRoot();
