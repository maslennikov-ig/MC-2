# Implementation Plan: Stage 4-5 UI Redesign

**Branch**: `016-stage45-ui-redesign` | **Date**: 2025-12-05 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/016-stage45-ui-redesign/spec.md`

## Summary

Редизайн интерфейса отображения результатов Stage 4 (Анализ) и Stage 5 (Генерация структуры) для создателей курсов. Замена технического JSON-интерфейса на человеко-понятное представление с возможностью inline-редактирования и AI-перегенерации отдельных блоков. Включает систему отслеживания зависимостей между элементами курса (Constructive Alignment) и token-based billing для AI-операций.

## Technical Context

**Language/Version**: TypeScript 5.3+ (Strict Mode)
**Primary Dependencies**: React 18+, Next.js 14+, tRPC 10.x, Zustand, react-virtuoso, lodash, Immer
**Storage**: PostgreSQL (Supabase) — JSONB поля `courses.analysis_result`, `courses.course_structure`
**Testing**: Vitest (unit), Playwright (e2e), pgTAP (database)
**Target Platform**: Web (Desktop-first, responsive)
**Project Type**: Monorepo (pnpm workspaces) — packages/web (frontend), packages/course-gen-platform (backend)
**Performance Goals**: <1s panel open, <5s field save, <10s block regeneration (p90)
**Constraints**: Token budget per regeneration (Tiered Context: 200-5000 tokens), virtualization для >20 секций/>15 уроков
**Scale/Scope**: Курсы до 100 уроков, 6 организаций (тестовый период)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. Context-First Architecture | ✅ PASS | ТЗ включает анализ существующих компонентов, patterns, архитектурные ограничения |
| II. Single Source of Truth | ✅ PASS | Типы в shared-types, phase-names.ts для локализации |
| III. Strict Type Safety | ✅ PASS | Zod schemas для API, TypeScript strict mode |
| IV. Atomic Evolution | ✅ PASS | 21 задача разбита по приоритетам P0-P4, /push после каждой |
| V. Quality Gates & Security | ✅ PASS | Owner-only authorization, Zod validation, type-check gate |
| VI. Library-First Development | ✅ PASS | react-virtuoso, lodash, Immer — production-ready библиотеки |
| VII. Task Tracking & Artifacts | ✅ PASS | tasks.md будет создан, artifacts в каждой задаче |

**Gate Result**: ✅ ALL PASS — proceed to Phase 0

## Prerequisites (Blocking Tasks)

> **CRITICAL**: Эти задачи ДОЛЖНЫ быть выполнены ДО начала основной разработки. Они исправляют production-readiness проблемы, выявленные при аудите.

| ID | Задача | Файл | Описание | Оценка |
|----|--------|------|----------|--------|
| T0.1 | AbortController в useRefinement | `packages/web/lib/hooks/useRefinement.ts` | Добавить abort signal для отмены запросов при unmount компонента. Предотвращает memory leaks и race conditions. | 1ч |
| T0.2 | Zod валидация API responses | Frontend tRPC calls | Валидировать API responses на frontend перед использованием. Защита от runtime errors при изменении backend. | 2ч |

**Итого prerequisites:** 3ч

**Почему это блокеры:**
- T0.1: Без AbortController при быстром переключении между нодами возможны race conditions и обновление unmounted компонентов
- T0.2: Новые API endpoints (updateField, regenerateBlock) требуют валидации responses для надёжной работы inline-редактирования

## Project Structure

### Documentation (this feature)

```text
specs/016-stage45-ui-redesign/
├── plan.md              # This file
├── spec.md              # Feature specification (complete)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── generation-api.ts
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
packages/web/
├── components/generation-graph/
│   ├── panels/
│   │   ├── OutputTab.tsx                    # MODIFY: условный рендер View компонентов
│   │   ├── PhaseSelector.tsx                # NEW: заменяет AttemptSelector
│   │   └── output/
│   │       ├── AnalysisResultView.tsx       # NEW: Stage 4 human-readable
│   │       ├── CourseStructureView.tsx      # NEW: Stage 5 human-readable
│   │       ├── EditableField.tsx            # NEW: inline edit с hover
│   │       ├── EditableChips.tsx            # NEW: add/remove chips
│   │       ├── InlineRegenerateChat.tsx     # NEW: mini-chat для блока
│   │       ├── PhaseAccordion.tsx           # NEW: Accordion wrapper
│   │       ├── SaveStatusIndicator.tsx      # NEW: saving/saved toast
│   │       ├── SemanticDiff.tsx             # NEW: conceptual diff
│   │       ├── StaleDataIndicator.tsx       # NEW: dependency status
│   │       └── ImpactAnalysisModal.tsx      # NEW: cascade warning
│   └── hooks/
│       └── useAutoSave.ts                   # NEW: debounced save hook
├── lib/generation-graph/
│   ├── phase-names.ts                       # NEW: RU/EN phase translations
│   └── translations.ts                      # MODIFY: add new strings

