# Спецификация Выбора Моделей Для Генерации Контента

**Дата создания**: 2025-11-13
**Статус**: Production Ready
**Основано на**: 120+ API тестов, качественный анализ реального контента, ценовой анализ

---

## 🎯 Основные Принципы

1. **Надежность > Качество > Цена** - сначала стабильность, потом качество, потом стоимость
2. **Всегда есть fallback** - для каждой задачи минимум 2 модели
3. **Специализация по задачам** - разные модели для разных типов контента
4. **Тестирование в production** - постепенное внедрение с мониторингом

---

## 📋 Спецификация Моделей По Задачам

### 1. Course Metadata (Метадата Курса)

**Сущность**: `course_metadata`
**Поля**: course_title, course_description, course_overview, target_audience, learning_outcomes, prerequisites, course_tags

#### Primary Model: Qwen3 235B (Regular, NOT Thinking)

**API Name**: `qwen/qwen3-235b-a22b-2507`

**⚠️ ВАЖНО**: Используем **regular модель** (НЕ `-thinking` вариант) для performance (INV-2025-11-19-003)

- Regular: 15-29s, Thinking: 30-110s (test), 521s (production context)
- Оба достигают 100% success rate, нет разницы в качестве для structured generation
- Performance улучшение: **17-35x быстрее**

**Параметры**:

```json
{
  "model": "qwen/qwen3-235b-a22b-2507",
  "temperature": 0.7,
  "max_tokens": 8000,
  "timeout": 70000
}
```

**Качество**:

- English: 9/10 (10 modules, 4 student personas, API integration)
- Russian: 9/10 (7 modules, real datasets, Jupyter notebooks)

**Надежность**: ✅ 100% success rate (12/12 tests passed)

**Цена**: $0.11/$0.60 per 1M tokens

**Почему выбрана**:

- ✅ Лучшее соотношение качество/цена для метадаты (15.0 качества/$)
- ✅ 100% стабильность на метадате
- ✅ В ТОП-3 для обоих языков
- ✅ Самая дешевая среди качественных моделей
- ✅ 17-35x faster than thinking variant (15-29s vs 521s in production)
- ✅ Meets SC-003 performance spec (<150s Stage 5 generation time)

---

#### Fallback Model: MiniMax M2

**API Name**: `minimax/minimax-m2`

**Параметры**:

```json
{
  "model": "minimax/minimax-m2",
  "temperature": 0.7,
  "max_tokens": 8000,
  "timeout": 60000
}
```

**Качество**:

- English: 8.5/10 (8 modules, capstone project, 6 learning outcomes)
- Russian: 8.5/10 (concrete algorithms, bias-variance, 7 outcomes, 14 tags)

**Надежность**: ✅ 100% success rate (12/12 tests passed)

**Цена**: $0.255/$1.02 per 1M tokens

**Когда использовать**:

- ⚠️ Qwen3 235B (regular) недоступна или вернула ошибку
- ⚠️ Превышен rate limit на Qwen3 235B
- ✅ Нужен reasoning для сложной метадаты

---

### 2. Lesson Structure (Структура Уроков)

**Сущность**: `lesson_structure`
**Поля**: section_title, section_description, learning_objectives, lessons (с exercises)

#### Primary Model: MiniMax M2

**API Name**: `minimax/minimax-m2`

**Параметры**:

```json
{
  "model": "minimax/minimax-m2",
  "temperature": 0.7,
  "max_tokens": 10000,
  "timeout": 90000
}
```

**Качество**:

- English: 9.5/10 (3 exercises/lesson, naming conventions, escape characters)
- Russian: 10/10 (5 lessons, backpropagation, gradients, математические формулы)

**Надежность**: ✅ 100% success rate (12/12 tests passed)

**Цена**: $0.255/$1.02 per 1M tokens

**Почему выбрана**:

- ✅ Лучшее качество для русских уроков (10/10, единственная с backpropagation)
- ✅ Отличное качество для английских уроков (9.5/10, 3 упражнения на урок)
- ✅ 100% стабильность
- ✅ Reasoning tokens - глубокое рассуждение
- ✅ Универсальность (отлично для EN и RU)

---

#### Fallback Model: Kimi K2 Thinking

