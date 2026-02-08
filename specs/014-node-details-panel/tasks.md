# MBI-014: Node Details Panel - Tasks

## Phase 1: Research & Design

### T001: Current State Audit

- **Status**: [X] Completed
- **Executor**: Claude (Explore agent)
- **Priority**: P0
- **Estimate**: 1 hour

**Subtasks:**

- [x] T001.1: Исследовать почему `inputData`/`outputData` показывают "No data"
- [x] T001.2: Проверить mapping traces → node.data.attempts в useGraphData.ts
- [x] T001.3: Проверить работу RefinementChat (отправка сообщения, получение ответа)
- [x] T001.4: Проверить работу ActivityTab фильтрации
- [x] T001.5: Задокументировать найденные баги

**Artifacts:**
→ [T001-audit-report.md](specs/014-node-details-panel/research/T001-audit-report.md)
→ [BUGS-SUMMARY.md](specs/014-node-details-panel/research/BUGS-SUMMARY.md)
→ [FILES-REQUIRING-MODIFICATION.md](specs/014-node-details-panel/research/FILES-REQUIRING-MODIFICATION.md)

---

### T002: Design Mockups

- **Status**: [X] Completed
- **Executor**: nextjs-ui-designer
- **Priority**: P0
- **Estimate**: 2 hours

**Subtasks:**

- [x] T002.1: Дизайн полноэкранной панели (Light theme)
- [x] T002.2: Дизайн полноэкранной панели (Dark theme)
- [x] T002.3: Дизайн JSON viewer с подсветкой
- [x] T002.4: Дизайн Chat секции (всегда видимый)
- [x] T002.5: Responsive breakpoints (Desktop/Tablet/Mobile)
- [x] T002.6: CSS переменные для тем
- [x] T002.7: Анимации открытия/закрытия

**Artifacts:**
→ [components.md](specs/014-node-details-panel/design/components.md)
→ [styles.md](specs/014-node-details-panel/design/styles.md)
→ [responsive.md](specs/014-node-details-panel/design/responsive.md)
→ [animations.md](specs/014-node-details-panel/design/animations.md)

---

## Phase 2: Implementation

### T003: Create NodeDetailsModal Component

- **Status**: [X] Completed
- **Executor**: fullstack-nextjs-specialist
- **Priority**: P1
- **Estimate**: 3 hours
- **Dependencies**: T002

**Subtasks:**

- [x] T003.1: Создать `NodeDetailsModal/index.tsx` - основной wrapper
- [x] T003.2: Создать `NodeDetailsHeader.tsx` - заголовок с названием, статусом, кнопкой закрытия
- [x] T003.3: Создать `NodeDetailsTabs.tsx` - навигация по вкладкам
- [x] T003.4: Интегрировать с useNodeSelection hook
- [x] T003.5: Добавить keyboard shortcuts (Escape, Tab)
- [x] T003.6: Добавить анимации framer-motion

**Artifacts:**
→ [NodeDetailsModal/index.tsx](packages/web/components/generation-graph/panels/NodeDetailsModal/index.tsx)
→ [NodeDetailsHeader.tsx](packages/web/components/generation-graph/panels/NodeDetailsModal/NodeDetailsHeader.tsx)
→ [NodeDetailsContent.tsx](packages/web/components/generation-graph/panels/NodeDetailsModal/NodeDetailsContent.tsx)
→ [NodeDetailsFooter.tsx](packages/web/components/generation-graph/panels/NodeDetailsModal/NodeDetailsFooter.tsx)

---

### T004: Implement JSON Viewer

- **Status**: [X] Completed
- **Executor**: fullstack-nextjs-specialist
- **Priority**: P1
- **Estimate**: 2 hours
- **Dependencies**: T002

**Subtasks:**

- [x] T004.1: Создать `JsonViewer.tsx` компонент
- [x] T004.2: Реализовать подсветку синтаксиса (без внешних зависимостей)
- [x] T004.3: Добавить кнопку "Copy to clipboard"
- [x] T004.4: Реализовать сворачивание/разворачивание секций
- [x] T004.5: Добавить поиск по JSON (Ctrl+F)
- [x] T004.6: Поддержка тёмной темы

**Artifacts:**
→ [JsonViewer.tsx](packages/web/components/generation-graph/panels/shared/JsonViewer.tsx)

---

### T005: Fix Data Loading

- **Status**: [X] Completed
- **Executor**: fullstack-nextjs-specialist
- **Priority**: P0
- **Estimate**: 2 hours
- **Dependencies**: T001

**Subtasks:**

- [x] T005.1: Исправить маппинг traces → node.data.attempts в useGraphData.ts
- [x] T005.2: Добавить loading state для InputTab/OutputTab
- [x] T005.3: Добавить fallback UI при отсутствии данных
- [x] T005.4: Проверить что все типы нод корректно передают данные

**Artifacts:**
→ [useGraphData.ts](packages/web/components/generation-graph/hooks/useGraphData.ts) (modified)

---

### T006: Redesign ProcessTab

- **Status**: [X] Completed
- **Executor**: nextjs-ui-designer
- **Priority**: P2
- **Estimate**: 1.5 hours
- **Dependencies**: T003

**Subtasks:**

