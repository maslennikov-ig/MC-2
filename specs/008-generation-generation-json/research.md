# Research: Generation Phase Implementation

**Feature**: Stage 5 - Course Structure JSON Generation
**Date**: 2025-11-05
**Status**: Phase 1 Complete

## 1. Research Scope

This document addresses the following research areas identified in spec.md:

1. **RT-001**: qwen3-max Invocation Strategy (CRITICAL - MANDATORY)
2. Previous Generation.js implementation analysis (architecture patterns from n8n proof-of-concept)
3. Style prompt integration strategy
4. Vector database strategy for RAG context
5. JSON structure improvements from previous GenerationResult.js

---

## 2. RT-001: qwen3-max Invocation Strategy (RESEARCH TASK)

### 2.1 Research Objective

**Goal**: Определить оптимальные точки использования qwen3-max (самой дорогой модели, 3x дороже OSS 120B) в процессе Generation для максимизации качества при минимизации стоимости.

**Status**: ⏸️ **MANDATORY - TO BE COMPLETED DURING IMPLEMENTATION** (после понимания Generation архитектуры и структуры JSON)

**Priority**: CRITICAL (BLOCKS production deployment)

**Timing**: Выполнить ПОСЛЕ того, как:
1. ✅ Структура JSON определена (CourseStructure schema в data-model.md)
2. ✅ Generation phases определены (metadata, sections, validation)
3. ⏭️ Core Generation работает с OSS 20B (baseline для сравнения)
4. ⏭️ Собраны реальные паттерны генерации (какие шаги сложнее)

**Important**: Это НЕ optional optimization - это MANDATORY для production. Без RT-001 completion система не готова для production deployment.

**Context from Specification**:
- FR-017: "System MUST define and document Qwen3-max invocation strategy through research task during implementation"
- Clarification (spec.md:24): "FR-017: Qwen3-max strategy определяется через research task ПОСЛЕ понимания Generation архитектуры - investigate minimal context scenarios, high-sensitivity parameters, quality-critical decision points"

### 2.2 Model Characteristics (Known)

**qwen/qwen3-max** via OpenRouter:
- **Context window**: 128K tokens (same as OSS 20B/120B, fits within per-batch budget)
- **Pricing**: ~$0.60/1M input tokens, ~$1.80/1M output tokens (3x more expensive than OSS 120B)
- **Quality**: High reasoning capability, extensive knowledge base, better at complex reasoning
- **Performance**: Slower than OSS models (higher latency ~2-3x)
- **Use case fit**: Critical decision points where errors are costly and cascade

### 2.3 Investigation Areas (To Be Researched)

#### Area 1: Minimal Context Scenarios (Minimal Analyze Output)

**Question**: Does qwen3-max improve Generation quality when Analyze has minimal input context (user provided title only, so Analyze produces basic analysis_result)?

**Hypothesis**: Courses with sparse Analyze output (minimal metadata from title-only user input) require more sophisticated reasoning in Generation phase, where qwen3-max may excel over OSS 120B.

**Test Plan**:
1. Create 10 test courses where user provided ONLY title (various domains: technical, business, creative)
2. Run Analyze on these title-only courses (produces basic analysis_result)
3. Generate course structure from these minimal analysis_result outputs using OSS 120B (baseline)
4. Generate same courses using qwen3-max for Generation
5. Measure:
   - Quality scores (Jina-v3 semantic similarity with ideal course)
   - Lesson count accuracy (FR-015 minimum 10 met?)
   - Metadata completeness (all fields populated?)
   - Learning outcomes quality (specific, measurable, relevant?)
   - Cost difference (actual USD per course)

**Success Criteria**:
- qwen3-max should achieve SC-002 (80%+ quality on minimal-input courses) if OSS 120B falls short
- Quality improvement must justify cost increase (if +$0.10 → +10% quality = acceptable)

**Deliverable**: Document whether Generation with sparse Analyze output benefits from qwen3-max

**Note**: This tests minimal Analyze output scenario, NOT title-only Generation. Generation ALWAYS receives analysis_result from Analyze, even if that analysis_result is sparse (derived from title-only user input).

#### Area 2: High-Sensitivity Parameters (Metadata vs Sections)

