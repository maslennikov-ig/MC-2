# The retrieval change, read in a lesson — and the provider nobody billed

**Date:** 2026-08-28 · **Epic:** `mc2-d0e2n` · **Follows:** `mc2-xg6g8`, `docs/rag/2026-08-26-retrieval-quality-measurement.md`
**Corpus:** live `course_embeddings_v1` on the dev host, 6856 points, read-only over
`ssh -N -L 16335:127.0.0.1:6335 megacampus-prod`. `localhost:6333` on a workstation is a different
project's Qdrant, and port 6333 **on the host** is the dev instance with 12 points — the dev workers
point at that one, so a lesson generated through the dev queue would have retrieved from twelve
chunks.

## What was done

One course, one lesson specification, one evidence set, generated twice on dev through the real
`retrieveLessonContext` → `executeStage6` path, with a local, uncommitted two-line change as the only
difference between the arms:

- **Arm A** — `develop` as it stands, no per-document cap.
- **Arm B** — `group_by_document: true, group_size: 2` restored in `buildLessonSearchOptions`.

Course `8baaa75e-bb85-496e-81df-807e770fd73d` ("Курс по закупкам 223 ФЗ", 10 indexed documents,
884 chunks), lesson **3.2**, "Порядок оценки заявок с преимуществом". Chosen by probing five lessons
first: 3.2 was the one whose context drew on four distinct documents, and a single-document lesson
cannot show the difference in either direction.

Both artifacts are kept beside this file in `2026-08-28-lesson-arms/`.

## 1. The predicted call volumes were wrong, and measurement says why

The design predicted the change moved two volumes in opposite directions — roughly seven Qdrant
queries down to two, and 40–46 reranker candidates up to 60. **Measured, neither moved.**

| Per lesson                       | Arm A (no cap) | Arm B (cap restored) |
| -------------------------------- | -------------- | -------------------- |
| Queries planned                  | 9              | 9                    |
| Queries issued (Tier 1 + 2)      | **9**          | **9**                |
| Results per query                | 6              | 6                    |
| Unique candidates accumulated    | **44**         | **42**               |
| Chunks sent to the Jina reranker | **44**         | **42**               |
| Chunks handed to the model       | 7              | 7                    |
| Distinct documents behind them   | **4**          | **4**                |
| Context handed to the model      | 6135 chars     | 6093 chars           |

The prediction came from the benchmark's figure of 29.97 candidates per query. That number is real,
and it is measured at the request shape the benchmark issues — **one** query, so
`lessonCandidateLimit(7, 1)` asks Qdrant for 30. A real lesson issues nine or ten:

```
lessonCandidateLimit(targetChunks, queryCount) = ceil(7 * 4 / queryCount) + 2
   1 query  -> 30      9 queries -> 6      10 queries -> 5
```

At six results per query the collector cannot overshoot: nine queries reach 44 uniques, and
`enoughCandidates = 40` is only crossed by the ninth and last query, so the early break never saves
anything. The cap therefore cannot change the query count either — grouped results are flattened and
re-capped to the same caller limit by `flattenDocumentGroups`.

**The lesson to keep.** A per-query rate measured on a one-query harness does not describe a
ten-query lesson, because the per-query limit is a function of the query count. The same shape as the
cap itself: measured per query it cost 22.6 points of recall, measured per lesson it bought 0.11
documents. Both halves of a retrieval number have to be measured at the granularity the user
receives.

## 2. What the cap actually changed: the tail, not the head

Of the seven chunks each arm handed the model, **four are the same chunks**. The three that differ
are the tail:

| Only in Arm A    | score | Only in Arm B    | score |
| ---------------- | ----- | ---------------- | ----- |
| `4f6b6139-…docx` | 0.258 | `07bdf31f-…docx` | 0.244 |
| `c2529af2-…docx` | 0.216 | `a94458d4-….pdf` | 0.203 |
| `9ce9c4b3-…docx` | 0.203 | `d7158b3b-…docx` | 0.184 |

Both arms reached four distinct documents. The reranker's top selections are identical; the cap moves
only what sits below them. That is the mechanical reason the two lessons read the same, and it is
the thing the pre-rerank concentration measurement could not see.

## 3. The verdict on the two lessons: indistinguishable

Both were read end to end. This is a result, not a failed measurement.

Both lessons have the same five sections (the spec dictates them), the same two exercises, correct
arithmetic throughout (the ×0.85 conditional discount, the contract signed at the bid price and not
the discounted one), Mermaid diagrams that validate, tables, callouts and worked numeric examples.
Neither invents a statistic, and both mark their worked examples as hypothetical rather than
presenting them as cited fact. Neither cites a document by name.

