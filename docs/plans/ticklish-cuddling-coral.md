# План: Stage 4 Phase 0.5 - Clarifying Questions

> **Статус**: ✅ **ПОЛНОСТЬЮ РЕАЛИЗОВАН** - Готов к E2E тестированию
> **Дата обновления**: 2026-01-25
> **Оценка Code Review**: **A- (Excellent)** → готов к production
> **Верификация**: ✅ **Реализация соответствует оригинальному плану** (проверено 2026-01-25)
> **Коммиты**:
>
> - `8a67c19b feat(stage4): implement Phase 0.5 Clarifying Questions`
> - `c096b082 fix(stage4): critical fixes for Phase 0.5 Clarifying Questions`
> - `61821678 fix(stage4): Phase 0.5 - critical fixes Phase 2`
> - `ec8f8694 feat(stage4): Phase 0.5 security and reliability improvements`
> - `1eddf68f fix(stage4): Phase 0.5 backlog improvements`
> - `95da6804 fix(stage4): Phase 0.5 final improvements from code review`

---

## ✅ ВСЕ ЗАДАЧИ ВЫПОЛНЕНЫ (2026-01-25)

### Критические исправления (commit ec8f8694)

| Задача                     | Статус | Детали                                              |
| -------------------------- | ------ | --------------------------------------------------- |
| XSS защита через DOMPurify | ✅     | `ClarifyingPanel.tsx:4,44-56`                       |
| CSRF защита в tRPC client  | ✅     | `client.ts:66-101` (X-CSRF-Token header)            |
| LLM timeout 60s            | ✅     | `phase-0.5-clarifying.ts:344-358` (AbortController) |
| Валидация custom answers   | ✅     | `clarifying.router.ts:569-575`                      |

### Backlog задачи (commit 1eddf68f)

| Задача                                  | Статус | Детали                                                                           |
| --------------------------------------- | ------ | -------------------------------------------------------------------------------- |
| Atomic RPC `approve_and_proceed_atomic` | ✅     | `20260125200000_approve_and_proceed_rpc.sql` - FOR UPDATE lock                   |
| Compound index                          | ✅     | `20260125200001_clarifying_index.sql` - `(course_id, status, question_priority)` |
| Memory leak fix в questionRefs          | ✅     | `ClarifyingPanel.tsx:63-70` - cleanup useEffect                                  |
| Rate limiting на Accept All             | ✅     | `ClarifyingPanel.tsx:129-152` - sequential with 100ms delay                      |
| Retry logic в tRPC client               | ✅     | `client.ts:30-60` - exponential backoff                                          |

### Проверки

- ✅ `pnpm type-check` - PASSED
- ✅ `pnpm build` - PASSED
- ✅ ESLint - PASSED

---

## 📊 Code Review Summary (Follow-up 2026-01-25)

| Severity    | Было | Исправлено | Осталось |
| ----------- | ---- | ---------- | -------- |
| Critical    | 3    | 3          | **0**    |
| Important   | 8    | 8          | **0**    |
| Recommended | 13   | 3          | 10       |

---

## 🔍 Верификация соответствия плану (2026-01-25)

### Data Flow: План vs Реализация

**Оригинальный план:**

```
Stage 4 init
    ↓
Phase 0 (Pre-flight): Budget Allocator собирает контекст
    ↓
Phase 0.5 (Clarifying):
    → Condensed context из Budget Allocator
    → Model генерирует 3-7 вопросов
    → UI: Fullscreen modal с вопросами
    → User отвечает
    ↓
Phase 1-5 (Analysis): с учётом ответов
```

| Шаг | План                                  | Реализация                                           | Файл:строка                                          |
| --- | ------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| 1   | Budget Allocator собирает контекст    | `allocateStage4Budget()`                             | `orchestrator.ts:277-282`                            |
| 2   | Condensed context из Budget Allocator | `buildCondensedContext(budgetAllocation)`            | `phase-0.5-clarifying.ts:151-171`                    |
| 3   | Model генерирует 3-7 вопросов         | LLM через `getModelForPhase('stage_4_clarifying')`   | `phase-0.5-clarifying.ts:182-249`                    |
| 4   | UI: вопросы с вариантами              | `ClarifyingPanel` + `QuestionCard`                   | `ClarifyingPanel.tsx`, `QuestionCard.tsx`            |
| 5   | Пауза для ответов                     | `stage_4_clarifying` + `AWAITING_CLARIFYING_ANSWERS` | `orchestrator.ts:350-368`                            |
| 6   | Ответы инжектируются в Phase 1-4      | `clarifying_answers` в каждой фазе                   | `orchestrator.ts:437-442, 508-513, 585-590, 637-642` |

### Ключевые решения: План vs Реализация

| Аспект     | План                                    | Реализация                                            | Статус |
| ---------- | --------------------------------------- | ----------------------------------------------------- | ------ | --- |
| Позиция    | Phase 0.5 внутри Stage 4                | После Budget Allocation, до Phase 1                   | ✅     |
| UI         | Отдельная нода-ответвление              | ClarifyingNode + ClarifyingPanel                      | ✅     |
| Итерации   | 1 раунд + опциональный 2-й (max 2)      | `iterationRound: 1                                    | 2`     | ✅  |
| Приоритеты | Critical / Important / Nice-to-have     | Zod enum + visual styling                             | ✅     |
| Модель     | Настраиваемая через админку, с fallback | `llm_model_config` table, phase: `stage_4_clarifying` | ✅     |
| Контекст   | Переиспользует Stage 4 Budget Allocator | `budgetAllocation` передаётся в Phase 0.5             | ✅     |

