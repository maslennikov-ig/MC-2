# Alternative OCR findings — oversized outlined Russian PDFs

Date: 2026-08-10. Bead: `mc2-3gz2m.1`. Raw OCR text, model caches and the
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

PaddleOCR initially hit a oneDNN conversion failure; setting the documented
`enable_mkldnn=False` CPU option made the fixed model configuration runnable.
Surya 0.17.0 also required `requests==2.34.2` and
`transformers==4.56.1` because its published dependency set otherwise installed
an incompatible Transformers 5.x runtime. Those compatibility repairs did not
change the unchanged resource gate.

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
```

Apply the host envelope outside the runner (container/cgroup): four CPUs,
2.8 GiB memory, no swap and a 180-second whole-page timeout. Download model
weights first, then disable network during scoring. Verify the tools themselves
without proprietary inputs with:

```bash
python3 -m py_compile \
  scripts/benchmarks/outlined_pdf_ocr_ab.py \
  scripts/benchmarks/outlined_pdf_paddleocr.py \
  scripts/benchmarks/outlined_pdf_surya.py
```
