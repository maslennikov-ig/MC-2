# Plan: mc2-f5po — Token aggregation в ModuleDashboard

## Context

ModuleDashboard показывает "—" вместо потреблённых токенов (Stage6ControlTower). Данные уже есть в БД (`lesson_contents.metadata.total_tokens`), компонент уже умеет их отображать (`formatTokensCompact`). Нужно только "протянуть провод" — извлечь, агрегировать, передать.

## Изменения (8 правок в 3 файлах)

### Файл 1: `packages/shared-types/src/stage6-ui.types.ts`

**1.1** `LessonMatrixRow` (после строки 306 `canRetry`):

```typescript
/** Total tokens consumed (null if pending/active) */
totalTokens: number | null;
```

**1.2** `ModuleDashboardAggregates` (после строки 333 `totalDurationMs`):

```typescript
/** Total tokens consumed across all lessons */
totalTokens: number;
```

### Файл 2: `packages/web/components/generation-graph/hooks/useModuleDashboardData.ts`

**2.1** `calculateAggregates` — добавить агрегацию (после строки 144 `totalCostUsd`):

```typescript
const totalTokens = lessons.reduce((sum, l) => sum + (l.totalTokens || 0), 0);
```

**2.2** Return объект calculateAggregates (после строки 186 `totalDurationMs`):

```typescript
totalTokens,
```

**2.3** Pending lesson (case 1, строка ~536): добавить `totalTokens: null,`

**2.4** Content row lesson (строка ~554): добавить `totalTokens: metadata?.total_tokens ?? null,`

**2.5** Pending lesson (case 2, строка ~574): добавить `totalTokens: null,`

### Файл 3: `packages/web/components/generation-graph/panels/module/ModuleDashboard.tsx`

**3.1** Строка 152 — заменить:

```typescript
// Было:
totalTokens: undefined, // Not available yet - TODO: aggregate from lessons
// Стало:
totalTokens: data.aggregates.totalTokens,
```

## Что НЕ нужно менять

- `Stage6ControlTower` — уже принимает `totalTokens?: number` и отображает через `formatTokensCompact`
- Stage 6 pipeline — уже пишет `total_tokens` в metadata (`judge-helpers.ts:165`)
- `LessonMetadata` интерфейс в хуке — уже содержит `total_tokens?: number`
- БД — metadata JSONB уже хранит данные

## Верификация

1. `pnpm --filter @megacampus/shared-types build` — пересобрать типы
2. `pnpm type-check` — проверить всё компилируется
3. `pnpm --filter course-gen-platform test` — юнит-тесты
4. Визуально: открыть ModuleDashboard для курса с завершёнными уроками — вместо "—" должно показывать "1.2M" или "500K"

## Риски

- **Минимальный**: 100% паттерн costUsd, данные уже в БД, компонент готов
- **Edge case**: старые уроки без `total_tokens` в metadata → `null` → агрегация считает как 0 → корректно
