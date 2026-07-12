---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13.4.1.5
stage_id: mc2-jz6y0
agent_type: source_recovery_acceptance_worker
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: exact recovery cardinality, durable crash reconciliation, tenant CAS, accepted evidence provenance, reindex binding, and guarded rollback form one high-risk state contract
repo: mc2
branch: codex/q12-source-recovery-acceptance
base_branch: codex/self-hosted-qdrant-platform
base_commit: 25397d4cfc2af98a0cd84f56f26ae8fff056b2f5
resolves_review: 2c861d34
worktree: /home/me/code/mc2/.worktrees/q12-source-recovery-acceptance
write_zone:
  - packages/course-gen-platform/tests/unit/tools/qdrant/source-recovery-acceptance.test.ts
  - this artifact
success_criteria:
  - exact local 261/240/109/129/2/21 to 261/240/234/4/2/21 source truth
  - 42 no-replace copies restore 125 logical rows and survive a publish-before-checkpoint stop
  - exact 6+18 dispositions use tenant-aware CAS and reject cross-tenant drift without partial state
  - exactly six accepted metadata-only failed cards remain grouped by reviewed organization/course scope
  - concrete reindex binding proves 234+6=240 with zero unresolved eligible gaps
  - guarded pre-reindex rollback preserves a replacement inode, resumes, and removes only manifest-created targets
selected_docs:
  - AGENTS.md
  - .codex/orchestrator.toml
  - .codex/handoff.md
  - docs/superpowers/specs/2026-07-12-q12-source-recovery-design.md
  - docs/superpowers/plans/2026-07-12-q12-source-recovery.md
  - accepted source recovery core, workflow, crash, evidence, reindex, adapter, and runtime artifacts
selected_skills:
  - superpowers:receiving-code-review
  - superpowers:test-driven-development
  - systematic-debugging
  - senior-architect
  - test-pass
  - superpowers:verification-before-completion
  - generate-report-header
  - validate-report-file
  - format-commit-message
selected_agents:
  - source recovery acceptance worker
catalog_candidates:
  - none - installed skills and accepted public repository seams fully cover the local acceptance task
parallel_decision: sequential - the single synthetic truth fixture binds filesystem, journal, disposition, evidence, and reindex identities; rollback uses a separate fixture to avoid mutating forward evidence
status: accepted
delivery_method: cherry-pick
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: implementation, negative-review, and rereview worktrees plus local branches were removed after fresh integration verification; pushed remote evidence branches remain
risk_level: high
docs_impact: tests-only
docs_reviewed: no-change-needed
docs_review_notes: production behavior, CLI, API, schema, operator workflow, and deployment contracts are unchanged; this stream adds acceptance evidence only
graph_reviewed: blocked
graph_review_notes: graphify-out/GRAPH_REPORT.md is absent from this dedicated worktree; the tests-only stream makes no architecture or durable production change requiring a graph refresh
verification:
  - TDD RED: acceptance fixture failed exactly on the explicit not-implemented boundary
  - focused acceptance GREEN: passed 2/2
  - accepted recovery/crash/reindex integration plus acceptance: passed 455/455 across nine files
  - course-gen-platform package type-check: passed
  - focused Prettier and git diff --check: passed
  - self code-review: P0 0, P1 0, P2 0, P3 0
  - delegated artifact validation: passed
  - repository process verification: passed
  - correction review 2c861d34 RED: adapter query log was empty and residue matcher detected only 1/5 sentinel classes
  - correction focused acceptance GREEN: passed 3/3
  - correction accepted recovery/crash/reindex integration plus acceptance: passed 456/456 across nine files
  - correction course-gen-platform package type-check: passed
  - correction focused Prettier, git diff, delegated artifact, and repository process verification: passed
  - correction self-review: P0 0, P1 0, P2 0, P3 0
changed_files:
  - packages/course-gen-platform/tests/unit/tools/qdrant/source-recovery-acceptance.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1.5.md
explicit_defers:
  - no implementation defer; authorized staging execution remains a separate Q12 live gate
---

# Source Recovery Acceptance Report: mc2-jz6y0.13.4.1.5

**Generated**: 2026-07-13T01:50:31+03:00
**Status**: ✅ success
**Version**: mc2-jz6y0.13.4.1.5

## Executive Summary

The disposable local acceptance harness composes the accepted public recovery,
filesystem, manifest/journal, disposition database, Stage 4 evidence, and
reindex planning seams. It proves the exact reviewed corpus equation and the
forward, interrupted-resume, tenant-isolation, and guarded-rollback paths
without containers, ports, live services, remote state, or production edits.

# Summary

