# Plan: Полное удаление `pedagogical_patterns`

## Контекст

Поле `pedagogical_patterns` (Phase 1) — over-engineering:

- `primary_strategy` (enum) дублирует `pedagogical_strategy.progression_logic` (Phase 3, free text)
- `key_patterns` (string[]) дублирует `generation_guidance.exercise_types` (Phase 4)
- `theory_practice_ratio` ("30:70") — декоративный сигнал, LLM не может enforceить пропорцию

Цена: ~200 строк инфраструктуры, 55 файлов упоминаний, путаница в именовании.
Обратная совместимость не нужна — проект в разработке.

---

## Изменения по файлам

### Группа 1: shared-types (типы и схемы)

#### 1.1 `packages/shared-types/src/analysis-schemas.ts`

| Строки  | Действие                                                                                   |
| ------- | ------------------------------------------------------------------------------------------ |
| 338-351 | **Удалить** `PedagogicalPatternsSchema` (Zod-схема + комментарий)                          |
| 387     | **Удалить** `pedagogical_patterns: PedagogicalPatternsSchema,` из `Phase1OutputSchema`     |
| 568     | **Удалить** `pedagogical_patterns: PedagogicalPatternsSchema,` из `AnalysisResultSchema`   |
| 604     | **Удалить** `export type PedagogicalPatterns = z.infer<typeof PedagogicalPatternsSchema>;` |

#### 1.2 `packages/shared-types/src/analysis-result.ts`

| Строки  | Действие                                                                          |
| ------- | --------------------------------------------------------------------------------- |
| 74-83   | **Удалить** `pedagogical_patterns` из интерфейса `AnalysisResult` (вложенный тип) |
| 213-222 | **Удалить** `pedagogical_patterns` из интерфейса `Phase1Output` (вложенный тип)   |

#### 1.3 `packages/shared-types/src/regeneration-types.ts`

| Строки | Действие                                                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| 73-75  | **Удалить** 3 строки из `STAGE4_EDITABLE_FIELDS`: `pedagogical_patterns.primary_strategy`, `.theory_practice_ratio`, `.key_patterns` |

#### 1.4 `packages/shared-types/tests/analysis-schemas.test.ts`

| Действие                                                                            |
| ----------------------------------------------------------------------------------- |
| **Удалить** import `PedagogicalPatternsSchema` (строка 11)                          |
| **Удалить** функцию `createValidPedagogicalPatterns()` (строки ~16-25)              |
| **Удалить** весь `describe('PedagogicalPatternsSchema', ...)` блок (~строки 42-184) |

---

### Группа 2: Stage 4 Analysis (backend pipeline)

#### 2.1 `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-1-classifier.ts`

| Строка | Действие                                                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| 89     | **Удалить** `- theory_practice_ratio: Format "XX:YY" where XX+YY=100 (e.g., "30:70", "50:50", "70:30")` из `FIELD FORMATS` в промпте |

> Примечание: `Phase1OutputSchema` передаётся через `zodToPromptSchema()` — удаление поля из схемы (1.1) автоматически уберёт его из LLM промпта. Строка 89 — дополнительная подсказка формата.

#### 2.2 `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-0.5-clarifying.ts`

| Строки  | Действие                                                                                                                                                                                               |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 258     | **Убрать** `pedagogical_patterns` из деструктуризации: `const { course_category, topic_analysis, pedagogical_patterns } = phase1Output;` → `const { course_category, topic_analysis } = phase1Output;` |
| 281-284 | **Удалить** блок `if (pedagogical_patterns) { ... }` (2 push-строки + if)                                                                                                                              |

#### 2.3 `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-5-assembly.ts`

| Строки  | Действие                                                                                          |
| ------- | ------------------------------------------------------------------------------------------------- |
| 246     | **Удалить** `pedagogical_patterns: input.phase1_output.pedagogical_patterns,` из объекта `result` |
| 302     | **Удалить** `* - pedagogical_patterns (optional)` из JSDoc                                        |
| 365-368 | **Удалить** блок `if (result.pedagogical_patterns) { validatePedagogicalPatterns(...) }`          |
| 384-432 | **Удалить** функцию `validatePedagogicalPatterns()` целиком (~48 строк)                           |

#### 2.4 `packages/course-gen-platform/src/stages/stage4-analysis/orchestrator.ts`

