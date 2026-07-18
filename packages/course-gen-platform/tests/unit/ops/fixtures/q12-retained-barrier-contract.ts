import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  lstatSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
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
  /** Existing immutable W-owned bytes. The runner derives the digest; callers cannot supply it. */
  existingQuiesceManifestPath?: string;
  /** Test-driver TOCTOU injection only; never forwarded into the production request. */
  quiesceManifestMutation?: 'replace-after-validation';
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

export function deriveRootRetainedBarrierFixtureRunId(runRoot: string): string {
  if (!resolve(runRoot).startsWith('/tmp/')) throw new Error('fixture runRoot must be below /tmp');
  const child = spawnSync('/usr/bin/python3', [RUNNER, '--derive-run-id'], {
    input: JSON.stringify({ runRoot }),
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin', LC_ALL: 'C', LANG: 'C' },
  });
  if (child.status !== 0) {
    throw new Error(
      `retained barrier run-id derivation failed (${child.status}): ${child.stderr.trim()}`
    );
  }
  const output = JSON.parse(child.stdout) as { runId: string };
  return output.runId;
}

function hasLaterFourWork(spec: RootRetainedBarrierFixtureSpec): boolean {
  return (
    Object.keys(spec.chains).some(operation => operation !== 'install') ||
    (spec.abandonedFrontier !== undefined && spec.abandonedFrontier.operation !== 'install')
  );
}

