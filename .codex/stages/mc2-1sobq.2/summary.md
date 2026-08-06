# Stage `mc2-1sobq.2` — selective Docling enrichments

Epic: `mc2-1sobq` (`specs/024-docling-intelligence/spec.md`)
Level: integration · Owner: root · Status: delivered, acceptance pending

## What changed observably

Code language, formula text, picture classification and chart series now survive
Docling conversion into the normalized document. On the new control fixture the
difference is exact:

| check                  | baseline     | advanced                                    |
| ---------------------- | ------------ | ------------------------------------------- |
| code language          | `unknown`    | `Python`                                    |
| formula text           | empty string | `x = \frac{-b \pm \sqrt{(b^{2} - 4a)}}{2a}` |
| picture classification | none         | `bar_chart` @ 0.9997                        |
| chart series           | none         | Альфа=12, Бета=34, Гамма=56                 |

Production conversion behaviour is unchanged: the advanced service is behind a
compose profile, and the router is not yet called from the live Stage 2 phase.

## Measured before anything was built

Every design choice here came from one probe against the pinned stack, run
before the first line of code.

**The enrichment flags are wired through.** `_parse_standard_pdf_opts` passes
every `do_*_enrichment` field into the pipeline, unlike `heading_hierarchy_options`
in Stage A. No third runtime wrapper was needed — confirmed by request, not by
reading the source.

**A missing model fails closed, but lies about why.** Requesting an enrichment
whose model is absent returns `HTTP 404 {"detail": "Task result not found.
Please wait for a completion status."}` in about two seconds, with the real
cause (`Model 'docling-project/CodeFormulaV2' not found in artifacts_path`) only
in the container log. A caller cannot tell that from a transient scheduling
problem. Two things follow: the build refuses to ship an advanced image whose
model set does not match its promise, and the enrichment adapter names the
capability set and profile in its own error instead of repeating a message that
actively misdirects.

**Chart series are already free for native-chart formats.** On
`reading-order-chart.pptx` the BASELINE conversion returns
`classification: bar_chart` and the complete series — Квартал 1/2/3 → 10/20/30 —
read out of the PPTX's embedded chart XML with no model and no flag set. The
previous adapter dropped `meta` entirely, so the pipeline was discarding data it
already had. An 8 GB vision model is needed only when a chart exists as pixels.

## The router is three-tiered, and that is the point

1. **baseline** (MCP) — unchanged, always, and it stays the accepted artifact;
2. **a cheap classification pass on the BASELINE service**, because
   `DocumentFigureClassifier` is already in that image and answers in seconds.
   This is what turns "this document has a picture" into "this picture is a bar
   chart at 0.9997";
3. **the advanced service**, only for capabilities a concrete item asks for.

Without step 2 a photograph and a bar chart are indistinguishable, and the
router would spend an 8 GB model on a guess. With it, the measured behaviour on
real documents is:

- PDF baseline → requests `code` and `formula` (real gaps), correctly declines
  to ask about the chart because nothing has classified it yet;
- PDF after the advanced pass → requests nothing; the decision is idempotent;
- PPTX baseline → requests **nothing at all** and needs no classification pass,
  because the source file already answered both questions.

The cost this avoids is concrete: 134s and 4.34 GiB for the advanced pass
against 4s for baseline on the same small PDF.

Every decision carries the `self_ref` of the item that caused it, so a log line
answers "why did this document cost two minutes" without re-running anything.

## Picture description is rejected, on evidence

`SmolVLM-256M`, the preset this Serve build defaults to, was asked to describe
the control bar chart labelled Альфа/Бета/Гамма. It returned a description
titled "Bemma" whose three categories were "Bemma", "BeTa" and "Rammma" — an
invented title and three mangled labels.

FR-014 makes invented labels a blocking failure, so the capability sits in
`REJECTED_CAPABILITIES` with that reason and the router refuses it unless a
caller explicitly passes `allowRejected`. The model stays in the advanced image
so Stage D can measure a larger VLM against the same fixture rather than
starting from nothing. A failed candidate is a valid result; hiding it would
not be.

## Two tiers of assertion, kept apart on purpose

A model that INVENTS a value is a blocking failure: a fabricated chart label or
a formula symbol absent from the source is worse than no enrichment, because a
lesson will quote it. A model that MISSES part of a value is an accuracy result,
recorded with the exact delta.

The formula fixture is the live example. It draws `4ac`; the model read `4a`.
That is reported as `enrichment-formula-exact` with both strings printed, and it
does not block — while `enrichment-formula-no-fabrication` (no `\int`, `\sum`,
`\lim`, `\partial` that the source never contained) does. Keeping the two apart
is what stops the gate from being quietly relaxed to whatever the current model
happens to produce.

## Identity, so a cached baseline cannot answer for an enriched document

`resolveConversionProfile` now folds the applied capabilities AND the exact
models behind them into the identity that chunk ids and cache keys are built
from. An enriched artifact reads
`baseline+enrich[code,formula]@docling-project/CodeFormulaV2`.

This is the same failure shape as the MCP cache key in Stage A, which hashed
only the source and happily returned the previous conversion profile's document,
and as the embedding cache key that ignored `late_chunking`. Naming the model
and not just the capability means swapping a model invalidates the identity too.

## Resource envelope

Measured with `docker stats` during the live probes:

- baseline Serve: peaked **1.82 GiB of its unchanged 4 GiB**, zero restarts;
- advanced Serve: peaked **4.34 GiB of 12 GiB**, zero restarts.

The advanced image is 30.6 GB on disk, carrying `CodeFormulaV2` (0.64 GB),
`SmolVLM-256M` and `granite-vision-4.1-4b` (8 GB). It is behind compose
`--profile advanced` and does not start with the ordinary stack.

Chart extraction uses the V4 checkpoint because this Serve build hardcodes
`ChartExtractionModelGraniteVisionV4` and exposes no preset registry for chart
models. Shipping only the smaller 3.3-2b `chart2csv` model looked complete and
then made the service log "Model artifacts not found … they will be downloaded"
mid-request — an `artifacts_path` service reaching for the network. Matching the
pinned stack's own default costs 8 GB and removes both that non-determinism and
the need for a third runtime wrapper.

## Verification

- `pnpm type-check` 0 errors; focused tests 184 across 20 files, including 19
  new ones for the router, the merge and the profile identity.
- `docker build docling-serve-advanced` runs `test_models.py`, which asserts the
  three advanced models are present WITH real weight files, and that the
  baseline models survived the layer.
- Live baseline-versus-advanced probe on `enrichment-code-formula-chart.pdf`:
  baseline fails four blocking enrichment checks, advanced passes all of them.

## Rollback

1. Stop the advanced service: it is a compose profile, so not passing
   `--profile advanced` is the rollback.
2. The router requests nothing when no signal is present, and is not yet wired
   into the live phase, so production conversion is unaffected either way.
3. Enrichment fields on the document are additive; a consumer that ignores them
   sees exactly the previous shape.

## Not done here, on purpose

- **Wiring the router into the live Stage 2 phase.** The adapter, decision
  logic, merge and identity are delivered and tested; the call site is not
  changed, so this stage cannot alter production conversion. That wiring is the
  one remaining piece of Stage B's outcome and it is named rather than implied.
- Picture description, rejected above.
- New input formats (Stage C) and the OCR/VLM A/B (Stage D).
