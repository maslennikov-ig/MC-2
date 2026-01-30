# Plan: Fix Clarifying Questions Node Display Issues

## Problem Summary

При статусе `stage_4_clarifying` (фаза уточняющих вопросов):

1. Нода позиционируется между этапами 4 и 5 вместо отростка от Stage 4
2. Нода не открывается автоматически
3. ClarifyingPanel не отображается - вместо вопросов показывается ошибка
4. В результатах Stage 4 написано "Stage completed successfully" вместо вопросов

## Root Cause Analysis

### Bug 1: ClarifyingPanel condition is incorrect (CRITICAL)

**File**: `packages/web/components/generation-graph/panels/NodeDetailsDrawer.tsx:956`

```typescript
generationStatus === 'stage_4_clarifying' && data?.stageNumber === 4;
```

`ClarifyingNodeData` НЕ содержит `stageNumber` - условие никогда не выполняется для clarifying ноды.

### Bug 2: Auto-open logic doesn't handle clarifying state (CRITICAL)

**File**: `packages/web/components/generation-graph/GraphView.tsx:995-996`

```typescript
if (awaitingStage === 4) {
  selectedStage = 'stage_4'; // Opens stage_4, NOT stage_4_clarifying!
}
```

Функция `isAwaitingApproval('stage_4_clarifying')` возвращает `null`, а не `4`.

### Bug 3: Node positioning (COSMETIC)

**File**: `packages/web/components/generation-graph/hooks/use-graph-data/utils/graph-builders.ts:782`

Нода добавляется inline: `prevNodeId = clarifyingNodeId` делает её частью основной цепи.

### Bug 4: StageResultsPreview missing clarifying info (MINOR)

**File**: `packages/web/components/generation/StageResultsPreview.tsx`

Нет отображения информации об уточняющих вопросах для Stage 4.

---

## Implementation Plan

### Phase 1: Fix Critical Bugs

#### 1.1 Fix ClarifyingPanel display condition

**File**: `packages/web/components/generation-graph/panels/NodeDetailsDrawer.tsx`

**Current** (line 956):

```typescript
) : generationStatus === 'stage_4_clarifying' && data?.stageNumber === 4 ? (
```

**Fix**:

```typescript
) : selectedNode?.type === 'clarifying' ||
    (generationStatus === 'stage_4_clarifying' && data?.stageNumber === 4) ? (
```

Показывать ClarifyingPanel когда:

- Выбрана нода типа `clarifying` (новое условие)
- ИЛИ статус `stage_4_clarifying` и выбрана Stage 4 (backward compat)

#### 1.2 Fix isAwaitingApproval utility

**File**: `packages/web/lib/generation-graph/utils.ts`

**Current** (lines 151-157):

```typescript
export function isAwaitingApproval(status: string): number | null {
  if (!status) return null;
  if (status === 'pending') return 0;
  const match = status.match(/stage_(\d+)_awaiting_approval/);
  return match ? parseInt(match[1], 10) : null;
}
```

**Fix** - добавить обработку clarifying:

```typescript
export function isAwaitingApproval(status: string): number | null {
  if (!status) return null;
  if (status === 'pending') return 0;
  if (status === 'stage_4_clarifying') return 4; // NEW: Clarifying requires user action
  const match = status.match(/stage_(\d+)_awaiting_approval/);
  return match ? parseInt(match[1], 10) : null;
}
```

#### 1.3 Fix auto-open logic in GraphView

**File**: `packages/web/components/generation-graph/GraphView.tsx`

**Current** (lines 991-1001):

```typescript
if (awaitingStage === 3) {
  selectedStage = 'stage_3'
  isAwaitingState = true
} else if (awaitingStage === 4) {
  selectedStage = 'stage_4'
  isAwaitingState = true
} else if (awaitingStage === 5) {
  ...
}
```

**Fix** - добавить проверку clarifying перед awaitingStage:

```typescript
// Check clarifying state FIRST (specific case)
if (pipelineStatus === 'stage_4_clarifying') {
  selectedStage = 'stage_4_clarifying'
  isAwaitingState = true
} else if (awaitingStage === 3) {
  selectedStage = 'stage_3'
  isAwaitingState = true
} else if (awaitingStage === 4) {
  selectedStage = 'stage_4'
  isAwaitingState = true
} else if (awaitingStage === 5) {
  ...
}
```

Также добавить `pipelineStatus` в dependencies useEffect.

### Phase 2: Fix Cosmetic Issues (Optional)

#### 2.1 Clarifying node positioning

**File**: `packages/web/components/generation-graph/hooks/use-graph-data/utils/graph-builders.ts`

Текущая реализация делает clarifying ноду inline в цепи Stage 4 → Clarifying → Stage 5.
Это технически корректно для flow, но визуально должна быть "отросток вниз".

**Опции**:
A. Оставить как есть - ELK layout должен справиться
B. Добавить layout hints для вертикального позиционирования
C. Не менять `prevNodeId`, оставить Stage 4 → Stage 5 основной цепью

**Рекомендация**: Начать с Phase 1, проверить визуальный результат, затем решить нужно ли менять.

### Phase 3: Minor Improvements (Optional)

#### 3.1 Add clarifying info to StageResultsPreview

**File**: `packages/web/components/generation/StageResultsPreview.tsx`

Расширить интерфейс `StageData` и добавить отображение для Stage 4:

```typescript
interface StageData {
  // ...existing
  clarifyingQuestionsCount?: number;
  clarifyingAnsweredCount?: number;
}
```

---

## Files to Modify

| Priority | File                                                                    | Changes                                           |
| -------- | ----------------------------------------------------------------------- | ------------------------------------------------- |
| P0       | `packages/web/components/generation-graph/panels/NodeDetailsDrawer.tsx` | Fix ClarifyingPanel condition                     |
| P0       | `packages/web/lib/generation-graph/utils.ts`                            | Handle `stage_4_clarifying` in isAwaitingApproval |
| P0       | `packages/web/components/generation-graph/GraphView.tsx`                | Fix auto-open for clarifying node                 |
| P2       | `packages/web/components/generation/StageResultsPreview.tsx`            | Add clarifying info display                       |

---

## Verification

1. **Manual test**: Запустить генерацию курса до этапа 4 с уточняющими вопросами
2. Проверить:
   - [ ] Clarifying нода появляется при переходе в `stage_4_clarifying`
   - [ ] Drawer автоматически открывается на clarifying ноде
   - [ ] ClarifyingPanel показывает вопросы (не ошибку)
   - [ ] Можно ответить на вопросы и продолжить генерацию
3. **Type-check**: `pnpm type-check`
4. **Build**: `pnpm build`

---

## Estimated Impact

- **Phase 1**: Исправляет критические баги - пользователи смогут видеть и отвечать на вопросы
- **Phase 2**: Косметическое улучшение визуала графа
- **Phase 3**: UX улучшение для отображения прогресса
