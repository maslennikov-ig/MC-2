# Quickstart: Stage 5 Generation Phase

**Feature**: Course Structure JSON Generation
**Target**: Developers implementing or extending Stage 5
**Prerequisites**: Stages 0-4 complete, LangChain + LangGraph knowledge

## 1. Overview

This guide walks you through the Stage 5 implementation for generating course structure JSON from Stage 4 analysis results. Generation ALWAYS receives analysis_result from Analyze (even when user provides minimal input like title only - Analyze runs first and produces analysis_result). By the end, you'll understand the data flow, services architecture, and how to test your implementation.

**What You'll Build**:
- LangGraph orchestration workflow (5 phases)
- Metadata generator (qwen3-max integration)
- Section batch generator (OSS 20B, parallel processing)
- Quality validator (Jina-v3 semantic similarity)
- BullMQ worker handler
- tRPC generation endpoints

**Estimated Time**: 4-5 days for full implementation

---

## 2. Prerequisites

### 2.1 Read Required Documentation

**MUST READ** (in order):
1. [REQUIREMENTS.md](REQUIREMENTS.md) - Feature requirements
2. [plan.md](plan.md) - Implementation plan
3. [research.md](research.md) - qwen3-max strategy (RT-001)
4. [data-model.md](data-model.md) - Schemas and types

**Reference** (as needed):
5. [ADR-001](../../docs/ADR-001-LLM-ORCHESTRATION-FRAMEWORK.md) - LangChain decision
6. [Stage 4 Implementation](../007-stage-4-analyze/) - Reusable patterns

### 2.2 Environment Setup

```bash
# 1. Checkout feature branch
git checkout 008-generation-generation-json

# 2. Install dependencies
pnpm install

# 3. Copy environment variables (if not already configured)
cp .env.example .env.local

# 4. Set required environment variables
# OPENROUTER_API_KEY=your-key-here
# JINA_API_KEY=your-key-here
# SUPABASE_URL=https://diqooqbuchsliypgwksu.supabase.co
# SUPABASE_SERVICE_ROLE_KEY=your-key-here
# REDIS_URL=redis://localhost:6379

# 5. Start local services
docker compose up -d redis # BullMQ queue
# Supabase cloud (diqooqbuchsliypgwksu) is already running

# 6. Run database migration
cd packages/course-gen-platform
pnpm supabase:migrate
```

### 2.3 Verify Existing Infrastructure

```bash
# Check LangChain packages (from Stage 4)
pnpm list @langchain/core @langchain/langgraph @langchain/openai
# Should show: v0.3+ installed

# Check shared-types package structure
ls packages/shared-types/src/
# Should contain: analysis-result.ts, summarization-result.ts, etc.

# Check BullMQ worker is running
pnpm --filter course-gen-platform dev
# Navigate to http://localhost:3001/admin/queues
# Should see Bull Board dashboard
```

---

## 3. Implementation Phases

### Phase 0: Foundation (Database + Shared Types)

**Duration**: 0.5 days

#### 3.1.1 Create Database Migration

**File**: `packages/course-gen-platform/supabase/migrations/20251105000000_stage5_generation.sql`

```sql
-- Add generation_metadata column to courses table
ALTER TABLE courses
ADD COLUMN IF NOT EXISTS generation_metadata JSONB;

-- Create index for generation metadata queries
CREATE INDEX IF NOT EXISTS idx_courses_generation_metadata
ON courses USING gin (generation_metadata);

-- Add comment for documentation
COMMENT ON COLUMN courses.generation_metadata IS
'Generation metadata tracking (FR-025): model_used, token_usage, cost_usd, quality_scores';
```

**Apply Migration**:
```bash
cd packages/course-gen-platform
pnpm supabase:migrate
# Or use Supabase CLI:
supabase db push
```

**Verify**:
```bash
psql $SUPABASE_URL -c "\d courses"
# Should show generation_metadata column
```

#### 3.1.2 Create Shared Types

**File**: `packages/shared-types/src/generation-result.ts`

