import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const SERVICE = resolve(REPO_ROOT, 'deploy/systemd/megacampus-supabase-backup.service');
const TIMER = resolve(REPO_ROOT, 'deploy/systemd/megacampus-supabase-backup.timer');
const WRAPPER = resolve(REPO_ROOT, 'deploy/postgres/scheduled-backup-run.sh');
const INSTALLER = resolve(REPO_ROOT, 'deploy/postgres/install-supabase-backup-schedule.sh');

function tracked(path: string): string {
  expect(existsSync(path)).toBe(true);
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

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
    expect(service).toContain('ReadOnlyPaths=/opt/megacampus/deploy /opt/megacampus/secrets');
    expect(service).toContain(
      'ReadWritePaths=/opt/megacampus/backups/supabase /opt/megacampus/logs'
    );
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
});

describe('fixed-hash backup schedule installer', () => {
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

    expect(installer).toContain('systemctl start megacampus-supabase-backup.timer');
    expect(installer).not.toContain('enable --now');
    expect(installer).toContain('systemctl start megacampus-supabase-backup.service');
    expect(installer).toContain('restore-supabase-drill.sh');
    expect(installer).toContain('systemctl enable megacampus-supabase-backup.timer');
    expect(installer.indexOf('restore-supabase-drill.sh')).toBeLessThan(
      installer.indexOf('systemctl enable megacampus-supabase-backup.timer')
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
});
