# Инструкция: Запуск Второго Прогона Тестирования (v2)

**Дата**: 2025-11-13
**Тест ID**: 2025-11-13-v2-quality-eval
**Цель**: Повторное тестирование всех 11 моделей для проверки consistency и сравнения с результатами v1

---

## ✅ Подготовка (обязательно!)

### 1. Проверить API ключ OpenRouter

```bash
echo $OPENROUTER_API_KEY
```

Если пусто - установить:

```bash
export OPENROUTER_API_KEY="your-api-key-here"
```

### 2. Создать output директорию

```bash
mkdir -p .tmp/quality-tests-v2
```

### 3. Проверить конфигурацию

```bash
cat docs/llm-testing/test-config-2025-11-13-v2.json
```

**Важно**: Убедитесь что:

- ✅ `outputDirectory`: `.tmp/quality-tests-v2` (НЕ `/tmp`)
- ✅ `testRunId`: `2025-11-13-v2-quality-eval` (v2!)
- ✅ `runsPerScenario`: 3
- ✅ `temperature`: 0.7
- ✅ `maxTokens`: 8000

---

## 🚀 Запуск Тестирования

### Вариант 1: Через агента llm-quality-tester

**Команда для Claude Code**:

```
@llm-quality-tester запусти тестирование по конфигу docs/llm-testing/test-config-2025-11-13-v2.json
```

Агент автоматически:

1. ✅ Загрузит конфигурацию
2. ✅ Создаст output директорию
3. ✅ Запустит 132 API вызова (11 моделей × 4 сценария × 3 прогона)
4. ✅ Сохранит все JSON outputs
5. ✅ Проведет quality analysis
6. ✅ Создаст rankings
7. ✅ Сгенерирует отчеты

**Ожидаемое время**: 60-90 минут

---

### Вариант 2: Вручную (если агент недоступен)

#### Шаг 1: Создать тестовый скрипт

Создайте файл `scripts/run-llm-quality-tests-v2.ts`:

```typescript
import { promises as fs } from 'fs';
import fetch from 'node-fetch';

// Load config
const configPath = 'docs/llm-testing/test-config-2025-11-13-v2.json';
const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));

// Create output directory
await fs.mkdir(config.outputDirectory, { recursive: true });

// For each model
for (const model of config.models) {
  console.log(`\n=== Testing ${model.name} (${model.slug}) ===\n`);

  await fs.mkdir(`${config.outputDirectory}/${model.slug}`, { recursive: true });

  // For each scenario
  for (const scenario of config.testScenarios) {
    // For each run
    for (let run = 1; run <= config.testParameters.runsPerScenario; run++) {
      const startTime = Date.now();

      try {
        // Build prompt based on entity type
        const prompt =
          scenario.entityId === 'metadata'
            ? buildMetadataPrompt(scenario)
            : buildLessonPrompt(scenario);

        // Call OpenRouter API
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://ai.megacampus.ru',
            'X-Title': 'MegaCampus LLM Quality Testing v2',
          },
          body: JSON.stringify({
            model: model.apiName,
            messages: [{ role: 'user', content: prompt }],
            temperature: config.testParameters.temperature,
            max_tokens: config.testParameters.maxTokens,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        const content = data.choices[0].message.content;
        const duration = Date.now() - startTime;

        // Save output
        const outputPath = `${config.outputDirectory}/${model.slug}/${scenario.id}-run${run}.json`;
        await fs.writeFile(outputPath, content, 'utf-8');

        // Save log
        const logPath = `${config.outputDirectory}/${model.slug}/${scenario.id}-run${run}.log`;
        await fs.writeFile(
          logPath,
          JSON.stringify(
            {
              model: model.name,
              modelSlug: model.slug,
              scenario: scenario.id,
              runNumber: run,
              duration,
              timestamp: new Date().toISOString(),
              contentLength: content.length,
              tokenUsage: data.usage,
            },
            null,
            2
          ),
          'utf-8'
        );

        console.log(
          `[${model.slug}] ${scenario.id} run ${run}/${config.testParameters.runsPerScenario}... ✓ ${duration}ms`
        );
      } catch (error) {
        const duration = Date.now() - startTime;

        // Save error
        const errorPath = `${config.outputDirectory}/${model.slug}/${scenario.id}-run${run}-ERROR.json`;
        await fs.writeFile(
          errorPath,
          JSON.stringify(
            {
              model: model.name,
              modelSlug: model.slug,
              scenario: scenario.id,
              runNumber: run,
              error: error.message,
              timestamp: new Date().toISOString(),
              duration,
            },
            null,
            2
          ),
          'utf-8'
        );

        console.log(
          `[${model.slug}] ${scenario.id} run ${run}/${config.testParameters.runsPerScenario}... ✗ ${error.message}`
        );
      }

      // Wait between requests
      await new Promise(resolve => setTimeout(resolve, config.testParameters.waitBetweenRequests));
    }
  }
}

console.log('\n✅ All tests complete!');
console.log(`📁 Results saved to: ${config.outputDirectory}`);

function buildMetadataPrompt(scenario) {
  return `You are an expert course designer creating comprehensive course metadata.

