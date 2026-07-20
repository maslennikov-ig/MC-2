# Q12 Retained Barrier Capability Provenance Addendum Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use
> `superpowers:subagent-driven-development` task by task. Every production
> change uses `superpowers:test-driven-development`; every acceptance claim
> uses `superpowers:verification-before-completion`. Steps use checkbox
> (`- [ ]`) syntax and must be recorded in the stage ledger/artifacts.

**Goal:** Implement the owner-approved D5 retained barrier provenance contract,
replace W's fabricated recovery root with evidence emitted by the real Root
producer, and then resume the accepted W -> M/H -> Root local Q12 dependency
graph without performing any remote/live action.

**Architecture:** Root remains the sole durable lifecycle writer. For each of
the five retained barrier commands it publishes one immutable byte-exact copy
of the selected launcher checkpoint before capability issuance; the generic
launcher alone performs the delegated claim move and claim journal projection.
W is read-only and reconstructs the complete selector/copy/capability/journal/
result chain before any Docker, database, writer, or resume mutation. A
Root-owned test driver runs the real producer against an isolated local run
root; both Root and W consume its positive fixtures, so W cannot bless evidence
the joined Root implementation cannot publish.

**Tech stack:** Bash, Python 3, TypeScript/Vitest, PostgreSQL 17, canonical
UTF-8 JSON/JSONL, `renameat2(RENAME_NOREPLACE)`, fsync, SHA-256.

**Normative D5 design:**
`docs/superpowers/specs/2026-07-14-q12-retained-barrier-capability-provenance-addendum-design.md`,
owner-approved SHA-256
`b5f63cd6afd64f47822e9534f8193ecb57f471421c9cf8a8f05e7902d85540e8`.

**Inherited authority:**

- base design SHA-256
  `5d575bf8424dbd9b94eb79bc5e477c3152327b70593dae811c876c3c222d5c15`;
- lifecycle addendum SHA-256
  `7188d792af79ec881c16ef0729394e5c1f5c2c67aa6d59b86bec1bdf91308b27`;
- D4 addendum SHA-256
  `28655ffe401efe39b09ba436d101aeed055c8fe25cb8a8e4fd3e90720e745ab4`;
- base correction plan SHA-256
  `af05edf1d29fd87d839d6f9c198dbc5824e19354a9762b3e95a9daf309aa4895`;
- lifecycle plan
  `docs/superpowers/plans/2026-07-13-q12-recoverable-lifecycle-addendum.md`,
  SHA-256
  `316c8b20812ae23f2c367282b742d25277acff3557fe38a7515d843360d719db`;
- current D4 plan
  `docs/superpowers/plans/2026-07-14-q12-durable-recovery-projections-addendum.md`,
  SHA-256
  `e891a65745210248bf04b325cc7ef7bd1dba562ea5ac40c6b63aa88a6abcd97c`.

D5 supersedes only the retained-barrier provenance rules enumerated in its
approved design and the narrow producer-before-validator ordering in this
plan. Every other lifecycle/D4 task, interface, test, and gate remains binding.
Any predecessor path or SHA drift is a stop condition before dispatch.

## Global Constraints

- No GHCR publication, SSH, deploy, hosted Supabase/Qdrant mutation, live
  reindex, service/secret/schema/writer/scheduler change, staging, production,
  password rotation, or notification is authorized by this plan.
- Qdrant Cloud remains prohibited. External S3 remains deferred; staging
  recovery uses the approved persistent local-disk snapshot/restore contract.
- Preserve unrelated `.claude/settings.json` changes and every user-owned dirty
  worktree. Never discard or rewrite the existing W history.
- Preserve exact Qdrant `1.18.2`, RU/EN BM25/RRF/Formula relevance, strict mode,
  restore/resume, document coverage, tenant/course isolation, and no-document
  compatibility tests.
- Root is the sole retained-copy, selector, issuance, recovery, completion,
  disposition, retirement, and phase authority. The generic launcher is the
  sole delegated writer only for issued-to-claimed move plus
  `capability_claimed` row/checkpoint. W never writes or repairs D5 state.
- One immutable retained copy exists per retained command execution epoch at
  `retained-barrier-capability-checkpoint-<operation>-<lease-epoch>.json`.
  It is regular, non-symlink, `0600`, owner `1000:1000`, `st_nlink=1`, a
  distinct inode from its source, byte-identical including final-byte state,
  and its complete-byte SHA-256 is used by both capability and launcher
  `--checkpoint`.
- Publication uses exclusive `.publishing`, `O_EXCL|O_NOFOLLOW`, file fsync,
  no-replace rename, directory fsync, then reopen/revalidate. D5 never invents,
  normalizes, or reconstructs missing historical copy bytes.
- Preserve the inherited exact 12-key capability, 19-key journal, and 12-key
  checkpoint schemas. Preserve exact command IDs, literal argv, command SHA,
  context, quiesce, direct supersession, consecutive recovery epochs, and
  no-replay semantics.
- The four normalized initial intent selectors and existing
  `activation_committing/intent` selector are exact. There is no
  `activated/intent`. Activation tests preserve the temporal `H checkpoint + I
journal head` CAS before the `I` checkpoint.
- A rollback frontier is legal only after accepted install plus durable writer
  quiesce and only for the exact next command. `barrier.install` cannot be
  abandoned. `barrier.activate` may be the sole abandoned pre-COMMIT frontier
  but cannot be a completed rollback member. Activated truth forces
  finish-forward; activation-after-`R` is an incident.
- Root and W positive fixtures must be emitted by the same Root-owned driver
  over the real production scripts. Hand-built positive journal rows or
  arbitrary checkpoint hashes are forbidden. Negative fixtures may mutate one
  invariant and recompute local hashes to prove fail-closed validation.
- Every file-changing stream uses an isolated `codex/` branch/worktree, commits
  and pushes only its write zone, receives independent spec-compliance and code-
  quality review, and is inspected/rerun before integration.

## Fixed command table and launcher interface