```typescript
import { z } from 'zod';

// Start with minimal schemas, expand incrementally
export const LessonSchema = z.object({
  lesson_number: z.number().int().positive(),
  lesson_title: z.string().min(5).max(200),
  lesson_objectives: z.array(z.string()).min(1).max(5),
  key_topics: z.array(z.string()).min(2).max(10),
  estimated_duration_minutes: z.number().int().min(3).max(45),
  practical_exercises: z.array(z.object({
    exercise_type: z.enum(['self_assessment', 'case_study', 'hands_on', 'discussion', 'quiz', 'simulation', 'reflection']),
    exercise_title: z.string().min(5).max(100),
    exercise_description: z.string().min(10).max(500),
  })).min(3).max(5),
});

// ... add SectionSchema, CourseStructureSchema, GenerationMetadataSchema
// See data-model.md for full schemas
```

**File**: `packages/shared-types/src/style-prompts.ts`

```typescript
// Port from workflows n8n/style.js
export const COURSE_STYLES = ['academic', 'conversational', /* ... */] as const;
export type CourseStyle = typeof COURSE_STYLES[number];
export const STYLE_PROMPTS: Record<CourseStyle, string> = { /* ... */ };
export function getStylePrompt(style?: string): string { /* ... */ }
```

**Test**:
```bash
cd packages/shared-types
pnpm test:unit
# Should pass: style-prompts.test.ts, generation-result.test.ts
```

---

### Phase 1: Core Services (Generators + Validators)

**Duration**: 1.5 days

#### 3.2.1 Metadata Generator

**File**: `packages/course-gen-platform/src/services/stage5/metadata-generator.ts`

```typescript
import { ChatOpenAI } from '@langchain/openai';
import { GenerationJobInput, CourseMetadata } from '@megacampus/shared-types';
import { getStylePrompt } from '@megacampus/shared-types/style-prompts';

export class MetadataGenerator {
  private llm: ChatOpenAI;

  constructor() {
    // ALWAYS use qwen3-max for metadata (high-sensitivity parameters per RT-001)
    this.llm = new ChatOpenAI({
      modelName: 'qwen/qwen3-max',
      configuration: {
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': process.env.SITE_URL,
        },
      },
      apiKey: process.env.OPENROUTER_API_KEY,
      temperature: 0.7,
      maxTokens: 4000,
    });
  }

  async generate(input: GenerationJobInput): Promise<CourseMetadata> {
    // Build prompt with style integration
    const stylePrompt = getStylePrompt(input.frontend_parameters.style);

    const prompt = `
${stylePrompt}

LANGUAGE: ${input.frontend_parameters.language || input.analysis_result?.contextual_language || 'Russian'}

Generate course metadata in the target language.

${input.analysis_result ? `
ANALYSIS RESULTS:
- Topic: ${input.analysis_result.determined_topic}
- Key Concepts: ${input.analysis_result.key_concepts.join(', ')}
- Pedagogical Strategy: ${input.analysis_result.pedagogical_strategy}
- Total Lessons: ${input.analysis_result.recommended_structure.total_lessons}
- Total Sections: ${input.analysis_result.recommended_structure.total_sections}
`}

${!input.analysis_result ? `
WARNING: analysis_result is missing - this should not happen!
Generation requires analysis_result from Analyze stage.
Using fallback with course title only, but this indicates a system error.
- Course Title: ${input.frontend_parameters.course_title}
` : ''}

Return JSON with:
{
  "course_title": "~100 chars",
  "course_description": "~400 chars (elevator pitch)",
  "course_overview": "~1500 chars (comprehensive overview)",
  "target_audience": "~300 chars",
  "estimated_duration_hours": number,
  "difficulty_level": "beginner|intermediate|advanced",
  "prerequisites": ["~60 chars each", "2-5 items"],
  "learning_outcomes": ["~80 chars each", "5-10 items"],
  "assessment_strategy": {
    "quiz_per_section": boolean,
    "final_exam": boolean,
    "practical_projects": number,
    "assessment_description": "~300 chars"
  },
  "course_tags": ["10-15 tags"]
}
`;

    // Invoke LLM with retry
    const response = await this.llm.invoke(prompt);

    // Parse and validate
    const metadata = this.parseMetadata(response.content as string);

    return metadata;
  }

  private parseMetadata(content: string): CourseMetadata {
    // Use extractJSON from research.md (brace counting)
    // Use safeJSONParse from research.md (4-level repair)
    // Use fixFieldNames from research.md (camelCase → snake_case)
    // Validate with Zod schema
    // ... implementation
  }
}
```

