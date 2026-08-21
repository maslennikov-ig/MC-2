# План: починить маршрутизацию провайдеров и сделать учёт денег фактическим

Дата: 2026-08-20. Ветка: `develop`. Исполнитель: новая сессия Claude Code (Opus 5).

## Контекст

20 августа прошёл платный прогон по `docs/runbooks/cost-ledger-paid-run.md` (задача `mc2-z0xr3`).
Курс `bf1151ca-f337-41a5-89e7-685ebc50dfb8` дошёл до конца, карьерный плейбук
`c8649a86-2b26-471d-99fe-fadd0e1824e4` упал. Счёт OpenRouter за окно — **$0.144177**,
записано — **$0.077338**. Разрыв 46 %.

Разбор показал, что это не одна проблема, а две, и обе имеют общий источник —
мы не знаем, кто и за сколько нас обслужил.

## Корневая причина падений

`~deepseek/deepseek-v4-flash-latest` — не модель, а редирект. OpenRouter описывает его
буквально: _«always redirects to the latest model in the DeepSeek V4 Flash family»_.
А `deepseek/deepseek-v4-flash`, на котором всё работало полтора месяца, — закреплённый
снимок 0423.

| Когда                   | Что                                                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| 15 июня — 16 авг        | `deepseek/deepseek-v4-flash`, 45 вызовов. 16 авг средняя 8,7 с, максимум 29 с                                  |
| **12 авг**, `d43be2460` | «route every phase onto the models OpenRouter actually offers» — во всех конфигах пин заменён на `~...-latest` |
| 13–14 авг               | Зависания 620 с и 119 с. Ответ — `f2473e350`: таймаут 60 000 → 238 000 мс (`mc2-wg60c`). Пин не вернули        |
| **17 авг 07:03**        | Семейство обновилось, алиас поехал на снимок `-0731`. Средняя 43,7 с, максимум 326 с                           |
| 20 авг                  | У `-0731` средняя 101,9 с, максимум 368,9 с — и это только успешные вызовы, оборванные строк не оставляют      |

### Замер 2026-08-20, одна форма запроса

Профиль должности, `max_tokens` 16000, `temperature` 0.3, reasoning off.

| Маршрут                               | Латентность                      | ток/с | Цена ответа           |
| ------------------------------------- | -------------------------------- | ----- | --------------------- |
| алиас, дефолтная маршрутизация        | 29,4 / 72,7 / 93,9 / **205,0** с | 13–76 | $0,00031–0,00046      |
| алиас + `provider.sort=throughput`    | 42,2 / 59,5 с                    | 50–73 | $0,00043              |
| алиас + `preferred_min_throughput` 80 | 45,4 / 67,7 / 72,5 с             | 41–63 | $0,00083 — вдвое выше |
| алиас + `provider.ignore` прошлого    | 58,7 с                           | 43    | $0,00046              |
| `openai/gpt-5.6-luna`                 | 22,3 / 24,0 с                    | ~120  | $0,0034               |

Худший дефолтный случай — **205 с на провайдере OpenInference при 13 ток/с**. У этого
эндпоинта в `/api/v1/models/.../endpoints` статус `-2`, то есть он деградирован, и
дефолтная маршрутизация всё равно туда пошла. Это и даёт обрывы по 238 с в Stage 4.

Повтор с `provider.ignore: ["OpenInference"]` ушёл на Sail Research и уложился в 58,7 с.

### Что OpenRouter умеет, по первоисточнику

`https://openrouter.ai/docs/features/provider-routing`:

- `allow_fallbacks` переключает провайдера **только при отказе или недоступности**, не по медленности;
- пер-запросного таймаута, который бросил бы медленного провайдера и пошёл к следующему, **нет**;
- `preferred_max_latency` (секунды) и `preferred_min_throughput` (токены/с) только переупорядочивают:
  _«do not guarantee you will get a provider or model with this performance level»_. Подтвердилось
  замером — попросили 80 ток/с, получили 41–63 и цену вдвое выше;
- `order`, `only`, `ignore` задают список явно; `max_price` ограничивает цену в долларах за миллион
  токенов, поля `prompt`, `completion`, `request`, `image`.

### Вторая половина падения плейбука

У `stage_career_playbook_spec` собственный `timeout_ms = 120000`, тогда как измеренный
платформой бюджет для той же модели — `DEFAULT_LLM_TIMEOUT_MS = 238_000`
(`src/shared/llm/client.ts:57`, значение выведено из замера 119 с 14 августа).
То есть у плейбука бюджет вдвое меньше того, что команда сама померила как необходимый.

