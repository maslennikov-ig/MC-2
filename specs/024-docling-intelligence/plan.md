# Docling Intelligence implementation plan

**Goal:** deliver the accepted outcome in `spec.md` through sequential cohesive stages.  
**Approach:** keep the existing MCP conversion contract stable, add internal adapters and
feature-flagged profiles, prove quality offline, then form one immutable release candidate. Use one
active implementation stage at a time; `mc2-1sobq` is a roadmap epic, not an implementation stage.  
**Non-goals:** production deploy without fresh authority, existing-document reindex, global VLM,
AnyDoc, audio/video and unproven MCP SDK features.

## 1. Target architecture

```text
uploaded source
      |
      +--> MCP conversion bundle --> normalized Docling document/Markdown
      |                                  |
      |                                  +--> legacy Markdown chunker (rollback)
      |                                  |
      |                                  +--> native Serve chunk adapter (candidate)
      |                                           |
      |                                  consistency/provenance guard
      |                                           |
      +--> selective profile router --------------+
                  |                                |
                  +--> baseline accepted artifact  +--> parent/child adapter
                  +--> advanced second pass               |
                                                        embeddings
                                                           |
                                              additive Qdrant payload
                                                           |
                                                        retrieval
```

The MCP `/mcp` boundary remains stable. Direct internal Serve use is allowed only behind a typed
adapter and internal network. The implementation must resolve the exact Serve 1.29 request/response
contract from authoritative docs/runtime before choosing source/file transport. A second conversion
must use the same source digest and behavior-affecting options, and its refs must resolve against the
accepted normalized document before upload.

## 2. Stable internal interfaces

Exact names may follow repository conventions, but these semantic boundaries are required:

```ts
type DoclingChunkingStrategy = 'legacy_markdown' | 'docling_hierarchical' | 'docling_hybrid';

interface SourceProvenance {
  selfRefs: string[];
  pageNumber: number | null;
  bboxes: Array<{
    left: number;
    top: number;
    right: number;
    bottom: number;
    coordOrigin: string;
    pageWidth?: number;
    pageHeight?: number;
  }>;
}

interface StableDoclingChunk {
  id: string;
  text: string;
  headings: string[];
  provenance: SourceProvenance;
  tokenCount: number;
}

type DoclingProcessingProfile = 'baseline' | 'structural' | 'advanced_visual';
```

The existing exported downstream interfaces should be extended additively. Shared contracts continue
to come only from `@megacampus/shared-types`.

## 3. Scope ledger and stages

### Stage A — `mc2-1sobq.1`: structure-aware RAG

**Boundary:** Stage 2 conversion/chunking/Qdrant/retrieval integration; rollback is feature flags and
legacy payload behavior.  
**Verification lane:** `tdd-required` because parsing, IDs, payload and retrieval behavior change.

- [ ] Prove the all-H2 benchmark bug red, then implement distinct-level assertions.
- [ ] Add a known hierarchy fixture and ground-truth retrieval/evidence questions.
- [ ] Resolve exact Docling Serve 1.29 native chunk API once via the repository docs resolver and
      record the source.
- [ ] Add typed native chunk transport/adapter and strategy flags.
- [ ] Thread normalized Docling JSON into chunk metadata enrichment.
- [ ] Preserve self refs, heading paths, page/bbox and deterministic IDs through Qdrant/retrieval.
- [ ] Keep parent/child, siblings, priority boost and late chunking contract.
- [ ] Add PDF heading inference behind a flag; extend the thin runtime boundary without forking
      upstream MCP.
- [ ] Run legacy/hierarchical/hybrid A/B and select the quality winner by `spec.md` criteria.
- [ ] Complete one root-owned integration acceptance and stage closeout. Do not reindex.

Immediate consumers: Stage 2 vector indexing and all current RAG retrieval. Public facade: existing
chunk/enriched payload types plus additive provenance fields. Non-goals: enrichment models, new
formats and production rollout.