**Question**: Какие поля в course_structure наиболее критичны, где ошибки каскадируются на все уроки?

**Hypothesis**: Course-level metadata (learning_outcomes, assessment_strategy, course_overview) имеют higher impact чем section-level fields (section_description, lesson_objectives), т.к. влияют на ALL lessons, а не локально.

**Test Strategy**:
1. Идентифицировать "critical fields" (course-level) vs "important fields" (section-level) через dependency analysis
2. Test 3 model assignment strategies:
   - **Strategy A**: qwen3-max for metadata, OSS 20B for sections
   - **Strategy B**: OSS 120B for metadata, OSS 20B for sections (baseline)
   - **Strategy C**: OSS 120B for all (cheapest)

3. Generate 10 courses per strategy (same inputs)

4. Measure QUALITY:
   - Metadata coherence (learning_outcomes → assessment_strategy alignment)
   - Section-to-metadata alignment (section objectives align с course outcomes?)
   - Lesson spec quality (lesson_objectives детализированы для Stage 6?)

5. Measure COST:
   - USD per course per strategy
   - Tokens used per phase (metadata vs sections)

**Decision Criteria**:
- If Strategy A (qwen3-max metadata) >> Strategy B quality → use qwen3-max for metadata
- If marginal improvement (<5% quality gain) → stick with OSS 120B (cheaper)
- If Strategy C (all OSS 120B) fails SC-001 (95%+ with Analyze) → need escalation somewhere

**Deliverable**: Document which Generation phases benefit from qwen3-max

#### Area 3: Quality-Critical Decision Points (Conflict Resolution, Edge Cases)

**Question**: В каких конкретных ситуациях Generation процесса ошибки наиболее критичны и expensive to fix?

**Scenarios to Test**:

1. **Conflict Resolution** (user parameters vs Analyze recommendations):
   - Example: User requests 50 lessons, Analyze recommends 25
   - Test: Does qwen3-max provide better pedagogical rationale for deviation?
   - Metric: Manual review - is deviation justified or arbitrary?

2. **Ambiguous Topics** (требуют domain knowledge):
   - Example: Title "Data Science" (could be Python-focused, R-focused, business-focused, theory-focused)
   - Test: Does qwen3-max disambiguate better based on contextual clues?
   - Metric: Expert review - правильный ли focus выбран?

3. **Edge Cases** (contradictions in input):
   - Example: Title "Advanced Kubernetes" + target_audience: "Beginners"
   - Test: Does qwen3-max detect contradiction and adjust appropriately?
   - Metric: Does output resolve contradiction (adjust difficulty OR topic)?

4. **Missing Analyze Phase** (incomplete data):
   - Example: Analyze failed at Phase 3, only Phase 1-2 available
   - Test: Does qwen3-max synthesize missing pedagogical strategy better?
   - Metric: Can Generation continue with degraded input?

**Evaluation Method**:
- Generate 20 edge case courses per model (OSS 120B vs qwen3-max)
- Manual expert review (педагог + domain expert)
- Count: contradiction detections, pedagogical rationales quality, incorrect assumptions

**Decision Criteria**:
- If qwen3-max catches significantly more edge cases (>20% improvement) → use for validation phase
- If similar error rates → OSS 120B sufficient

**Deliverable**: Document whether validation/QA phase benefits from qwen3-max

### 2.4 Research Deliverables (Required Before Production)

This research task MUST produce:

1. **Strategy Document** (`RT-001-qwen3-max-strategy.md`):
   - Concrete invocation rules: when to use qwen3-max (which phases, which conditions)
   - Cost-benefit analysis per invocation point (USD increase vs quality gain)
   - Fallback strategy if qwen3-max unavailable/rate-limited
   - Performance benchmarks (latency, token usage, quality scores)

2. **Code Implementation**:
   - Model selector logic in `generation-orchestrator.ts` or `model-selector.ts`
   - Configuration in `llm_model_config` table (if phase-specific selection)
   - Logging for model selection rationale (why qwen3-max chosen for this batch/phase)

3. **Test Suite**:
   - Unit tests for model selection logic (mocked scenarios)
   - Integration tests for each identified invocation point
   - Quality benchmarks: qwen3-max vs OSS 120B vs OSS 20B comparison

