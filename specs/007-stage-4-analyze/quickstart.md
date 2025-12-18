# Quickstart: Stage 4 Analysis Implementation

**Feature**: Course Content Analysis (Stage 4)
**Audience**: Developers implementing Stage 4
**Prerequisites**: Stages 0-3 complete, familiar with TypeScript, tRPC, BullMQ

## Overview

This quickstart guides you through implementing Stage 4 (Course Content Analysis), which processes course materials and generates English-language analysis for Stage 5 (Generation). You'll implement:

1. **5 analysis phases** with per-phase model selection
2. **Multi-model orchestration** (20B for simple tasks, 120B for expert analysis)
3. **Real-time progress tracking** (6 phases, 30s-10min window)
4. **Stage 3 barrier enforcement** (100% document completion check)
5. **Research flag detection** (conservative LLM-based flagging)
6. **Quality validation** (semantic similarity checks)

**Estimated Time**: 5-6 days (infrastructure 70% ready from Stages 0-3)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ Stage 4 Analysis: Multi-Phase Multi-Model Orchestration        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Phase 0: Pre-Flight Validation (No LLM)                       │
│  ├─ Stage 3 barrier check (100% docs complete)                 │
│  ├─ Input validation (minimum 10 lessons)                      │
│  └─ Progress: 0-10%                                             │
│                                                                 │
│  Phase 1: Basic Classification (20B)                           │
│  ├─ Course category detection (6 categories)                   │
│  ├─ Contextual language generation                             │
│  ├─ Topic analysis (concepts, keywords)                        │
│  └─ Progress: 10-25%                                            │
│                                                                 │
│  Phase 2: Scope Analysis (20B)                                 │
│  ├─ Lesson count estimation                                    │
│  ├─ Content hours calculation                                  │
│  ├─ Minimum 10 lessons validation                              │
│  └─ Progress: 25-45%                                            │
│                                                                 │
│  Phase 3: Deep Expert Analysis (120B ALWAYS)                   │
│  ├─ Research flag detection (conservative)                     │
│  ├─ Pedagogical strategy design                                │
│  ├─ Expansion areas identification                             │
│  └─ Progress: 45-75%                                            │
│                                                                 │
│  Phase 4: Document Synthesis (Adaptive: 20B/120B)              │
│  ├─ Model selection (<3 docs: 20B, ≥3 docs: 120B)              │
│  ├─ Scope instructions generation                              │
│  ├─ Content strategy determination                             │
│  └─ Progress: 75-90%                                            │
│                                                                 │
│  Phase 5: Final Assembly (No LLM)                              │
│  ├─ Combine all phase outputs                                  │
│  ├─ Validate complete analysis result                          │
│  ├─ Store to courses.analysis_result                           │
│  └─ Progress: 90-100%                                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Step 1: Database Migrations (1 hour)

### 1.1 Create llm_model_config Table

**File**: `packages/course-gen-platform/supabase/migrations/20251031100000_stage4_model_config.sql`

Run migration (already created in data-model.md):
```bash
cd packages/course-gen-platform
pnpm supabase db push
```

**Verify**:
```sql
SELECT * FROM llm_model_config WHERE config_type = 'global';
-- Should return 5 rows (phase_1, phase_2, phase_3, phase_4, emergency)
```

### 1.2 Add analysis_result Column to courses

**File**: `packages/course-gen-platform/supabase/migrations/20251031110000_stage4_analysis_fields.sql`

Run migration:
```bash
pnpm supabase db push
```

**Verify**:
```sql
\d+ courses;
-- Should show analysis_result JSONB column with GIN index
```

## Step 2: TypeScript Types & Zod Schemas (2-3 hours)

### 2.1 Shared Types Package

**File**: `shared-types/src/analysis-job.ts`

```typescript
export interface StructureAnalysisJob {
  course_id: string;
  organization_id: string;
  user_id: string;
  input: {
    topic: string;
    language: string;
    style: string;
    answers?: string;
    target_audience: 'beginner' | 'intermediate' | 'advanced' | 'mixed';
    difficulty: string;
    lesson_duration_minutes: number;
    document_summaries?: DocumentSummary[];
  };
  priority: number;
  attempt_count: number;
  created_at: string;
}

export interface DocumentSummary {
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
}
```