| Command ID                           | Operation                    | Selector target                   | H predecessor            | Quiesce       |
| ------------------------------------ | ---------------------------- | --------------------------------- | ------------------------ | ------------- |
| `barrier.install`                    | `install`                    | `maintenance_guarded`             | `preflight`              | 64 zeroes     |
| `barrier.verify-after-base`          | `verify-after-base`          | `base_migration_guarded`          | `restore_verified`       | accepted hash |
| `barrier.verify-after-observability` | `verify-after-observability` | `observability_migration_guarded` | `base_migration_guarded` | accepted hash |
| `barrier.prepare-recovery`           | `prepare-recovery`           | `recovery_ready_guarded`          | `migrations_applied`     | accepted hash |
| `barrier.activate`                   | `activate`                   | `activated`                       | `activation_ready`       | accepted hash |

The generic launcher argv is exactly:

```text
/opt/megacampus/deploy/qdrant/q12-capability-run.sh run
  --run-id <run-id>
  --command-id <command-id>
  --lease-fd <fd>
  --checkpoint <complete-byte-sha256>
  --capability <absolute-capability-file>
```

No `--`, shell text, extra argv/env, fresh lookup, unresolved placeholder, or
database capability is accepted as a host capability. FD 9 remains the held
lease. The already-open journal descriptor used for the claim transaction is
implementation-private and must be inherited, identity-checked, and tested; it
is not a new public argv/env surface.

## File and ownership map

| Stream    | Files                                                                                                                                                                                                                                                                                                                                                                        | Responsibility                                                                         |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| D5 plan   | this plan, D5 planning evidence, Beads/handoff/summary                                                                                                                                                                                                                                                                                                                       | freeze executable ordering and review it                                               |
| Root-D5   | `deploy/qdrant/q12-live-cutover.sh`, `deploy/qdrant/q12-capability-run.sh`, `deploy/qdrant/q12-lifecycle-core.py`, `deploy/qdrant/q12-command-manifest.json`, `packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-runner.py`, `q12-retained-barrier-contract.ts`, `q12-live-cutover.test.ts`, `q12-command-manifest.test.ts`, `.13.18-q12-root-d5.md` | real production core, generic launcher, no-I/O adapter, shared fixture driver/evidence |
| W         | `deploy/qdrant/q12-writer-resume.py`, `packages/course-gen-platform/tests/unit/ops/qdrant-source-recovery-runtime.test.ts`, `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.10-q12-w.md`                                                                                                                                                                                     | read-only full D5 validation before mutation                                           |
| WR        | read-only Root/W diffs, reports, test evidence                                                                                                                                                                                                                                                                                                                               | independent correctness/security acceptance                                            |
| M         | two document-evidence migration scripts, approved-migrations integration test, `q12-migration-credentials.test.ts`, `.13.11` artifact                                                                                                                                                                                                                                        | file-only migration credentials/guards                                                 |
| H         | deploy/rollback blue-green scripts, fail-closed shell test, `q12-blue-green-handoff.test.ts`, `.13.12` artifact                                                                                                                                                                                                                                                              | quiesce-aware handoff consumer                                                         |
| Root join | modify every accepted Root-D5 production/test file; create `q12-live-smoke.sh` and `q12-live-smoke.test.ts`; Root artifact, ops docs, handoff/summary/Graphify                                                                                                                                                                                                               | complete inherited supervisor and finish local acceptance                              |

The shared fixture file is Root-owned. W imports it but never edits it. Root-D5
does not edit W files. W does not begin GREEN until Root-D5 is reviewed,
integrated, and merged into the W branch without rewriting W history.

## Parallel Decomposition Matrix

| Stream           | Goal                                        | Agent                              | Write zone                       | Dependencies       | Verification                                    | Decision                 | Reason                                         |
| ---------------- | ------------------------------------------- | ---------------------------------- | -------------------------------- | ------------------ | ----------------------------------------------- | ------------------------ | ---------------------------------------------- |
| D5-Root map      | locate producer seams and conflicts         | visible architecture mapper        | ignored report only              | approved D5        | hashes, refs, status, focused Graphify          | parallel, complete       | independent producer mapping                   |
| D5-W map         | locate validator/test seams                 | visible correctness mapper         | ignored report only              | approved D5        | hashes, refs, status, focused Graphify          | parallel, complete       | independent validator mapping                  |
| D5 plan review   | verify this exact executable plan           | correctness + docs reviewers       | ignored reports only             | plan written       | plan SHA, P0-P3 verdicts                        | parallel review gate     | implementation may not begin on ambiguous plan |
| Root-D5 `.13.18` | implement real producer/fixture contract    | fresh implementation agent         | exact Root-D5 files in Task 2    | accepted plan      | RED/GREEN Root tests, shell/JSON/static gates   | sequential critical path | explicit Beads blocker for W                   |
| Root-D5 review   | accept producer contract                    | fresh reviewer                     | read-only report                 | Root-D5 pushed     | task diff, evidence, focused rerun              | sequential gate          | high-risk durable authority                    |
| W-D5             | replace fabricated root and validate D5     | existing W branch worker           | exact W files in Task 4          | Root-D5 integrated | W runtime/PG17/aggregate/static gates           | sequential critical path | closes terminal W P1                           |
| W-D5 review      | accept validator and joined behavior        | fresh reviewer                     | read-only report                 | W pushed           | task diff, evidence, selected adversarial rerun | sequential gate          | fail-closed pre-mutation boundary              |
| M                | implement inherited migration consumer      | visible specialist                 | four M files + `.13.11` artifact | accepted W         | migration/PG17/isolation gates                  | parallel with H          | disjoint consumer                              |
| H                | implement inherited handoff consumer        | visible specialist                 | four H files + `.13.12` artifact | accepted W         | handoff/fail-closed/isolation gates             | parallel with M          | disjoint consumer                              |
| Root join        | integrate M/H and complete supervisor/smoke | fresh Root implementer + reviewers | exact Root files in Task 9       | W, M, H accepted   | Root/joined/full local gates                    | sequential join          | sole cross-stream authority                    |

Implementation agents are not run in parallel because Root-D5 and W-D5 share a
producer/consumer interface and the subagent-driven-development contract
requires task review before the next implementation task. M and H are the only
write-heavy streams that become safely parallel after accepted W integration.

## Task 1: Accept and publish the D5 execution plan

**Files:**

- Create: this plan.
- Create:
  `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.13-q12-d5-plan.md`.