4. **Documentation Update**:
   - Update plan.md with final strategy
   - Update quickstart.md with model selection examples
   - Update IMPLEMENTATION_ROADMAP_EN.md with Stage 5 qwen3-max usage

### 2.5 Production Implementation Timeline

**RT-001 MUST BE COMPLETED** as part of production deployment - this is NOT optional research.

**Phase 1: Initial Implementation with OSS 20B Baseline** - 3-4 days
- Implement all Generation phases (metadata, sections, validation)
- Use OSS 20B as default model everywhere during development
- Collect metrics: quality scores, failure patterns, token usage
- Goal: Achieve SC-001 (95%+ with Analyze results)
- **Rationale**: OSS 20B proven in Stage 4 Analyze (95%+ success rate), provides baseline for comparison

**Phase 2: RT-001 Research Execution (MANDATORY)** - 1-2 days
- Execute Area 1-3 investigations (title-only, high-sensitivity parameters, quality-critical decisions)
- Analyze collected metrics from Phase 1
- Document findings and concrete qwen3-max invocation strategy
- Goal: Production-ready model selection logic with cost/quality justification
- **Status**: BLOCKS production deployment

**Phase 3: qwen3-max Integration (MANDATORY)** - 0.5 days
- Implement model selector based on RT-001 findings
- Add configuration, logging, tests
- Verify quality improvement in targeted areas
- Goal: Optimized multi-model strategy for production

**Escalation Triggers** (from Stage 4 patterns):
- **Validation failure** → OSS 120B (proven escalation path)
- **Per-batch token overflow** (>108K tokens) → Gemini 2.5 Flash (1M context)

**Benefits of phased approach**:
- ✅ Working baseline quickly (OSS 20B) for development velocity
- ✅ Real failure patterns inform qwen3-max strategy (data-driven)
- ✅ Cost control during development phase
- ✅ Production deployment has optimized multi-model orchestration

### 2.6 Production-Ready Implementation Timeline

**Total Duration**: 4.5-6.5 days (MANDATORY for production deployment)

See section 2.5 for detailed phase breakdown. All 3 phases REQUIRED:
1. OSS 20B baseline implementation (3-4 days)
2. RT-001 research execution (1-2 days) - **MANDATORY**
3. qwen3-max integration (0.5 days) - **MANDATORY**

**Note**: This is production implementation, NOT MVP. All research tasks (RT-001, RT-004, RT-006) MUST be completed before production deployment.

### 2.7 Expected Outcomes (Hypotheses to Validate)

**Likely Scenario** (based on Stage 4 experience):
- OSS 20B handles 85-90% of cases sufficiently
- OSS 120B needed for ~5-10% (validation failures, complex reasoning)
- qwen3-max needed for ~2-5% (critical edge cases, minimal context)
- Gemini needed for ~1-2% (token overflow)

**Possible qwen3-max Invocation Points** (to be validated):
1. Metadata generation with minimal Analyze output (sparse analysis_result from title-only user input) - IF OSS 120B insufficient
2. Conflict resolution phase - IF edge case detection important
3. Final validation QA - IF quality gates require extra reasoning

**Note**: FR-003 refers to Analyze handling title-only input, not Generation. Generation always works with analysis_result.

**Cost Impact Estimate**:
- Baseline (all OSS 20B): $0.15-0.25/course
- With qwen3-max (2-5% usage): +$0.05-0.15/course
- Total: $0.20-0.40/course (within SC-010 budget)