Each grounds itself in specifics the other does not — Arm A names перечни № 1 and № 2, the origin
declaration and certificate, and the auction step of 0.5–5% of the starting price; Arm B names the
реестровая запись and the localisation levels that radio-electronic products are confirmed against.
That is the four-document context showing through, differently in each arm, with no difference in
quality.

Two differences are worth naming, and neither is retrieval:

- **Arm A derives a threshold Arm B only approximates.** Arm A works out that a Russian bid wins
  while `Ц_р < Ц_и / 0.85 ≈ 1.176 × Ц_и`, i.e. it may be up to ~17.6% dearer. Arm B states the same
  idea as "примерно на 15% выше", which understates the real margin, while getting every concrete
  numeric case right. A genuine, small edge to Arm A — and one paragraph of reasoning that could as
  easily have come out the other way on a rerun.
- **Arm B has a rendering defect Arm A does not.** `\$10{,}2 \times 0{,}85 = 8{,}67$` — an escaped
  opening delimiter that leaves the formula unrendered, twice. A generation artefact of this run.

Both runs regenerated twice, ended `needs_review`, and scored 0.782 (A) against 0.787 (B). Even the
judge cannot separate them.

**Read this as one observation per arm.** The generator is stochastic and it regenerated twice in
both arms; a single lesson cannot separate run-to-run variance from a retrieval effect. What it does
establish is the thing the epic was opened for: nobody had looked, and now somebody has, and the
lesson is not damaged.

**No retrieval constant is changed by this.** Nothing here is a defect the benchmark cannot see.

## 4. Jina has a price now, and a lesson has a Jina bill

Jina appeared in no cost table in this repository: not `MODEL_CATALOG`, not `config-seed.json`, not
`model-config-*.ts`. The rates come from the provider, in the same shape OpenRouter publishes and by
the same discipline:

```
GET https://api.jina.ai/v1/models   ->   data[].pricing.prompt    (USD per token, as a string)

jina-ai/jina-embeddings-v3                  0.00000005  ->  $0.05 per 1M tokens
jina-ai/jina-reranker-v2-base-multilingual  0.00000005  ->  $0.05 per 1M tokens
```

Recorded in `src/shared/jina/pricing.ts`; `pnpm -F course-gen-platform check:jina-pricing-drift`
re-reads the provider and fails when the table and the provider disagree.

What lesson 3.2 spent, measured on the runs above:

| Per lesson                        | Arm A            | Arm B            |
| --------------------------------- | ---------------- | ---------------- |
| Query embeddings                  | 9 calls, 241 tok | 9 calls, 241 tok |
| Reranker                          | 1 call, 8755 tok | 1 call, 8279 tok |
| **Jina**                          | **$0.00044980**  | **$0.00042600**  |
| OpenRouter (4 settled calls each) | $0.005282        | $0.004884        |
| **Total**                         | **$0.00573**     | **$0.00531**     |
| Jina share of the lesson          | **7.9%**         | **8.0%**         |

The reranker is 97% of a lesson's Jina bill: it receives the whole accumulated union, while a query
embedding is one short sentence.

**So `mc2-4clyr`'s "Stage 6 is about 90% of generation cost" was a statement about one provider.**
It is a sum over `generation_trace`, which recorded OpenRouter and nothing else, so Jina was in
neither the numerator nor the denominator. For this lesson the correction is about eight percent of
its own bill. It is **not** the whole correction for a course: Stage 4 evidence preflight and Stage 5
section retrieval also embed and rerank, and document indexing embeds every chunk of every uploaded
file — a far larger Jina bill per course than any lesson's. Those paths now record too, so the next
course run will say what they cost instead of leaving it to be estimated.

### Two Jina paths were invisible in different ways, and there were four

The bead knew about one of them. The audit found four call sites:

| Call site                | What it spent on                          | What recorded it before                                                |
| ------------------------ | ----------------------------------------- | ---------------------------------------------------------------------- |
| `generateQueryEmbedding` | one vector per retrieval query            | **nothing at all** — `usage` discarded, no tracker, no log line        |
| `rerankDocuments`        | one call per lesson, over the whole union | an in-process `TokenUsageTracker` nobody reads, reset with the process |
| `generateEmbedding`      | quality-gate text                         | a log line with tokens, no price, no course                            |
| `generateEmbeddings`     | quality-gate text in batches              | the same                                                               |

All four now price themselves at the call and write one `generation_trace` row stamped
`billedCall: true, provider: 'jina'`, on the same terms as every OpenRouter call. `cost-report.ts`
reports the two providers apart, because only one of them issues a per-call receipt — comparing the
whole ledger against `/api/v1/generation` would have reported a gap exactly the size of the
retrieval bill and called it a discrepancy.

