---
schema_version: orchestration-artifact/v1
artifact_type: delegated-review
task_id: mc2-jz6y0.13.4.1.4
stage_id: mc2-jz6y0
agent_type: correctness_reviewer
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: multi-ledger tenant provenance, durable journal CAS, reindex resume compatibility, and aggregate-only operator output are high-risk cross-module contracts
repo: mc2
branch: codex/q12-source-recovery-adapters-review
base_branch: codex/q12-source-recovery-adapters
base_commit: 06628064a952651a405cf9a94b7957a4d7d404fb
worktree: /home/me/code/mc2/.worktrees/q12-source-recovery-adapters-review
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1.4-review.md
success_criteria:
  - review f4a1d0ae..06628064 implementation against approved source-recovery design and plan
  - verify multi-ledger course and organization truth with exactly six identities
  - verify service-role repository scope, canonical schema-v4 fingerprints, and fail-closed resume
  - verify durable journal CAS reload and aggregate-only CLI privacy
  - return PASS only when P0 through P3 are all zero
selected_docs:
  - AGENTS.md
  - .codex/orchestrator.toml
  - .codex/handoff.md
  - graphify-out/GRAPH_REPORT.md from the integration workspace
  - docs/superpowers/specs/2026-07-12-q12-source-recovery-design.md
  - docs/superpowers/plans/2026-07-12-q12-source-recovery.md
  - accepted workflow, reindex, evidence, and PostgreSQL final-review artifacts
selected_skills:
  - code-review
  - superpowers:verification-before-completion
  - test-pass
selected_agents:
  - correctness_reviewer
catalog_candidates:
  - none - installed review skills and accepted repository contracts cover the review
parallel_decision: sequential - immutable diff inspection, adversarial reproduction, verification, and verdict share one correctness decision
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: review worktree and branch remain for orchestrator consumption; temporary dependency symlinks are removed before commit
risk_level: high
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: read-only review; the approved source-recovery specification already requires exact course-scoped ledger cardinality
graph_reviewed: used
graph_review_notes: read the integration workspace Graphify report for orientation; this artifact-only review owns no graph refresh
verification:
  - exact f4a1d0ae..06628064 seven-file diff and relevant history reviewed
  - focused adapters, plan, and command tests passed 104/104 across three files
  - combined recovery plus reindex regression passed 145/145 across seven files
  - course-gen-platform package type-check passed
  - adversarial extra-empty-ledger reproduction passed unexpectedly with auditedFailed=6 and unresolved=0
  - git diff --check f4a1d0ae..06628064 passed
  - delegated artifact validation passed
  - repository process verification passed
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1.4-review.md
explicit_defers:
  - implementation correction and re-review are required before acceptance
  - no production code, tests, database, Qdrant, Redis, deploy, or live state is modified by this reviewer
---

# Summary

**Verdict: NEEDS_WORK.** P0: 0, P1: 0, P2: 1, P3: 0. The default
database-backed adapter correctly derives one accepted ledger per exact
course/organization scope, checks the six document identities and zero-evidence
card shape, and reloads the protected journal after CAS. However, the shared
`RecoveryReindexBinding` validator does not require its ledger scope set to
equal the manifest's eligible-disposition scope set. An injected or dry-fixture
binding can therefore add an unrelated empty accepted ledger, obtain a valid
canonical fingerprint, pass reindex planning with zero unresolved gaps, and
persist the unrelated ledger ID in the schema-v4 execution artifact.

| Priority | Findings | Integration effect |
| -------- | -------: | ------------------ |
| P0       |        0 | none               |
| P1       |        0 | none               |
| P2       |        1 | blocks PASS        |
| P3       |        0 | none               |

# Findings

## P2 — The shared binding validator accepts unrelated empty accepted ledgers

- **File:**
  `packages/course-gen-platform/tools/qdrant/reindex-plan.ts:242`
- **Evidence:** `validateRecoveryBinding()` validates that ledger IDs and
  ledger scopes are individually unique, then flattens entries and proves that
  the flattened document IDs equal the six eligible dispositions. It verifies
  a ledger scope only while iterating that ledger's entries. A ledger with an
  empty `entries` array therefore never reaches the scope-to-disposition check.
  `calculateAcceptedFailedCoverageFingerprint()` canonically includes this
  ledger, and `buildReindexPlan()` copies its ID into
  `acceptedCoverageLedgerIds`.
