# Plan: mc2-pkyy — Standardize error handling with AppError class

## Context

Задача из AUDIT_REPORT.md (секции 4.3, 21.3): стандартизировать прохождение ошибок через BullMQ → tRPC → Client.

**Что уже есть**: полноценные иерархии `AppError` (7 подклассов) и `PipelineError` (10+ подклассов), конвертация `createTRPCError(appError)`, type guards, enhanced logger → error_logs.

**Что не хватает** (gaps):

1. `wrapTRPCError()` не обрабатывает `AppError` — заворачивает всё как `INTERNAL_SERVER_ERROR`, хотя `createTRPCError()` уже существует
2. `wrapTRPCError()` не обрабатывает `PipelineError` — теряет code/severity/retryable
3. tRPC `errorFormatter` — no-op, не пробрасывает `appErrorCode` из cause на клиент

**Рекомендация аудита про fetchWithRetry (21.3) — устарела**: frontend использует стандартный `httpBatchLink`, TRPCError shape не теряется.

---

## Changes

### 1. Улучшить `wrapTRPCError` — обработка AppError и PipelineError

**File**: `packages/course-gen-platform/src/server/shared/errors.ts`

Добавить два новых branch между проверкой TRPCError и generic fallback:

```
1. TRPCError → re-throw as-is (без изменений)
2. NEW: AppError → createTRPCError(error) с logger.warn (operational error)
3. NEW: PipelineError → TRPCError с маппингом severity→code, logger.error
4. Generic fallback → INTERNAL_SERVER_ERROR (без изменений)
```

Маппинг PipelineError severity → tRPC code:

- `CRITICAL` → `INTERNAL_SERVER_ERROR`
- `retryable=true` → `TOO_MANY_REQUESTS` (сигнал клиенту "можно повторить")
- остальное → `BAD_REQUEST`

Новые imports: `AppError` из `../errors/typed-errors`, `createTRPCError` из `../errors/error-formatter`, `isPipelineError` из `../../shared/errors/pipeline-errors`.

### 2. Активировать tRPC errorFormatter

**File**: `packages/course-gen-platform/src/server/trpc.ts` (строки 128-138)

Извлекать из `error.cause` структурированные данные и добавлять в response:

```typescript
errorFormatter({ shape, error }) {
  const cause = error.cause;
  let appErrorCode: string | undefined;
  let severity: string | undefined;
  let isRetryable: boolean | undefined;

  if (cause instanceof AppError) {
    appErrorCode = cause.code;
  } else if (cause instanceof PipelineError) {
    appErrorCode = cause.code;
    severity = cause.severity;
    isRetryable = cause.retryable;
  }

  return {
    ...shape,
    data: {
      ...shape.data,
      ...(appErrorCode && { appErrorCode }),
      ...(severity && { severity }),
      ...(isRetryable !== undefined && { isRetryable }),
    },
  };
}
```

Новые imports: `AppError` из `./errors/typed-errors`, `PipelineError` из `../shared/errors/pipeline-errors`.

Frontend получает `error.data.appErrorCode` (e.g. `'QUOTA_EXCEEDED'`, `'LLM_ERROR'`) — аддитивно, ничего не ломает.

### 3. Unit тесты

**New file**: `packages/course-gen-platform/tests/unit/server/shared/wrap-trpc-error.test.ts`

Тесты для wrapTRPCError:

- Re-throws TRPCError as-is (регрессия)
- AppError(NotFoundError) → TRPCError code='NOT_FOUND', cause=original
- AppError(QuotaExceededError) → TRPCError code='TOO_MANY_REQUESTS'
- PipelineTransientError(LLMError) → TRPCError code='TOO_MANY_REQUESTS'
- PipelineInternalError(DatabaseError) → TRPCError code='INTERNAL_SERVER_ERROR'
- PipelineValidationError → TRPCError code='BAD_REQUEST'
- Unknown Error → TRPCError code='INTERNAL_SERVER_ERROR' (регрессия)
- Все конвертации сохраняют cause

**New file**: `packages/course-gen-platform/tests/unit/server/trpc-error-formatter.test.ts`

Тесты для errorFormatter:

- Без cause → shape без доп. полей
- AppError cause → shape.data.appErrorCode
- PipelineError cause → shape.data.appErrorCode + severity + isRetryable

---

## What is NOT changed

| Компонент                                  | Почему не трогаем                                             |
| ------------------------------------------ | ------------------------------------------------------------- |
| Admin logs (error_logs таблица)            | wrapTRPCError → HTTP response, не влияет на DB writes         |
| Enhanced logger (writeToErrorLogs)         | Работает через Proxy на Pino, полностью независим             |
| BullMQ error-handler.ts                    | handleJobFailure → logPermanentFailure — отдельный путь       |
| tRPC роутер admin.logs.\*                  | Читает из error_logs, не зависит от errorFormatter            |
| Frontend tRPC client                       | httpBatchLink без изменений, новые поля аддитивны             |
| 75 файлов роутеров с `throw new TRPCError` | Продолжают работать, errorFormatter обрабатывает их прозрачно |

---

## Critical files

| Action | File                                                                                                 |
| ------ | ---------------------------------------------------------------------------------------------------- |
| MODIFY | `packages/course-gen-platform/src/server/shared/errors.ts`                                           |
| MODIFY | `packages/course-gen-platform/src/server/trpc.ts`                                                    |
| CREATE | `packages/course-gen-platform/tests/unit/server/shared/wrap-trpc-error.test.ts`                      |
| CREATE | `packages/course-gen-platform/tests/unit/server/trpc-error-formatter.test.ts`                        |
| REF    | `packages/course-gen-platform/src/server/errors/error-formatter.ts` (createTRPCError)                |
| REF    | `packages/course-gen-platform/src/server/errors/typed-errors.ts` (AppError, ErrorCode)               |
| REF    | `packages/course-gen-platform/src/shared/errors/pipeline-errors.ts` (PipelineError, isPipelineError) |

---

## Verification

1. `pnpm --filter course-gen-platform type-check` — типы
2. `pnpm --filter course-gen-platform build` — билд
3. `npx vitest run "wrap-trpc-error"` — новые тесты wrapTRPCError
4. `npx vitest run "trpc-error-formatter"` — новые тесты errorFormatter
5. `pnpm --filter course-gen-platform test` — все unit тесты (регрессия)
6. Проверить admin logs страницу в UI — логи отображаются корректно (ручная проверка)

---

## Estimate

~1 час (2 файла modify + 2 файла тестов + проверка)
