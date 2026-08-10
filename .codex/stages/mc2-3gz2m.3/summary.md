# Stage `mc2-3gz2m.3` — sequential tiled EasyOCR measurement

Status: accepted by measured rejection. Acceptance owner: root.

## Boundary

Run one full 768-pt, 20%-overlap, scale-3, 4096-canvas sequential direct-clip
EasyOCR profile on the unchanged 36-label representative PDF. The run is local,
network-disabled, capped at four CPUs, 6 GiB without swap, and 190 seconds.

The owner explicitly authorized this bounded experiment after the earlier
direct-crop stop rule was reported. Product admission gates and all forbidden
live/schema actions remain unchanged.

## Acceptance intent

Ship no product fallback unless every existing quality, time and memory gate
passes. An OOM, timeout or quality miss is an accepted measured rejection and
leaves `EmptyConversionError` unchanged.

## Outcome

- `pypdfium2 5.12.1` official source confirms direct crop coordinates are
  `(left, bottom, right, top)` canvas-unit cutoffs. The runner copies PIL data
  before closing each bitmap and releases each tile before rendering the next.
- The fixed corpus hashes remain `4cea85f0…34ff8` (PDF) and
  `6a0cd8aa…bb16` (36-label ground truth).
- The exact current Docling image was OOM-killed before its first tile at the
  6-GiB no-swap container limit (`exit 137`, `OOMKilled=true`). That already
  exceeds both the 2.8-GiB fallback and 4-GiB complete-service gates, so no
  product adapter is admissible.
- Pure tile-geometry tests, Python compilation, `pnpm type-check` and
  `pnpm build` pass. The build emitted only the known `DEP0169` warning tracked
  by `mc2-p2908.1`.
- Cleanup removed the exact ignored 5.2-GiB OCR corpus/results/model directory
  and both disposable RapidOCR probe image tags. The shared Docling image and
  unrelated Docker state were preserved.

docs-reviewed: used — exact pypdfium2 5.12.1 tagged implementation plus the
installed source define crop coordinates and bitmap lifetime.

graph-reviewed: used — focused graph navigation located the existing Stage 2
fail-closed boundary; product code remains unchanged.