- Read ignored plan reviews:
  `.superpowers/sdd/d5-plan-correctness-review-report.md` and
  `.superpowers/sdd/d5-plan-docs-review-report.md`, followed by final
  `.superpowers/sdd/d5-plan-correctness-rereview-2-report.md` and
  `.superpowers/sdd/d5-plan-docs-rereview-2-report.md`; intermediate blocked/
  pass rereviews remain ignored evidence and their hashes are recorded in the
  tracked plan artifact.
- Modify: `.codex/handoff.md` and
  `.codex/stages/mc2-jz6y0/summary.md` only after review acceptance.

- [ ] **Step 1: Rehash all authority documents and branch inputs.** Compare
      every listed design/plan path to its exact SHA, including the lifecycle
      and current D4 plans; confirm integration HEAD/upstream equality, W HEAD
      `21cff2d0b50df3b2de8e0e7e29fc147658df1eed`, and clean tracked/index state.
- [ ] **Step 2: Independently review this exact plan.** Dispatch separate
      correctness and documentation reviewers with the plan SHA, approved D5 SHA,
      predecessor hashes, mapping reports, no-write boundary, and explicit P0-P3
      rubric. P0/P1 blocks; correct plan text and rerun both reviews after any
      material change.
- [ ] **Step 3: Validate and publish planning evidence.** Run Prettier check,
      artifact validation, `git diff --check`, and process verification; update
      Beads/handoff/summary with exact plan/review hashes; commit, `bd dolt push`,
      push integration, and verify divergence `0/0`.

## Task 2: Root-D5 TDD — real producer and shared fixture contract

**Files:**

- Create: `deploy/qdrant/q12-live-cutover.sh`.
- Create: `deploy/qdrant/q12-capability-run.sh`.
- Create: `deploy/qdrant/q12-lifecycle-core.py`.
- Create: `deploy/qdrant/q12-command-manifest.json`.
- Create:
  `packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-runner.py`.
- Create:
  `packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-contract.ts`.
- Create:
  `packages/course-gen-platform/tests/unit/ops/q12-live-cutover.test.ts`.
- Create:
  `packages/course-gen-platform/tests/unit/ops/q12-command-manifest.test.ts`.
- Create/update as the sole tracked orchestration write for this worker:
  `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.18-q12-root-d5.md`.

**Shared fixture interface:**

```ts
export type RetainedBarrierOperation =
  | 'install'
  | 'verify-after-base'
  | 'verify-after-observability'
  | 'prepare-recovery'
  | 'activate';

declare const leaseEpochBrand: unique symbol;
export type LeaseEpoch = string & { readonly [leaseEpochBrand]: true };
export function parseLeaseEpoch(value: string): LeaseEpoch;
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

export function materializeRootRetainedBarrierFixture(
  spec: RootRetainedBarrierFixtureSpec
): Promise<RootRetainedBarrierFixtureResult>;

export function rehashJournalAndCheckpointsAfterMutation(
  result: RootRetainedBarrierFixtureResult,
  mutate: (state: MutableRetainedFixtureState) => void
): void;
```

`deploy/qdrant/q12-lifecycle-core.py` is the one production serializer and
state machine. It exposes Python functions `run_supervisor(request, executor)`
and `run_claim(request, executor)`; the executor protocol may execute an exact
already-manifested child and return its immutable result, but it may not write
journal/capability/checkpoint state. The deployed shell wrappers always invoke
the core's production CLI, which constructs only `ProductionExecutor`; that CLI
accepts no fixture/test flag, environment switch, PATH command override,
manifest override, or injected executor.

The test-only `q12-retained-barrier-runner.py` imports those same production
functions and supplies `NoIoExecutor`, which returns fixed synthetic immutable
child results and records attempted effects. The TypeScript positive
materializer invokes only that runner in a temporary isolated run root; neither
test file serializes accepted journal/capability/checkpoint authority. RED tests
must fail if the runner bypasses the production functions, if deployed wrappers
accept any test switch, or if the no-I/O executor records Docker, database,
network, SSH, service, or remote access. Root tests compare every emitted
byte/path/hash/row against D5. The rehash helper is negative-test-only and never
creates a positive fixture.

`parseLeaseEpoch` is the only constructor for `LeaseEpoch`; it accepts exactly
`^(?:cutover|cutover-recovery-[1-9][0-9]*)$` and rejects zero, sign, leading
zero, fraction, exponent, whitespace and overflow-like spellings. The fixture
runtime accepts `rootEpoch` only as `cutover` or `cutover-recovery-1` and
rejects mismatched record key/`operation`. Legal install combinations
are exact: `not-committed` permits only selector/copy/published/issued/
claim-moved/claimed; `committed-no-baseline-receipt` and `ambiguous` require
`claimed`; `normal` requires `completed`. Non-install chains require
`completed/not-applicable`. Interface RED tests cover every illegal combination
and epoch spelling before producer tests consume the type.

### Mandatory table-driven D5 RED matrix

| Domain                       | Required dimensions before GREEN                                                                                              | Required result                                                                    |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Initial selectors            | all five commands; four normalized intents; activation `H checkpoint + I journal head` before I checkpoint                    | exact selector/copy/issued/claimed/result/completed order                          |
| Pre-capability recovery root | all five commands × cutover copy absent/present; recovery-1 null root; same-path crash idempotency                            | only exact absence/presence variant accepted                                       |
| Reissue/orphan               | one/two reissues; one/two orphans; fault after each successor publication and each oldest-to-newest move                      | no `recovery_reacquired` before complete backlog retirement                        |
| Exact result                 | initial/recovery execution × continuous/reacquired completion; move/no-row                                                    | same capability/result completed, no replay/reissue                                |
| Copy identity                | execution/path epoch differs from predecessor checkpoint epoch; equal hashes at distinct paths; every temp/fsync/rename crash | exact bytes, distinct inode, `nlink=1`, explained source                           |
| Install claimed boundary     | initial/recovery actual claimed row and recomputed checkpoint                                                                 | baseline/v1 binds actual claim; no second D5 authority                             |
| Install pre-COMMIT           | selector, copy, published, issued, claim-moved, claimed                                                                       | forward recovery/incident only; no `R`, move, DB rollback, FWM or W authority      |
| Install post-COMMIT          | COMMIT without baseline/receipt; ambiguous COMMIT                                                                             | reconstruct/complete without replay; ambiguity is retained-evidence incident       |
| Rollback prefix/frontier     | four clean prefixes; each exact next frontier; six forms × continuous/reacquired × initial/multi-epoch; four copy sets        | frontier never enlarges prefix; install cannot be frontier; activate not completed |
| Journal-less frontier        | T is newest tip; R is sole direct T reference; later intent/accepted carry exact F; all retirement faults                     | exact R checkpoint and FWM ancestry, no T repetition                               |
| Success-before-R             | every rollback-reachable command                                                                                              | complete without replay, enlarge prefix, recompute choice                          |
| Activation classifier        | pre-COMMIT; commit between classification and R; committed-before-R; activation-after-R; truth/receipt/drift                  | rollback only pre-COMMIT; committed finish-forward; post-R/drift incident          |