**CRITICAL REQUIREMENTS:**
1. Output ONLY valid JSON with snake_case field names (NOT camelCase)
2. NO markdown code blocks, NO explanations, NO extra text
3. All text content must be in ${scenario.language === 'en' ? 'English' : 'Russian'}
4. Follow the exact schema below

**Course Title**: ${scenario.title}

**Course Description**: ${scenario.description}

**Required JSON Schema:**
{
  "course_title": "string (use provided title)",
  "course_description": "string (detailed, 200+ chars)",
  "course_overview": "string (comprehensive, 500+ chars with specific examples)",
  "target_audience": "string (define specific personas)",
  "estimated_duration_hours": number,
  "difficulty_level": "beginner" | "intermediate" | "advanced",
  "prerequisites": ["string array"],
  "learning_outcomes": [
    "string (use action verbs: Define, Build, Analyze, NOT Learn/Understand)",
    "string (follow Bloom's Taxonomy)",
    "string (make measurable and specific)"
  ],
  "course_tags": ["string array"]
}

**Quality Requirements:**
- learning_outcomes: 3-8 outcomes, use action verbs (Define, Build, Create, Analyze), follow Bloom's Taxonomy
- course_overview: 500+ characters with specific examples and structure
- target_audience: Define specific personas with backgrounds
- All field names MUST use snake_case

Output the JSON directly (no markdown, no explanations):`;
}

function buildLessonPrompt(scenario) {
  return `You are an expert course designer creating detailed lesson structure for a course section.

**CRITICAL REQUIREMENTS:**
1. Output ONLY valid JSON with snake_case field names (NOT camelCase)
2. Generate 3-5 complete lessons (NOT just 1!)
3. All text content must be in ${scenario.language === 'en' ? 'English' : 'Russian'}
4. NO markdown code blocks, NO explanations

**Section Title**: ${scenario.title}

**Section Description**: ${scenario.description}

**Required JSON Schema:**
{
  "section_number": 1,
  "section_title": "string (use provided title)",
  "section_description": "string (detailed overview)",
  "learning_objectives": [
    "string (measurable objectives with action verbs)"
  ],
  "lessons": [
    {
      "lesson_number": 1,
      "lesson_title": "string (specific, not generic 'Introduction to...')",
      "lesson_objective": "string (measurable, specific)",
      "key_topics": ["string array (specific topics, not generic)"],
      "exercises": [
        {
          "exercise_title": "string",
          "exercise_instructions": "string (clear, actionable)"
        }
      ]
    },
    {
      "lesson_number": 2,
      "lesson_title": "...",
      ...
    },
    {
      "lesson_number": 3,
      "lesson_title": "...",
      ...
    }
    // Generate 3-5 lessons total!
  ]
}

**Quality Requirements:**
- Generate 3-5 complete lessons (lesson_number: 1, 2, 3, 4, 5)
- Each lesson must have objectives, key_topics, exercises
- Objectives must be measurable (students will be able to...)
- Topics must be specific (avoid "Introduction to X", "Overview of Y")
- All field names MUST use snake_case

Output the JSON directly (no markdown, no explanations):`;
}
```

#### Шаг 2: Запустить скрипт

```bash
cd /home/me/code/megacampus2-worktrees/generation-json
pnpm tsx scripts/run-llm-quality-tests-v2.ts
```

---

## 📊 Что будет создано

### Структура output директории:

```
.tmp/quality-tests-v2/
├── kimi-k2-0905/
│   ├── metadata-en-run1.json
│   ├── metadata-en-run1.log
│   ├── metadata-en-run2.json
│   ├── metadata-en-run2.log
│   ├── metadata-en-run3.json
│   ├── metadata-en-run3.log
│   ├── metadata-ru-run1.json
│   ├── metadata-ru-run1.log
│   ├── metadata-ru-run2.json
│   ├── metadata-ru-run2.log
│   ├── metadata-ru-run3.json
│   ├── metadata-ru-run3.log
│   ├── lesson-en-run1.json
│   ├── lesson-en-run1.log
│   ├── lesson-en-run2.json
│   ├── lesson-en-run2.log
│   ├── lesson-en-run3.json
│   ├── lesson-en-run3.log
│   ├── lesson-ru-run1.json
│   ├── lesson-ru-run1.log
│   ├── lesson-ru-run2.json
│   ├── lesson-ru-run2.log
│   ├── lesson-ru-run3.json
│   └── lesson-ru-run3.log
├── kimi-k2-thinking/
│   └── (same structure)
├── deepseek-v32-exp/
│   └── (same structure)
├── deepseek-chat-v31/
│   └── (same structure)
├── grok-4-fast/
│   └── (same structure)
├── glm-46/
│   └── (same structure)
├── minimax-m2/
│   └── (same structure)
├── qwen3-32b/
│   └── (same structure)
├── qwen3-235b-thinking/
│   └── (same structure)
├── oss-120b/
│   └── (same structure)
├── qwen3-235b-a22b/
│   └── (same structure)
├── quality-analysis-report-v2.json       (создается агентом после анализа)
├── quality-rankings-v2.md                (создается агентом после анализа)
├── v1-vs-v2-comparison.md                (сравнение с первым прогоном)
└── test-execution-report-v2.md           (финальный отчет)
```

