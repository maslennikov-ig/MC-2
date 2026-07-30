import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

// mc2-wl5vn — C4 could not restore a guarded dump.
//
// C3 dumps a database C1 has already guarded, so the archive carries the q12_guard event trigger.
// Replaying it as the image superuser reverses the ownership pairing supautils demands (mc2-ipwyc
// keeps q12_guard owned by the managed non-superuser `postgres` so the barrier can disarm what it
// armed), and pg_restore dies on "Superuser owned event trigger must execute a superuser owned
// function". Sixteen window attempts died before C4, so a guarded dump had never been restored.
//
// The owner's remedy (2026-07-30) is to skip exactly that archive entry via a pg_restore use-list.
// The failure this suite exists to prevent is NOT "the exclusion does not fire" — that reproduces
// the known error loudly, in the isolate, before any writer is stopped. It is "the exclusion fires
// too widely": a use-list that quietly drops a production object restores a smaller database, and
// every comparison downstream then measures the archive it was handed rather than the archive C3
// took. So the load-bearing case here is `unguarded`, where the produced list must be byte-equal to
// the archive's own TOC.
//
// The fixture executes the drill's SHIPPED build_restore_toc block, extracted from the tracked
// script at run time, against a stubbed pg_restore. What that cannot prove — that a real
// pg_restore --use-list accepts the file and a real Supabase 17.6 then restores clean — comes only
// from the drill running against a production generation, and is recorded on mc2-wl5vn.
const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const RUNNER = resolve(
  repoRoot,
  'packages/course-gen-platform/tests/unit/ops/fixtures/q12-restore-guard-exclusion-runner.py'
);
const DRILL = resolve(repoRoot, 'deploy/postgres/restore-supabase-drill.sh');

interface Excluded {
  line: number;
  dump_id: string;
  trigger: string;
  function_schema: string;
  reason: string;
}

interface CaseResult {
  exit_code: number;
  stdout: string;
  stderr: string;
  report?: { schema: string; total_entries: number; excluded: Excluded[] };
  restore_list?: string[];
  commented_out?: string[];
  identical_to_toc?: boolean;
  one_entry_scratch_left: boolean;
}

interface Report {
  schema: string;
  drill: string;
  cases: Record<string, CaseResult>;
}

let report: Report;

beforeAll(() => {
  const result = spawnSync('/usr/bin/python3', [RUNNER], { encoding: 'utf8', timeout: 120_000 });
  if (result.status !== 0) {
    throw new Error(`runner failed (${result.status}): ${result.stderr}`);
  }
  report = JSON.parse(result.stdout) as Report;
  expect(report.schema).toBe('megacampus.q12.restore-guard-exclusion/v1');
});

describe('the C4 guarded-restore exclusion (mc2-wl5vn)', () => {
  it('skips the guard event trigger in the archive a window actually produces', () => {
    const guarded = report.cases.guarded;
    expect(guarded.exit_code).toBe(0);
    expect(guarded.stderr).toBe('');

    const excluded = guarded.report?.excluded ?? [];
    expect(excluded).toHaveLength(1);
    expect(excluded[0].trigger).toBe('q12_guard_ddl_command_start');
    expect(excluded[0].function_schema).toBe('q12_guard');
    expect(excluded[0].reason).toContain('mc2-wl5vn');

    // The run log must never read as a full replay when it was not one.
    expect(guarded.stdout).toContain('1 skipped');
    expect(guarded.stdout).toContain('q12_guard_ddl_command_start');
  });

  it('leaves an unguarded archive byte-identical — the over-exclusion guard', () => {
    // Scheduled mode restores a dump taken when no barrier has ever run. Nothing may be skipped,
    // and the produced list must be the archive's own TOC, unchanged.
    const unguarded = report.cases.unguarded;
    expect(unguarded.exit_code).toBe(0);
    expect(unguarded.report?.excluded).toEqual([]);
    expect(unguarded.identical_to_toc).toBe(true);
    expect(unguarded.commented_out).toEqual([]);
    expect(unguarded.stdout).toContain('0 skipped');
  });

  it("never skips a production event trigger that is not the guard's", () => {
    // pgrst_ddl_watch is Supabase's own and is superuser-owned on both sides, so it restores fine
    // and must survive every case where it appears.
    for (const name of ['guarded', 'guarded_comment', 'unguarded']) {
      const produced = report.cases[name].restore_list ?? [];
      expect(
        produced.some(line => line.startsWith('4402;') && line.includes('pgrst_ddl_watch'))
      ).toBe(true);
      expect(produced.some(line => line.startsWith(';4402;'))).toBe(false);
    }
  });

  it('derives the exclusion from the function schema, not from the trigger name', () => {
    // The drill names no trigger. A guard installed under a different name is still caught, which
    // is what keeps this from becoming the declared-expectation defect of mc2-lzft4.
    const renamed = report.cases.renamed_guard;
    expect(renamed.exit_code).toBe(0);
    expect(renamed.report?.excluded).toHaveLength(1);
    expect(renamed.report?.excluded[0].trigger).toBe('barrier_ddl_start');
    expect(renamed.report?.excluded[0].function_schema).toBe('q12_guard');
    expect(renamed.commented_out).toEqual([
      '4403; 3466 41002 EVENT TRIGGER - barrier_ddl_start postgres',
    ]);
  });

  it('carries a comment on a skipped trigger with it, and only that one', () => {
    const withComment = report.cases.guarded_comment;
    expect(withComment.exit_code).toBe(0);
    const excluded = withComment.report?.excluded ?? [];
    expect(excluded).toHaveLength(2);
    expect(excluded[1].dump_id).toBe('4404');
    expect(excluded[1].reason).toContain('depends on skipped');
    // The unrelated comment stays: restoring it is not affected by the skip.
    expect(withComment.restore_list).toContain(
      '4405; 0 0 COMMENT - EVENT TRIGGER pgrst_ddl_watch supabase_admin'
    );
  });

  it('fails closed rather than assuming an unreadable entry is innocent', () => {
    const unparsable = report.cases.unparsable;
    expect(unparsable.exit_code).not.toBe(0);
    expect(unparsable.stderr).toContain('no parsable CREATE EVENT TRIGGER');
    expect(unparsable.restore_list).toBeUndefined();

    const broken = report.cases.extraction_failed;
    expect(broken.exit_code).not.toBe(0);
    expect(broken.stderr).toContain('single-entry archive extraction failed');
    expect(broken.restore_list).toBeUndefined();
  });

  it('actually wires the derived list into the strict restore', () => {
    // A perfect list nothing consumes is worth nothing. Assert against the shipped drill.
    const drill = readFileSync(DRILL, 'utf8');
    expect(drill).toContain('build_restore_toc');
    expect(drill).toMatch(/--use-list "\$TEMP_ROOT\/restore\.toc"/);
    // The strictness that remains must remain: a skipped entry is not a licence to tolerate errors.
    const restoreCall = drill.slice(drill.indexOf('--use-list "$TEMP_ROOT/restore.toc"') - 400);
    expect(restoreCall).toContain('--exit-on-error');
    expect(restoreCall).toContain('--single-transaction');
  });
});
