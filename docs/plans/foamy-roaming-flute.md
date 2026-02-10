# Fix: course_description Pipeline + Phase 0.5 Expansion

## Context

Курс QGN-6607: пользователь указал в `course_description` точную структуру из 7 модулей с конкретными компаниями-кейсами. Итоговая структура не совпадает с запросом.

**Две корневые проблемы:**

1. `course_description` не передаётся в LLM-промпты Stage 4 Phase 1 и Phase 2
2. Phase 0.5 (уточняющие вопросы) слишком ограничена: 6 абстрактных категорий, лимит 20 вопросов, 1 раунд

---

## Часть A: Передача course_description в Stage 4

### Аудит прохождения по этапам

| Этап                | Получает?                       | Использует в промпте?        | Статус           |
| ------------------- | ------------------------------- | ---------------------------- | ---------------- |
| Stage 4 Phase 0.5   | Да (courseContext.description)  | Да (строка "Description:")   | OK               |
| **Stage 4 Phase 1** | В input есть                    | **Нет**                      | **FIX**          |
| **Stage 4 Phase 2** | **Не передаётся**               | **Нет**                      | **CRITICAL FIX** |
| Stage 4 Phase 5     | Да (courseContext.description)  | Да                           | OK               |
| Stage 5             | frontend_parameters.description | Да (buildUserContextSection) | OK               |

### Fix A1: Phase 1 — передать course_description

**Файлы:**

- `phases/phase-1-classifier.ts` (строки 34-58, 66+): Добавить `course_description?: string` в `Phase1Input`, вставить в промпт
- `orchestrator-phase-helpers.ts` (строка 149): Передать `course_description: input.course_description`

### Fix A2: Phase 2 — передать и использовать course_description (CRITICAL)

**Файлы:**

- `orchestrator-phase-helpers.ts` (строка 354): Добавить `course_description` и `learning_outcomes` в вызов `runPhase2Scope()`
- `phases/phase-2-scope.ts`: Добавить `buildCourseDescriptionContext()`, `buildLearningOutcomesContext()`, обновить `buildPhase2Prompt()` и `buildUserPrompt()`, добавить инструкцию RESPECT USER STRUCTURE

Phase2InputSchema (shared-types) уже содержит `course_description` — изменение схемы НЕ требуется.

**Инструкция в промпте Phase 2:**

```
**CRITICAL: RESPECT USER-PROVIDED STRUCTURE**

If the USER-PROVIDED COURSE DESCRIPTION specifies explicit course structure (modules, sections, topics):
- Use it as the PRIMARY blueprint for sections_breakdown
- Each user-specified module/topic MUST become a separate section
- Preserve user's ordering
- Do NOT invent your own structure when the user has already defined one
```

---

## Часть B: Расширение Phase 0.5

### B1. Новые блоки вопросов (8 вместо 6)

На основе рекомендаций методолога + дополнения:

| #   | Ключ                    | Название                | Описание                                                         | Источник                |
| --- | ----------------------- | ----------------------- | ---------------------------------------------------------------- | ----------------------- |
| 1   | `company_context`       | Контекст компании       | Чем занимается, отрасль, размер, культура, существующее обучение | Методолог #1            |
| 2   | `audience`              | Целевая аудитория       | Для кого курс, роли, уровень подготовки, болевые точки           | Методолог #2            |
| 3   | `expected_outcomes`     | Ожидаемые результаты    | Что должен уметь после курса, измеримые навыки                   | Методолог #3            |
| 4   | `content_structure`     | Контент и структура     | Обязательные тезисы, модули, темы, кейсы, глубина                | Методолог #4            |
| 5   | `focus_priorities`      | Акценты и приоритеты    | На что сделать упор, ключевые компетенции                        | Методолог #5            |
| 6   | `business_goals`        | Бизнес-цели             | ROI, метрики эффективности, связь с бизнес-задачами              | Дополнение              |
| 7   | `practical_application` | Практическое применение | Упражнения, проекты, реальные сценарии, кейсы                    | Дополнение              |
| 8   | `constraints`           | Ограничения             | Время, объём, бюджет, compliance, технические ограничения        | Из existing format+tool |

**Изменения:**

- `phase-0.5-clarifying.ts` строка 93: Обновить `question_category` enum на 8 новых значений
- `phase-0.5-clarifying.ts` строка 333: Обновить категории в system prompt
- Промпт: LLM должен генерировать вопросы ПО КАЖДОМУ БЛОКУ (min 1 вопрос на блок)

### B2. Убрать лимит количества вопросов

**Текущее ограничение:**

- Zod: `z.array(ClarifyingQuestionSchema).min(3).max(20)` (строка 115)
- Промпт: "Generate 3-20 questions" (строка 341, 394)
- Priority guidance: "<50% → 12-20", "50-80% → 8-15", ">80% → 3-8" (строки 282-294)

