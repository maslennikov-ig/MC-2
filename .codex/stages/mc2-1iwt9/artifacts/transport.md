---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/mc2-1iwt9/stage-manifest.json
stream_owner: transport_v2
orchestration_level: slice_acceptance
scope_kind: product_slice
immediate_consumer: Helixa knowledge-sync receiver and general worker
public_facade: runKnowledgeSyncDeliveryBatch and startKnowledgeSyncDeliveryScheduler
bounded_acceptance: synthetic local TS red-green only; root owns integrated acceptance
non_goals:
  - Helixa writes, live endpoints, production activation, deploy or remote delivery
  - Generation APIs and database migrations
  - Broad type-check, build or full suite
evidence:
  - none
task_id: transport
epic_id: n/a
stage_id: mc2-1iwt9
session_id: n/a
milestone: optional knowledge-sync v2 delivery and maintenance
milestone_status: in_progress
agent_type: worker
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: parent-selected transport stream with isolated ownership
repo: mc2
branch: codex/helixa-v2-transport
base_branch: origin/develop
base_commit: c7a000ec6cf387153f94b26d00b5db7c51237d03
worktree: /home/me/code/mc2/.worktrees/helixa-v2-transport
write_zone:
  - packages/course-gen-platform/src/integrations/helixa knowledge-sync modules
  - packages/course-gen-platform/src/orchestrator/worker-entrypoint.ts
  - packages/course-gen-platform/tests/unit/integrations/helixa/knowledge-sync-v2.test.ts
  - .codex/stages/mc2-1iwt9/artifacts/transport.md
success_criteria:
  - Exact schema v2, full completed/updated packages, content-free tombstones
  - Single-snapshot manifest pages and last-page current-revision resend
  - Durable capture mode before timers/claims and protocol-pinned v1/v2 backlog
  - Immediate and hourly non-overlapping apply:true maintenance on general worker
selected_docs:
  - AGENTS.md
  - .codex/orchestrator.toml
  - .codex/handoff.md
  - docs/helixa/contract-v2-implementation.md in parent worktree
  - Helixa origin/main sources-complete-and-current spec section C
selected_skills:
  - superpowers:test-driven-development
  - superpowers:systematic-debugging
  - superpowers:verification-before-completion
  - format-commit-message
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: transport
depends_on_streams:
  - database_v2
parallel_decision: parallel
status: returned
delivery_method: cherry-pick
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: child tree preserved for root integration; no push or cleanup
risk_level: high
risk_tags:
  - concurrency
  - retry
  - idempotency
  - rollback
  - public-api
affected_surfaces:
  - backend
  - api
invariants:
  - tenancy
  - state-transition
  - idempotency
  - rollback
  - test-matrix
docs_impact: api-contract
docs_reviewed: updated
docs_review_notes: this artifact records transport interfaces; parent owns durable implementation and rollout docs
verification:
  - same-tree c7a000ec v2 baseline replay: expected red, 39 failed, exit 1
  - focused v2 plus existing v1 and scheduler unit tests: passed, 72 tests, exit 0
  - focused transport correction lint: passed, zero errors and warnings
  - focused transport correction tests: passed, 74 tests, exit 0
  - git diff --check: passed
changed_files:
  - packages/course-gen-platform/src/integrations/helixa/contract.ts
  - packages/course-gen-platform/src/integrations/helixa/outbox.ts
  - packages/course-gen-platform/src/integrations/helixa/package-builder.ts
  - packages/course-gen-platform/src/integrations/helixa/runtime-repository.ts
  - packages/course-gen-platform/src/integrations/helixa/scheduler.ts
  - packages/course-gen-platform/src/integrations/helixa/service.ts
  - packages/course-gen-platform/src/integrations/helixa/snapshot-loader.ts
  - packages/course-gen-platform/src/orchestrator/worker-entrypoint.ts
  - packages/course-gen-platform/tests/unit/integrations/helixa/knowledge-sync-v2.test.ts
  - .codex/stages/mc2-1iwt9/artifacts/transport.md
