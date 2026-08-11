# Career Playbook — live smoke (dev) run helper

Runbook для эмпирической проверки shipped-фиксов (критерий #1) на реальной генерации в dev.
Никаких значений, привязанных к конкретному аккаунту, здесь нет: `user_id` и `organization_id`
берутся из claims твоего же JWT (сниппет ниже печатает их вместе с токеном), ключи/URL — из
`packages/course-gen-platform/.env`. Секрет — только токен, вставляется в рантайме.

## Шаг 1. Получить bearer-токен (JWT)

Приложение (Next.js/SSR) хранит сессию Supabase в cookie, а НЕ в Local Storage.
Основной путь **без пароля** — вытащить `access_token` из cookie через консоль браузера.

### Вариант A (основной, без пароля) — браузерная консоль

1. Залогиниться на https://dev.ai.megacampus.ru своим аккаунтом.
2. DevTools (F12) → вкладка **Console**.
3. Вставить сниппет — он сам находит cookie `sb-*-auth-token` (без хардкода project-ref; cookie
   может быть разбита на `.0`/`.1`), снимает префикс `base64-`, декодирует base64url и печатает
   токен вместе с `user_id`/`organization_id` из его claims (они нужны на Шаге 2):

```js
(() => {
  const parts = document.cookie
    .split('; ')
    .filter(c => /^sb-.*-auth-token/.test(c))
    .sort() // .0 перед .1
    .map(c => c.slice(c.indexOf('=') + 1));
  let raw = decodeURIComponent(parts.join(''));
  if (raw.startsWith('base64-')) {
    raw = atob(raw.slice('base64-'.length).replace(/-/g, '+').replace(/_/g, '/'));
  }
  const token = JSON.parse(raw).access_token;
  const claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  console.log({ token, userId: claims.user_id, organizationId: claims.organization_id });
  return token;
})();
```

Если консоль вернула пустую строку — cookie помечена **HttpOnly** и в `document.cookie` не видна:
открой Application → **Cookies** → домен dev → cookie `sb-<ref>-auth-token`,
скопируй значение (склей `.0`/`.1`), убери префикс `base64-` и раскодируй как base64url → JSON, поле `access_token`.

### Вариант B — Network (заголовок Authorization)

1. DevTools (F12) → вкладка **Network** → в фильтре набрать `trpc`.
2. Обновить страницу (F5) или открыть библиотеку Career Playbook, чтобы полетели запросы.
3. Кликнуть любой запрос на `…/api/trpc/…` → **Headers** → **Request Headers**.
4. Найти `authorization: Bearer eyJ…` и скопировать всё **после `Bearer `** — это токен.

### Вариант C (командой, по паролю)

Логин прямо в Supabase Auth по email+паролю → свежий `access_token` в env.
Пароль вводится скрыто (`read -s`), в историю не попадает. Требует `jq` и наличие пароля у аккаунта
(если вход только через Google — см. примечание ниже). URL и anon-ключ не хранятся в этом документе —
они берутся из `packages/course-gen-platform/.env` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`).

```bash
export SUPABASE_URL=$(grep -m1 '^SUPABASE_URL=' packages/course-gen-platform/.env | cut -d= -f2-)
export SUPABASE_ANON_KEY=$(grep -m1 '^SUPABASE_ANON_KEY=' packages/course-gen-platform/.env | cut -d= -f2-)
read -p "Supabase email: " SB_EMAIL; read -s -p "Supabase password: " SB_PW; echo
```

```bash
SB_SESSION_JSON=$(curl -s "$SUPABASE_URL/auth/v1/token?grant_type=password" -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" -d "{\"email\":\"$SB_EMAIL\",\"password\":\"$SB_PW\"}")
export CAREER_PLAYBOOK_SMOKE_TOKEN=$(jq -r .access_token <<<"$SB_SESSION_JSON")
export CAREER_PLAYBOOK_SMOKE_REFRESH_TOKEN=$(jq -r .refresh_token <<<"$SB_SESSION_JSON")
unset SB_PW SB_SESSION_JSON
```

```bash
echo "token length: ${#CAREER_PLAYBOOK_SMOKE_TOKEN}"
echo "refresh token configured: $([[ -n \"$CAREER_PLAYBOOK_SMOKE_REFRESH_TOKEN\" ]] && echo yes || echo no)"
```

Длина ~600–1200 → ок, переходи к Шагу 2 (trpc-url/user-id/org-id/queue) и Шагу 4.
Если длина маленькая (`null`) — убери `| jq -r .access_token` из команды и посмотри сырой ответ (покажет причину).

Примечание: если аккаунт заведён только через Google (без пароля), password-grant вернёт
`invalid_grant` / `Invalid login credentials` — тогда либо задай пароль через «Забыли пароль?»,
либо возьми токен из Network (Вариант A выше).

## Шаг 2. Экспортировать окружение

`USER_ID` и `ORGANIZATION_ID` — это claims `user_id` и `organization_id` твоего JWT: сниппет из
Варианта A печатает их сразу; для токена из Варианта B/C раскодируй payload
(`echo "$TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | jq '{user_id, organization_id}'`).
Раннер проверяет их строгим сравнением как гейт «одноразовый пользователь тот, что ожидался».

Вставь блок, заменив три плейсхолдера:

```bash
export CAREER_PLAYBOOK_SMOKE_TOKEN='ТВОЙ_РЕАЛЬНЫЙ_JWT'
export CAREER_PLAYBOOK_SMOKE_TRPC_URL='https://dev.ai.megacampus.ru/api/trpc'
export CAREER_PLAYBOOK_SMOKE_USER_ID='<user_id из claims>'
export CAREER_PLAYBOOK_SMOKE_ORGANIZATION_ID='<organization_id из claims>'
export BULLMQ_QUEUE_NAME='course-generation-dev'
```

Проверка, что токен подставился (печатает только длину, не сам токен):

```bash
echo "token length: ${#CAREER_PLAYBOOK_SMOKE_TOKEN}"
```

Длина ~600–1200 — ок. Длина 15 — значит остался плейсхолдер, вернись к Шагу 1.

## Шаг 3. (Опционально) Сухой прогон — без мутаций, трат и токена

```bash
pnpm --dir "$(git rev-parse --show-toplevel)/packages/course-gen-platform" smoke:career-playbook:live --mode plan --target dev
```

Статус `blocked` в plan-режиме — это норма, он лишь перечисляет требуемые гейты.

## Шаг 4. Реальный прогон (mutation-smoke)

Одной строкой (раннер сам подхватит token/trpc-url/user-id/org-id/queue из env):

```bash
pnpm --dir "$(git rev-parse --show-toplevel)/packages/course-gen-platform" smoke:career-playbook:live --mode mutation-smoke --target dev --confirm-live-mutation --cleanup-scope playbook-only --max-cost-usd 1 --poll-timeout-ms 7200000 --json
```

Что произойдёт / безопасность:

- Создаётся ОДИН новый playbook под аккаунтом, генерируется (реальные LLM-траты; `--max-cost-usd 1` — аварийный потолок, ~4x от наблюдаемой стоимости $0.08–0.13 за прогон), снимаются evidence.
- `--dir` задан абсолютным путём через `git rev-parse` — относительный путь ломается, если шелл не в корне репо.
- Существующие playbook'и аккаунта не трогаются; курс не создаётся (нет `--include-course-bridge`).
- Поллинг до 120 мин (совпадает с TTL-cap). `--json` даёт машинный отчёт со статусом `pass` / `warn` / `blocked` / `fail`.
- Если задан `CAREER_PLAYBOOK_SMOKE_REFRESH_TOKEN`, раннер при первом HTTP 401 один раз обновляет
  Supabase-сессию и повторяет запрос. Новый access/refresh token остаётся только в памяти процесса.
- **Cleanup ничего не удаляет — только описывает** (см. раздел «Cleanup-семантика» ниже).

## Артефакты прогона (A/B-сравнимость)

После снятия evidence раннер сохраняет то, что он проверял — на **pass И на fail** (для диагностики) —
в gitignore-каталог `packages/course-gen-platform/artifacts/career-playbook-smoke/`:

- `<timestamp>-<playbookId>.md` — полный `final_markdown` сгенерированного playbook (тело для A/B-сравнения качества).
- `<timestamp>-<playbookId>.json` — метаданные: `playbookId`, `timings` (длительность прогона, poll-настройки, DB `created_at`/`completed_at`), `costBreakdown` + `costSource`, результаты evidence-проверок, `cleanupManifest`, `finalMarkdownSource`.

Пути печатаются в отчёте раннера (в `--json` — поле `artifacts`; в текстовом выводе — блок `Artifacts:`).

Источники данных:

- `final_markdown` — сначала из tRPC `library.get` (то, что реально рендерит UI), при недоступности клиента — из строки БД `career_playbooks`.
- `cost_breakdown` — **только** из строки БД `career_playbooks` (ни один tRPC-эндпоинт его не отдаёт); нужен Supabase-admin env (`SUPABASE_URL` + `SUPABASE_SERVICE_KEY`). Если его нет или чтение упало — `costSource: "unavailable"`, `costBreakdown: null`, но остальной артефакт всё равно пишется.

Секреты (bearer-токен, service-key, `process.env`) в артефакты **не** попадают — сериализуются только whitelisted-поля.

Отключить запись: `--no-artifact`. Сменить каталог: `--artifact-dir <path>`. Каталог в `.gitignore`
(`packages/course-gen-platform/artifacts/`), поэтому артефакты локальные — при необходимости приложи `.md`/`.json`
к бид-комментарию вручную.

## Cleanup-семантика (важно)

`--cleanup-scope playbook-only|playbook-and-course` **не удаляет ничего автоматически**. Раннер лишь строит
и печатает **манифест** (`cleanupManifest`, `mutates: false`) — список точных id (playbook, bullmq-job, share; при
`playbook-and-course` — курс/документы/upload-пути) с пометками «удалять по точному id». Строка playbook
после прогона **остаётся** в БД (так было с run `b866d2f5`; старые заметки, где это читалось как «self-delete», неверны).

Это сделано намеренно: теперь, когда контент persist-ится в артефакт, оставшаяся строка — это A/B-baseline,
который удобно поднять снова; авто-удаление стирало бы именно её. Удаление — **ручной шаг по точному id**
(например, `careerPlaybook.library.delete` через tRPC или SQL по `id` из манифеста) после того, как артефакт снят.

## Шаг 5. После прогона — проверка критерия #1

Прислать вывод (`status`, `total_cost_usd`, длительность). Ожидается на новой строке в `career_playbooks`
(shared Supabase `diqooqbuchsliypgwksu`):

- `cost_breakdown->>'total_cost_usd' > 0` (теперь включая стоимость follow-up — фикс `mc2-t5auh`)
- `language` соответствует QA-фикстуре раннера (текущая smoke-фикстура англоязычная → `en`; детерминированная проверка ловит wrong-language-вкрапления относительно неё), без `{{…}}`-плейсхолдеров в `final_markdown`
- длительность `< 120 мин` (TTL-cap `mc2-db696.62`/P1)

На этих реальных данных переоценивается `mc2-db696.61` (нужен ли source-evidence override ~24–32k для генератора follow-up-вопросов).

## Нагрузочный прогон: ровно 10 генераций

Команда `smoke:career-playbook:load` переиспользует тот же single-smoke и по умолчанию работает в
неизменяющем `plan`-режиме. Она не запускает частичную нагрузку: live-режим разрешается только для
ровно десяти генераций и только если одновременно заданы:

- JWT одноразового пользователя и ожидаемые `user_id`/`organization_id`;
- refresh token той же одноразовой сессии плюс `SUPABASE_URL`/`SUPABASE_ANON_KEY`: десять
  параллельных генераций могут идти дольше часового TTL access token;
- URL локального API, запущенного с тем же уникальным `BULLMQ_QUEUE_NAME`, что и отдельный worker;
- точная область очистки;
- потолок на один прогон и общий потолок не меньше `10 × потолок одного прогона`;
- явный `--confirm-live-mutation`.

Безопасная проверка плана, без Redis/API/LLM:

```bash
pnpm --dir packages/course-gen-platform smoke:career-playbook:load --mode plan --target dev --count 10 --queue-name career-playbook-load-YYYYMMDD --json
```

Live-шаблон намеренно не содержит секретов:

```bash
export CAREER_PLAYBOOK_SMOKE_TOKEN='<JWT только в текущем shell>'
export CAREER_PLAYBOOK_SMOKE_REFRESH_TOKEN='<refresh_token только в текущем shell>'
export CAREER_PLAYBOOK_SMOKE_USER_ID='<одноразовый user_id>'
export CAREER_PLAYBOOK_SMOKE_ORGANIZATION_ID='<одноразовый organization_id>'
export CAREER_PLAYBOOK_SMOKE_TRPC_URL='http://127.0.0.1:<порт>/trpc'
export BULLMQ_QUEUE_NAME='career-playbook-load-YYYYMMDD'

pnpm --dir packages/course-gen-platform smoke:career-playbook:load \
  --mode mutation-load --target dev --count 10 \
  --cleanup-scope playbook-only \
  --max-cost-usd-per-run '<согласованный потолок одного прогона>' \
  --max-total-cost-usd '<согласованный общий потолок>' \
  --confirm-live-mutation --json
```

До команды API и worker должны быть запущены отдельно с одним и тем же уникальным именем очереди.
Runner снимает состояния очереди до/после, стартует десять промисов до ожидания первого результата,
сохраняет артефакт и точный cleanup-манифест каждого прогона и возвращает `fail`, если хотя бы один
прогон не прошёл либо после пакета остались `active`/`waiting` jobs. Он не удаляет данные автоматически:
после сохранения evidence оператор удаляет только точные ID из десяти манифестов и отдельно проверяет
нулевой остаток перед закрытием задачи.

Refresh token не передаётся аргументом командной строки и не попадает в отчёт. Динамический заголовок
tRPC читает текущий access token для каждого HTTP-запроса; параллельные 401 используют один общий
refresh-запрос, после чего каждая операция повторяется не более одного раза.
