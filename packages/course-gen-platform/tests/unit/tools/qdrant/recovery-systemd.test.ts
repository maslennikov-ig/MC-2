import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../../../../../..');

async function read(relativePath: string): Promise<string> {
  return readFile(resolve(ROOT, relativePath), 'utf8');
}

describe('Qdrant recovery systemd contract', () => {
  it('exposes snapshot and restore package commands', async () => {
    const pkg = JSON.parse(await read('packages/course-gen-platform/package.json')) as {
      scripts: Record<string, string>;
    };

    expect(pkg.scripts['qdrant:snapshot']).toBe('tsx tools/qdrant/snapshot.ts');
    expect(pkg.scripts['qdrant:restore-drill']).toBe('tsx tools/qdrant/restore-drill.ts');
  });

  it('uses one nonblocking lock, a profile-only operator container, narrow credentials, and hardening', async () => {
    const snapshot = await read('deploy/systemd/megacampus-qdrant-snapshot.service');
    const restore = await read('deploy/systemd/megacampus-qdrant-restore-drill.service');

    for (const unit of [snapshot, restore]) {
      expect(unit).toContain('UMask=0077');
      expect(unit).toContain('NoNewPrivileges=true');
      expect(unit).toContain('ProtectSystem=strict');
      expect(unit).toContain('ProtectHome=true');
      expect(unit).toContain('PrivateTmp=true');
      // NOT StateDirectory: systemd re-asserts its ownership for every command it forks, so the
      // unit's own `chown 1001:1001` was undone before ExecStart and the tool uid could not open
      // /var/lib/megacampus-qdrant-recovery/metrics-state.json. Measured 2026-07-31, the first time
      // these units were ever run. ReadWritePaths already makes the directory writable under
      // ProtectSystem=strict, so systemd does not need to own it — the unit does, explicitly.
      expect(unit).not.toMatch(/^StateDirectory=/mu);
      expect(unit).toContain(
        'ExecStartPre=/usr/bin/chown 1001:1001 /var/lib/megacampus-qdrant-recovery'
      );
      expect(unit).toContain(
        'ExecStartPre=/usr/bin/chmod 0700 /var/lib/megacampus-qdrant-recovery'
      );
      expect(unit).toContain('QDRANT_RECOVERY_LOCK_HELD=1');
      expect(unit).toContain(
        'Environment=QDRANT_METRICS_TEXTFILE_DIR=/var/lib/megacampus/qdrant-metrics'
      );
      expect(unit).toContain(
        'ReadWritePaths=/var/lib/megacampus-qdrant-recovery /var/lib/megacampus/qdrant-metrics /run/megacampus-qdrant-recovery'
      );
      const metricsPreflight =
        'ExecStartPre=/opt/megacampus/deploy/qdrant/operator-compose.sh --project-directory /opt/megacampus -f /opt/megacampus/docker-compose.infra.yml --env-file /opt/megacampus/.env.production --profile operator run --rm --no-deps -T qdrant-recovery-operator metrics-check';
      expect(unit).toContain(metricsPreflight);
      expect(unit.indexOf(metricsPreflight)).toBeLessThan(unit.indexOf('ExecStart='));
      expect(unit).toContain('/opt/megacampus/deploy/qdrant/operator-compose.sh');
      expect(unit).toContain('--project-directory /opt/megacampus');
      expect(unit).toContain('-f /opt/megacampus/docker-compose.infra.yml');
      expect(unit).toContain('--env-file /opt/megacampus/.env.production');
      expect(unit).toContain('run --rm --no-deps -T');
      expect(unit).toContain('-e QDRANT_RECOVERY_LOCK_HELD=1');
      expect(unit).not.toContain('/usr/bin/pnpm');
      expect(unit).not.toContain('WorkingDirectory=/opt/megacampus/packages/course-gen-platform');
      expect(unit).not.toContain('EnvironmentFile=');
      expect(unit).not.toMatch(/access[_-]?key|secret[_-]?key|api[_-]?key=/iu);
      expect(unit).not.toMatch(/(?:mkdir|chmod|test -w).*qdrant-metrics/iu);
    }

    expect(snapshot.match(/^LoadCredential=/gmu)).toHaveLength(1);
    expect(snapshot).toContain(
      'LoadCredential=qdrant_api_key:/opt/megacampus/secrets/qdrant_api_key'
    );
    expect(restore.match(/^LoadCredential=/gmu)).toHaveLength(3);
    expect(restore).toContain(
      'LoadCredential=qdrant_api_key:/opt/megacampus/secrets/qdrant_api_key'
    );
    expect(restore).toContain(
      'LoadCredential=snapshot_manifest:/var/lib/megacampus-qdrant-recovery/manifests/latest-manifest.json'
    );
    expect(restore).toContain('LoadCredential=recovery_probe:/opt/megacampus/recovery/probe.json');
    expect(snapshot).toContain('qdrant-recovery-operator snapshot');
    expect(snapshot).not.toContain('QDRANT_SNAPSHOT_STORAGE_MODE=s3');
    expect(restore).toContain('qdrant-restore-operator restore-drill');
    expect(restore).toContain('Environment=QDRANT_SNAPSHOT_TRANSPORT_URL=http://qdrant:6333');

    expect(snapshot).toContain(
      'Environment=QDRANT_API_KEY_FILE=/run/megacampus-qdrant-snapshot-credentials/qdrant_api_key'
    );
    expect(snapshot).toContain(
      'ExecStartPre=/usr/bin/install -o 0 -g 0 -m 0400 %d/qdrant_api_key /run/megacampus-qdrant-snapshot-credentials/qdrant_api_key'
    );
    expect(snapshot).toContain(
      'RuntimeDirectory=megacampus-qdrant-recovery megacampus-qdrant-snapshot-credentials'
    );
    expect(snapshot).not.toContain('ExecStopPost=/usr/bin/rm -rf');

    expect(restore).toContain(
      'Environment=QDRANT_API_KEY_FILE=/run/megacampus-qdrant-restore-credentials/qdrant_api_key'
    );
    expect(restore).toContain(
      'Environment=QDRANT_SNAPSHOT_MANIFEST_FILE=/run/megacampus-qdrant-restore-credentials/snapshot_manifest'
    );
    expect(restore).toContain(
      'Environment=QDRANT_RECOVERY_PROBE_FILE=/run/megacampus-qdrant-restore-credentials/recovery_probe'
    );
    expect(restore).toContain(
      'ExecStartPre=/usr/bin/install -o 0 -g 0 -m 0400 %d/snapshot_manifest /run/megacampus-qdrant-restore-credentials/snapshot_manifest'
    );
    expect(restore).toContain(
      'ExecStartPre=/usr/bin/install -o 0 -g 0 -m 0400 %d/recovery_probe /run/megacampus-qdrant-restore-credentials/recovery_probe'
    );
    expect(restore).toContain(
      'RuntimeDirectory=megacampus-qdrant-recovery megacampus-qdrant-restore-credentials'
    );
    expect(restore).not.toContain('ExecStopPost=/usr/bin/rm -rf');
  });

  it('proves snapshot cadence plus jitter and accuracy stays below six hours', async () => {
    const timer = await read('deploy/systemd/megacampus-qdrant-snapshot.timer');

    expect(timer).toContain('OnCalendar=*-*-* 00/4:15:00');
    expect(timer).toContain('RandomizedDelaySec=10m');
    expect(timer).toContain('AccuracySec=1m');
    expect(timer).toContain('Persistent=true');
    expect(4 * 60 + 10 + 1).toBeLessThanOrEqual(6 * 60);
  });

  it('schedules a persistent monthly non-overlapping restore drill', async () => {
    const timer = await read('deploy/systemd/megacampus-qdrant-restore-drill.timer');

    expect(timer).toContain('OnCalendar=monthly');
    expect(timer).toContain('Persistent=true');
    expect(timer).toContain('RandomizedDelaySec=1h');
    expect(timer).toContain('AccuracySec=1m');
  });

  it('keeps timers opt-in until both manual oneshots have passed', async () => {
    for (const name of [
      'megacampus-qdrant-snapshot.timer',
      'megacampus-qdrant-restore-drill.timer',
    ]) {
      const timer = await read(`deploy/systemd/${name}`);
      expect(timer).not.toContain('Also=');
      expect(timer).not.toContain('WantedBy=multi-user.target');
    }

    const runbook = await read('docs/operations/qdrant-self-hosted.md');
    expect(runbook).toContain('Do not enable either timer until both manual oneshots');
  });
});
