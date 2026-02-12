# План: Оптимизация LLM-генерируемых полей (по результатам аудита)

## Контекст

Проведён аудит всех полей, генерируемых LLM на стадиях 2-6. Обнаружено, что ~25-35% данных стадий 4-5 не используются ни в downstream стадиях, ни в UI. Обсуждены с пользователем ценность и назначение каждого поля. Ниже — согласованный план действий.

Ссылка на полный аудит: обсуждение в текущей сессии + предыдущий документ.

---

## Группа A: Немедленная реализация (UI-улучшения)

### A1. Показать `classification_rationale` в Stage 3 UI

**Beads task**: `feature`, priority 2, labels: `frontend`, `nextjs`
**Субагент**: `nextjs-ui-designer`

**Что делаем**: Добавить краткое отображение rationale для каждого документа в таблице приоритетов Stage 3.

**Контекст реализации**:

- `classification_rationale` уже есть в БД (`document_priorities` таблица) и в типах (`Stage3Classification.rationale`)
- `PrioritizationView.tsx` запрашивает `file_catalog` но НЕ делает JOIN с `document_priorities`
- Нужно: добавить JOIN, взять `classification_rationale`, показать в expandable row или tooltip
- Формат: кратко, тезисно (2-3 строки макс). Если текст длинный — truncate с expand
- Паттерн: `Accordion` уже используется в Stage3ActivityTab (тот же import)

**Файлы**:

- `packages/web/components/generation-graph/panels/output/PrioritizationView.tsx` — добавить JOIN + display
- `packages/web/messages/ru/generation.json` — translations
- `packages/web/messages/en/generation.json` — translations

---

### A2. Показать `pedagogical_patterns` в Stage 4 UI + сделать редактируемым

**Beads task**: `feature`, priority 2, labels: `frontend`, `nextjs`
**Субагент**: `nextjs-ui-designer`

**Что делаем**: Добавить новую секцию accordion в `AnalysisResultView` для `pedagogical_patterns`.

**Контекст реализации**:

- `pedagogical_patterns` используется в Stage 5 для генерации структуры, но пользователь не видит и не может редактировать
- Тип уже определён в `analysis-result.ts`: `{ primary_strategy, theory_practice_ratio, key_patterns }`
- Zod-схема уже есть в `analysis-schemas.ts`: `PedagogicalPatternsSchema`
- В `AnalysisResultView.tsx` (строки 326-636) уже 6 секций accordion — добавить 7-ю
- `EditableField` поддерживает type: `select` (для primary_strategy), `text` (для ratio), и `EditableChips` для key_patterns

**Поля**:

- `primary_strategy` — select: `problem-based learning`, `lecture-based`, `inquiry-based`, `project-based`, `mixed`
- `theory_practice_ratio` — text: формат "30:70"
- `key_patterns` — chips: массив строк

**Файлы**:

- `packages/web/components/generation-graph/panels/output/AnalysisResultView.tsx` — новая секция accordion
- `packages/web/components/generation-graph/panels/output/types.ts` — ANALYSIS_RESULT_FIELDS registry
- `packages/web/messages/ru/generation.json` — translations
- `packages/web/messages/en/generation.json` — translations

---

## Группа B: Исследование + решение (требуют анализа перед имплементацией)

### B1. `content_strategy` — исследовать конфликт с UI course style, вероятно удалить

**Beads task**: `chore`, priority 2, labels: `pipeline`, `stages`

**Проблема**: `content_strategy` (create_from_scratch / expand_and_enhance / optimize_existing) генерируется LLM в Phase 4, но конфликтует со стилем курса, который пользователь выбирает в UI (course_style). Пользователь: "это скорее даже вред наносит и вводит в заблуждение систему".

**Действия**:

1. Найти все промпты, где `content_strategy` передаётся в LLM (Stage 5, Stage 6)
2. Проверить, не дублирует ли он `course_style` (из UI)
3. Если конфликтует — удалить из промптов, схем, генерации
4. Единственный источник стилистики контента — `course_style` из UI

