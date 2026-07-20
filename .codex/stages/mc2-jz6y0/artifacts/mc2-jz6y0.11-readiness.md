---
schema_version: orchestration-artifact/v1
artifact_type: readiness-audit
task_id: mc2-jz6y0.11
stage_id: mc2-jz6y0
agent_type: docs_reviewer
repo: /home/me/code/mc2
branch: codex/self-hosted-qdrant-platform
base_branch: origin/codex/self-hosted-qdrant-platform
base_commit: a5a657e31a245988d7c5fcc31b955fe006375ff2
worktree: /home/me/code/mc2/.worktrees/self-hosted-qdrant-platform
status: blocked
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: Read-only audit created no runtime resources, branches, worktrees, services, containers, databases, secrets, or remote state.
risk_level: high
docs_reviewed: updates-required
docs_review_notes: Current quickstart, module docs, deployment guide, runbook, approved design/plan and architecture docs contain active Cloud-first or superseded runtime guidance.
graph_reviewed: used
graph_review_notes: The report built from a5a657e3 was read for orientation; no graph refresh was performed by the read-only reviewer.
verification:
  - Exact Cloud scan failed on current guidance; runtime custom-BM25 scan passed with zero active references.
  - Prettier passed on the 13 docs sampled by the reviewer.
  - git diff --check passed against committed a5a657e3 before parent-owned orchestration updates began.
  - Q12 remote authorization warnings remain present in the operator runbook, handoff, and Beads.
changed_files:
  - none - read-only readiness audit
explicit_defers:
  - Q10 remains dependency-blocked by E7 owner decision mc2-jz6y0.24.2.
  - All Q10 documentation writes and acceptance remain future work after the owner decision.
  - Q12 remote deployment, live reindex, secret/runtime activation, and staging or production mutation remain unauthorized.
---

# Summary

Q10 is not pass-ready. The current runtime implementation is self-hosted, but canonical user and operator guidance still contains active Qdrant Cloud setup, Cloud endpoints and keys, superseded monitoring pins, incomplete strict/native retrieval schema, and incomplete recovery/rollback instructions. The audit found 22 non-archive Markdown files with Cloud claims; current guidance must be rewritten, while genuinely historical records may remain only with explicit superseded/not-runtime-guidance labels.

Blocking write zones are `docs/quickstart.md`, `.claude/docs/deployment-guide.md`, `docs/operations/qdrant-self-hosted.md`, `.codex/project-index.md`, current root/platform/Qdrant module docs, the current architecture/specification docs, and the two approved 2026-07-10 Qdrant spec/plan files. The final docs must describe Qdrant `1.18.2`, Prometheus `3.13.1` LTS, Grafana `12.4.5`, node_exporter `1.12.0`, Alertmanager `0.33.1`, exact image locks, authenticated main-listener scrape, native BM25/IDF plus server RRF/Formula, strict indexes, source reindex, snapshot/restore, systemd units, alias/application rollback, E7 fail-closed rollout and the Q12 boundary.

# Verification

The reviewer ran read-only Cloud/custom-BM25/version scans, inspected the accepted Q6-Q9/E7 artifacts and runtime sources, checked formatting on the sampled docs, and confirmed a clean committed base at `a5a657e3`. Material examples include Cloud-first `docs/quickstart.md`, the Cloud module README/collection/upload guides, missing Qdrant/monitoring topology in `.claude/docs/deployment-guide.md`, incomplete reindex/systemd/rollback steps in `docs/operations/qdrant-self-hosted.md`, and superseded Prometheus/Grafana/Formula claims in the approved design and plan.

Required post-write acceptance includes Cloud-only-historical scans, zero active custom-BM25 claims, zero active `3.11.3`/`12.4.0` guidance, positive self-hosted/native retrieval/version scans, Prettier, `git diff --check`, process verification, independent docs review, and a local Graphify refresh.

# Risks / Follow-ups

Partial documentation edits would be unsafe because setup, deployment, retrieval, recovery and rollback guidance currently disagree across multiple current entrypoints. Q10 should therefore be one coherent docs stream followed by an independent docs review and parent integration scan. No Cloud recovery or mutation is required: the lost Cloud data was test-only, and the derived local index is rebuilt from authoritative sources.

Q10 may start only after `.24.2` is resolved or activation is explicitly deferred and E7 closes. Q12 remains a separate authorization gate.