Each Root row first fails against missing production behavior and then passes the
focused Root command with zero failed/pending. W imports the same positive
matrix, first rejects the old fabricated fixture, and then passes only after its
read-only validator proves producer parity before mutation.

- [ ] **Step 1: Create an isolated Root-D5 worktree and durable task brief.**
      Branch from the accepted integration HEAD, claim `.13.18`, record base SHA,
      validate the prompt from `.codex/subagent-spawn-template.md`, and assign only
      the Root-D5 write zone.
- [ ] **Step 2: RED production-core and fixture-boundary tests.** Prove both
      deployed wrappers enter the production core for all five commands, the
      fixture runner enters the same functions with `NoIoExecutor`, the fixture
      cannot serialize authority independently, deployed CLI rejects every
      fixture/test/env/PATH/manifest/executor override, and effect log is empty.
      These cases must fail before the core/runner exist.
- [ ] **Step 3: RED command manifest and selector/copy tests.** Assert exactly
      the five retained commands, inherited literal argv/hash/minimal env, exact
      launcher argv, four normalized intents plus activation intent, H/I activation
      CAS, byte-exact copy, owner/mode/inode/link-count, exclusive temp publication,
      no-replace/fsync order, and failure at every crash boundary. Run the focused
      Root command below and record that each new case fails for missing behavior.
- [ ] **Step 4: GREEN production core and initial producer.** Implement the
      production-only CLI, injected internal Python executor protocol, strict manifest loading,
      selector validation, retained-copy publication, capability issuance,
      `capability_issued`, delegated launch, result validation, completed move,
      `completed`, and exact checkpoint repair-only continuations. No later D5
      behavior is added before its RED case.
- [ ] **Step 5: RED/GREEN launcher claim.** Cover exact CLI, FD 9, inherited
      open-journal identity, capability/checkpoint binding, sole no-replace
      issued-to-claimed move, sole `capability_claimed` row/checkpoint writer,
      signal/crash/replay cases, and old-capability rejection after lock loss.
- [ ] **Step 6: RED/GREEN recovery and exact-result completion.** Cover one and
      multiple consecutive reissues, null-root absence/presence variants, one and
      multiple publication-window orphans, direct edges, oldest-to-newest backlog
      retirement before `recovery_reacquired`, execution/completion epoch split,
      and exact-result completion without reissue or child replay.
- [ ] **Step 7: RED/GREEN install claimed-boundary and transaction recovery.**
      Execute the exact install rows from the mandatory matrix: initial/recovery
      claim binding; all six pre-COMMIT prefixes with no `R`/move/rollback/FWM/W
      authority; D4 COMMIT-without-baseline/receipt reconstruction and completion
      without replay; ambiguous COMMIT incident with all evidence retained.
- [ ] **Step 8: RED/GREEN rollback frontier and activation classifier.** Cover
      four legal completed prefixes, each exact next frontier, six frontier forms,
      four copy-prefix sets, durable `R` before move, journal-less `F/T` rules,
      complete retirement, exact FWM ancestry, install exclusion, pre-COMMIT
      activation rollback, the classification-to-R commit race, activated
      finish-forward, journal-less T-only-R plus exact post-R F projection, and
      drift/activation-after-R incidents.
- [ ] **Step 9: RED/GREEN shared real fixtures.** First add a failing contract
      test proving every positive traverses `run_supervisor`/`run_claim` and fails
      if the fixture writes authority itself. Then replace every hand-built Root
      positive with `materializeRootRetainedBarrierFixture`; prove the complete
      mandatory matrix is emitted by production core. Keep adversarial mutation
      support separate and incapable of blessing a positive.
- [ ] **Step 10: Verify, commit, push, and report.** Run:

  ```bash
  SUPABASE_URL=http://127.0.0.1:54321 \
  SUPABASE_SERVICE_KEY=synthetic-test-key \
  pnpm --filter @megacampus/course-gen-platform exec vitest run \
    --config vitest.config.unit.ts \
    tests/unit/ops/q12-live-cutover.test.ts \
    tests/unit/ops/q12-command-manifest.test.ts
  bash -n deploy/qdrant/q12-live-cutover.sh deploy/qdrant/q12-capability-run.sh
  python3 -m py_compile \
    deploy/qdrant/q12-lifecycle-core.py \
    packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-runner.py
  jq -e . deploy/qdrant/q12-command-manifest.json
  pnpm exec prettier --check \
    packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-contract.ts \
    packages/course-gen-platform/tests/unit/ops/q12-live-cutover.test.ts \
    packages/course-gen-platform/tests/unit/ops/q12-command-manifest.test.ts
  pnpm --filter @megacampus/course-gen-platform exec eslint \
    tests/unit/ops/fixtures/q12-retained-barrier-contract.ts \
    tests/unit/ops/q12-live-cutover.test.ts \
    tests/unit/ops/q12-command-manifest.test.ts
  git diff --check
  ```

  Record exact totals and cleanup; commit/push only Root-D5 paths and its
  exact artifact
  `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.18-q12-root-d5.md`. No test may
  contact a live resource.

## Task 3: Independently accept and integrate Root-D5

- [ ] **Step 1: Generate an exact base..head review package.** Give a fresh
      reviewer the Task 2 brief, report, diff package, D5/global constraints, and
      test evidence. Require separate spec-compliance and code-quality verdicts.
      The sole ignored review output is
      `.superpowers/sdd/d5-root-implementation-review-report.md`; its SHA and
      verdict are copied into `mc2-jz6y0.13.18-q12-root-d5.md`.
- [ ] **Step 2: Resolve every Critical/Important or P0/P1 finding under TDD.**
      The same implementer adds a failing case, fixes minimally, reruns the focused
      gate, pushes, and receives delta rereview. Do not waive plan-mandated
      findings without owner resolution.
