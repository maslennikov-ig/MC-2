import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
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
  it('direct-supersedes an issued cutover capability after a real two-process lease loss', async () => {
    const first = spec({
      install: chain('install', {
        stopAfter: 'issued',
        installTransaction: 'not-committed',
      }),
    });
    await materializeRootRetainedBarrierFixture(first);
    const firstPid = Number(
      JSON.parse(readFileSync(join(first.runRoot, 'executor-audit.json'), 'utf8')).supervisorPid
    );

    const fixture = await materializeRootRetainedBarrierFixture({
      ...first,
      chains: { install: chain('install') },
    });
    const secondAudit = JSON.parse(
      readFileSync(join(first.runRoot, 'executor-audit.json'), 'utf8')
    ) as { supervisorPid: number; childExecutions: number };
    expect(secondAudit.supervisorPid).not.toBe(firstPid);
    expect(secondAudit.childExecutions).toBe(1);
    expect(
      fixture.journalEntries.some(
        row => row.outcome === 'capability_claimed' && row.lease_epoch === 'cutover'
      )
    ).toBe(false);
    expect(fixture.journalEntries).toContainEqual(
      expect.objectContaining({
        outcome: 'recovery_reacquired',
        lease_epoch: 'cutover-recovery-1',
      })
    );
    expect(fixture.journalEntries.at(-1)).toMatchObject({
      outcome: 'completed',
      lease_epoch: 'cutover-recovery-1',
    });
    expect(fixture.capabilityPaths.get('install:cutover')).toContain('/superseded/');
    expect(fixture.capabilityPaths.get('install:cutover-recovery-1')).toContain('/completed/');
  });

  it('continues selector-only state after real lease loss from a null-root recovery-1', async () => {
    const first = spec({
      install: chain('install', {
        stopAfter: 'selector',
        installTransaction: 'not-committed',
      }),
    });
    await materializeRootRetainedBarrierFixture(first);
    const fixture = await materializeRootRetainedBarrierFixture({
      ...first,
      chains: { install: chain('install') },
    });
    expect(fixture.retainedCopyPaths.has('install:cutover')).toBe(false);
    const recovery = fixture.capabilityPaths.get('install:cutover-recovery-1')!;
    expect(JSON.parse(readFileSync(recovery, 'utf8')).supersedes_capability_sha256).toBeNull();
    expect(recovery).toContain('/completed/');
  });

  it.each(['missing-result', 'completed-capability-in-claimed'] as const)(
    'rejects terminal durable inconsistency %s in a second process',
    async inconsistency => {
      const first = spec({ install: chain('install') });
      await materializeRootRetainedBarrierFixture(first);
      if (inconsistency === 'missing-result') {
        rmSync(join(first.runRoot, 'retained-barrier-result-install-cutover.json'));
      } else {
        const name = 'barrier.install--cutover.json';
        renameSync(
          join(first.runRoot, 'capabilities', 'completed', name),
          join(first.runRoot, 'capabilities', 'claimed', name)
        );
      }
      await expect(
        materializeRootRetainedBarrierFixture({ ...first, chains: { install: chain('install') } })
      ).rejects.toThrow(/terminal|completed|result/i);
    }
  );

  it.each([
    ['unknown capability residue', 'capabilities/issued/foreign.tmp'],
    ['unknown retained lifecycle residue', 'retained-barrier-result-install-cutover.json.tmp'],
  ] as const)('rejects %s before trusting terminal completion', async (_label, relativePath) => {
    const first = spec({ install: chain('install') });
    await materializeRootRetainedBarrierFixture(first);
    writeFileSync(join(first.runRoot, relativePath), 'foreign\n', { mode: 0o600 });
    await expect(
      materializeRootRetainedBarrierFixture({ ...first, chains: { install: chain('install') } })
    ).rejects.toThrow(/unknown|residue|lifecycle/i);
  });

  it('binds inherited FD9 to the canonical parent cutover.lock identity', async () => {
    const candidate = spec({ install: chain('install') });
    await materializeRootRetainedBarrierFixture(candidate);
    expect(existsSync(join(candidate.runRoot, 'cutover.lock'))).toBe(false);
    expect(lstatSync(join(candidate.runRoot, '..', 'cutover.lock')).mode & 0o777).toBe(0o600);
    expect(
      JSON.parse(readFileSync(join(candidate.runRoot, 'executor-audit.json'), 'utf8'))
    ).toMatchObject({ canonicalLeaseFd9Validated: true });
  });

  it.each(['wrong-path', 'wrong-inode', 'wrong-mode', 'unlocked'] as const)(
    'rejects canonical FD9 mutation %s before claim',
    async leaseMutation => {
      const candidate: RootRetainedBarrierFixtureSpec = {
        ...spec({ install: chain('install') }),
        leaseMutation,
      };
      await expect(materializeRootRetainedBarrierFixture(candidate)).rejects.toThrow(
        /canonical.*lock|lease.*lock|FD 9/i
      );
      expect(JSON.parse(readFileSync(join(candidate.runRoot, 'effects.json'), 'utf8'))).toEqual([]);
    }
  );

  it('rejects a symlink in the canonical lock ancestor chain', async () => {
    const candidate: RootRetainedBarrierFixtureSpec = {
      ...spec({ install: chain('install') }),
      leaseMutation: 'ancestor-symlink',
    };
    await materializeRootRetainedBarrierFixture(candidate);
    expect(
      JSON.parse(readFileSync(join(candidate.runRoot, 'executor-audit.json'), 'utf8'))
    ).toMatchObject({ ancestorSymlinkRejected: true });
  });

  it('does not retain a LeaseSession after failed canonical FD9 validation', async () => {
    const candidate: RootRetainedBarrierFixtureSpec = {
      ...spec({ install: chain('install') }),
      leaseMutation: 'wrong-fd-then-correct',
    };
    const fixture = await materializeRootRetainedBarrierFixture(candidate);
    expect(fixture.journalEntries.at(-1)).toMatchObject({ outcome: 'completed' });
    expect(
      JSON.parse(readFileSync(join(candidate.runRoot, 'executor-audit.json'), 'utf8'))
    ).toMatchObject({ leaseSessionRetainedAfterFailedValidation: false });
  });

  it('restores the core-owned lease anchor when the same executor closes and reopens FD9', async () => {
    const candidate: RootRetainedBarrierFixtureSpec = {
      ...spec({
        install: chain('install', {
          stopAfter: 'issued',
          installTransaction: 'not-committed',
        }),
      }),
      resumeAfterStop: true,
      reopenLeaseFdBeforeResume: true,
    };
    const fixture = await materializeRootRetainedBarrierFixture(candidate);
    expect(
      fixture.journalEntries.filter(row => row.outcome === 'recovery_reacquired')
    ).toHaveLength(0);
    expect(fixture.journalEntries.at(-1)).toMatchObject({
      outcome: 'completed',
      lease_epoch: 'cutover',
    });
  });

  it('uses the frozen all-zero quiesce hash for the install command', async () => {
    const fixture = await materializeRootRetainedBarrierFixture(
      spec({ install: chain('install') })
    );
    const capability = JSON.parse(
      readFileSync(fixture.capabilityPaths.get('install:cutover')!, 'utf8')
    ) as Record<string, unknown>;
    expect(capability.quiesce_manifest_sha256).toBe('0'.repeat(64));
    expect(
      fixture.journalEntries.every(row => row.quiesce_manifest_sha256 === '0'.repeat(64))
    ).toBe(true);
  });

  it.each([false, true])(
    'preserves rotation_required=%s through issuance, delegated claim, and completion',
    async rotationRequired => {
      const candidate: RootRetainedBarrierFixtureSpec = {
        ...spec({ install: chain('install') }),
        rotationRequired,
      };
      const fixture = await materializeRootRetainedBarrierFixture(candidate);
      expect(fixture.journalEntries.every(row => row.rotation_required === rotationRequired)).toBe(
        true
      );
    }
  );

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
      claimProcessBoundary: true,
      launcherOwnedClaimMutation: true,
      leaseFd9Validated: true,
      inheritedJournalIdentityValidated: true,
      attemptedEffects: [],
    });
    const audit = JSON.parse(
      readFileSync(join(candidate.runRoot, 'executor-audit.json'), 'utf8')
    ) as { supervisorPid: number; claimProcessPid: number };
    expect(audit.claimProcessPid).not.toBe(audit.supervisorPid);
  });

  it('executes the actual deployed shell launcher successfully across the process boundary', async () => {
    const candidate: RootRetainedBarrierFixtureSpec = {
      ...spec({ install: chain('install') }),
      executeActualWrapper: true,
    };
    const fixture = await materializeRootRetainedBarrierFixture(candidate);
    const audit = JSON.parse(
      readFileSync(join(candidate.runRoot, 'executor-audit.json'), 'utf8')
    ) as Record<string, unknown>;
    expect(audit).toMatchObject({
      actualDeployedWrapper: true,
      claimProcessBoundary: true,
      launcherOwnedClaimMutation: true,
      childExecutions: 1,
      attemptedEffects: [],
    });
    expect(fixture.journalEntries.map(row => row.outcome)).toContain('capability_claimed');
    expect(fixture.journalEntries.at(-1)?.outcome).toBe('completed');
    expect(
      lstatSync(join(candidate.runRoot, 'expected-post-migration-catalog.json')).mode & 0o777
    ).toBe(0o400);
  });

  it.each(['symlink', 'dotdot', 'parent-symlink'] as const)(
    'rejects non-canonical delegated capability path form %s',
    async claimPathMutation => {
      const candidate: RootRetainedBarrierFixtureSpec = {
        ...spec({ install: chain('install') }),
        claimPathMutation,
      };
      await expect(materializeRootRetainedBarrierFixture(candidate)).rejects.toThrow();
      expect(JSON.parse(readFileSync(join(candidate.runRoot, 'effects.json'), 'utf8'))).toEqual([]);
    }
  );

  it('rejects inherited journal FD8 without O_APPEND sync flags and restores the parent descriptor', async () => {
    const candidate: RootRetainedBarrierFixtureSpec = {
      ...spec({ install: chain('install') }),
      clearJournalAppendFlag: true,
    };
    await expect(materializeRootRetainedBarrierFixture(candidate)).rejects.toThrow(/FD 8|journal/i);
    const audit = JSON.parse(
      readFileSync(join(candidate.runRoot, 'executor-audit.json'), 'utf8')
    ) as Record<string, unknown>;
    expect(audit.parentFd8Restored).toBe(true);
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

  it('creates the next direct successor after a real process dies at reissue publication', async () => {
    const first = spec({
      'verify-after-base': chain('verify-after-base', {
        recoveryReissues: 1,
        faultAfter: 'successor-publication',
      }),
    });
    await expect(materializeRootRetainedBarrierFixture(first)).rejects.toThrow(/injected crash/);
    const firstPid = Number(
      JSON.parse(readFileSync(join(first.runRoot, 'executor-audit.json'), 'utf8')).supervisorPid
    );
    const fixture = await materializeRootRetainedBarrierFixture({
      ...first,
      chains: { 'verify-after-base': chain('verify-after-base') },
    });
    const secondPid = Number(
      JSON.parse(readFileSync(join(first.runRoot, 'executor-audit.json'), 'utf8')).supervisorPid
    );
    expect(secondPid).not.toBe(firstPid);
    expect(fixture.journalEntries.filter(row => row.outcome === 'recovery_reacquired')).toEqual([
      expect.objectContaining({ lease_epoch: 'cutover-recovery-2' }),
    ]);
    expect(fixture.capabilityPaths.get('verify-after-base:cutover-recovery-1')).toContain(
      '/superseded/'
    );
  });

  it('derives two consecutive journal-less orphans from two real publication-loss PIDs', async () => {
    const first = spec({
      'verify-after-base': chain('verify-after-base', {
        publicationWindowOrphans: 1,
        faultAfter: 'successor-publication',
      }),
    });
    await expect(materializeRootRetainedBarrierFixture(first)).rejects.toThrow(/injected crash/);
    await expect(
      materializeRootRetainedBarrierFixture({
        ...first,
        chains: {
          'verify-after-base': chain('verify-after-base', {
            faultAfter: 'successor-publication',
          }),
        },
      })
    ).rejects.toThrow(/injected crash/);
    const fixture = await materializeRootRetainedBarrierFixture({
      ...first,
      chains: { 'verify-after-base': chain('verify-after-base') },
    });
    expect(fixture.journalEntries).toContainEqual(
      expect.objectContaining({
        outcome: 'recovery_reacquired',
        lease_epoch: 'cutover-recovery-3',
      })
    );
    for (const epoch of ['cutover-recovery-1', 'cutover-recovery-2']) {
      const path = fixture.capabilityPaths.get(`verify-after-base:${epoch}`)!;
      const digest = sha(readFileSync(path));
      expect(fixture.journalEntries.some(row => row.capability_manifest_sha256 === digest)).toBe(
        false
      );
      expect(path).toContain('/superseded/');
    }
  });

  it.each([1, 2, 3] as const)(
    'publishes a fresh successor after real process loss at predecessor retirement %i',
    async retirement => {
      const first = spec({
        'verify-after-base': chain('verify-after-base', {
          publicationWindowOrphans: 2,
          faultAfter: `predecessor-retirement-${retirement}`,
        }),
      });
      await expect(materializeRootRetainedBarrierFixture(first)).rejects.toThrow(/injected crash/);
      const fixture = await materializeRootRetainedBarrierFixture({
        ...first,
        chains: { 'verify-after-base': chain('verify-after-base') },
      });
      expect(fixture.journalEntries).toContainEqual(
        expect.objectContaining({
          outcome: 'recovery_reacquired',
          lease_epoch: 'cutover-recovery-4',
        })
      );
      for (const epoch of [
        'cutover',
        'cutover-recovery-1',
        'cutover-recovery-2',
        'cutover-recovery-3',
      ]) {
        expect(fixture.capabilityPaths.get(`verify-after-base:${epoch}`)).toContain('/superseded/');
      }
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
  it('rejects claim checkpoint publication when current identity swaps after claim row fsync', async () => {
    const candidate: RootRetainedBarrierFixtureSpec = {
      ...spec({ install: chain('install') }),
      checkpointPublicationRace: 'claim-current-swap',
    };
    await expect(materializeRootRetainedBarrierFixture(candidate)).rejects.toThrow(
      /checkpoint|identity/i
    );
    expect(readFileSync(join(candidate.runRoot, 'phase-checkpoint.json'))).toEqual(
      Buffer.from('{"claim-cas":"replacement"}\n')
    );
    const victim = JSON.parse(
      readFileSync(join(candidate.runRoot, 'claim-checkpoint-cas-victim.json'), 'utf8')
    ) as Record<string, unknown>;
    const pending = JSON.parse(
      readFileSync(join(candidate.runRoot, 'phase-checkpoint.json.next'), 'utf8')
    ) as Record<string, unknown>;
    expect(victim.journal_entry_hash).not.toBe(pending.journal_entry_hash);
    const audit = JSON.parse(
      readFileSync(join(candidate.runRoot, 'executor-audit.json'), 'utf8')
    ) as Record<string, unknown>;
    expect(audit.childExecutions).toBe(0);
    expect(JSON.parse(readFileSync(join(candidate.runRoot, 'effects.json'), 'utf8'))).toEqual([]);
  });

  it('rejects a foreign checkpoint .next and retains its exact bytes at its exact path', async () => {
    const candidate: RootRetainedBarrierFixtureSpec = {
      ...spec({ install: chain('install') }),
      checkpointRepairCase: 'foreign-next',
    };
    await expect(materializeRootRetainedBarrierFixture(candidate)).rejects.toThrow(/next/i);
    expect(readFileSync(join(candidate.runRoot, 'phase-checkpoint.json.next'))).toEqual(
      Buffer.from('{"foreign":"checkpoint-next"}\n')
    );
    expect(JSON.parse(readFileSync(join(candidate.runRoot, 'effects.json'), 'utf8'))).toEqual([]);
  });

  it('rejects a stale predecessor and leaves current checkpoint byte-identical', async () => {
    const candidate: RootRetainedBarrierFixtureSpec = {
      ...spec({ install: chain('install') }),
      checkpointRepairCase: 'stale-predecessor',
    };
    await expect(materializeRootRetainedBarrierFixture(candidate)).rejects.toThrow(
      /immediate predecessor/i
    );
    expect(readFileSync(join(candidate.runRoot, 'phase-checkpoint.json'))).toEqual(
      readFileSync(
        join(candidate.runRoot, 'retained-barrier-capability-checkpoint-install-cutover.json')
      )
    );
    expect(existsSync(join(candidate.runRoot, 'phase-checkpoint.json.next'))).toBe(false);
  });

  it('rejects checkpoint identity swap and leaves victim, replacement, and .next evidence', async () => {
    const candidate: RootRetainedBarrierFixtureSpec = {
      ...spec({ install: chain('install') }),
      checkpointRepairCase: 'identity-swap',
    };
    await expect(materializeRootRetainedBarrierFixture(candidate)).rejects.toThrow(/identity/i);
    expect(readFileSync(join(candidate.runRoot, 'phase-checkpoint.json'))).toEqual(
      Buffer.from('{"identity":"replacement"}\n')
    );
    const victim = JSON.parse(
      readFileSync(join(candidate.runRoot, 'checkpoint-identity-victim.json'), 'utf8')
    ) as Record<string, unknown>;
    const pending = JSON.parse(
      readFileSync(join(candidate.runRoot, 'phase-checkpoint.json.next'), 'utf8')
    ) as Record<string, unknown>;
    expect(victim.journal_entry_hash).not.toBe(pending.journal_entry_hash);
    const rows = readFileSync(join(candidate.runRoot, 'phase.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map(row => JSON.parse(row) as Record<string, unknown>);
    expect(pending.journal_entry_hash).toBe(rows.at(-1)?.entry_hash);
  });

  it('repairs a missing current checkpoint only from the exact journal head', async () => {
    const candidate: RootRetainedBarrierFixtureSpec = {
      ...spec({ install: chain('install') }),
      checkpointRepairCase: 'missing-current',
    };
    const fixture = await materializeRootRetainedBarrierFixture(candidate);
    const checkpoint = JSON.parse(readFileSync(fixture.fixedCheckpointPath, 'utf8')) as Record<
      string,
      unknown
    >;
    expect(checkpoint.journal_entry_hash).toBe(fixture.journalEntries.at(-1)?.entry_hash);
    expect(
      JSON.parse(readFileSync(join(candidate.runRoot, 'executor-audit.json'), 'utf8'))
    ).toMatchObject({
      checkpointRepairCase: 'missing-current',
      checkpointRepairPerformed: true,
      childExecutions: 1,
    });
    expect(existsSync(`${fixture.fixedCheckpointPath}.next`)).toBe(false);
  });

  it.each(['selector', 'copy', 'published', 'issued', 'claim-moved', 'claimed'] as const)(
    'restarts the same root after durable %s without duplicate rows or child replay',
    async stopAfter => {
      const candidate: RootRetainedBarrierFixtureSpec = {
        ...spec({
          install: chain('install', {
            stopAfter,
            installTransaction: 'not-committed',
          }),
        }),
        resumeAfterStop: true,
      };
      const fixture = await materializeRootRetainedBarrierFixture(candidate);
      expect(fixture.journalEntries.at(-1)?.outcome).toBe('completed');
      expect(fixture.journalEntries.map(row => row.seq)).toEqual(
        fixture.journalEntries.map((_, index) => index + 1)
      );
      expect(new Set(fixture.journalEntries.map(row => row.entry_hash)).size).toBe(
        fixture.journalEntries.length
      );
      const audit = JSON.parse(
        readFileSync(join(candidate.runRoot, 'executor-audit.json'), 'utf8')
      ) as { childExecutions: number; durableReloads: number; attemptedEffects: string[] };
      expect(audit.childExecutions).toBe(1);
      expect(audit.durableReloads).toBeGreaterThan(0);
      expect(audit.attemptedEffects).toEqual([]);
    }
  );

  it.each([
    'selector-row',
    'issuance-row',
    'claim-row',
    'result-publication',
    'completion-move',
    'completed-row',
    'completed-checkpoint',
  ] as const)('repairs and continues exact crash boundary %s on the same root', async boundary => {
    const candidate: RootRetainedBarrierFixtureSpec = {
      ...spec({ install: chain('install') }),
      restartBoundary: boundary,
    };
    const fixture = await materializeRootRetainedBarrierFixture(candidate);
    expect(fixture.journalEntries.at(-1)?.outcome).toBe('completed');
    expect(fixture.journalEntries.map(row => row.seq)).toEqual(
      fixture.journalEntries.map((_, index) => index + 1)
    );
    for (let index = 1; index < fixture.journalEntries.length; index += 1) {
      expect(fixture.journalEntries[index].previous_hash).toBe(
        fixture.journalEntries[index - 1].entry_hash
      );
    }
    const audit = JSON.parse(
      readFileSync(join(candidate.runRoot, 'executor-audit.json'), 'utf8')
    ) as {
      childExecutions: number;
      injectedBoundaryObserved: string | null;
      attemptedEffects: string[];
    };
    expect(audit.injectedBoundaryObserved).toBe(boundary);
    expect(audit.childExecutions).toBe(1);
    expect(audit.attemptedEffects).toEqual([]);
  });

  it('infers a durable recovery-5 tip when resumed with production-shaped zero dimensions', async () => {
    const candidate: RootRetainedBarrierFixtureSpec = {
      ...spec({
        'verify-after-observability': chain('verify-after-observability', {
          recoveryReissues: 2,
          publicationWindowOrphans: 2,
          faultAfter: 'predecessor-retirement-3',
        }),
      }),
      resumeAfterFault: true,
    };
    const fixture = await materializeRootRetainedBarrierFixture(candidate);
    expect(fixture.journalEntries).toContainEqual(
      expect.objectContaining({ outcome: 'recovery_reacquired', lease_epoch: 'cutover-recovery-5' })
    );
    expect(fixture.capabilityPaths.get('verify-after-observability:cutover-recovery-5')).toContain(
      '/completed/'
    );
    expect(
      JSON.parse(readFileSync(join(candidate.runRoot, 'executor-audit.json'), 'utf8'))
    ).toMatchObject({ resumedWithProductionShape: true, childExecutions: 1 });
  });

  it.each([
    ['initial', 0],
    ['recovery', 1],
  ] as const)(
    'finishes an exact durable %s result after restart without child replay',
    async (_execution, recoveryReissues) => {
      const candidate: RootRetainedBarrierFixtureSpec = {
        ...spec({
          'prepare-recovery': chain('prepare-recovery', { recoveryReissues }),
        }),
        restartBoundary: 'result-publication',
      };
      const fixture = await materializeRootRetainedBarrierFixture(candidate);
      expect(
        fixture.journalEntries.filter(row => row.outcome === 'capability_claimed')
      ).toHaveLength(1);
      expect(fixture.journalEntries.filter(row => row.outcome === 'completed')).toHaveLength(1);
      expect(
        JSON.parse(readFileSync(join(candidate.runRoot, 'executor-audit.json'), 'utf8'))
      ).toMatchObject({ childExecutions: 1, attemptedEffects: [] });
    }
  );

  it.each([
    'wrong-command',
    'wrong-capability',
    'wrong-status',
    'extra-key',
    'invalid-result-hash',
    'wrong-epoch',
  ] as const)(
    'rejects an existing result with %s before replay or completion',
    async resultMutation => {
      const candidate: RootRetainedBarrierFixtureSpec = {
        ...spec({ install: chain('install') }),
        restartBoundary: 'result-publication',
        resultMutation,
      };
      await expect(materializeRootRetainedBarrierFixture(candidate)).rejects.toThrow(/result/i);
      const audit = JSON.parse(
        readFileSync(join(candidate.runRoot, 'executor-audit.json'), 'utf8')
      ) as Record<string, unknown>;
      expect(audit.childExecutions).toBe(1);
      expect(
        readFileSync(join(candidate.runRoot, 'phase.jsonl'), 'utf8').includes(
          '"outcome":"completed"'
        )
      ).toBe(false);
      expect(
        readdirSync(join(candidate.runRoot, 'capabilities', 'claimed')).some(name =>
          name.startsWith('barrier.install--')
        )
      ).toBe(true);
    }
  );

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
      expect(superseded.length).toBe(orphans > 0 ? 1 + reissues + orphans : reissues);
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

  it.each([
    'copy-temp-fsync',
    'copy-rename',
    'successor-publication',
    'predecessor-retirement-1',
    'predecessor-retirement-2',
    'predecessor-retirement-3',
  ] as const)('continues the same durable root after crash boundary %s', async faultAfter => {
    const candidate: RootRetainedBarrierFixtureSpec = {
      ...spec({
        'verify-after-observability': chain('verify-after-observability', {
          recoveryReissues: 2,
          publicationWindowOrphans: 2,
          faultAfter,
        }),
      }),
      resumeAfterFault: true,
    };
    const fixture = await materializeRootRetainedBarrierFixture(candidate);
    expect(fixture.journalEntries.at(-1)).toMatchObject({
      command_id: 'barrier.verify-after-observability',
      outcome: 'completed',
    });
    expect(fixture.journalEntries.map(row => row.seq)).toEqual(
      fixture.journalEntries.map((_, index) => index + 1)
    );
    expect(fixture.journalEntries[0].previous_hash).toBe('0'.repeat(64));
    for (let index = 1; index < fixture.journalEntries.length; index += 1) {
      expect(fixture.journalEntries[index].previous_hash).toBe(
        fixture.journalEntries[index - 1].entry_hash
      );
    }
    const audit = JSON.parse(
      readFileSync(join(candidate.runRoot, 'executor-audit.json'), 'utf8')
    ) as { childExecutions: number; durableReloads: number; attemptedEffects: string[] };
    expect(audit.childExecutions).toBe(1);
    expect(audit.durableReloads).toBeGreaterThan(0);
    expect(audit.attemptedEffects).toEqual([]);
  });

  it('retains an exact .publishing file as incident after actual lease loss', async () => {
    const candidate: RootRetainedBarrierFixtureSpec = {
      ...spec({
        'verify-after-observability': chain('verify-after-observability', {
          faultAfter: 'copy-temp-fsync',
        }),
      }),
      resumeAfterFault: true,
      simulateLeaseLoss: true,
    };
    await expect(materializeRootRetainedBarrierFixture(candidate)).rejects.toThrow(
      /publishing.*lease loss|lease loss.*publishing/i
    );
    const leftovers = readdirSync(candidate.runRoot).filter(path => path.endsWith('.publishing'));
    expect(leftovers).toHaveLength(1);
  });

  it('retains matching final plus .publishing evidence after lease loss', async () => {
    const candidate = spec({ install: chain('install') });
    const fixture = await materializeRootRetainedBarrierFixture(candidate);
    const retained = fixture.retainedCopyPaths.get('install:cutover')!;
    const temporary = `${retained}.publishing`;
    writeFileSync(temporary, readFileSync(retained), { mode: 0o600, flag: 'wx' });
    await expect(materializeRootRetainedBarrierFixture(candidate)).rejects.toThrow(/lease loss/i);
    expect(readFileSync(temporary)).toEqual(readFileSync(retained));
  });
});

describe('Install transaction boundary', () => {
  it('binds baseline to the actual claim projection without rewinding the fixed checkpoint', async () => {
    const candidate = spec({ install: chain('install') });
    const fixture = await materializeRootRetainedBarrierFixture(candidate);
    const fixed = JSON.parse(readFileSync(fixture.fixedCheckpointPath, 'utf8')) as Record<
      string,
      unknown
    >;
    const claim = fixture.journalEntries.find(row => row.outcome === 'capability_claimed')!;
    const baseline = JSON.parse(
      readFileSync(join(candidate.runRoot, 'database-barrier-baseline.json'), 'utf8')
    ) as Record<string, unknown>;
    const claimProjection = {
      accepted_object_kind: claim.accepted_object_kind,
      accepted_object_sha256: claim.accepted_object_sha256,
      journal_device: fixed.journal_device,
      journal_entry_hash: claim.entry_hash,
      journal_inode: fixed.journal_inode,
      lease_epoch: claim.lease_epoch,
      phase: claim.phase,
      previous_journal_entry_hash: claim.previous_hash,
      resume_authority_sha256: null,
      run_id: claim.run_id,
      schema_version: 'megacampus.q12.cutover-checkpoint/v1',
      seq: claim.seq,
    };
    expect(fixed.journal_entry_hash).toBe(fixture.journalEntries.at(-1)?.entry_hash);
    expect(baseline.predecessor_journal_entry_hash).toBe(claim.entry_hash);
    expect(baseline.predecessor_checkpoint_sha256).toBe(
      sha(Buffer.from(`${canonical(claimProjection)}\n`))
    );
    expect(baseline.predecessor_checkpoint_sha256).not.toBe(
      sha(readFileSync(fixture.fixedCheckpointPath))
    );
  });

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

  it.each([
    [2, 0, ['cutover-recovery-1', 'cutover-recovery-2'], []],
    [0, 2, ['cutover-recovery-3'], ['cutover-recovery-1', 'cutover-recovery-2']],
    [
      1,
      2,
      ['cutover-recovery-1', 'cutover-recovery-4'],
      ['cutover-recovery-2', 'cutover-recovery-3'],
    ],
  ] as const)(
    'separates %i recovery reissues from %i journal-less orphan epochs',
    async (reissues, orphans, recoveryEpochs, orphanEpochs) => {
      const fixture = await materializeRootRetainedBarrierFixture(
        spec({
          'verify-after-base': chain('verify-after-base', {
            recoveryReissues: reissues,
            publicationWindowOrphans: orphans,
          }),
        })
      );
      const capabilities = [...fixture.capabilityPaths.entries()]
        .filter(([key]) => key.startsWith('verify-after-base:'))
        .sort(([left], [right]) => left.localeCompare(right));
      const byEpoch = new Map(
        capabilities.map(([key, path]) => {
          const capability = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
          return [key.split(':')[1], { path, capability, digest: sha(readFileSync(path)) }];
        })
      );
      const orderedEpochs = [
        'cutover',
        ...Array.from(
          { length: reissues + orphans + (orphans > 0 ? 1 : 0) },
          (_, index) => `cutover-recovery-${index + 1}`
        ),
      ];
      expect(
        [...byEpoch.keys()].sort(
          (left, right) => orderedEpochs.indexOf(left) - orderedEpochs.indexOf(right)
        )
      ).toEqual(orderedEpochs);
      for (let index = 1; index < orderedEpochs.length; index += 1) {
        expect(byEpoch.get(orderedEpochs[index])?.capability.supersedes_capability_sha256).toBe(
          byEpoch.get(orderedEpochs[index - 1])?.digest
        );
      }
      const recoveryRows = fixture.journalEntries.filter(
        row => row.outcome === 'recovery_reacquired'
      );
      expect(recoveryRows.map(row => row.lease_epoch)).toEqual(recoveryEpochs);
      for (const epoch of orphanEpochs) {
        const digest = byEpoch.get(epoch)!.digest;
        expect(fixture.journalEntries.some(row => row.capability_manifest_sha256 === digest)).toBe(
          false
        );
      }
      expect(byEpoch.get(orderedEpochs.at(-1)!)?.path).toContain('/completed/');
      for (const epoch of orderedEpochs.slice(0, -1)) {
        expect(byEpoch.get(epoch)?.path).toContain('/superseded/');
      }
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
    const byCapabilityName = (left: string, right: string) => left.localeCompare(right);
    expect([...keys].sort(byCapabilityName)).toEqual([...expected].sort(byCapabilityName));
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
    expect(r.lease_epoch).toBe('cutover-recovery-2');
    const tip = String(r.capability_manifest_sha256);
    expect(fixture.journalEntries.filter(row => row.capability_manifest_sha256 === tip)).toEqual([
      r,
    ]);
    const later = fixture.journalEntries.slice(fixture.journalEntries.indexOf(r) + 1);
    expect(later.every(row => row.capability_manifest_sha256 !== tip)).toBe(true);
    const fixed = JSON.parse(readFileSync(fixture.fixedCheckpointPath, 'utf8')) as Record<
      string,
      unknown
    >;
    const rCheckpoint = {
      schema_version: 'megacampus.q12.cutover-checkpoint/v1',
      run_id: r.run_id,
      seq: r.seq,
      phase: r.phase,
      journal_entry_hash: r.entry_hash,
      previous_journal_entry_hash: r.previous_hash,
      journal_device: fixed.journal_device,
      journal_inode: fixed.journal_inode,
      accepted_object_kind: r.accepted_object_kind,
      accepted_object_sha256: r.accepted_object_sha256,
      resume_authority_sha256: null,
      lease_epoch: r.lease_epoch,
    };
    const manifestName = readdirSync(candidate.runRoot).find(name =>
      name.startsWith('final-writer-manifest-')
    )!;
    const finalWriterManifest = JSON.parse(
      readFileSync(join(candidate.runRoot, manifestName), 'utf8')
    ) as Record<string, unknown>;
    expect(finalWriterManifest.input_checkpoint_sha256).toBe(
      sha(Buffer.from(`${canonical(rCheckpoint)}\n`))
    );
    const intent = later.find(row => row.outcome === 'intent')!;
    expect(intent.previous_hash).toBe(r.entry_hash);
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
  it.each([
    'unknown-phase',
    'unknown-outcome',
    'wrong-command',
    'invalid-epoch',
    'accepted-pairing',
    'hash-field-type',
  ] as const)(
    'rejects self-consistent durable journal grammar mutation %s',
    async journalMutation => {
      const candidate: RootRetainedBarrierFixtureSpec = {
        ...spec({ install: chain('install') }),
        journalMutation,
      };
      await expect(materializeRootRetainedBarrierFixture(candidate)).rejects.toThrow(
        /journal|phase|outcome|command|epoch|accepted|hash/i
      );
      expect(
        JSON.parse(readFileSync(join(candidate.runRoot, 'executor-audit.json'), 'utf8'))
      ).toMatchObject({ childExecutions: 1, attemptedEffects: [] });
    }
  );

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

describe('Retained publication identity is fail-closed on durable reload', () => {
  it.each([
    [
      'symlink',
      (path: string, checkpoint: string) => {
        rmSync(path);
        symlinkSync(checkpoint, path);
      },
    ],
    [
      'nonregular',
      (path: string) => {
        rmSync(path);
        mkdirSync(path, { mode: 0o600 });
      },
    ],
    ['wrong-mode', (path: string) => chmodSync(path, 0o640)],
    [
      'hard-link',
      (path: string) => {
        linkSync(path, `${path}.foreign-link`);
      },
    ],
    [
      'source-same-inode',
      (path: string, checkpoint: string) => {
        rmSync(path);
        linkSync(checkpoint, path);
      },
    ],
    [
      'byte-drift',
      (path: string) => {
        const original = readFileSync(path);
        writeFileSync(path, Buffer.concat([original, Buffer.from('foreign')]), { mode: 0o600 });
      },
    ],
  ] as const)('rejects %s without deleting the foreign evidence', async (_kind, corrupt) => {
    const candidate = spec({ install: chain('install') });
    const fixture = await materializeRootRetainedBarrierFixture(candidate);
    const retained = fixture.retainedCopyPaths.get('install:cutover')!;
    corrupt(retained, fixture.fixedCheckpointPath);
    await expect(materializeRootRetainedBarrierFixture(candidate)).rejects.toThrow();
    expect(() => lstatSync(retained)).not.toThrow();
  });

  it('rejects a retained file viewed with the wrong owner without mutating it', async () => {
    const candidate = spec({ install: chain('install') });
    const fixture = await materializeRootRetainedBarrierFixture(candidate);
    const retained = fixture.retainedCopyPaths.get('install:cutover')!;
    const core = join(repoRoot, 'deploy/qdrant/q12-lifecycle-core.py');
    const probe = [
      'import importlib.util, pathlib, sys',
      's=importlib.util.spec_from_file_location("q12_identity_probe", sys.argv[1])',
      'm=importlib.util.module_from_spec(s); sys.modules[s.name]=m; s.loader.exec_module(m)',
      'm.validate_regular_file(pathlib.Path(sys.argv[2]), mode=0o600)',
    ].join(';');
    const child = spawnSync(
      '/usr/bin/bwrap',
      [
        '--unshare-user',
        '--uid',
        '0',
        '--gid',
        '0',
        '--ro-bind',
        '/',
        '/',
        '--',
        '/usr/bin/python3',
        '-c',
        probe,
        core,
        retained,
      ],
      { encoding: 'utf8', env: { PATH: '/usr/bin:/bin', LC_ALL: 'C', LANG: 'C' } }
    );
    expect(child.status).not.toBe(0);
    expect(child.stderr).toContain('unsafe file identity');
    expect(() => lstatSync(retained)).not.toThrow();
  });

  it.each([
    'release_sha',
    'operator_digest',
    'quiesce_manifest_sha256',
    'supersedes_capability_sha256',
  ])('rejects completed capability stable-binding drift in %s', async field => {
    const candidate = spec({ install: chain('install') });
    const fixture = await materializeRootRetainedBarrierFixture(candidate);
    const capabilityPath = fixture.capabilityPaths.get('install:cutover')!;
    const capability = JSON.parse(readFileSync(capabilityPath, 'utf8')) as Record<string, unknown>;
    capability[field] = 'f'.repeat(64);
    chmodSync(capabilityPath, 0o600);
    writeFileSync(capabilityPath, `${canonical(capability)}\n`, { mode: 0o600 });
    chmodSync(capabilityPath, 0o400);
    await expect(materializeRootRetainedBarrierFixture(candidate)).rejects.toThrow();
    expect(() => lstatSync(capabilityPath)).not.toThrow();
  });
});