**Всего файлов**:

- 132 JSON outputs (11 моделей × 4 сценария × 3 прогона)
- 132 LOG files
- ~10-20 ERROR files (для failed tests)
- 4 отчета

---

## 📈 После завершения тестирования

### 1. Проверить результаты

```bash
# Количество успешных outputs
find .tmp/quality-tests-v2 -name "*.json" ! -name "*ERROR*" | wc -l
# Должно быть: 132

# Количество ошибок
find .tmp/quality-tests-v2 -name "*ERROR*.json" | wc -l
# Должно быть: минимальное (0-10)
```

### 2. Запустить quality analysis

Агент автоматически создаст:

- `quality-analysis-report-v2.json` - детальные метрики качества
- `quality-rankings-v2.md` - рейтинги по metadata и lessons отдельно

### 3. Сравнить v1 vs v2

```bash
# Создать comparison report
# Агент автоматически сравнит:
# - Quality scores (v1 vs v2)
# - Consistency между прогонами
# - Reliability changes
# - Schema compliance
```

### 4. Проверить ключевые метрики

**Для каждой модели**:

- ✅ Success rate (должен быть близок к v1)
- ✅ Quality score (variance < 5%)
- ✅ Consistency score (high = good)
- ✅ Schema compliance (100% или как в v1)

---

## 🎯 Критерии успеха v2 теста

Тест считается успешным если:

1. ✅ Все 132 API вызова выполнены
2. ✅ Success rate ≥ 90% (110+ успешных outputs)
3. ✅ Quality scores близки к v1 (±5%)
4. ✅ Consistency между v1 и v2 высокая (≥0.85)
5. ✅ Все отчеты созданы
6. ✅ Рейтинги соответствуют v1 (топ-3 модели те же)

---

## ⚠️ Важные замечания

### Про output директорию:

- **v1 results**: `/specs/008-generation-generation-json/quality-tests/`
- **v2 results**: `.tmp/quality-tests-v2/`
- **НЕ смешивать!** - это два независимых прогона

### Про модели с известными проблемами:

1. **Qwen3 32B**: Ожидаем 50% markdown wrapper issue
2. **Qwen3 235B A22B**: Ожидаем 83% failure rate
3. **OSS 120B**: Ожидаем failures на английском
4. **Grok 4 Fast**: Может потребоваться API ключ

### Про сравнение результатов:

После v2 теста создать:

```
docs/llm-testing/v1-vs-v2-consistency-report.md
```

С секциями:

- Quality score variance
- Models that improved/worsened
- Consistency analysis
- Recommended models (confirmed by both tests)

---

## 🔍 Troubleshooting

### Проблема: API ключ не найден

```bash
# Проверить:
echo $OPENROUTER_API_KEY

# Установить:
export OPENROUTER_API_KEY="sk-or-v1-..."
```

### Проблема: Rate limiting (429 errors)

Агент автоматически:

- Ждет 2s между запросами
- Exponential backoff при 429
- Максимум 30s wait

### Проблема: Модель не отвечает (timeout)

Агент:

- Default timeout: 60s
- Retry с 90s timeout
- Если fails снова: mark as ERROR, continue

### Проблема: JSON parsing error

Агент:

- Сохраняет raw output
- Marks as "invalid JSON"
- Включает в error report
- Продолжает тестирование

---

## 📝 Чек-лист перед запуском

- [ ] API ключ установлен (`OPENROUTER_API_KEY`)
- [ ] Конфигурация v2 создана (`test-config-2025-11-13-v2.json`)
- [ ] Output директория указана: `.tmp/quality-tests-v2`
- [ ] v1 results не будут перезаписаны
- [ ] Есть ~60-90 минут для полного прогона
- [ ] Достаточно API credits в OpenRouter

---

**Готово к запуску!**

Команда для запуска:

```
@llm-quality-tester запусти тестирование по конфигу docs/llm-testing/test-config-2025-11-13-v2.json
```
