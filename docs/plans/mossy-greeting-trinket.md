# Plan: Surgical Course Editing v2

## Context

Чат-редактор курсов имеет критические ограничения:

1. **Пользователь вручную выбирает Refine/Regenerate** — выбирает неправильно в 90% случаев
2. **Нельзя добавить урок/секцию** — ADD_LESSON классифицируется, но handler отсутствует
3. **Неправильная модель** — fallback chain падает на `mimo-v2-flash` вместо `kimi-k2`
4. **Нет stable IDs** — элементы адресуются через `sections[0].lessons[1]`
5. **42K токенов на каждый запрос** — даже для "измени название"

### Решения пользователя

- **Toggle Refine/Regenerate**: Убрать сразу, система решает сама
- **Data model**: Flat `course_nodes` таблица (не nested JSON)
- **Stage 6 при добавлении урока**: Если Stage 6 ещё не запускался — ничего. Если уже сгенерирован — спросить "Сгенерировать контент?"
- **Backward compat**: Не нужна, проект в active dev (но production quality)

### Про классификацию дешевой моделью

**Не overengineering — production best practice.** Система УЖЕ использует `xiaomi/mimo-v2-flash` для классификации (`classifier.ts`), стоимость ~$0.00005/вызов. Проблема: классификатор заблокирован 4 условиями в `chat.router.ts:296-303`.

---

## Phase 0: Stable IDs + Model Config Fix — 2-3 дня

**Зачем первым**: Всё остальное зависит от stable IDs и правильной модели. Это быстрый фундамент, который разблокирует Phases 1-3. `course_nodes` миграция идёт позже (Phase 4) как отдельная крупная работа.

### 0.1 Добавить ID-поля в course_structure (temporary, до Phase 4)

Формат: `sec_` + nanoid(8), `lsn_` + nanoid(8) (~3-4 токена vs 24 для UUID).

```typescript
// shared-types — добавить id?: string в Section и Lesson
interface Section {
  id?: string /* existing fields */;
}
interface Lesson {
  id?: string /* existing fields */;
}
```

JIT backfill: при чтении `course_structure` — inject IDs если отсутствуют, сохранить обратно в БД.

Также обновить Stage 5 генерацию чтобы новые курсы сразу создавались с IDs.

### 0.2 Fix Model Config

- Добавить chat-фазы в config-seed/БД: `chat_stage_5_refinement` → kimi-k2, `chat_stage_6_refinement` → deepseek-v3, `chat_intent_classification` → mimo-v2-flash
- Stale-while-revalidate cache в `model-config-service.ts`
- Cold start → throw 503 (не падать молча на mimo-v2-flash)
- Убрать `mimo-v2-flash` как `global_default` fallback в `model-config-db.ts`

### 0.3 Файлы

| Файл                                                 | Изменение                      |
| ---------------------------------------------------- | ------------------------------ |
| `shared-types/src/` — типы CourseStructure           | `id?: string` в Section/Lesson |
| `course-gen-platform/.../course-structure-editor.ts` | `ensureStableIds()`            |
| `course-gen-platform/.../chat.router.ts`             | Вызов backfill при загрузке    |
| Stage 5 generation prompt/schema                     | IDs при генерации              |
| `config-seed.json` / Supabase seed                   | Chat phase entries             |
| `model-config-service.ts`                            | Stale-while-revalidate         |
| `model-config-db.ts`                                 | Убрать global_default fallback |

---

## Phase 1: Remove Toggle + Auto-Intent — 2-3 дня

### 1.1 3-уровневая классификация (всегда включена)

```
User Message
    │
    ▼
┌─ Tier 0: Regex Heuristics (~40-50%, 0ms, $0) ─┐
│ "удали урок X"     → DELETE_LESSON              │
│ "полностью переделай" → FULL_REGENERATE          │
│ "сколько уроков?"   → GET_INFO                   │
└──────────────┬──────────────────────────────────┘
               │ no match
               ▼
┌─ Tier 1: Cheap LLM (~50%, 200ms, $0.00005) ────┐
│ xiaomi/mimo-v2-flash (уже реализован!)           │
│ + FULL_REGENERATE в IntentSchema                 │
│ + confidence < 0.6 → CLARIFY                     │
└──────────────┬──────────────────────────────────┘
               │ classified
               ▼
┌─ Tier 2: Routed Generation Model ──────────────┐
│ surgical → kimi-k2 (targeted context)           │
│ full_regenerate → async job                     │
│ clarify → уточняющий вопрос                     │
└────────────────────────────────────────────────┘
```

### 1.2 Снять ограничения в chat.router.ts