**Test**:
```typescript
// packages/course-gen-platform/tests/unit/metadata-generator.test.ts
describe('MetadataGenerator', () => {
  it('should generate metadata from full analysis', async () => {
    const generator = new MetadataGenerator();
    const result = await generator.generate(mockFullInput);

    expect(result.course_title).toBeTruthy();
    expect(result.learning_outcomes.length).toBeGreaterThanOrEqual(3);
  });

  it('should generate metadata from minimal Analyze output (sparse analysis_result from title-only user input)', async () => {
    const generator = new MetadataGenerator();
    const result = await generator.generate(mockMinimalAnalyzeInput);

    expect(result.course_title).toBeTruthy();
    expect(result.course_description).toBeTruthy();
  });
});
```

#### 3.2.2 Section Batch Generator

**File**: `packages/course-gen-platform/src/services/stage5/section-batch-generator.ts`

```typescript
export class SectionBatchGenerator {
  private llm: ChatOpenAI;

  constructor() {
    // Use OSS 20B for sections (default model)
    this.llm = new ChatOpenAI({
      modelName: 'openai/gpt-oss-20b',
      // ... configuration
    });
  }

  async generateBatch(
    batchNum: number,
    startSection: number,
    endSection: number,
    input: GenerationJobInput
  ): Promise<Section[]> {
    // Per-batch architecture: SECTIONS_PER_BATCH = 1
    // Independent 120K token budget per batch
    // 2 attempts with progressive prompt strictness

    const prompt = this.buildBatchPrompt(startSection, endSection, input);

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await this.llm.invoke(prompt);
        const sections = this.parseSections(response.content as string);

        // Validate sections
        sections.forEach(s => SectionSchema.parse(s));

        return sections;
      } catch (error) {
        if (attempt === 2) throw error;
        // Wait before retry
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }

    throw new Error('Section batch generation failed after 2 attempts');
  }

  private buildBatchPrompt(
    startSection: number,
    endSection: number,
    input: GenerationJobInput
  ): string {
    const stylePrompt = getStylePrompt(input.frontend_parameters.style);
    const sectionsInfo = input.analysis_result?.recommended_structure?.sections_breakdown;

    return `
${stylePrompt}

LANGUAGE: ${input.frontend_parameters.language}

Generate sections ${startSection}-${endSection}:
${sectionsInfo?.slice(startSection - 1, endSection).map((s, i) =>
  `${startSection + i}. ${s.area} (${s.estimated_lessons} lessons)`
).join('\n')}

Return JSON:
{
  "sections": [{
    "section_number": ${startSection},
    "section_title": "Title",
    "section_description": "Description",
    "learning_objectives": ["Objective 1", "Objective 2"],
    "estimated_duration_minutes": number,
    "lessons": [{
      "lesson_number": 1,
      "lesson_title": "Lesson title",
      "lesson_objectives": ["Objective"],
      "key_topics": ["Topic 1", "Topic 2"],
      "practical_exercises": [
        {"exercise_type": "case_study", "exercise_title": "...", "exercise_description": "..."},
        {"exercise_type": "hands_on", "exercise_title": "...", "exercise_description": "..."},
        {"exercise_type": "quiz", "exercise_title": "...", "exercise_description": "..."}
      ],
      "estimated_duration_minutes": 5
    }]
  }]
}
`;
  }
}
```

**Test**:
```typescript
describe('SectionBatchGenerator', () => {
  it('should generate section batch', async () => {
    const generator = new SectionBatchGenerator();
    const sections = await generator.generateBatch(1, 1, 1, mockInput);

    expect(sections).toHaveLength(1);
    expect(sections[0].lessons.length).toBeGreaterThan(0);
  });
});
```

---

### Phase 2: LangGraph Orchestration

**Duration**: 1 day

#### 3.3.1 Generation Orchestrator

**File**: `packages/course-gen-platform/src/services/stage5/generation-orchestrator.ts`