Attribution is complete for retrieval (Stages 4, 5 and 6). It is **deferred** for the two quality-gate
callers, `shared/validation/quality-validator.ts` and `shared/validation/semantic-matching.ts`:
neither module mentions a course anywhere, so the id would have to be threaded through several public
signatures. They are named in `no-anonymous-spend.test.ts` under `RETRIEVAL_DEFERRED`, with the issue
that closes them.

### The guard now sees the provider

`no-anonymous-spend` matched `createOpenRouterModel*`, this repository's two completion wrappers and
the SDK method underneath them. A whole paid provider was outside all four detectors, which is why a
green guard sat over four unpriced call sites for the length of the cost epic. Two detectors were
added — every `api.jina.ai` HTTP call must price itself, and every retrieval entry point must be
given a course — and **shown red against the pre-change source before being written**: 3 unpriced
Jina HTTP call sites and 10 unattributed retrieval entry points.

## 5. `mc2-kim48`: the three questions, answered

Full reading of `src/shared/metrics/document-evidence-textfile.ts` and
`stage4-analysis/document-evidence-phase.ts`.

**1. What a second writer does to the shared `evidence-stage4-state.prom` when the database is
shared — nothing harmful. It is idempotent.** `updateStage4Aggregate` never increments; it calls
`applyDurableStage4Totals`, which **sets absolute values** taken from one database RPC,
`get_document_evidence_observability_totals`, over a singleton row, keyed by
`(pg_postmaster_start_time(), generation, revision)`. Dev and staging both point at
`diqooqbuchsliypgwksu`, so two writers compute the same tuple for the same revision and write the
same numbers. The ordering guard drops a strictly older `(databaseStart, generation)` snapshot
without writing at all, and `state.clear()` fires only for a strictly newer epoch, which is a
database-side fact both writers see alike. The incrementing counters — `stage4_invocations_total`
and the rest — live in the **per-service** file, `evidence-<service>-<instance>.prom`, which is
labelled per writer and cannot collide. Locking is `flock` on a lock file in the same directory, so
two containers sharing the mount serialise correctly.

**2. Does dev need its own directory and scrape target — not for file safety; yes for
distinguishability.** Per-service files are already separated by `QDRANT_METRICS_SERVICE` and
`QDRANT_METRICS_INSTANCE`, and the aggregate is safe by the reconciliation above. The problem is one
layer up.

**3. Should dev runs wake the on-call — as things stand they would, as staging, and that is the
thing to fix first.** `prometheus.yml` sets `external_labels: environment: staging` and stamps every
series it sees, and not one of the four `DocumentEvidence*` rules narrows by `service`, `instance` or
`environment` — they are bare `sum()`, `min()` and `max()` over everything. So turning the dev writer
on today would page staging's on-call for a dev experiment. The distinction the rules would need:
the **Stage 4 aggregate is environment-agnostic by construction** — it describes the shared database,
not an environment — while the per-service outcome counters are per-process and belong to whichever
environment produced them.

**Deferred, with the reason.** Making the rules reachable means deciding whether dev pages staging's
on-call, and then changing production alerting to match. That is an owner decision this epic is not
authorised to make (`mc2-d0e2n` is dev-only, no production mutation), and turning the writer on
without narrowing the rules first would be worse than the current silence. `mc2-kim48` stays open
carrying these answers and the recommended shape: narrow the four rules first, then enable the dev
writer with its own `service`/`instance`.

**Confirmed still true:** all six `megacampus_document_evidence_*` metrics are absent and no
`evidence-*.prom` file exists. The directory holds `worker-worker.prom` from 2026-08-12, which is a
different writer entirely — `qdrant/metrics-textfile.ts`, hybrid search counters — and reading it as
evidence output would be a mistake.

## Reproducing this

```bash
ssh -f -N -L 16335:127.0.0.1:6335 megacampus-prod       # read-only tunnel to the live Qdrant
export QDRANT_URL=http://127.0.0.1:16335
export QDRANT_API_KEY=$(ssh megacampus-prod cat /opt/megacampus/secrets/qdrant_read_only_api_key)
export REDIS_URL=redis://localhost:6379/11               # a cold cache; the arms must not share one
export LOG_LEVEL=debug                                   # the per-query lines are at debug
```

The volumes are read from lines that already existed — `[Lesson RAG] Tier N query executed` carries
`totalUnique` per query, `[Jina Reranker] Request completed` carries `tokensUsed` and
`documentsReranked`. No instrumentation was added to find out what was already there.

Two traps for the next run. `[Lesson RAG] Retrieval complete` logs `queriesExecuted: queries.length`,
which is the number **planned**, not the number issued — the Tier 2 break can end the pass early and
that line will not say so. And the reranker's Redis cache is keyed on the document set, so re-running
one arm answers from cache and reports no tokens; use a fresh Redis database per arm.
