import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

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

// The probe bodies, driven against the MANAGED-PRIVILEGE fixture: a non-superuser barrier role,
// foreign object owners, cron.job granted SELECT only. A probe that is green here is green under
// production's privileges — which is precisely what nine window attempts could not say.
interface ProbeShape {
  [key: string]: string | number | boolean;
}

function driveProbes(): ProbeShape {
  const result = spawnSync('/usr/bin/python3', [RUNNER, '--probes'], {
    encoding: 'utf8',
    timeout: 600_000,
    env: {
      PATH: process.env.PATH,
      LC_ALL: 'C',
      LANG: 'C',
      MC2_Q12_PLAN_DOCKER: '/usr/bin/docker',
    },
    maxBuffer: 16 * 1024 * 1024,
  });
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout) as ProbeShape;
}

describe.runIf(REAL_PG17)('Q12 window pre-flight: probes against the managed fixture', () => {
  let out: ProbeShape;
  beforeAll(() => {
    out = driveProbes();
  }, 620_000);

  it('asserts its own read-onlyness rather than declaring it (hard invariant 1)', () => {
    expect(out.read_only_wrapper_says_read_only).toBe(true);
    expect(out.read_only_guard_passes_when_read_only).toBe(true);
    // The same body under a plain BEGIN must fail closed. Without this the wrapper would be
    // decoration, and every probe below would be measuring a session it never checked.
    expect(out.read_only_guard_bites_when_writable).toBe(true);
    expect(String(out.read_only_guard_bite_stderr)).toContain('division by zero');
  });

  it('passes group A against a healthy managed environment', () => {
    for (const id of ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7']) {
      expect(`${id}=${out[`${id}_healthy`]}`, String(out[`${id}_healthy_detail`])).toBe(
        `${id}=pass`
      );
    }
  });

  it('fails A3 when the barrier role lacks TRIGGER on a guarded relation', () => {
    expect(out.a3_one_revoked).toBe('fail');
    expect(String(out.a3_one_revoked_detail)).toContain('auth.oauth_authorizations');
  });

  it('fails A2 when a guarded relation carries only SELECT (the cron.job shape)', () => {
    // mc2-34eua, exactly: LOCK TABLE ... IN ACCESS EXCLUSIVE MODE needs one of
    // UPDATE/DELETE/TRUNCATE/MAINTAIN, and supabase_admin grants postgres only SELECT on cron.job.
    expect(out.a2_select_only).toBe('fail');
    expect(String(out.a2_select_only_detail)).toContain('cron.job');
  });

  it('fails A4 when a cron relation is in the guarded set', () => {
    expect(out.a4_cron_present).toBe('fail');
    expect(String(out.a4_cron_present_detail)).toContain('cron.job');
  });

  it('fails A1 on any identity drift in the guarded set', () => {
    expect(out.a1_owner_drift).toBe('fail');
    expect(String(out.a1_owner_drift_detail)).toContain('auth.users');
    expect(out.a1_missing_relation).toBe('fail');
    expect(String(out.a1_missing_relation_detail)).toContain('public.vanished');
  });

  it('fails A5 when a foreign-owned q12_guard schema is already present', () => {
    expect(out.a5_foreign_guard).toBe('fail');
    expect(String(out.a5_foreign_guard_detail)).toContain('q12_guard');
  });

  it('fails A6 when net.http_request_queue loses TRIGGER', () => {
    expect(out.a6_revoked).toBe('fail');
    expect(String(out.a6_revoked_detail)).toContain('net.http_request_queue');
  });

  it('fails A7 when the live count and the plan count disagree', () => {
    expect(out.a7_count_drift).toBe('fail');
    // A7 follows the BARRIER's own frozen expectation instead of duplicating the number here.
    expect(out.a7_barrier_expectation).toBe(9);
    expect(out.a7_barrier_drift).toBe('fail');
  });
});
