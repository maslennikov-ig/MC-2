# LLM Benchmark Scoring System (Система балльной оценки)

**Version**: 2.0.0
**Date**: 2026-01-29
**Status**: Active

---

## Обзор

Система балльной оценки для объективного сравнения качества генерации LLM моделей. Использует **условные баллы** вместо процентов для возможности отслеживать улучшение моделей без ограничения потолком в 100%.

---

## Ключевые принципы

### 1. Баллы вместо процентов

**Проблема процентов:**

- Потолок 100% — модели становятся лучше, но мы не можем это отразить
- DeepSeek V3.2 сегодня = 95%, через год будет GPT-5 на 150% лучше — как показать?

**Решение — условные баллы:**

- Базовая шкала 0-100 баллов для текущего уровня моделей
- Возможность набрать >100 баллов за исключительное качество
- Со временем "планка" растёт — то, что сейчас 90 баллов, через год будет 70

### 2. Сравнение только в рамках одного теста

- Нельзя сравнивать модели из разных тестовых сессий
- Каждый тест имеет уникальный `test_session_id`
- Лидерборд фильтруется по конкретному тесту/дате

### 3. Полные результаты доступны для просмотра

- Хранится полный текст сгенерированного контента
- Пользователь может прочитать и сравнить вручную
- LLM-Judge оценивает, но решение за человеком

---

## Критерии оценки

### Основные критерии (0-100 базовых баллов)

| Критерий                    | Макс. баллов | Вес      | Описание                                    |
| --------------------------- | ------------ | -------- | ------------------------------------------- |
| **Смысловое качество**      | 35           | 35%      | Глубина, корректность, полнота контента     |
| **Практическая ценность**   | 25           | 25%      | Примеры, кейсы, применимость на практике    |
| **Соответствие заданию**    | 15           | 15%      | Следование промпту, формату, структуре      |
| **Отсутствие галлюцинаций** | 10           | 10%      | Фактическая точность, нет выдуманных данных |
| **Структура и навигация**   | 10           | 10%      | Логика изложения, scaffolding, связность    |
| **Визуализация (графика)**  | 5            | 5%       | Качество Mermaid диаграмм, релевантность    |
| **ИТОГО**                   | **100**      | **100%** | Базовый максимум                            |

### Бонусные баллы (за исключительное качество)

| Бонус                  | Баллов | Условие                               |
| ---------------------- | ------ | ------------------------------------- |
| **Креативные примеры** | +5-10  | Оригинальные, запоминающиеся аналогии |
| **Экспертная глубина** | +5-15  | Детали, которые не ожидаешь от AI     |
| **Безупречный стиль**  | +5     | Текст читается как от профессионала   |
| **Инсайты**            | +5-10  | Неожиданные полезные выводы           |

**Теоретический максимум**: ~140 баллов (но реально >110 редкость)

### Штрафные баллы (за критические проблемы)

| Штраф                  | Баллов  | Условие                           |
| ---------------------- | ------- | --------------------------------- |
| **Фактические ошибки** | -10 per | Неверная информация               |
| **Галлюцинации**       | -15 per | Выдуманные факты, ссылки          |
| **Нарушение формата**  | -5      | Неправильный JSON, Mermaid        |
| **Обрыв контента**     | -10     | Незаконченные предложения         |
| **Смена языка**        | -10     | Переключение RU↔EN внутри текста |

---

## Детализация критериев

### 1. Смысловое качество (0-35 баллов) — ГЛАВНЫЙ КРИТЕРИЙ

**Оценивается:**

- Глубина раскрытия темы
- Корректность информации
- Полнота покрытия материала
- Логические связи между концепциями
- Уровень экспертизы

**Шкала:**

- **32-35**: Экспертный уровень — глубже чем учебники, уникальные инсайты
- **26-31**: Отличная глубина — все ключевые аспекты, хорошая детализация
- **20-25**: Хорошо — основное раскрыто, но без wow-эффекта
- **14-19**: Базово — поверхностно, много пропусков
- **7-13**: Слабо — очень поверхностно, мало полезного
- **0-6**: Плохо — пустой или некорректный контент

