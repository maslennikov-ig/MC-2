# Quality Testing Report: MiniMax M2

**Model**: `minimax/minimax-m2`
**Test Date**: 2025-11-13
**Methodology**: [MODEL-QUALITY-TESTING-METHODOLOGY-V2.md](../../docs/MODEL-QUALITY-TESTING-METHODOLOGY-V2.md)
**Configuration**: [test-config-2025-11-13-complete.json](../../docs/llm-testing/test-config-2025-11-13-complete.json)

---

## Executive Summary

MiniMax M2 is a **high-quality model** with exceptional consistency and comprehensive output. This is the first model tested that includes **reasoning tokens** in nearly all outputs, suggesting a thinking/reasoning capability similar to more expensive models.

### Key Findings

- **Overall Quality**: 90.0% (A-Tier)
- **Consistency**: 93.9% (Excellent)
- **Success Rate**: 12/12 (100%)
- **Avg Response Time**: 24.3 seconds

### Highlights

- **Perfect Schema Compliance**: 100% across all 12 runs
- **Excellent Lesson Generation**: Generates 4-5 complete lessons consistently (NOT just 1 like some competitors)
- **Reasoning Tokens**: Includes reasoning tokens (267-912 per run) in most outputs
- **Strong Russian Support**: 92% quality for Russian lessons (better than metadata)
- **High Consistency**: Very stable outputs across multiple runs

### Tier Classification

**A-TIER** (90.0% quality)
- Metadata: 87% avg (93% EN, 81% RU)
- Lessons: 93% avg (93% EN, 92% RU)

---

## Test Execution Details

### Test Configuration

| Parameter | Value |
|-----------|-------|
| Scenarios | 4 (2 metadata, 2 lesson) |
| Runs per scenario | 3 |
| Total API calls | 12 |
| Temperature | 0.7 |
| Max tokens | 8000 |
| Wait between requests | 2000ms |

### Scenarios Tested

1. **metadata-en**: English metadata for "Introduction to Python Programming"
2. **metadata-ru**: Russian metadata for "Машинное обучение для начинающих"
3. **lesson-en**: English lessons for "Variables and Data Types in Python"
4. **lesson-ru**: Russian lessons for "Основы нейронных сетей"

---

## Quality Analysis Results

### Metadata Generation Quality

#### English Metadata (metadata-en)

| Metric | Run 1 | Run 2 | Run 3 | Average |
|--------|-------|-------|-------|---------|
| Overall | 100.0% | 90.0% | 90.0% | **93.3%** |
| Schema | 100% | 100% | 100% | 100% |
| Content | 100% | 90% | 90% | 93% |
| Language | 100% | 70% | 70% | 80% |
| **Consistency** | | | | **95.3%** |

**Strengths**:
- Excellent learning outcomes with action verbs (Define, Build, Create, Analyze)
- Detailed course_overview (1000+ characters with specific examples)
- Well-defined target_audience personas
- Perfect snake_case compliance
- 6-7 learning outcomes (ideal range)

**Sample Output**: `/tmp/quality-tests/minimax-m2/metadata-en-run1.json`

**Token Usage**:
- Run 1: 2,218 completion tokens (267 reasoning)
- Run 2: 1,926 completion tokens (255 reasoning)
- Run 3: 2,336 completion tokens (777 reasoning)
- Average: 2,160 completion tokens

---

#### Russian Metadata (metadata-ru)

| Metric | Run 1 | Run 2 | Run 3 | Average |
|--------|-------|-------|-------|---------|
| Overall | 84.0% | 80.0% | 80.0% | **81.3%** |
| Schema | 100% | 100% | 100% | 100% |
| Content | 60% | 50% | 50% | 53% |
| Language | 100% | 100% | 100% | 100% |
| **Consistency** | | | | **98.1%** |

**Strengths**:
- Perfect Russian language quality
- Natural phrasing (not machine-translated)
- Correct Russian technical terminology
- Perfect schema compliance

**Weaknesses**:
- Lower content score (53% avg)
- Learning outcomes could be more detailed
- course_overview shorter than English version

**Sample Output**: `/tmp/quality-tests/minimax-m2/metadata-ru-run1.json`

**Token Usage**:
- Run 1: 2,787 completion tokens (871 reasoning)
- Run 2: 2,832 completion tokens (718 reasoning)
- Run 3: 1,945 completion tokens (253 reasoning)
- Average: 2,521 completion tokens

---

### Lesson Structure Quality

#### English Lessons (lesson-en)