И уйти на настроенную primary он не может: `nodes/spec-builder.ts:407` ставит
`preferFallbackModel: true`, а `nodes/runtime.ts:233` считает
`useFallback = preferFallbackModel || startOnFallbackForLargeInput || attempt > 0`.
Значит **все** попытки идут на fallback, и `openai/gpt-5.6-luna` не пробуется никогда.

## Ключевая находка: факт можно взять у OpenRouter

Заголовок `x-generation-id` приходит **вместе с заголовками ответа**, то есть до тела и
до любого нашего обрыва по таймауту. По нему `GET /api/v1/generation?id=<...>` отдаёт:

```
usage                     0.000009419      ← сколько OpenRouter реально списал
native_tokens_prompt      91
native_tokens_completion  20
cancelled                 false
finish_reason             "length"
model                     "deepseek/deepseek-v4-flash-20260731"
router                    "~deepseek/deepseek-v4-flash-latest"
provider_name             "Sail Research"
provider_responses[0]     { endpoint_id, provider_name, latency, status }
```

Это закрывает сразу четыре вещи, которые мы до сих пор решали по отдельности:

1. **Цена перестаёт быть оценкой.** Сейчас мы считаем по `MODEL_CATALOG`, и он врёт:
   `openai/gpt-5.6-luna` записан вдвое дешевле реального тарифа, `z-ai/glm-5.2` — в 1,23 раза
   дороже, `~deepseek/...-latest` — в 1,45 раза дороже. `usage` — это факт провайдера.
2. **Оборванный вызов становится счётным.** Сохранили `x-generation-id` до обрыва — дозапросили
   после.
3. **Провайдер известен** и годится для `ignore` на следующей попытке.
4. **Сверка с инвойсом становится арифметикой**, а не расследованием.

## Решения владельца, 2026-08-20

Приняты явно, менять без нового решения нельзя:

- **Постоянного списка игнорируемых провайдеров не будет.** Провайдер, который подвёл,
  игнорируется только внутри текущей цепочки попыток. Следующий вызов начинается с чистого
  листа и снова идёт к самому дешёвому — «в следующий раз они могут работать».
- **Дешевизна остаётся приоритетом.** Провайдеры в шесть раз дороже недопустимы.
  Значит никакого `sort: throughput` и никакого повышения `max_price` ради скорости;
  `max_price` ставим как потолок, а не как разрешение.
- **Долгое ожидание — не проблема.** Проблема — когда вызов не получается вовсе или стоит
  слишком дорого. Значит таймауты поднимаем, а за скоростью не гонимся.
- **Ключевые стадии можно перевести на luna**, понимая, что она дороже.
- Работа идёт **сразу в `develop` через `/push-dev`**.

## Что делаем

### A. Знать, кто нас обслужил и сколько это стоило

`src/shared/llm/client.ts`, `src/shared/llm/client-helpers.ts`, `src/shared/llm/langchain-models.ts`.

- Читать `x-generation-id` из заголовков ответа и сохранять его **до** чтения тела, чтобы он
  пережил обрыв. В прямом пути SDK — через `.withResponse()` или доступ к `response.headers`;
  в LangChain-пути — через `response_metadata`.
- Добавить в `LLMResponse` поля `generationId` и `providerName` (сейчас там ни того, ни другого,
  `client.ts:106`). Провайдер приходит в теле ответа полем `provider`.
- То же для результата LangChain-вызова в `nodes/runtime.ts`.

Без этого шага ни B, ни F не делаются. Он первый.

### B. Игнор провайдера в пределах одной цепочки попыток

`src/shared/llm/client.ts:521` (`executeWithRetry`) и
`src/stages/stage-career-playbook/nodes/runtime.ts:230` (цикл `for attempt`).

- Завести локальный `Set<string>` неудачных провайдеров **внутри одного логического вызова**.
- При неуспехе попытки — таймаут, обрыв, ошибка провайдера — добавить туда `providerName`.
  Если попытка оборвалась и провайдер неизвестен, узнать его дозапросом по `generationId`.
- На следующей попытке передавать `provider: { ignore: [...] }`.
- Множество **не переживает вызов**. Никакого глобального состояния, никакого кэша между
  вызовами: следующий вызов снова начинает с самого дешёвого.

