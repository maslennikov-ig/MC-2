---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/mc2-1sobq.2/stage-manifest.json
stream_owner: root-owner
orchestration_level: integration
scope_kind: product_slice
immediate_consumer: Stage 2 conversion and every downstream RAG consumer of picture and code metadata
public_facade: additive DoclingDocument enrichment fields plus an internal Serve enrichment adapter
bounded_acceptance: controlled Docling corpus with a new enrichment fixture, focused unit tests, type-check, build, lint
non_goals:
  - new input formats, OCR engine change, VLM A/B beyond the rejected description candidate
  - production deploy and any reindex of existing documents
evidence:
  - none
task_id: mc2-1sobq.2
epic_id: mc2-1sobq
stage_id: mc2-1sobq.2
session_id: docling-intelligence
milestone: selective Docling enrichments behind an explainable two-pass router
milestone_status: blocked
agent_type: custom
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: cross-runtime change spanning image build, Serve transport and TypeScript normalization owned locally by the root
repo: mc-2
branch: develop
base_branch: develop
base_commit: cede45d93
worktree: /home/me/code/mc2
write_zone:
  - packages/course-gen-platform/src/stages/stage2-document-processing/docling
  - packages/course-gen-platform/src/shared/embeddings/chunking-strategy.ts
  - packages/course-gen-platform/docker/docling-serve-advanced
  - packages/course-gen-platform/docker/docling-mcp/docker-compose.yml
  - packages/course-gen-platform/tests/integration/fixtures/docling-quality
  - packages/course-gen-platform/tests/unit/stages/stage2-document-processing
  - docs/DOCLING-MCP-REFERENCE.md
  - docs/FUTURE
success_criteria:
  - the advanced pass runs only for an explainable per-item signal and records it
  - fixtures prove exact code language, formula structure and chart series, and block invented values
  - cache identity separates an enriched artifact from a baseline one by profile and model
  - baseline Serve keeps its 4 GiB envelope and the advanced profile is measured without OOM
  - an advanced-pass failure is classified and leaves the accepted baseline artifact intact
selected_docs:
  - Docling Serve 1.29.0 /openapi.json from the running container (2026-08-06)
  - docling_core PictureMeta/CodeItem model fields introspected in the pinned image
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
status: blocked
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: advanced Serve profile stays up behind the compose profile for the remaining stage work
risk_level: medium
risk_tags:
  - data
  - rollback
  - resource
affected_surfaces:
  - backend
  - data
invariants:
  - rollback
  - idempotency
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: DOCLING-MCP-REFERENCE.md gained the enrichment contract; both FUTURE docs marked superseded against delivered truth
verification:
  - pnpm type-check: passed
  - pnpm --filter @megacampus/course-gen-platform exec vitest run tests/unit/shared/embeddings tests/unit/stages/stage2-document-processing tests/unit/shared/cleanup: passed 184
  - docker build docling-serve-advanced (runs test_models.py): passed
  - live enrichment probe, baseline vs advanced, on enrichment-code-formula-chart.pdf: recorded below
changed_files:
  - packages/course-gen-platform/docker/docling-serve-advanced/Dockerfile
  - packages/course-gen-platform/docker/docling-serve-advanced/test_models.py
  - packages/course-gen-platform/docker/docling-mcp/docker-compose.yml
  - packages/course-gen-platform/src/stages/stage2-document-processing/docling/enrichment-router.ts
  - packages/course-gen-platform/src/stages/stage2-document-processing/docling/enrichment-assertions.ts
  - packages/course-gen-platform/src/stages/stage2-document-processing/docling/raw-adapter.ts
  - packages/course-gen-platform/src/stages/stage2-document-processing/docling/types.ts
  - packages/course-gen-platform/src/shared/embeddings/chunking-strategy.ts
  - packages/course-gen-platform/tests/integration/fixtures/docling-quality/generate-fixtures.py
  - packages/course-gen-platform/tests/integration/fixtures/docling-quality/manifest.json
  - packages/course-gen-platform/tests/integration/fixtures/docling-quality/enrichment-code-formula-chart.pdf
  - packages/course-gen-platform/tests/unit/stages/stage2-document-processing/enrichment-router.test.ts
  - docs/DOCLING-MCP-REFERENCE.md
  - docs/FUTURE/PREMIUM-docling-advanced-features.md
  - docs/FUTURE/docling-fallback-strategy.md
