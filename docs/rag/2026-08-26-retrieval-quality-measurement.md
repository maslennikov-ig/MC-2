# RAG retrieval quality, measured

**Date:** 2026-08-26 · **Epic:** `mc2-xg6g8` · **Closes out:** `mc2-jz6y0`
**Harness:** `pnpm benchmark:rag` (`packages/course-gen-platform/scripts/rag-quality-benchmark.ts`)
**Corpus:** live `course_embeddings` → `course_embeddings_v1`, 6856 points, read-only over an SSH
tunnel to the dev host. `localhost:6333` on a workstation is a different project's Qdrant.

## What was measured

76 queries against the live collection, through the real retrieval code:

- **31 known-answer pairs** — a chunk sampled from the corpus and a question derived from it by
  `deepseek/deepseek-v4-flash-0731`, with a distinctive phrase from the chunk as ground truth.
  Spread over 10 courses and at most two per document.
- **45 real Stage 6 objectives** — the learning objectives `buildLessonQueries` turns into search
  queries. These carry no ground truth and are never scored for recall; they exist so that branch
  attribution and threshold sensitivity are measured on what the pipeline really asks.

The evaluation set and its query vectors are committed under
`packages/course-gen-platform/eval/rag-retrieval/`, so a re-run costs nothing.

**On the plan's assumption about trace wording.** The work order expected real query strings from
`generation_trace` (`phase = 'rag_retrieval'`). Those 1966 rows record query _counts_ and never the
strings, and `rag_context_cache` is empty, so the wording was recovered from `lessons.objectives`
instead — the same strings `buildLessonQueries` reads, taken from their source rather than from a log
that did not keep them.

## Headline numbers

Recall@5 and MRR over the 31 scorable queries, at the settings in force (threshold 0.25):

| Entry point                 | Recall@5   | MRR    | nDCG@5 | Results per query | Hybrid |
| --------------------------- | ---------- | ------ | ------ | ----------------- | ------ |
| Stage 5 section retrieval   | **0.9677** | 0.7952 | 0.8374 | 96.2              | yes    |
| Stage 6 lesson retrieval    | **0.7419** | 0.6237 | 0.6534 | 6.25              | yes    |
| `search_documents` defaults | **0.4839** | 0.4032 | 0.4243 | 9.28              | **no** |

Two runs of the harness produce identical recall, MRR, nDCG and coverage. Branch attribution counts
vary by up to 3 in ~350 and one result id in ~7000 can differ, because RRF ties at the depth-100
boundary are ordered arbitrarily by Qdrant; see "Reproducibility" below.

**Hybrid roughly doubles top-5 recall.** `search_documents` is the only entry point that does not ask
for hybrid — `enable_hybrid` defaults to `false` — and it is the one that finds the answer in the top
five for half as many queries.

## 1. Stage 5 was never hybrid for a small section plan (fixed)

`strict_mode_config.max_query_limit = 100` applies to a **prefetch** limit as well as to the outer
one. `getPrefetchLimit` asked for `3 x limit` with no ceiling, and Stage 5 sizes its per-query limit
as `TARGET_CHUNKS * candidateMultiplier / queryCount`. Confirmed end to end through `searchChunks`:

| Queries in the section plan | Caller limit | Prefetch | Result                     |
| --------------------------- | ------------ | -------- | -------------------------- |
| 1                           | 100          | 300      | `Bad Request` → dense-only |
| 2                           | 50           | 150      | `Bad Request` → dense-only |
| 3                           | 34           | 102      | `Bad Request` → dense-only |
| 4                           | 25           | 75       | hybrid                     |
| 5                           | 20           | 60       | hybrid                     |

Same shape as the unreachable 0.7 threshold: the call says hybrid, the log says hybrid,
`search_type` says hybrid, and only `fallback_used` and a `warn` line say otherwise.

`getPrefetchLimit` now clamps to `STRICT_MODE_MAX_QUERY_LIMIT`, read from
`COLLECTION_CREATE_PARAMS.strict_mode_config` rather than restated. Measured effect on Stage 5:

|                                           | Before  | After       |
| ----------------------------------------- | ------- | ----------- |
| Fallbacks to dense-only                   | 76 / 76 | **0 / 76**  |
| Recall@5                                  | 0.7742  | **0.9677**  |
| MRR                                       | 0.6290  | **0.9097**  |
| Unique sparse-branch results              | 0       | **1877**    |
| Queries where sparse contributed uniquely | 0 / 76  | **70 / 76** |

Nothing below a caller limit of 34 is affected, so Stage 6 (30 at its widest) and `search_documents`
(10) keep the candidate pool they had.

Guarded by `tests/unit/shared/qdrant/prefetch-limit-is-servable.test.ts`, shown failing against the
pre-change behaviour with `expected 300 to be less than or equal to 100`.

## 2. The threshold curve

Recall@5 across the sweep, over the same 31 scorable queries:

