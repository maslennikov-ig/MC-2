# Q12 Exact Source Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover 125 eligible catalog rows through 42 exact crash-durable
copies, record truthful dispositions for 6 eligible and 18 Career Playbook
originals, and bind Qdrant reindex/evidence coverage to those audited outcomes.

**Architecture:** A pinned read-only planner creates an immutable reviewed
manifest. A networkless UID-1001 executor publishes or rolls back bytes using a
separate crash-durable progress journal. A networked disposition service has no
writable upload mount and performs exact resumable CAS updates. Reindex and
Stage 4 accept only a verified manifest/run binding, never a generic failed
status or `--allow-gaps`.

**Tech Stack:** TypeScript 5, Node.js filesystem APIs, Zod, Supabase/PostgREST,
Vitest 4, Docker Compose, Bash, Qdrant operator image, pnpm.

## Global Constraints

- Accepted source truth is exactly `261 total / 240 eligible / 21 missing_course`.
- Pre-copy plan is exactly `109 recoverable / 129 missing / 2 invalid`.
- Exactly 42 physical copies restore 125 eligible rows; post-copy recoverable is
  exactly 234.
- Final reindex truth is exactly
  `240 eligible = 234 recoverable + 6 audited_failed`, with zero unresolved
  missing/invalid gaps and exactly 234 expected indexed documents.
- Six eligible rows receive `source_file_unrecoverable`; eighteen absent
  non-eligible Career Playbook rows receive `retained-derived-only`.
- Never replace original bytes with parsed, markdown, processed, cached, or
  Qdrant-derived content.
- Immutable reviewed manifest is mode `0600` and mounted read-only after review;
  mutable progress is a separate mode-`0600` journal bound to
  `run_id + manifest_sha256`.
- Byte executor is networkless, receives no secret/env file, runs Node as
  `1001:1001`, reads development uploads, and is the only service with writable
  production uploads.
- Publication is same-directory temp -> file fsync/hash -> atomic no-replace
  hard link -> target/parent fsync -> durable journal transition.
- Rollback deletes only a manifest-created target whose current hash matches and
  is forbidden at or after `reindex_started`.
- Pause uploads and hold one host-level `flock` across the complete remote
  recovery window.
- Courses without documents and baseline Stage 4/5/6 behavior remain unchanged.
- No Qdrant Cloud mutation, no external S3 requirement for staging, no external
  Graphify model/API mode, and no Git hooks.

---

## File Structure

- `tools/qdrant/source-recovery-manifest.ts` — schemas, redaction, run/entry
  state transitions, immutable manifest identity, crash-durable journal store.
- `tools/qdrant/source-recovery-filesystem.ts` — containment, streaming hash,
  durability preflight, no-replace copy, reconciliation, guarded rollback.
- `tools/qdrant/source-recovery-database.ts` — bounded source inventory and exact
  CAS adapter for `file_catalog` and `career_playbook_sources`.
- `tools/qdrant/source-recovery.ts` — injected orchestration and CLI modes.
- Existing reindex, Stage 4, operator, Compose, and docs files change only at
  their established boundaries; no unrelated refactor.

## Dependency and Parallel Order

1. Task 1 is the contract gate and runs first.
2. Tasks 2, 3, and 4 branch from accepted Task 1 and run in parallel with
   disjoint write zones.
3. Task 5 integrates the accepted command interfaces into operator/Compose.
4. Task 6 is orchestrator-owned integration, review, docs, local Graphify, and
   staging preflight. Remote execution waits for the current Session pooler URL.

### Task 1: Immutable Manifest, Progress Journal, and Filesystem Engine

**Files:**

- Create: `packages/course-gen-platform/tools/qdrant/source-recovery-manifest.ts`
- Create: `packages/course-gen-platform/tools/qdrant/source-recovery-filesystem.ts`
- Create: `packages/course-gen-platform/tests/unit/tools/qdrant/source-recovery-manifest.test.ts`
- Create: `packages/course-gen-platform/tests/unit/tools/qdrant/source-recovery-filesystem.test.ts`

**Interfaces:**

- Produces:

