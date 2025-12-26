# Architecture Changelog: Stages 4-5-6

---

## V2.2 - Targeted Refinement & Mermaid Fix Pipeline (2025-12-25)

**Status**: IMPLEMENTED
**Version**: 2.2.0

### Summary

V2.2 introduces the **Targeted Refinement System** for surgical content fixes and the **Mermaid Fix Pipeline** for eliminating diagram syntax issues. These improvements reduce token costs by 60-70% and eliminate Mermaid rendering failures.

### New Features

#### 1. Targeted Refinement System (ADR-002)

Replaces full regeneration with surgical fixes for specific issues:

- **Severity-Based Routing**: CRITICAL -> REGENERATE, MAJOR -> FLAG_TO_JUDGE, MINOR -> SURGICAL_EDIT
- **CLEV Voting Consensus**: 2 judges + conditional 3rd for verification accuracy
- **Section Locking**: Max 2 edits per section prevents infinite loops
- **Best-Effort Fallback**: Returns HIGHEST-scoring iteration (not original) when max iterations reached
- **FREE Model for Patches**: Patcher uses `xiaomi/mimo-v2-flash:free` for cost efficiency

**Token Cost Reduction**: 60-70% (patches ~300 tokens vs regeneration ~3000 tokens)

#### 2. Mermaid Fix Pipeline (ADR-003)

3-layer defense architecture against Mermaid syntax issues:

- **Layer 1 - Prevention**: Prompt instructions in `prompt-registry.ts` reduce escaped quote generation
- **Layer 2 - Auto-Fix**: `mermaid-sanitizer.ts` removes `\"` escaped quotes automatically
- **Layer 3 - Detection**: `heuristic-filter.ts` catches edge cases, triggers REGENERATE (not expensive Judge)

**Key Decision**: Mermaid issues are CRITICAL severity (triggers self-regeneration, not Judge review)

### Architecture Decisions

- [ADR-002: Targeted Refinement System](../ADR-002-TARGETED-REFINEMENT-SYSTEM.md)
- [ADR-003: Mermaid Fix Pipeline](../ADR-003-MERMAID-FIX-PIPELINE.md)

### Files Added

```
packages/course-gen-platform/src/stages/stage6-lesson-content/
  utils/
    mermaid-sanitizer.ts           # Layer 2: Auto-fix Mermaid syntax
    markdown-section-parser.ts     # Section content extraction
    section-regenerator.ts         # Section-level regeneration

  judge/targeted-refinement/
    task-executor.ts               # Patcher and Expander execution
    events.ts                      # Refinement event emitter
    types.ts                       # Iteration context types
    content-utils.ts               # Content manipulation utilities

tests/stages/stage6-lesson-content/
    targeted-refinement-cycle.e2e.test.ts  # 23 E2E tests
    mermaid-fix-pipeline.e2e.test.ts       # 27 E2E tests
```

### Files Modified

```
packages/course-gen-platform/src/stages/stage6-lesson-content/
  judge/
    heuristic-filter.ts            # Added checkMermaidSyntax()
    patcher/patcher-prompt.ts      # Markdown structure guidance
    verifier/delta-judge.ts        # CLEV voting verification
    section-expander/index.ts      # Section regeneration support

  nodes/
    self-reviewer-node.ts          # CRITICAL severity for Mermaid
    generator.ts                   # Sanitizer integration

  orchestrator.ts                  # Iteration control flow
  state.ts                         # Section lock tracking

packages/course-gen-platform/src/shared/prompts/
  prompt-registry.ts               # Mermaid instructions added
```

### Test Coverage

- **Total Stage 6 Tests**: 262+ (all passing)
- **Mermaid Pipeline E2E**: 27 tests
- **Targeted Refinement E2E**: 23 tests
- **Self-Reviewer Node**: 15 tests
- **Heuristic Filter**: 45+ tests

### Metrics & Monitoring

| Metric | Before V2.2 | After V2.2 |
|--------|-------------|------------|
| Token cost per refinement | ~$0.30 | ~$0.05-0.10 |
| Mermaid rendering failures | 15-30% | ~0% |
| Average iterations to pass | 2.5 | 1.8 |
| Best-effort fallback rate | N/A | <5% |

### Migration Notes

- No breaking changes to public APIs
- Existing courses automatically benefit from new pipeline
- Mermaid sanitizer runs on all new content generation

---

## V2.1 - Semantic Scaffolding & LLM Parameters (2025-11-20)