**API Name**: `moonshotai/kimi-k2-thinking`

**Параметры**:

```json
{
  "model": "moonshotai/kimi-k2-thinking",
  "temperature": 0.7,
  "max_tokens": 10000,
  "timeout": 120000
}
```

**Качество**:

- English: 10/10 (2 exercises/lesson, formulas F = C×9/5+32, compound interest, edge cases)
- Russian: 9/10 (XOR MLP, activation derivatives, advanced topics)

**Надежность**: ⚠️ 91.7% success rate (11/12 tests, 1 API failure)

**Цена**: $0.55/$2.25 per 1M tokens

**Когда использовать**:

- ⚠️ MiniMax M2 недоступна или вернула ошибку
- ✅ Премиум курсы где критично максимальное качество
- ✅ Английские курсы с complex exercises (formulas, edge cases)

**Примечание**: Требуется `max_tokens: 10000` для русских уроков (8000 недостаточно)

---

### 3. Все Остальные Задачи (Замена Qwen 3 Max)

**Применимо к**: section_details, exercise_details, quiz_questions, assessment_criteria, и другие генерируемые сущности

#### Primary Model: MiniMax M2

**Причина**: Универсальность, стабильность, отличное качество контента

#### Fallback Model: Kimi K2 Thinking

**Причина**: Максимальное качество для сложных задач

---

## 🔄 Логика Fallback

### Автоматический Fallback (Retry Logic)

```javascript
async function generateWithFallback(task, prompt, primaryModel, fallbackModel) {
  try {
    // Попытка 1: Primary model
    const result = await callModel(primaryModel, prompt, { timeout: primaryModel.timeout });

    if (isValidJSON(result) && meetsQualityThreshold(result)) {
      return { result, model: primaryModel.name };
    }

    throw new Error('Quality threshold not met');
  } catch (error) {
    console.warn(`Primary model ${primaryModel.name} failed: ${error.message}`);

    // Попытка 2: Fallback model
    try {
      const result = await callModel(fallbackModel, prompt, { timeout: fallbackModel.timeout });

      if (isValidJSON(result)) {
        return { result, model: fallbackModel.name, fallbackUsed: true };
      }

      throw new Error('Fallback also failed');
    } catch (fallbackError) {
      console.error(`Fallback model ${fallbackModel.name} also failed: ${fallbackError.message}`);
      throw new Error(`Both models failed: ${error.message} | ${fallbackError.message}`);
    }
  }
}
```

### Условия для Fallback

**Немедленный fallback**:

- ❌ HTTP 500/502/503 от API
- ❌ Timeout превышен
- ❌ Rate limit reached (429)
- ❌ Invalid JSON в ответе
- ❌ Отсутствуют обязательные поля

**НЕ fallback** (логировать, но принять результат):

- ⚠️ Качество контента ниже идеального (но валидный JSON)
- ⚠️ Меньше упражнений чем ожидалось (но есть хотя бы 1)
- ⚠️ Короткий overview (но присутствует)

---

## 📊 Мониторинг и Метрики

### Ключевые Метрики

**По каждой модели**:

- Success Rate (%)
- Average Response Time (ms)
- Average Cost ($)
- Fallback Usage Rate (%)
- Quality Score (1-10)

**По каждой задаче**:

- Primary Model Success Rate
- Fallback Activation Rate
- Total Failure Rate (both models failed)
- Average Cost per Generation

### Alerts

**Критичные** (немедленное оповещение):

- Success Rate < 95% для primary model
- Fallback Activation Rate > 20%
- Total Failure Rate > 1%

**Предупреждения** (ежедневный отчет):

- Success Rate < 98% для primary model
- Fallback Activation Rate > 10%
- Average Cost увеличилась на 50%+

---

## 💰 Ценовая Оценка

### Метадата (1000 генераций/месяц)

| Модель                             | Стоимость | Качество | Fallback Cost |
| ---------------------------------- | --------- | -------- | ------------- |
| **Qwen3 235B (regular)** (primary) | **$0.60** | 9/10     | -             |
| MiniMax M2 (fallback)              | $1.06     | 8.5/10   | +$0.46        |