```typescript
// Было: if (enableIntentClassification && intent === 'refine' && chatType === 'node' && ...)
// Стало:
if (process.env.DISABLE_INTENT_CLASSIFICATION !== 'true' && course.course_structure) {
  // always classify and route
}
```

### 1.3 Frontend: убрать toggle

`RefinementChat.tsx` — убрать переключатель. Пользователь просто пишет. `intent` в ChatRequest → optional (default: система решает).

### 1.4 Файлы

| Файл                             | Изменение                                |
| -------------------------------- | ---------------------------------------- |
| `shared/intent/heuristics.ts`    | **Новый**: regex-эвристики (ru + en)     |
| `shared/intent/classifier.ts`    | +FULL_REGENERATE в IntentSchema          |
| `chat.router.ts`                 | Снять 4 условия, всегда классифицировать |
| `chat-intent-flow.ts`            | Handler для FULL_REGENERATE → async job  |
| `shared-types/src/chat-types.ts` | `intent` → optional                      |
| `web/.../RefinementChat.tsx`     | Убрать toggle Refine/Regenerate          |
| `web/.../useRefinement.ts`       | Не отправлять intent                     |

---

## Phase 2: Surgical Operations — 3-5 дней

### 2.1 CourseOperation schema (discriminated union)

```typescript
// shared-types/src/course-operations.ts — НОВЫЙ
const CourseOperation = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('add_lesson'),
    reasoning: z.string(),
    tempId: z.string().describe('Placeholder: __new_1__'),
    parentSectionId: z.string(),
    afterLessonId: z.string().nullable(),
    title: z.string(),
    objectives: z.array(z.string()).optional(),
    keyTopics: z.array(z.string()).optional(),
    estimatedDuration: z.number().optional(),
  }),
  z.object({ type: z.literal('add_section') /* ... */ }),
  z.object({
    type: z.literal('update_field'),
    targetId: z.string(),
    field: z.string(),
    newValue: z.unknown() /* ... */,
  }),
  z.object({ type: z.literal('delete_element'), targetId: z.string() /* ... */ }),
  z.object({
    type: z.literal('move_element'),
    targetId: z.string(),
    newParentId: z.string().optional(),
    afterId: z.string().nullable() /* ... */,
  }),
]);
```

### 2.2 Новый Proposal: structural_operation

```typescript
// chat-types.ts — добавить в proposalSchema:
structuralOperationProposalSchema; // type: 'structural_operation', operations[], summary
```

### 2.3 Backend Sequencer

`applySurgicalOperations()` — применяет операции к structure:

- `add_lesson`: splice + renumber (app code, не LLM)
- `delete_element`: find by ID, splice, renumber
- `move_element`: remove from source, insert at dest, renumber both sections
- `update_field`: find by ID, update
- `tempId` → `realId` mapping для batch операций (LLM использует `__new_1__`, backend генерит `lsn_abc123`)

### 2.4 LLM-facing ID remapping

Перед LLM: `sec_hY7a3fRx` → `sec_1`, `lsn_kM9b2cQw` → `lsn_3` (снижает ошибки 5-10x).
После LLM: обратная замена.

### 2.5 Pre-flight validation

- Все referenced IDs существуют
- Max 15 операций, max 3 delete за раз
- Не удаляется >50% контента

### 2.6 Stage 6 интеграция при ADD

Логика после применения `add_lesson`:

```
if (все уроки курса уже имеют lesson_contents записи) {
  // Stage 6 полностью завершен → спросить пользователя
  показать кнопку "Сгенерировать контент для нового урока?"
} else {
  // Stage 6 ещё не запущен или частично → ничего не делаем
  // Контент сгенерируется когда пользователь примет Stage 5 и запустит Stage 6
}
```

### 2.7 Файлы

| Файл                                             | Изменение                           |
| ------------------------------------------------ | ----------------------------------- |
| `shared-types/src/course-operations.ts`          | **Новый**: CourseOperation schema   |
| `shared-types/src/chat-types.ts`                 | +structural_operation proposal      |
| `course-gen-platform/.../surgical-operations.ts` | **Новый**: applySurgicalOperations  |
| `course-gen-platform/.../surgical-id-remap.ts`   | **Новый**: ID remapping             |
| `chat-intent-flow.ts`                            | Handlers для ADD_LESSON/ADD_SECTION |
| `chat-apply-helpers.ts`                          | Обработка structural_operation      |
| `web/.../RefinementChat.tsx`                     | UI для structural proposals         |

---

## Phase 3: Context Optimization — 1-2 дня

### 3.1 Skeleton context

