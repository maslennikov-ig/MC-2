# Fix: Chat 500 Error — Connection Error + Stage-Specific Models + Fallback

## Context

Тестер (Лилия Кустова, CSM-8832): чат не работает на стадиях 5 и 6. Ошибка "Server error" + 500.

**Из логов**: OpenRouter отдаёт "Connection error" при вызове `xiaomi/mimo-v2-flash`. 4 retry-попытки за ~28с — все проваливаются, т.к. ошибка неправильно классифицируется как non-retryable.

**Оба чата затронуты**: Stage 5 и 6 используют один код — `RefinementChat` → `generation.chat` tRPC → один LLM-клиент. Сейчас модель везде одна: `xiaomi/mimo-v2-flash`.

## Root Cause

`client-helpers.ts:isRetryableApiError()` — слово `"connection"` не в списке networkErrors. OpenAI SDK `APIConnectionError` имеет `status=undefined`, message=`"Connection error."` — не попадает ни в retryable statuses, ни в network patterns.

## Plan

### Step 1: Fix retry classification

**File**: `packages/course-gen-platform/src/shared/llm/client-helpers.ts` (строка 279)

Добавить `'connection error'` в массив `networkErrors`:

```typescript
const networkErrors = [
  'timeout',
  'econnreset',
  'econnrefused',
  'etimedout',
  'enotfound',
  'socket',
  'connection error', // OpenAI SDK APIConnectionError
];
```

### Step 2: Stage-specific model config + fallback

**File**: `packages/course-gen-platform/src/server/routers/generation/editing/chat-mutation-helpers.ts`

Добавить конфигурацию моделей по стадиям с fallback:

```typescript
/** Chat model configuration per stage with fallback */
const CHAT_STAGE_MODELS: Record<string, { primary: string; fallback: string }> = {
  stage_5: {
    primary: 'moonshotai/kimi-k2-0905',
    fallback: 'moonshotai/kimi-k2.5',
  },
  stage_6: {
    primary: 'deepseek/deepseek-v3.2',
    fallback: 'qwen/qwen3-235b-a22b-2507',
  },
};

// Для stage_4 и global chat — оставить текущую логику через ModelConfigService
const DEFAULT_CHAT_MODELS = {
  primary: 'moonshotai/kimi-k2-0905', // default if stage not in map
  fallback: 'moonshotai/kimi-k2.5',
};
```

В `executeLegacyLLMFlow()` — изменить логику выбора модели:

1. Если `nodeContext?.stageId` есть в `CHAT_STAGE_MODELS` → использовать оттуда (вместо ModelConfigService)
2. При ошибке primary → пробовать fallback из той же конфигурации
3. Только если оба упали → throw TRPCError

```typescript
// Resolve stage-specific models
const stageId = nodeContext?.stageId || '';
const stageModels = CHAT_STAGE_MODELS[stageId] || DEFAULT_CHAT_MODELS;

let llmResponse;
let modelUsed = stageModels.primary;

try {
  llmResponse = await llmClient.generateChatCompletion(messages, {
    model: stageModels.primary,
    temperature: modelConfig.temperature,
    maxTokens: modelConfig.maxTokens,
  });
} catch (primaryError) {
  logger.warn(
    {
      requestId,
      courseId,
      stageId,
      primaryModel: stageModels.primary,
      fallbackModel: stageModels.fallback,
      error: primaryError instanceof Error ? primaryError.message : String(primaryError),
    },
    'Chat: Primary model failed, trying fallback'
  );

  try {
    llmResponse = await llmClient.generateChatCompletion(messages, {
      model: stageModels.fallback,
      temperature: modelConfig.temperature,
      maxTokens: modelConfig.maxTokens,
    });
    modelUsed = stageModels.fallback;
  } catch (fallbackError) {
    logger.error(
      {
        requestId,
        courseId,
        stageId,
        primaryModel: stageModels.primary,
        fallbackModel: stageModels.fallback,
        error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
      },
      'Chat: Both models failed'
    );
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to generate response. Please try again.',
    });
  }
}
```

Заменить `modelConfig.modelId` на `modelUsed` в persist (строка 521) и response (строка 553).

**File**: `packages/course-gen-platform/src/server/routers/generation/editing/chat-intent-flow.ts`

Аналогичный fallback вокруг LLM-вызова на строке 176 (intent classification — только stage 5, значит primary=`kimi-k2-0905`, fallback=`kimi-k2.5`).

### Step 3: Fix `useRefinement.ts` — trim guard

**File**: `packages/web/components/generation-graph/hooks/useRefinement.ts`

```typescript
content: response.assistantMessage?.trim() || t('refinementChat.proposal.emptyResponseFallback'),
```

### Step 4: Fix JSON detection в `RefinementChat.tsx`

**File**: `packages/web/components/generation-graph/panels/RefinementChat.tsx`

