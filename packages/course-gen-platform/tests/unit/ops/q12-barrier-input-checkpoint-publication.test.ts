import { lstatSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  deriveRootRetainedBarrierFixtureRunId,
  materializeRootRetainedBarrierFixture,
  parseLeaseEpoch,
  type RetainedChainSpec,
  type RootRetainedBarrierFixtureSpec,
} from './fixtures/q12-retained-barrier-contract.js';
import { RUN_REAL_CONTROLLER } from './fixtures/q12-real-controller-gate.js';

// mc2-orsez — the C1 blocker the third live window attempt (2026-07-27) surfaced.
//
// The frozen `q12-database-barrier.sh` install leg (:420-441) refuses to run unless
// `<run-root>/database-barrier-input-checkpoint-install-cutover.json` already exists as a canonical
// 0600 regular file carrying the EXACT 12-key cutover-checkpoint projection of the journal head —
// and that head must be the `barrier.install`/`capability_claimed` row. The controller publishes its
// own `retained-barrier-capability-checkpoint-*` accounting copy but never published THIS name, so
// every production barrier command died with
//   "database barrier child input checkpoint must be a canonical non-symlink regular file".
//
// It stayed invisible because the test fixtures published the file THEMSELVES, standing in for the
// production step. These assertions therefore demand the publication from the CONTROLLER (the fixture
// executors here never write it), which is the only way the gap cannot reopen.
const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const BARRIER = join(REPO_ROOT, 'deploy/qdrant/q12-database-barrier.sh');
const WRITER_RESUME = join(REPO_ROOT, 'deploy/qdrant/q12-writer-resume.py');
const INSTALL_INPUT_CHECKPOINT = 'database-barrier-input-checkpoint-install-cutover.json';
// q12-database-barrier.sh:425-427 / q12-writer-resume.py CHECKPOINT_KEYS — the exact key set.
const CHECKPOINT_KEYS = [
  'accepted_object_kind',
  'accepted_object_sha256',
  'journal_device',
  'journal_entry_hash',
  'journal_inode',
  'lease_epoch',
  'phase',
  'previous_journal_entry_hash',
  'resume_authority_sha256',
  'run_id',
  'schema_version',
  'seq',
] as const;

const roots: string[] = [];

afterEach(() => {
  for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true });
});

function root(): string {
  // Engine.__post_init__ pins the non-production run-root shape to /tmp/mc2-q12-d5-root-*.
  const value = mkdtempSync('/tmp/mc2-q12-d5-root-');
  roots.push(value);
  return value;
}

function installSpec(
  stopAfter: 'issued' | 'claimed' | 'completed'
): RootRetainedBarrierFixtureSpec {
  return {
    runRoot: root(),
    mode: 'forward',
    completed: stopAfter === 'completed' ? ['install'] : [],
    chains: {
      install: {
        operation: 'install',
        rootEpoch: parseLeaseEpoch('cutover'),
        cutoverCopyBeforeRecoveryRoot: 'absent',
        recoveryReissues: 0,
        publicationWindowOrphans: 0,
        completionMode: 'normal',
        faultAfter: 'none',
        stopAfter,
        // validateSpec couples the two: only a completed chain is the committed 'normal' install.
        installTransaction: stopAfter === 'completed' ? 'normal' : 'not-committed',
      } as RetainedChainSpec,
    },
  };
}

function claimRow(rows: readonly Record<string, unknown>[]): Record<string, unknown> {
  const row = rows.find(
    entry => entry.command_id === 'barrier.install' && entry.outcome === 'capability_claimed'
  );
  if (row === undefined) throw new Error('fixture produced no barrier.install claim row');
  return row;
}

