# Stage `mc2-1sobq.4` — OCR and VLM evaluation

Epic: `mc2-1sobq` (`specs/024-docling-intelligence/spec.md`)
Level: integration · Owner: root · Status: accepted 2026-08-07

## What changed observably

**Nothing in production behaviour, and that is the result.** Both candidates
were measured against the same inputs and both were rejected, so EasyOCR remains
the default and the VLM pipeline remains off. What is new is the evidence and
the harness that produced it.

| case                     | EasyOCR `ru,en` | RapidOCR `cyrillic` | table cells E / R |
| ------------------------ | --------------: | ------------------: | ----------------: |
| russian-ocr-degraded     |           1.000 |               0.778 |               n/a |
| russian-ocr-mixed-script |           0.849 |               0.736 |               n/a |
| russian-ocr-table        |           1.000 |               0.636 | 0.917 / **1.000** |
| **mean**                 |      **0.9496** |          **0.7168** |                   |

**The last row inverts under its own name.** The `russian-ocr-table` phrase
score is ONE heading; on the CELLS, RapidOCR is the engine that read the table
correctly and EasyOCR silently dropped `118`. An independent review caught that
the headline table, as first written, showed the opposite of the data on the
case named for it.

**n = 3 documents, 8 phrases, 4 of them exact ties.** The whole macro gap is
three headings (+0.121, +0.074, +0.067) minus the homoglyph line (-0.029). The
aggregate decides the magnitude: macro-mean 0.233, pooled 0.185, length-weighted
0.090, corpus CER 0.065, and under CER the mixed-script case flips. Every
aggregate keeps EasyOCR ahead, so the DIRECTION holds. The magnitude does not,
and this sample does not establish a permanent default — it establishes that
there is no reason to change one.

## The old corpus could not decide anything

The existing control document is a clean 300 dpi render. EasyOCR reads it
perfectly; RapidOCR was never run on it, and this summary originally claimed
both did — an assertion with no measurement behind it, caught in review. The three new fixtures add deterministic
damage — resample to 42-60%, JPEG quality 38-62, up to 1.4 degrees of skew —
plus mixed Cyrillic/Latin lines and a ruled Cyrillic table. No randomness: the
damage is reproducible byte for byte, so a score change means the engine
changed.

## What the scorer refuses to do

**It does not score on substring presence.** Two engines that both miss a
phrase, one by two letters and one entirely, would score identically on
"contains" — which is exactly the difference the A/B exists to measure. Phrases
are scored per character against exact ground truth.

**It does not fold Cyrillic into Latin.** `РОСТ` and `POCT` render identically
and share no bytes. A recognizer with a Latin-only dictionary returns the second
for the first, confidently, and normalization would score that as a perfect
read. Homoglyph substitutions are counted and reported in their own column.

Writing that test found a real bug in the scorer: when every candidate window
scored zero — the homoglyph case exactly — the search returned an empty string
and the homoglyph check could never fire. The A/B numbers above were recomputed
with the fixed scorer against the saved conversions.

## Where each engine actually fails

RapidOCR damaged all THREE headings and scored 1.000 on every body line. Large
type is the obvious reading, but it is a hypothesis, not a measurement: each
damaged phrase is also the largest, the only all-caps, the topmost and labelled
a heading, and nothing varied size while holding those fixed.

RapidOCR WINS two things, and a loss is not a rout: table cells 1.000 against
0.917, and the adversarial homoglyph line 0.744 against 0.395. On that line it
wrote `POCT И РOCT` where the source has `РОСТ и POCT` — it reproduced the
shapes and inverted the alphabets. The detector did not flag it, because it
catches wholesale substitution and not inversion inside a mixed line. That is a
known limit of the check, stated rather than hidden.

## Three facts that constrain any retry

1. **RapidOCR rejects `ru`** — it takes a SCRIPT name, `cyrillic`, and fails
   closed with the supported list.
2. **RapidOCR is single-language.** Docling logs that it ignores the second
   language. Our documents are mixed by nature, so one script must lose.
3. **The Cyrillic checkpoint is not in the shipped image**, and Docling refuses
   to download it at request time rather than violating `artifacts_path` —
   correct under NFR-007. The A/B ran against a THROWAWAY image, baseline plus
   12.9 MB of checkpoints. The shipped baseline was never modified for an
   experiment, and the stack was restored and re-verified afterwards.

