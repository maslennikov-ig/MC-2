import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';
import { RUN_REAL_CONTROLLER } from './fixtures/q12-real-controller-gate.js';

// mc2-6fnrt — the NINTH live-window blocker, found on production 2026-07-28 (attempt #9).
//
// prepare_window_source published the pre-maintenance baseline and then opened + HELD the W3
// snapshot coordinator, and run_live kept that source session alive across the whole group-2
// barrier.install. The frozen barrier's quiesce_client_backends() terminates EVERY client backend
// except its own pid and exactly-idle supabase_admin — so the barrier killed the controller's own
// coordinator, and close_snapshot then failed closed ("snapshot coordinator session failed"),
// aborting the window with the guard already installed.
//
// The W2/W3 codesign (docs/superpowers/specs/2026-07-20-q12-w2-w3-staged-execution-codesign.md
// :62,:94) always said the real <exported-id> is resolved "at pg.backup open". The implementation
// resolved it upfront. This suite pins the codesign's ordering so the coordinator can never again
// be held across the barrier's client quiesce — WITHOUT touching the frozen barrier bytes.
//
// Infra-free: no docker, no live PostgreSQL, no /opt/megacampus writes. The seam legs use fakes
// (the same isolation discipline W1/W3-struct use) and the call-site ordering is proven by a REAL
// full fixture run_live window drive with the hold class wrapped by a recorder.
const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const RUNNER = join(
  repoRoot,
  'packages/course-gen-platform/tests/unit/ops/fixtures/q12-window-snapshot-at-pg-backup-runner.py'
);

type Observation = { installCompleted: boolean; pgBackupRows: number; rowCount: number };
type Report = {
  hasPublishWindowBaseline: boolean;
  hasOpenWindowSnapshot: boolean;
  hasHold: boolean;
  baselineLegPublishes: boolean;
  baselineLegMode: string;
  baselineLegOpensNothing: boolean;
  openLegExportedId: string;
  openLegHolds: boolean;
  openLegProducesNoBaseline: boolean;
  openLegReleases: boolean;
  noLibpqAtRest: boolean;
  forkReturnsResolver: boolean;
  forkOpenedCount: number;
  forkPublishedBaseline: boolean;
  forkExportedIdUnresolved: boolean;
  forkUpfrontSeeded: boolean;
  backupBlockedBefore: boolean;
  holdIdleBeforeUse: boolean;
  holdExportedId: boolean;
  holdOpenedOnce: boolean;
  holdHolds: boolean;
  holdResolved: boolean;
  backupResolvesAfter: boolean;
  holdPersisted: boolean;
  holdAuthorityMode: string;
  holdReuses: boolean;
  holdReleasedOnce: boolean;
  holdReleaseIdempotent: boolean;
  holdRecoverReuses: boolean;
  fixtureDriveStatus: number;
  observations: Observation[];
  opensAfterInstall: boolean;
  opensBeforePgBackup: boolean;
  fixtureRowCount: number;
  fixturePgBackupRan: boolean;
} & Record<string, unknown>;

function drive(): Report {
  const result = spawnSync('/usr/bin/python3', [RUNNER], {
    encoding: 'utf8',
    timeout: 240_000,
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin', LC_ALL: 'C', LANG: 'C' },
    maxBuffer: 16 * 1024 * 1024,
  });
  expect(result.status, result.stderr).toBe(0);
  const report = JSON.parse(result.stdout) as Report;
  // Any staged failure is reported as error_<stage> — surface it instead of a confusing undefined.
  const errors = Object.keys(report).filter(key => key.startsWith('error_'));
  expect(errors.map(key => `${key}: ${String(report[key])}`)).toEqual([]);
  return report;
}

