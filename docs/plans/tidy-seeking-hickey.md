# План: Исправление ошибки getChatTokenEstimates (tRPC BAD_REQUEST 400)

## Проблема

В логах frontend и backend обнаружена ошибка:

```
[getChatTokenEstimates] Failed to fetch: 400

tRPC error: invalid_type, expected "string", received "undefined", path ["courseId"]
```

URL запроса: `/trpc/generation.getChatTokenEstimates?input=%7B%22json%22%3A%7B%22courseId%22%3A%22...%22%7D%7D`

Это значит: `{"json":{"courseId":"..."}}` — **неправильный** формат для tRPC GET запросов.

## Анализ

### Текущий код (refinement.ts:94)

```ts
const response = await fetch(
  `${TRPC_URL}/generation.getChatTokenEstimates?input=${encodeURIComponent(JSON.stringify({ json: { courseId } }))}`,
  { method: 'GET', headers }
);
```

### Сравнение с рабочими эндпоинтами

В `admin-generation.ts` используется **правильный** формат без вложенного `json`:

```ts
// admin-generation.ts:242 — РАБОТАЕТ:
`${TRPC_URL}/generation.getStageResults?input=${encodeURIComponent(JSON.stringify({ courseId, stage }))}`
// admin-generation.ts:501 — РАБОТАЕТ:
`${TRPC_URL}/generation.checkDownstreamStages?input=${encodeURIComponent(JSON.stringify({ courseId }))}`;
```

### Причина ошибки

Вложенный объект `{ json: { courseId } }` — это формат для tRPC POST запросов с `superjson`.
Для GET запросов нужен простой объект: `{ courseId }`.

## Решение

### Задача: Исправить формат input в getChatTokenEstimates

**Файл:** `packages/web/app/actions/refinement.ts`
**Строка:** ~94

```ts
// БЫЛО (неправильно):
`${TRPC_URL}/generation.getChatTokenEstimates?input=${encodeURIComponent(JSON.stringify({ json: { courseId } }))}`
// СТАНЕТ (правильно):
`${TRPC_URL}/generation.getChatTokenEstimates?input=${encodeURIComponent(JSON.stringify({ courseId }))}`;
```

## Файлы для изменения

1. `packages/web/app/actions/refinement.ts` — строка ~94

## Проверка

1. `pnpm type-check` — типы корректны
2. `pnpm --filter=web build` — сборка проходит
3. Запустить dev сервер: `pnpm dev`
4. Открыть страницу генерации курса
5. Открыть GlobalCourseChat
6. Убедиться: нет ошибки `Failed to fetch: 400` в консоли
7. Token estimates показываются корректно в UI

## Дополнительные замечания

Ошибки `BARRIER_FAILED` в worker-логах — это **не баги**, а логические ошибки пайплайна, когда документ не был успешно обработан на Stage 2. Они не относятся к исправлениям кода.
