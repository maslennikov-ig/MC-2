---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/mc2-1786710715922-25-db11a6c5/stage-manifest.json
stream_owner: phase-a-worker
orchestration_level: slice_acceptance
scope_kind: product_slice
immediate_consumer: role-guide phase B orchestrator
public_facade: role-guide audience views
bounded_acceptance: focused shared contract, assembler, prompt and viewer tests
non_goals:
  - phase B repetition controls
  - schema or data migration
  - database prompt mutation
  - paid or live generation
evidence:
  - none
task_id: mc2-1786710715922-25-db11a6c5
epic_id: mc2-db696
stage_id: mc2-1786710715922-25-db11a6c5
session_id: n/a
milestone: cohesive-vertical-slice
milestone_status: accepted
agent_type: worker
repo: mc2
branch: codex/role-guide-audiences
base_branch: develop
base_commit: 9250c1be9a26e196b5809fa95038731919360826
worktree: /home/me/code/mc2/.worktrees/role-guide-audiences
write_zone:
  - packages/shared-types/src/career-playbook.ts
  - packages/shared-types/src/career-playbook-blocks.ts
  - packages/shared-types/tests/career-playbook.test.ts
  - packages/course-gen-platform/src/stages/stage-career-playbook/nodes/final-assembler.ts
  - packages/course-gen-platform/src/shared/prompts/career-playbook-prompts.ts
  - packages/course-gen-platform/src/stages/stage-career-playbook/nodes/group-generator.ts
  - packages/course-gen-platform/tests/unit/stages/stage-career-playbook/final-assembler.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage-career-playbook/group-generator.test.ts
  - packages/web/components/career-playbook/viewer/PlaybookViewer.tsx
  - packages/web/tests/unit/components/career-playbook/viewer.test.tsx
  - .codex/stages/mc2-1786710715922-25-db11a6c5/artifacts/phase-a-audiences.md
success_criteria:
  - canonical employee, manager and hr views contain 20, 20 and 14 stored blocks
  - union of audience assignments covers header plus all 26 content blocks
  - final markdown persistence remains the complete document
  - group prompts receive deterministic per-block readers
  - viewer switches four views without regeneration or edit loss
selected_docs:
  - specs/028-role-guide-audiences/spec.md
  - radix-tabs-l1-context7-1.1.13
selected_skills:
  - superpowers-test-driven-development
  - impeccable
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: n/a
depends_on_streams:
  - phase-0-baseline
parallel_decision: sequential-after-phase-0
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: temporary worktree dependency links removed after focused verification
risk_level: medium
risk_tags:
  - audience-data-loss
  - prompt-contract
  - accessibility
affected_surfaces:
  - contracts
  - backend
  - frontend
invariants:
  - audience-union-complete
  - full-markdown-unchanged
  - generated-blocks-source
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: phase A behavior is defined by the specification; root owns final measured docs and graph refresh
verification:
  - pnpm --filter @megacampus/shared-types exec vitest run tests/career-playbook.test.ts (RED): 1 expected failure because CareerPlaybookAudienceSchema was absent
  - SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=test-key pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/stages/stage-career-playbook/final-assembler.test.ts tests/unit/stages/stage-career-playbook/group-generator.test.ts (RED): 2 expected failures for missing audience assembler and prompt variable
  - pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/viewer.test.tsx (RED): 2 expected failures for missing tabs and empty state
  - pnpm --filter @megacampus/shared-types exec vitest run tests/career-playbook.test.ts (GREEN): 23 passed
  - SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=test-key pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/stages/stage-career-playbook/final-assembler.test.ts tests/unit/stages/stage-career-playbook/group-generator.test.ts tests/unit/shared/prompts/prompt-contract-validation.test.ts tests/unit/shared/prompts/prompt-override-contract.test.ts (GREEN): 93 passed
  - pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/viewer.test.tsx (GREEN): 17 passed; existing Vite and Next Image test warnings remain
  - targeted eslint on all ten implementation and test files with --max-warnings=0 (GREEN)
