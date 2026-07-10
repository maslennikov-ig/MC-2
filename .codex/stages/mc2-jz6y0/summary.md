# Stage mc2-jz6y0 — Self-Hosted Qdrant Platform

Status: active
Classification: complex, multi-stream, security/data/operations sensitive
Base branch: `origin/codex/self-hosted-qdrant-platform-plan`
Base commit: `8645db92266339e0d785bb9dcf5521d43aa9e0dc`
Integration branch: `codex/self-hosted-qdrant-platform`
Implementation scope: Q1-Q11 local implementation and verification; Q12 requires explicit current-task authorization.

## Beads Mapping

- Q1 `mc2-jz6y0.2`
- Q2 `mc2-jz6y0.3`
- Q3 `mc2-jz6y0.4`
- Q4 `mc2-jz6y0.5`
- Q5 `mc2-jz6y0.6`
- Q6 `mc2-jz6y0.7`
- Q7 `mc2-jz6y0.8`
- Q8 `mc2-jz6y0.9`
- Q9 `mc2-jz6y0.10`
- Q10 `mc2-jz6y0.11`
- Q11 `mc2-jz6y0.12`
- Q12 `mc2-jz6y0.13` — authorization-required staging activation

## Parallel Decomposition

| Stream | Goal                                 | Agent                                        | Write zone                                         | Dependencies                      | Verification                                         | Decision                                                          |
| ------ | ------------------------------------ | -------------------------------------------- | -------------------------------------------------- | --------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------- |
| D      | authoritative version-sensitive docs | `docs_researcher`                            | `artifacts/authoritative-docs.md` only             | none                              | primary links and exact request/config shapes        | parallel now                                                      |
| F      | Q1 schema foundation                 | `backend_developer`                          | config/schema/tests/package pin                    | none                              | RED/GREEN unit and package type-check                | first contract gate                                               |
| S      | Q2-Q5 search correctness             | `backend_developer` + `correctness_reviewer` | Qdrant runtime, Stage 5/6 callers, Qdrant tests/CI | F                                 | focused unit and pinned integration                  | parallel with I after F; sequential internally due shared modules |
| I      | Q6 runtime/security                  | `deploy_specialist`                          | Compose, deploy scripts, env examples              | F                                 | Compose config, shell syntax, secret/exposure review | parallel with S                                                   |
| L      | Q7-Q8 data/recovery                  | `db_migration_specialist`/worker + reviewer  | Stage 2 contract, Qdrant tools, systemd, tests     | Q2/Q3 and Q6 for Q8               | plan, shared types, snapshot/restore                 | sequential internally due shared tools/package files              |
| O      | Q9 observability                     | `deploy_specialist`                          | monitoring config, Compose, ops runbook            | Q6                                | promtool, Compose, alert/dashboard audit             | parallel with Q7                                                  |
| C      | Q10 docs retirement                  | bounded worker then `docs_reviewer`          | named docs and project index                       | Q1-Q9                             | Cloud/custom-BM25 scans                              | sequential after implementation truth                             |
| A      | Q11 acceptance/closeout              | root + reviewers                             | evidence and in-scope corrections                  | Q1-Q10                            | full local gates and canonical closeout              | sequential shared gate                                            |
| X      | Q12 staging                          | root + deploy review                         | live evidence/state only                           | Q11 + explicit user authorization | live cutover gates                                   | blocked pending authorization                                     |

## Routing Evidence

- Selected installed skills: `orchestrator-stage`, `task-router`, `senior-architect`, `senior-devops`, `subagent-driven-development`, `test-driven-development`, `test-pass`, `verification-before-completion`, `orchestration-closeout`, and `prompt-authoring`.
- Selected installed agents: `docs_researcher`, `backend_developer`/worker, `deploy_specialist`, `db_migration_specialist`, `correctness_reviewer`, and `docs_reviewer`.
- Catalog candidates: none — installed assets cover the stage.
- Graphify used: `graphify-out/GRAPH_REPORT.md` and focused query `Qdrant course embeddings upload search Stage 2 Stage 5 Stage 6` with budget 2000.
- Authoritative docs: Qdrant, Prometheus, Grafana, and systemd first-party sources; consulted versions will be recorded in `artifacts/authoritative-docs.md`.

## Baseline Evidence

