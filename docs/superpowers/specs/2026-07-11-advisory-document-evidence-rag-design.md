# Advisory Document Evidence and RAG Design

**Status:** Proposed for owner review  
**Date:** 2026-07-11  
**Parent epic:** `mc2-jz6y0`  
**Design task:** `mc2-jz6y0.17`  
**Extends:** `docs/superpowers/specs/2026-07-10-self-hosted-qdrant-platform-design.md`

## Summary

Documents are optional but important advisory evidence. A course must remain fully generatable without documents, while every uploaded document must be assessed and accounted for rather than silently ignored. Documents may enrich structure and lesson content, supply organization-specific facts, terminology, examples, constraints, and source material, but they must not automatically replace the baseline course structure because their quality and consistency are unknown.

The system adds a durable document-evidence preflight between Stage 4 classification and clarifying questions. It produces evidence cards for every document, a complete coverage ledger, detected conflicts, and recommended resolutions. Manual courses pause at the existing Phase 0.5 clarifying boundary. Automatic courses select the recommended resolution and persist it explicitly as a system decision. Stage 5 then creates a baseline structure independently and performs a bounded advisory enrichment pass. Stage 6 continues targeted document retrieval for lesson generation.

Large or numerous documents are processed through hierarchical summaries, bounded batches, claim reduction, and targeted Qdrant retrieval. Context overflow must not silently omit documents or fail merely because all summaries do not fit in one prompt.

## Confirmed Product Decisions

1. Creating a course without documents is a first-class supported path.
2. Documents supplement the structure; they do not define or replace it automatically.
3. Uploaded documents cannot be silently ignored. Every document receives a coverage outcome.
4. Document quality and document authority are separate. A poorly written company policy may still be authoritative for company-specific facts.
5. Material contradictions are shown in a distinct clarifying-question block.
6. Manual mode pauses at the existing Stage 4 Phase 0.5 boundary until required questions are answered.
7. Automatic mode selects the recommended answer and persists `resolved_by: system` with the rationale.
8. Large-corpus completeness may use additional model calls, latency, and cost.
9. Qdrant retrieval is advisory in Stage 5 and targeted in Stage 6. It is not the primary mechanism for constructing the initial Stage 4 analysis.

## Current-State Findings

The repository already has a Stage 4 budget allocator with the intended priority model:

- one `CORE` document is always full text;
- `IMPORTANT` documents are upgraded from summary to full text while budget remains;
- `SUPPLEMENTARY` documents use summaries;
- the standard/extended model threshold is 260,000 tokens;
- the Stage 4 hard policy limit is 700,000 tokens.

The existing implementation is a useful foundation but not sufficient for this design:

- it has no direct allocator unit suite;
- an oversized `CORE` document is still selected as full text;
- if `CORE full text + all summaries` exceeds the limit, Stage 4 throws rather than reducing hierarchically;
- the final validator does not subtract `SYSTEM_PROMPT_RESERVE` from the accepted limit;
- summary fidelity and evidence coverage are not validated;
- prompt-level truncation may omit trailing documents without a durable per-document outcome;
- missing full text silently falls back to the existing summary;
- Stage 5 Qdrant utilities exist but have no production callers;
- only Stage 6 `retrieveLessonContext()` is currently reachable from the production job processor;
- Phase 0.5 receives document content but does not explicitly detect, type, source, or persist document conflicts.

The existing `clarifying_questions` table already has JSONB metadata and answer-source tracking, so conflict questions can reuse the current pause/resume workflow. The evidence cards and coverage state need durable storage before the pause and therefore cannot live only in the final `courses.analysis_result` value.

## Goals

- Account for every uploaded document in a durable coverage ledger.
- Preserve useful organization-specific and specialist information without letting low-quality sources dominate the course.
- Detect material contradictions before Stage 4 scope/expert/synthesis phases.
- Resolve conflicts through the existing manual or automatic clarifying workflow.
- Make every automatic decision inspectable and reproducible.
- Handle one huge document or many documents without single-prompt overflow.
- Enrich Stage 5 structure without making documents or Qdrant mandatory.
- Keep Stage 6 retrieval grounded in the same decisions and evidence provenance.
- Provide deterministic budgets, idempotent resume, tenant isolation, and observable degraded behavior.

## Non-Goals