explicit_defers:
  - none
---

# Summary

Implemented optional exact v2 delivery, pinned semantic snapshots, content-free
tombstones, paged consistent manifests and current-revision resend. The v2 flag
requires exact `true` and remains separate from scheduler opt-in. Off mode
preserves v1 serialization and frozen backlog; frozen v2 entries cannot be sent
while off. No visibility filter exists in TS: the DB owns the actual any-member
read predicate under the owner's clarified rule, including readable private
objects. Public-link removal alone is not a retraction.

# Scope / Routing

Literal section C governs the wire. Tombstones have **six** top-level fields and
five object fields, with exactly the four specified reasons and no hashes,
content, scope, documents, relations or origin command. Tombstones never load a
native snapshot. Full v2 packages compare the DB fingerprint against normalized
serialized content. V1 content retains historical lesson/block processing data;
v2 excludes it. Pinned source descriptors retain tenant/source/namespace/hash
and virtual-source proof checks. A valid native origin may belong to another
delivery binding of the same org/object; the course-source relation still checks
the originating binding and command.

Agreed internal RPCs (same tuple parameters: `p_binding_id`,
`p_organization_id`, `p_environment`, `p_destination_binding_id`):

- `set_helixa_knowledge_sync_v2_enabled(..., p_enabled)` runs before timers or
  claims, including disabled-scheduler general-worker boot with binding identity
  alone. Missing RPC codes `PGRST202`/`42883` are tolerated only in v1 before the
  migration exists; installed authority errors and v2 activation fail closed.
- Legacy `claim_helixa_knowledge_sync_outbox` drains v1 backlog first;
  `claim_helixa_knowledge_sync_v2_outbox(..., p_batch_size)` supplies the remaining
  batch slots only when v2 is on. V2 rows add `event_type`, `revision`,
  `retraction_reason`, `content_hash`, `created_at` and pinned `snapshot`.
- Existing `freeze_helixa_knowledge_sync_payload` and
  `transition_helixa_knowledge_sync_outbox` are reused. Tombstone wire bodies have
  no hashes; the durable payload hash is computed separately over their bytes.
- `get_helixa_knowledge_sync_manifest(...)` returns one complete JSON array from
  one snapshot, avoiding the table row cap. Pages have at most 1000 objects;
  empty organizations produce one empty page. All pages use the existing HMAC
  delivery path. Only the final response is parsed.
- `enqueue_helixa_knowledge_sync_v2_resend(..., p_objects)` receives only
  `{kind,id}`; lists exceeding 1000 are permitted. DB rechecks current access and
  selects the current durable revision, without incrementing it for resend.
- `reconcile_helixa_knowledge_sync_v2(..., p_apply)` returns exact
  `{missing, inserted, applied}`. Manual invocation defaults to false and always
  attempts a manifest afterward, including after reconciliation failure.

The general worker awaits capture-mode synchronization before installing timers.
V2 schedules immediate and hourly `apply:true` reconciliation followed by a
manifest. A 30-second timer retries failures, preserves hourly cadence, and
prevents overlapping maintenance. Delivery has its independent non-overlapping
timer. Shutdown stops both timers. Dedicated Stage 6/7 workers do not schedule
this service.

Root must forward `HELIXA_KNOWLEDGE_SYNC_CONTRACT_V2` through worker env paths;
existing `HELIXA_KNOWLEDGE_SYNC_SCHEDULER_ENABLED` is an independent flag.
`isKnowledgeSyncContractV2Enabled` is exported from lightweight `scheduler.ts`
and re-exported by `runtime-repository.ts` for consumers.

## Integration lint correction

Root integration found four typed lint errors in the assigned source. They were
reproduced unchanged in the child branch. The correction removes the redundant
narrowed assertion, invokes injected clock/error callbacks through their owning
objects, and wraps a synchronous non-Error maintenance rejection in an `Error`
with its original cause. No lint rule was suppressed. Two regression controls
first failed: an injected clock lost its receiver, and the forwarded failure
callback received the scheduler options instead of the caller options.

