# План: довести чек провайдера до курсового пайплайна и снять два блокера Stage 4

Дата: 2026-08-21. Ветка: `develop`. Исполнитель: новая сессия Claude Code (Opus 5).

Продолжает `docs/plans/settled-picture-osprey.md`, разделы A–H которого доставлены
(`2390f3917`, `fee134c93`, `7d40e5a45`) и приняты платным прогоном.

## Контекст

Прогон 21 августа впервые сошёлся почти вплотную:

|                                      |                |
| ------------------------------------ | -------------- |
| OpenRouter, дельта `/api/v1/credits` | **$0.193916**  |
| `pnpm cost:report --since` TOTAL     | **$0.194338**  |
| Остаток                              | **+$0.000422** |

Знак остатка изменился: отчёт теперь **выше** инвойса, а не ниже. Это уже не пропавшие
деньги, а переоценка — четырнадцать текстовых вызовов Stage 4 посчитаны по каталогу
(0.08/0.18 у запиненного снимка), тогда как обслужил их дешёвейший эндпоинт по 0.065/0.18.

Обе картинки взяли цену провайдера: обложка плейбука $0.043854525, карточка курса
$0.040980 против выдуманных $0.007. Место, где цена выдумывалась, закрыто.

Осталось одно: **чек доходит не до всех**. Из пятнадцати платных вызовов окна цену
провайдера получил ровно один — картинка. Остальные четырнадцать идут через LangChain и
теряют номер вызова.

## Что выяснилось про потерю номера

Захват устроен так: обёрнутый `fetch` кладёт `x-generation-id` в «карман», который
вызывающий обязан открыть через `withGenerationIdCapture`. Карман живёт в
`AsyncLocalStorage`. Если карман не открыт, `getStore()` возвращает `undefined`, и
транспорт молча ничего не записывает — по замыслу, потому что «не записанный id — это
пробел в учёте, а не упавший вызов» (`generation-id-capture.ts:85`).

Карман открывают ровно четыре места:

| Место                                                                    | Открывает |
| ------------------------------------------------------------------------ | --------- |
| `src/shared/llm/client.ts:579` (общий `LLMClient`)                       | да        |
| `src/shared/intent/classifier.ts:246`                                    | да        |
| `src/stages/stage7-enrichments/services/image-generation-service.ts:221` | да        |
| `src/stages/stage-career-playbook/nodes/runtime.ts:317`                  | да        |
| **весь путь LangChain**                                                  | **нет**   |

Транспорт LangChain инструментирован с 21 августа
(`langchain-models.ts:507` и `:550` ставят `fetch: instrumentFetchWithGenerationId()`),
но его вызывающие карман не открывают. Инструментированный транспорт без кармана выглядит
как работающая фича и не делает ничего — это ровно та ловушка, которую прошлый план
записал для двух названных им клиентов и не мог знать про третий путь.

Это касается Stage 2–6: `getModelForPhase` вызывается из **41** файла.

### Почему это чинится в одном месте, а не в сорока одном

Весь путь LangChain сходится в `attachCostRecording`
(`src/shared/llm/model-cost-callbacks.ts:43`). Это единственная точка, где вызов LangChain
записывает свою стоимость — через колбэк `handleLLMEnd`. Колбэк исполняется внутри вызова
модели, то есть внутри того же асинхронного контекста, что и `fetch`.

Значит достаточно обернуть **сам вызов модели**, а не сорок одно место вызова. Образец уже
есть в этом же репозитории: `withMandatoryReasoningRecovery`
(`mandatory-reasoning-recovery.ts:97`) подменяет `model.invoke` ровно так.

### Что надо доказать до правки, а не после

**Проходит ли `withStructuredOutput(...).invoke()` через подменённый `model.invoke`.**
Шесть мест зовут модель именно так (`tournament-classification.ts:357` и `:395`,
`classification-helpers.ts:245`, `runtime.ts:389`). Если LangChain внутри `bind()` создаёт
новый экземпляр вместо обёртки, подменённый `invoke` теряется, и правка окажется
работающей на прямых вызовах и молчаливо мёртвой на структурированных — то есть той же
ошибкой, которую мы чиним, во второй раз.