### Stage B — `mc2-1sobq.2`: selective enrichments

**Boundary:** conversion profiles, models/cache/resource envelope and normalized advanced metadata;
independent rollback is disabling the advanced profile.  
**Verification lane:** `tdd-required` for profile routing, adapter fields and cache separation.

- [ ] Add ground-truth code/formula/chart/picture fixtures and failing assertions.
- [ ] Define explainable baseline signals and a selective second-pass router.
- [ ] Enable code/formula enrichments and picture classification in the candidate profile.
- [ ] Enable chart extraction/picture description only for eligible documents.
- [ ] Normalize advanced metadata and propagate it to chunk/Qdrant evidence.
- [ ] Include profile/options/model identity in canonical cache keys.
- [ ] Preload exact models and build a separate internal advanced service/profile if 4 GiB baseline
      safety cannot be maintained.
- [ ] Measure resource use and reject hallucinated or ungrounded fixture output.
- [ ] Complete one root-owned integration acceptance and stage closeout.

### Stage C — `mc2-1sobq.3`: verified Premium formats

**Boundary:** public upload contract and format-specific conversion; rollback is the new-format gate.
This is split from enrichments because MIME/security/tier behavior has a distinct consumer and
rollback boundary.  
**Verification lane:** `tdd-required` for validators and conversion contracts.

- [ ] Add ground-truth XLSX/CSV, ODT/ODS/ODP, EPUB and LaTeX fixtures.
- [ ] Update shared Premium MIME/extensions and every server/client validator atomically.
- [ ] Add format routing/dependencies without widening Standard/Trial.
- [ ] Prove spoofed/mismatched MIME/extension rejection.
- [ ] Run upload-to-retrieval smokes and existing-format regression tests.
- [ ] Update user/operations documentation and complete stage closeout.

### Stage D — `mc2-1sobq.4`: gated OCR/VLM

**Boundary:** optional model/runtime profile with independent enable/disable and image rollback.
Candidate rejection is an accepted outcome when it fails the fixed quality gate.  
**Verification lane:** `tdd-required` for routing/failure contracts; benchmark evidence owns model
selection.

- [ ] Build a harder Russian OCR corpus and compare EasyOCR/RapidOCR on identical inputs.
- [ ] Keep EasyOCR unless RapidOCR wins the quality criteria.
- [ ] Evaluate selective VLM / standard + `force_backend_text` on explicit eligible cases.
- [ ] Add deterministic eligibility, grounding and hallucination guards before any enablement.
- [ ] Use a separate internal advanced runtime profile and exact models/resource limits.
- [ ] Preserve controlled `EmptyConversionError` when no accepted profile extracts text.
- [ ] Record accepted/rejected candidates and complete stage closeout.

### Stage E — `mc2-1sobq.5`: release candidate and controlled rollout

**Boundary:** integration/release proof and externally visible production mutation. Deploy is an
authorization gate and cannot be inferred from implementation approval.  
**Verification lane:** release acceptance; one final full suite.

- [ ] Combine accepted flags/configs/images into an immutable release candidate.
- [ ] Run all acceptance mapped in `spec.md`, Compose/image/model assertions, split-stack smoke,
      `pnpm type-check`, `pnpm build` and one final `pnpm test`.
- [ ] Run correctness review, process verification, stranded-commit check, docs/Graphify review and
      canonical stage closeout.
- [ ] Deliver through the repository dev/release contract only after safe fetch/branch checks.
- [ ] Ask for the exact production deploy action. If authorized, preserve rollback digests, deploy,
      process one new control document and verify resources/observability.
- [ ] Do not reindex existing documents. File a separate gated task only if the owner later requests
      reindex.

## 4. Technical premortem

Verdict: **GO WITH CONDITIONS**. The change is reversible if every candidate is feature-flagged,
payload evolution is additive, cache identity includes profiles and deploy/reindex remain separate.

### Blast radius

