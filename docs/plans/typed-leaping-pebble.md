# Plan: Cleanup Dead Code from Error Log Optimization

## Context

После реализации error log volume reduction (Solutions 1-7, коммиты `e53701af`, `de935b97`) и code review — остались два пункта:

**M2:** Convention `dbLog: false` в proxy interceptors — добавлена, но не имеет ни одного callsite. Мёртвый код без типизации. Везде, где нужен bypass proxy, уже используется `baseLogger` напрямую.

**L2:** Функции `handleJobStalled()` и `handleJobTimeout()` в `error-handler.ts` — экспортируются через `index.ts`, но **нигде не вызываются**. Содержат только лог + TODO-комментарии. Реальная обработка stalled уже реализована inline в `worker.ts:405-415`.

---

## Change 1: Remove `dbLog: false` from proxy interceptors

**Файл: `packages/course-gen-platform/src/shared/logger/index.ts`**

В трёх interceptors (warn, error, fatal) удалить проверку `dbLog`:

```typescript
// БЫЛО (warn interceptor, строки 223-227):
const ctx = objOrMsg as Record<string, unknown>;
if (ctx?.dbLog !== false) {
  writeToErrorLogs('WARNING', msg || 'Warning', ctx).catch(() => {});
}

// СТАНЕТ:
writeToErrorLogs('WARNING', msg || 'Warning', objOrMsg as Record<string, unknown>).catch(() => {});
```

Аналогично для `error` (строки 241-243) и `fatal` (строки 257-259).

**Также:** Обновить SKILL.md — убрать строку `dbLog: false in context → SKIP if explicitly disabled` из flow diagram.

---

## Change 2: Remove dead `handleJobStalled` and `handleJobTimeout`

**Доказательство мёртвого кода:**

- `grep -r "handleJobStalled\|handleJobTimeout"` — найдено только в определениях и реэкспортах
- `worker.ts:413` — комментарий: `// Note: We don't know the job type here, so we can't call handleJobStalled`
- Ни одного вызова ни одной из функций

**Файл: `packages/course-gen-platform/src/orchestrator/handlers/error-handler.ts`**

1. Удалить `handleJobStalled()` (строки 338-361):

   ```typescript
   // УДАЛИТЬ ПОЛНОСТЬЮ
   export function handleJobStalled(jobId: string, jobType: JobType): void { ... }
   ```

2. Удалить `handleJobTimeout()` (строки 363-386):

   ```typescript
   // УДАЛИТЬ ПОЛНОСТЬЮ
   export function handleJobTimeout(job: Job<JobData>): void { ... }
   ```

3. Удалить из default export (строки 388-394):

   ```typescript
   // БЫЛО:
   export default {
     classifyError,
     shouldRetryJob,
     handleJobFailure,
     handleJobStalled,
     handleJobTimeout,
   };

   // СТАНЕТ:
   export default {
     classifyError,
     shouldRetryJob,
     handleJobFailure,
   };
   ```

4. Убрать неиспользуемый import `JobType` если он больше не нужен. Проверить: `JobType` используется в `shouldRetryJob` → нет. Используется в `handleJobStalled` → да. Но `JobType` также используется в `handleJobFailure` через `metricsStore.recordJobRetry(job.name as JobType)` → да, оставить.

**Файл: `packages/course-gen-platform/src/orchestrator/index.ts`**

Убрать реэкспорт:

```typescript
// БЫЛО (строки 30-37):
export {
  classifyError,
  shouldRetryJob,
  handleJobFailure,
  handleJobStalled,
  handleJobTimeout,
  ErrorType,
} from './handlers/error-handler';

// СТАНЕТ:
export {
  classifyError,
  shouldRetryJob,
  handleJobFailure,
  ErrorType,
} from './handlers/error-handler';
```

---

## Verification

1. `pnpm type-check` — убедиться нет broken imports
2. `pnpm build` — bundle собирается
3. `grep -r "handleJobStalled\|handleJobTimeout\|dbLog"` — нет оставшихся ссылок
4. `pnpm --filter course-gen-platform exec vitest run tests/unit/rate-limiter` — тесты не сломаны

## Files Summary

| File                                         | Change                                                               |
| -------------------------------------------- | -------------------------------------------------------------------- |
| `src/shared/logger/index.ts`                 | Remove `dbLog: false` checks from 3 interceptors                     |
| `src/orchestrator/handlers/error-handler.ts` | Remove `handleJobStalled`, `handleJobTimeout`, update default export |
| `src/orchestrator/index.ts`                  | Remove 2 re-exports                                                  |
| `.claude/skills/process-logs/SKILL.md`       | Remove `dbLog: false` from flow diagram                              |