## VLM stays disabled, on measured grounds

Serve exposes `ProcessingPipeline.VLM` and the `vlm_pipeline_*` options, and
NEITHER image carries VLM weights: `docling-serve-advanced` holds CodeFormulaV2,
layout-heron, DocumentFigureClassifier, EasyOcr and RapidOcr. Enabling one means a new image: that is a
BUILD cost and it is proven. The RAM argument was borrowed and is retracted —
Stage B's 30.6 GB / 4.34 GiB belong to `granite_chart_extraction_v4`, a chart
enrichment model, and SmolVLM-256M was measured as `picture_description` on one
image. Neither is a conversion pipeline, and Docling's own VLM models are
hundreds of megabytes. What stands: no VLM weights ship in either image, and the
one VLM measured on this corpus fabricated chart labels.

This corrects the Stage B note claiming SmolVLM "stays in the image so Stage D
can retry": it is not in the image. A retry needs a build, not just a flag.

`force_backend_text` is a `PdfPipelineOptions` field Serve does not expose in
its request options — the same gap class as `heading_hierarchy_options` in Stage
A. It could not help the 16 vector-outline PDFs regardless: it substitutes the
PDF backend's own text, and those documents have none.

## What independent review corrected here

Four reviewers read this stage. Three findings changed the record rather than
the code: the headline table inverted its own `table` case, "both engines read
the control perfectly" was never measured for RapidOCR, and the VLM rejection
borrowed resource numbers from chart extraction. All three are corrected above.

Two findings were real defects in the scorer, and both are now FIXED.

The homoglyph check could not fire on any real phrase: it demanded 80% overall
similarity after folding Latin to Cyrillic, and only twelve letters have a twin,
so a sentence is at most ~75% foldable. It passed its own unit test because a
four-letter word IS 100% foldable, and it fired zero times across six benchmark
runs. It now scores the POSITIONS folding explains rather than overall
similarity, and a whole phrase read as Latin trips it.

`scoreTable` used the substring matching this module's docstring rejects for
phrases, so a cell read as `l18` scored the same zero as a cell that never
arrived — on the half of the comparison where the CANDIDATE wins. It is now
per-character like the phrases, with a real threshold instead of `> 0`, which
used to pass one cell in twelve.

**The A/B was recomputed against the saved conversions after both fixes and did
not move**: 0.9496 against 0.7168, table cells 0.917 against 1.000. The
conclusion is stable under the repaired metric.

One thing the detector still cannot catch, stated rather than hidden: alphabet
INVERSION inside a mixed line. RapidOCR returned `POCT И РOCT` where the source
has `РОСТ и POCT`, and folding cannot help because the expectation itself
contains Latin. That fixture line is also poor ground truth — both halves render
identically in DejaVuSans, so no engine can recover the alphabet from pixels. It
is noise carrying a quarter of one case's weight.

## Review markers

project-index: reviewed-no-change — one new module and one new test file inside
subsystems `.codex/project-index.md` already describes; nothing moved or renamed.

graph-reviewed: updated — `graphify update .` re-extracted after the change.

docs-reviewed: updated - `docs/DOCLING-MCP-REFERENCE.md` gained the OCR A/B
section: the table, the three RapidOCR constraints, and the measured grounds for
keeping VLM off.

## Verification

- `pnpm type-check` and `pnpm lint` (0 errors) green across all five packages.
- 14 new focused tests for the OCR scorer, including the homoglyph and
  zero-score paths that caught the search bug.
- Live A/B, three cases per engine, against the running MCP and Serve; scores in
  `.tmp/docling-benchmark/ocr-{easy,rapid}-*/ocr-scores.json`.
- Stack restored to the shipped baseline and re-verified: `vector-outlines-negative`
  still raises `EmptyConversionError`, `russian-raster-ocr` still passes.

## Rollback

Nothing to roll back: no default changed. The fixtures, the scorer and the
report column are additive. Deleting the three manifest cases restores the
previous corpus exactly.

## Not done here, on purpose

- No new model was added to any shipped image; the RapidOCR probe image is
  local and disposable.
- The 16 vector-outline PDFs (`mc2-3gz2m`) remain unreadable. Stage D evaluated
  OCR candidates on fixed controls; it never promised to fix those.
