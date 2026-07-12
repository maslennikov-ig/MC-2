---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13.4.1.4
stage_id: mc2-jz6y0
agent_type: search_data_correctness_worker
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: accepted evidence provenance, tenant binding, aggregate cardinality, and crash-durable journal transitions are high-risk cross-module state
repo: mc2
branch: codex/q12-source-recovery-adapters
base_branch: codex/self-hosted-qdrant-platform
base_commit: f4a1d0ae9f1c62b983d9c3410824d8155d6f98a1
resolves_review: fffbfc6034606c4529395a869f5d15162070608e
worktree: /home/me/code/mc2/.worktrees/q12-source-recovery-adapters
write_zone:
  - packages/course-gen-platform/tools/qdrant/source-recovery-reindex-adapters.ts
  - packages/course-gen-platform/tools/qdrant/reindex-plan.ts
  - packages/course-gen-platform/tools/qdrant/reindex-course-embeddings.ts
  - packages/course-gen-platform/tests/unit/tools/qdrant/source-recovery-reindex-adapters.test.ts
  - packages/course-gen-platform/tests/unit/tools/qdrant/reindex-plan.test.ts
  - packages/course-gen-platform/tests/unit/tools/qdrant/reindex-course-embeddings.test.ts
  - this artifact
success_criteria:
  - default reindex loads exact protected recovery state and accepted Stage 4 evidence instead of a null binding
  - crash-durable journal CAS is independently reloaded and compared before success
  - exactly six failed metadata-only zero-allocation cards remain tenant/course/document bound
  - course-scoped accepted evidence runs form a canonical sorted multi-ledger aggregate
  - strict explicit lower-case UUIDv4 and SHA-256 configuration fails closed
  - aggregate-only CLI errors and no live network calls in tests
selected_docs:
  - AGENTS.md
  - .codex/orchestrator.toml
  - .codex/handoff.md
  - docs/superpowers/specs/2026-07-12-q12-source-recovery-design.md
  - docs/superpowers/plans/2026-07-12-q12-source-recovery.md
  - accepted workflow, reindex, evidence, and PostgreSQL correction artifacts
  - DocumentEvidenceRepository getAcceptedRun/listItems contract
  - document_evidence_runs/items migration constraints and triggers
selected_skills:
  - superpowers:test-driven-development
  - systematic-debugging
  - code-review
  - superpowers:verification-before-completion
selected_agents:
  - search/data correctness worker
catalog_candidates:
  - none - installed workflow skills and accepted repository contracts cover the task
parallel_decision: sequential - adapter, typed aggregate seam, artifact schema, and default CLI wiring share one provenance contract
status: accepted
delivery_method: cherry-pick
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: implementation, review, and rereview worktrees plus local branches were removed after fresh integration verification; pushed remote evidence branches remain
risk_level: high
docs_impact: api-contract
docs_reviewed: no-change-needed
docs_review_notes: operator/runtime/runbook wiring is owned by the adjacent runtime stream; this task exposes exact CLI option names in built-in help and changes only the internal reindex artifact schema
graph_reviewed: blocked
graph_review_notes: graphify-out/GRAPH_REPORT.md is absent from this dedicated worktree; no graph refresh is safe or owned here
verification:
  - adapter TDD RED: expected missing-module failure
  - adapter GREEN: passed 20/20
  - multi-ledger artifact/CLI RED: 18 expected failures before schema-v4/default wiring
  - reindex plan GREEN: passed 19/19
  - reindex command GREEN: passed 65/65
  - recovery plus reindex regression: passed 145/145 across seven files
  - evidence repository plus Stage 4/5/6 regression: passed 132/132 across seven files
  - course-gen-platform package type-check: passed
  - self code-review: P0 0, P1 0, P2 0, P3 0
  - focused Prettier and git diff --check: passed
  - delegated artifact validation: passed
  - repository process verification: passed
  - correction RED for review fffbfc60: pure plan accepted an unrelated empty ledger and dry-fixture execute advanced to artifact state checks
  - correction focused GREEN: passed 85/85 across reindex plan and command tests
  - correction recovery plus reindex regression: passed 146/146 across seven files
  - correction evidence repository plus Stage 4/5/6 regression: passed 132/132 across seven files
  - correction course-gen-platform package type-check: passed
  - correction self code-review: P0 0, P1 0, P2 0, P3 0
  - independent delta rereview 4dc3edd2: PASS with P0 0, P1 0, P2 0, P3 0
  - fresh integration recovery plus reindex regression: passed 146/146 across seven files
  - fresh integration course-gen-platform package type-check: passed
  - fresh integration artifact and process verification: passed