function validateSpec(spec: RootRetainedBarrierFixtureSpec): void {
  if (!resolve(spec.runRoot).startsWith('/tmp/'))
    throw new Error('fixture runRoot must be below /tmp');
  const raw = spec as RootRetainedBarrierFixtureSpec & Record<string, unknown>;
  if ('quiesceManifestSha256' in raw || 'quiesce_manifest_sha256' in raw) {
    throw new Error('caller quiesce digest override is forbidden');
  }
  const hasLaterFour = hasLaterFourWork(spec);
  if (hasLaterFour && !spec.existingQuiesceManifestPath) {
    throw new Error('existing quiesce manifest byte preimage is required for later-four fixtures');
  }
  if (!hasLaterFour && spec.existingQuiesceManifestPath) {
    throw new Error('install-only fixture cannot accept a quiesce manifest preimage');
  }
  if (spec.quiesceManifestMutation && !spec.existingQuiesceManifestPath) {
    throw new Error('quiesce manifest mutation requires an existing preimage');
  }
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

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
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

export async function materializeFreshProcessRecoveryCheckpointPair(
  candidateSpec: RootRetainedBarrierFixtureSpec
): Promise<{
  predecessor: Record<string, unknown>;
  issuanceEntryHash: unknown;
  predecessorCheckpoint: Uint8Array;
  recoveryCopy: Uint8Array;
}> {
  const issuedSpec = structuredClone(candidateSpec);
  for (const chain of Object.values(issuedSpec.chains)) {
    if (!chain) continue;
    chain.stopAfter = 'issued';
    if (chain.operation === 'install') chain.installTransaction = 'not-committed';
  }
  const issued = await materializeRootRetainedBarrierFixture(issuedSpec);
  const predecessorCheckpoint = readFileSync(issued.fixedCheckpointPath);
  const recovered = await materializeRootRetainedBarrierFixture(candidateSpec);
  const recoveryPath = recovered.retainedCopyPaths.get('install:cutover-recovery-1');
  if (!recoveryPath) throw new Error('fresh-process recovery copy was not materialized');
  return {
    predecessor: JSON.parse(predecessorCheckpoint.toString()) as Record<string, unknown>,
    issuanceEntryHash: issued.journalEntries.find(row => row.outcome === 'capability_issued')
      ?.entry_hash,
    predecessorCheckpoint,
    recoveryCopy: readFileSync(recoveryPath),
  };
}

export async function materializeTerminalClaimAfterCompletionForNegativeTest(
  spec: RootRetainedBarrierFixtureSpec
): Promise<string[]> {
  const result = await materializeRootRetainedBarrierFixture(spec);
  rehashJournalAndCheckpointsAfterMutation(result, state => {
    const claimIndex = state.journalEntries.findIndex(row => row.outcome === 'capability_claimed');
    const [claim] = state.journalEntries.splice(claimIndex, 1);
    const completionIndex = state.journalEntries.findIndex(row => row.outcome === 'completed');
    state.journalEntries.splice(completionIndex + 1, 0, claim);
    state.journalEntries.forEach((row, index) => {
      row.seq = index + 1;
    });
  });
  const rows = readFileSync(join(dirname(result.fixedCheckpointPath), 'phase.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map(line => JSON.parse(line) as Record<string, unknown>);
  const claim = rows.at(-1)!;
  const checkpoint = JSON.parse(readFileSync(result.fixedCheckpointPath, 'utf8')) as Record<
    string,
    unknown
  >;
  Object.assign(checkpoint, {
    seq: claim.seq,
    phase: claim.phase,
    journal_entry_hash: claim.entry_hash,
    previous_journal_entry_hash: claim.previous_hash,
    accepted_object_kind: claim.accepted_object_kind,
    accepted_object_sha256: claim.accepted_object_sha256,
    lease_epoch: claim.lease_epoch,
  });
  writeFileSync(result.fixedCheckpointPath, `${canonical(checkpoint)}\n`, { mode: 0o600 });
  return rows.slice(-2).map(row => String(row.outcome));
}

export async function materializeIssuedRecoveryPredecessorForNegativeTest(
  spec: RootRetainedBarrierFixtureSpec
): Promise<string> {
  const recoverySpec = structuredClone(spec);
  for (const chain of Object.values(recoverySpec.chains)) {
    if (chain) chain.recoveryReissues = 1;
  }
  const result = await materializeRootRetainedBarrierFixture(recoverySpec);
  const source = result.capabilityPaths.get('install:cutover');
  if (!source?.includes('/superseded/')) throw new Error('capability is not superseded');
  renameSync(source, source.replace('/superseded/', '/issued/'));
  return 'issued';
}

export const r3NegativeMutationFixture = {
  claimAfterCompletion: materializeTerminalClaimAfterCompletionForNegativeTest,
  issuedPredecessor: materializeIssuedRecoveryPredecessorForNegativeTest,
} as const;

export interface JoinedRetainedBarrierFixtureSpec {
  runRoot: string;
  joinedProfile: 'forward' | 'rollback';
  /** rollback only */
  completedPrefixLength?: 1 | 2 | 3 | 4;
  /** rollback only; must be the exact next operation for the reached prefix */
  frontier?: RetainedFrontierSpec;
  /** mandatory for every joined profile, including clean rollback prefix 1 */
  quiesceManifestPath: string;
  /** approved D5 per-chain scenario dimensions, unchanged semantics */
  chains?: Readonly<Partial<Record<RetainedBarrierOperation, RetainedChainSpec>>>;
  /**
   * Amendment section 6 item 4: the sanctioned partial-durable-capture
   * crash-state profile. Rollback prefix 4 without a frontier only; the
   * rollback manifest holds exactly this creation-order target prefix
   * (5 = full durable capture without a forward manifest or commit).
   */
  partialCaptureTargets?: 1 | 2 | 3 | 4 | 5;
}

export interface JoinedRetainedBarrierFixtureResult extends RootRetainedBarrierFixtureResult {
  ordinaryHeadEntryHashes: ReadonlyMap<string, string>;
  forwardFinalWriterManifestPath: string | null;
  rollbackFinalWriterManifestPath: string | null;
}

export async function materializeJoinedRetainedBarrierFixture(
  spec: JoinedRetainedBarrierFixtureSpec
): Promise<JoinedRetainedBarrierFixtureResult> {
  await Promise.resolve();
  const child = spawnSync('/usr/bin/python3', [RUNNER], {
    input: JSON.stringify(spec),
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin', LC_ALL: 'C', LANG: 'C' },
    maxBuffer: 16 * 1024 * 1024,
  });
  if (child.status !== 0) {
    throw new Error(`joined fixture runner failed (${child.status}): ${child.stderr.trim()}`);
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
    ordinaryHeadEntryHashes: Record<string, string>;
    forwardFinalWriterManifestPath: string | null;
    rollbackFinalWriterManifestPath: string | null;
  };
  return {
    journalEntries: output.journalEntries,
    fixedCheckpointPath: output.fixedCheckpointPath,
    retainedCopyPaths: pairs(output.retainedCopyPaths),
    capabilityPaths: pairs(output.capabilityPaths),
    resultPaths: pairs(output.resultPaths),
    selectorEntryHashes: pairs(output.selectorEntryHashes) as Map<RetainedBarrierOperation, string>,
    completionEntryHashes: pairs(output.completionEntryHashes) as Map<
      RetainedBarrierOperation,
      string
    >,
    frontierDispositionEntryHash: output.frontierDispositionEntryHash,
    ordinaryHeadEntryHashes: new Map(Object.entries(output.ordinaryHeadEntryHashes)),
    forwardFinalWriterManifestPath: output.forwardFinalWriterManifestPath,
    rollbackFinalWriterManifestPath: output.rollbackFinalWriterManifestPath,
  };
}

export interface LiveControllerFixtureSpec {
  runRoot: string;
  /** pin the run id (e.g. the composer-derived id) for byte-parity comparison */
  runId?: string;
  /** exercise the production run-root coupling gate (Engine.__post_init__) */
  production?: boolean;
  /**
   * The W-owned quiesce manifest bytes the forward window consumes. The parity
   * proof feeds the SAME path to the composer and the controller so the
   * <quiesce-manifest> substitution (and every command_sha256 that carries it)
   * is identical across the two journals; the controller reads it read-only.
   */
  quiesceManifestPath?: string;
  /**
   * R4 Sub-round B: drive run_live's in-process barrier chain (barrier.install, ...) through
   * the REAL deployed q12-capability-run.sh wrapper in a bwrap sandbox (only the DB-barrier
   * child is sandbox-faked; the wrapper itself runs unmodified). Additive: without this flag
   * run_live keeps Sub-round A's plain LiveOrdinaryExecutor. The executor audit
   * (executor-audit.json in runRoot) reports `actualDeployedWrapper` when this is set.
   */
  executeActualWrapper?: boolean;
  /**
   * R5-D / R8-I-B stop_after SEAM: an optional named checkpoint at which the forward run stops
   * cleanly and returns its (partial) output. A stopped run does NOT run post-activate. Absent =>
   * the full 81-row window + post-activate exactly as before. The checkpoints are the crash/restart
   * boundaries run_recover resumes from (§6b.2), plus the R5-C before-group-3 marker point:
   *   "writers.quiesce.pre"       -> stop after group 2 (barrier.install), BEFORE writers.quiesce
   *   "barrier.verify-after-base" -> stop after group 7's verify-after-base barrier (R8-I-B head)
   *   "deploy.prepare"            -> stop at the C7 planned-exit head (deploy.prepare/completed)
   *   "final-writer-manifest"     -> stop after the group-14 FWM accepted row (crash-after-FWM)
   *   "barrier.activate"          -> stop after group 16 (barrier.activate), BEFORE cleanup (R8-I-B)
   */
  stopAfter?:
    | 'writers.quiesce.pre'
    | 'barrier.verify-after-base'
    | 'deploy.prepare'
    | 'final-writer-manifest'
    | 'barrier.activate';
  /**
   * R8-I-B: inject a crash INSIDE the journaled post-activate cleanup segment (after the
   * guard_cleanup_complete/capability_claimed row, before the barrier child ran), so a mid-cleanup
   * durable head can be constructed for the recover convergence probe. run_live rejects (the crash
   * surfaces as a throw); the partial journal is left on the run root for recover to resume.
   */
  cleanupCrashAfter?: 'capability_claimed';
}

/**
 * R5 Sub-round D RECOVER controller (run_recover) spec. Targets an EXISTING run root a prior
 * materializeLiveController({ stopAfter }) call already left a partial durable journal on; the
 * runId must be pinned to that same run's id so the rehydrated journal binds.
 */
export interface RecoverControllerFixtureSpec {
  runRoot: string;
  runId?: string;
  production?: boolean;
  quiesceManifestPath?: string;
  executeActualWrapper?: boolean;
}

/**
 * Drive the Task-9 live cutover controller (run_live) on a fixture root and
 * return the journal it produced plus the checkpoint-bound resource-manifest
 * artifacts it fsynced (OQ4). The controller reuses the same Engine and
 * serializer primitives as the closed composer, so its rows can be compared
 * against materializeJoinedRetainedBarrierFixture's on every shared binding.
 */
export async function materializeLiveController(spec: LiveControllerFixtureSpec): Promise<{
  journalEntries: Record<string, unknown>[];
  resourceManifestPaths: Record<string, string>;
  /** R4 Sub-round A: run_live's per-ordinary-lifecycle side result file paths, keyed like
   *  Engine.results (e.g. "ordinary:<command_id>:cutover"). */
  resultPaths: Record<string, string>;
  /** R4 Sub-round A: the run_live executor's real-child execution count (executor-audit.json
   *  childExecutions), surfaced directly on the output for convenience. */
  childExecutions: number;
  /** R5 Sub-round A: run_live's forward final-writer manifest (FWM) artifact path, mirroring
   *  the composer's forwardFinalWriterManifestPath output augmentation. */
  forwardFinalWriterManifestPath: string | null;
  /** R5 Sub-round C: run_live's caller-declared cutover-window marker path
   *  (<run-root>/quiesce-window-mode.json), the out-of-band signal the W-side
   *  q12-writer-resume.py window_is_cutover() consumes. Never a journal row (parity-neutral). */
  quiesceWindowMarkerPath: string | null;
  /** R5 Sub-round E (RULING 1 — post-activate cleanup is RECEIPT-ONLY): the post-activate
   *  cleanup + forward-resume outcomes run_live RECORDS after activate (after the 76th journal
   *  row). The frozen §5 chronology ends at activate and the journal grammar has no cleanup
   *  command_id, so this is NOT a journal row — it is operator-visible truth carried on the
   *  result. `cleanup` carries the v2 `guard_cleanup_complete` database-barrier receipt (+ its
   *  sha256 and the probe receipt digest); `resume` carries the forward writer-resume child's
   *  fail-closed validation outcome. null when the executor exposes no post-activate seam. */
  postActivate: { cleanup: Record<string, unknown>; resume: Record<string, unknown> } | null;
}> {
  await Promise.resolve();
  const child = spawnSync('/usr/bin/python3', [RUNNER], {
    input: JSON.stringify({ liveController: true, ...spec }),
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin', LC_ALL: 'C', LANG: 'C' },
    maxBuffer: 16 * 1024 * 1024,
  });
  if (child.status !== 0) {
    throw new Error(`live controller runner failed (${child.status}): ${child.stderr.trim()}`);
  }
  const output = JSON.parse(child.stdout) as {
    journalEntries: Record<string, unknown>[];
    resourceManifestPaths?: Record<string, string>;
    resultPaths?: [string, string][];
    childExecutions?: number;
    forwardFinalWriterManifestPath?: string | null;
    quiesceWindowMarkerPath?: string | null;
    postActivate?: { cleanup: Record<string, unknown>; resume: Record<string, unknown> } | null;
  };
  return {
    journalEntries: output.journalEntries,
    resourceManifestPaths: output.resourceManifestPaths ?? {},
    resultPaths: Object.fromEntries(output.resultPaths ?? []),
    childExecutions: output.childExecutions ?? 0,
    forwardFinalWriterManifestPath: output.forwardFinalWriterManifestPath ?? null,
    quiesceWindowMarkerPath: output.quiesceWindowMarkerPath ?? null,
    postActivate: output.postActivate ?? null,
  };
}

/**
 * R5 Sub-round D: drive the RECOVER controller (run_recover) on an EXISTING run root a prior
 * materializeLiveController({ stopAfter }) call left a partial durable journal on. Returns the
 * SAME output shape materializeLiveController does, so a recovered run can be compared row-for-row
 * against the composer's 76-row forward twin (and its postActivate asserted). run_recover fails
 * closed (a rejected child, surfaced as a throw) on any durable head it does not support.
 */
export async function materializeRecover(spec: RecoverControllerFixtureSpec): Promise<{
  journalEntries: Record<string, unknown>[];
  resourceManifestPaths: Record<string, string>;
  resultPaths: Record<string, string>;
  childExecutions: number;
  forwardFinalWriterManifestPath: string | null;
  quiesceWindowMarkerPath: string | null;
  postActivate: { cleanup: Record<string, unknown>; resume: Record<string, unknown> } | null;
}> {
  await Promise.resolve();
  const child = spawnSync('/usr/bin/python3', [RUNNER], {
    input: JSON.stringify({ recoverController: true, ...spec }),
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin', LC_ALL: 'C', LANG: 'C' },
    maxBuffer: 16 * 1024 * 1024,
  });
  if (child.status !== 0) {
    throw new Error(`recover controller runner failed (${child.status}): ${child.stderr.trim()}`);
  }
  const output = JSON.parse(child.stdout) as {
    journalEntries: Record<string, unknown>[];
    resourceManifestPaths?: Record<string, string>;
    resultPaths?: [string, string][];
    childExecutions?: number;
    forwardFinalWriterManifestPath?: string | null;
    quiesceWindowMarkerPath?: string | null;
    postActivate?: { cleanup: Record<string, unknown>; resume: Record<string, unknown> } | null;
  };
  return {
    journalEntries: output.journalEntries,
    resourceManifestPaths: output.resourceManifestPaths ?? {},
    resultPaths: Object.fromEntries(output.resultPaths ?? []),
    childExecutions: output.childExecutions ?? 0,
    forwardFinalWriterManifestPath: output.forwardFinalWriterManifestPath ?? null,
    quiesceWindowMarkerPath: output.quiesceWindowMarkerPath ?? null,
    postActivate: output.postActivate ?? null,
  };
}

/**
 * R5 Sub-round D: assert run_recover fails closed on an unsupported durable head. Returns the
 * NAMED refusal message run_recover raised (fixture exit 2 => stderr), so a test can prove it
 * names the phase/outcome/command and did NOT continue.
 */
export async function runRecoverExpectingRefusal(
  spec: RecoverControllerFixtureSpec
): Promise<{ ok: boolean; error: string }> {
  await Promise.resolve();
  const child = spawnSync('/usr/bin/python3', [RUNNER], {
    input: JSON.stringify({ recoverController: true, ...spec }),
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin', LC_ALL: 'C', LANG: 'C' },
    maxBuffer: 16 * 1024 * 1024,
  });
  if (child.status === 0) return { ok: true, error: '' };
  if (child.status === 2) return { ok: false, error: child.stderr.trim() };
  throw new Error(`recover controller runner failed (${child.status}): ${child.stderr.trim()}`);
}

/**
 * R5 Sub-round A negatives: invoke the REAL production
 * Engine.publish_final_writer_manifest/derive_root_writer_inventory on a fresh fixture run
 * root through a focused seam, so the fail-closed proofs exercise the exact same production
 * code path run_live and run_joined_composer both use (not a re-implementation).
 */
export async function runFwmNegative(spec: {
  case: 'bad-mode' | 'no-targets';
  runRoot: string;
  runId: string;
  quiesceManifestPath?: string;
}): Promise<{ ok: boolean; error: string }> {
  await Promise.resolve();
  const child = spawnSync('/usr/bin/python3', [RUNNER, '--fwm-negative'], {
    input: JSON.stringify(spec),
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin', LC_ALL: 'C', LANG: 'C' },
    maxBuffer: 16 * 1024 * 1024,
  });
  if (child.status === 2) return { ok: false, error: child.stderr.trim() };
  if (child.status === 3) throw new Error('fwm negative fixture unexpectedly succeeded');
  throw new Error(`fwm negative fixture failed (${child.status}): ${child.stderr.trim()}`);
}

/**
 * Invoke the REAL production validate_stable_binding_walk against an in-memory
 * journal + request so a negative can prove an off-witness resource step is
 * rejected without having to re-chain entry hashes on disk.
 */
export async function validateStableBindingWalk(
  journal: readonly Record<string, unknown>[],
  request: Record<string, unknown>
): Promise<{ ok: boolean; error: string }> {
  await Promise.resolve();
  const child = spawnSync('/usr/bin/python3', [RUNNER, '--validate-walk'], {
    input: JSON.stringify({ journal, request }),
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin', LC_ALL: 'C', LANG: 'C' },
    maxBuffer: 16 * 1024 * 1024,
  });
  if (child.status === 0) return { ok: true, error: '' };
  return { ok: false, error: child.stderr.trim() };
}
