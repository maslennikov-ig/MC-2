# Alternative OCR plan — oversized outlined Russian PDFs

Status: measured; no local candidate passed every gate. Bead: `mc2-3gz2m.1`.
Parent capability: `mc2-3gz2m`.

## Outcome and boundary

Select a local recognition path for the existing family of one-page, 4,296-pt
outlined-Russian diagrams. Every candidate is measured on the same local-only
representative PDF, the same 36 manually labelled regions and the repository
character-similarity scorer. A production adapter is written only after a
candidate clears every gate.

This stage does not use cloud or paid OCR, retry a production document, reindex,
migrate a schema, change secrets/access, add a resident service, deploy, merge,
push, or reconstruct vector glyphs. The accepted EasyOCR stage
`mc2-3gz2m` remains immutable evidence; this stage tests different recognition
capabilities.

## Candidate types and order

| Order    | Type                              | Exact candidate                                                                              | Why it is tested                                              | Stop rule                                                                                    |
| -------- | --------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1        | Existing engine, different input  | EasyOCR 1.7.2 with grayscale, contrast/binarization and documented detector/decoder settings | Cheapest check; no new model or runtime                       | Stop after the pre-registered sweep; do not tune against individual labels                   |
| 2        | Lightweight Cyrillic OCR          | PaddleOCR 3.7.0 with PP-OCRv5 Russian/Cyrillic recognition on CPU                            | Official PP-OCRv5 has dedicated East-Slavic/Cyrillic models   | Reject if install/model load or one-page proof exceeds the resource/time gate                |
| 3        | Multilingual document OCR         | Surya OCR 0.17.0 on CPU, batch size one                                                      | Last classic Surya detector/recognizer before the VLM rewrite | Reject if its model cannot load or infer inside the same hard limits                         |
| 4        | Vision-language OCR               | Surya OCR 0.22.1 or current PaddleOCR-VL only after a fresh resource preflight               | Stronger layout/document capability, but much heavier         | Do not run when host pressure is high or the model cannot be bounded below the service limit |
| External | Managed OCR or source-file policy | Google/Azure OCR, or require editable source/text layer                                      | Possible fallback if every local model fails                  | Owner decision and explicit paid/live authority; outside this stage                          |

PaddleOCR 3.7 defaults to PP-OCRv6, but its official language table does not
include Russian for PP-OCRv6. The experiment therefore pins PP-OCRv5 with
`lang=ru`/the Cyrillic recognition model rather than silently testing the wrong
alphabet.

## Fixed corpus and gates

- PDF SHA-256: `4cea85f009d8e065fe15f73e7a4b46577a42ca4b1c2e8e2d5084845acda34ff8`.
- Ground-truth SHA-256: `6a0cd8aab8819a35a7e60306d38c314a9e719ce6b290b3e9ee4754c4afecbb16`.
- 36 regions, including 16 `small-body` labels; inputs and raw OCR remain under
  ignored `.tmp/` storage.
- Pass: at least 95% label recall at character similarity 0.8, mean similarity
  at least 0.90, and at least 15/16 small-body labels with no systematic class
  loss.
- Runtime: less than 180 seconds per page, process RSS below 2.8 GiB, and a
  projected complete-service RSS below 4 GiB.
- Product invariant: output shorter than the existing content floor is still a
  failure; the fallback is on-demand and concurrency one.

## Resource envelope

All model work is sequential. A candidate process/container gets at most four
CPUs, 2.8 GiB RAM, no swap allowance, a 180-second page timeout and a disposable
model cache. Downloads may use the network; scoring/inference runs with the
cache fixed and network disabled. The next candidate does not start until the
previous process exits.

The 2026-08-10 preflight found 16.3 GiB available RAM but 100% swap use and 192
integration/browser processes consuming about 11 GiB. This permits planning and
small bounded probes, not an unbounded VLM load. PaddleOCR-VL remains gated on a
fresh preflight with lower process pressure.

## Execution steps

1. Preserve the corpus fingerprints and baseline EasyOCR result.
2. Extend the benchmark runner behind engine/preprocessing arguments; keep the
   scorer and JSON schema engine-independent.
3. Run the fixed EasyOCR sweep. Select by aggregate gate only.
4. Build disposable CPU environments for PaddleOCR and Surya, record exact
   package/model revisions, then score the same 36 regions.
5. If no lightweight candidate passes, rerun the host preflight and either run
   PaddleOCR-VL inside the same envelope or record why that envelope makes it
   ineligible.
