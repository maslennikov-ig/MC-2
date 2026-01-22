# План: Централизованная архитектура логирования

## Контекст

**Текущее состояние:**

- Enhanced logger в `shared/logger/index.ts` автоматически пишет WARN/ERROR в `error_logs`
- `logValidationIssue` создан в `index.ts`, используется в `validation-orchestrator.ts`
- `logTrace` в `trace-logger.ts` для детальных трейсов генерации
- Auto-mute система с 29 паттернами в `auto-classification.ts`
- ~120 прямых вызовов `logger.warn/error/info` в stage5

**Проблемы:**

1. Контекст передаётся непоследовательно (разные поля в разных местах)
2. Нет domain-specific helpers для разных операций
3. `createErrorContext()` существует в types.ts, но почти не используется
4. Дублирование кода логирования

## Целевая архитектура

```
packages/course-gen-platform/src/shared/logger/
├── index.ts                      # [MODIFY] Base logger + re-export domain
├── types.ts                      # [EXISTS] Types & createErrorContext
├── domain/                       # [CREATE] Domain-specific loggers
│   ├── index.ts                  # Re-export all
│   ├── validation.logger.ts      # Validation rules
│   ├── pipeline.logger.ts        # Pipeline/orchestration
│   ├── rag.logger.ts             # RAG/vector search
│   ├── generation.logger.ts      # LLM generation
│   └── job.logger.ts             # Background jobs
└── context/                      # [CREATE] Context builders
    └── builders.ts               # Typed context factories
```

---

## Спецификация файлов

### 1. `domain/validation.logger.ts`

**Путь:** `packages/course-gen-platform/src/shared/logger/domain/validation.logger.ts`

```typescript
/**
 * Validation Domain Logger
 *
 * Логирование валидационных правил: Bloom's taxonomy, placeholders, duration.
 * WARN/ERROR автоматически пишутся в error_logs через enhanced logger.
 */

import logger from '../index';

export interface ValidationIssueParams {
  courseId: string;
  ruleId: string;
  severity: 'ERROR' | 'WARNING';
  path: string;
  suggestion?: string;
  issues?: string[];
  warnings?: string[];
}

export interface ValidationSuccessParams {
  courseId: string;
  ruleId: string;
  itemsChecked: number;
  passedItems: number;
  durationMs: number;
}

/**
 * Логирует ошибку или предупреждение валидации.
 * ERROR → logger.error → error_logs (severity=ERROR)
 * WARNING → logger.warn → error_logs (severity=WARNING)
 */
export function logValidationIssue(params: ValidationIssueParams): void {
  const { courseId, ruleId, severity, path, suggestion, issues, warnings } = params;
  const logData = {
    courseId,
    ruleId,
    severity,
    path,
    suggestion,
    ...(issues && { issues }),
    ...(warnings && { warnings }),
  };

  if (severity === 'ERROR') {
    logger.error(logData, `Validation error: ${ruleId}`);
  } else {
    logger.warn(logData, `Validation warning: ${ruleId}`);
  }
}

/**
 * Логирует успешную валидацию (INFO level, НЕ пишется в error_logs).
 */
export function logValidationSuccess(params: ValidationSuccessParams): void {
  const { courseId, ruleId, itemsChecked, passedItems, durationMs } = params;
  logger.info(
    { courseId, ruleId, itemsChecked, passedItems, durationMs },
    `Validation passed: ${ruleId}`
  );
}

/**
 * Логирует начало валидации (INFO level).
 */
export function logValidationStart(params: {
  courseId: string;
  ruleId: string;
  itemsCount: number;
}): void {
  logger.info(params, `Validation started: ${params.ruleId}`);
}
```

---

### 2. `domain/pipeline.logger.ts`

**Путь:** `packages/course-gen-platform/src/shared/logger/domain/pipeline.logger.ts`

