# Stage `mc2-1sobq.1` — structure-aware Docling RAG

Epic: `mc2-1sobq` (`specs/024-docling-intelligence/spec.md`)
Level: integration · Owner: root · Status: accepted 2026-08-05

## What changed observably

Docling's own document structure now reaches chunking, metadata enrichment and
the Qdrant payload. On the controlled corpus, native chunking carries a real
heading path for **100%** of child chunks where the legacy Markdown splitter
carried one for **0%**, and resolves **100%** of chunks to Docling `self_ref`s
with page numbers and bounding boxes.

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

## A/B result

Evidence: `.tmp/docling-benchmark/stageA-baseline/` and
`.tmp/docling-benchmark/stageA-heading-inference/` — 7/7 cases pass in both
conversion profiles. Serve peaked at 3.032 GiB of 4 GiB with zero restarts.

| Case               | Strategy             | Heading path | Refs | Page/bbox |      R@5 |      MRR |
| ------------------ | -------------------- | -----------: | ---: | --------: | -------: | -------: |
| scientific-pdf     | legacy_markdown      |           0% |   0% |       n/a |     0.50 |     0.50 |
| scientific-pdf     | docling_hierarchical |         100% | 100% |      100% |     0.40 |     0.50 |
| scientific-pdf     | **docling_hybrid**   |         100% | 100% |      100% | **0.65** | **0.67** |
| reading-order-pptx | docling_hierarchical |           0% | 100% |      100% |     1.00 |     0.33 |
| reading-order-pptx | **docling_hybrid**   |           0% | 100% |      100% |     1.00 |     1.00 |

**Selected candidate: `docling_hybrid`.** It regresses no control question on
any case, improves the scientific PDF, and is the only native strategy that does
not over-fragment a slide. `docling_hierarchical` split the PPTX into six
fragments and pushed the answer from rank 1 to rank 3; that is recorded rather
than hidden, and the strategy stays available as configuration.

**The retrieval numbers are the lexical half of production retrieval** — BM25
with the collection's own `k`/`b`, offline. No `JINA_API_KEY` exists in this
environment, so dense ranking was not exercised and no paid call was made. A
win here is a lexical-reachability win. Follow-up `mc2-j1axa`.

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
- Focused tests: `tests/unit/shared/embeddings` (73) and
  `tests/unit/stages/stage2-document-processing` — 131 passed across 17 files.
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