6. For a passing candidate, first add a focused failing Stage 2 proof, then add
   the smallest on-demand adapter and prove fail-closed behavior. If none pass,
   change no product code and leave the parent capability open.
7. Close with sanitized measurements, focused tests, `pnpm type-check`,
   `pnpm build`, process verification and the canonical stage closeout.

## Technical premortem

Verdict: **GO WITH CONDITIONS**. The experiment is reversible because model
caches and raw results are local-only and the current `EmptyConversionError`
path remains the default.

| Failure symptom                                     | Evidence and mechanism                                                            | Detection / mitigation                                                | Disposition         |
| --------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------- |
| Host becomes unresponsive                           | Current swap and process pressure are measured high; model loads are memory-heavy | Sequential jobs, hard memory/CPU/time cap, fresh preflight before VL  | Block unbounded run |
| Good crop score does not translate to a page        | Direct crops bypass page-level detection and merge                                | Require a bounded whole-page/tile proof before adapter work           | Preflight           |
| Wrong Paddle language model gives a false rejection | PP-OCRv6 does not list Russian while PP-OCRv5 does                                | Pin and record the Russian/Cyrillic PP-OCRv5 model                    | Block wrong config  |
| Short/noisy OCR becomes a false success             | Confirmed historical failure                                                      | Preserve the existing minimum-content and fail-closed tests           | Block               |
| Model/runtime cannot fit Docling service            | Separate duplicate EasyOCR probe already exceeded 4 GiB                           | Measure process RSS and projected combined RSS before integration     | Block               |
| Benchmark overfits 36 labels                        | Many tuning combinations could select accidental winners                          | Pre-register a small sweep and select on aggregate/class metrics only | Monitor             |
| Executor changes unrelated delivery/runtime code    | Scope is an experiment until a candidate passes                                   | Keep writes to benchmark/stage docs until the gate is green           | Block               |

Recovery: stop the bounded process, discard its disposable cache/results, and
leave `EmptyConversionError` unchanged. If an adapter is later added and any
gate regresses, revert the adapter/config as one cohort; no data restore is
needed because this stage does not mutate source documents or indexes.

## Documentation evidence

- EasyOCR 1.7.2: L1 existed but lacked the needed API sections; the first-party
  implementation documents `canvas_size`, `mag_ratio`, detector thresholds,
  decoders and CPU mode.
- PaddleOCR 3.7.0: L1 was missing. First-party 3.7 documentation lists CPU
  execution and a dedicated `cyrillic_PP-OCRv5_mobile_rec` model supporting
  Russian; PP-OCRv6's language table excludes Russian.
- Surya OCR 0.17.0: L1 pointed to a future track, so the first-party tagged
  source is authoritative for its classic foundation/detector/recognizer API.
- Surya OCR 0.22.1: L1 was missing. Inspection of the installed package and its
  official model repository shows that it is now a GGUF VLM requiring a
  1,266,400,864-byte model, a 204,986,688-byte visual projector, llama.cpp and
  a 12,288-token default per-slot context. It is therefore a heavy candidate,
  not the lightweight Surya described by older examples.

## Measured decision

No candidate passed all of the pre-registered gates, so this stage adds no
production adapter and leaves the existing fail-closed `EmptyConversionError`
behavior unchanged. Sanitized aggregate results and reproduction commands are
recorded in `alternative-ocr-findings.md`.

- EasyOCR preprocessing did not improve the accepted baseline: the best sweep
  remained at 1/36 recovered labels and 0/16 small-body labels.
- PaddleOCR was the strongest local classic engine at 19/36 labels and 10/16
  small-body labels, but it missed the 95%/15-of-16 quality floor.
- Surya 0.17.0 exceeded the 2.8-GiB memory envelope while loading its classic
  recognition model, before an inference could be scored.
- PaddleOCR-VL 1.6 loaded and recognized a single crop below the memory cap,
  but a complete 1x page did not finish inside 180 seconds.
- The official Docling-native RapidOCR 3.9.2 path with PP-OCRv5 Cyrillic,
  `FULL_PAGE` mode and scale 3.0 finished in 87.78 seconds inside the process
  and service memory gates, but recovered 0/36 labels and 0/16 small labels.
  It returned 14 characters with no Cyrillic text, so no service profile was
  added.

The remaining solution types are intentionally owner-owned because they change
cost, infrastructure or accepted input policy: run a stronger VLM on a larger
or GPU host, use managed paid OCR, or require an editable source/text layer for
this document class.
