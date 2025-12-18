# Quickstart: Stage 4-6 Course Generation Pipeline

**Date**: 2025-11-22
**Branch**: `010-stages-456-pipeline`

## Overview

This guide covers the implementation of the enhanced course generation pipeline:

- **Stage 2+3**: Document Prioritization (classification + budget allocation)
- **Stage 4**: Analysis with RAG Planning (Phase 6)
- **Stage 5**: Generation with V2 LessonSpecification (Semantic Scaffolding)
- **Stage 6**: Parallel Lesson Content Generation (NEW)

## Prerequisites

### Environment Variables

```bash
# OpenRouter (LLM access)
OPENROUTER_API_KEY=sk-or-...

# Supabase
SUPABASE_URL=https://diqooqbuchsliypgwksu.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# Qdrant (vector DB)
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=...

# Redis (BullMQ)
REDIS_URL=redis://localhost:6379
```

### Dependencies

All dependencies are already in `package.json`. Key additions:

```json
{
  "@langchain/langgraph": "^1.0.0",
  "@langchain/core": "^1.0.0",
  "@langchain/openai": "^1.0.0"
}
```

## Quick Implementation Guide

### 1. Document Prioritization (Stage 2)

**File**: `stages/stage2-document-processing/phases/phase-classification.ts`

```typescript
import { z } from 'zod';
import { openRouterClient } from '@/shared/llm/openrouter-client';

const ClassificationResultSchema = z.object({
  priority: z.enum(['HIGH', 'LOW']),
  importance_score: z.number().min(0).max(1),
  category: z.enum(['course_core', 'supplementary', 'reference', 'regulatory']),
  rationale: z.string(),
});

export async function classifyDocument(
  filename: string,
  content: string,
  tokenCount: number
): Promise<z.infer<typeof ClassificationResultSchema>> {
  const prompt = `Classify this document for course creation:

Filename: ${filename}
Content preview (first 2000 chars): ${content.slice(0, 2000)}
Total tokens: ${tokenCount}

Classification criteria:
- HIGH priority (>=0.7): Lectures, textbooks, syllabi, author presentations
- LOW priority (<0.7): Laws, standards, regulations, supplementary materials

Respond in JSON: { priority, importance_score, category, rationale }`;

  const response = await openRouterClient.chat({
    model: 'openai/gpt-oss-20b',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    response_format: { type: 'json_object' },
  });

  return ClassificationResultSchema.parse(JSON.parse(response.content));
}
```

### 2. Budget Allocation (Stage 3)

**File**: `stages/stage3-summarization/phases/budget-allocator.ts`

```typescript
interface BudgetAllocation {
  selected_model: 'oss-120b' | 'gemini-flash';
  high_budget: number;
  low_budget: number;
}

const THRESHOLD_80K = 80_000;

export function allocateBudget(
  totalHighPriorityTokens: number,
  totalLowPriorityTokens: number
): BudgetAllocation {
  if (totalHighPriorityTokens <= THRESHOLD_80K) {
    return {
      selected_model: 'oss-120b',
      high_budget: 80_000,
      low_budget: Math.max(0, 128_000 - 80_000 - 5_000), // Reserve for prompt
    };
  }

  return {
    selected_model: 'gemini-flash',
    high_budget: 400_000,
    low_budget: Math.max(0, 1_000_000 - 400_000 - 10_000),
  };
}

export function determineProcessingMode(
  priority: 'HIGH' | 'LOW',
  tokenCount: number,
  budgetRemaining: number
): 'full_text' | 'summary' {
  if (priority === 'HIGH' && tokenCount <= 50_000) {
    return 'full_text';
  }

  if (priority === 'LOW' && tokenCount < 3_000 && budgetRemaining >= tokenCount) {
    return 'full_text'; // Exception for small LOW priority docs
  }

  return 'summary';
}
```

### 3. RAG Planning (Stage 4 Phase 6)

**File**: `stages/stage4-analysis/phases/phase-6-rag-planning.ts`

