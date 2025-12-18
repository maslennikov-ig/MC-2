# RT-002: Architecture Balance - Key Decisions

**Date**: 2025-11-07
**Status**: ✅ COMPLETE
**Research Source**: 2 DeepResearch reports (~67KB)
**Full Analysis**: `.generation-architecture-design.md`, `.rag-decision-analysis.md`

---

## Quick Reference: 4 Key Decisions

### Decision 1: Division of Labor

**Analyze Stage (Stage 4)** → Section-level structure:
- ✅ Document analysis (themes, concept graph, patterns)
- ✅ Pedagogical strategy (theory/practice balance, approach)
- ✅ Section breakdown (3-7 sections, high-level objectives)
- ✅ Generation guidance (tone, constraints, examples)
- ❌ NO lesson-level detail, NO prompts, NO exercises

**Generation Stage (Stage 5)** → Lesson-level detail:
- ✅ Expand sections into 3-5 lessons
- ✅ Detailed objectives (SMART, Bloom's taxonomy)
- ✅ Topic hierarchies with subtopics
- ✅ Exercise specs with rubrics
- ✅ Stage 6 prompts (ready to execute)

**Rationale**: Over-specification in Analyze reduces quality by 15-30%. Let reasoning models reason.

---

### Decision 2: Orchestration Phases

✅ **5-Phase Architecture** (validated by research: 78.5% success rate):

1. **Phase 1: Metadata Generation** → Course-level metadata
2. **Phase 2: Section Batch** → Parallel processing, 1 section per batch
3. **Phase 3: Validation** → Quality check, retry logic (RT-004)
4. **Phase 4: Assembly** → Merge sections into course_structure
5. **Phase 5: Verification** → Final schema validation

**Token Budget per Batch**: 120K total (90K input, 30K output) - from RT-003

---

### Decision 3: RAG Strategy

✅ **Enable OPTIONAL RAG with LLM Autonomy**

**Implementation**:
- Add `qdrantClient?: QdrantClient` optional parameter
- LLM autonomously decides via tool calling (`search_documents` tool)
- Prompt: "Use RAG SPARINGLY - only for exact formulas, legal text, code examples"

**When Enabled**:
- Specialized technical (crypto, ML theory, algorithms)
- Compliance (legal, medical, regulatory)
- Domain-specific (company codebases)
- Updated content (frequently changing docs)

**When Disabled**:
- Generic educational (intro courses, textbook-based)
- Cost-sensitive environments
- MVP phase (simplify initially)

**Cost Impact**: +5-12% per course (2-5 queries average)
**Quality Impact**: +10-15% for specialized, +30-50% for compliance

**Expected Usage**: LLM makes 2-5 RAG queries per course (optimal), not 20+

---

### Decision 4: Granularity Hierarchy

✅ **Section-level in Analyze (3-7 sections)**:
- High-level objectives (3-5 per section)
- Key topics (list, not hierarchy)
- Content type suggestions
- Estimated duration

✅ **Lesson-level in Generation (3-5 per section)**:
- Detailed objectives (measurable, action-oriented)
- Topic hierarchies (with subtopics)
- Exercise specifications (with difficulty, rubrics)
- Stage 6 prompts (executable)

**Rationale**: Matches natural document structure, avoids over-specification, enables adaptive reasoning.

---

## Schema Changes Required

### Analyze Output (`analysis_result`) Enhancements

**NEW FIELDS TO ADD** (separate Analyze improvement task):

```typescript
interface AnalysisResult {
  // NEW: Document-level understanding
  document_analysis: {
    source_materials: string[];
    main_themes: Array<{theme: string; importance: string; coverage: string}>;
    concept_graph?: {nodes: [...]; relationships: [...]};
    complexity_assessment: string;
    estimated_total_hours: number;
  };

  // NEW: Pedagogical patterns observed
  pedagogical_patterns: {
    primary_strategy: string;
    theory_practice_ratio: string;
    assessment_types: string[];
    key_patterns: string[];
  };

  // ENHANCED: Generation guidance (more detailed)
  generation_guidance: {
    tone: string;
    use_analogies: boolean;
    avoid_jargon: string[];
    include_visuals: string[];
    exercise_types: string[];
    contextual_language_hints: string;
  };

  // ENHANCED: Section breakdown (add prerequisites, difficulty)
  sections_breakdown: Array<{
    section_id: string;
    title: string;
    learning_objectives: string[];  // 3-5 high-level
    key_topics: string[];  // List only
    content_types: string[];
    estimated_duration_hours: number;
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    prerequisites: string[];  // section_ids
  }>;
}
```

**Action**: Create separate task for Analyze Stage 4 improvement (NOT part of this feature)

---

## Implementation Priorities

### HIGH PRIORITY (Core Architecture)
- T013-T018: Orchestration phases (5-phase flow)
- T019: Metadata generator (Phase 1)
- T020: Section batch generator (Phase 2, core logic)
- T003: Token budget constants (RT-003 finalized)

### MEDIUM PRIORITY (RAG Integration)
- T022: Qdrant search utility (tool-calling interface)
- RAG integration in T020 (add `qdrantClient` parameter)
- Embedding pipeline during Analyze (separate task)

### LOW PRIORITY (Post-MVP)
- A/B testing: RAG vs no-RAG
- Query pattern monitoring
- Cost optimization tuning

---

## References for Implementation

**When implementing T019 (metadata-generator)**:
- Input: `analysis_result` with section-level breakdown
- Output: Course-level metadata (title, description, outcomes)
- Model: TBD by RT-001
- Token budget: Validate using RT-003 constants
- NO RAG needed (metadata is reasoning task)

**When implementing T020 (section-batch-generator)**:
- Input: `analysis_result` + `section_id`
- Output: 3-5 lessons for ONE section
- Model: TBD by RT-001 (default OSS 20B, escalate if needed)
- Token budget: 120K total (90K input, 30K output)
- RAG: OPTIONAL via `qdrantClient` parameter
  - If provided: LLM can call `search_documents` tool
  - If undefined: No RAG, Generation uses analysis_result only
- Prompt: Include "Use RAG SPARINGLY" instruction

**When implementing T022 (qdrant-search)**:
- Interface: Tool-calling compatible (`search_documents` tool)
- Input: `query: string`, `limit: number`, `filter?: {section_id: string}`
- Output: Array of chunks with metadata
- Token counting: Count retrieved tokens toward 90K input limit
- Enrichment: Chunks include section context, concepts (from Analyze)

---

## Quality Metrics (Expected)

**Success Rates** (from research):
- Course structure accuracy: 80-90%
- Learning objective quality: 75-85%
- Lesson specs sufficiency: >90%
- Pedagogical consistency: 80-90%
- Zero hallucinated structures: >95%

**Cost per Course**:
- WITHOUT RAG: $0.80-1.60
- WITH RAG (selective): $0.90-1.85 (+12%)

**Quality Improvement with RAG**:
- Generic courses: +0-5%
- Specialized courses: +10-15%
- Compliance courses: +30-50%

---

## Prompt Engineering Guidelines

### Analyze Stage Prompt (Section-Level Focus)

```
Role: Educational materials analyst
Task: Extract course structure and pedagogical patterns

Output: Section-level breakdown (3-7 sections)
- High-level learning objectives (3-5 per section)
- Key topics (list, not hierarchy)
- Pedagogical patterns observed
- Generation constraints and guidance

Avoid: Lesson-level detail, specific prompts, exercise design
```

### Generation Stage Prompt (Lesson-Level Elaboration)

```
Role: Course designer and curriculum architect

Input: analysis_result (section-level structure)
Task: Expand EACH section into 3-5 detailed lessons

For each lesson:
- Learning objectives (SMART format, Bloom's taxonomy)
- Topic hierarchies (with subtopics)
- Exercise specifications (type, difficulty, rubrics)
- Stage 6 prompts (executable, with examples)

Quality criteria:
- Objectives must be measurable
- Lessons follow prerequisite order
- Exercises align with objectives

[IF qdrantClient provided]
You have access to `search_documents` tool.
Use SPARINGLY - only for exact formulas, legal text, code examples.
Do NOT query for generic concepts or creative elaboration.
```

---

## Next Steps After RT-002

1. ✅ RT-002 COMPLETE - Architecture decisions made
2. ⏭️ RT-001: Multi-Model Orchestration - Assign models to phases
3. ⏭️ RT-004: Quality Validation - Define retry logic, thresholds
4. ⏭️ RT-006: Bloom's Taxonomy - Validation rules for objectives
5. ⏭️ Begin Implementation - T013-T022 with RT-002 decisions applied

---

## Critical Reminders for Implementation

**DON'T OVER-SPECIFY**: Research shows over-constraining reduces quality by 15-30%

**USE TOKEN BUDGET**: RT-003 constants MUST be used (120K total, 90K input, 40K RAG max)

**RAG IS OPTIONAL**: Start without RAG for generic courses, enable for specialized

**SECTION → LESSON**: Analyze outputs sections (3-7), Generation expands to lessons (3-5 per section)

**LLM AUTONOMY**: Let reasoning models reason - provide constraints, not instructions

---

**Document Status**: ✅ COMPLETE - Ready for tasks.md updates