- Treating uploaded documents as universally correct.
- Replacing the model's baseline curriculum design with document-only generation.
- Reintroducing the retired LLM document-to-section mapping as an authoritative Stage 4 phase.
- Sending every document's full text to every model call.
- Blocking courses that legitimately have no documents.
- Performing live staging activation, reindex, deploy, or secret mutation as part of this design work.

## Trust and Precedence Model

Evidence is evaluated on two independent axes:

- `content_quality`: clarity, completeness, internal coherence, extraction quality, and apparent factual support;
- `authority_scope`: `organization_specific`, `course_source`, `general_reference`, or `unknown`.

Precedence is:

1. explicit user conflict resolution;
2. explicit user course requirements and constraints;
3. persisted automatic resolution when the course is in automatic mode;
4. uncontested organization-specific evidence within its stated scope;
5. uncontested high-confidence course-source evidence;
6. baseline curriculum and general model knowledge;
7. low-confidence or unknown-authority claims as optional leads, never silent facts.

A low-quality document is still assessed. It may be excluded from direct prompt influence, but its exclusion and reason remain in the ledger. A company-specific source may be authoritative despite poor prose quality; conflicts are surfaced rather than resolved only from writing quality.

## Architecture

### Pipeline

```text
Stage 2 extraction
  -> Stage 3 summary, quality and priority
  -> Qdrant dense + native BM25 index
  -> Stage 4 Phase 1 classification
  -> Document Evidence Preflight
       -> evidence cards for every document
       -> coverage ledger
       -> claim-level conflict detection
       -> targeted Qdrant source verification
  -> Stage 4 Phase 0.5
       -> ordinary questions
       -> separate document-conflict block
       -> manual answers or persisted system decisions
  -> Stage 4 scope, expert analysis and synthesis
  -> Stage 5 baseline structure
  -> Stage 5 advisory evidence enrichment
  -> Stage 6 targeted lesson retrieval
```

### Document Evidence Preflight

The preflight runs only when indexed or recoverable documents exist. It runs after Phase 1 so topic classification can guide relevance, but before Phase 0.5 so conflicts can be resolved before downstream analysis.

It performs four steps:

1. Build or reuse one evidence card per document.
2. Verify that every input document has a coverage status.
3. Compare normalized claims in bounded batches and reduce them into course-level conflicts.
4. Use tenant/course-filtered Qdrant retrieval to verify the source fragments behind material conflicts.

The preflight is idempotent by `course_id + input_fingerprint + evidence_version`. Resuming Stage 4 reuses the same accepted run unless the document set, source version hashes, course topic, or evidence schema version changes.

### Large-Corpus Strategy

The allocator becomes a progressive evidence allocator rather than a single-prompt selector.

- Every document contributes at least metadata and a validated evidence card.
- A small `CORE` document may use full text.
- An oversized `CORE` document uses hierarchical map/reduce summaries plus selected source passages.
- `IMPORTANT` documents use validated summaries plus targeted retrieval where their claims match the course or a conflict.
- `SUPPLEMENTARY` documents use evidence cards; full passages are fetched only for relevant claims.
- Documents are processed in deterministic token-bounded batches.
- Batch outputs are reduced hierarchically until the aggregate fits the downstream phase budget.
- The effective budget is `min(model_context, STAGE4_HARD_TOKEN_LIMIT) - prompt_reserve - output_reserve`.
- No later prompt may exceed the allocation or independently truncate documents without updating coverage.
- A document that cannot be summarized, retrieved, or verified becomes `degraded` or `failed`; it never disappears from counts.

The system may spend additional model calls for large corpora. It must expose batch count, total input documents, coverage ratio, model usage, and cost.

## Data Contracts

Canonical contracts live in `@megacampus/shared-types` and are validated with Zod.