```typescript
import type { SectionBreakdown, ProcessedDocument } from '@megacampus/shared-types';

interface SectionRAGPlan {
  primary_documents: string[];
  search_queries: string[];
  expected_topics: string[];
  confidence: 'high' | 'medium';
  note?: string;
}

export function generateRAGPlan(
  sections: SectionBreakdown[],
  documents: ProcessedDocument[]
): Record<string, SectionRAGPlan> {
  const ragPlan: Record<string, SectionRAGPlan> = {};

  for (const section of sections) {
    // Find relevant documents
    const relevantDocs = documents.filter(doc =>
      section.key_topics.some(topic =>
        doc.content_for_analysis.toLowerCase().includes(topic.toLowerCase())
      )
    ).sort((a, b) => b.importance_score - a.importance_score);

    // Generate search queries
    const searchQueries = [
      ...section.key_topics,
      ...section.learning_objectives.slice(0, 2),
    ];

    // Determine confidence
    const allFullText = relevantDocs.every(d => d.processing_mode === 'full_text');
    const confidence = allFullText ? 'high' : 'medium';

    ragPlan[section.section_id] = {
      primary_documents: relevantDocs.map(d => d.file_id),
      search_queries: searchQueries,
      expected_topics: section.key_topics,
      confidence,
      note: confidence === 'medium'
        ? 'Some documents summarized. Use broader RAG search.'
        : undefined,
    };
  }

  return ragPlan;
}
```

### 4. V2 LessonSpecification (Stage 5)

**File**: `stages/stage5-generation/utils/semantic-scaffolding.ts`

```typescript
import type { LessonSpecificationV2 } from '@megacampus/shared-types';

export function inferContentArchetype(
  topics: string[],
  exerciseTypes: string[]
): 'code_tutorial' | 'concept_explainer' | 'case_study' | 'legal_warning' {
  const topicsLower = topics.map(t => t.toLowerCase()).join(' ');

  if (exerciseTypes.includes('coding') || topicsLower.includes('code')) {
    return 'code_tutorial';
  }

  if (topicsLower.includes('law') || topicsLower.includes('compliance')) {
    return 'legal_warning';
  }

  if (exerciseTypes.includes('case_study') || topicsLower.includes('case')) {
    return 'case_study';
  }

  return 'concept_explainer';
}

export function inferHookStrategy(
  topics: string[],
  audience: string
): 'analogy' | 'statistic' | 'challenge' | 'question' {
  // Technical topics benefit from analogies
  const isTechnical = topics.some(t =>
    /algorithm|code|system|architecture/i.test(t)
  );
  if (isTechnical) return 'analogy';

  // Business topics benefit from statistics
  const isBusiness = topics.some(t =>
    /business|market|roi|cost/i.test(t)
  );
  if (isBusiness) return 'statistic';

  // Novice audience benefits from questions
  if (audience === 'novice') return 'question';

  return 'challenge';
}

export function mapDepthFromWordCount(wordCount: number): 'summary' | 'detailed_analysis' | 'comprehensive' {
  if (wordCount < 300) return 'summary';
  if (wordCount < 600) return 'detailed_analysis';
  return 'comprehensive';
}
```

### 5. Stage 6 LangGraph Orchestrator

**File**: `stages/stage6-lesson-content/orchestrator.ts`

```typescript
import { StateGraph, Annotation, MemorySaver } from '@langchain/langgraph';
import type { LessonSpecificationV2, LessonContent } from '@megacampus/shared-types';
import { plannerNode } from './nodes/planner';
import { expanderNode } from './nodes/expander';
import { assemblerNode } from './nodes/assembler';
import { smootherNode } from './nodes/smoother';

// Define typed state
const LessonGraphState = Annotation.Root({
  lessonSpec: Annotation<LessonSpecificationV2>(),
  ragChunks: Annotation<RAGChunk[]>(),
  outline: Annotation<LessonOutline | null>({ default: () => null }),
  expandedSections: Annotation<string[]>({ default: () => [], reducer: (a, b) => [...a, ...b] }),
  assembledContent: Annotation<string | null>({ default: () => null }),
  finalContent: Annotation<LessonContent | null>({ default: () => null }),
  errors: Annotation<string[]>({ default: () => [], reducer: (a, b) => [...a, ...b] }),
});

// Build graph
const workflow = new StateGraph(LessonGraphState)
  .addNode('planner', plannerNode)
  .addNode('expander', expanderNode)
  .addNode('assembler', assemblerNode)
  .addNode('smoother', smootherNode)
  .addEdge('__start__', 'planner')
  .addConditionalEdges('planner', (state) => {
    if (state.errors.length > 0) return '__end__';
    return 'expander';
  })
  .addEdge('expander', 'assembler')
  .addEdge('assembler', 'smoother')
  .addEdge('smoother', '__end__');

// Compile with checkpointer for state persistence
const checkpointer = new MemorySaver();
export const lessonGraph = workflow.compile({ checkpointer });

// Usage
export async function generateLessonContent(
  lessonSpec: LessonSpecificationV2,
  ragChunks: RAGChunk[]
): Promise<LessonContent> {
  const result = await lessonGraph.invoke({
    lessonSpec,
    ragChunks,
  }, {
    configurable: { thread_id: lessonSpec.lesson_id },
  });

  if (result.errors.length > 0) {
    throw new Error(`Generation failed: ${result.errors.join(', ')}`);
  }

  return result.finalContent!;
}
```

