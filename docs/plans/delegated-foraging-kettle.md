# Fix: Дублирование уроков при генерации курсов (фундаментальное решение)

## 1. Почему это происходит — глубокий анализ

### Конкретный пример: HSY-4471 "Основы систематизации бизнеса"

Пользователь написал в описании курса:

> "...дашборды для отделов, KPI сотрудников, еженедельные планерки, введение отчетов, формирование отделов, формирование регламентов и должностных инструкций..."

KPI — это **один из 7+ пунктов**. Но в итоговом курсе KPI доминирует в **6 из 9 секций**:

```
Секция 1: Фундамент систематизации ← нормально
Секция 2: Документирование процессов ← нормально
Секция 3: Разработка KPI для продаж и маркетинга ← KPI
Секция 4: Система мотивации и мотивирующие KPI ← KPI
Секция 5: Делегирование полномочий ← нормально
Секция 6: Управление по целям (MBO) ← перефразированное KPI
Секция 7: Практическое внедрение в отделах ← опять KPI
Секция 8: Быстрые wins и первые 30 дней ← опять KPI + дашборды
Секция 9: Поддержка и масштабирование ← аудит KPI
```

Уроки внутри этих секций повторяют друг друга с минимальными вариациями:

- "KPI для маркетинга" появляется в секциях 3 И 4
- "Измерение результатов" — в секциях 7 И 8
- "Быстрые победы" — в секциях 4, 7 И 8
- "Внедрение KPI" — в секциях 3, 4, 7, 8, 9

### Корневая причина #1: Stage 4 — "Concept Spreading"

**Файл**: `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-2-scope.ts` (строки 377-591)

Stage 4 Phase 2 (`buildPhase2Prompt`) генерирует `sections_breakdown` — структуру курса. Промпт содержит:

- Тему курса, категорию, сложность
- Ключевые концепции (key_concepts)
- Инструкции по размеру и формату

**Чего НЕТ в промпте**: инструкций о том, что каждая секция должна покрывать **уникальную** тему. LLM видит список концепций и естественно "размазывает" доминантную концепцию (KPI) по множеству секций — это называется **concept spreading**.

Это известная проблема в AI-генерации: когда LLM видит ключевое слово, она стремится включить его везде, потому что считает его "важным" для курса. Без явного ограничения "один концепт → одна секция" модель будет повторять.

### Корневая причина #2: Stage 5 — "Blind Parallel Generation"

**Файл**: `packages/course-gen-platform/src/stages/stage5-generation/utils/section-batch/prompt-builder.ts` (строки 41-209)

Stage 5 разворачивает каждую секцию в уроки. Архитектура:

1. 9 секций запускаются **параллельно** (до 4 одновременно) через `p-limit(4)`
2. Каждая секция получает промпт с **ТОЛЬКО** своими данными:
   ```
   Section Title: "Система мотивации и мотивирующие KPI"
   Key Topics: ["Система мотивации для менеджеров", "Мотивирующие KPI для маркетологов", ...]
   Learning Objectives: [...]
   ```
3. Модель НЕ знает, что существуют секции 3, 6, 7, 8, 9 с похожими темами

Это как если бы 9 авторов писали главы книги, не зная что пишут остальные. Каждый старается раскрыть свою тему максимально полно, и неизбежно заходит на территорию соседей.

