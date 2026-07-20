import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

// Q12 R8 SERVER CUSTODY REHEARSAL — BOUNDED SERVER-MECHANICS PROBES (found-defect #21,
// owner-ratified 2026-07-19). The full-path `run_live` server rehearsal was re-scoped: it
// cannot exercise the stock-CLI window path (test-mode forces the fusion's argv-rewrite that
// only the bespoke executor does — #21), so the server run now validates ONLY the genuinely
// server-new privileged MECHANICS that bwrap could only simulate: the #15 dual-bind at real
// privilege on the real /opt fs, the canonical FD-8/9 lease custody under real setpriv, and the
// uid-1000/0700 trust-root ownership the barrier :96 stat gate checks.
//
// This suite covers what is testable WITHOUT sudo/unshare/setpriv/prod:
//   * rehearsal-probe.sh --dry-run — the exact privileged command CONSTRUCTION per probe
//     (sudo unshare -m … setpriv --reuid=1000 for trust-bridge; sudo setpriv --reuid=1000 for
//     lease/uid), the throwaway-UUIDv4 run-id gate, NO privilege, NO /opt write;
//   * --emit-payload <probe> — the inner ASSERTION LOGIC of each probe, run directly against
//     supplied paths (mirrors the ns-launch inner-exec test: the real setpriv/unshare/mount is
//     the server's job; the local test proves the payload's checks are correct so a real
//     server failure is caught, not masked by a buggy assertion).
//
// The privileged execution itself is the orchestrator's server run on megacampus-prod (root),
// deferred honestly here — same pattern as rehearsal-ns-launch.sh.

const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const PROBE = resolve(repoRoot, 'deploy/qdrant/rehearsal/rehearsal-probe.sh');
const LIB = resolve(repoRoot, 'deploy/qdrant/rehearsal/rehearsal-lib.sh');
const POOLER = 'aws-1-us-east-2.pooler.supabase.com';
const RUN_ID = '123e4567-e89b-42d3-a456-426614174000';
const UUIDV4_RE = /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/;

const scratches: string[] = [];
afterEach(() => {
  while (scratches.length) rmSync(scratches.pop()!, { recursive: true, force: true });
});

function scratch(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratches.push(dir);
  return dir;
}

function dryRun(...args: string[]): { status: number; combined: string; stderr: string } {
  const r = spawnSync('bash', [PROBE, ...args], { encoding: 'utf8' });
  return { status: r.status ?? -1, combined: r.stdout + r.stderr, stderr: r.stderr };
}

function emitPayload(probe: string): string {
  const r = spawnSync('bash', [PROBE, '--emit-payload', probe], { encoding: 'utf8' });
  expect(r.status, r.stderr).toBe(0);
  return r.stdout;
}

describe('Q12 R8 rehearsal-probe.sh --dry-run (privileged command construction, no prod)', () => {
  it('builds the trust-bridge private-mount-namespace command (unshare -m + setpriv 1000)', () => {
    const { status, combined } = dryRun('--probe', 'trust-bridge', '--run-id', RUN_ID, '--dry-run');
    expect(status).toBe(0);
    expect(combined).toContain('sudo unshare -m /bin/sh -c');
    expect(combined).toContain('mount --bind');
    expect(combined).toContain('/etc/hosts');
    expect(combined).toContain('setpriv --reuid=1000 --regid=1000 --init-groups');
    expect(combined).toContain(`/opt/megacampus/backups/q12/${RUN_ID}`);
    expect(combined).toContain(POOLER);
  });

  it('builds the lease + uid probes under REAL setpriv (not bwrap), no unshare needed', () => {
    const { status, combined } = dryRun('--probe', 'all', '--run-id', RUN_ID, '--dry-run');
    expect(status).toBe(0);
    expect(combined).toContain('sudo setpriv --reuid=1000 --regid=1000 --init-groups');
    expect(combined).toContain('cutover.lock');
    expect(combined).toContain(`/opt/megacampus/backups/q12/${RUN_ID}`);
  });

  it('mints a throwaway UUIDv4 run-id when none is supplied (never a real cutover)', () => {
    const { status, combined } = dryRun('--probe', 'uid', '--dry-run');
    expect(status).toBe(0);
    expect(combined).toMatch(UUIDV4_RE);
  });

  it('rejects a run-id that is not an RFC 4122 UUIDv4 (barrier :72 regex)', () => {
    const { status, stderr } = dryRun('--probe', 'uid', '--run-id', 'not-a-uuid', '--dry-run');
    expect(status).not.toBe(0);
    expect(stderr).toContain('UUIDv4');
  });
});

