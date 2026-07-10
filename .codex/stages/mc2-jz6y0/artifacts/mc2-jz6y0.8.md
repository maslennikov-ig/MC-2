---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.8
stage_id: mc2-jz6y0
agent_type: db_migration_specialist
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: Source recovery, tenant parity, deterministic queue identity, and pre-cutover physical-target routing are data-integrity critical.
repo: /home/me/code/mc2
branch: codex/qdrant-q7-reindex
base_branch: codex/self-hosted-qdrant-platform
base_commit: ea2f15816828fc72b69e203cf27ef6a3f68317bf
worktree: /home/me/code/mc2/.worktrees/qdrant-q7-reindex
write_zone:
  - packages/course-gen-platform/tools/qdrant/reindex-plan.ts
  - packages/course-gen-platform/tools/qdrant/reindex-course-embeddings.ts
  - packages/course-gen-platform/tests/unit/tools/qdrant
  - packages/shared-types/src/bullmq-jobs.ts
  - packages/course-gen-platform/src/stages/stage2-document-processing/phases/phase-6-qdrant-upload.ts
  - packages/course-gen-platform/tests/unit/stages/stage2-document-processing/phase-6-qdrant-upload.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage2-document-processing/orchestrator-phase-helpers.test.ts
  - packages/course-gen-platform/package.json
  - packages/course-gen-platform/src/shared/qdrant/collection-manager.ts
  - packages/course-gen-platform/tests/unit/shared/qdrant/collection-manager.test.ts
  - packages/course-gen-platform/src/shared/qdrant/index.ts
  - packages/course-gen-platform/src/shared/qdrant/upload-helpers.ts
  - packages/course-gen-platform/src/shared/qdrant/upload-types.ts
  - packages/course-gen-platform/src/shared/qdrant/lifecycle.ts
  - packages/course-gen-platform/tests/unit/shared/qdrant/upload-helpers.test.ts
  - packages/course-gen-platform/tests/unit/shared/qdrant/lifecycle-refcount.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.8.md
success_criteria:
  - Plan classifies recoverable, missing, unsupported, and already-enqueued identities deterministically without mutation.
  - Shared Stage 2 jobs carry optional validated physical target and run UUID while normal jobs retain alias-default upload behavior.
  - Execute rejects the logical alias, exact-verifies a physical target, uses deterministic bounded jobs, and writes a sanitized durable artifact.
  - Verify fails missing/extra IDs, course/organization count or tenant mismatches, schema drift, and absent/failed native RU or EN relevance.
  - Focused tests, dry CLI modes, builds, type-check, lint, artifact validation, hook, commit, and push pass without live mutation.
selected_docs:
  - docs/superpowers/specs/2026-07-10-self-hosted-qdrant-platform-design.md
  - docs/superpowers/plans/2026-07-10-self-hosted-qdrant-platform.md Task 7
  - .codex/stages/mc2-jz6y0/artifacts/authoritative-docs.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.3.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.4.md
  - graphify-out/GRAPH_REPORT.md from the primary checkout plus focused local graph queries
  - Local generated Supabase types/migrations, BullMQ 5.66.3 types, Zod 3.22.4, Qdrant 1.18.2/server and 1.18.0 client types
selected_skills:
  - superpowers:test-driven-development
  - superpowers:verification-before-completion
  - superpowers:using-git-worktrees
  - superpowers:systematic-debugging
  - senior-architect
selected_agents:
  - db_migration_specialist/data correctness worker; separate correctness reviewer follows
catalog_candidates:
  - none - assigned skills and persona covered the bounded stream
parallel_group: Q7 data/reindex parallel with Q5 pinned integration
depends_on_streams:
  - mc2-jz6y0.3
  - mc2-jz6y0.4
