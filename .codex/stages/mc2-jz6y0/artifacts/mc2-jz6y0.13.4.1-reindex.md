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
resolves_review:
  - b82a09f8
  - 8b419f19
cleanup_status: pending
cleanup_notes: local dependency symlinks are removed before commit; branch/worktree cleanup waits for root acceptance
risk_level: high
docs_impact: api-contract
docs_reviewed: no-change-needed
docs_review_notes: behavior implements the already approved Q12 design; durable operator documentation belongs to the integration stream
graph_reviewed: blocked
graph_review_notes: Graphify data is absent in this isolated worktree and parent integration owns the safe post-merge graph refresh
verification:
  - durability and ledger-coherence RED: 6 expected failures
  - durability and ledger-coherence GREEN: passed 7/7
  - journal reload, crash-state, and terminal-phase RED: 3 expected failures
  - journal reload, crash-state, and terminal-phase GREEN: passed 3/3
  - accepted failed-coverage binding RED: 2 expected failures
  - accepted failed-coverage binding GREEN: passed 2/2
  - lowercase UUIDv4 and course-scope removal RED: 4 expected failures
  - lowercase UUIDv4 and course-scope removal GREEN: passed 4/4
  - bounded CLI output and errors RED: 5 expected failures
  - bounded CLI output and errors GREEN: passed 5/5
  - focused reindex command regression after review corrections: passed 56/56
  - core plus reindex regression: passed 93/93
  - accepted terminal coverage status correction RED: 2 expected failures
  - accepted terminal coverage status correction GREEN: passed 2/2
  - secure existing-artifact load correction RED: 4 expected failures
  - secure existing-artifact load correction GREEN: passed 5/5
  - immutable source-ledger resume correction RED: 1 expected failure
  - immutable source-ledger resume correction GREEN: passed 1/1
  - aggregate-only CLI correction RED: 2 expected failures
  - aggregate-only CLI correction GREEN: passed 2/2
  - corrected core plus reindex regression: passed 100/100
  - package type-check: passed through the normal root pnpm command
  - focused Prettier and git diff check: passed
  - delegated artifact validation: passed
  - repository process verification: passed
  - post-cleanup git diff check: passed
  - self code-review: passed after correcting failed-ledger retry and cleanup-error bounding
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
journal binding, exact verified dispositions, and a typed accepted Stage 4
failed-coverage ledger whose terminal status is exactly `accepted`, bound to its
lowercase UUIDv4, recovery run, manifest SHA, canonical fingerprint,
tenant/course identities, and zero-evidence fields.
Candidate and parity IDs contain only recoverable documents. CLI output and all
error paths are aggregate-only and exclude source paths, target identities, raw
schema/relevance strings, full identities, job IDs, manifest hashes, and
verification fingerprints.

Execution artifacts use strict schema v3 and persist recovery and accepted
coverage bindings, audited counts, exact deterministic job IDs, and a coherent
status/count/subset ledger. Publication writes a mode-0600 same-directory temp,
fsyncs it, uses no-replace initial publication, and fsyncs the mode-0700
current-user-owned state directory. Journal transitions are accepted only after
an independent reload returns the exact persisted revision and contents. Crash
states between initial ledger and `reindex_started` are resumable, while stale
or incoherent ledgers stop before enqueue. Successful parity verification moves
the journal to unambiguous `complete`; complete plan/verify are idempotent and
execute is rejected. Existing artifacts are opened only through a real mode-0700
current-UID parent and a real mode-0600 current-UID file, with symlink,
descriptor identity, device, and inode checks. Immutable source counts remain
bound to the base plan across retained completed jobs; only accepted/completed
progress arrays advance, including persisted-ledger verification and a second
resume.

# Scope / Routing

No Qdrant API shape changed, so version-sensitive first-party documentation was
not needed. No database, Stage 4, recovery-core, package, Compose, operator,
documentation, Beads, or remote runtime state was modified. The accepted Stage
4 seam is a typed failed-coverage binding in the reindex files; integration
will source it from the accepted evidence run and item repositories.

# Verification

Strict TDD recorded separate RED and GREEN cycles for plan classification,
projection, missing binding, schema-v3 persistence, resume fingerprint/count
drift, unresolved-gap side-effect blocking, journal-before-enqueue ordering,
aggregate-only CLI output, accepted terminal coverage status, secure artifact
loading, and retained-completion resume stability. The final regression covers
the accepted core plus corrected reindex contract. Package type-check and
focused formatting/whitespace checks pass.

# Delivery / Cleanup

The branch is prepared for parent review and merge. No live database, Qdrant,
queue, filesystem recovery, reindex, deploy, or staging operation was invoked.
Temporary dependency links are removed before commit; branch/worktree cleanup
remains pending until root acceptance.

# Risks / Follow-ups / Explicit Defers

The concrete loader/persistence adapter and Stage 4 accepted-run query are
intentionally integration-owned seams, not permissive defaults. The default
reindex dependencies return no binding and therefore fail closed. Combined
review must verify those adapters preserve canonical parsing, journal revision
confirmation, tenant/run coverage binding, and the pre-enqueue ordering proved
here.
