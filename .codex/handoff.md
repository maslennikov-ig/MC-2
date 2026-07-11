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

- Accepted/pushed: Q1-Q5 and strict Formula index fix `.15`. Integration history and exact evidence are in `.codex/stages/mc2-jz6y0/summary.md`.
- Q7 `.8` is nearly complete in `/home/me/code/mc2/.worktrees/qdrant-q7-reindex`, branch `codex/qdrant-q7-reindex`, HEAD `616e8b83`.
- Q6 `.7`, Q8 `.9`, Q9 `.10`, Q10 `.11`, Q11 `.12` remain open. Q12 `.13` is the explicit remote-authorization gate.
- Decision `.14` remains open: confirm supported observability pins and explicit exporter/notification transport before Q6/Q9.
- Design `.17` is approved/closed. Grouping `.16` is closed as superseded by live-path tasks E5/E6.
- Expansion E1-E7 are `.18` through `.24`; their exact dependency graph is in Beads and the stage summary.

## First Recovery Action

Q7 has one uncommitted compatibility patch in `tests/integration/ci-qdrant-smoke.test.ts`. The full pinned Q5 gate still fails 18/19 because `packages/course-gen-platform/tests/integration/qdrant.test.ts` uses the old numeric point ID.

1. Replace only `generateNumericId(source.chunk_id)` and its import with `generatePointId(source.document_id, source.chunk_id)`.
2. Rerun the pinned Qdrant `1.18.2` gate and require 19/19.
3. Update `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.8.md` with exact output.
4. Commit/push the Q7 branch, run independent correctness review, integrate into the integration branch, rerun the gate, clean the Q7 worktree, and close `.8`.

Do not discard or overwrite this dirty Q7 worktree.

## Next recommended

Next stage id: `mc2-jz6y0`

Recommended action: start the continuation orchestrator, recover and accept Q7 first, then execute the Beads dependency graph with E1 parallel to safe Q6 work.

## Starter prompt for next orchestrator

Use $orchestrator-stage.

Use `docs/superpowers/prompts/2026-07-11-self-hosted-qdrant-evidence-continuation-orchestrator.md` from the resolved SHA of `origin/codex/self-hosted-qdrant-platform`.

## Parallel Execution After Q7

- E1 can run alongside local Q6 decision resolution/runtime work.
- E2 waits for E1 and accepted Q7.
- E3 waits for E1/E2.
- After E3, launch E4, E5, and E6 in parallel isolated worktrees.
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
graph-reviewed: used — existing report and focused Qdrant Stage 2/5/6 query informed the design; refresh is due after implementation changes during stage closeout.