**Note**: These are HYPOTHESES to be tested, not final decisions!

  // Use retryWithBackoff from Stage 1
  return await retryWithBackoff(
    () => invokeLLM(modelConfig, metadataPrompt),
    { maxAttempts: 3, fallbackModels: fallbackChain }
  );
}
```

---

## 3. Previous Generation.js Implementation - Pattern Analysis

**Source**: n8n proof-of-concept workflow (reference for production implementation)

### 3.1 What Worked Well

✅ **Per-batch architecture** (SECTIONS_PER_BATCH = 1):
- Prevents truncation by keeping each LLM call small
- Independent token budget per batch (120K)
- Easy to parallelize (PARALLEL_BATCH_SIZE = 2)
- **Decision**: Keep this pattern

✅ **4-level JSON repair**:
- Brace counting, quote fixing, trailing commas, comment stripping
- 85%+ recovery rate from malformed JSON
- **Decision**: Port to `json-repair.ts` utility

✅ **Progressive prompt strictness**:
- Attempt 1: Standard prompt with examples
- Attempt 2: Minimal valid JSON with strict rules
- Reduces retry failures
- **Decision**: Keep 2-attempt strategy

✅ **Exponential backoff**:
- `delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000)`
- Prevents API rate limit issues
- **Decision**: Reuse `retryWithBackoff` from Stage 1

✅ **Field name auto-fix**:
- LLM often uses camelCase instead of snake_case
- Automatic mapping: `courseTitle` → `course_title`
- **Decision**: Port to validation layer (Zod transform)

### 3.2 Problems to Fix (Production Requirements)

❌ **No structured output enforcement**:
- Previous implementation relied on "trust the LLM" approach
- JSON schema violations common
- **Solution**: Use Zod schemas for runtime validation (Stage 4 pattern)

❌ **No quality validation**:
- No semantic similarity checks
- No alignment verification
- **Solution**: Integrate Jina-v3 quality validator from Stage 3

❌ **No minimum lessons enforcement** (FR-015):
- Previous implementation generated whatever LLM returns
- May violate 10-lesson minimum
- **Solution**: Add `minimum-lessons-validator.ts`

❌ **No cost tracking**:
- No generation_metadata.cost_usd calculation
- **Solution**: Integrate cost-calculator from Stage 3

❌ **No XSS sanitization**:
- LLM outputs directly saved to database
- **Solution**: DOMPurify sanitization (Stage 4 pattern)

❌ **Hard-coded style prompts**:
- Embedded in workflow JSON
- Not version controlled
- **Solution**: Extract to `style-prompts.ts` in shared-types

❌ **No RAG context**:
- Doesn't use vectorized documents
- **Solution**: Optional Qdrant search per FR-004

### 3.3 Architecture Improvements

**Before (Previous n8n proof-of-concept)**:
```
LangChain Node → LLM → JSON String → Manual Parse → Database
```

**After (Stage 5 Production - TypeScript + LangGraph)**:
```
StateGraph Orchestrator
├── Phase 0: Input Validation (Analyze results + Frontend params)
├── Phase 1: Metadata Generation (qwen3-max, with quality validation)
├── Phase 2: Section Batch Generation (OSS 20B, parallel batches, per-batch 120K)
├── Phase 3: Quality Validation (Jina-v3 semantic similarity)
├── Phase 4: Minimum Lessons Validation (FR-015 enforcement)
└── Phase 5: Database Commit (XSS sanitization, atomic JSONB)
```

**Benefits**:
- Modular phases (200-300 lines each)
- Quality gates between phases
- Reuse Stage 4 patterns (LangGraph StateGraph)
- Observable via Pino structured logging

---

## 4. Style Prompt Integration Strategy

### 4.1 Current State (Previous Proof-of-Concept)

**Location**: `workflows n8n/style.js` (embedded in n8n workflow)
**Format**: JavaScript object with 21 style definitions
**Usage**: Injected into LLM prompt as string

**Styles**: academic, conversational, storytelling, practical, motivational, visual, gamified, minimalist, research, engaging, professional, socratic, problem_based, collaborative, technical, microlearning, inspirational, interactive, analytical

### 4.2 Migration Strategy

**Target**: `packages/shared-types/src/style-prompts.ts`

**Format**:
```typescript
// style-prompts.ts
import { z } from 'zod';

export const COURSE_STYLES = [
  'academic', 'conversational', 'storytelling', 'practical',
  'motivational', 'visual', 'gamified', 'minimalist',
  'research', 'engaging', 'professional', 'socratic',
  'problem_based', 'collaborative', 'technical',
  'microlearning', 'inspirational', 'interactive', 'analytical'
] as const;

export type CourseStyle = typeof COURSE_STYLES[number];

export const CourseStyleSchema = z.enum(COURSE_STYLES);

