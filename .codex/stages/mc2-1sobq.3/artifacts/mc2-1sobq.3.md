---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/mc2-1sobq.3/stage-manifest.json
stream_owner: root-owner
orchestration_level: integration
scope_kind: product_slice
immediate_consumer: Premium uploaders and every downstream RAG consumer of chunk provenance
public_facade: Premium tier format lists, an extension/MIME agreement contract, and an additive chunk container field
bounded_acceptance: seven live format cases on the pinned stack, focused unit tests, type-check, build, lint
non_goals:
  - OCR engine change and VLM A/B (Stage D)
  - production deploy, reindex of existing documents, and the chunk-strategy flip (Stage E)
evidence:
  - none
task_id: mc2-1sobq.3
epic_id: mc2-1sobq
stage_id: mc2-1sobq.3
session_id: docling-intelligence
milestone: Premium XLSX/CSV/ODF/EPUB/LaTeX ingestion with structural ground truth
milestone_status: accepted
agent_type: custom
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: one cohesive contract spanning shared types, server validation, conversion and the quality harness, owned locally by the root
repo: mc-2
branch: develop
base_branch: develop
base_commit: fe4589114
worktree: /home/me/code/mc2
write_zone:
  - packages/shared-types/src/file-upload-constants.ts
  - packages/course-gen-platform/src/shared/validation/file-validator.ts
  - packages/course-gen-platform/src/stages/stage1-document-upload
  - packages/course-gen-platform/src/stages/stage2-document-processing/docling
  - packages/course-gen-platform/src/shared/embeddings
  - packages/course-gen-platform/tests/integration/fixtures/docling-quality
  - packages/course-gen-platform/tests/unit
  - packages/web/components/forms/file-upload.tsx
  - docs/DOCLING-MCP-REFERENCE.md
success_criteria:
  - every new format completes upload, conversion, chunking and a retrieval smoke on the live stack
  - fixtures prove sheets and their names, slide order, chapters, cells with a formula result, typed formula and code
  - spoofed MIME/extension is rejected and the stored mime_type comes from the extension
  - Standard and Trial gain nothing; the new families are Premium-only
  - existing formats keep validating and the new chunk field is optional
selected_docs:
  - docling.datamodel.base_models.InputFormat introspected in the pinned Serve image (2026-08-07)
  - live /v1/convert/file probes of all seven families against Serve 1.29.0
selected_skills:
  - orchestration-bridge:orchestrator-stage
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: n/a
depends_on_streams:
  - none
parallel_decision: local
status: accepted
delivery_method: merge
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: no branch or worktree was created; the local Docling stack stays up for Stage D
risk_level: medium
risk_tags:
  - data
  - rollback
affected_surfaces:
  - backend
  - frontend
  - data
invariants:
  - rollback
  - idempotency
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: DOCLING-MCP-REFERENCE.md gained the Premium format contract, the measured per-family structure table and the extension gate
verification:
  - pnpm type-check: passed
  - pnpm lint: passed, 0 errors
  - pnpm build: passed
  - unit suite (vitest.config.unit.ts): 400 files, 6773 passed, 0 failed
  - live docling-quality-benchmark, one case per family: 7/7 passed
changed_files:
  - packages/shared-types/src/file-upload-constants.ts
  - packages/course-gen-platform/src/shared/validation/file-validator.ts
  - packages/course-gen-platform/src/stages/stage1-document-upload/orchestrator.ts
  - packages/course-gen-platform/src/stages/stage1-document-upload/types.ts
  - packages/course-gen-platform/src/stages/stage1-document-upload/phases/phase-1-validation.ts
  - packages/course-gen-platform/src/server/routers/career-playbook/sources.service.ts
  - packages/course-gen-platform/src/stages/stage2-document-processing/docling/provenance.ts
  - packages/course-gen-platform/src/stages/stage2-document-processing/docling/structure-assertions.ts
  - packages/course-gen-platform/src/stages/stage2-document-processing/docling/types.ts
  - packages/course-gen-platform/src/shared/embeddings/markdown-chunker.ts
  - packages/course-gen-platform/src/shared/embeddings/native-chunk-adapter.ts
  - packages/course-gen-platform/scripts/docling-quality-benchmark.ts
  - packages/course-gen-platform/tests/integration/fixtures/docling-quality/generate-fixtures.py
  - packages/course-gen-platform/tests/integration/fixtures/docling-quality/manifest.json
  - packages/course-gen-platform/tests/unit/shared/validation/premium-format-contract.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage2-document-processing/docling/structure-containers.test.ts
  - packages/web/components/forms/file-upload.tsx
  - docs/DOCLING-MCP-REFERENCE.md