`Docling options/chunking -> Stage 2 chunks -> embeddings/Qdrant payload -> RAG retrieval -> Stages
3-6 evidence consumers`, sharing Docling cache, Serve memory, upload validators, BullMQ jobs and
immutable deployment images.

| Failure symptom                            | Evidence                   | Mechanism / surface                                              | Detection                                            | Mitigation / disposition                                                     |
| ------------------------------------------ | -------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------- |
| Benchmark stays green with flat headings   | confirmed                  | current max-`#` assertion proves depth, not hierarchy            | red all-H2 regression fixture                        | replace with distinct-level assertion; **block** Stage A                     |
| Native chunks and normalized JSON disagree | plausible, material        | Serve chunk route may reconvert separately from MCP bundle       | unresolved `self_ref`, digest/profile mismatch       | typed consistency guard; fail before upload; **block**                       |
| Retrieval degrades despite richer metadata | plausible                  | native sizing/tokenizer breaks parent/child or late chunking     | ground-truth Recall/MRR and contract tests           | shadow A/B; retain legacy flag; **block** default switch                     |
| Mixed old/new points crash readers         | plausible                  | new Qdrant fields assumed required                               | old-payload fixtures and live read smoke             | additive optional fields; no reindex; **block**                              |
| Cache returns wrong profile artifact       | plausible                  | key omits options/models/strategy                                | cross-profile cache contract test                    | canonical versioned identity; separate artifacts; **block**                  |
| Serve OOM/restarts                         | confirmed resource concern | unloaded enrichment/VLM models added to 4 GiB service            | peak memory/restart count                            | separate advanced service/profile; keep baseline limit; **block** enablement |
| VLM invents labels or values               | plausible, material        | generative description used as evidence                          | prohibited facts and ground-truth fixture assertions | deterministic eligibility + grounding; reject candidate; **block**           |
| New formats bypass tier/security checks    | plausible                  | client/server/MIME lists diverge                                 | spoof/tier contract tests                            | one shared contract and fail-closed server validation; **block** Stage C     |
| Rollback leaves partially mixed data       | plausible                  | advanced pass overwrites baseline or new required payload fields | rollback smoke with old readers                      | separate caches, additive payload, flag order; **preflight**                 |
| Executor expands into deploy/reindex       | confirmed process risk     | “finish everything” treated as live authority                    | stage manifest and Beads gate                        | exact authorization stop; **block** external action                          |

### Recovery proof

Before release, prove flags restore baseline processing on a fresh control document and old Qdrant
payload fixtures remain readable. Preserve current immutable MCP/Serve digests. Recovery is config
rollback first, image rollback second; it does not delete caches or points. Expected runtime rollback
is one normal service rollout. No data restore is needed because the program does not mutate existing
documents.

## 5. Files/surfaces expected to change

The orchestrator must verify exact ownership before editing. Expected areas:

- `packages/course-gen-platform/src/stages/stage2-document-processing/`
- `packages/course-gen-platform/src/shared/embeddings/`
- `packages/course-gen-platform/scripts/docling-quality-benchmark.ts`
- `packages/course-gen-platform/tests/**/docling*` and quality fixtures
- `packages/course-gen-platform/docker/docling-*`
- `packages/shared-types/src/file-upload-constants.ts`
- upload validators and format display surfaces in `packages/web`
- Docker Compose, Docling operations/reference docs and stage artifacts.

Do not implement the obsolete future documents verbatim. Reconcile or replace
`docs/FUTURE/PREMIUM-docling-advanced-features.md` and
`docs/FUTURE/docling-fallback-strategy.md` with the accepted selective-profile design.

## 6. Verification routing

Focused red/green tests run within each behavior-changing stage. Each stage gets one final
risk-selected acceptance set and canonical closeout. The full `pnpm test` runs once at the release
candidate, after focused failures are resolved. Quality reports must retain exact input/config/model
identity. Speed is reported but non-blocking.
