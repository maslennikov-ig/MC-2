# Tasks: Stage 4-5 UI Redesign

**Spec**: [../SPEC-2025-12-05-stage4-stage5-ui-redesign.md](../SPEC-2025-12-05-stage4-stage5-ui-redesign.md)
**Created**: 2025-12-05
**Status**: In Progress

---

## Pre-requisites (Blockers)

### T0.1: AbortController для useRefinement

- [ ] Добавить AbortController в `useRefinement.ts`
- [ ] Отменять in-flight запросы при unmount
- [ ] Тест: unmount во время запроса не вызывает state update
- **Estimate**: 1h
- **File**: `packages/web/hooks/generation-graph/useRefinement.ts`

### T0.2: Zod валидация API responses на frontend

- [ ] Добавить Zod schema для generation router responses
- [ ] Валидировать responses перед использованием
- [ ] Graceful fallback при ошибке парсинга
- **Estimate**: 2h
- **Files**: `packages/web/lib/trpc/`, `packages/shared-types/`

---

## Phase 1: MVP (P0)

### T1: PhaseSelector с семантическими названиями [FR-001]

- [ ] Создать `phase-names.ts` с переводами Stage 4/5 фаз
- [ ] Создать `PhaseSelector.tsx` (заменяет AttemptSelector)
- [ ] Показывать название + описание вместо "Attempt 1, 2, 3"
- [ ] Интегрировать в OutputTab
- **Estimate**: 2h
- **Files**:
  - `packages/web/lib/generation-graph/phase-names.ts`
  - `packages/web/components/generation-graph/panels/PhaseSelector.tsx`

### T2: AnalysisResultView - базовое отображение Stage 4 [FR-002]

- [ ] Создать `AnalysisResultView.tsx`
- [ ] Отображать 6 секций в Accordion:
  - Классификация курса
  - Анализ темы
  - Рекомендуемая структура
  - Педагогическая стратегия
  - Рекомендации по генерации
  - Связь документов
- [ ] Skeleton loading для каждой секции
- [ ] Заменить JsonViewer для stage_4
- **Estimate**: 4h
- **Files**:
  - `packages/web/components/generation-graph/panels/output/AnalysisResultView.tsx`
  - `packages/web/components/generation-graph/panels/OutputTab.tsx`

### T3: CourseStructureView - базовое отображение Stage 5 [FR-002]

- [ ] Создать `CourseStructureView.tsx`
- [ ] Отображать структуру курса:
  - Метаданные (название, описание, аудитория)
  - Секции с уроками (tree view)
  - Цели обучения для каждого урока
- [ ] Skeleton loading
- [ ] Заменить JsonViewer для stage_5
- **Estimate**: 4h
- **Files**:
  - `packages/web/components/generation-graph/panels/output/CourseStructureView.tsx`
  - `packages/web/components/generation-graph/panels/OutputTab.tsx`

### T4: Авто-раскрытие Stage 4/5 + Zod parse traces [FR-005]

- [ ] Добавить авто-открытие Stage 4/5 при completed
- [ ] Zod parse для realtime trace данных
- [ ] Плавная анимация открытия drawer
- **Estimate**: 1h
- **Files**:
  - `packages/web/components/generation-graph/GraphView.tsx`
  - `packages/web/hooks/generation-graph/useNodeSelection.ts`

---

## Phase 2: Editing (P1)

### T5: EditableField компонент [FR-003]

- [ ] Создать `EditableField.tsx`
- [ ] Типы редакторов: text, textarea, number
- [ ] Hover-to-edit паттерн
- [ ] Кнопки редактирования и перегенерации
- **Estimate**: 3h
- **File**: `packages/web/components/generation-graph/panels/output/EditableField.tsx`

### T6: Автосохранение + SaveStatusIndicator [FR-003]

- [ ] Debounced save (1 секунда)
- [ ] Flush на blur
- [ ] Optimistic UI updates
- [ ] SaveStatusIndicator: Saving → Saved → (hidden)
- [ ] Интеграция с Sonner для toast
- **Estimate**: 3h
- **Files**:
  - `packages/web/components/generation-graph/panels/output/SaveStatusIndicator.tsx`
  - `packages/web/hooks/generation-graph/useAutoSave.ts`

### T7: API endpoint generation.updateField

- [ ] Создать `generation.updateField` mutation
- [ ] Обновление отдельного поля через lodash.set
- [ ] Пересчёт вычисляемых полей (duration, lesson_number)
- [ ] Валидация минимума 10 уроков
- **Estimate**: 2h
- **File**: `packages/course-gen-platform/src/server/routers/generation.ts`

### T8: EditableChips компонент [FR-003]

- [ ] Создать `EditableChips.tsx`
- [ ] Добавление/удаление chips
- [ ] Интеграция с EditableField
- **Estimate**: 2h
- **File**: `packages/web/components/generation-graph/panels/output/EditableChips.tsx`

---

## Phase 3: Regeneration (P2)

### T9: InlineRegenerateChat [FR-004]

- [ ] Создать `InlineRegenerateChat.tsx`
- [ ] Mini-chat под блоком при клике [🔄]
- [ ] Текстовое поле + Quick Actions
- [ ] Exponential backoff + jitter для retry
- [ ] XML-structured prompts (CARE framework)
- **Estimate**: 6h
- **Files**:
  - `packages/web/components/generation-graph/panels/output/InlineRegenerateChat.tsx`
  - `packages/web/hooks/generation-graph/useBlockRegeneration.ts`

### T10: API endpoint generation.regenerateBlock

- [ ] Создать `generation.regenerateBlock` mutation
- [ ] Интеграция с Smart Context Router
- [ ] XML prompt generation
- [ ] Structured JSON response parsing
- [ ] Bloom's level validation
- **Estimate**: 3h
- **File**: `packages/course-gen-platform/src/server/routers/generation.ts`

