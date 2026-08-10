# Research findings — oversized outlined PDF diagrams

Decision date: 2026-08-10. Bead: `mc2-3gz2m`.

## Evidence boundary

Two owner-supplied deep-research reports were reviewed before the experiment:

- Deep Research report, SHA-256
  `fbf383d6d688c4db36f3518d364c2a0b87c1953cc80b3d0ff9349c5b91f609e3`;
- Compass report, SHA-256
  `8143c65ab7e78fa1ed889b4e969416e6797ada180908d30481cc898e350b500a`.

Both reports identified the same falsifiable hypothesis: Docling renders OCR at
scale 3, but EasyOCR's default `canvas_size=2560` reduces the 12,888-pixel long
edge of this 4,296-point page by a factor of 0.1986. Direct high-resolution
crops should therefore outperform otherwise identical reduced crops. The
reports did not contain measured quality for this outlined Russian font, so the
hypothesis was not treated as an implementation decision.

The installed runtime, not a floating latest version, was measured first:

- image `helixa/docling-serve:1.30.0`;
- `easyocr==1.7.2`;
- `pypdfium2==5.12.1`;
- `docling-slim==2.118.0`;
- PyMuPDF is absent.

Version-routed L1 documentation was unavailable. The fallback review used the
EasyOCR `readtext`/`detect` contract (`canvas_size=2560`, `mag_ratio=1`), the
pypdfium2 direct-clip `PdfPage.render(scale, crop=...)` contract and Docling's
OCR-mode/plugin documentation. Those notes were then persisted into the local
documentation cache for the exact installed versions.

## Pre-registered experiment

One representative production-family input was copied read-only to ignored
local storage. It is one page, 1,215 × 4,296 pt, contains outlined Russian text
and has SHA-256
`4cea85f009d8e065fe15f73e7a4b46577a42ca4b1c2e8e2d5084845acda34ff8`.
The PDF and its manually transcribed sales text are deliberately not committed.

The ground truth contains 36 labels: 10 script headings, 10 short script labels
and 16 small body-text labels. Each bounding box was rendered directly at scale
3 (216 DPI), then the identical crop was reduced linearly by 0.1986. Both were
read by the pinned EasyOCR `ru,en` model. The final scores were independently
recomputed with the repository's
`packages/course-gen-platform/src/stages/stage2-document-processing/docling/ocr-assertions.ts`.

The gate selected before the run was:

- label recall at least 95%;
- mean character similarity at least 0.90;
- no systematic loss of the smallest text class;
- less than 180 seconds per page;
- fallback RSS below 2.8 GiB and complete service below 4 GiB.

## Results

| Metric                              | Full-resolution crops | 0.1986 control |               Gate |
| ----------------------------------- | --------------------: | -------------: | -----------------: |
| Labels                              |                    36 |             36 |              30–50 |
| Recall at character similarity ≥0.8 |          1/36 (2.78%) |   1/36 (2.78%) |               ≥95% |
| Mean character similarity           |                0.3551 |         0.1181 |              ≥0.90 |
| Small-body recall                   |                  0/16 |           0/16 | no systematic loss |
| Wall time                           |               41.36 s |         3.53 s |             <180 s |
| Process max RSS                     |         1,408,856 KiB |    905,560 KiB |           <2.8 GiB |

Full-resolution crops were better on 31 of 36 labels and improved mean
similarity by 0.2370. This confirms that the full-page reduction is harmful.
It does **not** establish scale as a sufficient fix: the only label at or above
0.8 was `Найм`, while representative headings remained materially corrupted
and every small-body label failed.

A separate 768 × 768 pt whole-tile probe took 14.97 seconds for OCR and reached
5,025,356 KiB max RSS in a one-shot process that loaded its own model. That
measurement is not an in-process incremental-memory estimate for Docling Serve,
but it is enough to reject a separate duplicate-model fallback under the 4-GiB
service limit.

## Decision

The crop gate failed before tiling. Per the pre-registered plan, the 512/768/1024
pt tiling sweep, vector-region heuristics and product adapter were not built.
Tiling can change which pixels reach the detector, but cannot repair the measured
recognition failure of this outlined Russian font. Shipping it would turn a
clear failed document into unreliable content and would reintroduce the silent
success that `EmptyConversionError` prevents.

The accepted outcome is therefore to keep the existing actionable rejection.
A future attempt needs a different recognition capability and a new owner-approved
stage; it must rerun this same corpus and pass the same quality/memory gates.
A VLM, glyph matching, a new resident service, a larger host or a live retry was
not authorized or performed.

## Recheck

With an authorized local PDF and a 30–50-label JSON file in the documented
schema, run both commands from the repository root and compare the aggregate
fields. Keep the generated JSON outside git because it contains OCR output.

```bash
docker run --rm --network none --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$PWD:/repo:ro" -v "$INPUT_DIRECTORY:/input:ro" \
  helixa/docling-serve:1.30.0 \
  python /repo/scripts/benchmarks/outlined_pdf_ocr_ab.py \
  /input/source.pdf /input/ground-truth.json --mode full

docker run --rm --network none --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$PWD:/repo:ro" -v "$INPUT_DIRECTORY:/input:ro" \
  helixa/docling-serve:1.30.0 \
  python /repo/scripts/benchmarks/outlined_pdf_ocr_ab.py \
  /input/source.pdf /input/ground-truth.json --mode downscaled
```
