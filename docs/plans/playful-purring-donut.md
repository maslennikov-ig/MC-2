# План исправления GitHub Issues

## Обзор

5 открытых issues на GitHub, сгруппированных по связанности:

| Issue                           | Тип         | Приоритет | Сложность |
| ------------------------------- | ----------- | --------- | --------- |
| #18 A11Y Keyboard Navigation    | enhancement | P1        | Medium    |
| #12 Live Log Parameter Tracking | enhancement | P1        | Low       |
| #13 Validation Rules Logging    | enhancement | P2        | Low       |
| #16 Regeneration Diff View      | bug         | P2        | Medium    |
| #14 Parameter Flow Dashboard    | enhancement | P3        | High      |

---

## Issue #18: [A11Y] Keyboard Navigation

**Статус**: Частично реализовано, требует доработки

### Что уже есть

- `useKeyboardShortcuts.ts` - Ctrl+0/+/- для zoom, Space для pan
- `useKeyboardNavigation.ts` - Arrow keys для навигации между узлами
- `StageNode.tsx` имеет `tabIndex={0}`, `role="button"`, `aria-label`
- Radix UI Dialog с автоматическим focus management

### Что нужно добавить

**1. Live Regions для логов**

```tsx
// ActivityLog.tsx и LiveTerminal.tsx
<div role="log" aria-live="polite" aria-atomic="false">
  {entries.map(...)}
</div>
```

**2. Focus management для dialogs**

```tsx
// RestartConfirmDialog.tsx
<Dialog onOpenAutoFocus={(e) => e.preventDefault()}>
  <Button ref={cancelButtonRef} autoFocus>Cancel</Button>
```

**3. Keyboard shortcuts для Approval**

- Enter → Approve/Confirm
- Escape → Cancel/Reject

**4. Skip links и landmark roles**

```tsx
<a href="#main-content" className="sr-only focus:not-sr-only">
  Skip to content
</a>
<main id="main-content" role="main">
```

### Файлы для изменения

- `packages/web/app/[locale]/courses/generating/[slug]/ActivityLog.tsx`
- `packages/web/components/generation-graph/components/LiveTerminal.tsx`
- `packages/web/components/generation-graph/controls/RestartConfirmDialog.tsx`
- `packages/web/components/generation-graph/controls/ApprovalControls.tsx`
- `packages/web/components/generation-graph/nodes/MediumNode.tsx`
- `packages/web/components/generation-graph/nodes/MinimalNode.tsx`

### Acceptance Criteria

- [ ] Все интерактивные элементы доступны через Tab
- [ ] Live regions объявляют новые записи лога
- [ ] Enter/Space активирует кнопки
- [ ] Escape закрывает dialogs
- [ ] Arrow keys навигация между stage nodes

---

## Issue #12: Live Log Parameter Tracking

**Статус**: Инфраструктура есть, нужно расширить логируемые события

### Текущая архитектура (Единая система логирования)

**Две таблицы в админке**:

1. `error_logs` - ошибки и warnings (через `logger.error/warn`)
2. `generation_trace` - трассировка генерации (через `traceLogger.logTrace`)

**Админка уже показывает оба источника** с фильтрацией по `source`:

- `error_log` - из error_logs
- `generation_trace` - из generation_trace

**Существующие поля для параметров**:

- `input_data` (JSONB) - входные параметры шага
- `output_data` (JSONB) - результат шага
- `metadata` (JSONB) - дополнительные данные

### Что нужно добавить

**1. Новые step_name значения для parameter events**

```typescript
// В generation_trace через traceLogger.logTrace
step_name:
  | 'parameter_store'       // Stage X: Storing parameters
  | 'parameter_propagate'   // Stage X→Y: Propagating
  | 'parameter_validate'    // Validation check
  | 'parameter_receive';    // Stage Y: Received from X
```

**2. Логирование в orchestrator'ах через traceLogger**

```typescript
// В каждом stage orchestrator - ИНТЕГРАЦИЯ С АДМИНКОЙ
await traceLogger.logTrace({
  course_id: courseId,
  stage: 'stage_4',
  phase: 'analysis',
  step_name: 'parameter_store',
  input_data: { source: 'stage_3' },
  output_data: {
    lessons: 20,
    modules: 5,
    estimatedDuration: 180,
  },
});

// При propagation
await traceLogger.logTrace({
  course_id: courseId,
  stage: 'stage_4',
  phase: 'completion',
  step_name: 'parameter_propagate',
  input_data: { targetStage: 'stage_5' },
  output_data: {
    propagatedParams: ['lessons', 'modules', 'topics'],
    success: true,
  },
});
```

**3. Расширение ActivityLog UI**

- Иконки для разных step_name (parameter_store → 💾, parameter_propagate → ➡️)
- Фильтрация по step_name
- Link на детали в админке

**4. Фильтр в админке по step_name**

- Добавить filter option для parameter-related steps
- Уже работает через существующий search

### Файлы для изменения