Колбэки этот путь переживают: Stage 3 сегодня записывает стоимость именно через
`withStructuredOutput`. Про `invoke` это не следует автоматически, и проверять надо
тестом, который валится, если маршрут не тот, а не глазами.

## Решения владельца, которые продолжают действовать

Приняты 2026-08-20/21, менять без нового решения нельзя:

- Постоянного списка игнорируемых провайдеров нет: провайдер игнорируется только внутри
  текущей цепочки попыток.
- Дешевизна — приоритет. `max_price` — потолок, а не разрешение потратить больше.
  Никакого `sort: throughput`.
- Долгое ожидание не проблема; проблема — когда вызов не получается вовсе.
- Работа идёт сразу в `develop` через `/push-dev`.
- Аудио Stage 7 остаётся на прямом счёте OpenAI: решение отложено 2026-08-21, граница
  названа в раннбуке. **Не переоткрывать без нового решения.**

## Что делаем

### A. Stage 4 перестаёт отвергать собственный вывод — `mc2-fcs45`

**Делается первым: без него курс не доходит до конца, а значит ничего из B–D не проверить
на курсе.**

`src/stages/stage4-analysis/phases/phase-5-assembly.ts:306` требует
`contextual_language`. Тот же файл на строке 189 собирает это поле **условно** и на
строке 236 добавляет его в результат только если оно есть, с комментарием
«DEPRECATED — field is now optional». То есть сборка сознательно производит `undefined`,
а валидатор двадцатью строками ниже отвергает её собственный вывод.

Право на стороне сборки, и это не мнение:

- `packages/shared-types/src/analysis-result.ts:34` и `:193` — `contextual_language?:`;
- `packages/shared-types/src/analysis-schemas.ts:506` и `:582` — `.optional()`;
- `stage5-generation/utils/analysis-formatters.ts:58` — «New data (no contextual_language)»;
- `stage5-generation/utils/metadata-generator.ts:447` — `if (analysis.contextual_language)`.

Правка: снять проверку на строках 306–308. Остальные проверки в
`validateAnalysisResult` не трогать — они про поля, которые действительно обязательны.

**Чего это НЕ значит.** Курс `bf1151ca` прошёл Stage 4 20 августа, а курс
`ebbcef5d` упал 21-го на том же коде. Поле необязательно, поэтому модель вольна его
не выдавать, и пин снимка мог качнуть эту монетку. Пин при этом не причина: причина —
строка, требующая то, что весь остальной код объявил опциональным. Если после правки
Stage 4 будет падать иначе — это другой дефект, а не этот.

Проверка: курс `micro` без документов доходит до Stage 5.

### B. Второй блокер Stage 4 — `mc2-gqhws`

Берётся вместе с A: тот же участок кода, и чинить его дважды дороже.

`stage4-analysis/evidence/card-generator.ts:514` (`validateEvidenceUnit`) бросает
`EvidenceExtractionScopeError` и роняет **весь** Stage 4. Замер 2026-08-20, курс
`bf1151ca`: job упал через 18,9 минуты, спасла только повторная попытка BullMQ.
Сопутствующее, повторившееся на обеих попытках: `claims[0].unit_ids` ожидался массивом,
пришёл `undefined`; `course_relevance` ожидался числом, пришёл `boolean`, затем `string`.

Две отдельные правки, не одна:

1. Привести схему и промпт к одному контракту по `unit_ids` и `course_relevance`.
2. Не давать out-of-scope unit ронять job. Карточка уже умеет помечаться `failed` —
   это и есть готовый безопасный исход.

Проверка: карточка evidence строится либо честно помечается `failed`; Stage 4 не падает.

### C. Чек доходит до курсового пайплайна — `mc2-258fi` (**P1, главное**)

- Добавить в `generation-id-capture.ts` чтение текущего кармана (например
  `readCurrentGenerationId()`): `generationIdStore.getStore()?.generationId`. Сейчас слот
  отдаётся только через аргумент, а колбэку LangChain нужен доступ изнутри.
- В `attachCostRecording` обернуть вызов модели в `withGenerationIdCapture`, а в
  `handleLLMEnd` прочитать номер и передать его в `recordLlmCallCost` — оттуда
  `settleTraceCostFromProvider` доберёт факт сам, ничего нового писать не нужно.
