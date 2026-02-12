# Plan: Surgical Course Editing v2.2 (Merged)

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

### Что уже есть в коде (baseline)

1. Intent classifier внедрен, умеет `ADD_LESSON`/`ADD_SECTION`, но flow зажат 4 условиями:
   - `packages/course-gen-platform/src/server/routers/generation/editing/chat.router.ts:296`
2. Chat request требует `intent` как обязательный (`refine|regenerate`):
   - `packages/shared-types/src/chat-types.ts:132`
3. Stage 5 proposal-пайплайн работает по path/index-модели (`sections[0].lessons[1]`):
   - `packages/course-gen-platform/src/server/routers/generation/editing/chat-helpers.ts:132`
   - `packages/course-gen-platform/src/stages/stage5-generation/utils/course-structure-editor.ts:75`
4. `course_structure` схемы не содержат stable IDs:
   - `packages/shared-types/src/generation-result.ts:297` (Section)
   - `packages/shared-types/src/generation-result.ts:438` (Lesson)
5. Model defaults тянут `mimo-v2-flash` как global default:
   - `packages/shared-types/src/model-defaults.ts:23`
   - `packages/course-gen-platform/src/config/config-seed.json:38`

### Зафиксированные архитектурные решения

1. **Нет write-on-read в БД** для backfill IDs. In-memory fallback для текущего запроса. Персистентный backfill — отдельной миграцией/джобой.
2. **Мягкая API эволюция**. `intent` становится optional, старые клиенты с `intent` продолжают работать.
3. **Proposal слой расширяется, не заменяется**. Добавляем `structural_operation`, сохраняем `field_updates`, `direct_action`, `lesson_patch`.
4. **Stage 6 readiness**: `generation_status` — первичный сигнал. `lesson_contents.status` — для валидации.
5. **Fallback для моделей фазовая**. Chat path требует phase-specific config. При отсутствии — 503 с трассировкой. `global_default` остается только для legacy/non-chat цепочек.
6. **`course_nodes` через dual-write и read flag**. Без одномоментного cutover, с parity-check и rollback switch.

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

Генерация Stage 5 создаёт `id` сразу для новых section/lesson. Детектируем legacy структуры через `if (!section.id)`.

### 0.2 Backfill стратегия (без write-on-read)

1. **`ensureStableIdsInMemory(structure)`** — используется в chat flow и apply flow. НЕ пишет в БД автоматически. Возвращает новую структуру с injected IDs.

2. **Отдельный idempotent backfill script**:
   - Выбирает `courses.course_structure is not null`
   - Добавляет отсутствующие IDs
   - Пишет только если структура реально изменилась
   - Optimistic concurrency: `updated_at` check
   - Метрики: `courses_scanned`, `courses_updated`, `id_conflicts`, `retry_count`

### 0.3 Model config для chat фаз

Конкретные модели:

| Phase                        | Model ID (OpenRouter)     | Constant in `model-defaults.ts` | Назначение                       |
| ---------------------------- | ------------------------- | ------------------------------- | -------------------------------- |
| `chat_intent_classification` | `xiaomi/mimo-v2-flash`    | `DEFAULT_MODEL_ID`              | Классификация intent (~$0.00005) |
| `chat_stage_5_refinement`    | `moonshotai/kimi-k2-0905` | `CHAT_PRIMARY_MODEL_ID`         | Surgical editing Stage 5         |
| `chat_stage_6_refinement`    | `deepseek/deepseek-v3.2`  | `CHAT_STAGE6_PRIMARY_MODEL_ID`  | Lesson content editing           |

Изменения:

- **Зарегистрировать `chat_intent_classification`** как новый phase:
  1. Добавить в `PhaseName` union type (`packages/shared-types/src/model-config.ts:66`)
  2. Добавить default entry в `DEFAULT_PHASE_CONFIGS` (`packages/course-gen-platform/src/server/routers/pipeline-admin/constants.ts`)
  3. Добавить seed запись в миграцию для `llm_model_config` (model: `xiaomi/mimo-v2-flash`, temp: 0.1, max_tokens: 200)
  4. Валидация: constraint `llm_model_config.phase_name` должен принимать новое значение (если есть CHECK constraint — обновить)