```typescript
import { StateGraph, END } from '@langchain/langgraph';

interface GenerationState {
  input: GenerationJobInput;
  metadata?: CourseMetadata;
  sections: Section[];
  qualityScores: QualityScores;
  errors: string[];
}

export class GenerationOrchestrator {
  private graph: StateGraph<GenerationState>;

  constructor() {
    this.graph = new StateGraph<GenerationState>({
      channels: {
        input: {},
        metadata: {},
        sections: { default: () => [] },
        qualityScores: {},
        errors: { default: () => [] },
      },
    });

    this.buildGraph();
  }

  private buildGraph() {
    // Phase 0: Input validation
    this.graph.addNode('validate_input', this.validateInput.bind(this));

    // Phase 1: Metadata generation
    this.graph.addNode('generate_metadata', this.generateMetadata.bind(this));

    // Phase 2: Section batch generation
    this.graph.addNode('generate_sections', this.generateSections.bind(this));

    // Phase 3: Quality validation
    this.graph.addNode('validate_quality', this.validateQuality.bind(this));

    // Phase 4: Minimum lessons validation
    this.graph.addNode('validate_lessons', this.validateLessons.bind(this));

    // Define edges
    this.graph.setEntryPoint('validate_input');
    this.graph.addEdge('validate_input', 'generate_metadata');
    this.graph.addEdge('generate_metadata', 'generate_sections');
    this.graph.addEdge('generate_sections', 'validate_quality');
    this.graph.addEdge('validate_quality', 'validate_lessons');
    this.graph.addEdge('validate_lessons', END);
  }

  async execute(input: GenerationJobInput): Promise<GenerationResult> {
    const compiled = this.graph.compile();

    const finalState = await compiled.invoke({ input });

    // Build result
    return {
      course_structure: {
        ...finalState.metadata,
        sections: finalState.sections,
      },
      generation_metadata: {
        // ... collect metadata throughout workflow
      },
    };
  }

  // Phase implementations...
  private async validateInput(state: GenerationState): Promise<Partial<GenerationState>> {
    // Validate input schema
    GenerationJobInputSchema.parse(state.input);
    return state;
  }

  private async generateMetadata(state: GenerationState): Promise<Partial<GenerationState>> {
    const generator = new MetadataGenerator();
    const metadata = await generator.generate(state.input);
    return { metadata };
  }

  // ... other phases
}
```

**Test**:
```typescript
describe('GenerationOrchestrator', () => {
  it('should execute full workflow', async () => {
    const orchestrator = new GenerationOrchestrator();
    const result = await orchestrator.execute(mockInput);

    expect(result.course_structure.sections.length).toBeGreaterThan(0);
    expect(result.generation_metadata.cost_usd).toBeGreaterThan(0);
  });
});
```

---

### Phase 3: Worker Integration

**Duration**: 0.5 days

#### 3.4.1 BullMQ Worker Handler

**File**: `packages/course-gen-platform/src/orchestrator/handlers/stage5-generation.ts`

```typescript
import { Job } from 'bullmq';
import { GenerationJobData } from '@megacampus/shared-types';
import { GenerationOrchestrator } from '@/services/stage5/generation-orchestrator';

export async function handleStructureGeneration(job: Job<GenerationJobData>) {
  const { input, metadata } = job.data;

  logger.info('[GENERATION] Starting structure generation', {
    courseId: input.course_id,
    attempt: metadata.attempt,
  });

  try {
    // Execute LangGraph workflow
    const orchestrator = new GenerationOrchestrator();
    const result = await orchestrator.execute(input);

    // Validate result
    const validated = CourseStructureSchema.safeParse(result.course_structure);
    if (!validated.success) {
      throw new ValidationError('Invalid course structure', validated.error);
    }

    // XSS sanitization (learning from Stage 4)
    const sanitized = sanitizeCourseStructure(validated.data);

    // Save to database (atomic JSONB commit)
    await supabase
      .from('courses')
      .update({
        course_structure: sanitized,
        generation_metadata: result.generation_metadata,
        status: 'content_generated',
        generation_status: 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.course_id);

    // Decrement concurrency counter
    await decrementConcurrencyCounter(input.user_id, input.organization_id);

    logger.info('[GENERATION] Complete', {
      courseId: input.course_id,
      totalLessons: sanitized.sections.reduce((sum, s) => sum + s.lessons.length, 0),
      cost: result.generation_metadata.cost_usd,
    });

    return { success: true };
  } catch (error) {
    logger.error('[GENERATION] Failed', {
      courseId: input.course_id,
      error: error.message,
    });

    // Update course status to failed
    await supabase
      .from('courses')
      .update({
        status: 'generation_failed',
        generation_status: 'failed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.course_id);

    throw error; // Trigger BullMQ retry
  }
}
```

