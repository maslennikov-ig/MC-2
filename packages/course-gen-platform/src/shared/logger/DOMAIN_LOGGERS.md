# Domain Loggers Usage Guide

Domain-specific loggers provide typed, structured logging for different system domains.

## Overview

All domain loggers automatically write WARN/ERROR/FATAL to the `error_logs` table through the enhanced logger proxy. INFO-level logs only go to console/Axiom.

```
┌─────────────────┐
│ Domain Logger   │  logPipelineError(), logValidationIssue(), etc.
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Enhanced Logger │  Proxy intercepts warn/error/fatal
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌───────┐  ┌────────────┐
│Console│  │error_logs  │ (Supabase table)
│/Axiom │  │table       │
└───────┘  └────────────┘
```

## Available Loggers

### Validation Logger (`domain/validation.logger.ts`)

For validation rules: Bloom's taxonomy, placeholders, duration checks.

| Function                 | Level      | Writes to DB | Description               |
| ------------------------ | ---------- | ------------ | ------------------------- |
| `logValidationIssue()`   | ERROR/WARN | ✅           | Log validation failures   |
| `logValidationSuccess()` | INFO       | ❌           | Log successful validation |
| `logValidationStart()`   | INFO       | ❌           | Log validation start      |

**Type Guard**: `isValidationIssueParams(obj)`

**Example**:

```typescript
import { logValidationIssue } from '../shared/logger/domain';

// Log validation error (writes to error_logs)
logValidationIssue({
  courseId: 'abc-123',
  ruleId: 'placeholder_detection',
  severity: 'ERROR',
  path: 'sections[0].lessons[1]',
  issues: ['Found placeholder: [TBD]'],
  suggestion: 'Replace placeholders with actual content',
});

// Log validation warning (writes to error_logs)
logValidationIssue({
  courseId: 'abc-123',
  ruleId: 'duration_check',
  severity: 'WARNING',
  path: 'sections[0]',
  warnings: ['Duration exceeds recommended maximum'],
});
```

### Pipeline Logger (`domain/pipeline.logger.ts`)

For pipeline/orchestration: stage transitions, phase execution.

| Function                | Level | Writes to DB | Description           |
| ----------------------- | ----- | ------------ | --------------------- |
| `logPipelineStart()`    | INFO  | ❌           | Log phase start       |
| `logPipelineComplete()` | INFO  | ❌           | Log phase completion  |
| `logPipelineError()`    | ERROR | ✅           | Log pipeline errors   |
| `logPipelineRetry()`    | WARN  | ✅           | Log retry attempts    |
| `logStageTransition()`  | INFO  | ❌           | Log stage transitions |

**Type Guard**: `isPipelineContext(obj)`

**Example**:

```typescript
import { logPipelineError, logPipelineStart } from '../shared/logger/domain';

logPipelineStart({
  courseId: 'abc-123',
  stage: 'stage_5',
  phase: 'metadata',
  attemptNumber: 1,
});

logPipelineError({
  courseId: 'abc-123',
  stage: 'stage_5',
  phase: 'validation',
  error: new Error('Validation failed'),
  recoverable: true,
});
```

### Generation Logger (`domain/generation.logger.ts`)

For LLM generation: model calls, tokens, quality checks.

| Function                 | Level     | Writes to DB | Description               |
| ------------------------ | --------- | ------------ | ------------------------- |
| `logLLMCall()`           | INFO      | ❌           | Log LLM API calls         |
| `logGenerationSuccess()` | INFO      | ❌           | Log successful generation |
| `logGenerationError()`   | ERROR     | ✅           | Log generation errors     |
| `logQualityCheck()`      | INFO/WARN | ✅ (if WARN) | Log quality checks        |
| `logModelFallback()`     | WARN      | ✅           | Log model fallbacks       |

**Type Guard**: `isGenerationContext(obj)`

**Example**:

```typescript
import { logLLMCall, logGenerationError } from '../shared/logger/domain';

logLLMCall({
  courseId: 'abc-123',
  model: 'gpt-4o',
  stage: 'stage_5',
  attemptNumber: 1,
  tokensUsed: 1500,
  durationMs: 2300,
  cached: false,
});

logGenerationError({
  courseId: 'abc-123',
  model: 'gpt-4o',
  stage: 'stage_5',
  attemptNumber: 1,
  error: new Error('Rate limit exceeded'),
  retryable: true,
  fallbackModel: 'gpt-4o-mini',
});
```

### RAG Logger (`domain/rag.logger.ts`)

For RAG/vector search: queries, cache, embeddings.

