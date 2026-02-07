# Plan: Перестановка Phase 1 и Phase 0.5 в Stage 4

## Контекст

Stage 4 — многофазный анализ курса. Текущий порядок:

```
Phase 0 → Budget → Phase 0.5 (clarifying questions) → Phase 1 (classification) → Phase 2-5
```

Предлагаемый порядок:

```
Phase 0 → Budget → Phase 1 (classification) → Phase 0.5 (enriched questions) → Phase 2-5
```

**Проблема**: Phase 0.5 генерирует вопросы пользователю **вслепую** — без данных Phase 1. А Phase 1 выдаёт `information_completeness`, `missing_elements[]`, `key_concepts[]`, `course_category`, `complexity`. Если Phase 1 выполнится первой — вопросы станут значительно умнее и целенаправленнее.

**Дополнительно**: увеличить максимум вопросов с 14 до 20, с data-driven приоритизацией на основе Phase 1.

---

## Анализ рисков (исследование завершено)

### Вердикт: NET POSITIVE

| Аспект                      | Текущий (0.5→1)             | Новый (1→0.5)                                                    |
| --------------------------- | --------------------------- | ---------------------------------------------------------------- |
| Качество вопросов Phase 0.5 | Generic (только topic+docs) | **Data-driven** (+ missing_elements, completeness, key_concepts) |
| Качество Phase 1 output     | С clarifying context        | Без clarifying (~5-15% деградация, компенсируется Phase 3)       |
| Качество Phase 2-4          | С clarifying_answers        | С clarifying_answers (без изменений)                             |
| In-flight migration         | N/A                         | Безопасно (идемпотентность `hasExistingQuestions`)               |

**Почему потеря Phase 1 минимальна**: классификация (категория, keywords, complexity) определяется ТЕМОЙ и документами. System prompt Phase 1 даже не упоминает clarifying answers — это просто дополнительный текст в human message.

---

## План реализации

### Шаг 1: `orchestrator.ts`

**Файл**: `packages/course-gen-platform/src/stages/stage4-analysis/orchestrator.ts`

- Переместить блок Phase 1 (строки ~471-527) **ПЕРЕД** блок Phase 0.5 (строки ~330-457)
- Phase 1 больше НЕ получает `clarifying_answers` (убрать маппинг, строки 491-497)
- Phase 0.5 получает новый параметр `phase1_output` из результата Phase 1
- `clarifyingAnswers` retrieval (строка 460) остаётся ПОСЛЕ Phase 0.5, перед Phase 2
- Обновить docstring в начале файла

**Новый порядок вызовов**:

```
1. Phase 0: pre-flight
2. Budget allocation
3. Phase 1: classification (БЕЗ clarifying_answers)
4. Phase 0.5: clarifying questions (С phase1_output)
5. Collect clarifyingAnswers
6. Phase 2-5: analysis phases (С clarifying_answers)
```

### Шаг 2: `phase-0.5-clarifying.ts`

**Файл**: `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-0.5-clarifying.ts`

**2a. Phase05InputSchema** (строки ~137-166):

- Добавить `phase1_output?: Phase1Output` (optional для backward compatibility)

**2b. buildClarifyingPrompt()** (строки ~257-340):

- Добавить секцию "PRELIMINARY ANALYSIS" в HumanMessage перед document context:

```
PRELIMINARY ANALYSIS (from Phase 1 Classification):
- Course Category: {course_category.primary} (confidence: {confidence})
- Topic Complexity: {complexity}
- Information Completeness: {information_completeness}%
- Key Concepts Already Identified: {key_concepts[]}
- MISSING ELEMENTS (prioritize questions about these): {missing_elements[]}

PRIORITY GUIDANCE based on completeness:
- Completeness < 50%: Focus on CRITICAL questions filling major gaps
- Completeness 50-80%: Balance IMPORTANT questions across categories
- Completeness > 80%: Mostly NICE_TO_HAVE refinement questions
```

**2c. Лимит вопросов**:

- Увеличить с "3-14" до "3-20" в system prompt (строка 289)
- Добавить hint: "Generate fewer questions if information is sufficient. Generate more (up to 20) when many gaps exist."
- Обеспечить разнообразие категорий в разных приоритетах

### Шаг 3: `validators.ts`

**Файл**: `packages/course-gen-platform/src/stages/stage4-analysis/utils/validators.ts`

Обновить PROGRESS_RANGES:

```typescript
step_1: { start: 12, end: 25 },   // было 10-20 (Phase 1 теперь первая)
step_0_5: { start: 25, end: 28 }, // было нет (Phase 0.5 теперь вторая)
step_2: { start: 28, end: 45 },   // было 20-35
// step_3, step_4, step_6, step_5 — без изменений
```

### Шаг 4: `README.md`

**Файл**: `packages/course-gen-platform/src/stages/stage4-analysis/README.md`

Обновить диаграмму Phase Pipeline с новым порядком.

### Шаг 5: Валидация в `phase-0.5-clarifying.ts`

- `validateQuestionTypeSuggestions()` — обновить max count validation если нужно (строки ~359-369)
- Проверить что `ClarifyingQuestion` zod schema поддерживает до 20 вопросов

---

## Файлы для модификации (полные пути)

1. `packages/course-gen-platform/src/stages/stage4-analysis/orchestrator.ts`
2. `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-0.5-clarifying.ts`
3. `packages/course-gen-platform/src/stages/stage4-analysis/utils/validators.ts`
4. `packages/course-gen-platform/src/stages/stage4-analysis/README.md`

## Существующие утилиты для переиспользования

- `Phase1Output` type — `shared-types/src/analysis-schemas.ts` (Phase1OutputSchema)
- `extractAnswerString()` — `phase-0.5-clarifying.ts:175-183`
- `executePhaseWithRetry()` — `orchestrator.ts:107-159`
- `startPhase() / completePhase()` — `validators.ts`

---

## Проверка

1. `pnpm type-check` — все пакеты
2. `pnpm --filter @megacampus/course-gen-platform test` — юнит-тесты Stage 4
3. Ручной тест: создать курс → убедиться Phase 1 выполняется ДО появления вопросов
4. Проверить логи: Phase 1 log entries должны предшествовать Phase 0.5