packages/course-gen-platform/
├── src/server/routers/
│   └── generation.ts                        # MODIFY: add updateField, regenerateBlock, getBlockDependencies, cascadeUpdate
├── src/shared/regeneration/
│   ├── smart-context-router.ts              # NEW: Tiered Context Strategy
│   ├── context-assembler.ts                 # NEW: context builder by tier
│   ├── bloom-validator.ts                   # NEW: Bloom's level validation
│   └── semantic-diff-generator.ts           # NEW: conceptual diff
└── src/stages/stage5-generation/utils/
    └── course-structure-editor.ts           # NEW: PATCH fields with recalculation

packages/shared-types/src/
├── regeneration-types.ts                    # NEW: RegenerationResponse, SemanticDiff, ContextTier
└── dependency-graph.ts                      # NEW: DependencyNode, DependencyEdge, StaleStatus
```

**Structure Decision**: Monorepo structure preserved. New components in `packages/web/components/generation-graph/panels/output/`. New backend logic in `packages/course-gen-platform/src/shared/regeneration/`. Shared types in `packages/shared-types/src/`.

## Complexity Tracking

> No Constitution violations requiring justification.

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Tiered Context Strategy | 4 tiers (Atomic, Local, Structural, Global) | Research-backed optimization for token budget |
| Dependency Graph | In-memory calculation, not DB table | Курсы небольшие (<100 уроков), пересчёт быстрый |
| Virtualization threshold | >20 sections, >15 lessons | Balance между overhead и performance gain |

## Risks & Mitigations

| Риск | Вероятность | Влияние | Митигация |
|------|-------------|---------|-----------|
| **Сложность парсинга вложенных JSONB** | Средняя | Высокое | Использовать `lodash.get/set` для безопасного доступа к nested paths. Zod валидация на каждом уровне. |
| **Перегрузка UI для больших курсов** | Средняя | Среднее | Virtualization (`react-virtuoso` GroupedVirtuoso) для списков >20 секций/>15 уроков. Lazy loading контента при раскрытии. |
| **Конфликты при одновременном редактировании** | Низкая | Высокое | Optimistic UI + Last-write-wins. В будущем: real-time sync через Supabase Realtime. |
| **LLM latency при перегенерации** | Высокая | Среднее | Streaming responses + skeleton loading. AbortController для отмены. Retry с exponential backoff. |
| **Token budget exceeded** | Средняя | Среднее | Tiered Context Strategy ограничивает токены. Frontend показывает estimate перед запросом. Soft warning при <10% баланса. |
| **Inconsistent Bloom's level после перегенерации** | Средняя | Среднее | LLM возвращает `bloom_level_preserved` flag. UI показывает warning если false. Валидация в semantic diff. |
| **Stale data indicators false positives** | Низкая | Низкое | Только LO-changes триггерят red indicator. Остальные изменения — yellow (рекомендация, не блокер). |

## Implementation Phases

| Фаза | Приоритет | Задачи | Описание |
|------|-----------|--------|----------|
| **Phase 0** | Prerequisites | T0.1-T0.2 | Production-readiness fixes (3ч) |
| **Phase 1** | P0 (MVP) | T1-T4 | Базовый UI: PhaseSelector, AnalysisResultView, CourseStructureView, авто-раскрытие (11ч) |
| **Phase 2** | P1 | T5-T8 | Редактирование: EditableField, autosave, API updateField, EditableChips (9ч) |
| **Phase 3** | P2 | T9-T13 | Перегенерация: InlineRegenerateChat, Smart Context Router, Quick Actions, Semantic Diff (17ч) |
| **Phase 4** | P3 | T14-T17 | Зависимости: Dependency Graph, Stale Indicators, Impact Analysis Modal (13ч) |
| **Phase 5** | P4 | T18-T21 | Оптимизация: Context Caching, Virtualization, Undo/Redo, Keyboard shortcuts (10ч) |

**Общая оценка:** 63ч (включая prerequisites)
