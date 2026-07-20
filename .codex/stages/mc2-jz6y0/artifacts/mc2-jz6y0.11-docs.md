---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.11
stage_id: mc2-jz6y0
agent_type: technical_docs_worker
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: Setup, retrieval, security, recovery, monitoring, systemd and rollback guidance required one coherent architectural and operations reconciliation.
repo: /home/me/code/mc2
branch: codex/q10-docs
base_branch: codex/self-hosted-qdrant-platform
base_commit: d7be7adc341e567c2ad9a5be5a241489a4814ac9
worktree: /home/me/code/mc2/.worktrees/q10-docs
status: accepted
delivery_method: merge
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Docs-only worker created no services, containers, volumes, databases, credentials, deployment state, live index writes, or remote runtime mutations. Reviewed head 42ed1322 merged as 3c9dd641; the dedicated worktree and local branch were removed while the remote evidence branch was retained.
risk_level: high
docs_impact: ops-deploy
docs_reviewed: updated
docs_review_notes: Reconciled current setup, deployment, retrieval, recovery, monitoring and rollback guidance; explicitly bannered retained historical research/specification material. The final independent review at 42ed1322 reported Ready to merge Yes with P0-P3 zero.
graph_reviewed: updated
graph_review_notes: Parent refreshed local-only Graphify 0.8.45 after Q10 acceptance with 50371 nodes and 74817 edges. The focused query found the canonical runbook retrieval, bootstrap/reindex, snapshot/restore, systemd, monitoring and rollback surfaces. The intentional documentation reduction required `graphify update . --force`; community totals are omitted because reclustering may repartition an unchanged graph. No external model/API mode or Git hook was used.
verification:
  - Initial independent docs review returned Ready NO with six Important findings (I1-I6) and one Minor finding (M1); orchestrator acceptance remained no.
  - Second independent docs review returned Ready NO with one remaining Important finding (I3): fresh-network setup, host reindex credentials, and snapshot/restore contracts were not yet jointly reproducible.
  - Initial broad non-archive Cloud/cluster/custom-BM25 scan recorded 108 matching lines; exact Cloud scan after edits retains 49 historical/retirement lines across 20 classified files.
  - Current-guidance exact Cloud scan found one explicit retirement sentence and zero actionable hosted setup, endpoint, account, dashboard or key instructions.
  - Active old-pin scan for Prometheus 3.11.3 and Grafana 12.4.0 found zero; current operator/deployment docs contain 21 positive pin references.
  - Current Qdrant setup/module/operator docs contain 71 positive retrieval, strict-schema, reindex, snapshot/restore, systemd, rollback and Q12 references before the final exact-truth wording pass.
  - Prettier check, git diff --check, artifact validation and process verification passed after the complete docs write.
  - First review remediation reconciled the indexed arithmetic-only Formula, accepted 4h11 snapshot timing/systemd units, bootstrap/verify host credentials, actual client behavior, immutable promtool digest, split image-lock ledgers, and concise upload public API/status/error semantics; it did not yet prove all recovery commands reproducible.
  - Remediation stale-claim scan found zero matches across six focused groups; positive evidence counted 4 Formula, 6 recovery, 6 host-CLI, 2 digest-pinned promtool, 3 dual-ledger-file and 4 upload-contract references, plus 8 existing upload-guide link targets.
  - Full base-to-head scope contains 31 files, all Markdown; the first-remediation delta contains 10 Markdown files and no runtime/config changes.
  - Remediation Prettier check, base/current git diff checks, artifact validator and process verification passed before commit; post-commit git-show and clean-push evidence remains part of worker delivery.
  - Second remediation adds idempotent `megacampus-network` preflight to both local setup entrypoints, wraps all three host reindex commands in a defined secret-safe loopback helper, and separates client, snapshot, restore, and authorized-systemd contracts in the runbook.
  - Focused second-remediation scans cover fresh-network preflight, host reindex raw-key isolation, snapshot file-backed inputs, restore manifest/probe/transport inputs, and removal of the ambiguous seven-command block.
  - Second-remediation focused totals are 2 fresh-network docs, 3 host reindex commands, 5 staging operator client commands, 6 snapshot contract terms, 3 restore-only terms, 2 preferred systemd start commands, and 0 ambiguous combined-block matches.
  - Second-remediation delta contains 4 Markdown files; runtime, config, Beads, services, credentials, networks, collections, and remote state remain unchanged.
  - Second-remediation Prettier check covered all 31 branch Markdown files; current/base diff checks, artifact validator, process verification, and full base-to-head stat inspection passed before commit.
  - Independent third re-review at 42ed1322 passed with Critical/Important/Minor all zero; all three Bash snippets passed bash -n and the reviewer reported Ready to merge Yes.
  - Reviewed head 42ed1322 merged as 3c9dd641. Parent integration acceptance passed Prettier on 31 Markdown files, diff checks, artifact validation, process verification and canonical stage closeout dry-run.
  - Parent scans found 0 actionable Cloud instructions, 0 stale Prometheus/Grafana pins, 0 stale Formula/recovery claims and 86 positive current-contract references.
  - Parent Graphify refresh passed with `graphify update . --force` after the intentional removal of obsolete docs, followed by `graphify cluster-only . --no-viz`; report commit matched bf89f22e before this graph-evidence record and is refreshed again after its commit.
