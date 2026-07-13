---
schema_version: orchestration-artifact/v1
artifact_type: delegated-review
task_id: mc2-jz6y0.13.7-docs-rereview
stage_id: mc2-jz6y0
agent_type: docs_reviewer
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: the corrected packet controls database credentials, rollback evidence, production-data restore isolation, and the pre-migration NO-GO boundary
repo: mc2
branch: codex/q12-supabase-docs-rereview
base_branch: origin/codex/self-hosted-qdrant-platform
base_commit: 7b446d7d4407b7ec87ec6de1036ff67007fd069d
reviewed_commit: 7b446d7d4407b7ec87ec6de1036ff67007fd069d
reviewed_range: 0430e99643053f0b141db11c7b2c8f7c8d5dde46..7b446d7d4407b7ec87ec6de1036ff67007fd069d
worktree: /home/me/code/mc2/.worktrees/q12-supabase-docs-rereview
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7-docs-rereview.md
success_criteria:
  - independently recheck Q12-SD1 and Q12-SD2 against the exact correction delta
  - preserve immutable NO-GO findings and every live database, server, and restore gate
  - return findings-first P0-P3 counts and accept only with every count zero
selected_docs:
  - .codex/handoff.md
  - docs/operations/qdrant-self-hosted.md
  - docs/operations/document-evidence.md
  - deploy/postgres/backup-supabase.sh
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7-docs-review.md
  - corrected mc2-jz6y0.13.7* and mc2-jz6y0.27* stage artifacts
selected_skills:
  - code-review
  - senior-devops
  - superpowers:verification-before-completion
selected_agents:
  - docs_reviewer
  - correctness_reviewer perspective
catalog_candidates:
  - none - installed review assets and accepted repository evidence cover the bounded rereview
parallel_decision: sequential - one joined review must reconcile the sole execution packet with its durable runbooks and acceptance trail
status: accepted
delivery_method: cherry-pick
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: The P0-P3-zero rereview is accepted and integrated as a0c12554. Its dedicated worktree was removed, while the pushed evidence branch remains because normal closeout does not force-delete cherry-picked history; no runtime or remote residue was created.
risk_level: high
docs_impact: ops-deploy
docs_reviewed: no-change-needed
docs_review_notes: the correction already updates both durable runbooks, explicitly supersedes every stale executable snippet, and reconciles current acceptance and cleanup metadata
graph_reviewed: no-change-needed
graph_review_notes: the current handoff records a completed local Graphify refresh at the delivered integration head; this review-only artifact changes no durable architecture or workflow
verification:
  - exact correction range 0430e996..7b446d7d was inspected line by line with P0-P3 all zero
  - every reviewed .13.7* and .27* artifact plus this rereview artifact passed validate_artifact.py
  - all corrected Markdown files and this rereview artifact passed the assigned Prettier binary
  - repository process verification and git diff/show whitespace checks passed
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7-docs-rereview.md
explicit_defers:
  - final integration-owned Graphify refresh and delivery verification remain closeout work
  - the permanent verify-full Session pooler DSN remains external and database-password rotation requires separate explicit confirmation
  - every SSH, Supabase, credential, database, dump, restore, Docker, server, service, cron, migration, Qdrant, staging, production, and deploy action remains deferred
---

# Q12 Supabase Backup/Restore Documentation Rereview

# Summary

## Findings-first verdict

**PASS / ACCEPT for corrected commit `7b446d7d`; P0: 0, P1: 0, P2: 0,
P3: 0.** The exact correction range closes both prior findings without weakening
the live NO-GO boundary or rewriting their immutable evidence.

| Closed ID | Prior severity | Rereview result |
| --------- | -------------- | --------------- |
| Q12-SD1   | P1             | Closed          |
| Q12-SD2   | P2             | Closed          |

## Q12-SD1 closed — exactly one executable PostgreSQL 17 packet

- The replacement packet now identifies itself as the sole executable `.13.7`
  backup/restore packet and explicitly supersedes the restore snippet in
  `.13.7.md`, the `/usr/bin` client claims and restore example in
  `.13.7-supabase-cli-login-role.md`, and the proposed commands in the server
  preflight (`mc2-jz6y0.13.7-server-execution-packet-pg17.md:49-55`).