```ts
export type RecoveryRunPhase =
  | 'planned'
  | 'copying'
  | 'copied'
  | 'dispositions_applied'
  | 'verified'
  | 'reindex_started'
  | 'complete';

export interface RecoveryCounts {
  total: number;
  eligible: number;
  recoverable: number;
  missing: number;
  invalid: number;
  unsupported: number;
}

export interface RecoveryCopyEntry {
  entry_id: string;
  source_relative_path: string;
  target_relative_path: string;
  expected_size: number;
  expected_sha256: string;
  affected_file_catalog_rows: number;
}

export interface RecoveryDispositionEntry {
  entry_id: string;
  kind: 'eligible_unrecoverable' | 'career_playbook_retained_derived';
  file_catalog_id: string;
  career_playbook_source_id?: string;
  organization_id: string;
  course_id: string | null;
  expected_hash: string;
  expected_storage_path: string;
  reason: 'source_file_unrecoverable' | 'retained-derived-only';
}

export interface SourceRecoveryManifest {
  schema_version: 'megacampus.qdrant.source-recovery/v1';
  run_id: string;
  release_sha: string;
  pre_counts: RecoveryCounts;
  expected_post_counts: RecoveryCounts;
  copies: readonly RecoveryCopyEntry[];
  dispositions: readonly RecoveryDispositionEntry[];
}

export interface PublishInput {
  developmentRoot: string;
  productionRoot: string;
  entry: RecoveryCopyEntry;
}

export interface RollbackInput extends PublishInput {
  phase: RecoveryRunPhase;
  journalState: 'published' | 'rollback_planned';
}

export interface RecoveryProgressJournal {
  schema_version: 'megacampus.qdrant.source-recovery-progress/v1';
  run_id: string;
  manifest_sha256: string;
  revision: number;
  phase: RecoveryRunPhase;
  copy_states: Record<string, 'planned' | 'published' | 'rollback_planned' | 'rolled_back'>;
  disposition_states: Record<
    string,
    'disposition_planned' | 'disposition_applied' | 'disposition_verified'
  >;
}

export async function writeImmutableManifest(
  path: string,
  manifest: SourceRecoveryManifest
): Promise<string>;
export async function replaceProgressJournal(
  path: string,
  expectedRevision: number,
  next: RecoveryProgressJournal
): Promise<void>;
export async function publishNoReplace(input: PublishInput): Promise<void>;
export async function rollbackPublished(input: RollbackInput): Promise<void>;
```

- [ ] **Step 1: Write RED manifest tests**

Cover deterministic sorting, duplicate target rejection, exact aggregate counts,
manifest SHA binding, illegal state transitions, temp-file cleanup, file fsync,
atomic rename, and parent-directory fsync. Use injected filesystem operations so
the test proves call order:

```ts
expect(calls).toEqual([
  'open-temp',
  'write',
  'fsync-file',
  'close',
  'rename',
  'open-parent',
  'fsync-parent',
  'close-parent',
]);
```

- [ ] **Step 2: Run RED manifest tests**

```bash
pnpm --filter @megacampus/course-gen-platform exec vitest run \
  --config vitest.config.unit.ts \
  tests/unit/tools/qdrant/source-recovery-manifest.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the minimal manifest/journal contract**

Use strict Zod schemas, UUIDv4 run IDs, lower-case 64-hex SHA-256, sorted entries,
exact counts, `open('wx', 0o600)`, `FileHandle.sync()`, `rename()`, and directory
`FileHandle.sync()`. Do not store source text or credentials.

- [ ] **Step 4: Run manifest tests GREEN**

Expected: all new manifest tests pass with zero warnings.

- [ ] **Step 5: Write RED filesystem tests**

Use real temporary directories and assert:

```ts
await publishNoReplace(input);
expect(await sha256(target)).toBe(input.expectedSha256);
await expect(publishNoReplace(input)).rejects.toThrow(/target already exists/iu);
await writeFile(target, 'changed');
await expect(rollbackPublished(input)).rejects.toThrow(/hash mismatch/iu);
```

Add crash/restart cases for target absent, target exact, target mismatched, temp
leftover, published-before-journal, and rollback-before-journal.

- [ ] **Step 6: Run RED filesystem tests**

Expected: FAIL because filesystem functions do not exist.

- [ ] **Step 7: Implement minimal filesystem engine**

Resolve both roots with `realpath`, reject symlinks/non-regular files, stream
SHA-256, create the temp in the target directory as UID 1001, apply `0644`, use
`link(temp, target)` for no-replace publication, fsync target and directory, then
unlink the temp and fsync again.

- [ ] **Step 8: Run Task 1 GREEN and type-check**

```bash
pnpm --filter @megacampus/course-gen-platform exec vitest run \
  --config vitest.config.unit.ts \
  tests/unit/tools/qdrant/source-recovery-manifest.test.ts \
  tests/unit/tools/qdrant/source-recovery-filesystem.test.ts