- [ ] **Step 3: Integrate only the accepted Root-D5 commit.** Inspect the diff,
      artifact, and ignored reports; merge/cherry-pick without rewriting the source
      branch; rerun Task 2 Step 10 on integration; commit/push and verify `0/0`.
- [ ] **Step 4: Clean the delivered Root-D5 workspace.** Run
      `python3 scripts/orchestration/cleanup_stage_workspace.py --stage mc2-jz6y0 --task mc2-jz6y0.13.18`,
      and prove only the delivered Root-D5 worker worktree/local branch were
      removed while integration and unrelated worktrees remain. Then update
      `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.18-q12-root-d5.md` with
      actual `cleanup_status`/`cleanup_notes`, validate it, create/push a
      dedicated cleanup-evidence commit from integration, and require permitted-
      baseline `git status` plus upstream divergence `0/0` before continuing.
- [ ] **Step 5: Merge updated integration into the existing W branch.** Use a
      normal merge, preserve all W commits/uncommitted ownership, verify the shared
      fixture is import-only for W, and push. Do not rebase or discard the W
      worktree.

## Task 4: W-D5 TDD — full read-only provenance validation

**Files:**

- Modify: `deploy/qdrant/q12-writer-resume.py`.
- Modify:
  `packages/course-gen-platform/tests/unit/ops/qdrant-source-recovery-runtime.test.ts`.
- Leave `source-recovery-run.sh`, the database barrier, and structural SQL
  byte-identical; D5 adds no child argv or structural SQL authority.
- Modify exact W artifact after final verification:
  `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.10-q12-w.md`.
- Import, do not modify:
  `packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-contract.ts`.

- [ ] **Step 1: RED replacement of fabricated recovery authority.** Remove
      `historicalInstallScenario` and literal `5...`/`7...` checkpoint hashes.
      First preserve the old fabricated linked-recovery case as a mandatory
      rejection. Add Root-produced all-five initial/recovery/completion positives
      and first copy/selector negatives; verify only new D5 cases fail while the
      pre-D5 W baseline remains green.
- [ ] **Step 2: GREEN immutable copy and completed chains.** Extend opened-file
      identity with `st_nlink`; validate fixed path, complete bytes, distinct inode,
      source journal identity/head/projection, selector, capability, issuance,
      claim, result, completion, exact command context, null-root variants,
      consecutive direct supersession, retirement, and one completed tip for all
      five commands.
- [ ] **Step 3: RED/GREEN recovery, orphan, and no-replay grammar.** Cover one
      and multiple reissues/orphans; each publication and retirement fault; exact
      copy epoch vs predecessor checkpoint epoch; missing/duplicate/wrong-location
      ancestors; no `recovery_reacquired` before complete backlog retirement; and
      initial/recovery exact-result completion without replay.
- [ ] **Step 4: RED/GREEN install claimed-boundary and transaction states.**
      Import the Root-produced initial/recovery install fixtures and validate the
      actual `capability_claimed` row plus recomputed checkpoint selected by the
      baseline/v1 receipt. Table-drive selector/copy/published/issued/claim-moved/
      claimed pre-COMMIT states and require no `R`, capability move, DB rollback,
      FWM, or W authority. Accept D4 COMMIT-without-baseline/receipt only through
      exact reconstruction/completion without replay; reject ambiguous COMMIT as
      retained-evidence incident before mutation.
- [ ] **Step 5: RED/GREEN rollback prefix and frontier.** Derive forward only
      from all five completed chains/no frontier. Derive rollback only from prefix
      length 1..4 plus optional exact next frontier, mandatory accepted install and
      quiesce, no completed activate, exact `R`, retirement, journal-less `F/T`
      uniqueness, FWM intent directly after `R`, object input equal to the exact `R`
      checkpoint, and accepted row/checkpoint retaining frozen `F` post-state.
- [ ] **Step 6: RED/GREEN activation classifier and adversarial graph.** Cover
      all H/I fields, future digest in every selector, commit between classifier
      and R, activated truth/receipt, activation after R,
      aliases/hard links/symlinks/temps, owner/mode/link errors,
      cross-command/epoch/phase/quiesce/hash, fork/cycle/gap/duplicate, extra/later
      chain/frontier, replay/reissue, unknown residue, and self-consistent local
      rehashes. Every negative asserts failure before any Docker log line matching
      `^(ps|inspect|start|update|stop) ` and before database/writer/resume output.
- [ ] **Step 7: Recheck every opened D5 input before mutation.** Add retained
      copies/capabilities/results/journal/checkpoints to the immutable input set;
      reject identity/content drift before the first eventual Docker call. Do not
      add a write/repair path.
- [ ] **Step 8: Run focused and canonical W gates.** Run:

  ```bash
  SUPABASE_URL=http://127.0.0.1:54321 \
  SUPABASE_SERVICE_KEY=synthetic-test-key \
  pnpm --filter @megacampus/course-gen-platform exec vitest run \
    --config vitest.config.unit.ts \
    tests/unit/ops/qdrant-source-recovery-runtime.test.ts

  MC2_Q12_REAL_PG17=1 \
  SUPABASE_URL=http://127.0.0.1:54321 \
  SUPABASE_SERVICE_KEY=synthetic-test-key \
  pnpm --filter @megacampus/course-gen-platform exec vitest run \
    --config vitest.config.unit.ts \
    tests/unit/ops/qdrant-source-recovery-runtime.test.ts \
    tests/unit/ops/q12-database-barrier.test.ts

  MC2_Q12_REAL_PG17=1 \
  SUPABASE_URL=http://127.0.0.1:54321 \
  SUPABASE_SERVICE_KEY=synthetic-test-key \
  pnpm --filter @megacampus/course-gen-platform exec vitest run \
    --config vitest.config.unit.ts \
    tests/unit/ops/q12-structural-catalog-pg17.test.ts

  MC2_Q12_REAL_PG17=1 \
  SUPABASE_URL=http://127.0.0.1:54321 \
  SUPABASE_SERVICE_KEY=synthetic-test-key \
  pnpm --filter @megacampus/course-gen-platform exec vitest run \
    --config vitest.config.unit.ts \
    tests/unit/ops/q12-database-barrier.test.ts \
    tests/unit/ops/qdrant-source-recovery-runtime.test.ts \
    tests/unit/tools/qdrant/source-recovery-database.test.ts \
    tests/unit/tools/qdrant/source-recovery-reindex-adapters.test.ts \
    tests/unit/tools/qdrant/reindex-course-embeddings.test.ts
  ```

  Pre-D5 encoded baselines are respectively `141/141`, `192/192`, `34/34`,
  and `290/290`; after D5 record the new exact higher totals with zero failed
  and zero pending. Also run Python compile, shell syntax, Prettier, ESLint,
  `pnpm type-check`, synthetic `pnpm build`, structural SQL SHA/line/semicolon
  checks, `git diff --check`, and prove no matching test process,
  `mc2-q12*` container/volume, or current-run `/tmp` residue remains.