**Вопросы для оценки:**

- Можно ли по этому материалу реально научиться теме?
- Есть ли все необходимые концепции для понимания?
- Адекватна ли глубина для целевой аудитории?

### 2. Практическая ценность (0-25 баллов)

**Оценивается:**

- Конкретные примеры и кейсы
- Actionable советы и алгоритмы
- Применимость в реальной работе
- Связь теории с практикой
- Задания для закрепления

**Шкала:**

- **23-25**: Отлично — сразу можно применить, реальные кейсы из индустрии
- **18-22**: Хорошо — хорошие примеры, понятно как использовать
- **13-17**: Нормально — примеры есть, но абстрактные
- **7-12**: Слабо — мало практики, в основном теория
- **0-6**: Плохо — чистая теория без применения

**Вопросы для оценки:**

- Может ли студент применить это завтра на работе?
- Понятно ли, как решать конкретные задачи?
- Есть ли шаги/алгоритмы действий?

### 3. Соответствие заданию (0-15 баллов)

**Оценивается:**

- Выполнение всех требований промпта
- Соблюдение формата (JSON schema)
- Правильная структура разделов
- Целевая аудитория учтена
- Соответствие языку (RU/EN)

**Шкала:**

- **14-15**: Идеально — все требования выполнены
- **11-13**: Хорошо — почти всё, мелкие отклонения
- **8-10**: Нормально — основное выполнено, часть пропущена
- **4-7**: Слабо — много не соответствует заданию
- **0-3**: Плохо — проигнорировано задание

**Проверяется автоматически:**

- JSON schema validation
- Наличие обязательных полей
- Формат Mermaid диаграмм
- Языковая консистентность

### 4. Отсутствие галлюцинаций (0-10 баллов)

**Оценивается:**

- Фактическая корректность утверждений
- Отсутствие выдуманных цифр/статистик
- Корректные ссылки (если есть)
- Логическая непротиворечивость
- Нет "уверенного вранья"

**Шкала:**

- **10**: Безупречно — всё проверяемо и корректно
- **8-9**: Отлично — нет явных галлюцинаций
- **6-7**: Хорошо — мелкие неточности
- **3-5**: Проблемы — есть сомнительные утверждения
- **0-2**: Критично — явные галлюцинации

**Типичные галлюцинации:**

- "Исследование 2023 года показало..." (без источника)
- Конкретные цифры/проценты без обоснования
- Несуществующие термины/методологии
- Искажение известных концепций

### 5. Структура и навигация (0-10 баллов)

**Оценивается:**

- Логическая последовательность изложения
- Scaffolding (от простого к сложному)
- Наличие введения и выводов
- Связи между разделами
- Подзаголовки и навигация

**Шкала:**

- **10**: Идеально — чёткая структура, легко читается
- **8-9**: Хорошо — структура есть, мелкие недочёты
- **6-7**: Нормально — понятно, но путанно местами
- **3-5**: Слабо — хаотичная структура
- **0-2**: Плохо — поток сознания, нет структуры

### 6. Визуализация и графика (0-5 баллов)

**Оценивается:**

- Качество Mermaid диаграмм
- Релевантность визуализаций
- Правильный синтаксис
- Помогает ли понять материал
- Нет лишних/бесполезных схем

**Шкала:**

- **5**: Отлично — диаграммы помогают понять, синтаксис верный
- **4**: Хорошо — полезные визуализации, мелкие недочёты
- **3**: Нормально — есть, но не особо помогают
- **1-2**: Слабо — синтаксические ошибки или неуместны
- **0**: Нет диаграмм или все сломаны

**Проверяется автоматически:**

- Mermaid syntax validation
- Escaped quotes detection (`\"`)
- Unclosed brackets

