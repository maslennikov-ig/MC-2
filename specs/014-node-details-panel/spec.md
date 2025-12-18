# MBI-014: Node Details Panel Refactoring

## Overview

Рефакторинг панели детализации ноды, которая открывается при двойном клике на ноду в графе генерации курса. Текущая реализация имеет критические проблемы с UX, визуалом и функциональностью.

## Current State Analysis

### File Structure
```
packages/web/components/generation-graph/
├── panels/
│   ├── NodeDetailsDrawer.tsx    # Основной компонент (Sheet-based)
│   ├── InputTab.tsx             # Вкладка входных данных
│   ├── OutputTab.tsx            # Вкладка выходных данных
│   ├── ProcessTab.tsx           # Метрики процесса
│   ├── ActivityTab.tsx          # Лог активности
│   ├── RefinementChat.tsx       # Чат для уточнения
│   ├── QuickActions.tsx         # Быстрые действия для чата
│   ├── AttemptSelector.tsx      # Переключатель попыток
│   └── AdminPanel.tsx           # Админ-панель
├── hooks/
│   ├── useNodeSelection.ts      # Zustand store для выбора ноды
│   └── useRefinement.ts         # Хук для API refinement
└── controls/
    └── ApprovalControls.tsx     # Кнопки одобрения/отклонения
```

### Current Implementation Issues

#### 1. Visual Issues
- **Полупрозрачный фон** (`bg-muted/50`) - данные плохо читаются
- **Нет поддержки тёмной темы** - стили только для светлой
- **Узкая панель** - Sheet width 400-600px недостаточно для данных
- **Простой JSON вывод** - `JSON.stringify(data, null, 2)` без подсветки

#### 2. Data Loading Issues
- **"No input data available"** - данные attempts не всегда загружаются
- **"No output data available"** - outputData часто undefined
- **ActivityTab фильтрация** - возвращает пустой массив из-за неверного маппинга nodeId к traces

#### 3. UX Issues
- **Не на весь экран** - нельзя комфортно изучать большие объёмы данных
- **Нет возможности развернуть** - только фиксированная ширина
- **Чат сворачиваемый** - неочевидно, что есть возможность уточнить результат

### Current Data Flow
```
GraphView.tsx
    onNodeDoubleClick → useNodeSelection.selectNode(id)
                              ↓
NodeDetailsDrawer.tsx
    useNodeSelection() → selectedNodeId
    getNode(selectedNodeId) → node.data
                              ↓
    displayData = attempts[selectedAttemptNum] || data
                              ↓
    InputTab(inputData), OutputTab(outputData), ProcessTab(metrics)
```

### Data Structures

**TraceAttempt** (from shared-types):
```typescript
interface TraceAttempt {
  attemptNumber: number;
  timestamp: Date;
  inputData: Record<string, unknown>;
  outputData: Record<string, unknown>;
  processMetrics: ProcessMetrics;
  status: 'success' | 'failed';
  errorMessage?: string;
  refinementMessage?: string;
}
```

**ProcessMetrics**:
```typescript
interface ProcessMetrics {
  model: string;
  tokens: number;
  duration: number;
  cost: number;
  qualityScore?: number;
  wasCached?: boolean;
  temperature?: number;
}
```

---

## Requirements

### FR-001: Full-Screen Mode
Панель должна открываться на весь экран (как в n8n).

**Acceptance Criteria:**
- [ ] Полноэкранный режим по умолчанию при двойном клике
- [ ] Возможность свернуть в боковую панель (опционально)
- [ ] Клавиша Escape закрывает панель
- [ ] Кнопка закрытия в верхнем правом углу

### FR-002: Theme Support
Полная поддержка светлой и тёмной темы.

**Acceptance Criteria:**
- [ ] Дизайн для светлой темы
- [ ] Дизайн для тёмной темы
- [ ] Автоматическое переключение по системным настройкам
- [ ] Контрастность соответствует WCAG AA

### FR-003: Data Display
Корректное отображение всех данных ноды.

