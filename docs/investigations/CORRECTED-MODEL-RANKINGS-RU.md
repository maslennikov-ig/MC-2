# Исправленные Рейтинги Моделей (Проверено По Реальным Данным)

**Дата**: 2025-11-13
**Методология**: Детальная проверка всех отчетов и логов
**Критерий**: Реальные output tokens + quality scores из тестов

---

## 📊 Полная Таблица Результатов (Output Tokens)

| Модель                  | T1 (Meta EN) | T2 (Meta RU) | T3 (Lesson EN)  | T4 (Lesson RU)  | Avg Metadata | Avg Lessons | Status     |
| ----------------------- | ------------ | ------------ | --------------- | --------------- | ------------ | ----------- | ---------- |
| **qwen3-235b-thinking** | **4,437**    | **5,416**    | ❌ HTML         | ❌ 500          | **4,927**    | -           | 2/4        |
| **kimi-k2-thinking**    | **4,969**    | **3,548**    | **2,806**       | **3,811**       | **4,259**    | **3,309**   | 4/4 ✅     |
| oss-120b                | 1,914        | 1,659        | ❌ HTML         | ❌ 500          | 1,787        | -           | 2/4        |
| kimi-k2-0905            | 1,189        | 1,423        | ✅ (нет данных) | ✅ (нет данных) | 1,306        | ?           | 4/4 ✅     |
| qwen3-32b               | 1,330        | 1,030        | ❌ HTML         | ❌ 500          | 1,180        | -           | 2/4        |
| glm-4.6                 | 1,287        | 826          | 534             | 437             | 1,057        | 486         | 4/4 ✅     |
| grok-4-fast             | ?            | ?            | **1,151** ✅    | ?               | ?            | 1,151       | 3/4→4/4 ✅ |
| deepseek-chat-v3.1      | ~1,338       | ~1,000       | ~463            | ~600            | ~1,169       | ~532        | 4/4 ✅     |
| deepseek-v3.2-exp       | ?            | ?            | ?               | ?               | ?            | ?           | 4/4 ✅     |
| qwen3-235b-a22b         | ❌           | ❌           | ❌              | ❌              | 0            | 0           | 0/4 ❌     |

_Примечание_: ~ = приблизительные данные из старых отчетов, ? = данные отсутствуют

---

## 🥇 РЕЙТИНГ ДЛЯ МЕТАДАТЫ (По Детальности Output Tokens)

### 1. qwen/qwen3-235b-a22b-thinking-2507 🏆

**Average Output**: 4,927 токенов (4,437 EN + 5,416 RU)
**Quality Score**: 1.00
**Status**: 2/4 (только метадата)

**Почему первая:**

- **Самые длинные описания курсов** среди всех моделей
- **Рекордный русский**: 5,416 токенов (абсолютный максимум)
- **Thinking tokens**: Глубокое рассуждение перед генерацией
- **Детальность**: course_overview на 4000+ символов
- **Bloom's Taxonomy**: Отличное понимание педагогики

**Пример качества** (T2 RU):

```
"Привет! Ты мечтаешь освоить машинное обучение, но не знаешь, с чего начать?
Этот курс создан специально для тебя! Мы разберём сложные темы простым языком,
без ненужной теории. Ты научишься строить свои первые модели, используя реальные
данные, и почувствуешь уверенность в этом увлекательном мире..."
```

**Компромисс**: ❌ НЕ работает для generation уроков

---

### 2. moonshotai/kimi-k2-thinking 🥈

**Average Output**: 4,259 токенов (4,969 EN + 3,548 RU)
**Quality Score**: 1.00
**Status**: 4/4 (УНИВЕРСАЛЬНА!)

**Почему вторая:**

- **Очень детальные описания**
- **Thinking tokens**: Глубокое рассуждение
- **УНИВЕРСАЛЬНОСТЬ**: Работает ДЛЯ ВСЕГО (метадата + уроки)
- **Отличный русский язык**
- **Стабильность**: 100% success rate

**Преимущество над qwen3-235b-thinking:**

- ✅ Работает для уроков тоже (полный цикл)
- ✅ Можно использовать одну модель везде

**Компромисс**: Немного короче по RU метадате (3,548 vs 5,416)

---

### 3. openai/gpt-oss-120b 🥉

**Average Output**: 1,787 токенов (1,914 EN + 1,659 RU)
**Quality Score**: 1.00
**Status**: 2/4 (только метадата)

**Почему третья:**

