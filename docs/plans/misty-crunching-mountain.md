# План: Рефакторинг Stage 4/5 - Устранение Over-Engineering

## Контекст

E2E тест автоматического режима выявил несколько проблем. Перед повторным запуском необходимо:

1. Исправить найденные баги (mc2-ikio, mc2-0doo, mc2-nwh8)
2. Провести рефакторинг Stage 4/5 для устранения over-engineering

---

## Часть 1: Выявленные ошибки (P1 - исправить до запуска)

### 1.1 mc2-ikio: Difficulty Enum Mismatch

**Проблема**: Stage 4 возвращает `difficulty='medium'`, но Stage 5 Zod ожидает `'beginner'|'intermediate'|'advanced'`

**Файлы**:

- `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase2-scope.ts`
- `packages/shared-types/src/analysis-schemas.ts`

**Решение**: Унифицировать enum difficulty на всех уровнях

### 1.2 mc2-0doo: Duplicate Stage 5 Jobs

**Проблема**: Создаются дублирующиеся jobs для одного курса (Job 10 и Job 11 на Stage 5)

**Файлы**:

- `packages/course-gen-platform/src/shared/auto-approval/index.ts`
- `packages/course-gen-platform/src/orchestrator/queue.ts`

**Решение**: Добавить idempotency check перед созданием job

### 1.3 mc2-nwh8: Markdown JSON Parsing

**Проблема**: LLM оборачивает JSON в ```json блоки, что ломает парсинг

**Файлы**:

- `packages/course-gen-platform/src/shared/llm/response-parser.ts`

**Решение**: Добавить stripping markdown code blocks перед JSON.parse()

---

## Часть 2: Анализ Over-Engineering

### 2.1 Stage 4 - Избыточные поля (~40% не используется)

| Поле                              | Статус      | Проблема                                       |
| --------------------------------- | ----------- | ---------------------------------------------- |
| `contextual_language` (6 полей)   | **UNUSED**  | Генерируется, но никогда не читается Stage 5/6 |
| `pedagogical_patterns`            | **PARTIAL** | Дублирует `pedagogical_strategy`               |
| `expansion_areas`                 | **UNUSED**  | Часто null или игнорируется                    |
| `topic_analysis.missing_elements` | **UNUSED**  | Не влияет на генерацию                         |
| `section_id`, `prerequisites`     | **UNUSED**  | Stage 5 пересчитывает индексы                  |

**Стоимость**: ~15-20% токенов тратится на генерацию неиспользуемых полей

### 2.2 Stage 5 - Избыточные поля

| Поле                                  | Статус        | Проблема                                   |
| ------------------------------------- | ------------- | ------------------------------------------ |
| `course_overview` (до 10000 символов) | **DUPLICATE** | Дублирует `course_description`             |
| `target_audience` (строка)            | **DUPLICATE** | Есть `learning_outcomes` + `prerequisites` |
| `lesson_description`                  | **REDUNDANT** | Есть `lesson_objectives` + `key_topics`    |
| `section_number`, `lesson_number`     | **REDUNDANT** | Можно использовать array index             |

### 2.3 Дублирование с User Input

| Данные              | User Input         | Stage 4                          | Stage 5                                | Дублирование |
| ------------------- | ------------------ | -------------------------------- | -------------------------------------- | ------------ |
| Тема курса          | `topic`            | `determined_topic`               | `course_title`                         | **3x**       |
| Целевая аудитория   | `targetAudience`   | `topic_analysis.target_audience` | `target_audience` + `difficulty_level` | **4x**       |
| Результаты обучения | `learningOutcomes` | -                                | `learning_outcomes[]`                  | **2x**       |
| Сложность           | `difficulty`       | `topic_analysis.target_audience` | `difficulty_level`                     | **3x**       |

### 2.4 Избыточная валидация (5 уровней!)

1. Phase 1: `validate_input` (Zod schema)
2. Phase 4: `validate_quality` (embeddings + LLM-as-judge)
3. Phase 5: `validate_lessons` (минимум 10)
4. Handler: `CourseStructureSchema.safeParse()`
5. Handler: XSS sanitization

---

## Часть 3: План рефакторинга

### 3.1 Tier 1 - Удаление мёртвого кода (P1)

**Задача**: Удалить генерацию полей, которые никогда не используются

**Stage 4 изменения**:

```typescript
// УДАЛИТЬ из Phase 1:
- contextual_language (все 6 полей)