- **Сначала тест, потом правка.** Тест должен доказать, что
  `withStructuredOutput(...).invoke()` доходит до подменённого `invoke`. Если не доходит —
  оборачивать придётся места вызова, их шесть на структурированном пути и 28 `.invoke(`
  по `src/stages` всего; тогда это отдельный разговор о размере, а не молчаливое
  расширение.
- Учесть порядок с `withMandatoryReasoningRecovery`: он подменяет `invoke` **до** того,
  как `attachCostRecording` вешает колбэки, и при пересборке модели переносит
  `model.callbacks` на новый экземпляр. Обёртка кармана должна пережить эту пересборку,
  иначе восстановленный после отказа вызов снова потеряет номер.

Проверка: на прогоне `priced by the provider` близко к числу платных вызовов, а не 1 из 15.

### D. Клиент без фабрики и без ключа из админки — `mc2-me7nx`

Два транспорта, которых прошлый план не считал; их нашёл гейт раздела D того плана.

- `stage5-generation/utils/metadata-generator.ts:851` — свой `ChatOpenAI`,
  ключ из `process.env.OPENROUTER_API_KEY`;
- `stage5-generation/utils/section-batch/generator-core.ts:36` через
  `section-batch/constants.ts:4` — то же самое.

Обе читают ключ мимо `api-key-service`, то есть ключ, заменённый в админке, они
проигнорируют. Обе не инструментированы.

Правка: провести через общий транспорт и `getOpenRouterApiKey()`, затем **убрать обе
записи из списка исключений** в `tests/unit/shared/llm/one-openrouter-transport.test.ts`.
Список должен сократиться — в этом весь смысл его существования.

Проверка: гейт зелёный при двух записях меньше.

### E. Неудачная картинка перестаёт быть бесплатной — `mc2-ietzn`

`image-generation-service.ts` в `catch` логирует ошибку и бросает дальше. Если провайдер
успел начать работу, деньги списаны, а строки нет нигде. Это та же дыра, которую для
текстовых вызовов закрыл `recordFailedAttempt`.

Правка: в `catch` записать расход по уже захваченному номеру — образец
`recordFailedAttempt` в `stage-career-playbook/nodes/runtime-attempt.ts:135`. Учёт не
должен уметь ронять генерацию: не бросать из этой ветки ничего.

Проверка: оборванная генерация картинки оставляет строку с ценой или с явным
«цена неизвестна», а не тишину.

### F. Каталог: четыре снятых записи — `mc2-g1zt9`

`scripts/check-model-catalog-drift.ts --all` называет их поимённо:
`deepseek/deepseek-v4-pro` 1.168/2.336 против живых 1.6/3.2;
`z-ai/glm-5` 0.95/2.55 против 0.6/1.92;
`deepseek/deepseek-v3.1-terminus` 0.95 против 1.0 на выходе;
`~deepseek/deepseek-v4-flash-latest` 0.14 против 0.18 на выходе.

Ни одна не на живом маршруте, поэтому на счёт сегодня не влияют. Правка механическая:
обновить каталог и снимок в `tests/unit/model-catalog-coverage.test.ts`.

Решить заодно: гонять ли `--all` в CI. Сейчас в CI не гоняется никакой режим.

### G. Задача, которую надо перечитать, а не выполнить — `mc2-hjj8a`

Её текст утверждает, что `~deepseek/deepseek-v4-flash-latest` «стоит в большинстве
конфигов». После пина 21 августа алиаса нет нигде: ни в `config-seed.json`, ни в
`llm_model_config`, ни в `DEFAULT_MODEL_ID`. Полезное в задаче осталось — замерить
deepseek на реальных формах и решить, где он уместен, — но описание введёт следующего в
заблуждение. Переписать описание под текущее состояние, **не закрывая**.

## Что мы сознательно не делаем

- **Не начинаем `mc2-4clyr`** (снижение стоимости Stage 6, ~90 % расхода) до раздела C.
  Экономию считают на честном числе, а курсовая часть учёта сегодня считает по каталогу.