**File**: `shared-types/src/analysis-result.ts`

Copy full `AnalysisResult` interface from `data-model.md` section 2.1.

**File**: `shared-types/src/model-config.ts`

```typescript
export interface ModelConfig {
  model_id: string;
  fallback_model_id?: string;
  temperature: number;
  max_tokens: number;
}

export type PhaseName =
  | 'phase_1_classification'
  | 'phase_2_scope'
  | 'phase_3_expert'
  | 'phase_4_synthesis'
  | 'emergency';
```

### 2.2 Zod Schemas

**File**: `packages/course-gen-platform/src/types/analysis-result.ts`

Copy Zod schemas from `data-model.md` section 2.2 (AnalysisResultSchema, etc.).

**Build & Verify**:
```bash
cd shared-types && pnpm build
cd ../course-gen-platform && pnpm type-check
# Should pass with 0 errors
```

## Step 3: Phase Services (2-3 days)

### 3.1 Phase 1: Basic Classification

**File**: `packages/course-gen-platform/src/services/analysis/phase-1-classifier.ts`

**Key Logic**:
1. Load user input (topic, language, answers, document summaries)
2. Call 20B model to determine course category (professional, creative, etc.)
3. Generate contextual language (adapt templates per category)
4. Extract key concepts and domain keywords
5. Validate output with Zod schema
6. Return Phase1Output

**Example Prompt** (see `DataAnalyze.js` lines 231-412 for n8n reference):
```typescript
const prompt = `You are an expert curriculum architect with 15+ years experience in adult education (andragogy).

CRITICAL: ALL your response MUST be in ENGLISH ONLY, regardless of input language!

INPUT DATA:
Topic: ${input.topic}
Language: ${input.language} (but respond in ENGLISH)
Lesson Duration: ${input.lesson_duration_minutes} minutes per lesson
Audience: ${input.target_audience}
${input.answers ? 'User Requirements:\n' + input.answers : ''}
${documentSummaries ? 'Content Summary:\n' + documentSummaries.map(d => d.processed_content).join('\n\n') : ''}

---

TASK 1: DETERMINE COURSE CATEGORY

Analyze the topic semantically to determine PRIMARY category:

- professional: Career/work skills (programming, business, finance, marketing)
- personal: Life skills, psychology, relationships, self-improvement
- creative: Arts, design, music, creative expression
- hobby: Leisure activities, crafts, DIY, recreational
- spiritual: Meditation, yoga, tarot, astrology, inner practices
- academic: Theoretical knowledge, sciences, mathematics, research

Return:
- primary: the main category
- confidence: 0-1 (0.9+ for clear cases)
- reasoning: why (50-200 chars)
- secondary: optional if spans multiple

---

TASK 2: GENERATE CONTEXTUAL LANGUAGE

Based on the detected category, adapt the base template specifically for "${input.topic}".

[Category templates from DataAnalyze.js lines 79-122]

Generate contextual_language object with these fields:
1. why_matters_context (50-100 chars): Complete: "This matters [YOUR TEXT HERE]"
2. motivators (100-200 chars): What drives learners in THIS specific course?
3. experience_prompt (100-200 chars): Question connecting to their experience
4. problem_statement_context (50-100 chars): Complete: "Problems that [YOUR TEXT HERE]"
5. knowledge_bridge (100-200 chars): Bridge existing knowledge to ${input.topic}
6. practical_benefit_focus (100-200 chars): Tangible benefits from mastering ${input.topic}

---

TASK 3: ANALYZE TOPIC

1. Determine exact topic and completeness (0-100%)
2. Assess complexity: narrow/medium/broad
3. Identify target audience level
4. Extract 3-10 KEY CONCEPTS
5. Extract 5-15 domain keywords
6. Identify missing elements if incomplete

---

Return ONLY valid JSON (no markdown, no text):
{
  "course_category": { ... },
  "contextual_language": { ... },
  "topic_analysis": { ... }
}
`;
```