Куда класть `provider` в запрос: прямой путь — `extra_body.provider` в
`client-helpers.ts:264` (там уже есть ветка для anthropic-кэша, её надо обобщить);
LangChain-путь — `modelKwargs` в `langchain-models.ts:442`.

### C. Потолок цены

- Считать потолок из `MODEL_CATALOG` для запрошенной модели с небольшим множителем
  (предлагается ×1,5) и передавать `provider.max_price: { prompt, completion }`
  в долларах за миллион токенов.
- Смысл: `ignore` не должен уводить нас на провайдера в шесть раз дороже. Дешёвые остаются
  первыми, дорогие отсекаются жёстко.
- Множитель вынести в константу рядом с `DEFAULT_LLM_TIMEOUT_MS`, с комментарием почему.

### D. Таймауты

- `stage_career_playbook_*` в `llm_model_config` и в `src/config/config-seed.json`:
  `timeout_ms` 120000 → 238000, вровень с платформенным.
- Рассмотреть подъём `DEFAULT_LLM_TIMEOUT_MS` со 238 000 до ~300 000: наблюдался хвост 205 с
  на здоровом, но медленном провайдере, и по решению владельца ждать не страшно.
  Решение принимать с цифрой в руках, а не на глаз.
- `stage_career_playbook_proofreader` уже стоит 240000 — это ориентир, а не исключение.

### E. specBuilder уходит на luna

`src/stages/stage-career-playbook/nodes/spec-builder.ts:407`.

- Убрать `preferFallbackModel: true`. Конфиг фазы **уже** называет primary `openai/gpt-5.6-luna`,
  а `~deepseek/...` — fallback. Снятие флага само по себе даёт «ключевую стадию на luna»
  без правки конфига, а deepseek остаётся страховкой на повторе.
- Прежде чем убирать, посмотреть историю строки: флаг мог быть поставлен осознанно ради
  экономии. Если так — оставить экономию для остальных узлов и снять только для specBuilder,
  который блокирует весь плейбук.
- Тот же вопрос задать `nodes/followup-questions.ts:273` и
  `nodes/cross-block-judge-structured.ts:160`, где флаг стоит так же.

### F. Учёт денег переходит с оценки на факт

- В `recordLlmCallCost` писать `usage` из `/api/v1/generation`, а расчёт по `MODEL_CATALOG`
  оставить как оценку до прихода факта. Каталог перестаёт быть источником истины и становится
  тем, чем и должен быть, — прикидкой для лимитов и планирования.
- `recordFailedCall` (`client.ts:392`) сегодня честно пишет строку без цены. После A он может
  дозапросить факт по `generationId` и записать реальную сумму. Комментарий в коде про
  «инвентировать число хуже честного пробела» остаётся верным — мы не выдумываем, мы спрашиваем.
- Дозапрос делать не в горячем пути: отложенно, с одной повторной попыткой, и никогда не давать
  ему уронить вызов.

### G. Плавающий алиас

- Заменить `~deepseek/deepseek-v4-flash-latest` на закреплённый снимок во всех конфигах и в
  `config-seed.json`, чтобы обновление семейства перестало приезжать сюрпризом на платном прогоне.
- Решение о том, какой именно снимок, принимать по замеру цены и латентности, а не по дате.
  Это **не** правка ради скорости: на лучшем маршруте deepseek всё равно даёт 40–60 с против
  22–24 с у luna. Это правка ради предсказуемости.
- Отдельно поправить нормализацию в `packages/shared-types/src/model-catalog.ts:367`, если после
  пина перестанет срабатывать ветка «Priced from the base model».

## Что мы сознательно не делаем

- **Не заводим постоянный список плохих провайдеров.** Решение владельца: сегодняшний плохой
  завтра может быть хорошим, а список протухнет молча.
- **Не гонимся за скоростью.** `sort: throughput` проверен и не помог, `preferred_min_throughput`
  только удорожает. Медленный, но работающий провайдер нас устраивает.
- **Не переводим всё на luna.** Только specBuilder как ключевую стадию.

## Приёмка

1. Карьерный плейбук на той же анкете доходит до конца. Тот же ввод, что 20 августа:
   «Руководитель службы поддержки клиентов», support, lead, 51-200, growth, ru.
2. В логах видно, что повтор после неудачи ушёл на **другого** провайдера, а следующий вызов
   снова начался с самого дешёвого.
