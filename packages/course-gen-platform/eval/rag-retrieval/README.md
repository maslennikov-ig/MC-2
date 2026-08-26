# RAG retrieval evaluation set

The data `pnpm benchmark:rag` measures against. Committed so that re-running the measurement costs
nothing and gives the same numbers twice — a measurement that cannot be repeated cheaply will not be
repeated.

| File                                  | What it is                                                                                          |
| ------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `eval-set.json`                       | 76 queries: 31 known-answer pairs sampled from the live corpus, 45 real Stage 6 learning objectives |
| `query-embeddings.json`               | The Jina v3 query vectors for all of them, rounded to six decimals                                  |
| `last-run.json`, `last-variants.json` | Run outputs, gitignored                                                                             |

## The two kinds of query, and why only one is scored

**`known-answer`** — a chunk was sampled from the indexed corpus and a question derived from it by
`deepseek/deepseek-v4-flash-0731`. The ground truth is a distinctive phrase from that chunk, not its
id: the same text sits under more than one course (1486 of 2729 distinct contents do), and a phrase
matches every copy where an id matches one arbitrary copy and calls the rest a miss. Recall@k and MRR
are computed on these and only these.

**`lesson-objective`** — real wording, from the learning objectives `buildLessonQueries` turns into
search queries. These have no ground truth and are deliberately excluded from every recall statistic
rather than scored as zero: a query with no truth is not a failed query. They exist so that branch
attribution and threshold sensitivity are measured on what the pipeline really asks, which is where a
synthetic set lies.

The wording did **not** come from `generation_trace`, though the plan for this work assumed it would.
Those rows record query counts and never the strings, and `rag_context_cache` is empty. The stored
objectives are the same strings by construction.

## Rebuilding

`pnpm benchmark:rag build` re-samples the corpus, re-derives the questions and re-embeds. It spends
money — one small LLM call per sampled chunk plus one Jina embedding per distinct query — so run it
when the corpus changes, not otherwise. Everything it needs is read-only against the live collection;
see the header of `scripts/rag-quality-benchmark.ts` for the tunnel and the read-only key.

Results and method: `docs/rag/2026-08-26-retrieval-quality-measurement.md`.