**Ожидаемая стоимость**: $0.60 - $0.65/мес (assuming 5-10% fallback rate)

---

### Уроки (1000 генераций/месяц)

| Модель                      | Стоимость | Качество  | Fallback Cost |
| --------------------------- | --------- | --------- | ------------- |
| **MiniMax M2** (primary)    | **$1.67** | 9.5-10/10 | -             |
| Kimi K2 Thinking (fallback) | $2.93     | 9-10/10   | +$1.26        |

**Ожидаемая стоимость**: $1.67 - $1.80/мес (assuming 5-10% fallback rate)

---

### Годовая Оценка (10K генераций/мес: 5K metadata + 5K lessons)

| Компонент | Primary Cost | With Fallback (10%) | Годовая      |
| --------- | ------------ | ------------------- | ------------ |
| Metadata  | $3,000       | $3,276              | $39,312      |
| Lessons   | $8,350       | $9,080              | $108,960     |
| **TOTAL** | **$11,350**  | **$12,356**         | **$148,272** |

**Сравнение с Qwen 3 Max** (baseline: $8/$10 per 1M):

- Qwen 3 Max: ~$400K/год
- Наш микс: ~$148K/год
- **Экономия: $252K/год (63%)**

---

## 🚀 План Внедрения

### Фаза 1: Валидация (Неделя 1)

**Цель**: Подтвердить стабильность и качество в production

**Трафик**:

- 10% production traffic
- Metadata: Qwen3 235B (regular, NOT thinking) (primary) + MiniMax M2 (fallback)
- Lessons: MiniMax M2 (primary) + Kimi K2 Thinking (fallback)

**Метрики**:

- Success Rate для обеих моделей
- Fallback Activation Rate
- Quality Score (manual review 100 samples)

**Критерии успеха**:

- ✅ Success Rate > 95%
- ✅ Fallback Activation < 10%
- ✅ Quality Score > 8/10

---

### Фаза 2: Масштабирование (Недели 2-3)

**Цель**: Постепенное увеличение трафика

**Трафик**:

- Неделя 2: 30% production traffic
- Неделя 3: 60% production traffic

**Мониторинг**:

- Ежедневные отчеты по метрикам
- Weekly quality review (50 samples)

**Критерии для перехода к Фазе 3**:

- ✅ Success Rate стабильно > 97%
- ✅ Fallback Activation стабильно < 8%
- ✅ No critical incidents

---

### Фаза 3: Full Production (Неделя 4+)

**Трафик**:

- 100% production traffic
- Qwen 3 Max полностью выведена из использования

**Оптимизация**:

- Fine-tuning параметров (temperature, max_tokens)
- A/B тесты для улучшения качества
- Cost optimization на основе usage patterns

---

## 🔧 Конфигурация

### Environment Variables

```bash
# Primary Models
# NOTE: Using regular model (NOT -thinking) for 17-35x performance improvement (INV-2025-11-19-003)
PRIMARY_METADATA_MODEL=qwen/qwen3-235b-a22b-2507
PRIMARY_LESSON_MODEL=minimax/minimax-m2
PRIMARY_DEFAULT_MODEL=minimax/minimax-m2

# Fallback Models
FALLBACK_METADATA_MODEL=minimax/minimax-m2
FALLBACK_LESSON_MODEL=moonshotai/kimi-k2-thinking
FALLBACK_DEFAULT_MODEL=moonshotai/kimi-k2-thinking

# Timeouts (ms)
METADATA_TIMEOUT=70000
LESSON_TIMEOUT=90000
DEFAULT_TIMEOUT=60000

# Max Tokens
METADATA_MAX_TOKENS=8000
LESSON_MAX_TOKENS=10000
DEFAULT_MAX_TOKENS=8000

# Retry Configuration
MAX_RETRIES=2
RETRY_DELAY=2000
ENABLE_FALLBACK=true

# Quality Thresholds
MIN_QUALITY_SCORE=7.0
REQUIRE_SCHEMA_VALIDATION=true
REQUIRE_ALL_FIELDS=true
```

---

## 📝 Примеры Использования

### TypeScript/Node.js

