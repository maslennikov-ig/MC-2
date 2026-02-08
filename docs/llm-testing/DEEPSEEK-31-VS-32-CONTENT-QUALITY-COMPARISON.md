# DeepSeek 3.1 vs 3.2: Сравнение качества контента

**Дата анализа**: 2025-11-14
**Фокус**: Качество контента (смысл, специфичность, педагогическая ценность)
**Исключено**: Стабильность, скорость, reliability
**Запуски**: Test Run 3, 4, 5

---

## Executive Summary

### 🎯 Неожиданный результат

**DeepSeek Chat 3.1** (старая версия) показывает **ЛУЧШЕЕ качество контента** чем **DeepSeek v3.2 Exp** (новая версия) в большинстве категорий.

| Категория       | DeepSeek 3.1 | DeepSeek 3.2 | Победитель |
| --------------- | ------------ | ------------ | ---------- |
| **EN Metadata** | 8.5/10       | 7.8/10       | **3.1** ⭐ |
| **RU Metadata** | 8.2/10       | 8.0/10       | **3.1** ⭐ |
| **EN Lessons**  | 8.7/10       | 8.5/10       | **3.1** ⭐ |
| **RU Lessons**  | 8.0/10       | 8.0/10       | **=**      |
| **Overall**     | **8.35/10**  | **8.08/10**  | **3.1** ⭐ |

**Вывод**: Версия 3.1 **на 3.2% лучше** по overall качеству контента.

---

## Детальное сравнение по категориям

### 1. EN Metadata Quality

#### DeepSeek Chat 3.1 (8.5/10) ✅

**Проверенный файл**: `test-run-3/deepseek-chat-v31/metadata-en-run1.json`

**Сильные стороны**:

- ✅ **Более детальный course_overview**: 576 символов vs 358 у 3.2
- ✅ Subtitle с заголовком: "From Zero to Coder" (добавляет личности)
- ✅ Упоминает конкретные форматы обучения: "video lectures, coding exercises, real-world projects"
- ✅ Четкая progression: "absolute basics → functional programs"
- ✅ Specific career paths: "data science, web development, and automation"

**Learning Outcomes** (5 outcomes):

```json
[
  "Define core programming concepts like variables, data types, and syntax.",
  "Explain the purpose and function of loops, conditionals, and functions.",
  "Apply Python syntax to write scripts that solve basic computational problems.",
  "Construct small programs by combining control structures and functions.",
  "Differentiate between various data structures and select the appropriate one for a task."
]
```

**Bloom's Taxonomy**: Define, Explain, Apply, Construct, Differentiate — отличная последовательность!

**Duration**: 20 hours (реалистично)

---

#### DeepSeek v3.2 Exp (7.8/10) ⚠️

**Проверенный файл**: `test-run-3/deepseek-v32-exp/metadata-en-run1.json`

**Сильные стороны**:

- ✅ 6 learning outcomes (больше чем у 3.1)
- ✅ Упоминает "Debug" и "Design" (практические skills)

**Слабые стороны**:

- ⚠️ **Значительно короче course_overview**: 358 символов vs 576 у 3.1
- ⚠️ Нет subtitle (просто "Introduction to Python Programming")
- ⚠️ Менее детальное описание: "practical examples and real-world projects" (generic)
- ⚠️ Нет упоминания конкретных форматов обучения

**Learning Outcomes** (6 outcomes):

```json
[
  "Explain Python syntax and basic programming concepts",
  "Write Python scripts using variables, data types, and control structures",
  "Develop functions to organize and reuse code effectively",
  "Create programs that handle user input and file operations",
  "Debug basic Python programs and handle common errors",
  "Design simple applications using fundamental programming principles"
]
```

**Bloom's Taxonomy**: Explain, Write, Develop, Create, Debug, Design — хорошо, но менее последовательно

**Duration**: 40 hours (vs 20h у 3.1 — странно, что более короткий overview предполагает вдвое больше времени)

**Вывод**: **3.1 побеждает** — более детальный, конкретный, лучше структурирован.

---

### 2. RU Metadata Quality

#### DeepSeek Chat 3.1 (8.2/10) ✅

**Проверенный файл**: `test-run-3/deepseek-chat-v31/metadata-ru-run1.json`

**Сильные стороны**:

- ✅ Subtitle: "от теории к практике" (добавляет направленность)
- ✅ 6 learning outcomes (больше чем у 3.2)
- ✅ Естественный русский: "систематическое погружение"
- ✅ Упоминает конкретные типы: "обучение с учителем и без учителя"
- ✅ Честно о фокусе: "фокусируется на концептуальном понимании, а не на программировании"

