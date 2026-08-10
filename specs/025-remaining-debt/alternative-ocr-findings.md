# Alternative OCR findings — oversized outlined Russian PDFs

Date: 2026-08-10. Beads: `mc2-3gz2m.1`, `mc2-3gz2m.2`, `mc2-3gz2m.3`. Raw OCR text, model caches and the
representative document remain ignored local-only data; this file contains only
sanitized aggregate evidence.

## Decision

No tested local CPU path clears the fixed quality, page-time and memory gates.
Do not add an OCR fallback from this experiment. Keep the existing actionable
`EmptyConversionError` and leave the parent capability `mc2-3gz2m` open for an
owner choice among a larger/GPU VLM host, managed paid OCR, or an editable-
source/text-layer requirement.

## Fixed evidence boundary

- PDF SHA-256: `4cea85f009d8e065fe15f73e7a4b46577a42ca4b1c2e8e2d5084845acda34ff8`.
- Ground-truth SHA-256: `6a0cd8aab8819a35a7e60306d38c314a9e719ce6b290b3e9ee4754c4afecbb16`.
- 36 labelled regions, including 16 `small-body` labels.
- Quality pass: recall at similarity 0.8 at least 95%, mean similarity at least
  0.90, and at least 15/16 small-body labels.
- Resource pass: less than 180 seconds per page, candidate RSS below 2.8 GiB,
  projected complete service below 4 GiB.
- Jobs ran sequentially with four CPUs, a 2.8-GiB memory/no-swap cap and a
  180-second page limit.

## Results

| Candidate                                                                            | Evidence                   |                                               Recall | Mean similarity |  Small labels | Wall / RSS                                        | Result              |
| ------------------------------------------------------------------------------------ | -------------------------- | ---------------------------------------------------: | --------------: | ------------: | ------------------------------------------------- | ------------------- |
| EasyOCR 1.7.2 baseline, RGB/greedy                                                   | 36 direct crops            |                                         1/36 (2.78%) |          0.3551 |          0/16 | 41.36 s / 1,408,856 KiB                           | reject quality      |
| EasyOCR 1.7.2, autocontrast/greedy                                                   | 36 direct crops            |                                         1/36 (2.78%) |          0.3511 |          0/16 | 50.35 s / 1,233,252 KiB                           | reject quality      |
| EasyOCR 1.7.2, Otsu/greedy                                                           | 36 direct crops            |                                                 0/36 |          0.2455 |          0/16 | 42.42 s / 1,228,176 KiB                           | reject quality      |
| EasyOCR 1.7.2, autocontrast/beamsearch with relaxed detector thresholds              | 36 direct crops            |                                                 0/36 |          0.3395 |          0/16 | 50.13 s / 1,234,240 KiB                           | reject quality      |
| PaddleOCR 3.7.0 / PaddlePaddle 3.3.0, PP-OCRv5 mobile detector + Cyrillic recognizer | 36 direct crops            |                                       19/36 (52.78%) |          0.6528 | 10/16 (62.5%) | 66.11 s / 746,804 KiB                             | reject quality      |
| Surya OCR 0.17.0 classic                                                             | bounded model-load probe   |                                           not scored |      not scored |    not scored | exited 137 inside 2.8-GiB cap                     | reject memory       |
| PaddleOCR-VL 1.6, revision `c5630abae1d940eafe0697512a0325494b02ab42`                | one crop, then one 1x page | crop contained the expected heading; page not scored |      not scored |    not scored | crop 65.38 s / 2,177,528 KiB; page exceeded 180 s | reject page latency |
| Docling 2.118.0 / RapidOCR 3.9.2, PP-OCRv5 Cyrillic, ONNX, `FULL_PAGE`, scale 3.0    | complete 1x page           |                                                 0/36 |          0.0289 |          0/16 | 87.78 s / 2,719,920 KiB; cgroup peak 3.50 GiB     | reject quality      |
| EasyOCR 1.7.2, sequential 768-pt direct clips, 20% overlap, scale 3, canvas 4096     | bounded full-page attempt  |                                           not scored |      not scored |    not scored | OOM before tile 1 at 6-GiB no-swap hard limit     | reject memory       |

