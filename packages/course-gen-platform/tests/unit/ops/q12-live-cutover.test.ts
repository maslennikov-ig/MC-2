import { createHash } from 'node:crypto';
import { lstatSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  materializeRootRetainedBarrierFixture,
  parseLeaseEpoch,
  rehashJournalAndCheckpointsAfterMutation,
  type CompletionMode,
  type FrontierCopySet,
  type FrontierForm,
  type RetainedBarrierOperation,
  type RetainedChainSpec,
  type RootRetainedBarrierFixtureSpec,
} from './fixtures/q12-retained-barrier-contract.js';

const operations: readonly RetainedBarrierOperation[] = [
  'install',
  'verify-after-base',
  'verify-after-observability',
  'prepare-recovery',
  'activate',
];
const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function root(): string {
  const value = mkdtempSync('/tmp/mc2-q12-d5-root-');
  roots.push(value);
  return value;
}

function chain(
  operation: RetainedBarrierOperation,
  overrides: Record<string, unknown> = {}
): RetainedChainSpec {
  const base = {
    operation,
    rootEpoch: parseLeaseEpoch('cutover'),
    cutoverCopyBeforeRecoveryRoot: 'absent',
    recoveryReissues: 0,
    publicationWindowOrphans: 0,
    completionMode: 'normal',
    faultAfter: 'none',
    stopAfter: 'completed',
    installTransaction: operation === 'install' ? 'normal' : 'not-applicable',
    ...overrides,
  };
  return base as RetainedChainSpec;
}

function spec(
  chains: Partial<Record<RetainedBarrierOperation, RetainedChainSpec>>,
  mode: 'forward' | 'rollback' = 'forward'
): RootRetainedBarrierFixtureSpec {
  return {
    runRoot: root(),
    mode,
    completed: Object.keys(chains) as RetainedBarrierOperation[],
    chains,
  };
}