changed_files:
  - packages/course-gen-platform/tools/qdrant/source-recovery-reindex-adapters.ts
  - packages/course-gen-platform/tools/qdrant/reindex-plan.ts
  - packages/course-gen-platform/tools/qdrant/reindex-course-embeddings.ts
  - packages/course-gen-platform/tests/unit/tools/qdrant/source-recovery-reindex-adapters.test.ts
  - packages/course-gen-platform/tests/unit/tools/qdrant/reindex-plan.test.ts
  - packages/course-gen-platform/tests/unit/tools/qdrant/reindex-course-embeddings.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1.4.md
explicit_defers:
  - adjacent runtime stream must pass the exact CLI configuration through the pinned operator service; no Compose, entrypoint, wrapper, database, Qdrant, Redis, or remote state was modified here
---

# Summary

The default reindex path now constructs concrete source-recovery adapters from
explicit protected manifest/journal paths, exact recovery run and manifest SHA,
an exact accepted-coverage fingerprint, and one accepted Stage 4 run ID per
course/organization scope. It uses the accepted owner-only workflow loader and
`DocumentEvidenceRepository.getAcceptedRun()` plus `listItems()`; a missing,
rejected, stale, duplicate, cross-tenant, or malformed binding stops before
source planning or enqueue.

Journal writes call the accepted crash-durable CAS implementation with the
freshly reloaded manifest/current journal, then independently reopen the
protected files and compare the exact persisted next journal. Returning or
echoing `next` without the filesystem reload cannot satisfy the adapter.

# Product-Truth Decision

`document_evidence_runs` is course- and organization-scoped, with one durable
item ledger per run and `(run_id, document_id)` uniqueness. The six recovery
dispositions are not repository-proven to share one course. The prior single
`ledgerId` seam therefore could invent a global evidence run.

The accepted coverage binding is now a canonical sorted aggregate of one
accepted ledger per exact course/organization group. Every ledger has a strict
lower-case UUIDv4 run ID, accepted status, exact tenant/course scope, and its
subset of the six exact document IDs. The aggregate fingerprint covers recovery
run, manifest SHA, ledger IDs/scopes/statuses, and the complete zero-evidence
card shape. Reindex artifacts advance from schema v3 to v4 and store the sorted
ledger-ID array; old single-ledger artifacts fail closed.

# Integration Input Contract

The non-fixture CLI requires all of the following together:

- `--recovery-manifest-path <absolute normalized path>`
- `--recovery-journal-path <absolute normalized path>`
- `--recovery-run-id <lower-case UUIDv4>`
- `--recovery-manifest-sha256 <lower-case 64-hex>`
- `--accepted-coverage-fingerprint <lower-case 64-hex>`
- one repeated
  `--accepted-coverage-run <organization_uuid:course_uuid:run_uuid>` for every
  exact course scope represented by the six eligible dispositions.

Fixture mode remains local and injected. The ordinary default dependency path
has no null/permissive recovery adapter and rejects incomplete configuration.

# Verification and Safety

Strict TDD covered happy-path two-ledger aggregation; missing/rejected/stale
runs; recovery run/SHA/fingerprint drift; missing, duplicate, and cross-tenant
configuration; exact card status/reason/mode/summary/claims/terminology/
constraints/allocation shape; missing/extra document identities; journal echo;
and exact persisted reload. Existing recovery/reindex and Stage 4/5/6 tests are
preserved. Tests use filesystem/repository fakes only and make no live network
calls.

CLI errors remain bounded codes and never print protected paths, run IDs,
document IDs, manifest hashes, coverage fingerprints, source text, or raw
repository errors. No remote database, source root, queue, Qdrant, service,
deploy, or alias was read or mutated.

# Risks / Follow-ups

Independent review must confirm the schema-v4 aggregate seam, durable repository
scope proof, and accepted workflow reload/CAS use before orchestrator
acceptance. The adjacent runtime stream must pass the exact repeated CLI inputs
through the pinned operator without adding a permissive fallback.

# Correction for review fffbfc60

The independent review reproduced one P2 in the shared binding validator: a
canonical binding could append an unrelated accepted ledger with zero entries.
The flattened six document IDs still matched, and entry-level tenant checks
never visited the empty ledger. The default database adapter already rejected
this shape, but injected and dry-fixture dependencies could persist the
unrelated ledger ID in schema-v4 provenance.

Two RED regressions reproduced the shared-seam defect. The pure plan reached a
later post-recovery count check instead of rejecting ledger scope, and the local
dry-fixture execute reached artifact-state validation instead of failing at
recovery binding validation. No live service or network was used.

`validateRecoveryBinding()` now derives the unique sorted
`organization_id:course_id` set from the exact six eligible manifest
dispositions and requires byte-equal set membership with the unique sorted
accepted-ledger scopes before flattening entries or planning. Extra empty
ledgers, missing course ledgers, and unrelated tenant/course scopes therefore
fail before plan or artifact publication. The correction preserves the default
adapter, aggregate fingerprint, schema-v4 artifact, and bounded CLI output.