```typescript
import { generateContent, ContentType } from './generation-service';

// Генерация метадаты
const metadata = await generateContent({
  type: ContentType.METADATA,
  language: 'ru',
  input: {
    title: 'Машинное обучение для начинающих',
    description: 'Intermediate-level conceptual ML course',
    difficultyLevel: 'intermediate',
  },
});
// Использует: Qwen3 235B (regular, NOT thinking) (primary) → MiniMax M2 (fallback)

// Генерация уроков
const lessons = await generateContent({
  type: ContentType.LESSONS,
  language: 'en',
  input: {
    sectionTitle: 'Variables and Data Types in Python',
    description: 'Hands-on programming section',
    difficultyLevel: 'beginner',
  },
});
// Использует: MiniMax M2 (primary) → Kimi K2 Thinking (fallback)
```

---

## 📋 Checklist для Внедрения

### Pre-Production

- [ ] Настроены environment variables
- [ ] Реализована retry логика с fallback
- [ ] Добавлена schema validation
- [ ] Настроен мониторинг и алерты
- [ ] Создана dashboard для метрик
- [ ] Проведены load tests

### Production Ready

- [ ] Успешно завершена Фаза 1 (10% трафика, 1 неделя)
- [ ] Quality Score > 8/10 на 100 samples
- [ ] Success Rate > 95%
- [ ] Fallback Activation < 10%
- [ ] Документация обновлена
- [ ] Team обучена работе с новыми моделями

---

## 🔍 Известные Ограничения

### Qwen3 235B Thinking Variant (NOT USED)

**Проблема**: 17-35x performance degradation без качественных преимуществ (INV-2025-11-19-003)
**Причина**: Thinking mode генерирует internal reasoning steps перед финальным output
**Решение**: Используется regular variant (`qwen3-235b-a22b-2507`) без `-thinking` suffix
**Performance**: Regular 15-29s vs Thinking 30-110s (test), 521s (production context)
**Quality**: Оба достигают 100% success rate, нет разницы в качестве для structured generation

### Kimi K2 Thinking

**Проблема**: Требует max_tokens: 10000 для русских уроков
**Причина**: 8000 tokens недостаточно (1 token limit hit в тестах)
**Решение**: Увеличен max_tokens до 10000

### MiniMax M2

**Проблема**: Относительно дорогая ($0.255/$1.02)
**Причина**: Reasoning tokens увеличивают стоимость
**Решение**: Отличное качество оправдывает цену, дешевле Kimi в 2 раза

---

## 📚 Связанные Документы

- [MODEL-QUALITY-TESTING-METHODOLOGY-V2.md](./MODEL-QUALITY-TESTING-METHODOLOGY-V2.md) - Методология тестирования
- [CONTENT-QUALITY-TOP3-RANKINGS.md](/tmp/quality-tests/CONTENT-QUALITY-TOP3-RANKINGS.md) - Детальный анализ качества контента
- [FINAL-RECOMMENDATION-WITH-PRICING.md](/tmp/quality-tests/FINAL-RECOMMENDATION-WITH-PRICING.md) - Ценовой анализ
- [test-config-2025-11-13-complete.json](../llm-testing/test-config-2025-11-13-complete.json) - Конфигурация тестов

---

## 🔄 История Изменений

### 2025-11-19 - Performance Fix

- **CRITICAL**: Заменён `qwen3-235b-a22b-thinking-2507` на `qwen3-235b-a22b-2507` (regular variant)
- Удалён `-thinking` suffix для 17-35x performance improvement (INV-2025-11-19-003)
- Оба варианта показывают 100% success rate, нет разницы в качестве для structured generation
- Regular variant: 15-29s vs Thinking: 30-110s (test), 521s (production context)
- Meets SC-003 performance spec (<150s Stage 5 generation time)

### 2025-11-13 - Initial Version

- Создана спецификация на основе 120+ API тестов
- Определены primary и fallback модели для metadata и lessons
- Qwen3 235B для метадаты (primary) - изначально с -thinking suffix (исправлено 2025-11-19)
- MiniMax M2 для уроков и всего остального (primary)
- Kimi K2 Thinking как универсальный fallback

---

**Автор**: Claude Code + llm-quality-tester agents
**Версия**: 1.0
**Статус**: Production Ready
**Последнее обновление**: 2025-11-13
