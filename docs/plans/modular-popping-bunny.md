# Plan: Миграция LLM Quality Tester из mc2 в aidevteam

## Context

LLM Quality Tester (скилл, БД-таблицы, веб-страница benchmarks, CLI-скрипты) был создан как временное решение внутри mc2 (платформа генерации курсов). Функционал не относится к основному продукту mc2 и должен жить в отдельном проекте aidevteam (aidevteam.ru). Задача: полностью перенести всё в aidevteam и очистить mc2.

**Два Supabase-проекта:**

- mc2: `diqooqbuchsliypgwksu`
- aidevteam: `kluvrjkcujlybishckup`

**Ключевые отличия aidevteam от mc2:**

- Нет i18n (next-intl) — русский язык hardcode
- Нет tRPC — REST API route handlers + server actions
- Нет `@tanstack/react-query` и `@tanstack/react-table` — нужно добавить
- Нет серверного Supabase-клиента — нужно создать
- Нет аутентификации — страница публичная, но noindex

---

## Шаг 1: Создать БД-схему в aidevteam Supabase

Создать единую миграцию `supabase/migrations/YYYYMMDD_create_benchmark_tables.sql` объединяющую логику из 3 миграций mc2 (пропускаем `20260128201400_link_benchmarks_to_model_config.sql` — она специфична для mc2):

### Таблицы:

1. **`llm_model_benchmarks`** — агрегированные результаты
   - Все колонки из mc2 (slug, name, provider, scores v1 + v2, tier, session_id)
   - БЕЗ связки с llm_model_config

2. **`llm_benchmark_runs`** — отдельные прогоны тестов
   - FK → llm_model_benchmarks

3. **`llm_benchmark_samples`** — полный контент генераций
   - FK → llm_model_benchmarks, test_session_id

### Views:

- `llm_model_leaderboard` — для страницы
- `llm_benchmark_comparison` — для сравнения моделей

### Functions:

- `calculate_quality_tier(score)`
- `calculate_tier_from_points(points)`

### RLS:

- **SELECT**: `true` (публичный доступ через anon key)
- **INSERT/UPDATE/DELETE**: service_role only (для CLI скриптов)

### Indexes:

- Все из mc2 (model_slug, test_date, quality_tier, leaderboard composite, etc.)

**Исходные файлы:**

- `/home/me/code/mc2/packages/course-gen-platform/supabase/migrations/20260128201300_create_benchmark_tables.sql`
- `/home/me/code/mc2/packages/course-gen-platform/supabase/migrations/20260129120000_benchmark_scoring_v2.sql`

---

## Шаг 2: Мигрировать данные из mc2 в aidevteam

Через MCP Supabase tools (execute_sql):

1. Экспорт из mc2 Supabase → JSON
2. Импорт в aidevteam Supabase
3. Таблицы: `llm_model_benchmarks`, `llm_benchmark_runs`, `llm_benchmark_samples`

Альтернатива: написать SQL-скрипт миграции данных.

---

## Шаг 3: Добавить зависимости в aidevteam/frontend

```bash
cd /home/me/code/aidevteam/frontend
pnpm add @tanstack/react-query @tanstack/react-table lucide-react
```

`lucide-react` — проверить, может уже есть.

**Файл:** `/home/me/code/aidevteam/frontend/package.json`

---

## Шаг 4: Создать серверный Supabase-клиент

Создать `/home/me/code/aidevteam/frontend/lib/supabase-server.ts`:

- Серверный клиент с `SUPABASE_SERVICE_ROLE_KEY` для записи
- Для чтения достаточно существующего anon-клиента из `lib/supabase.ts`

Добавить `SUPABASE_SERVICE_ROLE_KEY` в `.env`.

---

## Шаг 5: Создать QueryProvider

Создать `/home/me/code/aidevteam/frontend/components/providers/query-provider.tsx`:

- TanStack QueryClientProvider
- Обернуть в layout.tsx

---

## Шаг 6: Создать типы

