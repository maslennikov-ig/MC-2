# Stage 4: Analysis

## Overview

Stage 4 performs deep content analysis to extract pedagogical insights, course structure recommendations, and generation guidance. Documents are optional advisory evidence: a course without documents remains fully supported, while every uploaded document in an enabled evidence run is durably accounted for before clarifying questions.

**Input:** Course topic, language, user requirements, and optional document summaries (from Stage 3)
**Output:** Complete `AnalysisResult`, including an optional compact document-evidence snapshot, stored in `courses.analysis_result`

## Architecture

### Core Components

- **Orchestrator:** `orchestrator.ts` - LangGraph StateGraph with 4 analysis phases + assembly
- **Handler:** `handler.ts` - BullMQ job handler with progress tracking
- **Phases:** `phases/` - Individual phase implementations

### Phase Pipeline

```
Analysis Job Input
    |
    v
Phase 0: Pre-Flight (Stage 3 Barrier + Input Validation)
    |
    v
Budget Allocation (Token Budget for Documents)
    |
    v
Phase 1: Classifier (Course Category + Topic Analysis + Missing Elements)
    |
    v
Document Evidence Preflight (optional, after Phase 1)
    |   -> exact per-document coverage ledger
    |   -> bounded hierarchy + targeted source verification
    |   -> material conflict/degraded-evidence decision subjects
    |
    v
Phase 0.5: Clarifying Questions (Data-Driven, Enriched with Phase 1 Output)
    |          |
    |     [PAUSE in manual mode while required questions are unresolved]
    |     [automatic mode atomically persists recommended system decisions]
    |
    v
Phase 2: Scope (Course Structure + Lessons Distribution)
    |
    v
Phase 3: Expert (Pedagogical Strategy + Research Flags)
    |
    v
Phase 4: Synthesis (Generation Guidance + Content Strategy)
    |
    v
Phase 5: Assembly (Pure Logic - Combine All Outputs)
    |
    v
AnalysisResult -> courses.analysis_result
```

---

## Optional document evidence

The production entrypoint is `runDocumentEvidencePhase()` in
`orchestrator-phase-helpers.ts`. It runs after Phase 1 and before the existing
Phase 0.5 boundary.

- `DOCUMENT_EVIDENCE_ENABLED` must be `true` to run the preflight.
- `DOCUMENT_EVIDENCE_MODE` is `shadow` unless its value is exactly `active`.
- Disabled and zero-document courses skip the preflight. Shadow mode persists
  evidence and may attach its compact audit pointer, but it does not create
  conflict decisions or replace Phase 2-4 document inputs with the bounded
  advisory representation. Active mode can supply that representation and the
  decision ledger to later phases.
- Shadow conflict detection is an integration dependency on tracked task
  `mc2-jz6y0.24.3`. After its GREEN change is integrated, shadow detects and
  persists conflicts but still creates no questions/decisions and has no
  downstream influence. Do not claim shadow conflict evidence from this docs
  branch alone.
- Downstream evidence consumption uses the same exact active gate: both
  `DOCUMENT_EVIDENCE_ENABLED=true` and `DOCUMENT_EVIDENCE_MODE=active` are
  required. A shadow snapshot is not consumed by the Stage 5 evidence pass or
  the Stage 6 evidence loader.
- Documents supplement the baseline. Explicit user decisions and requirements
  take precedence; persisted automatic decisions, scoped authoritative evidence,
  course-source evidence, and the baseline follow in that order. Low-confidence
  or unknown-authority claims remain leads, not silent facts.

### Complete coverage and large corpora

`evidence/preflight.ts` enumerates the authoritative course source set and
persists one card per source. An accepted run requires exact set equality: every
source document has exactly one `assessed`, `degraded`, or `failed` outcome.
Coverage below 100% is an invariant failure, not an acceptable rollout level.

