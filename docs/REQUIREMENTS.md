# Stage 5: Course Structure Generation - Technical Requirements

**Version**: 1.0
**Date**: 2025-11-04
**Status**: DRAFT
**Based on**: Stage 4 (LangChain + LangGraph) + MVP n8n workflow analysis

---

## 1. Overview

**Goal**: Generate complete course structure (metadata + sections + lessons + exercises) from Stage 4 analysis_result.

**Architectural Decision**: Leverage LangChain + LangGraph (proven in Stage 4) with batch processing strategy from MVP.

**Key Innovation**: Hybrid approach combining Stage 4's multi-phase orchestration with MVP's proven batch generation reliability.

---

## 2. Input Requirements

### 2.1 Primary Input (from courses.analysis_result)

```typescript
{
  // From Phase 1 (Classification)
  category_info: {
    primary: 'professional' | 'academic' | 'personal' | 'hobby' | 'certification' | 'training';
    subcategories: string[];
    difficulty: 'beginner' | 'intermediate' | 'advanced' | 'mixed';
  };

  // From Phase 1 (Contextual Language)
  contextual_language: {
    why_matters_context: string;
    application_context: string;
    motivation_context: string;
    learning_approach: string;
  };

  // From Phase 2 (Scope Analysis)
  recommended_structure: {
    total_lessons: number;           // Minimum 10 (FR-015), typically 20-50
    total_sections: number;          // Typically 4-10
    estimated_hours: number;
    lesson_duration_minutes: number; // 3-45 minutes
    sections_breakdown: Array<{
      area: string;                  // Section topic/area
      estimated_lessons: number;
      key_topics: string[];
    }>;
  };

  // From Phase 3 (Expert Analysis)
  pedagogical_strategy: {
    teaching_style: 'structured' | 'exploratory' | 'mixed' | 'case_based' | 'project_based';
    practical_focus: 'low' | 'medium' | 'high';
    assessment_types: string[];
    prerequisites: string[];
    learning_objectives: string[];
  };

  // From Phase 3 (Research Flags)
  research_flags: Array<{
    topic: string;
    reason: string;
    confidence: number;
  }>;

  // From Phase 4 (Topic Analysis)
  topic_analysis: {
    determined_topic: string;
    key_concepts: string[];
    domain_keywords: string[];
    complexity_level: 'low' | 'medium' | 'high';
  };

  // From Phase 4 (Content Strategy)
  content_strategy: 'expand_and_enhance' | 'create_from_scratch';
  expansion_areas?: string[];
}
```

### 2.2 Secondary Input (from courses table)

```typescript
{
  course_id: string;
  language: string;                    // Target language (Russian, English, etc.)
  target_audience: string;
  user_preferences?: {
    style?: 'formal' | 'conversational' | 'mixed';
    depth?: 'overview' | 'detailed' | 'comprehensive';
  };
}
```

### 2.3 Context Input (from Stage 3 summarization)

```typescript
{
  summary_text: string;                // Aggregated document summaries
  vectorized: boolean;                 // Whether RAG is available
}
```

---

## 3. Output Requirements

### 3.1 Database Schema

**Target table**: `courses.course_structure` (JSONB column)

