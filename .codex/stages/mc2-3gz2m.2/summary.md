# Stage `mc2-3gz2m.2` — Docling-native RapidOCR measurement

Status: accepted by measured rejection. Acceptance owner: root.

## Boundary

Run Docling 2.118.0 with RapidOCR 3.9.2, PP-OCRv5 Cyrillic recognition,
`FULL_PAGE` mode and scale 3.0 on the unchanged 36-label representative PDF.
The run is local, sequential, network-disabled and bounded to four CPUs,
2.8 GiB memory without swap, and 180 seconds.

## Acceptance intent

Add no product profile unless every existing quality, time and memory gate
passes. Otherwise close this child by measurement and leave `mc2-3gz2m` open.

## Outcome

- The exact current Docling Serve 1.30.0 image used Docling Slim 2.118.0,
  Docling Core 2.90.0, RapidOCR 3.9.2, ONNX Runtime and the official
  PP-OCRv5 Cyrillic recognizer.
- The 4-GiB bounded run finished in 87.78 seconds with 2,719,920 KiB maximum
  process RSS and a 3,759,906,816-byte cgroup peak.
- It returned 14 characters, none Cyrillic, and recovered 0/36 labels and 0/16
  small labels. Mean character similarity was 0.0289.
- The time and memory gates passed; the quality gate failed decisively. No
  product profile or runtime change was added, and parent `mc2-3gz2m` remains
  open.

docs-reviewed: used — official Docling 2.118.0 OCR options and GitHub issue
`docling-project/docling#1014` selected this final built-in candidate.

graph-reviewed: used — the prior accepted stage already located the standalone
benchmark and Stage 2 fail-closed boundary; product code remains unchanged.
