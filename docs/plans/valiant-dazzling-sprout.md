# Fix: Раздувание контента уроков — Переход на Single-Call генерацию

## Context

5-минутные уроки генерируются с объёмом **5000+ слов** (30-40K символов) вместо ожидаемых 600-1000 слов. Контент повторяется — одни и те же темы раскрываются по несколько раз.

**Корневая причина**: Архитектура section-by-section генерации. Для урока с 6 key_topics делается **9 отдельных LLM-вызовов** (intro + 6 секций + summary + exercises). Каждый вызов получает инструкцию "Aim for 500-1000 words" и 5000 символов предыдущего контекста. Модель не знает ни duration урока, ни общий word budget, ни сколько секций всего. Результат — 6×700 = 4200 слов только секции + recap/transitions по 100-200 слов на каждую.

**Решение**: Заменить section-by-section генерацию на **single-call** (или **2-call**) подход, где модель получает полный контекст урока и генерирует весь контент за один вызов.

## Root Cause (подробный анализ)

### 1. Stage 5: Слишком много key_topics на урок

- `prompt-builder.ts:187` — "Each lesson must have 2-10 key topics" без учёта duration
- `v2-converter.ts:213` — каждый key_topic → отдельная SectionSpecV2
- 5-мин урок получает 6 key_topics = 6 секций

### 2. Stage 6: Посекционная генерация множит объём

- `generator-node.ts:144-260` — цикл `for (const section of lessonSpec.sections)`
- Каждая секция = отдельный LLM-вызов с `depthGuidance: "Aim for 500-1000 words"`
- Модель НЕ знает: duration, total sections count, word budget
- RAG-чанки одинаковые для всех секций (per-section RAG фактически не работает)

### 3. Transition bloat

- `stage6-prompts.ts:152` — "Create a SMOOTH TRANSITION from the previous context"
- `stage6-prompts.ts:158` — "Reference previous lesson naturally" (межурочная инструкция применяется к внутрисекционным переходам)
- Каждая секция начинается с 100-200 слов recap

## План: A/B тестирование → Имплементация

### Phase 1: Тестовый скрипт для сравнения подходов

Создать скрипт `scripts/test-single-call-generation.ts` который:

1. Берёт реальный `LessonSpecificationV2` из БД (курс `2ce2ffa5`, урок 1.2)
2. Генерирует контент **тремя способами**:
   - **Approach A**: Текущий section-by-section (baseline)
   - **Approach B**: 1 LLM-вызов = весь урок (intro + секции + summary + exercises)
   - **Approach C**: 2 LLM-вызова:
     - Call 1: intro + секции + summary
     - Call 2: exercises + lesson_digest (краткое содержание для следующего урока)
3. Сравнивает: word count, символы, наличие повторений, структуру H2 заголовков, время генерации, стоимость токенов

**Для тестового скрипта нужно:**

- Промпт для single-call генерации (новый `stage6_whole_lesson`)
- Промпт для 2-call варианта: `stage6_lesson_body` + `stage6_exercises_digest`
- Функция вызова модели через `createOpenRouterModel()` (существующая инфра)
- Загрузка lessonSpec из Supabase или из JSON-фикстуры

### Phase 2: Новые промпты

#### Промпт A: `stage6_whole_lesson` (1 вызов = весь урок)

Объединяет текущие 4 промпта (intro + section + summary + exercises) в один:

```
<lesson_specification>
  <title>{{lessonTitle}}</title>
  <description>{{lessonDescription}}</description>
  <duration_minutes>{{durationMinutes}}</duration_minutes>
  <target_word_count>{{targetWordCount}}</target_word_count>
  <target_audience>{{targetAudience}}</target_audience>
  <tone>{{tone}}</tone>
  <difficulty>{{difficulty}}</difficulty>

  <learning_objectives>
    {{learningObjectives}}
  </learning_objectives>

  <sections_to_cover>
    {{sectionsList}}  <!-- Все key_topics как список тем для раскрытия -->
  </sections_to_cover>

  <intro_blueprint>
    <hook_strategy>{{hookStrategy}}</hook_strategy>
    <hook_topic>{{hookTopic}}</hook_topic>
  </intro_blueprint>
</lesson_specification>

<reference_material>
  {{ragContext}}
</reference_material>

{{interLessonContext}}

<content_style>{{stylePrompt}}</content_style>

<!-- visual_toolkit, rag_validation, output_language — как в текущем промпте -->

<task>
Write a COMPLETE lesson for a {{durationMinutes}}-minute reading session.
Target: approximately {{targetWordCount}} words total.

STRUCTURE (use ## headers):
1. ## Introduction — Hook ({{hookStrategy}}) + preview of learning objectives (150-200 words)
2. ## [Section titles from sections_to_cover] — Cover each topic.
   All sections combined should be ~{{sectionWordBudget}} words total.
   DO NOT pad sections with recaps or transitions. Each section flows naturally from the previous.
3. ## Summary — Brief recap + next steps (100-150 words)
4. ## Exercises — Exactly 2 practical exercises with hints and sample answers

CRITICAL:
- This is a {{durationMinutes}}-minute lesson. Be concise and focused.
- DO NOT repeat or re-explain topics between sections.
- Transitions between sections: 1 sentence max. NO recaps.
- Cover ALL topics from sections_to_cover, but proportionally to lesson duration.
</task>
```