### Вывод

**✅ Реализация ПОЛНОСТЬЮ соответствует оригинальному плану.**

"Полный контекст сначала" = Budget Allocator (сбор и приоритизация документов), а НЕ полный анализ (Phase 1-4).
Phase 0.5 использует condensed context из Budget Allocator для генерации умных вопросов.
После ответов пользователя запускается полный анализ (Phase 1-4) с инжекцией этих ответов.

**Оценка**: **A- (Excellent)** - Все критические и важные проблемы решены

### ~~Оставшиеся Important~~ ✅ ВСЕ ИСПРАВЛЕНЫ (commit 95da6804)

| #   | Проблема                          | Файл                             | Статус                                       |
| --- | --------------------------------- | -------------------------------- | -------------------------------------------- |
| 4   | Input validation без trim()       | `clarifying.router.ts:52-58`     | ✅ `.trim()` + min 3 chars добавлены         |
| 8   | Нет Zod validation в Phase05Input | `phase-0.5-clarifying.ts:91-114` | ✅ `Phase05InputSchema` с runtime validation |
| 11  | Нет toast для ошибок мутаций      | `ClarifyingPanel.tsx:119-127`    | ✅ `.catch()` с toast.error() добавлены      |

### Исправленные из Recommended

- ✅ **#15** Memory Leak в useEffect - `ClarifyingPanel.tsx:63-70`
- ✅ **#17** Missing Index - `20260125200001_clarifying_index.sql`
- ✅ **#23** Retry Logic в Frontend - `client.ts:30-60`

---

## Результаты верификации (Обновлено 2026-01-25)

### Database Migration ✅ SYNCED

| Компонент                      | Статус | Миграция в БД                  |
| ------------------------------ | ------ | ------------------------------ |
| Enum `stage_4_clarifying`      | ✅     | `20260125150034_step1_enum`    |
| Таблица `clarifying_questions` | ✅     | `20260125150047_step2_table`   |
| FSM transitions                | ✅     | `20260125150105_step3_fsm`     |
| Model Config                   | ✅     | `20260125150130_step4_config`  |
| Prompt Template                | ✅     | `20260125150147_step5_prompt`  |
| Локальный файл конфликта       | ✅     | **УДАЛЁН** (commit `61821678`) |

### Backend Phase ✅ COMPLETE

| Компонент                | Статус | Детали                                                         |
| ------------------------ | ------ | -------------------------------------------------------------- |
| `runPhase05Clarifying()` | ✅     | Полная реализация + 60s timeout                                |
| Helper Functions         | ✅     | getPendingQuestions, getAnsweredQuestions, getClarifyingConfig |
| Budget Allocator         | ✅     | Интеграция через Stage4BudgetAllocation                        |
| Zod Validation           | ✅     | Схемы для input/output + custom answer validation              |
| Language Support         | ✅     | ISO 639-1 коды (ru, en)                                        |

### tRPC Router ✅ COMPLETE

| Endpoint             | Статус | Rate Limit                          |
| -------------------- | ------ | ----------------------------------- |
| `getQuestions`       | ✅     | 60/min                              |
| `getProgress`        | ✅     | 60/min                              |
| `submitAnswer`       | ✅     | 30/min (+ custom answer validation) |
| `skipQuestion`       | ✅     | 30/min                              |
| `approveAndProceed`  | ✅     | 10/min (+ rollback on failure)      |
| `requestSecondRound` | ✅     | 5/min                               |

### Orchestrator + Handler ✅ COMPLETE

| Компонент                   | Статус | Детали                                                |
| --------------------------- | ------ | ----------------------------------------------------- |
| Phase 0.5 интеграция        | ✅     | После Budget Allocation, до Phase 1                   |
| FSM переходы                | ✅     | stage_4_init → stage_4_clarifying → stage_4_analyzing |
| AWAITING_CLARIFYING_ANSWERS | ✅     | Специальная обработка (не failed)                     |
| Pause/Resume                | ✅     | Прерывание и возобновление workflow                   |
| Answers injection           | ✅     | Ответы передаются в Phase 1-4                         |

### Frontend UI ✅ COMPLETE

| Компонент                    | Статус | Детали                                             |
| ---------------------------- | ------ | -------------------------------------------------- |
| ClarifyingNode               | ✅     | Progress bar, critical counter, 3 состояния        |
| ClarifyingPanel              | ✅     | Progress %, auto-scroll, confetti, sticky continue |
| QuestionCard                 | ✅     | 3 приоритета, 3 режима ответа, skip button         |
| Dark Mode                    | ✅     | Полная поддержка                                   |
| NodeDetailsDrawer интеграция | ✅     | **ИСПРАВЛЕНО** (commit `61821678`)                 |
| XSS санитизация              | ✅     | **DOMPurify добавлен** (commit `61821678`)         |

### Security Status ✅ HARDENED

