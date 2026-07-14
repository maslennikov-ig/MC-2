---
schema_version: orchestration-artifact/v1
artifact_type: owner-decision
task_id: mc2-jz6y0.13.16
stage_id: mc2-jz6y0
agent_type: root-orchestrator
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: The approval freezes a high-risk cross-process authority and crash-recovery contract shared by W, H, and Root.
repo: /home/me/code/mc2
branch: codex/self-hosted-qdrant-platform
base_branch: codex/self-hosted-qdrant-platform
base_commit: d523bf383f65492b7d06356cefdd7618f82d2ca6
worktree: /home/me/code/mc2/.worktrees/self-hosted-qdrant-platform
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.16-d4-owner-approval.md
status: accepted
delivery_method: n/a
accepted_by_orchestrator: yes
cleanup_status: not_applicable
cleanup_notes: Local decision evidence only; no external system was read or mutated.
risk_level: high
docs_impact: ops-deploy
docs_reviewed: updated
docs_review_notes: The final frozen normative design and plan received independent docs PASS P0=P1=P2=P3=0 in round 5.
graph_reviewed: used
graph_review_notes: Existing Graphify report plus focused q12 writer resume capability/checkpoint query were consulted; durable refresh follows accepted implementation integration.
verification:
  - exact D4 v4 SHA-256 e6ac9c5eb4b8f5a5c0b27626dfe7675d5e98c25bf219ddb0ae65df7087e9e6d9
  - D4 v4 independent correctness PASS with P0=P1=P2=P3=0
  - D4 v4 independent documentation PASS with P0=P1=P2=P3=0
  - owner replied Подтверждаю directly to the immediately preceding exact full approval sentence on 2026-07-14
  - frozen normative design SHA-256 28655ffe401efe39b09ba436d101aeed055c8fe25cb8a8e4fd3e90720e745ab4
  - initial implementation plan SHA-256 8276654282c23e01c70d93b909ac5bca415683a51f8942b71895077120c8cc28 returned by correctness P1=2 and docs P1=2 P2=2 rereviews
  - round-2 implementation plan SHA-256 3d5fe077b6c2757afa339c8928d890611a1c2032813fb5424d0f9ead9f48c88b returned by correctness P1=3 and docs P1=1 P2=1 rereviews
  - round-3 implementation plan SHA-256 30d43610a15025438e9ff6917d132067917c31b73ddb4381b4ac52ff892d9925 passed correctness P0-P3 zero and returned docs P1=1 P2=2
  - round-4 implementation plan SHA-256 ae4ec2f2db207a0738cc43e30f9ed8e357540c40c900df67202bc6fa3ad2e893 returned by correctness P1=1 and docs P1=1 because its M gate used the nonisolated package Vitest config
  - round-5 implementation plan SHA-256 e891a65745210248bf04b325cc7ef7bd1dba562ea5ac40c6b63aa88a6abcd97c passed correctness and docs P0=P1=P2=P3=0
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.16-d4-owner-approval.md
explicit_defers:
  - W implementation and independent acceptance remain required before integration
  - every GHCR, server, Supabase, Qdrant, service, secret, schema, writer, scheduler, staging, production, deployment, or live-reindex mutation remains outside this approval
---

# Summary

The owner explicitly approved the exact corrected D4 v4 sentence on 2026-07-14
by replying `Подтверждаю` directly to that complete immediately preceding
sentence. The approved bytes are SHA-256
`e6ac9c5eb4b8f5a5c0b27626dfe7675d5e98c25bf219ddb0ae65df7087e9e6d9`.

The approval selects both Option A recommendations: one immutable host-command
capability file moves through `issued/claimed/completed/superseded`, and the DB
child publishes only terminal proof while Root alone completes the host
capability, deletes the DB capability, performs the sole receipt v1-to-v2 CAS,
and accepts the phase. It also accepts separate capability/child checkpoints,
no new child execution under an old capability after lock loss, immutable
accepted/abandoned quiesce overlays, and one shared fail-closed W/H/Root
contract.

# Verification

The exact D4 v4 bytes already received fresh independent correctness and docs
PASS, both P0=P1=P2=P3=0. Root checked that the user's confirmation directly
answered the exact approval sentence rather than a summary or a materially
different proposal. This record authorizes normative incorporation and safe
local implementation, tests, review, commit, and push only.

# Risks / Follow-ups

The derived normative design and plan received their own frozen-byte correctness
and documentation PASS, both P0=P1=P2=P3=0, in round 5. W code remains
unimplemented and unaccepted. This approval does not authorize any remote/live
mutation. The rollback state is local-only: revert the normative package and
accepted local implementation commits; no external state exists to undo.
