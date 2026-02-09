# Plan: Memory/Resource Audit & Fixes (mc2-yqyx)

## Context

Аудит низкоуровневых утечек памяти/ресурсов по AUDIT_REPORT.md Section 13. Проведено полное исследование обоих пакетов (web + course-gen-platform): все useEffect, setInterval, event listeners, Maps, process.on, Supabase Realtime, AbortController, BullMQ workers.

**Итог аудита:**

- **Frontend (web)**: Отличное качество — все useEffect имеют cleanup, event listeners снимаются, AbortController используется повсюду. Единственная реальная проблема — useGenerationStore не сбрасывается при уходе со страницы.
- **Backend (course-gen-platform)**: Несколько реальных проблем — unbounded Maps (clearCourse() никогда не вызывается), process.on стакинг в библиотечных модулях, QueueEvents не закрываются.

## Audit Results — Что проверено и НЕ нужно чинить

| Компонент                                                                                                                  | Статус | Деталь                                                 |
| -------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------ |
| GraphView.tsx useEffect (11 шт)                                                                                            | ✅ OK  | Все имеют cleanup или не требуют его                   |
| useAutoSave.ts (2 файла)                                                                                                   | ✅ OK  | cancel + clearTimeout на unmount                       |
| Supabase Realtime (3 файла: realtime-provider, logs-realtime-provider, join-by-code)                                       | ✅ OK  | unsubscribe + removeChannel                            |
| AbortController (useAutoCard, useEnrichmentGeneration, useStage2DashboardData)                                             | ✅ OK  | abort в cleanup                                        |
| Event listeners (use-local-storage, use-tab-visibility, use-theme-sync, use-keyboard-shortcut, ServiceWorkerManager x2)    | ✅ OK  | removeEventListener                                    |
| setInterval/setTimeout (StatsGrid, GenerationProgressBar, useFallbackPolling, useSmoothProgress, useRotatingStatusMessage) | ✅ OK  | clearInterval/clearTimeout                             |
| Supabase admin singleton (course-gen-platform)                                                                             | ✅ OK  | Lazy singleton, autoRefreshToken: false                |
| Redis singleton (redis.ts)                                                                                                 | ✅ OK  | closeRedisClient() + SIGTERM handler                   |
| BullMQ workers (main, stage6, stage7)                                                                                      | ✅ OK  | worker.close() в shutdown                              |
| PromptCacheService (judge/prompt-cache.ts)                                                                                 | ✅ OK  | TTL + LRU eviction (maxCacheSize)                      |
| ContextCacheManager (regeneration/)                                                                                        | ✅ OK  | TTL 5min, bounded by courseId×tier (~4 entries/course) |
| MetricsStore (orchestrator/metrics.ts)                                                                                     | ✅ OK  | Bounded by JobType enum + MAX_DURATIONS=1000           |
| ApiKeyCache (api-key-service.ts)                                                                                           | ✅ OK  | Bounded by ApiKeyType enum + TTL 5min                  |
| GlobalSettingsCache (global-settings-service.ts)                                                                           | ✅ OK  | Bounded by settings count                              |
| auto-card-trigger.ts process.on                                                                                            | ✅ OK  | `shutdownHandlersRegistered` guard                     |
| regenerate-auto-card.ts process.on                                                                                         | ✅ OK  | `cleanupRegistered` guard                              |
| Worker entrypoints (worker-entrypoint.ts, stage7) process.on                                                               | ✅ OK  | Entry points, not libraries — no re-import             |
| server/index.ts process.on                                                                                                 | ✅ OK  | Entry point                                            |

## Fixes (6 задач)

### Fix 1: useGenerationStore cleanup при навигации [Frontend]

**Проблема**: Zustand store глобальный. При переходе между курсами `setCourseId()` сбрасывает Maps. НО при уходе со страницы генерации (назад в dashboard) данные остаются в памяти навсегда (documents, modules, lessons Maps).

**Файл**: `packages/web/components/generation-graph/GraphView.tsx`

**Решение**: Добавить useEffect cleanup при unmount (паттерн из Context7 Zustand docs):

```typescript
const reset = useGenerationStore(state => state.reset);

useEffect(() => {
  return () => {
    reset();
  };
}, [reset]);
```

`reset()` уже существует в store (line 390-402), полностью очищает все Maps.

---

### Fix 2: clearCourse() в worker completed/failed handlers [Backend]

**Проблема**: `CostTracker.clearCourse()` (cost-tracker.ts:433) и `StageMetricsCollector.clearCourse()` (stage-metrics.ts:499) существуют, но **никогда не вызываются** в production коде — только в JSDoc примерах. При последовательной обработке курсов Maps растут без ограничений.

**Файл**: `packages/course-gen-platform/src/orchestrator/worker.ts`

**Решение**: Добавить cleanup в обработчики `completed` (line ~265) и `failed` (line ~303):

```typescript
// In 'completed' handler:
costTracker.clearCourse(courseId);
stageMetricsCollector.clearCourse(courseId);

// In 'failed' handler:
costTracker.clearCourse(courseId);
stageMetricsCollector.clearCourse(courseId);
```

