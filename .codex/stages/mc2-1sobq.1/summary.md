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

## A/B result: no native strategy is promoted

Evidence: `evidence/stageA-corrected-{baseline,heading-inference}-*` — 7/7 cases
in both conversion profiles, Serve 2.70 GiB and 2.96 GiB of 4 GiB, zero
restarts. `evidence/stageA-rejected-hybrid-candidate-report.md` is the same
corpus run with `--candidate docling_hybrid`, kept because it is the run whose
gate went red.

The first version of this stage scored Recall@K as
`relevantInTopK / min(relevantTotal, k)`, which returns 1.00 whenever the top-k
is saturated: "5 of 8 relevant chunks retrieved" was printed as a perfect
score. The regression gate then compared only the reciprocal rank, so a strategy
that kept the first hit first while losing the rest of the evidence passed.
Recall@K is now `relevantInTopK / relevantTotal`, its reachable ceiling is
printed beside it, and every control question is guarded on Recall, MRR and
nDCG with an explicit 0.01 tolerance.

Per control question, `docling_hybrid` against `legacy_markdown` (baseline
profile; the heading-inference profile agrees on every sign):

| Question            | legacy R@5/MRR/nDCG | hybrid R@5/MRR/nDCG | Verdict          |
| ------------------- | ------------------: | ------------------: | ---------------- |
| `sci-accuracy-drop` |   0.000/0.000/0.000 |   0.500/0.333/0.307 | hybrid wins      |
| `sci-hypothesis`    |   0.625/1.000/1.000 |   0.444/1.000/0.830 | hybrid regresses |
| 8 remaining         |   1.000/1.000/1.000 |   1.000/1.000/1.000 | identical        |

So the honest reading is a trade, not a win: hybrid is the only strategy that
retrieves the table value in `sci-accuracy-drop` at all — legacy never places it
in the top 5 — and it gives up one of five top slots on `sci-hypothesis`, where
both answer at rank 1. `docling_hierarchical` is strictly worse: it takes the
same `sci-hypothesis` loss, wins nothing, and additionally splits the PPTX into
six fragments, pushing `pptx-steps` from rank 1 to rank 3.

The stage's acceptance criterion requires a candidate that does not regress a
control question. **No native strategy meets it, so none is promoted.**
`DOCLING_CHUNK_STRATEGY` stays `legacy_markdown` everywhere except dev; both
native strategies remain available as configuration and are fully instrumented.
The default decision moves to the dense A/B (`mc2-j1axa`), which is now a hard
blocker of Stage E.

Two limitations that must be read with the table:

- **Recall@K is not comparable across strategies.** A strategy that cuts the
  same document finer raises `relevantTotal` and lowers its own ceiling. With
  heading inference on, contextualized headings push `sci-hypothesis`'s relevant
  count from 8 to 29 for hybrid, so its Recall@5 reads 0.138 against a 0.172
  ceiling. The ceiling column exists so this is visible; it is not a reason to
  discount the drop, which nDCG confirms independently.
- **This is the lexical half of production retrieval** — BM25 with the
  collection's own `k`/`b`, offline. No `JINA_API_KEY` exists in this
  environment and paid calls are unauthorized, so dense ranking was never
  exercised. Nothing here shows what Jina v3 would rank. `mc2-j1axa`.

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
  now pins the Recall@K denominator with a case where 8 chunks are relevant and
  only 5 fit in the window: 0.625, which the previous implementation scored as
  1.00.
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
