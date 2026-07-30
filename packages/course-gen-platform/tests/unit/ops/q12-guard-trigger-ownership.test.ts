import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// mc2-ipwyc — two latent C9/C10 blockers, both measured on production 2026-07-28 while restoring
// the database after live-window attempt #9. Both are the same failure class as the eight before
// them: the environment the barrier was CHECKED in is more permissive than the one it RUNS in.
//
// FINDING 1 — the barrier could arm guard triggers it could not disarm. The guarded set is chosen
// by "postgres has the TRIGGER privilege on this relation", which is exactly how the 22 auth and
// 5 storage tables qualify — but those are owned by supabase_auth_admin / supabase_storage_admin.
// CREATE TRIGGER needs only the privilege; DROP TRIGGER needs OWNERSHIP. The $restore$ block,
// shared by activate and rollback, dropped its 158 triggers one relation at a time and raised
// `must be owner of relation oauth_authorizations` on the live database. activate runs that block
// PAST the point of no return. (cleanup was never affected: it already used DROP SCHEMA CASCADE,
// which is also how the production restore succeeded.) The fix drops the guard function with
// CASCADE — which does not re-check each dependent object's owner — and replays the function's own
// catalog definition plus the six q12_guard_immutable trigger definitions, captured before the
// drop, so nothing in the file can drift from what install created.
//
// FINDING 2 — the barrier's session proofs proved nothing. Measured against the live Supavisor
// pooler: the connection's startup `options` parameter is never delivered, so
// `-c default_transaction_read_only=on/off` has no effect and each proof was silently reading
// whatever the DATABASE default happened to be. Benign before install; fatal after it — the main
// runner's `transaction_read_only='off'` proof cannot pass once install sets the database default
// read-only, and the terminal proof's `='on'` cannot pass once restore puts the default back.
// Each runner now states its intent with a session-level SET and keeps the proof as a
// post-condition, which still fails closed on a genuinely read-only server.
//
// This gated repro drives both findings against a disposable postgres:17.10 container. `postgres`
// is a superuser there and bypasses every ownership check, so the harness models the MANAGED
// privilege split explicitly with a non-superuser barrier role and a foreign table owner. It also
// binds itself to the live barrier bytes, so it goes red if either fix is reverted.
const REAL_PG17 = process.env.MC2_Q12_REAL_PG17 === '1';
const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const RUNNER = resolve(
  repoRoot,
  'packages/course-gen-platform/tests/unit/ops/fixtures/q12-guard-trigger-ownership-runner.py'
);

describe.runIf(REAL_PG17)(
  'Q12 mc2-ipwyc: guard-trigger ownership and the pooled session proofs (real PostgreSQL 17.10)',
  () => {
    it('cannot DROP TRIGGER what it CREATEd, drops it by CASCADE, and re-arms the immutable guards', () => {
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
      const out = JSON.parse(result.stdout) as {
        setup_rc: number;
        guard_rc: number;
        guard_stderr: string;
        relation_is_foreign_owned: boolean;
        trigger_created_without_ownership: boolean;
        drop_trigger_rc: number;
        drop_trigger_stderr: string;
        activate_rc: number;
        activate_stderr: string;
        guarded_relation_triggers_after: string;
        immutable_triggers_after: string;
        guard_function_present_after: string;
        activated_after: string;
        immutable_rc: number;
        immutable_stderr: string;
        read_only_pooled_no_option: string;
        read_only_with_startup_option: string;
        read_only_after_session_set: string;
        retired_drop_loop_absent: boolean;
        cascade_form_present: boolean;
        session_set_present: boolean;
      };

      // The managed shape: the guarded relation belongs to another role, and the barrier role can
      // still ARM it — this is precisely why auth/storage tables are in the guarded set.
      expect(out.setup_rc).toBe(0);
      expect(out.guard_rc, out.guard_stderr).toBe(0);
      expect(out.relation_is_foreign_owned).toBe(true);
      expect(out.trigger_created_without_ownership).toBe(true);

      // RED: the retired per-relation drop, verbatim, against the same relation production named.
      expect(out.drop_trigger_rc).not.toBe(0);
      expect(out.drop_trigger_stderr).toContain('must be owner of relation oauth_authorizations');

      // GREEN: the live activate sequence in ONE transaction — CASCADE the function away, flip
      // activated while nothing guards it, then replay the function and the immutable trigger.
      expect(out.activate_rc, out.activate_stderr).toBe(0);
      expect(out.activate_stderr).toContain('drop cascades to trigger q12_guard_row');
      expect(out.guarded_relation_triggers_after).toBe('0');
      expect(out.immutable_triggers_after).toBe('1');
      expect(out.guard_function_present_after).toBe('1');
      expect(out.activated_after).toBe('t');
      // The replayed immutable guard is ARMED, not a decoration: a write to the durable truth still
      // raises through the re-created function.
      expect(out.immutable_rc).not.toBe(0);
      expect(out.immutable_stderr).toContain('Q12 write barrier');

      // FINDING 2: a pooled session (no startup option delivered) inherits the read-only default;
      // the option would have worked had it arrived; only the session-level SET clears it.
      expect(out.read_only_pooled_no_option).toBe('on');
      expect(out.read_only_with_startup_option).toBe('off');
      expect(out.read_only_after_session_set).toBe('off');

      // Bound to the live barrier bytes: red if either fix is reverted.
      expect(out.retired_drop_loop_absent).toBe(true);
      expect(out.cascade_form_present).toBe(true);
      expect(out.session_set_present).toBe(true);
    }, 260_000);
  }
);