---

## LLM-Judge: Процесс оценки

### Модели-судьи

Используется CLEV Voting (2 судьи + tiebreaker при разногласии):

| Роль            | Модель                            | Когда используется |
| --------------- | --------------------------------- | ------------------ |
| Primary Judge   | `deepseek/deepseek-v3.1-terminus` | Всегда             |
| Secondary Judge | `qwen/qwen3-235b-a22b-2507`       | Всегда             |
| Tiebreaker      | `moonshotai/kimi-k2-0905`         | При разнице >15%   |

### Промпт для судьи

```
You are an expert content quality evaluator. Rate the following generated content using EXACT criteria and point scale.

## Criteria (100 base points max):

1. **Content Depth (0-30 points)**
   - 25-30: Expert-level, exceeds expectations
   - 20-24: Good depth, all key aspects covered
   - 15-19: Basic coverage, somewhat shallow
   - 10-14: Weak depth, many gaps
   - 0-9: Very superficial

2. **Practical Value (0-25 points)**
   - 22-25: Immediately actionable, excellent cases
   - 18-21: Good examples, clear application
   - 12-17: Examples present but abstract
   - 6-11: Mostly theory, little practice
   - 0-5: Pure theory, no examples

3. **Structure & Logic (0-20 points)**
   - 18-20: Perfect structure, easy to follow
   - 14-17: Good structure, minor issues
   - 10-13: Structure exists but confusing
   - 5-9: Weak structure, chaotic
   - 0-4: No structure

4. **Language Quality (0-15 points)**
   - 14-15: Flawless, editor-level
   - 11-13: Very good, minimal edits needed
   - 7-10: Good but rough edges
   - 4-6: Many errors, awkward phrases
   - 0-3: Hard to read, serious errors

5. **Task Compliance (0-10 points)**
   - 9-10: Perfect match to requirements
   - 7-8: Almost all, minor deviations
   - 5-6: Main part done, some missed
   - 2-4: Much doesn't match
   - 0-1: Off-topic, ignored task

## Bonuses (can exceed 100):
- Creative examples: +5-10
- Expert insights: +5-15
- Perfect style: +5
- Unexpected valuable insights: +5-10

## Penalties:
- Factual errors: -10 each
- Hallucinations: -15 each
- Format violations: -5
- Truncated content: -10
- Language switching: -10

---

**CONTENT TO EVALUATE:**
{content}

---

**OUTPUT FORMAT (JSON):**
{
  "scores": {
    "contentDepth": <0-30>,
    "practicalValue": <0-25>,
    "structureLogic": <0-20>,
    "languageQuality": <0-15>,
    "taskCompliance": <0-10>
  },
  "bonuses": [
    { "type": "creative_examples", "points": <0-10>, "reason": "..." }
  ],
  "penalties": [
    { "type": "factual_error", "points": <-10>, "reason": "..." }
  ],
  "totalScore": <calculated>,
  "tier": "<S|A|B|C|D>",
  "summary": "<2-3 sentence summary>",
  "strengths": ["..."],
  "weaknesses": ["..."]
}
```

### Tier система (по баллам)

| Tier  | Баллов | Рекомендация  |
| ----- | ------ | ------------- |
| **S** | ≥95    | Primary model |
| **A** | 80-94  | Production    |
| **B** | 65-79  | With review   |
| **C** | 50-64  | Fallback only |
| **D** | <50    | Do not use    |

---

## Структура данных

### Таблица `llm_model_benchmarks` (обновлённая)

```sql
-- Новые поля для балльной системы
ALTER TABLE llm_model_benchmarks ADD COLUMN IF NOT EXISTS
  score_content_depth INTEGER,
  score_practical_value INTEGER,
  score_structure_logic INTEGER,
  score_language_quality INTEGER,
  score_task_compliance INTEGER,
  score_bonuses INTEGER DEFAULT 0,
  score_penalties INTEGER DEFAULT 0,
  total_points INTEGER,  -- Итоговые баллы
  test_session_id UUID;  -- Для группировки по тесту
```

