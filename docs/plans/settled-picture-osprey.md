# План: закрыть последнее место, где цена выдумывается, и вернуть закреплённый снимок

Дата: 2026-08-21. Ветка: `develop`. Исполнитель: новая сессия Claude Code (Opus 5).

Продолжает `docs/plans/steady-routing-heron.md`, разделы A–F которого доставлены
(`fe8f40b54`, `0664c7b07`, `37ecd2047`). Раздел **G того плана не сделан** и переезжает сюда.

## Контекст

21 августа платный прогон впервые сошёлся арифметикой, а не расследованием:

|                                      |               |
| ------------------------------------ | ------------- |
| OpenRouter, дельта `/api/v1/credits` | **$0.165079** |
| `pnpm cost:report --since` TOTAL     | **$0.119999** |
| Остаток                              | **$0.045080** |

Тридцать вызовов, **все тридцать** с фактической ценой от `/api/v1/generation`,
`unknown_cost_attempts` 0. В логе за окно ровно тридцать строк
`Career Playbook LLM call succeeded` и ровно один другой платный вызов. Значит остаток —
не разрыв, а один названный вызов: обложка плейбука.

Отсюда весь этот план. Осталось ровно одно место, где цена по-прежнему выдумывается, —
картинки. И осталась невыполненной первопричина падений — плавающий алиас.

## Что выяснилось про картинки

Формулировка «цена картинки — константа» неточна. Настоящая картина:

1. **Обе image-модели ЕСТЬ в `MODEL_CATALOG`** — `google/gemini-2.5-flash-image` и
   `openai/gpt-5-image-mini`, с флагом `billedPerImage: true`.
2. **Но каталог их не ценит.** Там лежат _токенные_ ставки, а комментарий у самого флага
   (`packages/shared-types/src/model-catalog.ts:58`) говорит прямо: _«Billed per generated
   image upstream. Token-based cost maths is structurally wrong for these and only
   approximates the real charge.»_
3. **Цена берётся из второй таблицы.**
   `src/stages/stage7-enrichments/services/image-generation-service.ts:26`:

   ```ts
   const MODEL_COSTS: Record<string, number> = {
     'google/gemini-2.5-flash-image': 0.038,
     'openai/gpt-5-image-mini': 0.007,
     'openai/gpt-5-image': 0.04,
   };
   const DEFAULT_COST_USD = 0.04;
   ```

   Это ровно то, что запрещает шапка `src/shared/metrics/llm-cost.ts`: _«a second price
   table in this repository would drift from the routing configuration»_. Она и разошлась.

4. **У OpenRouter есть настоящая ставка, и её не читает никто.** `/api/v1/models` отдаёт
   `image_output`: `gpt-5-image-mini` 0.000008, `gemini-2.5-flash-image` 0.00003,
   `gpt-5-image` 0.00004 — за токен изображения.
5. **Замер.** Одна карточка `gpt-5-image-mini`, 1:1, 1024×1024, 48851 мс: записано **$0.007**,
   реально списано **$0.045080** (выведено вычитанием, и вычитание надёжно — за окно был
   ровно один другой платный вызов). Занижение в **6.4 раза**.
6. **Это касается и курсов.** Обложки и карточки курсов доходят до `generation_trace`
   (у них есть `course_id`), но с той же неверной ценой. Из базы:
   `step_name='image_call'`, `phase='stage_7_card'`, `model='openai/gpt-5-image-mini'`,
   `cost_usd=0.007000` — 2026-08-20 17:54:01 и 2026-08-17 07:04:30.
7. **Обложка плейбука не доходит вообще.** `recordImageCallCost` требует `courseId`, а у
   плейбука курса нет, и в логе дословно:
   `[Cost] Image generated without a course context; its cost is not attributed`.
   Джоба `career-playbook-image-<id>` к тому же отрабатывает уже **после** записи строки
   плейбука, так что в `cost_breakdown` она не попала бы и при наличии контекста.

### Почему это не починилось само вместе с остальным

Клиент OpenRouter строится в **четырёх** местах, и только два инструментированы:

| Место                                                                    | Инструментирован |
| ------------------------------------------------------------------------ | ---------------- |
| `src/shared/llm/client.ts:274` (общий `LLMClient`)                       | да               |
| `src/shared/llm/langchain-models.ts` (`ChatOpenAI`)                      | да               |
| `src/stages/stage7-enrichments/services/image-generation-service.ts:184` | **нет**          |
| `src/shared/intent/classifier.ts:206`                                    | **нет**          |

Неинструментированный клиент не видит заголовок `x-generation-id`, а значит не может
дозапросить `/api/v1/generation`. Для него цена навсегда остаётся оценкой. Классификатор
намерений вдобавок читает ключ из `process.env.OPENROUTER_API_KEY` мимо `api-key-service`,
обходя резолв «база → env».

