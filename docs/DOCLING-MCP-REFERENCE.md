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
docker compose config --quiet
docker compose up -d docling-serve docling-mcp-internal docling-mcp
pnpm --filter @megacampus/course-gen-platform benchmark:docling -- --label candidate
```

Benchmark outputs live under `.tmp/docling-benchmark/` and include Markdown,
raw JSON, normalized JSON, metrics, and the comparison report. A non-zero
benchmark result blocks the production flag even when the infrastructure smoke
is green.

The accepted local candidate is
`.tmp/docling-benchmark/new-2.118-quality-fixed/report.md`: all five cases pass,
including the Russian OCR phrases/table, semantic DOCX nesting and the
controlled empty-document failure. Serve peaked at 1.947 GiB of its 4 GiB
limit and had zero restarts. The corpus is a release gate, not authorization to
enable the production flag.