Large inputs are processed in deterministic token-bounded batches. Oversized
documents use per-card hierarchy before cross-document reduction; checkpoints
include source/version identity, model and tokenizer safety metadata. Resume
reuses committed map/reduce and targeted-verification work without replaying it,
while a changed source set/version or semantic input fingerprint creates a new
run. Context overflow never authorizes silent tail truncation.

Qdrant is used only for targeted claim/source verification in this preflight.
Every query is filtered by `organization_id`, `course_id`, and the required
document set, uses document grouping, and rejects foreign or stale refs. A
Qdrant outage may degrade verification but cannot erase cards or conflicts
already derived from source summaries.

### Conflicts, degraded evidence, and audit

Critical and important document conflicts are distinct required
`document_conflicts` questions. Manual courses stop at the existing
`stage_4_clarifying` Phase 0.5 boundary. Automatic courses atomically select the
persisted recommendation and append both `answer_source: system` and
`resolved_by: system`, including rationale, recommendation identity, run and
conflict provenance. Informational differences remain non-blocking.

Degraded/failed evidence uses the same durable decision workflow. Manual mode
offers the supported retry/continue-limited/remove choices. Automatic mode uses
bounded retry and records its system choice. Decisions are append-only; a later
user override appends a superseding event instead of rewriting history.

Durable rows live in `document_evidence_runs`, `document_evidence_items`,
`document_evidence_conflicts`, and `document_evidence_decisions`, with batch,
conflict, and retry checkpoints beside them. `AnalysisResult.document_evidence`
contains only the accepted run ID, coverage totals, current decision IDs,
unresolved informational conflicts, and Stage 5 enrichment status. Source and
answer bodies remain in durable storage. Metrics/dashboards/alerts and ordinary
new evidence-specific logs contain no product IDs, runtime hashes, content, raw
errors, or model names; engineering task/commit IDs in Beads and orchestration
artifacts are not product data.

Operational rollout, recovery, and rollback are documented in
[`docs/operations/document-evidence.md`](../../../../../docs/operations/document-evidence.md).

---

## Phases

### Phase 1: Classifier

**File:** `phases/phase-1-classifier.ts`
**Model:** Configured via database (llm_model_config table)

**Purpose:** Categorize course and generate contextual language elements.

**Output:**

- `course_category`: Primary/secondary categories (e.g., "programming/theory")
- `contextual_language`: Pedagogical context elements:
  - `why_matters_context`: Motivation framing
  - `motivators`: Learning incentives
  - `experience_prompt`: Engagement hooks
  - `problem_statement_context`: Problem framing
  - `knowledge_bridge`: Prior knowledge connection
  - `practical_benefit_focus`: Real-world applications
- `topic_analysis`: Key concepts, determined topic, scope

---

### Phase 2: Scope

**File:** `phases/phase-2-scope.ts`
**Model:** Configured via database (llm_model_config table)

**Purpose:** Define course structure and content distribution.

**Output:**

- `recommended_structure`:
  - `total_lessons`: Number of lessons, normalized to the selected profile or
    explicit size preset
  - `total_sections`: Number of sections
  - `sections_breakdown[]`:
    - `section_id`: Unique identifier
    - `area`: Section topic area
    - `key_topics`: Topics covered
    - `learning_objectives`: Section objectives
    - `estimated_lessons`: Lessons per section
    - `importance`: "simple" | "normal" | "complex" (drives Stage 5 model tier routing)
    - `pedagogical_approach`: Teaching methodology

**Validation:**

- Profile-based auto-size bounds:
  - `general_auto`: minimum 10, target 16-28 lessons, hard maximum 40,
    4-8 sections
  - `role_playbook_bridge`: minimum 12, target 18-24 lessons, hard maximum 30,
    5-7 sections
- Explicit user-selected course sizes keep their preset bounds.
- Phase 2 post-processing normalizes section breakdowns, recomputes totals and
  durations, splits or merges sections to profile bounds, and removes over-large
  auto structures before Stage 5 receives the blueprint.