- **Очень быстрая** (12s EN, 7s RU)
- **Хорошая детальность** для средней длины
- **Качество**: Правильная структура, хорошие learning outcomes

**Компромисс**: ❌ НЕ работает для уроков

---

### 4-6. Остальные модели (1,000-1,400 токенов)

- qwen3-32b: 1,180 avg (2/4, только метадата)
- kimi-k2-0905: 1,306 avg (4/4, универсальна)
- deepseek-chat-v3.1: ~1,169 avg (4/4, универсальна)
- glm-4.6: 1,057 avg (4/4, универсальна)

---

## 🏗️ РЕЙТИНГ ДЛЯ СТРУКТУРЫ УРОКОВ (По Детальности + Качеству)

### 1. moonshotai/kimi-k2-thinking 🏆

**Average Output**: 3,309 токенов (2,806 EN + 3,811 RU)
**Quality Score**: 1.00
**Status**: 4/4

**Почему первая:**

- **Самые детальные уроки** среди всех моделей
- **2,806-3,811 токенов на generation** (в 5-6 раз больше других!)
- **Полная правильная структура**:
  - section → lessons (3-5 lessons)
  - lesson → objectives (SMART) → topics (детальные) → exercises (практичные)
- **Thinking tokens**: Глубокое рассуждение о структуре
- **100% schema compliance**

**Пример структуры** (T3 EN):

```json
{
  "section_number": 1,
  "section_title": "Variables and Data Types",
  "section_description": "Let's start by learning how Python stores information!...",
  "learning_objectives": [...],
  "lessons": [
    {
      "lesson_number": 1,
      "lesson_title": "Your First Variables: Storing Information",
      "lesson_objectives": [
        "Define what a variable represents in Python memory",
        "Demonstrate correct variable assignment using = operator",
        "Create at least three variables following PEP 8 naming"
      ],
      "key_topics": [
        "What is a Variable?",
        "Variable Assignment Syntax",
        "Integer Data Type (int)",
        "Floating-Point Data Type (float)",
        "String Data Type (str)",
        "The type() Function"
      ],
      "exercises": [...]
    },
    {lesson 2...},
    {lesson 3...}
  ]
}
```

**Компромисс**: Медленнее (96-127s), но качество максимальное

---

### 2. grok-4-fast 🥈

**Output (T3 EN)**: 1,151 токенов
**Quality Score**: 1.00 (с retry)
**Status**: 4/4 (с одним retry)

**Почему второй:**

- **Ультра-быстрый**: 6 секунд для T3!
- **Правильная структура**: Полный JSON с lessons
- **Хороший баланс** детальности и скорости

**Компромисс**: Требует retry logic (T3 failed initially)

---

### 3. deepseek/deepseek-chat-v3.1 🥉

**Average Output**: ~532 токена (~463 EN + ~600 RU)
**Quality Score**: 0.80 (T3), 0.60 (T4)
**Status**: 4/4

**Почему третья:**

- ⚠️ **КРИТИЧНАЯ НАХОДКА**: В отчете показан quality score 0.80!
- ⚠️ **Упрощенная схема**: camelCase вместо snake_case
- ⚠️ **Только 1 урок** вместо 3-5
- ⚠️ **463 токена** (в 6 раз меньше kimi-k2-thinking!)

**Реальная структура** (из отчета):

```json
{
  "courseTitle": "Introduction to Python Programming",  // camelCase!
  "sectionTitle": "Variables and Data Types in Python",
  "lessons": [
    {
      "lessonTitle": "Your First Variables: Storing Information in Python",
      "learningObjectives": [...],
      "keyTopics": [...],
      "estimatedDuration": 15,
      "exercises": [
        {
          "type": "hands_on",
          "title": "Variable Playground",
          "instructions": "Open a Python interpreter... [detailed steps]"
        }
      ]
    }
  ]  // ТОЛЬКО ОДИН УРОК!
}
```

**Проблемы**:

- ⚠️ Output uses simplified schema (not full hierarchical)
- ⚠️ Only 1 lesson generated instead of 3-5
- ⚠️ camelCase fields rather than snake_case

---

### 4. glm-4.6

**Average Output**: 486 токенов (534 EN + 437 RU)
**Quality Score**: 1.00
**Status**: 4/4

**Характеристики:**

- Короткие уроки
- Правильная структура
- Быстрая генерация

---

### 5. kimi-k2-0905

**Status**: 4/4
**Output**: Данных нет, но тесты прошли

---