The forward fixture creates separate temporary development, production,
owner-only state, and capability roots. Its 261 deterministic catalog rows
start at `240 eligible = 109 recoverable + 129 missing + 2 invalid`, with 21
unsupported rows. Forty-two reviewed files cover 125 logical rows; the first
target covers 84 rows and the remaining 41 cover one each.

The first execute stops after the seventeenth physical no-replace publication
but before its journal checkpoint. Durable truth therefore contains 16
published journal states and 17 exact targets. Resume reconciles that target
without republishing it: the inode remains unchanged, total publish calls are
exactly 42, and post-copy truth is `240 = 234 + 4 + 2` with zero run-bound
temporary files.

## Detailed Findings

The exact 24 reviewed dispositions are applied through
`createRecoveryDispositionDatabase()` and `applyDispositionEntry()`: six
eligible unrecoverable rows plus 18 retained-derived Career Playbook rows. A
cloned cross-tenant row fails its protected CAS with no mutation and no durable
checkpoint. The accepted path verifies all 24 file rows and all 18 playbook
rows before the workflow advances to `verified`.

The six eligible failures are split across two real organization/course
scopes and passed through `runDocumentEvidencePreflight()`. The resulting two
accepted ledgers contain exactly six failed `metadata_only` cards with null
summary, empty evidence collections, and zero allocation. Their canonical
aggregate fingerprint binds the verified recovery journal to
`createSourceRecoveryReindexAdapters().loadRecoveryBinding()` over the real
manifest/journal files and the same accepted in-memory repository. The adapter
queries both accepted run scopes and their item ledgers, and its canonical
binding equals a separately constructed literal oracle before it reaches
`buildReindexPlan()`. The plan returns 234 recoverable plus six audited
failures, zero unresolved eligible gaps, a concrete verification fingerprint,
and exit code zero without an allow-gaps path.

The separate rollback fixture runs before any reindex transition. Replacing
the last target with a different inode and bytes causes guarded rollback to
fail after persisting `rollback_planned`; the replacement remains. Restoring
the original manifest-created inode and resuming rolls back all 42 targets,
preserves the unrelated pre-existing production file byte-for-byte, restores
the exact pre-copy source counts, and leaves zero owned residue. Before each
fixture teardown, the harness requires an empty capability directory, exactly
manifest plus journal in the state directory, and exactly 42 forward or zero
rollback targets. A separate sentinel test proves detection of copy,
manifest/journal temporary, capability-probe, and `.manifest-created` residue.

## Correction for review 2c861d34

The P1 seam finding was reproduced when two accepted Stage 4 scopes produced
no concrete adapter repository queries. The acceptance repository now exposes
the accepted-run and item-list contract used by production. Its exact query
log proves both organization/course/run scopes, while the adapter reloads the
owner-only real manifest and journal, validates the configured recovery
identity and coverage fingerprint, and returns the only binding supplied to
the reindex planner. The independent literal oracle remains an assertion, not
the execution binding.

The P2 cleanup finding was reproduced with five sentinel files: the old
matcher returned only the copy temporary. The replacement recursively reports
all `*.tmp`, `.source-recovery-capability.*`, and `.manifest-created` entries.
Exact state, capability, and recovery directory assertions run before the
recursive fixture cleanup, so teardown can no longer hide workflow residue.
No production source, service, database, queue, Qdrant, Redis, container,
port, secret, Beads record, or remote environment was read or mutated.

# Verification

## Validation Results

- Focused acceptance test: ✅ 3/3 passed.
- Accepted recovery/crash/reindex suite plus acceptance: ✅ 456/456 passed
  across nine files.
- `@megacampus/course-gen-platform` type-check: ✅ passed.
- Focused Prettier and `git diff --check`: ✅ passed.
- Self-review: ✅ P0 0, P1 0, P2 0, P3 0.
- Network/runtime boundary: ✅ local temporary filesystem and in-memory ports
  only; no live or remote mutation.

**Overall**: ✅ PASSED

# Risks / Follow-ups

The harness deliberately uses public seam injection with an in-memory
tenant-aware database gateway and evidence repository. It does not claim a
live database, queue, Qdrant, Redis, container, deploy, or operator-service
test. Those runtime contracts are already owned by accepted adjacent streams.

## Integrated State

The correction was independently accepted by rereview `7a808fc2` with P0-P3
zero and integrated as `30d28ef2`. The joined integration evidence is 3/3
focused and 456/456 recovery/reindex tests. The implementation, negative-review,
and rereview worktrees plus their local branches were removed after acceptance;
the pushed evidence branches remain. The immutable negative review decision at
`2c861d34` remains returned and is resolved only through the linked correction
and rereview history.
