# Plan: Исправление системных проблем качества генерации контента

## Context

Тестер обнаружил 10 повторяющихся проблем в курсе "Создание и развитие корпоративных социальных сетей" (slug: `cozdanie-i-razvitie-korporativnyh-sotsial-nyh-setey`). Курс для HR/коммуникационных менеджеров, НЕ для разработчиков. Эти же проблемы встречаются и в других курсах.

**Ключевой вопрос**: почему существующие проверки (self-reviewer, heuristic filters, Judge cascade, CLEV voting) не ловят эти проблемы?

---

## Анализ: почему проверки пропускают некачественный контент

| Проблема                                                 | Существующая проверка                                        | Почему не работает                                                                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Повторяющаяся аналогия "чертёж здания" в 9/25 уроках     | `duplication-checks.ts`                                      | Проверяет дупликацию **внутри** одного урока. Кросс-урочной проверки НЕТ. Аналогии не трекаются в `inter_lesson_context`.           |
| Избыточные `[!TIP]` callout-ы (20/25 уроков)             | Нет фильтра                                                  | **Фильтр плотности callout-ов вообще не существует.** Промпт сам поощряет их использование.                                         |
| Код в нетехническом курсе (8/25 уроков, до 8 code fence) | Нет фильтра                                                  | **Нет проверки соответствия кода целевой аудитории.** `content_archetype` есть в спеке, но не gate-ит code blocks.                  |
| Дубликат упражнений                                      | `isTemplateHeavySection()` в `duplication-checks.ts:307-309` | Упражнения **явно исключены** из проверки дубликации! Фильтр их пропускает по дизайну.                                              |
| Английский текст в русском курсе                         | Self-reviewer Phase 1 "Language Failure"                     | Проверка ловит только **"преимущественно неправильный язык"**, а не отдельные английские заголовки/фразы.                           |
| Обрезанный совет (5.3)                                   | Self-reviewer Phase 1 "Truncation"                           | Проверка ищет неоконченные предложения в конце контента. Обрезку **внутри callout-блока** не детектирует.                           |
| Дублированные заголовки секций (5.1)                     | `duplication-checks.ts:67-78`                                | Проверка ЕСТЬ, но запускается в Judge cascade (дорогая стадия). Если общий score высокий, Judge **принимает** несмотря на дубликат. |
| Лишние секции "Заключение"/"Итоговый вывод"              | `markdown-parser.ts` SPECIAL_SECTIONS                        | "Заключение" фильтруется, но **"Итоговый вывод" НЕТ в списке**. Фронтенд `markdown-content-parser.ts:51` тоже пропускает.           |

**Вывод**: проблемы не в том, что проверки плохо работают, а в том, что для этих конкретных случаев проверки **не существуют** или **намеренно отключены**.

---

## Философия исправления

**Принцип 1: Модель должна мыслить свободно.** Не зажимаем LLM жёсткими правилами — это ведёт к галлюцинациям и однотипности. Вместо запретов в промптах — post-generation guardrails (фильтры, парсеры, post-processing).

**Принцип 2: Промпт не раздуваем.** Текущий промпт уже содержит 12 CRITICAL RULES. Добавляем только то, что нельзя решить кодом. Все изменения на английском, компактные.

**Принцип 3: Фильтры > промпты.** Промпт — это guidance (мягкое направление). Фильтры — это enforcement (жёсткая проверка). Основной фокус — на новых post-generation фильтрах.

---

## Группа A: Точечные правки промпта (минимальные)

### A1. Убрать code blocks из visual toolkit для нетехнических курсов (P0)

**Файл**: `packages/course-gen-platform/src/shared/prompts/stage6/single-call-generator.ts`
**Строка 74**: `5. **Code blocks** with filenames when relevant`

Не добавляем запрет. Просто **условно убираем пункт 5** из toolkit:

- Заменить статическую строку на `{{codeBlockInstruction}}`
- Для `content_archetype === 'code_tutorial'`: показать как сейчас
- Для остальных: **пропустить пункт** (не показывать). Модель не будет о нём знать → не будет генерить код

**Файл**: `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/generator/generator-single-call.ts`

