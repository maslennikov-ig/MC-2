# Docling MCP 3 runtime

MegaCampus runs document conversion as two independently versioned services:

```text
workers -> nginx :8000/mcp -> Docling MCP 3.1.0 -> Docling Serve 1.29.0
                                                    Docling 2.118.0
                                                    Core 2.90.0
```

The MCP image is a thin remote client. It contains no conversion models and
never falls back to local conversion. Serve contains the CPU models downloaded
after the Docling upgrade.

## Local run

From the repository root:

```bash
docker compose up -d docling-serve docling-mcp-internal docling-mcp
curl --fail http://127.0.0.1:8000/health
```

The shared cache is `.tmp/docling-cache/` on the host and
`/app/docling-json-cache` in MCP/backend containers.

## Exact versions

- `docling-mcp==3.1.0`
- `mcp[cli]==2.0.0`
- `docling-slim[service-client]==2.118.0`
- `docling-core==2.90.0`

`requirements.lock` is hash-locked. The small `runtime.py` wrapper maps the
timeout/retry settings declared by Docling MCP into `DoclingServiceClient`;
3.1.0 still declares but does not consume them — its remote converter builds the
client from `url` and `api_key` alone, checked against the installed package
rather than against a changelog. The same wrapper supplies `easyocr` with
`ru,en`, because upstream omits the OCR preset and language when it builds the
Serve request. The Serve image downloads both language models during its build.
Keep `force_ocr` off unless a future quality corpus demonstrates that it is
needed.

**Most of the cache-key wrapper is gone as of 3.1.0.** Until then
`get_cache_key` hashed only the source string and the OCR flags, so two
conversions of one file under different pipeline options shared a cache entry
and the second was served the first one's artifact; `runtime.py` folded a
fingerprint of seven environment variables into the key to close it. 3.1.0 does
more than that fingerprint did — a local file is keyed by its content digest
rather than its path, every setting in its own model enters the key except an
explicit list of ones that cannot change output, and the installed package
versions are stamped in.

What it cannot cover is the three options `runtime.py` injects. Measured at
build time against 3.1.0, `remote_conversion_context()["options"]` is exactly
`service_url`, `keep_images`, `images_scale`, `do_ocr` and `do_table_structure`:
`ocr_preset`, `ocr_lang` and `do_pdf_heading_hierarchy` are absent because they
are not docling-mcp settings at all, so nothing upstream can know a conversion
used them. Flipping `DOCLING_MCP_PDF_HEADING_HIERARCHY` would leave the key
unchanged and serve the artifact produced without it. The wrapper therefore
keeps exactly those three and hands the rest to upstream. `test_runtime.py`
asserts both halves at build time and fails the image if either moves — it is
what caught the first attempt at this, which deleted the wrapper entirely.

The bump invalidates the existing conversion cache once, because the installed
package versions are part of the upstream key.

## Quality benchmark

```bash
pnpm --filter @megacampus/course-gen-platform benchmark:docling -- \
  --label candidate
```

Artifacts are written to `.tmp/docling-benchmark/<label>/`. Add
`--baseline <directory>` to create a before/after report.

The accepted local candidate is `new-2.118-quality-fixed`: all five controlled
documents pass. Its tracked DOCX source uses one real multilevel numbering
definition; changing styles without preserving `numId`/`ilvl` would invalidate
the nesting assertion rather than expose a Docling regression.

Production images are built only by the manual
`build-docling-images.yml` workflow. It publishes versioned tags; deployment
uses the recorded `image@sha256` references, never a mutable tag.