changed_files:
  - packages/shared-types/src/career-playbook.ts
  - packages/shared-types/src/career-playbook-blocks.ts
  - packages/shared-types/tests/career-playbook.test.ts
  - packages/course-gen-platform/src/stages/stage-career-playbook/nodes/final-assembler.ts
  - packages/course-gen-platform/src/shared/prompts/career-playbook-prompts.ts
  - packages/course-gen-platform/src/stages/stage-career-playbook/nodes/group-generator.ts
  - packages/course-gen-platform/tests/unit/stages/stage-career-playbook/final-assembler.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage-career-playbook/group-generator.test.ts
  - packages/web/components/career-playbook/viewer/PlaybookViewer.tsx
  - packages/web/tests/unit/components/career-playbook/viewer.test.tsx
  - .codex/stages/mc2-1786710715922-25-db11a6c5/artifacts/phase-a-audiences.md
explicit_defers:
  - root final type-check and full unit acceptance
  - root browser and paid-dev editorial reading of all three complete documents
  - phase B audience-scoped repetition controls and final semantic measurement
---

# Summary

Phase A is ready for root acceptance. Audience ownership is now canonical block metadata rather
than model output: employee and manager each receive 20 stored blocks, HR receives 14, and every
view includes the header. The three assignments cover all 27 stored ids. The specification's
section 3 map was implemented without changing a checkbox.

The backend can assemble any reader-specific markdown view with `buildRoleGuideView`, while
`joinCareerPlaybookFinalBlocks` and every persisted `final_markdown` caller remain full-document
paths. No schema, persisted row, DB prompt, secret, reindex or paid service was touched.

# Scope / Routing

`CareerPlaybookAudience` and the `audiences` field live with the canonical catalogue. The group
generator formats the exact readers for only the blocks in its prompt and passes them as
`block_audiences_md`. Every group registry prompt declares and renders the required variable. The
old employee-only claim was replaced with a per-block reader contract. The existing override guard
rejects a stale database template that drops the new required variable; an exact check returned
`droppedRequiredVariables: ["block_audiences_md"]`, so no DB update is needed.

The viewer derives all four modes (`full`, `employee`, `manager`, `hr`) from its existing block
array, whose metadata comes from the canonical catalogue. Radix Tabs 1.1.13 is controlled, uses
matching trigger/content values, automatic activation and its native keyboard behavior. The tabs
sit above the document and preserve the existing contents rail, inspector and reading typography.
Switching views only filters the current `generated_blocks` projection; prop updates carrying an
edit remain visible after further switches. Empty partial data keeps the controls usable and shows
an explicit state instead of crashing.

Impeccable guidance kept this a restrained product control: familiar tabs, existing color tokens,
no new decorative system, and horizontal overflow on narrow screens. The owner Graphify graph had
already been used read-only for orientation by root; this stream confirmed the current files
directly and leaves the required durable graph refresh to stage closeout.

# Verification

The shared/backend RED phase failed only on the new observable contracts: missing audience schema,
missing `buildRoleGuideView`, and absent `block_audiences_md`. GREEN proves literal audience lists,
20/20/14 sizes, 27 stored ids, non-empty assignments, canonical ordering and unchanged full
assembly. Prompt contract and override-guard suites are included in the affected check.

The UI RED phase failed because the four controls and empty state did not exist. GREEN proves four
tabs, `full` by default, right-arrow automatic activation, exact 27/20/20/14 rendered article
counts, audience-specific inclusion/exclusion, retention of an edited block after rerender and view
switching, and safe zero-block rendering. Targeted ESLint is clean. The web test still prints its
pre-existing Vite deprecation and mocked Next Image boolean-attribute warnings; all 17 assertions
pass and this stream introduced no new warning.

Per the task boundary, no root `pnpm type-check` or full `pnpm test:unit` was run here.

# Delivery / Cleanup

The stream is returned on `codex/role-guide-audiences` for root acceptance and the sequential Phase
B consumer. Temporary dependency links used by the isolated worktree are removed before return.

# Risks / Follow-ups / Explicit Defers

Root owns the one final type/unit acceptance and the one paid dev generation with an editorial read
of all three documents. Phase B must now consume the same canonical audience map when deriving
`do_not_repeat`, filtering prior-block digests and gating semantic similarity. No Phase A checkbox,
schema, persistence or generation-layout decision remains open.