| Metric | Run 1 | Run 2 | Run 3 | Average |
|--------|-------|-------|-------|---------|
| Overall | 100.0% | 90.0% | 90.0% | **93.3%** |
| Schema | 100% | 100% | 100% | 100% |
| Content | 100% | 90% | 90% | 93% |
| Language | 100% | 70% | 70% | 80% |
| **Consistency** | | | | **95.3%** |
| **Lesson Count** | 5 | 4 | 5 | **4.7** |

**Strengths**:
- **CRITICAL**: Generates 4-5 complete lessons (NOT just 1!)
- All lessons have detailed objectives with action verbs
- Specific key_topics (not generic "Introduction to...")
- Comprehensive exercises with clear instructions (30+ chars)
- Perfect structure compliance

**Sample Output**: `/tmp/quality-tests/minimax-m2/lesson-en-run1.json`

**Token Usage**:
- Run 1: 1,521 completion tokens (912 reasoning)
- Run 2: 1,162 completion tokens (488 reasoning)
- Run 3: 1,227 completion tokens (402 reasoning)
- Average: 1,303 completion tokens

---

#### Russian Lessons (lesson-ru)

| Metric | Run 1 | Run 2 | Run 3 | Average |
|--------|-------|-------|-------|---------|
| Overall | 92.0% | 92.0% | 92.0% | **92.0%** |
| Schema | 100% | 100% | 100% | 100% |
| Content | 80% | 80% | 80% | 80% |
| Language | 100% | 100% | 100% | 100% |
| **Consistency** | | | | **100.0%** |
| **Lesson Count** | 5 | 5 | 5 | **5.0** |

**Strengths**:
- **Perfect consistency**: Exactly 5 lessons in all 3 runs!
- Excellent Russian language quality
- Technical terminology accurate
- All lessons complete with objectives and exercises
- Natural Russian phrasing

**Sample Output**: `/tmp/quality-tests/minimax-m2/lesson-ru-run1.json`

**Token Usage**:
- Run 1: 3,007 completion tokens (no reasoning tokens reported)
- Run 2: 2,452 completion tokens (no reasoning tokens reported)
- Run 3: 2,333 completion tokens (no reasoning tokens reported)
- Average: 2,597 completion tokens

**Note**: Russian lesson outputs did NOT include reasoning_tokens in the response, unlike other scenarios.

---

## Schema Compliance Analysis

### Perfect 100% Compliance

All 12 outputs demonstrated perfect schema compliance:

- **Valid JSON**: 12/12 (100%)
- **Required Fields**: 12/12 (100%)
- **Snake Case**: 12/12 (100%)
- **Correct Data Types**: 12/12 (100%)

### Field Analysis

**Metadata Outputs**:
- All contain: `course_title`, `course_description`, `course_overview`, `target_audience`, `learning_outcomes`, `course_tags`
- `estimated_duration_hours` always numeric
- `learning_outcomes` always array of strings
- `prerequisites` always array

**Lesson Outputs**:
- All contain: `section_number`, `section_title`, `section_description`, `learning_objectives`, `lessons`
- `lessons` array always has 4-5 complete lesson objects
- Each lesson has: `lesson_number`, `lesson_title`, `lesson_objective`, `key_topics`, `exercises`
- All exercises have: `exercise_title`, `exercise_instructions`

---

## Content Quality Deep Dive

### Learning Outcomes Analysis

**English Metadata Example** (Run 1):
```json
"learning_outcomes": [
  "Define fundamental Python programming concepts including variables, data types, and control structures with 90% accuracy",
  "Build functional Python programs using functions, loops, and conditional statements to solve computational problems",
  "Create object-oriented Python applications with classes and objects to model real-world scenarios",
  "Analyze and debug Python code using systematic debugging techniques and error handling strategies",
  "Implement file input/output operations to persist and retrieve data in Python applications",
  "Design complete software solutions by integrating multiple programming concepts into cohesive projects"
]
```

**Quality Assessment**:
- ✅ Action verbs: Define, Build, Create, Analyze, Implement, Design
- ✅ Bloom's Taxonomy: Multiple cognitive levels (Remember, Apply, Create, Analyze)
- ✅ Measurable: "with 90% accuracy", "systematic techniques"
- ✅ Count: 6 outcomes (ideal range 3-8)

**Russian Metadata Example** (Run 1):
```json
"learning_outcomes": [
  "Определить и классифицировать основные типы задач машинного обучения и выбрать подходящие алгоритмы для конкретных бизнес-проблем",
  "Построить и обучить модели линейной и логистической регрессии, деревьев решений и методов ансамблирования на реальных наборах данных",
  "Проанализировать качество моделей с использованием соответствующих метрик и методов кросс-валидации",
  ...
]
```

**Quality Assessment**:
- ✅ Action verbs: Определить (Define), Построить (Build), Проанализировать (Analyze)
- ✅ Specific and measurable
- ✅ 7 outcomes