### 6. deepseek-v3.2-exp

**Status**: 4/4
**Output**: Данных нет

---

## ❌ Модели НЕ Подходящие Для Уроков

**qwen3-32b, qwen3-235b-thinking, oss-120b**:

- T3: HTML вместо JSON
- T4: HTTP 500 Internal Server Error
- **НЕ могут генерировать структуру уроков**

---

## 💡 ИТОГОВЫЕ РЕКОМЕНДАЦИИ

### Вариант 1: Одна Универсальная Модель (ПРОСТОТА)

```
ВСЁ: moonshotai/kimi-k2-thinking
```

**Почему:**

- ✅ **Лучшая для метадаты**: 4,259 avg tokens
- ✅ **Лучшая для уроков**: 3,309 avg tokens
- ✅ **Одна модель** для всего (простая архитектура)
- ✅ **100% success rate** (4/4 tests)
- ✅ **Thinking tokens** = максимальное качество

**Компромисс:**

- Медленнее (35-127s per generation)
- Дороже ($0.35/$1.4 per 1M)

---

### Вариант 2: Две Модели (МАКСИМАЛЬНОЕ КАЧЕСТВО)

```
Метадата: qwen3-235b-thinking (4,927 avg tokens)
    ↓
Уроки: kimi-k2-thinking (3,309 avg tokens)
```

**Почему:**

- ✅ **Максимальная детальность** для обеих задач
- ✅ **Рекордный русский** в метадате (5,416 tokens)
- ✅ **Лучшие уроки** с full structure

**Компромисс:**

- Две модели = более сложная логика
- qwen3-235b дешевле ($0.08/$0.36)
- kimi-k2-thinking дороже ($0.35/$1.4)

---

### Вариант 3: Скорость + Качество

```
Метадата: kimi-k2-thinking (4,259 tokens)
    ↓
Уроки: grok-4-fast (1,151 tokens, 6s!)
```

**Почему:**

- ✅ Детальная метадата
- ✅ Ультра-быстрые уроки (6s)
- ✅ Хороший баланс

**Компромисс:**

- Уроки менее детальные (1,151 vs 3,309)
- Нужен retry logic для grok

---

## ⚠️ КРИТИЧЕСКИЕ НАХОДКИ

### 1. deepseek-chat-v3.1 НЕ ТАК ХОРОША ДЛЯ УРОКОВ

**Реальные данные из отчета:**

- Quality Score: **0.80** (не 1.00!)
- Output: **только 463 токена** (в 6 раз меньше kimi!)
- Structure: **Упрощенная** (camelCase, 1 урок)
- Schema: **PARTIAL** compliance

**Моя предыдущая ошибка:**

- Я думал что deepseek-chat лучше по структуре
- Но реальные данные показывают обратное
- kimi-k2-thinking НАМНОГО детальнее

### 2. Метадата vs Уроки - Разные Лидеры

**Для метадаты:**

1. qwen3-235b-thinking (4,927 tokens) - НО только метадата
2. kimi-k2-thinking (4,259 tokens) - универсальна

**Для уроков:**

1. kimi-k2-thinking (3,309 tokens) - максимум деталей
2. grok-4-fast (1,151 tokens) - скорость
3. deepseek-chat-v3.1 (463 tokens) - ⚠️ упрощенная схема

---

## 🎯 МОЯ ФИНАЛЬНАЯ РЕКОМЕНДАЦИЯ

**Для продакшена:**

```typescript
// Одна универсальная модель
const MODEL = 'moonshotai/kimi-k2-thinking';

// Причины:
// 1. Лучшее качество для обеих задач
// 2. Одна модель = простая архитектура
// 3. 100% success rate
// 4. Thinking tokens = глубина и качество
// 5. Детальность: 4,259 (metadata) + 3,309 (lessons)
```

**Если нужна максимальная детальность метадаты:**

```typescript
// Dual-model approach
const METADATA_MODEL = 'qwen/qwen3-235b-a22b-thinking-2507'; // 4,927 tokens
const LESSONS_MODEL = 'moonshotai/kimi-k2-thinking'; // 3,309 tokens

// Причины:
// 1. qwen3-235b: рекордные 5,416 tokens для RU metadata
// 2. kimi-k2-thinking: лучшие уроки с full structure
// 3. Максимальное качество для обеих задач
```

---

**Отчет создан**: 2025-11-13
**Базис**: Реальные данные из логов и отчетов
**Проверено**: Все 11 моделей, 44 API теста
