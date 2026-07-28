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

interface HostShape {
  [key: string]: string | number | boolean | string[];
}

function driveHost(): HostShape {
  const result = spawnSync('/usr/bin/python3', [RUNNER, '--host'], {
    encoding: 'utf8',
    timeout: 240_000,
    env: { PATH: process.env.PATH, LC_ALL: 'C', LANG: 'C' },
    maxBuffer: 16 * 1024 * 1024,
  });
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout) as HostShape;
}

describe('Q12 window pre-flight: the tracked deployed-asset manifest', () => {
  // The ratchet. H2 can only be a byte comparison if the manifest tracks the tree; if a Q12 asset
  // changes and the manifest is not regenerated, this test goes red HERE rather than the pre-flight
  // going green against stale expectations on the server.
  it('is in lockstep with the repository tree', () => {
    const out = driveHost();
    expect(out.manifest_stale_entries).toEqual([]);
    expect(out.manifest_missing_from_tree).toEqual([]);
    expect(out.manifest_schema_version).toBe('megacampus.q12.deployed-asset-manifest/v1');
    // The frozen command manifest must not have moved: the pre-flight is deliberately NOT one of
    // its 20 commands.
    expect(out.command_manifest_sha256).toBe(
      'aaec6fc25a6996facbf6f07f579239ba0a2aa53fd5521c83cb3c87d12087a841'
    );
  });
});