| Строки  | Действие                                                                                    |
| ------- | ------------------------------------------------------------------------------------------- |
| 440-449 | **Удалить** блок `if (phase1Output.pedagogical_patterns) { orchestrationLogger.info(...) }` |
| 804     | **Удалить** `hasPedagogicalPatterns: !!phase1Output.pedagogical_patterns,` из trace log     |
| 808     | **Удалить** `pedagogical_patterns: phase1Output.pedagogical_patterns,` из trace log         |
| 917     | **Убрать** `'pedagogical_patterns'` из массива `parameterTypes`                             |
| 921     | **Удалить** `pedagogical_patterns: analysisResult.pedagogical_patterns,` из parameter store |

#### 2.5 `packages/course-gen-platform/src/stages/stage4-analysis/README.md`

| Строки | Действие                                                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 78     | **Удалить** `- \`pedagogical_patterns\`: (Optional) Teaching patterns for category` из Phase 1 Output                                       |
| 163    | **Удалить** `5. Validate optional fields (pedagogical_patterns, generation_guidance)` → `5. Validate optional fields (generation_guidance)` |
| 237    | **Удалить** `pedagogical_patterns?: PedagogicalPatterns;` из AnalysisResult interface                                                       |

---

### Группа 3: Stage 5 Generation

#### 3.1 `packages/course-gen-platform/src/stages/stage5-generation/utils/analysis-formatters.ts`

| Строки  | Действие                                                                             |
| ------- | ------------------------------------------------------------------------------------ |
| 131-153 | **Удалить** функцию `formatPedagogicalPatternsForPrompt()` целиком (JSDoc + функция) |

#### 3.2 `packages/course-gen-platform/src/stages/stage5-generation/utils/section-batch/prompt-builder.ts`

| Строки  | Действие                                                                                                       |
| ------- | -------------------------------------------------------------------------------------------------------------- |
| 139     | **Удалить** `const patterns = formatPedagogicalPatternsForPrompt(input.analysis_result.pedagogical_patterns);` |
| 150-151 | **Удалить** `**Pedagogical Patterns**:\n${patterns}\n` из промпта                                              |
| import  | **Удалить** `formatPedagogicalPatternsForPrompt` из import                                                     |

---

### Группа 4: Shared утилиты

#### 4.1 `packages/course-gen-platform/src/shared/utils/structure-normalizer.ts`

| Строки  | Действие                                                                                                                                                                            |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 49-58   | **Удалить** `VALID_STRATEGIES` константу                                                                                                                                            |
| 105-113 | **Удалить** field variants для pedagogical_patterns (`strategy`, `primaryStrategy`, `teaching_strategy`, `ratio`, `theoryPracticeRatio`, `theory_ratio`, `patterns`, `keyPatterns`) |
| 344-383 | **Удалить** функцию `normalizePedagogicalPatterns()` целиком (~40 строк)                                                                                                            |
| 468     | **Удалить** вызов `data = normalizePedagogicalPatterns(data);`                                                                                                                      |

#### 4.2 `packages/course-gen-platform/src/shared/utils/field-name-fix.ts`

| Строки  | Действие                                                                                                                                |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 126-131 | **Удалить** блок `// Stage 4 Analysis - Pedagogical patterns (Phase 1 enhancement)` (6 строк: комментарий + 4 маппинга + пустая строка) |

---

### Группа 5: Тесты

#### 5.1 `packages/course-gen-platform/tests/fixtures/analysis-result-fixture.ts`

| Строки  | Действие                                                       |
| ------- | -------------------------------------------------------------- |
| 19      | **Удалить** `*   1. pedagogical_patterns (REQUIRED)` из JSDoc  |
| 121-130 | **Удалить** объект `pedagogical_patterns: { ... }` из фикстуры |

#### 5.2 `packages/course-gen-platform/tests/integration/analysis-pipeline-enhanced.test.ts`

