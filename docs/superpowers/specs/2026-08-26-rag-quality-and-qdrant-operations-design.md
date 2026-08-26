# RAG retrieval quality, measured — and the live Qdrant re-checked

**Status:** proposed, 2026-08-26
**Owner bead:** `mc2-xg6g8` · children `mc2-xg6g8.1` … `.9`
**Closes out:** `mc2-jz6y0` — _Self-hosted Qdrant: production baseline and RAG hardening_

## Problem

`mc2-jz6y0` delivered 28 of 28 children and its cutover is live. What it delivered is the **platform**:
a version-pinned self-hosted Qdrant, native BM25 sparse vectors alongside Jina-v3 dense ones,
server-side RRF, a Formula Query that boosts by `document_weight`, payload indexes, aliases,
snapshots on and off host, 19 Prometheus rules and a restore drill.

What it never delivered is the second half of its own title. Nothing in this repository measures
whether retrieval **finds the right thing**. `.codex/handoff.md` states it plainly for the newest
piece — parent expansion runs at an average 5.5x and its "**quality** unmeasured" — but the gap is
wider than that one line:

- **The thresholds are inherited, not derived.** `DENSE_SCORE_THRESHOLD = 0.25` came from Stage 6
  tuning its own retriever; `0.15` is its widened retry. Both are better than the `0.7` they
  replaced — that one was _unreachable_, and because the threshold gates the dense branch **before**
  fusion, "hybrid" search was silently BM25-only until 2026-08-12. But "better than a value that
  returned nothing" is not the same as "right", and nobody has measured what 0.25 keeps and what it
  throws away.
- **Nobody has shown that hybrid is hybrid.** The failure mode that hid for months — one branch
  contributing nothing while the logs said "hybrid" — is invisible to every test in the tree. The
  only live signal is `megacampus_qdrant_hybrid_fallback_total`, which counts hard degradation to
  dense-only, not a sparse or dense branch that runs and contributes no accepted result.
- **Parent expansion is unvalidated in both directions.** It rebuilds a ~900-token passage from
  indexed siblings and adds, on average, 5.5x the text. Reconstruction fidelity was measured (57 of
  57 parents, word coverage 1.0000); its **effect on the answer** was not. Expansion that dilutes
  the matched fragment with four parts of unrelated sibling text is a regression that no current
  signal would report.
- **The calibration path that was planned cannot fire.** `mc2-wxun` shipped a shadow cohort at
  `RAG_SHADOW_RETRIEVAL_RATE=0.05` in production specifically to collect Tier 1 exit scores, and
  `mc2-vjbb` waits on that data. Measured 2026-08-26: `generation_trace` holds **zero**
  `tier1_shadow` rows. The newest `rag_retrieval` traces of any kind are from **2026-06-25** —
  before the August retrieval rebuild — so they describe a system that no longer exists. Waiting for
  production to produce calibration data has cost two months and produced none.

The operational half needs a different treatment. It was built and accepted piece by piece, but
several of its guarantees are the kind this repository has already been burned by: a green check
that is not asking the question it appears to ask. `.codex/repository-failure-modes.md` records a
NotebookLM tunnel that was dead for four months behind `Up (healthy)`, a systemd unit reporting
`is-active` for a dead service, a backup alert that was really a full disk, and a monitoring rule
that can be permanently `absent()` and therefore permanently silent. Nineteen Qdrant rules deserve
one pass that asks, of each, _what would make this fire, and can it_.

## Goals

1. A **repeatable offline measurement** of retrieval quality against the live corpus, checked into
   the repository, that any future change can be re-run against.
2. Three numbers this repository does not have today: what the dense threshold costs in recall, what
   each branch of the hybrid actually contributes, and whether parent expansion improves or dilutes
   the passage handed to the model.
3. Retrieval constants **changed only where the measurement shows a difference**, each with its
   measured basis recorded beside it, in the style `retrieval-thresholds.ts` already uses.