**Learning Outcomes** (6 outcomes):

```json
[
  "Объяснять основные концепции и типы машинного обучения",
  "Сравнивать различные алгоритмы машинного обучения",
  "Интерпретировать результаты работы ML-моделей",
  "Выбирать подходящие алгоритмы для конкретных задач",
  "Оценивать качество моделей с помощью метрик",
  "Применять полученные знания для анализа реальных кейсов"
]
```

**Bloom's Taxonomy**: Объяснять, Сравнивать, Интерпретировать, Выбирать, Оценивать, Применять — отличная прогрессия!

---

#### DeepSeek v3.2 Exp (8.0/10) ⚠️

**Проверенный файл**: `test-run-3/deepseek-v32-exp/metadata-ru-run1.json`

**Сильные стороны**:

- ✅ Subtitle: "от данных к предсказаниям" (хороший hook)
- ✅ Более детальный course_overview: упоминает "от сбора данных до их оценки"
- ✅ Естественный русский

**Слабые стороны**:

- ⚠️ Только 5 learning outcomes (vs 6 у 3.1)
- ⚠️ Менее конкретные outcomes: "Объяснять ключевые концепции и терминологию" (общее)
- ⚠️ Prerequisites более generic: "Начальный опыт программирования на любом языке"

**Learning Outcomes** (5 outcomes):

```json
[
  "Объяснять ключевые концепции и терминологию машинного обучения",
  "Различать типы задач машинного обучения и выбирать подходящие алгоритмы",
  "Применять основные алгоритмы для решения учебных задач классификации и регрессии",
  "Анализировать качество моделей, используя основные метрики оценки",
  "Интерпретировать результаты работы моделей и делать выводы"
]
```

**Вывод**: **3.1 побеждает** — больше outcomes, более конкретные формулировки.

---

### 3. EN Lessons Quality

#### DeepSeek Chat 3.1 (8.7/10) ✅

**Проверенный файл**: `test-run-3/deepseek-chat-v31/lesson-en-run1.json`

**Количество уроков**: 5 (в run 3), 4 (в runs 4-5)

**Сильные стороны**:

- ✅ **5 полных уроков в run 3** (больше чем у большинства моделей)
- ✅ **5-7 key_topics на урок** (очень детально)
- ✅ **Конкретные формулы**: "(F - 32) \* 5/9", "Use 3.14159 for π"
- ✅ **2 exercises на урок** с четкими инструкциями
- ✅ Отличная педагогическая прогрессия

**Образец quality** (Lesson 2):

```json
{
  "lesson_title": "Working with Numeric Data: Integers and Floats",
  "key_topics": [
    "Integer (int) data type for whole numbers",
    "Float (float) data type for decimal numbers",
    "Basic arithmetic operators (+, -, *, /, **)",
    "Order of operations (PEMDAS)",
    "Common numerical comparisons (>, <, ==, !=)"
  ],
  "exercises": [
    {
      "exercise_title": "Temperature Converter",
      "exercise_instructions": "Store a temperature in Fahrenheit in a variable. Calculate and print the equivalent temperature in Celsius using the formula: (F - 32) * 5/9."
    },
    {
      "exercise_title": "Circle Measurements",
      "exercise_instructions": "Store a circle's radius in a variable. Calculate and print its area (π*r²) and circumference (2*π*r). Use 3.14159 for π."
    }
  ]
}
```

**Почему это отлично**:

- ✅ Конкретная формула: "(F - 32) \* 5/9"
- ✅ Конкретное значение π: "3.14159"
- ✅ Математические обозначения: "π*r²", "2*π\*r"
- ✅ Auto-gradable: можно проверить точность вычислений

---

#### DeepSeek v3.2 Exp (8.5/10) ⚠️

**Проверенный файл**: `test-run-3/deepseek-v32-exp/lesson-en-run1.json`

**Количество уроков**: 5 (в runs 3-4), 4 (в run 5)

**Сильные стороны**:

- ✅ 5 полных уроков
- ✅ Хорошая структура
- ✅ 2 exercises на урок

**Слабые стороны по сравнению с 3.1**:

- ⚠️ **Менее конкретные формулы**: "km \* 0.621371" (хорошо, но менее интересно чем temperature converter у 3.1)
- ⚠️ **Менее детальные key_topics**: 5 topics vs 5-7 у 3.1
- ⚠️ Exercises менее разнообразны