| Действие                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------ |
| **Удалить** строки 84-90: `pedagogical_patterns` из `getMockPhase1Output()`                                                          |
| **Удалить** строки 101-105: `getMockPhase1OutputLegacy()` (весь helper — его единственное отличие — отсутствие pedagogical_patterns) |
| **Удалить** тест "Test 1: should generate analysis with pedagogical_patterns" (~строки 422-452)                                      |
| **Обновить** тест "Test 5: backward compatibility" (~строки 601-630) — убрать ссылки на pedagogical_patterns                         |
| **Удалить** тест "Test 10: theory_practice_ratio validation" (~строки 790-815)                                                       |
| **Удалить** тесты validation (строки ~968, 998) — invalid ratio tests                                                                |
| **Обновить** остальные тесты: убрать `expect(result.pedagogical_patterns)` assertions                                                |

#### 5.3 `packages/course-gen-platform/src/stages/stage4-analysis/__tests__/backward-compat.test.ts`

| Действие                                                                                               |
| ------------------------------------------------------------------------------------------------------ |
| **Удалить** `pedagogical_patterns` из mock fixtures (строки 215, 232-237)                              |
| **Удалить** все assertions на `pedagogical_patterns` (строки 363, 414-421, 433-434, 571, 612-620, 630) |
| **Удалить** "Test 6: Invalid pedagogical_patterns structure fails validation" (весь describe-блок)     |

#### 5.4 `packages/course-gen-platform/src/stages/stage5-generation/__tests__/analysis-formatters.test.ts`

| Действие                                                                                                 |
| -------------------------------------------------------------------------------------------------------- |
| **Удалить** import `formatPedagogicalPatternsForPrompt` (строка 26)                                      |
| **Удалить** `pedagogical_patterns` из mock fixture (строка 76)                                           |
| **Удалить** весь `describe('formatPedagogicalPatternsForPrompt', ...)` блок (строки ~495-585, ~8 тестов) |
| **Обновить** JSDoc: убрать "4. formatPedagogicalPatternsForPrompt (8 tests)" из списка                   |

#### 5.5 `packages/course-gen-platform/tests/unit/regeneration/dependency-graph-builder.test.ts`

| Строка | Действие                                            |
| ------ | --------------------------------------------------- |
| 55     | **Удалить** `pedagogical_patterns: { ... }` из mock |

#### 5.6 `packages/course-gen-platform/tests/unit/regeneration/context-assembler.test.ts`

| Строка | Действие                                            |
| ------ | --------------------------------------------------- |
| 57     | **Удалить** `pedagogical_patterns: { ... }` из mock |

---

### Группа 6: Frontend (web)

#### 6.1 `packages/web/components/generation-graph/panels/output/AnalysisResultView.tsx`

| Строки  | Действие                                                                                                                                  |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 92-96   | **Удалить** 5 i18n ключей (ru): `pedagogicalPatterns`, `pedagogicalPatternsDesc`, `primaryStrategy`, `theoryPracticeRatio`, `keyPatterns` |
| 137-141 | **Удалить** 5 i18n ключей (en): те же                                                                                                     |
| 560-629 | **Удалить** весь `{/* 5. Pedagogical Patterns */}` accordion section (~70 строк)                                                          |

#### 6.2 `packages/web/components/generation-graph/panels/output/types.ts`

| Строки | Действие                                                                       |
| ------ | ------------------------------------------------------------------------------ |
| 97-114 | **Удалить** 3 field metadata записи для `pedagogical_patterns.*` + комментарий |

---

## Порядок выполнения

1. **Группа 1** (shared-types) — первая, т.к. от неё зависят остальные
2. `pnpm --filter @megacampus/shared-types build` — перестроить типы
3. **Группы 2-6** — параллельно (независимы друг от друга)
4. **Проверка**

## Проверка

1. `pnpm --filter @megacampus/shared-types build` — типы собираются
2. `pnpm type-check` — все 3 пакета проходят type-check
3. `pnpm --filter @megacampus/course-gen-platform exec vitest run tests/unit/stages/stage4/` — Stage 4 тесты
4. `pnpm --filter @megacampus/course-gen-platform exec vitest run tests/unit/stages/stage5/` — Stage 5 тесты
5. `pnpm --filter @megacampus/course-gen-platform exec vitest run tests/integration/analysis-pipeline` — integration тесты
6. `pnpm --filter @megacampus/shared-types exec vitest run` — shared-types тесты
7. `pnpm build` — полная сборка

## Итого

- **~20 файлов** модифицируются
- **~400 строк** удаляются
- **0 строк** добавляются (чистое удаление)
- **0 миграций** БД (JSONB поле просто игнорируется)
