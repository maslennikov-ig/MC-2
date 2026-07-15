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
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.21-q12-d5j.md
selected_docs:
  - docs/superpowers/specs/2026-07-13-q12-live-cutover-corrections-design.md
  - docs/superpowers/specs/2026-07-14-q12-retained-barrier-capability-provenance-addendum-design.md
  - docs/superpowers/plans/2026-07-14-q12-retained-barrier-capability-provenance-addendum.md
  - /home/me/code/mc2/.worktrees/q12-w-writer-barrier/.superpowers/sdd/q12-w-d5-composition-architecture.md
selected_skills:
  - orchestrator-stage
  - task-router
  - superpowers:brainstorming
  - prompt-authoring
  - superpowers:systematic-debugging
selected_agents:
  - correctness_reviewer
  - docs_reviewer
catalog_candidates:
  - none; installed skills and selected reviewer personas were sufficient
parallel_group: D5J-spec-review
depends_on_streams:
  - accepted D5W mc2-jz6y0.13.20
parallel_decision: two independent read-only spec reviews ran in parallel after root-owned drafting
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: The isolated worktree and branch remain intentionally available while the exact written-spec SHA awaits owner approval; no implementation has begun.
risk_level: high
docs_impact: structural
docs_reviewed: updated
docs_review_notes: The new normative candidate freezes the one-journal joined-fixture contract; handoff and summary are updated separately on integration to preserve current-state truth.
graph_reviewed: used
graph_review_notes: Existing report plus focused read-only query informed the composition boundary; refresh waits for accepted implementation integration, with no external model/API mode or Git hook.
verification:
  - 'baseline serialized Root gate: 271/271 passed across q12-live-cutover 248, q12-retained-barrier-quiesce-seam 20, and q12-command-manifest 3 in 76.58 seconds'
  - 'environment diagnosis: initial vitest EACCES traced to absent node_modules in the new worktree; pnpm install --frozen-lockfile restored exact lockfile dependencies and the unchanged baseline passed'
  - 'spec Prettier check: passed'
  - 'git diff --check: passed'
  - 'correctness delta rereview: PASS P0/P1/P2/P3 0/0/0/0 on spec SHA-256 d7e86193142d260a3b8dcd65ef9ce89b64df88d9c93cec68f19705de68edc75d; ignored report SHA-256 0eb420fda7099ecdf98d0028cc5f8b89e9a61103018e747228868515eb970bf2'
  - 'documentation final rereview: PASS P0/P1/P2/P3 0/0/0/0 on the same spec SHA; ignored report SHA-256 02770a81c69474a1445fb7c4f2a05edbfa5cee50d18accf502f074d4e79025ba'
changed_files:
  - docs/superpowers/specs/2026-07-15-q12-joined-retained-barrier-fixture-design.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.21-q12-d5j.md
explicit_defers:
  - Owner approval of exact corrected written-spec SHA is required before an implementation plan or code.
  - D6 implementation remains after accepted W, its own reviewed plan, and separate local authorization.
  - GHCR, server, Supabase, Qdrant, Docker, services, secrets, deployment, staging, production, rotation, and all remote/live mutation remain separately gated.
---

# Summary

The owner approved D5J Option A at the architecture/drafting level: a
Root-owned test-only closed composer emits one canonical forward or rollback
run, W consumes it read-only, and no deployed CLI gains a fixture switch. The
tracked candidate freezes the closed input surface, exact forward and rollback
chronology, one-journal/inode/hash authority, Root/W/Task 9 ownership, failure
rules, write zone, and TDD matrix. It rejects W copying/rehashing, two-journal
positives, and early expansion into the complete Task 9 controller.

The first documentation review found one P1: clean rollback prefix 1 already
requires durable writer quiescence even though the draft required the W-owned
preimage only for later-four D5 work. The corrected contract now requires the
real immutable W-owned quiesce manifest for every joined profile, keeps the D5
`install` binding at 64 zeroes, and binds all later-four/FWM/W evidence to the
computed real digest. Missing preimage is an explicit fail-before-state rule
and dedicated RED case. Both final independent reviews passed with zero
findings on the same corrected SHA.

# Verification

The new isolated worktree initially had no dependencies, so `pnpm ... vitest`
failed before collection with `spawn vitest EACCES`. File and permission
comparison against integration identified the absent `node_modules` as the
environmental root cause. `pnpm install --frozen-lockfile` changed no tracked
dependency metadata; the unchanged serialized baseline then passed 271/271.

The candidate was formatted and checked with repo Prettier, `git diff --check`
passed, and `scripts/orchestration/validate_artifact.py` is the final artifact
gate. The final candidate SHA-256 is
`d7e86193142d260a3b8dcd65ef9ce89b64df88d9c93cec68f19705de68edc75d`.
Correctness rereview report SHA-256 is
`0eb420fda7099ecdf98d0028cc5f8b89e9a61103018e747228868515eb970bf2`;
documentation rereview report SHA-256 is
`02770a81c69474a1445fb7c4f2a05edbfa5cee50d18accf502f074d4e79025ba`.
Both reports are ignored read-only review evidence and returned PASS with
P0/P1/P2/P3 `0/0/0/0`.

# Risks / Follow-ups

This artifact is deliberately `returned`, not accepted: the brainstorming
gate requires the owner to approve the complete corrected file SHA before
planning. After that approval the orchestrator must use `writing-plans`, TDD,
independent implementation reviews, integration/reruns, and cleanup before
closing `.13.21` or resuming W.

No implementation, production controller, remote probe, deploy, secret use,
database/Qdrant mutation, container action, or external S3 work occurred. The
rollback state is the isolated unmerged candidate branch. Before integration,
the two tracked files can be reverted as one docs-only unit; no runtime state
exists to undo.

docs-reviewed: updated — the candidate and current-state handoff/summary record
the exact remaining approval boundary.

graph-reviewed: used — the focused local graph/report informed the ownership
seam; refresh is deferred until accepted code/docs integration is safe.
