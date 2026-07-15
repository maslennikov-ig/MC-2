---
schema_version: orchestration-artifact/v1
artifact_type: orchestrator-design-stream
task_id: mc2-jz6y0.13.21
stage_id: mc2-jz6y0
agent_type: root orchestrator with independent correctness_reviewer and docs_reviewer
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: Canonical journal authority, rollback chronology, and producer-consumer ownership are security-critical.
repo: /home/me/code/mc2
branch: codex/q12-d5j-joined-fixture
base_branch: codex/self-hosted-qdrant-platform
base_commit: 90d2ba319d26b73d6477a23c55f9c19da1a524bd
worktree: /home/me/code/mc2/.worktrees/q12-d5j-joined-fixture
write_zone:
  - docs/superpowers/specs/2026-07-15-q12-joined-retained-barrier-fixture-design.md
  - docs/superpowers/specs/2026-07-15-q12-d5j-command-binding-and-fwm-amendment.md
  - docs/superpowers/plans/2026-07-15-q12-d5j-joined-fixture.md
  - deploy/qdrant/q12-lifecycle-core.py
  - deploy/qdrant/q12-command-manifest.json
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-runner.py
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-contract.ts
  - packages/course-gen-platform/tests/unit/ops/q12-retained-barrier-w-composition-seam.test.ts
  - packages/course-gen-platform/tests/unit/ops/q12-command-manifest.test.ts
  - packages/course-gen-platform/tests/unit/ops/q12-live-cutover.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.21-q12-d5j.md
selected_docs:
  - docs/superpowers/specs/2026-07-13-q12-live-cutover-corrections-design.md
  - docs/superpowers/specs/2026-07-14-q12-retained-barrier-capability-provenance-addendum-design.md
  - docs/superpowers/plans/2026-07-14-q12-retained-barrier-capability-provenance-addendum.md
  - /home/me/code/mc2/.worktrees/q12-w-writer-barrier/.superpowers/sdd/q12-w-d5-composition-architecture.md
  - docs/superpowers/specs/2026-07-15-q12-d5j-command-binding-and-fwm-amendment.md (SHA-256 d6c4d8e4b2b7f6c53d648fdf587a5520db45fa5d8f3c84668b48b09b6bbe075c)
  - docs/superpowers/plans/2026-07-15-q12-d5j-joined-fixture.md (SHA-256 a05ba3c60e1a1a714e7d0ce30298f8124949e67c9dbacc00677a7fc414805b4a)
selected_skills:
  - orchestrator-stage
  - task-router
  - superpowers:brainstorming
  - prompt-authoring
  - superpowers:systematic-debugging
  - superpowers:writing-plans
  - superpowers:executing-plans
  - superpowers:test-driven-development
selected_agents:
  - correctness_reviewer
  - docs_reviewer
  - Explore (two read-only source extractions for the .13.22 amendment)
catalog_candidates:
  - none; installed skills and selected reviewer personas were sufficient
parallel_group: D5J-spec-review
depends_on_streams:
  - accepted D5W mc2-jz6y0.13.20
  - closed decision mc2-jz6y0.13.22 (amendment d6c4d8e4, reviews PASS 0/0/0/0)
parallel_decision: two independent read-only spec reviews ran in parallel after root-owned drafting; implementation was root-owned inline (single sequential TDD stream, no parallel benefit, amendment-author context required)
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: joined /tmp fixture roots are removed by test afterEach; the worktree/branch remain until reviewed integration into codex/self-hosted-qdrant-platform.
risk_level: high
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: normative truth lives in the accepted amendment and D5J spec; stage summary/handoff update at integration to preserve current-state truth.
graph_reviewed: used
graph_review_notes: Existing report plus focused read-only query informed the composition boundary; refresh waits for accepted implementation integration, with no external model/API mode or Git hook.
verification:
  - 'design-phase baseline serialized Root gate: 271/271 passed'
  - 'design-phase reviews: correctness and documentation rereviews PASS 0/0/0/0 on spec SHA-256 d7e86193142d260a3b8dcd65ef9ce89b64df88d9c93cec68f19705de68edc75d'
  - 'amendment reviews (2026-07-15): correctness PASS 0/0/0/0 (report SHA-256 5b588dbd5b1d107c4104ae18666d4011c2973462e117b8b9c351007ab1684092), docs PASS 0/0/0/0 (report SHA-256 fd9581934f7d8f8c205b45cf1d989c8908b6857ff1ee2f531ad407dda22ebe8b)'
  - 'plan review: final PASS 0/0/0/0 against plan SHA-256 a05ba3c60e1a1a714e7d0ce30298f8124949e67c9dbacc00677a7fc414805b4a (P1-1 withdrawn after committed-W-bytes verification)'
  - 'implementation baseline before code: focused file-parallel 271/271 at 93badbf4'
  - 'vitest 4-file focused, file-parallel: 300/300 passed'
  - 'vitest 4-file focused, --no-file-parallelism: 300/300 passed'
  - 'bash -n q12-live-cutover.sh q12-capability-run.sh: passed'
  - 'python3 -m py_compile core + runner: passed'
  - 'jq -e q12-command-manifest.json: passed'
  - 'prettier --check contract + seam + live-cutover: passed'
  - 'git diff --check: passed'
  - 'pnpm type-check (workspace): passed'
  - 'pnpm build (workspace, synthetic Supabase env per the D5J acceptance contract): passed, exit 0'