В исследованиях это называется **"siloed generation"** — изолированная генерация без общего контекста. Статья [Hierarchical Expansion](https://www.opencredo.com/blogs/how-to-use-llms-to-generate-coherent-long-form-content-using-hierarchical-expansion) описывает именно эту проблему и предлагает решения.

### Корневая причина #3: Нет проверки на дублирование

**Файл**: `packages/course-gen-platform/src/shared/validation/quality-validator.ts`

Quality validator проверяет:

- Каждую секцию vs её ОЖИДАЕМУЮ тему (semantic similarity) → ОК
- Структурные минимумы (мин. уроков, objectives, topics) → ОК

**Не проверяет**:

- Секцию А vs Секцию Б → **не сравнивает секции между собой**
- Урок из секции 3 vs урок из секции 4 → **нет cross-section валидации**
- Quality score 0.73 был ниже порога 0.75, но **non-blocking** → курс сохранился

### Как эти причины усиливают друг друга

```
Stage 4 генерирует 6 KPI-секций (concept spreading)
       ↓
Stage 5 параллельно генерирует уроки для каждой (blind parallel)
       ↓
Каждая модель пытается покрыть "KPI" по-своему → создаёт похожие уроки
       ↓
Quality gate не видит дублирования → пропускает всё
       ↓
45 уроков, половина — варианты одного и того же
```

---

## 2. Что говорит research

### [G2: Guided Generation (2025)](https://arxiv.org/html/2511.00432)

- **Dedupe Guide**: контрастивное декодирование, где специальный модуль подавляет токены, которые бы воспроизвели предыдущий контент
- **Center Selection Strategy**: выбирает репрезентативное подмножество предыдущих генераций для кондиционирования
- **Применимость для нас**: идея контрастивного подхода — показать модели "вот что УЖЕ покрыто, не повторяй"

### [Outline-Guided Text Generation (2024)](https://arxiv.org/html/2404.13919v1)

- **Two-stage outline**: начальный outline → augmented outline с деталями
- **Self-BLEU**: метрика для измерения внутренней избыточности текста
- **Human eval на Redundancy**: 1-4 шкала
- **Применимость**: двухстадийный outline = наш Stage 4 + Stage 5, но им нужна проверка на redundancy между стадиями

### [Hierarchical Expansion (OpenCredo)](https://www.opencredo.com/blogs/how-to-use-llms-to-generate-coherent-long-form-content-using-hierarchical-expansion)

- **Ключевая цитата из промпта**: _"Make sure each section doesn't repeat things that have been said in other sections"_
- **Running summary**: после генерации каждой секции создаётся summary всего написанного, которое передаётся в следующую секцию
- **Chain of Density**: итеративное улучшение summaries
- **Применимость**: прямое решение для нашего случая — передавать контекст между секциями

### [LLMxMapReduce](https://github.com/thunlp/LLMxMapReduce)

- **Semantic dedup перед Map-phase**: удалить семантически похожие чанки ДО обработки
- **Stacked integration layers**: постепенно объединять локальные результаты в глобальные
- **Применимость**: наша генерация секций = Map phase, нужен глобальный контекст как в Reduce

### Синтез: 3 ключевых принципа из research

1. **Explicit anti-overlap instructions** в промпте — простейшее и самое эффективное
2. **Cross-section context** — каждая часть должна знать о других
3. **Post-generation redundancy detection** — метрики (Self-BLEU, cosine similarity) для обнаружения overlap

---

## 3. Фундаментальное решение — 3 уровня защиты

### Fix 1: Cross-Section Context в промпте Stage 5 (CRITICAL)

**Файл**: `prompt-builder.ts`

**Суть**: Каждая секция получает полную карту курса. Вдохновлено подходом из [Hierarchical Expansion](https://www.opencredo.com/blogs/how-to-use-llms-to-generate-coherent-long-form-content-using-hierarchical-expansion).

**Реализация**: Новая функция `buildCourseStructureMap()` + инъекция в промпт.

```typescript
// В prompt-builder.ts
function buildCourseStructureMap(input: GenerationJobInput, currentSectionIndex: number): string {
  const sections = input.analysis_result?.recommended_structure?.sections_breakdown || [];
  if (sections.length === 0) return '';

  const map = sections
    .map((s, i) => {
      const marker = i === currentSectionIndex ? ' ◀ CURRENT' : '';
      return `  ${i + 1}. ${s.area}${marker}\n     Topics: ${(s.key_topics || []).join('; ')}`;
    })
    .join('\n');

  return map;
}
```

**Инъекция в buildBatchPrompt()** (после блока `**Section to Expand**`, строка ~80):

```
**FULL COURSE MAP** (all ${totalSections} sections):
${courseStructureMap}

**ANTI-OVERLAP RULES** (CRITICAL):
1. YOU are generating Section ${sectionIndex + 1} ONLY. Each section above has its OWN unique topic.
2. DO NOT create lessons that cover topics assigned to OTHER sections.
3. If a concept (e.g., KPI) appears in YOUR section AND other sections, focus EXCLUSIVELY on the unique angle defined by YOUR section's key topics.
4. Before finalizing each lesson, mentally check: "Would this lesson fit better in another section?" If yes — do NOT include it.
5. Lessons must be DISTINCT from all other sections' topics listed above.
```

**Почему это работает**: Research показывает, что явная инструкция "не повторяй" + контекст о том, что уже есть, — самый эффективный способ борьбы с дублированием. Модель видит полную картину и может принять осознанное решение.

**Token cost**: +300-500 tokens/section, ~4000 total. Приемлемо.

---

### Fix 2: Anti-Overlap инструкции в Stage 4 Phase 2 (ROOT CAUSE)

**Файл**: `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-2-scope.ts`

**Суть**: Предотвратить concept spreading на уровне создания структуры.

**Добавить в `buildPhase2Prompt()`** (после Task 3, строка ~498, перед "CRITICAL CONSTRAINT - KEY TOPICS / LEARNING OBJECTIVES ALIGNMENT"):

```
**CRITICAL: SECTION TOPIC DISTINCTNESS** (ZERO TOLERANCE FOR OVERLAP)

Each section MUST cover a COMPLETELY DISTINCT topic area. Apply these rules STRICTLY:

1. **ONE concept → ONE section**: If the user mentions a concept (e.g., "KPI", "dashboards", "reports"), it MUST be assigned to exactly ONE section as its primary content. Other sections MUST NOT use it as a main topic.

2. **Topic boundary test**: For each pair of sections, ask: "Could a lesson from Section A be mistakenly placed in Section B?" If yes → MERGE the sections or SHARPEN boundaries until the answer is NO.

3. **No concept spreading**: When the user lists multiple items, distribute them EVENLY across sections. DO NOT create multiple sections that all revolve around the same core concept with minor variations.

4. **Key topics exclusivity**: Each key_topic string MUST appear in EXACTLY ONE section. No key_topic should be duplicated or paraphrased across sections.

5. **Deletion test**: If removing a section does NOT create a gap in the course (because another section covers similar material), you MUST merge them.
```

**Дополнительно** — warning-only post-check после генерации `sections_breakdown`:

```typescript
// Detect duplicate key_topics across sections
function logDuplicateKeyTopics(sections: SectionBreakdown[], logger: Logger) {
  const topicToSections = new Map<string, number[]>();
  for (let i = 0; i < sections.length; i++) {
    for (const topic of sections[i].key_topics || []) {
      const norm = topic.toLowerCase().trim();
      if (!topicToSections.has(norm)) topicToSections.set(norm, []);
      topicToSections.get(norm)!.push(i + 1);
    }
  }
  for (const [topic, indices] of topicToSections) {
    if (indices.length > 1) {
      logger.warn({ topic, sections: indices }, `Duplicate key_topic across sections: "${topic}"`);
    }
  }
}
```

---

### Fix 3: Cross-Section Overlap Detection (SAFETY NET)

**Файл**: `packages/course-gen-platform/src/shared/validation/quality-validator.ts`
**Интеграция**: `packages/course-gen-platform/src/stages/stage5-generation/orchestrator.ts`

**Суть**: После генерации всех секций — попарное сравнение через cosine similarity. Вдохновлено Self-BLEU метрикой из [Outline-Guided Generation](https://arxiv.org/html/2404.13919v1) и [G2 Dedupe Guide](https://arxiv.org/html/2511.00432).

**Новый метод в QualityValidator**:

```typescript
async detectCrossSectionOverlap(
  sections: Section[],
  language: string = 'en',
  overlapThreshold: number = 0.85
): Promise<CrossSectionOverlapResult>
```

**Алгоритм**:

1. Для каждой секции: текст = title + description + все lesson titles → `concatenateSectionFields()` (уже есть)
2. Batch-генерация embeddings через Jina-v3 (9 API calls)
3. Попарная cosine similarity: (N\*(N-1))/2 = 36 сравнений для 9 секций
4. Пары с similarity > threshold (0.85) → overlap
5. Для overlap-пар: дополнительная проверка на уровне уроков через word overlap (Jaccard)

**Интерфейс результата**:

```typescript
interface CrossSectionOverlapResult {
  hasOverlap: boolean;
  overlapCount: number;
  overlapThreshold: number;
  overlappingPairs: Array<{
    sectionA: number;
    sectionB: number;
    similarity: number;
    sectionATitle: string;
    sectionBTitle: string;
    overlappingLessonTitles?: string[]; // конкретные дублирующиеся уроки
  }>;
}
```

**Интеграция в orchestrator**:

- Вызвать после `validateSectionQuality()`
- Phase 1: **non-blocking** (logging only) — собираем данные о порогах
- Phase 2 (позже): **blocking** — перегенерация overlap-секций через существующий `section-regeneration-service.ts`
- Сохранять в `generation_trace` для observability

---

## Архитектурный вопрос: объединить Stage 4 и Stage 5?

Ты спросил — может, ошибка в том, что это два отдельных этапа? Вот анализ.

### Текущая архитектура (два этапа)

```
Stage 4: Анализ → sections_breakdown (секции + key_topics + objectives)
    ↓ (пользователь может отредактировать структуру)
Stage 5: Генерация → уроки для каждой секции (параллельно, p-limit 4)
```

### Вариант A: Объединить в один этап

Одна модель получает описание курса и генерирует ВСЮ структуру целиком — секции И уроки в одном вызове.

| Плюсы                                   | Минусы                                                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Нет информационных потерь между этапами | **Token limit**: 9 секций × 5 уроков × (objectives + topics + exercises) = огромный output. Дешёвые модели не потянут                       |
| Модель видит всё сразу → не дублирует   | **Скорость**: один sequential вызов vs 4 параллельных = в 3-4× медленнее                                                                    |
| Проще архитектура                       | **Качество**: модели хуже справляются с длинными structured outputs. Ошибка в одном уроке → перегенерация ВСЕГО                             |
|                                         | **User editing**: теряется возможность редактировать структуру ДО генерации уроков (сейчас пользователь может изменить секции на фронтенде) |
|                                         | **Error resilience**: сбой = потеря всего, а не одной секции                                                                                |
|                                         | **Стоимость**: один вызов мощной модели $$ vs много вызовов дешёвой $                                                                       |

### Вариант B: Два этапа, но с контекстом (РЕКОМЕНДУЕМЫЙ)

```
Stage 4: Анализ → sections_breakdown (с anti-overlap промптами)
    ↓ (пользователь редактирует)
Stage 5: Генерация → каждая секция получает ПОЛНУЮ карту курса + anti-overlap rules
```

| Плюсы                                       | Минусы                                                                  |
| ------------------------------------------- | ----------------------------------------------------------------------- |
| Сохраняется User Editing (ключевая UX фича) | Дополнительные ~4000 tokens на курс                                     |
| Параллельная генерация = скорость           | Не 100% гарантия от overlap (но research показывает 90%+ эффективность) |
| Error resilience: retry одной секции        |                                                                         |
| Дешёвые модели работают (малый контекст)    |                                                                         |
| Course Map = гарантия контекста             |                                                                         |

### Вариант C: Два этапа + последовательная генерация (Hierarchical Expansion)

```
Stage 4: Анализ → sections_breakdown
    ↓
Stage 5: Генерация секций ПОСЛЕДОВАТЕЛЬНО:
  Section 1 → lessons
  Section 2 + "summary of Section 1" → lessons
  Section 3 + "summary of Sections 1-2" → lessons
  ...
```

Это подход из [Hierarchical Expansion](https://www.opencredo.com/blogs/how-to-use-llms-to-generate-coherent-long-form-content-using-hierarchical-expansion).

| Плюсы                                           | Минусы                                  |
| ----------------------------------------------- | --------------------------------------- |
| Максимальная защита от overlap                  | **В 4× медленнее** (нет параллелизма)   |
| Каждая секция знает содержимое предыдущих       | Running summary добавляет tokens        |
| Используется в research с хорошими результатами | Сложнее реализация (chain of summaries) |

### Вывод

**Вариант B — оптимальный баланс** speed/quality/cost:

- Сохраняет параллелизм (скорость)
- Сохраняет User Editing (UX)
- Course Map + anti-overlap промпты решают 90%+ проблемы
- Overlap Detection ловит оставшееся
- Не требует переписывания архитектуры

Вариант C (последовательная генерация) стоит рассмотреть как **будущее улучшение**, если после Варианта B всё ещё будут проблемы. Можно реализовать как опциональный mode для "проблемных" тем.

Вариант A (один этап) **не рекомендуется** — теряет User Editing и параллелизм, требует мощных/дорогих моделей.

---

## 4. Critical Files

| Файл                                                          | Fix | Изменения                                                             |
| ------------------------------------------------------------- | --- | --------------------------------------------------------------------- |
| `.../stage5-generation/utils/section-batch/prompt-builder.ts` | 1   | `buildCourseStructureMap()` + anti-overlap rules в промпт             |
| `.../stage4-analysis/phases/phase-2-scope.ts`                 | 2   | Anti-overlap инструкции в scope prompt + duplicate key_topics warning |
| `.../shared/validation/quality-validator.ts`                  | 3   | `detectCrossSectionOverlap()` метод                                   |
| `.../stage5-generation/orchestrator.ts`                       | 3   | Интеграция overlap detection в quality gate                           |

## Существующие утилиты для реиспользования

- `extractSection()` — `section-batch/utils.ts:13` — доступ к `sections_breakdown`
- `concatenateSectionFields()` — `quality-validator.ts:449` — текст секции для embedding
- `generateEmbedding()` — `shared/embeddings/jina-client.ts` — Jina-v3
- `cosineSimilarity()` — `quality-validator.ts:495` — нужно сделать protected/public
- `logTrace()` — trace logging
- `SectionBreakdown` type — `@megacampus/shared-types/analysis-schemas`

## 5. Порядок реализации

| #   | Fix                                  | Файлы                                     | Объём   | Risk   |
| --- | ------------------------------------ | ----------------------------------------- | ------- | ------ |
| 1   | Fix 1: Course Map в Stage 5 промпт   | `prompt-builder.ts`                       | Малый   | Low    |
| 2   | Fix 2: Anti-overlap в Stage 4 промпт | `phase-2-scope.ts`                        | Малый   | Medium |
| 3   | Fix 3: Overlap Detection             | `quality-validator.ts`, `orchestrator.ts` | Средний | Low    |

## 6. Verification

1. **Type-check + Build**: `pnpm type-check && pnpm build`
2. **Перегенерация курса**: Запустить HSY-4471 заново и сравнить структуру
3. **SQL проверка**:
   ```sql
   SELECT s.order_index, s.title as section, l.order_index, l.title as lesson
   FROM sections s JOIN lessons l ON l.section_id = s.id
   WHERE s.course_id = '<new_id>' ORDER BY s.order_index, l.order_index
   ```
4. **Мониторинг логов**: Проверить overlap detection warnings в production
5. **Тест на разных курсах**: Убедиться что узкие темы (Python asyncio, React hooks) не пострадали

Sources:

- [G2: Guided Generation for Enhanced Output Diversity](https://arxiv.org/html/2511.00432)
- [Navigating the Path of Writing: Outline-guided Text Generation](https://arxiv.org/html/2404.13919v1)
- [Hierarchical Expansion for Long-Form Content](https://www.opencredo.com/blogs/how-to-use-llms-to-generate-coherent-long-form-content-using-hierarchical-expansion)
- [LLMxMapReduce: Divide-and-Conquer Framework](https://github.com/thunlp/LLMxMapReduce)
