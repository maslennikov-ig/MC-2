# Stage `mc2-1sobq.4` — OCR and VLM evaluation

Epic: `mc2-1sobq` (`specs/024-docling-intelligence/spec.md`)
Level: integration · Owner: root · Status: accepted 2026-08-07

## What changed observably

**Nothing in production behaviour, and that is the result.** Both candidates
were measured against the same inputs and both were rejected, so EasyOCR remains
the default and the VLM pipeline remains off. What is new is the evidence and
the harness that produced it.

| case                     | EasyOCR `ru,en` | RapidOCR `cyrillic` |
| ------------------------ | --------------: | ------------------: |
| russian-ocr-degraded     |           1.000 |               0.778 |
| russian-ocr-mixed-script |           0.849 |               0.736 |
| russian-ocr-table        |           1.000 |               0.636 |
| **mean**                 |      **0.9496** |          **0.7168** |

## The old corpus could not decide anything

The existing control document is a clean 300 dpi render that both engines read
perfectly. A comparison on it returns a tie regardless of which engine is
better, so it cannot justify a default. The three new fixtures add deterministic
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

RapidOCR loses on LARGE TYPE: `СВОДКА ПО НАПРАВЛЕНИЯМ` came back as `# BO ПО
НАПРАВЛЕ ЕНИЯМ`, and `ОТЧЁТ ЗА III КВАРТАЛ` as `# O 3 BA A ИДЕНТ`. That is
consistent with a mobile detection model tuned for body text.

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
layout-heron, DocumentFigureClassifier, EasyOcr and RapidOcr. Enabling one means
a new image and RAM the host does not have — Stage B measured
`granite-vision-4.1-4b` at 30.6 GB and 4.34 GiB peak against an 11 GiB host
whose compose limits already sum to about twice that. The one VLM measured so
far, `SmolVLM-256M`, fabricated chart labels and was rejected on evidence.

This corrects the Stage B note claiming SmolVLM "stays in the image so Stage D
can retry": it is not in the image. A retry needs a build, not just a flag.

`force_backend_text` is a `PdfPipelineOptions` field Serve does not expose in
its request options — the same gap class as `heading_hierarchy_options` in Stage
A. It could not help the 16 vector-outline PDFs regardless: it substitutes the
PDF backend's own text, and those documents have none.

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
