import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { RUN_REAL_CONTROLLER } from './fixtures/q12-real-controller-gate.js';

// Design W3 (co-design docs/superpowers/specs/2026-07-20-q12-w2-w3-staged-execution-codesign.md D5,
// plan docs/superpowers/plans/2026-07-20-q12-w2-w3-staged-execution.md Task 1). The OQ5 snapshot
// coordinator + OQ6 baseline.json producer already exist, but only on LivePlanExecutor
// (q12-lifecycle-core.py:6840/:6917). The WINDOW executor (ProductionExecutor /
// OwnerCustodyExecutor) cannot reach them, so a real run keys pg.backup off a fixture-derived
// <exported-id> and has no baseline.json. W3-struct lifts that capability behind an isolable seam
// (SourceSnapshotSeam) that OwnerCustodyExecutor composes, exposing
// open_window_snapshot(request, run_root) -> (exported_id, baseline_path, coordinator). The exported
// id from pg_export_snapshot() is only valid while the exporting session stays OPEN and
// backup-supabase.sh (pg.backup) expects a LIVE snapshot id, so open_window_snapshot HOLDS the
// coordinator and hands it back; the caller (the W2 resolver) releases it via
// close_window_snapshot(coordinator) after pg.backup consumes the snapshot. The live psql/tsx legs
// are MC2_Q12_REAL_PG17-gated; the STRUCTURAL wiring (this suite) is proven with a FAKE seam (the
// same isolation discipline W1 used for _invoke_resume), so no live DB is needed here.
const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const CORE = join(repoRoot, 'deploy/qdrant/q12-lifecycle-core.py');
const ENV = { PATH: process.env.PATH ?? '/usr/bin:/bin', LC_ALL: 'C', LANG: 'C' };
const REAL_PG17 = process.env.MC2_Q12_REAL_PG17 === '1';
const WINDOW_RUNNER = join(
  repoRoot,
  'packages/course-gen-platform/tests/unit/ops/fixtures/q12-w3-window-snapshot-runner.py'
);

