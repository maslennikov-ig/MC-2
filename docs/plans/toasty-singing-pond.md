# Plan: Работа с задачами после аудита

## ВЫПОЛНЕНО (Пул 1)

| ID       | Название                            | Результат                              |
| -------- | ----------------------------------- | -------------------------------------- |
| mc2-bpgd | 80+ empty catch blocks              | ✅ CLOSED (0 найдено)                  |
| mc2-vp52 | CascadeStageDeleteModal → next-intl | ✅ CLOSED (коммит 6f162f27)            |
| mc2-dopy | Extract status colors               | ✅ CLOSED (won't do — не дублирование) |
| mc2-ec3f | any types count                     | 📝 Updated (524→200)                   |
| mc2-imib | TODO comments count                 | 📝 Updated (50+→38)                    |

---

## Проверка актуальности задач (30.01.2026)

### ✅ АКТУАЛЬНЫЕ — готовы к работе

| ID       | Название               | Статус        | Детали                                                       |
| -------- | ---------------------- | ------------- | ------------------------------------------------------------ |
| mc2-80i  | URL filter persistence | **АКТУАЛЬНО** | Фильтры НЕ сохраняются в URL. 8 параметров для персистенции. |
| mc2-kfo  | Tiered Testing CI/CD   | **АКТУАЛЬНО** | Команды test:unit/integration ЕСТЬ, но CI их НЕ использует.  |
| mc2-gqjx | Delete bucket          | **АКТУАЛЬНО** | Можно выполнить сегодня (30.01).                             |

### ❌ НЕ АКТУАЛЬНЫЕ — закрыть

| ID       | Название                           | Причина закрытия                                             |
| -------- | ---------------------------------- | ------------------------------------------------------------ |
| mc2-4nf3 | orchestrateValidation enhance      | УЖЕ ЕСТЬ: `passed`, `errors[]`, `summary`, `recommendation`  |
| mc2-hg8q | Error boundary в generation-result | Это ZOD SCHEMA, не React компонент. Error boundary не нужен. |

### 🔴 УДАЛИТЬ — неиспользуемый код

| ID       | Название               | Решение                                                 |
| -------- | ---------------------- | ------------------------------------------------------- |
| mc2-orir | Debug webhook endpoint | **УДАЛИТЬ** — N8N не используется, endpoint не нужен    |
| mc2-igf7 | Test generate endpoint | **УДАЛИТЬ** — нигде не вызывается, только файл route.ts |

---

## Детальный анализ

### mc2-80i: URL Filter Persistence

**Файл:** `packages/web/app/[locale]/admin/logs/components/logs-page-client.tsx`

**Текущее состояние:** Фильтры в useState, теряются при обновлении страницы.

**Фильтры для персистенции (8 шт.):**

- `level` — уровень логов (WARNING, ERROR, CRITICAL)
- `source` — тип (error_log, generation_trace)
- `status` — статус (new, in_progress, resolved...)
- `environment` — окружение (dev, stage)
- `search` — текстовый поиск
- `dateFrom`, `dateTo` — даты
- `viewMode` — режим отображения

**Реализация:** useSearchParams + router.push

---

### mc2-kfo: Tiered Testing CI/CD

**Файл:** `.github/workflows/ci-cd.yml`

**Текущее состояние:**

- Один job `test` с `pnpm test`
- `continue-on-error: true` — тесты не блокируют
- CI Success Gate проверяет только type-check + build

**Существующие команды:**

```json
"test:unit": "vitest run tests/unit",
"test:contract": "vitest run tests/contract",
"test:integration": "vitest run tests/integration"
```

**Реализация:** Матрица тестов по веткам

---

### mc2-orir: Debug Webhook (КРИТИЧЕСКАЯ УЯЗВИМОСТЬ)

**Файл:** `packages/web/app/api/debug/webhook/route.ts`

**Проблемы:**

1. ❌ Нет аутентификации
2. ❌ Нет NODE_ENV проверки
3. ❌ Раскрывает: URL вебхуков, конфигурацию, env vars

**Рекомендация:** УДАЛИТЬ или защитить auth + dev-only

---

### mc2-igf7: Test Generate Endpoint

**Файл:** `packages/web/app/api/coursegen/test-generate/route.ts`

**Текущее состояние:**

- ✅ Bearer token auth (Supabase)
- ❌ Нет NODE_ENV guard

**Рекомендация:** Добавить `if (process.env.NODE_ENV === 'production') return 404`

---

## Рекомендуемый порядок работы

### Пул 2: Очистка (СЕЙЧАС)

| #   | ID       | Действие                       | Время |
| --- | -------- | ------------------------------ | ----- |
| 1   | mc2-4nf3 | ЗАКРЫТЬ (уже реализовано)      | 1 мин |
| 2   | mc2-hg8q | ЗАКРЫТЬ (не React компонент)   | 1 мин |
| 3   | mc2-orir | УДАЛИТЬ debug/webhook endpoint | 5 мин |
| 4   | mc2-igf7 | УДАЛИТЬ test-generate endpoint | 5 мин |
| 5   | mc2-gqjx | Удалить Supabase bucket        | 5 мин |

### Пул 3: Улучшения

| #   | ID      | Действие               | Время  |
| --- | ------- | ---------------------- | ------ |
| 6   | mc2-80i | URL filter persistence | 2 часа |
| 7   | mc2-kfo | Tiered Testing CI/CD   | 3 часа |

---

## Файлы для изменения

### mc2-orir: Удалить debug endpoint

```
packages/web/app/api/debug/webhook/route.ts — УДАЛИТЬ файл
packages/web/app/api/debug/ — УДАЛИТЬ директорию если пустая
```

### mc2-igf7: Удалить test endpoint

```
packages/web/app/api/coursegen/test-generate/route.ts — УДАЛИТЬ файл
packages/web/app/api/coursegen/test-generate/ — УДАЛИТЬ директорию
```

### mc2-80i: URL filter persistence

```
packages/web/app/[locale]/admin/logs/components/logs-page-client.tsx
packages/web/app/[locale]/admin/logs/components/filter-bar.tsx
```

### mc2-kfo: Tiered Testing

```
.github/workflows/ci-cd.yml
```

---

## Команды выполнения

### Закрытие неактуальных задач

```bash
bd close mc2-4nf3 --reason="Already implemented: passed, errors[], summary, recommendation fields exist"
bd close mc2-hg8q --reason="Invalid task: generation-result.ts is Zod schema, not React component"
```

### Удаление неиспользуемых endpoints

```bash
# mc2-orir: Удалить debug endpoint (N8N не используется)
rm -rf packages/web/app/api/debug/webhook
rmdir packages/web/app/api/debug 2>/dev/null || true

# mc2-igf7: Удалить test endpoint (нигде не вызывается)
rm -rf packages/web/app/api/coursegen/test-generate

# Коммит
git add -A && git commit -m "security: remove unused debug and test endpoints

- Remove /api/debug/webhook (N8N not used, unprotected)
- Remove /api/coursegen/test-generate (dead code, never called)

Closes: mc2-orir, mc2-igf7"
```

### Удаление bucket

```bash
# Через Supabase Dashboard:
# Storage → course-enrichments → Delete bucket
bd close mc2-gqjx --reason="Bucket deleted via Supabase Dashboard"
```

---

## Верификация

```bash
# Проверка сборки после удаления
pnpm type-check && pnpm build

# После деплоя — проверить 404
curl https://dev.ai.megacampus.ru/api/debug/webhook  # Должен быть 404
curl -X POST https://dev.ai.megacampus.ru/api/coursegen/test-generate  # Должен быть 404
```
