# Stage `mc2-1sobq.3` — Premium input formats

Epic: `mc2-1sobq` (`specs/024-docling-intelligence/spec.md`)
Level: integration · Owner: root · Status: delivered, pending acceptance

## What changed observably

Seven format families reach the full pipeline on Premium and only on Premium:
XLSX, CSV, ODT, ODS, ODP, EPUB, LaTeX. Each goes upload → validation →
conversion → normalization → chunks → retrieval smoke, with a fixture whose
assertions are about the STRUCTURE the family exists to express, not about how
much text survived.

Live run against the pinned stack, one case per family:

| case                     | assertions | refs | page/bbox | atoms@5 |
| ------------------------ | ---------- | ---- | --------- | ------- |
| premium-spreadsheet-xlsx | 11/11      | 100% | 100%      | 1.00    |
| premium-table-csv        | 5/5        | 100% | n/a       | 1.00    |
| premium-opendocument-odt | 9/9        | 100% | n/a       | 1.00    |
| premium-opendocument-ods | 7/7        | 100% | 100%      | 1.00    |
| premium-slides-odp       | 9/9        | 100% | n/a       | 1.00    |
| premium-book-epub        | 9/9        | 100% | n/a       | 1.00    |
| premium-paper-latex      | 6/6        | 100% | n/a       | 1.00    |

## Measured before anything was built

The pinned image was asked what it can do, rather than trusted to match the
spec. `docling.datamodel.base_models.InputFormat` in
`mc2/docling-serve:1.29.0-docling-2.118.0` resolves a real backend for all seven
(`CsvDocumentBackend`, `MsExcelDocumentBackend`, `Odt/Ods/OdpDocumentBackend`,
`LatexDocumentBackend`, `EpubDocumentBackend`), and one probe conversion each
confirmed it end to end. No new model, no new service, no download.

Three findings changed the design:

**Sheet, slide and chapter boundaries exist ONLY in the native document.** The
Markdown rendering flattens a two-sheet workbook into two anonymous tables. The
names live in `groups[].name` with `label` of `sheet` / `chapter` / `section`.
Without carrying them, "the assistant's rate" cannot be answered from a workbook
that also has a budget sheet — so `buildDoclingProvenanceIndex` now walks parent
chains and records `containers`, and every native chunk carries them.

**An XLSX formula is its cached value, never its expression.** Docling reads
`<v>`, not `<f>`. openpyxl writes `<v></v>` because it evaluates nothing, so the
first fixture attempt reported an EMPTY total and would have proved the opposite
of its intent. `_patch_xlsx_cached_formula` writes the value a real editor
saves, and raises if the cell shape it expects is not there.

**Merged cells do not survive as spans.** A merged header becomes a separate
text item beside the table and every cell reports `1x1`. The fixture asserts the
merged TEXT is present; claiming merge preservation would have been false.

**Only XLSX and ODS carry page/bbox.** The other five report `prov: []`, so
`locationEligible` is false for them exactly as it already was for DOCX. Ref
coverage is 100% on all seven.

## The upload contract now checks the extension

`file_catalog.mime_type` is what Stage 2 routes on, and it was whatever the
client declared — a `.pdf` announced as `text/plain` went to the plain-text
extractor, and nothing downstream re-checked. `validateFileExtension` closes
that (FR-017): the extension must be on the tier's list, and the declared type
must be one `MIME_TYPES_BY_EXTENSION` permits for it.

What is STORED is the canonical type for the extension, not the declaration.
That is what makes routing deterministic: a `.csv` that Chrome announced as
`text/plain` reaches Docling rather than the plain-text path. For the existing
formats the canonical type equals what was already stored in every case, and the
plain-text router treats `text/plain` and `text/markdown` alike, so no existing
document changes route.

`SUPPORTED_FORMATS` stays narrower than Docling's own list on purpose: Serve
also accepts audio, video, email, boxnote and ebcdic, all explicit non-goals.

## Verification

- `pnpm type-check` green across all five packages.
- New focused tests: 17 for the format contract and the extension gate, 14 for
  containers and structure assertions — all green. Existing `tests/unit/shared`
  and `tests/unit/stages/stage2-document-processing`: 60 files, 971 tests green.
- Live benchmark, one run per family against the running MCP + Serve, results in
  the table above; artifacts under `.tmp/docling-benchmark/stagec-*/`.

## Rollback

The new formats are additive to the Premium tier lists; removing the seven
entries from `MIME_TYPES_BY_TIER.premium` and `FILE_EXTENSIONS_BY_TIER.premium`
restores the previous contract with no data migration. `containers` is an
optional chunk field that old readers ignore. The extension gate is the one
change that affects existing formats, and it is covered by tests asserting every
current (extension, type) pair still validates.

## Not done here, on purpose

- No existing document is reindexed and no conversion default changed.
- Chart extraction stays off (`mc2-x72bq`); the OCR/VLM A/B is Stage D.
- `tests/file-validator.test.ts` references a tier key `basic_plus` that no
  longer exists. It was already failing 25 of 56 before this stage and fails 24
  after; the file is in the full suite, which the contract runs at epic/release
  only. Tracked as `mc2-gtooz` rather than fixed inside a format stage.