**Register Handler**:
```typescript
// In packages/course-gen-platform/src/orchestrator/worker.ts
import { handleStructureGeneration } from './handlers/stage5-generation';

worker.on('STRUCTURE_GENERATION', handleStructureGeneration);
```

**Test**:
```bash
# Start worker in dev mode
pnpm --filter course-gen-platform dev:worker

# Trigger test job
curl -X POST http://localhost:3001/api/trpc/generation.initiate \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"courseId": "test-course-id"}'

# Check Bull Board
open http://localhost:3001/admin/queues
```

---

### Phase 4: tRPC Endpoints

**Duration**: 0.5 days

#### 3.5.1 Generation Router

**File**: `packages/course-gen-platform/src/trpc/routers/generation.ts`

```typescript
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';

export const generationRouter = router({
  // Initiate generation
  initiate: protectedProcedure
    .input(z.object({ courseId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      // See contracts/generation.initiate.tRPC.md for full implementation
      // ... authorization checks
      // ... concurrency limits
      // ... create BullMQ job
      // ... return job details
    }),

  // Get status
  getStatus: protectedProcedure
    .input(z.object({ courseId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      // See contracts/generation.getStatus.tRPC.md for full implementation
      // ... fetch course with generation_metadata
      // ... determine phase and progress
      // ... return status
    }),
});
```

**Test**:
```typescript
// packages/course-gen-platform/tests/contract/generation.tRPC.test.ts
describe('generation router', () => {
  it('should initiate generation', async () => {
    const result = await caller.generation.initiate({
      courseId: testCourseId,
    });

    expect(result.jobId).toBeTruthy();
    expect(result.status).toMatch(/queued|processing/);
  });

  it('should get status', async () => {
    const status = await caller.generation.getStatus({
      courseId: testCourseId,
    });

    expect(status.progress).toBeGreaterThanOrEqual(0);
    expect(status.progress).toBeLessThanOrEqual(100);
  });
});
```

---

## 4. Testing Strategy

### 4.1 Unit Tests (MANDATORY)

```bash
cd packages/course-gen-platform

# Test individual services
pnpm test:unit src/services/stage5/metadata-generator.test.ts
pnpm test:unit src/services/stage5/section-batch-generator.test.ts
pnpm test:unit src/services/stage5/quality-validator.test.ts

# Test utilities
pnpm test:unit src/services/stage5/json-repair.test.ts
pnpm test:unit src/services/stage5/minimum-lessons-validator.test.ts
```

### 4.2 Contract Tests (MANDATORY)

```bash
# Test tRPC endpoints
pnpm test:contract tests/contract/generation.tRPC.test.ts

# Verify:
# - Input validation (Zod schemas)
# - Authorization (RLS enforcement)
# - Error codes (UNAUTHORIZED, FORBIDDEN, TOO_MANY_REQUESTS)
# - Output schema compliance
```

### 4.3 Integration Tests (REQUIRED)

```bash
# Test end-to-end workflow
pnpm test:integration tests/integration/stage5-generation-worker.test.ts

# Scenarios:
# - Full Analyze results → Generate structure
# - Minimal Analyze output (from title-only user input) → Generate structure
# - Token budget overflow → Gemini fallback
# - Quality validation failure → Retry with OSS 120B
# - Minimum lessons violation → Retry
```

### 4.4 Manual Testing

```bash
# 1. Start all services
docker compose up -d
pnpm --filter course-gen-platform dev

# 2. Create test course via frontend or API
# 3. Trigger generation via frontend button
# 4. Monitor Bull Board: http://localhost:3001/admin/queues
# 5. Check Pino logs in terminal
# 6. Verify course_structure in Supabase dashboard
```

---

## 5. Common Issues & Solutions

### 5.1 JSON Parsing Failures

**Symptom**: `SyntaxError: Unexpected token in JSON`

**Solution**: Use 4-level JSON repair from research.md
```typescript
import { extractJSON, safeJSONParse } from '@/services/stage5/json-repair';

// Instead of:
const data = JSON.parse(response);

// Use:
const jsonStr = extractJSON(response); // Brace counting
const data = safeJSONParse(jsonStr);   // 4-level repair
```

### 5.2 Token Budget Overflow

**Symptom**: `Error: Token limit exceeded (120K)`

