# Stage mc2-jz6y0 — Self-Hosted Qdrant Platform

Status: active
Classification: complex, multi-stream, security/data/operations sensitive
Base branch: `origin/codex/self-hosted-qdrant-platform`
Base commit: `cd6f0984c25709d967fd866cbf7ec2e0901fee9a`
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
- E1 `mc2-jz6y0.18` — evidence contracts, persistence and RLS
- E2 `mc2-jz6y0.19` — large-corpus preflight and allocator
- E3 `mc2-jz6y0.20` — conflicts and manual/automatic decisions
- E4 `mc2-jz6y0.21` — separate conflict UI block
- E5 `mc2-jz6y0.22` — live Stage 5 advisory enrichment/grouping
- E6 `mc2-jz6y0.23` — decision-aware Stage 6 retrieval/grouping
- E7 `mc2-jz6y0.24` — evidence acceptance, observability and rollout

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

## Approved Evidence Expansion (2026-07-11)

Owner-approved design: `docs/superpowers/specs/2026-07-11-advisory-document-evidence-rag-design.md`.

Executable companion plan: `docs/superpowers/plans/2026-07-11-advisory-document-evidence-rag.md`.

Validated continuation prompt: `docs/superpowers/prompts/2026-07-11-self-hosted-qdrant-evidence-continuation-orchestrator.md`.

| Stream | Goal                                                  | Agent                                      | Write zone                                        | Dependencies           | Verification                                            | Decision                       |
| ------ | ----------------------------------------------------- | ------------------------------------------ | ------------------------------------------------- | ---------------------- | ------------------------------------------------------- | ------------------------------ |
| E1     | canonical contracts and tenant-isolated audit storage | data/backend worker + correctness reviewer | shared types, evidence migration/repository/tests | accepted Q1-Q5         | schema, migration, RLS, append-only tests               | start in parallel with Q6/Q7   |
| E2     | complete large-corpus evidence preflight              | search/data worker + correctness reviewer  | Stage 4 allocator/evidence modules/tests          | E1 + accepted Q7       | zero/small/oversized/1,000-doc, resume, budget tests    | sequential after data contract |
| E3     | conflict detection and auditable decisions            | high-reasoning backend worker + reviewer   | Stage 4 Phase 0.5, router/RPC, tests              | E1 + E2                | RU/EN, pause, system-answer, idempotency tests          | contract gate for consumers    |
| E4     | distinct required conflict block                      | frontend worker + UI review                | clarifying UI/messages/tests                      | E3                     | Lazyweb, component, accessibility, Playwright           | parallel with E5/E6            |
| E5     | non-destructive live Stage 5 enrichment               | search/data worker + reviewer              | Stage 5 evidence/live caller/tests                | E1 + E3 + Q5 + Q7      | baseline equivalence, grouping, outage tests            | parallel with E4/E6            |
| E6     | decision-aware live Stage 6 retrieval                 | search/data worker + reviewer              | Stage 6 retriever/cache/tests                     | E1 + E3 + Q5 + Q7      | decision, grouping, required-RAG, isolation tests       | parallel with E4/E5            |
| E7     | cross-stage acceptance and rollout                    | root + docs/correctness reviewers          | metrics/docs/artifacts/in-scope fixes             | E4 + E5 + E6 + Q8 + Q9 | pinned integration, type-check, build, process/closeout | blocks Q10/Q11 close           |

`mc2-jz6y0.16` is closed as superseded: acceptance requires grouping in genuinely production-reachable Stage 5 and Stage 6 callers, not an arbitrary count of dormant helpers.

## Current Recovery Point

