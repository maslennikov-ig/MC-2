# Plan — 025 Remaining debt

One active stage at a time, root-owned acceptance, canonical closeout per
`AGENTS.md`. Stage ids are Beads children created at stage start, not now.

## Order and why it is this order

| #   | Stage              | Why here                                                         | Gate to leave                                    |
| --- | ------------------ | ---------------------------------------------------------------- | ------------------------------------------------ |
| 1   | Triage             | Any ranking made before it is guesswork; 89 items, unknown truth | Every item bucketed with evidence                |
| 2   | Data-loss & safety | Only irreversible items on the list                              | Off-host copy restored once; `mc2-q1ggs` decided |
| 3   | Silent failure     | Users are misled today, and the fix is small                     | Reason visible in the UI                         |
| 4   | Content bugs       | Reaches learners, but recoverable                                | Each reproduced, then fixed                      |
| 5   | Vector diagrams    | Feature work; needs research first                               | Research in hand, approach chosen                |
| 6   | Repo health        | Harms nobody today                                               | Gates green                                      |

Stage 6 may be pulled forward if Stage 1 shows `mc2-gbctb` can ship an unbuilt
image — that turns it from hygiene into a deploy hazard.

## Stage 1 — Triage

Not a reading exercise. For each item: open the code path it names, decide
whether the statement is still true, record what was checked.

- Batch by label, because the checks repeat: `pipeline` (17), `ci` (9),
  `formatting` (7), `repo-health` (7), `tech-debt` (7), `career-playbook` (6),
  `stage6` (5).
- Delegation is justified here — the batches are independent, read-mostly, and
  the context does not fit one window. Workers report bucket + evidence and
  change no code.
- Never trust a subagent's verdict without the evidence it cites. That rule is
  in `bd prime` for a reason.
- Deliverable: a triage table in `.codex/stages/<id>/summary.md` and the same
  verdict on each bead.

Expect a meaningful fraction to be already fixed or no longer reproducible.
Also expect the opposite: `format:check` was filed in February and still fails
on 11 files today.

## Stage 2 — Data-loss and safety

`mc2-bygu1` first. 206 MB, 117 files under `/opt/megacampus/data/uploads`;
`file_catalog.storage_path` is a relative filesystem path, not a Storage key.
A copy that has never been restored is a belief, not a backup — restore one
file and check its hash against `file_catalog.hash`.

`mc2-q1ggs` needs an owner decision, not an implementation: separate accounts,
a shared lock, or sudoers narrowing. Present the options with costs; do not
pick one alone.

`mc2-2vtmk` is small and mechanical.

## Stage 3 — Silent failure

Measured: `EmptyConversionError` carries a precise message and
`file_catalog.error_message` renders nowhere in `packages/web`.

Two decisions, both cheap:

- where the reason belongs in the UI, and in what words for a non-technical
  uploader;
- whether a pre-flight at upload can detect "no text layer and OCR finds
  nothing" before the queue, or whether that necessarily costs a conversion.

Ship the message first; the pre-flight is an optimisation and may not be worth
it.

## Stage 4 — Content bugs

Reproduce, fix, re-check with the same check. If one no longer reproduces, it
belongs in Stage 1's "not reproducible" bucket with the evidence, not in a fix.

## Stage 5 — Vector diagrams, experiment-gated

**Decision recorded 2026-08-10:** the crop A/B confirmed that the 0.1986
full-page reduction harms recognition, but full-resolution crops still reached
only 2.78% label recall and 0.3551 mean character similarity, with zero recall
for 16 small-body labels. This fails the pre-registered quality gate before the
tiling branch. No product fallback is implemented; the existing actionable
rejection remains. See `research-findings.md` for the reproducible measurement.

**Owner-authorized follow-up 2026-08-10:** after the stop rule above was made
explicit, the owner asked to run the bounded tiled profile anyway. The exact
current Docling image was OOM-killed before its first 768-pt, 20%-overlap,
scale-3 tile at a 6-GiB no-swap hard limit. That exceeds both the 2.8-GiB
fallback and 4-GiB complete-service gates, so it does not reopen product work;
the actionable rejection remains.

The research gate is satisfied by two independent reports returned on
2026-08-10. They agree on the material points:

