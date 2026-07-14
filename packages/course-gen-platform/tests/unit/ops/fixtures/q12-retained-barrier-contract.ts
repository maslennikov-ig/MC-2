import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type RetainedBarrierOperation =
  | 'install'
  | 'verify-after-base'
  | 'verify-after-observability'
  | 'prepare-recovery'
  | 'activate';

declare const leaseEpochBrand: unique symbol;
export type LeaseEpoch = string & { readonly [leaseEpochBrand]: true };
export type CompletionMode = 'normal' | 'move-no-row-continuous-lease' | 'move-no-row-reacquired';
export type FrontierForm =
  | 'selector-only'
  | 'copy-prefix'
  | 'journal-less-published'
  | 'issued'
  | 'claim-moved'
  | 'claimed-no-success';
export type FrontierCopySet = 'empty' | 'cutover' | 'recovery-1' | 'cutover+recovery-1';

export interface RetainedChainBase {
  rootEpoch: LeaseEpoch;
  cutoverCopyBeforeRecoveryRoot: 'absent' | 'present';
  recoveryReissues: 0 | 1 | 2;
  publicationWindowOrphans: 0 | 1 | 2;
  completionMode: CompletionMode;
  faultAfter:
    | 'none'
    | 'copy-temp-fsync'
    | 'copy-rename'
    | 'successor-publication'
    | `predecessor-retirement-${1 | 2 | 3}`;
}

export type InstallStopAfter =
  | 'selector'
  | 'copy'
  | 'published'
  | 'issued'
  | 'claim-moved'
  | 'claimed'
  | 'completed';

export type RetainedChainSpec =
  | (RetainedChainBase & {
      operation: 'install';
      stopAfter: InstallStopAfter;
      installTransaction:
        | 'not-committed'
        | 'committed-no-baseline-receipt'
        | 'ambiguous'
        | 'normal';
    })
  | (RetainedChainBase & {
      operation: Exclude<RetainedBarrierOperation, 'install'>;
      stopAfter: 'completed';
      installTransaction: 'not-applicable';
    });

export interface RetainedFrontierSpec {
  operation: Exclude<RetainedBarrierOperation, 'install'>;
  form: FrontierForm;
  history: 'initial' | 'multi-epoch';
  lease: 'continuous' | 'reacquired';
  copySet: FrontierCopySet;
  exactSuccessBeforeDisposition: boolean;
  activationCommitRace: 'none' | 'committed-before-r' | 'committed-after-r';
}

export interface RootRetainedBarrierFixtureSpec {
  runRoot: string;
  mode: 'forward' | 'rollback';
  completed: readonly RetainedBarrierOperation[];
  chains: Readonly<Partial<Record<RetainedBarrierOperation, RetainedChainSpec>>>;
  abandonedFrontier?: RetainedFrontierSpec;
  /** Test-driver crash injection only; never forwarded into the production request. */
  resumeAfterFault?: boolean;
  /** Ask the test driver to enter the unmodified deployed shell launcher in a sandbox. */
  executeActualWrapper?: boolean;
  /** Restart the production classifier on the same root after a materialized stop. */
  resumeAfterStop?: boolean;
  restartBoundary?:
    | 'selector-row'
    | 'issuance-row'
    | 'claim-row'
    | 'result-publication'
    | 'completion-move'
    | 'completed-row'
    | 'completed-checkpoint';
  simulateLeaseLoss?: boolean;
  leaseMutation?:
    | 'wrong-path'
    | 'wrong-inode'
    | 'wrong-mode'
    | 'unlocked'
    | 'ancestor-symlink'
    | 'wrong-fd-then-correct';
  rotationRequired?: boolean;
  reopenLeaseFdBeforeResume?: boolean;
  claimPathMutation?: 'symlink' | 'dotdot' | 'parent-symlink';
  clearJournalAppendFlag?: boolean;
  checkpointRepairCase?: 'foreign-next' | 'stale-predecessor' | 'identity-swap' | 'missing-current';
  checkpointPublicationRace?: 'claim-current-swap';
  resultMutation?:
    | 'wrong-command'
    | 'wrong-capability'
    | 'wrong-status'
    | 'extra-key'
    | 'invalid-result-hash'
    | 'wrong-epoch';
  journalMutation?:
    | 'unknown-phase'
    | 'unknown-outcome'
    | 'wrong-command'
    | 'invalid-epoch'
    | 'accepted-pairing'
    | 'hash-field-type';
}