**Implementation Pattern**:
```typescript
export async function runPhase1Classification(input: StructureAnalysisJob['input']): Promise<Phase1Output> {
  const startTime = Date.now();

  // Get model config
  const modelConfig = await getModelForPhase('phase_1_classification');

  // Build prompt
  const prompt = buildPhase1Prompt(input);

  // Call LLM with retry
  const response = await llmClient.invoke(prompt, modelConfig);

  // Parse and validate
  const parsed = JSON.parse(response.content);
  const validated = Phase1OutputSchema.parse(parsed);

  // Quality validation (optional)
  const qualityScore = await qualityValidator.validateQuality(prompt, JSON.stringify(validated));

  return {
    ...validated,
    phase_metadata: {
      duration_ms: Date.now() - startTime,
      model_used: modelConfig.model_id,
      tokens: response.usage,
      quality_score: qualityScore.score,
      retry_count: 0
    }
  };
}
```

### 3.2 Phase 2: Scope Analysis

**File**: `packages/course-gen-platform/src/services/analysis/phase-2-scope.ts`

**Key Logic**:
1. Estimate content hours (0.5-200h) based on topic complexity
2. Calculate total lessons: `Math.ceil((estimated_hours * 60) / lesson_duration_minutes)`
3. **CRITICAL**: If total_lessons < 10, throw error with clear message
4. Generate sections_breakdown (1-30 sections)
5. Validate output with Zod schema

**Minimum Lesson Validation**:
```typescript
if (validated.recommended_structure.total_lessons < 10) {
  throw new Error(
    `Insufficient scope for minimum 10 lessons (estimated: ${validated.recommended_structure.total_lessons}). ` +
    `Please expand topic or provide additional requirements.`
  );
}
```

### 3.3 Phase 3: Deep Expert Analysis

**File**: `packages/course-gen-platform/src/services/analysis/phase-3-expert.ts`

**Key Logic** (ALWAYS uses 120B model):
1. Design pedagogical strategy (teaching_style, assessment_approach)
2. Identify expansion areas (if information_completeness < 80%)
3. **Detect research flags** (conservative LLM-based)

**Research Flag Detection Prompt**:
```typescript
const researchPrompt = `You are an expert at identifying time-sensitive content requiring up-to-date information.

Topic: ${input.topic}
User Requirements: ${input.answers}

CRITICAL: Flag topics for research ONLY if BOTH conditions are met:
1. Information becomes outdated within 6 months
2. Explicit references to laws/regulations/tech versions

Examples of FLAGGABLE content:
- Legal/regulatory: "Постановление 1875", "procurement law", "GDPR compliance"
- Technology: "React 19 features", "Node.js 22 breaking changes"

Examples of NON-FLAGGABLE content:
- General concepts (functions, loops, OOP)
- Timeless skills (communication, leadership)
- Creative techniques (watercolor painting, Tarot reading)

Return ONLY topics that truly need research (empty array if none):
{
  "research_flags": [
    {
      "topic": "Постановление 1875",
      "reason": "regulation_updates",
      "context": "Russian procurement law subject to frequent amendments"
    }
  ]
}
`;
```

### 3.4 Phase 4: Document Synthesis (Adaptive)

**File**: `packages/course-gen-platform/src/services/analysis/phase-4-synthesis.ts`

**Key Logic**:
1. **Adaptive model selection**: <3 docs → 20B, ≥3 docs → 120B
2. Generate scope_instructions (100-800 chars for Stage 5)
3. Determine content_strategy (create_from_scratch, expand_and_enhance, optimize_existing)

**Adaptive Model Selection**:
```typescript
const documentCount = input.document_summaries?.length || 0;
const modelId = documentCount < 3 ? 'openai/gpt-oss-20b' : 'openai/gpt-oss-120b';
```

### 3.5 Phase 5: Final Assembly (No LLM)

**File**: `packages/course-gen-platform/src/services/analysis/phase-5-assembly.ts`