```typescript
{
  // Course Metadata (generated first)
  course_title: string;                // 10-300 chars, target language
  course_description: string;          // 150-800 chars, elevator pitch
  course_overview: string;             // 400-3000 chars, comprehensive overview
  target_audience: string;             // 10-600 chars, refined from input
  estimated_duration_hours: number;    // 0.25-100 hours
  difficulty_level: 'beginner' | 'intermediate' | 'advanced' | 'mixed';

  prerequisites: string[];             // 0-20 items, max 100 chars each
  learning_outcomes: string[];         // 3-15 items, 10-150 chars each
  course_tags: string[];               // 3-20 tags, 2-50 chars each

  assessment_strategy: {
    quiz_per_section: boolean;
    final_exam: boolean;
    practical_projects: number;        // 0-20 projects
    assessment_description: string;    // 10-600 chars
  };

  // Sections (generated in batches)
  sections: Array<{
    section_number: number;            // 1-based index
    section_title: string;             // 3-250 chars
    section_description: string;       // 20-600 chars
    learning_objectives: string[];     // 1-5 items, 10-150 chars each
    estimated_duration_minutes: number; // 5-500 minutes

    // Lessons (nested)
    lessons: Array<{
      lesson_number: number;           // 1-based index within section
      lesson_title: string;            // 5-200 chars
      lesson_objectives: string[];     // 2-5 items, 10-150 chars each
      key_topics: string[];            // 2-10 items, 5-100 chars each
      estimated_duration_minutes: number; // 3-45 minutes

      // Practical Exercises (3-5 per lesson)
      practical_exercises: Array<{
        exercise_type: 'self_assessment' | 'case_study' | 'hands_on' |
                       'discussion' | 'quiz' | 'simulation' | 'reflection';
        exercise_title: string;        // 5-150 chars
        exercise_description: string;  // 15-250 chars
      }>;
    }>;
  }>;

  // Generation Metadata
  generation_metadata: {
    model_used: string;                // e.g., 'openai/gpt-oss-120b'
    total_tokens: {
      metadata: number;
      sections: number;
      total: number;
    };
    cost_usd: number;
    duration_ms: number;
    quality_scores: {
      metadata: number;                // Semantic similarity 0-1
      sections_avg: number;
      overall: number;
    };
    batch_count: number;
    retry_count: number;
    created_at: string;                // ISO timestamp
  };
}
```

### 3.2 Validation Requirements

**Use Zod schemas** (same as MVP, proven reliable):

1. **Course-level validation**:
   - Required fields: course_title, course_description, sections
   - Min 1 section, max 50 sections
   - Min 3 learning_outcomes, max 15

2. **Section-level validation**:
   - Required fields: section_number, section_title, lessons
   - Min 1 lesson, max 25 lessons per section
   - section_number must be sequential (1, 2, 3, ...)

3. **Lesson-level validation**:
   - Required fields: lesson_number, lesson_title, lesson_objectives, key_topics, practical_exercises
   - Min 2 lesson_objectives, max 5
   - Min 2 key_topics, max 10
   - Min 3 practical_exercises, max 5

4. **Exercise validation**:
   - Required fields: exercise_type, exercise_title, exercise_description
   - exercise_type must be valid enum value

---

## 4. Architecture & Workflow

### 4.1 LangGraph StateGraph (2 Major Nodes)

```typescript
import { StateGraph, START, END, Annotation } from "@langchain/langgraph";

// Workflow State
const GenerationState = Annotation.Root({
  // Input
  course_id: Annotation<string>,
  analysis_result: Annotation<AnalysisResult>,
  language: Annotation<string>,
  summary_text: Annotation<string>,

  // Phase outputs
  metadata: Annotation<CourseMetadata | null>,
  sections: Annotation<Section[]>,

  // Tracking
  tokens_used: Annotation<{ metadata: number; sections: number; total: number }>,
  cost_usd: Annotation<number>,
  quality_scores: Annotation<{ metadata: number; sections_avg: number }>,
  retry_count: Annotation<number>,
  errors: Annotation<string[]>,
});

// 2-Node Graph
const workflow = new StateGraph(GenerationState)
  .addNode("generateMetadata", metadataGenerationNode)   // Phase 1
  .addNode("generateSections", batchSectionGenerationNode) // Phase 2
  .addEdge(START, "generateMetadata")
  .addConditionalEdges("generateMetadata",
    (state) => state.metadata ? "continue" : "retry",
    { continue: "generateSections", retry: "generateMetadata" }
  )
  .addConditionalEdges("generateSections",
    (state) => state.sections.length >= analysis_result.recommended_structure.total_sections ? "success" : "retry",
    { success: END, retry: "generateSections" }
  );
```

### 4.2 Phase 1: Metadata Generation