| Проблема                         | Приоритет    | Статус                      |
| -------------------------------- | ------------ | --------------------------- |
| XSS в ClarifyingPanel            | 🔴 Critical  | ✅ ИСПРАВЛЕНО               |
| Missing CSRF protection          | 🔴 Critical  | ✅ ИСПРАВЛЕНО               |
| Race condition approveAndProceed | 🟠 High      | ⚠️ Частично (rollback есть) |
| No timeout для LLM               | 🟡 Important | ✅ ИСПРАВЛЕНО (60s)         |
| Weak answer_source validation    | 🟡 Important | ✅ ИСПРАВЛЕНО               |
| Missing error recovery           | 🟡 Important | ⚠️ Backlog                  |
| No retry logic                   | 🟡 Important | ⚠️ Backlog                  |

**Полный отчёт Code Review**: `docs/reports/code-review/2026-01/phase-0.5-clarifying-review.md`

---

## Code Review: Критические проблемы

### P1: Блокирующие (Must Fix)

#### P1.1: Null Reference Crash - budgetAllocation!

**Файл**: `orchestrator.ts:339`

```typescript
// CRASH если нет документов!
await runPhase05Clarifying({
  budgetAllocation: budgetAllocation!, // может быть null
});
```

**Решение**: Добавить проверку `if (clarifyingConfig.enabled && budgetAllocation)`

#### P1.2: Missing CLARIFYING_QUESTIONS Job Type

**Файл**: `clarifying.router.ts:1170`

- `requestSecondRound` создаёт несуществующий тип job
- Второй раунд полностью сломан
  **Решение**: Использовать `STRUCTURE_ANALYSIS` job вместо нового типа

#### P1.3: Database Types Mismatch

- `stage_4_clarifying` не в сгенерированных типах
- Type-check и build FAIL
  **Решение**: Запустить `pnpm supabase:gen-types`

### P2: Важные (Before Production)

#### P2.1: Неполная валидация answer_source

**Файл**: `clarifying.router.ts:551-577`

- Нет проверки что custom ответ не имеет selectedSuggestionIndex

#### P2.2: Frontend Mock Data

**Файл**: `ClarifyingPanel.tsx:34-130`

- Mock hooks вместо реальных tRPC вызовов
  **Решение**: Заменить на `trpc.clarifying.*`

#### P2.3: Second Round не обработан в Orchestrator

**Файл**: `orchestrator.ts:337`

- Только `iterationRound: 1` hardcoded
- Нет логики для round 2

#### P2.4: Нет Transaction для status update + job

**Файл**: `clarifying.router.ts:878-893`

- Race condition: status обновлён, job failed → stuck

### P3: Важный вопрос - Ответы НЕ ИСПОЛЬЗУЮТСЯ!

**КРИТИЧНО**: `orchestrator.ts:404-414`

```typescript
const clarifyingAnswers = await getAnsweredQuestions(courseId);
// clarifyingAnswers НИКУДА НЕ ПЕРЕДАЮТСЯ!
// Phase 1-4 не получают ответы пользователя
```

**Это делает всю фичу бесполезной!**

---

## История исправлений Phase 0.5

### ✅ Phase 1 (commit c096b082)

| Задача                               | Статус | Детали                         |
| ------------------------------------ | ------ | ------------------------------ |
| P1.1 Null check budgetAllocation     | ✅     | `orchestrator.ts:328`          |
| P1.2 Second round STRUCTURE_ANALYSIS | ✅     | `clarifying.router.ts:1170`    |
| P1.3 Регенерация типов               | ✅     | `stage_4_clarifying` добавлен  |
| P2.2 Реальные tRPC hooks             | ✅     | `ClarifyingPanel.tsx`          |
| P2.4 Transaction rollback            | ✅     | `clarifying.router.ts:878-893` |
| P3.5 Ответы в Phase 1-4              | ✅     | `orchestrator.ts:419-438`      |

### ✅ Phase 2 (commit 61821678)

| Задача                              | Статус | Детали                                        |
| ----------------------------------- | ------ | --------------------------------------------- |
| Удаление конфликтующей миграции     | ✅     | Файл удалён                                   |
| ClarifyingPanel в NodeDetailsDrawer | ✅     | Условный рендер при stage_4_clarifying        |
| XSS санитизация (DOMPurify)         | ✅     | question_text, suggested_answers, user_answer |
| stage_4_clarifying в CourseStatus   | ✅     | types/course-generation.ts                    |
| env-client.ts для client imports    | ✅     | Исправлена цепочка импортов                   |

### ✅ Phase 3 (commit ec8f8694)

| Задача                   | Статус | Детали                            |
| ------------------------ | ------ | --------------------------------- |
| CSRF защита              | ✅     | X-CSRF-Token header в tRPC client |
| LLM timeout 60s          | ✅     | AbortController в phase-0.5       |
| Валидация custom answers | ✅     | Запрет suggestionIndex для custom |

---

## Verification Checklist

### Критические исправления ✅ ВСЕ ВЫПОЛНЕНЫ

- [x] `pnpm type-check` passes
- [x] `pnpm build` succeeds
- [x] Frontend вызывает реальные tRPC endpoints
- [x] Ответы передаются в Phase 1-4
- [x] Null check для budgetAllocation
- [x] Second round через STRUCTURE_ANALYSIS
- [x] Transaction rollback для approveAndProceed
- [x] **ClarifyingPanel интегрирован в NodeDetailsDrawer**
- [x] **XSS санитизация добавлена (DOMPurify)**
- [x] **CSRF защита в tRPC client**
- [x] **Timeout для LLM вызова (60s)**
- [x] **Валидация custom answers**