Correction acceptance supersedes the earlier 72-test final count: **74/74 passed**
(41 v2 + 28 v1 + 5 scheduler), exit 0. Exact same three-file Vitest command as
above. Log: `/tmp/mc2-1iwt9-transport-correction-green.log`.
Callback red log: `/tmp/mc2-1iwt9-transport-callback-red.log` (2 failed, 39 skipped).

Focused lint command:

```bash
pnpm exec eslint \
  packages/course-gen-platform/src/integrations/helixa/outbox.ts \
  packages/course-gen-platform/src/integrations/helixa/scheduler.ts \
  packages/course-gen-platform/src/integrations/helixa/service.ts
```

Result: exit 0, zero warnings/errors.
Logs: `/tmp/mc2-1iwt9-transport-lint-red.log` (4 errors before correction) and
`/tmp/mc2-1iwt9-transport-lint-green.log` (empty successful output).

# Verification

Dependency restoration was local only:
`pnpm install --frozen-lockfile --offline --ignore-scripts` (exit 0; no downloads).
All test runs set synthetic local `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` and
Linux `TMPDIR=/tmp`; Supabase/fetch are mocked. No live call, secret read or
customer-row read was made.

Initial tests were written before production edits. Initial baseline at
`c7a000ec6cf387153f94b26d00b5db7c51237d03`: **30/30 expected red**, exit 1.
Additional integration findings had individual failing controls before fixes:
pre-migration missing RPC fallback, native origin through another valid delivery
binding, and disabled transport without transport credentials.

After the complete test file was written, all **39/39 v2 controls** were replayed
against that exact baseline in the same child worktree. The test harness replaced
only the eight owned production source files with `git show` baseline bytes,
then restored the implemented files byte-for-byte in `finally`. Result: expected
red, **39 failed**, exit 1. The suite reached all test cases; setup/import did not
fail. Log: `/tmp/mc2-1iwt9-transport-all-red.log`.

Focused final green command:

```bash
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=test-only-placeholder \
TMPDIR=/tmp pnpm --filter @megacampus/course-gen-platform exec vitest run \
  --config vitest.config.unit.ts \
  tests/unit/integrations/helixa/knowledge-sync-v2.test.ts \
  tests/unit/integrations/helixa/knowledge-sync.test.ts \
  tests/unit/integrations/helixa/scheduler.test.ts
```

Result: **72/72 passed**, exit 0 (39 v2 + 28 existing knowledge-sync v1 + 5
existing scheduler). Log: `/tmp/mc2-1iwt9-transport-final-green.log`.
Coverage includes all four tombstone reasons, no deleted-snapshot read, full
outbox update, revision/hash rejection, normalized metadata, pinned text/native
proofs, exact frozen retry bytes, off/on/off protocol claims and capture gate,
0/1/1000/1001/2501 inventory pages, HMAC signatures, final-page resend, 1001 resend
identities, read/delivery/feedback failures, dry/failing reconciler manifests,
immediate/hourly maintenance, non-overlap, retry and shutdown.

Graph orientation came from the parent's existing primary-checkout audit and
known-file reads. `graph-reviewed: used`; parent owns combined graph refresh at
integration, together with its root-owned type-check/build and PostgreSQL proof.

# Delivery / Cleanup

Local child commit only, for parent integration. No merge, push, deploy or flag
activation. Child branch/worktree remain available. Parent has not yet accepted
the stream or run integrated acceptance.

# Risks / Follow-ups / Explicit Defers

No stream defer. Required integration: pair with the database migration (including
false-to-true initial capture and unlimited resend feedback), env forwarding,
atomic edit stream, then root-owned final acceptance. Unit evidence alone does
not claim durable PostgreSQL, build, deployment or production receiver acceptance.
