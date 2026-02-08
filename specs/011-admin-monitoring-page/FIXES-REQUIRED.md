# Отчет о необходимых исправлениях - Admin Monitoring Page

**Дата:** 2025-11-25
**Проверенные задачи:** T001, T002
**Статус:** ⚠️ Требуются исправления перед продолжением Phase 5

---

## 🔴 КРИТИЧЕСКИЕ ПРОБЛЕМЫ

### Проблема #1: Неверный Foreign Key в lesson_content.parent_content_id

**Файл:** `packages/course-gen-platform/supabase/migrations/20251125000000_admin_monitoring_tables.sql`

**Текущий код (НЕВЕРНО):**

```sql
ALTER TABLE lesson_content
ADD COLUMN IF NOT EXISTS parent_content_id UUID REFERENCES lesson_content(lesson_id);
```

**Проблема:**

- Foreign key ссылается на `lesson_content(lesson_id)` (внешний ключ к таблице `lessons`)
- Должен ссылаться на `lesson_content(id)` (первичный ключ для self-reference)
- Текущая ссылка означает, что `parent_content_id` будет хранить ID урока, а не ID предыдущей версии контента
- Это полностью блокирует функциональность версионирования контента (User Refinement)

**Последствия:**

- ❌ Невозможно создать refinement записи с корректной ссылкой на родительскую версию
- ❌ Constraint violation при попытке использовать `regenerateLessonWithRefinement`
- ❌ **Блокирует выполнение Phase 5 (T023-T026)**

**Приоритет:** 🔴 **КРИТИЧЕСКИЙ**

---

### Проблема #2: Неопределенность с таблицами lesson_content vs lesson_contents

**Наблюдение:**

В базе данных существуют ДВЕ таблицы:

1. `lesson_content` (единственное число) - старая таблица
2. `lesson_contents` (множественное число) - новая таблица для Stage 6

**Миграция изменяет:** `lesson_content` (старую таблицу)
**Спецификация упоминает:** `lesson_contents` (множественное число)

**Требуется проверка:**

- Какая таблица используется для Stage 6 Lesson Generation?
- Возможно, миграция применена не к той таблице?

**Приоритет:** 🔴 **КРИТИЧЕСКИЙ** - может потребоваться переделка миграции

---

## 🟡 НЕКРИТИЧЕСКИЕ ЗАМЕЧАНИЯ

### Замечание #1: Несоответствие в tasks.md

**Файл:** `specs/011-admin-monitoring-page/tasks.md`

**Текущий текст T002:**

```markdown
- [x] T002 [US1] Update database types in `packages/shared-types/src/database.generated.ts` (run type gen)
```

**Проблема:**

- tasks.md указывает файл `database.generated.ts`
- По конвенциям проекта (CLAUDE.md) MAIN файл это `database.types.ts`
- Типы были корректно обновлены в `database.types.ts`

**Приоритет:** 🟡 **НИЗКИЙ** - косметическое исправление документации

---

## 📋 ПЛАН ИСПРАВЛЕНИЙ

### Задача 1: Создать исправляющую миграцию для parent_content_id FK

**Действия:**

1. Создать новый файл миграции:
   - Путь: `packages/course-gen-platform/supabase/migrations/20251125XXXXXX_fix_lesson_content_parent_fk.sql`
   - Заменить `XXXXXX` на текущий timestamp

2. Содержимое миграции:

```sql
-- Migration: Fix lesson_content.parent_content_id Foreign Key
-- Purpose: Correct self-reference FK to point to lesson_content(id) instead of lesson_content(lesson_id)
-- Date: 2025-11-25

-- ============================================================================
-- Fix parent_content_id Foreign Key Constraint
-- ============================================================================

-- Step 1: Drop incorrect constraint
ALTER TABLE lesson_content
DROP CONSTRAINT IF EXISTS lesson_content_parent_content_id_fkey;

-- Step 2: Add correct constraint
ALTER TABLE lesson_content
ADD CONSTRAINT lesson_content_parent_content_id_fkey
  FOREIGN KEY (parent_content_id)
  REFERENCES lesson_content(id)
  ON DELETE SET NULL;

-- Alternative option (if you want to cascade delete refinement versions):
-- ON DELETE CASCADE;

COMMENT ON CONSTRAINT lesson_content_parent_content_id_fkey ON lesson_content IS
  'Self-reference FK to track content refinement history. Parent ID points to previous version of content.';
```

3. Применить миграцию:
   - Использовать `mcp__supabase__apply_migration`
   - Проверить успешное применение