### Backlog задачи ✅ ВСЕ ВЫПОЛНЕНЫ (commit 1eddf68f)

- [x] Атомарная транзакция в approveAndProceed (Supabase RPC с FOR UPDATE lock)
- [x] Memory leak fix в questionRefs (cleanup useEffect)
- [x] Rate limiting на "Accept All" button (sequential submission 100ms delay)
- [x] Compound index для performance `(course_id, status, question_priority)`
- [x] Retry logic в frontend (exponential backoff 1s, 2s, 4s)

### Minor improvements (опциональные)

- [ ] Input validation: добавить .trim() и min 3 chars
- [ ] Zod validation для Phase05Input
- [ ] Toast уведомления для ошибок мутаций
- [ ] RPC агрегация для getProgress (COUNT вместо fetch all)
- [ ] Pagination в getQuestions (для масштабируемости)

### E2E Тестирование (Следующий этап)

- [ ] Создать курс → дойти до Stage 4 → ClarifyingPanel появляется
- [ ] Ответить на critical → кнопка "Продолжить" активна
- [ ] Skip nice_to_have → разрешено
- [ ] Skip critical → заблокировано
- [ ] Click "Продолжить" → analysis стартует
- [ ] Регрессия: существующие курсы работают

---

## Обзор

Добавить фазу уточняющих вопросов (Phase 0.5) внутри Stage 4, которая:

- Генерирует умные вопросы на основе контекста документов
- Предлагает варианты ответов
- Блокирует workflow до получения ответов
- Визуально отображается как отдельная нода-ответвление

## Ключевые решения

| Аспект     | Решение                                                  |
| ---------- | -------------------------------------------------------- |
| Позиция    | Phase 0.5 внутри Stage 4 (после Pre-flight, до Analysis) |
| UI         | Отдельная нода-ответвление вниз от Stage 4               |
| Итерации   | 1 раунд + опциональный 2-й (max 2)                       |
| Приоритеты | Critical / Important / Nice-to-have                      |
| Модель     | Gemini 2 (настраиваемая через админку, с fallback)       |
| Контекст   | Переиспользует Stage 4 Budget Allocator                  |

## Архитектура

### Data Flow

```
Stage 4 init
    ↓
Phase 0 (Pre-flight): Budget Allocator собирает контекст
    ↓
Phase 0.5 (Clarifying):
    → Condensed context из Budget Allocator
    → Model (Gemini 2 Pro) генерирует 3-7 вопросов
    → UI: Fullscreen modal с вопросами
    → User отвечает (выбирает предложенный или пишет свой)
    → [Опционально] Round 2 если нужны уточнения
    ↓
Phase 1-5 (Analysis): с учётом ответов
```

### UI Flow (Граф)

```
       ┌─────────┐
       │ Stage 3 │
       └────┬────┘
            │
       ┌────▼────┐
       │ Stage 4 │ ←── Double-click: Inspector Panel
       └────┬────┘
            │
    ┌───────▼───────┐
    │  Clarifying   │ ←── Нода-ответвление вниз
    │   Questions   │     Double-click: Fullscreen Q&A Modal
    └───────┬───────┘
            │ (когда все ответы получены)
            │
       ┌────▼────┐
       │ Stage 4 │ ←── Продолжает Analysis
       │ Complete│
       └────┬────┘
            │
       ┌────▼────┐
       │ Stage 5 │
       └─────────┘
```

## Изменения в БД

### 1. Новая таблица: `clarifying_questions`

```sql
CREATE TABLE clarifying_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,

  -- Вопрос
  question_text TEXT NOT NULL,
  question_priority TEXT NOT NULL CHECK (question_priority IN ('critical', 'important', 'nice_to_have')),
  question_category TEXT, -- тема вопроса (audience, content, depth, etc.)

  -- Предложенные ответы
  suggested_answers JSONB DEFAULT '[]'::jsonb,
  -- Формат: [{ "text": "...", "rationale": "..." }, ...]

  -- Ответ пользователя
  user_answer TEXT,
  answer_source TEXT CHECK (answer_source IN ('suggested', 'modified', 'custom')),
  -- suggested = принял предложенный как есть
  -- modified = скорректировал/дополнил предложенный
  -- custom = написал полностью свой
  selected_suggestion_index INTEGER, -- если выбран/скорректирован suggested
  user_modification TEXT, -- дополнение к предложенному (для 'modified')

  -- Метаданные
  iteration_round INTEGER NOT NULL DEFAULT 1 CHECK (iteration_round IN (1, 2)),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'answered', 'skipped')),
  order_index INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  answered_at TIMESTAMPTZ,

  -- Дополнительные данные
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Индексы
CREATE INDEX idx_clarifying_questions_course ON clarifying_questions(course_id, iteration_round);
CREATE INDEX idx_clarifying_questions_status ON clarifying_questions(course_id, status);
CREATE INDEX idx_clarifying_questions_priority ON clarifying_questions(course_id, question_priority);
```

### 2. FSM: Новый статус

```sql
-- Добавить в generation_status enum
ALTER TYPE generation_status ADD VALUE 'stage_4_clarifying' AFTER 'stage_4_init';

-- Обновить valid_status_transitions
UPDATE fsm_transitions SET
  valid_next_states = array_append(valid_next_states, 'stage_4_clarifying')
WHERE current_state = 'stage_4_init';

INSERT INTO fsm_transitions (current_state, valid_next_states) VALUES
  ('stage_4_clarifying', ARRAY['stage_4_analyzing', 'cancelled', 'failed']);
```