### 6. Dynamic Temperature Selection

**File**: `shared/llm/llm-parameters.ts`

```typescript
type ContentArchetype = 'code_tutorial' | 'concept_explainer' | 'case_study' | 'legal_warning';
type Stage = 'stage2_classification' | 'stage4_analysis' | 'stage5_generation' | 'stage6_content' | 'llm_judge';

interface LLMParameters {
  temperature: number;
  top_p: number;
  frequency_penalty: number;
  presence_penalty: number;
  max_tokens: number;
}

// Stage-specific parameters (from research)
const STAGE_PARAMS: Record<Stage, LLMParameters> = {
  stage2_classification: {
    temperature: 0.0,  // Binary decision - max determinism
    top_p: 0.7,
    frequency_penalty: 0.0,
    presence_penalty: 0.0,
    max_tokens: 20,
  },
  stage4_analysis: {
    temperature: 0.4,  // Strategic reasoning (NOT 0.8!)
    top_p: 0.9,
    frequency_penalty: 0.2,
    presence_penalty: 0.1,
    max_tokens: 2500,
  },
  stage5_generation: {
    temperature: 0.5,  // RAG synthesis
    top_p: 0.9,
    frequency_penalty: 0.2,
    presence_penalty: 0.1,
    max_tokens: 3000,
  },
  stage6_content: {
    temperature: 0.5,  // Default, overridden by archetype
    top_p: 0.9,
    frequency_penalty: 0.2,
    presence_penalty: 0.1,
    max_tokens: 3000,
  },
  llm_judge: {
    temperature: 0.0,  // Industry consensus: temp 0.0 + 3x voting
    top_p: 1.0,
    frequency_penalty: 0.0,
    presence_penalty: 0.0,
    max_tokens: 400,
  },
};

// Content archetype parameters for Stage 6
const ARCHETYPE_PARAMS: Record<ContentArchetype, LLMParameters> = {
  code_tutorial: {
    temperature: 0.25,  // Syntax precision
    top_p: 0.7,
    frequency_penalty: 0.1,
    presence_penalty: 0.1,
    max_tokens: 2500,
  },
  concept_explainer: {
    temperature: 0.65,  // Educational clarity (NOT 1.0!)
    top_p: 0.9,
    frequency_penalty: 0.3,
    presence_penalty: 0.2,
    max_tokens: 3000,
  },
  case_study: {
    temperature: 0.55,  // Narrative coherence
    top_p: 0.9,
    frequency_penalty: 0.2,
    presence_penalty: 0.15,
    max_tokens: 2200,
  },
  legal_warning: {
    temperature: 0.05,  // Zero error tolerance
    top_p: 0.7,
    frequency_penalty: 0.0,
    presence_penalty: 0.0,
    max_tokens: 2500,
  },
};

export function getParametersForStage(stage: Stage): LLMParameters {
  return STAGE_PARAMS[stage];
}

export function getParametersForArchetype(archetype: ContentArchetype): LLMParameters {
  return ARCHETYPE_PARAMS[archetype];
}

export function selectModel(language: 'en' | 'ru', fallbackIndex: number = 0): string {
  const models = language === 'ru'
    ? ['qwen/qwen3-235b-a22b-2507', 'moonshotai/kimi-k2-0905']
    : ['deepseek/deepseek-v3.1-terminus', 'moonshotai/kimi-k2-0905'];

  return models[Math.min(fallbackIndex, models.length - 1)];
}

// LLM Judge with 3x voting for consistency
export async function evaluateWithVoting(
  content: string,
  rubric: string,
  client: OpenRouterClient,
  votingRounds: number = 3
): Promise<{ score: number; confidence: number }> {
  const params = getParametersForStage('llm_judge');
  const scores: number[] = [];

  for (let i = 0; i < votingRounds; i++) {
    const result = await client.chat({
      model: 'openai/gpt-oss-20b',
      messages: [{ role: 'user', content: `Evaluate:\n${content}\n\nRubric:\n${rubric}` }],
      ...params,
    });
    scores.push(parseFloat(result.content));
  }

  // Use median for robustness
  scores.sort((a, b) => a - b);
  const median = scores[Math.floor(scores.length / 2)];
  const variance = scores.reduce((sum, s) => sum + Math.pow(s - median, 2), 0) / scores.length;

  return {
    score: median,
    confidence: variance < 0.1 ? 1.0 : variance < 0.3 ? 0.8 : 0.6,
  };
}
```