**Solution**: Automatic Gemini fallback
```typescript
// In section-batch-generator.ts
try {
  return await this.llm.invoke(prompt);
} catch (error) {
  if (error.message.includes('Token limit')) {
    // Switch to Gemini (1M context)
    const gemini = new ChatOpenAI({ modelName: 'google/gemini-2.5-flash' });
    return await gemini.invoke(prompt);
  }
  throw error;
}
```

### 5.3 Quality Validation Failures

**Symptom**: `QualityError: Semantic similarity below 0.75`

**Solution**: Retry with OSS 120B
```typescript
// In generation-orchestrator.ts
let qualityScore = await validateQuality(result);

if (qualityScore < 0.75) {
  logger.warn('Quality below threshold, retrying with OSS 120B');
  const llm120b = new ChatOpenAI({ modelName: 'openai/gpt-oss-120b' });
  result = await regenerateWithModel(llm120b);
  qualityScore = await validateQuality(result);
}
```

### 5.4 Minimum Lessons Violation (FR-015)

**Symptom**: `ValidationError: Only 8 lessons, minimum 10 required`

**Solution**: Retry with explicit constraint
```typescript
// In generation-orchestrator.ts
const totalLessons = sections.reduce((sum, s) => sum + s.lessons.length, 0);

if (totalLessons < 10) {
  logger.warn(`Only ${totalLessons} lessons, retrying with minimum constraint`);

  const retryPrompt = originalPrompt + `\n\nCRITICAL: Generate minimum 10 lessons total across all sections.`;

  sections = await regenerateWithConstraint(retryPrompt);
}
```

---

## 6. Next Steps After Implementation

1. **Run Full Test Suite**:
   ```bash
   pnpm test:all
   pnpm type-check
   pnpm build
   ```

2. **Code Review**: Use `code-reviewer` agent
   ```bash
   # (From main session, after implementation complete)
   ```

3. **E2E Validation**: Test with real course
   - Minimal user input scenario (title only → Analyze → Generation)
   - Full Analyze results (rich context → Generation)
   - Different styles (academic, conversational, etc.)
   - Different languages (Russian, English)

4. **Performance Benchmarking**:
   - Measure pipeline duration (target <150s)
   - Verify cost per course ($0.15-0.40)
   - Check quality scores (target >0.75)

5. **Documentation Updates**:
   - Update CHANGELOG.md
   - Update README.md with Stage 5 status
   - Update IMPLEMENTATION_ROADMAP_EN.md

---

## 7. Resources

### 7.1 Documentation
- [LangGraph StateGraph](https://langchain-ai.github.io/langgraph/concepts/low_level/#stategraph)
- [OpenRouter Models](https://openrouter.ai/models)
- [Jina-v3 API](https://jina.ai/embeddings/)
- [BullMQ Patterns](https://docs.bullmq.io/patterns/failing)

### 7.2 Example Code
- **Stage 4 Orchestrator**: `src/services/stage4/orchestrator.ts` (StateGraph patterns)
- **Stage 3 Quality Validator**: `src/services/stage3/quality-validator.ts` (Jina-v3 usage)
- **Stage 1 Retry Utility**: `src/utils/retry.ts` (Exponential backoff)
- **Previous n8n Implementation**: `workflows n8n/Generation.js` (reference for JSON repair patterns)

### 7.3 Key Files Modified
```
packages/course-gen-platform/
├── src/
│   ├── orchestrator/handlers/stage5-generation.ts (NEW)
│   ├── services/stage5/ (NEW - 8 files)
│   ├── trpc/routers/generation.ts (NEW)
│   └── utils/ (REUSE from Stage 1-4)
├── supabase/migrations/20251105000000_stage5_generation.sql (NEW)
└── tests/
    ├── unit/stage5/ (NEW - 5 files)
    ├── contract/generation.tRPC.test.ts (NEW)
    └── integration/stage5-generation-worker.test.ts (NEW)

packages/shared-types/
├── src/
│   ├── generation-result.ts (NEW)
│   ├── generation-job.ts (NEW)
│   └── style-prompts.ts (NEW)
```

---

## 8. Support

**Questions?** Check these resources first:
1. [research.md](research.md) - Architectural decisions
2. [data-model.md](data-model.md) - Schema reference
3. [contracts/](contracts/) - API specifications
4. [Stage 4 docs](../007-stage-4-analyze/) - Similar patterns

**Still stuck?** Review Stage 4 implementation - 90% of patterns are reusable!