**Acceptance Criteria:**
- [ ] Входные данные (Input) с подсветкой синтаксиса JSON
- [ ] Выходные данные (Output) с подсветкой синтаксиса JSON
- [ ] Метрики процесса (Duration, Tokens, Cost, Model)
- [ ] История попыток с переключателем
- [ ] Лог активности с правильной фильтрацией

### FR-004: Refinement Chat
Рабочий чат для уточнения результатов.

**Acceptance Criteria:**
- [ ] Чат всегда видим для AI-этапов (3, 4, 5, 6)
- [ ] История сообщений сохраняется
- [ ] Quick Actions работают
- [ ] Индикатор загрузки при отправке
- [ ] Новая попытка создаётся после refinement

### FR-005: Responsive Layout
Адаптивная верстка для разных размеров экрана.

**Acceptance Criteria:**
- [ ] Desktop: трёхколоночный layout (Input | Process | Output)
- [ ] Tablet: двухколоночный layout
- [ ] Mobile: вертикальный layout с табами

---

## Design Reference

### n8n Style Guidelines
Референс: [n8n Node Details Panel](https://n8n.io)

**Key Elements:**
1. **Header**: Название ноды + иконка + статус + кнопка закрытия
2. **Tabs**: Input | Output | Settings | Execute (у нас: Input | Process | Output | Activity)
3. **Main Area**: JSON viewer с подсветкой и возможностью копирования
4. **Footer**: Чат / Quick Actions (если применимо)

### Color Palette

**Light Theme:**
```css
--bg-primary: #FFFFFF;
--bg-secondary: #F9FAFB;
--bg-code: #F3F4F6;
--border: #E5E7EB;
--text-primary: #111827;
--text-secondary: #6B7280;
--accent: #3B82F6;
```

**Dark Theme:**
```css
--bg-primary: #1F2937;
--bg-secondary: #111827;
--bg-code: #374151;
--border: #374151;
--text-primary: #F9FAFB;
--text-secondary: #9CA3AF;
--accent: #60A5FA;
```

---

## Tasks

### Phase 1: Research & Design

#### T001: Current State Audit
**Executor**: Claude
**Priority**: P0

Исследовать текущее состояние:
- Проверить почему данные не загружаются (traces → attempts mapping)
- Проверить работу RefinementChat
- Задокументировать все edge cases

**Files to analyze:**
- `packages/web/components/generation-graph/hooks/useGraphData.ts`
- `packages/web/components/generation-graph/panels/ActivityTab.tsx`
- `packages/web/components/generation-graph/hooks/useRefinement.ts`

#### T002: Design Mockups
**Executor**: nextjs-ui-designer
**Priority**: P0

Создать дизайн-макеты для:
1. Full-screen панель (Light theme)
2. Full-screen панель (Dark theme)
3. Компонент JSON viewer
4. Chat панель
5. Responsive варианты

**Output:**
- Figma-like описание компонентов
- CSS переменные для тем
- Анимации и переходы

### Phase 2: Implementation

#### T003: Create NodeDetailsModal Component
**Executor**: fullstack-nextjs-specialist
**Priority**: P1

Создать новый компонент `NodeDetailsModal.tsx`:
- Замена Sheet на полноэкранный Dialog/Modal
- Поддержка обеих тем
- Анимация открытия/закрытия

#### T004: Implement JSON Viewer
**Executor**: fullstack-nextjs-specialist
**Priority**: P1

Создать компонент `JsonViewer.tsx`:
- Подсветка синтаксиса (можно использовать `react-json-view-lite` или кастом)
- Копирование в буфер
- Сворачивание/разворачивание секций
- Поиск по JSON

#### T005: Fix Data Loading
**Executor**: fullstack-nextjs-specialist
**Priority**: P0

Исправить загрузку данных:
- Маппинг traces → node.data.attempts
- Fallback при отсутствии данных
- Loading состояния

**Files to modify:**
- `useGraphData.ts` - добавить attempts mapping
- `InputTab.tsx` - добавить loading state
- `OutputTab.tsx` - добавить loading state

#### T006: Redesign ProcessTab
**Executor**: nextjs-ui-designer
**Priority**: P2

Переработать отображение метрик:
- Карточки с иконками
- Красивые числа (форматирование)
- Progress bar для качества
- Сравнение с предыдущими попытками

#### T007: Fix ActivityTab Filtering
**Executor**: fullstack-nextjs-specialist
**Priority**: P1

Исправить фильтрацию активности:
- Корректный маппинг nodeId → trace
- Показывать все релевантные traces
- Группировка по фазам

#### T008: Improve RefinementChat
**Executor**: fullstack-nextjs-specialist
**Priority**: P2

Улучшить чат:
- Всегда развёрнут для AI-этапов
- Sticky footer
- Markdown поддержка в сообщениях
- Загрузка истории из БД

### Phase 3: Integration & Testing

#### T009: Integration Testing
**Executor**: integration-tester
**Priority**: P1

Тестирование:
- Открытие панели по двойному клику
- Загрузка данных для всех типов нод
- Работа чата
- Тема переключение
- Keyboard navigation

#### T010: Performance Optimization
**Executor**: performance-optimizer
**Priority**: P2

Оптимизация:
- Виртуализация для больших JSON
- Lazy loading вкладок
- Memo для предотвращения ререндеров

---

## Technical Implementation Notes

### New Component Structure
```
panels/
├── NodeDetailsModal/
│   ├── index.tsx                # Main modal wrapper
│   ├── NodeDetailsHeader.tsx    # Header with title, status, close
│   ├── NodeDetailsTabs.tsx      # Tab navigation
│   ├── NodeDetailsContent.tsx   # Main content area
│   └── NodeDetailsFooter.tsx    # Chat section
├── shared/
│   ├── JsonViewer.tsx           # Reusable JSON viewer
│   ├── MetricCard.tsx           # Single metric display
│   └── ActivityTimeline.tsx     # Timeline component
└── (legacy - to be removed)
    ├── NodeDetailsDrawer.tsx
    ├── InputTab.tsx
    ├── OutputTab.tsx
    └── ProcessTab.tsx
```

### Theme Implementation
```typescript
// lib/node-details-theme.ts
export const nodeDetailsTheme = {
  light: {
    modal: {
      bg: 'bg-white',
      border: 'border-gray-200',
    },
    header: {
      bg: 'bg-gray-50',
      text: 'text-gray-900',
    },
    code: {
      bg: 'bg-gray-100',
      text: 'text-gray-800',
      keyword: 'text-purple-600',
      string: 'text-green-600',
      number: 'text-blue-600',
    },
    chat: {
      userBg: 'bg-blue-500',
      assistantBg: 'bg-gray-100',
    },
  },
  dark: {
    modal: {
      bg: 'bg-gray-900',
      border: 'border-gray-700',
    },
    header: {
      bg: 'bg-gray-800',
      text: 'text-gray-100',
    },
    code: {
      bg: 'bg-gray-800',
      text: 'text-gray-200',
      keyword: 'text-purple-400',
      string: 'text-green-400',
      number: 'text-blue-400',
    },
    chat: {
      userBg: 'bg-blue-600',
      assistantBg: 'bg-gray-800',
    },
  },
};
```

### Keyboard Shortcuts
- `Escape` - закрыть панель
- `Tab` - переключение между вкладками
- `Ctrl+C` - копировать выделенное
- `Ctrl+F` - поиск в JSON

---

## Out of Scope

- Редактирование входных данных
- Экспорт данных в файл
- Сравнение двух попыток side-by-side
- Мобильное приложение

---

## Success Metrics

1. **Время до понимания данных** - пользователь должен понимать что произошло за < 5 секунд
2. **Читаемость** - JSON данные легко читаемы без скролла для типичных случаев
3. **Доступность** - работает keyboard navigation
4. **Performance** - открытие панели < 200ms

---

## Related Specs

- [013-n8n-graph-view](../013-n8n-graph-view/) - Graph visualization
- [012-celestial-redesign](../012-celestial-redesign/) - Overall design system

---

## Changelog

| Date       | Author | Change |
|------------|--------|--------|
| 2024-11-29 | Claude | Initial MBI creation |