**Date**: 2025-11-20
**Status**: V2.1 APPROVED - Enhanced with Research Findings

---

### Summary of Changes

V2.1 adds **critical implementation details** from Prompt Specification research (Semantic Scaffolding) and prepares for LLM Parameters optimization research results.

---

## New Sections Added

### 1. Stage 5 → Stage 6 Interface Enhancement (Semantic Scaffolding)

**Research Source**: `docs/research/008-generation/Optimizing AI Lesson Content Prompts.md`

**Key Additions**:
- ✅ **Critical vs Optional Specification** guidelines (evidence-based)
- ✅ **LessonSpecification V2 Schema** (complete TypeScript interface)
- ✅ **Content Type Variation** (technical vs conceptual vs compliance)
- ✅ **Prompt Architecture Strategy** (Context-First XML)
- ✅ **Skeleton-of-Thought Architecture** (parallel generation)
- ✅ **Quality-Cost Trade-off** (ASU research data)
- ✅ **Migration Strategy** (V1 → V2 transformation)

**Impact**: Eliminates over-specification (quality -15-30%) and under-specification (retry rate 2.4x) problems.

### 2. LLM Parameters Optimization (Multi-Stage)

**Research Source**: `docs/research/008-generation/Research Prompt - Optimal LLM Parameters.md` (PENDING)

**Key Additions**:
- ✅ **Parameter Strategy by Stage** (Stage 3, 4, 5, 6)
- ✅ **Phase-Specific Parameters** (temperature, top-p, penalties)
- ✅ **Content Archetype Parameters** (code_tutorial 0.2, concept_explainer 0.7, legal_warning 0.1)
- ✅ **Dynamic Temperature Within Lesson** (hypothesis + implementation)
- ✅ **PLACEHOLDER** for research results integration

**Impact**: Replaces default temperature (0.7) with task-optimized parameters.

---

## Schema Changes

### LessonSpecification V1 → V2

**Removed Fields**:
- ❌ `content_structure.intro.hook: string` (exact text)
- ❌ `content_structure.main_sections[].word_count: number` (exact count)
- ❌ `content_structure.main_sections[].rag_query: string` (query, not results)
- ❌ `content_structure.exercises[].grading_rubric?: string` (unstructured)

**Added Fields**:
- ✅ `metadata.target_audience: enum` (executive/practitioner/novice)
- ✅ `metadata.tone: enum` (formal/conversational-professional)
- ✅ `metadata.compliance_level: enum` (strict/standard)
- ✅ `intro_blueprint.hook_strategy: enum` (analogy/statistic/challenge/question)
- ✅ `intro_blueprint.hook_topic: string` (topic, not text)
- ✅ `sections[].content_archetype: enum` (concept_explainer/code_tutorial/case_study/legal_warning)
- ✅ `sections[].rag_context_id: string` (ID of stored RAG results)
- ✅ `sections[].constraints.depth: enum` (summary/detailed_analysis/comprehensive)
- ✅ `sections[].constraints.required_keywords: string[]`
- ✅ `sections[].constraints.prohibited_terms: string[]`
- ✅ `sections[].key_points_to_cover: string[]` (the "Skeleton")
- ✅ `exercises[].rubric_criteria: { criteria: string[], weight: number }[]` (structured)

**Rationale**: Semantic Scaffolding — specify WHAT and WHERE, leave HOW to model reasoning.

---

## Implementation Priorities (Updated)

### NEW: Priority 0 (BLOCKING)

**Stage 5 → Stage 6 Interface Refactoring**
- Duration: 2-3 days
- Blocks: Priority 3 (Generation RAG Integration)
- Tasks: Update schema, V1→V2 transformer, Zod schemas

### Updated: Priority 3

**Generation RAG Integration + Semantic Scaffolding**
- Duration: 3-4 days (extended from 2-3)
- NEW: Implement V2 schema generation
- NEW: hook_strategy detection, depth calculation, content_archetype inference
- NEW: RAG context caching (rag_context_id)

### NEW: Priority 4

**Stage 6 Prompt Template + Dynamic Temperature**
- Duration: 2-3 days
- Tasks: Context-First XML template, dynamic temperature, Markdown parser, INSUFFICIENT_CONTEXT logic

### NEW: Priority 5

**LLM Parameters Implementation (AFTER RESEARCH)**
- Duration: 2 days
- Tasks: Integrate research results, update all stages, A/B testing

---

## Key Decisions (Updated)

