# Fix: ClarifyingNode не обновляется без рефреша страницы

## Проблема

После ответа на вопрос в ClarifyingPanel счётчик "X/Y отвечено" обновляется в панели, но на ноде графа остаётся старое значение до рефреша страницы.

## История попыток (mc2-3i0e)

Была проведена миграция на `@tanstack/react-query` (коммиты 15926db0, 0d8d5332), но проблема сохраняется.

## Root Cause: Комбинация 4 факторов

### 1. `staleTime: 5000` в GraphView.tsx (строка 417)

```typescript
const { data: clarifyingProgressRaw } = useClarifyingProgress(courseId, {
  staleTime: 5000, // ← 5 СЕКУНД — query считается "свежим"
});
```

Когда ClarifyingPanel инвалидирует cache, TanStack Query отмечает данные как stale, но **не рефетчит автоматически** пока staleTime не истечёт.

### 2. Явный refetch только questions, не progress (ClarifyingPanel.tsx:340-354)

```typescript
const invalidateAndRefetch = useCallback(async () => {
  await invalidateClarifying(); // инвалидирует ОБА query
  await refetchQuestions(); // НО рефетчит ТОЛЬКО questions!
}, [invalidateClarifying, refetchQuestions]);
```

### 3. `invalidateQueries()` НЕ равно `refetchQueries()`

- `invalidateQueries()` = помечает как stale
- Фактический refetch произойдёт при: remount, refetchInterval, явном refetch()

### 4. Race condition

ClarifyingPanel обновляется быстро (рефетч questions), а GraphView ждёт автоматический refetch progress.

## Решение

### Шаг 1: Заменить `staleTime: 5000` на `0` в GraphView.tsx

**Файл**: `packages/web/components/generation-graph/GraphView.tsx:417`

```typescript
// Было:
const { data: clarifyingProgressRaw } = useClarifyingProgress(courseId, {
  staleTime: 5000,
});

// Стало:
const { data: clarifyingProgressRaw } = useClarifyingProgress(courseId, {
  staleTime: 0, // invalidation triggers immediate refetch
});
```

### Шаг 2: Явно рефетчить progress query после mutation в ClarifyingPanel

**Файл**: `packages/web/components/generation-graph/panels/clarifying/ClarifyingPanel.tsx`

Добавить вызов `refetchProgress()` в `invalidateAndRefetch`:

```typescript
// Добавить хук:
const { refetch: refetchProgress } = useClarifyingProgress(courseId, {
  enabled: false, // только для ручного refetch
});

// Обновить функцию:
const invalidateAndRefetch = useCallback(async () => {
  await invalidateClarifying();
  await Promise.all([
    refetchQuestions(),
    refetchProgress(), // ← ДОБАВИТЬ
  ]);
}, [invalidateClarifying, refetchQuestions, refetchProgress]);
```

## Файлы для изменения

1. `packages/web/components/generation-graph/GraphView.tsx` — убрать staleTime: 5000
2. `packages/web/components/generation-graph/panels/clarifying/ClarifyingPanel.tsx` — добавить явный refetch progress

## Верификация

1. Открыть страницу генерации курса на Stage 4
2. Ответить на любой вопрос
3. Проверить, что счётчик на ноде графа обновился **без** рефреша страницы
4. Проверить в DevTools → Network, что progress query рефетчится после ответа