parallel_decision: parallel because Q5 owns only disjoint CI/integration files
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: Dedicated worktree and branch remain intact for independent review; no cleanup is permitted before acceptance.
risk_level: high
docs_impact: api-contract
docs_reviewed: no-change-needed
docs_review_notes: This changes the shared job/data-workflow contract, but the approved design already defines it and Q10 owns durable operator documentation after acceptance.
graph_reviewed: blocked
graph_review_notes: The isolated worktree has no graphify-out. The primary-checkout report was read and focused upload/Stage 2/schema queries were used, but refreshing the shared primary graph is unsafe during concurrent Q5/stage work and remains parent closeout work.
verification:
  - Baseline shared-types build, current Stage 2 tests (5), and course-gen-platform type-check before edits: passed.
  - Q2 physical-only verifier RED: 2 failed because the dedicated function was absent; GREEN: collection-manager suite passed 19 tests.
  - Shared job schema RED: valid target/run fields were stripped and invalid values accepted; GREEN: 3 contract tests passed.
  - Stage 2 target threading RED: explicit physical target was absent from upload options; GREEN: 5 upload tests passed, including normal alias-default behavior.
  - Stage 2 orchestrator-path regression: the same BullMQ Job carrying the physical target reaches Qdrant upload through executeVectorIndexing, not only a directly injected Phase 6 test.
  - Pure plan RED: reindex module absent; GREEN: deterministic recovery/gap/source-integrity/source-mapping tests passed.
  - Verify parity RED: verifier absent; GREEN: distinct IDs, tenant context, per-course/per-organization counts, schema, and RU/EN checks passed.
  - Execute RED: command module absent; GREEN: plan read-only, alias/run refusal, deterministic IDs, existing-job idempotency, default concurrency 2, artifact sanitization, and verify failure tests passed.
  - Dry fixture RED: loader absent; GREEN: validated fixture dependencies and no-live CLI routing passed.
  - Jina estimate RED: fixed /100 estimate contradicted token-aware Stage 2 batching; GREEN: known request bounds and explicit unknown maximum passed.
  - Independent Q7 review verdict `FAIL/FIX` was reproduced against source before correction; every Critical, Important, and Minor finding received a RED regression and no item was deferred.
  - Source enumeration RED: the single Supabase query could truncate at 1000; GREEN: ordered 500-row keyset pages, independent exact-count equality, course batches of at most 200, and a 1205-row adapter regression passed. A 1001-row integration proved the same paged loader feeds plan, execute, and verify without truncation.
  - Point identity RED: identical chunk IDs in different documents produced global 32-bit collisions; GREEN: upload and lifecycle duplication use deterministic document-scoped SHA-256 UUIDv8 IDs, with identical-content cross-document regressions.
  - Point-loss RED: verify accepted a present document with fewer points than `chunk_count`; GREEN: paged Qdrant scroll counts every point and per-document known counts plus total known/indexed points are strict verification inputs.
  - Processing concurrency RED: `--concurrency` bounded only `queue.add`; GREEN: default BullMQ handles separate acceptance from bounded terminal waits, default concurrency is 2, each wait has a bounded 2-hour default/24-hour maximum, and retained failed jobs are removed then retried.
  - Durable ledger RED: partial enqueue failure lost run truth; GREEN: schema-v2 mode-0600 manifest checkpoints planned/accepted/completed/failed/pending IDs before and during mutation, is target/run-bound, sanitizes failure state, and survives BullMQ retention.
  - Ledger fail-safe self-review RED/GREEN: accepted-only state missing from Redis is retried rather than inferred completed; only durable completed IDs are skipped. Pending includes accepted-not-terminal jobs, and failed status is monotonic under concurrent late completion so crash-time snapshots cannot downgrade to running.
  - Source path RED: absolute, traversal, and symlink escapes were treated as readable; GREEN: lexical plus realpath upload-root containment emits `invalid_source_path`, and the verified realpath is threaded into the Stage 2 job to close the symlink TOCTOU window.
  - Operator output RED: CLI printed JSON only; GREEN: sanitized PLAN/EXECUTE/VERIFY summaries go to stderr while machine-readable JSON remains isolated on stdout.
  - Large verify input self-review: native RU/EN relevance fixture reads batch source IDs by 200 and a >1000 regression reaches a late RU fixture without oversized `.in()` queries.
  - Pre-review focused baseline: 5 files and 50 tests passed before the independent `FAIL/FIX` review.
  - Review-fix focused suite after self-review: 7 files and 85 tests passed (`reindex-plan`, reindex command, upload identity, lifecycle duplication, Phase 6, orchestrator threading, and physical verifier).
  - CLI help and dry plan/execute/verify with TMPDIR=/tmp: passed; plan reported Jina request bounds 3..12, dry execute wrote a mode-0600 sanitized artifact with 2 mocked enqueues and 1 existing identity, and dry verify passed 3/3 parity and RU/EN checks.
  - Direct CLI gap semantics: passed with exit 2; pnpm lifecycle intentionally wraps a nonzero child status as 1, so the direct entrypoint was used to prove the application exit code.
  - Targeted typed ESLint: passed with zero errors; the expanded reviewed CLI boundary leaves two visible warnings (max-lines and execute complexity) and no disabled rules.
  - Root `pnpm lint`: passed with repository baseline warnings and no errors; targeted changed tools/tests had zero errors and one max-lines warning.
  - Root `pnpm type-check`: passed across all workspaces.
  - Root `pnpm build`: passed across all workspaces using the repository's canonical non-secret test Supabase environment; the preceding no-env attempt correctly stopped at existing web env validation.
  - Execute artifact scan: mode 0600 and no storage path, upload path, API/service key, secret, markdown, or content fields.
  - Prettier check across every changed TypeScript, JSON, package, and artifact file: passed.
  - Delegated artifact validator: passed.
  - `scripts/orchestration/run_process_verification.sh`: passed, including orchestration contract and `git diff --check`.