- **Не переводим аудио на OpenRouter** — решение владельца отложено, граница названа.
- **Не трогаем несвязанный бэклог**: редизайн UI, NotebookLM, должностные инструкции.

## Ловушки, проверенные замером — не переоткрывать

- **Инструментированный транспорт без открытого кармана не делает ничего** и выглядит
  работающим. Это и есть `mc2-258fi`. Проверять надо не наличие
  `instrumentFetchWithGenerationId`, а долетевший `generation_id` в строке.
- **Запись `/api/v1/generation` становится читаемой через ~9.6 с.** Один ранний запрос
  возвращает `null`. Дозапрос опрашивает до 30 с. Тестировать против мока, который
  сначала отдаёт 404.
- **Не ждать факт на каждый вызов**: ~10 с × N узлов — это минуты на прогон.
- **`provider.max_price` ниже всех эндпоинтов — это ОТКАЗ**, а не более дешёвый маршрут.
  Одна неверная цена в каталоге роняет все вызовы модели.
- **Реальный ноль — это измерение.** `??`, а не `||`; `== null`, а не falsy.
- **lint-staged переписывает файлы на коммите.** После коммита перепроверить тесты,
  утверждающие текст.
- **Бюджет предупреждений линтера `--max-warnings=95` выбран ровно.** Любое новое
  предупреждение валит CI, а с ним и деплой. Файл длиннее 500 «кодовых» строк — это
  предупреждение.
- **`.codex/handoff.md` упирается в лимит 308 строк.** Сжимать, а не поднимать лимит.
- **Дрейф-гейт seed сравнивает файл с базой.** Меняя маршрутизацию в одном, менять и в
  другом, иначе CI падает и деплой не состоится.
- **Смотреть на вывод джобы `Deploy to Dev`, а не прогона.** Зелёный прогон умеет
  пропустить деплой.

## Приёмка

Отвечать построчно, называя, что именно не прошло.

1. Курс `micro` без документов доходит до конца, включая Stage 7.
2. Плейбук доходит до конца.
3. `pnpm cost:report --since <T0>` TOTAL сходится с дельтой `/api/v1/credits` за то же
   окно; остаток назван поимённо и объяснён, либо его нет.
4. `billed calls with NO price` = 0 и **`priced by the provider` близко к числу платных
   вызовов** — это та строка, которую прогон 21 августа провалил со счётом 1 из 15.
5. Обложка курса в `generation_trace` и обложка плейбука в `cost_breakdown` несут цену
   провайдера.
6. `stage_edit rows` больше нуля после одной правки в чате, и цена у них не null.
7. Ни один вызов не обслужен провайдером дороже потолка.
8. Список исключений в `one-openrouter-transport.test.ts` **сократился** на две записи.
9. `pnpm type-check`, `pnpm lint`, `pnpm build` и юнит-тесты зелёные; CI дошёл до
   `Deploy to Dev` со статусом success (проверять вывод самой джобы, не прогона).

Повторный платный прогон по `docs/runbooks/cost-ledger-paid-run.md` — часть приёмки.
**Спросить разрешение перед тратой.** Прошлый прогон стоил $0.193916, остаток кредита
на 21 августа — $11.36.

## Долг проверки, унаследованный

**Игнор провайдера в пределах цепочки не проверен вживую ни разу.** Прогоны 21 августа
прошли без единой неудачной попытки. Держится юнит-тестами
(`tests/unit/shared/llm/provider-ignore-is-per-call.test.ts`) и ручным замером 20 августа:
205 с на OpenInference со статусом `-2`, 58.7 с на Sail Research с его исключением.
Если в следующем прогоне будет неудачная попытка — искать в логе `routes around it` и
приложить строку к приёмке. Если не будет — так и сказать: строка не доказана.

## Как вести прогон

Прогон ведётся **из кода, а не через UI** — это записанное предпочтение владельца.
Работающий путь, проверенный 21 августа:

- сессия минтится через `auth.admin.generateLink` + `verifyOtp` **анонимным** клиентом;
  `verifyOtp` принимает только `token_hash` и `type`, с `email` он отвечает
  «Only the token_hash and type should be provided»;
