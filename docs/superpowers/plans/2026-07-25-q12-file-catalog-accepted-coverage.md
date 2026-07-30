# Q12 file_catalog-only Accepted-Coverage Contract — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:executing-plans` (inline, root-owned —
> the seven tasks share one write zone and one fixture surface, so there is no write-isolation or
> context-isolation benefit in splitting them across agents). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the Q12 `source.forward` acceptance authority derivable in-window by binding it to
`file_catalog` truth instead of the `document_evidence_*` ledgers, without changing the frozen command
manifest.

**Architecture:** The recovery's own database layer (`applyDispositionEntry`) writes exactly one durable
fact per eligible disposition: the `file_catalog` row moves to `vector_status='failed'` with
`error_message='source_file_unrecoverable; recovery_run=<recovery-run-id>'`. That fact — cross-checked
against the sha-bound reviewed manifest — becomes the accepted-coverage binding. The frozen
`<accepted-coverage-run>` argv slot keeps its position and token but carries a self-describing authority
token `catalog:<recovery-run-id>` instead of an `org:course:run` ledger triple, so the six recovered
course scopes come from the manifest (where they are already sha-bound) instead of from argv.

**Tech Stack:** TypeScript (tsx CLIs under `packages/course-gen-platform/tools/qdrant/`), Vitest
(`vitest.config.unit.ts`), Python 3.13 controller (`deploy/qdrant/q12-lifecycle-core.py`), bash wrapper
(`deploy/qdrant/source-recovery-run.sh`).

## Global Constraints

- `deploy/qdrant/q12-command-manifest.json` MUST stay byte-identical: sha256
  `aaec6fc25a6996facbf6f07f579239ba0a2aa53fd5521c83cb3c87d12087a841`. Re-verify after every task.
- Nothing may be invented: every accepted-coverage field is read from the live `file_catalog` or from the
  sha-bound reviewed recovery manifest. No synthesized UUIDs, no seeded ledgers.
- Exactly six `eligible_unrecoverable` dispositions (three organizations, six courses) — the count and
  the multi-scope shape are product truth from the accepted 2026-07-12 audit.
- `--accepted-coverage-fingerprint` stays a 64-hex canonical fingerprint over the whole binding.
- Test command: from `packages/course-gen-platform` with
  `SUPABASE_URL=http://localhost SUPABASE_SERVICE_KEY=dummy pnpm vitest run --config vitest.config.unit.ts <path>`.
- Commits need `NODE_OPTIONS=--max-old-space-size=8192` (pre-commit eslint OOMs otherwise).
- Deliver via `/push-dev`; never push `develop`/`master` directly.

## Contract (target state)

```ts
// tools/qdrant/reindex-plan.ts
export interface AcceptedFailedCoverageEntry {
  fileCatalogId: string; // eligible disposition file_catalog_id
  organizationId: string;
  courseId: string;
  storagePath: string; // live file_catalog.storage_path == disposition.expected_storage_path
  hash: string; // live file_catalog.hash == disposition.expected_hash
  vectorStatus: 'failed';
  errorMessage: string; // `source_file_unrecoverable; recovery_run=${recoveryRunId}`
}
export interface AcceptedFailedCoverageScopeBinding {
  organizationId: string;
  courseId: string;
  entries: readonly AcceptedFailedCoverageEntry[];
}
export interface AcceptedFailedCoverageBinding {
  status: 'accepted';
  source: 'file_catalog';
  recoveryRunId: string;
  recoveryManifestSha256: string;
  fingerprint: string;
  scopes: readonly AcceptedFailedCoverageScopeBinding[];
}
```

Authority token: `catalog:<lower-case UUIDv4 recovery run id>` — emitted into
`<run-root>/source-forward-acceptance.json` as `coverage_run`, staged by the operator at
`<run-root>/accepted-coverage-run`, validated by the controller, the wrapper, the emit CLI and the
reindex CLI, and required to equal the run's `--recovery-run-id`.

