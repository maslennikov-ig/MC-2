---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/mc2-1iwt9/stage-manifest.json
stream_owner: atomic_edit_v2
orchestration_level: slice_acceptance
scope_kind: product_slice
immediate_consumer: generation field editing with cascade confirmation
public_facade: generation.deleteDownstreamStages and deleteDownstreamStagesAction
bounded_acceptance: atomic pending edit request, validation before deletion, legacy flag-off parity
non_goals:
  - SQL migration, Helixa transport, deployment, external flag activation
evidence:
  - none
task_id: atomic-edit
epic_id: mc2-1iwt9
stage_id: mc2-1iwt9
session_id: n/a
milestone: completed-course-current-content-v2
milestone_status: in_progress
agent_type: worker
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: coupled authorization, validation, concurrency and UI mutation behavior
repo: /home/me/code/mc2
branch: codex/helixa-v2-atomic-edit
base_branch: codex/helixa-contract-v2
base_commit: c7a000ec6cf387153f94b26d00b5db7c51237d03
worktree: /home/me/code/mc2/.worktrees/helixa-v2-atomic-edit
write_zone:
  - packages/course-gen-platform/src/server/routers/generation/editing/field-update.router.ts
  - packages/course-gen-platform/src/server/routers/generation/editing/field-update-preparation.ts
  - packages/course-gen-platform/tests/unit/server/routers/generation/editing/field-update-cascade-v2.test.ts
  - packages/web/app/actions/admin-generation.ts
  - packages/web/components/generation-graph/hooks/useCascadeStageDelete.ts
  - packages/web/components/generation-graph/hooks/__tests__/useCascadeStageDelete.test.tsx
  - .codex/stages/mc2-1iwt9/artifacts/atomic-edit.md
success_criteria:
  - v2 confirms cascade removal and the final field edit in one scoped RPC
  - invalid fields and failed metadata preparation do not delete downstream data
  - optimistic conflict never falls back to a second field save
  - flag-off preserves original cascade-only server path and one UI save
selected_docs:
  - AGENTS.md
  - .codex/orchestrator.toml
  - .codex/handoff.md
  - Helixa origin/main docs/superpowers/specs/2026-09-30-sources-complete-and-current-spec.md section C
selected_skills:
  - test-driven-development
  - graphify-project
  - verification-before-completion
  - format-commit-message
  - receiving-code-review
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: atomic-edit
depends_on_streams:
  - database_v2
  - transport_v2
parallel_decision: parallel
status: returned
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: root integrates assigned branch; no push or worktree removal
risk_level: high
risk_tags:
  - authorization
  - tenancy
  - concurrency
  - atomicity
  - data
  - ui
  - user-flow
affected_surfaces:
  - api
  - backend
  - ui
  - user-flow
invariants:
  - tenancy
  - state-transition
  - test-matrix
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: root owns contract and rollout docs; stream records internal RPC agreement here
verification:
  - backend focused Vitest target before implementation: 6 failed, 2 passed
  - web focused Vitest target before implementation: 1 failed, 2 passed
  - backend focused Vitest target after implementation: 11 passed, unchanged evidence reused after UI review correction
  - web focused Vitest target after UI review correction: 3 passed
  - git diff --check: passed
changed_files:
  - packages/course-gen-platform/src/server/routers/generation/editing/field-update.router.ts
  - packages/course-gen-platform/src/server/routers/generation/editing/field-update-preparation.ts
  - packages/course-gen-platform/tests/unit/server/routers/generation/editing/field-update-cascade-v2.test.ts
  - packages/web/app/actions/admin-generation.ts
  - packages/web/components/generation-graph/hooks/useCascadeStageDelete.ts
  - packages/web/components/generation-graph/hooks/__tests__/useCascadeStageDelete.test.tsx
  - .codex/stages/mc2-1iwt9/artifacts/atomic-edit.md
explicit_defers:
  - none
---

# Summary

The web confirmation carries the pending field edit to the existing cascade endpoint.
Behind the default-off `HELIXA_KNOWLEDGE_SYNC_CONTRACT_V2` flag, the endpoint validates
and prepares the final field patch before any deletion, then calls the database
worker's atomic cascade RPC. A confirmed `fieldApplied` response suppresses the
separate `performSave` semantic write. The flag-off path retains the original
server deletes and original UI save, loading and confirmation behavior.

# Scope / Routing