export const STYLE_PROMPTS: Record<CourseStyle, string> = {
  academic: "Write with scholarly rigor and theoretical depth...",
  conversational: "Write as friendly dialogue with the reader...",
  // ... 19 more styles (copy from style.js)
};

export function getStylePrompt(style?: string): string {
  const validated = CourseStyleSchema.safeParse(style);
  if (!validated.success) {
    console.warn(`Invalid style "${style}", defaulting to conversational`);
    return STYLE_PROMPTS.conversational;
  }
  return STYLE_PROMPTS[validated.data];
}
```

**Benefits**:
- Type-safe style selection
- Version controlled in Git
- Reusable across services
- Easy to add new styles
- Automatic validation with fallback

### 4.3 Integration Points

**Metadata Generation**:
```typescript
const stylePrompt = getStylePrompt(input.style);
const metadataPrompt = `
${stylePrompt}

Generate course metadata in ${input.language}...
`;
```

**Section Generation**:
```typescript
const stylePrompt = getStylePrompt(input.style);
const sectionPrompt = `
${stylePrompt}

Generate section ${sectionNum} with ${lessonCount} lessons...
`;
```

**Lesson Technical Specifications** (FR-011):
```typescript
// Include style in lesson_objectives for Stage 6 reference
lesson_objectives: [
  "Learn X concept (style: conversational - use friendly examples)"
]
```

---

## 5. Vector Database Strategy for RAG Context

### 5.1 Requirements

**FR-004**: System MUST retrieve document summaries from file_catalog when vectorized=true

**Optional Enhancement**: Use RAG context to enrich course generation

### 5.2 Strategy

**When to Use RAG** (selective, not mandatory):
- If course has uploaded documents (file_catalog.vectorized = true)
- If Analyze stage flagged "needs research" (analysis_result.needs_research = true)
- If minimal input scenario (Analyze received title only, produced sparse analysis_result)

**When to Skip RAG**:
- Standard generation with complete Analyze results
- No uploaded documents
- Token budget already high (>90K per batch)

**Implementation**:
```typescript
async function enrichBatchContext(
  batchInput: SectionBatchInput,
  courseId: string
): Promise<string> {
  // Check if RAG applicable
  const course = await supabase
    .from('courses')
    .select('analysis_result')
    .eq('id', courseId)
    .single();

  // Skip RAG if not needed
  if (!course.analysis_result?.needs_research) {
    return ''; // No additional context
  }

  // Retrieve relevant chunks from Qdrant
  const topics = batchInput.sections.flatMap(s => s.key_topics);
  const chunks = await qdrantSearch({
    collectionName: 'course_documents',
    query: topics.join(' '),
    filter: { course_id: courseId },
    limit: 5, // Top 5 relevant chunks
  });

  // Format as context (max 10K tokens to stay within budget)
  const context = chunks
    .map(c => c.payload.content)
    .join('\n\n')
    .substring(0, 10000); // Truncate if needed

  return `
REFERENCE MATERIAL (extract specific details if relevant):
${context}
`;
}
```

**Token Budget Management**:
- Base prompt: ~5K tokens
- Section data: ~3K tokens per section
- RAG context: 0-10K tokens (optional)
- Total: ~8-18K input tokens per batch
- Output: ~15-30K tokens (section + lessons)
- **Total per batch: 23-48K tokens** (well within 120K budget)

**Fallback**: If token budget exceeds 108K (90% of 120K), skip RAG context and use Gemini if needed.

---

## 6. JSON Structure Improvements

### 6.1 Previous JSON Structure Analysis (Reference for Improvements)

**File**: `workflows n8n/GenerationResult.js` (example output)

**Strengths**:
- Clear hierarchy: course → sections → lessons → exercises
- Metadata separation (course-level vs section-level)
- Exercise typing (case_study, hands_on, quiz, etc.)

**Weaknesses**:
1. **Missing lesson-level technical specifications** (FR-011):
   - No `lesson_objectives` field
   - No `key_topics` field
   - No `estimated_duration_minutes` field
   - These are REQUIRED for Stage 6 lesson generation

2. **No generation metadata tracking** (FR-025):
   - No `model_used` field
   - No `token_usage` tracking
   - No `cost_usd` calculation
   - No `quality_scores`

3. **No versioning**:
   - Can't track schema evolution
   - Breaking changes not documented

4. **Inconsistent field names**:
   - Mix of snake_case and camelCase
   - LLM often generates wrong format

### 6.2 Improved Schema

**Location**: `packages/shared-types/src/generation-result.ts`

```typescript
import { z } from 'zod';

