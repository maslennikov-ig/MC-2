---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13.4.1-reindex
stage_id: mc2-jz6y0
agent_type: search_data_correctness_worker
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: audited source classification, resume identity, and pre-enqueue durability are high-risk data correctness boundaries
repo: mc2
branch: codex/q12-source-recovery-reindex
base_branch: codex/q12-source-recovery-core
base_commit: cfce2c1c
worktree: /home/me/code/mc2/.worktrees/q12-source-recovery-reindex
write_zone:
  - packages/course-gen-platform/tools/qdrant/reindex-plan.ts
  - packages/course-gen-platform/tools/qdrant/reindex-course-embeddings.ts
  - packages/course-gen-platform/tests/unit/tools/qdrant/reindex-plan.test.ts
  - packages/course-gen-platform/tests/unit/tools/qdrant/reindex-course-embeddings.test.ts
  - this artifact
success_criteria:
  - exact audited-failure classification keeps generic failed rows unresolved
  - no allow-gaps bypass remains in API or CLI
  - all modes fail closed without canonical verified recovery binding
  - schema-v3 resume artifact binds recovery identity, audited counts, and verification fingerprint
  - reindex_started is validated and durably confirmed before first enqueue
selected_docs:
  - docs/superpowers/specs/2026-07-12-q12-source-recovery-design.md
  - docs/superpowers/plans/2026-07-12-q12-source-recovery.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1-core-final-review.md
selected_skills:
  - superpowers:executing-plans
  - superpowers:test-driven-development
  - superpowers:systematic-debugging
  - code-review
  - superpowers:verification-before-completion
selected_agents:
  - search_data_correctness_worker
catalog_candidates:
  - none - approved local contracts and installed workflow skills fully cover the stream
parallel_group: q12-source-recovery-dependent-streams
depends_on_streams:
  - mc2-jz6y0.13.4.1-core
parallel_decision: sequential within stream - plan and execution share one recovery-binding and resume contract
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: cleaned
cleanup_notes: all temporary dependency symlinks were removed before commit; tracked write zone only remains
risk_level: high
docs_impact: api-contract
docs_reviewed: no-change-needed
docs_review_notes: behavior implements the already approved Q12 design; durable operator documentation belongs to the integration stream
graph_reviewed: blocked
graph_review_notes: Graphify data is absent in this isolated worktree and parent integration owns the safe post-merge graph refresh
verification:
  - baseline focused reindex tests: passed 41/41
  - plan RED: passed with 4 expected contract failures
  - plan GREEN: passed 18/18
  - schema-v3 and binding RED: passed with expected binding, schema, ordering, and resume failures
  - schema-v3 and binding GREEN: passed 47/47
  - stop-rule RED: passed with 4 expected side-effect and stale-ledger failures
  - aggregate-only CLI RED: passed by reproducing full identity and hash exposure
  - focused reindex GREEN after corrections: passed 52/52
  - core plus reindex regression: passed 70/70
  - package type-check: passed
  - focused Prettier and git diff check: passed
  - self code-review: passed with P0/P1/P2/P3 zero after aggregate-only CLI correction
changed_files:
  - packages/course-gen-platform/tools/qdrant/reindex-plan.ts
  - packages/course-gen-platform/tools/qdrant/reindex-course-embeddings.ts
  - packages/course-gen-platform/tests/unit/tools/qdrant/reindex-plan.test.ts
  - packages/course-gen-platform/tests/unit/tools/qdrant/reindex-course-embeddings.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1-reindex.md
explicit_defers:
  - concrete recovery manifest/journal and accepted Stage 4 coverage repository adapters are integration-owned after both dependent streams merge
---

# Summary

The reindex planner now distinguishes six exact, fully verified audited source
failures from ordinary missing or invalid source gaps. The accepted complete
truth is `240 eligible = 234 recoverable + 6 audited_failed`, while raw source
diagnostics remain four missing and two invalid and unresolved eligible gaps are
zero. Generic failed status or error text never qualifies by itself.

Every command mode requires an injected recovery binding. The planner
recomputes the canonical immutable-manifest digest and checks the progress
journal binding, exact verified disposition and failed-coverage sets, and exact
row owner/course/hash/path/status/error predicates. Candidate and parity IDs
contain only recoverable documents. CLI output is aggregate-only and excludes
source paths, full identities, manifest hashes, and verification fingerprints.

Execution artifacts use schema v3 and persist the recovery run binding, audited
counts, and deterministic verification fingerprint. Fresh execution accepts
only a coherent verified journal. Resume accepts reindex_started only when the
durable artifact has the same binding, fingerprint, and stable audited counts.
Unresolved gaps block execute and verify before external reads or writes. Fresh
execution validates and confirms the verified-to-reindex_started journal
transition before the first queue enqueue.

# Scope / Routing

No Qdrant API shape changed, so version-sensitive first-party documentation was
not needed. No database, Stage 4, recovery-core, package, Compose, operator,
documentation, Beads, or remote runtime state was modified. The accepted Stage
4 seam remains the injected exact failed-coverage identity set; integration
will source it from the accepted evidence run and items repository.

# Verification

Strict TDD recorded separate RED and GREEN cycles for plan classification,
projection, missing binding, schema-v3 persistence, resume fingerprint/count
drift, unresolved-gap side-effect blocking, journal-before-enqueue ordering,
and aggregate-only CLI output. The final regression covers the accepted core
plus reindex contract. Package type-check and focused formatting/whitespace
checks pass.

# Delivery / Cleanup

The branch is prepared for parent review and merge. No live database, Qdrant,
queue, filesystem recovery, reindex, deploy, or staging operation was invoked.
All temporary dependency links were removed before commit.

# Risks / Follow-ups / Explicit Defers

The concrete loader/persistence adapter and Stage 4 accepted-run query are
intentionally integration-owned seams, not permissive defaults. The default
reindex dependencies return no binding and therefore fail closed. Combined
review must verify those adapters preserve canonical parsing, journal revision
confirmation, tenant/run coverage binding, and the pre-enqueue ordering proved
here.
