# Увеличить rate limit для generateOnDemand до 60/мин

## Context

Пользователь столкнулся с ошибкой "Rate limit exceeded" при попытке запустить 6+ генераций обогащений (аудио/видео) подряд. Текущий лимит — 5 запросов в 60 секунд. Поскольку генерация ставится в очередь BullMQ (которая сама контролирует параллелизм воркеров), жёсткий лимит на API-endpoint не нужен. Увеличиваем до 60 запросов в минуту.

## Изменение

**Файл:** `packages/course-gen-platform/src/server/routers/enrichment/procedures/generate-on-demand.ts` (строка 76)

```diff
- .use(createRateLimiter({ requests: 5, window: 60 })) // 5 generations per minute
+ .use(createRateLimiter({ requests: 60, window: 60 })) // 60 generations per minute (queued via BullMQ)
```

## Проверка

1. `pnpm --filter course-gen-platform type-check` — компиляция
2. `npx vitest run "generate-on-demand"` — юнит-тесты (из директории course-gen-platform)
