# Техническое задание: Редизайн UI Stage 4-5 для создателей курсов

**Версия:** 1.2.0
**Дата:** 2025-12-05
**Статус:** Ready for Implementation
**Автор:** Claude + Igor

---

## Основано на исследованиях

Данное ТЗ учитывает результаты Deep Research:

- [AI Course Builder Regeneration Best Practices](../research/AI%20Course%20Builder%20Regeneration%20Best%20Practices.md)
- [Partial content regeneration in AI course builders](../research/Partial%20content%20regeneration%20in%20AI%20course%20builders%20A%20technical%20guide.md)

Ключевые концепции из исследований:

- **Constructive Alignment** — LO → Content → Assessment как граф зависимостей
- **Tiered Context Strategy** — 4 уровня контекста для оптимизации токенов
- **Lost in the Middle** — критическую информацию в начало/конец промпта
- **Stale Data Indicators** — визуальная индикация устаревших зависимостей
- **Impact Analysis Modal** — предупреждение о каскадных изменениях

---

## 1. Введение

### 1.1 Краткое описание

Редизайн интерфейса отображения результатов Stage 4 (Анализ) и Stage 5 (Генерация структуры) в раскрываемой панели ноды графа. Цель — сделать интерфейс понятным для методологов, инструкторов и создателей курсов, а не разработчиков.

### 1.2 Целевая аудитория

- **Методологи** — специалисты по разработке образовательных программ
- **Инструкторы** — преподаватели, создающие курсы
- **Создатели курсов** — эксперты предметной области без технического бэкграунда

### 1.3 Проблемы текущей реализации

| Проблема             | Текущее состояние               | Влияние на UX                             |
| -------------------- | ------------------------------- | ----------------------------------------- |
| Технические названия | "Attempt 1, 2, 3..." вместо фаз | Непонятно что происходит                  |
| JSON-вывод           | `JsonViewer` для output         | Нечитаемо для нетехнических пользователей |
| Нет редактирования   | Output только для чтения        | Невозможно исправить ошибки AI            |
| Скрытый чат          | `RefinementChat` свёрнут        | Неочевидная функция перегенерации         |
| Нет авто-раскрытия   | Только Stage 3 открывается      | Stage 4/5 требуют ручного открытия        |

---

## 2. Функциональные требования

### 2.1 FR-001: Человеко-понятные названия фаз

**Было:** `Attempt 1 - 12:34:56 (success)`
**Стало:** Семантические названия с описанием

#### Stage 4 — Фазы анализа

| Внутреннее имя | Отображаемое название (RU) | Описание                           |
| -------------- | -------------------------- | ---------------------------------- |
| phase_0        | Подготовка                 | Проверка готовности документов     |
| phase_1        | Классификация              | Определение категории и темы курса |
| phase_2        | Планирование объёма        | Расчёт количества уроков и секций  |
| phase_3        | Экспертный анализ          | Выбор педагогической стратегии     |
| phase_4        | Синтез документов          | Анализ загруженных материалов      |
| phase_6        | RAG-планирование           | Связь документов с разделами курса |
| phase_5        | Финализация                | Сборка итогового результата        |

#### Stage 5 — Фазы генерации

| Внутреннее имя    | Отображаемое название (RU) | Описание                 |
| ----------------- | -------------------------- | ------------------------ |
| validate_input    | Валидация                  | Проверка входных данных  |
| generate_metadata | Метаданные                 | Генерация описания курса |
| generate_sections | Структура                  | Создание секций и уроков |
| validate_quality  | Проверка качества          | Валидация по стандартам  |
| validate_lessons  | Проверка уроков            | Минимум 10 уроков        |

**Компоненты:**

- `AttemptSelector.tsx` → `PhaseSelector.tsx`
- Новый файл: `phase-names.ts` с переводами

---

### 2.2 FR-002: Человеко-понятное отображение Output

#### Stage 4 (AnalysisResult) — Разделы

Каждая фаза = отдельный раздел с возможностью редактирования:

**1. Классификация курса** (`course_category`, `contextual_language`)

```
┌─────────────────────────────────────────────────────────┐
│ 📚 Классификация курса                            [✏️] │
├─────────────────────────────────────────────────────────┤
│ Категория: Профессиональный                             │
│ Уверенность: 92%                                        │
│                                                         │
│ Контекстные сообщения:                                  │
│ • Почему это важно: [редактируемое поле]               │
│ • Мотиваторы: [редактируемое поле]                     │
└─────────────────────────────────────────────────────────┘
```

**2. Анализ темы** (`topic_analysis`)

```
┌─────────────────────────────────────────────────────────┐
│ 🎯 Анализ темы                                    [✏️] │
├─────────────────────────────────────────────────────────┤
│ Тема: [редактируемый заголовок]                        │
│ Сложность: Средняя                                      │
│ Аудитория: Продвинутые                                  │
│                                                         │
│ Ключевые концепции:                                     │
│ [chips: можно удалять/добавлять]                       │
└─────────────────────────────────────────────────────────┘
```

**3. Рекомендуемая структура** (`recommended_structure`)

```
┌─────────────────────────────────────────────────────────┐
│ 📊 Рекомендуемая структура                        [✏️] │
├─────────────────────────────────────────────────────────┤
│ Всего уроков: 15 (мин. 10)                             │
│ Секций: 5                                               │
│ Длительность урока: 15 мин                              │
│ Общее время: 3.75 ч                                     │
│                                                         │
│ Разбивка по секциям:                     [Перегенерировать]│
│ ┌───────────────────────────────────────┐               │
│ │ 1. Введение (3 урока)            [✏️] │               │
│ │    • Важность: ⭐ Ключевая             │               │
│ │    • Цели обучения:                    │               │
│ │      - [редактируемое]                 │               │
│ └───────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────┘
```