Reindex plan/artifact fields: `acceptedCoverageLedgerIds: string[]` (ledger UUIDs) becomes
`acceptedCoverageScopes: string[]` (sorted unique `organization:course` pairs).

---

### Task 1: file_catalog coverage binding in `reindex-plan.ts`

**Files:**

- Modify: `packages/course-gen-platform/tools/qdrant/reindex-plan.ts:60-346,470-490`
- Test: `packages/course-gen-platform/tests/unit/tools/qdrant/reindex-plan.test.ts`

**Interfaces:**

- Produces: the four types above, `calculateAcceptedFailedCoverageFingerprint(binding)`,
  `ReindexPlan.acceptedCoverageScopes?: string[]`, `RecoveryReindexBinding.acceptedFailedCoverage`.
- Consumes: `SourceRecoveryManifest`, `ReindexSourceRow` (existing).

- [ ] **Step 1: Write the failing tests** in `reindex-plan.test.ts`: build a six-scope
      `acceptedFailedCoverage` fixture (`source: 'file_catalog'`, one scope per eligible disposition) and
      assert (a) `buildReindexPlan` accepts it and reports `acceptedCoverageScopes` as the six sorted
      `org:course` pairs, (b) a scope set missing one course throws
      `/coverage scopes must exactly match/`, (c) an entry whose `hash` differs from the disposition's
      `expected_hash` throws `/exact recovered file_catalog truth/`, (d) an entry whose `errorMessage`
      lacks `recovery_run=<run>` throws the same, (e) a non-canonical `fingerprint` throws
      `/fingerprint is not canonical/`.
- [ ] **Step 2: Run them and watch each fail** (expected: type/shape errors, then assertion failures).
- [ ] **Step 3: Implement** — replace `ledgers` with `scopes`, add `source: 'file_catalog'`, fold the
      per-entry catalog predicates into the existing eligible-row loop (single helper
      `expectedCoverageErrorMessage(runId)` reused by every module), and rename the plan field.
- [ ] **Step 4: Run the suite green.**
- [ ] **Step 5: Commit** `refactor(q12): bind accepted failed coverage to file_catalog truth`.

### Task 2: authority token + adapter config in `source-recovery-reindex-adapters.ts`

**Files:**

- Modify: `packages/course-gen-platform/tools/qdrant/source-recovery-reindex-adapters.ts`
- Test: `packages/course-gen-platform/tests/unit/tools/qdrant/source-recovery-reindex-adapters.test.ts`

**Interfaces:**

- Produces: `parseAcceptedCoverageAuthority(value): { source: 'file_catalog'; recoveryRunId: string }`,
  `formatAcceptedCoverageAuthority(recoveryRunId): string`,
  `SourceRecoveryReindexAdapterConfig.acceptedCoverageAuthority: string`,
  `SourceRecoveryCatalogCoverageRepository.listFileCatalogExpectedRows(ids)`,
  `buildAcceptedCoverageBinding(manifest, repository, manifestSha256)`.
- Consumes: Task 1 types; `RecoveryCatalogRow` from `./source-recovery-database`.

- [ ] **Step 1: Write the failing tests**: `parseAcceptedCoverageAuthority('catalog:<uuid>')` returns the
      run id; `'org:course:run'`, `'catalog:'`, upper-case and `'catalog:<uuid>:x'` throw
      `/must be catalog:<recovery-run-id>/`; `normalizeSourceRecoveryReindexAdapterConfig` throws when the
      authority run id differs from `expectedRecoveryRunId`; `loadRecoveryBinding` builds the six-scope
      binding from a fake repository returning the six applied rows; a repository row with a stale
      `vector_status` fails closed; a repository returning five rows fails closed; a fingerprint mismatch
      against `expectedCoverageFingerprint` fails closed.