export interface RootRetainedBarrierFixtureResult {
  journalEntries: readonly Record<string, unknown>[];
  fixedCheckpointPath: string;
  retainedCopyPaths: ReadonlyMap<string, string>;
  capabilityPaths: ReadonlyMap<string, string>;
  resultPaths: ReadonlyMap<string, string>;
  selectorEntryHashes: ReadonlyMap<RetainedBarrierOperation, string>;
  completionEntryHashes: ReadonlyMap<RetainedBarrierOperation, string>;
  frontierDispositionEntryHash: string | null;
}

export interface MutableRetainedFixtureState {
  journalEntries: Record<string, unknown>[];
  checkpointsByPath: Map<string, Uint8Array>;
  retainedCopiesByPath: Map<string, Uint8Array>;
  capabilitiesByPath: Map<string, Uint8Array>;
  resultsByPath: Map<string, Uint8Array>;
  fileIdentityByPath: Map<
    string,
    { device: bigint; inode: bigint; mode: number; uid: number; gid: number; nlink: number }
  >;
}

const REPO_ROOT = fileURLToPath(new URL('../../../../../../', import.meta.url));
const RUNNER = resolve(
  REPO_ROOT,
  'packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-runner.py'
);
const OPERATIONS: readonly RetainedBarrierOperation[] = [
  'install',
  'verify-after-base',
  'verify-after-observability',
  'prepare-recovery',
  'activate',
];
const EPOCH = /^(?:cutover|cutover-recovery-[1-9][0-9]*)$/;
const internalState = new WeakMap<RootRetainedBarrierFixtureResult, MutableRetainedFixtureState>();

export function parseLeaseEpoch(value: string): LeaseEpoch {
  if (!EPOCH.test(value)) throw new Error(`invalid lease epoch: ${JSON.stringify(value)}`);
  if (value !== 'cutover') {
    const sequence = value.slice('cutover-recovery-'.length);
    if (sequence.length > 16 || BigInt(sequence) > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(`invalid lease epoch: ${JSON.stringify(value)}`);
    }
  }
  return value as LeaseEpoch;
}

function validateSpec(spec: RootRetainedBarrierFixtureSpec): void {
  if (!resolve(spec.runRoot).startsWith('/tmp/'))
    throw new Error('fixture runRoot must be below /tmp');
  const completed = new Set(spec.completed);
  if (completed.size !== spec.completed.length)
    throw new Error('completed operations must be unique');
  for (const operation of spec.completed) {
    if (!OPERATIONS.includes(operation)) throw new Error('unknown completed operation');
  }
  for (const [recordKey, chain] of Object.entries(spec.chains)) {
    if (!chain || recordKey !== chain.operation)
      throw new Error('chain record key/operation mismatch');
    if (chain.rootEpoch !== 'cutover' && chain.rootEpoch !== 'cutover-recovery-1') {
      throw new Error('fixture rootEpoch must be cutover or cutover-recovery-1');
    }
    if (chain.operation === 'install') {
      const preCommit = ['selector', 'copy', 'published', 'issued', 'claim-moved', 'claimed'];
      const legal =
        (chain.installTransaction === 'not-committed' && preCommit.includes(chain.stopAfter)) ||
        ((chain.installTransaction === 'committed-no-baseline-receipt' ||
          chain.installTransaction === 'ambiguous') &&
          chain.stopAfter === 'claimed') ||
        (chain.installTransaction === 'normal' && chain.stopAfter === 'completed');
      if (!legal) throw new Error('illegal install transaction/stopAfter combination');
    } else if (chain.stopAfter !== 'completed' || chain.installTransaction !== 'not-applicable') {
      throw new Error('non-install chains require completed/not-applicable');
    }
  }
  if (spec.abandonedFrontier?.operation === ('install' as RetainedBarrierOperation)) {
    throw new Error('install cannot be an abandoned frontier');
  }
}

function bytesByPath(paths: readonly string[]): Map<string, Uint8Array> {
  return new Map(paths.map(path => [path, readFileSync(path)]));
}

function identityByPath(
  paths: readonly string[]
): MutableRetainedFixtureState['fileIdentityByPath'] {
  return new Map(
    paths.map(path => {
      const stat = lstatSync(path, { bigint: true });
      return [
        path,
        {
          device: stat.dev,
          inode: stat.ino,
          mode: Number(stat.mode & 0o777n),
          uid: Number(stat.uid),
          gid: Number(stat.gid),
          nlink: Number(stat.nlink),
        },
      ];
    })
  );
}