### 7. BullMQ Job Handler

**File**: `stages/stage6-lesson-content/handler.ts`

```typescript
import { Worker, Job } from 'bullmq';
import { redis } from '@/shared/redis';
import { generateLessonContent } from './orchestrator';
import { fetchRAGContext } from './utils/rag-fetcher';
import { sanitizeContent } from './validators/xss-sanitizer';
import type { Stage6Job, LessonContent } from '@megacampus/shared-types';

const QUEUE_NAME = 'stage6-lesson-content';

export const stage6Worker = new Worker<Stage6Job, LessonContent>(
  QUEUE_NAME,
  async (job: Job<Stage6Job>) => {
    const { lesson_spec, course_context, rag_context_id } = job.data.input;

    // 1. Fetch pre-retrieved RAG context
    const ragChunks = await fetchRAGContext(rag_context_id);

    // 2. Generate content via LangGraph
    const rawContent = await generateLessonContent(lesson_spec, ragChunks);

    // 3. Sanitize output (XSS protection)
    const sanitizedContent = sanitizeContent(rawContent);

    // 4. Validate quality
    if (sanitizedContent.metadata.quality_score < 0.75) {
      throw new Error(`Quality threshold not met: ${sanitizedContent.metadata.quality_score}`);
    }

    return sanitizedContent;
  },
  {
    connection: redis,
    concurrency: 30,
    limiter: {
      max: 30,
      duration: 1000,
    },
  }
);

// Event handlers
stage6Worker.on('completed', (job, result) => {
  console.log(`Lesson ${job.data.input.lesson_spec.lesson_id} completed`);
});

stage6Worker.on('failed', (job, err) => {
  console.error(`Lesson ${job?.data.input.lesson_spec.lesson_id} failed:`, err);
});
```

## Testing

### Run Type Check

```bash
cd packages/course-gen-platform
pnpm type-check
```

### Run Unit Tests

```bash
pnpm test:unit tests/unit/stages/stage6/
```

### Run Integration Tests

```bash
pnpm test:integration
```

## Common Patterns

### Error Handling with Retry

```typescript
// Retry strategy for Stage 6
const retryStrategy = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 1000,
  },
};

// Model fallback on retry
function getModelForRetry(retryCount: number, language: 'en' | 'ru'): string {
  return selectModel(language, retryCount >= 2 ? 1 : 0);
}
```

### RAG Context Caching

```typescript
// Store context before generation
const contextId = await storeRAGContext(courseId, lessonId, chunks, queryParams);

// Retrieve for retries
const cachedChunks = await fetchRAGContext(contextId);
```

### Concurrency Lock

```typescript
// Prevent concurrent generation
const lockKey = `generation:lock:${courseId}`;
const acquired = await redis.set(lockKey, 'stage6', 'NX', 'EX', 3600);

if (!acquired) {
  throw new Error('Generation already in progress');
}
```

## Next Steps

1. Run `/speckit.tasks` to generate implementation tasks
2. Implement foundation tasks first (types, schemas)
3. Enhance existing stages (2, 3, 4, 5)
4. Create Stage 6 from scratch
5. Write tests alongside implementation