**4. Педагогическая стратегия** (`pedagogical_strategy`, `pedagogical_patterns`)

```
┌─────────────────────────────────────────────────────────┐
│ 🎓 Педагогическая стратегия                       [✏️] │
├─────────────────────────────────────────────────────────┤
│ Стиль обучения: Практико-ориентированный               │
│ Соотношение теория/практика: 30:70                      │
│ Уровень интерактивности: Высокий                        │
│                                                         │
│ Типы заданий: [chips]                                   │
│ Паттерны: [chips]                                       │
└─────────────────────────────────────────────────────────┘
```

**5. Рекомендации по генерации** (`generation_guidance`)

```
┌─────────────────────────────────────────────────────────┐
│ ✨ Рекомендации по генерации                      [✏️] │
├─────────────────────────────────────────────────────────┤
│ Тон: Дружелюбный, но профессиональный                   │
│ Использовать аналогии: Да                               │
│                                                         │
│ Специфичные аналогии: [редактируемый список]           │
│ Визуальные элементы: [chips]                            │
│ Типы упражнений: [chips]                                │
└─────────────────────────────────────────────────────────┘
```

**6. Связь документов** (`document_relevance_mapping`)

```
┌─────────────────────────────────────────────────────────┐
│ 📎 Связь документов с разделами                   [✏️] │
├─────────────────────────────────────────────────────────┤
│ Секция 1: Введение                                      │
│   • Документы: [file1.pdf, file2.docx]                 │
│   • Поисковые запросы: [редактируемые]                 │
│   • Уверенность: Высокая                                │
└─────────────────────────────────────────────────────────┘
```

#### Stage 5 (CourseStructure) — Визуализация

```
┌─────────────────────────────────────────────────────────┐
│ 📖 Структура курса                                      │
├─────────────────────────────────────────────────────────┤
│ Название: [редактируемое]                               │
│ Описание: [редактируемый rich-text]                    │
│ Целевая аудитория: [редактируемое]                     │
│                                                         │
│ ═══════════════════════════════════════════════════════ │
│                                                         │
│ Секция 1: Основы                            [⚙️] [🔄]  │
│ ├── Урок 1.1: Введение              15 мин  [✏️] [🔄]  │
│ │   └── Цели: [редактируемые]                          │
│ │   └── Ключевые темы: [chips]                         │
│ │   └── Упражнения: [3 шт]                             │
│ ├── Урок 1.2: Первые шаги           15 мин  [✏️] [🔄]  │
│ └── ...                                                 │
│                                                         │
│ Секция 2: Продвинутые концепции             [⚙️] [🔄]  │
│ └── ...                                                 │
└─────────────────────────────────────────────────────────┘

[⚙️] = редактировать секцию
[🔄] = перегенерировать с AI
[✏️] = редактировать урок
```

---

### 2.3 FR-003: Inline-редактирование с автосохранением

#### Режимы редактирования

1. **Просмотр** (по умолчанию) — текст отображается как обычный контент
2. **Редактирование** — клик по [✏️] или по полю активирует редактор

#### Типы редакторов

| Тип данных     | Редактор                      |
| -------------- | ----------------------------- |
| Короткий текст | Inline input                  |
| Длинный текст  | Textarea с авто-высотой       |
| Список строк   | Chips с добавлением/удалением |
| Enum           | Select dropdown               |
| Число          | Number input с ±кнопками      |
| Да/Нет         | Toggle switch                 |

#### Логика сохранения

```typescript
// Debounced автосохранение
const debouncedSave = useDebouncedCallback(
  async (field: string, value: unknown) => {
    setSaveStatus('saving');
    await saveFieldToDatabase(stageId, field, value);
    setSaveStatus('saved');

    // Показать "Сохранено" на 2 сек
    setTimeout(() => setSaveStatus('idle'), 2000);
  },
  1000 // 1 секунда debounce
);

// При потере фокуса — немедленное сохранение
const handleBlur = () => {
  debouncedSave.flush();
};
```

#### Индикация статуса

```
[Редактирование...] → [Сохранение...] → [✓ Сохранено] → (скрыто)
```

---

### 2.4 FR-004: Inline-перегенерация через чат

#### UI-паттерн

Каждый редактируемый блок имеет кнопку [🔄]:

```
┌─────────────────────────────────────────────────────────┐
│ Ключевые концепции:                               [🔄] │
│ [chip1] [chip2] [chip3]                                │
└─────────────────────────────────────────────────────────┘
                        ↓ (клик на 🔄)
┌─────────────────────────────────────────────────────────┐
│ Ключевые концепции:                          [Закрыть] │
│ [chip1] [chip2] [chip3]                                │
│ ─────────────────────────────────────────────────────── │
│ 💬 Что изменить?                                       │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Добавь концепции про GDPR и защиту данных         │ │
│ └─────────────────────────────────────────────────────┘ │
│ [Быстрые действия: Упростить | Добавить больше | ...]  │
│                                          [Отправить →] │
└─────────────────────────────────────────────────────────┘
```

#### Процесс перегенерации

1. Клик [🔄] → раскрывается mini-chat под блоком
2. Пользователь вводит инструкцию ИЛИ выбирает Quick Action
3. Клик [Отправить] → показывается spinner
4. AI перегенерирует ТОЛЬКО этот блок
5. Новое значение появляется, можно принять или отменить

#### Quick Actions (предустановленные)

