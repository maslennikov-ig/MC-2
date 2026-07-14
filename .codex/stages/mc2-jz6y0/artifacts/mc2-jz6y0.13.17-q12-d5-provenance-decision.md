---
schema_version: orchestration-artifact/v1
artifact_type: owner-decision-candidate
task_id: mc2-jz6y0.13.17
stage_id: mc2-jz6y0
agent_type: root-orchestrator
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: The retained authority root controls whether a recovered host command may mutate staging after a crash.
repo: /home/me/code/mc2
branch: codex/self-hosted-qdrant-platform
base_branch: codex/self-hosted-qdrant-platform
base_commit: e4a7abdb1ba5a859041d2d0c6d292c95e34093d4
worktree: /home/me/code/mc2/.worktrees/self-hosted-qdrant-platform
write_zone:
  - docs/superpowers/specs/2026-07-14-q12-retained-barrier-capability-provenance-addendum-design.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.17-q12-d5-provenance-decision.md
  - .codex/stages/mc2-jz6y0/summary.md
  - .codex/handoff.md
status: blocked
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: Decision evidence only; no external system or live runtime was changed.
risk_level: high
docs_impact: ops-deploy
docs_reviewed: updated
docs_review_notes: Exact D5 candidate is complete and independently P0-P3-zero; it remains non-normative until the owner approves these exact bytes.
graph_reviewed: no-change-needed
graph_review_notes: The candidate remains non-normative pending exact-SHA owner approval, so refreshing the architecture graph now would promote unapproved product truth.
verification:
  - candidate SHA-256 b5f63cd6afd64f47822e9534f8193ecb57f471421c9cf8a8f05e7902d85540e8; 1088 lines
  - independent correctness rereview-6 PASS P0=0 P1=0 P2=0 P3=0; report SHA-256 3907f56b16c52fae26f5eb299595c26678c1874cd9b996e1b798f37e5443b170
  - independent documentation rereview-6 PASS P0=0 P1=0 P2=0 P3=0; report SHA-256 5e39597adf3b87db066755ccadeab7d359751cd9672a78cabc2fce67ad128cb4
  - W remains pushed clean at 21cff2d0b50df3b2de8e0e7e29fc147658df1eed with upstream divergence 0/0
  - W gates remain runtime 141/141 canonical real-PG17 joined 192/192 structural 34/34 and five-file aggregate 290/290
  - candidate and both reviews preserve the separate no-live and no-remote gate
changed_files:
  - docs/superpowers/specs/2026-07-14-q12-retained-barrier-capability-provenance-addendum-design.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.17-q12-d5-provenance-decision.md
  - .codex/stages/mc2-jz6y0/summary.md
  - .codex/handoff.md
explicit_defers:
  - exact-byte owner approval of candidate SHA-256 b5f63cd6afd64f47822e9534f8193ecb57f471421c9cf8a8f05e7902d85540e8
  - implementation planning producer and validator TDD W integration and M H Root execution wait for that approval
  - every deploy server Supabase Qdrant service secret migration reindex staging production or live mutation remains closed
---

# Summary

The owner approved D5 Option A as an architecture choice: Root retains one
immutable byte-exact launcher-checkpoint copy per retained command execution
epoch, and no second claimed-input copy is introduced. The complete written
candidate now freezes the exact selector, checkpoint copy, capability lifecycle,
recovery, no-replay completion, rollback frontier, activation classifier, Root
and launcher ownership, read-only W grammar, crash matrix, and TDD contract.

The final correction makes a journal-less frontier unambiguous. The durable
non-authority row `R` is the sole direct reference to newest tip `T`; the later
rollback intent and accepted row carry the pre-disposition
`F.capability_manifest_sha256`. The final-writer-manifest still proves the
retirement transitively through `intent.previous_hash=R.entry_hash` and the
exact `R` input-checkpoint hash. Both independent rereviews found no P0-P3
issues in these exact bytes.

# Verification

- Candidate:
  `docs/superpowers/specs/2026-07-14-q12-retained-barrier-capability-provenance-addendum-design.md`
- Candidate SHA-256:
  `b5f63cd6afd64f47822e9534f8193ecb57f471421c9cf8a8f05e7902d85540e8`
- Correctness rereview-6: `PASS`, P0/P1/P2/P3 `0/0/0/0`; ignored report
  SHA-256 `3907f56b16c52fae26f5eb299595c26678c1874cd9b996e1b798f37e5443b170`.
- Documentation rereview-6: `PASS`, P0/P1/P2/P3 `0/0/0/0`; ignored report
  SHA-256 `5e39597adf3b87db066755ccadeab7d359751cd9672a78cabc2fce67ad128cb4`.

# Risks / Follow-ups

Architecture approval is not exact-byte approval. The candidate therefore
remains non-normative, the decision remains open, and W remains unintegrated.
The owner must explicitly approve the exact candidate path and SHA-256 above.
Only then may the orchestrator invoke planning, implement the Root producer and
W validator with TDD, and proceed through M, H, Root, joined verification, and
independent review. This decision never authorizes remote or live mutation.