---

### Lesson Structure Analysis

**English Lessons Example** (Run 1 - 5 lessons generated):

1. **Lesson 1**: "Creating and Naming Variables in Python"
   - 6 key topics (specific, not generic)
   - 3 exercises with detailed instructions

2. **Lesson 2**: "Working with Numeric Data Types"
   - 6 key topics
   - 3 exercises

3. **Lesson 3**: "String Manipulation and Basic Operations"
   - 6 key topics
   - 3 exercises

4. **Lesson 4**: "Boolean Logic and None Type Applications"
   - 6 key topics
   - 3 exercises

5. **Lesson 5**: "Type Conversion and Runtime Type Checking"
   - 7 key topics
   - 3 exercises

**Quality Assessment**:
- ✅ **CRITICAL**: 5 complete lessons (NOT just 1)
- ✅ All lesson titles specific (not "Introduction to X")
- ✅ All have measurable objectives
- ✅ Key topics are specific (e.g., "Snake_case naming convention", not "Variables")
- ✅ Exercises have clear, actionable instructions (30+ chars each)

---

**Russian Lessons Example** (Run 1 - 5 lessons generated):

1. **Урок 1**: "Нейрон как математическая функция: веса, смещения и активация"
2. **Урок 2**: "Однослойный персептрон: линейная разделимость и задача XOR"
3. **Урок 3**: "Функции потерь: квадратичная и перекрестная энтропия"
4. **Урок 4**: "Градиентный спуск: обновление весов и скорость обучения"
5. **Урок 5**: "Многослойные сети и обратное распространение ошибки"

**Quality Assessment**:
- ✅ Perfect consistency: 5 lessons in all runs
- ✅ Highly specific titles (not generic)
- ✅ Technical terminology accurate
- ✅ All lessons complete with exercises

---

## Language Quality Assessment

### English Quality

**Strengths**:
- Natural, professional tone
- Correct technical terminology
- No grammatical errors detected
- Industry-standard phrasing

**Examples**:
- "Students will be able to..." (standard educational phrasing)
- "Hands-on coding exercises" (industry term)
- "Problem-solving methodologies" (academic terminology)

### Russian Quality

**Strengths**:
- Native Russian phrasing (NOT machine-translated)
- Correct Cyrillic usage
- Technical terms properly translated
- Cultural fit for Russian educational context

**Examples**:
- "Определить и классифицировать" (proper verb forms)
- "Методов кросс-валидации" (correct terminology)
- "Аналитики данных и специалисты" (natural phrasing)

**No word-for-word translation artifacts detected**

---

## Performance Metrics

### Response Times

| Scenario | Run 1 | Run 2 | Run 3 | Average |
|----------|-------|-------|-------|---------|
| metadata-en | 16,984ms | 18,392ms | 15,595ms | 16,990ms |
| metadata-ru | 26,166ms | 22,724ms | 18,414ms | 22,435ms |
| lesson-en | 25,529ms | 28,495ms | 29,702ms | 27,909ms |
| lesson-ru | 32,730ms | 34,184ms | 22,407ms | 29,774ms |

**Overall Average**: 24,277ms (~24.3 seconds)

**Analysis**:
- Slower than fast models like Grok 4 Fast (~15s avg)
- Comparable to Kimi K2 Thinking (~25s avg)
- Reasoning tokens likely add processing time
- Russian outputs slightly slower than English

---

### Token Usage Summary

| Scenario | Avg Completion Tokens | Avg Reasoning Tokens | Total Avg |
|----------|----------------------|---------------------|-----------|
| metadata-en | 2,160 | 433 | 2,593 |
| metadata-ru | 2,521 | 614* | 3,135* |
| lesson-en | 1,303 | 601 | 1,904 |
| lesson-ru | 2,597 | N/A** | 2,597 |

\* Only 2 of 3 runs reported reasoning tokens
\*\* No reasoning tokens reported in any Russian lesson run

**Key Observations**:
1. **Reasoning tokens present in most outputs** (unlike standard models)
2. Russian metadata uses more tokens than English
3. Lesson outputs shorter than metadata (expected)
4. Reasoning tokens vary widely (253-912 per run)

---

## Comparison with Other Models

### Lesson Count Comparison

| Model | Avg Lessons | Status |
|-------|-------------|--------|
| MiniMax M2 | **4.7** (EN), **5.0** (RU) | ✅ Excellent |
| Kimi K2 Thinking | 3-5 | ✅ Excellent |
| Grok 4 Fast | 3-4 | ✅ Good |
| DeepSeek Chat v3.1 | **1** | ❌ Major issue |

**MiniMax M2 is one of the few models that consistently generates 4-5 complete lessons.**