### T11: Smart Context Router (Tiered Strategy) [FR-007]

- [ ] Создать `smart-context-router.ts`
- [ ] Классификация запроса → Tier 1-4
- [ ] Context Assembler для каждого уровня
- [ ] Token budget allocation
- **Estimate**: 4h
- **Files**:
  - `packages/course-gen-platform/src/shared/regeneration/smart-context-router.ts`
  - `packages/course-gen-platform/src/shared/regeneration/context-assembler.ts`

### T12: Quick Actions с Bloom's validation [FR-004]

- [ ] Предустановленные действия (Упростить, Расширить, etc.)
- [ ] Bloom's level validation
- [ ] Создать `bloom-validator.ts`
- **Estimate**: 2h
- **Files**:
  - `packages/web/components/generation-graph/panels/output/QuickActions.tsx`
  - `packages/course-gen-platform/src/shared/regeneration/bloom-validator.ts`

### T13: Semantic Diffing UI [FR-010]

- [ ] Создать `SemanticDiff.tsx`
- [ ] Показать concepts added/removed
- [ ] Alignment Score display
- [ ] Bloom level preserved indicator
- [ ] Accept/Edit/Cancel actions
- [ ] Sentry logging для ошибок
- **Estimate**: 4h
- **Files**:
  - `packages/web/components/generation-graph/panels/output/SemanticDiff.tsx`
  - `packages/course-gen-platform/src/shared/regeneration/semantic-diff-generator.ts`

---

## Phase 4: Dependencies (P3)

### T14: Dependency Graph schema (Curriculum DAG) [FR-008]

- [ ] Определить типы связей (PARENT_OF, ALIGNS_TO, etc.)
- [ ] Схема хранения в JSONB
- [ ] API для получения зависимостей
- **Estimate**: 4h
- **Files**:
  - `packages/shared-types/src/curriculum-dag.ts`
  - `packages/course-gen-platform/src/server/routers/generation.ts`

### T15: Stale Data Indicators UI [FR-008]

- [ ] Создать `StaleDataIndicator.tsx`
- [ ] Визуальные индикаторы (green/yellow/red border)
- [ ] Tooltip с информацией об изменении
- [ ] Actions: Update/Ignore/Details
- **Estimate**: 3h
- **File**: `packages/web/components/generation-graph/panels/output/StaleDataIndicator.tsx`

### T16: Impact Analysis Modal [FR-009]

- [ ] Создать `ImpactAnalysisModal.tsx`
- [ ] Показать affected elements с counts
- [ ] 3 варианта действий (Update only / Update all / Review each)
- [ ] Danger zone styling для high-impact changes
- **Estimate**: 4h
- **File**: `packages/web/components/generation-graph/panels/output/ImpactAnalysisModal.tsx`

### T17: Graduated Warning System [FR-009]

- [ ] Low: inline toast + undo
- [ ] Medium: modal с affected items
- [ ] High: danger zone + typing confirmation
- **Estimate**: 2h
- **File**: `packages/web/hooks/generation-graph/useGraduatedWarnings.ts`

---

## Phase 5: Optimization (P4)

### T18: Context Caching [FR-007]

- [ ] Кэширование статического контекста (Style Guide, Audience, LO list)
- [ ] Инвалидация при изменениях
- [ ] Метрики экономии токенов
- **Estimate**: 3h
- **File**: `packages/course-gen-platform/src/shared/regeneration/context-cache.ts`

### T19: Virtualization для длинных списков

- [ ] react-window или @tanstack/react-virtual
- [ ] Для списков > 20 элементов
- [ ] Интеграция с CourseStructureView
- **Estimate**: 2h
- **File**: `packages/web/components/generation-graph/panels/output/VirtualizedList.tsx`

### T20: Undo/Redo для редактирования

- [ ] History stack для изменений
- [ ] Keyboard shortcuts (Ctrl+Z, Ctrl+Y)
- [ ] UI кнопки в toolbar
- **Estimate**: 3h
- **File**: `packages/web/hooks/generation-graph/useEditHistory.ts`

### T21: Keyboard shortcuts

- [ ] Tab navigation
- [ ] Enter для сохранения
- [ ] Escape для отмены
- [ ] Ctrl+S для force save
- **Estimate**: 2h
- **File**: `packages/web/hooks/generation-graph/useKeyboardShortcuts.ts`

---

## Summary

| Phase                  | Tasks        | Hours   |
| ---------------------- | ------------ | ------- |
| Pre-req                | T0.1-T0.2    | 3h      |
| Phase 1 (MVP)          | T1-T4        | 11h     |
| Phase 2 (Editing)      | T5-T8        | 10h     |
| Phase 3 (Regeneration) | T9-T13       | 19h     |
| Phase 4 (Dependencies) | T14-T17      | 13h     |
| Phase 5 (Optimization) | T18-T21      | 10h     |
| **Total**              | **23 tasks** | **66h** |

---

## Execution Order

```
T0.1 → T0.2 → T1 → T2 → T3 → T4 (Phase 1 complete)
     → T5 → T6 → T7 → T8 (Phase 2 complete)
     → T9 → T10 → T11 → T12 → T13 (Phase 3 complete)
     → T14 → T15 → T16 → T17 (Phase 4 complete)
     → T18 → T19 → T20 → T21 (Phase 5 complete)
```

---

## Notes

- **Computed fields**: При редактировании duration нужен пересчёт section/course duration
- **Lesson numbering**: При add/remove нужен пересчёт lesson_number
- **Min 10 lessons**: Блокировать удаление если останется < 10
- **Parallel opportunities**: T2 и T3 можно выполнять параллельно
