# Docling MCP reference

## Runtime contract

```text
Backend workers
  -> http://docling-mcp:8000/mcp
  -> nginx facade
  -> Docling MCP 3.0.0
  -> http://docling-serve:5001
  -> Docling Serve 1.29.0 / Docling 2.118.0 / Core 2.90.0
```

`docling-serve` has no published host port. The stable application endpoint is
`/mcp` through nginx. Both MCP and backend workers mount the same cache at
`/app/docling-json-cache`.

## Required MCP tools

The TypeScript SDK 2 client validates these once per session:

- `convert_document_into_docling_document`
- `export_docling_document_to_markdown`
- `save_docling_document`

One conversion bundle calls all three tools for one `document_key` and returns
Markdown, normalized JSON, cache key, cache status, and processing time.
`structuredContent` is primary; text JSON remains only for an MCP 1.x server
during client-first rollout. The saved JSON filename must match the same
`document_key`; a mismatched artifact fails the bundle before it is read.

Course cleanup reproduces Docling MCP 3's cache key exactly: the first 32
characters of SHA-256 over sorted Python `json.dumps` output, including its
default ASCII escaping for Unicode paths. During the compatibility window it
removes both host/container-path variants, legacy MD5 keys, and paired `.json`
and `.md` artifacts.

## Timeouts and resources

| Layer               |                  Limit |
| ------------------- | ---------------------: |
| TypeScript MCP call |                 1200 s |
| MCP -> Serve task   | 1200 s, 2 HTTP retries |
| Serve sync/document |                 1200 s |
| nginx read/send     |                 1250 s |
| Serve               |          2 CPU / 4 GiB |
| MCP                 |      0.5 CPU / 512 MiB |

OCR and table structure are enabled, image scale is 2.0, and local fallback is
disabled. MCP 3.0.0 does not forward the Serve OCR preset/language fields, so
the thin runtime wrapper supplies `ocr_preset=easyocr` and
`ocr_lang=[ru,en]`. Both EasyOCR language models are downloaded while building
the Serve image. `force_ocr` remains disabled so PDFs with an existing text
layer are not needlessly rasterized.

The defaults can be overridden before building/running the MCP image:

```dotenv
DOCLING_MCP_OCR_PRESET=easyocr
DOCLING_MCP_OCR_LANG=ru,en
```

## Structure-aware chunking

Chunk boundaries can come from Docling's own document structure instead of a
Markdown text splitter. The strategy is configuration:

```dotenv
# legacy_markdown | docling_hierarchical | docling_hybrid
DOCLING_CHUNK_STRATEGY=legacy_markdown
DOCLING_SERVE_URL=http://docling-serve:5001
```

`legacy_markdown` is the production default and reproduces the current payload
exactly. The native strategies post the ALREADY CONVERTED DoclingDocument JSON
back to `POST /v1/chunk/{hierarchical|hybrid}/source` with
`from_formats: [json_docling]`, so no source is converted twice and the chunks
resolve against the accepted document by construction. `/mcp` stays the
conversion boundary; Serve is reached only by the internal typed adapter in
`docling/serve-chunker.ts` and stays unpublished.

Hybrid chunking sizes chunks with `sentence-transformers/all-MiniLM-L6-v2`,
which is baked into the Serve image, so it needs no runtime model download. Our
own token counts, and the parent/child budgets, remain tiktoken-based, and the
native count is preserved separately as `native_token_count`.

Native chunks add optional Qdrant payload keys — `source_refs`,
`provenance_page_numbers`, `provenance_bboxes` (with `coordOrigin`, page width
and height), `provenance_labels`, `native_token_count` — and keep every existing
key. Points written before this change simply do not carry them; nothing is
migrated or reindexed. A native result whose refs do not resolve against the
document fails before upload rather than degrading into unrelated chunks.

## PDF heading-level inference

Off by default. Enable on BOTH services, because each closes a different gap:

```dotenv
DOCLING_MCP_PDF_HEADING_HIERARCHY=true    # MCP asks for it
DOCLING_SERVE_PDF_HEADING_HIERARCHY=true  # optional service-wide default
```

Two upstream gaps are worked around by thin runtime wrappers, both measured on
this pinned stack on 2026-08-05 and both removable when upstream closes them:

- `docling_jobkit`'s `_parse_standard_pdf_opts` builds `PdfPipelineOptions`
  field by field and never assigns `heading_hierarchy_options`, so Serve accepts
  `do_pdf_heading_hierarchy` and silently drops it.
  `docker/docling-serve/runtime.py` passes it through; its build-time test
  asserts the upstream gap red first.
- `docling_mcp.docling_cache.get_cache_key` hashes only the source string and
  the OCR flags, so two conversions of the same source with different pipeline
  options share a cache entry. `docker/docling-mcp/runtime.py` folds the
  conversion profile into the key. Changing any profile field is a cache miss
  and a reconversion, never a stale artifact.

Measured effect on `numbered-sections.pdf`: without inference the Markdown has
one distinct heading level (`##` only); with it, two (`##` and `###`), and
`1.1./1.2.` become level-2 section headers.

## Rollout gate