Нужно проверить, как извлечь courseId из job data в этих обработчиках.

---

### Fix 3: process.on → process.once в библиотечных модулях [Backend]

**Проблема**: `process.on('SIGTERM'/'SIGINT')` регистрируется при каждом импорте модуля. Библиотечные модули переимпортируются в тестах → handlers стакаются.

**Файлы**:

1. `packages/course-gen-platform/src/shared/cache/redis.ts:66-67`
2. `packages/course-gen-platform/src/jobs/rag-cleanup-job.ts:380-381`

**Решение**: Заменить `process.on` на `process.once`:

```typescript
// redis.ts
process.once('SIGTERM', () => handleShutdownSignal('SIGTERM'));
process.once('SIGINT', () => handleShutdownSignal('SIGINT'));

// rag-cleanup-job.ts
process.once('SIGTERM', () => handleShutdown('SIGTERM'));
process.once('SIGINT', () => handleShutdown('SIGINT'));
```

> НЕ трогаем: worker-entrypoint.ts, stage7/worker-entrypoint.ts, server/index.ts, outbox-processor.ts, auto-card-trigger.ts, regenerate-auto-card.ts — это entry points или имеют guards.

---

### Fix 4: QueueEvents shutdown в queue-events-backup.ts [Backend]

**Проблема**: `QueueEvents` создаётся при импорте модуля и никогда не закрывается. Redis connection остаётся открытым навсегда.

**Файл**: `packages/course-gen-platform/src/orchestrator/queue-events-backup.ts`

**Решение**: Экспортировать cleanup функцию:

```typescript
export async function closeQueueEventsBackup(): Promise<void> {
  if (queueEvents) {
    await queueEvents.close();
    queueEvents = null;
  }
}
```

Вызвать в `worker-entrypoint.ts` → `handleWorkerShutdown()`.

---

### Fix 5: RAG context cache max size guard [Backend]

**Проблема**: `ragContextCache` (rag-context-cache.ts) растёт без ограничений. `clearCourse()` вызывается только из `rag-cleanup.ts` (ручной/админский через cron), не автоматически после завершения Stage 5.

**Файл**: `packages/course-gen-platform/src/stages/stage5-generation/utils/rag-context-cache.ts`

**Решение**: Добавить MAX_ENTRIES проверку (аналогично prompt-cache.ts LRU паттерну):

```typescript
private static readonly MAX_ENTRIES = 5000;

// В начале set(), перед добавлением:
if (this.cache.size >= RAGContextCache.MAX_ENTRIES) {
  const toEvict = Math.floor(this.cache.size * 0.2);
  const keys = Array.from(this.cache.keys());
  for (let i = 0; i < toEvict; i++) {
    this.cache.delete(keys[i]);
  }
  logger.warn({ evicted: toEvict, cacheSize: this.cache.size }, '[RAGContextCache] Evicted entries due to max size');
}
```

---

### Fix 6: GlobalCourseChat.tsx — setTimeout без cleanup [Frontend, minor]

**Проблема**: `setTimeout` для focus (line 144) без clearTimeout. Если компонент unmount до срабатывания, callback ссылается на `textareaRef.current` → no-op (не crash, но плохая практика).

**Файл**: `packages/web/components/generation/GlobalCourseChat.tsx:142-146`

**Решение**: Добавить cleanup:

```typescript
useEffect(() => {
  if (isOpen && textareaRef.current) {
    const timer = setTimeout(() => textareaRef.current?.focus(), CHAT_LAYOUT.FOCUS_DELAY_MS);
    return () => clearTimeout(timer);
  }
}, [isOpen]);
```

## Files Summary

| #   | Файл                                                                          | Что                              | Сложность |
| --- | ----------------------------------------------------------------------------- | -------------------------------- | --------- |
| 1   | `web/components/generation-graph/GraphView.tsx`                               | reset() при unmount              | Простая   |
| 2   | `course-gen-platform/src/orchestrator/worker.ts`                              | clearCourse() в completed/failed | Средняя   |
| 3   | `course-gen-platform/src/shared/cache/redis.ts`                               | process.once                     | Простая   |
| 4   | `course-gen-platform/src/jobs/rag-cleanup-job.ts`                             | process.once                     | Простая   |
| 5   | `course-gen-platform/src/orchestrator/queue-events-backup.ts`                 | closeQueueEventsBackup()         | Средняя   |
| 6   | `course-gen-platform/src/orchestrator/worker-entrypoint.ts`                   | вызов closeQueueEventsBackup()   | Простая   |
| 7   | `course-gen-platform/src/stages/stage5-generation/utils/rag-context-cache.ts` | MAX_ENTRIES guard                | Средняя   |
| 8   | `web/components/generation/GlobalCourseChat.tsx`                              | clearTimeout на focus            | Простая   |

## Verification

1. `pnpm type-check` — нет новых ошибок
2. `pnpm --filter course-gen-platform test` — все 2252 теста зелёные
3. Ручная проверка: открыть страницу генерации → уйти → DevTools Memory → heap не содержит старых данных
4. Worker shutdown: `kill -SIGTERM <pid>` → нет зависших Redis connections