- **Обновить runtime classifier** (`packages/course-gen-platform/src/shared/intent/classifier.ts:222`): заменить хардкод `process.env.CHAT_CLASSIFICATION_MODEL || 'xiaomi/mimo-v2-flash'` на чтение из `modelConfigService.getModelForPhase('chat_intent_classification', ...)`. Без этого конфиг в `llm_model_config` будет мёртвым. Fallback на env var оставить только при 503 от model-config-service.
- Phase-specific lookup обязателен для chat path
- При missing/invalid phase config — **503** (явно), без silent fallback на `global_default`
- `global_default` остаётся для legacy/non-chat цепочек
- **Stale-while-revalidate cache** в `model-config-service.ts`: возвращать stale при DB error, 503 только на cold start
- Аудит-лог на fallback/503 для chat phases

### 0.4 Файлы

| Файл                                                                                         | Изменение                                                                                      |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `packages/shared-types/src/generation-result.ts`                                             | `id?: string` в Section и Lesson                                                               |
| `packages/course-gen-platform/src/stages/stage5-generation/utils/course-structure-editor.ts` | `ensureStableIdsInMemory()`                                                                    |
| `packages/course-gen-platform/scripts/backfill-stable-ids.ts`                                | **Новый**: backfill script                                                                     |
| `packages/course-gen-platform/src/server/routers/generation/editing/chat.router.ts`          | Вызов `ensureStableIdsInMemory` при загрузке                                                   |
| Stage 5 generation prompt/schema                                                             | IDs при генерации                                                                              |
| `packages/course-gen-platform/src/config/config-seed.json`                                   | Chat phase entries                                                                             |
| Supabase migration                                                                           | Seed chat phase model configs в `llm_model_config`                                             |
| `packages/course-gen-platform/src/shared/llm/model-config-service.ts`                        | Stale-while-revalidate cache, 503 on cold start                                                |
| `packages/course-gen-platform/src/shared/llm/model-config-db.ts`                             | Убрать `global_default` fallback для chat                                                      |
| `packages/shared-types/src/model-config.ts`                                                  | Добавить `chat_intent_classification` в `PhaseName`                                            |
| `packages/course-gen-platform/src/server/routers/pipeline-admin/constants.ts`                | Default config для `chat_intent_classification`                                                |
| `packages/course-gen-platform/src/shared/intent/classifier.ts`                               | Читать модель из `getModelForPhase('chat_intent_classification')` вместо хардкода (строка 222) |

**Гейт завершения Phase 0**:

1. Новые Stage 5 структуры всегда содержат IDs
2. Старые структуры читаются и обрабатываются без падений (in-memory backfill)
3. Chat phase model resolution не использует скрытый `global_default`
4. `pnpm type-check` проходит

---

## Phase 1: Remove Toggle + Auto-Intent — 2-3 дня

### 1.1 API контракт (совместимый переход)

- `chatRequestSchema.intent` → **optional**
- `intent='regenerate'` (legacy/explicit) → immediate regeneration route
- `intent='refine'` или `intent` отсутствует → auto-intent classifier pipeline
- В БД `course_chat_messages.intent` остается nullable/legacy-compatible

### 1.2 3-уровневая классификация