**Файлы для исследования**:

- `packages/course-gen-platform/src/stages/stage4-analysis/` — где генерируется
- `packages/course-gen-platform/src/stages/stage5-generation/` — где потребляется
- `packages/course-gen-platform/src/stages/stage6-content/` — где потребляется
- `packages/shared-types/src/analysis-schemas.ts` — схема
- `packages/shared-types/src/analysis-result.ts` — тип

---

### B2. Переставить Phase 1 перед Phase 0.5 — информированные clarifying questions

**Beads task**: `feature`, priority 1 (HIGH), labels: `pipeline`, `stages`
**Субагент**: `stage-pipeline-specialist`

**Ценность**: `information_completeness` и `missing_elements` генерируются в **Phase 1** (классификация). Если поменять местами Phase 0.5 и Phase 1, вопросы к пользователю будут информированы данными анализа.

**Текущий порядок**:

```
Phase 0 → Budget → Phase 0.5 (вопросы) → Phase 1 → Phase 2 → ... → Phase 5
```

**Новый порядок**:

```
Phase 0 → Budget → Phase 1 → Phase 0.5 (вопросы + Phase 1 data) → Phase 2 → ... → Phase 5
```

**Что получает Phase 0.5 от Phase 1**:

- `information_completeness` (0-100%) — насколько полно документы покрывают тему
- `missing_elements[]` — что конкретно не хватает
- `key_concepts[]` — ключевые концепции (для более точных вопросов)
- `complexity` (narrow/medium/broad) — масштаб темы
- `course_category.primary` — категория курса

**Компромиссы**:

- Phase 1 не получит `clarifying_answers` (но они опциональны — Phase 1 классифицирует тему, не предпочтения)
- Пользователь ждёт ~30-60с дольше до появления вопросов (Phase 1 сначала)
- Phase 2-4 по-прежнему получают ответы (без изменений)

**Реализация**:

1. В `orchestrator.ts` переставить вызов Phase 1 до Phase 0.5
2. Расширить input Phase 0.5: добавить `phase1Output` (опциональный)
3. В промпте Phase 0.5 использовать `missing_elements` для генерации вопросов типа:
   - "Документы не содержат информации о [missing_element]. Важно ли включить это в курс?"
   - "Полнота покрытия темы: X%. Какие аспекты приоритетнее?"
4. Параллельно — показать `information_completeness` и `missing_elements` в UI Stage 4 (AnalysisResultView)

**Файлы**:

- `packages/course-gen-platform/src/stages/stage4-analysis/orchestrator.ts` — порядок фаз (~строки 331-570)
- `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-0.5-clarifying.ts` — input + промпт
- `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-1-classifier.ts` — убрать clarifying_answers из required
- `packages/web/components/generation-graph/panels/output/AnalysisResultView.tsx` — показать completeness в UI

---

### B3. `practical_exercises[]` — исследовать: Stage 6 или Enrichments

**Beads task**: `chore`, priority 2, labels: `pipeline`, `stages`

**Факт**: По 3-5 объектов practical_exercises на каждый урок (exercise_type, title, description), генерируются LLM в Stage 5, но Stage 6 их полностью игнорирует. Это ~20-30% выходных токенов Stage 5.

**Вопросы для исследования**:

1. Стоит ли передавать exercises в Stage 6 для включения в контент?
2. Или убрать из Stage 5 и перенести в отдельную фазу Enrichments (после Stage 6)?
3. Оценить экономию токенов при удалении из Stage 5

**Зависимость**: От решения B3 зависит B5 (assessment_strategy).

**Файлы**:

- `packages/course-gen-platform/src/stages/stage5-generation/` — где генерируется
- `packages/course-gen-platform/src/stages/stage6-content/` — где НЕ потребляется
- `packages/shared-types/src/analysis-schemas.ts` — CourseStructureSchema

---

### B4. `learning_outcomes` (Bloom's Taxonomy RT-006) — тестировать стоимость