- [ ] **Step 2: Run them and watch each fail.**
- [ ] **Step 3: Implement** — drop `AcceptedCoverageRunConfig`, `SourceRecoveryReindexEvidenceRepository`,
      `assertExactScopes`, `exactFailedEntry` and the `DocumentEvidenceCardsSchema` import; default deps
      use `createRecoveryDispositionDatabase(createSupabaseRecoveryGateway(getSupabaseAdmin() as ...))`,
      keeping `requireQ12CapabilityFetchInstalled()`.
- [ ] **Step 4: Run the suite green.**
- [ ] **Step 5: Commit** `feat(q12): derive accepted coverage from the recovered file_catalog rows`.

### Task 3: emit entrypoint + CLI

**Files:**

- Modify: `packages/course-gen-platform/tools/qdrant/source-recovery-reindex-adapters.ts` (emit half),
  `packages/course-gen-platform/tools/qdrant/emit-source-forward-acceptance.ts`
- Test: `tests/unit/tools/qdrant/q12-source-forward-acceptance-emit.test.ts`,
  `tests/unit/tools/qdrant/emit-source-forward-acceptance.test.ts`

**Interfaces:**

- Produces: `computeSourceForwardAcceptance({manifestPath, journalPath, expectedRecoveryRunId,
acceptedCoverageAuthority}, deps)` → `{schema, recovery_manifest_sha256, coverage_fingerprint,
coverage_run: 'catalog:<run>'}`.

- [ ] **Step 1: Write the failing tests**: the emitted authority carries `coverage_run` equal to
      `catalog:<recovery-run-id>` and a fingerprint identical to the reindex-side binding for the same
      inputs (cross-module determinism); an authority token naming a different run id throws; six-scope
      input succeeds (the old "exactly one accepted coverage run" refusal is gone); `--accepted-coverage-run
org:course:run` is rejected by `parseEmitSourceForwardAcceptanceArgv`'s consumer.
- [ ] **Step 2: Run them and watch each fail.**
- [ ] **Step 3: Implement** — `runEmitSourceForwardAcceptance` passes the authority string through, no
      `split(':')` triple parsing, 0400 `O_CREAT|O_EXCL` publish unchanged.
- [ ] **Step 4: Run both suites green.**
- [ ] **Step 5: Commit** `feat(q12): emit the file_catalog acceptance authority token`.

### Task 4: reindex CLI argv + durable artifact schema

**Files:**

- Modify: `packages/course-gen-platform/tools/qdrant/reindex-course-embeddings.ts:95-110,310-420,520-545,780-800,1115-1190`
- Test: `tests/unit/tools/qdrant/reindex-course-embeddings.test.ts`

- [ ] **Step 1: Write the failing tests**: `--accepted-coverage-run catalog:<uuid>` configures the adapter
      authority; a triple value is rejected; the plan artifact round-trips `acceptedCoverageScopes` (sorted
      unique `org:course`) and `execute`/`verify` refuse an artifact whose scopes drift from the plan.
- [ ] **Step 2: Run them and watch each fail.**
- [ ] **Step 3: Implement** — argv branch, artifact zod schema (`z.array(SCOPE_SCHEMA).min(1)` with
      `SCOPE_SCHEMA = /^<uuid>:<uuid>$/`), the artifact/plan comparison and the sorted-unique guard.
- [ ] **Step 4: Run the suite green.**
- [ ] **Step 5: Commit** `feat(q12): carry accepted coverage scopes through the reindex artifact`.

### Task 5: controller acceptance reader

**Files:**

- Modify: `deploy/qdrant/q12-lifecycle-core.py:30-37,717-740,1421-1459`
- Test: `tests/unit/ops/q12-w2-staged-resolver.test.ts`, `tests/unit/ops/q12-command-manifest.test.ts`