- Integration branch contains reviewed E2 through `14277d8a` and reviewed E3 through `89a7948e`; E3 acceptance bookkeeping is ready for push.
- Q7 / `mc2-jz6y0.8` is accepted: both integration lookups use document-scoped point IDs, the pinned Qdrant `1.18.2` gate passes 19/19, focused Q7 tests pass 85/85, and the dedicated worktree/local branch are cleaned. The remote evidence branch remains.
- E1 / `mc2-jz6y0.18` is accepted: immutable source manifests survive deletion-before-persist, guarded RPCs replace authenticated table writes, terminal coverage and user-only override direction are enforced, PostgreSQL 15.18 applied tests pass 9/9, and the dedicated worktree/local branch/container are cleaned. The remote evidence branch remains.
- E2 / `mc2-jz6y0.19` is accepted: complete authoritative source enumeration, exact durable outcomes, structured per-document and cross-document hierarchy, atomic resume, claim-scoped verification, and exact `tiktoken 1.0.22` safety bounds are integrated. The final independent reviewer reported no findings (`Spec PASS`, `Quality APPROVED`).
- E3 / `mc2-jz6y0.20` is accepted: persisted-card conflict detection, bounded RU/EN classification and Qdrant verification, explicit degraded/capacity questions, atomic manual/system decisions, full snapshots, guarded approval and recoverable multi-document retry lineage are integrated. Final independent review reported no findings (`Spec PASS`, `Quality APPROVED`).
- E4 / `.21`, E5 / `.22`, and E6 / `.23` are now dependency-ready and may run in parallel isolated worktrees.
- E5 / `mc2-jz6y0.22` is accepted and integrated through `cf438826`; E4 and E6 remain in independent review/remediation.
- Q6/Q9 remain gated by decision `mc2-jz6y0.14` on observability pins and metric transport/notification path.

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
- Q5 / `mc2-jz6y0.6`: accepted and integrated from review-fix commit `3c36a6a1` (`origin/codex/qdrant-q5-pinned-integration`) by the required pull-rebase integration. The blocking CI gate pins Qdrant `1.18.2` and proves native multilingual BM25, dense+sparse RRF, strict Formula weighting, document grouping, tenant/course isolation, snapshots and cleanup. Independent re-review passed with no findings. Root acceptance rerun passed 17 workflow/config tests, 19 pinned integration tests, package type-check and build; pre/post collection state was empty and the verification container was removed.
- Q7 / `mc2-jz6y0.8`: accepted and integrated from reviewed recovery commit `49e5e8d7` as merge `841812be`. Source-driven reindex plan/execute/verify is deterministic, resumable and document-scoped; the recovery reviewer found no issues (`PASS`/`APPROVED`). Fresh post-commit evidence: seven focused files 85/85 and pinned Qdrant `1.18.2` integration 19/19. Integration and recovery containers were removed; the dedicated worktree/local branch were cleaned.
- E1 / `mc2-jz6y0.18`: accepted and integrated from final reviewed commit `fc0d5620` as merge `528fdfc2`. Canonical contracts, compact analysis snapshot, immutable source manifest, guarded tenant RPCs, exact terminal coverage, durable deletion-safe items, immutable conflicts and user-only decision overrides are implemented. Two review cycles closed all findings; final reviewer returned no findings (`Spec PASS`, `Quality APPROVED`). Integrated evidence: shared 11/11, repository 11/11, applied PostgreSQL 15.18 9/9, both package type-checks and process verification passed. Disposable database/container and the dedicated worktree/local branch were cleaned.
- E2 / `mc2-jz6y0.19`: accepted and integrated linearly through final reviewed commit `14277d8a`. Stage 4 now records exactly one durable outcome for every authoritative course source, uses deterministic structured map/reduce and claim-scoped tenant/course/document Qdrant verification, resumes atomic full-ledger checkpoints without replay, and produces one bounded synthetic advisory digest for overflow-only Phase 2/3/4 callers. Per-card material hierarchy is lossless; exact request safety uses `tiktoken 1.0.22` / `cl100k_base` plus the documented 16-token envelope with EN/RU independent boundary tests. Repeated independent review closed all findings; final verdict was no findings (`Spec PASS`, `Quality APPROVED`). Integrated evidence: focused 117/117, shared 11/11, applied PostgreSQL 15.18 9/9, both type-checks, artifact validation and process verification passed. Disposable databases/containers and the dedicated worktree/local branch were cleaned; the pushed remote evidence branch remains.
- E3 / `mc2-jz6y0.20`: accepted and integrated through final reviewed commit `89a7948e`. The detector reads accepted persisted cards, uses exact token-aware bounded mapping, equivalence-preserving value reduction, a hard actual-attempt ceiling, durable capacity outcomes and capped per-side Qdrant verification. Phase 0.5 materializes the exact DB-derived conflict/degraded/capacity subject set; manual and system answers, user supersedes, snapshots, approval guards and plural retry applications are atomic, tenant-scoped and append-only. The final review closed five scale/recovery findings and returned no findings (`Spec PASS`, `Quality APPROVED`). Integrated evidence: focused 136/136, shared 13/13, PostgreSQL 15.18 static/applied 36/36, both type-checks, artifact validation and process verification passed. Exact 1,000-subject gates, 51/1,000 retry recovery, >16 MiB rejection/no partial write, clean rollback/reapply and lossy rollback refusal are covered. Disposable containers/symlinks and the dedicated worktree/local branch were cleaned; the remote evidence branch remains.
- E5 / `mc2-jz6y0.22`: accepted and integrated through final reviewed commit `cf438826`. The live Stage 5 handler constructs the production evidence service after the immutable baseline and structural gate; grouped hybrid Qdrant queries are tenant/course scoped and capped. Accepted decisions filter conflict sides and degraded documents, returned claims require exact document/chunk/version grounding, fallback use is durably degraded, and non-destructive merge/revalidation preserves the baseline. Generation metadata records a bounded canonical audit; JSONB CAS prevents stale decision snapshots from partially overwriting structure/metadata. Two review rounds closed privacy, side identity, chunk relevance, fallback observability, handler reachability, CAS and doc-only-ref findings; final review returned no findings (`Spec PASS`, `Quality APPROVED`). Evidence: focused 52/52, shared 20/20, full Stage5/Qdrant 532/532, workspace type-check/build and process verification passed. Worktree/local branch cleaned; remote evidence branch remains.
- D / authoritative docs: accepted read-only research with 40 first-party references and exact Qdrant 1.18.2/client 1.18.0 shapes. Confirmed core architecture; recorded required corrections for Formula input normalization, S3 restore transport, alias recreation, external backup/fallback metrics, notification delivery, image health probing, and version freshness.