describe('Q12 R8 trust-bridge probe payload (#15 dual-view logic, setpriv-stubbed)', () => {
  function runTrustPayload(
    payload: string,
    optView: string,
    trustView: string,
    hosts: string,
    uid: string
  ) {
    // Positionals mirror the server exec: $1=OPTVIEW $2=TRUSTVIEW $3=HOSTS $4=EXPECT_UID $5=POOLER.
    return spawnSync('/bin/bash', ['-c', payload, '_', optView, trustView, hosts, uid, POOLER], {
      encoding: 'utf8',
    });
  }

  it('passes when the two views are one inode, /etc/hosts carries the pooler line, uid matches', () => {
    const payload = emitPayload('trust-bridge');
    const optView = scratch('mc2-q12-probe-opt-');
    // A distinct path string resolving to the SAME dir (what the real mount --bind produces).
    const trustView = `${scratch('mc2-q12-probe-lnk-')}/view`;
    symlinkSync(optView, trustView);
    const hosts = join(scratch('mc2-q12-probe-hosts-'), 'hosts');
    writeFileSync(hosts, `127.0.0.1 localhost ${POOLER}\n::1 localhost ip6-localhost\n`);
    const uid = String(process.getuid?.() ?? 0);

    const r = runTrustPayload(payload, optView, trustView, hosts, uid);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('PROBE-TRUST-BRIDGE OK');
  });

  it('fails when the two views are NOT the same inode (dual-bind broken)', () => {
    const payload = emitPayload('trust-bridge');
    const optView = scratch('mc2-q12-probe-opt-');
    const otherView = scratch('mc2-q12-probe-other-'); // a DIFFERENT dir, not a bind of optView
    const hosts = join(scratch('mc2-q12-probe-hosts-'), 'hosts');
    writeFileSync(hosts, `127.0.0.1 localhost ${POOLER}\n`);
    const uid = String(process.getuid?.() ?? 0);

    const r = runTrustPayload(payload, optView, otherView, hosts, uid);
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toContain('FAIL');
  });

  it('fails when /etc/hosts does not redirect the pooler host to 127.0.0.1', () => {
    const payload = emitPayload('trust-bridge');
    const optView = scratch('mc2-q12-probe-opt-');
    const trustView = `${scratch('mc2-q12-probe-lnk-')}/view`;
    symlinkSync(optView, trustView);
    const hosts = join(scratch('mc2-q12-probe-hosts-'), 'hosts');
    writeFileSync(hosts, `127.0.0.1 localhost\n`); // NO pooler line
    const uid = String(process.getuid?.() ?? 0);

    const r = runTrustPayload(payload, optView, trustView, hosts, uid);
    expect(r.status).not.toBe(0);
  });
});

describe('Q12 R8 lease probe payload (FD-8/9 canonical custody logic)', () => {
  it('proves FD-9 exclusivity, FD-8/9 child inheritance, and a durable journal append', () => {
    const payload = emitPayload('lease');
    const dir = scratch('mc2-q12-probe-lease-');
    const lock = join(dir, 'cutover.lock');
    const journal = join(dir, 'phase.jsonl');
    const uid = String(process.getuid?.() ?? 0);
    const r = spawnSync('/usr/bin/python3', ['-c', payload, lock, journal, uid], {
      encoding: 'utf8',
    });
    expect(r.status, r.stderr).toBe(0);
    const out = JSON.parse(r.stdout) as {
      probe: string;
      ok: boolean;
      fd9_flock_acquired: boolean;
      second_flock_blocked: boolean;
      child_inherited_fd8_fd9: boolean;
      journal_durable: boolean;
      euid: number;
    };
    expect(out.probe).toBe('lease');
    expect(out.fd9_flock_acquired).toBe(true);
    expect(out.second_flock_blocked).toBe(true);
    expect(out.child_inherited_fd8_fd9).toBe(true);
    expect(out.journal_durable).toBe(true);
    expect(out.euid).toBe(process.getuid?.() ?? 0);
    expect(out.ok).toBe(true);
  });
});

