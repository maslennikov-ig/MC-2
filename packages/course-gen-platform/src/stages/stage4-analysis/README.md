# Stage 4: Analysis

## Overview

Stage 4 performs deep content analysis to extract pedagogical insights, course structure recommendations, and generation guidance. It runs a multi-phase LLM pipeline that transforms document summaries into actionable course blueprints for Stage 5 Generation.

**Input:** Course topic, language, user requirements, document summaries (from Stage 3)
**Output:** Complete `AnalysisResult` stored in `courses.analysis_result` JSONB column

## Architecture

### Core Components

- **Orchestrator:** `orchestrator.ts` - LangGraph StateGraph with 6 analysis phases
- **Handler:** `handler.ts` - BullMQ job handler with progress tracking
- **Phases:** `phases/` - Individual phase implementations

### Phase Pipeline

```
Analysis Job Input
    |
    v
Phase 1: Classifier (Course Category + Contextual Language)
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
Phase 6: RAG Planning (Document-Section Mapping) [Optional]
    |
    v
AnalysisResult -> courses.analysis_result
```

---

## Phases

### Phase 1: Classifier
**File:** `phases/phase-1-classifier.ts`
**Model:** OSS 20B (fast, cost-effective)

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
- `pedagogical_patterns`: (Optional) Teaching patterns for category

---

### Phase 2: Scope
**File:** `phases/phase-2-scope.ts`
**Model:** OSS 20B

**Purpose:** Define course structure and content distribution.

**Output:**
- `recommended_structure`:
  - `total_lessons`: Number of lessons (minimum 10, enforced)
  - `total_sections`: Number of sections
  - `sections_breakdown[]`:
    - `section_id`: Unique identifier
    - `area`: Section topic area
    - `key_topics`: Topics covered
    - `learning_objectives`: Section objectives
    - `estimated_lessons`: Lessons per section
    - `importance`: "critical" | "important" | "supplementary"
    - `prerequisites`: Dependency chain

**Validation:**
- Minimum 10 total lessons (FR-015)
- Circular dependency detection in prerequisites

---

### Phase 3: Expert
**File:** `phases/phase-3-expert.ts`
**Model:** OSS 120B (complex pedagogical reasoning)

**Purpose:** Generate pedagogical strategy and identify knowledge gaps.

**Output:**
- `pedagogical_strategy`:
  - `teaching_style`: "hands_on" | "conceptual" | "project_based" | "lecture_based"
  - `practical_focus`: "high" | "medium" | "low"
  - `progression_logic`: Learning path rationale
- `expansion_areas`: Topics for optional deep-dives
- `research_flags[]`: Topics requiring external research
  - `topic`: Research topic
  - `context`: Why research needed
  - `reason`: "rapidly_evolving" | "specialized_domain" | "recent_developments"

---

### Phase 4: Synthesis
**File:** `phases/phase-4-synthesis.ts`
**Model:** Adaptive (20B for <3 docs, 120B for 3+ docs)

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
- `content_strategy`: "create_from_scratch" | "expand_and_enhance" | "optimize_existing"

**Strategy Selection:**
- <3 documents: "create_from_scratch"
- 3-10 documents: "expand_and_enhance"
- 10+ documents: "optimize_existing"

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
5. Validate optional fields (pedagogical_patterns, generation_guidance)

**Security:**
- All LLM-generated text sanitized before storage
- Prevents XSS attacks in frontend display

---

### Phase 6: RAG Planning
**File:** `phases/phase-6-rag-planning.ts`
**Model:** OSS 20B
**Condition:** Only runs if documents exist

**Purpose:** Pre-map documents to sections for efficient RAG in Stage 5.

**Output:**
- `document_relevance_mapping`:
  - Per section:
    - `primary_documents`: Relevant document IDs
    - `key_search_terms`: 3-10 RAG query terms
    - `expected_topics`: 2-8 topics covered
    - `document_processing_methods`: "full_text" | "hierarchical" per doc