pnpm --filter @megacampus/course-gen-platform type-check
```

- [ ] **Step 9: Commit and push Task 1**

```bash
git add packages/course-gen-platform/tools/qdrant/source-recovery-{manifest,filesystem}.ts \
  packages/course-gen-platform/tests/unit/tools/qdrant/source-recovery-{manifest,filesystem}.test.ts
git commit -m "feat(qdrant): add crash-durable source recovery core"
git push -u origin codex/q12-source-recovery-core
```

### Task 2: Planner, Disposition CAS, and Recovery CLI

**Files:**

- Create: `packages/course-gen-platform/tools/qdrant/source-recovery-database.ts`
- Create: `packages/course-gen-platform/tools/qdrant/source-recovery.ts`
- Create: `packages/course-gen-platform/tests/unit/tools/qdrant/source-recovery-database.test.ts`
- Create: `packages/course-gen-platform/tests/unit/tools/qdrant/source-recovery.test.ts`
- Modify: `packages/course-gen-platform/package.json`

**Interfaces:**

```ts
export interface RecoveryCatalogRow {
  id: string;
  organization_id: string;
  course_id: string | null;
  storage_path: string;
  hash: string;
  vector_status: 'pending' | 'indexing' | 'indexed' | 'failed';
  error_message: string | null;
}

export interface RecoveryPlaybookRow {
  id: string;
  playbook_id: string;
  organization_id: string;
  user_id: string;
  file_catalog_id: string;
  status: 'uploaded' | 'processing' | 'ready' | 'failed' | 'removed';
  error_message: string | null;
}

export interface FileDispositionCas {
  expected: RecoveryCatalogRow;
  nextStatus: 'failed';
  nextErrorMessage: string;
}

export interface PlaybookDispositionCas {
  expected: RecoveryPlaybookRow;
  nextStatus: 'failed';
  nextErrorMessage: string;
}

export interface RecoveryDispositionDatabase {
  listFileCatalogExpectedRows(ids: readonly string[]): Promise<RecoveryCatalogRow[]>;
  listCareerPlaybookExpectedRows(fileCatalogIds: readonly string[]): Promise<RecoveryPlaybookRow[]>;
  casFileCatalog(input: FileDispositionCas): Promise<0 | 1>;
  casCareerPlaybookSource(input: PlaybookDispositionCas): Promise<0 | 1>;
}

export type SourceRecoveryMode =
  | 'plan'
  | 'verify'
  | 'execute'
  | 'rollback'
  | 'apply-dispositions'
  | 'verify-dispositions';
```

- [ ] **Step 1: Write RED database/CAS tests**

Assert bounded pages, tenant/course/playbook predicates, exact hash/path/prior
status/error predicates, affected-row `0` mismatch, idempotent already-applied
reconciliation, paired Career Playbook substates, and no unrelated writes.

- [ ] **Step 2: Run RED tests**

Expected: module-not-found failures.

- [ ] **Step 3: Implement the injected database adapter**

Use Supabase keyset pages and `.eq()` predicates for every immutable field. The
six eligible rows become `failed/source_file_unrecoverable`; the eighteen absent
Career Playbook rows update source then catalog through durable substates. Do
not claim cross-table transactionality; services are paused and restart
reconciles the intermediate state.

- [ ] **Step 4: Write RED CLI/orchestration tests**

Assert exact pre/post counts, 42 targets, 125 affected rows, immutable manifest
review hash, `--confirm-run-id`, manifest/journal mismatch, phase gates,
disposition progress checkpoint before advance, redacted stdout, and rollback
rejection after `reindex_started`.

- [ ] **Step 5: Implement CLI modes and package scripts**

Add exact scripts:

```json
{
  "qdrant:source-recovery": "tsx tools/qdrant/source-recovery.ts",
  "qdrant:source-recovery:plan": "tsx tools/qdrant/source-recovery.ts plan",
  "qdrant:source-recovery:execute": "tsx tools/qdrant/source-recovery.ts execute",
  "qdrant:source-recovery:verify": "tsx tools/qdrant/source-recovery.ts verify",
  "qdrant:source-recovery:rollback": "tsx tools/qdrant/source-recovery.ts rollback"
}
```

The general command also exposes disposition modes. Direct execution must emit
only aggregate JSON.

- [ ] **Step 6: Run Task 2 GREEN**

```bash
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=ci-placeholder \
pnpm --filter @megacampus/course-gen-platform exec vitest run \
  --config vitest.config.unit.ts \
  tests/unit/tools/qdrant/source-recovery-database.test.ts \
  tests/unit/tools/qdrant/source-recovery.test.ts
