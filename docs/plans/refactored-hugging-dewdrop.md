# План: Исправить FSM переход stage_4_clarifying → stage_4_analyzing

## Проблема

При нажатии "Продолжить генерацию" на Stage 4 Clarifying возникает ошибка:

```
Invalid generation status transition: stage_4_clarifying -> stage_4_analyzing
```

## Причина

Несогласованность между:

1. **RPC функция** `approve_and_proceed_atomic` пытается перейти в `stage_4_analyzing`
2. **FSM триггер** в миграции `20260126220000_add_stage4_clarifying_status.sql` **НЕ разрешает** этот переход

Текущие разрешённые переходы из `stage_4_clarifying`:

```
"stage_4_clarifying": ["stage_4_complete", "stage_4_awaiting_approval", "failed", "cancelled"]
```

Но нужен переход в `stage_4_analyzing` чтобы обработать ответы.

## Решение

Добавить `stage_4_analyzing` в список разрешённых переходов из `stage_4_clarifying`.

## Файлы для изменения

| Файл                                                                                     | Действие       |
| ---------------------------------------------------------------------------------------- | -------------- |
| `packages/course-gen-platform/supabase/migrations/20260127XXXXXX_fix_clarifying_fsm.sql` | Новая миграция |

## Миграция

```sql
-- Migration: Fix FSM transition from stage_4_clarifying to stage_4_analyzing
-- Problem: approve_and_proceed_atomic attempts to transition to stage_4_analyzing
-- but this transition was not added to the FSM

CREATE OR REPLACE FUNCTION validate_generation_status_transition()
RETURNS TRIGGER AS $$
DECLARE
  v_valid_transitions JSONB;
  v_bypass TEXT;
BEGIN
  v_bypass := current_setting('app.bypass_fsm_validation', true);
  IF v_bypass = 'true' THEN
    RETURN NEW;
  END IF;

  IF OLD.generation_status IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.generation_status = OLD.generation_status THEN
    RETURN NEW;
  END IF;

  v_valid_transitions := '{
    "pending": ["stage_2_init", "stage_3_init", "stage_4_init", "cancelled"],
    "stage_2_init": ["stage_2_processing", "stage_2_complete", "stage_2_awaiting_approval", "stage_4_init", "failed", "cancelled"],
    "stage_2_processing": ["stage_2_complete", "stage_2_awaiting_approval", "failed", "cancelled"],
    "stage_2_complete": ["stage_2_awaiting_approval", "stage_3_init", "stage_3_summarizing", "stage_4_init", "failed", "cancelled"],
    "stage_2_awaiting_approval": ["stage_3_init", "stage_3_summarizing", "stage_4_init", "cancelled"],
    "stage_3_init": ["stage_3_summarizing", "stage_3_complete", "stage_3_awaiting_approval", "stage_2_complete", "failed", "cancelled"],
    "stage_3_summarizing": ["stage_3_complete", "stage_3_awaiting_approval", "stage_2_complete", "failed", "cancelled"],
    "stage_3_complete": ["stage_3_awaiting_approval", "stage_4_init", "failed", "cancelled"],
    "stage_3_awaiting_approval": ["stage_4_init", "cancelled"],
    "stage_4_init": ["stage_4_analyzing", "stage_4_complete", "stage_4_awaiting_approval", "failed", "cancelled"],
    "stage_4_analyzing": ["stage_4_clarifying", "stage_4_complete", "stage_4_awaiting_approval", "failed", "cancelled"],
    "stage_4_clarifying": ["stage_4_analyzing", "stage_4_complete", "stage_4_awaiting_approval", "failed", "cancelled"],
    "stage_4_complete": ["stage_4_awaiting_approval", "stage_5_init", "failed", "cancelled"],
    "stage_4_awaiting_approval": ["stage_5_init", "cancelled"],
    "stage_5_init": ["stage_5_generating", "stage_5_complete", "stage_5_awaiting_approval", "failed", "cancelled"],
    "stage_5_generating": ["stage_5_complete", "stage_5_awaiting_approval", "failed", "cancelled"],
    "stage_5_complete": ["stage_5_awaiting_approval", "stage_6_init", "finalizing", "failed", "cancelled"],
    "stage_5_awaiting_approval": ["stage_5_complete", "stage_6_init", "finalizing", "cancelled"],
    "stage_6_init": ["stage_6_generating", "stage_6_complete", "failed", "cancelled"],
    "stage_6_generating": ["stage_6_complete", "completed", "failed", "cancelled"],
    "stage_6_complete": ["finalizing", "completed", "failed", "cancelled"],
    "finalizing": ["completed", "failed", "cancelled"],
    "completed": ["pending", "stage_2_init", "stage_3_init", "stage_4_init", "stage_5_init", "stage_6_init"],
    "failed": ["pending", "stage_2_init", "stage_3_init", "stage_4_init", "stage_5_init", "stage_6_init"],
    "cancelled": ["pending", "stage_2_init", "stage_3_init", "stage_4_init", "stage_5_init", "stage_6_init"]
  }'::JSONB;

  IF NOT (v_valid_transitions->OLD.generation_status::text) ? NEW.generation_status::text THEN
    RAISE EXCEPTION 'Invalid generation status transition: % -> % (course_id: %)',
      OLD.generation_status,
      NEW.generation_status,
      NEW.id
    USING HINT = 'Valid transitions from ' || OLD.generation_status || ': ' ||
                  (v_valid_transitions->OLD.generation_status::text)::text;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;
```

**Изменение**: строка 48 изменена с

```
"stage_4_clarifying": ["stage_4_complete", "stage_4_awaiting_approval", "failed", "cancelled"],
```

на

```
"stage_4_clarifying": ["stage_4_analyzing", "stage_4_complete", "stage_4_awaiting_approval", "failed", "cancelled"],
```

## Как ответы clarifying используются сейчас

**Stage 4** (напрямую в промптах):

- Phase 1 Classifier — классификация курса
- Phase 2 Scope — определение структуры
- Phase 3 Expert — педагогическая стратегия
- Phase 4 Synthesis — генерирует `generation_guidance`

**Stage 5** (косвенно):

- Читает `course_structure` из БД
- Напрямую ответы НЕ передаются

## План действий

### Шаг 1: Исправить FSM (срочно)

Создать миграцию, добавить `stage_4_analyzing` в переходы из `stage_4_clarifying`.

### Шаг 2: Создать задачу в Beads

Задача для исследования: нужно ли передавать ответы clarifying напрямую в Stage 5.

```bash
bd create --title="Исследовать: передача clarifying ответов в Stage 5" \
  --type=task \
  --priority=3 \
  --label=pipeline \
  --description="Исследовать: нужно ли передавать ответы clarifying напрямую в Stage 5 промпты. Сейчас ответы влияют только на course_structure (Stage 4), но не на генерацию контента уроков."
```

## Верификация

1. Применить миграцию локально:

```bash
pnpm supabase:migrate
```

2. Проверить что переход работает:
   - Открыть курс на Stage 4 Clarifying
   - Нажать "Продолжить генерацию"
   - Должен начаться переход без ошибки 500

3. Задеплоить миграцию на remote Supabase:

```bash
pnpm supabase:push
```