| Threshold | Stage 5 | Stage 6 | `search_documents` | Queries returning nothing (of 76) |
| --------- | ------- | ------- | ------------------ | --------------------------------- |
| 0.15      | 0.9677  | 0.7419  | 0.4839             | 0                                 |
| 0.20      | 0.9677  | 0.7419  | 0.4839             | 0                                 |
| **0.25**  | 0.9677  | 0.7419  | 0.4839             | 3                                 |
| 0.30      | 0.9677  | 0.7419  | 0.4839             | 6                                 |
| 0.35      | 0.9677  | 0.7419  | **0.4516**         | 9                                 |

**The curve bends at 0.30, and only for the dense-only path.** Both hybrid entry points are flat
across the whole sweep, because the sparse branch keeps supplying candidates when the dense gate
closes — which is the point of having one. On the dense-only path, 0.35 loses a real answer and takes
nine of 76 queries to zero results.

So 0.25 keeps everything and throws away nothing measurable, and it sits in the middle of the flat
stretch with the nearest edge at 0.30. **Left unchanged, now measured.**

### The observed dense ceiling has moved

`MAX_OBSERVED_DENSE_SCORE` was 0.6, from three hand-run queries on 2026-08-12. Over 760 dense scores
from 76 queries against the live collection the highest was **0.6497**, and six of the 76
best-per-query scores were above 0.6. A ceiling below what the embeddings demonstrably produce calls
a reachable threshold unreachable — the same class of wrongness as the 0.7, pointing the other way.
**Raised to 0.65.** Nothing near 0.7 was seen.

### A fused RRF score is not on a different scale

`retrieval-thresholds.ts` warned that RRF scores are "~1/(k+rank)" and that 0.7 is "unreachable by
construction" for them. Measured: Qdrant's fused scores reach **1.0000**, per-query bests between
0.50 and 1.00, against dense cosine bests of 0.45 to 0.65. **The ranges overlap.** The advice — never
apply the dense threshold to a fused score — is still right; the stated reason was wrong, and wrong
in the direction that makes a mistaken 0.7 gate on RRF look harmless when it would cut real results.
Corrected in place.

## 3. Branch attribution: hybrid is hybrid, where it is asked for

For every accepted result, which branch could have produced it. Both prefetch branches are built by
`buildHybridPrefetch` — the same function the hybrid query uses — and re-run at the deepest legal
depth (100).

| Entry point | Dense only | Sparse only | Both | Beyond prefetch | Queries with a unique dense result | with a unique sparse result |
| ----------- | ---------- | ----------- | ---- | --------------- | ---------------------------------- | --------------------------- |
| Stage 5     | 2086       | 1813        | 3411 | 0               | 70 / 76                            | 71 / 76                     |
| Stage 6     | 60         | 137         | 154  | **124**         | 34 / 76                            | 39 / 76                     |

Neither branch is idle. At Stage 5 the split is close to even; at Stage 6 the sparse branch
contributes more unique results than the dense one.

`megacampus_qdrant_hybrid_fallback_total` would not have reported the Stage 5 failure as a quality
problem in any case — it counts hard degradation, which is exactly what happened, but on staging it
has recorded **2 hybrid requests total, last written 2026-08-12**. See §6.

**A quarter of Stage 6's answer does not come from hybrid fusion.** The `beyondBranchDepth` column
counts accepted results that appear in neither branch's top-100. Probed directly: a grouped query
returned 20 results of which 10 were outside both branch lists, and the identical query with grouping
off had zero. That is Qdrant's per-document group fill, and at Stage 6 it is 124 of 475 accepted
results.

## 4. Parent expansion is not running at all

`sibling_chunk_ids` is empty on **all 6856 points**. Measured over 7310 Stage 5 results and 475
Stage 6 results:

|                            | Value                     |
| -------------------------- | ------------------------- |
| Results widened            | **0**                     |
| Token multiplier           | **1.00x**                 |
| Points declaring a sibling | 0                         |
| Matched text retained      | 7310 / 7310 and 475 / 475 |

`.codex/handoff.md` records "average expansion 5.5x; quality unmeasured". The 5.5x was measured on
freshly chunked documents and is what expansion **will** cost; it is not what production pays today.
Every point in the collection was indexed in **July 2026** with `total_chunks: 1`, before
`selectIndexableChunks` stopped degenerate one-child parents from reaching the index. A parent with a
single child gives that child no siblings, so there is nothing to stitch.

So the expansion `maxTokens` ceilings (20K at Stage 6, 40K at Stage 5) are **measured and left
unchanged**: they are never approached, and they will start to matter the day a document is indexed
with the current chunker.

## 5. What grouping costs Stage 6 — an open question, not a change

Stage 6 is the entry point with the lowest recall, and it differs from Stage 5 in four ways at once,
so the two cannot be compared directly. Holding everything else fixed and switching one option at a
time, at threshold 0.25:

| Stage 6 request shape              | Recall@5   | MRR    | nDCG@5 | Results per query |
| ---------------------------------- | ---------- | ------ | ------ | ----------------- |
| **as configured** (`group_size` 2) | 0.7419     | 0.6237 | 0.6534 | 6.25              |
| `group_size` 3                     | 0.7742     | 0.6500 | 0.6806 | 9.29              |
| `group_size` 4                     | 0.4839     | 0.4032 | 0.4243 | 27.33             |
| `group_size` 6                     | 0.4839     | 0.4032 | 0.4243 | 27.33             |
| `group_size` 10                    | 0.4839     | 0.4032 | 0.4243 | 27.33             |
| **grouping off**                   | **0.9677** | 0.7774 | 0.8241 | 29.97             |
| priority boost off                 | 0.8065     | 0.6532 | 0.6921 | 6.25              |
| grouping and boost off             | **0.9677** | 0.7952 | 0.8374 | 29.97             |

Grouping costs **22.6 points of recall@5**. The mechanism, from a per-query trace of where the
ground-truth chunk lands:

```
query: "Какие сведения о договоре заказчик обязан включить..."
  grouping off              30 results from  2 documents   answer at rank  2
  group_by_document size 2  20 results from 10 documents   answer at rank 10
  group_by_document size 4  30 results from  3 documents   answer at rank 16
```

Grouping reaches deeper to fill each document's group, discovers many more documents, and the best
chunk of each new document outranks the true answer. That is not a bug — it is what document
diversity _is_. `group_size` is not the lever either: 3 is marginally better than 2, and 4 and above
are much worse.

**This is a trade — diversity against relevance — and it reverses an accepted decision
(`mc2-jz6y0.16`), so it is reported and not decided here.** Nothing in the Stage 6 request shape was
changed. The three options are: keep grouping as it is; raise `group_size` to 3 for a small gain; or
turn grouping off for Stage 6 and accept that one document may dominate a lesson's context.

Two consequences worth carrying into that decision:

- Stage 6 asks for 30 candidates so its cross-encoder can discard three in four. Grouping returns
  **6.25 per query**, so the reranker usually has fewer candidates than the seven chunks it is meant
  to select. `TARGET_CHUNKS` and `candidateMultiplier` are recorded as measured-and-unchanged for
  this reason: neither is the constraint.
- The priority boost costs about 6 points of recall while grouping is on, and nothing measurable
  while it is off.

## 6. Reproducibility

Two consecutive runs give identical recall, MRR, nDCG and atom coverage on all three entry points.
They are not byte-identical: branch attribution counts move by up to 3 in ~350, and one accepted
chunk id in ~7000 can differ.

The cause is ties, not approximation. The dense-only entry point returns byte-identical rankings run
after run; both hybrid ones changed their top-10 on about one query in four before a deterministic
tie-break was added. An RRF score is a sum of `1/(k + rank)` over at most two branches, so many
candidates share a score exactly, and this corpus makes it worse: **4127 of 6856 points are duplicate
copies of 2729 distinct texts**, which score identically in BM25 by construction. Which of two tied
candidates survives the result limit is Qdrant's decision and it varies.

The measurement orders ties by a hash of the chunk id. Ordering them by the id itself — the obvious
choice, and the one `retrieval-metrics.ts` uses offline — inflated Stage 6 recall from 0.8387 to
0.9032, because the evaluation set samples chunks in id order and the scorer was agreeing with the
sampler.

## Corpus facts worth knowing

Read-only from the live collection, 2026-08-26:

- 6856 points, 87 courses, 218 documents, all `level: child`, all indexed in **July 2026**.
- `heading_path` is `"Root"` on **every point** — no heading hierarchy survived conversion.
- `chunk_strategy: hierarchical_markdown`, `total_chunks: 1`, `overlap_tokens: 0` on every point.
- Token count: min 100, median 348, mean 330, p90 441, max 1143. `QDRANT_BM25_OPTIONS.avg_len` is
  set to 256 against a real mean of 330 — recorded, not changed, because branch attribution shows the
  sparse branch is healthy.
- 2729 distinct contents; 1486 of them appear under more than one course.
- `document_weight`: 2537 CORE (1.0), 2179 IMPORTANT (0.8), 2140 SUPPLEMENTARY (0.5).

## How to re-run

```bash
ssh -N -L 16335:127.0.0.1:6335 megacampus-prod          # read-only tunnel to the live Qdrant
export QDRANT_URL=http://127.0.0.1:16335
export QDRANT_API_KEY=<the read-only key>               # refuses every write, verified: 403
pnpm --filter @megacampus/course-gen-platform benchmark:rag run
pnpm --filter @megacampus/course-gen-platform benchmark:rag variants
```

`build` re-samples the corpus and re-derives the questions; it spends money and its output is
committed, so it is for when the corpus changes. `run` and `variants` spend nothing.