Отдельно: `src/stages/stage7-enrichments/handlers/audio-handler.ts:53` строит
`new OpenAI({ apiKey: process.env.OPENAI_API_KEY })` **без `baseURL`**, то есть ходит на
`api.openai.com` и оплачивается с другого счёта. Дельта `/api/v1/credits` этих денег не
видит в принципе.

## Решения владельца, которые продолжают действовать

Приняты 2026-08-20/21, менять без нового решения нельзя:

- **Постоянного списка игнорируемых провайдеров нет.** Провайдер игнорируется только внутри
  текущей цепочки попыток; следующий вызов снова идёт к самому дешёвому.
- **Дешевизна — приоритет.** `max_price` — потолок, а не разрешение потратить больше.
  Никакого `sort: throughput`.
- **Долгое ожидание не проблема**, проблема — когда вызов не получается вовсе.
- Работа идёт **сразу в `develop` через `/push-dev`**.

## Что делаем

### A. Один транспорт для всех клиентов OpenRouter — `mc2-l17v5`

**Делается первым: блокирует B и C.**

- Завести одну фабрику (например `createOpenRouterClient` в `src/shared/llm/`), которая
  ставит `baseURL`, ключ через `getOpenRouterApiKey()` и
  `fetch: instrumentFetchWithGenerationId()`.
- Перевести на неё `image-generation-service.ts:184` и `intent/classifier.ts:206`.
- Убедиться, что вызов обёрнут в `withGenerationIdCapture`, иначе слот не заполнится —
  захват идёт через `AsyncLocalStorage`, а не через возвращаемое значение.

Проверка: у вызова генерации картинки в логе виден `generationId`, и по нему
`/api/v1/generation` отдаёт `usage`.

### B. Цена картинки становится фактом — `mc2-5mhlb`

- Брать цену из `/api/v1/generation` тем же механизмом, что и токенные вызовы.
- **Удалить `MODEL_COSTS`.** Второй таблицы цен в этом репозитории быть не должно; это
  правило записано в шапке `llm-cost.ts` и было нарушено.
- Пока факт не пришёл — оценка. Откуда её брать, решить по замеру: у обеих моделей в
  `/api/v1/models` есть `image_output` за токен изображения, и это ближе к правде, чем
  одно число на модель. Если поле окажется неудобным, оставить константу, но **исправленную
  замером**, а не унаследованную.
- Не забыть, что `DEFAULT_COST_USD = 0.04` — это ещё и цена для незнакомой модели.

Проверка: карточка курса в `generation_trace` несёт цену провайдера, а не 0.007.

### C. Обложка плейбука попадает в учёт — `mc2-j9pmq`

- Писать расход обложки в `career_playbooks.cost_breakdown` отдельным `nodeCost`
  (например `node='cardImage'`, `outcome='succeeded'`), потому что `generation_trace.course_id`
  ссылается на `courses`, а плейбук не курс.
- Учесть порядок: джоба картинки заканчивается **после** записи строки плейбука, так что
  писать надо из самой джобы, дописывая в уже существующий `cost_breakdown`, а не
  перезаписывая его. Образец слияния уже есть — `mergeFailureCostBreakdown` в
  `src/orchestrator/handlers/career-playbook-handler.ts`.
- `pnpm cost:report --since` уже читает `career_playbooks.cost_breakdown`, так что после
  этого обложка попадёт в TOTAL сама.

Проверка: прогон плейбука, `cost:report --since T0` — TOTAL сходится с дельтой
`/api/v1/credits` **без остатка**.

### D. Гейт против пятого клиента — `mc2-z7ryi`

- Тест рядом с `tests/unit/shared/metrics/no-anonymous-spend.test.ts` и
  `every-spend-has-one-ledger.test.ts`: просканировать `src` на `new OpenAI(` и на литерал
  `openrouter.ai/api/v1`, потребовать, чтобы каждое вхождение было либо в общей фабрике,
  либо в явном списке исключений с причиной.
- **Форма важна.** Гейты этого репозитория grandfather-ят существующее и валят только новое
  (правило в `CLAUDE.md`). Сделать так же: список может сокращаться, но не расти молча.

### E. Плавающий алиас → закреплённый снимок — `mc2-qch4w` (раздел G прошлого плана)

Первопричина падений 12–20 августа, **P0, до сих пор открыта**.

- Заменить `~deepseek/deepseek-v4-flash-latest` на закреплённый снимок во всех конфигах и в
  `src/config/config-seed.json` — и в `llm_model_config`, иначе разъедется.
- Какой именно снимок — решать **по замеру цены и латентности**, а не по дате.
  Это правка ради предсказуемости, не ради скорости: на лучшем маршруте deepseek всё равно
  даёт 40–60 с против 22–24 с у luna.