- `packages/course-gen-platform/src/shared/trace-logger.ts` - документация step_name
- `packages/course-gen-platform/src/stages/stage4-analysis/orchestrator.ts` - добавить logTrace
- `packages/course-gen-platform/src/stages/stage5-generation/orchestrator.ts` - добавить logTrace
- `packages/course-gen-platform/src/stages/stage5-generation/phases/generation-phases.ts`
- `packages/web/app/[locale]/courses/generating/[slug]/ActivityLog.tsx` - UI improvements

### Acceptance Criteria

- [ ] Логи parameter_store видны в generation_trace (админка)
- [ ] Логи parameter_propagate видны в generation_trace (админка)
- [ ] Логи parameter_validate видны в generation_trace (админка)
- [ ] ActivityLog показывает эти события с иконками
- [ ] Можно фильтровать по step_name в админке

---

## Issue #13: Validation Rules Logging

**Статус**: Валидация есть, логирование минимальное

### Текущая архитектура (Единая система логирования)

**Validation failures → error_logs** (через logger.warn/error):

```typescript
logger.warn(
  {
    ...createErrorContext({
      courseId,
      trpcPath: 'generation.validate',
      attemptedValue: 'understand', // non-measurable verb
    }),
  },
  "Bloom's validation warning: non-measurable verb detected"
);
```

**Validation traces → generation_trace** (через traceLogger):

- `step_name: 'validate_blooms'` | `'validate_placeholders'` | `'validate_duration'`
- `quality_score` для итогового результата

### Что нужно добавить

**1. Детальное логирование в валидаторах (ИНТЕГРАЦИЯ С АДМИНКОЙ)**

```typescript
// validation-orchestrator.ts - для каждого rule

// Success → generation_trace (info level)
await traceLogger.logTrace({
  course_id: courseId,
  stage: 'stage_5',
  phase: 'validation',
  step_name: 'validate_blooms',
  input_data: {
    ruleId: 'blooms_taxonomy',
    targetParameter: 'learning_objectives',
    objectivesCount: objectives.length,
  },
  output_data: {
    passed: true,
    checkedItems: 15,
    warnings: [],
  },
  quality_score: 1.0,
});

// Failure → error_logs (warning/error) + generation_trace
logger.warn({
  ...createErrorContext({
    courseId,
    trpcPath: 'stage5.validation',
    attemptedValue: 'understand',
    metadata: {
      ruleId: 'blooms_taxonomy',
      severity: 'WARNING',
      objectiveIndex: 3,
      suggestion: 'Replace with: explain, describe, identify'
    }
  }),
}, 'Bloom\'s validation: non-measurable verb detected');

// Также в trace для полноты
await traceLogger.logTrace({
  course_id: courseId,
  stage: 'stage_5',
  phase: 'validation',
  step_name: 'validate_blooms',
  input_data: { ruleId: 'blooms_taxonomy', objectives },
  output_data: { passed: false, issues: [...] },
  error_data: { issues: validationIssues }, // Это делает запись видимой как ошибка
  quality_score: 0.85,
});
```

**2. Структура validation issue для metadata**

```typescript
interface ValidationIssueLog {
  ruleId: string; // 'blooms_taxonomy'
  severity: 'ERROR' | 'WARNING' | 'INFO';
  field: string; // 'sections[0].lessons[1].objectives[0]'
  value: string; // 'understand the concept'
  reason: string; // 'Non-measurable verb: understand'
  suggestion?: string; // 'Use: explain, describe, identify'
}
```

**3. UI в админке**

- Уже работает через фильтр `source: generation_trace`
- Фильтр по `step_name` starts with `validate_`
- Детали validation issues в `output_data` / `error_data`

**4. UI в NodeDetailsDrawer (Stage5Panel)**

- Показать validation результаты из generation_trace
- Query: `step_name LIKE 'validate_%' AND course_id = X`
- Expandable секция с деталями каждого rule

### Файлы для изменения

- `packages/course-gen-platform/src/stages/stage5-generation/validators/validation-orchestrator.ts`
- `packages/course-gen-platform/src/stages/stage5-generation/validators/blooms-validator.ts`
- `packages/course-gen-platform/src/stages/stage5-generation/validators/placeholder-validator.ts`
- `packages/course-gen-platform/src/stages/stage5-generation/validators/duration-validator.ts`
- `packages/web/components/generation-graph/panels/stage-panels/Stage5Panel.tsx`

### Acceptance Criteria

- [ ] Каждое применение validation rule логируется в generation_trace
- [ ] Failed validations также идут в error_logs (видны в админке как warnings)
- [ ] Логи содержат ruleId, field, value, reason, suggestion
- [ ] Можно фильтровать validation логи в админке
- [ ] Stage5Panel показывает validation history
- [ ] Performance overhead <5%

---

## Issue #16: Regeneration Diff View

**Статус**: Инфраструктура есть, нужен UI

### Текущая архитектура

- `SemanticDiffGenerator` - анализирует изменения
- `DiffViewer` компонент (json-diff-kit)
- `generation_trace` хранит input/output каждого шага
- `regenerateBlock` endpoint сохраняет semantic diff

### Что нужно добавить

**1. Таблица course_edits (миграция)**