---

### Phase 3: Expert

**File:** `phases/phase-3-expert.ts`
**Model:** Configured via database (llm_model_config table)

**Purpose:** Generate pedagogical strategy and identify knowledge gaps.

**Output:**

- `pedagogical_strategy`:
  - `assessment_approach`: How learners demonstrate understanding (min 50 chars)
  - `progression_logic`: Learning path rationale (min 100 chars)
- `research_flags[]`: Topics requiring external research
  - `topic`: Research topic
  - `context`: Why research needed
  - `reason`: "rapidly_evolving" | "specialized_domain" | "recent_developments"

---

### Phase 4: Synthesis

**File:** `phases/phase-4-synthesis.ts`
**Model:** Configured via database (supports tier-based selection)

**Purpose:** Synthesize all analysis into generation instructions.

**Output:**

- `generation_guidance`:
  - `tone`: "conversational but precise" | "formal academic" | "casual friendly" | "technical professional"
  - `use_analogies`: Boolean flag
  - `specific_analogies`: Example analogies for topic
  - `avoid_jargon`: Terms to avoid/explain
  - `include_visuals`: Recommended visual aids
  - `exercise_types`: Assessment types
  - `contextual_language_hints`: Audience-specific guidance
  - `real_world_examples`: Practical applications

---

### Phase 5: Assembly

**File:** `phases/phase-5-assembly.ts`
**Model:** None (pure logic, no LLM)

**Purpose:** Combine all phase outputs into validated `AnalysisResult`.

**Operations:**

1. Validate all required phase outputs present
2. Sanitize LLM-generated text (XSS prevention with DOMPurify)
3. Calculate cumulative metadata (tokens, cost, duration)
4. Validate prerequisites chain (circular dependency detection)
5. Validate optional fields (generation_guidance)

**Security:**

- All LLM-generated text sanitized before storage
- Prevents XSS attacks in frontend display

---

## Input

```typescript
interface AnalysisJobInput {
  course_id: string; // UUID
  organization_id: string; // UUID
  user_id: string; // UUID
  topic: string; // Course topic
  language: string; // ISO 639-1 code
  answers?: string | null; // User requirements
  document_summaries?: Array<{
    // From Stage 3
    document_id: string;
    file_name: string;
    processed_content: string;
    processing_method: 'bypass' | 'detailed' | 'balanced' | 'aggressive';
    summary_metadata: {
      original_tokens: number;
      summary_tokens: number;
      compression_ratio: number;
      quality_score: number;
    };
  }> | null;
}
```

---

## Output

```typescript
interface AnalysisResult {
  // Phase 1
  course_category: CourseCategory;
  contextual_language: ContextualLanguage;
  topic_analysis: TopicAnalysis;

  // Phase 2
  recommended_structure: RecommendedStructure;

  // Phase 3
  pedagogical_strategy: PedagogicalStrategy;
  research_flags: ResearchFlag[];

  // Phase 4
  generation_guidance: GenerationGuidance;

  // Optional compact pointer to durable document-evidence state
  document_evidence?: {
    accepted_run_id: string;
    coverage: {
      source_count: number;
      assessed_count: number;
      degraded_count: number;
      failed_count: number;
    };
    current_decision_ids: string[];
    unresolved_informational_conflict_ids: string[];
    enrichment_status:
      | 'not_applicable'
      | 'applied'
      | 'no_relevant_evidence'
      | 'degraded'
      | 'failed_open_with_decision';
  };

  // Metadata
  metadata: {
    analysis_version: string;
    total_duration_ms: number;
    phase_durations_ms: Record<string, number>;
    model_usage: Record<string, string>;
    total_tokens: { input: number; output: number; total: number };
    total_cost_usd: number;
    retry_count: number;
    quality_scores: Record<string, number>; // Phase-level analysis quality signals
    created_at: string;
  };
}
```

---

## Dependencies

### External Services