- Поправить нормализацию в `packages/shared-types/src/model-catalog.ts` (ветка
  «Priced from the base model»), если после пина она перестанет срабатывать.
- Учесть, что `deepseek/deepseek-v4-flash` в каталоге стоит 0.14/0.28, а живой базовый тариф
  на 2026-08-21 — 0.0826/0.1652. Пин без правки цены даст новую неверную оценку —
  см. `mc2-hc91g`.
- Смежное: `mc2-hjj8a` — замерить deepseek на реальных формах и решить, где он вообще уместен.

### F. Каталог перестаёт расходиться молча — `mc2-hc91g`

- `tests/unit/model-catalog-coverage.test.ts` — рукописный снимок, сверяется с живыми
  тарифами только когда кто-то вручную их перечитает. За неделю разошлись четыре записи,
  причём в разные стороны, из-за чего разрыв с инвойсом выглядел меньше своих причин.
- Сделать отдельный скрипт-дрейфгейт против `/api/v1/models` в духе
  `scripts/check-migration-drift.ts` и `scripts/check-config-seed-drift.ts`. Офлайн-тест
  оставить как есть.
- Расхождения, замеренные 2026-08-21 и **не** исправленные (план их не называл):
  `deepseek/deepseek-v4-flash` 0.14/0.28 против живых 0.0826/0.1652;
  `z-ai/glm-5.2:batch` 0.7/2.2 против 1.4/4.4; `minimax/minimax-m3:batch` 0.15/0.6 против 0.3/1.2.
  У последних двух комментарий утверждает «половина базового тарифа» — для luna это
  подтвердилось, для них нет.

### G. Мелочь, которая портит каждую сверку — `mc2-9nf9q`

`courses.estimated_cost_usd` имеет 4 знака, сумма по трассе — 6, поэтому строка
`match` / `MISMATCH` в отчёте всегда врёт про MISMATCH.

### H. Назвать границу аудио — `mc2-dgw4u`

Stage 7 audio платит с отдельного счёта OpenAI. Это не обязательно баг, но сейчас это
молчаливое допущение, и любой вывод «отчёт сошёлся с инвойсом, значит учтено всё» неверен.
Минимум — назвать границу в `docs/runbooks/cost-ledger-paid-run.md` и в разделе
`Cost accounting` в `.codex/handoff.md`. **Вопрос владельцу:** держим аудио на прямом
OpenAI осознанно?

## Что мы сознательно не делаем

- **Не заводим постоянный список плохих провайдеров** — решение владельца.
- **Не гонимся за скоростью.** `sort: throughput` проверен и не помог,
  `preferred_min_throughput` только удорожает.
- **Не переводим всё на luna.**

## Долг проверки, унаследованный от прошлого плана

**Игнор провайдера в пределах цепочки не проверен вживую.** Прогон 21 августа прошёл без
единой неудачной попытки, поэтому путь ни разу не сработал в бою. Держится юнит-тестами
(`tests/unit/shared/llm/provider-ignore-is-per-call.test.ts`) и ручным замером 20 августа:
205 с на OpenInference со статусом `-2`, 58.7 с на Sail Research с его исключением.
Если в следующем прогоне будет неудачная попытка — искать в логе `routes around it` и
приложить строку к приёмке. Если неудачных попыток не будет, так и сказать: строка не
доказана, а не «доказана».

## Ловушки, проверенные замером — не переоткрывать

- **Запись `/api/v1/generation` становится читаемой через ~9.6 с.** Один ранний чтение
  возвращает `null` и выглядит как работающая фича: первая версия ждала 1.5 с и записала
  ноль фактических цен на прогоне из 33 узлов, отчитавшись об успехе. Дозапрос **опрашивает**
  до 30 с. Тестировать против мока, который сначала отдаёт 404, а не отвечает сразу.
- **Не ждать факт на каждый вызов.** ~10 с × N узлов — это минуты на прогон. Носить
  `generation_id` в строке и собрать все чеки одним параллельным проходом на записи;
  образец — `settleCareerPlaybookNodeCosts`.
- **`provider.max_price` ниже всех эндпоинтов — это ОТКАЗ**, а не более дешёвый маршрут:
  `No endpoints found that satisfy the max price for this request`. Одна неверная цена в
  каталоге способна уронить все вызовы модели, поэтому потолок уступает, а генерация живёт.
- **`provider.ignore` принимает и display name, и слаг, и наивный lowercase.** Шлём
  документированный слаг (`/api/v1/providers`; `OpenInference` → `open-inference`, из
  lowercase не выводится), но откат на display name безопасен.
- **Реальный ноль — это измерение.** `?? `, а не `||`; `== null`, а не falsy.
- **lint-staged переписывает файлы на коммите.** После коммита перепроверить тесты,
  утверждающие текст.
