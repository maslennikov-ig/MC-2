# Phase 4: course_nodes Migration — Implementation Plan

## Context

Phases 0-3 Surgical Course Editing v2.2 реализованы. Phase 4 мигрирует данные структуры курсов из nested JSONB (`courses.course_structure`) в flat relational таблицу (`course_nodes`), используя dual-write/dual-read стратегию с feature flags для безопасного rollout.

**Ref ТЗ**: `docs/plans/2026-02-12-surgical-course-editing-v2-1.md` (Section 8)

### Текущая архитектура

**WRITE пути (только 3):**

1. Stage 5 handler (`handler.ts:380-391`): `supabase.from('courses').update({ course_structure })`
2. Chat apply helpers (`chat-apply-helpers.ts:177-194`, `:374-380`): `supabase.from('courses').update({ course_structure })`
3. `restart_from_stage` RPC: условно очищает `course_structure` при `p_stage_number <= 5`

**READ пути (ключевые):**

- `chat.router.ts:321,436`: Gate check + cast для intent routing
- `dependencies.router.ts:64`: Dependency graph
- `chat-helpers.ts:61-120`: Skeleton builder
- `course-mapper.ts:194`: LMS publishing
- `admin/generation-monitoring.ts`: Admin dashboard

**Уже реализовано в Phases 0-2:**

- Stable IDs: `ensureStableIdsInMemory()` в `course-structure-editor.ts:785-808`
- Формат: `sec_` + nanoid(8), `lsn_` + nanoid(8)
- Surgical operations: `applySurgicalOperations()` в `surgical-operations.ts:663-752`
- ID remapping: `surgical-id-remap.ts`

**Существующие `sections`/`lessons` таблицы** — это ДРУГИЕ таблицы (UUID PK), материализуемые `handler-db-helpers.ts` для Stage 6+ / lesson content. `course_nodes` их НЕ заменяет.

**Последняя миграция**: `20260212120000_seed_chat_intent_classification.sql`

---

## Tasks (8 задач)

### Task 1: DB Migration — `course_nodes` таблица + RLS

**Зависимости**: нет | **Beads**: создать подзадачу mc2-rnxr

**Создать**: `supabase/migrations/20260213000000_create_course_nodes_table.sql`

```sql
CREATE TABLE course_nodes (
  id TEXT PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES course_nodes(id) ON DELETE CASCADE,
  node_type TEXT NOT NULL CHECK (node_type IN ('section', 'lesson')),
  order_key TEXT NOT NULL,
  title TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_course_nodes_course ON course_nodes(course_id);
CREATE INDEX idx_course_nodes_parent ON course_nodes(parent_id);

CREATE UNIQUE INDEX idx_course_nodes_order_root
  ON course_nodes(course_id, order_key) WHERE parent_id IS NULL;
CREATE UNIQUE INDEX idx_course_nodes_order_child
  ON course_nodes(course_id, parent_id, order_key) WHERE parent_id IS NOT NULL;
```

**RLS**: зеркалит `courses_all` policy через `course_id IN (SELECT id FROM courses WHERE ...)`.

**`restart_from_stage` RPC**: добавить `DELETE FROM course_nodes WHERE course_id = p_course_id` при `p_stage_number <= 5`.

**Обновить `.env.example`**: добавить `COURSE_NODES_DUAL_WRITE_ENABLED` и `COURSE_NODES_READ_ENABLED`.

**Регенерировать types**: `mcp__supabase__generate_typescript_types` → rebuild shared-types.

**Верификация**: `mcp__supabase__apply_migration`, проверить таблицу через `execute_sql`.

---

### Task 2: Установить `fractional-indexing` + утилиты order keys

**Зависимости**: нет (параллельно с Task 1)

**Установить**: `pnpm --filter course-gen-platform add fractional-indexing`

**Создать**: `src/shared/course-nodes/order-keys.ts`

- `generateInitialOrderKeys(count: number): string[]` — N равномерных ключей
- `generateOrderKeyBetween(before: string | null, after: string | null): string` — ключ между двумя

**Тесты**: `tests/unit/course-nodes/order-keys.test.ts`

- N ключей отсортированы; вставка между двумя ключами корректна; edge cases (0, 1, 100)

---

