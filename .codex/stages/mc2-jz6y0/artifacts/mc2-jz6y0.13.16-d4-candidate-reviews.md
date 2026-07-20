---
schema_version: orchestration-artifact/v1
artifact_type: independent-review
task_id: mc2-jz6y0.13.16
stage_id: mc2-jz6y0
agent_type: correctness_reviewer
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: Two independent reviews tested the proposed crash-recovery and durable-publication contract before owner approval or implementation.
repo: /home/me/code/mc2
branch: codex/self-hosted-qdrant-platform
base_branch: codex/self-hosted-qdrant-platform
base_commit: 9d3f3a1cbe74e0579c74a914fb797eeb0d42e40e
worktree: /home/me/code/mc2/.worktrees/self-hosted-qdrant-platform
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.16-d4-candidate-reviews.md
success_criteria:
  - Review the same immutable candidate independently for correctness and normative documentation completeness.
  - Accept only with P0=P1=P2=P3=0.
selected_docs:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.16-d4-decision-candidate.md
  - docs/superpowers/specs/2026-07-13-q12-live-cutover-corrections-design.md
  - docs/superpowers/specs/2026-07-13-q12-recoverable-lifecycle-addendum-design.md
  - docs/superpowers/plans/2026-07-13-q12-live-cutover-corrections.md
  - docs/superpowers/plans/2026-07-13-q12-recoverable-lifecycle-addendum.md
selected_skills:
  - superpowers:receiving-code-review
  - senior-architect
  - verification-before-completion
selected_agents:
  - correctness_reviewer
  - docs_reviewer
catalog_candidates:
  - none - installed review agents and authoritative repository documents covered the gate
parallel_group: q12-d4-contract-gate
depends_on_streams:
  - mc2-jz6y0.13.10 independent NO-GO review
parallel_decision: parallel - both reviews were read-only against the same frozen candidate bytes
status: returned
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: Both reviews were read-only and created no worktree, runtime, database, container, registry, server, or remote state.
risk_level: high
docs_impact: docs-only
docs_reviewed: no-change-needed
docs_review_notes: The review itself changed no normative document; the candidate requires correction before owner approval.
graph_reviewed: no-change-needed
graph_review_notes: Review scope was confined to the named normative files and exact candidate; no new architecture search was needed.
verification:
  - candidate SHA-256 3354379f4f3254c1b121c7e83143b7f2966c270569067d1d44d808baa968afcc
  - correctness review verdict NO-GO with P0=0 P1=4 P2=1 P3=0
  - documentation review verdict correction-required with P0=0 P1=7 P2=0 P3=0
  - base design SHA-256 5d575bf8424dbd9b94eb79bc5e477c3152327b70593dae811c876c3c222d5c15
  - lifecycle addendum SHA-256 7188d792af79ec881c16ef0729394e5c1f5c2c67aa6d59b86bec1bdf91308b27
  - addendum plan SHA-256 316c8b20812ae23f2c367282b742d25277acff3557fe38a7515d843360d719db
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.16-d4-candidate-reviews.md
explicit_defers:
  - Owner exact approval, normative addendum edits, W implementation completion, and every remote/live effect remain pending.
---

# Summary

Two visible independent reviewers assessed the same D4 candidate at SHA-256
`3354379f4f3254c1b121c7e83143b7f2966c270569067d1d44d808baa968afcc`.
Neither reviewer edited a file or performed a remote/live action. Both rejected
the candidate as insufficiently exact; no approval claim was made.

The correctness verdict was **NO-GO: P0=0, P1=4, P2=1, P3=0**. The docs verdict
was **correction required: P0=0, P1=7, P2=0, P3=0**.

## Consolidated findings

1. Resume does not name one capability-bound checkpoint and one
   receipt-bound input checkpoint for uninterrupted and recovery execution.
2. Capability manifest paths/schemas/hash preimages are absent, and recovery
   does not cover every durable issue/claim/complete/checkpoint boundary or the
   exact retirement of old authority.
3. The database v1-to-v2 receipt transition is not identified as the sole CAS
   replacement exception; nested baseline/catalog/default/cron/residue and
   required-receipt projections are not exact.
4. Database rollback intent and terminal proof lack exact command,
   phase/outcome, checkpoint, journal-anchor, and object-acceptance chronology.
5. `writers.quiesce` lacks exact environment, descriptor, lease,
   capability/journal/checkpoint sequence, repeated-phase exception, and final
   object-acceptance mapping.
6. Writer inventory refers to an ambiguous existing projection instead of an
   exact nested key set, order, and hash preimage.
7. The candidate does not enumerate every superseded closed clause and
   incorrectly speaks of same-phase pairs for all five new schemas rather than
   the exact first four.

# Verification

Both reviewers recomputed the authoritative design and plan hashes, inspected
the exact conflicting passages, and ran read-only whitespace/diff checks. They
confirmed that the proposed inventory-to-transition-to-final-manifest object
chain avoids a future-hash cycle and that the proposed DB order
COMMIT-to-proof-to-capability-deletion-to-receipt is conceptually safe. The
candidate failed because the exact projections and intermediate recovery states
were not fully frozen.

# Risks / Follow-ups

D4 remains open. The candidate must be corrected, rehashed, and independently
rereviewed with P0-P3 zero before the owner is asked to approve an exact
sentence or W/Root implements the disputed graph. Remote/live authority remains
unchanged and absent.