### 3. Model Config: Новые фазы

```sql
INSERT INTO llm_model_config (
  config_type, phase_name, stage_number,
  model_id, fallback_model_id,
  temperature, max_tokens,
  is_active, primary_display_name, fallback_display_name
) VALUES
  ('global', 'stage_4_clarifying', 4,
   'google/gemini-2.0-pro', 'anthropic/claude-sonnet-4',
   0.5, 4000,
   true, 'Gemini 2 Pro', 'Claude Sonnet');
```

### 4. Prompt Templates

```sql
INSERT INTO prompt_templates (
  phase_name, template_key, version,
  system_prompt, user_prompt_template,
  is_active
) VALUES
  ('stage_4_clarifying', 'generate_questions', 1,
   'You are an expert course designer...', -- см. prompts/stage4-clarifying.md
   '{{condensed_context}}',
   true);
```

## Backend: Новые файлы

```
packages/course-gen-platform/src/stages/stage4-analysis/
├── phases/
│   ├── phase-0-preflight.ts      # существует
│   ├── phase-0.5-clarifying.ts   # НОВЫЙ
│   │   ├── generateQuestions()   # вызов LLM
│   │   ├── parseQuestionsOutput()
│   │   └── storeQuestions()
│   ├── phase-1-classifier.ts     # существует
│   └── ...
├── orchestrator.ts               # МОДИФИЦИРОВАТЬ: добавить Phase 0.5
└── handler.ts                    # МОДИФИЦИРОВАТЬ: обработка stage_4_clarifying
```

### phase-0.5-clarifying.ts

```typescript
import { getModelForPhase } from '@/shared/llm/langchain-models';
import { allocateStage4Budget } from './stage4-budget-allocator';

interface ClarifyingQuestion {
  question_text: string;
  question_priority: 'critical' | 'important' | 'nice_to_have';
  question_category: string;
  suggested_answers: Array<{ text: string; rationale: string }>;
}

export async function runPhase05Clarifying(input: {
  courseId: string;
  budgetAllocation: Stage4BudgetAllocation; // из Phase 0
  courseContext: CourseContext;
  iterationRound: 1 | 2;
  previousAnswers?: ClarifyingAnswer[];
}): Promise<ClarifyingQuestion[]> {
  // 1. Получить модель
  const model = await getModelForPhase('stage_4_clarifying', input.courseId);

  // 2. Сформировать condensed context из budget allocation
  const condensedContext = buildCondensedContext(input.budgetAllocation);

  // 3. Вызвать LLM
  const prompt = await getPromptTemplate('stage_4_clarifying', 'generate_questions');
  const response = await model.invoke(
    prompt.format({
      condensed_context: condensedContext,
      course_title: input.courseContext.title,
      course_description: input.courseContext.description,
      iteration_round: input.iterationRound,
      previous_answers: input.previousAnswers || [],
    })
  );

  // 4. Парсить и валидировать output
  const questions = parseQuestionsOutput(response);

  // 5. Сохранить в БД
  await storeQuestions(input.courseId, questions, input.iterationRound);

  return questions;
}
```

### orchestrator.ts изменения

```typescript
export async function runAnalysisOrchestration(job: StructureAnalysisJob) {
  const { courseId } = job;

  // Phase 0: Pre-flight + Budget Allocation
  const preflight = await runPhase0Preflight(courseId);
  const budgetAllocation = await allocateStage4Budget(preflight.documents, language);

  // Phase 0.5: Clarifying Questions (если не пропущено)
  const clarifyingConfig = await getClarifyingConfig(courseId);
  if (clarifyingConfig.enabled && !clarifyingConfig.skipped) {
    // Проверить есть ли pending вопросы
    const pendingQuestions = await getPendingQuestions(courseId);

    if (pendingQuestions.length === 0) {
      // Первый раз - генерируем вопросы
      await runPhase05Clarifying({
        courseId,
        budgetAllocation,
        courseContext: preflight.context,
        iterationRound: 1,
      });

      // Переводим в статус ожидания ответов
      await transitionStatus(courseId, 'stage_4_clarifying');

      // Прерываем orchestration - ждём ответов пользователя
      return { status: 'awaiting_answers', phase: '0.5' };
    }

    // Есть pending - значит ещё ждём ответов
    if (pendingQuestions.some(q => q.status === 'pending')) {
      return { status: 'awaiting_answers', phase: '0.5' };
    }

    // Все ответы получены - можем продолжить
    // Опционально: Round 2
    if (clarifyingConfig.needsSecondRound) {
      // ... логика второго раунда
    }
  }

  // Собрать ответы для injection в контекст
  const clarifyingAnswers = await getAnsweredQuestions(courseId);

  // Phase 1-5: Analysis (с учётом ответов)
  const phase1Result = await runPhase1Classifier({
    ...preflight,
    clarifyingAnswers, // <-- инжектим ответы
  });

  // ... остальные фазы
}
```

## API: tRPC endpoints

### Новый роутер: `clarifying.router.ts`

