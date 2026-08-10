# Stage `mc2-3gz2m` — oversized outlined PDF extraction

Status: accepted as a measured rejection. Acceptance owner: root.

## Scope

Decide with a falsifiable local experiment whether the existing EasyOCR can read 4296-pt Russian
vector diagrams when the page is rendered in bounded regions, then implement only a path that
passes pre-registered quality, latency and memory gates. A measured failure is an accepted outcome:
the existing actionable rejection remains product behavior.

No reindex, production-file retry, paid model call, schema migration, new resident service, VLM,
glyph matching, deploy, merge or push is in scope.

## Routing

- Classification: complex, root-owned `slice_acceptance`; no child Beads or write streams because
  the experiment and contingent implementation share one rollback and proof boundary.
- Documentation: L1 was unavailable; Context7/first-party fallback covered EasyOCR 1.7.2,
  pypdfium2 5.12.1 and Docling 2.118.0, then the results were persisted locally.
- Knowledge Graph: used `GRAPH_REPORT.md` and a focused Stage 2/Docling/fallback query; source
  inspection remains authoritative because the broad symbol match was noisy.
- Skills: `orchestrator-stage`, `task-router`, `superpowers:writing-plans`,
  `superpowers:test-driven-development`, and `technical-premortem`.

## Technical premortem

Verdict: **GO WITH CONDITIONS**. Reversibility is high: keep the current fail-closed path and make
any new fallback opt-in until the container proof passes.

| Failure symptom | Evidence | Detection and mitigation | Disposition |
| --- | --- | --- | --- |
| Short OCR output is accepted as success again | Confirmed historical failure; the 50-character guard now prevents it | Existing negative guard plus new end-to-end failure test | block |
| OCR weights are duplicated into the thin MCP client | Confirmed image split: MCP has no models; Serve owns EasyOCR | Prototype in the pinned Serve image and select the adapter only after the A/B result | block |
| Concurrent fallback jobs exceed the 4-GiB limit | Plausible from the service cap and 1.2-GiB ordinary peak | Sequential tiles, process/container RSS measurement, concurrency one until proved | preflight |
| Overlap merge drops small/rotated labels or duplicates text | Plausible and material for diagrams | Literal 30–50-label ground truth, label recall and character similarity gates | preflight |
| Cached empty conversion hides a corrected fallback | Confirmed source/profile cache behavior in the MCP wrapper | Give fallback/profile output its own identity or bypass stale conversion cache | preflight |
| A generic zero-text trigger catches ordinary scans | Confirmed that scans can have zero text while remaining OCR-readable | Run only after ordinary conversion fails and require oversized vector-page evidence | block |
| Executor implements against PyMuPDF although the image lacks it | Confirmed local image inventory | Use pinned pypdfium2 first; add no PDF dependency without a measured need | preflight |

Recovery trigger: any quality gate regression, OOM/restart, timeout amplification, or short-output
success. Disable/revert the fallback, preserve `EmptyConversionError`, invalidate only the new local
profile cache, and keep queued documents failed with the existing actionable message. No data
restore is needed because this stage changes no source document or index.

## Progress

- Two independent research reports satisfy the research gate and agree on crop A/B then tiling.
- Bead `mc2-3gz2m` is claimed with the exact conditional acceptance boundary.
- The pinned image inventory is measured: EasyOCR 1.7.2 and pypdfium2 5.12.1 are already present;
  PyMuPDF is not.
- A read-only representative 1,215 × 4,296 pt input supplied 36 labels across headings, short
  labels and small body text. It remains local-only by design.
- Full-resolution crops improved mean similarity from 0.1181 to 0.3551 versus the identical
  0.1986-downscaled controls, confirming the scale effect, but both recovered only 1/36 labels at
  similarity 0.8 and neither recovered any of 16 small-body labels.
- The crop quality gate therefore failed before tiling. No product adapter or fallback was written;
  the existing `EmptyConversionError` path remains the accepted behavior.
- A separate 768-pt one-shot tile reached 5,025,356 KiB RSS with duplicate model loading, above the
  4-GiB service cap. This is supporting rejection evidence, not an estimate of in-process
  incremental memory.
- Focused Stage 2 tests passed 23/23; `pnpm type-check` and `pnpm build` passed. The build emitted
  only the existing `DEP0169` warning tracked by `mc2-p2908.1`.

docs-reviewed: updated - `specs/025-remaining-debt/research-findings.md` now preserves the source
fingerprints, installed-version documentation boundary, protocol, result, decision, and recheck
commands without committing the production content.

project-index: reviewed-no-change - the added benchmark is a task-specific research tool and does
not change a product entrypoint, package boundary, or operator workflow indexed by the project map.

graph-reviewed: updated - the local Graphify graph was refreshed after the benchmark and durable
research documentation were accepted.
