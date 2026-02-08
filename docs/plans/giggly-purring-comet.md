# Plan: Remove `coverGenerator` node from Stage 6 UI pipeline

## Context

Stage 6 ранее автоматически тригерил генерацию обложки урока (lesson card) после завершения judge-ноды. Это было отключено (закомментировано) из-за стоимости (~$0.04/image). Однако в UI инспектора урока `coverGenerator` до сих пор отображается как 4-я нода пайплайна (после generator → selfReviewer → judge).

**Факты:**

- Backend Stage 6 **не содержит** ни одной строки кода генерации обложек — `triggerLessonCard()` закомментирован в `job-processor.ts`
- UI-хук `useLessonInspectorData` искусственно запрашивает `lesson_enrichments` (type=`card`) и создаёт фейковую 4-ю ноду `coverGenerator`
- Stage 7 enrichments (on-demand covers/cards из UI) — **активная фича**, её не трогаем
- Авто-генерация course card после Stage 5 — **активна**, тоже не трогаем

**Что удаляем:** Все упоминания `coverGenerator` в типах Stage 6 и в 3-х UI-компонентах. Стейдж 6 станет 3-нодным пайплайном: `generator → selfReviewer → judge`.

## Changes

### 1. `shared-types/src/stage6-ui.types.ts` — убрать `coverGenerator` из типа и лейблов

- **Line 22-30**: Убрать п.4 из комментария, удалить `| 'coverGenerator'` из union type
- **Line 524**: Убрать `coverGenerator` из `STAGE6_NODE_LABELS`

```ts
// BEFORE
export type Stage6NodeName = 'generator' | 'selfReviewer' | 'judge' | 'coverGenerator';

// AFTER
export type Stage6NodeName = 'generator' | 'selfReviewer' | 'judge';
```

### 2. `web/.../hooks/useLessonInspectorData.ts` — убрать enrichment-запрос и coverGenerator ноду

- **Line 49**: Убрать pattern `{ pattern: /^coverGenerator/i, node: 'coverGenerator' }`
- **Line 60**: Убрать `covergenerator: 'coverGenerator'` из маппинга
- **Line 231**: Убрать `'coverGenerator'` из `pipelineOrder`
- **Lines 938-948**: Удалить запрос к `lesson_enrichments` (Step 5)
- **Lines 966-1020**: Удалить весь блок "Add coverGenerator node based on enrichment status"

### 3. `web/.../components/VerticalPipelineStepper.tsx` — убрать coverGenerator UI

- **Line 738-741**: Убрать `'coverGenerator'` из комментария и `hasSpecializedDisplay()`
- **Lines 747-753**: Удалить `interface CoverGeneratorOutput`
- **Lines 758-863**: Удалить `CoverGeneratorOutputDisplay` компонент (~105 строк)
- **Line 881-882**: Удалить `case 'coverGenerator'` из `NodeOutputDisplay` switch
- **Lines 894-896**: Удалить special-case для coverGenerator из `NodeOutputDisplayWithFallback`
- **Lines 969-971**: Убрать `isCoverGenerator` и упростить `canExpand`
- **Line 1202**: Убрать `'coverGenerator'` из `nodeOrder`

Также удалить неиспользуемые после этого импорты: `Dialog`, `DialogContent`, `DialogTitle`, `Image` (next/image), `Maximize2` — если они использовались только в `CoverGeneratorOutputDisplay`. Проверить при реализации.

### 4. `web/.../components/LiveTerminal.tsx` — убрать цвет coverGenerator

- **Line 35**: Обновить комментарий (3-node pipeline)
- **Line 41**: Удалить `coverGenerator: 'text-pink-400'`

### 5. Backend cleanup (закомментированный код)

- **`stage6-lesson-content/services/job-processor.ts`**:
  - Line 31-32: Удалить закомментированный import `triggerLessonCard`
  - Lines 452-462: Удалить закомментированный блок вызова `triggerLessonCard`

## Files Modified

| File                                                         | Action                                                                |
| ------------------------------------------------------------ | --------------------------------------------------------------------- |
| `packages/shared-types/src/stage6-ui.types.ts`               | Remove `coverGenerator` from type + labels                            |
| `packages/web/.../hooks/useLessonInspectorData.ts`           | Remove enrichment query + coverGenerator node logic                   |
| `packages/web/.../components/VerticalPipelineStepper.tsx`    | Remove ~120 lines: interface, component, switch cases, special-casing |
| `packages/web/.../components/LiveTerminal.tsx`               | Remove coverGenerator color entry                                     |
| `packages/course-gen-platform/.../services/job-processor.ts` | Remove commented-out triggerLessonCard code                           |

## NOT Touching (active features)

- Stage 7 `cover-handler.ts`, `auto-card-trigger.ts`, enrichment router — on-demand covers
- Stage 5 `triggerCourseCard()` — auto course card (active)
- `CoverPreview.tsx`, `CourseVisualsManager.tsx`, `LessonCoverHero.tsx` — UI для Stage 7
- DB migrations, enrichment types, model configs — всё активно для on-demand
- Batch covers tRPC endpoint — on-demand из UI

## Verification

1. `pnpm --filter @megacampus/shared-types build` — shared-types собирается
2. `pnpm type-check` — нет ошибок типов (каскадное изменение `Stage6NodeName`)
3. Визуально: открыть инспектор урока в Stage 6 — должно быть 3 ноды (generator, selfReviewer, judge), без 4-й "Обложка"
4. Stage 7 enrichments (covers/cards) продолжают работать — on-demand из UI