```

- [ ] **Step 7: Commit and push Task 2**

```bash
git add packages/course-gen-platform/tools/qdrant/source-recovery-database.ts \
  packages/course-gen-platform/tools/qdrant/source-recovery.ts \
  packages/course-gen-platform/tests/unit/tools/qdrant/source-recovery-database.test.ts \
  packages/course-gen-platform/tests/unit/tools/qdrant/source-recovery.test.ts \
  packages/course-gen-platform/package.json
git commit -m "feat(qdrant): add audited source recovery workflow"
git push -u origin codex/q12-source-recovery-workflow
```

### Task 3: Audited-Failure Reindex Contract

**Files:**

- Modify: `packages/course-gen-platform/tools/qdrant/reindex-plan.ts`
- Modify: `packages/course-gen-platform/tools/qdrant/reindex-course-embeddings.ts`
- Modify: `packages/course-gen-platform/tests/unit/tools/qdrant/reindex-plan.test.ts`
- Modify: `packages/course-gen-platform/tests/unit/tools/qdrant/reindex-course-embeddings.test.ts`

**Produces:** `auditedFailed`, `unresolvedMissing`, `unresolvedInvalid`, recovery
run/hash binding, and schema-v3 execution artifacts.

- [ ] **Step 1: Write RED plan tests**

Assert a generic failed row remains unresolved, while an exact verified
manifest disposition yields:

```ts
expect(plan).toMatchObject({
  eligible: 240,
  recoverable: 234,
  auditedFailed: 6,
  unresolvedMissing: 0,
  unresolvedInvalid: 0,
  expectedDocuments: 234,
});
```

Keep raw diagnostics `missingSource=4` and `invalidSourcePath=2`.

- [ ] **Step 2: Remove the `--allow-gaps` acceptance path in RED tests**

Delete option parsing and assert every unresolved gap exits `2` and blocks
execute/verify. Existing tests that expect `allowGaps=true` to pass must be
rewritten to use an exact audited disposition.

- [ ] **Step 3: Implement plan classification and DB projection**

Add `hash` and `error_message` to the source projection. Bind classification to
run ID, manifest SHA, exact expected hash/path, applied CAS evidence, and
verified failed coverage; never trust arbitrary error text alone.

- [ ] **Step 4: Write RED execution/resume tests**

Assert schema-v3 artifacts persist recovery run/hash, audited counts and
verification fingerprint; changed/missing/stale binding blocks plan, resume,
execute, and verify.

- [ ] **Step 5: Implement schema-v3 artifact and gates**

Candidate and expected indexed IDs remain only the 234 recoverable documents.
Persist `reindex_started` to the recovery journal before queue enqueue begins.

- [ ] **Step 6: Run Task 3 GREEN**

```bash
pnpm --filter @megacampus/course-gen-platform exec vitest run \
  --config vitest.config.unit.ts \
  tests/unit/tools/qdrant/reindex-plan.test.ts \
  tests/unit/tools/qdrant/reindex-course-embeddings.test.ts