### Task 3: Конвертеры `nestedJsonToCourseNodes()` и `courseNodesToNestedJson()`

**Зависимости**: Task 2

**Создать**:

- `src/shared/course-nodes/types.ts` — `CourseNodeRow` интерфейс
- `src/shared/course-nodes/converters.ts` — два конвертера

**`nestedJsonToCourseNodes(courseId, structure)`**:

- Итерирует sections → rows с `parent_id: null`, `node_type: 'section'`
- Для каждого lesson → row с `parent_id: sectionId`, `node_type: 'lesson'`
- `data` JSONB: section_description, learning_objectives / lesson_objectives, key_topics, estimated_duration_minutes, difficulty_level
- Order keys из `generateInitialOrderKeys()`
- Throws если `section.id` или `lesson.id` отсутствует

**`courseNodesToNestedJson(nodes, courseMeta)`**:

- Группирует по `parent_id`, сортирует по `order_key`
- Реконструирует nested structure с пересчётом section_number, lesson_number, duration
- `courseMeta` — course-level fields (title, description, tags и т.д.) из `courses.course_structure`

**Тесты**: `tests/unit/course-nodes/converters.test.ts` (КРИТИЧЕСКИЕ)

- Round-trip: `courseNodesToNestedJson(nestedJsonToCourseNodes(id, struct), meta)` ≈ original
- Throws на missing IDs
- Корректный parent_id, order_key, data fields
- Empty sections, single lesson

---

### Task 4: Parity Checker

**Зависимости**: Task 3

**Создать**: `src/shared/course-nodes/parity-checker.ts`

```typescript
interface ParityResult {
  isEqual: boolean;
  differences: { path: string; expected: unknown; actual: unknown }[];
  courseId: string;
}

function checkParity(
  courseId: string,
  original: CourseStructure,
  reconstructed: CourseStructure
): ParityResult;
```

Сравнивает: количество sections/lessons, titles, descriptions, objectives, ordering, durations, stable IDs.

**Тесты**: `tests/unit/course-nodes/parity-checker.test.ts`

---

### Task 5: Feature Flags + `hasResolvedStructure()` + `resolveStructure()`

**Зависимости**: Task 3

**Создать**:

- `src/shared/course-nodes/feature-flags.ts` — `COURSE_NODES_DUAL_WRITE_ENABLED`, `COURSE_NODES_READ_ENABLED`
- `src/shared/course-nodes/structure-resolver.ts`:
  - `hasResolvedStructure(course)` — boolean gate (JSONB или course_nodes)
  - `resolveStructure(courseId, courseStructureJson, supabase)` — возвращает CourseStructure из активного источника
- `src/shared/course-nodes/index.ts` — barrel exports

**Тесты**: `tests/unit/course-nodes/structure-resolver.test.ts`

- Flag off → читает JSONB; flag on → читает course_nodes (mock DB)

---

### Task 6: Dual-Write — Stage 5 Handler

**Зависимости**: Tasks 1, 2, 3, 5

**Создать**: `src/shared/course-nodes/writer.ts`

```typescript
async function writeCourseNodes(
  courseId: string,
  structure: CourseStructure,
  supabase,
  logger
): Promise<void>;
```

1. DELETE existing rows для course_id
2. `nestedJsonToCourseNodes()` → batch INSERT
3. Read back → `courseNodesToNestedJson()` → `checkParity()` → log

**Модифицировать**: `src/stages/stage5-generation/handler.ts` — после строки 391:

```typescript
if (COURSE_NODES_DUAL_WRITE_ENABLED) {
  await writeCourseNodes(courseId, structureWithIds, supabaseAdmin, jobLogger).catch(err =>
    jobLogger.warn({ courseId, error: err }, 'course_nodes dual-write failed (non-fatal)')
  );
}
```

**Тесты**: `tests/unit/course-nodes/writer.test.ts`

---

### Task 7: Dual-Write — Chat Apply Helpers + Chat Router

**Зависимости**: Tasks 1-3, 5, 6

**Модифицировать**:

1. `chat-apply-helpers.ts` — в `applyFieldUpdatesProposal()` (строка ~194) и `applyStructuralOperationProposal()` (строка ~380): после update добавить `writeCourseNodes()` if flag enabled
2. `chat.router.ts` — в `applyDirectAction` (строка ~554): после update добавить `writeCourseNodes()`