- курс: строка создаётся сервис-ролью, затем `POST /api/trpc/generation.initiate` на
  `https://dev.ai.megacampus.ru` с телом `{"courseId":"..."}` — **без** обёртки `{"json":...}`;
- плейбук: `scripts/career-playbook-live-smoke.ts --mode mutation-smoke --target dev`
  с `--queue course-generation-dev` и `--max-cost-usd`;
- локальный Redis — **другой инстанс**, в очередь dev отсюда не поставить; всё идёт
  через dev API;
- проверить развёрнутый код можно `docker exec … npx tsx` в контейнере: алиас `@/`
  резолвит `tsx`, голый `node` — нет.

## Задачи

| bd          | Раздел | Что                                                            |
| ----------- | ------ | -------------------------------------------------------------- |
| `mc2-fcs45` | A      | Stage 4 требует поле, объявленное опциональным (**P1**)        |
| `mc2-gqhws` | B      | Stage 4 роняет job на evidence, обе схемы не сходятся (**P1**) |
| `mc2-258fi` | C      | LangChain теряет `x-generation-id` (**P1, главное**)           |
| `mc2-me7nx` | D      | Два транспорта Stage 5 мимо фабрики и мимо админки             |
| `mc2-ietzn` | E      | Неудачная картинка оплачена и не записана                      |
| `mc2-g1zt9` | F      | Четыре снятых записи каталога расходятся с живыми              |
| `mc2-hjj8a` | G      | Переписать описание, не закрывать                              |
| `mc2-z0xr3` | —      | Закрывается прогоном, который сойдётся без остатка             |

## Порядок

**A и B первыми и вместе** — один участок кода, и без них курс не доходит до конца.
Дальше два потока, по файлам не пересекающиеся: **чек** (C, E) и **транспорт с
каталогом** (D, F). G — пять минут, брать между делом. Прогон — последним, после
`/push-dev` и успешного `Deploy to Dev`.

## Стартовый промпт для следующей сессии

Проверен `orch-prompts prompt-check --kind handoff --runtime claude --profile opus-5`:
**pass**, с предупреждением о размере (1981 символ против цели 1500). Резать дальше
пришлось бы за счёт решений владельца, указателя на ловушки или требования доказать
маршрут `withStructuredOutput` тестом — а это ровно то, без чего следующая сессия
переспорит принятое или второй раз напишет молчаливо мёртвую правку.

```
Target: Claude Code CLI, repo /home/me/code/mc2, branch develop
Audience: assistant, fresh session
Runtime: WSL, VS Code terminal

Goal: Implement sections A through G of docs/plans/honest-receipt-kestrel.md,
deliver into develop via /push-dev, then re-run
docs/runbooks/cost-ledger-paid-run.md and reconcile against the OpenRouter invoice.

Context: Read the plan first — it holds the measurements, the owner's decisions
and the exact files and lines. In short: on 2026-08-21 the ledger reconciled to
+$0.000422 of $0.193916 and the sign flipped, so what is left is over-estimation,
not missing money. What remains is that of fifteen billed calls only one got a
receipt. The rest go through LangChain, whose transport is instrumented but whose
callers never open the AsyncLocalStorage slot, so the id is dropped in silence.

Three owner decisions are binding: a provider is ignored only inside the current
chain of attempts, never in a standing blocklist; cheapest stays the goal, so
max_price is a ceiling and sort=throughput is out; waiting is acceptable, so raise
timeouts rather than chase speed. Stage 7 audio stays on its own OpenAI account —
deferred, do not reopen.

Start with mc2-fcs45 and mc2-gqhws together: they share one file region, and until
they are fixed no course reaches the end, so nothing can be verified on one. Then
the receipt stream and the transport stream run in parallel. Before writing
section C, prove with a test that withStructuredOutput(...).invoke() reaches a
patched model.invoke — if it does not, the one-place fix is a silent no-op on six
call sites. Read the plan's "ловушки" section first: those traps were paid for by
live runs. Change nothing the plan does not name; if a fix needs a decision the
plan does not record, stop and ask. Ask before spending money on the paid run.

Output: the plan's acceptance list answered line by line, the report TOTAL next to
the OpenRouter figure for the same window, and a Beads issue for anything new.
```
