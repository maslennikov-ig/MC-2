# План: Production-Grade исправление Rate Limit для clarifying.getProgress

## Проблема

При генерации курса на Stage 4:

1. Фронтенд упирается в rate limit (60 req/60 sec) для endpoint `clarifying.getProgress`
2. **Clarifying нода не появляется** т.к. frontend не может получить данные из-за 429 ошибок

**Данные из логов:**

- 5 вопросов успешно сгенерированы в Phase 0.5 (есть в БД)
- `getProgress` работал (200) до момента rate limit
- **12 запросов/секунду** → rate limit → нода не отрисовывается

**Root Cause (2 проблемы):**

1. **staleTime = 0** в `GraphView.tsx:415-421`:
   - Каждый re-render → новый fetch
   - Цепная реакция re-renders → 60+ req/sec

2. **Нет request deduplication** в `packages/web/lib/trpc/client.ts`:
   - Параллельные запросы не объединяются
   - N компонентов → N запросов одновременно

## Решение (Production-Grade)

### Часть 1: staleTime в GraphView.tsx

**Файл:** `packages/web/components/generation-graph/GraphView.tsx:415-421`

```typescript
// СТАНЕТ:
const { data: clarifyingProgressRaw } = trpc.clarifying.getProgress.useQuery(
  { courseId },
  {
    enabled: isAtStage4OrBeyond && clarifyingEnabled?.enabled === true,
    staleTime: 5000, // Cache 5 sec - production best practice
    refetchOnWindowFocus: false,
  }
);
```

**Эффект:** 12 req/sec → max 0.2 req/sec (1 запрос каждые 5 сек)

### Часть 2: Request Deduplication в tRPC клиенте

**Файл:** `packages/web/lib/trpc/client.ts`

Добавить in-flight request tracking чтобы параллельные запросы использовали один Promise:

```typescript
// Добавить после queryCache (строка ~140)
const inFlightRequests = new Map<string, Promise<unknown>>()

// В createUseQuery, в fetchData (строка ~187):
const cacheKey = `${procedurePath}:${JSON.stringify(input)}`

// Проверить in-flight request
const inFlight = inFlightRequests.get(cacheKey)
if (inFlight) {
  const result = await inFlight
  setData(result as TOutput)
  setIsLoading(false)
  return
}

// Создать promise и сохранить
const fetchPromise = (async () => {
  const response = await fetchWithRetry(...)
  // ... existing logic ...
  return unwrappedData
})()

inFlightRequests.set(cacheKey, fetchPromise)
try {
  const result = await fetchPromise
  setData(result as TOutput)
} finally {
  inFlightRequests.delete(cacheKey)
}
```

**Эффект:** N параллельных запросов → 1 запрос (остальные ждут результат)

## Почему это Production-Grade?

Из TanStack Query v5 документации:

> "Specifying a longer `staleTime` means queries will not refetch their data as often,
> which is the recommended way to avoid excessive refetches."

| Метрика      | До             | После    |
| ------------ | -------------- | -------- |
| Запросы/сек  | 12+            | 0.2 max  |
| Параллельные | N              | 1        |
| Rate limit   | Нарушается     | 5x запас |
| UI latency   | Блокирован 429 | < 100ms  |

## Критические файлы

| Файл                                                             | Изменение                  |
| ---------------------------------------------------------------- | -------------------------- |
| `packages/web/components/generation-graph/GraphView.tsx:415-421` | Добавить `staleTime: 5000` |
| `packages/web/lib/trpc/client.ts:~140, ~187`                     | Request deduplication      |

## Верификация

1. `pnpm dev` - запустить локально
2. Создать курс с документами
3. Дождаться Stage 4
4. Проверить:
   - [ ] Clarifying нода появляется с 5 вопросами
   - [ ] Нет 429 ошибок в логах backend
   - [ ] Max 1 запрос каждые 5 секунд в Network tab
   - [ ] Progress обновляется при ответе на вопросы
