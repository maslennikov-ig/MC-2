# Work order — RAG retrieval quality, measured, and the live Qdrant re-checked

**Design:** `docs/superpowers/specs/2026-08-26-rag-quality-and-qdrant-operations-design.md`
**Epic:** `mc2-xg6g8` · children `mc2-xg6g8.1` … `.9`
**Closes out:** `mc2-jz6y0`
**Start branch:** `develop` (clean, level with `origin/develop` as of `0c2d940bd`)

`bd` is the source of truth, not this file. Run `bd show mc2-xg6g8` first; every child carries its
own facts, traps and file paths in its description.

## Order of work

Phase A is a chain — each step needs the previous one. Phase B is four independent read-only checks
and can run in any order, including alongside A. C is last by construction.

```
A1 evaluation set ──▶ A2 harness ──▶ A3 measure ──▶ A4 tune
                                        │
B1 collection  B2 snapshots  B3 alerts  B4 reindex ──┴──▶ C1 close
```

`bd ready` already reflects this: A1 and all four B tasks are unblocked today.

### Phase A — make retrieval quality a number

**A1 · `mc2-xg6g8.1` — evaluation set.** Two sources: real query wording lifted from
`generation_trace` (`phase = 'rag_retrieval'`), and known-answer pairs sampled from the indexed
corpus itself. Check the set into the repository together with cached query embeddings. Do not spend
a Jina call twice on the same string.

**A2 · `mc2-xg6g8.2` — harness.** Drive the three real entry points; do not reimplement the query.
Suggested home: `packages/course-gen-platform/scripts/` beside the existing benchmark scripts
(`docling-quality-benchmark.ts` is the closest precedent for shape and CLI style). Give it a
documented invocation and wire a `package.json` script for it.

**A3 · `mc2-xg6g8.3` — measure.** Recall@k and MRR; the threshold curve at 0.15/0.20/0.25/0.30/0.35;
branch attribution per accepted result; expansion's token cost against its effect. Write the results
into a document under `docs/` and put the headline numbers in the bead.

**A4 · `mc2-xg6g8.4` — tune.** Only what A3 moves. Basis in the comment beside every changed
constant; constants left alone are recorded as measured-and-unchanged. Each new test shown red
against the old behaviour, and say so.

### Phase B — re-check the live platform, read-only

**B1 · `mc2-xg6g8.5`** alias, schema, payload indexes, strict mode, point count against 6856.
**B2 · `mc2-xg6g8.6`** off-host snapshot freshness, the 7-day retention actually in force, restore
drill on an isolated copy.
**B3 · `mc2-xg6g8.7`** all 19 rules in `ops/qdrant/prometheus/alerts.yml`: metric source named,
verdict reachable or not.
**B4 · `mc2-xg6g8.8`** the reindex procedure proven executable today by dry run or on dev.

### Phase C — close

**C1 · `mc2-xg6g8.9`** close `mc2-jz6y0`; replace "quality unmeasured" in `.codex/handoff.md` with
the number; record `mc2-8m90f` as the one thing still owed and still gated.

## Authority

**Inside standing authorization (owner, 2026-08-22 — act and report, do not ask):** paid runs under
USD 5, commits, `git push` to `develop`, dev deploys on a green pipeline, branch and worktree
cleanup, edits to `llm_model_config` and `config-seed.json`.

**Needs a fresh owner decision, every time:** reindex, any production mutation, force-push, secrets
or access changes, any migration this plan does not name — and this plan names none. **A migration
appearing in this work is a signal that the scope drifted, not a step to take.**

**Explicitly out of scope:** `mc2-8m90f` (gated), the Helixa branches `mc2-gxese` (parked by the
owner until the Helixa side is finished), `mc2-x72bq`, `mc2-vlskb`, `mc2-hqfc3`, `mc2-1nots`.

## Verification

Repo-canonical, from `.codex/orchestrator.toml`:

- code change: `pnpm type-check`, `pnpm build`
- stage level, once, risk-selected after implementation: `pnpm test`
- focused unit runs: `vitest.config.unit.ts` — the default backend Vitest command is **fail-closed**
  and needs Qdrant 1.18.2
- `eslint` on touched files

Before claiming delivery: `scripts/orchestration/check_stranded_commits.py`. `/push-dev` is the
delivery path and deletes the branch it delivered.

## Traps this repository has already sprung

1. **`localhost:6333` is Helixa's Qdrant**, container `helixa-qdrant-1`, collection
   `course_embeddings`. Ours is on the dev host. Reading the wrong one yields a confident wrong
   measurement.
2. **A test that pins the broken shape** let a blocker into production once already. Every test here
   must be shown failing against the pre-change behaviour, and the check stated out loud.
3. **`lint-staged` rewrites files at commit time** and re-stages them. Re-run text-asserting tests
   after committing, before pushing.
4. **A green CI run can skip the deploy.** Check the Deploy job's own conclusion and the running
   container, not the pipeline's overall colour.
5. **Supervision is not availability.** A unit can be `is-active` and the thing behind it dead for
   months. Judge a dependency by whether it answers.
6. **A falsy zero erases a measurement.** `|| null` once stored a real `$0` as "not measured". In a
   benchmark, a legitimate 0.0 score is data.
7. **Do not run `pnpm install` to repair the root `node_modules`.** A sibling worktree's install has
   repointed all 13 root symlinks before; relink by hand.

## Definition of done

The acceptance list in the design document, all eight items. In one line: the benchmark runs twice
and gives the same numbers, the constants that moved say why, all 19 alert rules have a verdict, and
`mc2-jz6y0` is closed with `mc2-8m90f` named as what remains.
