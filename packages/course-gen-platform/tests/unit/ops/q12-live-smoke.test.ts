import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

/**
 * Task 9 smoke/observation evaluator. The deployed `q12-live-smoke.sh` wrapper
 * dispatches to the Root lifecycle core `smoke observe` action, which evaluates
 * the §13 activation observation gate over a synthetic observation projection
 * and never performs any live/remote action. Every terminal live-window result
 * sets `rotation_required=true`.
 */

const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const smokeShell = join(repoRoot, 'deploy/qdrant/q12-live-smoke.sh');
const roots: string[] = [];

afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

function scratch(): string {
  const value = mkdtempSync(join(tmpdir(), 'mc2-q12-smoke-'));
  roots.push(value);
  return value;
}

function acceptingProjection(): Record<string, unknown> {
  return {
    observation_minutes: 60,
    course_cycle_complete: true,
    document_outcome_coverage_percent: 100,
    baseline_preservation_percent: 100,
    isolation_violations: 0,
    unresolved_p0_p1_incidents: 0,
    qdrant_rest_error_ratio: 0.01,
    hybrid_fallback_ratio: 0.04,
    qdrant_memory_ratio: 0.8,
    point_count_drop_ratio: 0.05,
    is_initial_cutover: true,
    qdrant_points: 12114,
    degraded_automatic_decisions_30min: 2,
    notification_firing_observed: true,
    notification_resolved_observed: true,
    activation_rows: [{ enabled: true, status: 'active', rollout_percentage: 100 }],
  };
}

type Verdict = {
  accepted: boolean;
  breaches: string[];
  rotation_required: boolean;
  run_id: string;
  schema_version: string;
  selected_path: string;
  q12_open: boolean;
};

function evaluate(
  projection: Record<string, unknown>,
  runId = 'q12-smoke-run'
): {
  status: number | null;
  verdict: Verdict | null;
  stderr: string;
} {
  const dir = scratch();
  const fixture = join(dir, 'observation.json');
  writeFileSync(fixture, `${JSON.stringify(projection)}\n`);
  const proc = spawnSync(
    smokeShell,
    ['observe', '--run-id', runId, '--observation-fixture', fixture],
    { encoding: 'utf8' }
  );
  let verdict: Verdict | null = null;
  if (proc.status === 0 && proc.stdout.trim().length > 0) {
    verdict = JSON.parse(proc.stdout) as Verdict;
  }
  return { status: proc.status, verdict, stderr: proc.stderr };
}

describe('q12-live-smoke.sh wrapper contract', () => {
  it('exists and is executable', () => {
    expect(existsSync(smokeShell)).toBe(true);
    expect(statSync(smokeShell).mode & 0o111).not.toBe(0);
  });

  it('passes bash -n', () => {
    const proc = spawnSync('bash', ['-n', smokeShell], { encoding: 'utf8' });
    expect(proc.status).toBe(0);
  });
});

describe('activation observation gate acceptance', () => {
  it('accepts a fully-passing observation window with rotation_required=true', () => {
    const { status, verdict } = evaluate(acceptingProjection());
    expect(status).toBe(0);
    expect(verdict).not.toBeNull();
    expect(verdict!.accepted).toBe(true);
    expect(verdict!.breaches).toEqual([]);
    expect(verdict!.selected_path).toBe('accept');
    expect(verdict!.q12_open).toBe(false);
    expect(verdict!.rotation_required).toBe(true);
    expect(verdict!.run_id).toBe('q12-smoke-run');
  });

  it('always records rotation_required=true even when accepted', () => {
    const { verdict } = evaluate(acceptingProjection());
    expect(verdict!.rotation_required).toBe(true);
  });
});

describe('activation observation gate window conditions', () => {
  it('rejects when observation is shorter than 60 minutes despite passing metrics', () => {
    const { verdict } = evaluate({ ...acceptingProjection(), observation_minutes: 59 });
    expect(verdict!.accepted).toBe(false);
    expect(verdict!.breaches).toContain('observation_window_too_short');
    expect(verdict!.q12_open).toBe(true);
    expect(verdict!.selected_path).toBe('phase_aware_rollback_incident');
    expect(verdict!.rotation_required).toBe(true);
  });

  it('rejects when the full course cycle is incomplete', () => {
    const { verdict } = evaluate({ ...acceptingProjection(), course_cycle_complete: false });
    expect(verdict!.accepted).toBe(false);
    expect(verdict!.breaches).toContain('course_cycle_incomplete');
    expect(verdict!.rotation_required).toBe(true);
  });
});