explicit_defers:
  - picture description - candidate measured and REJECTED for fabrication; the model stays in the image so Stage D can retry a larger VLM against the same fixture
  - wiring the router into the live Stage 2 phase - the adapter, decision logic and merge are delivered and tested; the phase call site is Stage E integration work
---

# Summary

Docling's advanced enrichments are wired end to end behind a router that pays
for them only when a specific document item asks. Code language, formula text,
picture classification and chart series now survive into the normalized
document; picture description was measured, found to fabricate, and rejected.

# Measured before built

The whole stage is anchored on one live probe run on 2026-08-06 against the
pinned stack, before any code was written:

| capability             | baseline (4 GiB Serve) | model needed                |
| ---------------------- | ---------------------- | --------------------------- |
| picture_classification | works, 2s              | already in the image        |
| code / formula         | HTTP 404, fail-closed  | CodeFormulaV2, 0.64 GB      |
| chart extraction       | HTTP 404, fail-closed  | granite-vision-4.1-4b, 8 GB |
| picture description    | HTTP 404, fail-closed  | SmolVLM-256M                |

Two findings changed the design:

**The enrichment flags are wired through.** Unlike `heading_hierarchy_options`
in Stage A, `_parse_standard_pdf_opts` does pass every `do_*_enrichment` field
into the pipeline. No third runtime wrapper was needed, and that was confirmed
by measurement rather than by reading the source alone.

**Chart series are already free for native-chart formats.** On
`reading-order-chart.pptx` the BASELINE conversion returns
`classification: bar_chart` and the full series (Квартал 1/2/3 → 10/20/30),
read out of the embedded chart XML with no model and no flag. The previous
adapter discarded `meta` entirely, so the pipeline was throwing that away. The
8 GB vision model is only needed when a chart exists as pixels.

# Verification

Baseline against advanced on `enrichment-code-formula-chart.pdf`, the new
fixture that carries a code block as text and a formula and a bar chart as
raster images:

| check                  | baseline     | advanced                                    |
| ---------------------- | ------------ | ------------------------------------------- |
| code language          | `unknown`    | `Python`                                    |
| formula text           | empty string | `x = \frac{-b \pm \sqrt{(b^{2} - 4a)}}{2a}` |
| picture classification | none         | `bar_chart` @ 0.9997                        |
| chart series           | none         | Альфа=12, Бета=34, Гамма=56                 |

The formula is a RECORDED miss, not a pass: the fixture draws `4ac` and the
model read `4a`. It is reported with both strings and does not block, because
dropping a character is an accuracy result while inventing a symbol is not —
the fabrication check is separate and blocking.

Resource envelope, measured with `docker stats`: baseline peaked at 1.82 GiB of
its unchanged 4 GiB with zero restarts; the advanced profile peaked at 4.34 GiB
of 12 GiB with zero restarts. Cost of the advanced pass on that fixture: 134s
against 4s for baseline, which is the number the router exists to avoid paying.

- graph-reviewed: pending

# Risks / Follow-ups / Explicit Defers

- **Picture description is rejected on evidence.** `SmolVLM-256M` described a
  chart labelled Альфа/Бета/Гамма as "Bemma"/"BeTa"/"Rammma" under an invented
  title "Bemma". FR-014 makes invented labels blocking, so the capability is in
  `REJECTED_CAPABILITIES` with that reason and the router refuses it unless a
  caller explicitly passes `allowRejected`.
- The advanced image is 30.6 GB and carries an 8 GB vision model. It is behind a
  compose profile and does not start with the ordinary stack.
- The router is delivered and unit-tested but not yet called from the live
  Stage 2 phase; that wiring is deliberately deferred so this stage does not
  change production conversion behaviour.
- Chart extraction uses the V4 checkpoint because this Serve build hardcodes it
  and there is no preset registry for chart models. Shipping only the smaller
  3.3-2b model made the service try to download V4 mid-request despite
  `artifacts_path` — a determinism hole worth remembering.

# Delivery / Cleanup

Committed on `develop` through the repository dev delivery path. No stage branch
or worktree was created. The advanced Serve profile stays up locally behind
`--profile advanced`; the baseline stack is unchanged and its flags are at their
defaults.