- `pnpm install --frozen-lockfile`: passed.
- Qdrant unit baseline with CI placeholder env: 3 files passed, 6 tests passed.
- `pnpm --filter @megacampus/course-gen-platform type-check`: passed.
- Initial test attempt without CI placeholder env stopped in `tests/setup-unit.ts` before collection because `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` were absent; no code defect or test weakening was involved.

## Accepted Streams

- Q1 / `mc2-jz6y0.2`: accepted and integrated from commit `91ecd115` (`origin/codex/qdrant-q1-schema`). Independent review: spec compliant, task quality approved, no findings. Integrated rerun: focused Vitest 4/4 and package type-check passed. Dedicated local worktree/branch cleaned; remote evidence branch retained.
- Q2 / `mc2-jz6y0.3`: accepted and integrated from review-fix commit `7c3702d3` (`origin/codex/qdrant-q2-collection-manager`) as merge `fb919ea6`. Bootstrap/verify enforce exact Qdrant `1.18.2` compatibility, complete schema sets, safe alias ordering and explicit legacy deletion; lifecycle course cleanup resolves the stable alias without losing the isolated `course_id` filter. Independent re-review passed with no findings. Integrated combined Q2-Q4 rerun passed 75 tests, package type-check, both CLI help gates and zero-legacy scans.
- Q3 / `mc2-jz6y0.4`: accepted and integrated from commit `bc0ceacf` (`origin/codex/qdrant-q3-native-ingestion`) as merge `b3954e83`. Native Qdrant BM25 documents, complete compacted priority payloads and fail-before-upsert weight validation are in place; process-local BM25 runtime state is removed. Independent re-review approved with no findings. Fresh branch and integrated reruns both passed 21 focused tests, package type-check, strict typed ESLint with zero errors, and the zero-legacy-reference gate.
- Q4 / `mc2-jz6y0.5`: accepted and integrated from review-fix commit `4159c2f4` (`origin/codex/qdrant-q4-hybrid-formula`) as merge `7a5f40df`. Native BM25+dense prefetch, server-side RRF→Formula ranking, optional document grouping, exact cache identity and observable safe dense fallback are implemented; client-side RRF/priority score mutation is removed. Independent re-review passed with no findings. Integrated rerun passed 34 focused tests, package type-check and native-only static gates. Production grouping remains disabled until Q5's pinned RU/EN fixture passes.
- D / authoritative docs: accepted read-only research with 40 first-party references and exact Qdrant 1.18.2/client 1.18.0 shapes. Confirmed core architecture; recorded required corrections for Formula input normalization, S3 restore transport, alias recreation, external backup/fallback metrics, notification delivery, image health probing, and version freshness.

## Decision Gates From Authoritative Docs

- Formula has no clamp/min/max expression: Q3/Q4 must validate and normalize `document_weight` before storage and use Formula defaults only for missing values.
- Qdrant S3 snapshots exclude aliases and do not document raw `s3://` recovery: Q8 must prove an authenticated download/upload or supported recovery transport and re-verify the alias.
- Prometheus cannot ingest mounted textfiles directly; Q9 needs an explicit exporter path. Qdrant also lacks container-limit and application fallback signals.
- Prometheus rules do not deliver notifications; Q9 needs Grafana Alerting provisioning or Alertmanager.
- Exact Prometheus 3.11.3 and Grafana 12.4.0 tags exist, but are superseded; the security/version policy needs an explicit decision before Q6/Q9 implementation.
- Pinned Qdrant image has no curl/wget; Q6 health checks must be proven with an available probe rather than copied blindly.

## Active Runtime Corrections

- `mc2-jz6y0.15`: Q5 pinned Qdrant `1.18.2` passed 8/9 and proved strict Formula access requires a numeric `document_weight` payload index. Reviewed fix `d9e01ac0` adds the canonical `float` index and is integrated as `449e7ab1`; 45 affected tests and package type-check pass. Acceptance/cleanup remain pending until Q5 reruns the unchanged fixture and proves 9/9.

## Closeout Expectations

- `docs-reviewed: updated` — retrieval, deployment, recovery, monitoring, and operator behavior change.
- `project-index: update required` — stable Qdrant/operations entrypoints change.
- `graph-reviewed: updated` — run `graphify update .` and `graphify cluster-only . --no-viz` after durable changes.
- Q12 remains open/blocked unless explicit staging authorization is granted and live evidence passes.

## Explicit Defers

- Q12 staging cutover, remote reindex, secret activation, deploy, and live smoke: blocked pending explicit current-task authorization.
- Capacity-triggered non-goals remain those listed in the approved design; they are not implementation debt.