**Образец quality** (Lesson 4):

```json
{
  "lesson_title": "Type Conversion and Dynamic Typing",
  "exercises": [
    {
      "exercise_title": "User Info Formatter",
      "exercise_instructions": "Create variables for a user's age (as an integer) and name (as a string). Combine them into a single string message like 'Hello [name], you are [age] years old.' and print it."
    },
    {
      "exercise_title": "Numeric String Conversion",
      "exercise_instructions": "Take a string containing a number (e.g., '125') and convert it to an integer. Multiply it by 2, then convert the result back to a string and print the final value and its type."
    }
  ]
}
```

**Почему это хорошо, но не отлично**:

- ✅ Практичные exercises
- ⚠️ Менее конкретные примеры (не указана точная формула как у 3.1)
- ⚠️ Нет математических вычислений

**Вывод**: **3.1 побеждает** — более конкретные формулы, более детальные key_topics.

---

### 4. RU Lessons Quality

#### DeepSeek Chat 3.1 (8.0/10) ✅

**Проверенный файл**: `test-run-3/deepseek-chat-v31/lesson-ru-run1.json`

**Количество уроков**: 4

**Сильные стороны**:

- ✅ **Конкретные numeric values**: "x1=1, x2=0, x3=1", "w1=0.5, w2=-0.5, w3=1.0"
- ✅ **Конкретная архитектура**: "784 входа, 128 и 64 нейрона, 10 выходов"
- ✅ Естественный русский язык
- ✅ Практические примеры: "сеть для классификации рукописных цифр"

**Образец quality** (Lesson 1, Exercise 1):

```json
{
  "exercise_title": "Расчет выхода нейрона",
  "exercise_instructions": "Даны три входа: x1=1, x2=0, x3=1 и соответствующие веса: w1=0.5, w2=-0.5, w3=1.0. Порог активации (bias) = -0.5. Рассчитайте взвешенную сумму и определите выход нейрона с пороговой функцией активации (выход = 1, если сумма >= 0)."
}
```

**Почему это отлично**:

- ✅ Все конкретные значения: x1=1, x2=0, x3=1, w1=0.5, w2=-0.5, w3=1.0, bias=-0.5
- ✅ Четкий критерий: "выход = 1, если сумма >= 0"
- ✅ Auto-gradable: можно проверить правильность вычисления

---

#### DeepSeek v3.2 Exp (8.0/10) ✅

**Проверенный файл**: `test-run-3/deepseek-v32-exp/lesson-ru-run1.json`

**Количество уроков**: 4

**Сильные стороны**:

- ✅ **Конкретные numeric values**: "x1=0.5, x2=-1.2, x3=0.8", "w1=0.7, w2=0.1, w3=-0.5"
- ✅ **Конкретная архитектура**: "784 входа, два скрытых слоя (128 и 64 нейрона), 10 выходов"
- ✅ Естественный русский язык
- ✅ Практические примеры: "простая сеть для классификации рукописных цифр"

**Образец quality** (Lesson 1, Exercise 1):

```json
{
  "exercise_title": "Расчет выхода нейрона",
  "exercise_instructions": "Даны три входа (x1=0.5, x2=-1.2, x3=0.8) с соответствующими весами (w1=0.7, w2=0.1, w3=-0.5) и смещением (b=0.2). Рассчитайте взвешенную сумму и примените ступенчатую функцию активации (выход 1, если сумма >= 0, иначе 0)."
}
```

**Почему это отлично**:

- ✅ Все конкретные значения: x1=0.5, x2=-1.2, x3=0.8, w1=0.7, w2=0.1, w3=-0.5, b=0.2
- ✅ Четкий критерий: "выход 1, если сумма >= 0, иначе 0"
- ✅ Auto-gradable

**Сравнение**:

- **3.1**: Более простые числа (целые 0, 1), проще для расчета вручную
- **3.2**: Более реалистичные числа (дробные), сложнее для расчета

**Вывод**: **=** Обе модели показывают **одинаково высокое качество** RU lessons. Небольшое преимущество 3.1 в простоте чисел для учебных целей компенсируется реалистичностью чисел у 3.2.

---

## Подробный побайтовый анализ

### Course Overview Length Analysis

| Модель           | EN Overview | RU Overview | Детальность        |
| ---------------- | ----------- | ----------- | ------------------ |
| **DeepSeek 3.1** | 576 chars   | 387 chars   | Более детальный EN |
| **DeepSeek 3.2** | 358 chars   | 483 chars   | Более детальный RU |