describe.runIf(RUN_REAL_CONTROLLER)(
  'Q12 mc2-6fnrt: the window snapshot coordinator opens at pg.backup, never across barrier.install',
  () => {
    // One drive for the whole suite (a full fixture window is not free); collected lazily so a
    // skipped run never spawns it.
    let report: Report;
    beforeAll(() => {
      report = drive();
    }, 260_000);

    // (1) SPLIT SEAM. The pre-maintenance baseline (cron active + writable) must STILL be captured
    // before barrier.install, so the two capabilities are separate legs: publishing the baseline
    // opens no coordinator, and opening the coordinator produces no second baseline.
    it('splits the baseline producer from the held coordinator opener', () => {
      expect(report.hasPublishWindowBaseline).toBe(true);
      expect(report.hasOpenWindowSnapshot).toBe(true);
      expect(report.baselineLegPublishes).toBe(true);
      expect(report.baselineLegMode).toBe('0o400');
      expect(report.baselineLegOpensNothing).toBe(true);
      expect(report.openLegHolds).toBe(true);
      expect(report.openLegProducesNoBaseline).toBe(true);
      expect(report.openLegReleases).toBe(true);
      expect(report.openLegExportedId).toMatch(/^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{8}-[0-9]+$/u);
      // P2c preserved: no libpq service file at rest in the durable run root.
      expect(report.noLibpqAtRest).toBe(true);
    });

    // (2) THE FIX ITSELF. The W2 fork runs BEFORE the window drive (before barrier.install), so it
    // may publish the baseline but must open NOTHING, and <exported-id> must stay unresolved —
    // nothing before pg.backup is allowed to consume it.
    it('publishes the baseline but opens no coordinator in the pre-window fork', () => {
      expect(report.forkReturnsResolver).toBe(true);
      expect(report.forkOpenedCount).toBe(0);
      expect(report.forkPublishedBaseline).toBe(true);
      expect(report.forkExportedIdUnresolved).toBe(true);
      expect(report.forkUpfrontSeeded).toBe(true);
    });

    // (3) THE STAGED HOLD. Same shape as the existing <immutable-generation> threader: a gap before,
    // a resolve-once open at the consumption point, a persisted run-root authority for recover
    // determinism, reuse instead of a second session, and a single idempotent release.
    it('opens once at first use, persists, unblocks pg.backup, reuses, and releases once', () => {
      expect(report.hasHold).toBe(true);
      expect(report.backupBlockedBefore).toBe(true);
      expect(report.holdIdleBeforeUse).toBe(true);
      expect(report.holdExportedId).toBe(true);
      expect(report.holdOpenedOnce).toBe(true);
      expect(report.holdHolds).toBe(true);
      expect(report.holdResolved).toBe(true);
      expect(report.backupResolvesAfter).toBe(true);
      expect(report.holdPersisted).toBe(true);
      expect(report.holdAuthorityMode).toBe('0o400');
      expect(report.holdReuses).toBe(true);
      expect(report.holdReleasedOnce).toBe(true);
      expect(report.holdReleaseIdempotent).toBe(true);
      // A recover re-drive whose authority already carries <exported-id> never re-opens a session.
      expect(report.holdRecoverReuses).toBe(true);
    });

    // (4) CALL-SITE ORDERING — the load-bearing assertion. A REAL full fixture run_live window
    // drive: at the FIRST exported_id() call barrier.install is ALREADY durably completed (so the
    // barrier's client quiesce has finished) and NO pg.backup row exists yet (so the snapshot is
    // still live for the command that consumes it).
    it('resolves the exported id after barrier.install completes and before pg.backup runs', () => {
      expect(report.fixtureDriveStatus).toBe(0);
      expect(report.fixturePgBackupRan).toBe(true);
      expect(report.observations.length).toBeGreaterThan(0);
      expect(report.opensAfterInstall).toBe(true);
      expect(report.opensBeforePgBackup).toBe(true);
      // Every later use (deploy.prepare's targets manifest) happens after pg.backup has journaled.
      for (const observation of report.observations.slice(1)) {
        expect(observation.pgBackupRows).toBeGreaterThan(0);
      }
    });
  }
);
