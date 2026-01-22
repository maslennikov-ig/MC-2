# План: Исправление прогресс-бара генерации курса (застывает на 53%)

## Проблема

Прогресс-бар генерации курса застывает после Stage 5 и не обновляется во время Stage 6:

- После Stage 5 показывает ~53% (или другое фиксированное значение)
- Даже когда курс "completed", percentage остается на старом значении
- Пользователи думают, что генерация зависла

## Корневая причина

1. **RPC `update_course_progress`** рассчитывает `percentage` статически (20% на стадию), но вызывается только для Stages 2-5
2. **RPC `increment_lessons_completed`** (Stage 6) обновляет ТОЛЬКО `lessons_completed`, но НЕ `percentage`
3. **`checkAndSetStage6Complete`** обновляет `generation_status` на `completed`, но НЕ устанавливает `percentage = 100`

## Решение

### Модифицировать RPC `increment_lessons_completed`

Расширить функцию для динамического расчета `percentage` на основе прогресса уроков:

```sql
-- Формула:
-- base_percentage = 80 (Stage 5 completed = 4 стадии × 20%)
-- stage6_progress = (lessons_completed / lessons_total) * 20
-- total_percentage = base_percentage + stage6_progress
-- Когда все уроки: percentage = 100
```

### Ключевые файлы для изменения

| Файл                                                                                         | Изменение                              |
| -------------------------------------------------------------------------------------------- | -------------------------------------- |
| `packages/course-gen-platform/supabase/migrations/YYYYMMDD_fix_stage6_percentage.sql`        | Новая миграция с обновленной RPC       |
| `packages/course-gen-platform/src/stages/stage6-lesson-content/services/database-service.ts` | Возможно логирование нового percentage |

## Детали реализации

### 1. Создать миграцию с обновленной RPC функцией

```sql
CREATE OR REPLACE FUNCTION increment_lessons_completed(
  p_course_id UUID
) RETURNS INTEGER AS $$
DECLARE
  v_unique_count INTEGER;
  v_lessons_total INTEGER;
  v_percentage INTEGER;
  v_base_percentage INTEGER := 80; -- Stage 5 completed
  v_stage6_weight INTEGER := 20;   -- Stage 6 = 20%
BEGIN
  -- 1. Count unique completed lessons
  SELECT COUNT(DISTINCT lesson_id)
  INTO v_unique_count
  FROM lesson_contents
  WHERE course_id = p_course_id
    AND status = 'completed';

  -- 2. Get lessons_total from generation_progress
  SELECT COALESCE((generation_progress->>'lessons_total')::integer, 0)
  INTO v_lessons_total
  FROM courses
  WHERE id = p_course_id;

  -- 3. Calculate percentage
  IF v_lessons_total > 0 THEN
    -- Stage 6 progress based on completed lessons
    v_percentage := v_base_percentage +
      LEAST(v_stage6_weight, (v_unique_count * v_stage6_weight / v_lessons_total));

    -- Cap at 100% when all lessons complete
    IF v_unique_count >= v_lessons_total THEN
      v_percentage := 100;
    END IF;
  ELSE
    -- No lessons_total set, keep base percentage
    v_percentage := v_base_percentage;
  END IF;

  -- 4. Update lessons_completed AND percentage
  UPDATE courses
  SET
    generation_progress = jsonb_set(
      jsonb_set(
        COALESCE(generation_progress, '{}'::jsonb),
        '{lessons_completed}',
        to_jsonb(v_unique_count)
      ),
      '{percentage}',
      to_jsonb(v_percentage)
    ),
    updated_at = NOW()
  WHERE id = p_course_id;

  RETURN v_unique_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 2. Также обновить `checkAndSetStage6Complete`

В файле `database-service.ts:546-553` при переходе в `completed` добавить обновление `percentage = 100`:

```typescript
const { error: updateError } = await supabaseAdmin
  .from('courses')
  .update({
    generation_status: shouldAutoFinalize ? 'completed' : 'stage_6_complete',
    ...(completedAt && { generation_completed_at: completedAt }),
    // NEW: Also set percentage to 100 on completion
    generation_progress: {
      ...existingProgress,
      percentage: 100,
      message: 'Курс успешно создан!',
    },
  })
  .eq('id', courseId)
  .eq('generation_status', 'stage_6_generating');