```
User Message
    |
    v
+-- Tier 0: Regex Heuristics (~40-50%, 0ms, $0) --+
| "удали урок X"       -> DELETE_LESSON             |
| "полностью переделай" -> FULL_REGENERATE           |
| "сколько уроков?"     -> GET_INFO                  |
+------------------+--------------------------------+
                   | no match
                   v
+-- Tier 1: Cheap LLM (~50%, 200ms, $0.00005) -----+
| xiaomi/mimo-v2-flash (уже реализован!)             |
| + FULL_REGENERATE в IntentSchema                   |
| + confidence < 0.6 -> CLARIFY                      |
+------------------+--------------------------------+
                   | classified
                   v
+-- Tier 2: Routed Generation Model ----------------+
| surgical -> kimi-k2 (targeted context)             |
| full_regenerate -> async job                       |
| clarify -> уточняющий вопрос                       |
+---------------------------------------------------+
```

### 1.3 Снять ограничения в chat.router.ts (stage-aware routing)

Классификация интента (Tier 0 regex + Tier 1 mimo) — stage-agnostic. Только Tier 2 (выбор модели генерации) зависит от stage. Поэтому условие входа в classification pipeline широкое, а model resolution внутри `chat-intent-flow.ts` выбирает модель по `nodeContext.stageId`:

```typescript
// chat.router.ts — вход в classification pipeline:
// Было (4 условия): if (enableIntentClassification && intent === 'refine' && chatType === 'node' && nodeContext?.stageId === 'stage_5')
// Стало:
if (process.env.CHAT_INTENT_ROUTING_ENABLED !== 'false' && course.course_structure) {
  // Tier 0/1: classify intent (stage-agnostic)
  // Tier 2: route to model based on nodeContext.stageId
}

// chat-intent-flow.ts — stage-aware model selection:
const phaseKey = nodeContext?.stageId === 'stage_6'
  ? 'chat_stage_6_refinement'   // deepseek/deepseek-v3.2
  : 'chat_stage_5_refinement';  // moonshotai/kimi-k2-0905
const config = await modelConfigService.getModelForPhase(phaseKey, courseId, ...);
```

### 1.4 Frontend: убрать toggle

`RefinementChat.tsx` — убрать переключатель Refine/Regenerate. Пользователь просто пишет. Оставить quick-actions где нужно (e.g., explicit "Перегенерировать курс"). Отображать clarification cards для ambiguous intent.

### 1.5 Файлы

| Файл                                                                                     | Изменение                               |
| ---------------------------------------------------------------------------------------- | --------------------------------------- |
| `packages/course-gen-platform/src/shared/intent/heuristics.ts`                           | **Новый**: regex-эвристики (ru + en)    |
| `packages/course-gen-platform/src/shared/intent/classifier.ts`                           | +FULL_REGENERATE в IntentSchema         |
| `packages/course-gen-platform/src/server/routers/generation/editing/chat.router.ts`      | Снять 4 условия, route через flag       |
| `packages/course-gen-platform/src/server/routers/generation/editing/chat-intent-flow.ts` | Handler для FULL_REGENERATE → async job |
| `packages/shared-types/src/chat-types.ts`                                                | `intent` → optional                     |
| `packages/web/components/generation-graph/panels/RefinementChat.tsx`                     | Убрать toggle Refine/Regenerate         |
| `packages/web/components/generation-graph/hooks/useRefinement.ts`                        | Не отправлять intent                    |

**Гейт завершения Phase 1**:

1. Пользователь может отправлять сообщение без выбора режима
2. Regression: старые вызовы с `intent` продолжают работать
3. Tier 0 regex покрывает основные паттерны (ru + en)

---