**Key Logic**:
1. Combine all phase outputs into `AnalysisResult`
2. Calculate total cost, duration, tokens
3. Validate complete structure with Zod
4. Return final result

**No LLM calls** - pure data assembly logic.

## Step 4: Multi-Phase Orchestrator (1 day)

### 4.1 Orchestrator Service

**File**: `packages/course-gen-platform/src/services/analysis/analysis-orchestrator.ts`

**Key Logic**:
```typescript
export async function runAnalysisOrchestration(job: StructureAnalysisJob): Promise<AnalysisResult> {
  const courseId = job.course_id;
  const startTime = Date.now();

  // Phase 0: Pre-Flight Validation (10%)
  await updateCourseProgress(courseId, 'analyzing_task', 0, 'Проверка документов...');
  const barrierCheck = await validateStage4Barrier(courseId);
  if (!barrierCheck.allowed) {
    throw new Error(`Stage 3 barrier failed: ${barrierCheck.reason}`);
  }
  await updateCourseProgress(courseId, 'analyzing_task', 10, 'Проверка завершена');

  // Phase 1: Classification (25%)
  await updateCourseProgress(courseId, 'analyzing_task', 10, 'Базовая категоризация курса...');
  const phase1Output = await runPhase1Classification(job.input);
  await updateCourseProgress(courseId, 'analyzing_task', 25, 'Категоризация завершена');

  // Phase 2: Scope (45%)
  await updateCourseProgress(courseId, 'analyzing_task', 25, 'Оценка объема и структуры...');
  const phase2Output = await runPhase2Scope(job.input, phase1Output);
  // CRITICAL: Minimum 10 lessons check happens inside runPhase2Scope
  await updateCourseProgress(courseId, 'analyzing_task', 45, 'Оценка завершена');

  // Phase 3: Expert (75%)
  await updateCourseProgress(courseId, 'analyzing_task', 45, 'Глубокий экспертный анализ...');
  const phase3Output = await runPhase3Expert(job.input, phase1Output, phase2Output);
  await updateCourseProgress(courseId, 'analyzing_task', 75, 'Экспертный анализ завершен');

  // Phase 4: Synthesis (90%)
  await updateCourseProgress(courseId, 'analyzing_task', 75, 'Синтез документов...');
  const phase4Output = await runPhase4Synthesis(job.input, phase1Output, phase2Output, phase3Output);
  await updateCourseProgress(courseId, 'analyzing_task', 90, 'Синтез завершен');

  // Phase 5: Assembly (100%)
  await updateCourseProgress(courseId, 'analyzing_task', 90, 'Финализация анализа...');
  const analysisResult = await runPhase5Assembly(phase1Output, phase2Output, phase3Output, phase4Output, {
    total_duration_ms: Date.now() - startTime,
    job
  });
  await updateCourseProgress(courseId, 'analyzing_task', 100, 'Анализ завершен');

  return analysisResult;
}
```

## Step 5: BullMQ Worker Handler (1 day)

### 5.1 Worker Handler

**File**: `packages/course-gen-platform/src/orchestrator/handlers/stage4-analysis.ts`

