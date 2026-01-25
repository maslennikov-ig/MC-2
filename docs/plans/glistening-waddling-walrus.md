# План: Исправление конфигурации stage_4_clarifying

> **Статус**: Готов к реализации
> **Дата**: 2026-01-25

---

## Проблемы

1. **stage_number: null** — должен быть `4`
2. **Модель** — сменить primary на Kimi-K2 (дешевле при 4000 токенов)
3. **Порядок в документации** — clarifying показан первым, но выполняется после Budget Allocation

---

## Минорные улучшения: Статус

| Улучшение                   | Статус      | Файл/Строка                           |
| --------------------------- | ----------- | ------------------------------------- |
| trim() + min 3 chars        | ✅ Уже есть | `clarifying.router.ts:56,62`          |
| Zod validation Phase05Input | ✅ Уже есть | `phase-0.5-clarifying.ts:91,334`      |
| Toast уведомления ошибок    | ✅ Уже есть | `ClarifyingPanel.tsx:123,136,162,177` |
| RPC агрегация COUNT         | ❌ Не нужно | 3-7 вопросов макс — fetch+JS быстрее  |
| Pagination                  | ❌ Не нужно | 14 вопросов макс (7×2 раунда)         |

**Вывод**: Все нужные минорные улучшения уже реализованы.

---

## План изменений

### 1. Миграция БД

**Файл**: `packages/course-gen-platform/supabase/migrations/20260125220000_fix_clarifying_config.sql`

```sql
-- Fix stage_number and swap models for stage_4_clarifying
-- Primary: Kimi K2 (cheaper for 4000 tokens)
-- Fallback: Gemini 2.0 Thinking (reasoning capability)
UPDATE llm_model_config
SET
  stage_number = 4,
  model_id = 'moonshotai/kimi-k2-0905',
  fallback_model_id = 'google/gemini-2.0-flash-thinking-exp-01-21',
  primary_display_name = 'Kimi K2',
  fallback_display_name = 'Gemini 2.0 Thinking',
  updated_at = NOW()
WHERE phase_name = 'stage_4_clarifying';
```

### 2. Документация

**Файл**: `docs/llm-model-config.md`

Изменения:

1. Переместить `stage_4_clarifying` в отдельную секцию "Phase 0.5"
2. Показать правильный порядок выполнения
3. Обновить модели на Kimi-K2 / Gemini Thinking

**Новая структура Stage 4**:

```markdown
## Stage 4: Analysis

### Phase 0: Budget Allocation

> Нет отдельной LLM конфигурации — использует документы из Stage 3

### Phase 0.5: Clarifying Questions

| Phase              | Tier     | Primary Model           | Fallback Model                       | Temp | Tokens |
| ------------------ | -------- | ----------------------- | ------------------------------------ | ---- | ------ |
| stage_4_clarifying | standard | moonshotai/kimi-k2-0905 | google/gemini-2.0-flash-thinking-exp | 0.50 | 4000   |

### Phase 1-4: Analysis

| Phase                  | Tier     | Primary Model             | Fallback Model                | Temp | Tokens |
| ---------------------- | -------- | ------------------------- | ----------------------------- | ---- | ------ |
| stage_4_classification | standard | xiaomi/mimo-v2-flash:free | google/gemini-2.5-flash       | 0.70 | 4096   |
| stage_4_classification | extended | google/gemini-2.5-flash   | xiaomi/mimo-v2-flash:free     | 0.70 | 4096   |
| stage_4_scope          | standard | xiaomi/mimo-v2-flash:free | google/gemini-2.5-flash       | 0.70 | 4096   |
| stage_4_scope          | extended | google/gemini-2.5-flash   | xiaomi/mimo-v2-flash:free     | 0.70 | 4096   |
| stage_4_expert         | standard | moonshotai/kimi-k2-0905   | google/gemini-3-flash-preview | 0.50 | 8000   |
| stage_4_expert         | extended | google/gemini-2.5-flash   | xiaomi/mimo-v2-flash:free     | 0.50 | 8000   |
| stage_4_synthesis      | standard | moonshotai/kimi-k2-0905   | google/gemini-3-flash-preview | 0.70 | 6000   |
| stage_4_synthesis      | extended | google/gemini-2.5-flash   | xiaomi/mimo-v2-flash:free     | 0.70 | 6000   |
```

---

## Критические файлы

| Файл                                                                                        | Действие                      |
| ------------------------------------------------------------------------------------------- | ----------------------------- |
| `packages/course-gen-platform/supabase/migrations/20260125220000_fix_clarifying_config.sql` | Создать                       |
| `docs/llm-model-config.md`                                                                  | Модифицировать (строки 33-45) |

---

## Verification

### 1. Применить миграцию

```bash
cd packages/course-gen-platform && pnpm supabase db push
```

### 2. Проверить БД

```sql
SELECT phase_name, stage_number, model_id, fallback_model_id, primary_display_name
FROM llm_model_config
WHERE phase_name = 'stage_4_clarifying';
```

**Ожидаемый результат**:
| phase_name | stage_number | model_id | fallback_model_id | primary_display_name |
|------------|--------------|----------|-------------------|---------------------|
| stage_4_clarifying | 4 | moonshotai/kimi-k2-0905 | google/gemini-2.0-flash-thinking-exp-01-21 | Kimi K2 |

### 3. Проверить документацию

- Порядок фаз соответствует execution flow
- Модели синхронизированы с БД