**V2.0 Decisions** (unchanged):
- ✅ NO summary passed to Generation
- ✅ NO RAG access in Analyze
- ✅ Document Prioritization is FOUNDATION
- ✅ Two-level RAG

**NEW V2.1 Decisions**:
- ✅ **Semantic Scaffolding** (not executable prompts)
- ✅ **Dynamic temperature** by content archetype (0.1-0.7 range)
- ✅ **Markdown output** for prose, JSON for metadata

---

## Research Evidence Integrated

### Prompt Specification Research (COMPLETE)

**Source**: `docs/research/008-generation/Optimizing AI Lesson Content Prompts.md`

**Key Findings Applied**:
1. **Over-Specification Risk**: "Mad Libs" approach (3.2/5.0 quality, 1.8x retries)
2. **Optimal Approach**: Semantic Scaffolding (3.8/5.0 quality, 1.2x retries)
3. **ROI**: 29% efficiency gain (per 50 lessons: $6.50 savings, 65 hours saved)
4. **Content Type Variation**: Technical (0.2 temp), Conceptual (0.7 temp), Compliance (0.1 temp)
5. **Output Format**: Markdown for prose (-15-30% quality penalty if JSON-wrapped)

### LLM Parameters Research (PENDING)

**Source**: `docs/research/008-generation/Research Prompt - Optimal LLM Parameters.md`

**Status**: Awaiting Perplexity research completion

**Expected Integration**:
- Empirical validation of temperature recommendations
- Production evidence (OpenAI, Khan Academy, Duolingo)
- Academic backing (papers)
- Quality-cost metrics table

---

## Migration Strategy

### Backward Compatibility

**V1 Schema**: Still supported
- Automatic transformation to V2
- No reprocessing required for existing courses

**V2 Schema**: New courses
- Automatically use V2 from Priority 0 completion
- A/B test: V1 vs V2 quality metrics

### Transformation Logic

```typescript
function transformV1toV2(v1: LessonSpecV1): LessonSpecification {
  return {
    metadata: { /* infer from v1 */ },
    intro_blueprint: {
      hook_strategy: extractStrategy(v1.hook),  // Parse text → enum
      hook_topic: extractTopic(v1.hook)
    },
    sections: v1.sections.map(s => ({
      content_archetype: mapContentType(s.expected_content_type),
      rag_context_id: executeAndStoreRAG(s.rag_query),  // Execute + cache
      constraints: {
        depth: mapWordCountToDepth(s.word_count),  // 200-400 → "summary"
        required_keywords: extractKeywords(s.section),
        prohibited_terms: []
      },
      key_points_to_cover: [s.section]
    })),
    exercises: v1.exercises.map(e => ({
      rubric_criteria: parseRubric(e.grading_rubric)  // string → structured
    }))
  };
}
```

---

## Acceptance Criteria (Updated)

**NEW Requirements for Sign-Off**:
1. ✅ **Priority 0**: LessonSpecification V2 implemented
2. ✅ Generation produces V2 schema
3. ✅ V1→V2 transformer working
4. ✅ A/B test: V2 vs V1 (quality metrics show improvement)
5. ✅ **LLM Parameters research completed** (after Perplexity)
6. ✅ Dynamic temperature implemented (Stage 6)

**Unchanged Requirements**: Document Prioritization, Analyze Phase 6, RAG integration, E2E tests, cost/quality metrics

---

## Files Modified

1. `/docs/architecture/STAGE4-STAGE5-STAGE6-FINAL-ARCHITECTURE.md`
   - Added: Semantic Scaffolding section (~400 lines)
   - Added: LLM Parameters section (~100 lines)
   - Updated: Implementation Priorities (Priority 0-5)
   - Updated: Acceptance Criteria
   - Updated: Version (2.0.0 → 2.1.0)

---

## Next Actions

**Immediate** (BLOCKING):
1. ✅ V2.1 document complete
2. ⏳ Run LLM Parameters research via Perplexity (awaiting)
3. ⏳ Implement Priority 0 (LessonSpecification V2) - 2-3 days

**Short-term**:
4. ⏳ Implement Priority 1 (Document Prioritization) - 3-4 days
5. ⏳ Integrate LLM Parameters research results (after research)

**Medium-term**:
6. ⏳ Priority 2-4 implementation (Analyze Phase 6, Generation V2, Stage 6)

---

**Changelog Version**: 1.0
**Author**: Architecture Team + Research Integration
**Date**: 2025-11-20