**Pattern** (follows Stage 2-3 handlers):
```typescript
import { Job } from 'bullmq';
import { StructureAnalysisJob, StructureAnalysisJobResult } from '@shared-types';
import { runAnalysisOrchestration } from '@/services/analysis/analysis-orchestrator';
import { supabase } from '@/database/supabase';
import logger from '@/utils/logger';

export async function handleStructureAnalysis(job: Job<StructureAnalysisJob>): Promise<StructureAnalysisJobResult> {
  const { course_id, organization_id } = job.data;
  const requestId = `analysis-${course_id}-${Date.now()}`;
  const log = logger.child({ requestId, courseId: course_id });

  log.info('Starting Stage 4 analysis', { input: job.data.input });

  try {
    // Run multi-phase orchestration
    const analysisResult = await runAnalysisOrchestration(job.data);

    // Store result in courses.analysis_result
    const { error: updateError } = await supabase
      .from('courses')
      .update({ analysis_result: analysisResult })
      .eq('id', course_id)
      .eq('organization_id', organization_id);

    if (updateError) {
      throw new Error(`Failed to store analysis result: ${updateError.message}`);
    }

    log.info('Stage 4 analysis completed', {
      duration_ms: analysisResult.metadata.total_duration_ms,
      total_lessons: analysisResult.recommended_structure.total_lessons,
      research_flags: analysisResult.research_flags.length,
      cost_usd: analysisResult.metadata.total_cost_usd
    });

    return {
      success: true,
      course_id,
      analysis_result: analysisResult,
      metadata: {
        total_duration_ms: analysisResult.metadata.total_duration_ms,
        retry_count: job.attemptsMade,
        completed_at: new Date().toISOString()
      }
    };

  } catch (error: any) {
    log.error('Stage 4 analysis failed', { error: error.message, stack: error.stack });

    // Determine error code
    let errorCode = 'LLM_ERROR';
    if (error.message.includes('Stage 3 barrier failed')) {
      errorCode = 'BARRIER_FAILED';
    } else if (error.message.includes('Insufficient scope for minimum 10 lessons')) {
      errorCode = 'MINIMUM_LESSONS_NOT_MET';
    }

    return {
      success: false,
      course_id,
      error: {
        code: errorCode,
        message: error.message,
        details: { stack: error.stack }
      },
      metadata: {
        total_duration_ms: Date.now() - job.timestamp,
        retry_count: job.attemptsMade,
        completed_at: new Date().toISOString()
      }
    };
  }
}
```

### 5.2 Register Handler in Worker

**File**: `packages/course-gen-platform/src/orchestrator/worker.ts`

```typescript
import { handleStructureAnalysis } from './handlers/stage4-analysis';

// Add to job processor map
worker.on('active', (job) => {
  if (job.name === 'STRUCTURE_ANALYSIS') {
    handleStructureAnalysis(job);
  }
  // ... other job types
});
```

## Step 6: tRPC API Endpoints (1 day)

### 6.1 Analysis Router

**File**: `packages/course-gen-platform/src/trpc/routers/analysis.ts`

```typescript
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { queue } from '@/orchestrator/queue';
import { supabase } from '@/database/supabase';

export const analysisRouter = router({
  // Start analysis
  start: protectedProcedure
    .input(z.object({
      courseId: z.string().uuid(),
      forceRestart: z.boolean().default(false)
    }))
    .mutation(async ({ input, ctx }) => {
      const { courseId, forceRestart } = input;
      const userId = ctx.user.id;
      const organizationId = ctx.user.organization_id;

      // Fetch course
      const { data: course, error } = await supabase
        .from('courses')
        .select('*')
        .eq('id', courseId)
        .eq('organization_id', organizationId)
        .single();

      if (error || !course) {
        throw new Error('Course not found or access denied');
      }

      // Check if analysis already in progress
      if (course.generation_status === 'analyzing_task' && !forceRestart) {
        throw new Error('Analysis already in progress');
      }

      // Create BullMQ job
      const job = await queue.add('STRUCTURE_ANALYSIS', {
        course_id: courseId,
        organization_id: organizationId,
        user_id: userId,
        input: {
          topic: course.topic,
          language: course.language,
          style: course.style,
          answers: course.answers,
          target_audience: course.target_audience,
          difficulty: course.difficulty,
          lesson_duration_minutes: course.lesson_duration_minutes,
          document_summaries: [] // Fetch from file_catalog
        },
        priority: getTierPriority(ctx.user.subscription_tier),
        attempt_count: 0,
        created_at: new Date().toISOString()
      });

      return { jobId: job.id, status: 'started' };
    }),

  // Get analysis status
  getStatus: protectedProcedure
    .input(z.object({ courseId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const { data: course, error } = await supabase
        .from('courses')
        .select('generation_status, generation_progress')
        .eq('id', input.courseId)
        .eq('organization_id', ctx.user.organization_id)
        .single();

      if (error || !course) {
        throw new Error('Course not found or access denied');
      }

      return {
        status: course.generation_status,
        progress: course.generation_progress
      };
    }),

  // Get analysis result
  getResult: protectedProcedure
    .input(z.object({ courseId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const { data: course, error } = await supabase
        .from('courses')
        .select('analysis_result')
        .eq('id', input.courseId)
        .eq('organization_id', ctx.user.organization_id)
        .single();

      if (error || !course) {
        throw new Error('Course not found or access denied');
      }

      return { analysisResult: course.analysis_result };
    })
});
```