describe.runIf(RUN_REAL_CONTROLLER)('Q12 barrier child input checkpoint — install leg', () => {
  it('is published by the controller at the name the frozen barrier reads', async () => {
    const spec = installSpec('completed');

    await materializeRootRetainedBarrierFixture(spec);

    const published = join(spec.runRoot, INSTALL_INPUT_CHECKPOINT);
    expect(() => lstatSync(published)).not.toThrow();
  });

  it('carries the exact 12-key projection of the barrier.install capability_claimed row', async () => {
    const spec = installSpec('completed');

    const fixture = await materializeRootRetainedBarrierFixture(spec);

    const claim = claimRow(fixture.journalEntries);
    const journal = lstatSync(join(spec.runRoot, 'phase.jsonl'));
    const published = JSON.parse(
      readFileSync(join(spec.runRoot, INSTALL_INPUT_CHECKPOINT), 'utf8')
    ) as Record<string, unknown>;

    expect(Object.keys(published).sort()).toEqual([...CHECKPOINT_KEYS]);
    expect(published).toEqual({
      schema_version: 'megacampus.q12.cutover-checkpoint/v1',
      run_id: deriveRootRetainedBarrierFixtureRunId(spec.runRoot),
      seq: claim.seq,
      phase: claim.phase,
      journal_entry_hash: claim.entry_hash,
      previous_journal_entry_hash: claim.previous_hash,
      journal_device: String(journal.dev),
      journal_inode: String(journal.ino),
      accepted_object_kind: 'none',
      accepted_object_sha256: null,
      resume_authority_sha256: null,
      lease_epoch: 'cutover',
    });
  });

  it('is a canonical 0600 single-link regular file that does not alias the fixed checkpoint', async () => {
    const spec = installSpec('completed');

    await materializeRootRetainedBarrierFixture(spec);

    const published = lstatSync(join(spec.runRoot, INSTALL_INPUT_CHECKPOINT));
    const fixed = lstatSync(join(spec.runRoot, 'phase-checkpoint.json'));

    expect(published.isSymbolicLink()).toBe(false);
    expect(published.isFile()).toBe(true);
    expect(published.mode & 0o777).toBe(0o600);
    expect(published.nlink).toBe(1);
    expect(published.ino).not.toBe(fixed.ino);
  });

  it('leaves no publishing residue behind', async () => {
    const spec = installSpec('completed');

    await materializeRootRetainedBarrierFixture(spec);

    expect(() => lstatSync(join(spec.runRoot, `${INSTALL_INPUT_CHECKPOINT}.publishing`))).toThrow();
  });

  // The publication is bound to the CLAIM boundary, not to the run: before the claim row exists
  // there is no head the frozen barrier would accept, and publishing early would hand the child a
  // checkpoint pointing at the issuance row. A mutation that publishes unconditionally fails here.
  it('is absent when the run stops before the claim boundary', async () => {
    const spec = installSpec('issued');

    const fixture = await materializeRootRetainedBarrierFixture(spec);

    expect(fixture.journalEntries.some(row => row.outcome === 'capability_claimed')).toBe(false);
    expect(() => lstatSync(join(spec.runRoot, INSTALL_INPUT_CHECKPOINT))).toThrow();
  });

  it('exists as soon as the claim boundary is reached, before the chain completes', async () => {
    const spec = installSpec('claimed');

    const fixture = await materializeRootRetainedBarrierFixture(spec);

    expect(claimRow(fixture.journalEntries)).toBeDefined();
    expect(() => lstatSync(join(spec.runRoot, INSTALL_INPUT_CHECKPOINT))).not.toThrow();
  });

  // Drift guard: the file name and key set are owned by the FROZEN consumers. If either moves, the
  // controller's publication silently stops being read and C1/C10 break in the window, not here.
  it('matches the name and key set the frozen consumers demand', () => {
    const barrier = readFileSync(BARRIER, 'utf8');
    const writerResume = readFileSync(WRITER_RESUME, 'utf8');

    expect(barrier).toContain(`$run_root/${INSTALL_INPUT_CHECKPOINT}`);
    expect(barrier).toContain(
      '$run_root/database-barrier-input-checkpoint-$command_name-$database_execution_epoch.json'
    );
    expect(writerResume).toContain(
      'database-barrier-input-checkpoint-{database_operation}-{database_execution_epoch}.json'
    );
    for (const key of CHECKPOINT_KEYS) expect(barrier).toContain(`"${key}"`);
  });
});