```sql
CREATE TABLE course_edits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  edited_by UUID REFERENCES users(id),

  stage TEXT NOT NULL,                    -- 'stage_4' | 'stage_5'
  field_path TEXT NOT NULL,               -- 'sections[0].lessons[1].title'
  previous_value JSONB,
  new_value JSONB,

  semantic_diff JSONB,                    -- SemanticDiff object
  user_instruction TEXT,                  -- что пользователь попросил

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_course_edits_course ON course_edits(course_id);
CREATE INDEX idx_course_edits_created ON course_edits(created_at DESC);
```

**2. Сохранение edits в regenerateBlock**

```typescript
// После успешной регенерации
await supabase.from('course_edits').insert({
  course_id,
  edited_by: userId,
  stage: 'stage_5',
  field_path: blockPath,
  previous_value: oldValue,
  new_value: newValue,
  semantic_diff: diff,
  user_instruction: instruction,
});
```

**3. UI Timeline компонент**

- Список всех edits для курса
- Click → показать diff (side-by-side)
- Semantic annotations (что изменилось семантически)

### Файлы для изменения

- `packages/course-gen-platform/supabase/migrations/` - новая миграция
- `packages/course-gen-platform/src/server/routers/courses/regenerate.ts`
- `packages/web/components/generation-graph/panels/` - новый EditHistoryPanel.tsx
- `packages/web/components/generation-graph/panels/NodeDetailsDrawer.tsx` - добавить tab

### Acceptance Criteria

- [ ] История изменений сохраняется в БД
- [ ] UI показывает timeline всех edits
- [ ] Diff view показывает before/after
- [ ] Semantic diff объясняет что изменилось

---

## Issue #14: Parameter Flow Dashboard

**Статус**: Новая фича, требует значительной разработки

### Архитектура решения

**1. Новый React Flow dashboard**

- Отдельная страница или modal
- 6 stage nodes + parameter flow edges
- Real-time обновления через WebSocket

**2. Custom nodes для stages**

```typescript
const ParameterFlowNode = ({ data }: NodeProps) => (
  <div className="parameter-flow-node">
    <h3>{data.stageName}</h3>
    <div className="parameters">
      {data.parameters.map(p => (
        <ParameterChip
          key={p.name}
          name={p.name}
          value={p.value}
          status={p.status} // pending | active | completed | failed
        />
      ))}
    </div>
  </div>
);
```

**3. Animated edges для parameter flow**

```typescript
const ParameterFlowEdge = ({ data }: EdgeProps) => (
  <BaseEdge
    animated={data.isActive}
    style={{ stroke: getStatusColor(data.status) }}
  />
);
```

**4. Real-time state через WebSocket**

- Подписка на `generation_trace` changes
- Обновление node/edge статусов при новых записях

### Файлы для создания

- `packages/web/components/parameter-flow/ParameterFlowDashboard.tsx`
- `packages/web/components/parameter-flow/nodes/ParameterStageNode.tsx`
- `packages/web/components/parameter-flow/edges/ParameterFlowEdge.tsx`
- `packages/web/components/parameter-flow/hooks/useParameterFlow.ts`

### Acceptance Criteria

- [ ] Dashboard показывает все 6 stages
- [ ] Parameter flow анимирован и real-time
- [ ] Parameters color-coded по статусу
- [ ] Latency обновлений <500ms
- [ ] Zoom, pan, filter работают

---

## Порядок реализации (согласован с пользователем)

### Phase 1: Logging Improvements (НАЧИНАЕМ ЗДЕСЬ)

1. **#12** - Parameter tracking в Live Log
   - Добавить `logTrace` calls в stage orchestrators
   - step_name: `parameter_store`, `parameter_propagate`, `parameter_validate`
   - Все попадает в единую систему (generation_trace → админка)

2. **#13** - Validation rules logging
   - Добавить детальное логирование в validators
   - Success → generation_trace, Failures → error_logs + generation_trace
   - Структурированные ValidationIssueLog в metadata

### Phase 2: UX Improvements

3. **#18** - A11Y improvements (Medium effort, High value)
4. **#16** - Diff view (Medium effort, High value)

### Phase 3: New Feature

5. **#14** - Parameter Flow Dashboard (включён в план по запросу)

---

## Верификация

После каждого issue:

1. `pnpm type-check` - проверка типов
2. `pnpm build` - сборка
3. Manual testing на dev.ai.megacampus.ru
4. Для #18: тестирование с keyboard only (no mouse)
5. Для #14: проверка latency обновлений

---

## Связанные Beads Issues

Создать в Beads для tracking:

```bash
bd create -t feature --title "[A11Y] Keyboard navigation improvements" --files packages/web/components/generation-graph
bd create -t feature --title "Parameter tracking in Live Log" --files packages/course-gen-platform/src/shared/logging
bd create -t feature --title "Validation rules logging" --files packages/course-gen-platform/src/stages/stage5-generation/validators
bd create -t bug --title "Regeneration diff view" --files packages/web/components/generation-graph/panels
bd create -t feature --title "Parameter flow dashboard" --files packages/web/components/parameter-flow
```
