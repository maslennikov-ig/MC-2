# Plan: Phase 4 — course_nodes Migration (Flat Relational)

## Контекст

Phases 0-3 завершены. Курс-структура хранится как nested JSONB в `courses.course_structure`. Sections/lessons уже имеют stable IDs (`sec_*`/`lsn_*`) через `ensureStableIdsInMemory()`. Уже существуют таблицы `sections` и `lessons` (из initial migration), которые материализуются из JSON. Phase 4 создает новую таблицу `course_nodes` как flat relational замену nested JSON.

## Текущие write-точки `course_structure` (5 мест):

1. `chat.router.ts:554` — chat apply proposal
2. `chat-apply-helpers.ts:377` — surgical operations apply
3. `element-crud-helpers.ts:147` и `:546` — element CRUD (delete/move/add)
4. Stage 5 `handler.ts` — initial generation save
5. `section-regeneration-service.ts:367-395` — section regeneration

## Задачи

---

### Task 1: Supabase Migration — `course_nodes` table [database-architect]

**Файл**: `packages/course-gen-platform/supabase/migrations/20260213000000_create_course_nodes.sql`

**Создать таблицу**:

```sql
CREATE TYPE course_node_type AS ENUM ('section', 'lesson');

CREATE TABLE course_nodes (
  id TEXT PRIMARY KEY,                              -- sec_hY7a3fRx / lsn_kM9b2cQw
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES course_nodes(id) ON DELETE CASCADE,  -- null для sections
  node_type course_node_type NOT NULL,
  order_key TEXT NOT NULL,                          -- для fractional indexing
  title TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',                 -- все остальные поля
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Constraints**:

- `UNIQUE(course_id, parent_id, order_key)` — уникальность порядка в пределах родителя
- `CHECK` — sections must have `parent_id IS NULL`, lessons must have `parent_id IS NOT NULL`
- `CHECK` — `node_type = 'section' AND parent_id IS NULL` OR `node_type = 'lesson' AND parent_id IS NOT NULL`

**Indexes**:

- `(course_id, parent_id, order_key)` — основной запрос для получения структуры
- `(course_id, id)` — lookup по ID внутри курса
- `(course_id, node_type)` — фильтрация по типу

**RLS** (зеркалить `courses` паттерн):

```sql
ALTER TABLE course_nodes ENABLE ROW LEVEL SECURITY;

-- Admin: full access через organization
CREATE POLICY "admin_course_nodes_all" ON course_nodes FOR ALL TO authenticated
  USING (course_id IN (
    SELECT id FROM courses WHERE organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  ));

-- Instructor: own courses
CREATE POLICY "instructor_course_nodes_all" ON course_nodes FOR ALL TO authenticated
  USING (course_id IN (
    SELECT id FROM courses WHERE user_id = auth.uid()
  ));

-- SuperAdmin: all access
CREATE POLICY "superadmin_course_nodes_all" ON course_nodes FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM auth.users WHERE id = auth.uid()
    AND (raw_user_meta_data->>'role')::TEXT = 'superadmin'
  ));

