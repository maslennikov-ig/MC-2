# Plan: Jina API Token Balance Monitoring in Admin Panel

## Context

Jina AI — это prepaid-сервис с токенным балансом, который нужно пополнять. Когда баланс заканчивается, embedding/reranking деградирует до fallback-режима. Сейчас единственный способ узнать остаток — зайти в веб-дашборд Jina. Мы хотим отображать баланс прямо в админке, рядом с уже существующей панелью API Keys.

## Проблема

У Jina AI **нет выделенного REST-эндпоинта** для проверки баланса аккаунта. Однако:

- `GET https://r.jina.ai` с `Authorization: Bearer <key>` возвращает текст с информацией о балансе (формат: `[Balance left] NNNNNN`)
- Ответы API также могут содержать usage-данные в заголовках

## Подход

Делаем легковесный запрос к Reader API (`https://r.jina.ai`) без тела, парсим баланс из текстового ответа. Это не тратит значимых токенов (Reader home page — минимальный расход). Отображаем результат в существующей панели API Keys.

## Файлы для изменения

### 1. Backend: новая tRPC-процедура `getJinaBalance`

**Файл:** `packages/course-gen-platform/src/server/routers/pipeline-admin/api-keys.ts`

Добавить новую процедуру `getJinaBalance` (superadminProcedure):

- Получить Jina API key тем же методом, что и `testApiKey` (из DB или env)
- Вызвать `GET https://r.jina.ai` с `Authorization: Bearer <key>` и `Accept: text/plain`
- Распарсить ответ: найти паттерн баланса (regex для `[Balance left] (\d+)` или аналогичного)
- Если парсинг не удался — fallback: вернуть `{ available: false, reason: 'parse_error' }`
- Кеширование: результат кешировать на 5 минут (in-memory, аналогично api-key-service)
- Возвращать: `{ available: true, balance: number, lastChecked: string }` или `{ available: false, reason: string }`

### 2. Frontend: отображение баланса в API Keys Panel

**Файл:** `packages/web/app/[locale]/admin/pipeline/components/api-keys-panel.tsx`

Добавить в секцию Jina API Key (под строкой "Used for embeddings and quality validation"):

- tRPC-запрос к `pipelineAdmin.getJinaBalance` (с `refetchInterval: 300000` — раз в 5 мин)
- Отображение:
  - Баланс > 1M токенов → зеленый badge: `Balance: 5,234,567 tokens`
  - Баланс 100K-1M → желтый badge (warning): `Balance: 456,789 tokens`
  - Баланс < 100K → красный badge (critical): `Balance: 12,345 tokens`
  - Ошибка/недоступно → серый badge: `Balance: unavailable`
- Кнопка "Refresh" для принудительного обновления (invalidate tRPC query)
- Паттерны UI: использовать те же Badge/стили, что уже есть в панели (green/amber/red badges)

### 3. Обработка edge cases

- API key не настроен → не показывать баланс
- Network error → показать "unavailable" с возможностью retry
- Формат ответа изменился → graceful degradation, показать ссылку на Jina Dashboard
- Rate limiting → кеш 5 минут предотвращает частые запросы

## Существующие утилиты для переиспользования

| Что                                                     | Откуда                                         |
| ------------------------------------------------------- | ---------------------------------------------- |
| Получение API key (env/db/decrypt)                      | `api-keys.ts:304-349` (логика из `testApiKey`) |
| `superadminProcedure`                                   | `server/procedures.ts`                         |
| Badge-стили (green/amber/red)                           | `api-keys-panel.tsx:159-175`                   |
| `trpc.pipelineAdmin.*`                                  | `lib/trpc/react`                               |
| `invalidateApiKeyCache`, `decryptApiKey`, `isEncrypted` | `shared/services/api-key-service`              |

## Верификация

1. `pnpm --filter course-gen-platform type-check` — без ошибок типов
2. `pnpm --filter web type-check` — без ошибок типов
3. `pnpm build` — билд проходит
4. Ручная проверка: открыть Admin → Pipeline → Settings → API Keys → увидеть баланс Jina
5. Проверить edge cases: отключить API key, проверить что показывает "unavailable"
