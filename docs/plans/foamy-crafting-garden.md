# Plan: Resolve inactive to_verify log fingerprints

## Context

`to_verify` — промежуточный статус в системе логирования: исправление применено, ожидается подтверждение. Проблема: такие fingerprints "зависают" навсегда — существующий триггер `trg_reset_resolved_on_new_error` сбрасывает только `resolved`, но не `to_verify`.

**Цель**: Автоматически разрешать `to_verify` fingerprints, если ошибка не повторилась за 14 дней, или возвращать в `in_progress`, если повторилась. Интегрировать проверку в скилл `/process-logs`.

## Task: mc2-4cp6

---

## Step 1: Разовая очистка через SQL (Supabase MCP)

Сначала аудит (read-only), потом обновление.

### 1a. Аудит — посмотреть текущие to_verify fingerprints

```sql
SELECT
  lis.fingerprint,
  lis.updated_at AS marked_at,
  lis.notes,
  (NOW() - lis.updated_at) AS age,
  (SELECT COUNT(*) FROM error_logs el
   WHERE el.fingerprint = lis.fingerprint AND el.created_at > lis.updated_at) AS errors_after_mark,
  CASE
    WHEN (SELECT COUNT(*) FROM error_logs el
          WHERE el.fingerprint = lis.fingerprint AND el.created_at > lis.updated_at) = 0
         AND lis.updated_at < NOW() - INTERVAL '14 days'
    THEN 'WILL_RESOLVE'
    WHEN (SELECT COUNT(*) FROM error_logs el
          WHERE el.fingerprint = lis.fingerprint AND el.created_at > lis.updated_at) > 0
    THEN 'WILL_REOPEN'
    ELSE 'TOO_RECENT'
  END AS action
FROM log_issue_status lis
WHERE lis.status = 'to_verify' AND lis.fingerprint IS NOT NULL
ORDER BY lis.updated_at;
```

### 1b. Resolve (нет повторов, 14+ дней)

```sql
UPDATE log_issue_status SET
  status = 'resolved',
  notes = CONCAT('Auto-resolved: No recurrence in 14d (since ',
    TO_CHAR(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD'), '). Prev: ',
    LEFT(COALESCE(notes, 'none'), 80)),
  updated_at = NOW()
WHERE status = 'to_verify' AND fingerprint IS NOT NULL
  AND updated_at < NOW() - INTERVAL '14 days'
  AND NOT EXISTS (
    SELECT 1 FROM error_logs el
    WHERE el.fingerprint = log_issue_status.fingerprint
      AND el.created_at > log_issue_status.updated_at);
```

### 1c. Reopen (ошибка повторилась)

```sql
UPDATE log_issue_status SET
  status = 'in_progress',
  notes = CONCAT('Recurred after fix. Last seen: ',
    (SELECT TO_CHAR(MAX(el.created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')
     FROM error_logs el WHERE el.fingerprint = log_issue_status.fingerprint
       AND el.created_at > log_issue_status.updated_at),
    '. Prev: ', LEFT(COALESCE(notes, 'none'), 80)),
  updated_at = NOW()
WHERE status = 'to_verify' AND fingerprint IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM error_logs el
    WHERE el.fingerprint = log_issue_status.fingerprint
      AND el.created_at > log_issue_status.updated_at);
```

---

## Step 2: Миграция — RPC функция `resolve_inactive_to_verify`

**Файл**: `packages/course-gen-platform/supabase/migrations/20260210150000_resolve_inactive_to_verify_rpc.sql`

Шаблон: `upsert_auto_mute_status` из `20260119000000_add_upsert_auto_mute_rpc.sql` — SECURITY DEFINER, SET search_path, GRANT TO service_role.

Функция принимает `p_inactive_days INTEGER DEFAULT 14`, выполняет оба UPDATE (resolve + reopen) атомарно, возвращает JSON:

```json
{
  "resolved_count": N,
  "reopened_count": N,
  "resolved_fingerprints": [...],
  "reopened_fingerprints": [...],
  "inactive_days": 14,
  "executed_at": "..."
}
```

Взаимодействие с существующим триггером: после resolve нашей RPC, если ошибка повторится позже → триггер `trg_reset_resolved_on_new_error` сбросит `resolved` → `new`. Цепочка работает корректно.

---

## Step 3: Обновление SKILL.md — новый Step 1.7

**Файл**: `.claude/skills/process-logs/SKILL.md`

Вставить между Step 1.5 (Filter by Environment, строка ~377) и Step 2 (For EACH Error, строка ~385).

### Step 1.7: Check to_verify Fingerprints

Содержимое:

- Вызов `SELECT resolve_inactive_to_verify(14)` через Supabase MCP
- Разбор результата: если `reopened_count > 0` — включить fingerprints в обработку Step 2
- Если `resolved_count > 0` — отразить в итоговом отчете (Step 3)

### Обновление Step 3 (Summary Report)

Добавить секцию:

```markdown
### to_verify Auto-Resolution

| Action                            | Count |
| --------------------------------- | ----- |
| Auto-resolved (14d no recurrence) | X     |
| Reopened (error recurred)         | Y     |
```

---

## Critical Files

| Файл                                                                                                 | Действие                          |
| ---------------------------------------------------------------------------------------------------- | --------------------------------- |
| `packages/course-gen-platform/supabase/migrations/20260210150000_resolve_inactive_to_verify_rpc.sql` | Создать (новая миграция)          |
| `.claude/skills/process-logs/SKILL.md`                                                               | Редактировать (Step 1.7 + Step 3) |

### Файлы-шаблоны (read-only reference)

- `packages/course-gen-platform/supabase/migrations/20260119000000_add_upsert_auto_mute_rpc.sql` — шаблон RPC
- `packages/course-gen-platform/supabase/migrations/20260121100000_reset_resolved_on_new_error.sql` — существующий триггер (только `resolved`, не `to_verify`)

---

## Verification

1. **Аудит**: запустить SQL из Step 1a, проверить кол-во и действия
2. **Очистка**: запустить SQL из Step 1b/1c, проверить что стихло:
   ```sql
   SELECT COUNT(*) FROM log_issue_status
   WHERE status = 'to_verify' AND fingerprint IS NOT NULL
     AND updated_at < NOW() - INTERVAL '14 days';
   -- Expected: 0
   ```
3. **RPC**: после apply migration — `SELECT resolve_inactive_to_verify(14)` → JSON с count 0/0
4. **Skill test**: запустить `/process-logs`, убедиться что Step 1.7 отрабатывает

---

## Sequence

1. Аудит SQL (read-only) → оценить масштаб
2. Одноразовая очистка SQL → resolve/reopen текущих
3. Создать миграцию → RPC функция
4. Apply миграция → Supabase MCP
5. Обновить SKILL.md → Step 1.7 + Step 3
6. Verify → тест RPC + тест скилла
7. Commit + bd close mc2-4cp6
