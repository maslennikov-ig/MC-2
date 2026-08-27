# The retrieval change, verified on a lesson — and the provider nobody bills

**Status:** proposed, 2026-08-27
**Owner bead:** `mc2-d0e2n` · children `mc2-d0e2n.1` … `.6`
**Follows:** `mc2-xg6g8` (closed) and `mc2-jz6y0` (closed)

## Problem

On 2026-08-26/27 retrieval was measured for the first time and two things changed in production
paths. Stage 5 stopped silently degrading to dense-only, and Stage 6 stopped capping results per
document. Both are improvements by the number they were chosen on — recall@5 0.7742 → 0.9677 and
0.7419 → 0.9677 — and **neither has been seen in a lesson**.

That gap is the whole of this work. Three specific things are unknown:

### 1. Nobody has read a lesson written with the new retrieval

`docs/rag/2026-08-26-retrieval-quality-measurement.md` measures whether the chunk that answers a
question reaches the top five. It does not measure whether the lesson is better, and it cannot: the
evaluation set has no lessons in it. The repository's own rule for this, from the Career Playbook
track (`06-quality-acceptance.md`), is to read the artifact before calling a run accepted and not to
trust the judge — and the judge is the only thing that has ever looked at a Stage 6 lesson
automatically.

There is a specific reason to look rather than assume. Removing the per-document cap raises how much
of a lesson's context one document may supply. Measured over a whole lesson's query set the cap was
buying 0.11 documents, so the expected change is small — **but that was measured on the union of
retrieved chunks, before reranking**, and the reranker chooses the seven the model actually reads.
Nobody has looked at those seven.

### 2. The change moved two call volumes in opposite directions, and neither was measured

Stage 6 accumulates candidates across up to ten queries and stops once it holds `enoughCandidates`,
which is `min(TARGET_CHUNKS * candidateMultiplier * 1.5, MAX_CHUNKS * 4)` = **40**. The break happens
after a query returns, so the collector overshoots.

With the cap in force a query returned about 6.25 unique chunks, so the pass needed roughly seven
queries to reach 40. Without it a query returns about 30, so two queries pass the threshold. Then
`rankAndAssemble` calls `rerankChunks(allChunks, …)`, which sends **every accumulated chunk** to Jina.

So, per lesson, arithmetic predicts:

|                                          | before | after |
| ---------------------------------------- | ------ | ----- |
| Qdrant queries and Jina query embeddings | ~7     | ~2    |
| chunks sent to the Jina reranker         | ~40–46 | ~60   |

**This is derived, not measured.** It is the first thing to check, because if it is right the change
made one provider call cheaper and another dearer at the same time, and nothing in this repository
would report either.

### 3. Jina spend is not in the ledger at all

`mc2-4clyr` states that Stage 6 is about 90% of generation cost. That figure comes from
`generation_trace` token accounting, which records **OpenRouter calls only**. Jina is a paid provider
on two hot paths — a query embedding per retrieval query, and a reranker call per lesson — and:

- `reranker-client.ts` counts tokens into an in-process `TokenUsageTracker`;
- `getRerankerTokenStats()` is exported from `src/shared/jina/index.ts` and **read by nothing**;
- the tracker resets when the process does, so it cannot be evidence across a run;
- no Jina price appears in `MODEL_CATALOG`, `config-seed.json` or any cost table;
- `no-anonymous-spend` guards only `createOpenRouterModel*`, so a new Jina call site is not a call
  site the guard knows about.

Every rule this repository wrote about spend — price at the call, one paid call one priced row,
recorded cost is not the provider invoice — was written about OpenRouter. Jina has been outside all
of it, and the change just made its two call volumes move.

### 4. The alerts that would have told us are silent

`mc2-kim48`: all six `megacampus_document_evidence_*` metrics are absent, so four alert rules cannot
fire. The cause is a split — the writer is configured on staging, which is idle, and not on dev,
where runs happen. The obvious repair is a trap and is documented as one: the Stage 4 aggregate is a
single unlabelled ledger reconciled against durable database totals, and dev and staging share one
database, so whether a second writer is harmless was never established.

## Goals

1. One lesson generated on dev with the current retrieval and one with the cap restored, **read by
   eye**, with a stated verdict — including "indistinguishable", which is a result.
