# План: Убрать чат из Stage 3 (приоритизация документов)

## Цель

Скрыть окно чата на этапе приоритизации документов (Stage 3), оставив его доступным на других этапах.

## Изменения

### 1. GlobalCourseChat.tsx

**Файл:** `packages/web/components/generation/GlobalCourseChat.tsx`

- Добавить prop `currentStage?: number | null` в интерфейс
- В начале компонента: `if (currentStage === 3) return null`

### 2. GenerationProgressContainerEnhanced.tsx

**Файл:** `packages/web/app/[locale]/courses/[orgSlug]/[courseSlug]/generating/GenerationProgressContainerEnhanced.tsx`

- Импортировать `getStageFromStatus` из `@/lib/generation-graph/utils`
- Вычислить `currentStage = getStageFromStatus(state.status || '')`
- Передать `currentStage` в `<GlobalCourseChat />`

## Файлы для изменения

1. `packages/web/components/generation/GlobalCourseChat.tsx`
2. `packages/web/app/[locale]/courses/[orgSlug]/[courseSlug]/generating/GenerationProgressContainerEnhanced.tsx`

## Верификация

```bash
pnpm type-check
pnpm build
```

Ручное тестирование:

- Stage 2 → чат виден
- Stage 3 → чат скрыт
- Stage 4 → чат виден