4. Регенерировать типы:
   - Выполнить `mcp__supabase__generate_typescript_types`
   - Обновить `packages/shared-types/src/database.types.ts`
   - Проверить, что Relationships для `lesson_content.parent_content_id` теперь указывает на правильную колонку

**Ожидаемый результат:**

```typescript
// В database.types.ts должно появиться:
{
  foreignKeyName: 'lesson_content_parent_content_id_fkey';
  columns: ['parent_content_id'];
  isOneToOne: false;
  referencedRelation: 'lesson_content';
  referencedColumns: ['id']; // ← БЫЛО: ["lesson_id"], СТАЛО: ["id"]
}
```

**Критерии приемки:**

- ✅ Constraint `lesson_content_parent_content_id_fkey` ссылается на `lesson_content(id)`
- ✅ TypeScript типы обновлены корректно
- ✅ Можно вставить запись с `parent_content_id`, указывающим на другую запись `lesson_content`

---

### Задача 2: Проверить и исправить таблицу для refinement

**Действия:**

1. Выполнить SQL запрос для проверки структуры обеих таблиц:

```sql
-- Проверка структуры lesson_content
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'lesson_content'
ORDER BY ordinal_position;

-- Проверка структуры lesson_contents
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'lesson_contents'
ORDER BY ordinal_position;
```

2. Найти в коде, какая таблица используется для Stage 6:

```bash
# Поиск использования таблиц
grep -r "lesson_content" packages/course-gen-platform/src/stages/stage6* --include="*.ts"
grep -r "lesson_contents" packages/course-gen-platform/src/stages/stage6* --include="*.ts"
```

3. Принять решение:

**Вариант A:** Если Stage 6 использует `lesson_contents`:

- Создать миграцию для добавления полей в `lesson_contents`
- Удалить изменения из `lesson_content` (если они не нужны)

**Вариант B:** Если Stage 6 использует `lesson_content`:

- Оставить текущую миграцию (после исправления FK)
- Обновить спецификацию для корректного названия таблицы

**Критерии приемки:**

- ✅ Определена правильная таблица для refinement функциональности
- ✅ Миграция применена к корректной таблице
- ✅ Документация обновлена для соответствия реальности

---

### Задача 3: Обновить tasks.md

**Действия:**

1. Открыть файл `specs/011-admin-monitoring-page/tasks.md`

2. Найти строку:

```markdown
- [x] T002 [US1] Update database types in `packages/shared-types/src/database.generated.ts` (run type gen)
```

3. Заменить на:

```markdown
- [x] T002 [US1] Update database types in `packages/shared-types/src/database.types.ts` (run type gen)
```

**Критерии приемки:**

- ✅ tasks.md ссылается на правильный файл (`database.types.ts`)

---

## 🧪 ТЕСТИРОВАНИЕ ПОСЛЕ ИСПРАВЛЕНИЙ

### Тест 1: Проверка Foreign Key constraint

```sql
-- 1. Создать тестовую lesson_content запись (родитель)
INSERT INTO lesson_content (lesson_id, text_content, generation_attempt)
VALUES ('test-lesson-id', 'Original content', 1)
RETURNING id;

-- Предположим вернулся ID: 'parent-content-id'

-- 2. Создать refinement запись (дочернюю)
INSERT INTO lesson_content (
  lesson_id,
  text_content,
  generation_attempt,
  parent_content_id,
  user_refinement_prompt
)
VALUES (
  'test-lesson-id',
  'Refined content',
  2,
  'parent-content-id',  -- ← должно работать после исправления
  'Add more examples'
)
RETURNING id;

-- 3. Проверить связь
SELECT
  lc1.id as child_id,
  lc1.generation_attempt as child_attempt,
  lc1.parent_content_id,
  lc2.id as parent_id,
  lc2.generation_attempt as parent_attempt
FROM lesson_content lc1
LEFT JOIN lesson_content lc2 ON lc1.parent_content_id = lc2.id
WHERE lc1.parent_content_id IS NOT NULL;
```

**Ожидаемый результат:**

- ✅ Вторая вставка НЕ вызывает constraint violation
- ✅ JOIN возвращает корректную связь parent → child

### Тест 2: Проверка TypeScript типов