```typescript
/**
 * Pipeline Domain Logger
 *
 * Логирование pipeline/orchestration: stage transitions, phase execution.
 */

import logger from '../index';

export interface PipelineContext {
  courseId: string;
  stage: string; // 'stage_5', 'stage_6'
  phase: string; // 'metadata', 'sections', 'quality'
  attemptNumber?: number;
}

/**
 * Логирует начало фазы пайплайна.
 */
export function logPipelineStart(ctx: PipelineContext): void {
  logger.info(ctx, `Pipeline phase started: ${ctx.stage}/${ctx.phase}`);
}

/**
 * Логирует успешное завершение фазы.
 */
export function logPipelineComplete(ctx: PipelineContext & { durationMs: number }): void {
  logger.info(ctx, `Pipeline phase completed: ${ctx.stage}/${ctx.phase}`);
}

/**
 * Логирует ошибку пайплайна.
 * Пишется в error_logs.
 */
export function logPipelineError(
  ctx: PipelineContext & {
    error: Error;
    recoverable: boolean;
  }
): void {
  const { error, recoverable, ...rest } = ctx;
  logger.error({ ...rest, err: error, recoverable }, `Pipeline error: ${ctx.stage}/${ctx.phase}`);
}

/**
 * Логирует переход между стадиями.
 */
export function logStageTransition(params: {
  courseId: string;
  fromStage: string;
  toStage: string;
}): void {
  logger.info(params, `Stage transition: ${params.fromStage} → ${params.toStage}`);
}

/**
 * Логирует retry attempt.
 */
export function logPipelineRetry(
  ctx: PipelineContext & {
    reason: string;
    nextAttempt: number;
    maxAttempts: number;
  }
): void {
  logger.warn(
    ctx,
    `Pipeline retry: ${ctx.stage}/${ctx.phase} (${ctx.nextAttempt}/${ctx.maxAttempts})`
  );
}
```

---

### 3. `domain/generation.logger.ts`

**Путь:** `packages/course-gen-platform/src/shared/logger/domain/generation.logger.ts`

```typescript
/**
 * Generation Domain Logger
 *
 * Логирование LLM generation: model calls, tokens, quality checks.
 */

import logger from '../index';

export interface GenerationContext {
  courseId: string;
  model: string;
  stage: string;
  attemptNumber: number;
}

/**
 * Логирует LLM вызов.
 */
export function logLLMCall(
  ctx: GenerationContext & {
    tokensUsed: number;
    durationMs: number;
    cached: boolean;
  }
): void {
  logger.info(ctx, `LLM call: ${ctx.model} (${ctx.tokensUsed} tokens, ${ctx.durationMs}ms)`);
}

/**
 * Логирует ошибку генерации.
 * Пишется в error_logs.
 */
export function logGenerationError(
  ctx: GenerationContext & {
    error: Error;
    retryable: boolean;
    fallbackModel?: string;
  }
): void {
  const { error, ...rest } = ctx;
  logger.error({ ...rest, err: error }, `Generation error: ${ctx.model}`);
}

/**
 * Логирует успешную генерацию.
 */
export function logGenerationSuccess(
  ctx: GenerationContext & {
    tokensUsed: number;
    durationMs: number;
    qualityScore?: number;
  }
): void {
  logger.info(ctx, `Generation success: ${ctx.model}`);
}

/**
 * Логирует quality check.
 */
export function logQualityCheck(params: {
  courseId: string;
  qualityScore: number;
  threshold: number;
  passed: boolean;
  checkType: string;
}): void {
  const level = params.passed ? 'info' : 'warn';
  logger[level](
    params,
    `Quality check ${params.passed ? 'passed' : 'failed'}: ${params.checkType}`
  );
}

/**
 * Логирует fallback на другую модель.
 */
export function logModelFallback(params: {
  courseId: string;
  fromModel: string;
  toModel: string;
  reason: string;
}): void {
  logger.warn(params, `Model fallback: ${params.fromModel} → ${params.toModel}`);
}
```

---

### 4. `domain/rag.logger.ts`

**Путь:** `packages/course-gen-platform/src/shared/logger/domain/rag.logger.ts`

