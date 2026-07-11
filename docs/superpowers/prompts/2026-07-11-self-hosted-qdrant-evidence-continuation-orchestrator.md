Target: Codex / gpt-5.6, root engineering orchestrator
Audience: Codex with `/home/me/code/mc2`

Goal:
Finish epic `mc2-jz6y0`: complete the remaining self-hosted Qdrant Q6-Q11 work and the approved document-evidence expansion E1-E7. Deliver secure pinned Qdrant `1.18.2`, correct native multilingual BM25/RRF/Formula retrieval, recoverable reindex/snapshots, observability, and optional-but-important document evidence with complete coverage, explicit conflicts, automatic audited decisions, advisory Stage 5 enrichment, and decision-aware Stage 6 retrieval. Never perform Q12 remote mutation without explicit current-task permission.

Start:

- Resolve the current SHA of `origin/codex/self-hosted-qdrant-platform`; create/use a dedicated integration worktree from it. Do not use the old plan branch.
- Read `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md`, `.codex/project-index.md`, `graphify-out/GRAPH_REPORT.md`, both Qdrant/evidence designs and both plans under `docs/superpowers/{specs,plans}/2026-07-{10,11}-*qdrant*.md` / `*document-evidence*.md`.
- Run `bd prime`, claim `mc2-jz6y0`, inspect dependencies, and publish the Parallel Decomposition Matrix before edits.
- Old Qdrant Cloud data was test-only and lost. Rebuild the derived index; do not recover or mutate Cloud.
- Preserve unrelated `.claude/settings.json` changes.

Immediate recovery gate:
Q7 `.8` is unfinished in `/home/me/code/mc2/.worktrees/qdrant-q7-reindex`, branch `codex/qdrant-q7-reindex`, HEAD `616e8b83`, ahead of remote. Preserve its uncommitted `ci-qdrant-smoke.test.ts` point-ID fix. In `tests/integration/qdrant.test.ts`, narrowly replace stale `generateNumericId(source.chunk_id)` with `generatePointId(source.document_id, source.chunk_id)`. Require pinned Qdrant 19/19, update artifact `.8`, commit/push, independent review, integrate/rerun/clean, then close Q7. Do not discard that worktree.

Product invariants:

- Courses without documents remain first-class and behavior-compatible.
- Every uploaded document gets exactly one durable `assessed|degraded|failed` outcome; no silent truncation.
- Documents supplement, never silently replace, baseline curriculum structure.
- Material conflicts are a distinct required question block. Manual mode stops at existing Phase 0.5. Automatic mode selects the recommendation atomically and appends `resolved_by: system`, `answer_source: system`, rationale and provenance.
- Large corpora use deterministic bounded batches, hierarchical summaries and targeted tenant/course-filtered Qdrant verification.
- Stage 5 is baseline-first then non-destructive advisory enrichment. Stage 6 consumes the same accepted decisions/evidence refs. Enable document grouping only in genuinely live Stage 5/6 callers.
- Never weaken RU/EN relevance, strict-mode, restore, resume, coverage, or isolation tests.

Execution:

1. Use `orchestrator-stage`, `task-router`, subagent-driven development, and TDD. Launch visible subagents for each independent stream on dedicated `codex/` branches/worktrees with strict write zones, artifacts, exact verification and independent review. Inspect diffs/evidence before acceptance.
2. Follow Beads dependencies. E1 `.18` may run beside local Q6 work. E2 `.19` waits for E1+Q7; E3 `.20` waits for E1+E2; then run E4 `.21`, E5 `.22`, E6 `.23` in parallel. E7 `.24` joins them with Q8/Q9 and blocks Q10/Q11 close.
3. Resolve decision `.14` before Q6/Q9: re-check first-party current docs and obtain the owner decision for supported Prometheus/Grafana/exporter/notification pins; do not silently retain superseded versions.
4. For E4 obey the repo Lazyweb two-step UI workflow using synthetic content, then component/accessibility/Playwright verification.
5. Use first-party Qdrant, Prometheus, Grafana and systemd docs for version-sensitive shapes; record consulted versions/URLs. Run focused Graphify query before broad reads; refresh locally at closeout without external model/API modes or Git hooks.
6. Use `test-pass`, `verification-before-completion`, `docs_reviewer`, then `orchestration-closeout`. Maintain `.codex/stages/mc2-jz6y0/` artifacts, Beads, summary, current handoff and stable docs. Commit/push every accepted stream and integration result.

Required final evidence:
Focused Stage 2/4/5/6, shared contract/migration, web conflict, recovery/isolation tests; pinned Qdrant integration; Compose validation; S3 snapshot/restore drill; `pnpm type-check`; `pnpm build`; `scripts/orchestration/run_process_verification.sh`; canonical stage closeout. Record exact versions, commands, totals, cleanup, docs-reviewed and graph-reviewed state.

Remote gate:
Before Q12, present exact staging actions, external effects, secret needs, observation, rollback and expected downtime/data effects, then ask for explicit current-task authorization. Deploy, live reindex, service/secret changes and all staging/prod mutation are outside pre-authorization. If not authorized, leave `.13` explicitly blocked/open with no partial activation.

Asset Routing:
Use installed `orchestrator-stage`, `task-router`, `senior-architect`, `senior-devops`, `test-pass`, `subagent-driven-development`, `test-driven-development`, `verification-before-completion`, `orchestration-closeout`; personas `docs_researcher`, search/data worker, `deploy_specialist`, `correctness_reviewer`, `docs_reviewer`. Child prompts follow `.codex/subagent-spawn-template.md`. Catalog candidates: none unless an assigned asset is unavailable.

Output:
In Russian:

Accepted outcomes and evidence; open blockers/defers; current branch/commits/push state; rollback state; exact remaining activation gate. Stop only for the authorized remote boundary, unavailable required secrets, product-truth source gaps, unisolatable ownership conflict, or a repeatedly failing required gate after in-scope diagnosis. Continue all safe local work first.

Stop:
Ask only at those boundaries; otherwise continue through local implementation, review, verification, docs, commit and push.