````typescript
function isJSONContent(content: string): boolean {
  const trimmed = content.trimStart();
  return trimmed.startsWith('{') || trimmed.startsWith('```json') || trimmed.startsWith('```\n{');
}
````

### Step 5: Заменить `gpt-4o-mini` на `xiaomi/mimo-v2-flash` в inline-операциях

Все эти операции — простые (JSON generation, 2000-4000 токенов), `mimo-v2-flash` справится.

**Files**:

- `packages/course-gen-platform/src/server/routers/generation/editing/regeneration.router.ts` (строки 196, 203)
- `packages/course-gen-platform/src/server/routers/generation/editing/element-crud-helpers.ts` (строки 285, 365)
- `packages/course-gen-platform/src/orchestrator/handlers/block-regeneration-handler.ts` (строка 232)
- `packages/course-gen-platform/src/stages/stage7-enrichments/config/index.ts` (строки 51, 56)

Замена: `'openai/gpt-4o-mini'` → `'xiaomi/mimo-v2-flash'`

Stage 7 enrichment config дополнительно: primary `anthropic/claude-sonnet-4` тоже устарел (БД-конфиг уже переопределяет на `xiaomi/mimo-v2-flash`), заменить на актуальное.

### Step 6: Обновить документацию `llm-model-config.md`

**File**: `.claude/docs/llm-model-config.md`

Обновить раздел "Chat Phases" — заменить единую модель на stage-specific:

```markdown
## Chat Phases

| Phase                  | Stage | Primary Model           | Fallback Model            | Temp | Tokens | Description                |
| ---------------------- | ----- | ----------------------- | ------------------------- | ---- | ------ | -------------------------- |
| chat_node_refinement   | 5     | moonshotai/kimi-k2-0905 | moonshotai/kimi-k2.5      | 0.70 | 8192   | Уточнение узлов (Stage 5)  |
| chat_node_refinement   | 6     | deepseek/deepseek-v3.2  | qwen/qwen3-235b-a22b-2507 | 0.70 | 8192   | Уточнение уроков (Stage 6) |
| chat_global_guidance   | any   | moonshotai/kimi-k2-0905 | moonshotai/kimi-k2.5      | 0.70 | 8192   | Общие указания             |
| chat_full_regeneration | any   | moonshotai/kimi-k2-0905 | moonshotai/kimi-k2.5      | 0.60 | 8192   | Полная перегенерация       |
```

Добавить `Kimi K2.5` в раздел "Model Aliases":

```markdown
| Kimi K2.5 | moonshotai/kimi-k2.5 | Moonshot | Fallback для Kimi K2 |
```

## Files to Modify

| #   | File                                                                                          | Change                                         |
| --- | --------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 1   | `packages/course-gen-platform/src/shared/llm/client-helpers.ts`                               | `'connection error'` в networkErrors           |
| 2   | `packages/course-gen-platform/src/server/routers/generation/editing/chat-mutation-helpers.ts` | Stage-specific models + fallback               |
| 3   | `packages/course-gen-platform/src/server/routers/generation/editing/chat-intent-flow.ts`      | Fallback для intent classification             |
| 4   | `packages/web/components/generation-graph/hooks/useRefinement.ts`                             | `.trim()` guard                                |
| 5   | `packages/web/components/generation-graph/panels/RefinementChat.tsx`                          | JSON detection                                 |
| 6   | `packages/course-gen-platform/src/server/routers/generation/editing/regeneration.router.ts`   | `gpt-4o-mini` → `mimo-v2-flash`                |
| 7   | `packages/course-gen-platform/src/server/routers/generation/editing/element-crud-helpers.ts`  | `gpt-4o-mini` → `mimo-v2-flash`                |
| 8   | `packages/course-gen-platform/src/orchestrator/handlers/block-regeneration-handler.ts`        | `gpt-4o-mini` → `mimo-v2-flash`                |
| 9   | `packages/course-gen-platform/src/stages/stage7-enrichments/config/index.ts`                  | `gpt-4o-mini` + `claude-sonnet-4` → актуальные |
| 10  | `.claude/docs/llm-model-config.md`                                                            | Chat Phases + inline phases + Kimi K2.5 alias  |

## Model Summary

| Stage               | Primary                                  | Fallback                                 |
| ------------------- | ---------------------------------------- | ---------------------------------------- |
| Stage 5 (+ default) | `moonshotai/kimi-k2-0905` (Kimi K2)      | `moonshotai/kimi-k2.5` (Kimi K2.5)       |
| Stage 6             | `deepseek/deepseek-v3.2` (DeepSeek V3.2) | `qwen/qwen3-235b-a22b-2507` (Qwen3 235B) |

## Verification

1. `pnpm type-check`
2. `pnpm --filter course-gen-platform test`
3. `pnpm build`
4. Ручной тест: чат на стадии 5 и 6
