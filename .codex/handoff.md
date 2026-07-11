# Orchestrator Handoff

Updated: 2026-07-11
Stage: `mc2-jz6y0` — self-hosted Qdrant plus approved document-evidence expansion
Integration branch: `codex/self-hosted-qdrant-platform`
Remote base for continuation: resolve current SHA of `origin/codex/self-hosted-qdrant-platform`

## Product Truth

- Qdrant Cloud data was test-only and is lost. Do not recover or mutate it; rebuild the derived index from authoritative sources.
- Target remains private self-hosted Qdrant `1.18.2`, native multilingual BM25/IDF, server RRF/Formula priority, strict indexes, aliases, source reindex, S3 snapshots/restore, Prometheus/Grafana/alerts, and secure loopback Web UI.
- Documents are optional but important advisory evidence. A course without documents remains fully supported.
- Every uploaded document must receive a durable `assessed`, `degraded`, or `failed` coverage outcome; none may disappear through context truncation.
- Documents supplement the baseline structure. They may add facts, terminology, constraints, examples, and source-backed topics but cannot silently replace baseline curriculum requirements.
- Material document conflicts use a distinct required-question block. Manual mode pauses at the existing Phase 0.5 boundary. Automatic mode selects the recommendation and appends `resolved_by: system` / `answer_source: system` with rationale.
- Large corpora use deterministic bounded batches, hierarchical summaries, claim reduction, and targeted Qdrant verification.
- Stage 5 is two-pass: baseline first, bounded advisory enrichment second. Stage 6 consumes the same accepted decisions and evidence refs.

## Read First

- `AGENTS.md`
- `.codex/orchestrator.toml`
- `.codex/handoff.md`
- `.codex/project-index.md`
- `graphify-out/GRAPH_REPORT.md`
- `docs/superpowers/specs/2026-07-10-self-hosted-qdrant-platform-design.md`
- `docs/superpowers/plans/2026-07-10-self-hosted-qdrant-platform.md`
- `docs/superpowers/specs/2026-07-11-advisory-document-evidence-rag-design.md`
- `docs/superpowers/plans/2026-07-11-advisory-document-evidence-rag.md`
- `docs/superpowers/prompts/2026-07-11-self-hosted-qdrant-evidence-continuation-orchestrator.md`

## Accepted and Open Work

- Accepted and pushed: Q1-Q7, strict Formula index fix `.15`, and evidence E1-E6. E6 `.23` is independently approved and integrated linearly through rebased reviewed equivalent `5201a786`; its tree `fda761f0` is byte-identical to reviewed merge `1e681027`. Integration history and exact evidence are in `.codex/stages/mc2-jz6y0/summary.md`.
- Q7 `.8` is reviewed, integrated as `841812be`, verified at focused 85/85 plus pinned Qdrant `1.18.2` 19/19, and its dedicated local worktree/branch are cleaned. The remote evidence branch remains.
- Q6 `.7`, Q8 `.9`, Q9 `.10`, Q10 `.11`, Q11 `.12` remain open. Q12 `.13` is the explicit remote-authorization gate.
- Decision `.14` remains open, but its read-only docs/runtime preflights are accepted as `b7c38638` and `99e08364`. Recommended atomic choice: Qdrant `1.18.2`, Prometheus `3.13.1` LTS, Grafana `12.4.5`, node_exporter `1.12.0`, Alertmanager `0.33.1`, all tag+index-digest pinned; authenticated main-listener scrape using `api-key` from a mounted file; no Qdrant `metrics_port`; fail-closed Qdrant secret wrapper; textfile-only unprivileged exporter; single-node Alertmanager. Owner approval is still required before Q6/Q9 edits.
- Design `.17` is approved/closed. Grouping `.16` is closed as superseded by live-path tasks E5/E6.
- E1 `.18` is reviewed, integrated as `528fdfc2`, verified at shared 11/11, repository 11/11 and applied PostgreSQL 15.18 9/9, and its disposable DB/container plus dedicated local worktree/branch are cleaned.
- E2 `.19` is reviewed and integrated through `14277d8a`: focused Stage 4 117/117, shared 11/11, applied PostgreSQL 15.18 9/9, both type-checks and process verification pass. Exact full-ledger resume, per-card/cross-card hierarchy, claim-scoped verification and exact cl100k safety bounds are accepted. Its disposable DB/container and dedicated local worktree/branch are cleaned.
- E3 `.20` is reviewed and integrated through `89a7948e`: focused 136/136, shared 13/13, PostgreSQL 15.18 static/applied 36/36, both type-checks and process verification pass. Material conflicts, degraded/capacity decisions, manual/system atomicity, full snapshots, approval guards and plural retry recovery are accepted. Its disposable containers/symlinks and dedicated local worktree/branch are cleaned.
- E5 `.22` is reviewed and integrated through `cf438826`: focused 52/52, shared 20/20, full Stage5/Qdrant 532/532, workspace type-check/build and process verification pass. Baseline-first live enrichment, exact chunk grounding, fallback audit and CAS persistence are accepted. Its worktree/local branch are cleaned.
- E4 `.21` is reviewed and integrated through rebased equivalent `2538bb5c`: web 20/20, shared 2/2, real-panel Chromium/mobile/dark E2E 4 pass/2 expected skips, type-check/build/process pass. Distinct conflict UI, CAS edit semantics, localized system audit, fail-closed metadata and accessibility are accepted. Its worktree/local branch are cleaned.
- E6 `.23` is reviewed and integrated linearly through `5201a786` from final recovery commit `a6c39e7a`; the rebased tree is byte-identical to reviewed merge `1e681027`. Fresh integration evidence: shared 21/21, joined E5/E6 111/111, Stage4 267/267, migrations 14/14, PostgreSQL 15.18 E3 26/26 and side identity 8/8; independent merged-tree review additionally passed E4 20/20, E5 35/35, Qdrant 14/14, E6 76/76, Stage4 evidence 49/49 and type-check. Its disposable containers and dedicated worktree/local branch are cleaned. E7 `.24` remains blocked by Q8/Q9.