```typescript
export const clarifyingRouter = router({
  // Получить вопросы для курса
  getQuestions: protectedProcedure
    .input(z.object({ courseId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return await db.clarifying_questions.findMany({
        where: { course_id: input.courseId },
        orderBy: [
          { question_priority: 'asc' }, // critical first
          { order_index: 'asc' },
        ],
      });
    }),

  // Ответить на вопрос (3 варианта: suggested, modified, custom)
  submitAnswer: protectedProcedure
    .input(
      z.object({
        questionId: z.string().uuid(),
        answer: z.string().min(1),
        answerSource: z.enum(['suggested', 'modified', 'custom']),
        selectedSuggestionIndex: z.number().optional(), // для suggested/modified
        userModification: z.string().optional(), // дополнение для modified
      })
    )
    .mutation(async ({ ctx, input }) => {
      await db.clarifying_questions.update({
        where: { id: input.questionId },
        data: {
          user_answer: input.answer,
          answer_source: input.answerSource,
          selected_suggestion_index: input.selectedSuggestionIndex,
          status: 'answered',
          answered_at: new Date(),
        },
      });

      // Проверить все ли ответы получены
      await checkAndProceed(ctx, input.questionId);
    }),

  // Пропустить вопрос (только nice_to_have)
  skipQuestion: protectedProcedure
    .input(z.object({ questionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const question = await db.clarifying_questions.findUnique({
        where: { id: input.questionId },
      });

      if (question.question_priority !== 'nice_to_have') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Only nice_to_have questions can be skipped',
        });
      }

      await db.clarifying_questions.update({
        where: { id: input.questionId },
        data: { status: 'skipped' },
      });
    }),

  // Одобрить все и продолжить
  approveAndProceed: protectedProcedure
    .input(z.object({ courseId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Проверить что все critical/important отвечены
      const unanswered = await db.clarifying_questions.count({
        where: {
          course_id: input.courseId,
          status: 'pending',
          question_priority: { in: ['critical', 'important'] },
        },
      });

      if (unanswered > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `${unanswered} required questions not answered`,
        });
      }

      // Продолжить Stage 4
      await enqueueJob('STRUCTURE_ANALYSIS', {
        courseId: input.courseId,
        resumeFromPhase: '1', // Phase 1, пропускаем 0.5
      });
    }),

  // Запросить второй раунд вопросов
  requestSecondRound: protectedProcedure
    .input(z.object({ courseId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const currentRound = await getCurrentRound(input.courseId);
      if (currentRound >= 2) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Maximum 2 rounds allowed',
        });
      }

      // Запустить Phase 0.5 для Round 2
      await enqueueJob('CLARIFYING_QUESTIONS', {
        courseId: input.courseId,
        iterationRound: 2,
      });
    }),
});
```

## UI: Визуальное разделение приоритетов

Каждый приоритет имеет уникальное визуальное оформление:

### Critical (Обязательные)

```
Фон: bg-red-50 dark:bg-red-950/20
Border: border-l-4 border-l-red-500 border border-red-200
Полоса сверху: красная акцентная полоса (h-1 bg-red-500)
Иконка: AlertCircle (red-500)
Badge: "ОБЯЗАТЕЛЬНЫЙ" bg-red-100 text-red-700
```

### Important (Важные)

```
Фон: bg-amber-50 dark:bg-amber-950/20
Border: border-l-4 border-l-amber-500 border border-amber-200
Полоса сверху: amber акцентная полоса (h-1 bg-amber-500)
Иконка: AlertTriangle (amber-500)
Badge: "ВАЖНЫЙ" bg-amber-100 text-amber-700
```

### Nice-to-have (Желательные)

```
Фон: bg-slate-50 dark:bg-slate-900/20
Border: border-l-4 border-l-slate-300 border border-slate-200 border-dashed
Полоса сверху: нет (или очень тонкая серая)
Иконка: Info (slate-400)
Badge: "ЖЕЛАТЕЛЬНЫЙ" bg-slate-100 text-slate-600
Кнопка Skip: видна только для этого приоритета
```

## UI: Варианты ответа

Пользователь имеет 3 варианта для каждого вопроса:

### 1. Принять предложенный (suggested)

- Клик на вариант → сразу принимается
- Зелёная подсветка + анимация
- Показывается rationale от AI

### 2. Скорректировать/дополнить (modified)

- Клик на вариант + кнопка "Скорректировать"
- Открывается textarea под вариантом
- Пользователь добавляет своё дополнение
- Сохраняется: оригинал + дополнение

### 3. Свой ответ (custom)

- Отдельный вариант "Свой ответ"
- Полностью свободный textarea
- Без привязки к предложенным

## UI: Новые компоненты

### 1. Graph: Clarifying Node

```
packages/web/components/generation-graph/
├── nodes/
│   ├── StageNode.tsx          # существует
│   └── ClarifyingNode.tsx     # НОВЫЙ
├── panels/
│   └── clarifying/
│       ├── ClarifyingPanel.tsx       # Main panel
│       ├── QuestionCard.tsx          # Карточка вопроса
│       ├── AnswerSelector.tsx        # Выбор ответа
│       ├── SuggestedAnswers.tsx      # Список предложенных
│       └── ApprovalBanner.tsx        # Кнопка "Продолжить"
└── modals/
    └── ClarifyingQuestionsModal.tsx  # Fullscreen modal
```

### 2. ClarifyingNode.tsx