- [x] T006.1: Создать `MetricCard.tsx` компонент
- [x] T006.2: Дизайн карточек метрик (Duration, Tokens, Cost, Model)
- [x] T006.3: Добавить иконки и форматирование чисел
- [x] T006.4: Добавить Quality Score progress bar
- [x] T006.5: Сравнение с предыдущими попытками (если есть)

**Artifacts:**
→ [MetricCard.tsx](packages/web/components/generation-graph/panels/shared/MetricCard.tsx)
→ [MetricsGrid.tsx](packages/web/components/generation-graph/panels/shared/MetricsGrid.tsx)
→ [ProcessTab.tsx](packages/web/components/generation-graph/panels/ProcessTab.tsx) (modified)

---

### T007: Fix ActivityTab Filtering

- **Status**: [X] Completed
- **Executor**: fullstack-nextjs-specialist
- **Priority**: P1
- **Estimate**: 1 hour
- **Dependencies**: T001

**Subtasks:**

- [x] T007.1: Исправить фильтрацию traces по nodeId
- [x] T007.2: Добавить показ всех релевантных traces для ноды
- [x] T007.3: Группировка по фазам
- [x] T007.4: Улучшить UI timeline

**Artifacts:**
→ [ActivityTab.tsx](packages/web/components/generation-graph/panels/ActivityTab.tsx) (modified)

---

### T008: Improve RefinementChat

- **Status**: [X] Completed
- **Executor**: fullstack-nextjs-specialist
- **Priority**: P2
- **Estimate**: 2 hours
- **Dependencies**: T003

**Subtasks:**

- [x] T008.1: Сделать чат всегда развёрнутым для AI-этапов (3, 4, 5, 6)
- [x] T008.2: Sticky footer позиционирование
- [x] T008.3: Markdown поддержка в сообщениях
- [x] T008.4: Улучшить QuickActions UI
- [x] T008.5: Проверить интеграцию с API refinement

**Artifacts:**
→ [RefinementChat.tsx](packages/web/components/generation-graph/panels/RefinementChat.tsx) (modified)
→ [QuickActions.tsx](packages/web/components/generation-graph/panels/QuickActions.tsx) (modified)

---

## Phase 3: Integration & Testing

### T009: Integration Testing

- **Status**: [X] Completed
- **Executor**: integration-tester
- **Priority**: P1
- **Estimate**: 2 hours
- **Dependencies**: T003, T004, T005, T007, T008

**Test Cases:**

- [x] T009.1: Открытие панели по двойному клику на stage node
- [x] T009.2: Открытие панели по двойному клику на document node
- [x] T009.3: Открытие панели по двойному клику на lesson node
- [x] T009.4: Загрузка данных input/output для каждого типа
- [x] T009.5: Переключение попыток (AttemptSelector)
- [x] T009.6: Отправка сообщения в чат
- [x] T009.7: Переключение тем (light/dark)
- [x] T009.8: Keyboard navigation (Escape, Tab)
- [x] T009.9: Responsive layout (Desktop, Tablet, Mobile)

**Artifacts:**
→ [node-details-modal.test.tsx](packages/web/tests/integration/node-details-modal.test.tsx)

---

### T010: Performance Optimization

- **Status**: [X] Completed
- **Executor**: performance-optimizer
- **Priority**: P2
- **Estimate**: 1 hour
- **Dependencies**: T009

**Subtasks:**

- [x] T010.1: Виртуализация для больших JSON (если > 1000 строк)
- [x] T010.2: Lazy loading вкладок
- [x] T010.3: Memo оптимизация компонентов
- [x] T010.4: Измерить время открытия панели (target: < 200ms)

**Artifacts:**
→ [performance-optimization-report.md](.tmp/current/performance-optimization-report.md)

---

## Summary

| Phase                | Tasks      | Priority | Status               |
| -------------------- | ---------- | -------- | -------------------- |
| 1. Research & Design | T001, T002 | P0       | ✅ Completed         |
| 2. Implementation    | T003-T008  | P0-P2    | ✅ Completed         |
| 3. Testing           | T009, T010 | P1-P2    | ✅ Completed         |
| **Total**            | 10 tasks   | -        | **✅ All Completed** |

## Key Changes Summary

### New Components Created:

- `NodeDetailsModal/` - Full-screen modal replacing narrow Sheet
- `JsonViewer.tsx` - Syntax-highlighted JSON viewer with collapsing
- `MetricCard.tsx` - Professional metric cards with variants
- `MetricsGrid.tsx` - Responsive grid for process metrics

### Fixed Issues:

- **Data Loading**: traces now properly map to node.data.attempts
- **ActivityTab**: filtering now works for all node types (doc*, lesson*, step\_)
- **RefinementChat**: optimistic UI updates, markdown support

### Performance:

- Modal open: < 200ms (measured)
- Large JSON: pagination for 1000+ items
- All components memoized

## Agents Used

| Agent                       | Tasks                        |
| --------------------------- | ---------------------------- |
| Claude (Explore)            | T001                         |
| nextjs-ui-designer          | T002, T006                   |
| fullstack-nextjs-specialist | T003, T004, T005, T007, T008 |
| integration-tester          | T009                         |
| performance-optimizer       | T010                         |