**Cost Optimization:**
- Enables SMART mode in Stage 5 (45x cost savings)
- Pre-computed mapping eliminates runtime Planning LLM calls
- Targeted RAG queries only relevant documents per section

---

## Input

```typescript
interface AnalysisJobInput {
  course_id: string;              // UUID
  organization_id: string;        // UUID
  user_id: string;                // UUID
  topic: string;                  // Course topic
  language: string;               // ISO 639-1 code
  answers?: string | null;        // User requirements
  document_summaries?: Array<{    // From Stage 3
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
  pedagogical_patterns?: PedagogicalPatterns;

  // Phase 2
  recommended_structure: RecommendedStructure;

  // Phase 3
  pedagogical_strategy: PedagogicalStrategy;
  expansion_areas: ExpansionArea[] | null;
  research_flags: ResearchFlag[];

  // Phase 4
  generation_guidance: GenerationGuidance;
  content_strategy: ContentStrategy;

  // Phase 6
  document_relevance_mapping: DocumentRelevanceMapping;

  // Metadata
  metadata: {
    analysis_version: string;
    total_duration_ms: number;
    phase_durations_ms: Record<string, number>;
    model_usage: Record<string, string>;
    total_tokens: { input: number; output: number; total: number };
    total_cost_usd: number;
    retry_count: number;
    quality_scores: Record<string, number>;
    created_at: string;
  };
}
```

---

## Dependencies

### External Services
- **OpenRouter API:** LLM completion (gpt-oss-20b, gpt-oss-120b)
- **Jina Embeddings:** Semantic validation (optional, Phase 6)

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
4. **Layer 4: Model Escalation** - Upgrade to 120B model
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

# Model Selection
ANALYSIS_MODEL_LIGHT=openai/gpt-oss-20b
ANALYSIS_MODEL_HEAVY=openai/gpt-oss-120b

# Quality Settings
ANALYSIS_QUALITY_THRESHOLD=0.75
```

### Phase Model Mapping

| Phase | Default Model | Condition |
|-------|--------------|-----------|
| Phase 1 | gpt-oss-20b | Always |
| Phase 2 | gpt-oss-20b | Always |
| Phase 3 | gpt-oss-120b | Complex reasoning |
| Phase 4 | gpt-oss-20b | <3 docs |
| Phase 4 | gpt-oss-120b | 3+ docs |
| Phase 6 | gpt-oss-20b | Documents exist |

---

## Testing

### Unit Tests
**Location:** `tests/unit/stages/stage4/`

**Coverage:**
- Each phase in isolation
- JSON parsing and repair
- Schema validation
- Research flag detection
- Field name fixes

**Run:**
```bash
pnpm test tests/unit/stages/stage4/
```

### Integration Tests
**Location:** `tests/integration/`

**Scenarios:**
- Full 6-phase pipeline
- Document count variations
- Language handling
- Error recovery paths

**Run:**
```bash
pnpm test tests/integration/stage4-*
```

---

## Utility Functions

### Field Name Fix
**File:** `utils/field-name-fix.ts`

Normalizes common LLM field name variations:
- `teaching-style` -> `teaching_style`
- `practicalFocus` -> `practical_focus`

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

### Model Pricing (per 1M tokens)

| Model | Input | Output |
|-------|-------|--------|
| gpt-oss-20b | $0.03 | $0.14 |
| gpt-oss-120b | $0.04 | $0.18 |

### Average Analysis Costs

| Document Count | Total Cost |
|----------------|------------|
| 0 docs | ~$0.02-0.05 |
| 1-2 docs | ~$0.05-0.10 |
| 3-10 docs | ~$0.10-0.25 |
| 10+ docs | ~$0.25-0.50 |

---

## Stage Completion

On successful completion:
1. `AnalysisResult` stored in `courses.analysis_result`
2. Course status updated to `stage_4_complete`
3. Stage 5 Generation job enqueued automatically

---

**Last Updated:** 2025-11-21
**Version:** 1.0.0
**Owner:** course-gen-platform team
