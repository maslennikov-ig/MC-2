---
schema_version: orchestration-artifact/v1
artifact_type: independent-review
task_id: mc2-jz6y0.13.16
stage_id: mc2-jz6y0
agent_type: correctness_reviewer
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: Repeated independent reviews test exact crash boundaries and normative closure before owner approval.
repo: /home/me/code/mc2
branch: codex/self-hosted-qdrant-platform
base_branch: codex/self-hosted-qdrant-platform
base_commit: 3a284dd491214c5ff4ae720b7c90b94bc4a80f04
worktree: /home/me/code/mc2/.worktrees/self-hosted-qdrant-platform
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.16-d4-v2-v3-rereviews.md
success_criteria:
  - Preserve the exact v2 and v3 independent rereview outcomes.
  - Accept only when both correctness and docs report P0=P1=P2=P3=0.
selected_docs:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.16-d4-decision-candidate-v2.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.16-d4-decision-candidate-v3.md
  - docs/superpowers/specs/2026-07-13-q12-live-cutover-corrections-design.md
  - docs/superpowers/specs/2026-07-13-q12-recoverable-lifecycle-addendum-design.md
selected_skills:
  - superpowers:receiving-code-review
  - verification-before-completion
selected_agents:
  - correctness_reviewer
  - docs_reviewer
catalog_candidates:
  - none - installed review agents and repository truth covered the bounded rereviews
parallel_group: q12-d4-contract-rereviews
depends_on_streams:
  - D4 candidate v2
  - D4 candidate v3
parallel_decision: parallel read-only rereviews against frozen candidate bytes
status: returned
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: Review-only work created no runtime, database, server, registry, container, secret, or remote state.
risk_level: high
docs_impact: docs-only
docs_reviewed: no-change-needed
docs_review_notes: V3 docs rereview passed; normative incorporation remains pending correctness closure and owner approval.
graph_reviewed: no-change-needed
graph_review_notes: Exact named documents and artifacts fully bounded the read-only rereviews.
verification:
  - v2 SHA-256 90fcd3eebeb579ffc5e3a1e4c5fa9b01bcefb6f1a506ada753c1e2d247d323b7
  - v2 correctness P1=3 and docs P1=6 P2=1
  - v3 SHA-256 6ff751c8a1ff72ea6e39e008acd4d9e4568f89cef216ac5df7173f50b07a7beb
  - v3 docs PASS P0=P1=P2=P3=0
  - v3 correctness NO-GO P0=0 P1=2 P2=0 P3=0
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.16-d4-v2-v3-rereviews.md
explicit_defers:
  - Exact owner approval, normative incorporation, W implementation, and all remote/live effects remain pending.
---

# Summary

Candidate v2 closed the original D4 findings but its fresh rereviews returned
correctness P1=3 and docs P1=6/P2=1. Candidate v3 closed every docs finding and
received docs PASS with P0-P3 zero. Its correctness rereview returned only two
P1 findings, both confined to the new quiesce recovery-prefix overlay.

## Remaining v3 findings

1. `recovery_prefix_accepted` must explicitly require the new capability to
   remain in `issued/`, retain its current hash, accept only the overlay, and
   permit only the next no-replace move to `claimed/`.
2. If the immutable overlay is durable but its acceptance journal/checkpoint is
   not, the contract must distinguish continuous-lease acceptance from lock-
   loss abandonment, retain the abandoned object as audit residue, forbid late
   acceptance, and link the next overlay to it.

# Verification

Reviewers recomputed the exact candidate/spec/plan hashes, inspected the W
structural SQL at SHA-256
`0b8a943f38b43bf99813343d365a7884e43d8237691532dc953554138f268b1e`,
and ran read-only diff/whitespace checks. V3 closed checkpoint scope, rollback
literal, baseline anchoring, supersession chaining, existing-result completion,
and `config_files` canonicalization. Remote/live authority remained absent.

# Risks / Follow-ups

V3 is not accepted. A narrow V4 overlay correction and fresh correctness/docs
rereviews are required before owner approval or normative implementation.
