---
schema_version: orchestration-artifact/v1
artifact_type: independent-review
task_id: mc2-jz6y0.13.15
stage_id: mc2-jz6y0
agent_type: docs_reviewer
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: The normative addendum freezes crash recovery, database cleanup, writer promotion, and forward/rollback authority across all remaining Q12 streams.
repo: mc2
branch: codex/self-hosted-qdrant-platform
base_branch: codex/self-hosted-qdrant-platform
base_commit: 835ca195
worktree: /home/me/code/mc2/.worktrees/self-hosted-qdrant-platform
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.15-lifecycle-docs-rereview.md
success_criteria:
  - Recheck the owner-approved lifecycle addendum against the unchanged base Q12 correction design.
  - Require exact command, receipt, journal, checkpoint, CAS, lease-epoch, and forward/rollback projections with no inferred implementation choices.
  - Accept only when P0, P1, P2, and P3 are all zero.
selected_docs:
  - docs/superpowers/specs/2026-07-13-q12-live-cutover-corrections-design.md
  - docs/superpowers/specs/2026-07-13-q12-recoverable-lifecycle-addendum-design.md
  - docs/superpowers/plans/2026-07-13-q12-recoverable-lifecycle-addendum.md
selected_skills:
  - orchestrator-stage
  - superpowers:receiving-code-review
  - superpowers:verification-before-completion
selected_agents:
  - docs_reviewer
catalog_candidates:
  - none - installed review assets and the approved repository documents fully cover this bounded contract review
parallel_group: q12-lifecycle-contract-gate
depends_on_streams:
  - mc2-jz6y0.13.14
  - mc2-jz6y0.13.15
parallel_decision: sequential - W, H, M, and Root require one final normative SHA before implementation acceptance
status: accepted
delivery_method: n/a
accepted_by_orchestrator: yes
cleanup_status: not_applicable
cleanup_notes: The reviewer was read-only and created no worktree, runtime, secret, database, container, server, or remote state.
risk_level: high
docs_impact: docs-only
docs_reviewed: no-change-needed
docs_review_notes: The final corrected addendum is internally consistent with the unchanged base design and needs no further correction before local implementation.
graph_reviewed: no-change-needed
graph_review_notes: This was a focused read-only normative-document review; the configured graph remains stale and will be refreshed once the accepted code and durable workflow changes are integrated safely.
verification:
  - base Q12 correction design SHA-256 5d575bf8424dbd9b94eb79bc5e477c3152327b70593dae811c876c3c222d5c15 remained byte-for-byte unchanged
  - final recoverable-lifecycle addendum SHA-256 7188d792af79ec881c16ef0729394e5c1f5c2c67aa6d59b86bec1bdf91308b27
  - final addendum plan SHA-256 316c8b20812ae23f2c367282b742d25277acff3557fe38a7515d843360d719db
  - prompt-check passed for the independent Codex gpt-5.6 review prompt
  - repeated findings-first review closed every checkpoint projection, cyclic-hash, CAS, epoch-domain, DAG, journal acceptance, legacy-schema, and genesis finding
  - final independent verdict PASS with P0 0, P1 0, P2 0, P3 0
  - git diff --check against 835ca195 passed for the addendum design and plan
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.15-lifecycle-docs-rereview.md
explicit_defers:
  - All server, Supabase, GHCR, Qdrant, service, secret, schema, writer, scheduler, staging, production, and deployment mutations remain outside this local review and require the exact Q12 remote gate.
---

# Summary

## Findings-first verdict

**PASS. P0: 0, P1: 0, P2: 0, P3: 0.** The accepted normative addendum is
`7188d792af79ec881c16ef0729394e5c1f5c2c67aa6d59b86bec1bdf91308b27`.
The owner-approved base design remains unchanged at
`5d575bf8424dbd9b94eb79bc5e477c3152327b70593dae811c876c3c222d5c15`.

The review was intentionally iterative and fail-closed. It first rejected a
resume-only checkpoint projection that could not represent generic object
acceptance or terminal resume. It then required the base device/inode/previous-
hash CAS fields, one journal/checkpoint lease-epoch domain, an explicit rollback
credential-rotation continuation, a predecessor-free genesis projection, and
accepted-object fields in the primary journal. Finally, it limited the
back-reference publication protocol to the five new schemas so the exact
legacy barrier, probe, quiesce, and recovery projections remain unchanged.
An implementation pre-review then exposed one final cross-language ambiguity
in `entry_hash`. The addendum now freezes the exact preimage, safe integer
lexemes, Unicode scalar/escape rules, compact serialization, and sole LF, and a
fresh independent rereview again passed with P0-P3 zero.
The same review then froze each new object's own intent/acceptance phase and
outcome, scoped same-phase pairs to one checkpoint transition, and kept terminal
resume as two explicit transitions/checkpoints; the final fresh verdict again
reported P0-P3 zero.

## Accepted contract

- The one fixed checkpoint has an exact 12-key discriminated projection for
  genesis, ordinary phases, object acceptance, authority, resume committing,
  and terminal resume.
- The journal and checkpoint share accepted-object truth, canonical hashes,
  CAS identity, and the complete cutover/recovery/schedule/rotation epoch
  domain.
- Forward resumes only the new-production-plus-development final ten and keeps
  old production five held; rollback resumes original-production-plus-
  development and keeps the captured target zero through five held.
- No target writer starts before activation, no-start finalize, zero-residue
  cleanup, and mode-specific resume authority. Full observation is forward-only
  after `writers_resumed` and `handoff_complete`.
- Crash/reboot recovery never infers success from process exit or ambiguous
  inventory; it either publishes the one provable missing receipt, compensates
  to stopped/no, or records an incident.

# Verification

The reviewer recomputed all three document hashes, compared the corrected
addendum to integration commit `835ca195`, verified the base document remained
unchanged, and ran `git diff --check`. The final fresh review explicitly
confirmed journal/checkpoint accepted-object equality, the five-schema
back-reference scope, legacy hash acceptance, every checkpoint variant, CAS,
all lease epochs, and the complete forward/rollback/rotation DAG.

# Risks / Follow-ups

The final specification authorizes local implementation, tests, independent
review, commits, and pushes only. It does not authorize a hosted PostgREST
probe, database mutation, backup, restore, container start, writer resume,
service installation, scheduler change, deployment, or any staging/production
action. Those effects remain subject to the separately presented Q12 remote
activation packet and current-task authorization.