```typescript
type DocumentAuthorityScope =
  | 'organization_specific'
  | 'course_source'
  | 'general_reference'
  | 'unknown';

type DocumentEvidenceMode =
  | 'full_text'
  | 'hierarchical_summary'
  | 'summary'
  | 'targeted_retrieval'
  | 'metadata_only';

type DocumentCoverageStatus = 'assessed' | 'degraded' | 'failed';

interface EvidenceSourceRef {
  document_id: string;
  chunk_id?: string;
  page_number?: number;
  heading_path?: string;
  version_hash?: string;
}

interface EvidenceClaim {
  claim_id: string;
  statement: string;
  confidence: number;
  source_refs: EvidenceSourceRef[];
}

interface DocumentEvidenceCard {
  document_id: string;
  document_name: string;
  priority: 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY';
  authority_scope: DocumentAuthorityScope;
  content_quality: number;
  course_relevance: number;
  processing_mode: DocumentEvidenceMode;
  summary: string;
  key_claims: EvidenceClaim[];
  terminology: string[];
  constraints: string[];
  limitations: string[];
  coverage_status: DocumentCoverageStatus;
  coverage_reason: string;
  token_counts: {
    original: number;
    summary: number;
    allocated: number;
  };
}

interface DocumentConflict {
  conflict_id: string;
  topic: string;
  severity: 'critical' | 'important' | 'informational';
  sides: Array<{
    statement: string;
    claim_ids: string[];
    document_ids: string[];
    source_refs: EvidenceSourceRef[];
  }>;
  course_impact: string;
  recommended_resolution: string;
  recommendation_rationale: string;
  alternatives: string[];
}

interface DocumentDecision {
  conflict_id: string;
  selected_resolution: string;
  resolved_by: 'user' | 'system';
  rationale: string;
  clarifying_question_id?: string;
  decided_at: string;
}
```

### Coverage Invariant

For every source document ID present at preflight start, exactly one evidence item exists with `assessed`, `degraded`, or `failed`. The aggregate assertion is:

```text
source_document_ids == evidence_item_document_ids
```

Duplicates, missing IDs, and unexplained extra IDs fail the preflight verification.

## Persistence

Add tenant-scoped durable storage rather than placing large intermediate evidence into `generation_progress` or waiting for final `analysis_result`.

### `document_evidence_runs`

One row per evidence run:

- `id`, `course_id`, `organization_id`;
- `input_fingerprint`, `evidence_version`, `status`;
- source/assessed/degraded/failed counts;
- batch/model/token/cost metrics;
- compact conflict and decision summary;
- timestamps and error category without source content.

### `document_evidence_items`

One row per run and document:

- identifiers and source version;
- priority, authority, quality, relevance, processing mode;
- summary, claims, terminology, constraints and limitations as validated JSONB;
- coverage status/reason and token counts;
- unique `(run_id, document_id)`.

### `document_evidence_conflicts`

One immutable detected-conflict record per run:

- `id`, `run_id`, `course_id`, `organization_id`;
- stable conflict fingerprint, topic and severity;
- conflicting sides, claim IDs and source references as validated JSONB;
- course impact, recommended resolution, rationale and alternatives;
- detection model/version and timestamps;
- unique `(run_id, conflict_fingerprint)`.

Informational conflicts remain here even when they do not create a clarifying question.

### `document_evidence_decisions`

Append-only resolution events:

- `id`, `run_id`, `conflict_id`, `clarifying_question_id` when applicable;
- selected resolution, rationale and `resolved_by: user | system`;
- answer source, selected recommendation index/value and timestamp;
- optional `supersedes_decision_id` for a later user override.

Decisions are never updated in place. The current resolution is the latest valid event in the chain.

### Clarifying questions

Reuse `clarifying_questions` for manual and automatic resolution:

- add `document_conflicts` to the canonical question-category union;
- store `conflict_id`, document IDs, source references, recommendation and evidence-run ID in `metadata`;
- add `system` to the canonical `AnswerSource` union;
- update the automatic-answer RPC to persist `answer_source = 'system'`;
- keep conflict questions `critical` or `important`, so the existing manual pause and approval checks remain authoritative.

The final `analysis_result` stores a compact `document_evidence` snapshot containing the accepted run ID, coverage totals, current decision IDs and unresolved informational conflict IDs. Full evidence cards, conflicts and append-only decision history remain in the evidence tables.

RLS and service access must match course organization ownership. Logs and traces contain IDs, counts, modes and error categories, never document content, claims, answers or credentials.

## Conflict UX and Resolution

The clarifying UI displays a separate block titled `Document conflicts` / `Противоречия в документах`.

Each item shows:

- the conflicting statements;
- document names and precise page/section references when available;
- expected effect on the course;
- the recommended resolution and rationale;
- mutually exclusive alternatives.

Manual mode uses the existing `stage_4_clarifying` pause. The course cannot proceed while any critical or important conflict question remains pending.

Automatic mode selects the recommended answer atomically and records:

