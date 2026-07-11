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
  - packages/course-gen-platform/Dockerfile
  - minimal Stage 4/5/6 evidence metrics integration and focused tests
  - packages/course-gen-platform/supabase/migrations/20260711150000_document_evidence_observability_index.sql and rollback
  - ops/qdrant/prometheus/{alerts,alert-tests}.yml
  - evidence-only panels in ops/qdrant/grafana/dashboards/qdrant.json
  - this delegated artifact
success_criteria:
  - Durable restart-persistent bounded metrics cover Stage 4 runs/coverage/work/cost/conflicts/decisions and Stage 5/6 outcomes/fallbacks.
  - Durable Stage 4 state reconciles after a fail-open sink; best-effort execution signals use one constant content-free failure log.
  - Shadow mode persists bounded conflicts and usage without decisions/questions/downstream influence (mc2-jz6y0.24.3).
  - Ordinary evidence logs expose only allowlisted outcomes/statuses/counts and no evidence identity (mc2-jz6y0.24.4).
  - Replay-safe Stage 4 reconciliation, kernel-backed textfile locking, concurrent migrations, O(1) totals, and exact Stage 5 retrieval attempts are implemented (mc2-jz6y0.24.5).
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
cleanup_notes: Disposable PostgreSQL 16 database/role, worktree-local dependencies, build outputs, generated service worker files, and metric lock/temp state were removed; the shared pre-existing PostgreSQL container was not changed.
risk_level: high
docs_impact: migration-and-ops-observability
docs_reviewed: no-change-needed
docs_review_notes: Stable E7/Q9 prose belongs to the disjoint E7-D stream; this artifact records the exact metric/alert/panel/index contract for that review.
graph_reviewed: blocked
graph_review_notes: Read and queried the fresh parent graph at base 7b542c8d. The isolated child does not own the parent's ignored graphify-out state; parent refresh is required after integration.
verification:
  - mc2-jz6y0.24.5 focused Stage 4/5/metrics/privacy gate: 124/124 passed across 9 files
  - post-hook restoration rerun: focused 124/124 and pnpm type-check passed
  - full pnpm test across workspace unit suites: passed
  - Stage 5 exact-attempt and sanitized post-search failure gate: 33/33 passed
  - Disposable PostgreSQL 16 applied migration gate: 6/6 passed
  - Cross-process publisher proof uses 12 real child processes, inherited-fd kernel-lock contention, and killed-owner recovery
  - Privacy remediation contract: initial identity RED 4/4 failed, final GREEN 4/4 passed; outcome naming RED 2/4 failed before GREEN
  - Prometheus 3.13.1 promtool check config/check rules/test rules: passed, 14 rules
  - pnpm type-check: passed across all workspace packages
  - scoped changed-source lint: passed with 0 errors and 13 existing warnings
  - full pnpm lint remains red on 4 pre-existing errors in untouched src/server/routers/clarifying-helpers.ts and src/server/routers/clarifying.router.ts; both are byte-unchanged from task base f40330c4
  - pre-commit lint-staged is tracked as mc2-zsoih (P2); HUSKY=0 was used only after its test-file ESLint mismatch was reproduced and canonical changed-source lint, Prettier, tests, and type-check had passed
  - pnpm build with synthetic loopback web environment: passed; first run failed only required build-time env validation
  - artifact validation and process verification: passed after final cleanup metadata
changed_files:
  - packages/course-gen-platform/Dockerfile
  - ops/qdrant/grafana/dashboards/qdrant.json
  - ops/qdrant/prometheus/alert-tests.yml
  - ops/qdrant/prometheus/alerts.yml
  - packages/course-gen-platform/src/shared/metrics/document-evidence-textfile.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/evidence/conflict-detector.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/evidence/preflight.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/evidence/decision-service.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/evidence/repository.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/orchestrator-helpers.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/orchestrator-phase-helpers.ts
  - packages/course-gen-platform/src/stages/stage5-generation/evidence/advisory-enrichment.ts
  - packages/course-gen-platform/src/stages/stage5-generation/evidence/types.ts
  - packages/course-gen-platform/src/stages/stage5-generation/orchestrator.ts
  - packages/course-gen-platform/src/stages/stage6-lesson-content/rag/retriever.ts
  - packages/course-gen-platform/supabase/migrations/20260711150000_document_evidence_observability_index.sql
  - packages/course-gen-platform/supabase/migrations/rollback/20260711150000_document_evidence_observability_index_rollback.sql
  - packages/course-gen-platform/supabase/migrations/20260711151000_document_evidence_observability_totals.sql
  - packages/course-gen-platform/supabase/migrations/rollback/20260711151000_document_evidence_observability_totals_rollback.sql
  - packages/course-gen-platform/tests/integration/document-evidence-observability-index.test.ts
  - packages/course-gen-platform/tests/unit/ops/document-evidence-log-privacy-contract.test.ts
  - packages/course-gen-platform/tests/unit/ops/document-evidence-observability-contract.test.ts
  - packages/course-gen-platform/tests/unit/ops/qdrant-observability-contract.test.ts
  - packages/course-gen-platform/tests/unit/shared/metrics/document-evidence-textfile.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage4-analysis/evidence/conflict-detector.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage4-analysis/evidence/live-wiring.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage4-analysis/evidence/preflight.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage5-generation/advisory-enrichment-live.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage5-generation/advisory-enrichment.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage6/rag/lesson-rag-retriever.test.ts
  - packages/course-gen-platform/vitest.config.integration-ci.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.24-observability.md