### Таблица `llm_benchmark_samples` (полные результаты)

```sql
CREATE TABLE llm_benchmark_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  benchmark_id UUID REFERENCES llm_model_benchmarks(id),
  test_session_id UUID NOT NULL,

  -- Контент
  scenario TEXT NOT NULL,  -- 'full-generation', 'lesson-en', etc.
  input_prompt TEXT,
  output_content TEXT NOT NULL,  -- Полный сгенерированный текст

  -- Оценки от судей
  judge_scores JSONB,  -- { primary: {...}, secondary: {...}, tiebreaker: {...} }
  final_score INTEGER,

  -- Метаданные
  model_slug TEXT NOT NULL,
  language TEXT NOT NULL,
  word_count INTEGER,
  generation_time_ms INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Workflow тестирования

### 1. Запуск теста

```bash
# Через CLI
pnpm benchmark-llm test <model-slug> --scenario full-generation

# Или скилл
/test-model deepseek/deepseek-v3.2 --scenario full-generation
```

### 2. Генерация контента

Модель генерирует контент по стандартному промпту (Full Generation test).

### 3. Оценка LLM-Judge

1. Heuristic filter (бесплатно) — отсев явного брака
2. CLEV Voting — 2 судьи оценивают
3. При разнице >15% — tiebreaker
4. Финальный score = среднее взвешенное

### 4. Сохранение результатов

- Полный контент → `llm_benchmark_samples`
- Агрегированные scores → `llm_model_benchmarks`
- Обновление leaderboard

### 5. Просмотр на UI

- Страница `/benchmarks` показывает leaderboard
- Фильтр по test_session (сравнение только внутри сессии)
- Клик по модели → полный текст результата

---

## Интеграция со скиллом

Скилл `llm-quality-tester` (`.claude/skills/llm-quality-tester/SKILL.md`) автоматизирует:

1. Запуск генерации на целевой модели
2. Вызов LLM-Judge для оценки
3. Сохранение в Supabase
4. Обновление LEADERBOARD.md

---

## Примеры оценок

### Пример 1: Отличный результат (92 балла, A-tier)

```json
{
  "scores": {
    "contentDepth": 28,
    "practicalValue": 23,
    "structureLogic": 18,
    "languageQuality": 13,
    "taskCompliance": 10
  },
  "bonuses": [],
  "penalties": [],
  "totalScore": 92,
  "tier": "A"
}
```

### Пример 2: Хороший результат с бонусом (105 баллов, S-tier)

```json
{
  "scores": {
    "contentDepth": 29,
    "practicalValue": 24,
    "structureLogic": 19,
    "languageQuality": 14,
    "taskCompliance": 9
  },
  "bonuses": [
    { "type": "expert_insights", "points": 10, "reason": "Unique ABC/XYZ analysis framework" }
  ],
  "penalties": [],
  "totalScore": 105,
  "tier": "S"
}
```

### Пример 3: Слабый результат со штрафом (48 баллов, D-tier)

```json
{
  "scores": {
    "contentDepth": 15,
    "practicalValue": 12,
    "structureLogic": 10,
    "languageQuality": 8,
    "taskCompliance": 8
  },
  "bonuses": [],
  "penalties": [{ "type": "hallucination", "points": -15, "reason": "Invented statistics" }],
  "totalScore": 48,
  "tier": "D"
}
```

---

## Связанные документы

- [LLM Judge System](/docs/STAGE6-LLM-JUDGE-SYSTEM.md)
- [Model Selection Decisions](/docs/MODEL-SELECTION-DECISIONS.md)
- [Benchmark CLI](/packages/course-gen-platform/scripts/benchmark-llm/)
- [Quality Tester Skill](/.claude/skills/llm-quality-tester/SKILL.md)

---

**Last updated**: 2026-01-29
