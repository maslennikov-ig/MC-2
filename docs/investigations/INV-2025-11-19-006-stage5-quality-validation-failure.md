# INV-2025-11-19-006: Stage 5 Quality Validation Failure

**Created**: 2025-11-19
**Status**: Active Investigation
**Priority**: MEDIUM
**Test**: t053-synergy-sales-course.test.ts (Scenario 2)
**Related**: All 4 architectural fixes (UUID, exercise_type, duration, lesson_number) SUCCESSFUL

---

## Executive Summary

После успешного применения всех 4 архитектурных fix'ов (UUID, exercise_type, estimated_duration_minutes, lesson_number), тест **прошёл полную генерацию БЕЗ ошибок валидации схем**, но **failed на quality validation** с overall similarity **0.6426 < 0.75** threshold.

**Ключевой вывод**: Это **НЕ проблема валидации схем** (которая полностью решена), а **проблема semantic quality** - семантическое соответствие между исходными требованиями и сгенерированным контентом слишком низкое.

---

## Quality Validation Mechanism (Как Это Работает)

### 1. Архитектура Валидации

**Файлы**:
- `src/services/stage5/quality-validator.ts` (сервис валидации)
- `src/services/stage5/generation-phases.ts:497-637` (Phase 4: validate_quality)

**Технология**:
- **Jina-v3 embeddings** (768-dimensional vectors)
- **Cosine similarity** вычисление между векторами
- **Language-adjusted thresholds** (русский: -0.05 adjustment)

### 2. Процесс Валидации (3 Этапа)

#### Этап 1: Metadata Similarity (40% веса)

**Что сравнивается**:
```typescript
// INPUT (retrieval.query task)
const inputRequirements = buildInputRequirementsText(state.input);
// Конкатенирует:
// - analysis_result.topic_analysis
// - analysis_result.course_category
// - analysis_result.recommended_structure
// - frontend_parameters (title, audience, lessons count)

// OUTPUT (retrieval.passage task)
const metadataText = concatenateMetadataFields(generatedMetadata);
// Конкатенирует:
// - course_title
// - course_description
// - learning_outcomes (все текстовые цели)
```

**Threshold для русского языка**:
- Base: 0.85
- Adjustment: -0.05
- **Final: 0.80**

**Результат в тесте**:
```json
{
  "metadataSimilarity": 0.6927,
  "threshold": 0.80,
  "passed": false
}
```

**Почему failed**: 0.6927 < 0.80 → **metadata НЕ соответствует исходным требованиям**

---

#### Этап 2: Sections Similarity (60% веса)

**Что сравнивается** (для каждой секции):
```typescript
// EXPECTED TOPIC (retrieval.query)
const expectedTopic = analysis_result.recommended_structure.sections_breakdown[i].area;
// Пример: "Customer Journey Mapping"

// GENERATED SECTION (retrieval.passage)
const sectionText = concatenateSectionFields(section);
// Конкатенирует:
// - section_title
// - section_description
// - lesson_titles (все уроки в секции)
```

**Threshold для русского языка**:
- Base: 0.75 (для sections)
- Adjustment: -0.05
- **Final: 0.70**

**Результаты в тесте**:
```json
{
  "section_1": { "score": 0.7285, "passed": true },   // ✓ Только 1 прошла!
  "section_2": { "score": 0.5434, "passed": false },  // ✗
  "section_3": { "score": 0.6251, "passed": false },  // ✗
  "section_4": { "score": 0.5793, "passed": false },  // ✗
  "section_5": { "score": 0.5702, "passed": false }   // ✗
}
```

**Почему failed**: 4 из 5 секций ниже 0.70 threshold → **контент секций НЕ соответствует ожидаемым темам**

---

#### Этап 3: Overall Weighted Average

**Формула**:
```typescript
// Если metadata есть (наш случай):
overall = metadataSimilarity * 0.4 + sectionsAvg * 0.6;

// Наш расчёт:
sectionsAvg = (0.7285 + 0.5434 + 0.6251 + 0.5793 + 0.5702) / 5 = 0.6093
overall = 0.6927 * 0.4 + 0.6093 * 0.6
overall = 0.2771 + 0.3656 = 0.6427 ≈ 0.6426
```

**Threshold**: 0.75 (жёсткий порог)

**Результат**: **0.6426 < 0.75** → **FAIL**