// ОПЦИОНАЛЬНО сделать в Phase 1:
- pedagogical_patterns (или объединить с pedagogical_strategy)
```

**Оценка**: Экономия ~500-1000 токенов на курс

### 3.2 Tier 2 - Устранение дублирования (P2)

**Stage 5 изменения**:

```typescript
// УДАЛИТЬ:
- course_overview (использовать course_description)
- target_audience строка (использовать difficulty_level + learning_outcomes)
- lesson_description (использовать lesson_objectives + key_topics)
- section_number, lesson_number (использовать array index)
```

**User Input → Stage 4/5 flow**:

```
Вместо: User → Stage 4 генерирует → Stage 5 генерирует (дубли)
Делать: User → Stage 4 уточняет → Stage 5 использует напрямую
```

### 3.3 Tier 3 - Консолидация валидации (P3)

**Текущее**: 5 уровней валидации, разбросанных по коду
**Новое**: 2 уровня валидации

```typescript
// Уровень 1: Структурная валидация (Zod)
validateStructure(input); // Один раз на входе

// Уровень 2: Качественная валидация (embeddings)
validateQuality(output); // Один раз на выходе
```

### 3.4 Tier 4 - Упрощение схем (P3)

**Сократить лимиты**:

```typescript
// Было:
course_title: z.string().min(10).max(1000);
course_overview: z.string().min(30).max(10000);

// Стало:
course_title: z.string().min(5).max(200);
// course_overview - УДАЛИТЬ
```

---

## Часть 4: Организация задач в Beads

### Существующие задачи (баги) - повысить до P1

- `mc2-ikio` - difficulty enum mismatch → **P1**
- `mc2-0doo` - duplicate jobs → **P1**
- `mc2-nwh8` - markdown JSON parsing → **P1**

### Новые задачи (рефакторинг) - все P1

| ID           | Тип      | Название                                                                                | Приоритет | Зависит от         |
| ------------ | -------- | --------------------------------------------------------------------------------------- | --------- | ------------------ |
| **mc2-NEW1** | refactor | Stage 4: Remove contextual_language (dead code)                                         | **P1**    | -                  |
| **mc2-NEW2** | refactor | Stage 5: Remove duplicate fields (course_overview, target_audience, lesson_description) | **P1**    | mc2-NEW1           |
| **mc2-NEW3** | refactor | Unify difficulty enum across stages (medium→intermediate)                               | **P1**    | mc2-ikio           |
| **mc2-NEW4** | refactor | Consolidate validation (5→2 levels)                                                     | **P1**    | mc2-NEW1, mc2-NEW2 |

### Рекомендуемый порядок выполнения (все P1)

**Фаза 1: Исправление багов (блокеры E2E теста)**

```
1. mc2-nwh8 (markdown parsing) - ~10 строк, быстрый фикс
2. mc2-ikio (difficulty enum) - ~20 строк, блокер Stage 5
3. mc2-0doo (duplicate jobs) - ~15 строк, стабильность
```

**Фаза 2: Рефакторинг Stage 4/5 (устранение over-engineering)**

```
4. mc2-NEW3 (unify difficulty) - завершает mc2-ikio
5. mc2-NEW1 (remove contextual_language) - чистка Stage 4
6. mc2-NEW2 (remove duplicate fields) - чистка Stage 5
7. mc2-NEW4 (consolidate validation) - финальная оптимизация
```

**Зависимости:**

```
mc2-ikio ─────┬───▶ mc2-NEW3
              │