```

- [ ] **Step 7: Commit and push Task 3**

```bash
git commit -am "feat(qdrant): bind reindex to audited source failures"
git push -u origin codex/q12-source-recovery-reindex
```

### Task 4: Stage 4 Failed Coverage and Downstream Exclusion

**Files:**

- Modify: `packages/course-gen-platform/src/stages/stage4-analysis/handler-helpers.ts`
- Modify: `packages/course-gen-platform/src/stages/stage4-analysis/orchestrator-phase-helpers.ts`
- Modify: `packages/course-gen-platform/src/stages/stage4-analysis/evidence/preflight.ts`
- Modify: focused Stage 4 enumeration/preflight/live-wiring tests
- Modify: focused Stage 5 and Stage 6 evidence tests only if current exclusion
  coverage is insufficient.

- [ ] **Step 1: Write RED enumeration tests**

Require `vector_status,error_message` projection and parse only the bounded
pattern `source_file_unrecoverable; recovery_run=<uuid>`. Generic failed rows do
not receive an audited outcome.

- [ ] **Step 2: Write RED preflight tests**

Supply parsed/markdown derivatives together with the approved failure and prove
they are ignored:

```ts
expect(card).toMatchObject({
  coverage_status: 'failed',
  coverage_reason: 'source_file_unrecoverable',
  processing_mode: 'metadata_only',
  summary: null,
  key_claims: [],
  token_counts: { allocated: 0 },
});
```

- [ ] **Step 3: Implement structured source failure wiring**

Carry `sourceFailureReason` through handler -> phase helper -> preflight. Before
budget allocation or content loading, call `createFailedEvidenceCard()` with
zero allocation and remove all reusable full text/summary fields.

- [ ] **Step 4: Add downstream regressions**

Prove Stage 5 filters the failed card, Stage 6 produces zero evidence refs for
it, and a no-document course remains byte-for-byte baseline-compatible.

- [ ] **Step 5: Run Task 4 GREEN**

```bash
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=ci-placeholder \
pnpm --filter @megacampus/course-gen-platform exec vitest run \
  --config vitest.config.unit.ts \
  tests/unit/stages/stage4-analysis/document-source-enumeration.test.ts \
  tests/unit/stages/stage4-analysis/evidence/preflight.test.ts \
  tests/unit/stages/stage4-analysis/evidence/live-wiring.test.ts
```

- [ ] **Step 6: Commit and push Task 4**

```bash
git commit -am "feat(evidence): preserve unrecoverable source outcomes"
git push -u origin codex/q12-source-recovery-evidence
```

### Task 5: Pinned Operator and Compose Isolation

**Files:**

- Modify: `packages/course-gen-platform/docker/qdrant-operator/entrypoint.sh`
- Modify: `packages/course-gen-platform/Dockerfile`
- Modify: `docker-compose.infra.yml`
- Create: `deploy/qdrant/source-recovery-run.sh`
- Create: `packages/course-gen-platform/tests/unit/ops/qdrant-source-recovery-runtime.test.ts`
- Modify: existing Qdrant operator/runtime contract tests.

- [ ] **Step 1: Write RED runtime tests**

Parse rendered Compose and assert three services:

```ts
expect(executor.network_mode).toBe('none');
expect(executor.env_file).toBeUndefined();
expect(executor.secrets).toBeUndefined();
expect(executor.user).toBe('1001:1001');
expect(executor.volumes).toContainEqual(
  expect.objectContaining({ target: '/opt/megacampus/data/uploads', read_only: false })
);
expect(planner.volumes.every(upload => upload.read_only)).toBe(true);
expect(disposition.volumes.some(upload => upload.target.includes('/uploads'))).toBe(false);
```

Require immutable digest image, operator profile, read-only rootfs, cap drop,
tmpfs, exact manifest `:ro`, progress directory `:rw`, and no inherited Qdrant
secret for source-recovery modes.

- [ ] **Step 2: Extend entrypoint and Docker build self-check**

Add `source-recovery plan|verify|execute|rollback|apply-dispositions|verify-dispositions`.
Validate manifest path/run ID; do not call Qdrant key staging. Build-time
`source-recovery --help` and self-check import the new modules.

- [ ] **Step 3: Add three Compose services**

Planner/verifier: both roots read-only, networked, broad env, state rw. Executor:
network none, no env/secrets, dev ro, prod rw, manifest ro, progress rw.
Disposition: networked, no upload mounts, manifest ro, progress rw.

- [ ] **Step 4: Add host-run wrapper contract**

Create a host wrapper that acquires
`/run/megacampus-qdrant-source-recovery/source-recovery.lock`, refuses to start
while any of `megacampus-api`, `megacampus-api-blue`,
`megacampus-api-green`, `megacampus-worker`, `megacampus-worker-stage6`, or
`megacampus-worker-stage7` is running, and holds the lock across
plan/execute/disposition/verify. The runbook stops these writers first and
records/resumes their exact pre-window state. Do not reuse the container-local
Qdrant snapshot lock as an upload lock.

- [ ] **Step 5: Run Task 5 GREEN**

```bash
pnpm --filter @megacampus/course-gen-platform exec vitest run \
  --config vitest.config.unit.ts \
  tests/unit/ops/qdrant-source-recovery-runtime.test.ts \
  tests/unit/ops/qdrant-operator-runtime.test.ts \
  tests/unit/ops/qdrant-runtime-contract.test.ts