```typescript
/**
 * RAG Domain Logger
 *
 * Логирование RAG/vector search: queries, cache, embeddings.
 */

import logger from '../index';

export interface RagContext {
  courseId: string;
  queryId?: string;
}

/**
 * Логирует RAG search.
 */
export function logRagSearch(
  ctx: RagContext & {
    query: string;
    topK: number;
    resultsCount: number;
    durationMs: number;
  }
): void {
  logger.info(ctx, `RAG search: ${ctx.resultsCount}/${ctx.topK} results (${ctx.durationMs}ms)`);
}

/**
 * Логирует ошибку RAG.
 * Пишется в error_logs.
 */
export function logRagError(
  ctx: RagContext & {
    error: Error;
    operation: 'search' | 'embed' | 'cache';
    fallbackUsed: boolean;
  }
): void {
  const { error, ...rest } = ctx;
  logger.error({ ...rest, err: error }, `RAG error: ${ctx.operation}`);
}

/**
 * Логирует cache hit/miss.
 */
export function logRagCache(params: {
  courseId: string;
  cacheKey: string;
  hit: boolean;
  ttlSeconds?: number;
}): void {
  logger.info(params, `RAG cache ${params.hit ? 'hit' : 'miss'}`);
}

/**
 * Логирует embedding generation.
 */
export function logRagEmbedding(params: {
  courseId: string;
  textLength: number;
  durationMs: number;
  model: string;
}): void {
  logger.info(params, `RAG embedding: ${params.textLength} chars (${params.durationMs}ms)`);
}

/**
 * Логирует пустой результат поиска (warning).
 */
export function logRagNoResults(
  ctx: RagContext & {
    query: string;
    reason: string;
  }
): void {
  logger.warn(ctx, `RAG no results: ${ctx.reason}`);
}
```

---

### 5. `domain/job.logger.ts`

**Путь:** `packages/course-gen-platform/src/shared/logger/domain/job.logger.ts`

```typescript
/**
 * Job Domain Logger
 *
 * Логирование background jobs: BullMQ workers, queues.
 */

import logger from '../index';

export interface JobContext {
  jobId: string;
  jobType: string;
  courseId?: string;
  attemptNumber: number;
}

/**
 * Логирует начало job.
 */
export function logJobStart(ctx: JobContext): void {
  logger.info(ctx, `Job started: ${ctx.jobType}`);
}

/**
 * Логирует успешное завершение job.
 */
export function logJobComplete(ctx: JobContext & { durationMs: number }): void {
  logger.info(ctx, `Job completed: ${ctx.jobType} (${ctx.durationMs}ms)`);
}

/**
 * Логирует ошибку job.
 * Пишется в error_logs.
 */
export function logJobError(
  ctx: JobContext & {
    error: Error;
    retriable: boolean;
    moveToDLQ: boolean;
  }
): void {
  const { error, ...rest } = ctx;
  logger.error({ ...rest, err: error }, `Job error: ${ctx.jobType}`);
}

/**
 * Логирует прогресс job.
 */
export function logJobProgress(
  ctx: JobContext & {
    progress: number;
    currentStep: string;
  }
): void {
  logger.info(ctx, `Job progress: ${ctx.currentStep} (${ctx.progress}%)`);
}

/**
 * Логирует retry job.
 */
export function logJobRetry(
  ctx: JobContext & {
    reason: string;
    nextAttempt: number;
    maxAttempts: number;
    delayMs: number;
  }
): void {
  logger.warn(ctx, `Job retry: ${ctx.jobType} (${ctx.nextAttempt}/${ctx.maxAttempts})`);
}

/**
 * Логирует stalled job.
 */
export function logJobStalled(ctx: JobContext): void {
  logger.warn(ctx, `Job stalled: ${ctx.jobType}`);
}
```

---

### 6. `domain/index.ts`

**Путь:** `packages/course-gen-platform/src/shared/logger/domain/index.ts`

```typescript
/**
 * Domain Loggers - Re-exports
 *
 * Централизованный экспорт всех domain-specific логгеров.
 */

// Validation
export {
  logValidationIssue,
  logValidationSuccess,
  logValidationStart,
  type ValidationIssueParams,
  type ValidationSuccessParams,
} from './validation.logger';

// Pipeline
export {
  logPipelineStart,
  logPipelineComplete,
  logPipelineError,
  logPipelineRetry,
  logStageTransition,
  type PipelineContext,
} from './pipeline.logger';

// Generation
export {
  logLLMCall,
  logGenerationError,
  logGenerationSuccess,
  logQualityCheck,
  logModelFallback,
  type GenerationContext,
} from './generation.logger';

// RAG
export {
  logRagSearch,
  logRagError,
  logRagCache,
  logRagEmbedding,
  logRagNoResults,
  type RagContext,
} from './rag.logger';

// Job
export {
  logJobStart,
  logJobComplete,
  logJobError,
  logJobProgress,
  logJobRetry,
  logJobStalled,
  type JobContext,
} from './job.logger';
```