Ordinary application deploys leave the existing MCP runtime untouched while
`DOCLING_STACK_V2_ENABLED=false`. Before enabling it, configure immutable
digest references:

```dotenv
DOCLING_MCP_IMAGE=ghcr.io/.../docling-mcp@sha256:<digest>
DOCLING_SERVE_IMAGE=ghcr.io/.../docling-serve@sha256:<digest>
DOCLING_ROLLBACK_IMAGE=ghcr.io/.../old-docling-mcp@sha256:<digest>
DOCLING_STACK_V2_ENABLED=true
```

The deploy gate fails closed on every invalid digest, image pull/inspect error,
or rollback-identity mismatch. It verifies that `DOCLING_ROLLBACK_IMAGE` is
byte-identical to the currently running MCP image before starting Serve/MCP 3.
After startup it opens a real MCP session, lists tools, and verifies the
required tool set. A failed facade/tool check restores the recorded MCP 1.x
image and stops Serve. A production switch still requires separate deploy
approval.

## Verification

```bash
docker compose -f packages/course-gen-platform/docker/docling-mcp/docker-compose.yml up -d
DOCLING_SERVE_URL=http://127.0.0.1:5001 \
  pnpm --filter @megacampus/course-gen-platform exec tsx \
  scripts/docling-quality-benchmark.ts --label candidate \
  --conversion-profile baseline --candidate none
```

Benchmark outputs live under `.tmp/docling-benchmark/` and include Markdown,
raw JSON, normalized JSON, per-strategy chunk dumps, metrics and the report. A
non-zero benchmark result blocks the production flag even when the
infrastructure smoke is green.

`--conversion-profile` selects which heading-hierarchy expectation applies and
must match the MCP container's `DOCLING_MCP_PDF_HEADING_HIERARCHY`.
`--candidate` names the strategy proposed as the default; its retrieval
regressions BLOCK. Other strategies are still measured and reported as
observations. `--candidate none` proposes nothing and blocks nothing — the
honest setting while no strategy has earned the default, and not a way to
silence a red gate for a strategy one still intends to ship.

Heading assertions check the set of DISTINCT heading levels, not the deepest
`#` count. The old `minimumHeadingDepth` rule let a document whose only headings
were `##` prove a two-level hierarchy, and a scientific PDF passed the corpus on
exactly that false positive.

`--dense` additionally runs the PRODUCTION retrieval path: one
`generateEmbeddingsWithLateChunking(chunks, 'retrieval.passage', true)` call
over every chunk — literally the call `phase-5-embedding.ts` makes — upserted
into a throwaway Qdrant collection built from `COLLECTION_CREATE_PARAMS` **and**
`PAYLOAD_INDEXES`, queried through `searchChunks({enable_hybrid: true})`. Both
are required — without the payload indexes, strict mode rejects the filtered
query and hybrid search silently degrades to dense-only; the harness fails
instead of scoring that. It calls a paid API and needs `JINA_API_KEY`, so it is
off by default. It never writes to the document catalog and always drops its
collection.

The embedding cache is namespaced per run (`EMBEDDING_CACHE_NAMESPACE`, default
`embedding-bench:<label>`), so a benchmark never reads or writes production
vectors. A fresh label is a cold cache and its billed-token count is the real
cost of the measurement; re-running the same label reuses exactly the vectors
that label produced.

Jina meters TOKENS per minute, and the corpus fills that window. A 429 is
retried by waiting the window out (`Retry-After` when the provider sends it),
so a rate-limited run stalls instead of failing — which is also what production
now does, where a fatal 429 used to lose a whole document's embedding job.

When `--dense` runs it is the BLOCKING channel and the offline BM25 proxy
becomes an observation: gating on pure BM25 while the real ranker is measured
would gate on a configuration nobody runs. Both are always printed, including
where they disagree.

Everything gated is counted over EVIDENCE ATOMS — the facts the manifest
declares for a question — and never over chunks. A control question regresses on
ANY drop in atom coverage, `aMRR` (`1/rank`) or `aDCG` (`1/log2(rank+1)`)
against `legacy_markdown`; the 1e-9 epsilon covers float representation only and
must not be widened into a "too small to matter" allowance. A control question
that disappears from a run is itself a regression. The comparator lives in
`src/shared/embeddings/retrieval-metrics.ts` (`detectRetrievalRegressions`) and
is unit-tested there, rather than inline in this script where nothing could
reach it.

Chunk-level Recall@5, MRR and nDCG@5 are printed and NOT gated, because both
halves of each depend on the strategy under test. Dividing by `relevantTotal`
penalises a finer cut; counting `relevantInTopK` rewards one, since five
fragments repeating one answer score five times the chunk that carries it whole.
The atom denominator is declared before any run and is identical for every
strategy, so coverage is comparable and duplication is worth nothing. An atom no
chunk carries — a fact split across a boundary — is listed in `unreachableAtoms`
and lowers coverage at the same time.

Every scored top-5 is written to `metrics.json` as
`strategies[].retrieval.questions[].rankedChunkIds`, with per-atom ranks beside
it, so a claim like "the same chunks in the same order" is checkable rather than
remembered.

