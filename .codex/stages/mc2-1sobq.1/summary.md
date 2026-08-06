# Stage `mc2-1sobq.1` — structure-aware Docling RAG

Epic: `mc2-1sobq` (`specs/024-docling-intelligence/spec.md`)
Level: integration · Owner: root · Status: in progress — AC-2 open

## What changed observably

Docling's own document structure now reaches chunking, metadata enrichment and
the Qdrant payload. On the controlled corpus, native chunking resolves **100% of
child chunks in all six chunkable cases** to Docling `self_ref`s, with page
numbers and bounding boxes wherever the source has pages (n/a for DOCX). Heading
paths are carried for **100% of child chunks in five of those six cases** and
for **0% in `reading-order-pptx`**, because Docling emits no headings at all for
that deck — the coverage figure reports what the converter supplied, and a
strategy cannot invent a heading that does not exist. The legacy Markdown
splitter carried a heading path for **0%** of chunks in every case.

Chunking is unchanged for production: `DOCLING_CHUNK_STRATEGY` defaults to
`legacy_markdown` everywhere except the dev compose, no document was reindexed,
and every new Qdrant key is optional.

One production behaviour DOES change: the embedding cache key now covers the
model, width, task, `late_chunking` and, under late chunking, the whole request
batch. Old keys become unreachable and expire on their 1-hour TTL, so the first
re-processing of any document after deploy re-embeds it. The alternative is
what was there before — serving a vector computed in a different context, or
with late chunking off, for a late-chunked request.

## The benchmark was lying, and now it is not

`minimumHeadingDepth` asserted `max(#-count) >= 2`. A document whose only
headings are `##` satisfies that while having no hierarchy at all, which is
exactly how the scientific PDF passed as a two-level document. Assertions now
compare the set of DISTINCT heading levels
(`src/shared/embeddings/heading-hierarchy.ts`), and the same PDF is now recorded
for what it is: `expectedLevels: [2]`.

## Two upstream gaps, both measured before being named

1. **Serve accepts `do_pdf_heading_hierarchy` and drops it.**
   `docling_jobkit`'s `_parse_standard_pdf_opts` builds `PdfPipelineOptions`
   field by field and never assigns `heading_hierarchy_options`. Sending the
   flag returned byte-identical output; calling the library directly with
   `heading_hierarchy_options.enabled = True` promoted `3.1`/`3.2` from level 1
   to level 2 on the same PDF. `docker/docling-serve/runtime.py` passes the
   field through, and its build-time test asserts the upstream gap red first.
2. **The MCP cache key ignores the conversion profile.**
   `docling_mcp.docling_cache.get_cache_key` hashes only the source string and
   the OCR flags, so enabling heading inference on an already-converted source
   would have returned the previous artifact.
   `docker/docling-mcp/runtime.py` folds the profile fingerprint into the key.

Both wrappers keep the upstream packages unmodified and name the release that
removes them.

## No second conversion

Native chunking posts the ALREADY CONVERTED DoclingDocument JSON back to
`POST /v1/chunk/{hierarchical|hybrid}/source` with `from_formats:
[json_docling]`. The chunks therefore reference the accepted document by
construction rather than by a second conversion that could disagree with it, and
re-chunking a 20-page PDF costs ~2s instead of a full reconversion. Contract
resolved from the running Serve 1.29.0 `/openapi.json`, not from memory.

Refs that do not resolve are a `DoclingChunkConsistencyError` before upload, not
a chunk with less metadata.

## A/B result: withdrawn, no candidate selected

The previous `docling_hybrid` selection is retracted. Its dense run did not
measure the production ranker, for two independent reasons.