describe('Q12 window pre-flight: host probes', () => {
  let out: HostShape;
  beforeAll(() => {
    out = driveHost();
  }, 260_000);

  it('passes H1..H5 against a healthy synthetic host', () => {
    for (const id of ['h1', 'h2', 'h3', 'h5']) {
      expect(`${id}=${out[`${id}_healthy`]}`, String(out[`${id}_healthy_detail`])).toBe(
        `${id}=pass`
      );
    }
    // H4 is `pass` where `gh` exists and `unprovable`+evidence where it does not; both are green.
    expect(['pass', 'unprovable']).toContain(out.h4_healthy);
    if (out.h4_healthy === 'unprovable') {
      expect(String(out.h4_healthy_evidence)).toContain('no deploy process');
    }
  });

  it('fails H2 on a single changed byte, a wrong mode, and a wrong owner', () => {
    expect(out.h2_changed_byte).toBe('fail');
    expect(String(out.h2_changed_byte_detail)).toContain('sha256');
    expect(out.h2_wrong_mode).toBe('fail');
    expect(String(out.h2_wrong_mode_detail)).toContain('mode');
    expect(out.h2_wrong_owner).toBe('fail');
    expect(String(out.h2_wrong_owner_detail)).toContain('owner');
    expect(out.h2_missing_file).toBe('fail');
    expect(String(out.h2_missing_file_detail)).toContain('missing');
    // CI-delivered assets are byte-checked but identity-exempt, and the exemption is stated.
    expect(out.h2_ci_mode_change).toBe('pass');
    expect(String(out.h2_healthy_detail)).toContain('CI-delivered');
  });

  it('fails H1 when a digest-pinned image is absent or prune-exposed', () => {
    expect(out.h1_image_absent).toBe('fail');
    expect(String(out.h1_image_absent_detail)).toContain('absent locally');
    expect(out.h1_hold_tag_missing).toBe('fail');
    expect(String(out.h1_hold_tag_missing_detail)).toContain('prune-exposed');
  });

  it('fails H3 on a real controller, and never matches its own command line', () => {
    expect(out.h3_controller_running).toBe('fail');
    expect(String(out.h3_controller_running_detail)).toContain('q12-lifecycle-core.py');
    // The 2026-07-28 pgrep trap: a pattern match on "q12" also matched the pre-flight itself.
    expect(out.h3_only_preflight_running).toBe('pass');
  });

  it('fails H4 on an in-flight deploy and on a recently restarted dev container', () => {
    expect(out.h4_deploy_in_flight).toBe('fail');
    expect(String(out.h4_deploy_in_flight_detail)).toContain('deploy_dev.sh');
    expect(out.h4_recent_dev_restart).toBe('fail');
    expect(String(out.h4_recent_dev_restart_detail)).toContain('NOT paused');
  });

  it('fails H5 when free space does not exceed the backup high-water mark', () => {
    expect(out.h5_disk_full).toBe('fail');
    expect(String(out.h5_disk_full_detail)).toContain('high-water');
    // Any bound the probe introduces is stated in the report, not hidden.
    expect(String(out.h5_healthy_detail)).toContain('BOUND:');
  });
});

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

  it('passes group B against a healthy session-mode connection', () => {
    for (const id of ['b1', 'b2', 'b3', 'b4']) {
      expect(`${id}=${out[`${id}_healthy`]}`, String(out[`${id}_healthy_detail`])).toBe(
        `${id}=pass`
      );
    }
  });

  it('records whether the startup option arrived, and fails if a runner still depends on it', () => {
    // mc2-ipwyc: Supavisor never delivers the connection's startup `options`, so every
    // `-c default_transaction_read_only=…` proof was silently reading the DATABASE default. The
    // contract is that the code does not DEPEND on delivery — the probe records the observed truth
    // and only fails when a runner is found that still relies on it.
    expect(out.b1_healthy).toBe('pass');
    expect(String(out.b1_healthy_detail)).toMatch(/options (delivered|not delivered)/u);
    expect(out.b1_dependent_runner).toBe('fail');
    expect(String(out.b1_dependent_runner_detail)).toContain('fake-runner.js');
    // The LIVE barrier bytes must not carry an unmatched dependence.
    expect(out.b1_live_barrier_unmatched).toBe(0);
  });

  it('fails B2 when SET does not survive to the next statement (transaction-mode pooling)', () => {
    expect(out.b2_transaction_mode).toBe('fail');
    expect(String(out.b2_transaction_mode_detail)).toContain('did not survive');
  });

  it('fails B3 when the pooler rewrites application_name', () => {
    // The barrier's quiesce allowlist and the terminal proof's barrier_era_session_count both
    // match on `megacampus-q12-%`; a rewritten name silently empties both.
    expect(out.b3_rewritten).toBe('fail');
    expect(String(out.b3_rewritten_detail)).toContain('application_name');
  });

  it('fails B4 when the database is owned by another role', () => {
    expect(out.b4_foreign_owner).toBe('fail');
    expect(String(out.b4_foreign_owner_detail)).toContain('mc2_auth_admin');
  });

  it('passes groups C, D and E against a healthy managed environment', () => {
    for (const id of ['c1', 'c2', 'c3', 'c4', 'd1', 'e1', 'e2']) {
      expect(`${id}=${out[`${id}_healthy`]}`, String(out[`${id}_healthy_detail`])).toBe(
        `${id}=pass`
      );
    }
  });

  it('reports C5 and C6 as unprovable with a real evidence pointer, never as a pass', () => {
    // These two are unprovable BY CONSTRUCTION: event-trigger creation and
    // pg_get_functiondef/pg_get_triggerdef round-trip fidelity cannot be established read-only.
    // The contract's `unprovable` verdict exists so the report never shows a green that was not
    // measured — but it must name what proves the fact instead, or it counts as a fail.
    expect(out.c5_healthy).toBe('unprovable');
    expect(out.c6_healthy).toBe('unprovable');
    expect(String(out.c5_healthy_evidence)).toContain('attempt #9');
    expect(String(out.c6_healthy_evidence)).toContain('q12-guard-trigger-ownership');
    expect(out.c5_evidence_names_a_real_artifact).toBe(true);
    expect(out.c6_evidence_names_a_real_artifact).toBe(true);
  });

  it('fails C1 when EXECUTE on cron.alter_job is revoked', () => {
    expect(out.c1_revoked).toBe('fail');
    expect(String(out.c1_revoked_detail)).toContain('alter_job');
  });

  it('fails C2 on cron drift and on a job left paused by a previous attempt', () => {
    expect(out.c2_command_drift).toBe('fail');
    expect(String(out.c2_command_drift_detail)).toContain('3');
    expect(out.c2_paused_job).toBe('fail');
    expect(String(out.c2_paused_job_detail)).toContain('inactive');
  });

  it('fails C3 when net.http_request_queue is not empty', () => {
    expect(out.c3_nonempty).toBe('fail');
  });

  it('fails C4 on any q12_guard residue', () => {
    expect(out.c4_residue).toBe('fail');
    expect(String(out.c4_residue_detail)).toContain('q12_guard');
  });

  it('fails D1 when the catalog was captured in a different search_path (mc2-2rzf6)', () => {
    // The mc2-2rzf6 regression guard. The plan and the barrier once measured the structural
    // catalog in DIFFERENT search_path contexts (cfe6b92b vs a2b25324) — deterministic, not drift
    // — and barrier.install died on "pre-guard canonical structural catalog drift".
    expect(out.d1_ambient_search_path).toBe('fail');
    expect(String(out.d1_ambient_search_path_detail)).toContain('search_path');
    // The two contexts really do hash differently in this fixture; otherwise the guard proves
    // nothing.
    expect(out.d1_contexts_differ).toBe(true);
  });

  it('fails E1 on a supabase_admin backend that is not exactly idle', () => {
    // quiesce_client_backends() refuses a managed supabase_admin client that holds a transaction,
    // and cannot terminate a backend owned by a reserved role.
    expect(out.e1_busy_managed_backend).toBe('fail');
    expect(String(out.e1_busy_managed_backend_detail)).toContain('supabase_admin');
  });

  it('fails E1 when a backend is INVISIBLE rather than counting it as absent', () => {
    // pg_stat_activity nulls usename/state/backend_type for any backend the reading role neither
    // owns nor sees through pg_read_all_stats. A `backend_type = 'client backend'` filter in SQL
    // would drop those rows and report a serene zero — while quiesce_client_backends(), which runs
    // SECURITY DEFINER as the same role, would be just as blind and try to terminate a managed
    // backend. Found by driving the probe as a NON-superuser; a superuser fixture cannot show it.
    expect(out.e1_invisible_backend).toBe('fail');
    expect(String(out.e1_invisible_backend_detail)).toContain('invisible');
  });

  it('fails E2 when one of our own sessions is alive (mc2-6fnrt)', () => {
    // Attempt #9: the controller opened and HELD the W3 snapshot coordinator before
    // barrier.install, and the barrier's own quiesce_client_backends() terminated it.
    expect(out.e2_our_session_alive).toBe('fail');
    expect(String(out.e2_our_session_alive_detail)).toContain('megacampus-q12-');
  });
});