function sha(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonical(value: Record<string, unknown>): string {
  return JSON.stringify(
    Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
  );
}

describe('Root D5 fixture contract boundary', () => {
  it('routes every positive through production run_supervisor/run_claim with no independent serializer', async () => {
    const runner = readFileSync(
      join(
        repoRoot,
        'packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-runner.py'
      ),
      'utf8'
    );
    expect(runner).toContain('run_supervisor = CORE.run_supervisor');
    expect(runner).toContain('run_claim = CORE.run_claim');
    expect(runner).not.toContain('megacampus.q12.cutover-journal/v1');
    expect(runner).not.toContain('megacampus.q12.cutover-checkpoint/v1');
    expect(runner).not.toContain('megacampus.q12.host-command-capability/v1');
    const candidate = spec({ install: chain('install') });
    await materializeRootRetainedBarrierFixture(candidate);
    expect(
      JSON.parse(readFileSync(join(candidate.runRoot, 'executor-audit.json'), 'utf8'))
    ).toMatchObject({
      enteredRunSupervisor: true,
      enteredRunClaim: true,
      leaseFd9Validated: true,
      inheritedJournalIdentityValidated: true,
      attemptedEffects: [],
    });
  });
  it.each([
    '',
    ' cutover',
    'cutover ',
    'cutover-recovery-0',
    'cutover-recovery-01',
    'cutover-recovery--1',
    'cutover-recovery-+1',
    'cutover-recovery-1.0',
    'cutover-recovery-1e2',
    'cutover-recovery-999999999999999999999999999999999999999999999999999999999999999999999999',
  ])('rejects illegal epoch spelling %j', value => {
    expect(() => parseLeaseEpoch(value)).toThrow();
  });

  it.each(['cutover', 'cutover-recovery-1', 'cutover-recovery-99'])(
    'accepts exact epoch %s',
    value => {
      expect(parseLeaseEpoch(value)).toBe(value);
    }
  );

  it.each([
    ['not-committed', 'completed'],
    ['committed-no-baseline-receipt', 'issued'],
    ['ambiguous', 'completed'],
    ['normal', 'claimed'],
  ])(
    'rejects illegal install combination %s/%s before runner use',
    async (transaction, stopAfter) => {
      const candidate = spec({
        install: chain('install', { installTransaction: transaction, stopAfter }),
      });
      await expect(materializeRootRetainedBarrierFixture(candidate)).rejects.toThrow(
        'illegal install transaction/stopAfter combination'
      );
    }
  );

  it('rejects record-key mismatch and non-install incomplete chains', async () => {
    const mismatch = spec({ install: chain('verify-after-base') });
    await expect(materializeRootRetainedBarrierFixture(mismatch)).rejects.toThrow('mismatch');
    const incomplete = spec({
      'verify-after-base': chain('verify-after-base', { stopAfter: 'claimed' }),
    });
    await expect(materializeRootRetainedBarrierFixture(incomplete)).rejects.toThrow(
      'completed/not-applicable'
    );
  });
});

describe('Root production serializer initial lifecycle', () => {
  it('emits canonical exact 19-key rows, 12-key checkpoints, and 12-key capabilities', async () => {
    const candidate = spec({ install: chain('install') });
    const fixture = await materializeRootRetainedBarrierFixture(candidate);
    const journalKeys = [
      'accepted_object_kind',
      'accepted_object_sha256',
      'capability_manifest_sha256',
      'command_id',
      'command_sha256',
      'entry_hash',
      'lease_epoch',
      'operator_digest',
      'outcome',
      'phase',
      'previous_hash',
      'quiesce_manifest_sha256',
      'release_sha',
      'resource_manifest_sha256',
      'rotation_required',
      'run_id',
      'schema',
      'seq',
      'timestamp',
    ];
    let previous = '0'.repeat(64);
    for (const row of fixture.journalEntries) {
      expect(Object.keys(row).sort()).toEqual(journalKeys);
      expect(row.previous_hash).toBe(previous);
      const preimage = { ...row };
      delete preimage.entry_hash;
      expect(row.entry_hash).toBe(sha(Buffer.from(canonical(preimage))));
      previous = String(row.entry_hash);
    }
    const durableRows = readFileSync(join(candidate.runRoot, 'phase.jsonl'), 'utf8')
      .trimEnd()
      .split('\n');
    expect(durableRows).toEqual(fixture.journalEntries.map(row => canonical(row)));
    const checkpoint = JSON.parse(readFileSync(fixture.fixedCheckpointPath, 'utf8')) as Record<
      string,
      unknown
    >;
    expect(Object.keys(checkpoint).sort()).toEqual([
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
    ]);
    expect(checkpoint.journal_entry_hash).toBe(previous);
    const capability = JSON.parse(
      readFileSync(fixture.capabilityPaths.get('install:cutover'), 'utf8')
    ) as Record<string, unknown>;
    expect(Object.keys(capability).sort()).toEqual([
      'capability_input_checkpoint_sha256',
      'command_id',
      'command_sha256',
      'lease_epoch',
      'operator_digest',
      'quiesce_manifest_sha256',
      'release_sha',
      'resource_manifest_sha256',
      'resume_authority_sha256',
      'run_id',
      'schema_version',
      'supersedes_capability_sha256',
    ]);
    const selectorCopy = JSON.parse(
      readFileSync(fixture.retainedCopyPaths.get('install:cutover'), 'utf8')
    ) as Record<string, unknown>;
    expect(selectorCopy.journal_entry_hash).toBe(fixture.selectorEntryHashes.get('install'));
    expect(selectorCopy.journal_device).toBe(checkpoint.journal_device);
    expect(selectorCopy.journal_inode).toBe(checkpoint.journal_inode);
  });

  it.each(operations)(
    'emits exact selector/copy/issue/claim/result/completion order for %s',
    async operation => {
      const fixture = await materializeRootRetainedBarrierFixture(
        spec({ [operation]: chain(operation) })
      );
      const rows = fixture.journalEntries.filter(row => row.command_id === `barrier.${operation}`);
      expect(rows.map(row => row.outcome)).toEqual([
        'intent',
        'capability_issued',
        'capability_claimed',
        'completed',
      ]);
      expect(fixture.selectorEntryHashes.get(operation)).toBe(rows[0]?.entry_hash);
      expect(fixture.completionEntryHashes.get(operation)).toBe(rows.at(-1)?.entry_hash);
      const copyPath = fixture.retainedCopyPaths.get(`${operation}:cutover`)!;
      const capabilityPath = fixture.capabilityPaths.get(`${operation}:cutover`)!;
      const copy = readFileSync(copyPath);
      const capability = JSON.parse(readFileSync(capabilityPath, 'utf8')) as Record<
        string,
        unknown
      >;
      const copyStat = lstatSync(copyPath);
      expect(copyPath).toContain(
        `retained-barrier-capability-checkpoint-${operation}-cutover.json`
      );
      expect(capability.capability_input_checkpoint_sha256).toBe(sha(copy));
      expect(copyStat.mode & 0o777).toBe(0o600);
      expect(copyStat.uid).toBe(1000);
      expect(copyStat.gid).toBe(1000);
      expect(copyStat.nlink).toBe(1);
      expect(lstatSync(fixture.fixedCheckpointPath).ino).not.toBe(copyStat.ino);
      expect(
        JSON.parse(readFileSync(join(candidateRoot(copyPath), 'effects.json'), 'utf8'))
      ).toEqual([]);
    }
  );

  it('records activation H-checkpoint/I-journal-head temporal CAS and no activated intent', async () => {
    const candidate = spec({ activate: chain('activate') });
    const fixture = await materializeRootRetainedBarrierFixture(candidate);
    const trace = JSON.parse(
      readFileSync(join(candidate.runRoot, 'trace.json'), 'utf8')
    ) as string[];
    expect(trace).toContain('activate:H-checkpoint+I-journal-head');
    expect(fixture.journalEntries).not.toContainEqual(
      expect.objectContaining({ phase: 'activated', outcome: 'intent' })
    );
  });
});

function candidateRoot(path: string): string {
  return path.slice(0, path.indexOf('/retained-barrier-capability-checkpoint-'));
}

describe('Root recovery and crash matrix', () => {
  it.each(
    operations.flatMap(operation => ['absent', 'present'].map(copy => [operation, copy] as const))
  )('creates null-root recovery-1 for %s with cutover copy %s', async (operation, copyState) => {
    const fixture = await materializeRootRetainedBarrierFixture(
      spec({
        [operation]: chain(operation, {
          rootEpoch: parseLeaseEpoch('cutover-recovery-1'),
          cutoverCopyBeforeRecoveryRoot: copyState,
        }),
      })
    );
    const path = fixture.capabilityPaths.get(`${operation}:cutover-recovery-1`)!;
    const capability = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    expect(capability.supersedes_capability_sha256).toBeNull();
    expect(fixture.retainedCopyPaths.has(`${operation}:cutover`)).toBe(copyState === 'present');
    expect(fixture.journalEntries.some(row => row.outcome === 'recovery_reacquired')).toBe(true);
  });

  it.each([
    [1, 0],
    [2, 0],
    [1, 1],
    [2, 2],
  ] as const)(
    'retires direct reissue/orphan chain before reacquisition (%i/%i)',
    async (reissues, orphans) => {
      const fixture = await materializeRootRetainedBarrierFixture(
        spec({
          'verify-after-base': chain('verify-after-base', {
            recoveryReissues: reissues,
            publicationWindowOrphans: orphans,
          }),
        })
      );
      const trace = JSON.parse(
        readFileSync(
          join(candidateRoot([...fixture.retainedCopyPaths.values()][0]), 'trace.json'),
          'utf8'
        )
      ) as string[];
      const reacquired = trace.lastIndexOf('journal:recovery_reacquired');
      expect(reacquired).toBeGreaterThan(trace.lastIndexOf('retire:predecessor'));
      const superseded = [...fixture.capabilityPaths.values()].filter(path =>
        path.includes('/superseded/')
      );
      expect(superseded.length).toBe(reissues + orphans);
    }
  );

  it.each([
    'normal',
    'move-no-row-continuous-lease',
    'move-no-row-reacquired',
  ] satisfies CompletionMode[])(
    'completes exact immutable result without replay for %s',
    async completionMode => {
      const candidate = spec({
        'prepare-recovery': chain('prepare-recovery', { recoveryReissues: 1, completionMode }),
      });
      const fixture = await materializeRootRetainedBarrierFixture(candidate);
      const audit = JSON.parse(
        readFileSync(join(candidate.runRoot, 'executor-audit.json'), 'utf8')
      ) as {
        childExecutions: number;
        attemptedEffects: string[];
      };
      expect(audit.childExecutions).toBe(1);
      expect(audit.attemptedEffects).toEqual([]);
      expect(fixture.resultPaths.size).toBe(1);
      expect(fixture.journalEntries.filter(row => row.outcome === 'completed')).toHaveLength(1);
    }
  );

  it.each([
    'copy-temp-fsync',
    'copy-rename',
    'successor-publication',
    'predecessor-retirement-1',
    'predecessor-retirement-2',
    'predecessor-retirement-3',
  ] as const)('fails closed at crash boundary %s', async faultAfter => {
    const candidate = spec({
      'verify-after-observability': chain('verify-after-observability', {
        recoveryReissues: 2,
        publicationWindowOrphans: 2,
        faultAfter,
      }),
    });
    await expect(materializeRootRetainedBarrierFixture(candidate)).rejects.toThrow(
      /injected crash/
    );
    const effects = JSON.parse(
      readFileSync(join(candidate.runRoot, 'effects.json'), 'utf8')
    ) as string[];
    expect(effects).toEqual([]);
  });
});

describe('Install transaction boundary', () => {
  it.each(['selector', 'copy', 'published', 'issued', 'claim-moved', 'claimed'] as const)(
    'keeps pre-COMMIT %s forward-only without rollback authority',
    async stopAfter => {
      const candidate = spec({
        install: chain('install', { stopAfter, installTransaction: 'not-committed' }),
      });
      const fixture = await materializeRootRetainedBarrierFixture(candidate);
      expect(
        fixture.journalEntries.some(row => row.outcome === 'retained_attempt_abandoning')
      ).toBe(false);
      expect(
        fixture.journalEntries.some(row => row.accepted_object_kind === 'final_writer_manifest')
      ).toBe(false);
      expect(JSON.parse(readFileSync(join(candidate.runRoot, 'effects.json'), 'utf8'))).toEqual([]);
    }
  );

  it('reconstructs committed install from actual claimed boundary without replay', async () => {
    const candidate = spec({
      install: chain('install', {
        stopAfter: 'claimed',
        installTransaction: 'committed-no-baseline-receipt',
        rootEpoch: parseLeaseEpoch('cutover-recovery-1'),
      }),
    });
    const fixture = await materializeRootRetainedBarrierFixture(candidate);
    const baseline = JSON.parse(
      readFileSync(join(candidate.runRoot, 'database-barrier-baseline.json'), 'utf8')
    ) as Record<string, unknown>;
    const claim = fixture.journalEntries.find(row => row.outcome === 'capability_claimed')!;
    expect(baseline.predecessor_journal_entry_hash).toBe(claim.entry_hash);
    expect(fixture.journalEntries.filter(row => row.outcome === 'capability_claimed')).toHaveLength(
      1
    );
    expect(
      JSON.parse(readFileSync(join(candidate.runRoot, 'executor-audit.json'), 'utf8'))
    ).toMatchObject({
      childExecutions: 0,
    });
  });

  it('retains ambiguous install evidence as incident', async () => {
    const candidate = spec({
      install: chain('install', { stopAfter: 'claimed', installTransaction: 'ambiguous' }),
    });
    await expect(materializeRootRetainedBarrierFixture(candidate)).rejects.toThrow(
      'ambiguous install commit'
    );
    expect(JSON.parse(readFileSync(join(candidate.runRoot, 'effects.json'), 'utf8'))).toEqual([]);
  });
});

describe('Rollback frontier and activation classifier', () => {
  const frontierOperations = operations.slice(1);
  const forms: readonly FrontierForm[] = [
    'selector-only',
    'copy-prefix',
    'journal-less-published',
    'issued',
    'claim-moved',
    'claimed-no-success',
  ];
  const copySets: readonly FrontierCopySet[] = [
    'empty',
    'cutover',
    'recovery-1',
    'cutover+recovery-1',
  ];

  it.each(
    frontierOperations.flatMap((operation, index) =>
      forms.flatMap(form =>
        (['initial', 'multi-epoch'] as const).flatMap(history =>
          (['continuous', 'reacquired'] as const).map(
            lease => [operation, index + 1, form, history, lease] as const
          )
        )
      )
    )
  )(
    'disposes only exact next %s frontier after prefix %i (%s/%s/%s)',
    async (operation, prefixLength, form, history, lease) => {
      const completed = operations.slice(0, prefixLength);
      const chains = Object.fromEntries(completed.map(item => [item, chain(item)]));
      const candidate: RootRetainedBarrierFixtureSpec = {
        ...spec(chains, 'rollback'),
        completed,
        abandonedFrontier: {
          operation,
          form,
          history,
          lease,
          copySet: form === 'copy-prefix' ? 'cutover+recovery-1' : 'empty',
          exactSuccessBeforeDisposition: false,
          activationCommitRace: 'none',
        },
      };
      const fixture = await materializeRootRetainedBarrierFixture(candidate);
      const disposition = fixture.journalEntries.find(
        row => row.outcome === 'retained_attempt_abandoning'
      )!;
      expect(disposition.command_id).toBe(`barrier.${operation}`);
      expect(fixture.frontierDispositionEntryHash).toBe(disposition.entry_hash);
      expect(fixture.completionEntryHashes.size).toBe(prefixLength);
      const rIndex = fixture.journalEntries.indexOf(disposition);
      const intentIndex = fixture.journalEntries.findIndex(
        row => row.phase === 'rollback_preparing' && row.outcome === 'intent'
      );
      expect(intentIndex).toBeGreaterThan(rIndex);
    }
  );

  it.each(copySets)('preserves exact pre-capability copy set %s', async copySet => {
    const candidate: RootRetainedBarrierFixtureSpec = {
      ...spec({ install: chain('install') }, 'rollback'),
      completed: ['install'],
      abandonedFrontier: {
        operation: 'verify-after-base',
        form: 'copy-prefix',
        history: 'initial',
        lease: 'reacquired',
        copySet,
        exactSuccessBeforeDisposition: false,
        activationCommitRace: 'none',
      },
    };
    const fixture = await materializeRootRetainedBarrierFixture(candidate);
    const keys = [...fixture.retainedCopyPaths.keys()].filter(key =>
      key.startsWith('verify-after-base:')
    );
    const expected =
      copySet === 'empty'
        ? []
        : copySet === 'cutover'
          ? ['verify-after-base:cutover']
          : copySet === 'recovery-1'
            ? ['verify-after-base:cutover-recovery-1']
            : ['verify-after-base:cutover', 'verify-after-base:cutover-recovery-1'];
    expect(keys).toEqual(expected);
  });

  it('makes R the sole journal-less tip reference and projects F afterward', async () => {
    const candidate: RootRetainedBarrierFixtureSpec = {
      ...spec({ install: chain('install') }, 'rollback'),
      completed: ['install'],
      abandonedFrontier: {
        operation: 'verify-after-base',
        form: 'journal-less-published',
        history: 'multi-epoch',
        lease: 'reacquired',
        copySet: 'empty',
        exactSuccessBeforeDisposition: false,
        activationCommitRace: 'none',
      },
    };
    const fixture = await materializeRootRetainedBarrierFixture(candidate);
    const r = fixture.journalEntries.find(row => row.outcome === 'retained_attempt_abandoning')!;
    const tip = String(r.capability_manifest_sha256);
    expect(fixture.journalEntries.filter(row => row.capability_manifest_sha256 === tip)).toEqual([
      r,
    ]);
    const later = fixture.journalEntries.slice(fixture.journalEntries.indexOf(r) + 1);
    expect(later.every(row => row.capability_manifest_sha256 !== tip)).toBe(true);
  });

  it.each(['committed-before-r', 'committed-after-r'] as const)(
    'fails closed for activation commit race %s',
    async activationCommitRace => {
      const completed = operations.slice(0, 4);
      const candidate: RootRetainedBarrierFixtureSpec = {
        ...spec(
          Object.fromEntries(completed.map(operation => [operation, chain(operation)])),
          'rollback'
        ),
        completed,
        abandonedFrontier: {
          operation: 'activate',
          form: 'claimed-no-success',
          history: 'initial',
          lease: 'continuous',
          copySet: 'empty',
          exactSuccessBeforeDisposition: false,
          activationCommitRace,
        },
      };
      await expect(materializeRootRetainedBarrierFixture(candidate)).rejects.toThrow(
        /activation.*incident/
      );
      const rows = readFileSync(join(candidate.runRoot, 'phase.jsonl'), 'utf8')
        .trimEnd()
        .split('\n')
        .map(line => JSON.parse(line) as Record<string, unknown>);
      expect(rows.some(row => row.outcome === 'retained_attempt_abandoning')).toBe(
        activationCommitRace === 'committed-after-r'
      );
      expect(rows.some(row => row.phase === 'rollback_preparing' && row.outcome === 'intent')).toBe(
        false
      );
      expect(JSON.parse(readFileSync(join(candidate.runRoot, 'effects.json'), 'utf8'))).toEqual([]);
    }
  );

  it('completes exact success discovered before R and enlarges prefix', async () => {
    const candidate: RootRetainedBarrierFixtureSpec = {
      ...spec({ install: chain('install') }, 'rollback'),
      completed: ['install'],
      abandonedFrontier: {
        operation: 'verify-after-base',
        form: 'claimed-no-success',
        history: 'initial',
        lease: 'reacquired',
        copySet: 'empty',
        exactSuccessBeforeDisposition: true,
        activationCommitRace: 'none',
      },
    };
    const fixture = await materializeRootRetainedBarrierFixture(candidate);
    expect(fixture.frontierDispositionEntryHash).toBeNull();
    expect(fixture.completionEntryHashes.has('verify-after-base')).toBe(true);
  });
});

describe('Negative-only mutation helper', () => {
  it('cannot bless a hand-built result and keeps adversarial mutation separate', async () => {
    const fixture = await materializeRootRetainedBarrierFixture(
      spec({ install: chain('install') })
    );
    const fabricated = { ...fixture };
    expect(() =>
      rehashJournalAndCheckpointsAfterMutation(fabricated, state => state.journalEntries.splice(0))
    ).toThrow('not materialized by the Root runner');
    expect(() =>
      rehashJournalAndCheckpointsAfterMutation(fixture, state => {
        state.journalEntries[0].command_id = 'barrier.activate';
      })
    ).not.toThrow();
  });
});