- Формировать `codeBlockInstruction` на основе `lessonSpec.metadata.content_archetype`
- `code_tutorial` → `"5. **Code blocks** with filenames when relevant"`
- Остальное → `""` (пустая строка, пункт исчезает)

### A2. Поменять порядок приоритетов в visual toolkit (P1)

**Файл**: `single-call-generator.ts`, строки 67-74

Текущий порядок: Mermaid → Math → Callouts → Tables → Code blocks.
Callout-ы на 3-м месте — модель часто их выбирает как самый простой вариант.

Изменить порядок, чтобы **таблицы и диаграммы были впереди, callout-ы — последние**:

```
1. **Mermaid Diagrams** — ...
2. **Tables** for comparisons. ...
3. **Math Formulas** (LaTeX) — ...
4. {{codeBlockInstruction}}
5. **Callouts**: > [!TIP], > [!WARNING], > [!NOTE], > [!INFO] — use sparingly for genuinely important tips.
```

Не ставим жёсткий лимит "Max 1" — просто "use sparingly". Модель будет реже их выбирать.

### A3. Добавить структурное уточнение: ровно 4 части (P1)

**Файл**: `single-call-generator.ts`, строка 88

Текущее: `STRUCTURE (use ## headers for each section):` перечисляет 4 пункта, но не говорит "только эти 4".

Добавить ОДНУ фразу: `STRUCTURE — exactly 4 parts (use ## headers):`
Это мягкое уточнение — модель поймёт что не нужно добавлять "Заключение". Не перечисляем запрещённые заголовки.

### A4. Ротация аналогий в generation guidance (P0)

**Файл**: `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/generator/generator-helpers.ts`
**Строки**: 375-384 в `formatGenerationGuidanceXML()`

Это **кодовое** изменение, не промптовое. Меняем как формируется XML:

- Добавить параметр `lessonIndex?: number` в `formatGenerationGuidanceXML()`
- Вместо перечисления ВСЕХ аналогий: выделить ОДНУ primary по `lessonIndex % analogies.length`
- XML-комментарий: `"Suggested analogy for this lesson (pick only if naturally fits the topic):"` для primary
- Остальные: `"Alternative analogies (use only if the suggestion above doesn't fit):"`

**Файл**: `generator-single-call.ts`

- Передать `lessonSpec.lesson_context?.course_position?.lesson_index_in_course` при вызове

---

## Группа B: Post-generation фильтры (основной фокус)

### B1. Фильтр плотности callout-ов (P0)

