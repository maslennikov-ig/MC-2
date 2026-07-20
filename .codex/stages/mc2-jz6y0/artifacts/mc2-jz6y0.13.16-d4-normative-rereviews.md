---
schema_version: orchestration-artifact/v1
artifact_type: independent-rereview-evidence
task_id: mc2-jz6y0.13.16
stage_id: mc2-jz6y0
agent_type: correctness_reviewer-and-docs_reviewer
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: Frozen-byte review covers cross-process authority, crash recovery, database CAS, exact schemas, executable TDD, and durable documentation.
repo: /home/me/code/mc2
branch: codex/self-hosted-qdrant-platform
base_branch: codex/self-hosted-qdrant-platform
base_commit: d523bf383f65492b7d06356cefdd7618f82d2ca6
worktree: /home/me/code/mc2/.worktrees/self-hosted-qdrant-platform
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.16-d4-normative-rereviews.md
status: accepted
delivery_method: n/a
accepted_by_orchestrator: yes
cleanup_status: not_applicable
cleanup_notes: Both reviewers were read-only; no reviewer worktree or external state exists to clean.
risk_level: high
docs_impact: ops-deploy
docs_reviewed: updated
docs_review_notes: Final independent docs review passed P0=P1=P2=P3=0 on the exact frozen normative design and plan; handoff and stage summary record the accepted mapping.
graph_reviewed: used
graph_review_notes: Existing Graphify report and focused Q12 capability/checkpoint query informed the contract; no refresh is needed for this docs-only decision slice, and implementation integration owns the later durable graph refresh.
verification:
  - owner-approved D4 v4 SHA-256 e6ac9c5eb4b8f5a5c0b27626dfe7675d5e98c25bf219ddb0ae65df7087e9e6d9
  - final normative design SHA-256 28655ffe401efe39b09ba436d101aeed055c8fe25cb8a8e4fd3e90720e745ab4
  - final implementation plan SHA-256 e891a65745210248bf04b325cc7ef7bd1dba562ea5ac40c6b63aa88a6abcd97c
  - round 1 plan 82766542 returned correctness P1=2 and docs P1=2 P2=2
  - round 2 plan 3d5fe077 returned correctness P1=3 and docs P1=1 P2=1
  - round 3 plan 30d43610 passed correctness P0-P3 zero and returned docs P1=1 P2=2
  - round 4 plan ae4ec2f2 returned correctness P1=1 and docs P1=1
  - round 5 correctness PASS P0=P1=P2=P3=0
  - round 5 documentation PASS P0=P1=P2=P3=0
  - prompt-check passed for both round 5 visible reviewer prompt cards
  - base design, lifecycle addendum, lifecycle plan, inherited base plan, D4 v4, and structural SQL hashes matched
  - owner artifact validation, Prettier, and git diff --check passed
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.16-d4-normative-rereviews.md
explicit_defers:
  - W RED-to-GREEN implementation and independent acceptance remain next
  - M H and Root implementation remain dependency-ordered after accepted W
  - every GHCR server Supabase Qdrant service secret schema writer scheduler staging production deployment and live-reindex mutation remains outside this decision
---

# Summary

The owner-approved D4 v4 decision has been incorporated into one frozen
normative design and one executable implementation plan. Five full independent
rereview rounds were performed because every plan correction changed its SHA.
The final exact bytes are:

- design: `docs/superpowers/specs/2026-07-14-q12-durable-recovery-projections-addendum-design.md`,
  SHA-256 `28655ffe401efe39b09ba436d101aeed055c8fe25cb8a8e4fd3e90720e745ab4`;
- plan: `docs/superpowers/plans/2026-07-14-q12-durable-recovery-projections-addendum.md`,
  SHA-256 `e891a65745210248bf04b325cc7ef7bd1dba562ea5ac40c6b63aa88a6abcd97c`.

Both final reviewers returned PASS with P0=P1=P2=P3=0. The plan preserves the
pre-cleanup migration/source/reindex lifecycle, keeps all recovery authority in
Root, gives W only its exact child evidence duties, and uses an isolated
migration-only Vitest configuration with disposable PostgreSQL and zero-skip
proof.

# Verification

Root rechecked all frozen predecessor hashes, the exact 1,254-line W structural
SQL SHA-256, final prompt-check results, artifact validation, Prettier, and
`git diff --check`. The correctness reviewer additionally proved the isolated
M suite is discoverable without Qdrant/Redis setup. Neither reviewer edited a
file or performed a remote/live action.

The review history is intentionally retained rather than relabelled: rounds
1–4 are returned evidence, while only round 5 accepts the final SHA pair.

# Risks / Follow-ups

This accepts only the local D4 contract and unblocks W TDD. It does not accept
any W code yet and does not authorize server, database, registry, Qdrant,
service, deployment, staging, production, or live-reindex effects. Rollback is
local: revert the normative package commit; no external state exists to undo.