changed_files:
  - packages/shared-types/src/bullmq-jobs.ts
  - packages/course-gen-platform/src/shared/qdrant/collection-manager.ts
  - packages/course-gen-platform/src/shared/qdrant/index.ts
  - packages/course-gen-platform/src/shared/qdrant/upload-helpers.ts
  - packages/course-gen-platform/src/shared/qdrant/upload-types.ts
  - packages/course-gen-platform/src/shared/qdrant/lifecycle.ts
  - packages/course-gen-platform/src/stages/stage2-document-processing/phases/phase-6-qdrant-upload.ts
  - packages/course-gen-platform/tools/qdrant/reindex-plan.ts
  - packages/course-gen-platform/tools/qdrant/reindex-course-embeddings.ts
  - packages/course-gen-platform/package.json
  - packages/course-gen-platform/tests/unit/shared/qdrant/collection-manager.test.ts
  - packages/course-gen-platform/tests/unit/shared/qdrant/upload-helpers.test.ts
  - packages/course-gen-platform/tests/unit/shared/qdrant/lifecycle-refcount.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage2-document-processing/phase-6-qdrant-upload.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage2-document-processing/orchestrator-phase-helpers.test.ts
  - packages/course-gen-platform/tests/unit/tools/qdrant/reindex-plan.test.ts
  - packages/course-gen-platform/tests/unit/tools/qdrant/reindex-course-embeddings.test.ts
  - packages/course-gen-platform/tests/unit/tools/qdrant/fixtures/reindex-dry-fixture.json
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.8.md
explicit_defers:
  - Q5 pinned runtime integration is independently accepted; this Q7 review-fix pass intentionally used only injected mocks and dry fixtures before the explicitly authorized compatibility merge/gate.
  - Q10 owns durable operator documentation after acceptance; Q12 owns any live reindex, alias cutover, deploy, or staging mutation with explicit authorization.
---

# Summary

Implemented source-driven Qdrant recovery planning, bounded deterministic execute jobs, and strict verify parity without contacting live Supabase, Redis, Jina, or Qdrant in this task. The shared Stage 2 contract carries an optional physical target and reindex run UUID; upload forwards the target only when present, so normal jobs still use the stable alias default.

Plan derives only from paged `file_catalog` metadata, canonical realpath-contained upload storage, and batched `courses.user_id/language`. Exact source count mismatches fail closed. Missing files, invalid paths, unsupported Stage 2 formats, missing ownership, and file/course tenant mismatches are explicit gaps. Point estimates report known `chunk_count` plus unknown counts; Jina volume is a bounded range because the production embedder batches by an 8194-token limit rather than a fixed chunk count.

Execute refuses the logical alias and invalid run UUIDs before source or service reads, exact-verifies the physical schema through the authorized Q2 read-only API, and limits actual in-flight Stage 2 jobs to two by awaiting terminal QueueEvents with bounded timeouts. Its target-bound schema-v2 mode-0600 ledger checkpoints sanitized planned/accepted/completed/failed/pending truth monotonically; only durable completed jobs survive retention as skip evidence. Verify scrolls and counts all points, checks per-document `chunk_count`, tenant/course/organization parity, exact schema, and one native hybrid relevance check for each RU and EN. Global point identity is now a deterministic document-scoped UUIDv8 shared by normal upload and lifecycle duplication.

# Scope / Routing

The original Q7 write zone was followed. During source inspection, Q2's verifier was proven to combine exact physical schema with alias state, which cannot verify a pre-cutover `vN` target. The parent explicitly authorized the narrow Q2 extension: `verifyPhysicalCourseEmbeddingsCollection` retains the awaited pinned-version and exact schema checks, performs no mutation or alias read, and leaves existing verify/bootstrap behavior unchanged.

No Q5 CI files, Compose/ops/backup files, handoff, stage summary, live endpoint, secret, or remote runtime was changed. Source truth comes from generated database types, migrations, canonical storage helpers, Stage 2 code, shared Zod jobs, and pinned local dependency types. Catalog discovery was unnecessary.

# Verification

RED/GREEN evidence, dry-mode counts, and the final local gates are recorded in frontmatter. Commit/push identity is carried by the completion event because the artifact cannot self-record the SHA of the commit that contains it.

# Delivery / Cleanup

Status is `returned`, not accepted. The dedicated branch/worktree remains for independent correctness review and parent integration. Cleanup is pending and intentionally not performed.

# Risks / Follow-ups / Explicit Defers

No live reindex, queue enqueue, database write, Qdrant mutation, alias change, or relevance request was performed. Runtime relevance and strict behavior against pinned Qdrant remain Q5's integration evidence; live recovery/cutover remains Q12's explicit authorization gate. Q10 owns durable data-workflow/operator documentation after this contract is independently accepted.