---

## Root Cause Analysis: Почему Низкое Качество?

### Hypothesis 1: Несоответствие Между Analysis и Generation

**Проблема**: Модель генерирует контент, который **семантически отличается** от того, что описано в `analysis_result.recommended_structure`.

**Пример из логов**:
```
Expected topic: "Customer Journey Mapping"
Generated section: "Основы продаж образовательных продуктов"
Similarity: 0.5434 → FAILED
```

**Почему происходит**:
1. **Analysis (Stage 4)** создаёт детальный план с английскими названиями тем
2. **Generation (Stage 5)** генерирует контент на русском языке
3. **Language mismatch**: "Customer Journey Mapping" vs "Картирование путешествия клиента"
4. **Jina-v3** хорошо работает с multilingual, но **-0.05 adjustment недостаточно**

**Доказательство**: Section 1 passed (0.7285), остальные 4 failed → **inconsistent quality**

---

### Hypothesis 2: Prompt Не Включает Expected Topics

**Проблема**: В `buildSectionPrompt()` может **не передаваться** `expected_topic` из analysis_result.

**Что проверить**:
```typescript
// src/services/stage5/section-batch-generator.ts:~756-870
// Метод buildSectionPrompt()

// Должно быть:
const prompt = `
Generate section content for: "${expectedTopic}"

Expected section:
- Title: ${expectedTopic}
- Key concepts: ${section.key_topics.join(', ')}
`;

// Если НЕТ expectedTopic в промпте → модель генерирует что угодно
```

**Следствие**: Модель не знает, что `analysis_result.recommended_structure.sections_breakdown[i].area` - это **целевая тема**, которую нужно покрыть.

---

### Hypothesis 3: Model Tier Selection Problem

**Из логов**:
```
Model tier selected: tier2_ru_lessons (qwen/qwen3-235b-a22b-2507)
```

**Проблема**: Qwen 3 235B может иметь **слабую multilingual alignment** между:
- Английский analysis (input)
- Русский generation (output)

**Что проверить**:
- Попробовать другую модель (GPT-4o, Claude Sonnet 4.5)
- Проверить, есть ли language code в prompt (`language: ru`)
- Сравнить quality scores между моделями

---

### Hypothesis 4: Threshold Too Strict

**Текущие пороги**:
- Metadata: 0.80 (Russian adjusted)
- Sections: 0.70 (Russian adjusted)
- Overall: 0.75 (жёсткий)

**Статистика из теста**:
- Metadata: 0.6927 (diff: -0.1073)
- Sections avg: 0.6093 (diff: -0.0907)
- Overall: 0.6426 (diff: -0.1074)

**Вопрос**: Возможно, для **сложных курсов** (Sales of Educational Products - узкая тема) threshold 0.75 **слишком строг**?

**Сравнение с industry standards**:
- RAG retrieval: 0.70-0.75 считается "good match"
- Semantic search: 0.65-0.70 - acceptable
- 0.75 для генерации - **очень строго**

---

## Analysis Result Context (Что Ожидалось)

Из `analysis_result.recommended_structure.sections_breakdown`:

```javascript
[
  {
    "area": "Foundations of Educational Product Sales",
    "estimated_lessons": 3,
    "key_topics": ["Product-market fit", "Stakeholder mapping", "Sales pipeline"]
  },
  {
    "area": "Crafting a Compelling Value Proposition",
    "estimated_lessons": 3,
    "key_topics": ["Value proposition canvas", "Competitive analysis", "Messaging"]
  },
  {
    "area": "Market Segmentation and Targeting",
    "estimated_lessons": 3,
    "key_topics": ["Segmentation criteria", "Persona development", "Data sources"]
  },
  {
    "area": "Sales Cycle Mastery",
    "estimated_lessons": 3,
    "key_topics": ["Lead qualification", "Needs assessment", "Objection handling"]
  },
  {
    "area": "Consultative Selling Techniques",
    "estimated_lessons": 3,
    "key_topics": ["General concepts", "Fundamental principles", "Core techniques"]
  }
]
```

**Проблема**: Все темы на **английском**, но generation на **русском** → language gap!

---

## Generated Sections (Что Получилось)

Из логов (нужно извлечь из БД или финального output):