Создать `/home/me/code/aidevteam/frontend/types/benchmarks.ts`:

- `BenchmarkData` — данные из leaderboard view
- `ScenarioResult` — результат прогона
- `BenchmarkSample` — полный контент генерации
- `QualityTier = 'S' | 'A' | 'B' | 'C' | 'D'`

**Адаптировать из:** `/home/me/code/mc2/packages/web/app/actions/benchmarks.ts` (интерфейсы)

---

## Шаг 7: Создать server actions

Создать `/home/me/code/aidevteam/frontend/app/actions/benchmarks.ts`:

- `getBenchmarksAction(params)` — основной запрос с фильтрацией
- `getTopModelsAction()` — топ-3 модели
- `getProvidersAction()` — список провайдеров
- `getLatestTestDateAction()` — последняя дата теста
- `getScenariosAction()` — сценарии
- `getTestDatesAction()` — даты тестов
- `getBenchmarkSampleAction(modelSlug, scenario)` — контент генерации
- `getTestSessionsAction()` — тестовые сессии
- `getModelScenarioResultsAction(modelSlug)` — результаты по сценариям

Использовать anon Supabase-клиент (данные публичные).

**Адаптировать из:** `/home/me/code/mc2/packages/web/app/actions/benchmarks.ts`

- Убрать `import type { Database } from '@/types/database.generated'` — использовать свои типы
- Использовать клиент из `@/lib/supabase`

---

## Шаг 8: Создать React Query helpers

Создать `/home/me/code/aidevteam/frontend/lib/queries/benchmarks.ts`:

**Скопировать и адаптировать из:** `/home/me/code/mc2/packages/web/lib/queries/benchmarks.ts`

---

## Шаг 9: Создать страницу /benchmarks

### Структура файлов:

```
frontend/app/benchmarks/
├── page.tsx                    # Server component (главная страница)
├── components/
│   ├── benchmarks-client.tsx   # Client component (обёртка)
│   ├── top-models-cards.tsx    # Топ-3 карточки
│   ├── models-ranking-table.tsx # Таблица рейтинга (TanStack Table)
│   └── sample-content-viewer.tsx # Диалог просмотра контента
```

### Адаптация от mc2:

- **Убрать i18n**: заменить `t('key')` на русские строки
- **Убрать `[locale]`**: путь просто `/benchmarks` вместо `/[locale]/benchmarks`
- **Убрать `next-intl`**: `useTranslations`, `setRequestLocale`, `getTranslations`
- **Убрать Logo**: использовать свою навигацию aidevteam
- **Стили**: адаптировать под дизайн-систему aidevteam (dark theme, Space Grotesk/Manrope шрифты)
- **SEO**: `robots: { index: false, follow: false }` в metadata

### Исходные файлы:

- `/home/me/code/mc2/packages/web/app/[locale]/benchmarks/page.tsx`
- `/home/me/code/mc2/packages/web/app/[locale]/benchmarks/components/benchmarks-client.tsx`
- `/home/me/code/mc2/packages/web/app/[locale]/benchmarks/components/top-models-cards.tsx`
- `/home/me/code/mc2/packages/web/app/[locale]/benchmarks/components/models-ranking-table.tsx`
- `/home/me/code/mc2/packages/web/app/[locale]/benchmarks/components/sample-content-viewer.tsx`

---

## Шаг 10: Скопировать CLI-скрипты

Скопировать в `/home/me/code/aidevteam/scripts/benchmark-llm/`:

- `index.ts`
- `test-model.ts`
- `types.ts`
- `migrate-data.ts`

### Адаптация:

- Supabase-клиент: использовать `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` из `.env` корневого проекта
- Путь к `.env`: корень `/home/me/code/aidevteam/.env`
- Добавить `OPENROUTER_API_KEY` в `.env`
- Обновить package.json корневой: добавить скрипт `"benchmark": "tsx scripts/benchmark-llm/index.ts"`
- Добавить зависимости в корневой package.json: `commander`, `tsx` (если нет)

