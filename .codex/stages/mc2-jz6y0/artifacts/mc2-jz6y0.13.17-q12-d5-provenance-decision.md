---
schema_version: orchestration-artifact/v1
artifact_type: owner-decision-candidate
task_id: mc2-jz6y0.13.17
stage_id: mc2-jz6y0
agent_type: root-orchestrator
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: The missing durable authority root controls whether a recovered host command can mutate staging after a crash.
repo: /home/me/code/mc2
branch: codex/self-hosted-qdrant-platform
base_branch: codex/self-hosted-qdrant-platform
base_commit: 11ac0f0cf4815d16e70089346fe3d031e3ea3522
worktree: /home/me/code/mc2/.worktrees/self-hosted-qdrant-platform
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.17-q12-d5-provenance-decision.md
status: blocked
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: Decision evidence only; no external system or live runtime was changed.
risk_level: high
docs_impact: ops-deploy
docs_reviewed: updated
docs_review_notes: Frozen docs prove the requirement but do not define the retained historical evidence shape.
graph_reviewed: no-change-needed
graph_review_notes: Exact frozen docs, refs and producer absence were sufficient; no accepted architecture change exists to refresh.
verification:
  - W pushed clean at 21cff2d0b50df3b2de8e0e7e29fc147658df1eed with upstream divergence 0/0
  - runtime 141/141; canonical real-PG17 joined 192/192; structural 34/34; five-file aggregate 290/290
  - terminal independent review P0=0 P1=1 P2=0 P3=0
  - q12-live-cutover.sh q12-capability-run.sh and q12-command-manifest.json absent from every local ref and worktree
  - frozen base specifies issuance claim and checkpoint hash but no exact retained historical checkpoint artifact or anchor
  - D4 immutable checkpoint copies apply only to its five commands
  - independent blocker documentation review PASS with P0=P1=P2=P3=0
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.17-q12-d5-provenance-decision.md
explicit_defers:
  - W integration and M H Root implementation wait for an owner-approved normative provenance contract
  - every deploy server Supabase Qdrant service secret migration reindex staging production or live mutation remains closed
---

# Summary

W now validates retained command IDs, exact phase/quiesce context, one complete
supersedes chain, consecutive recovery epochs, one completed tip, command hash,
and the two legal no-replay recovery forms. The remaining fail-open path is the
root of a linked recovery chain: a canonical but fabricated predecessor can be
placed in `superseded/` and referenced by the completed tip because no frozen
pre-D4 journal/checkpoint provenance is available to validate it.

The missing producer is planned for Root Task 6 but does not exist in any local
ref or worktree. The base design requires journaled issuance/claim and a
checkpoint-bound generic launcher, yet does not freeze a durable historical
checkpoint name, exact journal-head anchor, retention rule, or deterministic
reconstruction. D4 explicitly limits its new immutable checkpoint-copy naming
to five other commands. W therefore stopped rather than inventing a format.

# Verification

The latest code remains clean and pushed at `21cff2d0`. Its canonical real
PostgreSQL 17 review gate passes 192/192, but independent review correctly
blocks integration with P1=1. A truth-gate search of all refs/worktrees and the
frozen base/recovery/D4 documents confirmed that no exact retained predecessor
evidence shape exists for W to consume.

# Risks / Follow-ups

Recommended owner decision: authorize a narrow normative D5 addendum that
defines the exact retained barrier lifecycle row projection, checkpoint
preimage and journal-head anchor, durable retention or deterministic
reconstruction rule, consecutive recovery bindings, and Root/W ownership for
`barrier.install`, `barrier.verify-after-base`,
`barrier.verify-after-observability`, `barrier.prepare-recovery`, and
`barrier.activate`. Then implement producer and validator TDD and require fresh
independent P0/P1-zero review. Rejecting all retained recovery would contradict
the already approved recoverability promise; accepting digest-only provenance
would remain fail-open.