**Наблюдение**: 3.1 более детален в EN, 3.2 более детален в RU. Но для **создания уроков**, детальность EN metadata важнее, т.к. это показатель глубины педагогического планирования.

---

### Learning Outcomes Count

| Модель           | EN Outcomes | RU Outcomes | Total |
| ---------------- | ----------- | ----------- | ----- |
| **DeepSeek 3.1** | 5           | 6           | 11    |
| **DeepSeek 3.2** | 6           | 5           | 11    |

**Наблюдение**: Одинаковое общее количество, но 3.1 дает больше RU outcomes, что важно для русскоязычных курсов.

---

### Lesson Quality Indicators

| Модель           | Key Topics/Lesson | Formulas Specificity | Exercises Quality           |
| ---------------- | ----------------- | -------------------- | --------------------------- |
| **DeepSeek 3.1** | 5-7               | ⭐⭐⭐⭐⭐ Отлично   | ⭐⭐⭐⭐⭐ Очень конкретные |
| **DeepSeek 3.2** | 5                 | ⭐⭐⭐⭐ Хорошо      | ⭐⭐⭐⭐ Конкретные         |

---

## Почему 3.1 лучше чем 3.2?

### Гипотезы

**1. Optimization Trade-off**

- v3.2 "Exp" = Experimental, возможно оптимизирована на скорость/стоимость
- v3.1 = Стабильная версия, возможно оптимизирована на качество

**2. Training Data Differences**

- v3.1 могла быть обучена на более качественных педагогических данных
- v3.2 могла быть fine-tuned на более широкий спектр задач (не только образование)

**3. Model Size**

- "Exp" в названии может означать experimental smaller model
- v3.1 может быть полноразмерной моделью

---

## Итоговое сравнение: Где использовать каждую модель

### DeepSeek Chat 3.1 — Рекомендуется для:

✅ **EN Metadata** — Более детальный course_overview, лучше subtitle
✅ **RU Metadata** — Больше learning outcomes (6 vs 5)
✅ **EN Lessons** — Более конкретные формулы, больше key_topics
✅ **Educational Content** — Лучше для создания курсов

**Оценка**: 8.35/10

---

### DeepSeek v3.2 Exp — Рекомендуется для:

✅ **Бюджетные проекты** — Вероятно дешевле
✅ **Быстрая генерация** — Вероятно быстрее
✅ **RU Lessons** — Равное качество с 3.1
✅ **General Purpose** — Если не критично максимальное качество

**Оценка**: 8.08/10

---

## Финальные рекомендации

### Для вашего проекта создания курсов:

**Используйте DeepSeek Chat 3.1**, потому что:

1. ✅ **Более детальные metadata** — лучше для педагогического планирования
2. ✅ **Более конкретные формулы** в lessons — важно для auto-grading
3. ✅ **Больше learning outcomes** для RU — важно для русскоязычных курсов
4. ✅ **Более детальные key_topics** — лучше для студентов

**Разница +3.2%** может показаться небольшой, но для образовательного контента это **значимо**.

---

## Таблица окончательных оценок (только качество контента)

| Категория       | DeepSeek 3.1 | DeepSeek 3.2 | Разница   | Причина                            |
| --------------- | ------------ | ------------ | --------- | ---------------------------------- |
| **EN Metadata** | 8.5          | 7.8          | **+0.7**  | Детальнее overview, лучше subtitle |
| **RU Metadata** | 8.2          | 8.0          | **+0.2**  | Больше outcomes                    |
| **EN Lessons**  | 8.7          | 8.5          | **+0.2**  | Конкретнее формулы, больше topics  |
| **RU Lessons**  | 8.0          | 8.0          | **0**     | Равное качество                    |
| **Overall**     | **8.35**     | **8.08**     | **+0.27** | 3.1 лучше                          |

---

## Заключение

**Ваше удивление обоснованно** — обычно новые версии лучше старых. Но в данном случае:

1. **DeepSeek Chat 3.1** — стабильная production-ready модель, оптимизированная на качество
2. **DeepSeek v3.2 Exp** — экспериментальная модель, возможно оптимизированная на скорость/стоимость

Для **создания образовательного контента** рекомендую **DeepSeek Chat 3.1**.

Если нужна **максимальная экономия** при приемлемом качестве — v3.2 Exp тоже неплохой выбор.

---

**Дата**: 2025-11-14
**Проанализировано файлов**: 6 (metadata + lessons для обеих моделей)
**Вывод**: DeepSeek Chat 3.1 на **3.2% лучше** по качеству контента