changed_files:
  - .claude/docs/deployment-guide.md
  - .codex/project-index.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.11-docs.md
  - README.md
  - docs/ARCHITECTURE-DIAGRAM.md
  - docs/TECHNICAL_SPECIFICATION_PRODUCTION_EN.md
  - docs/operations/qdrant-self-hosted.md
  - docs/quickstart.md
  - docs/reports/repository/REPOSITORY_SUMMARY.md
  - docs/research/RAG-vs-KAG-ADDENDUM.md
  - docs/research/RAG1.md
  - docs/superpowers/plans/2026-07-10-self-hosted-qdrant-platform.md
  - docs/superpowers/specs/2026-07-10-self-hosted-qdrant-platform-design.md
  - packages/course-gen-platform/docs/T072-qdrant-client-implementation.md
  - packages/course-gen-platform/docs/qdrant-setup.md
  - packages/course-gen-platform/src/shared/qdrant/COLLECTION_SETUP.md
  - packages/course-gen-platform/src/shared/qdrant/README.md
  - packages/course-gen-platform/src/shared/qdrant/UPLOAD-GUIDE.md
  - packages/course-gen-platform/src/stages/stage2-document-processing/README.md
  - specs/001-stage-0-foundation/plan.md
  - specs/001-stage-0-foundation/research.md
  - specs/001-stage-0-foundation/spec.md
  - specs/001-stage-0-foundation/tasks-archive.md
  - specs/003-stage-2-implementation/plan.md
  - specs/003-stage-2-implementation/quickstart.md
  - specs/003-stage-2-implementation/spec.md
  - specs/003-stage-2-implementation/tasks.md
  - specs/005-stage-3-create/data-model.md
  - specs/005-stage-3-create/plan.md
  - specs/005-stage-3-create/quickstart.md
  - specs/008-generation-generation-json/plan.md
explicit_defers:
  - Q12 only: staging/production file transfer, deploy, secret creation/change, service installation/enabling, live reindex, alias cutover, real notification and every remote mutation remain unauthorized.
  - Before any Q12 activation, staging must prove systemd >=247, the packaged `/usr/bin/pnpm` path, required file-backed credentials, metrics directory ownership, and rollback operator availability.
---

# Summary

Q10 replaces active hosted-Qdrant setup and stale retrieval claims with one current contract: private digest-pinned Qdrant 1.18.2, exact JavaScript client 1.18.0, stable `course_embeddings` alias over versioned physical collections, native multilingual BM25 documents with collection-side IDF, dense+sparse server RRF nested in Formula over `$score`, and strict tenant/filter indexes including float `document_weight`.

The operator and deployment docs now cover authoritative-source deterministic reindex, atomic alias cutover/rollback, exact-version isolated snapshot restore with `priority=snapshot`, authenticated `/metrics` on listener 6333, the approved monitoring pins, file-backed credentials, textfile atomicity, provisioned Grafana behavior, systemd >=247, timer/lock behavior, and the Q12 boundary. The development document-evidence decision is explicitly separated from any staging/production activation authority.

# Source packet

First-party sources checked 2026-07-12:

- Qdrant 1.18.2 release: <https://github.com/qdrant/qdrant/releases/tag/v1.18.2>
- Qdrant text/BM25: <https://qdrant.tech/documentation/search/text-search/full-text-search/>
- Qdrant hybrid/RRF/Formula: <https://qdrant.tech/documentation/search/hybrid-queries/>
- Qdrant indexing and administration: <https://qdrant.tech/documentation/manage-data/indexing/> and <https://qdrant.tech/documentation/operations/administration/>
- Qdrant collections/aliases, snapshots, security and monitoring: <https://qdrant.tech/documentation/manage-data/collections/>, <https://qdrant.tech/documentation/operations/snapshots/>, <https://qdrant.tech/documentation/security/>, <https://qdrant.tech/documentation/tutorials-operations/secure-qdrant/>, and <https://qdrant.tech/documentation/ops-monitoring/monitoring/>
- Prometheus 3.13.1 release/LTS/config: <https://github.com/prometheus/prometheus/releases/tag/v3.13.1>, <https://prometheus.io/docs/introduction/release-cycle/>, and <https://github.com/prometheus/prometheus/blob/v3.13.1/docs/configuration/configuration.md>
- Grafana 12.4.5/support/provisioning/Docker: <https://github.com/grafana/grafana/releases/tag/v12.4.5>, <https://grafana.com/docs/grafana/latest/upgrade-guide/when-to-upgrade/>, <https://grafana.com/docs/grafana/latest/administration/provisioning/>, and <https://grafana.com/docs/grafana/latest/setup-grafana/configure-docker/>
- node_exporter 1.12.0/textfile and Alertmanager 0.33.1/config: <https://github.com/prometheus/node_exporter/releases/tag/v1.12.0>, <https://github.com/prometheus/node_exporter/blob/v1.12.0/README.md#textfile-collector>, <https://github.com/prometheus/alertmanager/releases/tag/v0.33.1>, and <https://github.com/prometheus/alertmanager/blob/v0.33.1/docs/configuration.md>
- systemd 257 manuals: <https://www.freedesktop.org/software/systemd/man/257/systemd.exec.html>, <https://www.freedesktop.org/software/systemd/man/257/systemd.service.html>, and <https://www.freedesktop.org/software/systemd/man/257/systemd.timer.html>. Runtime minimum is 247 because `LoadCredential` was added in 247.

# Cloud scan classification

The initial broad scan returned 108 matching lines. After reconciliation, exact hosted-Qdrant terms remain only in these classified files:

- Current retirement statements: `packages/course-gen-platform/docs/qdrant-setup.md`, `.codex/handoff.md`, the approved 2026-07-10 Qdrant design/plan, and the continuation prompt. Each explicitly says the old test-only service is retired/lost, forbids recovery/mutation, or describes the superseded baseline.
- Bannered historical research/specifications: both `docs/research/RAG*` files; `specs/001-stage-0-foundation/{plan,research,spec,tasks-archive}.md`; `specs/003-stage-2-implementation/{plan,quickstart,spec,tasks}.md`; `specs/005-stage-3-create/{data-model,plan,quickstart}.md`; and `specs/008-generation-generation-json/plan.md`. Every file begins with a conspicuous historical/superseded/not-runtime-guidance banner and links to the operator runbook.
- Non-runtime persona metadata: `.claude/agents/infrastructure/workers/infrastructure-specialist.md` contains a generic legacy service-specialist phrase, no endpoint, key, provisioning command, or application runtime instruction. It was outside the authorized docs/research/spec write zone and is not actionable guidance.

The 16 current-guidance surfaces contain no hosted endpoint, hosted dashboard/account creation, hosted API-key acquisition, or active hosted deployment instruction. The one exact phrase outside the approved design/plan is the explicit retirement warning in the setup guide.

# Verification and delivery

The initial independent review returned Ready NO: I1-I6 identified incorrect design/recovery/setup/client/pin/ledger claims, while M1 identified an over-reduced upload guide. The first remediation corrected those direct claims against `collection-schema.ts`, `search-operations.ts`, accepted systemd units/timers, `client.ts`, both image-lock ledgers, `upload.ts`, `upload-types.ts`, the Stage 2 caller, and focused tests. The second review remained Ready NO because I3 command reproducibility was incomplete; the follow-up adds the external-network preflight, explicit host reindex helper, and separate client/snapshot/restore/systemd contracts.

Final formatting, focused stale-claim scans, artifact validation, process verification, base-to-head diff inspection, commit and push evidence passed on the worker branch. The third independent review passed with no findings, and the merged integration tree passed the parent acceptance gates.

# Rollback and cleanup

This stream changes Markdown only. Rollback is the branch revert; no runtime rollback is necessary because no service, secret, collection, snapshot, notification, deployment, staging or production state was touched. The dedicated worktree/local branch may be removed only after parent review and integration; the pushed evidence branch remains available until then.

docs-reviewed: updated — durable developer/operator/retrieval/recovery guidance and historical classification are reconciled; independent review pending.

graph-reviewed: updated — local-only Graphify 0.8.45 refresh and focused runbook query passed; no external semantic/model/API mode or Git hook was used.

# Risks / Follow-ups

Q10 is accepted. Q12 is the only operational defer: staging systemd/version/path/secrets preflight and every remote activation or mutation still require explicit current-task authorization.