**The evaluator did not make production's embedding call.** It split parents and
children into two `generateEmbeddingsWithLateChunking` calls with
`late_chunking` off and on, following the docblock of a helper
(`separateChunksByLevel`) that describes a policy nothing in production uses.
`phase-5-embedding.ts` makes ONE call, over every chunk, with late chunking on.
Under late chunking Jina concatenates the request input, embeds it as a single
context and splits at the boundaries afterwards, so the input array IS the
context: two calls produce different vectors from the one production makes. The
helper is deleted; the evaluator now makes the production call literally.

**Every vector in that evidence came from cache, and the cache was unsound.**
`denseBilledTokens` is 0 in all 36 records of both accepted metrics files. The
key was `sha256(text:task)` — no model, no width, and no `late_chunking`. On
`scientific-pdf` under `legacy_markdown` every one of the 155 parent texts is
also a child text, so the parents pass (late chunking off) wrote 155 keys that
the children pass (late chunking on) then read back: the scored vectors were
non-contextual copies. That is a PRODUCTION defect, not only a benchmark one,
and it is fixed in `generate-utils.ts` and `generate.ts`:

- the key now covers model, width, task and `late_chunking`;
- under late chunking it also covers the whole ordered request input, so a
  vector is only reused inside the batch it was computed in;
- a partial cache hit under late chunking is refused outright and the batch is
  re-embedded, because serving three cached vectors and re-embedding two
  produces five vectors that never shared a context — and shrinking the input
  changes the context for the ones that remain;
- the benchmark runs in its own key namespace (`embedding-bench:<label>`), so a
  measurement can never be served production vectors, and its billed-token
  count is the real cost of that measurement.

The corrected dense A/B is a paid run and has not been made. `mc2-j1axa` is
reopened and stays a P1 hard blocker for Stage E. `DOCLING_CHUNK_STRATEGY`
remains `legacy_markdown` outside dev compose, as it always has.

## The gate counted chunks; now it counts facts

A chunk is not a unit of truth, and both earlier gates measured the strategy's
cutting rather than its retrieval. Gating the Recall RATIO punished a finer cut
through its denominator. Replacing it with the COUNT of relevant chunks fixed
the denominator and left the numerator corrupt: five fragments repeating one
answer scored five times the single chunk that carries it whole, so duplication
read as quality.

The manifest now declares EVIDENCE ATOMS — the distinct facts a question's
answer needs, sixteen of them across ten questions. Coverage is atoms covered
over atoms declared, and the denominator is fixed before any run and identical
for every strategy. `aMRR` (`1/rank`) and `aDCG` (`1/log2(rank+1)`) keep rank
sensitivity over that same fixed denominator. A fact retrieved five times counts
once; a fact split across a chunk boundary until no chunk carries it whole is
reported in `unreachableAtoms` and lowers coverage at the same time.

Every scored top-5 is now written out as chunk ids with per-atom ranks beside
it, so "the same chunks in the same order" is checkable instead of remembered —
it was not checkable in the previous evidence, and should not have been claimed.

On the lexical channel the atom gate discriminates: `docling_hierarchical`
regresses `sci-accuracy-drop` (coverage 0.500 → 0.000) and `pptx-steps`
(aMRR 1.000 → 0.292), while `docling_hybrid` regresses nothing and lifts
`scientific-pdf` coverage from 0.75 to 1.00. That is a lexical-reachability
result and it does not select a default.

## What the metric said before, and why it was wrong twice

The first version of this stage scored Recall@K as
`relevantInTopK / min(relevantTotal, k)`, which returns 1.00 whenever the top-k
is saturated: "5 of 8 relevant chunks retrieved" was printed as a perfect
score. The regression gate then compared only the reciprocal rank, so a strategy
that kept the first hit first while losing the rest of the evidence passed.
Recall@K is now `relevantInTopK / relevantTotal` with its reachable ceiling
printed beside it.

The second error was the fix's own tolerance. 0.01 was justified as
floating-point slack, but Recall can fall by less than a percentage point and
still be a real miss — 1 of 101 relevant chunks is 0.0099 — so the tolerance
would have absorbed a genuine loss on any question with a large relevant set.
The epsilon is now 1e-9, representation error only.

