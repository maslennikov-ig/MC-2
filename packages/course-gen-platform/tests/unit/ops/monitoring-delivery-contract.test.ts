import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../../../../..');

async function read(relativePath: string): Promise<string> {
  return readFile(resolve(ROOT, relativePath), 'utf8');
}

// Monitoring config is root-owned on the host by deliberate hardening, so an ordinary deploy
// cannot write it. Until 2026-07-31 ci-cd.yml handled that by ASSERTING the deployed tree was
// byte-identical to the repository — an assertion nothing checked, which went false the moment
// 89b4cdd9d changed alerts.yml and left production serving a critical alert whose text promised
// off-host retention that does not exist, through a green deploy (mc2-ugl5g).
//
// The replacement is a staged tree the deploy user can write plus a gate that measures the live
// one. These cases pin the parts that make it a delivery path rather than a second assertion.
describe('monitoring config delivery contract', () => {
  it('stages ops/qdrant somewhere the deploy user can write', async () => {
    const workflow = await read('.github/workflows/ci-cd.yml');

    expect(workflow).toContain('tar -cf - ops/qdrant');
    expect(workflow).toContain('/ops-staged');
    // The old wording was the bug: a claim in a comment is not a check.
    expect(workflow).not.toContain('the deployed tree is byte-identical to the repository');
  });

  it('gates the deploy on a measured comparison, not on a comment', async () => {
    const workflow = await read('.github/workflows/ci-cd.yml');

    expect(workflow).toContain('Verify monitoring config is not drifted');
    expect(workflow).toContain('check_monitoring_drift.py --emit-manifest');
    expect(workflow).toContain('--check --manifest');
  });

  it('checks both trees that have no automatic delivery path', async () => {
    const checker = await read('scripts/ci/check_monitoring_drift.py');

    expect(checker).toContain('OPS_DEPLOYED_DIR = "/opt/megacampus/ops/qdrant"');
    // /etc/systemd/system, NOT the staged copy under /opt/megacampus/deploy/systemd: comparing the
    // staged copy would prove nothing about the units systemd actually runs.
    expect(checker).toContain('SYSTEMD_DEPLOYED_DIR = "/etc/systemd/system"');
    expect(checker).toContain('install-monitoring-config.sh');
    // mc2-0tcyw: the generic installer clears backup-schedule drift without proving the schedule
    // still works, so the remediation must also name the installer that runs a real backup, a
    // pg_restore validation and the restore drill before it re-enables the timer.
    expect(checker).toContain('install-supabase-backup-schedule.sh');
    expect(checker).toContain('INSTALL MC2 SUPABASE BACKUP SCHEDULE');
  });

  it('refuses to install rules it has not validated, and replaces rather than signals', async () => {
    const installer = await read('deploy/qdrant/install-monitoring-config.sh');

    expect(installer).toContain('check rules alerts.yml');
    expect(installer).toContain('test rules alert-tests.yml');
    expect(installer).toContain('nothing was installed');
    expect(installer).toContain('install -o root -g root -m "$mode"');
    // A single-file bind mount pins the inode, so SIGHUP leaves Prometheus on the old file.
    expect(installer).toContain('docker restart "$PROMETHEUS_CONTAINER"');
    expect(installer).not.toMatch(/kill\s+-(?:HUP|s\s*HUP|1)\b/u);
  });
});
