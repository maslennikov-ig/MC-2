# Measure what retrieval actually finds, then close the Qdrant epic

Validated start prompt for a fresh Claude Code session (Opus 5). Checked with
`orch-prompts prompt-check --kind handoff --runtime claude --profile opus-5` — **pass**, one warning
on length (3139 chars against a 1500 target). What remains is the cause of the gap, the four traps
this repository has already sprung, the spend ceiling and the stop conditions; cutting further would
cut the reasons the prompt exists.

Companion documents: `docs/superpowers/plans/2026-08-26-rag-quality-and-qdrant-operations.md` (work
order and authority) and `docs/superpowers/specs/2026-08-26-rag-quality-and-qdrant-operations-design.md`
(problem, measurement design, acceptance). Epic: `mc2-xg6g8`; closes out `mc2-jz6y0`.

## Prompt

```text
Target: Claude Code CLI, repo /home/me/code/mc2, branch develop.
Audience: engineering agent starting cold, Opus 5.
Runtime: WSL + VS Code terminal; dev and prod both on `ssh megacampus-prod`.

Goal: make RAG retrieval quality a number this repository does not have, re-check the live Qdrant
platform read-only, then close `mc2-jz6y0`. Run `bd show mc2-xg6g8`; the epic and its nine children
carry the facts, file paths and traps, and bd is the source of truth, not this text. Read
`docs/superpowers/plans/2026-08-26-rag-quality-and-qdrant-operations.md` for the work order and the
design beside it for why, before touching anything.

Context: `mc2-jz6y0` delivered the platform — pinned self-hosted Qdrant, native BM25 sparse beside
Jina-v3 dense, server-side RRF, 19 Prometheus rules — and never delivered the second half of its own
title. The thresholds are inherited, not derived: 0.25 came from Stage 6 tuning itself, and the 0.7
it replaced was unreachable. Because the threshold gates the dense branch before fusion, "hybrid"
search was silently BM25-only for months and no test in the tree can see that failure. Parent
expansion adds 5.5x context with its quality unmeasured. The planned calibration cannot fire:
`mc2-wxun` put a shadow cohort on production, and on 2026-08-26 `generation_trace` holds zero
`tier1_shadow` rows, the newest `rag_retrieval` traces of any kind dating to 2026-06-25 — before the
August rebuild. So measure offline against the live corpus with an evaluation set checked into the
repo. Do not wait for production traffic.

Four traps this repo has already sprung. `localhost:6333` on this workstation is Helixa's Qdrant,
not ours — ours is on the dev host, and reading the wrong one gives a confident wrong measurement. A
test that pins the broken shape once let a blocker into production, so show every new test red
against the old behaviour and say you checked. `lint-staged` rewrites files at commit time; re-run
text-asserting tests after committing, before pushing. Never `pnpm install` to repair the root
`node_modules` — a sibling worktree's install has repointed all 13 symlinks before.

Authority: standing owner authorization covers paid runs under USD 5, commits, push to `develop` and
dev deploys on a green pipeline — act and report, do not ask. Reindex, any production mutation and
any migration need a fresh decision; this plan names no migration, so one appearing means the scope
drifted. Leave `mc2-8m90f` and the parked Helixa work in `mc2-gxese` alone.

Output: `pnpm type-check` and `pnpm build` for code changes, one risk-selected `pnpm test` after
implementation, `vitest.config.unit.ts` for focused runs because the default backend command is
fail-closed and needs Qdrant 1.18.2, `eslint` on touched files. Deliver through `/push-dev` after
`scripts/orchestration/check_stranded_commits.py`. Report the numbers, which constants moved, and
which were measured and deliberately left alone.

Stop and ask if the measurement would need a production mutation, the evaluation set cannot be built
under USD 5, or the numbers argue for an architecture change rather than a constant change.
```