```tsx
// Нода-ответвление вниз от Stage 4
export function ClarifyingNode({ data, selected }: NodeProps<ClarifyingNodeData>) {
  const { status, questionsCount, answeredCount } = data;

  const isActive = status === 'stage_4_clarifying';
  const isComplete = answeredCount === questionsCount;

  return (
    <div
      className={cn(
        'clarifying-node',
        isActive && 'ring-2 ring-primary animate-pulse',
        isComplete && 'bg-green-50 border-green-200'
      )}
    >
      <div className="flex items-center gap-2">
        <MessageCircleQuestion className="h-4 w-4" />
        <span>Уточняющие вопросы</span>
      </div>

      <div className="text-sm text-muted-foreground">
        {answeredCount} / {questionsCount} отвечено
      </div>

      {/* Progress bar */}
      <Progress value={(answeredCount / questionsCount) * 100} />
    </div>
  );
}
```

### 3. QuestionCard.tsx (с тремя вариантами ответа)

```tsx
export function QuestionCard({ question, onAnswer }: QuestionCardProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [answerMode, setAnswerMode] = useState<'suggested' | 'modified' | 'custom' | null>(null);
  const [modification, setModification] = useState('');
  const [customAnswer, setCustomAnswer] = useState('');
  const [showModifyInput, setShowModifyInput] = useState<number | null>(null);

  const priorityStyles = {
    critical: {
      card: 'border-l-4 border-l-red-500 border border-red-200 bg-red-50 dark:bg-red-950/20',
      badge: 'bg-red-100 text-red-700',
      icon: AlertCircle,
      label: 'ОБЯЗАТЕЛЬНЫЙ',
    },
    important: {
      card: 'border-l-4 border-l-amber-500 border border-amber-200 bg-amber-50 dark:bg-amber-950/20',
      badge: 'bg-amber-100 text-amber-700',
      icon: AlertTriangle,
      label: 'ВАЖНЫЙ',
    },
    nice_to_have: {
      card: 'border-l-4 border-l-slate-300 border border-slate-200 border-dashed bg-slate-50 dark:bg-slate-900/20',
      badge: 'bg-slate-100 text-slate-600',
      icon: Info,
      label: 'ЖЕЛАТЕЛЬНЫЙ',
    },
  };

  const style = priorityStyles[question.question_priority];
  const Icon = style.icon;

  function handleSelectSuggested(index: number) {
    setSelectedIndex(index);
    setAnswerMode('suggested');
    setShowModifyInput(null);

    // Авто-сохранение при выборе
    onAnswer({
      answerSource: 'suggested',
      answer: question.suggested_answers[index].text,
      selectedSuggestionIndex: index,
    });
  }

  function handleModify(index: number) {
    setShowModifyInput(index);
    setSelectedIndex(index);
  }

  function handleSaveModification() {
    if (!modification.trim()) return;

    setAnswerMode('modified');
    onAnswer({
      answerSource: 'modified',
      answer: question.suggested_answers[selectedIndex!].text,
      selectedSuggestionIndex: selectedIndex!,
      userModification: modification,
    });
    setShowModifyInput(null);
  }

  function handleCustomAnswer() {
    if (!customAnswer.trim()) return;

    setAnswerMode('custom');
    setSelectedIndex(null);
    onAnswer({
      answerSource: 'custom',
      answer: customAnswer,
    });
  }

  return (
    <Card className={cn('question-card p-6 space-y-4', style.card)}>
      {/* Header: Priority Badge + Skip button */}
      <div className="flex items-center justify-between">
        <Badge className={style.badge}>
          <Icon className="w-3 h-3 mr-1" />
          {style.label}
        </Badge>
        {question.question_priority === 'nice_to_have' && (
          <Button variant="ghost" size="sm" onClick={() => onSkip(question.id)}>
            Пропустить
          </Button>
        )}
      </div>

      {/* Question text */}
      <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100">
        {question.question_text}
      </h3>

      {/* Suggested answers */}
      <div className="space-y-3">
        {question.suggested_answers.map((suggestion, i) => (
          <motion.div
            key={i}
            className={cn(
              'p-4 rounded-lg border cursor-pointer transition-all',
              selectedIndex === i && answerMode === 'suggested'
                ? 'border-green-500 bg-green-50 dark:bg-green-950/20'
                : 'border-slate-200 hover:border-purple-300'
            )}
            onClick={() => handleSelectSuggested(i)}
            whileTap={{ scale: 0.98 }}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="font-medium">{suggestion.text}</p>
                <p className="text-sm text-slate-500 mt-1">💡 {suggestion.rationale}</p>
              </div>

              {/* Checkmark if selected */}
              {selectedIndex === i && answerMode === 'suggested' && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center"
                >
                  <Check className="w-4 h-4 text-white" />
                </motion.div>
              )}
            </div>

            {/* Modify button */}
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={e => {
                e.stopPropagation();
                handleModify(i);
              }}
            >
              Скорректировать
            </Button>

            {/* Modification input (expanded) */}
            {showModifyInput === i && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                className="mt-3 space-y-2"
              >
                <Textarea
                  value={modification}
                  onChange={e => setModification(e.target.value)}
                  placeholder="Добавьте ваши уточнения..."
                  className="min-h-[80px]"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveModification}>
                    Сохранить
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowModifyInput(null)}>
                    Отмена
                  </Button>
                </div>
              </motion.div>
            )}
          </motion.div>
        ))}

        {/* Custom answer option */}
        <div
          className={cn(
            'p-4 rounded-lg border',
            answerMode === 'custom'
              ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/20'
              : 'border-slate-200'
          )}
        >
          <p className="font-medium mb-2">Свой вариант</p>
          <Textarea
            value={customAnswer}
            onChange={e => setCustomAnswer(e.target.value)}
            placeholder="Введите полностью свой ответ..."
            className="min-h-[100px]"
          />
          <Button className="mt-2" onClick={handleCustomAnswer} disabled={!customAnswer.trim()}>
            Сохранить свой ответ
          </Button>
        </div>
      </div>
    </Card>
  );
}
```