2. The two call volumes measured rather than derived, per lesson, both arms.
3. Jina spend attributable: a price, recorded at the call, on the same terms as every other provider,
   with a guard that fails a new unpriced Jina call site.
4. `mc2-kim48` answered — its three questions settled, then acted on or explicitly deferred with the
   answer written down.

## Non-goals

- **No new retrieval tuning.** The constants settled on 2026-08-27 stay settled unless a lesson shows
  a defect the benchmark cannot see. If one does, that is a finding to report, not a knob to turn in
  the same pass.
- **No production run and no production mutation.** Dev only.
- **No reranker or embedding model change.** This measures and prices what runs.
- **`mc2-8m90f` stays untouched** — its gate is a Stage 4 run on one of six named courses, and
  `.codex/handoff.md` forbids touching it before that.

## Approach

### Reproducing both arms

The cap lives in one place, `buildLessonSearchOptions` in
`src/stages/stage6-lesson-content/rag/search-options.ts`, and Stage 6's request shape is now built
only there. Restoring it for one run is a two-line local change, not a revert — and it must not be
committed. Prefer running both arms from the same course, the same lesson and the same accepted
evidence, so the only difference is the request shape.

`docs/rag/2026-08-26-retrieval-quality-measurement.md` names the courses with real indexed documents
and objectives; the concentration run used nine of them. A course whose lesson draws on more than one
document is the interesting case — `8baaa75e…` was the only one that reached five documents in the
context — because a single-document course cannot show the difference either way.

### Where the numbers already are

`rerankChunks` already logs `candidatesReranked` and `topChunksReturned` at info level, and
`rankAndAssemble` writes a `lesson_rerank` trace row carrying `candidatesCount`, `rerankedCount` and
`rerankerLatencyMs`. `runQueryPass` logs `totalUnique` per query and per tier. So the volumes can be
read from a dev run's logs and traces without new instrumentation. Adding instrumentation to find out
what already exists is the mistake to avoid here.

### Pricing Jina

Two call sites spend: `generateQueryEmbedding` (per retrieval query) and the reranker client (per
lesson). The existing cost machinery is built around OpenRouter's response shape, so the question to
settle first is whether Jina spend belongs in the same ledger table or beside it. The repository's
rule — one paid call, one priced row, attributable to a course — is what has to hold; the mechanism
is open. `jina-client.ts` and `reranker-client.ts` both already receive a `usage` object with
`total_tokens`, so the quantity is available at the call.

## Constraints and traps

- **`localhost:6333` on a workstation is a different project's Qdrant.** Ours is on the dev host,
  port 6335, read-only over an SSH tunnel. Port 6333 there is the dev instance with 12 points.
- **A dev run writes no Prometheus metrics.** The dev workers set no
  `QDRANT_METRICS_TEXTFILE_DIR`, so nothing from either arm reaches the textfile collector. Read the
  traces and the container logs.
- **The Jina token tracker resets per process** and nobody reads it. It is not evidence.
- **`lint-staged` rewrites files at commit time.** Re-run text-asserting tests after committing.
- **A test that pins the broken shape lets the defect through.** Any test added here must be shown
  failing against the pre-change behaviour, and the check stated.
- **For `mc2-kim48`, read the whole reconciliation path before asserting anything.** The previous
  pass stated two confident mechanisms about that subsystem from partial reads and had to retract
  both; the retraction is in the bead.
- **Read the artifact, not the judge.** A model that authors invents a statistic the judge scores
  0.88.

## Acceptance

1. Two lessons generated on dev from one course and one lesson spec, one per arm, both artifacts kept
   and both read; a stated verdict with the reason, "indistinguishable" allowed.
2. Measured per lesson and per arm: queries issued, unique candidates accumulated, chunks sent to the
   reranker, chunks handed to the model, and how many distinct documents those came from.
3. A Jina price recorded in the repository with its source, and the per-lesson Jina cost of both arms
   stated in money.
4. Jina spend recorded at its call sites and attributable to a course, guarded by a test shown red
   against the current unpriced behaviour — or an explicit, reasoned deferral naming what blocks it.
5. `mc2-kim48`'s three questions answered in the bead, and the fix delivered or deferred with the
   answer written down.
6. `pnpm type-check`, `pnpm build`, a risk-selected `pnpm test`, `eslint` on touched files.
7. `.codex/handoff.md` says what a lesson costs in Jina, beside what it costs in OpenRouter.
