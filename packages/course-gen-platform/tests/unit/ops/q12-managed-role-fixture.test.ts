import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// mc2-ot8se Task 1 — the shared MANAGED-PRIVILEGE fixture.
//
// Every Q12 fixture before this one made the test role a superuser that owned every object and
// talked to the container directly. That single convenience is what let two of the nine window
// defects through: `cron.job` (mc2-34eua) is reachable for a superuser and 42501 for production's
// `postgres`, and DROP TRIGGER on a foreign-owned auth table (mc2-ipwyc) succeeds for a superuser
// and raises `must be owner of relation` for production's `postgres`.
//
// This fixture reproduces the production shape instead: a non-superuser barrier role that owns
// nothing outside its own schema, foreign owners for the auth/storage/net/cron objects, and the
// exact grant split production has — TRIGGER + DML on auth/storage/net, SELECT only on cron.job.
// Every later pre-flight probe is written against it, so a probe can only be green here if it is
// green under production's privileges.
const REAL_PG17 = process.env.MC2_Q12_REAL_PG17 === '1';
const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const RUNNER = resolve(
  repoRoot,
  'packages/course-gen-platform/tests/unit/ops/fixtures/q12-managed-role-fixture-runner.py'
);

interface FixtureShape {
  barrier_is_superuser: boolean;
  barrier_owns_auth_table: boolean;
  auth_table_owner: string;
  barrier_has_trigger_on_auth_table: boolean;
  barrier_can_lock_auth_table: boolean;
  barrier_can_lock_auth_table_stderr: string;
  barrier_can_lock_cron_job: boolean;
  barrier_can_lock_cron_job_stderr: string;
  barrier_has_select_on_cron_job: boolean;
  barrier_can_create_trigger_on_auth_table: boolean;
  barrier_can_drop_that_trigger: boolean;
  barrier_can_drop_that_trigger_stderr: string;
  barrier_has_database_create: boolean;
  barrier_has_trigger_on_net_queue: boolean;
  barrier_can_execute_cron_alter_job: boolean;
  managed_role_present: boolean;
  guarded_relation_count: number;
}

function drive(): FixtureShape {
  const result = spawnSync('/usr/bin/python3', [RUNNER], {
    encoding: 'utf8',
    timeout: 240_000,
    env: {
      PATH: process.env.PATH,
      LC_ALL: 'C',
      LANG: 'C',
      MC2_Q12_PLAN_DOCKER: '/usr/bin/docker',
    },
    maxBuffer: 8 * 1024 * 1024,
  });
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout) as FixtureShape;
}

describe.runIf(REAL_PG17)('Q12 managed-privilege fixture (real PostgreSQL 17.10)', () => {
  it('gives the barrier role production-shaped rights: TRIGGER yes, ownership no', () => {
    const out = drive();

    // The barrier role is NOT a superuser and does not own the guarded relations.
    expect(out.barrier_is_superuser).toBe(false);
    expect(out.barrier_owns_auth_table).toBe(false);
    expect(out.auth_table_owner).toBe('mc2_auth_admin');

    // It can still arm the guard on them — the privilege, not the ownership, is the gate.
    expect(out.barrier_has_trigger_on_auth_table).toBe(true);
    expect(out.barrier_can_lock_auth_table, out.barrier_can_lock_auth_table_stderr).toBe(true);
    expect(out.barrier_can_create_trigger_on_auth_table).toBe(true);

    // …and it cannot DISARM it one relation at a time — the mc2-ipwyc shape.
    expect(out.barrier_can_drop_that_trigger).toBe(false);
    expect(out.barrier_can_drop_that_trigger_stderr).toContain('must be owner of relation');

    // cron.job is SELECT-only, exactly as supabase_admin grants it — the mc2-34eua shape.
    expect(out.barrier_has_select_on_cron_job).toBe(true);
    expect(out.barrier_can_lock_cron_job).toBe(false);
    expect(out.barrier_can_lock_cron_job_stderr).toContain('permission denied');

    // The privileges the retained, privilege-free cron path still depends on.
    expect(out.barrier_can_execute_cron_alter_job).toBe(true);
    expect(out.barrier_has_trigger_on_net_queue).toBe(true);
    expect(out.barrier_has_database_create).toBe(true);

    // The managed boundary role E1 has to reason about exists under its production name.
    expect(out.managed_role_present).toBe(true);
    expect(out.guarded_relation_count).toBe(9);
  }, 260_000);
});
