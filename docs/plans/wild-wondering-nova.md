# Fix: Stage 4 Budget Allocator should use Stage 3 document priorities

## Context

Stage 3 проводит LLM-турнирную классификацию документов, определяя CORE/IMPORTANT/SUPPLEMENTARY по **содержанию** (релевантности курсу). Результаты записываются в `file_catalog.priority` и `summary_metadata.classification.importance_score`.

Но `prepareDocumentInfos` в Stage 4 **полностью игнорирует** эти данные и назначает CORE **самому крупному** документу. Это приводит к:

- Неправильному CORE документу (большой != важный)
- Token overflow при загрузке полного текста большого неключевого документа

**Реальный пример** (курс `0b3af59d`): Stage 3 назначил CORE документу на 58K токенов, но Stage 4 (по размеру) назначил бы CORE документу на 287K → full_text → переполнение контекста.

## Plan

### Step 1: Extend types in `handler-helpers.ts`

**File:** `packages/course-gen-platform/src/stages/stage4-analysis/handler-helpers.ts`

- `SummaryMetadata` (line 273): добавить `classification?: { importance_score?: number }`
- `DocumentSummaryResult` (line 281): добавить `stage3_priority: 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY' | null` и `stage3_importance_score: number | null`

### Step 2: Update `fetchDocumentSummaries` query

**File:** тот же `handler-helpers.ts`, line 322

- Добавить `priority` в SELECT: `.select('id, original_name, filename, processed_content, summary_metadata, priority')`
- В маппинге: извлечь `doc.priority` → `stage3_priority`, `metadata?.classification?.importance_score` → `stage3_importance_score`

### Step 3: Rewrite `prepareDocumentInfos`

**File:** `packages/course-gen-platform/src/stages/stage4-analysis/orchestrator-helpers.ts`, line 355

- Изменить сигнатуру: принимать `DocumentSummaryResult[]` вместо `DocumentSummary[]`
- Проверить `hasStage3Priorities` (есть ли хоть один doc с `stage3_priority != null`)
- Если да → использовать Stage 3 приоритеты (валидировать ровно 1 CORE)
- Если нет → fallback на текущую эвристику по размеру (backward compat)
- Использовать `stage3_importance_score` для `importance_score` (fallback → `quality_score`)

### Step 4: Restructure `initializeAnalysis` caller

**File:** тот же `orchestrator-helpers.ts`, функция `initializeAnalysis`

- Перенести `originalDocumentSummaries` extraction (сейчас line 200) **до** вызова `prepareDocumentInfos` (line 151)
- Передать `originalDocumentSummaries` в `prepareDocumentInfos` вместо `input.document_summaries`
- Убрать дублирующее присвоение на line 200-202

### Step 5: Unit tests

**New file:** `tests/unit/stage4-prepare-document-infos.test.ts`

- С Stage 3 приоритетами: CORE по содержанию, не по размеру
- Без Stage 3 (backward compat): fallback на размерную эвристику
- Невалидные Stage 3 данные (0 или 2 CORE): fallback + warning
- Реальный сценарий: 58K CORE vs 287K IMPORTANT

## Files to Modify

| File                                    | Change                                              |
| --------------------------------------- | --------------------------------------------------- |
| `handler-helpers.ts`                    | Types + SELECT query                                |
| `orchestrator-helpers.ts`               | `prepareDocumentInfos` rewrite + caller restructure |
| `stage4-prepare-document-infos.test.ts` | New unit tests                                      |

## No Changes Needed

- `@megacampus/shared-types` — priority это деталь Stage 4
- `stage4-budget-allocator.ts` — `Stage4DocumentInfo` уже корректный тип
- DB schema — `file_catalog.priority` уже существует
- Stage 3 — уже корректно пишет данные

## Verification

1. `pnpm type-check` — компиляция
2. `vitest run 'stage4-prepare-document'` — новые тесты
3. `vitest run 'phase-05-clarifying'` — существующие тесты Phase 0.5
4. DB query: проверить что для курсов с Stage 3 данными CORE назначается по `file_catalog.priority`, а не по размеру
