# Fix: VMF-9315 Stage 4 Failure — LLM Timeout in Phase 0.5 (Clarifying Questions)

## Context

**Problem**: Курс VMF-9315 (course_id: `1ba4cbea-a17a-4d45-9c43-2eadca8b7a0e`) успешно прошёл Stages 1-3, но Stage 4 падает на Phase 0.5 (Clarifying Questions). Все 3 попытки (`attemptsMade: 3`) заканчиваются одинаковым таймаутом.

**Error**: `AbortError: This operation was aborted` в `phase-0.5-clarifying.ts:92:18`

**Root Cause**: LLM-запрос к модели `xiaomi/mimo-v2-flash` через OpenRouter не завершается за 5 минут (300,000ms). Документ — 9.2 MB DOCX (~10,404 токенов). Таймаут задан жёстко через `AbortController` + `setTimeout`.

**Error flow**:

1. `phase-0.5-clarifying.ts:90-94` — создаётся `AbortController` с таймаутом 300s
2. `phase-0.5-clarifying.ts:98-100` — `model.invoke()` с `signal: controller.signal`
3. Через 300s `setTimeout` вызывает `controller.abort()` → `AbortError`
4. `handler-helpers.ts:138` — `AbortError` классифицируется как `LLM_ERROR` → BullMQ retries
5. Все 3 попытки идентично провалены с тем же таймаутом

**Why 5 min is insufficient**: `xiaomi/mimo-v2-flash` — бюджетная модель через OpenRouter. Для больших промптов (~10K tokens input) с генерацией структурированного JSON (7+ вопросов с ответами, до 16K tokens maxTokens) — 5 минут может быть мало из-за очередей OpenRouter, cold start, или throughput limits.

## Solution

### Fix 1: Увеличить дефолтный таймаут `LLM_CLARIFYING_TIMEOUT_MS` до 10 минут

**File**: `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-0.5-clarifying/utils.ts:10-13`

```typescript
// BEFORE
export const LLM_CLARIFYING_TIMEOUT_MS = parseInt(
  process.env.LLM_CLARIFYING_TIMEOUT_MS || '300000', // 5 min
  10
);

// AFTER
export const LLM_CLARIFYING_TIMEOUT_MS = parseInt(
  process.env.LLM_CLARIFYING_TIMEOUT_MS || '600000', // 10 min
  10
);
```

**Reasoning**: 5 минут слишком агрессивно для LLM через OpenRouter с большим контекстом и maxTokens=16K. 10 минут — стандартный таймаут для production LLM calls.

### Fix 2: Adaptive timeout на основе размера документа

**File**: `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-0.5-clarifying.ts:90-94`

Вместо фиксированного таймаута, масштабировать на основе `totalDocTokens`:

```typescript
// BEFORE
const controller = new AbortController();
const timeoutId = setTimeout(() => {
  controller.abort();
  phaseLogger.warn({ timeoutMs: LLM_CLARIFYING_TIMEOUT_MS }, 'LLM call timed out, aborting');
}, LLM_CLARIFYING_TIMEOUT_MS);

// AFTER
// Adaptive timeout: base + extra time for large documents
const extraTokens = Math.max(0, (totalDocTokens ?? 0) - 5000);
const extraTimeMs = Math.ceil(extraTokens / 5000) * 60_000; // +1 min per 5K tokens above 5K
const adaptiveTimeout = Math.min(LLM_CLARIFYING_TIMEOUT_MS + extraTimeMs, 900_000); // cap 15 min

const controller = new AbortController();
const timeoutId = setTimeout(() => {
  controller.abort();
  phaseLogger.warn(
    { timeoutMs: adaptiveTimeout, totalDocTokens, modelId },
    'LLM call timed out, aborting'
  );
}, adaptiveTimeout);
```

Для VMF-9315 (~10K tokens): 600_000 + ceil(5000/5000) × 60_000 = 660_000ms (11 min).

### Fix 3: Улучшенное логирование при AbortError

**File**: `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-0.5-clarifying.ts` (catch block ~line 236)

Добавить специальное сообщение для таймаута в catch блоке:

```typescript
if (error instanceof Error && error.name === 'AbortError') {
  phaseLogger.error(
    { adaptiveTimeout, totalDocTokens, modelId },
    `Phase 0.5 LLM timeout after ${Math.round(adaptiveTimeout / 1000)}s — consider increasing LLM_CLARIFYING_TIMEOUT_MS or switching model`
  );
}
```

## Files to Modify

| File                                             | Changes                                             |
| ------------------------------------------------ | --------------------------------------------------- |
| `.../phases/phase-0.5-clarifying/utils.ts:10-13` | Дефолт `LLM_CLARIFYING_TIMEOUT_MS`: 300000 → 600000 |
| `.../phases/phase-0.5-clarifying.ts:90-94`       | Adaptive timeout на основе `totalDocTokens`         |
| `.../phases/phase-0.5-clarifying.ts:236+`        | Специальное логирование AbortError с деталями       |

## Verification

1. `pnpm --filter course-gen-platform type-check`
2. `pnpm --filter course-gen-platform test` — unit тесты
3. `npx vitest run "phase-0.5"` — если есть специфичные тесты для Phase 0.5
4. Deploy → перезапустить курс VMF-9315
5. Наблюдать логи: adaptive timeout > 10 min, LLM должен успеть ответить

## Risk Assessment

- **Low risk**: Увеличение таймаута не ломает ничего, только даёт больше времени
- **No breaking changes**: Env var `LLM_CLARIFYING_TIMEOUT_MS` по-прежнему override
- **Cap**: Max 15 min — защита от бесконечного ожидания
- **Scope**: Только Phase 0.5 — остальные фазы не затронуты
