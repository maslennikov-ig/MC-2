---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13-docs
stage_id: mc2-jz6y0
agent_type: docs_reviewer
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: Q12 documentation controls privileged migrations, immutable operator execution, recovery, rollback, and an authorized but currently blocked activation
repo: mc2
branch: codex/q12-docs-review
base_branch: codex/self-hosted-qdrant-platform
base_commit: 2943a942
integrated_truth_commit: 6645708dcb1c0792ef293744ac921838f258cb4f
worktree: /home/me/code/mc2/.worktrees/q12-docs-review
write_zone:
  - docs/operations/qdrant-self-hosted.md
  - docs/operations/document-evidence.md
  - .claude/docs/deployment-guide.md
  - .claude/commands/deploy.md
  - .env.production.example
  - packages/course-gen-platform/.env.example
  - packages/course-gen-platform/docs/qdrant-setup.md
  - packages/course-gen-platform/src/shared/qdrant/README.md
  - packages/course-gen-platform/src/shared/qdrant/COLLECTION_SETUP.md
  - .codex/handoff.md
  - .codex/stages/mc2-jz6y0/summary.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-docs.md
success_criteria:
  - all six P1 and three P2 findings in mc2-jz6y0.13-docs-review.md are reconciled with current repository truth
  - production procedures use the digest-pinned container operator and guarded five-migration order
  - first bootstrap, exact secret and systemd, coherent rollback, authorization, and current NO-GO gates are explicit
  - local-only host-pnpm commands and sanitized production environment inputs cannot be mistaken for activation commands
selected_docs:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-docs-review.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-authoritative-docs.md
  - accepted Q12 migration, operator, deploy, rollback, and acceptance artifacts
selected_skills:
  - senior-devops
  - verification-before-completion
selected_agents:
  - docs_reviewer
catalog_candidates:
  - none - accepted repository truth and installed review assets cover this bounded reconciliation
parallel_group: Q12-docs-closeout
depends_on_streams:
  - mc2-jz6y0.13.1
  - mc2-jz6y0.13.2
  - mc2-jz6y0.13.3
parallel_decision: sequential because all findings cross-reference the same runbook and current-state contract
status: accepted
delivery_method: merge
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: implementation 9e840349 and zero-finding review 9bcca13a were merged; no runtime resource was created
risk_level: high
docs_impact: ops-deploy-migration-handoff
docs_reviewed: updated
docs_review_notes: six blocking and three closeout findings were reconciled against accepted Q12 runtime truth
graph_reviewed: blocked
graph_review_notes: parent integration owns the immediate local no-API Graphify refresh after this durable docs merge; no external model/API mode or hook is authorized
verification:
  - documented command/package/script mapping scan: passed
  - stale host-pnpm/authorization/latest/rollback scan: passed with local-only host pnpm as the sole intentional match
  - Markdown Prettier check: passed
  - git diff --check: passed
  - artifact validator: passed
changed_files:
  - docs/operations/qdrant-self-hosted.md
  - docs/operations/document-evidence.md
  - .claude/docs/deployment-guide.md
  - .claude/commands/deploy.md
  - .env.production.example
  - packages/course-gen-platform/.env.example
  - packages/course-gen-platform/docs/qdrant-setup.md
  - packages/course-gen-platform/src/shared/qdrant/README.md
  - packages/course-gen-platform/src/shared/qdrant/COLLECTION_SETUP.md
  - .codex/handoff.md
  - .codex/stages/mc2-jz6y0/summary.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-docs.md
explicit_defers:
  - mc2-jz6y0.25 - move Prometheus retention to supported YAML before the next pin change
  - parent closeout - refresh local Graphify after merge without external model/API modes or git hooks
  - mc2-jz6y0.13 - live activation remains NO-GO until project CA, off-host S3, source truth, and every documented hard gate pass
---

# Summary

All findings from the independent Q12 docs audit are reconciled with accepted
integration truth. Production now uses the immutable container operator rather
than host source/pnpm; the full guarded `120 -> 130 -> 140 -> 150 -> 151`
migration path requires the project CA and exact confirmations; first bootstrap
is explicitly separate from ordinary `/deploy`; and exact secret, UID/GID,
systemd, recovery, and rollback procedures match the current implementation.

The owner decision is recorded accurately: staging deploy/reindex/recovery,
real notification, and document evidence at `true/active/100` are authorized.
Activation is nevertheless NO-GO on the missing project CA, off-host S3 inputs,
and authoritative source-path gaps. No remote mutation occurred in this stream.

# Verification

- Q12-DR1 through Q12-DR6: production operator, five-migration chain, initial
  activation, exact identities/systemd, release-bound worker-coherent rollback,
  and current authorization/NO-GO truth are updated.
- Q12-DR7 through Q12-DR9: host-pnpm setup is explicitly local-only, production
  environment inputs are sanitized, Prometheus defer `.25` is retained, and
  parent Graphify refresh ownership is explicit.
- Every documented executable name was mapped to the current package scripts,
  operator wrapper, Compose services, systemd units, deploy script, or rollback
  script. No secret, product/file ID, content, or provenance hash was added.

# Risks / Follow-ups

These docs remove stale procedural blockers but do not make staging ready. The
project CA, off-host S3 configuration/credentials, and source-truth decision are
external inputs. After they exist, Q12 still requires the complete guarded
migration, bootstrap, gap-free reindex, snapshot/restore, notification,
rollback, coverage/isolation, 60-minute observation, and normal-cycle evidence
before closure.
