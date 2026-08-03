import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const SERVICE = resolve(REPO_ROOT, 'deploy/systemd/megacampus-supabase-backup.service');
const TIMER = resolve(REPO_ROOT, 'deploy/systemd/megacampus-supabase-backup.timer');
const WRAPPER = resolve(REPO_ROOT, 'deploy/postgres/scheduled-backup-run.sh');
const INSTALLER = resolve(REPO_ROOT, 'deploy/postgres/install-supabase-backup-schedule.sh');
const TEST_MODE = 'mc2-synthetic-schedule-test-only';
const roots: string[] = [];

function tracked(path: string): string {
  expect(existsSync(path)).toBe(true);
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function trackedInstallerLifecycle(): string {
  const script = tracked(INSTALLER);
  const begin = '# BEGIN authoritative schedule proof lifecycle';
  const end = '# END authoritative schedule proof lifecycle';
  const start = script.indexOf(begin);
  const finish = script.indexOf(end);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(finish).toBeGreaterThan(start);
  return `${script.slice(start + begin.length, finish)}\n`;
}

function executable(path: string, contents: string): void {
  writeFileSync(path, contents, { mode: 0o700 });
  chmodSync(path, 0o700);
}

function scheduleFixture(): {
  root: string;
  backupRoot: string;
  q12Root: string;
  scheduleLock: string;
  launches: string;
  ready: string;
  release: string;
  env: NodeJS.ProcessEnv;
} {
  const root = mkdtempSync('/tmp/mc2-supabase-schedule-');
  roots.push(root);
  chmodSync(root, 0o700);
  const backupRoot = join(root, 'supabase');
  const q12Root = join(root, 'q12');
  mkdirSync(backupRoot, { mode: 0o700 });
  mkdirSync(q12Root, { mode: 0o700 });
  const scheduleLock = join(backupRoot, 'schedule.lock');
  const backupLock = join(backupRoot, 'backup.lock');
  for (const lock of [scheduleLock, backupLock]) writeFileSync(lock, '', { mode: 0o600 });
  const uuid = join(root, 'uuid');
  writeFileSync(uuid, '11111111-2222-4333-8444-555555555555\n', { mode: 0o600 });
  const launches = join(root, 'launches');
  const ready = join(root, 'ready');
  const release = join(root, 'release');
  const backup = join(root, 'backup');
  executable(
    backup,
    `#!/usr/bin/bash
set -eu
count=0; [[ ! -f '${launches}' ]] || count="$(/usr/bin/cat '${launches}')"; printf '%s' "$((count + 1))" >'${launches}'
generation="generation-20300101T000000Z-11111111-2222-4333-8444-555555555555"
/usr/bin/mkdir -p '${backupRoot}'/"$generation"
printf '{"generation":"%s"}\n' "$generation" >'${backupRoot}/latest.json'
if [[ "\${MC2_SCHEDULE_FAKE_WAIT:-}" == 1 ]]; then : >'${ready}'; while [[ ! -e '${release}' ]]; do /usr/bin/sleep 0.02; done; fi
`
  );
  return {
    root,
    backupRoot,
    q12Root,
    scheduleLock,
    launches,
    ready,
    release,
    env: {
      PATH: '/usr/bin:/bin',
      MC2_SUPABASE_SCHEDULE_TEST_MODE: TEST_MODE,
      MC2_SUPABASE_SCHEDULE_TEST_ROOT: root,
      MC2_SUPABASE_SCHEDULE_TEST_BACKUP_COMMAND: backup,
      MC2_SUPABASE_SCHEDULE_TEST_UUID_FILE: uuid,
    },
  };
}

async function waitFor(path: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!existsSync(path)) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${path}`);
    await new Promise(resolvePromise => setTimeout(resolvePromise, 20));
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('replacement Supabase backup systemd units', () => {
  it('runs the owner-only scheduler entrypoint after network-online with a two-hour bound', () => {
    const service = tracked(SERVICE);

    expect(service).toContain('Type=oneshot');
    expect(service).toContain('User=claude-deploy');
    expect(service).toContain('Group=claude-deploy');
    expect(service).toContain('UMask=0077');
    expect(service).toContain('Wants=network-online.target');
    expect(service).toContain('After=network-online.target');
    expect(service).toContain('TimeoutStartSec=2h');
    expect(service).toContain('WorkingDirectory=/opt/megacampus');
    expect(service).toContain('ExecStart=/opt/megacampus/deploy/postgres/scheduled-backup-run.sh');
  });

  it('appends both streams to the fixed log and limits filesystem writes', () => {
    const service = tracked(SERVICE);

    expect(service).toContain('StandardOutput=append:/opt/megacampus/logs/backup-supabase.log');
    expect(service).toContain('StandardError=append:/opt/megacampus/logs/backup-supabase.log');
    expect(service).toContain('NoNewPrivileges=true');
    expect(service).toContain('PrivateTmp=true');
    expect(service).toContain('ProtectSystem=strict');
    // tmpfs (not true): libpq treats EACCES on the default ~/.postgresql
    // client certificate as fatal, while the empty tmpfs home yields ENOENT
    // and libpq proceeds without a client certificate.
    expect(service).toContain('ProtectHome=tmpfs');
    expect(service).not.toContain('ProtectHome=true');
    expect(service).toContain('ReadOnlyPaths=/opt/megacampus/deploy /opt/megacampus/secrets');
    expect(service).toContain(
      'ReadWritePaths=/opt/megacampus/backups/supabase /opt/megacampus/logs'
    );
  });

  // mc2-1cxna: the timer is ENABLED and its 00:30 run on 2026-07-31 failed, leaving a one-night
  // hole in the backup chain that nothing raised — the only trace was a log line nobody reads.
  it('publishes a freshness metric only after the backup has actually been validated', () => {
    const service = tracked(SERVICE);
    const scheduler = tracked(WRAPPER);

    expect(service).toContain('/var/lib/megacampus/qdrant-metrics');
    // Scoped to this oneshot rather than added to the login user's own groups.
    expect(service).toContain('SupplementaryGroups=megacampus-metrics');

    expect(scheduler).toContain('megacampus_supabase_last_successful_backup_unixtime_seconds');
    // The stamp must come after pointer publication, or it would report a backup that failed.
    expect(scheduler.indexOf('publish_backup_metric\ncompleted=1')).toBeGreaterThan(
      scheduler.indexOf('append_journal passed')
    );
    // Best effort: an unwritable metrics directory must not fail an otherwise good backup.
    expect(scheduler).toContain('metric not published');
  });

  // mc2-0tcyw: the 2026-08-03 00:30 run failed on a transient and an identical manual re-run at
  // 07:26 passed. With no Restart= at all, that single blip cost a whole night of backup coverage
  // and paged a human for something the machine could have retried.
  it('retries a transient failure inside the night, without ever looping', () => {
    const service = tracked(SERVICE);

    expect(service).toContain('Restart=on-failure');
    expect(service).toContain('RestartSec=10min');
    // A genuinely broken backup must still reach failed state and still alert.
    expect(service).toContain('StartLimitIntervalSec=6h');
    expect(service).toContain('StartLimitBurst=4');
    // 64 is the wrapper's usage refusal and 75 its contention refusal (Q12 active, or another
    // backup holding the lock). Both are decisions, not failures a retry could change.
    expect(service).toContain('RestartPreventExitStatus=64 75');
    expect(service).not.toContain('Restart=always');

    const wrapper = tracked(WRAPPER);
    expect(wrapper).toContain("fail 'refusing scheduled backup while Q12 is active' 75");
    expect(wrapper).toContain("fail 'another backup process is active' 75");
  });

  it('fires at 00:30 Europe/Amsterdam with deterministic persistent catch-up', () => {
    const timer = tracked(TIMER);

    expect(timer).toContain('OnCalendar=*-*-* 00:30:00 Europe/Amsterdam');
    expect(timer).toContain('Persistent=true');
    expect(timer).toContain('AccuracySec=1m');
    expect(timer).toContain('RandomizedDelaySec=0');
    expect(timer).toContain('Unit=megacampus-supabase-backup.service');
    expect(timer).toContain('WantedBy=timers.target');
  });
});

describe('scheduler-only backup wrapper', () => {
  it('accepts no operator overrides and refuses an active Q12 journal or host lock', () => {
    const wrapper = tracked(WRAPPER);

    expect(wrapper).toContain('[[ $# -eq 0 ]]');
    expect(wrapper).toContain('/opt/megacampus/backups/q12/cutover.lock');
    expect(wrapper).toContain('/opt/megacampus/backups/q12/active-run');
    expect(wrapper).toContain('refusing scheduled backup while Q12 is active');
    expect(wrapper).not.toContain('--q12-run-id');
    expect(wrapper).not.toContain('--snapshot');
    expect(wrapper).not.toContain('--db-url');
    expect(wrapper).not.toContain('--capability');
  });

  it('treats dangling Q12 markers and malformed lock files as active or unsafe', () => {
    const wrapper = tracked(WRAPPER);

    expect(wrapper).toContain('[[ ! -e "$Q12_ACTIVE_RUN" && ! -L "$Q12_ACTIVE_RUN" ]]');
    expect(wrapper).toContain('[[ -f "$Q12_LOCK" && ! -L "$Q12_LOCK" ]] ||');
    expect(wrapper).toContain('require_owned_lock \'schedule lock\' "$SCHEDULE_LOCK"');
    expect(wrapper).toContain('require_owned_lock \'backup lock\' "$BACKUP_LOCK"');
  });

  it('uses distinct nonblocking schedule and backup locks with a generated UUID', () => {
    const wrapper = tracked(WRAPPER);

    expect(wrapper).toContain('/opt/megacampus/backups/supabase/schedule.lock');
    expect(wrapper).toContain('/opt/megacampus/backups/supabase/backup.lock');
    expect(wrapper).toContain('flock --nonblock');
    expect(wrapper).toContain('/proc/sys/kernel/random/uuid');
    expect(wrapper).toContain('/opt/megacampus/backups/supabase/scheduler-journal.jsonl');
  });

  it('executes active-Q12 refusal and real kernel flock contention in the synthetic root', async () => {
    const item = scheduleFixture();
    writeFileSync(join(item.q12Root, 'active-run'), 'active\n', { mode: 0o600 });
    const active = spawnSync('/usr/bin/bash', [WRAPPER], { env: item.env, encoding: 'utf8' });
    expect(active.status).toBe(75);
    expect(active.stderr).toContain('refusing scheduled backup while Q12 is active');
    rmSync(join(item.q12Root, 'active-run'));

    const held = join(item.root, 'flock-held');
    const releaseLock = join(item.root, 'flock-release');
    const holder = spawn('/usr/bin/flock', [
      '--exclusive',
      item.scheduleLock,
      '/usr/bin/bash',
      '-c',
      `: > '${held}'; while [[ ! -e '${releaseLock}' ]]; do /usr/bin/sleep 0.02; done`,
    ]);
    await waitFor(held);
    const contended = spawnSync('/usr/bin/bash', [WRAPPER], {
      env: item.env,
      encoding: 'utf8',
    });
    expect(contended.status).toBe(75);
    expect(contended.stderr).toContain('another scheduled backup run is active');
    writeFileSync(releaseLock, '', { mode: 0o600 });
    await once(holder, 'close');
  });

  it('allows one launch while a concurrent duplicate loses the real schedule lock', async () => {
    const item = scheduleFixture();
    const first = spawn('/usr/bin/bash', [WRAPPER], {
      env: { ...item.env, MC2_SCHEDULE_FAKE_WAIT: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let firstStderr = '';
    first.stderr?.on('data', chunk => {
      firstStderr += String(chunk);
    });
    const deadline = Date.now() + 5_000;
    while (!existsSync(item.ready)) {
      if (first.exitCode !== null) throw new Error(`first scheduler exited early: ${firstStderr}`);
      if (Date.now() > deadline)
        throw new Error(`timed out waiting for first scheduler: ${firstStderr}`);
      await new Promise(resolvePromise => setTimeout(resolvePromise, 20));
    }
    const duplicate = spawnSync('/usr/bin/bash', [WRAPPER], {
      env: item.env,
      encoding: 'utf8',
    });
    expect(duplicate.status).toBe(75);
    expect(duplicate.stderr).toContain('another scheduled backup run is active');
    writeFileSync(item.release, '', { mode: 0o600 });
    const [status] = (await once(first, 'close')) as [number];
    expect(status).toBe(0);
    expect(readFileSync(item.launches, 'utf8')).toBe('1');
  });
});

describe('fixed-hash backup schedule installer', () => {
  it('never executes mutable sibling lifecycle bytes before invalid-argv refusal', () => {
    const root = mkdtempSync('/tmp/mc2-supabase-installer-preflight-');
    roots.push(root);
    chmodSync(root, 0o700);
    const installer = join(root, 'install-supabase-backup-schedule.sh');
    const sibling = join(root, 'install-supabase-backup-schedule-lifecycle.sh');
    const marker = join(root, 'executed-before-preflight');
    executable(installer, tracked(INSTALLER));
    executable(sibling, '#!/usr/bin/bash\n: >"$MC2_TAMPER_MARKER"\n');

    const result = spawnSync('/usr/bin/bash', [installer, '--unsupported', 'value'], {
      env: { PATH: '/usr/bin:/bin', MC2_TAMPER_MARKER: marker },
      encoding: 'utf8',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('unsupported installer argument');
    expect(existsSync(marker)).toBe(false);
  });

  it('accepts only run id, two tracked hashes, and the exact confirmation phrase', () => {
    const installer = tracked(INSTALLER);

    expect(installer).toContain('--run-id');
    expect(installer).toContain('--service-sha256');
    expect(installer).toContain('--timer-sha256');
    expect(installer).toContain('INSTALL MC2 SUPABASE BACKUP SCHEDULE');
    expect(installer).not.toContain('--unit-content');
    expect(installer).not.toContain('--command');
    expect(installer).toContain('/opt/megacampus/backups/supabase/schedule.lock');
  });

  it('verifies timezone, network-online reachability, unit syntax, and installed metadata', () => {
    const installer = tracked(INSTALLER);

    expect(installer).toContain('Europe/Amsterdam');
    expect(installer).toContain('network-online.target');
    expect(installer).toContain('networking.service');
    expect(installer).toContain('systemd-analyze verify');
    expect(installer).toContain('daemon-reload');
    expect(installer).toContain('root:root');
    expect(installer).toContain('0644');
  });

  it('observes persistent catch-up without --now and enables only after backup plus restore pass', () => {
    const installer = tracked(INSTALLER);
    const lifecycle = trackedInstallerLifecycle();
    const combined = `${installer}\n${lifecycle}`;

    expect(lifecycle).toContain('"$SYSTEMCTL" start "$TIMER_NAME"');
    expect(combined).not.toContain('enable --now');
    expect(lifecycle).toContain('"$SYSTEMCTL" start "$SERVICE_NAME"');
    expect(installer).toContain('restore-supabase-drill.sh');
    expect(lifecycle).toContain('"$SYSTEMCTL" enable "$TIMER_NAME"');
    expect(lifecycle.indexOf('"$RUNUSER"')).toBeLessThan(
      lifecycle.indexOf('"$SYSTEMCTL" enable "$TIMER_NAME"')
    );
  });

  it('never restores the known-broken legacy cron command', () => {
    const installer = tracked(INSTALLER);
    const wrapper = tracked(WRAPPER);
    const combined = `${installer}\n${wrapper}`;

    expect(combined).not.toContain('backup_supabase.sh >>');
    expect(combined).not.toContain('crontab');
    expect(combined).toContain('legacy cron remains disabled');
  });

  it.each([
    ['backup failure', 'backup-fail'],
    ['restore failure', 'restore-fail'],
  ])('disables the timer after synthetic %s', (_label, scenario) => {
    const result = runInstallerLifecycleHarness(scenario);
    expect(result.status).not.toBe(0);
    const log = readFileSync(result.log, 'utf8');
    expect(log).toContain('stop megacampus-supabase-backup.timer');
    expect(log).toContain('disable megacampus-supabase-backup.timer');
    expect(log).not.toContain('enable megacampus-supabase-backup.timer');
  });

  // mc2-0tcyw: with Restart= in play, a unit that exhausted StartLimitBurst refuses every further
  // start until the window elapses. That is precisely the night an operator reaches for this
  // installer, and without clearing the counter first its proof would fail and the trap would
  // DISABLE the timer — turning backups off at the worst possible moment.
  it('clears an exhausted start-limit before it tries to prove the schedule', () => {
    const result = runInstallerLifecycleHarness('success');
    expect(result.status, result.stderr).toBe(0);
    const log = readFileSync(result.log, 'utf8');

    expect(log).toContain('reset-failed megacampus-supabase-backup.service');
    expect(log.indexOf('reset-failed megacampus-supabase-backup.service')).toBeLessThan(
      log.indexOf('start megacampus-supabase-backup.timer')
    );
  });

  it('uses the Persistent timer catch-up as one launch without a duplicate service start', () => {
    const result = runInstallerLifecycleHarness('success');
    expect(result.status, result.stderr).toBe(0);
    const log = readFileSync(result.log, 'utf8');
    expect(log).toContain('start megacampus-supabase-backup.timer');
    expect(log).not.toContain('start megacampus-supabase-backup.service');
    expect(log).toContain('enable megacampus-supabase-backup.timer');
    expect(readFileSync(result.launches, 'utf8')).toBe('1');
  });
});

function runInstallerLifecycleHarness(scenario: string): {
  status: number | null;
  stderr: string;
  log: string;
  launches: string;
} {
  const root = mkdtempSync('/tmp/mc2-supabase-installer-lifecycle-');
  roots.push(root);
  chmodSync(root, 0o700);
  const backupRoot = join(root, 'backups');
  mkdirSync(backupRoot, { mode: 0o700 });
  const oldGeneration = 'generation-20290101T000000Z-11111111-2222-4333-8444-555555555555';
  mkdirSync(join(backupRoot, oldGeneration), { mode: 0o700 });
  writeFileSync(join(backupRoot, 'latest.json'), `{"generation":"${oldGeneration}"}\n`, {
    mode: 0o600,
  });
  const log = join(root, 'systemctl.log');
  const launches = join(root, 'launches');
  const invocation = join(root, 'invocation');
  const resultFile = join(root, 'result');
  writeFileSync(invocation, 'old\n', { mode: 0o600 });
  writeFileSync(resultFile, 'success\n', { mode: 0o600 });
  writeFileSync(log, '', { mode: 0o600 });
  const systemctl = join(root, 'systemctl');
  executable(
    systemctl,
    `#!/usr/bin/bash
set -eu
printf '%s\n' "$*" >>'${log}'
if [[ "$1" == show && "$*" == *'InvocationID'* ]]; then /usr/bin/cat '${invocation}'; exit 0; fi
if [[ "$1" == reset-failed ]]; then exit 0; fi
if [[ "$1" == start && "$2" == megacampus-supabase-backup.timer ]]; then
  printf 'new\n' >'${invocation}'; printf '1' >'${launches}'
  if [[ '${scenario}' == backup-fail ]]; then printf 'failed\n' >'${resultFile}'; exit 0; fi
  generation='generation-20300101T000000Z-11111111-2222-4333-8444-555555555555'
  /usr/bin/mkdir -p '${backupRoot}'/"$generation"; printf '{"generation":"%s"}\n' "$generation" >'${backupRoot}/latest.json'; exit 0
fi
if [[ "$1" == show && "$*" == *'Result'* ]]; then /usr/bin/cat '${resultFile}'; exit 0; fi
if [[ "$1" == is-active && "$2" == megacampus-supabase-backup.service ]]; then exit 1; fi
if [[ "$1" == enable ]]; then : >'${root}/enabled'; exit 0; fi
if [[ "$1" == is-active || "$1" == is-enabled ]]; then [[ -e '${root}/enabled' ]]; exit; fi
if [[ "$1" == stop || "$1" == disable ]]; then exit 0; fi
exit 2
`
  );
  const runuser = join(root, 'runuser');
  executable(
    runuser,
    `#!/usr/bin/bash\nprintf 'restore %s\n' "$*" >>'${log}'\n[[ '${scenario}' != restore-fail ]]\n`
  );
  const restore = join(root, 'restore');
  executable(restore, '#!/usr/bin/bash\nexit 0\n');
  const lifecycle = join(root, 'install-supabase-backup-schedule-lifecycle-inline.sh');
  writeFileSync(lifecycle, trackedInstallerLifecycle(), { mode: 0o600 });
  const harness = `set -Eeuo pipefail
SYSTEMCTL=$1; RUNUSER=$2; BACKUP_ROOT=$3; RESTORE_COMMAND=$4; RUN_ID=11111111-2222-4333-8444-555555555555
SERVICE_NAME=megacampus-supabase-backup.service; TIMER_NAME=megacampus-supabase-backup.timer; installation_proven=0
fail(){ printf 'schedule proof failed: %s\\n' "$1" >&2; exit "\${2:-1}"; }
read_pointer_generation(){ /usr/bin/python3 - "$1" <<'PY'
import json, pathlib, sys
print(json.loads(pathlib.Path(sys.argv[1]).read_text())["generation"])
PY
}
source $5
trap disable_unproven_timer EXIT
prove_supabase_backup_schedule
trap - EXIT`;
  const result = spawnSync(
    '/usr/bin/bash',
    ['-c', harness, 'g7-installer-harness', systemctl, runuser, backupRoot, restore, lifecycle],
    { env: { PATH: '/usr/bin:/bin' }, encoding: 'utf8' }
  );
  return { status: result.status, stderr: result.stderr, log, launches };
}