Паттерн: fire-and-forget с catch → warn (non-fatal).

**Тесты**: существующие тесты не ломаются + новый тест: verify `writeCourseNodes` called

---

### Task 8: Read Path Switchover

**Зависимости**: Tasks 5, 6, 7

**Модифицировать** (высокий приоритет):

1. `chat.router.ts:321` — `course.course_structure` → `hasResolvedStructure(course)`
2. `chat.router.ts:324,436` — cast → `await resolveStructure(courseId, course.course_structure, supabase)`
3. `dependencies.router.ts:64` — аналогично

**Модифицировать** (низкий приоритет, можно позже):

- `admin/generation-monitoring.ts` — остаётся на JSONB
- `course-mapper.ts` (LMS) — остаётся на JSONB

**Тесты**: `tests/unit/course-nodes/read-switchover.test.ts`

- Flag off: читает JSONB
- Flag on: читает course_nodes
- Fallback: course_nodes пусто, JSONB есть → graceful fallback

---

## Dependency Graph

```
Task 1 (DB Migration)  ──────────────────┐
                                          ├──→ Task 6 (Dual-Write: Stage 5)
Task 2 (Fractional Indexing) ──┐          │         │
                               ├──→ Task 3 (Converters) ──→ Task 4 (Parity)
                               │         │                       │
                               │         ├──→ Task 5 (Abstractions) ──→ Task 7 (Dual-Write: Chat)
                               │                                              │
                               │                                              ├──→ Task 8 (Read Switchover)
```

**Параллельные треки**: Tasks 1+2, Tasks 4+5, Tasks 6+7 (частично)

---

## Feature Flags

| Flag                              | Описание                           | Default |
| --------------------------------- | ---------------------------------- | ------- |
| `COURSE_NODES_DUAL_WRITE_ENABLED` | Записи идут в JSON + course_nodes  | `false` |
| `COURSE_NODES_READ_ENABLED`       | Чтение из course_nodes вместо JSON | `false` |

Rollout: включать последовательно. Read только после стабильного parity.

---

## Новые файлы (11)

| Файл                                                               | Task |
| ------------------------------------------------------------------ | ---- |
| `supabase/migrations/20260213000000_create_course_nodes_table.sql` | 1    |
| `src/shared/course-nodes/order-keys.ts`                            | 2    |
| `src/shared/course-nodes/types.ts`                                 | 3    |
| `src/shared/course-nodes/converters.ts`                            | 3    |
| `src/shared/course-nodes/parity-checker.ts`                        | 4    |
| `src/shared/course-nodes/feature-flags.ts`                         | 5    |
| `src/shared/course-nodes/structure-resolver.ts`                    | 5    |
| `src/shared/course-nodes/index.ts`                                 | 5    |
| `src/shared/course-nodes/writer.ts`                                | 6    |
| `tests/unit/course-nodes/*.test.ts` (4 файла)                      | 2-5  |

## Модифицируемые файлы (5)

| Файл                                 | Task |
| ------------------------------------ | ---- |
| `package.json` (course-gen-platform) | 2    |
| `handler.ts` (Stage 5)               | 6    |
| `chat-apply-helpers.ts`              | 7    |
| `chat.router.ts`                     | 7, 8 |
| `dependencies.router.ts`             | 8    |

---

## Verification

1. `pnpm type-check` — после каждого task
2. `pnpm --filter course-gen-platform test` — unit тесты
3. `mcp__supabase__execute_sql` — проверить таблицу, RLS, индексы
4. Parity checker логирует 100% совпадение при dual-write
5. Ручной тест: создать курс → Stage 5 → проверить course_nodes rows

---

## Risks

1. **Parity failures** → non-fatal dual-write, read flag отдельный от write
2. **Course-level metadata не в course_nodes** → остаётся в JSONB, передаётся как `courseMeta` в реконструктор
3. **Путаница с `sections`/`lessons` таблицами** → `course_nodes` — для Stage 5 editing, existing tables — для Stage 6+ content. Документировать в коде.
4. **Fractional key exhaustion** → крайне маловероятно для 5-100 элементов; rebalance как future work
