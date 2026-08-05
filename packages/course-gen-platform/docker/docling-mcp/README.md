# Docling MCP 3 runtime

MegaCampus runs document conversion as two independently versioned services:

```text
workers -> nginx :8000/mcp -> Docling MCP 3.0.0 -> Docling Serve 1.29.0
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

- `docling-mcp==3.0.0`
- `mcp[cli]==2.0.0`
- `docling-slim[service-client]==2.118.0`
- `docling-core==2.90.0`

`requirements.lock` is hash-locked. The small `runtime.py` wrapper maps the
timeout/retry settings declared by Docling MCP 3.0.0 into
`DoclingServiceClient`; upstream 3.0.0 declares but does not consume them. The
same compatibility wrapper supplies `easyocr` with `ru,en`, because upstream
3.0.0 also omits the OCR preset/language when it builds the Serve request. The
Serve image downloads both language models during its build. Keep `force_ocr`
off unless a future quality corpus demonstrates that it is needed.

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