- [ ] **Step 9: Commit and push W.** Update the W artifact with RED/GREEN
      commands/totals, changed files, cleanup, docs/graph state, and exact Root-D5
      dependency; commit/push branch and verify upstream `0/0`.

## Task 5: Independently accept and integrate W-D5

- [ ] **Step 1: Review exact Root-D5 + W joined behavior.** Fresh independent
      correctness reviewer receives W base/head diff, Root accepted commit, D5
      plan/spec hashes, implementation report, and gates. Require explicit coverage
      of producer/validator parity, full D5 grammar, pre-mutation rejection, no-
      replay, rollback frontier, activation classifier, isolation, and test realism.
      The sole ignored output is
      `.superpowers/sdd/d5-w-implementation-review-report.md`; its SHA/verdict
      are copied into `mc2-jz6y0.13.10-q12-w.md`.
- [ ] **Step 2: Resolve and rereview findings.** P0/P1 and every Critical/
      Important issue blocks. Corrections follow RED/GREEN and focused delta review.
- [ ] **Step 3: Integrate accepted W exactly.** Inspect diff/evidence, integrate
      the accepted W commit into integration, rerun Root-focused plus all W commands,
      commit/push, verify `0/0`, then safely clean only the accepted W worktree and
      local branch with
      `python3 scripts/orchestration/cleanup_stage_workspace.py --stage mc2-jz6y0 --task mc2-jz6y0.13.10`.
      Record `cleanup_status`/`cleanup_notes` in exact artifact
      `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.10-q12-w.md`. Close
      `.13.10` only after durable integration evidence. Validate the artifact,
      commit/push cleanup evidence from integration, and require permitted-
      baseline `git status` plus upstream divergence `0/0` before M/H dispatch.

## Task 6: M TDD — file-only migration credentials and guards

**Task/worktree:** `mc2-jz6y0.13.11`, fresh `codex/q12-m2-*` worktree from
the exact accepted W integration commit recorded at dispatch.

**Files:**

- Modify:
  `packages/course-gen-platform/scripts/migrations/document-evidence-approved.ts`.
- Modify:
  `packages/course-gen-platform/scripts/migrations/document-evidence-observability-index.ts`.
- Modify:
  `packages/course-gen-platform/tests/integration/document-evidence-approved-migrations.test.ts`.
- Create:
  `packages/course-gen-platform/tests/unit/scripts/q12-migration-credentials.test.ts`.
- Create/update exact artifact:
  `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.11-q12-m.md`.

**Consumes:** accepted W file/FD validation, `q12_guard`, absolute DB URL/CA/
capability paths, Root current phase/checkpoint; exact inherited base-plan Task
4 and current D4-plan Task 6 bytes pinned above.

**Produces:** Q12-only file flags; field-by-field `pg.ClientConfig` with verified
TLS/startup opt-out; same-transaction guards before grants. It does not depend
on future `recovery_ready_guarded`, terminal v2/proof, or receipt-path argv.

- [ ] **Step 1: RED/GREEN credentials and guard ordering.** Reject env/argv
      URLs, wrong URI components/query/fragment, duplicates/multiline, unsafe
      path/symlink/inode/owner/mode/CA, `connectionString`, and secret-bearing
      errors. Prove each table/totals guard is installed and verified in the same
      transaction before grants; concurrent-index packets cannot alter table/
      schema/function/trigger/ACL/grants. Preserve ordinary programmatic APIs.
- [ ] **Step 2: Run exact M gates.** Run:

  ```bash
  SUPABASE_URL=http://127.0.0.1:54321 \
  SUPABASE_SERVICE_KEY=synthetic-test-key \
  pnpm --filter @megacampus/course-gen-platform exec vitest run \
    --config vitest.config.unit.ts \
    tests/unit/scripts/q12-migration-credentials.test.ts
  ```

  Then run the exact disposable PostgreSQL 17 integration recipe from the
  pinned D4 plan Task 6 Step 2: image
  `public.ecr.aws/supabase/postgres:17.6.1.064`, loopback random port, database
  `mc2_document_evidence_test`, synthetic password, JSON reporter, and
  `DOCUMENT_EVIDENCE_DATABASE_URL` pointing only at that disposable database:

  ```bash
  set -euo pipefail
  container="mc2-q12-migration-${PPID}-$$"
  report="/tmp/${container}-vitest.json"
  cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; rm -f "$report"; }
  trap cleanup EXIT
  docker run --detach --rm --name "$container" --publish 127.0.0.1::5432 \
    --env POSTGRES_PASSWORD=synthetic-test-password \
    --env POSTGRES_DB=mc2_document_evidence_test \
    public.ecr.aws/supabase/postgres:17.6.1.064 >/dev/null
  for attempt in $(seq 1 60); do
    docker exec "$container" pg_isready -q -U postgres -d mc2_document_evidence_test && break
    test "$attempt" -lt 60
    sleep 1
  done
  port="$(docker port "$container" 5432/tcp | sed -n 's/^127\.0\.0\.1:\([0-9][0-9]*\)$/\1/p')"
  test -n "$port"
  SUPABASE_URL=http://127.0.0.1:54321 \
  SUPABASE_SERVICE_KEY=synthetic-test-key \
  DOCUMENT_EVIDENCE_DATABASE_URL="postgresql://postgres:synthetic-test-password@127.0.0.1:${port}/mc2_document_evidence_test" \
  pnpm --filter @megacampus/course-gen-platform exec vitest run \
    --config ../../vitest.shared.ts --reporter=json --outputFile="$report" \
    tests/integration/document-evidence-approved-migrations.test.ts
  node -e '
    const r=JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8"));
    if(r.numFailedTests!==0||r.numPendingTests!==0||r.numPassedTests<1) throw new Error(JSON.stringify(r));
  ' "$report"
  cleanup
  trap - EXIT
  ```

  Expected: unit tests pass; integration has at least one passed, zero failed,
  zero pending/skipped; no URI/password/CA/capability leak; container/report
  removed.