## Step 7: Testing (1-2 days)

### 7.1 Unit Tests

**Files**:
- `packages/course-gen-platform/tests/unit/phase-1-classifier.test.ts`
- `packages/course-gen-platform/tests/unit/phase-2-scope.test.ts`
- `packages/course-gen-platform/tests/unit/phase-3-expert.test.ts`
- `packages/course-gen-platform/tests/unit/research-flag-detector.test.ts`

**Example Test** (Phase 2 minimum lesson validation):
```typescript
import { describe, it, expect } from 'vitest';
import { runPhase2Scope } from '@/services/analysis/phase-2-scope';

describe('Phase 2: Scope Analysis', () => {
  it('should throw error if total_lessons < 10', async () => {
    const input = {
      topic: 'Very narrow topic',
      lesson_duration_minutes: 30,
      // ... minimal input
    };

    const phase1Output = {
      topic_analysis: {
        complexity: 'narrow',
        determined_topic: 'Very narrow topic',
        // ... minimal output
      }
    };

    await expect(runPhase2Scope(input, phase1Output)).rejects.toThrow(
      'Insufficient scope for minimum 10 lessons'
    );
  });

  it('should succeed with >=10 lessons', async () => {
    const input = {
      topic: 'Comprehensive React Hooks course',
      lesson_duration_minutes: 5,
      // ... sufficient input
    };

    const phase1Output = {
      topic_analysis: {
        complexity: 'medium',
        determined_topic: 'React Hooks',
        // ... output
      }
    };

    const result = await runPhase2Scope(input, phase1Output);
    expect(result.recommended_structure.total_lessons).toBeGreaterThanOrEqual(10);
  });
});
```

### 7.2 Integration Tests

**File**: `packages/course-gen-platform/tests/integration/stage4-analysis.test.ts`

**Example Test** (End-to-end workflow):
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { queue } from '@/orchestrator/queue';
import { supabase } from '@/database/supabase';

describe('Stage 4: Full Analysis Workflow', () => {
  let testCourseId: string;

  beforeAll(async () => {
    // Create test course with Stage 3 complete
    const { data } = await supabase.from('courses').insert({
      topic: 'React Hooks',
      language: 'ru',
      style: 'professional',
      lesson_duration_minutes: 5,
      target_audience: 'intermediate',
      difficulty: 'intermediate',
      generation_status: 'summaries_created'
    }).select().single();

    testCourseId = data.id;
  });

  it('should complete full 5-phase analysis', async () => {
    // Create job
    const job = await queue.add('STRUCTURE_ANALYSIS', {
      course_id: testCourseId,
      input: { /* ... */ }
    });

    // Wait for completion (max 10 minutes)
    const result = await job.waitUntilFinished(queueEvents, 600000);

    expect(result.success).toBe(true);
    expect(result.analysis_result).toBeDefined();
    expect(result.analysis_result.recommended_structure.total_lessons).toBeGreaterThanOrEqual(10);
  });

  afterAll(async () => {
    // Cleanup
    await supabase.from('courses').delete().eq('id', testCourseId);
  });
});
```

## Step 8: Documentation & Review (1 day)

### 8.1 Update IMPLEMENTATION_ROADMAP_EN.md

Mark Stage 4 as complete:
```markdown
### Stage 4: Course Structure Analyze ✅ **COMPLETE**

**Status:** ✅ 100% COMPLETE
**Document:** `specs/007-stage-4-analyze/`
**Duration:** Planned 6-8 days | Actual: ~5-6 days
**Completed:** 2025-11-XX
**Release:** vX.XX.X

**Goal:** Task analysis and structure planning with multi-phase multi-model orchestration