**Node**: `generateMetadata`

**Model**: OpenRouter GPT OSS-120B (high quality for course-level metadata)

**Strategy**: Single LLM call with retry (max 2 attempts, like MVP)

**Input**:
- `analysis_result.topic_analysis.determined_topic`
- `analysis_result.recommended_structure` (total_lessons, total_sections, estimated_hours)
- `analysis_result.pedagogical_strategy`
- `language`

**Output**: CourseMetadata (title, description, overview, outcomes, etc.)

**Retry Logic**:
- **Attempt 1**: Detailed prompt with examples
- **Attempt 2**: Stricter prompt with minimal instructions
- **Fallback**: Use template with placeholders if both fail

**Quality Validation**:
- Semantic similarity check vs input topic (threshold: 0.70)
- Field completeness check (all required fields populated)
- Length validation (chars within bounds)

**Prompt Template**:
```
LANGUAGE: {language}
Generate course metadata in {language}.

Topic: {determined_topic}
Sections: {total_sections}
Lessons: {total_lessons}
Duration: ~{estimated_hours}h
Difficulty: {difficulty}

TARGET AUDIENCE: {target_audience}
LEARNING OUTCOMES (from analysis): {learning_objectives}

CRITICAL JSON RULES:
- Start with {, end with }
- NO text before or after JSON
- STOP IMMEDIATELY after final }
- ALL text MUST be in {language}

Return JSON:
{
  "course_title": "~100 chars in {language}",
  "course_description": "~400 chars (elevator pitch in {language})",
  "course_overview": "~1500 chars (comprehensive overview in {language})",
  "target_audience": "~300 chars in {language}",
  "estimated_duration_hours": {estimated_hours},
  "difficulty_level": "{difficulty}",
  "prerequisites": ["~60 chars each in {language}, 2-5 items"],
  "learning_outcomes": ["~80 chars each in {language}, 5-10 items"],
  "assessment_strategy": {
    "quiz_per_section": true,
    "final_exam": false,
    "practical_projects": {Math.floor(total_sections / 3)},
    "assessment_description": "~300 chars in {language}"
  },
  "course_tags": ["10-15 tags in {language}"]
}
```

### 4.3 Phase 2: Batch Section Generation

**Node**: `generateSections` (implements batch processing)

**Model**: OpenRouter GPT OSS-120B (consistent high quality)

**Strategy**: Batch processing (1 section per batch, configurable parallelism)

**Batch Configuration** (from MVP proven values):
- `SECTIONS_PER_BATCH = 1` (prevents truncation, ensures complete schema)
- `PARALLEL_BATCH_SIZE = 2` (process 2 batches in parallel)
- `MAX_ATTEMPTS_PER_BATCH = 2` (retry with stricter prompt)

**Batching Logic**:
```typescript
async function generateSections(state) {
  const totalSections = state.analysis_result.recommended_structure.total_sections;
  const sectionsInfo = state.analysis_result.recommended_structure.sections_breakdown;
  const allSections = [];

  // Process in groups of PARALLEL_BATCH_SIZE
  for (let groupIdx = 0; groupIdx < totalSections; groupIdx += PARALLEL_BATCH_SIZE) {
    const groupEnd = Math.min(groupIdx + PARALLEL_BATCH_SIZE, totalSections);
    const parallelPromises = [];

    // Launch parallel batches
    for (let i = groupIdx; i < groupEnd; i++) {
      parallelPromises.push(
        generateBatch(llm, i + 1, i + 1, i + 1, sectionsInfo)
      );
    }

    // Wait for group completion
    const groupResults = await Promise.all(parallelPromises);
    groupResults.forEach(batch => allSections.push(...batch.sections));

    // Delay between groups (2s, like MVP)
    if (groupEnd < totalSections) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  return { ...state, sections: allSections };
}
```

**Retry Strategy (Progressive Prompts)**:
```typescript
// Attempt 1: Normal prompt with strict example
const attempt1Prompt = `
LANGUAGE: {language}
Generate section {section_number} in {language}.