function pairs(values: readonly [string, string][]): Map<string, string> {
  return new Map(values);
}

export async function materializeRootRetainedBarrierFixture(
  spec: RootRetainedBarrierFixtureSpec
): Promise<RootRetainedBarrierFixtureResult> {
  await Promise.resolve();
  validateSpec(spec);
  const child = spawnSync('/usr/bin/python3', [RUNNER], {
    input: JSON.stringify(spec),
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin', LC_ALL: 'C', LANG: 'C' },
    maxBuffer: 16 * 1024 * 1024,
  });
  if (child.status !== 0) {
    throw new Error(`retained barrier runner failed (${child.status}): ${child.stderr.trim()}`);
  }
  const output = JSON.parse(child.stdout) as {
    journalEntries: Record<string, unknown>[];
    fixedCheckpointPath: string;
    retainedCopyPaths: [string, string][];
    capabilityPaths: [string, string][];
    resultPaths: [string, string][];
    selectorEntryHashes: [RetainedBarrierOperation, string][];
    completionEntryHashes: [RetainedBarrierOperation, string][];
    frontierDispositionEntryHash: string | null;
    checkpointPaths: string[];
  };
  const retainedCopyPaths = pairs(output.retainedCopyPaths);
  const capabilityPaths = pairs(output.capabilityPaths);
  const resultPaths = pairs(output.resultPaths);
  const allPaths = [
    ...output.checkpointPaths,
    ...retainedCopyPaths.values(),
    ...capabilityPaths.values(),
    ...resultPaths.values(),
  ];
  const result: RootRetainedBarrierFixtureResult = {
    journalEntries: output.journalEntries,
    fixedCheckpointPath: output.fixedCheckpointPath,
    retainedCopyPaths,
    capabilityPaths,
    resultPaths,
    selectorEntryHashes: pairs(output.selectorEntryHashes) as Map<RetainedBarrierOperation, string>,
    completionEntryHashes: pairs(output.completionEntryHashes) as Map<
      RetainedBarrierOperation,
      string
    >,
    frontierDispositionEntryHash: output.frontierDispositionEntryHash,
  };
  internalState.set(result, {
    journalEntries: structuredClone(output.journalEntries),
    checkpointsByPath: bytesByPath(output.checkpointPaths),
    retainedCopiesByPath: bytesByPath([...retainedCopyPaths.values()]),
    capabilitiesByPath: bytesByPath([...capabilityPaths.values()]),
    resultsByPath: bytesByPath([...resultPaths.values()]),
    fileIdentityByPath: identityByPath(allPaths),
  });
  return result;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function rehashJournalAndCheckpointsAfterMutation(
  result: RootRetainedBarrierFixtureResult,
  mutate: (state: MutableRetainedFixtureState) => void
): void {
  const state = internalState.get(result);
  if (!state) throw new Error('fixture was not materialized by the Root runner');
  mutate(state);
  let previous = '0'.repeat(64);
  for (const entry of state.journalEntries) {
    entry.previous_hash = previous;
    const preimage = { ...entry };
    delete preimage.entry_hash;
    entry.entry_hash = createHash('sha256').update(canonical(preimage)).digest('hex');
    previous = String(entry.entry_hash);
  }
  const maps = [
    state.checkpointsByPath,
    state.retainedCopiesByPath,
    state.capabilitiesByPath,
    state.resultsByPath,
  ];
  for (const map of maps) {
    for (const [path, bytes] of map) {
      const mode = state.fileIdentityByPath.get(path)?.mode ?? 0o600;
      chmodSync(path, mode | 0o200);
      writeFileSync(path, bytes, { mode });
      chmodSync(path, mode);
    }
  }
  const journalPath = join(dirname(result.fixedCheckpointPath), 'phase.jsonl');
  writeFileSync(journalPath, `${state.journalEntries.map(canonical).join('\n')}\n`, {
    mode: 0o600,
  });
  // Positive creation is impossible here: this helper only rewrites paths already emitted by Root.
  if (readdirSync(dirname(result.fixedCheckpointPath)).length === 0) {
    throw new Error('mutation helper cannot create a positive fixture');
  }
}