4. Every one of the 19 Qdrant/evidence alert rules confirmed to have a live metric source and a
   reachable firing condition — or reported as unreachable.
5. `mc2-jz6y0` closed with an honest record of what remains.

## Non-goals

- **No production mutation.** No reindex, no collection change, no alias switch, no key rotation, no
  restore onto live data. Where a check needs one of these, the deliverable is the proposal and the
  evidence, not the act.
- **No new retrieval architecture.** Not a reranker swap, not a chunking change, not a different
  embedding model. This work measures what exists and tunes its numbers.
- **No waiting on production traffic.** The shadow cohort stays as it is; this work must not depend
  on it producing rows.
- **`mc2-8m90f` stays untouched** — its reopen gate is a Stage 4 run on one of six named courses, and
  `.codex/handoff.md` forbids touching it before that.

## The measurement, concretely

### Where the code lives

| Concern                                            | File                                                          |
| -------------------------------------------------- | ------------------------------------------------------------- |
| Thresholds and the measurement behind them         | `src/shared/qdrant/retrieval-thresholds.ts`                   |
| Hybrid prefetch, RRF, priority formula, grouping   | `src/shared/qdrant/search-operations.ts`                      |
| Search entry point, fallback accounting            | `src/shared/qdrant/search.ts`                                 |
| Passage rebuild from siblings                      | `src/shared/qdrant/context-expansion.ts`                      |
| Stage 5 section retrieval                          | `src/stages/stage5-generation/utils/section-rag-retriever.ts` |
| Stage 6 lesson retrieval, Tier 1/Tier 2 gate       | `src/stages/stage6-lesson-content/rag/retriever.ts`           |
| Stage 6 assembly and expansion call                | `src/stages/stage6-lesson-content/rag/retrieval-assembly.ts`  |
| Stage 6 constants (`TARGET_CHUNKS` 7, reranker 4x) | `src/stages/stage6-lesson-content/rag/constants.ts`           |
| BM25 parameters (`k` 1.2, `b` 0.75, `avg_len` 256) | `src/shared/qdrant/config.ts`                                 |

### The evaluation set

No hand labelling, and no dependency on production traffic. Two sources, combined:

1. **Real query wording** from `generation_trace` (`phase = 'rag_retrieval'`, 1132 `lesson_rerank`
   and 722 `tier1_pass` rows). These are stale as _results_ — they predate the rebuild — but they
   are genuine formulations of what Stage 5 and Stage 6 ask for, which is what a synthetic set
   otherwise gets wrong.
2. **Known-answer pairs** built from the indexed corpus itself: sample chunks across documents and
   courses, and for each derive a query that the sampled chunk answers. The sampled chunk is the
   ground truth; its siblings are near-misses, which is exactly the discrimination under test.

The set is **checked into the repository** as data, with its embeddings cached, so re-running it
costs nothing and produces the same number twice. A measurement that cannot be repeated cheaply will
not be repeated.

### What gets measured

Run through the **real retrieval code**, not a reimplementation of it — a benchmark that reimplements
the query builds a second surface that can drift from the first.

- **Recall@k and MRR** at the current settings, per entry point (Stage 5 path, Stage 6 path,
  `search_documents`).
- **Threshold sensitivity.** The same set at 0.15 / 0.20 / 0.25 / 0.30 / 0.35, reporting for each
  what is gained and what is lost. The interesting number is not the best average — it is where the
  curve bends.
- **Branch attribution.** For every accepted result: did it come from the dense branch, the sparse
  branch, or both? A branch that never contributes a _unique_ accepted result is a branch that is
  not doing its job, whatever the label on the call says.
- **Expansion effect.** For each hit, compare matched fragment against rebuilt passage: does the
  passage still contain the matched text (it must), how many tokens were added, and does the added
  text belong to the same document section or wander. Pair the token cost with the value: 5.5x
  context is a real cost per lesson at Stage 6's 20K budget.