- **Бюджет предупреждений линтера `--max-warnings=95` уже выбран ровно.** Любое новое
  предупреждение валит CI, а с ним и деплой. Файл длиннее 500 «кодовых» строк
  (`skipComments: true`) — это предупреждение.

## Приёмка

Отвечать построчно, называя, что именно не прошло.

1. Плейбук и курс доходят до конца.
2. `pnpm cost:report --since <T0>` TOTAL сходится с дельтой `/api/v1/credits` за то же окно
   **без остатка**, либо остаток назван поимённо и объяснён.
3. `billed calls with NO price` = 0; `priced by the provider` близко к числу платных вызовов.
4. Обложка курса в `generation_trace` и обложка плейбука в `cost_breakdown` несут цену
   провайдера, а не 0.007.
5. Ни один вызов не обслужен провайдером дороже потолка.
6. В конфигах и в `llm_model_config` нет `~`-алиасов.
7. `pnpm type-check`, `pnpm lint`, `pnpm build` и юнит-тесты зелёные; CI дошёл до
   `Deploy to Dev` со статусом success (проверять вывод самой джобы, не прогона).

Повторный платный прогон по `docs/runbooks/cost-ledger-paid-run.md` — часть приёмки.
**Спросить разрешение перед тратой.**

## Задачи

| bd          | Раздел | Что                                                              |
| ----------- | ------ | ---------------------------------------------------------------- |
| `mc2-l17v5` | A      | Один инструментированный транспорт для всех клиентов OpenRouter  |
| `mc2-5mhlb` | B      | Цена картинок мимо каталога, занижена в ~6 раз                   |
| `mc2-j9pmq` | C      | Обложка плейбука не попадает ни в один учёт                      |
| `mc2-z7ryi` | D      | Гейт против клиента в обход фабрики                              |
| `mc2-qch4w` | E      | ROOT CAUSE: плавающий алиас вместо закреплённого снимка (**P0**) |
| `mc2-hc91g` | F      | Каталог расходится с живыми тарифами молча                       |
| `mc2-9nf9q` | G      | `estimated_cost_usd` 4 знака → вечный MISMATCH                   |
| `mc2-dgw4u` | H      | Аудио на отдельном счёте OpenAI, вне всякой сверки               |
| `mc2-hjj8a` | E      | Замерить deepseek на реальных формах                             |

`mc2-l17v5` блокирует `mc2-5mhlb`, `mc2-j9pmq` и `mc2-z7ryi` — это видно в `bd ready`.

## Порядок

A первым и один раз. Дальше два потока, по файлам не пересекающиеся: **картинки** (B, C, D)
и **маршрутизация** (E, F). G и H — мелочь, брать под конец или между делом.

## Стартовый промпт для следующей сессии

Проверен `orch-prompts prompt-check --kind handoff --runtime claude --profile opus-5`: **pass**,
с предупреждением о размере (1756 символов против цели 1500). Резать дальше пришлось бы за счёт
решений владельца или списка ловушек, а они здесь несущие: без первых следующая сессия
переспорит уже принятое, без второго — переоткроет то, что стоило платного прогона.

```
Target: Claude Code CLI, repo /home/me/code/mc2, branch develop
Audience: assistant, fresh session
Runtime: WSL, VS Code terminal

Goal: Implement sections A through H of docs/plans/settled-picture-osprey.md,
deliver into develop via /push-dev, then re-run
docs/runbooks/cost-ledger-paid-run.md and reconcile against the OpenRouter invoice.

Context: Read the plan first — it holds the measurements, the owner's standing
decisions and the exact files and lines. In short: on 2026-08-21 the ledger
reconciled to a single named call. Thirty of thirty LLM calls carried the
provider's own price; the entire residual, $0.045080 of $0.165079, was one card
image recorded as $0.007. Images are the last place a price is invented, and they
cannot fix themselves — two of the four OpenRouter clients build their own OpenAI
instance and never see the x-generation-id header. Section E is the still-open P0
root cause: the floating ~...-latest alias.

Three owner decisions are binding: a provider is ignored only inside the current
chain of attempts, never in a standing blocklist; cheapest stays the goal, so
max_price is a ceiling and sort=throughput is out; waiting is acceptable, so raise
timeouts rather than chase speed.

Start with mc2-l17v5 — it blocks mc2-5mhlb, mc2-j9pmq and mc2-z7ryi. Then images
and routing run in parallel; `bd ready` has both. Read the plan's "ловушки"
section before writing code: those traps were paid for by a live run. Change
nothing the plan does not name; if a fix needs a decision the plan does not
record, stop and ask. Ask before spending money on the paid run.

Output: the plan's acceptance list answered line by line, the report TOTAL next to
the OpenRouter figure for the same window, and a Beads issue for anything new.
```