changed_files:
  - docs/superpowers/specs/2026-07-15-q12-joined-retained-barrier-fixture-design.md
  - docs/superpowers/specs/2026-07-15-q12-d5j-command-binding-and-fwm-amendment.md
  - docs/superpowers/plans/2026-07-15-q12-d5j-joined-fixture.md
  - deploy/qdrant/q12-lifecycle-core.py
  - deploy/qdrant/q12-command-manifest.json
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-runner.py
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-contract.ts
  - packages/course-gen-platform/tests/unit/ops/q12-retained-barrier-w-composition-seam.test.ts
  - packages/course-gen-platform/tests/unit/ops/q12-command-manifest.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.21-q12-d5j.md
explicit_defers:
  - D6 implementation remains after accepted W, its own reviewed plan, and separate local authorization.
  - GHCR, server, Supabase, Qdrant, Docker, services, secrets, deployment, staging, production, rotation, and all remote/live mutation remain separately gated.
  - Task 9 (mc2-jz6y0.13.13) keeps barrier.cleanup, reindex.worker.stop/remove, smoke.*, qdrant.*, deploy.finalize/retire-old/rollback, migration rollbacks, activation.verify, evidence.contain, operator.metrics-check, live orchestration, and the delegated-claim launcher routing for ordinary commands (the fixture emits ordinary lifecycles directly through the production serializer; D5 groups keep the real process boundary).
---

# Summary

Design phase (accepted earlier): the owner approved D5J Option A; the tracked
candidate froze the closed input surface, exact forward and rollback
chronology, one-journal/inode/hash authority, Root/W/Task 9 ownership, failure
rules, write zone, and TDD matrix, and both final independent reviews passed
with zero findings on SHA-256
`d7e86193142d260a3b8dcd65ef9ce89b64df88d9c93cec68f19705de68edc75d`.

Implementation slice (2026-07-15, under the accepted `.13.22` amendment
`d6c4d8e4…` and the reviewed plan `a05ba3c6…`): the twenty-command canonical
manifest with exact literal argv and per-entry frozen env; the ten-placeholder
substitution domain with Root-only fixture derivations; the ordinary-row
journal grammar with the two-segment quiesce and evidence-stepped resource
bindings (isolated request-global fallback preserved); serializer primitives
(selector-from-head, ordinary lifecycles with capability/result evidence,
controller milestone); dual-path immutable final-writer manifests with the
Root-derived writer inventory; the closed joined composer emitting the exact
76-row forward chronology and all rollback profiles (prefixes 1-4 clean and
exact-next-frontier, activation frontier with both mode-bound manifests and
byte-identical target entries); the closed runner/TS request surface; closure
coverage (wrapper/parser switch rejection, manifest tamper, non-fresh root,
missing quiesce preimage — all fail before producer state).

Commits on `codex/q12-d5j-joined-fixture`: 93badbf4 (amendment), 0ac42bc2
(plan), 1817c5e9, 7f8aeab1, 140e9112, 5570e7c9, 9c9ca53e, 6b7f1f85, 47c7c897.

# Verification

Design-phase evidence is retained above. Implementation evidence: every task
committed only on a green focused suite (baseline 271/271 grew to 300/300 in
both file-parallel and fully serialized invocations); all D5J static
acceptance commands pass; workspace `pnpm type-check` passes. The workspace
`pnpm build` requires Supabase env values that exist only in the primary
worktree's untracked `packages/web/.env`; per the D5J acceptance contract the
build runs with synthetic values (result recorded in Beads with the final
gate evidence).

Plan deviations, each equivalent and deliberate: the Task 8 closure coverage
was committed together with Task 7 (`47c7c897`) rather than as a separate
`test(q12)` commit; `q12-live-cutover.test.ts` and
`q12-retained-barrier-quiesce-seam.test.ts` were allowed by the write zone as
minimum-necessary updates but ultimately needed no modification (the
grammar/segment probes moved to the new seam test file before commit).

Strengthening updates to existing pins, each deliberate: the
`writers.resume.rollback` rows now carry the real resolved manifest hash (was
ZERO); the rollback FWM reduction moved to the mode-bound
`final-writer-manifest-rollback-<run-id>.json` path (the sole existing pin
matches by `startsWith('final-writer-manifest-')` and needed no edit); barrier
capability context validation generalized from request-global to the
walk-validated value domain (request-global strictness preserved for every
isolated run); the grammar/segment probes and all joined coverage live in the
new `q12-retained-barrier-w-composition-seam.test.ts`.

# Risks / Follow-ups

- The five-key isolated FWM reduction knowingly shares
  `megacampus.q12.final-writer-manifest/v1` with the normative eleven-key
  joined object (documented in `publish_final_writer_manifest`); Task 9's real
  controller must publish only the eleven-key shape.
- Ordinary command lifecycles in the fixture do not cross the delegated claim
  launcher (production claim routing for ordinary commands is Task 9 scope);
  D5 groups keep the real process boundary.
- W `.13.10` must replace its fabricated suffix bindings with the frozen
  `writers.resume.*` real hashes when it imports the joined materializer.
- This artifact remains `returned`, not accepted: independent implementation
  reviews (correctness + docs, P0/P1-zero) and integration/reruns are the
  acceptance gate before closing `.13.21` or resuming W.

docs-reviewed: updated — the amendment, plan, and this artifact record the
implementation truth; handoff/summary update at integration.

graph-reviewed: used — the focused local graph/report informed the ownership
seam; refresh is deferred until accepted code/docs integration is safe.