Tightening the epsilon to 1e-9 then exposed the deeper problem described above:
neither a chunk ratio nor a chunk count is a property of the answer. The gate
now counts evidence atoms and the epsilon stays representation error only.

The comparator lives in `retrieval-metrics.ts` with its own unit tests instead
of inline in the benchmark script where nothing could reach it, and it treats a
control question that vanished between runs as a regression.

**Which channel blocks.** When `--dense` runs, the live dense+sparse result is
the gate and the offline BM25 proxy becomes an observation: gating on pure BM25
while the real ranker is measured would gate on a configuration nobody runs.
Both channels are always printed, including where they disagree.

## Also fixed on the way

The child splitter is token-aware now. `chunkSize: child_chunk_size * 4`
approximated one token as four characters, which overshoots roughly 2x on
Cyrillic: a "400 token" child measured 845 tokens. The native adapter passes
`lengthFunction`, so the budget is real tokens. Parent grouping also happens
after splitting, so one very long section can no longer produce a single
oversized parent that the Jina batcher would reject.

`processingResult.json` now reaches `enrichChunks`. It never did, which is why
`page_number` was null for every chunk of every document regardless of strategy.

## Verification

- `pnpm type-check`, `pnpm build`, `pnpm lint` — green, 0 errors.
- Focused tests: `tests/unit/shared/embeddings` and
  `tests/unit/stages/stage2-document-processing`. `retrieval-metrics.test.ts`
  pins that one fact scores the same whether one chunk or five carry it, that a
  fact split across a boundary is `unreachable`, that a fact lost from a
  101-atom set is caught, that chunk-level numbers moving with the cut are not,
  and that a vanished control question is a regression.
  `generate-utils.test.ts` pins that the cache key separates model, width,
  task, `late_chunking` and batch composition, and refuses a late-chunking key
  with no batch context. `generate.test.ts` pins that a partial late-chunking
  hit re-embeds the whole batch while a plain batch still reuses per text.
  `dense-retrieval-eval.test.ts` pins the single production embedding call.
- The dense evaluation never writes to the document catalog. It upserts through
  the production point builders but not through `uploadChunksToQdrant`, which
  also updates `vector_status` in Supabase — a benchmark over throwaway ids has
  no business touching a real database. Collection creation, payload indexing
  and every later step run inside the `try`, so a failed index cannot leak the
  temporary collection; the production alias is refused outright.
- `docker/docling-serve/test_runtime.py` and `docker/docling-mcp/test_runtime.py`
  run inside their image builds; both images rebuilt locally and green.
- Benchmark corpus 7/7 in both conversion profiles.
- Local test Qdrant: `qdrant/qdrant:v1.18.2` on `127.0.0.1:6343`
  (`QDRANT_URL`/`QDRANT_API_KEY` overrides), because host 6333 belongs to an
  unrelated project's 1.17.1 instance and the suite pins 1.18.2.

## Rollback

1. `DOCLING_CHUNK_STRATEGY=legacy_markdown` restores the current chunking and
   payload for new documents.
2. `DOCLING_MCP_PDF_HEADING_HIERARCHY=false` and
   `DOCLING_SERVE_PDF_HEADING_HIERARCHY=false` restore the current conversion
   profile.
3. If the rebuilt images ship, restore the previously recorded Serve/MCP
   digests.

No step deletes or rewrites a point. Old payloads stay readable because every
new key is optional, asserted in `native-chunk-payload.test.ts`.

## Not done here, on purpose

- Production deploy and any reindex: separate authorization, Stage E.
- Enrichments, new formats, OCR/VLM: Stages B, C, D.
- `docs/FUTURE/PREMIUM-docling-advanced-features.md` and
  `docs/FUTURE/docling-fallback-strategy.md` are still the obsolete pre-Docling-2
  designs; Stage B reconciles them.
