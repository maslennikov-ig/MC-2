# Work order — the retrieval change verified on a lesson, and Jina priced

**Design:** `docs/superpowers/specs/2026-08-27-retrieval-verified-and-jina-priced-design.md`
**Epic:** `mc2-d0e2n` · children `mc2-d0e2n.1` … `.6`
**Start branch:** `develop`

`bd` is the source of truth, not this file. Run `bd show mc2-d0e2n` first; every child carries its
own facts, traps and file paths.

## What happened just before this

Retrieval was measured for the first time on 2026-08-26/27 (`mc2-xg6g8`, closed). Two production
paths changed:

- **Stage 5** was never hybrid for a section plan of three or fewer queries — `max_query_limit` is
  100 and applies to a prefetch limit, so it asked for 300 and got `Bad Request` served as a
  dense-only fallback. Clamped. Recall@5 0.7742 → 0.9677.
- **Stage 6** stopped capping results per document (`mc2-zewto`, owner-authorised, reversing
  `mc2-jz6y0.16` for lesson content only). Recall@5 0.7419 → 0.9677, candidates per query 6.25 →
  29.97, accepted results arriving outside the hybrid fusion 124 of 475 → 0.

Both numbers come from `pnpm benchmark:rag`, which scores whether the answering chunk reaches the top
five. **No lesson has been read.** That is what this work is for.

## Order of work

A is a chain. B is independent of A and can run alongside it. C is independent of both. D is last.

```
A1 reproduce both arms ──▶ A2 read both lessons ──┐
B1 price Jina ──▶ B2 record it at the call ───────┼──▶ D1 close out
C1 mc2-kim48 ────────────────────────────────────-┘
```

### Phase A — did it help the lesson?

**A1 · `mc2-d0e2n.1` — reproduce both arms.** One course, one lesson spec, one accepted evidence
set, generated twice on dev: once as `develop` stands, once with the per-document cap restored
locally in `buildLessonSearchOptions`. **The restored cap is a local edit and is never committed.**
Record per arm: queries issued, unique candidates accumulated, chunks sent to the reranker, chunks
handed to the model, distinct documents behind them. The numbers are already logged — `runQueryPass`
logs `totalUnique` per tier, `rerankChunks` logs `candidatesReranked`, and the `lesson_rerank` trace
row carries `candidatesCount` and `rerankedCount`. Do not add instrumentation before checking what is
already there.

**A2 · `mc2-d0e2n.2` — read both lessons.** By eye, both artifacts kept. State which is better and
why, or that they are indistinguishable, which is a result and must be reported as one. Do not ask
the judge to decide it.

### Phase B — the provider nobody bills

**B1 · `mc2-d0e2n.3` — establish the price and today's spend.** Jina appears in no cost table.
Find the real per-token prices for the embedding and reranker models in use, record them with their
source, and state what one lesson costs in Jina on each arm of A1.

**B2 · `mc2-d0e2n.4` — record it at the call.** Same discipline as every other provider: one paid
call, one priced row, attributable to a course. Both call sites already receive `usage.total_tokens`.
Guard it with a test shown red against the current unpriced behaviour. If something blocks it, defer
explicitly and name what.

### Phase C — the alerts that would have said so

**C1 · `mc2-d0e2n.5`** — `mc2-kim48`. Answer its three recorded questions first, then act. **Read the
whole reconciliation path in `document-evidence-textfile.ts` before asserting any mechanism**: the
previous pass stated two confident mechanisms about that module from partial reads and retracted
both.

### Phase D — close

**D1 · `mc2-d0e2n.6`** — `.codex/handoff.md` says what a lesson costs in Jina beside what it costs in
OpenRouter; `mc2-4clyr` learns that its 90% figure counts one provider; anything found and not fixed
is a bead with a reason.

## Authority

**Inside standing authorization (owner, 2026-08-22 — act and report, do not ask):** paid runs under
USD 5, commits, `git push` to `develop`, dev deploys on a green pipeline, branch and worktree
cleanup, edits to `llm_model_config` and `config-seed.json`.

**Needs a fresh owner decision, every time:** reindex, any production mutation, force-push, secrets
or access changes, any migration this plan does not name — and it names none.

**Explicitly out of scope:** `mc2-8m90f` (gated on a Stage 4 run that has not happened), the Helixa
branches in `mc2-gxese`, `mc2-x72bq`, `mc2-vlskb`, `mc2-hqfc3`.

**Retrieval constants are settled.** If a lesson shows a defect the benchmark cannot see, report it;
do not tune in the same pass.

## Verification

- code change: `pnpm type-check`, `pnpm build`
- once, risk-selected after implementation: `pnpm test`
- focused unit runs: `vitest.config.unit.ts` — the default backend Vitest command is **fail-closed**
  and needs Qdrant 1.18.2
- `eslint` on touched files
- re-measure retrieval only if a retrieval path changed: `pnpm benchmark:rag run`

Before claiming delivery: `scripts/orchestration/check_stranded_commits.py`.

## Traps

1. **`localhost:6333` is a different project's Qdrant.** Ours is the dev host, 6335, read-only over
   `ssh -N -L 16335:127.0.0.1:6335 megacampus-prod`. Port 6333 there is the dev instance, 12 points.
2. **A dev run publishes no Prometheus metrics** — the dev workers set no
   `QDRANT_METRICS_TEXTFILE_DIR`. Read traces and container logs.
3. **The Jina token tracker is in-process and read by nobody.** It resets with the process; it is not
   evidence across a run.
4. **The reranker receives the whole accumulated union**, not a slice — `rerankChunks(allChunks, …)`.
5. **`enoughCandidates` is 40 and the loop breaks after a query returns**, so the collector
   overshoots. The predicted volumes in the design are arithmetic; measure them.
6. **`lint-staged` rewrites files at commit time.** Re-run text-asserting tests after committing.
7. **A test that pins the broken shape lets the defect through.** Show every new test red first and
   say you did.
8. **Read the artifact, not the judge.**
9. **Do not run `pnpm install` to repair the root `node_modules`** — a sibling worktree's install has
   repointed all 13 symlinks before; relink by hand.
10. **The primary worktree can move under you.** Another session committed five times into it during
    the previous pass. Re-read `git log` before asserting anything about history.

## Definition of done

The acceptance list in the design document, all seven items. In one line: two lessons exist and were
read, the call volumes are measured rather than derived, a lesson's Jina cost is a number in the
handoff, and `mc2-kim48` has an answer.
