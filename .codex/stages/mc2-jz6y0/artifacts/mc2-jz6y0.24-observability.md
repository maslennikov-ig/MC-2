---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.24
stage_id: mc2-jz6y0
agent_type: observability_worker
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: Cross-process durable metrics, privacy-safe cardinality, alert-reset semantics, and live Stage 4/5/6 integration require backend and observability reasoning.
repo: /home/me/code/mc2
branch: codex/e7-evidence-observability
base_branch: codex/self-hosted-qdrant-platform
base_commit: 7b542c8d
worktree: /home/me/code/mc2/.worktrees/e7-evidence-observability
write_zone:
  - packages/course-gen-platform/src/shared/metrics/document-evidence-textfile.ts
  - minimal Stage 4/5/6 evidence metrics integration and focused tests
  - packages/course-gen-platform/supabase/migrations/20260711150000_document_evidence_observability_index.sql and rollback
  - ops/qdrant/prometheus/{alerts,alert-tests}.yml
  - evidence-only panels in ops/qdrant/grafana/dashboards/qdrant.json
  - this delegated artifact
success_criteria:
  - Durable restart-persistent bounded metrics cover Stage 4 runs/coverage/work/cost/conflicts/decisions and Stage 5/6 outcomes/fallbacks.
  - Stage 4/5/6 production paths publish exactly once while metrics I/O fails open with one constant content-free log.
  - Shadow mode persists bounded conflicts and usage without decisions/questions/downstream influence (mc2-jz6y0.24.3).
  - Ordinary evidence logs expose only allowlisted outcomes/statuses/counts and no evidence identity (mc2-jz6y0.24.4).
  - Four Prometheus alerts and six Grafana panels use privacy-safe aggregate signals and reset/absence fixtures.
  - Critical-conflict and coverage reconciliation remains correct across unrelated runs and multiple worker instances.
selected_docs:
  - docs/superpowers/specs/2026-07-11-advisory-document-evidence-rag-design.md observability/validation/rollout
  - docs/superpowers/plans/2026-07-11-advisory-document-evidence-rag.md Task E7
  - accepted E1-E6 and Q9 artifacts/runbook/rules/textfile implementation
  - fresh parent graphify-out/GRAPH_REPORT.md at 7b542c8d
selected_skills:
  - superpowers:test-driven-development
  - senior-devops
  - superpowers:systematic-debugging on dependency/test failures
  - superpowers:verification-before-completion
selected_agents:
  - backend/observability specialist
catalog_candidates:
  - none; installed skills and accepted Q9 assets fit
parallel_group: E7-O alongside E7-D and authorized rollout follow-ups
depends_on_streams:
  - mc2-jz6y0.18 through mc2-jz6y0.23
  - mc2-jz6y0.10
  - mc2-jz6y0.24.3 shadow-conflict expansion is implemented in this stream
  - mc2-jz6y0.24.4 evidence-log privacy re-review is implemented in this stream
parallel_decision: parallel with disjoint docs/rollout write zones; implementation remained sequential within shared Stage 4 metric state
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: cleaned
cleanup_notes: Disposable PostgreSQL 15.18 and the worktree-local dependency install were removed; no test container, temporary metric file, or generated dependency directory remains.
risk_level: high
docs_impact: migration-and-ops-observability
docs_reviewed: no-change-needed
docs_review_notes: Stable E7/Q9 prose belongs to the disjoint E7-D stream; this artifact records the exact metric/alert/panel/index contract for that review.
graph_reviewed: blocked
graph_review_notes: Read and queried the fresh parent graph at base 7b542c8d. The isolated child does not own the parent's ignored graphify-out state; parent refresh is required after integration.
verification:
  - Final expanded TDD joined gate: 123/123 passed across 14 files
  - Privacy remediation contract: initial identity RED 4/4 failed, final GREEN 4/4 passed; outcome naming RED 2/4 failed before GREEN
  - observability-index static gate: 1 passed, 2 applied tests expected skipped without database URL
  - disposable PostgreSQL 15.18 observability-index applied gate: 3/3 passed
  - Prometheus 3.13.1 promtool check config/check rules/test rules: passed, 14 rules
  - pnpm type-check: passed across all workspace packages
  - pnpm build with synthetic loopback web environment: passed
  - artifact validation and process verification: passed; repeated after final cleanup metadata
changed_files:
  - ops/qdrant/grafana/dashboards/qdrant.json
  - ops/qdrant/prometheus/alert-tests.yml
  - ops/qdrant/prometheus/alerts.yml
  - packages/course-gen-platform/src/shared/metrics/document-evidence-textfile.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/evidence/conflict-detector.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/evidence/decision-service.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/evidence/repository.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/orchestrator-helpers.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/orchestrator-phase-helpers.ts
  - packages/course-gen-platform/src/stages/stage5-generation/evidence/advisory-enrichment.ts
  - packages/course-gen-platform/src/stages/stage5-generation/orchestrator.ts
  - packages/course-gen-platform/src/stages/stage6-lesson-content/rag/retriever.ts
  - packages/course-gen-platform/supabase/migrations/20260711150000_document_evidence_observability_index.sql
  - packages/course-gen-platform/supabase/migrations/rollback/20260711150000_document_evidence_observability_index_rollback.sql
  - packages/course-gen-platform/tests/integration/document-evidence-observability-index.test.ts
  - packages/course-gen-platform/tests/unit/ops/document-evidence-log-privacy-contract.test.ts
  - packages/course-gen-platform/tests/unit/ops/document-evidence-observability-contract.test.ts
  - packages/course-gen-platform/tests/unit/ops/qdrant-observability-contract.test.ts
  - packages/course-gen-platform/tests/unit/shared/metrics/document-evidence-textfile.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage4-analysis/evidence/live-wiring.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage5-generation/advisory-enrichment-live.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage6/rag/lesson-rag-retriever.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.24-observability.md