Вместо 42K полной структуры → skeleton (~2-3K) + targeted content (~1-5K):

```
COURSE: "Как стать счастливым" (8 sections, 24 lessons)
├─ sec_1: "Введение" (3 lessons)
│  ├─ lsn_1: "Что такое счастье" [10 min]
│  ├─ lsn_2: "Мифы о счастье" [15 min]    ← [TARGET]
│  └─ lsn_3: "Научный подход" [12 min]
├─ sec_2: "Основы" (4 lessons) — collapsed
└─ ...
```

### 3.2 Prompt caching

Static prefix (system + schema) → semi-static (skeleton) → dynamic (message). DeepSeek: автоматический кэш 90% discount.

---

## Phase 4: course_nodes Migration — 5-7 дней

**Зачем**: Flat relational structure фундаментально лучше для surgical editing. Nested JSON с IDs — переходное решение.

### 4.1 Новая таблица

```sql
CREATE TABLE course_nodes (
  id TEXT PRIMARY KEY,                    -- sec_hY7a3fRx / lsn_kM9b2cQw
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES course_nodes(id),
  type TEXT CHECK (type IN ('section', 'lesson')),
  order_key TEXT NOT NULL,                -- fractional-indexing: "a1", "a1V", "a2"
  title TEXT NOT NULL,
  data JSONB DEFAULT '{}',               -- objectives, topics, duration, description
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_course_nodes_course ON course_nodes(course_id);
CREATE INDEX idx_course_nodes_parent ON course_nodes(parent_id);
```

### 4.2 Fractional indexing (npm: `fractional-indexing`)

```typescript
import { generateKeyBetween } from 'fractional-indexing';
// Insert between "a1" and "a2" → "a1V" (O(1), no renumbering)
const newKey = generateKeyBetween('a1', 'a2');
```

### 4.3 Migration path

1. Создать таблицу + migration
2. `nestedJsonToCourseNodes()` — конвертер nested JSON → rows
3. Batch-миграция всех существующих курсов
4. `courseNodesToNestedJson()` — реконструкция для backward compat
5. Обновить `courses.course_structure` как computed view (trigger on course_nodes changes)
6. Постепенно переключать читателей на прямые queries к course_nodes
7. Убрать `course_structure` JSONB column когда все переключены

### 4.4 Surgical ops → SQL

С `course_nodes` операции становятся тривиальным SQL:

- ADD: `INSERT INTO course_nodes (id, course_id, parent_id, type, order_key, title, data)`
- DELETE: `DELETE FROM course_nodes WHERE id = $1`
- MOVE: `UPDATE course_nodes SET parent_id = $1, order_key = $2 WHERE id = $3`
- REORDER: `UPDATE course_nodes SET order_key = $1 WHERE id = $2`

Нет renumbering, нет index arithmetic, нет JSON manipulation.

---

## Phase 5 (Future): UX Polish

- Immer `produceWithPatches()` для client-side undo/redo
- `jsondiffpatch` для tree-diff визуализации
- Progressive disclosure (toast → summary → diff → history)
- Clarification cards с clickable options
- `cockatiel` circuit breakers для LLM API resilience

---

## Порядок реализации

```
Phase 0 (IDs + Model Fix)   ── 2-3 дня (foundation)
Phase 1 (Auto-Intent)       ── 2-3 дня (зависит от Phase 0)
Phase 2 (Surgical Ops)      ── 3-5 дней (зависит от Phase 0+1)
Phase 3 (Context Opt)       ── 1-2 дня (параллельно с Phase 2)
Phase 4 (course_nodes)      ── 5-7 дней (после Phase 2, большая миграция)
```

**Phases 0-3: ~10-12 рабочих дней** (чат работает с nested JSON + IDs)
**Phase 4: +5-7 дней** (миграция на flat relational)
**Total: ~15-19 рабочих дней**

## Verification

1. **Unit tests**: `ensureStableIds()`, `applySurgicalOperations()`, regex heuristics, ID remapping
2. **Debug page**: `/mocks/stage5-chat-debug` для E2E
3. **Test scenarios**:
   - "Добавь урок про мифы после урока 2" → ADD_LESSON
   - "Удали последнюю секцию" → DELETE (confirm)
   - "Измени название курса на X" → UPDATE_FIELD (regex Tier 0)
   - "Полностью переделай курс" → FULL_REGENERATE → async job
   - "Сколько уроков?" → GET_INFO (без LLM)
4. **Type-check**: `pnpm type-check` после каждой фазы
5. **Model**: Проверить kimi-k2 для Stage 5 chat через debug page