explicit_defers:
  - mc2-zsoih (P2) tracks the repo pre-commit lint-staged configuration applying type-aware source rules to staged test mocks; parent created and Dolt-pushed the Bead before the documented HUSKY=0 commit workaround.
  - Parent E7 integration owns stable documentation reconciliation, Graphify refresh, Beads state, acceptance totals, summary/handoff, and independent review.
  - Q12 retains all remote activation, deployment, live receiver, secret, and staging/production authority.
---

# Summary

E7-O adds one privacy-safe textfile publisher for document-evidence observability. Per-service/instance counters persist independently while coverage, unresolved-critical state, and durable decision totals use one locked, atomic `stage4/aggregate` file. Every read-modify-write path opens a persistent regular lock file, transfers the same Linux open-file description to `flock` on inherited fd 3, and retains the parent file handle through read/apply/temp/rename. Closing the handle or killing the owner releases the kernel lock without heartbeat, mtime, or stale-directory takeover. A 12-child-process test plus direct contention and killed-owner tests verify no lost counters or temporary-file residue. Metrics I/O remains fail-open for product work with one constant content-free log; fail-open delivery is not claimed to be production exactly-once.

Stage 4 metrics consume durable invocation deltas from preflight and newly committed checkpoint/usage/conflict deltas from conflict detection. Accepted-run replay adds zero run/work/cost/conflict counters; a later user or degraded-automatic decision advances exactly once. Cumulative counters are not reconstructed from a bounded identity cache. Decision reconciliation reads a trigger-maintained singleton table while append-only decision rows remain canonical. Coverage and unresolved-critical values remain latest-state gauges. No identity sidecar, run/document/decision identifiers, hashes, or gauges named `_total` are emitted.

The pending-critical partial index is created and dropped with `CONCURRENTLY`. The applied proof uses a statement-by-statement autocommit runner; a transaction-wrapped runner correctly fails with PostgreSQL `25001`. Real concurrent inserts and an answer update complete under a one-second statement timeout while create and drop wait on another writer. This proves the tested PostgreSQL/autocommit path, not universal zero downtime. The singleton migration is transactional and temporarily fences decision inserts while installing its trigger and reconciling history; runtime appends then update counters in O(1).

Stage 5 reports exact `retrievalAttempts`, incremented immediately before each actual search call and propagated to the terminal metric. Context rejection and no eligible documents report zero; no-result/outage calls report one; partial and full multi-section passes report actual calls. Unexpected patcher/validator failures become a sanitized typed failure carrying only the completed count, so a post-search failure reports one while a pre-search injected failure remains zero. The shared durable Stage 5 audit schema is unchanged. Stage 6 remains unchanged by `.24.5`; Stage 7 is untouched.

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
- Replay/locking remediation `mc2-jz6y0.24.5`: the two-pass publisher/live RED exposed replayed cumulative inputs and absent durable reconciliation. The lock follow-up RED proved the directory-lock TOCTOU, killed-owner timeout, and rejected-queue poisoning. GREEN passes 12 real child writers, inherited-fd kernel contention, killed-owner recovery, and later same-path publication after a rejection. Durable Stage 4 reconciliation remains under correction before final acceptance.
- Stage 5 exactness RED/GREEN: 5 failures first proved missing counts and section-derived terminal retrievals. The post-search follow-up proved a patcher throw lost one completed call. Final focused Stage 5 gate passed 33/33 with sanitized count propagation.
- Concurrent migration RED/GREEN: static RED failed on non-concurrent index DDL and missing singleton state. Disposable PostgreSQL 16 then passed 6/6 applied checks for autocommit, transaction rejection, concurrent insert/answer, rollback/reapply, trigger increments, and exact recount.
- Index migration RED/GREEN: static 1 failed before files existed, then passed. First applied run failed 2/3 because PostgreSQL truncated a 70-character identifier; the bounded name fix passed 3/3 with definition, EXPLAIN use, rollback, reapply, and idempotent repeat.
- Fresh final gates are recorded in frontmatter. Privacy scans inspect labels/log additions, dashboard/rules, changed diff, and secret-shaped content. No remote runtime or receiver was contacted.

# Delivery / Cleanup

The implementation remains isolated on `codex/e7-evidence-observability` for parent inspection and merge. The disposable PostgreSQL database/schema and worktree dependencies are removed during final cleanup. Persistent empty `.lock` files are the intentional kernel-lock rendezvous; temporary exposition files are removed on every path. No Compose service, systemd unit, secret, receiver, Qdrant state, cloud resource, staging environment, or production state was changed.

# Risks / Follow-ups / Explicit Defers

The reconciliation query is global by design so an unrelated course cannot clear another conflict. The owner reconfirmed the Prometheus `3.13.1` LTS pin for this remediation; pinned-digest `promtool` config/rule/test checks pass with 14 rules. If the optional sink or lock is unavailable, product work proceeds and the prior durable aggregate remains visible rather than being falsely cleared.

Stable E7 operator/product docs, acceptance totals, summary/handoff, Beads updates, Graphify refresh, integration review, and Q12 remain parent-owned as declared above.