- [ ] **Step 1: Write the failing tests**: `read_source_forward_acceptance` accepts
      `coverage_run='catalog:<uuid>'` and fails closed on an `org:course:run` triple, on `catalog:` alone,
      and on upper-case hex; the fixture derivation returns `catalog:<derived-uuid>`; the frozen manifest
      sha assertion stays green.
- [ ] **Step 2: Run them and watch each fail.**
- [ ] **Step 3: Implement** — `COVERAGE_RUN_RE` → `CATALOG_COVERAGE_RUN_RE = ^catalog:<uuidv4>$`, fixture
      derivation `f"catalog:{derived_uuid('q12-source-recovery')}"` (the recovery run id the fixture path
      already derives, so plan and window agree), refreshed docstrings.
- [ ] **Step 4: Run both suites green plus `/usr/bin/python3.13 -m py_compile`.**
- [ ] **Step 5: Commit** `feat(q12): read the catalog acceptance authority token in the controller`.

### Task 6: wrapper forward tail

**Files:**

- Modify: `deploy/qdrant/source-recovery-run.sh:1329-1394`
- Test: `tests/unit/ops/qdrant-source-recovery-runtime.test.ts`

- [ ] **Step 1: Write the failing tests**: the tail accepts `catalog:<recovery-run-id>`; it fails closed
      when the staged token is an `org:course:run` triple; it fails closed when the token names a
      different run id than the wrapper's `--recovery-run-id`.
- [ ] **Step 2: Run them and watch each fail.**
- [ ] **Step 3: Implement** — replace the triple regex with `^catalog:${uuid_v4_pattern}$` and add the
      equality check against the run's recovery run id; `bash -n` must stay clean.
- [ ] **Step 4: Run the suite green.**
- [ ] **Step 5: Commit** `feat(q12): validate the staged catalog acceptance token in the forward tail`.

### Task 7: docs, beads, closeout

**Files:**

- Modify: `docs/superpowers/specs/2026-07-12-q12-source-recovery-design.md` (new
  `## Amendment 2026-07-25 — file_catalog-only accepted coverage`),
  `docs/qdrant/q12-window-operator-runbook-v2.md` (§0 note + §1.8/§1.9 preconditions),
  `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0-c0-window-operator-procedure.md` (placeholder table),
  `.codex/handoff.md` (current state + `Explicit defers` → `mc2-8m90f`)

- [ ] **Step 1:** write the amendment: the two live contradictions, the chosen contract, what is dropped
      (the downstream Stage-4 zero-evidence card statement → `mc2-8m90f`), and why the manifest stays frozen.
- [ ] **Step 2:** update the runbook precondition §1.8 to the `catalog:<recovery-run-id>` staging format and
      §1.9 to the `file_catalog` read the emit CLI performs.
- [ ] **Step 3:** run the full gates: `pnpm type-check`, the six affected suites, `sha256sum` on the frozen
      manifest, `python3.13 -m py_compile`, `bash -n`.
- [ ] **Step 4:** targeted correctness review of the whole diff (risk triggers: public contract + live data + window-critical), then `/push-dev`.
- [ ] **Step 5:** close `mc2-tpdog`, unblock `mc2-gyde8`, record `docs-reviewed` / `graph-reviewed`.

## Self-review

- Spec coverage: both live contradictions are addressed (ledger non-existence → `file_catalog` source;
  six scopes vs one slot → scopes from the manifest, token identifies the recovery run). The dropped
  downstream guarantee is tracked in `mc2-8m90f`, not silently lost.
- Type consistency: `acceptedCoverageScopes`, `AcceptedFailedCoverageScopeBinding.entries`,
  `parseAcceptedCoverageAuthority` and `coverage_run` are used with the same names in Tasks 1-6.
- Redeploy note: Tasks 2-6 change the deployed server closure (controller, wrapper, emit runtime), so the
  window needs a redeploy + a fresh `plan` run; the plan's structural sha will legitimately change
  (fixture `<accepted-coverage-run>` differs), while the frozen manifest sha must not.