describe.runIf(RUN_REAL_CONTROLLER)(
  'Q12 W3-struct: source-snapshot seam reachable by the window executor',
  () => {
    // STRUCTURAL WIRING (no live DB): open_window_snapshot produces baseline.json (OQ6), opens the
    // coordinator for the real <exported-id> (OQ5), and HOLDS it (does not close) so the caller can
    // bind pg.backup against the live snapshot; close_window_snapshot then releases it exactly once.
    it('wires open_window_snapshot/close_window_snapshot through a composed SourceSnapshotSeam', () => {
      const probe = [
        'import importlib.util, sys, pathlib, tempfile',
        's=importlib.util.spec_from_file_location("q12", sys.argv[1])',
        'm=importlib.util.module_from_spec(s); sys.modules[s.name]=m; s.loader.exec_module(m)',
        // The seam MUST be an isolable class so the structural wiring is fakeable.
        'assert hasattr(m, "SourceSnapshotSeam"), "SourceSnapshotSeam missing"',
        'assert hasattr(m.OwnerCustodyExecutor, "open_window_snapshot"), "open_window_snapshot missing"',
        'assert hasattr(m.OwnerCustodyExecutor, "close_window_snapshot"), "close_window_snapshot missing"',
        'calls={"close":0, "baseline":0, "open":0}',
        'sentinel=object()',
        'def fake_open(self, request, workdir):',
        ' calls["open"]+=1',
        ' return sentinel, "ffffffff-ffffffff-1"',
        'def fake_close(self, proc):',
        ' assert proc is sentinel, proc',
        ' calls["close"]+=1',
        'def fake_baseline(self, request, workdir, run_root):',
        ' calls["baseline"]+=1',
        ' p=pathlib.Path(run_root)/"baseline.json"',
        ' m.immutable_publish(p, m.complete_object({"baseline":{"probe":"v"}}), 0o400, [])',
        ' return p',
        'm.SourceSnapshotSeam.open_snapshot=fake_open',
        'm.SourceSnapshotSeam.close_snapshot=fake_close',
        'm.SourceSnapshotSeam.produce_baseline=fake_baseline',
        'root=pathlib.Path(tempfile.mkdtemp(prefix="mc2-q12-w3-")); root.chmod(0o700)',
        'ex=m.OwnerCustodyExecutor()',
        'request={"run_id":"11111111-1111-4111-8111-111111111111"}',
        'exported_id, baseline_path, coordinator = ex.open_window_snapshot(request, root)',
        // (a) the exported id is the coordinator real snapshot id and is snapshot-shaped
        'assert exported_id=="ffffffff-ffffffff-1", exported_id',
        'assert m.PLAN_SNAPSHOT_RE.fullmatch(exported_id), exported_id',
        // (b) baseline.json was published owner-only 0400 at the run root
        'assert pathlib.Path(baseline_path).exists(), baseline_path',
        'assert (pathlib.Path(baseline_path).stat().st_mode & 0o777)==0o400',
        // (c) the coordinator is HELD (not yet released) so pg.backup can bind the live snapshot
        'assert coordinator is sentinel',
        'assert calls=={"baseline":1,"open":1,"close":0}, calls',
        // (d) the caller releases the held coordinator exactly once
        'ex.close_window_snapshot(coordinator)',
        'assert calls["close"]==1, calls',
        'print("W3_STRUCT_OK")',
      ].join('\n');
      const child = spawnSync('/usr/bin/python3', ['-c', probe, CORE], {
        encoding: 'utf8',
        env: ENV,
      });
      expect(child.stderr).toBe('');
      expect(child.status).toBe(0);
      expect(child.stdout).toContain('W3_STRUCT_OK');
    });

    // FAIL-CLOSED: open_snapshot itself refuses a malformed/dead exported id (reaping the session
    // first — see the real open_snapshot), so open_window_snapshot propagates that refusal and never
    // returns a bad <exported-id> nor leaks an open source session. Modelled with open_snapshot RAISING
    // exactly as the real one does on an invalid id.
    it('propagates open_snapshot fail-closed on a malformed exported id (no coordinator leak)', () => {
      const probe = [
        'import importlib.util, sys, pathlib, tempfile',
        's=importlib.util.spec_from_file_location("q12", sys.argv[1])',
        'm=importlib.util.module_from_spec(s); sys.modules[s.name]=m; s.loader.exec_module(m)',
        'calls={"baseline":0, "open":0, "close":0}',
        'def fake_open(self, request, workdir):',
        ' calls["open"]+=1',
        // the real open_snapshot reaps proc then raises; a fake that returns a bad id would be caught
        ' raise m.LifecycleError("snapshot coordinator exported an invalid snapshot id")',
        'def fake_close(self, proc):',
        ' calls["close"]+=1',
        'def fake_baseline(self, request, workdir, run_root):',
        ' calls["baseline"]+=1',
        ' p=pathlib.Path(run_root)/"baseline.json"',
        ' m.immutable_publish(p, m.complete_object({"baseline":{"probe":"v"}}), 0o400, [])',
        ' return p',
        'm.SourceSnapshotSeam.open_snapshot=fake_open',
        'm.SourceSnapshotSeam.close_snapshot=fake_close',
        'm.SourceSnapshotSeam.produce_baseline=fake_baseline',
        'root=pathlib.Path(tempfile.mkdtemp(prefix="mc2-q12-w3-")); root.chmod(0o700)',
        'ex=m.OwnerCustodyExecutor()',
        'request={"run_id":"11111111-1111-4111-8111-111111111111"}',
        'refused=False',
        'try:\n ex.open_window_snapshot(request, root)\nexcept m.LifecycleError:\n refused=True',
        'assert refused, "malformed snapshot id was not refused"',
        // baseline was attempted first, open refused, and no bad coordinator was handed back to close
        'assert calls=={"baseline":1,"open":1,"close":0}, calls',
        'print("W3_FAILCLOSED_OK")',
      ].join('\n');
      const child = spawnSync('/usr/bin/python3', ['-c', probe, CORE], {
        encoding: 'utf8',
        env: ENV,
      });
      expect(child.stderr).toBe('');
      expect(child.status).toBe(0);
      expect(child.stdout).toContain('W3_FAILCLOSED_OK');
    });

    // REFACTOR-PRESERVING: the seam is what LivePlanExecutor now delegates to, so its public snapshot
    // surface (produce_run_root_baseline + the coordinator pair) must still be present and callable,
    // and the instance composes a SourceSnapshotSeam.
    it('keeps the LivePlanExecutor snapshot surface intact after the extraction', () => {
      const probe = [
        'import importlib.util, sys',
        's=importlib.util.spec_from_file_location("q12", sys.argv[1])',
        'm=importlib.util.module_from_spec(s); sys.modules[s.name]=m; s.loader.exec_module(m)',
        'lpe=m.LivePlanExecutor',
        'assert hasattr(lpe, "produce_run_root_baseline")',
        'assert hasattr(lpe, "_open_snapshot_coordinator")',
        'assert hasattr(lpe, "_close_snapshot_coordinator")',
        'inst=lpe()',
        'assert isinstance(inst._snapshot_seam, m.SourceSnapshotSeam)',
        'print("W3_REFACTOR_OK")',
      ].join('\n');
      const child = spawnSync('/usr/bin/python3', ['-c', probe, CORE], {
        encoding: 'utf8',
        env: ENV,
      });
      expect(child.stderr).toBe('');
      expect(child.status).toBe(0);
      expect(child.stdout).toContain('W3_REFACTOR_OK');
    });
  }
);

