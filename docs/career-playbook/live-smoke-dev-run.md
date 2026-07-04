# Career Playbook — live smoke (dev) run helper

Runbook для эмпирической проверки shipped-фиксов (критерий #1) на реальной генерации в dev.
Фикстуры уже подставлены под аккаунт `maslennikov.ig@gmail.com`. Секрет — только токен, вставляется в рантайме.

## Шаг 1. Получить bearer-токен (JWT)

Приложение (Next.js/SSR) хранит сессию Supabase в cookie, а НЕ в Local Storage.
Основной путь **без пароля** — вытащить `access_token` из cookie через консоль браузера.

### Вариант A (основной, без пароля) — браузерная консоль

1. Залогиниться на https://dev.ai.megacampus.ru своим аккаунтом.
2. DevTools (F12) → вкладка **Console**.
3. Вставить сниппет — он собирает cookie `sb-<ref>-auth-token` (может быть разбита на
   `.0`/`.1`), снимает префикс `base64-`, декодирует base64url и достаёт `access_token`:

```js
(() => {
  const ref = 'diqooqbuchsliypgwksu';
  const parts = document.cookie
    .split('; ')
    .filter(c => c.startsWith(`sb-${ref}-auth-token`))
    .sort() // .0 перед .1
    .map(c => c.slice(c.indexOf('=') + 1));
  let raw = decodeURIComponent(parts.join(''));
  if (raw.startsWith('base64-')) {
    raw = atob(raw.slice('base64-'.length).replace(/-/g, '+').replace(/_/g, '/'));
  }
  const token = JSON.parse(raw).access_token;
  console.log(token);
  return token;
})();
```

Если консоль вернула пустую строку — cookie помечена **HttpOnly** и в `document.cookie` не видна:
открой Application → **Cookies** → `https://dev.ai.megacampus.ru` → `sb-diqooqbuchsliypgwksu-auth-token`,
скопируй значение (склей `.0`/`.1`), убери префикс `base64-` и раскодируй как base64url → JSON, поле `access_token`.

### Вариант B — Network (заголовок Authorization)

1. DevTools (F12) → вкладка **Network** → в фильтре набрать `trpc`.
2. Обновить страницу (F5) или открыть библиотеку Career Playbook, чтобы полетели запросы.
3. Кликнуть любой запрос на `…/api/trpc/…` → **Headers** → **Request Headers**.
4. Найти `authorization: Bearer eyJ…` и скопировать всё **после `Bearer `** — это токен.

### Вариант C (командой, по паролю)

Логин прямо в Supabase Auth по email+паролю → свежий `access_token` в env.
Пароль вводится скрыто (`read -s`), в историю не попадает. Требует `jq` и наличие пароля у аккаунта
(если вход только через Google — см. примечание ниже).

```bash
read -s -p "Supabase password for maslennikov.ig@gmail.com: " SB_PW; echo
```

```bash
export CAREER_PLAYBOOK_SMOKE_TOKEN=$(curl -s "https://diqooqbuchsliypgwksu.supabase.co/auth/v1/token?grant_type=password" -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpcW9vcWJ1Y2hzbGl5cGd3a3N1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5OTczNTIsImV4cCI6MjA3NTU3MzM1Mn0.NgS0kl5nL0HR5S3RJw1TeGQNaZy3xmhzmrBLcdBAn3w" -H "Content-Type: application/json" -d "{\"email\":\"maslennikov.ig@gmail.com\",\"password\":\"$SB_PW\"}" | jq -r .access_token); unset SB_PW
```

```bash
echo "token length: ${#CAREER_PLAYBOOK_SMOKE_TOKEN}"
```

Длина ~600–1200 → ок, переходи к Шагу 2 (trpc-url/user-id/org-id/queue) и Шагу 4.
Если длина маленькая (`null`) — посмотри сырой ответ (покажет причину):

```bash
read -s -p "Supabase password: " SB_PW; echo; curl -s "https://diqooqbuchsliypgwksu.supabase.co/auth/v1/token?grant_type=password" -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpcW9vcWJ1Y2hzbGl5cGd3a3N1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5OTczNTIsImV4cCI6MjA3NTU3MzM1Mn0.NgS0kl5nL0HR5S3RJw1TeGQNaZy3xmhzmrBLcdBAn3w" -H "Content-Type: application/json" -d "{\"email\":\"maslennikov.ig@gmail.com\",\"password\":\"$SB_PW\"}"; unset SB_PW
```

Примечание: если аккаунт заведён только через Google (без пароля), password-grant вернёт
`invalid_grant` / `Invalid login credentials` — тогда либо задай пароль через «Забыли пароль?»,
либо возьми токен из Network (Вариант A выше).

## Шаг 2. Экспортировать окружение

Вставь блок целиком, заменив только `ТВОЙ_РЕАЛЬНЫЙ_JWT` в первой строке:

```bash
export CAREER_PLAYBOOK_SMOKE_TOKEN='ТВОЙ_РЕАЛЬНЫЙ_JWT'
export CAREER_PLAYBOOK_SMOKE_TRPC_URL='https://dev.ai.megacampus.ru/api/trpc'
export CAREER_PLAYBOOK_SMOKE_USER_ID='ca704da8-5522-4a39-9691-23f36b85d0ce'
export CAREER_PLAYBOOK_SMOKE_ORGANIZATION_ID='9b98a7d5-27ea-4441-81dc-de79d488e5db'
export BULLMQ_QUEUE_NAME='course-generation-dev'
```

Проверка, что токен подставился (печатает только длину, не сам токен):

```bash
echo "token length: ${#CAREER_PLAYBOOK_SMOKE_TOKEN}"
```

Длина ~600–1200 — ок. Длина 15 — значит остался плейсхолдер, вернись к Шагу 1.

## Шаг 3. (Опционально) Сухой прогон — без мутаций, трат и токена

```bash
pnpm --dir packages/course-gen-platform smoke:career-playbook:live --mode plan --target dev
```

Статус `blocked` в plan-режиме — это норма, он лишь перечисляет требуемые гейты.

## Шаг 4. Реальный прогон (mutation-smoke)

Одной строкой (раннер сам подхватит token/trpc-url/user-id/org-id/queue из env):

```bash
pnpm --dir packages/course-gen-platform smoke:career-playbook:live --mode mutation-smoke --target dev --confirm-live-mutation --cleanup-scope playbook-only --max-cost-usd 5 --poll-timeout-ms 7200000 --json
```

Что произойдёт / безопасность:

- Создаётся ОДИН новый playbook под аккаунтом, генерируется (реальные LLM-траты, потолок **$5**), снимаются evidence.
- Существующие playbook'и аккаунта не трогаются; курс не создаётся (нет `--include-course-bridge`).
- Поллинг до 120 мин (совпадает с TTL-cap). `--json` даёт машинный отчёт со статусом `pass` / `warn` / `blocked` / `fail`.
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
- `language = 'ru'`, без wrong-language и без `{{…}}`-плейсхолдеров в `final_markdown`
- длительность `< 120 мин` (TTL-cap `mc2-db696.62`/P1)

На этих реальных данных переоценивается `mc2-db696.61` (нужен ли source-evidence override ~24–32k для генератора follow-up-вопросов).