-- Service role: bypass RLS (server-side admin client)
```

**Типы**: Обновить `database.types.ts` через `pnpm generate-types`.

**Acceptance criteria**:

- Migration применяется без ошибок
- RLS тесты проходят (admin/instructor/student видимость)
- TypeScript типы сгенерированы

---

### Task 2: Converter утилиты [fullstack-nextjs-specialist]

**Файл**: `packages/course-gen-platform/src/shared/course-nodes/converters.ts` (NEW)

**2a. `nestedJsonToCourseNodes(courseId, structure)`**:

- Input: `courseId: string`, `structure: CourseStructure`
- Output: `CourseNodeRow[]` — flat array готовый для upsert
- Логика:
  - Sections: `id = sec_*`, `parent_id = null`, `node_type = 'section'`
  - `order_key` — fractional indexing (a0, a1, a2... или lexicographic: "a", "b", "c")
  - `data` — все поля кроме `id`, `title`, `lessons` (для sections), `id`, `title` (для lessons)
  - Lessons: `id = lsn_*`, `parent_id = section.id`, `node_type = 'lesson'`
  - Вызывает `ensureStableIdsInMemory()` если IDs отсутствуют

**2b. `courseNodesToNestedJson(nodes)`**:

- Input: `CourseNodeRow[]` (flat)
- Output: `CourseStructure` (nested JSON)
- Логика:
  - Группировка по `parent_id IS NULL` → sections
  - Сортировка по `order_key`
  - Восстановление nested structure
  - Проставление `section_number`, `lesson_number`
  - Пересчет `estimated_duration_minutes` для sections и `estimated_duration_hours` для course

**2c. `generateOrderKey(index, total)`**:

- Генерация lexicographic order keys для fractional indexing
- Поддержка вставки между существующими ключами

**Тесты**: `packages/course-gen-platform/tests/unit/course-nodes/converters.test.ts`

- Round-trip: `json → nodes → json` should be equivalent
- Edge cases: пустые sections, section с 1 lesson, maximum nesting
- IDs preservation: existing IDs preserved, missing IDs generated
- Order key ordering: correct sorting

**Acceptance criteria**:

- Round-trip conversion preserves all data (deep equality minus computed fields)
- `pnpm type-check` passes
- Unit tests pass

---

### Task 3: Feature flags [simple — сделаю сам]

**Файл**: `packages/course-gen-platform/src/shared/course-nodes/feature-flags.ts` (NEW)

```typescript
export function isDualWriteEnabled(): boolean {
  return process.env.COURSE_NODES_DUAL_WRITE_ENABLED === 'true';
}

