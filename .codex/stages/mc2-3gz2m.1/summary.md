# Stage `mc2-3gz2m.1` — alternative outlined-Russian OCR

Status: accepted by measured rejection. Acceptance owner: root.

## Boundary

Compare EasyOCR preprocessing, PaddleOCR 3.7.0, Surya OCR 0.17.0 classic and a
resource-gated PaddleOCR-VL 1.6 path on the same 36-label local corpus. Implement
a Stage 2 adapter only after both crop-level quality and whole-page behavior pass
the unchanged quality, time, memory and fail-closed gates.

## Routing

- Classification: root-owned `slice_acceptance`.
- Sequential execution: model loads share the same constrained local host;
  parallelism would invalidate RSS evidence and increase overload risk.
- Documentation: `docs-resolve` attempted L1 for every candidate; first-party
  fallback is required for the missing/insufficient sections.
- Graphify: used for the benchmark and Stage 2 OCR assertion boundaries.
- Product code remains out of scope until a model passes the benchmark.

## Outcome

- Reopened parent capability `mc2-3gz2m`; its accepted EasyOCR evidence remains
  immutable.
- Created and claimed child Bead `mc2-3gz2m.1`.
- Restored the ignored local corpus and verified both stored SHA-256 values.
- Host preflight found 16.3 GiB available RAM, but 100% swap use and high MCP
  and browser process pressure. Heavyweight runs remain preflight-gated.
- EasyOCR preprocessing peaked at 1/36 recovered labels and 0/16 small labels.
- PaddleOCR recovered 19/36 labels, mean similarity 0.6528 and 10/16 small
  labels in 66.11 seconds with 746,804 KiB RSS. It is the best classic result,
  but fails the unchanged quality gate.
- Surya classic exited 137 while loading inside the 2.8-GiB hard limit, before
  an inference could be scored.
- PaddleOCR-VL 1.6 loaded and recognized one crop at 2,177,528 KiB RSS, but its
  complete 1x page exceeded the 180-second page limit.
- No product adapter was added. The parent capability `mc2-3gz2m` stays open;
  sanitized evidence is in `specs/025-remaining-debt/alternative-ocr-findings.md`.

## Acceptance intent

The canonical stage-close tool compiled the three benchmark modules, passed
`pnpm type-check`, passed `pnpm build`, and passed repository process
verification. The measurement proves this experiment is complete; it does not
claim the product can now read this document family.

docs-reviewed: updated — exact package versions, language support and resource
controls are recorded in the plan and sanitized findings.

graph-reviewed: used — focused queries located the standalone benchmark and the
Stage 2 OCR scorer/assertion boundary; no refresh is needed because product code
and architecture are unchanged.

project-index: reviewed-no-change — benchmark entrypoints are task-local and do
not change a stable runtime, ownership or navigation boundary.