- **OpenRouter API:** LLM completion (models configured via database)

### Internal Modules

- `shared/llm/langchain-models` - Model factory
- `shared/regeneration/` - 5-layer JSON repair cascade
- `shared/validation/preprocessing` - Enum field normalization
- `shared/utils/sanitize-llm-output` - XSS sanitization
- `shared/logger/` - Structured logging
- `shared/supabase/` - Database operations
- `utils/observability` - Phase execution tracking

---

## Error Handling

### 5-Layer Repair Cascade

When LLM output fails JSON parsing or schema validation:

1. **Layer 1: Auto-Repair** - Regex-based JSON fixes (no LLM)
2. **Layer 2: Critique-Revise** - LLM critiques and fixes output
3. **Layer 3: Partial Regeneration** - Regenerate failed fields only
4. **Layer 4: Model Escalation** - Upgrade to higher-tier model
5. **Layer 5: Emergency** - Hardcoded sensible defaults

**Stage 4 Special:** `allowWarningFallback: true` for advisory fields

### Retry Strategy

- Max 2 retries per phase
- Exponential backoff: 1s, 2s, 4s, 5s (capped)
- Model escalation after retry exhaustion

---

## Configuration

### Environment Variables

```bash
# OpenRouter API
OPENROUTER_API_KEY=sk-or-...

# Quality Settings
ANALYSIS_QUALITY_THRESHOLD=0.75
```

### Model Configuration

All models are configured via database (`llm_model_config` table).
Admin panel allows per-phase model selection with fallback hierarchy:

1. Phase-specific config
2. Global default config
3. Hardcoded emergency fallback

---

## Testing

### Unit Tests

**Location:** `tests/unit/stages/stage4-analysis/`

**Coverage:**

- Each phase in isolation
- JSON parsing and repair
- Schema validation
- Research flag detection
- Field name fixes

**Run:**

```bash
pnpm --filter @megacampus/course-gen-platform exec vitest run \
  --config vitest.config.unit.ts \
  tests/unit/stages/stage4-analysis
```

### Integration Tests

**Location:** `tests/integration/`

**Scenarios:**

- Full pipeline
- Document count variations
- Language handling
- Error recovery paths

**Run:**

```bash
pnpm --filter @megacampus/course-gen-platform exec vitest run \
  --config ../../vitest.shared.ts --root . \
  tests/integration/document-evidence-rls.test.ts \
  tests/integration/document-conflict-auto-decisions.test.ts
```

---

## Utility Functions

### Field Name Fix

**File:** `utils/field-name-fix.ts`

Normalizes common LLM field name variations:

- `assessmentApproach` -> `assessment_approach`
- `progressionLogic` -> `progression_logic`

### Research Flag Detector

**File:** `utils/research-flag-detector.ts`

Detects topics requiring external research:

- Rapidly evolving technologies (AI, blockchain)
- Version-specific content (React 19, Python 3.12)
- Current events and statistics

### Observability

**File:** `utils/observability.ts`

Tracks phase execution metrics:

- Duration per phase
- Token usage
- Model selection
- Quality scores

---

## Output Language

**Critical:** All analysis output is in **English only**, regardless of input language.

- Target language stored separately in `courses.language`
- Stage 5 reads language from database for final generation
- Avoids duplication and ensures single source of truth

---

## Cost Tracking

Evidence runs persist batch/model/token/cost totals for observation. Large
corpora may intentionally use additional model calls to preserve complete
coverage. No cost, latency, or false-conflict rollout threshold is accepted yet;
operators must use the owner-decision fields in the document-evidence runbook
rather than treating historical averages as gates.

---

## Stage Completion

On successful completion:

1. `AnalysisResult` stored in `courses.analysis_result`
2. Course status updated to `stage_4_complete`
3. Stage 5 Generation job enqueued automatically

---

**Last Updated:** 2026-07-11
**Version:** 1.1.0
**Owner:** course-gen-platform team
