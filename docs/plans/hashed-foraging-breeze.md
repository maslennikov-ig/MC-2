# План: Внедрение KIMI K2 на ключевых этапах генерации

## Цель

Заменить бесплатную модель `xiaomi/mimo-v2-flash:free` на премиум модель `moonshotai/kimi-k2-0905` (KIMI K2) на трёх ключевых этапах, влияющих на качество курса:

1. **stage_4_expert** — глубокий экспертный анализ
2. **stage_4_synthesis** — синтез результатов анализа
3. **stage_5_metadata** — метаданные и структура курса

## Обоснование выбора

| Этап              | Влияние на качество          | Вызовов/курс | Добавка к стоимости |
| ----------------- | ---------------------------- | ------------ | ------------------- |
| stage_4_expert    | Определяет глубину материала | 1            | ~$0.020             |
| stage_4_synthesis | Формирует Analysis Report    | 1            | ~$0.015             |
| stage_5_metadata  | Определяет структуру курса   | 1            | ~$0.012             |
| **ИТОГО**         |                              | 3            | **~$0.047/курс**    |

## Текущая конфигурация (подтверждено из БД)

| Фаза              | Tier     | Primary                   | Fallback                  |
| ----------------- | -------- | ------------------------- | ------------------------- |
| stage_4_expert    | standard | xiaomi/mimo-v2-flash:free | google/gemini-2.5-flash   |
| stage_4_expert    | extended | google/gemini-2.5-flash   | xiaomi/mimo-v2-flash:free |
| stage_4_synthesis | standard | xiaomi/mimo-v2-flash:free | google/gemini-2.5-flash   |
| stage_4_synthesis | extended | google/gemini-2.5-flash   | xiaomi/mimo-v2-flash:free |
| stage_5_metadata  | standard | xiaomi/mimo-v2-flash:free | google/gemini-2.5-flash   |
| stage_5_metadata  | extended | google/gemini-2.5-flash   | xiaomi/mimo-v2-flash:free |

## Целевая конфигурация (после изменений)

| Фаза              | Tier         | Primary                     | Fallback                  | Изменение |
| ----------------- | ------------ | --------------------------- | ------------------------- | --------- |
| stage_4_expert    | **standard** | **moonshotai/kimi-k2-0905** | google/gemini-2.5-flash   | **Да**    |
| stage_4_expert    | extended     | google/gemini-2.5-flash     | xiaomi/mimo-v2-flash:free | Нет       |
| stage_4_synthesis | **standard** | **moonshotai/kimi-k2-0905** | google/gemini-2.5-flash   | **Да**    |
| stage_4_synthesis | extended     | google/gemini-2.5-flash     | xiaomi/mimo-v2-flash:free | Нет       |
| stage_5_metadata  | **standard** | **moonshotai/kimi-k2-0905** | google/gemini-2.5-flash   | **Да**    |
| stage_5_metadata  | extended     | google/gemini-2.5-flash     | xiaomi/mimo-v2-flash:free | Нет       |

> **Только standard tier** — extended уже использует Gemini 2.5 Flash (качественная модель)

## Реализация

### Шаг 1: Создать миграцию Supabase

**Файл:** `packages/course-gen-platform/supabase/migrations/YYYYMMDDHHMMSS_kimi_k2_premium_phases.sql`

```sql
-- Обновить конфигурации для premium фаз на KIMI K2
-- Только STANDARD tier (extended остаётся на Gemini 2.5 Flash)

-- 1. stage_4_expert (standard tier)
UPDATE llm_model_config
SET model_id = 'moonshotai/kimi-k2-0905',
    updated_at = NOW()
WHERE phase_name = 'stage_4_expert'
  AND context_tier = 'standard'
  AND config_type = 'global'
  AND is_active = true;

-- 2. stage_4_synthesis (standard tier)
UPDATE llm_model_config
SET model_id = 'moonshotai/kimi-k2-0905',
    updated_at = NOW()
WHERE phase_name = 'stage_4_synthesis'
  AND context_tier = 'standard'
  AND config_type = 'global'
  AND is_active = true;

-- 3. stage_5_metadata (standard tier)
UPDATE llm_model_config
SET model_id = 'moonshotai/kimi-k2-0905',
    updated_at = NOW()
WHERE phase_name = 'stage_5_metadata'
  AND context_tier = 'standard'
  AND config_type = 'global'
  AND is_active = true;
```

### Шаг 2: Обновить документацию

**Файл:** `docs/llm-model-config.md`

Обновить таблицы для Stage 4 и Stage 5, отразив новые primary модели.

### Шаг 3: Сбросить кэш моделей (опционально)

После применения миграции кэш (L1 Memory, L2 Redis) автоматически обновится через 5 минут (TTL). Для немедленного применения:

```bash
# Через админ-панель или напрямую в Redis
redis-cli DEL "llm:config:*"
```

## Критические файлы

| Файл                                                                  | Назначение                             |
| --------------------------------------------------------------------- | -------------------------------------- |
| `packages/course-gen-platform/supabase/migrations/`                   | Новая миграция                         |
| `docs/llm-model-config.md`                                            | Документация моделей                   |
| `packages/course-gen-platform/src/shared/llm/model-config-service.ts` | Сервис загрузки (не требует изменений) |

## Верификация

1. **Применить миграцию:**

   ```bash
   cd packages/course-gen-platform
   pnpm supabase db push
   ```

2. **Проверить конфигурацию в БД:**

   ```sql
   SELECT phase_name, model_id, context_tier
   FROM llm_model_config
   WHERE phase_name IN ('stage_4_expert', 'stage_4_synthesis', 'stage_5_metadata')
     AND context_tier = 'standard'
     AND is_active = true;
   -- Ожидаемый результат: все 3 строки с model_id = 'moonshotai/kimi-k2-0905'
   ```

3. **Проверить в админ-панели:**
   - Открыть `/admin/pipeline`
   - Убедиться, что для указанных фаз отображается `moonshotai/kimi-k2-0905`

4. **Тест генерации:**
   - Запустить генерацию тестового курса
   - Проверить в логах, что используется KIMI K2 для указанных фаз
   - Сравнить качество Analysis Report с предыдущими генерациями

## Риски и откат

**Риск:** KIMI K2 может быть недоступна или иметь rate limits.

**Митигация:** Сохраняем `google/gemini-2.5-flash` как fallback модель.

**Откат:** Через админ-панель или SQL:

```sql
UPDATE llm_model_config
SET model_id = 'xiaomi/mimo-v2-flash:free'
WHERE phase_name IN ('stage_4_expert', 'stage_4_synthesis', 'stage_5_metadata')
  AND context_tier = 'standard'
  AND is_active = true;
```