#### Промпт B.1: `stage6_lesson_body` (Call 1 из 2)

То же что Approach A, но БЕЗ блока exercises:

```
STRUCTURE:
1. ## Introduction
2. ## [Sections]
3. ## Summary
```

#### Промпт B.2: `stage6_exercises_digest` (Call 2 из 2)

```
<lesson_content>
{{generatedLessonBody}}  <!-- полный markdown из Call 1 -->
</lesson_content>

<task>
Based on the lesson content above, generate:

1. ## Exercises — Exactly 2 practical exercises
2. ## Lesson Digest — A 2-3 sentence summary of this lesson that can be used
   as context in the NEXT lesson's introduction. Include key concepts covered.
</task>
```

### Phase 3: Имплементация выбранного подхода

После тестов — замена `generator-node.ts`:

**Файлы для изменения:**

| #   | Файл                                            | Что                                                                               |
| --- | ----------------------------------------------- | --------------------------------------------------------------------------------- |
| 1   | `shared/prompts/stage6-prompts.ts`              | Новый промпт(ы) для whole-lesson генерации                                        |
| 2   | `stage6/nodes/generator-node.ts`                | Заменить section loop на 1-2 вызова                                               |
| 3   | `stage6/nodes/generator/generator-content.ts`   | Новые функции `generateWholeLessonContent()` и/или `generateExercisesAndDigest()` |
| 4   | `stage5/utils/section-batch/prompt-builder.ts`  | Duration-aware key_topics (Fix 1 из старого плана)                                |
| 5   | `stage6/nodes/generator/generator-helpers.ts`   | Упростить token calculation для whole-lesson                                      |
| 6   | `stage6/nodes/generator/generator-constants.ts` | Обновить word budget constants                                                    |

**Что НЕ меняется (downstream совместимость):**

- `section-regenerator-node.ts` — парсит H2 из markdown, работает с любым источником
- `self-reviewer-node.ts` — работает с сырым markdown
- `judge/` — всё работает с markdown или `LessonContentBody`
- `markdown-parser.ts` — парсит H2 заголовки агностично к способу генерации
- Heuristic фильтры — работают с `LessonContentBody` (парсится из markdown)

**Также (из старого плана):**

- Fix Stage 5 промпта с duration-aware key_topics distribution
- Убрать `"Duration fields are managed by the system"` из prompt-builder.ts:197

### Phase 4: Верификация

1. `pnpm type-check` — компиляция
2. `pnpm build` — сборка
3. Обновить unit тесты для generator
4. Регенерировать курс "Как стать счастливым" и проверить:
   - Word count: 600-1000 для 5-мин урока
   - Нет повторений/recap между секциями
   - Все темы покрыты
   - H2 структура корректная (парсинг downstream работает)
   - Exercises генерируются корректно
5. Проверить длинные уроки (15-30 мин) — регрессия

## Первый шаг: Тестовый скрипт

Начинаем с создания `scripts/test-single-call-generation.ts`:

```typescript
// 1. Загрузить lessonSpec из JSON фикстуры (или из БД)
// 2. Загрузить RAG chunks (или пустой массив для теста)
// 3. Вызвать LLM с новым промптом (whole-lesson)
// 4. Вывести: word count, char count, структуру H2, время, токены
// 5. Сохранить результат в .tmp/test-results/
```

Использовать:

- `createOpenRouterModel()` из `@/shared/llm/langchain-models`
- `createModelConfigService()` для получения модели
- `getRecommendedTemperatureV2()` для temperature
- `getContentLabels()` для локализованных заголовков

## Вне скоупа

- `quality_score` = 0.88 — отдельный баг Judge
- `model_used = "unknown"` — баг трекинга
- Mermaid-диаграммы
- Stage 4: глобальная переработка распределения тем по урокам