- [ ] **Step 3: Review and publish M.** Commit/push only M files/artifact;
      independent reviewer checks credentials, transaction guards, D4 override,
      isolation, test realism and leak evidence. P0/P1 blocks; fixes use TDD and
      delta rereview. Record accepted commit, docs/graph state and cleanup plan.
      Sole ignored review output:
      `.superpowers/sdd/q12-m-implementation-review-report.md`; copy its SHA and
      verdict into `mc2-jz6y0.13.11-q12-m.md`.

## Task 7: H TDD — quiesce-aware blue/green handoff

**Task/worktree:** `mc2-jz6y0.13.12`, fresh `codex/q12-h-*` worktree from the
same exact accepted W integration commit; runs in parallel with Task 6.

**Files:**

- Modify: `scripts/deploy_blue_green.sh`.
- Modify: `scripts/rollback_blue_green.sh`.
- Modify: `scripts/ci/test_blue_green_fail_closed.sh`.
- Create:
  `packages/course-gen-platform/tests/unit/ops/q12-blue-green-handoff.test.ts`.
- Create/update exact artifact:
  `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.12-q12-h.md`.

**Consumes:** W exact external quiesce manifest, lease FD, release SHA,
journal/checkpoint identity, claimed capability, Root-accepted final transition;
exact inherited base-plan Task 5 and current D4-plan Task 6 bytes pinned above.

**Produces:** fixed `prepare-quiesced`, `commit-quiesced`,
`finalize-quiesced`, phase-aware rollback, and unchanged normal command
compatibility. H never creates/accepts a recovery overlay, discovers replacement
writers, or starts writers outside the Root-owned accepted resume path.

- [ ] **Step 1: RED/GREEN normal, Q12, crash and rollback cases.** Prepare only
      target Web/API `--no-start`, persist identity/restart=`no`, direct-port
      health; commit changes color/Nginx but never starts workers; finalize
      requires activation receipt. Cover every pre/post reload and receipt
      boundary, invalid/recreated IDs, lease/journal mismatch, pre-activation
      rollback and post-activation finish-forward.
- [ ] **Step 2: Run exact H gates.** Run:

  ```bash
  bash scripts/ci/test_blue_green_fail_closed.sh
  SUPABASE_URL=http://127.0.0.1:54321 \
  SUPABASE_SERVICE_KEY=synthetic-test-key \
  pnpm --filter @megacampus/course-gen-platform exec vitest run \
    --config vitest.config.unit.ts \
    tests/unit/ops/q12-blue-green-handoff.test.ts
  bash -n scripts/deploy_blue_green.sh scripts/rollback_blue_green.sh \
    scripts/ci/test_blue_green_fail_closed.sh
  git diff --check
  ```

  Expected: all commands pass, no writer start outside Root receipt, normal mode
  command-compatible, zero deploy/network/service mutation.

- [ ] **Step 3: Review and publish H.** Commit/push only H files/artifact;
      independent reviewer checks normal compatibility, identity binding,
      no-restart, rollback/finish-forward, isolation and test realism. P0/P1
      blocks; fixes use TDD and delta rereview. Record accepted commit,
      docs/graph state and cleanup plan.
      Sole ignored review output:
      `.superpowers/sdd/q12-h-implementation-review-report.md`; copy its SHA and
      verdict into `mc2-jz6y0.13.12-q12-h.md`.

## Task 8: Integrate accepted M and H sequentially

- [ ] **Step 1: Integrate M.** Inspect M diff/artifact/review and rerun Task 6
      gates on its head. Integrate exact accepted commit, rerun on integration,
      commit/push, run
      `python3 scripts/orchestration/cleanup_stage_workspace.py --stage mc2-jz6y0 --task mc2-jz6y0.13.11`.
      Then update/validate the M artifact cleanup fields, create/push a dedicated
      cleanup-evidence commit, and require permitted-baseline status and `0/0`.
- [ ] **Step 2: Integrate H.** Repeat the same evidence/diff/rerun sequence for
      Task 7, then run
      `python3 scripts/orchestration/cleanup_stage_workspace.py --stage mc2-jz6y0 --task mc2-jz6y0.13.12`.
      Update/validate H cleanup fields, create/push its cleanup-evidence commit,
      and require permitted-baseline status plus `0/0` before Root dispatch.
- [ ] **Step 3: Prove joined state.** Verify integration/upstream `0/0`, all M/H
      worktrees/local branches removed, integration and unrelated worktrees
      preserved, artifacts valid, and accepted W/M/H commit identities recorded
      for Root.

## Task 9: Root join — complete the inherited supervisor and local smoke

**Task/worktree:** `mc2-jz6y0.13.13`, fresh Root-join worktree from the exact
integration commit containing accepted Root-D5/W/M/H.

**Files:**

- Modify: `deploy/qdrant/q12-live-cutover.sh`.
- Modify: `deploy/qdrant/q12-capability-run.sh`.
- Modify: `deploy/qdrant/q12-lifecycle-core.py`.
- Modify: `deploy/qdrant/q12-command-manifest.json`.
- Modify:
  `packages/course-gen-platform/tests/unit/ops/q12-live-cutover.test.ts`.
- Modify:
  `packages/course-gen-platform/tests/unit/ops/q12-command-manifest.test.ts`.
- Modify the shared fixture/runner only when a joined RED parity test requires
  it; Root join is the sole owner if that happens.
- Create: `deploy/qdrant/q12-live-smoke.sh`.
- Create:
  `packages/course-gen-platform/tests/unit/ops/q12-live-smoke.test.ts`.
- Modify: `docs/operations/qdrant-self-hosted.md`.
- Modify: `docs/operations/document-evidence.md`.
- Modify exact artifact:
  `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.13-q12-root.md`.