```

### 3. UI уже готов

UI компонент `generation-progress.tsx:622` уже отображает `progress.percentage` — достаточно обновить значение в БД.

## UI компоненты (переиспользуем существующие)

**Изменения в UI НЕ требуются** - все компоненты уже готовы:

| Компонент               | Файл                                              | Использование                |
| ----------------------- | ------------------------------------------------- | ---------------------------- |
| `Progress`              | `components/ui/progress.tsx`                      | Базовый radix-ui компонент   |
| `SmoothProgress`        | `components/ui/smooth-progress.tsx`               | С плавной анимацией          |
| `StagedProgress`        | `components/ui/staged-progress.tsx`               | Индикаторы стадий + прогресс |
| `GenerationProgressBar` | `components/generation/GenerationProgressBar.tsx` | Полная панель со статистикой |

Все компоненты принимают `value` (0-100) и корректно отображают прогресс.

**`generation-progress.tsx:622`** уже использует:

```tsx
<Progress value={progress.percentage} className="h-3" />
```

Достаточно обновить `percentage` в БД через RPC.

## Верификация

1. **Проверить миграцию локально**:

   ```bash
   cd packages/course-gen-platform
   pnpm supabase migration new fix_stage6_percentage
   # Добавить SQL
   pnpm supabase db push
   ```

2. **Тест RPC вручную**:

   ```sql
   SELECT increment_lessons_completed('course-uuid-here');
   SELECT generation_progress->>'percentage' FROM courses WHERE id = 'course-uuid-here';
   ```

3. **E2E тест**:
   - Запустить генерацию курса
   - Наблюдать за прогресс-баром во время Stage 6
   - Убедиться что percentage обновляется с каждым уроком
   - Убедиться что при completed показывает 100%

4. **Type-check и build**:
   ```bash
   pnpm type-check && pnpm build
   ```

## Безопасность изменений

### Обратная совместимость ✅

1. **RPC сигнатура не меняется** - `increment_lessons_completed(UUID) RETURNS INTEGER`
2. **Возвращаемое значение то же** - count уникальных уроков
3. **Существующий код продолжит работать** без изменений

### Что добавляется (аддитивно)

- RPC теперь ДОПОЛНИТЕЛЬНО обновляет `percentage` в JSONB
- Если `lessons_total = 0` или NULL, percentage останется на 80% (безопасный fallback)
- Никакие поля не удаляются, только обновляются

### Риски и митигация

| Риск                   | Митигация                             | Вероятность |
| ---------------------- | ------------------------------------- | ----------- |
| `lessons_total` = NULL | Fallback на 80%, не ломает UI         | Низкая      |
| Деление на ноль        | Явная проверка `v_lessons_total > 0`  | Нет         |
| Race condition         | RPC atomic, PostgreSQL MVCC           | Нет         |
| Миграция не применится | Rollback возможен, обратно совместимо | Низкая      |
| Неверный percentage    | Unit-тест RPC перед деплоем           | Низкая      |

### Откат (если нужно)

Миграция обратно совместима. При необходимости:

```sql
-- Вернуть старую версию (только обновляет lessons_completed)
CREATE OR REPLACE FUNCTION increment_lessons_completed(...)
-- Убрать jsonb_set для percentage
```

## Зависимости

- Нет блокирующих зависимостей
- Обратно совместимо (только добавляем обновление percentage)

## Оценка сложности

**Низкая** — одна миграция SQL + небольшое изменение в TypeScript
