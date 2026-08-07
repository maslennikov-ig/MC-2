# Docling Intelligence: structure-aware RAG, selective enrichments и форматы

Status: approved for implementation  
Date: 2026-08-05  
Beads epic: `mc2-1sobq`  
Current production baseline: Docling 2.118.0, Docling Core 2.90.0, Docling Serve 1.29.0,
Docling MCP 3.0.0, Python/TypeScript MCP SDK 2.0.0.

## 1. Outcome

Повысить не скорость конвертации, а качество последующего поиска и генерации курса:

1. сохранить структуру и provenance Docling до Qdrant и retrieval;
2. выбрать native Docling chunking по честному A/B, не ломая существующий parent/child и late-chunking contract;
3. включать формулы, код, диаграммы и описания изображений селективно, а не глобально;
4. расширить Premium ingestion на проверенные Docling-форматы;
5. оценить RapidOCR и VLM на сложных документах и включить только кандидатов, которые доказанно лучше.

Production deploy и переиндексация существующих документов не входят в автоматическую реализацию.
Deploy требует отдельной свежей авторизации. Existing-document reindex является отдельным будущим
решением даже после успешного rollout.

## 2. Evidence behind the scope

Подтверждено аудитом текущего репозитория и runtime:

- существующий `MarkdownTextSplitter` создал для принятой scientific PDF 155 parent и 155 child
  chunks, но у всех `heading_path = Root`, `chapter = null`, `section = null`;
- тот же raw Docling JSON через native `HierarchicalChunker` дал 88 chunks с реальными
  `meta.headings` и `meta.doc_items/self_ref`;
- Stage 2 передает в chunking только Markdown и общие метаданные; `processingResult.json` до
  `metadata-enricher.ts` не доходит, поэтому page/bbox provenance не сохраняется в Qdrant;
- quality benchmark проверяет максимальное количество `#`, но не два различных уровня заголовков.
  Scientific PDF с одними H2 поэтому прошла ошибочно;
- production уже использует layout Heron, TableFormer `ACCURATE`, OCR EasyOCR `ru,en`, table
  structure и image scale 2.0;
- выключены heading inference, code/formula enrichment, picture classification/description и chart
  extraction;
- MCP 3 не передает эти advanced pipeline options. Native chunking доступен в Serve 1.29, поэтому
  integration обязана иметь собственный стабильный adapter/transport boundary;
- текущий CPU image не содержит CodeFormula/VLM/chart models; тяжелые профили нельзя включать
  глобально в Serve с лимитом 4 GiB без отдельного измерения;
- текущая продуктовая матрица явно ограничивает Standard/Trial, а Premium заявлен как all formats.

Relevant upstream references:

- [Docling native chunking](https://docling-project.github.io/docling/concepts/chunking/)
- [Docling enrichments](https://docling-project.github.io/docling/usage/enrichments/)
- [Supported formats](https://docling-project.github.io/docling/usage/supported_formats/)
- [Pipeline options](https://docling-project.github.io/docling/reference/pipeline_options/)
- [Serve REST API](https://docling-project.github.io/docling/usage/api_server/rest_api/)

## 3. In scope

### 3.1 Structure-aware RAG

- Correct distinct-heading-level assertions and add retrieval/evidence quality metrics.
- PDF heading-level inference behind a feature flag.
- Stable native-chunk adapter for `HierarchicalChunker` and `HybridChunker` results.
- Offline/shadow A/B against the current Markdown strategy on the same source and configuration.
- Jina v3 tokenizer alignment or an evidence-backed compatible token-count contract.
- Preservation of Docling `self_ref`, heading path, page number and bounding boxes through:
  conversion -> chunking -> metadata enrichment -> embeddings -> Qdrant payload -> retrieval.
- Additive payload evolution that keeps current parent/child, sibling, priority boosting and late
  chunking behavior available.
- Fail-closed consistency check: native chunk metadata must resolve against the normalized Docling
  document produced for the same source digest and conversion profile.

### 3.2 Selective enrichments

- Baseline conversion remains the default first pass.
- Lightweight document signals decide whether a second, cached advanced pass is justified.
- Candidate capabilities: code enrichment, formula enrichment, picture classification, chart data
  extraction and picture description.
- Stable adapter fields for code language, formulas, picture classification, grounded description,
  chart series/labels/data and their provenance.
- Exact model preload and versioned cache identity.
- Separate advanced runtime profile/service when the accepted model set cannot safely fit the
  baseline Serve resource envelope. It remains internal-only and digest-pinned.

### 3.3 Additional input formats

Add end-to-end Premium support, with ground-truth fixtures, for:

- XLSX and CSV;
- ODT, ODS and ODP;
- EPUB;
- LaTeX.

The upload picker, shared contracts, MIME/extension validation, server validation, Docling routing,
quality corpus and retrieval smoke must agree. Standard and Trial remain unchanged.

### 3.4 OCR and VLM evaluation

- Compare EasyOCR and RapidOCR on a harder Russian scan corpus, including tables and normalized
  control phrases.
- Evaluate selective VLM or standard + `force_backend_text` for complex layout, handwriting,
  formulas and vector-outline/visual-only cases.
- Use a dedicated advanced profile with explicit model/resource identity; never enable a heavy VLM
  globally in the baseline 4 GiB Serve.
- A failed candidate is a valid result: preserve the current default and record why the candidate
  was rejected.

## 4. Explicit non-goals

- AnyDoc or a broad external/local fallback that masks Serve failures.
- Global VLM, global picture descriptions, or unconditional two-pass conversion.
- MCP tasks/progress/subscriptions, manipulation tools, document editing tools or page thumbnails:
  none has a demonstrated ingestion-quality benefit for this stage.
- Audio/video ingestion; the current image lacks its runtime dependencies and ffmpeg.
- Serve async tasks unless a later product requirement needs progress/cancel/resume for a single
  large file. BullMQ remains the application-level async owner.
- Changes to the Standard/Trial monetization contract.
- Migration of database rows or reindex of existing Qdrant documents.
- GPU, horizontal scaling or replacing the official Docling MCP package with a fork.

## 5. Functional requirements

### Quality and benchmark

- **FR-001** `minimumHeadingDepth` must be replaced or supplemented by an assertion that requires
  the expected set/count of distinct heading levels. A document containing only H2 must not prove a
  two-level hierarchy.
- **FR-002** Each corpus case must persist Markdown, raw JSON, normalized JSON, chunk output,
  retrieval metrics and a human-readable report under `.tmp/docling-benchmark/`.
- **FR-003** Retrieval acceptance must use ground-truth questions and expected evidence references,
  measuring at least Recall@k and MRR/nDCG. Byte-identical Markdown is not required.
- **FR-004** Normal, failure and edge cases must include scientific PDF, Russian raster PDF, DOCX,
  PPTX, visual-only negative PDF, structure fixture, new formats and enrichment fixtures.

### Chunking and provenance

- **FR-005** Expose a stable internal strategy contract with at least `legacy_markdown`,
  `docling_hierarchical` and `docling_hybrid` candidates. The selected default is configuration,
  not a hardcoded irreversible switch.
- **FR-006** Native output must be adapted to the current parent/child consumer model. It must retain
  parent lookup, sibling navigation, stable IDs, chunk counts, priority metadata and late chunking.
- **FR-007** Chunk IDs must be deterministic for source digest + conversion profile + chunking
  profile + normalized source refs. Cache identity must include the same behavior-affecting inputs.
- **FR-008** Every applicable chunk must carry source refs and normalized provenance. Coordinates
  must retain page size/origin semantics so consumers cannot misinterpret the bbox.
- **FR-009** A native result whose refs cannot be resolved against the normalized document must fail
  before Qdrant upload; it must not silently fall back to unrelated Markdown chunks.
- **FR-010** Qdrant payload changes are additive and retrieval tolerates old points with missing new
  fields. No migration or mass update is performed in this program.
- **FR-011** PDF heading inference is feature-flagged and its actual hierarchy is asserted on a
  known multi-level fixture.

### Enrichments

- **FR-012** The profile router must run baseline first and request an advanced second pass only for
  an explainable signal recorded in logs/metrics.
- **FR-013** The raw adapter must normalize description/classification/chart/code/formula metadata
  without exposing version-specific Docling JSON to downstream TypeScript.
- **FR-014** Picture descriptions and chart extraction must remain grounded in fixture truth;
  invented values or labels are blocking failures.
- **FR-015** Advanced pass failure is classified and observable. It must not corrupt the accepted
  baseline artifact or produce partially mixed cache entries.

### Formats

- **FR-016** New formats are Premium-only until a separate product decision changes tier policy.
- **FR-017** MIME, extension and content validation must reject spoofed/mismatched uploads and give a
  controlled unsupported-format error.
- **FR-018** Each format family must prove its defining structure: sheets/cells/formulas/merges for
  spreadsheets, lists/tables for ODT, slide order for ODP, chapters for EPUB, equations/code for
  LaTeX.

### OCR/VLM

- **FR-019** EasyOCR remains the default unless RapidOCR wins the quality gate on the same inputs.
- **FR-020** A VLM profile is enabled only for a deterministic eligible class and only if its output
  passes grounded text/structure checks without hallucination.
- **FR-021** When no accepted profile extracts meaningful text, the pipeline must still raise
  `EmptyConversionError`; empty success is forbidden.

## 6. Non-functional requirements

- **NFR-001 Quality first:** latency is recorded, never the primary acceptance criterion.
- **NFR-002 Reversibility:** every new default has a feature-flag rollback to the current production
  behavior. New Qdrant fields are optional to old readers.
- **NFR-003 Resource safety:** baseline Serve stays within 4 GiB with zero restarts. Any accepted
  advanced service has a measured, explicit limit and zero OOM/restarts on its corpus.
- **NFR-004 Security:** Serve services remain internal-only; no new public port or unvalidated file
  fetch is introduced.
- **NFR-005 Observability:** logs/metrics expose source digest, conversion profile, chunk strategy,
  cache hit, chunk/provenance coverage, enrichment reason, models, duration and classified failure.
- **NFR-006 Compatibility:** current MCP `/mcp`, existing saved documents and existing Qdrant points
  continue to work.
- **NFR-007 Determinism:** images/models/dependencies are exact-version and digest/hash pinned; no
  `latest` is introduced.

## 7. Acceptance criteria

### Structure-aware RAG acceptance

- A known hierarchy fixture proves at least two distinct heading levels; the old all-H2 false
  positive fails red before the fix and passes only with the corrected assertion.
- On documents with provenance, at least 95% of eligible text child chunks resolve to one or more
  Docling refs and have valid page/bbox data. Any exclusions are classified and reported.
- The native candidate has no regression on every control retrieval question and improves at least
  one hierarchy/table/chart/formula evidence case over `legacy_markdown`.
- Parent/child expansion, priority boost, hybrid retrieval and late chunking pass contract tests.
- Strategy-off produces the current payload/behavior; no existing documents are reindexed.

### Enrichment acceptance

- Fixtures verify exact expected formulas, code text/language and chart labels/series/values.
- Picture descriptions pass grounded semantic assertions and contain none of the prohibited invented
  facts defined by each fixture.
- The advanced profile is cached separately and never overwrites the baseline bundle.
- Baseline and advanced services stay within their accepted resource envelopes with zero restarts.

### Format acceptance

- Every new format completes upload -> conversion -> normalization -> chunks -> retrieval smoke.
- Spreadsheet merges/formulas, ODF structure, EPUB chapter order and LaTeX equations/code are present
  in normalized output and retrievable evidence.
- Spoofed MIME/extension and Standard/Trial attempts are rejected; existing formats remain green.

### OCR/VLM acceptance

- The Russian OCR corpus reports phrase/table accuracy for both engines. A switch requires a
  statistically and practically meaningful quality win, not merely speed.
- VLM candidate controls exact/normalized recovered phrases and structural facts and blocks
  hallucinated values. If it cannot pass, it remains disabled and `EmptyConversionError` semantics
  stay unchanged.

### Release acceptance

- Focused unit/contract/integration tests, Compose validation, split-stack smoke, benchmark corpus,
  `pnpm type-check`, `pnpm build` and one final `pnpm test` are green at the release candidate.
- Active source has no unapproved `latest`, public Serve port or hidden fallback.
- Runtime docs, operational rollback, Graphify and stage/Beads closeout reflect delivered truth.
- A production rollout occurs only after separate authorization and processes one new control
  document. Existing documents remain untouched.

## 8. Rollback contract

Rollback order:

1. disable VLM/advanced enrichment profile;
2. disable new format gate;
3. restore `legacy_markdown` chunking and disable PDF heading inference;
4. if runtime images changed, restore immutable previous MCP/Serve image digests;
5. leave additive Qdrant fields in place; old readers ignore them.

Triggers: missing mandatory tools, unresolved refs/provenance, empty conversion, retrieval regression,
hallucinated fixture facts, OOM/restart, cache cross-contamination or live smoke failure.

No rollback step deletes or rewrites existing points. A future reindex must have its own plan,
snapshot/restore proof, authorization and acceptance boundary.