SECTION INFO:
{section_number}. {area} ({estimated_lessons} lessons)

SOURCE (extract specific details):
{summary_text_chunk}

CRITICAL: Use EXACTLY this JSON structure. DO NOT change field names!

Example (COPY THIS STRUCTURE EXACTLY):
{
  "sections": [{
    "section_number": {section_number},
    "section_title": "Title in {language}",
    "section_description": "Description in {language}",
    "learning_objectives": ["Objective 1", "Objective 2"],
    "estimated_duration_minutes": 50,
    "lessons": [{
      "lesson_number": 1,
      "lesson_title": "Lesson title",
      "lesson_objectives": ["Objective 1", "Objective 2"],
      "key_topics": ["Topic 1", "Topic 2"],
      "practical_exercises": [
        {"exercise_type": "case_study", "exercise_title": "Title", "exercise_description": "Description"},
        {"exercise_type": "hands_on", "exercise_title": "Title", "exercise_description": "Description"},
        {"exercise_type": "quiz", "exercise_title": "Title", "exercise_description": "Description"}
      ],
      "estimated_duration_minutes": {lesson_duration_minutes}
    }]
  }]
}

RULES:
- Use EXACT field names from example
- 3 exercises per lesson minimum
- ALL text in {language}
- {lesson_duration_minutes} minutes per lesson
- Return ONLY JSON, no explanations
`;

// Attempt 2: Minimal prompt with strict constraints
const attempt2Prompt = `
Generate section {section_number} in {language}.

{section_number}. {area} ({estimated_lessons} lessons)

Return ONLY valid JSON following this EXACT structure:
{ /* same structure as Attempt 1, but minimal instructions */ }

CRITICAL RULES:
- Use EXACT field names from example
- All text in {language}
- Return ONLY JSON, no explanations
- Start with {, end with }
`;
```

**JSON Extraction & Repair** (from MVP, proven reliable):

