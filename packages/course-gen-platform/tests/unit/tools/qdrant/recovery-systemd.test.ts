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
      expect(unit).toContain('StateDirectory=megacampus-qdrant-recovery');
      expect(unit).not.toContain('StateDirectory=megacampus-qdrant-metrics');
      expect(unit).toContain('QDRANT_RECOVERY_LOCK_HELD=1');
      expect(unit).toContain(
        'Environment=QDRANT_METRICS_TEXTFILE_DIR=/var/lib/megacampus/qdrant-metrics'
      );
      expect(unit).toContain(
        'ReadWritePaths=/var/lib/megacampus-qdrant-recovery /var/lib/megacampus/qdrant-metrics /run/megacampus-qdrant-recovery'
      );
      const metricsPreflight =
        'ExecStartPre=/usr/bin/bash -eu -c \'test -d "$1" && test ! -L "$1" && test -w "$1" && test "$(/usr/bin/stat -c %%a -- "$1")" = 2775\' -- /var/lib/megacampus/qdrant-metrics';
      expect(unit).toContain(metricsPreflight);
      expect(unit.indexOf(metricsPreflight)).toBeLessThan(unit.indexOf('ExecStart='));
      expect(unit).toContain('/usr/bin/docker compose');
      expect(unit).toContain('--project-directory /opt/megacampus');
      expect(unit).toContain('-f /opt/megacampus/docker-compose.infra.yml');
      expect(unit).toContain('--env-file /opt/megacampus/.env.production');
      expect(unit).toContain('run --rm --no-deps -T');
      expect(unit).not.toContain('/usr/bin/pnpm');
      expect(unit).not.toContain('WorkingDirectory=/opt/megacampus/packages/course-gen-platform');
      expect(unit).not.toContain('EnvironmentFile=');
      expect(unit).not.toMatch(/access[_-]?key|secret[_-]?key|api[_-]?key=/iu);
      expect(unit).not.toMatch(/(?:mkdir|chmod).*qdrant-metrics/iu);
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
    expect(restore).toContain('qdrant-restore-operator restore-drill');
    expect(restore).toContain('Environment=QDRANT_SNAPSHOT_TRANSPORT_URL=http://qdrant:6333');

    expect(snapshot).toContain(
      'Environment=QDRANT_API_KEY_FILE=/var/lib/megacampus-qdrant-recovery/runtime/snapshot/qdrant_api_key'
    );
    expect(snapshot).toContain(
      'ExecStartPre=/usr/bin/install -D -o 0 -g 0 -m 0400 %d/qdrant_api_key /var/lib/megacampus-qdrant-recovery/runtime/snapshot/qdrant_api_key'
    );
    expect(snapshot).toContain(
      'ExecStopPost=/usr/bin/rm -rf /var/lib/megacampus-qdrant-recovery/runtime/snapshot'
    );

    expect(restore).toContain(
      'Environment=QDRANT_API_KEY_FILE=/var/lib/megacampus-qdrant-recovery/runtime/restore/qdrant_api_key'
    );
    expect(restore).toContain(
      'Environment=QDRANT_SNAPSHOT_MANIFEST_FILE=/var/lib/megacampus-qdrant-recovery/runtime/restore/snapshot_manifest'
    );
    expect(restore).toContain(
      'Environment=QDRANT_RECOVERY_PROBE_FILE=/var/lib/megacampus-qdrant-recovery/runtime/restore/recovery_probe'
    );
    expect(restore).toContain(
      'ExecStartPre=/usr/bin/install -D -o 0 -g 0 -m 0400 %d/snapshot_manifest /var/lib/megacampus-qdrant-recovery/runtime/restore/snapshot_manifest'
    );
    expect(restore).toContain(
      'ExecStartPre=/usr/bin/install -D -o 0 -g 0 -m 0400 %d/recovery_probe /var/lib/megacampus-qdrant-recovery/runtime/restore/recovery_probe'
    );
    expect(restore).toContain(
      'ExecStopPost=/usr/bin/rm -rf /var/lib/megacampus-qdrant-recovery/runtime/restore'
    );
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
});
