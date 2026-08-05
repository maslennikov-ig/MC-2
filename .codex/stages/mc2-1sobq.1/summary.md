# Stage `mc2-1sobq.1` — structure-aware Docling RAG

Epic: `mc2-1sobq` (`specs/024-docling-intelligence/spec.md`)
Level: integration · Owner: root · Status: accepted 2026-08-05

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

Nothing changed for production yet: `DOCLING_CHUNK_STRATEGY` defaults to
`legacy_markdown` everywhere except the dev compose, no document was reindexed,
and every new Qdrant key is optional.

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

## A/B result: `docling_hybrid` selected on production ranking

Evidence: `evidence/stageA-{baseline,heading-inference}-*` — 7/7 cases in both
conversion profiles, Serve 2.89 GiB of 4 GiB, zero restarts.

The A/B is no longer a proxy. It runs the production retrieval path: real
`jina-embeddings-v3` vectors (late chunking for children, none for parents),
upserted into a throwaway Qdrant collection built from the same
`COLLECTION_CREATE_PARAMS` AND payload indexes as production, queried through
`searchChunks({enable_hybrid: true})` — server-side BM25 prefetch, dense
prefetch, RRF. A silent fallback to dense-only fails the run instead of being
scored. 18 297 embedding tokens were billed to `api.jina.ai` on the first
uncached pass, under authorization recorded in this stage.

Per control question, `docling_hybrid` against `legacy_markdown` on that path:

| Question            | legacy MRR/nDCG | hybrid MRR/nDCG | Verdict                  |
| ------------------- | --------------: | --------------: | ------------------------ |
| `sci-accuracy-drop` |     0.000/0.000 |     1.000/0.613 | never retrieved → rank 1 |
| `sci-hypothesis`    |     1.000/1.000 |     1.000/1.000 | identical                |
| 8 remaining         |     1.000/1.000 |     1.000/1.000 | identical                |

(`sci-accuracy-drop` figures are the heading-inference profile; on baseline it
is 0.000/0.000 → 0.333/0.307, the same direction.) `docling_hierarchical` is
rejected on the same evidence: it retrieves 5 → 3 relevant chunks on
`sci-hypothesis` and pushes `pptx-steps` from rank 1 to rank 2, winning nothing.

**Selected candidate: `docling_hybrid`.** The default in code stays
`legacy_markdown` everywhere except dev compose — selecting a candidate is not
authorization to change production behaviour, and that flip belongs to Stage E.

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

Tightening the epsilon to 1e-9 then exposed the deeper problem: the Recall@K
RATIO is not comparable across chunking strategies at all. Its denominator is
`relevantTotal`, a property of how finely the strategy cut the document. On
`sci-hypothesis`, hybrid retrieves the SAME five relevant chunks in the SAME
order as legacy, with identical MRR and nDCG, and scores 0.556 against 0.625
only because it created a ninth chunk containing the phrase. With heading
inference the same effect reads 0.172 against 0.625.

So the gate guards the COUNT of relevant chunks in the top-k, plus MRR and
nDCG — all three independent of how the corpus was cut. The 1-of-101 scenario
is still caught, because it is a count of 5 falling to 4. The ratio and its
ceiling stay printed in every report as description, not verdict. This change
is what let `docling_hybrid` pass, and it is stated plainly for that reason;
`docling_hierarchical` still fails the same gate, which is the check that the
rule discriminates rather than excuses.

The comparator now lives in `retrieval-metrics.ts` with its own unit tests
instead of inline in the benchmark script where nothing could reach it, and it
treats a control question that vanished between runs as a regression.

**Which channel blocks.** When `--dense` runs, the live dense+sparse result is
the gate and the offline BM25 proxy becomes an observation: gating on pure BM25
while the real ranker is measured would gate on a configuration nobody runs.
Both channels are always printed. They disagree on exactly one question —
`sci-hypothesis`, where the pure-BM25 proxy has hybrid retrieve 4 relevant
chunks instead of 5 — and that disagreement is in the report rather than
smoothed away.

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
  pins the Recall@K denominator with a case where 8 chunks are relevant and
  only 5 fit in the window (0.625, which the first implementation scored as
  1.00), and pins the gate itself: a relevant chunk lost from a 101-strong set
  is caught, a ratio that fell only because the corpus was cut finer is not, a
  vanished control question is a regression.
- The dense evaluation never writes to the document catalog. It upserts through
  the production point builders but not through `uploadChunksToQdrant`, which
  also updates `vector_status` in Supabase — a benchmark over throwaway ids has
  no business touching a real database. The temporary collection is dropped in
  a `finally`, and the production alias is refused outright.
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