---

### 7. `context/builders.ts`

**Путь:** `packages/course-gen-platform/src/shared/logger/context/builders.ts`

```typescript
/**
 * Context Builders
 *
 * Фабрики для создания типизированного контекста логирования.
 */

export interface CourseContext {
  courseId: string;
  userId?: string;
  organizationId?: string;
}

export interface JobContextBase {
  jobId: string;
  jobType: string;
  courseId?: string;
}

export interface PipelineContextBase {
  courseId: string;
  stage: string;
  phase: string;
}

/**
 * Создаёт контекст для course-related операций.
 */
export function createCourseContext(params: CourseContext): CourseContext {
  return {
    courseId: params.courseId,
    ...(params.userId && { userId: params.userId }),
    ...(params.organizationId && { organizationId: params.organizationId }),
  };
}

/**
 * Создаёт контекст для job операций.
 */
export function createJobContext(params: JobContextBase): JobContextBase {
  return {
    jobId: params.jobId,
    jobType: params.jobType,
    ...(params.courseId && { courseId: params.courseId }),
  };
}

/**
 * Создаёт контекст для pipeline операций.
 */
export function createPipelineContext(params: PipelineContextBase): PipelineContextBase {
  return {
    courseId: params.courseId,
    stage: params.stage,
    phase: params.phase,
  };
}
```

---

### 8. Обновить `shared/logger/index.ts`

**Путь:** `packages/course-gen-platform/src/shared/logger/index.ts`

**Изменения:**

1. УДАЛИТЬ `logValidationIssue` и `ValidationIssueLogParams` (перенесены в domain/)
2. ДОБАВИТЬ re-export из domain/

```typescript
// В конец файла добавить:

// Re-export domain loggers
export * from './domain';

// Re-export context builders
export * from './context/builders';
```

---

### 9. Обновить `validation-orchestrator.ts`

**Путь:** `packages/course-gen-platform/src/stages/stage5-generation/validators/validation-orchestrator.ts`

**Изменения:**
Заменить:

```typescript
import { logValidationIssue } from '../../../shared/logger';
```

На:

```typescript
import { logValidationIssue } from '../../../shared/logger/domain';
```

---

## Порядок реализации

1. Создать директорию `domain/`
2. Создать `domain/validation.logger.ts`
3. Создать `domain/pipeline.logger.ts`
4. Создать `domain/generation.logger.ts`
5. Создать `domain/rag.logger.ts`
6. Создать `domain/job.logger.ts`
7. Создать `domain/index.ts`
8. Создать директорию `context/`
9. Создать `context/builders.ts`
10. Обновить `index.ts` — удалить старый код, добавить re-exports
11. Обновить `validation-orchestrator.ts` — исправить import
12. Запустить `pnpm type-check`
13. Запустить `pnpm build`

## Верификация

1. `pnpm type-check` — типы компилируются
2. `pnpm build` — билд проходит
3. Проверить что при вызове `logValidationIssue` с severity='ERROR' запись появляется в error_logs
4. Проверить что `logValidationSuccess` (INFO) НЕ пишется в error_logs

## Файлы для создания/изменения

| Файл                                        | Действие |
| ------------------------------------------- | -------- |
| `shared/logger/domain/validation.logger.ts` | CREATE   |
| `shared/logger/domain/pipeline.logger.ts`   | CREATE   |
| `shared/logger/domain/generation.logger.ts` | CREATE   |
| `shared/logger/domain/rag.logger.ts`        | CREATE   |
| `shared/logger/domain/job.logger.ts`        | CREATE   |
| `shared/logger/domain/index.ts`             | CREATE   |
| `shared/logger/context/builders.ts`         | CREATE   |
| `shared/logger/index.ts`                    | MODIFY   |
| `validation-orchestrator.ts`                | MODIFY   |