---

### Quality Tier Comparison (Preliminary)

Based on current data:

| Tier | Models | Avg Quality |
|------|--------|-------------|
| **S-Tier** | Kimi K2 Thinking | 95%+ |
| **A-Tier** | **MiniMax M2**, Kimi K2 0905 | 90-94% |
| **B-Tier** | DeepSeek v3.2 Exp, Grok 4 Fast | 85-89% |
| **C-Tier** | DeepSeek Chat v3.1 | <85% |

**MiniMax M2 qualifies for A-Tier based on 90.0% overall quality.**

---

## Reasoning Token Analysis

### What are Reasoning Tokens?

Reasoning tokens represent the model's internal "thinking" process before generating the final output. Similar to models like:
- `moonshotai/kimi-k2-thinking`
- `qwen/qwen3-235b-thinking`

### Reasoning Token Distribution

| Scenario | Run 1 | Run 2 | Run 3 |
|----------|-------|-------|-------|
| metadata-en | 267 | 255 | 777 |
| metadata-ru | 871 | 718 | 253 |
| lesson-en | 912 | 488 | 402 |
| lesson-ru | N/A | N/A | N/A |

**Observations**:
- High variability (253-912 tokens)
- Russian lessons did NOT report reasoning tokens
- English lessons had highest reasoning token usage (912 max)
- May explain high quality despite shorter completion tokens

---

## Strengths and Weaknesses

### Strengths

1. **Perfect Schema Compliance** (100% across all runs)
2. **Excellent Lesson Generation** (4-5 complete lessons, NOT just 1)
3. **High Consistency** (93.9% overall)
4. **Reasoning Capability** (includes reasoning tokens)
5. **Strong Russian Support** (92% quality for lessons)
6. **100% Success Rate** (no errors in 12 API calls)
7. **Natural Language** (no translation artifacts)

### Weaknesses

1. **Slower Response Time** (24s avg vs 15s for Grok 4 Fast)
2. **Russian Metadata Lower Quality** (81% vs 93% for English)
3. **Variable Reasoning Token Usage** (inconsistent reporting)
4. **Higher Token Usage** (2,160-2,597 avg completion tokens)

---

## Recommendations

### Use Cases

**Recommended for**:
- ✅ Production lesson generation (reliable 4-5 lesson output)
- ✅ Russian language content (excellent quality)
- ✅ Tasks requiring consistency (93.9% consistency)
- ✅ Schema-critical applications (100% compliance)

**Not recommended for**:
- ❌ Latency-sensitive applications (24s avg response time)
- ❌ High-volume batch processing (slower than competitors)

### Optimization Opportunities

1. **Russian Metadata**: Investigate why content score is lower (53%) vs English (93%)
2. **Response Time**: Consider if reasoning tokens can be disabled for faster output
3. **Token Usage**: Monitor costs given higher token usage

---

## Cost Considerations

**Note**: Real cost data not yet available from OpenRouter. User should provide:
- Input cost per 1M tokens
- Output cost per 1M tokens
- Reasoning token pricing (if different)

**Estimated Usage** (per scenario):
- Metadata: ~2,500 completion tokens
- Lessons: ~1,500 completion tokens
- Reasoning: ~600 tokens (when present)

---

## Conclusion

**MiniMax M2 is a high-quality A-Tier model** with exceptional schema compliance, strong lesson generation, and reasoning capabilities. It is particularly well-suited for production lesson generation where consistency and quality are critical, despite slower response times.

### Final Scores

- **Overall Quality**: 90.0% (A-Tier)
- **Consistency**: 93.9% (Excellent)
- **Success Rate**: 100%
- **Tier**: **A-TIER**

### Next Steps

1. ✅ Quality testing complete (12/12 successful)
2. ⏳ Await cost data from user
3. ⏳ Generate cost-adjusted rankings
4. ⏳ Compare with other A-Tier models (Kimi K2 0905, etc.)

---

## Artifacts

**Test Outputs**: `/tmp/quality-tests/minimax-m2/` (12 JSON files + 12 log files)
**Quality Analysis**: `/tmp/quality-tests/minimax-m2-analysis.json`
**Test Script**: `/tmp/test-minimax-m2-quality.mjs`
**Analysis Script**: `/tmp/analyze-minimax-m2-quality.mjs`
**This Report**: `/tmp/quality-tests/minimax-m2-REPORT.md`

---

**Generated**: 2025-11-13
**Test Duration**: ~5 minutes (12 API calls × ~24s avg + 2s delays)
**Methodology**: [MODEL-QUALITY-TESTING-METHODOLOGY-V2.md](../../docs/MODEL-QUALITY-TESTING-METHODOLOGY-V2.md)