- EasyOCR reduces the long side to 2560 px, so a 4296-pt page reaches its
  detector at roughly 43 effective DPI;
- raising `images_scale` cannot remove that limit;
- the first candidate is direct clip rendering plus the existing EasyOCR
  `ru,en`, not a new OCR engine;
- vector-glyph reconstruction and a resident VLM are disproportionate and have
  no measured Russian-diagram quality that justifies them;
- an explicit refusal with a request for the editable source is the correct
  fallback when recognition does not pass a quality gate.

This is one root-owned `slice_acceptance` stage. The experiment, the contingent
implementation, the negative path and the final proof share one subsystem and
one rollback boundary. The stage runs in this order:

1. **Preserve the evidence and the representative input.** Store a short
   source-linked synthesis of both reports. Obtain one of the four original
   4296-pt PDFs as a local-only test input; do not commit sales-script content.
   Manually transcribe 30–50 representative Russian labels, including small,
   rotated and frame-adjacent text. The tracked
   `vector-outlines-no-text.pdf` remains the negative guard; it is not a Russian
   OCR quality fixture.
2. **Prove or kill the scale hypothesis.** Render each labelled PDF crop at
   OCR scale 3 (216 DPI), then run the same crop after a 0.1986 linear
   downscale. Use the existing EasyOCR `ru,en` and the repository's character
   similarity/label checks. Record both outputs, label recall, mean character
   similarity, smallest-text misses, wall time and peak RSS. Do not write
   product code if full-resolution crops do not materially recover the text.
3. **Run a bounded tiling prototype only after the crop A/B passes.** Render
   PDF clips directly rather than rasterising the whole 12,888-pixel-tall page.
   Sweep tile sizes 512/768/1024 pt and overlap 0/10/20/30%, process tiles
   sequentially, map polygons back to page coordinates and deduplicate by
   geometry plus text. Pre-register the pilot gate: label recall at least 95%,
   mean character similarity at least 0.90, no systematic loss of the smallest
   text class, wall time below 180 seconds per page, and peak fallback RSS below
   2.8 GiB while the complete service remains below its 4-GiB limit.
4. **Choose from the measured branch.**
   - If tiling passes, write the smallest on-demand fallback design around the
     existing Docling/EasyOCR runtime. It must have no new resident service or
     model, run only for oversized zero-text vector PDFs after the ordinary
     conversion is rejected, be concurrency-bounded, and be disabled by
     default until its container-level memory proof passes.
   - If crops pass but tiling misses labels because of diagram geometry, allow
     one bounded vector-region experiment using PyMuPDF drawings/clusters. It
     must find at least 95% of labelled nodes before OCR to stay in scope.
   - If the classical paths fail, keep the already shipped actionable rejection
     and close `mc2-3gz2m` with the measurements. A VLM, glyph matching, a new
     service or a larger host is a separate owner-authorized stage, not an
     automatic fallback.
5. **Implement only the passing path with focused red-green coverage.** Preserve
   the current `EmptyConversionError` path; add anomaly-trigger, tile merge,
   timeout/memory/concurrency failure coverage and a deterministic sanitized
   outlined-Russian fixture that reproduces the accepted geometry without
   committing production content. An OCR failure must remain a visible failed
   document, never a short successful conversion.
6. **Accept once at the stage boundary.** Re-run the benchmark against its saved
   baseline, the focused backend/container tests, `pnpm type-check` and
   `pnpm build`. Record exact quality/time/RSS evidence in the stage artifact.
   No reindex, production-file retry, paid model call, schema migration or
   deploy belongs to this acceptance.

The implementation adapter is deliberately selected after step 3. The current
MCP image is a thin remote client without OCR models, while the Serve image owns
EasyOCR and its weights; choosing a boundary before the prototype would either
duplicate models or bake an unproved path into the conversion service.

## Stage 6 — Repo health

Mechanical. Batch by tool, one commit per tool, gates green at the end.

## Verification

Per stage: the smallest exact set that covers what changed. Full suite only at
epic close. Reuse evidence; do not re-run passing gates for freshness.

## What this plan refuses to promise

A number. "89 → N" is not knowable before Stage 1, and any figure quoted now
would be invented. The commitment is that nothing survives unchecked and that
the irreversible items are handled first.