// Exercise types (from spec.md FR-010)
export const ExerciseTypeSchema = z.enum([
  'self_assessment',
  'case_study',
  'hands_on',
  'discussion',
  'quiz',
  'simulation',
  'reflection',
]);

// Lesson with technical specifications (FR-011)
export const LessonSchema = z.object({
  lesson_number: z.number().int().positive(),
  lesson_title: z.string().min(5).max(200),

  // Technical specifications for Stage 6 (FR-011)
  lesson_objectives: z.array(z.string().min(15)).min(1).max(5),
  key_topics: z.array(z.string().min(5)).min(2).max(10),
  estimated_duration_minutes: z.number().int().min(3).max(45),

  // Exercises (FR-010)
  practical_exercises: z.array(z.object({
    exercise_type: ExerciseTypeSchema,
    exercise_title: z.string().min(5).max(100),
    exercise_description: z.string().min(10).max(500),
  })).min(3).max(5), // 3-5 exercises per lesson
});

// Section with learning objectives (FR-012)
export const SectionSchema = z.object({
  section_number: z.number().int().positive(),
  section_title: z.string().min(10).max(200),
  section_description: z.string().min(20).max(600),
  learning_objectives: z.array(z.string().min(20)).min(1).max(5),
  estimated_duration_minutes: z.number().int().positive(),
  lessons: z.array(LessonSchema).min(1),
});

// Course structure (FR-007)
export const CourseStructureSchema = z.object({
  // Metadata
  course_title: z.string().min(10).max(300),
  course_description: z.string().min(50).max(1000),
  course_overview: z.string().min(100).max(3000),
  target_audience: z.string().min(20).max(500),
  estimated_duration_hours: z.number().positive(),
  difficulty_level: z.enum(['beginner', 'intermediate', 'advanced']),
  prerequisites: z.array(z.string().min(10).max(200)).min(0).max(10),
  learning_outcomes: z.array(z.string().min(30)).min(3).max(15), // FR-012
  assessment_strategy: z.object({
    quiz_per_section: z.boolean(),
    final_exam: z.boolean(),
    practical_projects: z.number().int().min(0),
    assessment_description: z.string().min(50).max(500),
  }),
  course_tags: z.array(z.string().min(3).max(50)).min(5).max(20),

  // Hierarchy
  sections: z.array(SectionSchema).min(1),
});

// Generation metadata (FR-025)
export const GenerationMetadataSchema = z.object({
  model_used: z.object({
    metadata: z.string(), // e.g., "qwen/qwen3-max"
    sections: z.string(), // e.g., "openai/gpt-oss-20b"
    validation: z.string(), // e.g., "openai/gpt-oss-120b"
  }),
  total_tokens: z.object({
    metadata: z.number().int(),
    sections: z.number().int(),
    validation: z.number().int(),
    total: z.number().int(),
  }),
  cost_usd: z.number().min(0),
  duration_ms: z.object({
    metadata: z.number().int(),
    sections: z.number().int(),
    validation: z.number().int(),
    total: z.number().int(),
  }),
  quality_scores: z.object({
    metadata_similarity: z.number().min(0).max(1),
    sections_similarity: z.array(z.number().min(0).max(1)),
    overall: z.number().min(0).max(1),
  }),
  batch_count: z.number().int().positive(),
  retry_count: z.object({
    metadata: z.number().int().min(0),
    sections: z.array(z.number().int().min(0)),
  }),
  created_at: z.string().datetime(),
});

// Full generation result
export type CourseStructure = z.infer<typeof CourseStructureSchema>;
export type GenerationMetadata = z.infer<typeof GenerationMetadataSchema>;

export interface GenerationResult {
  course_structure: CourseStructure;
  generation_metadata: GenerationMetadata;
}
```

**Validation Strategy**:
```typescript
// In generation-orchestrator.ts
const result = await generateCourseStructure(input);