// LIVE LEG (MC2_Q12_REAL_PG17=1): the deployed window executor opens a REAL pg_export_snapshot()
// coordinator against a disposable postgres:17.10 source and publishes a real baseline.json — the
// same capability the LivePlanExecutor gated suites prove, now exercised through
// OwnerCustodyExecutor.open_window_snapshot. No production path is touched.
describe.runIf(REAL_PG17)('Q12 W3-struct against disposable PostgreSQL 17.10', () => {
  it('opens a live held snapshot coordinator and a 0400 baseline.json from the window executor', () => {
    const result = spawnSync('/usr/bin/python3', [WINDOW_RUNNER], {
      encoding: 'utf8',
      timeout: 240_000,
      env: {
        PATH: process.env.PATH,
        LC_ALL: 'C',
        LANG: 'C',
        MC2_Q12_PLAN_DOCKER: '/usr/bin/docker',
      },
      maxBuffer: 16 * 1024 * 1024,
    });
    expect(result.status, result.stderr).toBe(0);
    const out = JSON.parse(result.stdout) as {
      exported_id: string;
      snapshot_shaped: boolean;
      held_alive: boolean;
      baseline_mode: string;
      baseline_cron_active: number;
      baseline_cron_count: number;
      intermediate_removed: boolean;
      no_libpq_at_rest_in_run_root: boolean;
      released: boolean;
    };
    // OQ5: a real pg_export_snapshot() id, snapshot-shaped, and still HELD (session open) for pg.backup.
    expect(out.snapshot_shaped).toBe(true);
    expect(out.exported_id).toMatch(/^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{8}-[0-9]+$/u);
    expect(out.held_alive).toBe(true);
    // OQ6: a real pre-maintenance baseline.json (cron active + writable), published owner-only 0400.
    expect(out.baseline_mode).toBe('0o400');
    expect(out.baseline_cron_count).toBe(8);
    expect(out.baseline_cron_active).toBe(8);
    expect(out.intermediate_removed).toBe(true);
    // P2c: no source-connection (libpq) file is left at rest in the durable run_root.
    expect(out.no_libpq_at_rest_in_run_root).toBe(true);
    // The held coordinator releases cleanly when the caller is done with the snapshot.
    expect(out.released).toBe(true);
  }, 260_000);
});