explicit_defers:
  - Parent E7 integration owns stable documentation reconciliation, Graphify refresh, Beads state, acceptance totals, summary/handoff, and independent review.
  - Q12 retains all remote activation, deployment, live receiver, secret, and staging/production authority.
---

# Summary

E7-O adds one privacy-safe textfile publisher for document-evidence observability. Per-service/instance counters persist independently while coverage and unresolved-critical state use one locked, atomic `stage4/aggregate` file, so stale worker files cannot clear or preserve the wrong global state. Newer reconciliation timestamps win; an unrelated run without a durable snapshot cannot clear an open conflict. A partial failed run reports incomplete coverage rather than inventing failed document outcomes. Every final file is explicitly mode `0644`, and metric I/O is converted into one constant log with no error, identifier, answer, or source content.

Stage 4 publishes one completion or failure event. Accepted shadow and active runs both execute and persist bounded conflict detection; only active mode enters decision materialization. The active path reports exact user/system and degraded-automatic decision aggregates. A global pending-critical-question reconciliation supplies count and oldest time; approval creates a new `STRUCTURE_ANALYSIS` job, which reruns the Stage 4 evidence phase and clears resolved state. The new partial `created_at` index exactly covers that production predicate. Stage 5 publishes its final advisory status/fallback count after success or fail-open. Stage 6 wraps its live retriever once and distinguishes cached, success, empty, optional fallback, and required failure without exposing the internal marker to callers. Stage 7 is untouched.

# Metrics, alerts, and panels

Metrics include run status and shadow/active mode; source/assessed/degraded/failed totals; exact/latest coverage; five processing modes; batches, input/output tokens, model calls, cost and duration; conflicts by severity; user/system decisions; degraded automatic decisions; Stage 5 outcomes; Stage 6 outcomes; and Stage 5/6 retrieval request/fallback totals. Labels are fixed base service/instance values plus allowlisted stage/status/mode/outcome/severity/actor/direction values. No tenant, organization, course, run, document, question, decision, claim, filename, answer, reason, model name, or source body is a label.

Alerts are `DocumentEvidenceRunFailed`, `DocumentEvidenceCoverageIncomplete`, `DocumentEvidenceDegradedAutomaticDecisionsRepeated`, and `DocumentEvidenceCriticalConflictStale`. Promtool fixtures cover missing coverage/age series and a degraded-decision counter reset. Dashboard additions are Evidence run status, document coverage, processing modes, cost/duration, conflicts/decisions, and Stage 5/6 retrieval.

# Verification

- Initial RED: publisher import absent and all three Q9 evidence-contract tests failed. Initial GREEN reached 7/7 across publisher and static assets.
- Fail-open RED/GREEN: safe publisher absent (1/4 failed), then publisher 4/4 with the exact `{}` plus constant-message log.
- Live RED/GREEN: Stage 4 completion/failure 2/18 failed then 18/18; Stage 5 2/2 failed then 2/2; Stage 6 completion/failure 2/11 failed then 11/11; explicit optional-fallback RED 1/12 then 12/12.
- Reconciliation review RED/GREEN: five of six publisher tests failed before base labels and durable interleaving semantics; final publisher gate is 7/7, including multi-file uniqueness, open→unrelated→resolved→stale-writer ordering and partial failed coverage.
- Shadow expansion `mc2-jz6y0.24.3`: RED 1/19 because detector calls were zero; GREEN 19/19 with conflict/usage metrics and no resolver call.
- Privacy re-review `mc2-jz6y0.24.4`: the first static contract failed all four identifier groups, then passed 4/4 after Stage 4 completion, all three Stage 5 advisory/fail-open, the Stage 5 completion trace, and the Stage 6 accepted-evidence-empty log were reduced to allowlisted modes/outcomes/statuses/counts. The follow-up `category`→`outcome` naming contract failed 2/4 before the bounded rename and final GREEN. The expanded joined gate passed 123/123 across 14 files.
- Index migration RED/GREEN: static 1 failed before files existed, then passed. First applied run failed 2/3 because PostgreSQL truncated a 70-character identifier; the bounded name fix passed 3/3 with definition, EXPLAIN use, rollback, reapply, and idempotent repeat.
- Fresh final gates are recorded in frontmatter. Privacy scans inspect labels/log additions, dashboard/rules, changed diff, and secret-shaped content. No remote runtime or receiver was contacted.

# Delivery / Cleanup

The implementation remains isolated on `codex/e7-evidence-observability` for parent inspection and merge. The PostgreSQL container/database and test schema were removed. No Compose service, systemd unit, secret, receiver, Qdrant state, cloud resource, staging environment, or production state was changed.

# Risks / Follow-ups / Explicit Defers

The reconciliation query is global by design so an unrelated course cannot clear another conflict. Its exact partial index bounds the pending-critical document-conflict count/oldest scan without changing prior evidence migrations. Cross-process aggregate publication uses a bounded lock with stale-lock recovery and observation ordering; if the optional sink or lock is unavailable, product work proceeds and the prior durable aggregate remains visible rather than being falsely cleared.

Stable E7 operator/product docs, acceptance totals, summary/handoff, Beads updates, Graphify refresh, integration review, and Q12 remain parent-owned as declared above.