The extracted preparation helper is used by both standalone `updateField` and
the atomic path. It reuses the existing whitelist, `resolveStructure`,
`applyFieldUpdate`, `setNestedValue`, stable-ID normalization and assertion, and
Stage 5 structural-quality metadata builder. Completion/status columns are never
included in the patch. Authorization runs before field preparation and any
service-only RPC. `p_organization_id` comes from the authorized course row.

Agreed RPC with `database_v2`: `delete_helixa_course_downstream_v2` receives the
existing course/org/stage arguments and optional `p_course_patch` and
`p_expected_course_state`. Stage 4 patch keys are exactly `analysis_result`;
Stage 5 keys are exactly `course_structure` and `generation_metadata`. Expected
state contains exactly `updated_at`, `analysis_result`, `course_structure`,
`generation_metadata`; the SQL worker compares all four under a scoped row lock
before deletion. Timestamp comparison casts to `timestamptz`. SQLSTATE `40001`
maps to tRPC `CONFLICT`, with no legacy fallback. Delete-only callers omit the
optional arguments. A nonempty patch must return `fieldApplied: true`.

`transport_v2` owns the lightweight `isKnowledgeSyncContractV2Enabled` export in
`integrations/helixa/scheduler.ts`; no Helixa module, SQL, environment, CI or
shared-types file was modified here.

graph-reviewed: used. Borrowed the primary worktree's read-only graph via
`graphify query "deleteDownstreamStages updateField useCascadeStageDelete"
--graph /home/me/code/mc2/graphify-out/graph.json --budget 1200`. The truncated
orientation identified the known hook/action callers; exact sources were
confirmed in this worktree. The borrowed graph is stale and belongs to another
owner; root refreshes the integrated graph at closeout.

# Verification

Commands from `packages/course-gen-platform`:

```sh
env SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=offline-unit-placeholder pnpm exec vitest run --config vitest.config.unit.ts tests/unit/server/routers/generation/editing/field-update-cascade-v2.test.ts
```

Baseline before implementation: 8 tests, 6 failed/2 passed. Failures were
behavioral: no atomic RPC, invalid pending edits still deleting, and no
optimistic conflict. Green after implementation: 11/11. Coverage includes
Stage 4 whole edit, Stage 5 IDs/durations/metadata, validation-before-deletion,
authorization, tenant scope, optimistic conflict, legacy flag-off parity,
delete-only v2 callers, and standalone field-save parity.

Commands from `packages/web`:

```sh
pnpm exec vitest run components/generation-graph/hooks/__tests__/useCascadeStageDelete.test.tsx
```

Original UI baseline: 3 tests, 1 failed/2 passed (missing pending edit argument).
Final green after the root review correction: 3/3, including no second save after
v2 success, one legacy save, and failure retaining the modal. The unconditional
in-flight confirmation guard and its standalone test were removed because they
changed the flag-off behavior beyond the assigned v2 scope. Backend source/tests
are unchanged, so matching 11/11 evidence is reused; they were not rerun.

Exact private output is in `/tmp/mc2-atomic-edit-backend-red.log`,
`/tmp/mc2-atomic-edit-backend-green.log`, `/tmp/mc2-atomic-edit-web-red.log`, and
`/tmp/mc2-atomic-edit-web-green-review.log`. Initial setup-only errors from missing
fake Supabase environment and unbuilt local shared packages were corrected
before behavioral red; they are not red-control evidence. Offline dependency
installation used `pnpm install --frozen-lockfile --offline --ignore-scripts`.
Generated shared package artifacts are untracked/ignored and are not committed.

# Delivery / Cleanup

Returned for root integration. Only the assigned branch may be locally committed.
No push, deploy, external flag activation, production/live API call, secret
inspection or customer data access occurred. Root owns final monorepo acceptance
and durable PostgreSQL proof after integrating the SQL and transport streams.

# Risks / Follow-ups / Explicit Defers

The worker tests prove one validated transaction request and one UI operation;
they use mocked Supabase and do not prove the durable event count themselves.
The database worker's transaction/event tests and root integration acceptance
must establish one final v2 `UPDATED` for the logical edit. Existing nonfatal
`course_nodes` mirroring remains after the RPC, matching the original field-save
behavior; canonical course JSON and deletion are in the transaction. No in-scope
defer remains. Full type-check/build is intentionally root-owned and requires
the scheduler export and migration to be integrated first.