| Действие        | Промпт для AI                   |
| --------------- | ------------------------------- |
| Упростить       | "Сделай проще и понятнее"       |
| Расширить       | "Добавь больше деталей"         |
| Сократить       | "Сделай более лаконичным"       |
| Примеры         | "Добавь конкретные примеры"     |
| Профессионализм | "Сделай более профессиональным" |

#### XML-Structured Prompt Pattern

> **Источник:** Research — Context-Aware Regeneration Pattern, CARE framework

```xml
<system>
You are regenerating a specific block within an educational course about {topic}.
Match the established tone: {tone_description}
Target audience: {audience_level}
Bloom's Taxonomy level required: {bloom_level}
Length constraint: {word_count} ± 10%
</system>

<surrounding_context>
<previous_section>{content_before}</previous_section>
<section_to_regenerate>{current_content}</section_to_regenerate>
<following_section>{content_after}</following_section>
</surrounding_context>

<learning_objective>
{aligned_learning_objective}
</learning_objective>

<style_examples>
Example 1: "{style_example_1}"
Example 2: "{style_example_2}"
</style_examples>

<constraints>
- Maintain consistency with the learning objective above
- Preserve logical flow from previous section
- Create natural transition to following section
- Use terminology already established: {key_terms}
- Match the style demonstrated in examples
</constraints>

<output_format>
Return JSON with structure:
{
  "regenerated_content": "...",
  "pedagogical_change_log": "...",
  "alignment_score": 1-5,
  "bloom_level_preserved": true/false,
  "concepts_added": [...],
  "concepts_removed": [...]
}
</output_format>

Regenerate only the content in <section_to_regenerate>.
```

**Ключевые принципы:**

- Критическая информация (constraints, LO) в **начале и конце** промпта
- **2-3 few-shot примера** стиля из других частей курса
- **Bloom's level** как обязательный constraint
- Structured JSON output для парсинга и валидации

---

### 2.5 FR-005: Авто-раскрытие ноды Stage 4/5

#### Логика

```typescript
// GraphView.tsx
useEffect(() => {
  const awaitingStage = isAwaitingApproval(pipelineStatus);

  // Авто-открытие при завершении Stage 3, 4 или 5
  if (awaitingStage === 3 || awaitingStage === 4 || awaitingStage === 5) {
    selectNode(`stage_${awaitingStage}`);
  }

  // Также открывать при статусе 'completed' для Stage 4/5
  if (stageStatus === 'completed' && [4, 5].includes(stageNumber)) {
    selectNode(`stage_${stageNumber}`);
  }
}, [pipelineStatus, stageStatus]);
```

#### Плавная анимация

- Drawer открывается с анимацией slide-in справа
- Контент появляется с fade-in после открытия drawer
- Фокус автоматически на первом редактируемом поле

---

### 2.6 FR-006: Общий чат в нижней части панели

Сохраняем существующий `RefinementChat`, но:

- По умолчанию раскрыт (не свёрнут)
- Добавляем подсказку: "Задайте вопрос или попросите изменить весь результат"

---

### 2.7 FR-007: Tiered Context Strategy для перегенерации

> **Источник:** Research — "Lost in the Middle" phenomenon, token budget optimization

#### Уровни контекста

Система автоматически определяет уровень контекста на основе типа редактирования:

| Tier                   | Контент                                       | Когда использовать             | Токены       |
| ---------------------- | --------------------------------------------- | ------------------------------ | ------------ |
| **Tier 1: Atomic**     | Target block + 1 prev/next                    | Опечатки, мелкие правки        | 200-500      |
| **Tier 2: Local**      | Tier 1 + заголовки секции                     | Расширение, тон                | 500-1,000    |
| **Tier 3: Structural** | Tier 2 + Learning Objectives + Summary        | Изменение концепций, сложности | 1,000-2,000  |
| **Tier 4: Global**     | Tier 3 + Style Guide + Glossary + Assessments | Крупные переписывания          | 2,000-5,000+ |

#### Smart Context Router

Классификатор (маленькая быстрая модель) анализирует промпт пользователя:

- "Исправь опечатку" → **Tier 1**
- "Сделай понятнее" → **Tier 2**
- "Измени сложность на продвинутый уровень" → **Tier 3**
- "Перепиши с учётом нового стиля" → **Tier 4**

#### Token Budget Allocation (8K window)

```
┌────────────────────────────────────────────────────────┐
│ System prompt + instructions         │ 10-15% (800-1,200) │
│ Target content + immediate context   │ 40-50% (3,200-4,000) │
│ Supporting context (summaries)       │ 20-30% (1,600-2,400) │
│ Few-shot style examples              │ 10-15% (800-1,200) │
│ Output buffer                        │ 5-10% (400-800)    │
└────────────────────────────────────────────────────────┘
```

#### Context Caching

Статический контекст (Style Guide, Audience Profile, список LO) кешируется через API:

- Первый запрос: отправляем полный контекст
- Последующие: только динамический контекст
- **Экономия:** до 50% стоимости и значительное снижение latency

---

### 2.8 FR-008: Dependency Graph и Stale Data Indicators

> **Источник:** Research — Constructive Alignment Theory, PatternFly Stale Data patterns

#### Граф зависимостей (Curriculum DAG)

```
Course Learning Outcomes
    ↓ maps_to
Module Objectives (Terminal Objectives)
    ↓ maps_to
Lesson Objectives (Enabling Objectives)
    ↓ drives
Content + Activities + Assessments
```

**Типы связей:**

- `PARENT_OF` — структурная иерархия (Unit → Lesson)
- `ALIGNS_TO` — педагогическое выравнивание (Content → LO)
- `ASSESSES` — верификация (Assessment → LO)
- `PREREQUISITE_FOR` — последовательность (Lesson 1 → Lesson 2)