// Validate before database commit
const validated = CourseStructureSchema.safeParse(result.course_structure);
if (!validated.success) {
  console.error('Validation failed:', validated.error);
  throw new ValidationError(validated.error);
}

// Also validate minimum lessons (FR-015)
const totalLessons = validated.data.sections
  .reduce((sum, s) => sum + s.lessons.length, 0);
if (totalLessons < 10) {
  throw new ValidationError(`Only ${totalLessons} lessons generated, minimum 10 required`);
}

// Commit to database
await supabase
  .from('courses')
  .update({
    course_structure: validated.data,
    generation_metadata: result.generation_metadata,
    status: 'content_generated',
  })
  .eq('id', courseId);
```

---

## 7. Decision Summary

### 7.1 Approved Strategies

✅ **qwen3-max Usage** (RT-001):
- Title-only metadata generation
- Standard metadata generation (all courses)
- Validation and conflict resolution
- Total cost impact: +$0.23-0.35 per course

✅ **Architecture Pattern**:
- Reuse LangChain + LangGraph from Stage 4
- Per-batch architecture (SECTIONS_PER_BATCH = 1)
- Multi-model orchestration (20B → 120B → qwen3-max → Gemini)
- Quality validation via Jina-v3

✅ **Style Integration**:
- Port to `style-prompts.ts` in shared-types
- Type-safe with Zod enum
- Automatic validation with fallback to conversational

✅ **RAG Strategy**:
- Optional enhancement, not mandatory
- Use when: uploaded documents OR needs_research flag OR sparse Analyze output (from minimal user input)
- Skip when: complete Analyze results OR high token budget
- Max 10K tokens per batch

✅ **JSON Schema**:
- Zod schemas for runtime validation
- Lesson-level technical specifications (FR-011)
- Generation metadata tracking (FR-025)
- Field name auto-fix via Zod transforms

### 7.2 Implementation Priorities

**Phase 1** (Foundation):
1. Create shared-types schemas (generation-job, generation-result, style-prompts)
2. Database migration (generation_metadata JSONB columns)
3. Port proven patterns to utilities (json-repair from n8n proof-of-concept, field-name-fix)

**Phase 2** (Core Services):
4. LangGraph orchestration workflow (5-phase StateGraph)
5. Metadata generator (qwen3-max integration)
6. Section batch generator (OSS 20B, parallel batches)

**Phase 3** (Enhancement Services):
7. Style integrator (read style-prompts.ts)
8. Quality validator (Jina-v3 semantic similarity)
9. Minimum lessons validator (FR-015 enforcement)
10. Cost calculator integration

**Phase 4** (Integration):
11. BullMQ worker handler (stage5-generation.ts)
12. tRPC generation router
13. RAG context enrichment (optional)

**Phase 5** (Testing & Polish):
14. Unit tests (all services)
15. Contract tests (tRPC endpoints)
16. Integration tests (E2E workflow)
17. Documentation (quickstart, contracts)

### 7.3 Risk Mitigation

**Risk**: qwen3-max unavailable or rate limited
- **Mitigation**: Fallback to OSS 120B with stricter prompts, then Gemini

**Risk**: Token budget overflow (>120K per batch)
- **Mitigation**: Automatic Gemini fallback, skip RAG context if needed

**Risk**: Quality validation failures
- **Mitigation**: Retry with OSS 120B, then qwen3-max if <0.75 similarity

**Risk**: Minimum lessons violation (FR-015)
- **Mitigation**: Retry with explicit "minimum 10 lessons" constraint, up to 3 attempts

**Risk**: JSON schema violations
- **Mitigation**: 4-level JSON repair, field name auto-fix, Zod validation

---

## 8. Next Steps

✅ **Phase 1 Complete**: Research findings documented
➡️ **Phase 2**: Generate data-model.md (course_structure JSONB schema)
➡️ **Phase 2**: Generate contracts/ (tRPC generation endpoints)
➡️ **Phase 2**: Generate quickstart.md (developer onboarding)
➡️ **Phase 2**: Update agent context (claude.md)

**Estimated Timeline**: 4-5 days for full Stage 5 implementation (database 100% ready, reusing Stage 4 patterns)