- The same packet requires every dump, TOC validation, full offline archive
  traversal, and isolated restore to use only
  `/usr/lib/postgresql/17/bin/{pg_dump,pg_restore}` and forbids PATH or `/usr/bin`
  fallback (`:57-61`). Its archive phase and isolated restore retain full
  traversal, a fresh custom archive, `--exit-on-error`, and
  `--single-transaction` (`:121-139`).
- Both durable runbooks point to that exact sole packet and say older `.13.7`
  command snippets are historical evidence that must not run
  (`docs/operations/document-evidence.md:308-311` and
  `docs/operations/qdrant-self-hosted.md:365-368`).
- The executable operator remains pinned to the two exact PostgreSQL 17 client
  paths (`deploy/postgres/backup-supabase.sh:18-19`) and invokes them for the
  dump, TOC list, and full traversal (`:400`, `:414`, `:422`). Historical
  `/usr/bin` snippets therefore remain visible as immutable evidence but are no
  longer ambiguous operational instructions.

## Q12-SD2 closed — current metadata matches integrated truth

- The accepted `.13.7-rereview` now records `status: accepted`, cherry-pick
  delivery, orchestrator acceptance, and cleaned state with an integrated
  cleanup note (`mc2-jz6y0.13.7-rereview.md:42-46`).
- The `.27` worker, correction, and rereview artifacts consistently record
  accepted/cleaned state and leave only current live-action or Graphify-closeout
  defers (`mc2-jz6y0.27.md:37-59`, `mc2-jz6y0.27-correction.md:40-63`, and
  `mc2-jz6y0.27-rereview.md:42-63`).
- The PG17 restore-image correction and zero-finding rereview likewise record
  accepted/cleaned state, durable runbook consumption, and only real Graphify or
  live-operation defers (`mc2-jz6y0.13.7.1-correction.md:25-45` and
  `mc2-jz6y0.13.7.1-rereview.md:42-64`).
- The original operator review is still an immutable four-finding NO-GO body,
  but its current metadata correctly accepts it as review evidence and links
  correction `ba207282` plus zero-finding rereview `0276607b`
  (`mc2-jz6y0.13.7-review.md:40-60`). The prior documentation NO-GO artifact is
  unchanged. Findings remain auditable while current readiness is coherent.

# Preserved Live NO-GO Boundary

- The sole packet remains locally prepared but NO-GO until an owner supplies a
  permanent password-bearing Session pooler URI that passes `verify-full`; an
  automatically expiring CLI login role is explicitly not a substitute
  (`mc2-jz6y0.13.7-server-execution-packet-pg17.md:63-66`).
- Unknown database credentials still require a stop. Password rotation can
  invalidate connections and still needs separate explicit confirmation
  (`:83-93`).
- The observed mode-`0775` server backup paths, zero usable backups, client and
  runtime installation, fresh dump, isolated restore, and zero-residue proof
  all remain observed live gates. No partial migration, source recovery,
  reindex, cutover, Qdrant activation, or production action is authorized.

# Documentation / Index / Graph Decision

`docs_impact: ops-deploy`; `docs-reviewed: no-change-needed`. The correction
already made the required durable runbook changes, and this branch adds only its
immutable rereview. The project index needs no change because it already owns
the two runbooks and backup operator, while task state belongs in stage evidence.

`graph-reviewed: no-change-needed`. The current handoff records a completed
Graphify update at the delivered integration head. This review-only artifact
does not change source behavior, architecture, or a durable operating contract,
so another graph refresh would add no relevant graph truth.

# Verification

- Every reviewed `.13.7*` and `.27*` artifact, including this rereview, passed
  `scripts/orchestration/validate_artifact.py`.
- All twelve corrected Markdown files and this rereview artifact passed the
  assigned repository Prettier binary.
- `scripts/orchestration/run_process_verification.sh` passed.
- `git diff --check` on the correction range and `git show --check` on corrected
  commit `7b446d7d` passed.
- No Docker, SSH, Supabase, credential, database, package, service, Qdrant,
  staging, production, deploy, or other live operation was performed.

# Risks / Follow-ups / Explicit Defers

Root-orchestrator acceptance and integration are complete; final Graphify and
delivery verification remain closeout work. The permanent verify-full Session
pooler DSN remains an external owner input, and password rotation remains a
separately authorized impact decision. All live backup, restore, server,
database, migration, Qdrant, staging, production, and deploy actions remain
deferred to an observed authorized window.