```

- [ ] **Step 6: Run Compose and shell checks**

```bash
bash -n packages/course-gen-platform/docker/qdrant-operator/entrypoint.sh
node scripts/ci/test_ci_cd_workflow_gates.mjs
```

- [ ] **Step 7: Commit and push Task 5**

```bash
git add packages/course-gen-platform/docker/qdrant-operator/entrypoint.sh \
  packages/course-gen-platform/Dockerfile docker-compose.infra.yml \
  deploy/qdrant/source-recovery-run.sh \
  packages/course-gen-platform/tests/unit/ops/qdrant-source-recovery-runtime.test.ts \
  packages/course-gen-platform/tests/unit/ops/qdrant-operator-runtime.test.ts \
  packages/course-gen-platform/tests/unit/ops/qdrant-runtime-contract.test.ts
git commit -m "feat(qdrant): isolate source recovery operators"
git push -u origin codex/q12-source-recovery-runtime
```

### Task 6: Integration, Review, Documentation, and Safe Execution Gate

**Files:**

- Modify: `docs/operations/qdrant-self-hosted.md`
- Modify: `docs/operations/document-evidence.md`
- Modify: `.codex/handoff.md`
- Modify: `.codex/stages/mc2-jz6y0/summary.md`
- Create/update: `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1.md`

- [ ] **Step 1: Independently review every stream**

Require P0/P1 zero and immutable correction artifacts for any P0/P1 finding.
Inspect diffs, test evidence, Compose model, secret boundaries, manifest/journal
durability, CAS tenancy, failed-card truth, and reindex equation.

- [ ] **Step 2: Integrate accepted streams in dependency order**

Core first; then workflow, reindex, and evidence; runtime last. Rerun all focused
tests on the merged integration tree.

- [ ] **Step 3: Run disposable recovery acceptance**

Use synthetic roots and database rows to prove 42 no-replace copies, 125 logical
rows, crash restart, guarded rollback, six/twenty-four dispositions, exact
Stage 4 failed cards, `234+6=240`, no tenant isolation violation, and no residual
container/volume/port/temp data.

- [ ] **Step 4: Run release-confidence local gates**

```bash
pnpm type-check
pnpm build
node scripts/ci/test_ci_cd_workflow_gates.mjs
scripts/orchestration/run_process_verification.sh
```

Run focused Stage 2/4/5/6, shared contract/migration, web conflict, pinned Qdrant
integration, Compose, recovery/isolation, and docs checks selected by
`test-pass`.

- [ ] **Step 5: Update durable docs and Graphify**

Record exact commands/totals, accepted reviews, cleanup, current DB credential
blocker, and rollback state. Run local `graphify update .` and
`graphify cluster-only . --no-viz`; require `Built from commit` to equal final
HEAD and forbidden source paths zero.

- [ ] **Step 6: Commit/push integration and clean workspaces**

Push every accepted stream and integration result. Remove safe worktrees/local
branches and disposable resources; retain only explicitly required protected
recovery evidence until remote execution closes.

- [ ] **Step 7: Remote boundary**

If the current Session pooler URL is still unavailable, leave Q12 open and stop
with no staging mutation. When it is available, rerun exact source inventory and
present any changed external effect before executing the already authorized
migration/recovery/reindex/cutover packet.