3. Ни один вызов не обслужен провайдером дороже потолка.
4. `generation_trace` содержит строку **на каждую** попытку, включая оборванные, и у каждой
   есть цена — фактическая, а не расчётная.
5. `pnpm cost:report --since <T0>` запускается без обходных путей и его TOTAL сходится с
   дельтой `/api/v1/credits` за то же окно в пределах заявленного допуска.
6. `pnpm type-check` и `pnpm build` зелёные.

Повторный платный прогон по тому же ранбуку — часть приёмки, не отдельная работа.

## Задачи

Поток 1, маршрутизация и падения:

| bd          | Что                                                                |
| ----------- | ------------------------------------------------------------------ |
| `mc2-qch4w` | ROOT CAUSE: плавающий алиас вместо закреплённого снимка (раздел G) |
| `mc2-xm7yf` | specBuilder прибит к fallback (раздел E) + таймаут фазы (раздел D) |

Поток 2, деньги:

| bd          | Что                                                        |
| ----------- | ---------------------------------------------------------- |
| `mc2-v1pn2` | Цена luna вдвое ниже реальной                              |
| `mc2-156kg` | Каталог завышает glm-5.2 и deepseek-latest                 |
| `mc2-64n8i` | Оборванные вызовы не оставляют ни строки, ни цены          |
| `mc2-ajqun` | Упавший плейбук не записывает потраченное                  |
| `mc2-rkmeg` | Стоимость плейбука не попадает в `generation_trace`        |
| `mc2-wjdfe` | `cost:report` не грузит `.env`                             |
| `mc2-wjmrd` | `cost:report` считает money-missed строки-маркеры          |
| `mc2-9nf9q` | `estimated_cost_usd` имеет 4 знака, сверка всегда MISMATCH |

Прочее из прогона:

| bd          | Что                                                           |
| ----------- | ------------------------------------------------------------- |
| `mc2-gqhws` | Stage 4 падает на `EvidenceExtractionScopeError`              |
| `mc2-hjj8a` | Замерить deepseek на реальных формах и решить, где он уместен |
| `mc2-51epl` | Разобрать восемь системных предупреждений                     |

Новые задачи этого плана заводятся отдельно и ссылаются сюда.

## Порядок

Потоки 1 и 2 идут параллельно — по файлам они не пересекаются, кроме раздела A,
который нужен обоим. Поэтому **A делается первым и один раз**, дальше потоки расходятся.

## Стартовый промпт для следующей сессии

Проверен `orch-prompts prompt-check --kind handoff --runtime claude --profile opus-5`: pass,
с предупреждением о размере (1726 символов против цели 1500). Резать дальше пришлось бы
за счёт решений владельца, а они здесь несущие.

```
Target: Claude Code CLI, repo /home/me/code/mc2, branch develop
Audience: assistant, fresh session
Runtime: WSL, VS Code terminal

Goal: Implement sections A through F of docs/plans/steady-routing-heron.md,
deliver into develop via /push-dev, then re-run docs/runbooks/cost-ledger-paid-run.md
and reconcile against the OpenRouter invoice.

Context: Read the plan first — it holds the evidence, the owner's decisions and the
exact files and lines. In short: on 12 August every phase moved from a pinned
deepseek snapshot to the floating alias ~...-latest; on 17 August the alias followed
the family to a new snapshot and median latency went from 8.7 s to 102 s. That
aborts Stage 4 and fails the career playbook. The 2026-08-20 run recorded $0.077338
against an invoice of $0.144177.

The find it is built on: x-generation-id arrives with the response headers, before
the body and before any timeout abort, and GET /api/v1/generation?id= returns what
OpenRouter actually billed plus the provider name.

Three owner decisions are binding: a provider is ignored only inside the current
chain of attempts, never in a standing blocklist, and the next call starts again
with the cheapest; cheapest stays the goal, so max_price is a ceiling and
sort=throughput is out; waiting is acceptable, so raise timeouts rather than chase
speed.

Start with mc2-ihhwp — it blocks mc2-pdsjz, mc2-svokw and mc2-jukal. Then routing
and money run in parallel; `bd ready` has both. Change nothing the plan does not
name; if a fix needs a decision the plan does not record, stop and ask.

Output: the plan's acceptance list answered line by line, the report TOTAL next to
the OpenRouter figure for the same window, and a Beads issue for anything new.
```