- `answer_source: system`;
- selected recommendation index/value;
- evidence-run and conflict IDs;
- recommendation rationale;
- `resolved_by: system` and timestamp in the decision ledger.

Informational differences do not block. They remain visible in the final evidence summary.

If evidence processing for a document is degraded, manual mode presents an important decision to retry, continue with limited evidence, or remove the document. Automatic mode retries within the configured bound, then selects `continue with limited evidence` and records the system decision.

## Stage 4 Behavior

- The no-document path skips evidence preflight and preserves current outputs.
- Phase 1 remains the topic/category baseline.
- Evidence preflight contributes conflicts, organization-specific constraints and verified claims.
- Phase 0.5 receives regular question context plus the structured conflict list.
- Scope, expert and synthesis phases consume the decision ledger and compact evidence summary.
- Documents may add missing topics or constraints, but a document-only topic cannot displace baseline curriculum requirements unless a user/system conflict decision explicitly allows it.
- Stage 4 cannot silently continue after partial evidence loss. It must either obtain a decision or persist an automatic degraded-mode decision.

## Stage 5 Advisory Enrichment

Stage 5 becomes a two-pass workflow:

1. Generate and validate the baseline course structure from the topic, user requirements, Stage 4 analysis and clarifying decisions.
2. Enrich the accepted baseline using bounded section-level Qdrant retrieval.

The enrichment pass may:

- add organization-specific terminology and constraints;
- add relevant examples, cases, standards and source-backed subtopics;
- attach evidence references and search queries to lesson specifications;
- flag a baseline section that conflicts with an accepted decision.

It may not:

- remove required baseline coverage solely because retrieval returned no results;
- make Qdrant availability a prerequisite for course generation;
- allow low-confidence evidence to override user requirements;
- exceed existing lesson/section size constraints without revalidation.

The Stage 5 result records enrichment status: `not_applicable`, `applied`, `no_relevant_evidence`, `degraded`, or `failed_open_with_decision`. The live production caller must be wired explicitly; dormant helper activation alone does not satisfy this design.

## Stage 6 Behavior

Stage 6 retains targeted hybrid retrieval, Formula priority weighting and document grouping. It additionally consumes accepted document decisions and evidence references from the lesson specification.

Retrieval remains optional for courses without documents. For document-backed courses marked as requiring evidence, an unavailable or incomplete evidence path follows the existing required-RAG retry/error policy and must not silently fabricate source-backed content.

## Failure and Recovery

- Evidence runs are resumable and idempotent by fingerprint/version.
- A changed document set or version invalidates the prior run and starts a new one.
- Individual document failure is recorded without losing successful items.
- Batch/model failure retries within a bounded policy and checkpoints after each batch.
- Qdrant failure may defer targeted verification, but it cannot erase evidence cards or conflicts already derived from summaries.
- Manual degraded decisions pause through Phase 0.5; automatic degraded decisions are persisted as system decisions.
- Re-running Stage 4 reuses accepted user/system decisions when their conflict fingerprint is unchanged.
- No live alias switch, reindex or staging mutation is required for local implementation tests.

## Observability

Expose or record:

- evidence runs by status;
- source, assessed, degraded and failed document counts;
- evidence coverage ratio;
- full/summary/hierarchical/retrieval/metadata-only mode counts;
- batch count, tokens, model calls, cost and duration;
- conflicts by severity;
- user- versus system-resolved decisions;
- automatic degraded-mode decisions;
- Stage 5 enrichment outcomes;
- Stage 5/6 retrieval fallback rates.

Alerts must cover failed evidence runs, coverage below 100%, repeated degraded automatic decisions, and stale/unresolved critical conflicts. Document text and claim bodies are excluded from metrics and ordinary logs.

## Validation Strategy

### Unit and property tests

- Zero-document path remains unchanged.
- One small document, one oversized `CORE`, mixed priorities, and 1,000-document fixtures.
- Every source ID appears exactly once in the coverage ledger.
- Effective budget includes prompt/output reserves and never exceeds the hard limit.
- Hierarchical reduction is deterministic and converges under the configured bound.
- Invalid token metadata, summary larger than source, missing full text and missing summary fail or degrade explicitly.
- Authority and quality remain independent.
- Conflict fingerprints are stable across retries.
- Manual and automatic decisions persist distinct `resolved_by`/`answer_source` values.
- Resume does not duplicate evidence items, questions or decisions.
- Stage 5 baseline is identical when documents are absent or enrichment finds nothing.
- Stage 5 enrichment cannot remove baseline requirements or violate size constraints.