**Consumes:** exact accepted G7/P/W/M/H commits and immutable release/run
inputs. **Produces:** sole `plan|live|recover` controller, complete D4/D5
lifecycle/DB proof/CAS/quiesce/rollback state machine, smoke/observation
evaluator and `rotation_required=true`; it performs no remote/live action now.

- [ ] **Step 1: RED/GREEN joined Root behavior.** Complete every inherited base
      plan Task 6 and current D4 plan Task 6 case: DB terminal proof, Root-only
      capability deletion and receipt v1-to-v2 CAS, quiesce overlay, rollback
      v1 archive/intent/receipts, exact phases, torn tail/signals/reboot, read-only
      recover, default/cron/scheduler incidents, plan/live/recover isolation,
      smoke/observation thresholds, and rotation-required. Preserve every D5
      matrix case and add RED producer/consumer parity for any joined edit.
- [ ] **Step 2: Run exact Root gate.** Run:

  ```bash
  SUPABASE_URL=http://127.0.0.1:54321 \
  SUPABASE_SERVICE_KEY=synthetic-test-key \
  pnpm --filter @megacampus/course-gen-platform exec vitest run \
    --config vitest.config.unit.ts \
    tests/unit/ops/q12-live-cutover.test.ts \
    tests/unit/ops/q12-command-manifest.test.ts \
    tests/unit/ops/q12-live-smoke.test.ts
  bash -n deploy/qdrant/q12-live-cutover.sh \
    deploy/qdrant/q12-capability-run.sh deploy/qdrant/q12-live-smoke.sh
  python3 -m py_compile deploy/qdrant/q12-lifecycle-core.py
  jq -e . deploy/qdrant/q12-command-manifest.json
  git diff --check
  ```

  Then rerun every accepted G7/P/W/M/H focused command and record exact totals,
  zero pending/skipped where required, leak scan and empty process/container/
  volume/tmp cleanup.

- [ ] **Step 3: Review, integrate, and clean Root join.** Commit/push Root zone;
      independent correctness/security and docs reviewers inspect base..head,
      artifacts and gates. P0/P1 blocks; fixes use TDD and delta rereview.
      Integrate accepted commit, rerun Root plus joined focused gates, push `0/0`,
      then run
      `python3 scripts/orchestration/cleanup_stage_workspace.py --stage mc2-jz6y0 --task mc2-jz6y0.13.13`.
      Sole ignored review outputs are
      `.superpowers/sdd/q12-root-join-correctness-review-report.md` and
      `.superpowers/sdd/q12-root-join-docs-review-report.md`; copy both hashes and
      verdicts into `mc2-jz6y0.13.13-q12-root.md`. After cleanup, update that
      artifact's actual cleanup fields and validate it; create/push a dedicated cleanup-
      evidence commit from integration, and require permitted-baseline status
      plus upstream divergence `0/0` before release-confidence gates.

## Task 10: Local release confidence and closeout

- [ ] **Step 1: Run required product/platform evidence.** Run focused Stage
      2/4/5/6, shared contract/migration, web conflict, recovery/isolation tests;
      pinned Qdrant `1.18.2` integration; Compose validation; approved local-disk
      snapshot/restore drill; record exact commands, totals, cleanup, and rollback.
- [ ] **Step 2: Run workspace/process gates.** Run `pnpm type-check`, synthetic
      `pnpm build`, and `scripts/orchestration/run_process_verification.sh` with
      fresh exit/totals evidence.
- [ ] **Step 3: Review docs and refresh Graphify.** Use a read-only
      `docs_reviewer`; update stale ops/deploy/durable behavior docs and record
      `docs-reviewed: updated` or exact no-change reason. Refresh the local graph
      without external model/API modes or Git hooks, run a focused Q12 query, and
      record `graph-reviewed: updated` with version/counts/commands.
- [ ] **Step 4: Canonical closeout.** Validate every artifact, run
      `check_stage_ready.py mc2-jz6y0`, then
      `scripts/orchestration/run_stage_closeout.py --stage mc2-jz6y0` only when all
      non-remote dependencies are truly accepted. Update/close Beads truth,
      commit, `bd dolt push`, pull/rebase safely if required, push, and verify clean
      synchronization. Do not close `.13` merely because local work is complete.
- [ ] **Step 5: Execute and verify stage workspace cleanup.** First run
      `python3 scripts/orchestration/cleanup_stage_workspace.py --stage mc2-jz6y0 --dry-run`,
      inspect the exact removals, then run the same command without `--dry-run`.
      Preserve the checked-out integration worktree/branch and every unrelated
      user worktree. Record final artifact cleanup status and prove no delivered
      child worktree/local branch remains. Validate changed artifacts, commit/
      push the final cleanup-evidence update, and require permitted-baseline
      `git status` plus upstream divergence `0/0`.

## Task 11: Preserve the exact remote activation gate

- [ ] **Step 1: Prepare, but do not execute, the activation packet.** State the
      exact GHCR publication, server files/services, Supabase migrations/secrets,
      Qdrant bootstrap/reindex/cutover, local-disk backup/restore, smoke/observation,
      password rotation, rollback, expected downtime, and data effects.
- [ ] **Step 2: Ask for explicit current-task authorization immediately before
      mutation.** Prior general approvals do not substitute for this final packet.
      If authorization or required current secrets are absent, keep `.13` and
      `.13.8` open/blocked with no partial activation. External S3 stays explicitly
      deferred and must not be reported as satisfied.

## Plan self-review

- Every D5 path, byte/hash domain, owner, writer, selector, lifecycle outcome,
  recovery/orphan/completion continuation, rollback frontier, activation
  classifier, and fail-closed incident is assigned to Root or W.
- Root precedes W only for the real producer/fixture dependency; W still blocks
  M/H and the final Root join. This is the only change to inherited ordering.
- Every implementation task starts with a named failing test and ends with an
  exact command, expected state, review, commit, push, and integration rerun.
- Root/W positive fixture authority cannot drift: one Root-owned driver invokes
  the same production-core functions as the deployed wrappers through a no-I/O
  executor; wrapper/fixture contract tests prove the seam and emitted bytes; W
  imports the same output.
- The file map prevents concurrent shared writes and preserves W history and
  unrelated user changes.
- No placeholder, silent authority reconstruction, test-only live mutation,
  external S3 claim, Qdrant Cloud action, remote authorization, or partial
  staging activation is introduced.