1. **Extract JSON**:
   - Remove markdown fences (```json)
   - Find first `{` and matching `}` via brace counting
   - Handle escaped characters and strings correctly
   - Warn if trailing content found (but don't fail)

2. **Sanitize**:
   - Remove comments (// and /* */)
   - Remove trailing commas before } or ]
   - Fix property name quotes

3. **Repair (4 levels)**:
   - Level 1: Direct parse
   - Level 2: Sanitize + parse
   - Level 3: Fix unescaped quotes in strings
   - Level 4: Remove newlines in string values

4. **Field Name Normalization** (from MVP):
   ```typescript
   // Auto-fix camelCase → snake_case
   fixed.section_title = section.section_title || section.sectionTitle || section.title;
   fixed.lesson_objectives = lesson.lesson_objectives || lesson.lessonObjectives || lesson.objectives;
   // ... etc for all fields
   ```

**Quality Validation**:
- **Structure check**: sections array exists, not empty
- **Completeness**: Each section has all required fields + lessons
- **Lesson validation**: Each lesson has title, objectives, topics, exercises
- **Exercise count**: Min 3 exercises per lesson
- **Sequential numbering**: section_number and lesson_number are correct

---

## 5. Quality & Observability

### 5.1 Quality Validation Strategy

**Metadata Quality**:
- Semantic similarity vs `analysis_result.topic_analysis.determined_topic` (threshold: 0.70)
- Field completeness: All required fields populated, non-empty
- Length validation: Each field within min/max bounds

**Section Quality**:
- Structural completeness: All sections have required fields + lessons
- Content relevance: Section topics align with `sections_breakdown[i].area`
- Exercise diversity: Mix of exercise types (not all same type)

**Overall Quality Score**:
```typescript
quality_score = (
  metadata_similarity * 0.3 +
  section_completeness * 0.4 +
  exercise_diversity * 0.2 +
  validation_passed * 0.1
);
```

### 5.2 Cost Tracking

**Per-Phase Tracking**:
```typescript
{
  phase: 'metadata' | 'sections',
  model_used: string,
  tokens: {
    prompt_tokens: number,
    completion_tokens: number,
    total_tokens: number,
  },
  cost_usd: number,          // Calculated via OpenRouter pricing
  duration_ms: number,
  attempts: number,          // Number of retries
}
```

**Total Cost Calculation**:
- Metadata: ~5K-10K tokens (~$0.001-0.002)
- Sections (8 sections × 2 attempts avg): ~80K-150K tokens (~$0.016-0.030)
- **Estimated total**: $0.017-0.032 per course

### 5.3 Progress Tracking

**Update courses.generation_status**:
- `analyzing_structure` → `generating_structure` (Phase 1 start)
- `generating_structure` (Phase 1 complete, Phase 2 in progress)
- `structure_ready` (Phase 2 complete)

**Update courses.generation_progress** (JSONB):
```typescript
{
  current_step: 5,  // Stage 5
  total_steps: 9,
  progress: 60,     // 60%
  message: {
    en: "Generating course structure...",
    ru: "Генерация структуры курса..."
  },
  details: {
    phase: 'metadata' | 'sections',
    sections_generated: number,
    sections_total: number,
    batch_progress: '3/8',
  }
}
```

**BullMQ Job Progress**:
```typescript
await job.updateProgress({
  stage: 5,
  phase: 'sections',
  sections_generated: 3,
  sections_total: 8,
  percentage: 37.5,
});
```

---

## 6. Error Handling & Retry Logic

### 6.1 Retry Strategy

**Metadata Generation**:
- Max 2 attempts (like MVP)
- Exponential backoff: 1s, 2s
- Fallback: Use template with placeholders if both fail (graceful degradation)

**Section Generation (per batch)**:
- Max 2 attempts per batch
- Exponential backoff: 1s, 3s
- Progressive prompts: Detailed → Minimal
- **NO partial results**: All batches must succeed or entire phase fails

**Quality-Based Retry**:
- If semantic similarity < 0.70 → retry with adjusted prompt
- If validation fails → retry with stricter schema emphasis
- If field names wrong → auto-fix, log warning, continue

### 6.2 Error Classification

**Recoverable Errors** (retry):
- `JSON_PARSE_ERROR`: Malformed JSON (repair logic should handle)
- `INCOMPLETE_STRUCTURE`: Missing fields (retry with stricter prompt)
- `QUALITY_TOO_LOW`: Semantic similarity < 0.70 (retry)

**Permanent Errors** (fail immediately):
- `MODEL_TIMEOUT`: OpenRouter API timeout (30s+)
- `RATE_LIMIT`: OpenRouter rate limit exceeded
- `INVALID_INPUT`: analysis_result missing required fields

**Fallback Strategy**:
- If Phase 1 (metadata) fails after 2 attempts → use template
- If Phase 2 (sections) fails → fail entire generation, mark as failed, notify user

### 6.3 Error Reporting

**Store in courses.error_details**:
```typescript
{
  stage: 5,
  phase: 'metadata' | 'sections',
  error_type: string,
  error_message: string,
  attempts: number,
  last_error_at: string,
  recoverable: boolean,
}
```

---

## 7. Database Integration

### 7.1 Update Sequence

1. **Phase 1 Complete**:
   ```sql
   UPDATE courses
   SET
     generation_status = 'generating_structure',
     generation_progress = jsonb_set(
       generation_progress,
       '{details,phase}',
       '"metadata"'
     )
   WHERE id = $1;
   ```

2. **Phase 2 Progress** (per batch):
   ```sql
   UPDATE courses
   SET generation_progress = jsonb_set(
     generation_progress,
     '{details,sections_generated}',
     to_jsonb($1)
   )
   WHERE id = $2;
   ```

3. **Final Update**:
   ```sql
   UPDATE courses
   SET
     generation_status = 'structure_ready',
     course_structure = $1,           -- Full JSONB
     generation_progress = jsonb_set(
       generation_progress,
       '{progress}',
       '60'
     )
   WHERE id = $2;
   ```

### 7.2 Sections & Lessons Insert

**After validation passes**, insert into normalized tables:

```typescript
// Insert sections
for (const section of course_structure.sections) {
  const { data: sectionData } = await supabase
    .from('sections')
    .insert({
      course_id,
      section_number: section.section_number,
      title: section.section_title,
      description: section.section_description,
      objective: section.learning_objectives,
      estimated_duration_minutes: section.estimated_duration_minutes,
    })
    .select('id')
    .single();

  // Insert lessons for this section
  for (const lesson of section.lessons) {
    await supabase
      .from('lessons')
      .insert({
        section_id: sectionData.id,
        lesson_number: lesson.lesson_number,
        title: lesson.lesson_title,
        objectives: lesson.lesson_objectives,
        key_topics: lesson.key_topics,
        duration_minutes: lesson.estimated_duration_minutes,
        activities: lesson.practical_exercises,
      });
  }
}
```

---

## 8. XSS Sanitization

**Use DOMPurify** (same as Stage 4):

```typescript
import DOMPurify from 'isomorphic-dompurify';

function sanitizeCourseStructure(structure: CourseStructure): CourseStructure {
  return {
    ...structure,
    course_title: DOMPurify.sanitize(structure.course_title),
    course_description: DOMPurify.sanitize(structure.course_description),
    course_overview: DOMPurify.sanitize(structure.course_overview),
    sections: structure.sections.map(section => ({
      ...section,
      section_title: DOMPurify.sanitize(section.section_title),
      section_description: DOMPurify.sanitize(section.section_description),
      lessons: section.lessons.map(lesson => ({
        ...lesson,
        lesson_title: DOMPurify.sanitize(lesson.lesson_title),
        // ... sanitize all string fields
      })),
    })),
  };
}
```

---

## 9. Testing Requirements

### 9.1 Unit Tests

1. **Metadata Generation**:
   - Test valid metadata generation
   - Test retry logic (2 attempts)
   - Test fallback template
   - Test semantic similarity calculation

2. **Section Generation**:
   - Test single batch generation
   - Test parallel batch processing
   - Test progressive prompts (attempt 1 vs 2)
   - Test JSON extraction & repair

3. **Validation**:
   - Test Zod schema validation (positive/negative cases)
   - Test field name normalization (camelCase → snake_case)
   - Test completeness checks

### 9.2 Contract Tests

Test tRPC endpoints (similar to Stage 4):

1. `generation.startStructureGeneration(courseId)` → `{ jobId, status }`
2. `generation.getStructureProgress(courseId)` → `{ progress, phase, details }`
3. `generation.getStructure(courseId)` → `{ course_structure, metadata }`

### 9.3 Integration Tests

1. **Full Pipeline** (T056):
   - Upload 3 documents → Stage 2 → Stage 3 → Stage 4 → **Stage 5**
   - Verify metadata generated correctly
   - Verify all sections generated (count matches recommended_structure.total_sections)
   - Verify all lessons have 3+ exercises
   - Verify database inserts (sections, lessons tables)

2. **Quality Validation**:
   - Test semantic similarity threshold (0.70)
   - Test validation errors trigger retry
   - Test quality score calculation

3. **Cost Tracking**:
   - Verify token usage recorded per phase
   - Verify cost calculation matches OpenRouter pricing
   - Verify total cost within expected range ($0.017-0.032)

---

## 10. Performance Requirements

**Target Metrics**:
- Metadata generation: <10s (single LLM call, 5-10K tokens)
- Section generation (8 sections): <120s (2 parallel batches, ~15s per batch)
- Total pipeline: <150s (2.5 minutes)
- Token budget: 200K tokens (same as Stage 4)
- Cost per course: $0.017-0.032

**Optimization Strategies**:
- Parallel batch processing (2 batches at a time)
- Minimize retry attempts (max 2)
- Reuse parsed analysis_result (no re-fetching)
- Cache Jina embeddings for semantic similarity

---

## 11. Success Criteria

**Functional**:
- ✅ Generate complete course structure from analysis_result
- ✅ All sections match recommended_structure.total_sections
- ✅ All lessons have 3+ exercises
- ✅ Validation passes (Zod schema)
- ✅ Database inserts successful (sections, lessons)

**Quality**:
- ✅ Metadata semantic similarity ≥0.70
- ✅ Overall quality score ≥0.80
- ✅ <5% retry rate (batches succeed on attempt 1)
- ✅ Zero validation errors in production

**Performance**:
- ✅ <150s total pipeline duration (8 sections)
- ✅ Token usage <200K (within budget)
- ✅ Cost per course <$0.035

**Reliability**:
- ✅ 99% success rate (with retry logic)
- ✅ Graceful degradation (fallback templates)
- ✅ Error reporting (user-friendly messages)

---

## 12. Migration Notes from MVP

**What to Keep**:
- ✅ Batch processing strategy (1 section per batch, 2 parallel)
- ✅ Retry logic (2 attempts, progressive prompts)
- ✅ JSON extraction & repair (proven reliable)
- ✅ Field name normalization (camelCase → snake_case)
- ✅ Zod validation schema (comprehensive)

**What to Improve**:
- ❌ Replace n8n Code node → TypeScript service
- ❌ Replace manual state management → LangGraph StateGraph
- ❌ Add quality validation (semantic similarity, Stage 4 pattern)
- ❌ Add cost tracking (per-phase, Stage 4 pattern)
- ❌ Add XSS sanitization (DOMPurify, Stage 4 pattern)
- ❌ Use tRPC for API (type-safe, Stage 1 pattern)

**What to Remove**:
- ❌ n8n-specific logic (Structured Output Parser node)
- ❌ Telegram error notifications (use Supabase logging instead)
- ❌ Legacy RPC calls (use Supabase realtime or polling)

---

## 13. Implementation Phases

**Phase 0: Preparation** (1-2 days)
- Database migrations (course_structure JSONB column verified)
- Shared-types: CourseStructure, Section, Lesson, Exercise interfaces
- Zod schemas (port from MVP)

**Phase 1: Metadata Service** (2-3 days)
- Implement metadataGenerationNode
- Add retry logic (2 attempts, progressive prompts)
- Add semantic similarity validation
- Unit tests (10+ tests)

**Phase 2: Batch Section Service** (3-4 days)
- Implement batchSectionGenerationNode
- Add parallel batch processing (2 at a time)
- Add JSON extraction & repair logic
- Add field name normalization
- Unit tests (15+ tests)

**Phase 3: LangGraph Orchestrator** (2-3 days)
- Build StateGraph (2 nodes: metadata → sections)
- Add conditional edges (retry logic)
- Add progress tracking (BullMQ + Supabase)
- Integration tests (5+ tests)

**Phase 4: tRPC Integration** (1-2 days)
- generation.startStructureGeneration endpoint
- generation.getStructureProgress endpoint
- generation.getStructure endpoint
- Contract tests (10+ tests)

**Phase 5: Testing & Validation** (2-3 days)
- T056 E2E test (full pipeline)
- Quality validation tests
- Cost tracking tests
- Performance benchmarking

**Total Estimate**: 10-17 days

---

## 14. References

- **ADR-001**: LLM Orchestration Framework decision (LangChain + LangGraph)
- **Stage 4 Implementation**: Multi-phase analysis pattern, quality validation, cost tracking
- **MVP n8n Workflow**: Batch processing strategy, retry logic, validation
- **MVP Generation.js**: JSON extraction, field normalization, repair logic
- **Zod Documentation**: Schema validation patterns
- **DOMPurify**: XSS sanitization for LLM outputs

---

**Document Version**: 1.0
**Last Updated**: 2025-11-04
**Authors**: Development Team
**Status**: DRAFT - Ready for Review