## Decision Gates From Authoritative Docs

- Formula has no clamp/min/max expression: Q3/Q4 must validate and normalize `document_weight` before storage and use Formula defaults only for missing values.
- Qdrant S3 snapshots exclude aliases and do not document raw `s3://` recovery: Q8 must prove an authenticated download/upload or supported recovery transport and re-verify the alias.
- Prometheus cannot ingest mounted textfiles directly; Q9 needs an explicit exporter path. Qdrant also lacks container-limit and application fallback signals.
- Prometheus rules do not deliver notifications; Q9 needs Grafana Alerting provisioning or Alertmanager.
- Exact Prometheus 3.11.3 and Grafana 12.4.0 tags exist, but are superseded; the security/version policy needs an explicit decision before Q6/Q9 implementation.
- Pinned Qdrant image has no curl/wget; Q6 health checks must be proven with an available probe rather than copied blindly.

## Accepted Runtime Corrections

- `mc2-jz6y0.15`: Q5 pinned Qdrant `1.18.2` proved strict Formula access requires a numeric `document_weight` payload index. Reviewed fix `d9e01ac0` adds the canonical `float` index and is integrated as `449e7ab1`; 45 affected tests, package type-check, three consecutive 9/9 Formula fixture runs and the root 19/19 pinned gate pass.

## Closeout Expectations

- `docs-reviewed: updated` — retrieval, deployment, recovery, monitoring, and operator behavior change.
- `project-index: update required` — stable Qdrant/operations entrypoints change.
- `graph-reviewed: updated` — run `graphify update .` and `graphify cluster-only . --no-viz` after durable changes.
- Q12 remains open/blocked unless explicit staging authorization is granted and live evidence passes.

## Explicit Defers

- Q12 staging cutover, remote reindex, secret activation, deploy, and live smoke: blocked pending explicit current-task authorization.
- Capacity-triggered non-goals remain those listed in the approved design; they are not implementation debt.