PaddleOCR initially hit a oneDNN conversion failure; setting the documented
`enable_mkldnn=False` CPU option made the fixed model configuration runnable.
Surya 0.17.0 also required `requests==2.34.2` and
`transformers==4.56.1` because its published dependency set otherwise installed
an incompatible Transformers 5.x runtime. Those compatibility repairs did not
change the unchanged resource gate.

The final built-in Docling check used the repository's exact Docling Serve
1.30.0 image, Docling Slim 2.118.0, Docling Core 2.90.0 and the official
`cyrillic_PP-OCRv5_rec_mobile` checkpoint. It finished with only 14 output
characters and zero Cyrillic characters. A 2.8-GiB whole-container run was OOM
killed after 89 seconds; the decisive run used the repository's 4-GiB service
limit and peaked at 3,759,906,816 cgroup bytes while the Python process stayed
below the separate 2.8-GiB RSS gate. It therefore passed the fixed time and
memory gates and failed only recognition quality.

The owner-authorized final tiling check used `pypdfium2 5.12.1` direct page
crops and released each copied tile before rendering the next. It ran in the
exact current Docling image with four CPUs, networking disabled, no swap, a
6-GiB hard limit and a 190-second wall limit. EasyOCR was OOM-killed during
initialization before the first tile (`exit 137`, Docker
`State.OOMKilled=true`). Because the run exceeded the complete service's
4-GiB gate before recognition began, a lower-quality/downscaled rerun cannot
qualify the proposed high-resolution fallback and was not used to manufacture
a passing number.

## Reproduction

The runners print JSON containing per-label text, so redirect output only to
ignored local storage. Prepare the same pinned package/model environments, then
run:

```bash
python scripts/benchmarks/outlined_pdf_ocr_ab.py \
  .tmp/mc2-3gz2m/representative.pdf \
  .tmp/mc2-3gz2m/ground-truth.json \
  --mode full --preprocess autocontrast --decoder greedy

python scripts/benchmarks/outlined_pdf_paddleocr.py \
  .tmp/mc2-3gz2m/representative.pdf \
  .tmp/mc2-3gz2m/ground-truth.json

python scripts/benchmarks/outlined_pdf_surya.py \
  .tmp/mc2-3gz2m/representative.pdf \
  .tmp/mc2-3gz2m/ground-truth.json --limit-labels 1

python scripts/benchmarks/outlined_pdf_docling_rapidocr.py \
  .tmp/mc2-3gz2m/representative.pdf \
  .tmp/mc2-3gz2m/ground-truth.json \
  --scale 3.0 \
  --output .tmp/mc2-3gz2m/rapidocr-docling-full-page.json

python scripts/benchmarks/outlined_pdf_tiled_easyocr.py \
  .tmp/mc2-3gz2m/representative.pdf \
  .tmp/mc2-3gz2m/ground-truth.json \
  --tile-height 768 --overlap 0.2 --render-scale 3 --canvas-size 4096 \
  --output .tmp/mc2-3gz2m/tiled-easyocr-768-20.json
```

Apply the host envelope outside the runner (container/cgroup): four CPUs,
2.8 GiB memory, no swap and a 180-second whole-page timeout. Download model
weights first, then disable network during scoring. Verify the tools themselves
without proprietary inputs with:

```bash
python3 -m py_compile \
  scripts/benchmarks/outlined_pdf_ocr_ab.py \
  scripts/benchmarks/outlined_pdf_paddleocr.py \
  scripts/benchmarks/outlined_pdf_surya.py \
  scripts/benchmarks/outlined_pdf_docling_rapidocr.py \
  scripts/benchmarks/outlined_pdf_tiled_easyocr.py \
  scripts/benchmarks/test_outlined_pdf_tiled_easyocr.py

python3 -m unittest discover -s scripts/benchmarks \
  -p 'test_outlined_pdf_tiled_easyocr.py'
```
