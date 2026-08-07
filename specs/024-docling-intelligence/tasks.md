# Docling Intelligence task map

Task truth lives in Beads. This file is the stable human-readable scope ledger for epic
`mc2-1sobq`; statuses must be read from `bd`, not inferred from checkboxes here.

## Dependency graph

```text
mc2-1sobq.1  Structure-aware RAG
     |\
     | +----> mc2-1sobq.3  Premium formats
     v
mc2-1sobq.2  Selective enrichments
     |
     v
mc2-1sobq.4  OCR/VLM A/B
     \          /
      \        /
       v      v
mc2-1sobq.5  Release candidate + controlled rollout
```

`mc2-1sobq.5` also depends directly on `mc2-1sobq.2` and `mc2-1sobq.3`.

## Epic — `mc2-1sobq`

Deliver structure-aware RAG, selective enrichments, verified Premium formats and gated OCR/VLM
evaluation over the live Docling 2.118 stack. The epic closes only after release acceptance; it does
not silently authorize production deploy or reindex.

## Stage A — `mc2-1sobq.1` (P1)

**Outcome:** native Docling structure and provenance survive into retrieval, with a quality-proven
chunking default and legacy rollback.

Owned acceptance:

- honest distinct-heading-level assertion;
- native Hierarchical/Hybrid versus legacy retrieval A/B;
- deterministic parent/child mapping and Jina tokenizer contract;
- at least 95% applicable chunk provenance coverage;
- old payload compatibility and no reindex.

## Stage B — `mc2-1sobq.2` (P2, blocked by A)

**Outcome:** code/formula/chart/picture intelligence runs only for eligible documents, produces
grounded metadata and has an independent resource-safe rollback.

Owned acceptance:

- explainable two-pass router;
- normalized advanced fields and Qdrant evidence;
- model/profile-aware cache identity;
- exact fixtures for formulas, code, chart data and descriptions;
- baseline/advanced resource proof with zero OOM/restarts.

## Stage C — `mc2-1sobq.3` (P2, blocked by A)

**Outcome:** XLSX/CSV, ODT/ODS/ODP, EPUB and LaTeX are fully supported for Premium with security and
quality fixtures.

Owned acceptance:

- one shared client/server MIME and extension contract;
- Premium-only policy, unchanged Standard/Trial;
- spoof/mismatch rejection;
- defining structure preserved and retrievable for every format family;
- existing-format regression coverage.

## Stage D — `mc2-1sobq.4` (P2, blocked by B)

**Outcome:** evidence decides whether RapidOCR or a selective VLM profile is worth enabling; failed
candidates are explicitly rejected without weakening baseline behavior.

Owned acceptance:

- reproducible harder Russian OCR A/B;
- quality, not speed, decides OCR default;
- deterministic VLM eligibility and hallucination guards;
- separate internal advanced profile and resource proof;
- controlled `EmptyConversionError` when no accepted extraction works.

## Stage E — `mc2-1sobq.5` (P1, blocked by B/C/D)

**Outcome:** one immutable release candidate passes the complete specification and is ready for a
separately authorized production rollout.

Owned acceptance:

- integrated benchmark and contract evidence;
- `pnpm type-check`, `pnpm build`, one final `pnpm test`, Compose/image/model checks and split-stack
  smoke;
- review, process verification, stranded-commit check, docs, Graphify and canonical closeout;
- verified flags/images rollback;
- after fresh deploy authority only: one new live control document, no historical reindex.

## Acceptance ledger

| Specification criterion                                  | Owner                                             |
| -------------------------------------------------------- | ------------------------------------------------- |
| FR-001..FR-011, structure-aware RAG acceptance           | `mc2-1sobq.1`                                     |
| FR-012..FR-015, enrichment acceptance                    | `mc2-1sobq.2`                                     |
| FR-016..FR-018, format acceptance                        | `mc2-1sobq.3`                                     |
| FR-019..FR-021, OCR/VLM acceptance                       | `mc2-1sobq.4`                                     |
| NFR-001..NFR-007 integration, release and rollback proof | `mc2-1sobq.5`                                     |
| Production mutation                                      | explicit authorization gate inside `mc2-1sobq.5`  |
| Existing-document reindex                                | not owned; separate future task and authorization |

## Orchestrator next action

Select `mc2-1sobq.1`, create its `orchestration-stage/v1` manifest at `integration` level, bind the
acceptance criteria above, and implement Stage A end to end. Do not mark the roadmap epic itself as
the active implementation stage.