**Tasks:**
- [X] Database migrations (llm_model_config, analysis_result)
- [X] TypeScript types + Zod schemas
- [X] Phase 1: Basic Classification (20B)
- [X] Phase 2: Scope Analysis (20B)
- [X] Phase 3: Deep Expert Analysis (120B)
- [X] Phase 4: Document Synthesis (Adaptive)
- [X] Phase 5: Final Assembly (No LLM)
- [X] Multi-phase orchestrator
- [X] BullMQ worker handler
- [X] tRPC API endpoints (start, getStatus, getResult)
- [X] Unit tests (15+ tests)
- [X] Integration tests (3+ tests)
- [X] Code review (Constitution compliance)

**Acceptance Criteria:**
- ✅ Multi-phase analysis operational (5 phases)
- ✅ Stage 3 barrier enforced (100% doc completion)
- ✅ Minimum 10 lessons validated (hard failure)
- ✅ Research flags detected (conservative LLM-based)
- ✅ Progress tracking (6 phases, 0-100%)
- ✅ Quality validation (semantic similarity)
- ✅ Cost tracking (per-phase analytics)
- ✅ Tests passing (15+ unit + 3+ integration)
```

### 8.2 Run Code Review

```bash
# Launch code-reviewer agent
Task tool with subagent_type=code-reviewer
```

Review focus:
- Constitution compliance (all 8 principles)
- Quality gates validation
- Test coverage
- Security (RLS policies, input validation)

## Common Issues & Solutions

### Issue 1: "Insufficient scope for minimum 10 lessons"

**Symptom**: Phase 2 throws error during scope analysis

**Solution**: This is expected behavior for narrow topics. User must:
1. Expand topic description in `answers` field
2. Add more documents in Stage 2
3. Choose longer lesson duration (e.g., 10-15 minutes instead of 3-5)

### Issue 2: Stage 3 barrier fails

**Symptom**: Phase 0 throws "Stage 3 barrier failed: X documents incomplete"

**Solution**: Ensure all documents from Stage 2 have `processing_status = 'completed'`:
```sql
SELECT id, file_name, processing_status FROM file_catalog WHERE course_id = '...';
-- Update if needed:
UPDATE file_catalog SET processing_status = 'completed' WHERE id = '...';
```

### Issue 3: Phase 3 uses 20B instead of 120B

**Symptom**: `phase_3_expert` metadata shows `model_used: 'openai/gpt-oss-20b'`

**Solution**: Check `llm_model_config` table:
```sql
SELECT * FROM llm_model_config WHERE phase_name = 'phase_3_expert' AND config_type = 'global';
-- Should show model_id = 'openai/gpt-oss-120b'
```

### Issue 4: Research flags over-flagging (>5%)

**Symptom**: Most courses get research_flags when they shouldn't

**Solution**: Revise Phase 3 research flag prompt to be more conservative:
- Add explicit examples of NON-flaggable content
- Increase threshold (e.g., "only if outdated within 3 months" instead of 6)
- Add validation step: "Double-check: does this TRULY need web research?"

## Next Steps After Stage 4

**Stage 5: Course Structure Generate**
- Use `analysis_result.scope_instructions` as input
- Generate sections + lessons based on `recommended_structure.sections_breakdown`
- Implement approval workflow (semi-automatic mode)
- Database: sections, lessons, lesson_content tables already exist (Stage 0)

**Estimated Time**: 4-5 days (80% infrastructure ready)

## Resources

- **Spec**: `/specs/007-stage-4-analyze/spec.md`
- **Research**: `/specs/007-stage-4-analyze/research.md`
- **Data Model**: `/specs/007-stage-4-analyze/data-model.md`
- **Contracts**: `/specs/007-stage-4-analyze/contracts/`
- **n8n MVP Reference**: `/workflows n8n/DataAnalyze.js` (Phase logic reference)
- **Stage 3 Patterns**: `/specs/005-stage-3-create/` (LLM client, quality validator, cost calculator)

**Questions?** Ask in #stage-4-analysis channel or review plan.md for orchestration strategy.