### What may change afterwards

Only constants, and only where the numbers say so: `DENSE_SCORE_THRESHOLD`,
`DENSE_SCORE_THRESHOLD_WIDENED`, the Stage 6 `TARGET_CHUNKS`/`candidateMultiplier`, the expansion
`maxTokens` ceiling, and — if branch attribution shows an imbalance — the BM25 `k`/`b`/`avg_len` or
the prefetch multiplier. Every change carries the measured basis in the comment beside it, and the
grandfathering rule applies: a guard fails what is new, it does not retroactively fail what exists.

## The operational re-check

One read-only pass per guarantee. For each, the question is not "is it configured" but "what would
make it fire, and can it".

- **Collection truth.** Alias `course_embeddings` → physical `course_embeddings_v1`; schema, payload
  indexes and strict mode against `collection-schema.ts`; point count against the recorded 6856
  (13712 before deduplication — a restore returning the larger number is not a fault).
- **Snapshots.** On-host snapshots share the docker volume with live data, so the daily off-host
  pull to `helixa-new` is the only real mitigation. Confirm freshness, confirm the 7-day retention
  actually in force (the number is interpolated from `EXPECTED_RETENTION_DAYS`, after two copies
  drifted to 7 against 14), and confirm a restore drill that ran against an isolated copy.
- **Alerts.** All 19 rules in `ops/qdrant/prometheus/alerts.yml`. Name each rule's metric source and
  say whether the metric is being produced now. `QdrantHybridFallbackHigh` reads a counter written
  by `metrics-textfile.ts` through the textfile collector — confirm the file is being written and
  read. `SupabaseBackupMetricMissing` and `HostDiskMetricMissing` exist precisely because an
  `absent()` metric is a silent rule; verify they are not themselves silent.
- **Reindex from source of truth.** The procedure exists (`deploy/qdrant/source-recovery-run.sh` and
  the Q7 artifacts). Confirm it is executable _today_ by dry run or on dev — not on production.

## Constraints and traps

- **`localhost:6333` is not ours.** On this workstation that port is `helixa-qdrant-1`, collection
  `course_embeddings`, belonging to the Helixa project. Our dev Qdrant is on the dev host. Reading
  the wrong one produces a confident, wrong measurement.
- **The default backend Vitest command is fail-closed and needs Qdrant 1.18.2.** Use
  `vitest.config.unit.ts` for focused unit tests.
- **Jina costs money**: embeddings for query vectors and the reranker at Stage 6. Cache both in the
  benchmark. Standing authorization covers paid runs under USD 5.
- **Dev and staging share one Supabase project**, and CI does not auto-apply migrations. This work
  needs no migration; if one appears, that is a signal the scope drifted.
- **A test that pins the broken shape lets the defect through.** Any test added here must be shown
  failing against the pre-change behaviour, and that check must be stated explicitly.
- **`lint-staged` rewrites files at commit time.** Re-run text-asserting tests after committing,
  before pushing.

## Acceptance

1. `pnpm rag:benchmark` (or the script's documented invocation) runs offline, twice, and produces
   the same numbers; its evaluation set and cached embeddings are in the repository.
2. A results document states, with numbers: recall/MRR at current settings, the threshold curve,
   per-branch attribution, and expansion's token cost against its effect.
3. Any constant that changed names its measured basis in place; any constant left alone is recorded
   as measured-and-unchanged, so the next reader knows it was examined.
4. All 19 alert rules are listed with their metric source and a reachable/unreachable verdict.
5. Collection, snapshot freshness, retention and restore-drill evidence recorded read-only.
6. `type-check`, `build`, the focused unit set and `eslint` on touched files are green; the changed
   retrieval paths carry a test that was shown red against the old behaviour.
7. `.codex/handoff.md` no longer says "quality unmeasured"; it says a number.
8. `mc2-jz6y0` is closed, with `mc2-8m90f` recorded as the one thing still owed and still gated.