```typescript
// packages/course-gen-platform/src/test-refinement-types.ts
import type { Database } from '@megacampus/shared-types';

type LessonContent = Database['public']['Tables']['lesson_content']['Row'];
type LessonContentInsert = Database['public']['Tables']['lesson_content']['Insert'];

// Проверка наличия новых полей
const testContent: LessonContentInsert = {
  lesson_id: 'test-lesson',
  generation_attempt: 2,
  parent_content_id: 'parent-uuid', // ← должно компилироваться
  user_refinement_prompt: 'Make it simpler',
  text_content: 'Test content',
};

// Проверка nullable полей
const content: LessonContent = {
  lesson_id: 'test',
  generation_attempt: null, // ← допустимо
  parent_content_id: null, // ← допустимо
  user_refinement_prompt: null, // ← допустимо
  interactive_elements: null,
  media_urls: null,
  quiz_data: null,
  text_content: null,
  updated_at: null,
};

console.log('✅ Types compile correctly');
```

**Ожидаемый результат:**

- ✅ TypeScript компилируется без ошибок
- ✅ Все новые поля доступны в типах

---

## 📊 ЧЕКЛИСТ ПЕРЕД ПРОДОЛЖЕНИЕМ PHASE 5

- [ ] **Задача 1 выполнена:** Исправляющая миграция создана и применена
- [ ] **Задача 2 выполнена:** Определена правильная таблица, миграция применена корректно
- [ ] **Задача 3 выполнена:** tasks.md обновлен
- [ ] **Тест 1 пройден:** FK constraint работает корректно
- [ ] **Тест 2 пройден:** TypeScript типы корректны
- [ ] TypeScript типы регенерированы после исправления
- [ ] Нет ошибок type-check в затронутых файлах

---

## 📁 ЗАТРОНУТЫЕ ФАЙЛЫ

### Файлы для изменения:

1. `packages/course-gen-platform/supabase/migrations/20251125XXXXXX_fix_lesson_content_parent_fk.sql` (создать)
2. `packages/shared-types/src/database.types.ts` (регенерировать)
3. `specs/011-admin-monitoring-page/tasks.md` (обновить)

### Файлы для проверки:

1. `packages/course-gen-platform/src/stages/stage6-*/*.ts` (определить используемую таблицу)
2. `packages/course-gen-platform/src/server/routers/admin.ts` (проверить после исправлений)

---

## 🎯 ПРИОРИТЕТЫ

| Задача                      | Приоритет      | Блокирует           | Срок         |
| --------------------------- | -------------- | ------------------- | ------------ |
| Задача 1: Исправить FK      | 🔴 КРИТИЧЕСКИЙ | Phase 5 (T023-T026) | Немедленно   |
| Задача 2: Проверить таблицу | 🔴 КРИТИЧЕСКИЙ | Phase 5 (T023-T026) | Немедленно   |
| Задача 3: Обновить tasks.md | 🟡 НИЗКИЙ      | Нет                 | Когда удобно |

---

## 💡 ДОПОЛНИТЕЛЬНЫЕ РЕКОМЕНДАЦИИ

### Рекомендация 1: Добавить составной индекс

После исправления FK рассмотрите добавление индекса для быстрого поиска цепочек refinement:

```sql
-- Ускоряет поиск "всех версий урока"
CREATE INDEX IF NOT EXISTS idx_lesson_content_lesson_id_generation_attempt
ON lesson_content(lesson_id, generation_attempt);

-- Ускоряет поиск "всех дочерних версий"
CREATE INDEX IF NOT EXISTS idx_lesson_content_parent_content_id
ON lesson_content(parent_content_id)
WHERE parent_content_id IS NOT NULL;
```

### Рекомендация 2: Добавить CHECK constraint на generation_attempt

Предотвратить некорректные значения:

```sql
ALTER TABLE lesson_content
ADD CONSTRAINT check_generation_attempt_positive
CHECK (generation_attempt IS NULL OR generation_attempt >= 1);
```

### Рекомендация 3: Документировать refinement flow

Создать комментарий на таблицу для будущих разработчиков:

```sql
COMMENT ON TABLE lesson_content IS
  'Lesson content with versioning support.
   generation_attempt=1 for original, 2+ for refinements.
   parent_content_id creates refinement chain (self-reference).';
```

---

## 📞 КОНТАКТЫ ДЛЯ ВОПРОСОВ

- Спецификация: `specs/011-admin-monitoring-page/spec.md`
- План: `specs/011-admin-monitoring-page/plan.md`
- Задачи: `specs/011-admin-monitoring-page/tasks.md`
- Этот отчет: `specs/011-admin-monitoring-page/FIXES-REQUIRED.md`

---

**Конец отчета**