**Файл**: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/filters/structural-checks.ts`

Новая функция `checkCalloutDensity(content: string): FilterCheckResult`:

- Regex: `/^>\s*\[!(TIP|WARNING|NOTE|INFO|DANGER)\]/gim`
- Порог: >2 = `major`, >4 = `critical`
- Добавить вызов в heuristic orchestrator

### B2. Фильтр code blocks для нетехнических курсов (P0)

**Файл**: `structural-checks.ts`

Новая функция `checkCodeBlockAudienceMatch(content: string, contentArchetype: string): FilterCheckResult`:

- Считать ` ``` ` блоки (исключая ` ```mermaid `)
- Если `contentArchetype !== 'code_tutorial'` и count > 0: `major`; >3: `critical`
- Если `code_tutorial`: всегда pass

### B3. Убрать исключение упражнений из проверки дубликации (P1)

**Файл**: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/filters/duplication-checks.ts`
**Строки**: 307-309

- Разделить `isTemplateHeavySection` на `isDigestSection` (exempt) и `isExerciseSection` (NOT exempt)
- Для пар с упражнениями: повышенный threshold 0.5 (вместо 0.32) чтобы не ловить false positives от шаблонного форматирования

### B4. Exact duplicate headers в heuristic pre-filter (P1)

**Файл**: `duplication-checks.ts`, строки 67-78

- Добавить exact-match pre-check (case-insensitive) ДО Levenshtein
- Exact duplicate = severity `critical` (force regeneration)
- Текущая проблема: duplicate headers ловятся в Judge cascade, но высокий общий score перебивает. В heuristic pre-filter дубликат будет blocking.

### B5. Детекция обрезки внутри callout-блоков (P2)

**Файл**: `structural-checks.ts`

Расширить `checkContentTruncation()`:

- Извлечь callout-блоки regex
- Проверить последнюю строку на пунктуацию
- Флагнуть если <20 символов без пунктуации

### B6. Детекция преимущественно-английских заголовков (P2)

**Файл**: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/filters/content-quality.ts`

Расширить `checkLanguageConsistency()`:

- Извлечь все `## ` заголовки
- Если >60% латинских символов и >3 слова в заголовке, при non-English языке: `major`
- Исключения: технические термины, бренды, аббревиатуры

---

## Группа C: Обновления парсеров (детерминированные фиксы)

### C1. Добавить "Итоговый вывод" в парсеры (P0)

**Файл**: `packages/web/lib/markdown-content-parser.ts`, строка 51

```typescript
// БЫЛО:
const SUMMARY_HEADINGS = ['заключение', 'summary', 'итоги', 'выводы'];
// СТАЛО:
const SUMMARY_HEADINGS = [
  'заключение',
  'summary',
  'итоги',
  'выводы',
  'итоговый вывод',
  'подведение итогов',
  'общий вывод',
  'key takeaways',
  'conclusion',
  'wrap-up',
  'wrap up',
];
```

**Файл**: `packages/course-gen-platform/src/stages/stage6-lesson-content/utils/markdown-parser.ts`

В `buildSpecialSections()` добавить:

```typescript
sections.add('итоговый вывод');
sections.add('подведение итогов');
sections.add('общий вывод');
```

В `SUMMARY_TERMS` добавить: `'Итоговый\\s+вывод'`, `'Подведение\\s+итогов'`

### C2. Post-generation strip conclusion sections (P1)

**Файл**: `generator-single-call.ts`, после извлечения digest

Функция `stripUnwantedConclusionSections(markdown, language)`:

- Multilingual список conclusion-headings (из CONTENT_LABELS + extras)
- Находит `## <conclusion-heading>` секции в markdown
- Удаляет от `##` до следующего `##` или конца
- Логирует удаление
- Safety net: даже если модель проигнорирует structural hint (A3), парсер уберёт лишнюю секцию

---

## Порядок реализации

### Phase 1 (P0):

1. **C1** — Добавить conclusion-like заголовки в парсеры (5 мин, нулевой риск)
2. **A4** — Ротация аналогий в generation guidance code (15 мин)
3. **A1** — Условный code block instruction (10 мин)
4. **B1** — Фильтр callout density (20 мин)
5. **B2** — Фильтр code blocks по аудитории (15 мин)

### Phase 2 (P1):

6. **A2** — Переупорядочить visual toolkit (5 мин)
7. **A3** — "exactly 4 parts" в structure (1 строка, 1 мин)
8. **B3** — Exercise duplication fix (10 мин)
9. **B4** — Exact duplicate headers (10 мин)
10. **C2** — Strip conclusion sections post-gen (15 мин)

### Phase 3 (P2):

11. **B5** — Callout truncation detection (10 мин)
12. **B6** — English header detection (15 мин)

---

## Верификация

1. `pnpm type-check` — проверка типов
2. `pnpm -F course-gen-platform test` — юнит-тесты (добавить тесты для новых фильтров)
3. Перегенерация 2-3 уроков тестового нетехнического курса:
   - Нет code blocks
   - Callout-ы ≤ 2
   - Аналогии различаются между уроками
   - Нет дублированных упражнений
   - Нет "Итоговый вывод" секций в финальном рендере

## Ключевые файлы

| Файл                                              | Что меняем                                              |
| ------------------------------------------------- | ------------------------------------------------------- |
| `shared/prompts/stage6/single-call-generator.ts`  | Visual toolkit (A1, A2), structure hint (A3)            |
| `stage6/nodes/generator/generator-helpers.ts`     | Ротация аналогий (A4)                                   |
| `stage6/nodes/generator/generator-single-call.ts` | Передача archetype (A1), strip conclusion (C2)          |
| `stage6/judge/filters/structural-checks.ts`       | Callout density (B1), code blocks (B2), truncation (B5) |
| `stage6/judge/filters/duplication-checks.ts`      | Exercise exemption (B3), exact headers (B4)             |
| `stage6/judge/filters/content-quality.ts`         | English headers (B6)                                    |
| `stage6/utils/markdown-parser.ts`                 | Conclusion headings (C1)                                |
| `web/lib/markdown-content-parser.ts`              | Conclusion headings (C1)                                |

---

## WAVE 2: Новые проблемы (курс 7a89b7d2, 2 апреля 2026)

### Диагноз

Курс сгенерирован **2 апреля** — после наших фиксов (1 апреля), но `course-gen-platform` workers **не были перезапущены** при деплое. Доказательства: "Заключение" присутствует, 12/20 уроков с code blocks при `archetype = concept_explainer`, 4 TIP callout-а в 2 уроках.

**Действие**: Перезапуск workers + перегенерация курса.

**ROOT CAUSE CI/CD FAILURE**: `passwordSchema` не экспортировался из `validation-schemas.ts`, что блокировало type-check → весь CI pipeline → Docker build → deploy. Все фиксы v0.31.32-33 НЕ были задеплоены на dev из-за этой ошибки. Исправлено в Wave 2.

### Новые баги (не покрыты Wave 1)

#### W2-1. `[!PRO TIP]` — нестандартный callout маркер (P0)

LLM генерирует `> [!PRO TIP]` вместо `> [!TIP]`. Ни backend regex, ни frontend `CALLOUT_DETECT_RE` не распознают `PRO TIP`.

**Фиксы**:

1. **Backend**: `structural-checks.ts` — расширить regex: `PRO\s*TIP|TIP|...`
2. **Frontend**: `web/components/markdown/utils/callout-parser.tsx:13` — расширить regex + маппинг `PRO TIP` → `tip`

#### W2-2. Сломанная markdown-таблица: кавычки разрывают строку (P1)

Урок 2.2: `| "Страдающие" пользователи |` разрывается кавычками. Генерационная проблема.

**Фикс**: Post-generation table sanitizer — проверять одинаковое число `|` в строках таблицы, склеивать разорванные.

#### W2-3. Урок целиком в intro (section_count = 0) (P1)

Урок 3.3 (2969 chars) — `sections = []`, всё в intro. Парсер не распознал секции.

**Фикс**: Heuristic filter — `section_count === 0` → severity `critical` (force regeneration).

#### W2-4. Контент слишком технический для HR-аудитории (P2)

Модуль 3: Docker/Kubernetes, SMTP/IMAP, DLP/SIEM. Stage 4 определил `tone = "technical professional"`, но не ограничил глубину для нетехнической аудитории.

**Фикс**: Stage 4/6 промпт — учёт `target_audience` при контроле технической глубины.

#### W2-5. "Слетевший текст" — проверка рендеринга (P1)

Контент в БД корректный. Нужна проверка рендеринга через авторизованный браузер.

### Порядок Wave 2

1. **DevOps**: Перезапуск workers
2. **W2-1**: Callout regex (backend + frontend)
3. **W2-3**: Section count validation
4. **W2-2**: Table sanitizer
5. **W2-5**: Проверка рендеринга
6. **W2-4**: Audience-aware prompts (Stage 4/6)

### Ключевые файлы Wave 2

| Файл                                                         | Что меняем                     |
| ------------------------------------------------------------ | ------------------------------ |
| `stage6/judge/filters/structural-checks.ts`                  | W2-1: callout regex PRO TIP    |
| `web/components/markdown/utils/callout-parser.tsx`           | W2-1: PRO TIP → tip            |
| `web/components/markdown/utils/normalize-markdown-tables.ts` | W2-2: broken table rows        |
| `stage6/judge/filters/orchestrator.ts` или `basic-checks.ts` | W2-3: section_count validation |
| `shared/prompts/stage4-prompts.ts`                           | W2-4: audience-aware depth     |

---

## WAVE 3: Final Review Fixes

4 Important issues from final review (`docs/reports/code-review/2026-04/final-quality-hardening-review.md`):

1. **I-1**: Extract duplicated `buildQaSignals` from `judge-node-helpers.ts` and `judge-refinement-helpers.ts` into shared utility
2. **I-2**: Add markdown truncation guard in `presentation-critic.ts` (12000 char limit)
3. **I-3**: Add comment documenting `novice` fallback in `course-audit.ts:144`
4. **I-4**: Add comment explaining dual qaSignals/qa_signals paths in `database-service.ts`