## Completed Recovery Gate

Q7 recovery is complete. Both pinned integration retrievals use `generatePointId(document_id, chunk_id)`; independent review passed; the integration rerun passed 19/19 and the dedicated worktree/local branch were safely cleaned after push.

## Next recommended

Next stage id: `mc2-jz6y0`

Recommended action: record owner decision `.14`, then execute Q6, Q8 and Q9 in dependency order; E7 joins accepted E4-E6 with Q8/Q9 before Q10/Q11.

## Starter prompt for next orchestrator

Use $orchestrator-stage.

Use `docs/superpowers/prompts/2026-07-11-self-hosted-qdrant-evidence-continuation-orchestrator.md` from the resolved SHA of `origin/codex/self-hosted-qdrant-platform`.

## Parallel Execution After Q7

- E1-E6 and Q7 are accepted and integrated.
- Q8/Q9 may proceed when their parent-plan dependencies and decision `.14` permit.
- E7 is the shared evidence/observability/docs gate and blocks Q10/Q11 close.

Use visible subagents, `.codex/subagent-spawn-template.md`, strict write zones, selected installed skills/personas, artifacts, exact verification, and independent review. Do not accept reports without inspecting diffs and evidence.

## Required Skills and Review

- Orchestration: `orchestrator-stage`, `task-router`, `subagent-driven-development`.
- Behavior changes: `brainstorming` where decisions remain, `test-driven-development`, `verification-before-completion`.
- Risk/closeout: `senior-architect`, `senior-devops`, `test-pass`, `orchestration-closeout`.
- E4 UI: mandatory Lazyweb quick search/report with synthetic content, then frontend/browser verification.
- Specialists: `docs_researcher`, search/data worker, `deploy_specialist`, `correctness_reviewer`, and `docs_reviewer`.

## Verification and Delivery

- Do not weaken RU/EN relevance, strict-mode, restore, resume, coverage, or tenant-isolation tests.
- Required final gates: focused Stage 2/4/5/6 tests, shared contracts/migrations, pinned Qdrant integration, snapshot/restore, Compose validation, `pnpm type-check`, `pnpm build`, process verification, and canonical stage closeout.
- Update durable docs, project index, Graphify (`graphify update .`; `graphify cluster-only . --no-viz`), Beads, artifacts, stage summary, and this handoff.
- All accepted branches/commits must be pushed under the repo contract.
- Primary worktree may contain unrelated `.claude/settings.json`; do not alter or include it.

## Explicit defers

- Q12 deploy, staging/live reindex, secret changes, runtime activation, and any remote mutation require explicit current-task permission after presenting exact actions, effects, rollback, and live evidence plan.
- Stop if snapshot/alert secrets are required and unavailable, source gaps would change product truth, ownership conflicts cannot be isolated, or a required gate repeatedly fails after in-scope diagnosis.
- Capacity-triggered HA, quantization, on-disk hot indexes, custom sharding, and JWT RBAC remain out of scope.

docs-reviewed: updated — approved evidence design and companion execution plan now define durable Stage 4/5/6 behavior and operator acceptance.
graph-reviewed: updated — after E6 integration, local-only `graphify update .` plus `graphify cluster-only . --no-viz` rebuilt the final code graph (50,053 nodes, 74,224 edges), with zero external model/API tokens and no Git hooks; unstable community repartition totals are intentionally omitted.