`--conversion-profile`, `--strategies` and `--candidate` are validated against
their allowed sets and exit 2 on anything else. A typo used to be silent: a
misspelled candidate matched no strategy, so the blocking assertion was never
emitted and the run went green exactly as `--candidate none` does.

Without `--dense`, retrieval numbers are the lexical half of production
retrieval: BM25 with the collection's own parameters, offline. Dense Jina v3
ranking is not exercised, so a win reported there is a lexical-reachability win,
not a full retrieval win.

Accepted Stage A evidence lives in
`.codex/stages/mc2-1sobq.1/evidence/stageA-{baseline,heading-inference}-*`: 7/7
cases in both conversion profiles with `--candidate docling_hybrid --dense`.
**`docling_hybrid` is the selected candidate.** On the baseline profile — the
configuration production runs — it regresses no control question and takes
`sci-accuracy-drop` from unanswerable (legacy retrieves neither declared fact)
to both facts at rank 3. With PDF heading inference on it regresses nothing but
wins nothing, so the improvement is specific to the default profile.
`docling_hierarchical` is rejected on the same evidence.

An earlier `docling_hybrid` selection was withdrawn before this one: that run
split parents and children into two embedding calls with different
`late_chunking` flags, and its vectors came entirely from a cache keyed without
`late_chunking` or batch context, so it did not measure the production ranker.

Selection is not activation. `DOCLING_CHUNK_STRATEGY` defaults to
`legacy_markdown` everywhere except dev compose; flipping it is Stage E work
under separate authorization. The corpus is a release gate, not authorization to
enable the production flag.

## Selective enrichments (Stage B)

Advanced enrichments run in a SEPARATE Serve image, `mc2/docling-serve-advanced`,
behind compose `--profile advanced` on loopback 5002. The baseline 4 GiB service
is untouched and starts exactly as before. Measured 2026-08-06: baseline peaked
1.82 GiB, advanced 4.34 GiB of 12 GiB, zero restarts on either side; the
advanced pass costs 134s against 4s for baseline on the same small PDF.

Model set, named explicitly and asserted at build time by `test_models.py`:

| capability             | model                                           | where              |
| ---------------------- | ----------------------------------------------- | ------------------ |
| picture classification | `docling-project/DocumentFigureClassifier-v2.5` | baseline image     |
| code, formula          | `docling-project/CodeFormulaV2`                 | advanced image     |
| chart extraction       | `ibm-granite/granite-vision-4.1-4b`             | advanced image     |
| picture description    | `HuggingFaceTB/SmolVLM-256M-Instruct`           | advanced, REJECTED |

Chart extraction uses the V4 checkpoint because this Serve build hardcodes
`ChartExtractionModelGraniteVisionV4` and exposes no preset registry for chart
models. Shipping only the smaller 3.3-2b `chart2csv` model made the service log
"Model artifacts not found … they will be downloaded" mid-request despite
`DOCLING_SERVE_ARTIFACTS_PATH`.

**The router is three-tiered.** Baseline conversion through `/mcp` stays the
accepted artifact. Then a CHEAP classification pass on the BASELINE service,
whose classifier is already in that image, turns "this document has a picture"
into "this picture is a bar chart at 0.9997". Only then does the advanced
service run, and only for capabilities a concrete item asks for: a code block
whose language is `unknown`, a formula region that came back empty, a
chart-classified picture with no source-declared series. A PPTX asks for
nothing — it declares its series in embedded chart XML and the baseline
conversion already returns them.

The advanced result never replaces the accepted document. `mergeEnrichment`
copies enrichment metadata by Docling `self_ref` only, never overwrites text the
baseline already read, and drops anything the accepted document does not
contain, so a failed or shifted advanced pass cannot corrupt what the pipeline
committed to.

**A missing model fails closed and misreports why.** Serve answers `HTTP 404
{"detail": "Task result not found. Please wait for a completion status."}` in
about two seconds and puts the real cause in its own log. The enrichment adapter
therefore names the capability set and profile in its error rather than
repeating a message that misdirects.

**Two tiers of assertion.** An INVENTED value is blocking: a chart number absent
from the ground truth, or a formula symbol the source never contained. A MISSED
value is recorded with the exact delta and does not block. The control fixture
draws `4ac` and the model reads `4a`; that is printed as
`enrichment-formula-exact` with both strings, while the fabrication check stays
green and blocking. Keeping the tiers apart is what stops the gate from being
relaxed to whatever the current model happens to produce.

**`picture_description` is rejected, not deferred.** `SmolVLM-256M` described a
chart labelled Альфа/Бета/Гамма as "Bemma"/"BeTa"/"Rammma" under an invented
title. FR-014 makes invented labels blocking, so the capability sits in
`REJECTED_CAPABILITIES` and the router refuses it unless a caller explicitly
passes `allowRejected`. The model stays in the image so Stage D can measure a
larger VLM against the same fixture.

Cache identity carries all of this: `resolveConversionProfile` folds the applied
capabilities and their exact models into the string that chunk ids and cache
keys are built from, so `baseline+enrich[code,formula]@docling-project/CodeFormulaV2`
can never be answered from a `baseline` entry.