### Integration tests

- Database migrations, RLS and tenant/course isolation for evidence rows.
- Existing clarifying pause/resume with a separate conflict block.
- Automatic atomic answers persisted as system decisions.
- RU and EN conflict generation and source-reference rendering.
- Pinned Qdrant `1.18.2` targeted verification, native BM25/RRF/Formula and grouping.
- Large corpus processed across multiple batches with complete coverage.
- Stage 4 restart after a mid-run failure.
- Stage 5 no-document, relevant-evidence, irrelevant-evidence and Qdrant-unavailable paths.
- Stage 6 respects accepted decisions and does not leak cross-tenant evidence.

### Acceptance gates

- Focused Stage 3/4/5/6 tests.
- Shared contract and migration tests.
- Pinned Qdrant integration.
- `pnpm type-check` and `pnpm build`.
- Process verification and stage closeout.
- Documentation review and Graphify refresh.

## Rollout

1. Add contracts, persistence and allocator verification behind `DOCUMENT_EVIDENCE_ENABLED`.
2. Run evidence preflight in shadow mode and compare coverage/conflicts without changing generation.
3. Enable the conflict block for internal/manual courses.
4. Enable automatic system decisions with audit metrics.
5. Enable Stage 5 enrichment for a bounded cohort while preserving the baseline result.
6. Promote after coverage, cost, latency, false-conflict and enrichment-quality thresholds are accepted.

Rollback disables evidence preflight and Stage 5 enrichment while leaving stored audit rows intact. The current no-document and Stage 6 baseline paths remain available throughout rollout.

## Relationship to the Existing Qdrant Epic

This design expands `mc2-jz6y0` rather than replacing its remaining work.

- Q7 reindex must finish and be accepted because evidence verification depends on correct document-scoped points and recoverable indexing.
- Q6 secure self-hosted runtime may proceed independently after the observability version decision.
- The evidence data contracts and allocator tests can proceed in parallel with Q6.
- Conflict persistence depends on the evidence contracts and precedes conflict UI/automatic resolution.
- Stage 5 enrichment depends on accepted evidence/decision contracts and the Q5 pinned retrieval gate.
- Q8 Qdrant snapshots must preserve the indexed source references used by evidence verification; database evidence rows remain under the existing PostgreSQL backup policy. Q9 monitoring includes evidence-related metrics and alerts.
- Q10 documentation covers optional documents, trust, conflicts, coverage and advisory enrichment.
- Q11 verifies both no-document and large-document workflows.
- Q12 remains the explicit authorization gate for staging mutation.

The existing grouping follow-up `mc2-jz6y0.16` is superseded in scope: grouping must be enabled in the genuinely live Stage 5 enrichment caller and the live Stage 6 retriever, not in dormant helpers merely to reach an arbitrary count of three callers.

## Security and Privacy

- All evidence rows are organization/course scoped with RLS and admin-service checks.
- Qdrant queries always include organization and course filters.
- Evidence prompts use only documents belonging to the same course and organization.
- Logs, metrics, Beads artifacts and orchestration artifacts never contain document content or user answers.
- Source excerpts shown in the UI are bounded and escaped.
- Automatic decisions are immutable audit events; later user overrides create a new decision rather than rewriting history.

## Documentation Impact

Required durable updates after implementation:

- Stage 4 phase and clarifying-question documentation;
- Stage 5 generation and RAG integration documentation;
- Stage 6 evidence/decision consumption documentation;
- primary document/evidence data-flow architecture;
- operator guidance for large corpora, degraded evidence and retries;
- project index entries for evidence contracts, storage, tools and tests.

Graphify must be refreshed after contracts, migrations and live Stage 5/6 entrypoints change.

## Open Implementation Decisions

The implementation plan must resolve these through repository evidence, without changing the confirmed product decisions:

1. Exact batch token/count defaults and retry limits.
2. Whether evidence summaries reuse Stage 3 summaries directly or version them through a dedicated evidence-card generator.
3. Exact shadow-rollout acceptance thresholds for cost, latency and false-conflict rate.
4. Whether informational conflicts are displayed in the initial clarifying UI or only in the final evidence summary.

These are bounded implementation choices. They do not alter optional-document support, complete coverage, separate conflict questions, or automatic system-decision persistence.