| Function            | Level | Writes to DB | Description           |
| ------------------- | ----- | ------------ | --------------------- |
| `logRagSearch()`    | INFO  | ❌           | Log search queries    |
| `logRagError()`     | ERROR | ✅           | Log RAG errors        |
| `logRagCache()`     | INFO  | ❌           | Log cache hits/misses |
| `logRagEmbedding()` | INFO  | ❌           | Log embeddings        |
| `logRagNoResults()` | WARN  | ✅           | Log empty results     |

**Type Guard**: `isRagContext(obj)`

**Example**:

```typescript
import { logRagSearch, logRagError } from '../shared/logger/domain';

logRagSearch({
  courseId: 'abc-123',
  query: 'machine learning basics',
  topK: 10,
  resultsCount: 8,
  durationMs: 150,
});

logRagError({
  courseId: 'abc-123',
  error: new Error('Qdrant connection failed'),
  operation: 'search',
  fallbackUsed: true,
});
```

### Job Logger (`domain/job.logger.ts`)

For background jobs: BullMQ workers, queues.

| Function           | Level | Writes to DB | Description        |
| ------------------ | ----- | ------------ | ------------------ |
| `logJobStart()`    | INFO  | ❌           | Log job start      |
| `logJobComplete()` | INFO  | ❌           | Log job completion |
| `logJobError()`    | ERROR | ✅           | Log job errors     |
| `logJobProgress()` | INFO  | ❌           | Log job progress   |
| `logJobRetry()`    | WARN  | ✅           | Log job retries    |
| `logJobStalled()`  | WARN  | ✅           | Log stalled jobs   |

**Type Guard**: `isJobContext(obj)`

**Example**:

```typescript
import { logJobStart, logJobError } from '../shared/logger/domain';

logJobStart({
  jobId: 'job-123',
  jobType: 'COURSE_GENERATION',
  courseId: 'abc-123',
  attemptNumber: 1,
});

logJobError({
  jobId: 'job-123',
  jobType: 'COURSE_GENERATION',
  courseId: 'abc-123',
  attemptNumber: 3,
  error: new Error('Max retries exceeded'),
  retriable: false,
  moveToDLQ: true,
});
```

## When to Use Which Logger

| Operation                                | Logger     | Key Functions                          |
| ---------------------------------------- | ---------- | -------------------------------------- |
| Validation rules (Bloom's, placeholders) | Validation | `logValidationIssue()`                 |
| Pipeline phase execution                 | Pipeline   | `logPipelineStart/Complete/Error()`    |
| Stage transitions                        | Pipeline   | `logStageTransition()`                 |
| LLM API calls                            | Generation | `logLLMCall()`, `logGenerationError()` |
| Quality checks                           | Generation | `logQualityCheck()`                    |
| Model fallbacks                          | Generation | `logModelFallback()`                   |
| Vector search                            | RAG        | `logRagSearch()`, `logRagError()`      |
| Cache operations                         | RAG        | `logRagCache()`                        |
| BullMQ jobs                              | Job        | `logJobStart/Complete/Error()`         |
| Job progress                             | Job        | `logJobProgress()`                     |

## Naming Convention

- **TypeScript**: camelCase (`courseId`, `jobId`, `attemptNumber`)
- **Database**: snake_case (`course_id`, `job_id`, `attempt_number`)

The enhanced logger automatically converts camelCase to snake_case when writing to `error_logs`.

## Type Guards

Each domain provides type guards for runtime validation:

```typescript
import { isPipelineContext, isJobContext } from '../shared/logger/domain';

const data = JSON.parse(someInput);

if (isPipelineContext(data)) {
  logPipelineStart(data); // TypeScript knows data is PipelineContext
}

if (isJobContext(data)) {
  logJobStart(data); // TypeScript knows data is JobContext
}
```

## Error_logs Integration

WARN/ERROR/FATAL calls automatically write to `error_logs` table:

| Log Level        | Writes to DB | Severity in DB |
| ---------------- | ------------ | -------------- |
| `logger.info()`  | ❌           | -              |
| `logger.warn()`  | ✅           | WARNING        |
| `logger.error()` | ✅           | ERROR          |
| `logger.fatal()` | ✅           | CRITICAL       |

## Migration from Direct Logger Calls

**Before** (using base logger directly):

```typescript
import logger from '../shared/logger';
logger.warn({ courseId, error }, 'Pipeline failed');
```

**After** (using domain logger):

```typescript
import { logPipelineError } from '../shared/logger/domain';
logPipelineError({
  courseId,
  stage: 'stage_5',
  phase: 'validation',
  error,
  recoverable: true,
});
```

**Benefits**:

- Typed context (TypeScript catches errors)
- Clearer intent (semantic function names)
- Consistent `error_logs` structure
- JSDoc examples for every function
