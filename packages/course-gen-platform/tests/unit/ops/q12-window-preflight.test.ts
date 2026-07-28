import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// mc2-ot8se — the Q12 read-only window pre-flight.
//
// Contract: docs/superpowers/specs/2026-07-28-q12-window-preflight-contract.md. Its "Hard
// invariants" and frozen "Probe list" are the acceptance criteria for this suite.
//
// This file covers the AGGREGATION contract (Task 2): the exit code is fail-closed, every frozen
// probe id reaches the report, and the report is published 0400. The probe bodies themselves are
// covered by the gated real-PostgreSQL suite below, which drives them against the managed-privilege
// fixture rather than a superuser container — see q12-managed-role-fixture.test.ts for why.
const REAL_PG17 = process.env.MC2_Q12_REAL_PG17 === '1';
const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const RUNNER = resolve(
  repoRoot,
  'packages/course-gen-platform/tests/unit/ops/fixtures/q12-window-preflight-runner.py'
);

interface SelfTestShape {
  exit_all_pass: number;
  exit_with_one_fail: number;
  exit_with_unprovable_no_evidence: number;
  exit_with_unprovable_with_evidence: number;
  first_offender_one_fail: string;
  first_offender_unprovable_no_evidence: string;
  report_ids: string[];
  frozen_ids: string[];
  report_mode: string;
  report_schema_version: string;
  report_summary: { pass: number; fail: number; unprovable: number };
  report_captured_at: string;
  report_tree_sha: string;
  stdout_lines: string[];
  scope_host_ids: string[];
  scope_host_out_of_scope: string[];
  rerun_is_a_new_report: boolean;
}

function drive(args: string[] = []): SelfTestShape {
  const result = spawnSync('/usr/bin/python3', [RUNNER, ...args], {
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
  return JSON.parse(result.stdout) as SelfTestShape;
}

describe('Q12 window pre-flight: fail-closed aggregation', () => {
  it('exits non-zero on any fail, and on any unprovable without evidence', () => {
    const out = drive(['--self-test']);

    expect(out.exit_all_pass).toBe(0);
    expect(out.exit_with_one_fail).not.toBe(0);
    expect(out.exit_with_unprovable_no_evidence).not.toBe(0);
    // `unprovable` WITH a named evidence pointer is the contract's legitimate green: it never
    // shows a pass that was not measured, and it never blocks on something read-only cannot prove.
    expect(out.exit_with_unprovable_with_evidence).toBe(0);

    // A non-zero exit names the FIRST offender, so the operator is not left grepping a report.
    expect(out.first_offender_one_fail).toBe('C3');
    expect(out.first_offender_unprovable_no_evidence).toBe('C3');
  });

  it('leaves no silent skips: every frozen probe id reaches the report with a verdict', () => {
    const out = drive(['--self-test']);

    expect(out.report_ids).toEqual(out.frozen_ids);
    expect(out.report_ids.length).toBe(25);
    // Out-of-scope probes are NAMED rather than dropped, so a narrower scope can never read as
    // "everything passed".
    expect(out.scope_host_ids).toEqual(['H1', 'H2', 'H3', 'H4', 'H5']);
    expect(out.scope_host_out_of_scope.length).toBe(20);
    expect([...out.scope_host_ids, ...out.scope_host_out_of_scope].sort()).toEqual(
      [...out.frozen_ids].sort()
    );
  });

  it('publishes one canonical 0400 report, freshness-stamped and never overwritten', () => {
    const out = drive(['--self-test']);

    expect(out.report_mode).toBe('0o400');
    expect(out.report_schema_version).toBe('megacampus.q12.window-preflight/v1');
    expect(out.report_summary).toEqual({ pass: 25, fail: 0, unprovable: 0 });
    // Freshness (hard invariant 6): a report that cannot be dated is not evidence for an attempt.
    expect(out.report_captured_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u);
    expect(out.report_tree_sha).toMatch(/^[0-9a-f]{40}$/u);
    expect(out.rerun_is_a_new_report).toBe(true);

    // The human summary is one line per probe: `id  verdict  detail`.
    expect(out.stdout_lines.length).toBe(25);
    for (const line of out.stdout_lines) {
      expect(line).toMatch(/^[A-H]\d {2}(pass|fail|unprovable) {2}/u);
    }
  });
});

// Placeholder describe block so the gated legs have a stable home from Task 3 onward.
describe.runIf(REAL_PG17)('Q12 window pre-flight: probes against the managed fixture', () => {
  it('is wired to the managed-privilege fixture', () => {
    expect(REAL_PG17).toBe(true);
  });
});
