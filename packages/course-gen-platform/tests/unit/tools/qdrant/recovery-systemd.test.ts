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

  it('uses one nonblocking lock, absolute executables, narrow credentials, and hardening', async () => {
    const snapshot = await read('deploy/systemd/megacampus-qdrant-snapshot.service');
    const restore = await read('deploy/systemd/megacampus-qdrant-restore-drill.service');

    for (const unit of [snapshot, restore]) {
      expect(unit).toContain('User=megacampus');
      expect(unit).toContain('Group=megacampus');
      expect(unit).toContain('UMask=0077');
      expect(unit).toContain('NoNewPrivileges=true');
      expect(unit).toContain('ProtectSystem=strict');
      expect(unit).toContain('ProtectHome=true');
      expect(unit).toContain('PrivateTmp=true');
      expect(unit).toContain('StateDirectory=megacampus-qdrant-recovery');
      expect(unit).toContain('QDRANT_RECOVERY_LOCK_HELD=1');
      expect(unit).toMatch(
        /ExecStart=\/usr\/bin\/flock --nonblock \/run\/megacampus-qdrant-recovery\/recovery\.lock \/usr\/bin\/pnpm --dir \/opt\/megacampus\/packages\/course-gen-platform qdrant:/u
      );
      expect(unit).not.toContain('EnvironmentFile=');
      expect(unit).not.toMatch(/access[_-]?key|secret[_-]?key|api[_-]?key=/iu);
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
    expect(restore).toContain('Environment=QDRANT_SNAPSHOT_TRANSPORT_URL=http://127.0.0.1:6333');
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
