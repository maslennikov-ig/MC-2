# План: Скилл для тестирования LLM моделей

## Цель

Создать скилл `/model-benchmark`, который:

1. Тестирует новые модели на стандартном наборе задач
2. Сохраняет результаты в централизованное хранилище (git-tracked)
3. Позволяет сравнивать с лидером (benchmark model)
4. Избавляет от повторной полной переоценки всех моделей

## Архитектура решения

### 1. Структура хранения результатов

```
docs/reports/model-benchmarks/
├── model-ratings.json          # Актуальный рейтинг всех протестированных моделей
├── 2026-01-28/
│   ├── deepseek-deepseek-v3.2.json
│   ├── xiaomi-mimo-v2-flash.json
│   └── z-ai-glm-4.7-flash.json
└── 2026-01-27/
    └── ...
```

### 2. Формат model-ratings.json (centralized ratings)

```json
{
  "version": "1.0",
  "lastUpdated": "2026-01-28T16:00:00.000Z",
  "benchmark": {
    "model": "deepseek/deepseek-v3.2",
    "qualityScore": 9.0,
    "reason": "Best content quality, strategic depth"
  },
  "models": [
    {
      "model": "deepseek/deepseek-v3.2",
      "slug": "deepseek-deepseek-v3.2",
      "lastTested": "2026-01-28T16:00:00.000Z",
      "qualityScore": 9.0,
      "automatedScore": 0.95,
      "speedScore": 0.4,
      "costScore": 0.6,
      "recommendation": "production",
      "tier": "S",
      "notes": "Лучшее качество контента, но самый медленный"
    },
    {
      "model": "xiaomi/mimo-v2-flash",
      "slug": "xiaomi-mimo-v2-flash",
      "lastTested": "2026-01-28T16:00:00.000Z",
      "qualityScore": 8.0,
      "automatedScore": 0.92,
      "speedScore": 0.95,
      "costScore": 0.8,
      "recommendation": "production",
      "tier": "A",
      "notes": "Оптимальный баланс скорость/качество"
    }
  ]
}
```

### 3. Формат результата теста (per-model JSON)

```json
{
  "model": "z-ai/glm-4.7-flash",
  "testedAt": "2026-01-28T16:36:58.382Z",
  "testType": "full-lesson",
  "lesson": "Импортозамещение",
  "performance": {
    "durationMs": 118700,
    "totalTokens": 10618,
    "tokensPerSecond": 89.4,
    "sectionsGenerated": 2
  },
  "validation": {
    "promptMarkers": 0,
    "foreignCharacters": 0,
    "mermaidIssues": 0,
    "duplicateSections": 0,
    "mermaidDiagrams": 2
  },
  "automatedScore": 0.92,
  "comparisonToBenchmark": {
    "benchmarkModel": "deepseek/deepseek-v3.2",
    "qualityDelta": -2.5,
    "speedDelta": +1.8,
    "verdict": "Быстрее, но качество ниже"
  },
  "manualEvaluation": {
    "qualityScore": 6.5,
    "evaluatedBy": "claude",
    "evaluatedAt": "2026-01-28T17:00:00.000Z",
    "notes": "LaTeX формулы не рендерятся, англицизмы в русском тексте"
  }
}
```

## Скилл: /model-benchmark

### Файл: `.claude/skills/model-benchmark/SKILL.md`

```markdown
---
name: model-benchmark
description: Тестирование LLM моделей для генерации уроков. Запускает стандартные тесты, сравнивает с benchmark-лидером, сохраняет результаты для переиспользования.
allowed-tools: Bash, Read, Write, Task
---

# Model Benchmark

Тестирование и рейтинг LLM моделей для генерации образовательного контента.

## When to Use

- Тестирование новой модели
- Обновление рейтинга после изменения параметров
- Сравнение нескольких моделей
- Проверка модели перед переключением в production

## Input

Вызов: `/model-benchmark <model-id>`

Примеры:

- `/model-benchmark z-ai/glm-4.7-flash`
- `/model-benchmark google/gemini-2.5-flash --compare-only`
- `/model-benchmark --list` (показать текущий рейтинг)

## Process

1. **Загрузка рейтингов** → Read `model-ratings.json`
2. **Проверка кэша** → Если модель уже тестировалась сегодня, спросить о пересдаче
3. **Запуск теста** → Bash `test-full-lesson-generation.ts --models <model>`
4. **Чтение результатов** → Read `.tmp/test-full-generation/<model>/metadata.json`
5. **Ручная оценка** → Прочитать контент, оценить качество по 10-балльной шкале
6. **Сравнение с benchmark** → Вычислить delta относительно лидера
7. **Сохранение** → Write результат в `docs/reports/model-benchmarks/YYYY-MM-DD/<model>.json`
8. **Обновление рейтинга** → Write обновлённый `model-ratings.json`
9. **Отчёт** → Вывести сводку с рекомендацией

## Output

Markdown отчёт со сравнительной таблицей:

| Метрика           | Новая модель | Benchmark | Delta |
| ----------------- | ------------ | --------- | ----- |
| Качество контента | 6.5/10       | 9.0/10    | -2.5  |
| Скорость          | 89 tok/s     | 52 tok/s  | +71%  |
| Валидация         | 100%         | 100%      | =     |

**Рекомендация**: Не рекомендуется для production. Качество ниже лидера.
```

## Критические файлы для модификации

| Файл                                               | Действие                         |
| -------------------------------------------------- | -------------------------------- |
| `.claude/skills/model-benchmark/SKILL.md`          | Создать (новый скилл)            |
| `docs/reports/model-benchmarks/model-ratings.json` | Создать (хранилище рейтингов)    |
| `scripts/test-full-lesson-generation.ts`           | Оставить как есть (уже работает) |

## Шаги реализации

### Шаг 1: Создать структуру директорий

```bash
mkdir -p docs/reports/model-benchmarks/2026-01-28
```

### Шаг 2: Инициализировать model-ratings.json текущими результатами

На основе уже проведённых тестов создать начальный рейтинг.

### Шаг 3: Создать скилл

Файл `.claude/skills/model-benchmark/SKILL.md` с полной документацией.

### Шаг 4: Мигрировать существующие результаты

Перенести данные из `.tmp/test-full-generation/` в новую структуру.

## Формула автоматического скора

```
automatedScore = (
  0.4 * validationScore +      # 0 ошибок = 1.0
  0.3 * speedScore +           # нормализация к max 300s
  0.2 * mermaidScore +         # наличие диаграмм
  0.1 * tokenEfficiency        # tokens per word
)
```

## Tier система

| Tier | Quality Score | Описание                   |
| ---- | ------------- | -------------------------- |
| S    | 9.0+          | Лучшее качество, benchmark |
| A    | 8.0-8.9       | Production-ready           |
| B    | 7.0-7.9       | Приемлемо с оговорками     |
| C    | 6.0-6.9       | Fallback только            |
| D    | <6.0          | Не рекомендуется           |

## Верификация

После реализации:

1. Запустить `/model-benchmark --list` → должен показать текущий рейтинг
2. Запустить `/model-benchmark test-model` → должен выполнить тест и обновить рейтинг
3. Проверить `git status` → новые файлы в `docs/reports/model-benchmarks/`