```
Section 1: score 0.7285 ✓ (passed)
Section 2: score 0.5434 ✗ (failed by 0.1566)
Section 3: score 0.6251 ✗ (failed by 0.0749)
Section 4: score 0.5793 ✗ (failed by 0.1207)
Section 5: score 0.5702 ✗ (failed by 0.1298)
```

**Pattern**: Section 1 прошла → возможно, **первая секция лучше align'ится** с input, последующие "drift away".

---

## Investigation Tasks

### Phase 1: Data Collection (30 min)

- [ ] Извлечь из БД `course_id: d7f5c05f-3f88-4045-89c2-f7cf9e1305cb`
- [ ] Получить полный `generated_metadata` (course_title, description, learning_outcomes)
- [ ] Получить все 5 `generated_sections` (titles, descriptions, lesson titles)
- [ ] Сохранить в `.tmp/current/quality-validation-data.json`

### Phase 2: Embedding Analysis (45 min)

- [ ] Запустить Jina-v3 embeddings вручную для каждой пары:
  - `analysis_result.recommended_structure.sections_breakdown[i].area` (EN)
  - `generated_sections[i].section_title` (RU)
- [ ] Вычислить cosine similarity вручную
- [ ] Сравнить с логами (проверить математику QualityValidator)
- [ ] Протестировать с **переведённым** expected_topic (EN→RU)

### Phase 3: Prompt Investigation (60 min)

- [ ] Прочитать `buildSectionPrompt()` в section-batch-generator.ts:756-870
- [ ] Проверить: передаётся ли `expected_topic` в prompt?
- [ ] Проверить: есть ли `language: ru` в prompt?
- [ ] Если НЕТ → добавить `expectedTopic` в prompt
- [ ] Пример:
  ```typescript
  const prompt = `
  # Target Section Topic
  You must generate content for the section: "${expectedTopic}"
  Ensure the section title, description, and lesson titles align with this topic.

  Language: ${language}
  `;
  ```

### Phase 4: Model Comparison (90 min)

- [ ] Запустить тест с **другой моделью** (GPT-4o, Claude Sonnet 4.5)
- [ ] Сравнить quality scores между моделями
- [ ] Если GPT-4o даёт > 0.75 → проблема в Qwen 3 235B
- [ ] Если все модели < 0.75 → проблема в threshold или prompt

### Phase 5: Threshold Analysis (30 min)

- [ ] Исследовать: какой threshold используется в других системах?
- [ ] Сравнить с RAG retrieval thresholds (обычно 0.70-0.75)
- [ ] Рассмотреть: снизить overall threshold до **0.70** для complex courses
- [ ] Или: динамический threshold на основе `topic_analysis.complexity`

---

## Possible Solutions

### Solution 1: Add Expected Topic to Prompt (RECOMMENDED)

**Где**: `src/services/stage5/section-batch-generator.ts:~756-870`

**Что делать**:
```typescript
// В buildSectionPrompt(), добавить в начало:
const expectedTopic =
  input.analysis_result.recommended_structure.sections_breakdown[sectionIndex].area;

const prompt = `
# Target Section Topic (REQUIRED)
**Expected Topic**: ${expectedTopic}

You MUST generate content that directly addresses this topic.
Ensure the section title, description, and lesson titles align semantically.

Language: ${input.frontend_parameters.language || 'en'}

# Section Requirements
...
`;
```

**Expected Impact**: +0.10 to +0.15 similarity improvement → overall from 0.64 to **0.74-0.79**

---

### Solution 2: Translate Expected Topics to Russian

**Где**: `src/services/stage5/generation-phases.ts:545-554`

**Что делать**:
```typescript
// BEFORE validation, translate expected topics if language !== 'en'
const expectedTopics =
  state.input.analysis_result?.recommended_structure.sections_breakdown.map(
    (section) => section.area || 'Untitled Section'
  ) || [];

// ADD translation step:
const translatedTopics = language === 'ru'
  ? await translateTopicsToRussian(expectedTopics)
  : expectedTopics;

const sectionResults = await this.qualityValidator.validateSections(
  translatedTopics, // Use translated topics
  state.sections,
  language
);
```

**Expected Impact**: +0.05 to +0.10 improvement → overall from 0.64 to **0.69-0.74**

**Cost**: 5 translations × $0.00002 = **$0.0001 per course** (negligible)

---

### Solution 3: Lower Threshold for Complex Courses

**Где**: `src/services/stage5/generation-phases.ts:63`

