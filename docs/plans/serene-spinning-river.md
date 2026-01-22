# План: Исправление 8 открытых GitHub Issues

**Статус:** В РАБОТЕ
**GitHub Issues:** #10, #11, #12, #13, #14, #16, #17, #18
**Дата:** 2026-01-22

---

## Приоритеты

| Приоритет | Issue | Тип     | Описание                                  | Сложность |
| --------- | ----- | ------- | ----------------------------------------- | --------- |
| **P0**    | #10   | bug     | Stage 4 protected fields, silent failures | Medium    |
| **P0**    | #16   | bug     | Regeneration пересчитывает структуру      | Medium    |
| **P1**    | #11   | UX      | Stage 6 input parameters not displayed    | Easy      |
| **P1**    | #17   | UX      | Focus active node after actions           | Easy      |
| **P1**    | #12   | UX      | Live Log не отслеживает параметры         | Medium    |
| **P2**    | #13   | feature | Logging for validation rules              | Medium    |
| **P2**    | #14   | feature | Parameter flow visualization dashboard    | Hard      |
| **P2**    | #18   | A11Y    | Keyboard navigation                       | Hard      |

---

## P0-1: Issue #10 - Stage 4 Protected Fields

### Root Cause Analysis

1. **Silent failures в EditableChips.tsx** (строки 69-100):
   - Если `isLearningObjective=true` но `courseId`/`fieldPath` отсутствуют, deletion застревает
   - Impact modal не показывается, но onChange тоже не вызывается

2. **Toggle не работает в EditableField.tsx** (строки 106-137):
   - Та же проблема с isLearningObjective блокировкой

3. **Whitelist проверяется на backend** (field-update.router.ts:63-84):
   - Поля `use_analogies` и `specific_analogies` УЖЕ в whitelist
   - Проблема на frontend, не backend

### Решение

1. Добавить visual feedback при blocked actions (toast notification)
2. Исправить isLearningObjective логику - fallback к onChange если modal не может показаться
3. Добавить `disabled` prop visual indicator

### Файлы для изменения

- `packages/web/components/generation-graph/panels/output/EditableChips.tsx`
- `packages/web/components/generation-graph/panels/output/EditableField.tsx`

---

## P0-2: Issue #16 - Regeneration Diff

### Root Cause Analysis

1. **Diff генерируется** в semantic-diff-generator.ts (строки 522-600)
2. **Diff возвращается** в regeneration.router.ts (строки 310-317)
3. **Diff НЕ показывается** в UI - InlineRegenerateChat.tsx получает результат но не отображает diff

### Решение

1. Показать SemanticDiff в UI после regeneration
2. Добавить visual comparison (before/after) с highlighting

### Файлы для изменения

- `packages/web/components/generation-graph/panels/output/InlineRegenerateChat.tsx`
- Создать новый компонент `SemanticDiffView.tsx`

---

## P1-1: Issue #11 - Stage 6 Input Tab

### Root Cause Analysis

1. **Stage 6 не имеет InputTab** - в отличие от Stage 1-5
2. **Данные доступны** в Stage6Input interface (types/index.ts:121-152)
3. **UI показывает** только Preview, Quality, Sources, Blueprint, Trace, Card

### Решение

1. Создать `Stage6InputTab.tsx` компонент
2. Добавить вкладку "Input" в Stage6InspectorContent.tsx
3. Показать: lessonSpec, style, analysisResult, ragChunks summary, language

### Файлы для изменения

- Создать: `packages/web/components/generation-graph/panels/stage6/Stage6InputTab.tsx`
- Изменить: `packages/web/components/generation-graph/panels/stage6/inspector/Stage6InspectorContent.tsx`

---

## P1-2: Issue #17 - Focus Active Node

### Root Cause Analysis

1. **setCenter() используется** только при failed status (GraphView.tsx:336-352)
2. **После approve/start** - selectNode() вызывается, но viewport не меняется
3. **fitView()** вызывается при layout, но не после actions

### Решение

1. Добавить scrollIntoView логику в onApprove callback
2. Использовать setCenter() для плавной анимации к активному node

### Файлы для изменения

- `packages/web/components/generation-graph/GraphView.tsx` (строки 1016-1062)

---

## P1-3: Issue #12 - Live Log Parameters

### Root Cause Analysis

1. **generation_trace** содержит: step_name, phase, tokens, cost, duration
2. **НЕ содержит**: input parameters, validation results
3. **buildLogEntries()** (useLessonInspectorData.ts:645-678) форматирует только существующие поля

### Решение

1. Добавить parameter logging в backend при Stage transitions
2. Расширить generation_trace или создать отдельную таблицу
3. Отобразить в LiveTerminal

### Файлы для изменения

- Backend: `packages/course-gen-platform/src/stages/` - добавить logging
- Frontend: `packages/web/components/generation-graph/hooks/useLessonInspectorData.ts`

---

## P2 Issues (отложить)

- **#13** - Validation rules logging (requires backend changes)
- **#14** - Parameter flow dashboard (new feature, complex)
- **#18** - Keyboard navigation (requires comprehensive audit)

---

## Execution Plan

### Phase 1: Quick Wins (P1-1, P1-2)

1. **Stage6InputTab** - создать компонент и добавить вкладку
2. **Focus node** - добавить setCenter() после actions

### Phase 2: Bug Fixes (P0-1, P0-2)

3. **EditableChips/Field** - исправить silent failures
4. **SemanticDiffView** - показать diff после regeneration

### Phase 3: Logging (P1-3)

5. **Parameter logging** - backend + frontend

---

## Verification

1. **Type-check**: `pnpm type-check`
2. **Build**: `pnpm build`
3. **Manual testing**:
   - Stage 4: попробовать удалить item из Task Types
   - Stage 4: попробовать отключить analogies switch
   - Stage 6: проверить Input tab
   - Actions: проверить scroll к активному node
   - Regeneration: проверить отображение diff

---

## Beads Tasks to Create

```bash
# P1-1: Stage 6 Input Tab
bd create --title="Add Stage6InputTab component" --type=task --priority=1 \
  --labels="frontend,stage6" \
  --files="packages/web/components/generation-graph/panels/stage6/inspector/Stage6InspectorContent.tsx"

# P1-2: Focus active node
bd create --title="Add scroll to active node after actions" --type=task --priority=1 \
  --labels="frontend,ux" \
  --files="packages/web/components/generation-graph/GraphView.tsx"

# P0-1: Stage 4 silent failures
bd create --title="Fix Stage 4 EditableChips/Field silent failures" --type=bug --priority=0 \
  --labels="frontend,stage4" \
  --files="packages/web/components/generation-graph/panels/output/EditableChips.tsx,packages/web/components/generation-graph/panels/output/EditableField.tsx"

# P0-2: Regeneration diff display
bd create --title="Show SemanticDiff in UI after regeneration" --type=task --priority=0 \
  --labels="frontend,regeneration" \
  --files="packages/web/components/generation-graph/panels/output/InlineRegenerateChat.tsx"

# P1-3: Parameter logging
bd create --title="Add parameter logging to Live Generation Log" --type=task --priority=1 \
  --labels="backend,frontend,logging" \
  --files="packages/web/components/generation-graph/hooks/useLessonInspectorData.ts"
```