export function isReadFromNodesEnabled(): boolean {
  return process.env.COURSE_NODES_READ_ENABLED === 'true';
}
```

**Обновить**: `.env.example` с новыми переменными (defaults: `false`)

---

### Task 4: Dual-write service [fullstack-nextjs-specialist]

**Файл**: `packages/course-gen-platform/src/shared/course-nodes/dual-write-service.ts` (NEW)

**Функция `syncCourseNodesToDb(supabase, courseId, structure)`**:

- Проверяет `isDualWriteEnabled()` → return early if false
- Конвертирует: `nestedJsonToCourseNodes(courseId, structure)`
- Atomic upsert: delete existing nodes for courseId + insert new (в транзакции)
- Logging: count of nodes written, timing
- Error handling: log warning but don't fail (dual-write is non-blocking)

**Интеграция** — добавить вызов `syncCourseNodesToDb()` после каждого write-point:

1. `chat.router.ts` — после `courses.update({ course_structure })` (line ~554)
2. `chat-apply-helpers.ts` — после `courses.update({ course_structure })` (line ~377)
3. `element-crud-helpers.ts` — после обоих `courses.update()` (lines ~147, ~546)
4. Stage 5 `handler.ts` — после save structure
5. `section-regeneration-service.ts` — после atomic update

**Acceptance criteria**:

- При `COURSE_NODES_DUAL_WRITE_ENABLED=true` каждое обновление `course_structure` зеркалится в `course_nodes`
- При `false` — ноль дополнительных запросов
- Ошибки dual-write не блокируют основной flow
- `pnpm type-check` и `pnpm build` проходят

---

### Task 5: Parity checker [fullstack-nextjs-specialist]

**Файл**: `packages/course-gen-platform/src/shared/course-nodes/parity-checker.ts` (NEW)

**Функция `checkParity(supabase, courseId)`**:

- Читает `courses.course_structure` (JSON)
- Читает `course_nodes` для этого courseId
- Конвертирует nodes → JSON via `courseNodesToNestedJson()`
- Deep comparison (игнорируя computed fields и ordering differences)
- Returns: `{ match: boolean, differences: ParityDifference[] }`

**Функция `runParityReport(supabase, limit)`** (для batch-проверки):

- Выбирает последние N курсов с `course_structure IS NOT NULL`
- Запускает `checkParity()` для каждого
- Returns: summary с метриками

**Тесты**: unit tests для comparison logic

**Acceptance criteria**:

- Для dual-written курсов parity check возвращает `match: true`
- Различия четко описаны в `differences[]`

---

### Task 6: Read switch [fullstack-nextjs-specialist]

**Файл**: `packages/course-gen-platform/src/shared/course-nodes/read-service.ts` (NEW)

**Функция `loadCourseStructure(supabase, courseId)`**:

- Если `isReadFromNodesEnabled()`:
  - Читает `course_nodes` WHERE `course_id = courseId` ORDER BY `order_key`
  - Конвертирует через `courseNodesToNestedJson()`
  - Returns CourseStructure
- Иначе:
  - Читает `courses.course_structure` (текущий путь)
  - Returns CourseStructure

**Интеграция**: Заменить прямые `.select('course_structure')` на вызов `loadCourseStructure()` в ключевых read-точках (chat router, intent flow, etc.) — только в местах, где читается для редактирования.

**Acceptance criteria**:

- При `COURSE_NODES_READ_ENABLED=false` — поведение идентично текущему
- При `true` — структура читается из `course_nodes`
- Fallback на JSON при ошибке чтения из nodes

---

### Task 7: Backfill script [fullstack-nextjs-specialist]

**Файл**: `packages/course-gen-platform/scripts/backfill-course-nodes.ts` (NEW)

**Логика**:

- Выбирает `courses` WHERE `course_structure IS NOT NULL`
- Для каждого: `nestedJsonToCourseNodes()` + upsert
- Idempotent: повторный запуск не создает дубликаты
- Batch processing: по 50 курсов за раз
- Metrics: `courses_processed`, `courses_updated`, `courses_skipped`, `errors`
- Optimistic concurrency: check `updated_at` before write

**Запуск**: `pnpm tsx packages/course-gen-platform/scripts/backfill-course-nodes.ts`

**Acceptance criteria**:

- Все существующие курсы конвертированы в `course_nodes`
- Parity check проходит для 100% конвертированных курсов
- Повторный запуск не меняет данные

---

### Task 8: Закрыть устаревшие Beads задачи [simple — сделаю сам]

Закрыть Phase 0-3 задачи, которые показаны как in_progress/open:

- mc2-msmr, mc2-pfhz, mc2-pw7o, mc2-i7f9, mc2-gszz
- И их blocked children: mc2-m1gp, mc2-drxr, mc2-h8vi, mc2-ruqc, mc2-tpy0

---

## Порядок выполнения

```
Task 1 (migration) ──→ Task 2 (converters) ──→ Task 4 (dual-write)
                   └─→ Task 3 (flags)      └─→ Task 5 (parity)
                                            └─→ Task 6 (read switch)
                                            └─→ Task 7 (backfill)
Task 8 (cleanup) — параллельно

Итого: Tasks 1+3+8 параллельно → Task 2 → Tasks 4+5+6+7 параллельно
```

## Delegation Map

| Task | Agent                       | Type                       |
| ---- | --------------------------- | -------------------------- |
| 1    | database-architect          | Supabase migration + RLS   |
| 2    | fullstack-nextjs-specialist | TypeScript converters      |
| 3    | Сам                         | 1 файл, ~15 строк          |
| 4    | fullstack-nextjs-specialist | Integration across 5 files |
| 5    | fullstack-nextjs-specialist | Utility + tests            |
| 6    | fullstack-nextjs-specialist | Read service + integration |
| 7    | fullstack-nextjs-specialist | Script                     |
| 8    | Сам                         | bd close commands          |

## Quality Gates

После каждой задачи:

1. `pnpm type-check`
2. `pnpm build`
3. `pnpm test` (related tests)

После всех задач:

- Включить `COURSE_NODES_DUAL_WRITE_ENABLED=true`
- Создать курс через UI
- Проверить `course_nodes` в БД
- Запустить parity checker
- Включить `COURSE_NODES_READ_ENABLED=true`
- Проверить что чат и редактирование работают