#### Stale Data Indicator

Когда upstream-зависимость изменяется, downstream-элементы помечаются как "potentially stale":

```
┌─────────────────────────────────────────────────────────┐
│ ⚠️ Урок 2.3: Продвинутые концепции              [Sync] │
├─────────────────────────────────────────────────────────┤
│ Learning Objective изменён 5 мин назад.                │
│ Контент может не соответствовать новым целям.         │
│                                                         │
│ [Обновить контент] [Игнорировать] [Подробнее...]       │
└─────────────────────────────────────────────────────────┘
```

**Визуальные индикаторы:**

- 🟢 Зелёная граница — актуально, aligned
- 🟡 Жёлтая граница + ⚠️ — потенциально устарело
- 🔴 Красная граница + ❌ — точно не aligned (Bloom's level mismatch)

---

### 2.9 FR-009: Impact Analysis Modal

> **Источник:** Research — Cascading UX patterns, Mailchimp/GitHub danger zones

#### Триггер

Открывается при изменении **фундаментального элемента** (Learning Objective, Recommended Structure, Pedagogical Strategy):

```
┌─────────────────────────────────────────────────────────┐
│ ⚠️ Изменение затронет зависимые элементы              │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Вы изменяете: Learning Objective "Анализировать..."    │
│                                                         │
│ Это повлияет на:                                        │
│   • 3 урока в секции "Основы"                          │
│   • 2 практических упражнения                          │
│   • 1 проверочный тест (5 вопросов)                    │
│                                                         │
│ ─────────────────────────────────────────────────────── │
│                                                         │
│ Выберите действие:                                      │
│                                                         │
│ ○ Обновить только цель                                 │
│   (Зависимости будут помечены как устаревшие)          │
│                                                         │
│ ○ Обновить всё автоматически                           │
│   (AI перегенерирует зависимый контент)                │
│                                                         │
│ ○ Проверить каждый элемент                             │
│   (Пошаговый просмотр с Accept/Skip/Edit)              │
│                                                         │
│                          [Отмена]  [Продолжить]        │
└─────────────────────────────────────────────────────────┘
```

#### Graduated Warning Severity

| Уровень    | Триггер                           | UI                                                  |
| ---------- | --------------------------------- | --------------------------------------------------- |
| **Low**    | Изменение текста контента         | Inline toast + Undo (5 сек)                         |
| **Medium** | Изменение Lesson Objective        | Modal с affected items + counts                     |
| **High**   | Изменение Module/Course Objective | Danger zone (красная граница) + typing confirmation |

---

### 2.10 FR-010: Semantic Diffing

> **Источник:** Research — Visual diff systems for AI edits

#### Концептуальный diff вместо текстового

После перегенерации показываем **что изменилось концептуально**, а не посимвольно:

```
┌─────────────────────────────────────────────────────────┐
│ ✨ Блок перегенерирован                                 │
├─────────────────────────────────────────────────────────┤
│ Изменения:                                              │
│ • Упрощён язык (уровень: intermediate → beginner)      │
│ • Добавлена аналогия: "как строительство дома"         │
│ • Удалён термин: "декомпозиция"                        │
│ • Добавлен пример: практическое применение в бизнесе   │
│                                                         │
│ Alignment Score: 4/5 ⭐                                 │
│ (Соответствует Learning Objective на 80%)              │
│                                                         │
│             [Принять] [Редактировать] [Отменить]       │
└─────────────────────────────────────────────────────────┘
```

#### JSON Response Schema для LLM

```typescript
interface RegenerationResponse {
  regenerated_content: string; // Markdown
  pedagogical_change_log: string; // Описание изменений
  alignment_score: 1 | 2 | 3 | 4 | 5; // Соответствие LO
  bloom_level_preserved: boolean; // Сохранён ли уровень Bloom
  suggested_glossary_terms: string[]; // Новые термины
  concepts_added: string[]; // Добавленные концепции
  concepts_removed: string[]; // Удалённые концепции
}
```

---

## 3. Нефункциональные требования

### 3.1 NFR-001: Консистентность стиля

- Использовать существующие компоненты из `@/components/ui/`
- Цветовая схема: соответствие `NODE_STYLES` из generation-graph
- Типографика: Tailwind utilities (`text-sm`, `font-medium`, etc.)
- Иконки: Lucide React (уже используются)

### 3.2 NFR-002: Локализация

Все текстовые строки добавить в:

- `packages/web/lib/generation-graph/translations.ts`
- Языки: RU (основной), EN (fallback)

### 3.3 NFR-003: Производительность

- Lazy-loading секций (Accordion)
- Virtualization для списков > 20 элементов
- Мемоизация компонентов редактирования

### 3.4 NFR-004: Доступность (a11y)

- Keyboard navigation (Tab, Enter, Escape)
- ARIA-labels для всех интерактивных элементов
- Focus management при переключении режимов

---

## 4. Технический дизайн

### 4.0 Анализ переиспользования компонентов

> **Принцип:** Переиспользуем только если компонент оптимально подходит для задачи.

#### Переиспользуем (оптимально подходят):

| Компонент          | Почему подходит                        | Где используем                 |
| ------------------ | -------------------------------------- | ------------------------------ |
| `Card`             | Семантически верно для блоков контента | Секции в AnalysisResultView    |
| `Accordion`        | Иерархия Phase → Content               | PhaseAccordion                 |
| `Badge`            | Статусы, теги — точное назначение      | Stale indicators, уровни Bloom |
| `Dialog`           | Стандартная база для модалок           | ImpactAnalysisModal            |
| `Sheet`            | NodeDetailsDrawer уже использует       | Сохраняем                      |
| `Sonner`           | Toast уведомления                      | SaveStatusIndicator            |
| `Button`, `Select` | Стандартные controls                   | Везде                          |

#### НЕ переиспользуем (не подходят):

| Текущий компонент   | Проблема                      | Новое решение                                |
| ------------------- | ----------------------------- | -------------------------------------------- |
| `JsonViewer`        | Технический JSON вид          | `AnalysisResultView` / `CourseStructureView` |
| `AttemptSelector`   | "Attempt 1, 2, 3" непонятно   | `PhaseSelector` с семантикой                 |
| `FormField`         | Для форм, не для inline edit  | `EditableField` с hover-to-edit              |
| `Badge` (read-only) | Нельзя редактировать          | `EditableChips`                              |
| `RefinementChat`    | Общий для stage, не для блока | `InlineRegenerateChat` привязан к блоку      |

### 4.1 Новые компоненты

```
packages/web/components/generation-graph/panels/
├── OutputTab.tsx                    # РЕФАКТОРИНГ: условный рендер View компонентов
├── output/
│   ├── AnalysisResultView.tsx       # НОВЫЙ: Stage 4 human-readable (заменяет JsonViewer)
│   ├── CourseStructureView.tsx      # НОВЫЙ: Stage 5 human-readable (заменяет JsonViewer)
│   ├── EditableField.tsx            # НОВЫЙ: inline edit с hover (FormField не подходит)
│   ├── EditableChips.tsx            # НОВЫЙ: add/remove chips (Badge read-only)
│   ├── InlineRegenerateChat.tsx     # НОВЫЙ: mini-chat привязан к блоку
│   ├── PhaseAccordion.tsx           # НОВЫЙ: использует Accordion как базу
│   ├── SaveStatusIndicator.tsx      # НОВЫЙ: использует Sonner для toast
│   ├── SemanticDiff.tsx             # НОВЫЙ: conceptual diff (Research)
│   ├── StaleDataIndicator.tsx       # НОВЫЙ: использует Badge + Alert (Research)
│   └── ImpactAnalysisModal.tsx      # НОВЫЙ: использует Dialog как базу (Research)
├── PhaseSelector.tsx                # НОВЫЙ: заменяет AttemptSelector
└── phase-names.ts                   # НОВЫЙ: переводы названий фаз

packages/course-gen-platform/src/shared/regeneration/
├── smart-context-router.ts          # НОВЫЙ: Tiered Context Strategy (Research)
├── context-assembler.ts             # НОВЫЙ: сборка контекста по Tier
├── bloom-validator.ts               # НОВЫЙ: валидация Bloom's level
└── semantic-diff-generator.ts       # НОВЫЙ: генерация conceptual diff

packages/course-gen-platform/src/stages/stage5-generation/utils/
└── course-structure-editor.ts       # НОВЫЙ: PATCH отдельных полей с пересчётом
```

### 4.1.1 Архитектурные ограничения (выявлены при анализе)

**Вычисляемые поля требуют пересчёта:**

```typescript
// Section.estimated_duration_minutes = сумма lesson durations
// При изменении lesson.estimated_duration_minutes нужно:
// 1. Пересчитать section.estimated_duration_minutes
// 2. Пересчитать course.estimated_duration_hours

// lesson_number — глобальная нумерация
// При добавлении/удалении lesson нужно:
// 1. Пересчитать lesson_number для всех последующих lessons
```

**Минимум 10 уроков (FR-015):**

- Валидация при любом обновлении структуры
- Блокировать удаление если останется < 10

### 4.2 API изменения

#### Новый endpoint для сохранения полей

```typescript
// packages/course-gen-platform/src/server/routers/generation.ts

// Сохранение отдельного поля результата
generation.updateField = t.procedure
  .input(
    z.object({
      courseId: z.string().uuid(),
      stageId: z.enum(['stage_4', 'stage_5']),
      fieldPath: z.string(), // e.g., "topic_analysis.key_concepts"
      value: z.unknown(),
    })
  )
  .mutation(async ({ input }) => {
    // 1. Получить текущий результат из БД
    // 2. Обновить конкретное поле (lodash.set)
    // 3. Сохранить в БД
    // 4. Вернуть обновлённый объект
  });

// Перегенерация конкретного блока (Research: Tiered Context + Semantic Diff)
generation.regenerateBlock = t.procedure
  .input(
    z.object({
      courseId: z.string().uuid(),
      stageId: z.enum(['stage_4', 'stage_5']),
      blockPath: z.string(), // e.g., "topic_analysis.key_concepts"
      userInstruction: z.string(),
    })
  )
  .mutation(async ({ input }) => {
    // 1. Smart Context Router определяет Tier (1-4)
    // 2. Context Assembler собирает контекст по Tier
    // 3. Генерация XML-structured prompt
    // 4. Вызов LLM с JSON output schema
    // 5. Валидация Bloom's level preserved
    // 6. Генерация Semantic Diff
    // 7. Сохранение в БД
    // 8. Возврат RegenerationResponse
  });

// Получение зависимостей блока (Research: Dependency Graph)
generation.getBlockDependencies = t.procedure
  .input(
    z.object({
      courseId: z.string().uuid(),
      blockPath: z.string(),
    })
  )
  .query(async ({ input }) => {
    // 1. Получить upstream зависимости (от чего зависит)
    // 2. Получить downstream зависимости (что зависит от этого)
    // 3. Вернуть граф с counts
  });

// Каскадное обновление зависимостей (Research: Impact Analysis)
generation.cascadeUpdate = t.procedure
  .input(
    z.object({
      courseId: z.string().uuid(),
      blockPath: z.string(),
      mode: z.enum(['mark_stale', 'auto_regenerate', 'review_each']),
    })
  )
  .mutation(async ({ input }) => {
    // 1. Получить downstream зависимости
    // 2. В зависимости от mode:
    //    - mark_stale: пометить как устаревшие
    //    - auto_regenerate: перегенерировать все
    //    - review_each: вернуть список для пошагового review
  });
```

### 4.3 Схема данных

Без изменений в структуре БД. Сохраняем JSONB в:

- `courses.analysis_result` (Stage 4)
- `courses.course_structure` (Stage 5)

---

## 5. Приоритизация задач

### Pre-req: Production-readiness блокеры

| ID   | Задача                                  | Оценка |
| ---- | --------------------------------------- | ------ |
| T0.1 | AbortController в useRefinement.ts      | 1ч     |
| T0.2 | Zod валидация API responses на frontend | 2ч     |

**Итого pre-req:** 3ч (выполнить ДО основных задач)

### P0: Критичный (MVP)

| ID  | Задача                                                       | Оценка |
| --- | ------------------------------------------------------------ | ------ |
| T1  | PhaseSelector с человеко-понятными названиями                | 2ч     |
| T2  | AnalysisResultView — базовое отображение + skeleton loading  | 4ч     |
| T3  | CourseStructureView — базовое отображение + skeleton loading | 4ч     |
| T4  | Авто-раскрытие Stage 4/5 + Zod parse traces                  | 1ч     |

### P1: Важный (Редактирование)

| ID  | Задача                                                              | Оценка |
| --- | ------------------------------------------------------------------- | ------ |
| T5  | EditableField компонент                                             | 3ч     |
| T6  | Автосохранение с debounce + SaveStatusIndicator + **optimistic UI** | 3ч     |
| T7  | API endpoint generation.updateField                                 | 2ч     |
| T8  | EditableChips компонент                                             | 2ч     |

### P2: Важный (Перегенерация — из Research)

| ID  | Задача                                                                  | Оценка |
| --- | ----------------------------------------------------------------------- | ------ |
| T9  | InlineRegenerateChat с XML-structured prompts + **exponential backoff** | 6ч     |
| T10 | API endpoint generation.regenerateBlock                                 | 3ч     |
| T11 | Smart Context Router (Tiered Strategy)                                  | 4ч     |
| T12 | Quick Actions с Bloom's level validation                                | 2ч     |
| T13 | Semantic Diffing UI (concepts added/removed) + **Sentry logging**       | 4ч     |

### P3: Важный (Зависимости — из Research)

| ID  | Задача                                     | Оценка |
| --- | ------------------------------------------ | ------ |
| T14 | Dependency Graph schema (Curriculum DAG)   | 4ч     |
| T15 | Stale Data Indicators UI                   | 3ч     |
| T16 | Impact Analysis Modal                      | 4ч     |
| T17 | Graduated Warning System (Low/Medium/High) | 2ч     |

### P4: Оптимизация

| ID  | Задача                                     | Оценка |
| --- | ------------------------------------------ | ------ |
| T18 | Context Caching для статического контекста | 3ч     |
| T19 | Virtualization для длинных списков         | 2ч     |
| T20 | Undo/Redo для редактирования               | 3ч     |
| T21 | Keyboard shortcuts                         | 2ч     |

### Сводка

| Приоритет           | Задачи    | Часов   |
| ------------------- | --------- | ------- |
| P0 (MVP)            | T1-T4     | 11ч     |
| P1 (Редактирование) | T5-T8     | 9ч      |
| P2 (Перегенерация)  | T9-T13    | 17ч     |
| P3 (Зависимости)    | T14-T17   | 13ч     |
| P4 (Оптимизация)    | T18-T21   | 10ч     |
| **Итого**           | 21 задача | **60ч** |

### Рекомендуемые фазы внедрения

**Фаза 1 (P0 + P1):** Базовый UI + редактирование — **20ч**

- Пользователь видит понятные результаты
- Может редактировать и сохранять

**Фаза 2 (P2):** Перегенерация с AI — **17ч**

- Inline-чат с моделью
- Smart Context для экономии токенов
- Semantic Diffing для понимания изменений

**Фаза 3 (P3):** Dependency Management — **13ч**

- Граф зависимостей
- Stale indicators
- Impact Analysis

**Фаза 4 (P4):** Polish — **10ч**

- Производительность
- UX-улучшения

---

## 6. Acceptance Criteria

### AC-001: Понятность для пользователя

- [ ] Нет технических терминов типа "Attempt", "JSON", "phase"
- [ ] Все названия на русском языке
- [ ] Описание каждой секции объясняет её назначение

### AC-002: Редактирование

- [ ] Все текстовые поля редактируемы
- [ ] Списки (chips) позволяют добавлять/удалять элементы
- [ ] Enum-поля показывают понятные варианты (не коды)

### AC-003: Сохранение

- [ ] Изменения сохраняются автоматически через 1 сек после ввода
- [ ] Отображается индикатор "Сохранение..." → "Сохранено"
- [ ] При потере фокуса — мгновенное сохранение

### AC-004: Перегенерация

- [ ] Кнопка [🔄] доступна для каждого блока
- [ ] Mini-chat открывается под блоком
- [ ] Quick Actions работают одним кликом
- [ ] Результат перегенерации можно принять или отменить

### AC-005: Авто-раскрытие

- [ ] Stage 4 открывается при статусе 'completed'
- [ ] Stage 5 открывается при статусе 'completed'
- [ ] Плавная анимация открытия

### AC-006: Tiered Context (из Research)

- [ ] Smart Context Router определяет уровень контекста автоматически
- [ ] Tier 1-4 используют разный объём токенов
- [ ] Context Caching работает для статических данных

### AC-007: Dependency Management (из Research)

- [ ] Stale Data Indicator появляется при изменении upstream-зависимости
- [ ] Impact Analysis Modal показывает affected elements с counts
- [ ] Три варианта: Update only / Update all / Review each

### AC-008: Semantic Diffing (из Research)

- [ ] После перегенерации показывается conceptual diff
- [ ] Alignment Score отображается (1-5)
- [ ] Concepts added/removed видны пользователю
- [ ] Bloom's level preserved/changed индикатор

---

## 7. Анализ текущей архитектуры

> Результат code review субагентами

### 7.1 Что хорошо в текущей архитектуре

| Аспект                   | Описание                                                                         |
| ------------------------ | -------------------------------------------------------------------------------- |
| **NodeDetailsDrawer**    | Хорошо структурирован, 4 таба, низкая сложность рефакторинга                     |
| **Zustand store**        | `useNodeSelection` — централизованное управление выбором узла                    |
| **JsonViewer**           | Мощный компонент с пагинацией, syntax highlighting, анимациями (но не для users) |
| **UnifiedRegenerator**   | 5-слойная система восстановления JSON, production-ready                          |
| **Type safety**          | Хорошая типизация с TraceAttempt, ProcessMetrics, AnalysisResult                 |
| **UI библиотека**        | 95% базовых компонентов уже реализованы и протестированы                         |
| **Section regeneration** | Атомарное обновление секций уже работает                                         |

### 7.2 Что плохо / требует улучшения

| Проблема                         | Влияние                                 | Решение в ТЗ                                |
| -------------------------------- | --------------------------------------- | ------------------------------------------- |
| **JsonViewer для output**        | Пользователи видят технический JSON     | AnalysisResultView / CourseStructureView    |
| **"Attempt 1, 2, 3"**            | Непонятно что это за этапы              | PhaseSelector с семантическими названиями   |
| **RefinementChat общий**         | Нельзя перегенерировать конкретный блок | InlineRegenerateChat привязан к блоку       |
| **Нет PATCH для полей**          | Нельзя обновить отдельное поле          | Новый API endpoint generation.updateField   |
| **Нет dependency graph**         | Нет отслеживания зависимостей           | FR-008: Dependency Graph + Stale Indicators |
| **Авто-открытие только Stage 3** | Stage 4/5 требуют ручного открытия      | FR-005: Авто-раскрытие Stage 4/5            |

### 7.3 Архитектурная совместимость ТЗ

**Полностью совместимо:**

- Использование Sheet для drawer (уже так)
- Tabs внутри NodeDetailsDrawer (уже есть)
- Sonner для toast уведомлений (уже настроен)
- Accordion для иерархии (есть в UI kit)

**Требует новых компонентов:**

- Human-readable views для Stage 4/5 output
- Inline editing с автосохранением
- Block-level regeneration chat
- Semantic diffing UI

**Требует новых API:**

- `generation.updateField` — PATCH отдельного поля
- `generation.getBlockDependencies` — граф зависимостей
- `generation.cascadeUpdate` — каскадное обновление

**Потенциальные конфликты:**

- Вычисляемые поля (duration) требуют пересчёта при редактировании
- Глобальная нумерация lessons требует пересчёта при изменении структуры
- Минимум 10 уроков — валидация при любом удалении

---

## 8. Production-Readiness: Pre-requisites

> Результат аудита production-readiness (score: Frontend 65/100, Backend 82/100)

### 8.1 Исправить ДО начала реализации (блокеры)

| Проблема                  | Файл                   | Что сделать                                           | Оценка |
| ------------------------- | ---------------------- | ----------------------------------------------------- | ------ |
| **Нет AbortController**   | `useRefinement.ts`     | Добавить abort signal для отмены запросов при unmount | 1ч     |
| **Нет Zod для responses** | `generation.ts` router | Валидировать API responses на frontend                | 2ч     |

### 8.2 Исправить В РАМКАХ ТЗ (объединить с задачами)

| Проблема                        | Задача ТЗ                | Как объединить                     |
| ------------------------------- | ------------------------ | ---------------------------------- |
| Нет optimistic updates          | T6: Автосохранение       | Optimistic UI при сохранении полей |
| Нет retry с backoff             | T9: InlineRegenerateChat | Exponential backoff + jitter       |
| Нет Sentry logging              | T13: SemanticDiff        | Логировать ошибки регенерации      |
| Слабые loading states           | T2, T3: Views            | Skeleton loading для контента      |
| Realtime traces не валидируются | T4: Авто-раскрытие       | Zod parse перед обработкой         |

### 8.3 Можно отложить (не блокирует)

- Quota check transaction-aware (редкий race)
- Batch rollback для Stage 6 (вне scope)
- Stage-specific retry policies (оптимизация)
- Full undo/redo history (P4 улучшение)

---

## 9. Риски и митигации

| Риск                                       | Вероятность | Влияние | Митигация                       |
| ------------------------------------------ | ----------- | ------- | ------------------------------- |
| Сложность парсинга вложенных JSONB         | Средняя     | Высокое | Использовать lodash.get/set     |
| Перегрузка UI для больших курсов           | Средняя     | Среднее | Virtualization + Accordion      |
| Конфликты при одновременном редактировании | Низкая      | Высокое | Optimistic UI + Last-write-wins |
| LLM latency при перегенерации              | Высокая     | Среднее | Streaming + skeleton loading    |

---

## 8. Зависимости

### Внешние библиотеки (уже установлены)

- `@radix-ui/react-accordion` — для секций
- `lodash` — для get/set по пути
- `framer-motion` — для анимаций
- `lucide-react` — для иконок

### Внутренние зависимости

- `packages/shared-types/src/analysis-result.ts` — типы Stage 4
- `packages/shared-types/src/generation-result.ts` — типы Stage 5
- `packages/web/components/ui/` — базовые компоненты

---

## 9. Мокапы

> Мокапы будут созданы на этапе дизайна. Референс: Notion blocks, Linear issues editor.

---

## Appendix A: Переводы названий фаз

```typescript
// packages/web/lib/generation-graph/phase-names.ts

export const PHASE_NAMES = {
  stage_4: {
    phase_0: {
      ru: 'Подготовка',
      en: 'Preparation',
      description: {
        ru: 'Проверка готовности документов к анализу',
        en: 'Checking document readiness for analysis',
      },
    },
    phase_1: {
      ru: 'Классификация',
      en: 'Classification',
      description: {
        ru: 'Определение категории и темы курса',
        en: 'Determining course category and topic',
      },
    },
    phase_2: {
      ru: 'Планирование объёма',
      en: 'Scope Planning',
      description: {
        ru: 'Расчёт количества уроков и секций',
        en: 'Calculating lessons and sections count',
      },
    },
    phase_3: {
      ru: 'Экспертный анализ',
      en: 'Expert Analysis',
      description: {
        ru: 'Глубокий анализ и выбор педагогической стратегии',
        en: 'Deep analysis and pedagogical strategy selection',
      },
    },
    phase_4: {
      ru: 'Синтез документов',
      en: 'Document Synthesis',
      description: {
        ru: 'Анализ загруженных материалов и создание рекомендаций',
        en: 'Analyzing uploaded materials and creating recommendations',
      },
    },
    phase_6: {
      ru: 'RAG-планирование',
      en: 'RAG Planning',
      description: {
        ru: 'Связывание документов с разделами курса',
        en: 'Mapping documents to course sections',
      },
    },
    phase_5: {
      ru: 'Финализация',
      en: 'Finalization',
      description: {
        ru: 'Сборка итогового результата анализа',
        en: 'Assembling final analysis result',
      },
    },
  },
  stage_5: {
    validate_input: {
      ru: 'Валидация',
      en: 'Validation',
      description: {
        ru: 'Проверка входных данных',
        en: 'Input data validation',
      },
    },
    generate_metadata: {
      ru: 'Метаданные',
      en: 'Metadata',
      description: {
        ru: 'Генерация описания и характеристик курса',
        en: 'Generating course description and properties',
      },
    },
    generate_sections: {
      ru: 'Структура',
      en: 'Structure',
      description: {
        ru: 'Создание секций и уроков курса',
        en: 'Creating course sections and lessons',
      },
    },
    validate_quality: {
      ru: 'Проверка качества',
      en: 'Quality Check',
      description: {
        ru: 'Валидация по образовательным стандартам',
        en: 'Validation against educational standards',
      },
    },
    validate_lessons: {
      ru: 'Проверка уроков',
      en: 'Lessons Check',
      description: {
        ru: 'Проверка минимального количества уроков',
        en: 'Checking minimum lessons requirement',
      },
    },
  },
} as const;
```

---

## Appendix B: Пример EditableField компонента

```tsx
// packages/web/components/generation-graph/panels/output/EditableField.tsx

interface EditableFieldProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  type?: 'text' | 'textarea' | 'number';
  onRegenerate?: (instruction: string) => Promise<void>;
}

export function EditableField({
  value,
  onChange,
  label,
  placeholder,
  type = 'text',
  onRegenerate,
}: EditableFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [localValue, setLocalValue] = useState(value);

  const debouncedSave = useDebouncedCallback((v: string) => {
    onChange(v);
  }, 1000);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setLocalValue(e.target.value);
    debouncedSave(e.target.value);
  };

  return (
    <div className="group relative">
      {label && (
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium text-slate-700">{label}</label>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => setIsEditing(true)}
            >
              <Pencil className="h-3 w-3" />
            </Button>
            {onRegenerate && (
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={() => setShowChat(true)}
              >
                <RefreshCw className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      )}

      {isEditing ? (
        <input
          value={localValue}
          onChange={handleChange}
          onBlur={() => {
            debouncedSave.flush();
            setIsEditing(false);
          }}
          className="w-full px-2 py-1 border rounded"
          autoFocus
        />
      ) : (
        <p
          className="text-slate-900 cursor-pointer hover:bg-slate-50 px-2 py-1 rounded"
          onClick={() => setIsEditing(true)}
        >
          {value || <span className="text-slate-400">{placeholder}</span>}
        </p>
      )}

      {showChat && (
        <InlineRegenerateChat
          onSubmit={async instruction => {
            await onRegenerate?.(instruction);
            setShowChat(false);
          }}
          onCancel={() => setShowChat(false)}
        />
      )}
    </div>
  );
}
```

---

## Changelog

| Версия | Дата       | Изменения                                                                                                                                                                                               |
| ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.2.0  | 2025-12-05 | Финальная проверка: анализ переиспользования компонентов (что подходит/не подходит), архитектурный аудит (что хорошо/плохо), выявление ограничений (вычисляемые поля, lesson numbering, min 10 lessons) |
| 1.1.0  | 2025-12-05 | Интеграция результатов Deep Research: Tiered Context Strategy, Dependency Graph, Stale Data Indicators, Impact Analysis Modal, Semantic Diffing, XML-structured prompts, Bloom's validation             |
| 1.0.0  | 2025-12-05 | Первая версия ТЗ                                                                                                                                                                                        |