**Beads task**: `chore`, priority 2, labels: `pipeline`, `stages`

**Факт**: learning_outcomes генерируются со сложной валидацией Bloom's Taxonomy (RT-006, ~165 глаголов по когнитивным уровням). Не используются в Stage 6. Вопрос — стоит ли упрощать до string[].

**Действия**:

1. Замерить токены на Bloom's валидацию vs простые строки
2. Проверить, не возникают ли галлюцинации при сложной валидации (LLM пытается соответствовать формату)
3. Если экономия значительная — упростить

**Файлы**:

- `packages/shared-types/src/analysis-schemas.ts` — LearningObjectiveSchema, RT-006
- `packages/course-gen-platform/src/stages/stage5-generation/` — промпты генерации

---

### B5. `assessment_strategy` — исследовать (связано с B3)

**Beads task**: `chore`, priority 3, labels: `pipeline`, `stages`
**Блокируется**: B3 (practical_exercises)

**Факт**: assessment_strategy (quiz_per_section, final_exam, etc.) генерируется в Stage 5, не используется Stage 6. Уже удалили `assessment_types` (коммит e30c54bf).

**Действие**: Дождаться решения по B3 (practical_exercises). Если exercises переносятся в Enrichments — assessment_strategy тоже переносится или удаляется.

---

### B6. `expansion_areas[]` + `research_flags[]` — исследовать и решить

**Beads task**: `chore`, priority 3, labels: `pipeline`, `stages`

**Факт**: Оба массива генерируются в Stage 4, не используются нигде. Потенциальная ценность:

- `expansion_areas` — темы для расширения курса (можно использовать в Enrichments или предложить пользователю)
- `research_flags` — области, требующие проверки фактов (можно использовать для factual accuracy в Stage 6)

**Действия**:

1. Оценить качество генерируемых данных (посмотреть реальные примеры из БД)
2. Если quality высокое — показать в UI или передать в Stage 6
3. Если quality низкое — удалить из промптов

---

### B7. `sections_breakdown[]` sub-fields — исследовать применимость

**Beads task**: `chore`, priority 3, labels: `pipeline`, `stages`

**Поля**: `importance`, `pedagogical_approach`, `difficulty_progression`, `estimated_duration_hours`, `difficulty`, `prerequisites`

**Потенциальная ценность**: Могут использоваться для adaptive learning paths (персонализация по уровню студента). Сейчас не используются нигде.

**Действия**:

1. Проверить, есть ли планы на adaptive paths
2. Если нет — удалить из промптов для экономии токенов
3. Если да — определить формат и начать использовать

---

## Порядок выполнения

```
Волна 1 (параллельно):
├── A1: classification_rationale в UI (nextjs-ui-designer)
├── A2: pedagogical_patterns в UI (nextjs-ui-designer)
├── B1: content_strategy исследование (stage-pipeline-specialist)
└── B2: Phase 1↔0.5 swap (stage-pipeline-specialist) ← HIGH PRIORITY

Волна 2 (после B2):
├── B3: practical_exercises (research)
├── B4: learning_outcomes Bloom's (research)

После B3:
├── B5: assessment_strategy (зависит от B3)

Волна 3:
├── B6: expansion_areas + research_flags (research)
└── B7: sections_breakdown sub-fields (research)
```

---

## Верификация

### Для A1 (classification_rationale):

1. `pnpm type-check` — проходит
2. Открыть Stage 3 Output tab для курса с завершённой классификацией
3. Каждый документ показывает rationale (кратко, тезисно)

### Для A2 (pedagogical_patterns):

1. `pnpm type-check` — проходит
2. Открыть Stage 4 Output tab для курса с завершённым анализом
3. Новая секция accordion "Педагогические паттерны" видна
4. В режиме редактирования поля primary_strategy, theory_practice_ratio, key_patterns редактируемы
5. Изменения сохраняются через auto-save

### Для B1 (content_strategy):

1. Документировать все места использования
2. Подтвердить конфликт с course_style
3. PR с удалением (если подтверждён конфликт)