explicit_defers:
  - mc2-gtooz - tests/file-validator.test.ts uses the removed tier key basic_plus; 25/56 failed before this stage and 24 after, full-suite only
---

# Summary

Seven Premium format families reach the full pipeline on the pinned Docling
stack, each with a fixture that asserts the structure the family exists to
express. The upload contract stopped trusting the client's MIME declaration.

# Measured before built

The image was asked what it can do rather than trusted to match the spec. All
seven resolve a real backend in `mc2/docling-serve:1.29.0-docling-2.118.0`, and
one probe conversion each confirmed it end to end. No new model, no new service.

| family | structure that survives                                  | provenance     |
| ------ | -------------------------------------------------------- | -------------- |
| XLSX   | one `sheet` group per worksheet, carrying its NAME       | page_no + bbox |
| CSV    | one table, no containers                                 | none           |
| ODT    | headings, `list` group, tables                           | none           |
| ODS    | one `section` group named `sheet: <name>`                | page_no + bbox |
| ODP    | one `chapter` group per slide, in slide order            | none           |
| EPUB   | `section` + `list` groups, chapter titles in spine order | none           |
| LaTeX  | `formula` and `code` items, typed, not prose             | none           |

Three findings changed the design:

**Sheet, slide and chapter boundaries exist only in the native document.** The
Markdown rendering flattens a two-sheet workbook into two anonymous tables, so
`buildDoclingProvenanceIndex` now walks parent chains and records `containers`.

**An XLSX formula is its cached value, never its expression.** openpyxl writes
`<v></v>`, so the first fixture reported an empty total and would have proved
the opposite of its intent.

**Merged cells do not survive as spans.** The fixture asserts the merged text is
present; claiming merge preservation would have been false.

# Result

Live benchmark, one case per family: 7/7 passed, 100% ref coverage everywhere,
atom coverage 1.00. Full account: `.codex/stages/mc2-1sobq.3/summary.md`.

# Verification

- `pnpm type-check`, `pnpm lint` (0 errors) and `pnpm build` green across all five packages.
- Unit suite under `vitest.config.unit.ts`: 400 files, 6773 passed, 0 failed, 110 skipped.
- 31 new focused tests: 17 for the format contract and the extension gate, 14 for containers and
  structure assertions.
- Live `docling-quality-benchmark` against the running MCP and Serve, one case per family:
  7/7 passed, assertions 5/5 to 11/11, 100% ref coverage, atom coverage 1.00.
- `scripts/orchestration/run_process_verification.sh`: OK.

# Risks / Follow-ups

- The extension gate is the one change touching existing formats. Every current
  (extension, declared type) pair is covered by a test, and the stored canonical type equals what
  was already stored in each case, so no existing document changes its processing route.
- `organizations.tier` values outside the constants used to raise a TypeError inside validation and
  surface as a 500. The tier lookups are now total and return a controlled rejection instead.
- `tier_settings.allowed_mime_types` in the database is written by the admin router and never read
  at upload time, so existing Premium rows show a stale list in the admin UI until edited. Display
  only; no validation path depends on it.
- `mc2-gtooz` — `tests/file-validator.test.ts` uses the removed tier key `basic_plus`.
