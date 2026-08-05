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
  --conversion-profile baseline --candidate docling_hybrid
```

Benchmark outputs live under `.tmp/docling-benchmark/` and include Markdown,
raw JSON, normalized JSON, per-strategy chunk dumps, metrics and the report. A
non-zero benchmark result blocks the production flag even when the
infrastructure smoke is green.

`--conversion-profile` selects which heading-hierarchy expectation applies and
must match the MCP container's `DOCLING_MCP_PDF_HEADING_HIERARCHY`.
`--candidate` names the strategy whose retrieval regressions BLOCK; the other
strategies are still measured and reported as observations.

Heading assertions check the set of DISTINCT heading levels, not the deepest
`#` count. The old `minimumHeadingDepth` rule let a document whose only headings
were `##` prove a two-level hierarchy, and a scientific PDF passed the corpus on
exactly that false positive.

Retrieval numbers are the lexical half of production retrieval: BM25 with the
collection's own parameters, offline. Dense Jina v3 ranking is not exercised, so
a win reported here is a lexical-reachability win, not a full retrieval win.

The accepted Stage A candidates are
`.tmp/docling-benchmark/stageA-baseline/report.md` and
`.tmp/docling-benchmark/stageA-heading-inference/report.md`: 7/7 cases pass in
both profiles. The corpus is a release gate, not authorization to enable the
production flag.