**Изменение:**

- Zod: `.min(3).max(50)` — увеличить верхний лимит до 50 (технически безопасно)
- Промпт: убрать жёсткие диапазоны, заменить на: "Generate as many questions as needed for complete understanding. Minimum 1 question per block. No artificial limits."
- Priority guidance: переформулировать без цифр, фокус на качество а не количество

### B3. Мульти-раундовая система уточнений (до 3 раундов)

**Текущее состояние:**

- `iteration_round` поле уже есть в DB (всегда = 1)
- Комментарий в коде: "round 2 removed"
- Один раунд: генерация → ответы → proceed

**Новая схема (3 раунда максимум):**

```
Round 1 (обязательный):
  Анализ всего input → Генерация вопросов по блокам → Ожидание ответов
  → Пользователь отвечает → approveAndProceed

Round 2 (опциональный):
  LLM анализирует ответы Round 1 → Решает: достаточно ИЛИ нужны уточнения
  → Если достаточно → переход к Phase 1
  → Если нет → генерация follow-up вопросов (по пробелам в ответах)
  → Ожидание ответов → approveAndProceed

Round 3 (финальный, опциональный):
  Аналогично Round 2, но после ответов — ОБЯЗАТЕЛЬНЫЙ переход к Phase 1
  → Нет 4-го раунда
```

**Ключевое решение: кто решает, нужен ли следующий раунд?**

Рекомендация: LLM анализирует полноту ответов и генерирует `sufficiency_verdict`:

```typescript
{
  is_sufficient: boolean,        // достаточно ли информации
  confidence: number,            // 0-1 уверенность
  gaps: string[],                // что ещё неясно
  follow_up_questions?: [...],   // если не sufficient — уже готовые вопросы
}
```

Если `is_sufficient: false` И раунд < 3 → автоматически создаёт follow-up вопросы.
Если раунд = 3 → proceed в любом случае.
Пользователь ВСЕГДА может нажать "proceed" и пропустить дополнительные раунды.

**Реализация:**

1. **Новая функция `analyzeSufficiency()`** — LLM-вызов после получения ответов:
   - Input: все вопросы + ответы текущего раунда + контекст
   - Output: `SufficiencyVerdict` (достаточно / нет + follow-up вопросы)

2. **Обновить `approveAndProceed`** endpoint:
   - Добавить опцию `force_proceed: boolean` — пользователь может пропустить анализ
   - Если не force: вызвать `analyzeSufficiency()` → решить, создавать ли Round 2/3
   - Если follow-up нужен: вернуть `{ needsFollowUp: true, round: 2 }` вместо создания job

3. **Обновить DB-схему clarifying_questions:**
   - `iteration_round` уже есть — использовать для Round 1/2/3
   - Добавить `sufficiency_verdict` JSONB поле в courses (или отдельная таблица)

4. **Обновить фронтенд (API):**
   - `getProgress` — возвращать `currentRound`, `maxRounds: 3`
   - `approveAndProceed` — возвращать `{ success: true, nextAction: 'proceed' | 'follow_up', round: N }`

---

## Файлы для изменения

### Часть A (3 файла):

| Файл                            | Изменение                                                           |
| ------------------------------- | ------------------------------------------------------------------- |
| `orchestrator-phase-helpers.ts` | Передать course_description в Phase 1 (стр 149) и Phase 2 (стр 354) |
| `phase-2-scope.ts`              | 2 helper-функции + обновить промпт + инструкция RESPECT             |
| `phase-1-classifier.ts`         | Добавить поле в Phase1Input + использовать в промпте                |

### Часть B (5+ файлов):

| Файл                             | Изменение                                                                        |
| -------------------------------- | -------------------------------------------------------------------------------- |
| `phase-0.5-clarifying.ts`        | Новые категории, убрать лимит, обновить промпт, новая функция analyzeSufficiency |
| `orchestrator-phase-helpers.ts`  | Логика мульти-раунда в runClarifyingPhase                                        |
| `clarifying.router.ts`           | Обновить approveAndProceed для мульти-раунда                                     |
| `clarifying-approval-helpers.ts` | Логика анализа достаточности                                                     |
| `clarifying-schemas.ts`          | Обновить схемы для новых категорий                                               |
| DB migration                     | sufficiency_verdict поле (если нужно)                                            |

---

## Verification

1. **Type-check**: `pnpm type-check`
2. **Unit tests**: `pnpm --filter course-gen-platform test`
3. **Обратная совместимость**: course_description=undefined → пустой контекст, старые курсы работают
4. **Ручной тест Часть A**: курс с явной структурой → Phase 2 output соответствует описанию
5. **Ручной тест Часть B**: курс с неполным описанием → Phase 0.5 генерирует вопросы по 8 блокам → после ответов → анализ достаточности → Round 2 если нужно