- **Reproduction:** an in-memory binding containing one valid ledger with all
  six eligible entries plus a second accepted ledger for another course with
  `entries: []` returned
  `{"auditedFailed":6,"ledgerIds":[<valid>,<unrelated>],"unresolved":0}`.
  No database, queue, Qdrant, or filesystem mutation was used.
- **Impact:** fixture and other injected `ReindexCommandDependencies` can claim
  a provenance ledger that covers none of the reviewed dispositions while
  still producing a successful plan and schema-v4 resume artifact. The default
  production adapter's `assertExactScopes()` prevents this construction, so
  this is not a direct live-path bypass, but the shared validation and fixture
  evidence are not truthful to the approved "one accepted ledger per exact
  course/organization group" contract.
- **Required fix:** in `validateRecoveryBinding()`, derive the unique sorted
  `organization_id:course_id` set from the six eligible manifest dispositions
  and require it to equal the unique sorted ledger scope set before accepting
  the binding. This also rejects empty extra ledgers and missing scopes. Add a
  regression to `reindex-plan.test.ts` and a dry-fixture regression proving an
  unrelated empty ledger fails closed before planning or artifact publication.

# Accepted Behavior Confirmed

- The default adapter requires normalized absolute manifest/journal paths,
  strict lower-case UUIDv4 identities, lower-case SHA-256 values, unique run
  IDs, and exact configured manifest scopes.
- `DocumentEvidenceRepository.getAcceptedRun()` is called with exact run,
  course, and organization identity; terminal evidence runs are immutable and
  item reads remain bound by their unique run ID.
- Missing, rejected, stale, duplicate, cross-tenant, malformed, or non-zero
  evidence cards fail closed in the default adapter.
- The aggregate fingerprint is stable under ledger/entry ordering and binds
  recovery run, manifest SHA, accepted status, ledger IDs/scopes, and the exact
  zero-evidence fields used by reindex.
- Schema v4 requires a non-empty unique sorted ledger-ID array; old schema-v3
  artifacts fail parse rather than resuming permissively.
- Journal persistence reopens protected state after the accepted CAS and both
  adapter and command layers compare the exact reloaded journal before
  advancing.
- The live default dependency factory rejects absent recovery configuration.
  CLI success and error paths emit bounded aggregate output without run, file,
  path, hash, target, raw mismatch, or repository-error identities.

# Verification

- `SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=ci-placeholder pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/tools/qdrant/source-recovery-reindex-adapters.test.ts tests/unit/tools/qdrant/reindex-plan.test.ts tests/unit/tools/qdrant/reindex-course-embeddings.test.ts`
  passed 3 files and 104/104 tests: adapter 20, plan 19, command 65.
- The seven-file recovery/reindex command passed 145/145 tests: database 6,
  manifest 15, filesystem 8, adapter 20, workflow 12, plan 19, command 65.
- `pnpm --filter @megacampus/course-gen-platform type-check` passed after
  linking the already-installed integration dependencies temporarily; no
  dependency or lockfile installation occurred.
- `git diff --check f4a1d0ae..06628064` passed.
- The adversarial evaluation used the real
  `calculateAcceptedFailedCoverageFingerprint()` and `buildReindexPlan()`
  functions against six exact failed rows. It exited zero and printed the
  unexpected accepted aggregate described above.

# Delivery / Cleanup

Only this immutable review artifact is owned by the reviewer. Temporary
dependency symlinks and test caches are removed before delivery. The review did
not edit implementation, tests, specifications, plans, Beads, database state,
Qdrant, Redis, queues, upload roots, services, or any remote/live environment.

# Risks / Follow-ups / Explicit Defers

There is no justified defer for the P2 because the correction is narrow and
the approved contract explicitly requires exact ledger-scope cardinality.
After correction, an independent delta review must rerun the exact negative
fixture and focused recovery/reindex matrix before orchestrator acceptance.