**Исходные файлы:**

- `/home/me/code/mc2/packages/course-gen-platform/scripts/benchmark-llm/`

---

## Шаг 11: Скопировать скилл

Скопировать целиком:

```
.claude/skills/llm-quality-tester/
├── SKILL.md
├── prompts/judge-prompt.md
└── templates/test-scenarios.json
```

Из: `/home/me/code/mc2/.claude/skills/llm-quality-tester/`
В: `/home/me/code/aidevteam/.claude/skills/llm-quality-tester/`

### Адаптация SKILL.md:

- Обновить пути к файлам (убрать `packages/course-gen-platform/`)
- Обновить ссылки на Supabase (ID проекта)
- Обновить путь к `.env` с API-ключом
- Обновить ссылки на веб-страницу

---

## Шаг 12: Обновить .env

В `/home/me/code/aidevteam/.env` добавить:

```
OPENROUTER_API_KEY=<скопировать из mc2>
SUPABASE_SERVICE_ROLE_KEY=<ключ от aidevteam Supabase>
```

---

## Шаг 13: Очистка mc2

### Удалить файлы:

**Фронтенд:**

- `/home/me/code/mc2/packages/web/app/[locale]/benchmarks/` (вся директория)
- `/home/me/code/mc2/packages/web/app/actions/benchmarks.ts`
- `/home/me/code/mc2/packages/web/lib/queries/benchmarks.ts`

**Бэкенд:**

- `/home/me/code/mc2/packages/course-gen-platform/src/server/routers/admin/benchmarks.ts`
- Убрать импорт `benchmarksRouter` из `/home/me/code/mc2/packages/course-gen-platform/src/server/routers/admin/index.ts`

**CLI скрипты:**

- `/home/me/code/mc2/packages/course-gen-platform/scripts/benchmark-llm/` (вся директория)

**Скилл:**

- `/home/me/code/mc2/.claude/skills/llm-quality-tester/` (вся директория)

### НЕ удалять (пока):

- Миграции SQL (они уже применены, удаление файлов ничего не изменит)
- Типы в `database.types.ts` (они сгенерированы автоматически)

### Создать миграцию удаления таблиц:

- `DROP VIEW llm_benchmark_comparison`
- `DROP VIEW llm_model_leaderboard`
- `DROP TABLE llm_benchmark_samples`
- `DROP TABLE llm_benchmark_runs`
- `ALTER TABLE llm_model_config DROP COLUMN benchmark_id`
- `DROP TABLE llm_model_benchmarks`
- `DROP FUNCTION calculate_quality_tier`
- `DROP FUNCTION calculate_tier_from_points`
- `DROP FUNCTION get_recommended_model_for_phase`
- `DROP VIEW llm_model_config_with_quality`

После применения миграции — перегенерировать `database.types.ts`.

---

## Verification

### aidevteam:

1. `cd /home/me/code/aidevteam/frontend && pnpm type-check` — без TS-ошибок
2. `cd /home/me/code/aidevteam/frontend && pnpm build` — успешная сборка
3. Открыть `http://localhost:3000/benchmarks` — страница отображается с данными
4. Проверить фильтрацию, сортировку, раскрытие строк, просмотр контента
5. Проверить MCP: `execute_sql` → `SELECT count(*) FROM llm_model_benchmarks` — данные есть

### mc2:

1. `cd /home/me/code/mc2 && pnpm type-check` — без TS-ошибок
2. `cd /home/me/code/mc2 && pnpm build` — успешная сборка
3. Проверить что `/benchmarks` больше не доступен
4. Проверить что admin router работает без benchmarks

---

## Порядок выполнения

1. **aidevteam** — Шаги 1-12 (сначала полностью поднять всё в новом проекте)
2. **Верификация aidevteam** — убедиться что всё работает
3. **mc2 cleanup** — Шаг 13 (только после подтверждения работоспособности)
4. **Верификация mc2** — убедиться что ничего не сломалось