describe('Q12 R8 uid/ownership probe payload (barrier :96 stat gate logic)', () => {
  it('passes when euid, trust-root owner, and 0700 mode all agree', () => {
    const payload = emitPayload('uid');
    const trustRoot = scratch('mc2-q12-barrier-'); // mkdtemp is 0700 owned by the current uid
    chmodSync(trustRoot, 0o700);
    const uid = String(process.getuid?.() ?? 0);
    const r = spawnSync('/bin/bash', ['-c', payload, '_', trustRoot, uid], { encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('PROBE-UID OK');
  });

  it('fails when the trust root is not 0700', () => {
    const payload = emitPayload('uid');
    const trustRoot = scratch('mc2-q12-barrier-');
    chmodSync(trustRoot, 0o755);
    const uid = String(process.getuid?.() ?? 0);
    const r = spawnSync('/bin/bash', ['-c', payload, '_', trustRoot, uid], { encoding: 'utf8' });
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toContain('FAIL');
  });
});

// Found-defect #22: rehearsal_make_trust_root claimed a "uid-1000-owned 0700 trust root" but never
// chowned — under sudo the mktemp dir is root:root 0700, so setpriv-1000 cannot even traverse it
// (the FIRST real privileged server run hit "Permission denied" reading the payload). The fix chowns
// the root to the target uid:gid, GUARDED to the privileged (EUID==0) context so the local
// non-root --dry-run/worker callers do not attempt it. Tested with `id`/`chown` PATH-stubbed (no
// real root needed; the real chown is the server's job — same defer pattern as the probes).
describe('Q12 R8 rehearsal-lib.sh rehearsal_make_trust_root (found-defect #22)', () => {
  function callMakeTrustRoot(fakeUid: string) {
    const bin = mkdtempSync(join(tmpdir(), 'mc2-q12-libstub-'));
    scratches.push(bin);
    const chownLog = join(bin, 'chown.log');
    writeFileSync(
      join(bin, 'id'),
      `#!/bin/sh\nif [ "$1" = -u ]; then echo ${fakeUid}; else exec /usr/bin/id "$@"; fi\n`,
      { mode: 0o755 }
    );
    writeFileSync(join(bin, 'chown'), `#!/bin/sh\necho "$*" >> "${chownLog}"\n`, { mode: 0o755 });
    const r = spawnSync(
      'bash',
      ['-c', `source '${LIB}'; reuid=1000; regid=1000; rehearsal_make_trust_root`],
      {
        encoding: 'utf8',
        env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}` },
      }
    );
    const root = r.stdout.trim();
    if (root) scratches.push(root);
    const log = existsSync(chownLog) ? readFileSync(chownLog, 'utf8') : '';
    return { status: r.status ?? -1, root, log, stderr: r.stderr };
  }

  it('chowns the trust root to the target uid:gid when EUID==0 (privileged, barrier :96 gate)', () => {
    const { status, root, log, stderr } = callMakeTrustRoot('0');
    expect(status, stderr).toBe(0);
    expect(existsSync(root)).toBe(true);
    expect(root).toMatch(/\/tmp\/mc2-q12-barrier-/);
    expect(log).toContain('1000:1000');
    expect(log).toContain(root);
  });

  it('does NOT chown when non-root (the local --dry-run/worker path)', () => {
    const { status, root, log, stderr } = callMakeTrustRoot('1000');
    expect(status, stderr).toBe(0);
    expect(existsSync(root)).toBe(true);
    expect(log).toBe('');
  });
});