describe('activation observation gate thresholds', () => {
  const cases: ReadonlyArray<[string, Record<string, unknown>, string]> = [
    ['coverage below 100%', { document_outcome_coverage_percent: 99 }, 'document_outcome_coverage'],
    [
      'baseline preservation below 100%',
      { baseline_preservation_percent: 99 },
      'baseline_preservation',
    ],
    ['tenant/course isolation violation', { isolation_violations: 1 }, 'isolation_violation'],
    ['unresolved P0/P1 incident', { unresolved_p0_p1_incidents: 1 }, 'unresolved_incident'],
    [
      'Qdrant REST error ratio above 2%',
      { qdrant_rest_error_ratio: 0.03 },
      'qdrant_rest_error_ratio',
    ],
    ['hybrid fallback above 5%', { hybrid_fallback_ratio: 0.06 }, 'hybrid_fallback_ratio'],
    ['Qdrant memory above 85%', { qdrant_memory_ratio: 0.9 }, 'qdrant_memory'],
    ['point-count drop above 10%', { point_count_drop_ratio: 0.11 }, 'point_count_drop'],
    [
      'initial cutover point count not exactly 12,114',
      { qdrant_points: 12113 },
      'initial_cutover_point_count',
    ],
    [
      'three or more degraded automatic decisions',
      { degraded_automatic_decisions_30min: 3 },
      'degraded_decisions',
    ],
    [
      'notification firing not observed',
      { notification_firing_observed: false },
      'notification_cycle',
    ],
    [
      'notification resolved not observed',
      { notification_resolved_observed: false },
      'notification_cycle',
    ],
  ];

  it.each(cases)('breaches on %s and keeps Q12 open', (_label, override, code) => {
    const { verdict } = evaluate({ ...acceptingProjection(), ...override });
    expect(verdict!.accepted).toBe(false);
    expect(verdict!.breaches).toContain(code);
    expect(verdict!.q12_open).toBe(true);
    expect(verdict!.selected_path).toBe('phase_aware_rollback_incident');
    expect(verdict!.rotation_required).toBe(true);
  });

  it('breaches when any activation row is not exactly enabled/active/100', () => {
    const { verdict } = evaluate({
      ...acceptingProjection(),
      activation_rows: [
        { enabled: true, status: 'active', rollout_percentage: 100 },
        { enabled: true, status: 'active', rollout_percentage: 90 },
      ],
    });
    expect(verdict!.accepted).toBe(false);
    expect(verdict!.breaches).toContain('activation_row_drift');
    expect(verdict!.rotation_required).toBe(true);
  });

  it('accumulates every breach code in sorted order', () => {
    const { verdict } = evaluate({
      ...acceptingProjection(),
      isolation_violations: 2,
      qdrant_memory_ratio: 0.95,
    });
    expect(verdict!.breaches).toContain('isolation_violation');
    expect(verdict!.breaches).toContain('qdrant_memory');
    expect([...verdict!.breaches]).toEqual([...verdict!.breaches].sort());
  });
});

describe('smoke evaluator fails closed on malformed input', () => {
  it('rejects a missing required key with a nonzero exit', () => {
    const projection = acceptingProjection();
    delete projection.qdrant_points;
    const { status, verdict } = evaluate(projection);
    expect(status).not.toBe(0);
    expect(verdict).toBeNull();
  });

  it('rejects a boolean where an integer is required', () => {
    const { status } = evaluate({ ...acceptingProjection(), isolation_violations: false });
    expect(status).not.toBe(0);
  });

  it('rejects an empty activation-row set', () => {
    const { status } = evaluate({ ...acceptingProjection(), activation_rows: [] });
    expect(status).not.toBe(0);
  });

  it('rejects an unknown key', () => {
    const { status } = evaluate({ ...acceptingProjection(), unexpected: 1 });
    expect(status).not.toBe(0);
  });
});