mc2-NEW1 ─────┼───▶ mc2-NEW2 ─────▶ mc2-NEW4
              │
mc2-nwh8, mc2-0doo (независимые)
```

---

## Часть 5: Файлы для изменения

### Баги (P1)

| Файл                                            | Задача   | Изменение                     |
| ----------------------------------------------- | -------- | ----------------------------- |
| `shared-types/src/analysis-schemas.ts`          | mc2-ikio | Унифицировать difficulty enum |
| `stages/stage4-analysis/phases/phase2-scope.ts` | mc2-ikio | Использовать unified enum     |
| `shared/auto-approval/index.ts`                 | mc2-0doo | Добавить idempotency check    |
| `shared/llm/response-parser.ts`                 | mc2-nwh8 | Strip markdown blocks         |

### Рефакторинг Stage 4 (P2)

| Файл                                                     | Задача   | Изменение                   |
| -------------------------------------------------------- | -------- | --------------------------- |
| `stages/stage4-analysis/phases/phase1-classification.ts` | mc2-NEW1 | Удалить contextual_language |
| `stages/stage4-analysis/types/analysis-result.ts`        | mc2-NEW1 | Обновить типы               |
| `shared-types/src/analysis-schemas.ts`                   | mc2-NEW1 | Обновить Zod schema         |

### Рефакторинг Stage 5 (P2)

| Файл                                                        | Задача   | Изменение                 |
| ----------------------------------------------------------- | -------- | ------------------------- |
| `stages/stage5-generation/generators/metadata-generator.ts` | mc2-NEW2 | Убрать course_overview    |
| `stages/stage5-generation/generators/section-generator.ts`  | mc2-NEW2 | Убрать lesson_description |
| `stages/stage5-generation/types/course-structure.ts`        | mc2-NEW2 | Обновить типы             |
| `shared-types/src/course-structure-schema.ts`               | mc2-NEW2 | Обновить Zod schema       |

---

## Часть 6: Верификация

### После исправления багов

```bash
# 1. Type-check
pnpm type-check

# 2. Build
pnpm build

# 3. Запустить E2E тест
./start-dev.sh  # Terminal 1
cd packages/course-gen-platform && pnpm tsx scripts/e2e-express-auto-course.ts  # Terminal 2
```

### Критерии успеха E2E теста

| Метрика              | Ожидание                             |
| -------------------- | ------------------------------------ |
| Автопереходы         | Stage 4 → 5 → 6 без ручных одобрений |
| Уроков               | 8-16 (mini формат)                   |
| Ошибок парсинга JSON | 0                                    |
| Duplicate jobs       | 0                                    |
| Difficulty mismatch  | 0                                    |

### После рефакторинга

```bash
# Проверить что токены сократились
# Сравнить generation_metadata.total_tokens до и после

# Проверить что полуавтоматический режим работает
# Создать курс с generation_mode: 'semi_automatic'
# Убедиться что останавливается на stage_X_awaiting_approval
```

---

## Рекомендация

**Все задачи P1** - критичны для стабильной работы pipeline.

**Порядок работы:**

1. **Фаза 1 (Баги)**: mc2-nwh8 → mc2-ikio → mc2-0doo (~45 строк кода)
2. **E2E тест**: Проверить что pipeline проходит Stage 4 → 5 → 6
3. **Фаза 2 (Рефакторинг)**: mc2-NEW3 → mc2-NEW1 → mc2-NEW2 → mc2-NEW4

**Оценка эффекта рефакторинга:**

- Экономия ~15-20% токенов на генерацию курса
- Удаление ~40 неиспользуемых полей
- Консолидация 5 уровней валидации → 2 уровня
- Устранение 3x-4x дублирования данных с user input