## Phase 2: Surgical Operations — 4-6 дней

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
  z.object({
    type: z.literal('add_section'),
    reasoning: z.string(),
    tempId: z.string(),
    afterSectionId: z.string().nullable(),
    title: z.string(),
    description: z.string().optional(),
  }),
  z.object({
    type: z.literal('update_field'),
    targetId: z.string(),
    field: z.string(),
    newValue: z.unknown(),
  }),
  z.object({
    type: z.literal('delete_element'),
    targetId: z.string(),
  }),
  z.object({
    type: z.literal('move_element'),
    targetId: z.string(),
    newParentId: z.string().optional(),
    afterId: z.string().nullable(),
  }),
]);
```

### 2.2 Новый Proposal: structural_operation

```typescript
// chat-types.ts — добавить в proposalSchema discriminated union:
structuralOperationProposalSchema = z.object({
  type: z.literal('structural_operation'),
  operations: z.array(CourseOperation),
  summary: z.string(),
});
```

Все ID-ссылки по stable IDs. Для новых узлов LLM использует `tempId` (`__new_1__`), backend маппит в реальные IDs. Позиции только через `afterId|null` (никаких index путей).

### 2.3 Backend Sequencer

`applySurgicalOperations()` — атомарное применение batch операций:

- `add_lesson`: splice + renumber (app code, не LLM)
- `delete_element`: find by ID, splice, renumber
- `move_element`: remove from source, insert at dest, renumber both sections
- `update_field`: find by ID, update
- `tempId` → `realId` mapping (LLM использует `__new_1__`, backend генерит `lsn_abc123`)

Pre-flight validation:

- Все referenced IDs существуют
- Max 15 операций, max 3 delete за раз
- Не удаляется >50% контента
- Move target valid, no circular parent

### 2.4 LLM-facing ID remapping

Перед LLM: `sec_hY7a3fRx` → `sec_1`, `lsn_kM9b2cQw` → `lsn_3` (BAML research: 5-10x fewer errors).
После LLM: обратный маппинг + проверка что все remapped IDs существуют.

### 2.5 Stage 6 интеграция при ADD

Правило (исполнимое, без процентных порогов):

1. **Primary check**: `generation_status in ('stage_6_complete', 'finalizing', 'completed')` → показать CTA "Сгенерировать контент для нового урока?"
2. **Else**: CTA не показывать (контент сгенерируется при запуске Stage 6)
3. **Secondary validation** (не блокирующая): запросить `lesson_contents` для данного курса. Если `generation_status` говорит "complete", но у некоторых уроков нет `lesson_contents` — это нормально (пользователь мог добавить уроки после Stage 6). CTA всё равно показывается.
4. **Нет threshold**: Проверка бинарная — Stage 6 завершён или нет. Процентный порог не нужен.

### 2.6 Файлы

| Файл                                                                                        | Изменение                                 |
| ------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `packages/shared-types/src/course-operations.ts`                                            | **Новый**: CourseOperation schema         |
| `packages/shared-types/src/chat-types.ts`                                                   | +structural_operation proposal            |
| `packages/course-gen-platform/src/server/routers/generation/editing/surgical-operations.ts` | **Новый**: applySurgicalOperations        |
| `packages/course-gen-platform/src/server/routers/generation/editing/surgical-id-remap.ts`   | **Новый**: ID remapping                   |
| `packages/course-gen-platform/src/server/routers/generation/editing/chat-intent-flow.ts`    | Handlers для ADD_LESSON/ADD_SECTION       |
| `packages/course-gen-platform/src/server/routers/generation/editing/chat-apply-helpers.ts`  | Обработка structural_operation            |
| `packages/web/components/generation-graph/panels/RefinementChat.tsx`                        | UI для structural proposals + Stage 6 CTA |

**Гейт завершения Phase 2**:

1. `add/move/delete` выполняются без path/index
2. Все операции проходят preflight и confirmation UI
3. ID remapping работает в обе стороны

---

## Phase 3: Context Optimization — 1-2 дня

### 3.1 Skeleton + targeted context

Вместо 42K полной структуры → skeleton (~2-3K) + targeted content (~1-5K):

```
COURSE: "Как стать счастливым" (8 sections, 24 lessons)
+-- sec_1: "Введение" (3 lessons)
|   +-- lsn_1: "Что такое счастье" [10 min]
|   +-- lsn_2: "Мифы о счастье" [15 min]    <-- [TARGET]
|   +-- lsn_3: "Научный подход" [12 min]
+-- sec_2: "Основы" (4 lessons) -- collapsed
+-- ...
```

Полный `course_structure` не отправляется для локальных операций.

### 3.2 Prompt caching

Static prefix (system + schema) → semi-static (skeleton) → dynamic (message + short history).

DeepSeek: автоматический кэш 90% discount. OpenRouter: prompt caching headers.

### 3.3 Файлы

| Файл                                                                                 | Изменение                               |
| ------------------------------------------------------------------------------------ | --------------------------------------- |
| `packages/course-gen-platform/src/server/routers/generation/editing/chat-helpers.ts` | Skeleton builder                        |
| `packages/course-gen-platform/src/shared/intent/target-resolver.ts`                  | **Новый**: resolve target from skeleton |

**Гейт завершения Phase 3**:

1. Снижение input tokens для типового refine-запроса минимум на 60%

---

## Phase 4: course_nodes Migration — 5-7 дней

**Зачем**: Flat relational structure фундаментально лучше для surgical editing. Nested JSON с IDs — переходное решение.

### 4.1 Новая таблица

```sql
CREATE TABLE course_nodes (
  id TEXT PRIMARY KEY,                    -- sec_hY7a3fRx / lsn_kM9b2cQw
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES course_nodes(id),
  node_type TEXT CHECK (node_type IN ('section', 'lesson')),
  order_key TEXT NOT NULL,                -- fractional-indexing: "a1", "a1V", "a2"
  title TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',       -- objectives, topics, duration, description
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_course_nodes_course ON course_nodes(course_id);
CREATE INDEX idx_course_nodes_parent ON course_nodes(parent_id);

-- Partial unique indexes для order_key (NULL != NULL в Postgres,
-- поэтому UNIQUE(course_id, parent_id, order_key) пропускает дубли для root-узлов)
CREATE UNIQUE INDEX idx_course_nodes_order_root
  ON course_nodes(course_id, order_key) WHERE parent_id IS NULL;
CREATE UNIQUE INDEX idx_course_nodes_order_child
  ON course_nodes(course_id, parent_id, order_key) WHERE parent_id IS NOT NULL;
```

### 4.2 Security (обязательно)

- Включить RLS
- Политики зеркалят `courses` ownership/org access
- pgTAP тесты на read/write access

### 4.3 Fractional indexing (npm: `fractional-indexing`)

```typescript
import { generateKeyBetween } from 'fractional-indexing';
// Insert between "a1" and "a2" -> "a1V" (O(1), no renumbering)
const newKey = generateKeyBetween('a1', 'a2');
```

### 4.4 Dual-write migration

1. Конвертеры:
   - `nestedJsonToCourseNodes()` — nested JSON → rows
   - `courseNodesToNestedJson()` — rows → nested JSON (реконструкция)

2. Включить `COURSE_NODES_DUAL_WRITE_ENABLED`:
   - Записи идут одновременно в JSON и `course_nodes`

3. Parity checker:
   - Сравнивает восстановленную nested структуру с `courses.course_structure`
   - Логирует расхождения

4. После стабильности включить `COURSE_NODES_READ_ENABLED`:
   - Selected traffic читает из `course_nodes`
   - **Обновить gate в chat.router.ts**: заменить `course.course_structure` на абстракцию `hasResolvedStructure(course)`, которая проверяет наличие данных из активного источника (JSON или `course_nodes` в зависимости от флага)

5. Rollback:
   - Выключить read flag → продолжить читать из JSON

### 4.5 Удаление legacy JSON

Только после:

1. 100% parity в мониторинге за заданный период
2. Все readers переключены
3. Пройден rollback drill

Тогда:

1. Убрать dual-write
2. Убрать `course_structure` зависимые readers
3. Опционально удалить/архивировать колонку `courses.course_structure`

### 4.6 Surgical ops → SQL

С `course_nodes` операции становятся тривиальным SQL:

- ADD: `INSERT INTO course_nodes (id, course_id, parent_id, node_type, order_key, title, data)`
- DELETE: `DELETE FROM course_nodes WHERE id = $1`
- MOVE: `UPDATE course_nodes SET parent_id = $1, order_key = $2 WHERE id = $3`
- REORDER: `UPDATE course_nodes SET order_key = $1 WHERE id = $2`

Нет renumbering, нет index arithmetic, нет JSON manipulation.

**Гейт завершения Phase 4**:

1. Parity checker показывает 100% совпадение
2. RLS тесты проходят
3. Surgical ops работают через SQL
4. Rollback на JSON читалку протестирован

---

## Phase 5 (Future): UX Polish

- Immer `produceWithPatches()` для client-side undo/redo
- `jsondiffpatch` для tree-diff визуализации
- Progressive disclosure (toast → summary → diff → history)
- Clarification cards с clickable options
- `cockatiel` circuit breakers для LLM API resilience

---

## Feature Flags

| Flag                                | Phase | Назначение                          |
| ----------------------------------- | ----- | ----------------------------------- |
| `CHAT_INTENT_ROUTING_ENABLED`       | 1     | Auto-intent вместо manual toggle    |
| `CHAT_STRUCTURAL_PROPOSALS_ENABLED` | 2     | Surgical add/move/delete operations |
| `COURSE_NODES_DUAL_WRITE_ENABLED`   | 4     | Dual-write в JSON + course_nodes    |
| `COURSE_NODES_READ_ENABLED`         | 4     | Чтение из course_nodes вместо JSON  |

Rollout: включать по одному флагу, после каждого — метрики + error budget check.

---

## Порядок реализации

```
Phase 0 (IDs + Model Fix)   -- 2-3 дня (foundation)
Phase 1 (Auto-Intent)       -- 2-3 дня (зависит от Phase 0)
Phase 2 (Surgical Ops)      -- 4-6 дней (зависит от Phase 0+1)
Phase 3 (Context Opt)       -- 1-2 дня (параллельно с Phase 2)
Phase 4 (course_nodes)      -- 5-7 дней (после Phase 2, большая миграция)
```

**Phases 0-3: ~10-14 рабочих дней** (чат работает с nested JSON + IDs)
**Phase 4: +5-7 дней** (миграция на flat relational)
**Total: ~15-21 рабочих дней**

---

## Verification

### Unit tests

- `ensureStableIdsInMemory()` — idempotency, format, no mutation
- Backfill script — optimistic locking, skip unchanged
- Regex heuristics — ru/en patterns, edge cases
- `applySurgicalOperations()` — all 5 operation types
- ID remap — forward/backward, missing ID error
- Phase-model resolution — chat-specific 503 path

### Integration tests

- `generation.chat` без intent (auto-routing)
- Legacy `intent='regenerate'` продолжает работать
- Structural proposal → `applyProposal`
- Add lesson + Stage 6 CTA condition

### DB / pgTAP (Phase 4)

- RLS для `course_nodes`
- Unique constraint для `order_key`
- Parity RPC/helpers

### E2E (debug page)

- "Добавь урок про мифы после урока 2" → ADD_LESSON
- "Удали последнюю секцию" → DELETE (confirm)
- "Измени название курса на X" → UPDATE_FIELD (regex Tier 0)
- "Полностью переделай курс" → FULL_REGENERATE → async job
- "Сколько уроков?" → GET_INFO (без LLM)

### Quality gates (каждая фаза)

- `pnpm type-check`
- `pnpm lint`
- `pnpm --filter course-gen-platform test`
- Model: Проверить kimi-k2 для Stage 5 chat через debug page

---

## Допущения

1. Проект допускает phased rollout через flags
2. Backward compatibility нужна только на уровне текущего web client + backend API
3. Stage 6 readiness опирается на `generation_status` + `lesson_contents.status`
4. Допустимы временные dual-representations (`course_structure` + `course_nodes`) в течение нескольких релизов
