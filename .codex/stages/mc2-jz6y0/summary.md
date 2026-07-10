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

## Closeout Expectations

- `docs-reviewed: updated` — retrieval, deployment, recovery, monitoring, and operator behavior change.
- `project-index: update required` — stable Qdrant/operations entrypoints change.
- `graph-reviewed: updated` — run `graphify update .` and `graphify cluster-only . --no-viz` after durable changes.
- Q12 remains open/blocked unless explicit staging authorization is granted and live evidence passes.

## Explicit Defers

- Q12 staging cutover, remote reindex, secret activation, deploy, and live smoke: blocked pending explicit current-task authorization.
- Capacity-triggered non-goals remain those listed in the approved design; they are not implementation debt.
