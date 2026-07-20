import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { RUN_REAL_CONTROLLER } from './fixtures/q12-real-controller-gate.js';

// Found-defect #16 (ratified): the controller's Engine.write_install_baseline runs AFTER the
// frozen barrier claim, so in a real run_live install it collides with the barrier's own
// authoritative run_root/database-barrier-baseline.json (0400, full structural schema, load-bearing
// for activate/rollback restore). The RATIFIED Option-A fix makes write_install_baseline
// publish-OR-strict-accept:
//   * ABSENT (fixture / fake-barrier)  -> write the controller 5-key baseline at 0600 (unchanged).
//   * PRESENT (real barrier owns it)   -> STRICT-ACCEPT the 0400 barrier artifact WITHOUT writing:
//       validate_regular_file(0o400) + canonical-parseable JSON + schema_version + run_id -> accept;
//       any deviation (wrong mode incl. a 0600 leftover, unparseable / non-canonical JSON, wrong
//       schema_version, wrong run_id) -> LifecycleError (fail closed, NEVER overwrite).
// This is a NO-DOCKER focused unit test on that single function (minimal Engine via __new__).
const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const RUNNER = resolve(
  repoRoot,
  'packages/course-gen-platform/tests/unit/ops/fixtures/q12-write-install-baseline-strict-accept-runner.py'
);

type CallResult = {
  raised: boolean;
  error_type: string | null;
  is_lifecycle: boolean;
  message: string | null;
};

type Observed = {
  mode: string;
  uid: number;
  gid: number;
  sha256: string;
  keys: string[] | null;
  schema_version: string | null;
  run_id: string | null;
};

describe.runIf(RUN_REAL_CONTROLLER)(
  'Q12 write_install_baseline strict-accept (found-defect #16 fix, no docker)',
  () => {
    const result = spawnSync('/usr/bin/python3', [RUNNER], {
      encoding: 'utf8',
      timeout: 60_000,
      env: { PATH: process.env.PATH, LC_ALL: 'C', LANG: 'C' },
      maxBuffer: 16 * 1024 * 1024,
    });

    it('runs the focused harness to completion', () => {
      expect(result.status, result.stderr).toBe(0);
    });

    const out = JSON.parse(result.stdout || '{}') as {
      absent_write: { call: CallResult; observed: Observed; trace: string[] };
      strict_accept: {
        call: CallResult;
        before: Observed;
        after: Observed;
        byte_unchanged: boolean;
        trace: string[];
      };
      tamper_0600: { call: CallResult };
      tamper_wrong_run_id: { call: CallResult };
      tamper_wrong_schema: { call: CallResult };
      tamper_noncanonical: { call: CallResult };
      tamper_unparseable: { call: CallResult };
    };

    it('ABSENT path still writes the controller 5-key baseline at 0600 (fixture path untouched)', () => {
      expect(out.absent_write.call.raised).toBe(false);
      expect(out.absent_write.observed.mode).toBe('0o600');
      expect(out.absent_write.observed.uid).toBe(1000);
      expect(out.absent_write.observed.gid).toBe(1000);
      expect(out.absent_write.observed.schema_version).toBe(
        'megacampus.q12.database-barrier-baseline/v1'
      );
      expect(out.absent_write.observed.run_id).toBe('wib-strict-accept-run-0000');
      expect(out.absent_write.observed.keys).toEqual([
        'capability_manifest_sha256',
        'predecessor_checkpoint_sha256',
        'predecessor_journal_entry_hash',
        'run_id',
        'schema_version',
      ]);
    });

    it('PRESENT barrier 0400 authoritative artifact is STRICT-ACCEPTED without a write', () => {
      // Pre-fix: write_install_baseline raises "unsafe file identity" (the #16 collision) -> RED.
      expect(out.strict_accept.call.raised).toBe(false);
      expect(out.strict_accept.byte_unchanged).toBe(true);
      expect(out.strict_accept.after.mode).toBe('0o400');
      // The accept admits the barrier's FULL 11-key structural shape (no shape/key check beyond
      // schema_version + run_id).
      expect(out.strict_accept.before.keys).toEqual([
        'baseline',
        'baseline_sha256',
        'database_capability_sha256',
        'expected_post_migration_catalog_sha256',
        'predecessor_checkpoint_sha256',
        'predecessor_journal_entry_hash',
        'resource_manifest_sha256',
        'run_id',
        'schema_version',
        'source_baseline_sha256',
        'state',
      ]);
      expect(out.strict_accept.trace).toContain('install:baseline-strict-accept');
    });

    it('fails closed with a LifecycleError on every tamper (never overwrites)', () => {
      for (const key of [
        'tamper_0600',
        'tamper_wrong_run_id',
        'tamper_wrong_schema',
        'tamper_noncanonical',
        'tamper_unparseable',
      ] as const) {
        expect(out[key].call.raised, key).toBe(true);
        expect(out[key].call.is_lifecycle, `${key}: ${out[key].call.message ?? ''}`).toBe(true);
      }
    });
  }
);