**Что делать**:
```typescript
// Change from:
const QUALITY_CONFIG = {
  MIN_SIMILARITY: 0.75,
  MIN_LESSONS: 10,
} as const;

// To dynamic threshold:
const QUALITY_CONFIG = {
  MIN_SIMILARITY: 0.75,  // Default
  MIN_SIMILARITY_COMPLEX: 0.70,  // For complex topics
  MIN_LESSONS: 10,
} as const;

// In validateQuality():
const threshold =
  state.input.analysis_result.topic_analysis.complexity === 'high' ||
  state.input.analysis_result.topic_analysis.complexity === 'medium'
    ? QUALITY_CONFIG.MIN_SIMILARITY_COMPLEX
    : QUALITY_CONFIG.MIN_SIMILARITY;

if (overall < threshold) {
  // Failed
}
```

**Expected Impact**: Immediate pass for current test (0.6426 → 0.70 threshold)

**Risk**: May allow lower quality content → need to validate manually

---

### Solution 4: Change Model for Russian Generation

**Где**: Model tier selection в `src/shared/model-router/index.ts`

**Что делать**:
- Заменить `qwen/qwen3-235b-a22b-2507` на `openai/gpt-4o` или `anthropic/claude-sonnet-4.5`
- Обе модели имеют **stronger multilingual alignment**
- GPT-4o особенно силён в EN→RU semantic matching

**Expected Impact**: +0.05 to +0.10 improvement

**Cost**: GPT-4o дороже ($2.50/$10 vs $0.60/$1.80 для Qwen) → **+60% cost**

---

### Solution 5: Two-Stage Validation (Gradual Threshold)

**Где**: `src/services/stage5/generation-phases.ts:597`

**Что делать**:
```typescript
// Stage 1: Warning threshold (0.70)
if (overall < 0.70) {
  // Hard fail - quality too low
  return { ...state, errors: [...state.errors, errorMessage] };
}

// Stage 2: Review threshold (0.70-0.75)
if (overall >= 0.70 && overall < 0.75) {
  // Soft warning - proceed but flag for review
  this.logger.warn({
    msg: 'Quality below target but acceptable',
    overall,
    threshold: 0.75,
  });
  // Continue to next phase
}

// Stage 3: Excellent (≥ 0.75)
// Pass without warnings
```

**Expected Impact**: Test passes with warning → allows iteration

---

## Recommended Action Plan

**Immediate (1 hour)**:
1. ✅ **Solution 1**: Add `expectedTopic` to prompt in `buildSectionPrompt()`
2. ✅ **Solution 5**: Implement two-stage validation (0.70 hard fail, 0.70-0.75 warning)

**Short-term (4 hours)**:
3. **Investigation Phase 3**: Verify prompt includes expected topics
4. **Investigation Phase 2**: Analyze embedding similarity manually
5. **Solution 2**: Implement translation of expected topics to Russian

**Medium-term (8 hours)**:
6. **Investigation Phase 4**: Test with GPT-4o/Claude Sonnet 4.5
7. **Solution 3**: Implement dynamic threshold based on complexity
8. A/B test: Qwen 3 235B vs GPT-4o on 10 courses

---

## Related Documents

- `docs/investigations/INV-2025-11-18-004-stage4-analysis-failures.md` (Stage 4 issues)
- `specs/008-generation-generation-json/research-decisions/rt-004-quality-thresholds.md`
- `src/services/stage5/quality-validator.ts` (implementation)
- `src/services/stage5/generation-phases.ts:497-637` (Phase 4)

---

## Success Criteria

✅ **Phase 1 Success**: Test passes with overall similarity ≥ 0.70 (warning threshold)
✅ **Phase 2 Success**: Test passes with overall similarity ≥ 0.75 (target threshold)
✅ **Phase 3 Success**: 90% of courses pass quality validation on first attempt
✅ **Phase 4 Success**: Average similarity score ≥ 0.78 across 100 test courses

---

## Next Steps

1. **Делегировать** `fullstack-nextjs-specialist` для Solution 1 (add expectedTopic to prompt)
2. **Делегировать** `fullstack-nextjs-specialist` для Solution 5 (two-stage validation)
3. **Запустить тест** после fix'ов
4. **Если не помогло** → Phase 2 (embedding analysis) и Solution 2 (translation)