### 4. Collector Effect (при approve)

```tsx
// Анимация "коллекторства" при одобрении ответа
export function CollectorEffect({ onComplete }: { onComplete: () => void }) {
  return (
    <motion.div
      initial={{ scale: 1, opacity: 1 }}
      animate={{
        scale: [1, 1.1, 0.9, 1],
        backgroundColor: ['transparent', '#22c55e20', 'transparent'],
      }}
      transition={{ duration: 0.5 }}
      onAnimationComplete={onComplete}
      className="absolute inset-0 rounded-lg"
    />
  );
}
```

## UI: Геймификация

### Progress Bar (header)

```tsx
// Градиентный progress bar с анимацией
<div className="h-2 bg-slate-200 rounded-full overflow-hidden">
  <motion.div
    className="h-full bg-gradient-to-r from-purple-500 to-cyan-500"
    initial={{ width: 0 }}
    animate={{ width: `${percentage}%` }}
    transition={{ duration: 0.5, ease: "easeOut" }}
  />
</div>

// Счётчик с breakdown по приоритетам
<div className="flex gap-4 text-sm">
  <span>🔴 {criticalAnswered}/{criticalTotal}</span>
  <span>🟡 {importantAnswered}/{importantTotal}</span>
  <span>⚪ {optionalAnswered}/{optionalTotal}</span>
</div>
```

### Collector Effect (при ответе)

```tsx
// Зелёная пульсация + scale при выборе ответа
const successPulse = {
  animate: {
    boxShadow: [
      '0 0 0 0 rgba(16, 185, 129, 0)',
      '0 0 0 8px rgba(16, 185, 129, 0.3)',
      '0 0 0 12px rgba(16, 185, 129, 0)',
    ],
    transition: { duration: 0.6 },
  },
};
```

### Confetti при завершении

```tsx
import confetti from 'canvas-confetti';

// Триггер при 100% завершении
if (allAnswered) {
  confetti({
    particleCount: 100,
    spread: 70,
    origin: { y: 0.6 },
    colors: ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b'],
  });
}
```

### Auto-scroll к следующему

```tsx
// После ответа плавно скроллим к следующему неотвеченному
function scrollToNextQuestion(currentIndex: number) {
  const nextUnanswered = questions.findIndex((q, i) => i > currentIndex && q.status === 'pending');
  if (nextUnanswered !== -1) {
    document
      .getElementById(`question-${nextUnanswered}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}
```

## Admin: Настройки

### Pipeline Settings

Добавить в `/admin/pipeline/`:

- **Model Config**: phase_name = `stage_4_clarifying`
- **Prompt Template**: Редактируемый промпт для генерации вопросов
- **Settings**:
  - `clarifying_enabled`: boolean (default: true)
  - `max_questions_per_round`: number (default: 7)
  - `require_critical_answers`: boolean (default: true)

## Verification Plan

### 1. Unit Tests

- [ ] `phase-0.5-clarifying.test.ts` - генерация вопросов
- [ ] `clarifying.router.test.ts` - API endpoints
- [ ] `QuestionCard.test.tsx` - UI компонент

### 2. Integration Tests

- [ ] Полный flow: Stage 4 init → clarifying → answers → analysis
- [ ] FSM transitions
- [ ] Real-time updates

### 3. E2E Tests

- [ ] Создать курс → дойти до Stage 4 → ответить на вопросы → продолжить
- [ ] Skip nice_to_have вопросов
- [ ] Второй раунд вопросов

### 4. Manual Testing

- [ ] UI: double-click на Clarifying node
- [ ] UI: collector effect при ответе
- [ ] UI: fullscreen modal на мобильных
- [ ] Admin: настройка модели и промпта

## Критические файлы

| Файл                                                        | Действие       |
| ----------------------------------------------------------- | -------------- |
| `supabase/migrations/XXXXXX_clarifying_questions.sql`       | Создать        |
| `src/stages/stage4-analysis/phases/phase-0.5-clarifying.ts` | Создать        |
| `src/stages/stage4-analysis/orchestrator.ts`                | Модифицировать |
| `src/stages/stage4-analysis/handler.ts`                     | Модифицировать |
| `src/server/routers/clarifying.router.ts`                   | Создать        |
| `web/components/generation-graph/nodes/ClarifyingNode.tsx`  | Создать        |
| `web/components/generation-graph/panels/clarifying/`        | Создать        |

## Порядок реализации

1. **DB Migration** - таблица, FSM, model config
2. **Backend Phase 0.5** - генерация вопросов
3. **Backend API** - tRPC router
4. **UI: Graph Node** - ClarifyingNode + связи
5. **UI: Panel** - QuestionCard, AnswerSelector
6. **UI: Effects** - collector animation
7. **Admin** - настройки
8. **Tests** - unit, integration, e2e
