# mc2-b7zm3 — Ускорение генерации Career Playbook (без роста отказов) + аудит ретраев

## Context

Реальный dev-прогон (playbook `6b55ca50`, 2026-07-03) занял 73.4 мин: spec-builder ~2 мин, остальные ~68 мин — цикл block-gen + judge↔block-regenerator на `deepseek/deepseek-v4-pro` (~136 judge/regen строк лога против ~18 начальной генерации). Жёсткое ограничение владельца: **надёжность прежде скорости** — success rate не должен упасть, criterion-#1 (язык, плейсхолдеры, учёт стоимости) должен держаться.

Ключевые факты, проверенные по коду:

- Цикл строго последовательный: judge флагует блоки → regenerator чинит **один** блок → **полный** ре-judge группы → снова. Худший случай на группу: 1 + 8×(regen + re-judge) = 17 вызовов pro-модели (`graph.ts:157-185`, `block-regenerator.ts:227-340`).
- Капы уже существуют: 2/блок, 8/окно judge (`block-regenerator.ts:16-17`); исчерпание бюджета деградирует мягко — warning, не fail (`cross-block-judge.ts:376-417`).
- **Criterion-#1 проверки детерминированы и не зависят от модели judge**: язык/плейсхолдеры/min-items/mermaid все `severity: 'critical'`, безусловно попадают в `needs_regeneration` через union в `mergeJudgeVerdicts` (`cross-block-judge.ts:357-374`). Слабая LLM-judge-модель не может пропустить wrong-language/placeholder блок.
- Роутинг pro-модели для judge/regenerator живёт **только в БД** `llm_model_config` (миграция `20260523073000_update_career_playbook_v4_pro_routing.sql`); БД общая для dev+staging → менять строки для A/B нельзя.
- `invokeLLM` (`nodes/runtime.ts:139-195`) не логирует durationMs; catch ретраев молчит. Retry: attempts = maxRetries+1, fallback-модель с attempt>0, таймаут 5 мин через Promise.race. Job-level attempts=1 (анти-runaway), TTL 120 мин.
- Известный баг: `appendCareerPlaybookNodeCost` (`server/routers/career-playbook/cost-breakdown.ts:20-31`) пересобирает breakdown как `{nodeCosts, total_cost_usd}` — любые новые поля стирались бы при ручной регенерации блока.

## Классификация и маршрутизация (orchestrator-stage)

- **Классификация**: medium/complex (перф-оптимизация LLM-пайплайна, файловые изменения, регрессионные риски, handoff).
- **Beads**: `mc2-b7zm3` (P2, выбрана; заклеймить `--status in_progress` в начале выполнения).
- **Routing evidence**: 2 Explore-агента (пайплайн; retry-инфраструктура) + 2 Plan-агента (инструментация+аудит; спид-леверы) + ручная верификация ключевых файлов (`block-regenerator.ts`, `runtime.ts`, `cross-block-judge.ts`). Docs L1/L2 не требуются — только внутренний код, без version-sensitive внешних API. Graphify: read-only на этапе планирования (GRAPH_REPORT.md 890 KB — не читался целиком; хватило фокусной разведки); после изменений кода — refresh на closeout. `prompt-check not run` (промпты агентов авторизованы через мини-гейт вручную).
- **Объём (решение владельца)**: полный транш — инструментация + аудит-док + батч/параллельная регенерация + env-гейтированный judge→v4-flash; A/B-прогон в рамках задачи.

## Решения по леверам

| Левер                                                            | Решение                                       | Причина                                                                                                                |
| ---------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| B. Батч-регенерация (все упавшие блоки → один ре-judge)          | **Ship**                                      | Тот же quality-gate (полный ре-judge окна перед продвижением), капы не меняются; judge-вызовы в regen-раундах ↓ в 2–4× |
| C. Параллельные regen-вызовы внутри батча (`Promise.allSettled`) | **Ship** (вместе с B)                         | Параллелизм внутри одного LangGraph-узла, редьюсеры state уже поддерживают; изоляция ошибок per-block как сегодня      |
| A. Judge → v4-flash                                              | **Ship, только judge, только env-гейт (dev)** | Детекция criterion-#1 детерминирована → flash-judge не снижает защиту; БД общая со staging → в БД не трогаем до A/B    |
| A′. Regenerator → flash                                          | **Defer**                                     | Regenerator производит сам фикс: хуже конвергенция → cap-exhaustion отгружает больше нарушений. Решать по данным A/B   |
| D. Ослабить триггеры регенерации                                 | **Reject**                                    | Ложная предпосылка: детерминированные проверки только critical; LLM-warnings уже не триггерят regen                    |
| E. Снизить кап окна с 8                                          | **Reject**                                    | Прямо против «надёжность прежде скорости» (больше блоков с нерешёнными critical); после B почти бесполезен             |
| F. Параллелить 6 групп                                           | **Defer**                                     | Judge группы N потребляет контент групп 1..N-1 — смена семантики; генерация групп лишь ~5 мин из 73                    |

## Реализация (фазы последовательные — общие файлы `runtime.ts`, `block-regenerator.ts`)

### Фаза 1 — Инструментация + фикс сохранения breakdown

1. `packages/shared-types/src/career-playbook.ts` (~783–796): в `CareerPlaybookNodeCostSchema` добавить `duration_ms` (nonnegative, optional) и `attempts` (int positive, optional); в `CareerPlaybookCostBreakdownSchema` — `regeneration_attempts: z.record(z.string(), z.number().int().nonnegative()).optional()`. Optional → обратная совместимость со старыми строками, без миграции.
2. `src/stages/stage-career-playbook/nodes/runtime.ts`: расширить `CareerPlaybookLLMResult` полями `durationMs` (суммарный wall-clock по всем попыткам) и `attemptCount` (required); в `invokeLLM` — тайминг per-attempt + total, `logger.info` на успех (`{phaseName, node, promptKey, modelId, attempt, durationMs, totalDurationMs, inputTokens, outputTokens, costUsd}`), `logger.warn` на каждую упавшую попытку (сейчас catch молчит — самая ценная строка для диагностики). **Семантика ретраев byte-identical.**
3. Прокинуть `duration_ms`/`attempts` в 5 сайтах сборки nodeCost: `spec-builder.ts` (~31–43), `group-generator.ts` (~528–534), `cross-block-judge-structured.ts` (~36–48), `block-regenerator.ts` (~158–171), `followup-questions.ts` (~159–193; для агрегата — сумма durationMs, attempts опустить).
4. Фикс: `appendCareerPlaybookNodeCost` (`server/routers/career-playbook/cost-breakdown.ts`) — spread распарсенного существующего breakdown, чтобы новые поля переживали ручную регенерацию. Единственное поведенческое изменение вне инструментации — отметить в ревью.
5. `orchestrator/handlers/career-playbook-handler.ts`: задекларировать `blockRegenerationAttempts` в локальном `CareerPlaybookGraphResult` (~47–57; в state уже есть, `state.ts:79-82`); в `buildCostBreakdown` прикрепить `regeneration_attempts`; после успешного `graph.invoke` — `logger.info` сводки регенераций (attempts — ground truth: catch-путь регенератора инкрементит attempts без nodeCost).
6. Мелочь: `admin/career-playbook-costs.ts` `mapCostRow` — passthrough `durationMs` (additive).
7. Обновить единственный типизированный мок `invokeLLM`: `tests/unit/stages/stage-career-playbook/department-classifier.test.ts:51`.

### Фаза 2 — Батч + параллельная регенерация (леверы B+C)

1. `nodes/block-regenerator.ts`: добавить `selectPendingCareerPlaybookRegenerations` (plural) — тот же фильтр/сортировка, что singular (`:249-257`), но вернуть до `maxWindowAttempts − consumed` кандидатов; singular переписать как `[0] ?? null` (роутинг `graph.ts` не меняется).
2. Переписать `createBlockRegeneratorNode`: `Promise.allSettled` по батчу `regenerateCareerPlaybookBlock`; один комбинированный update: merged `generatedBlocks` (успехи), `blockRegenerationAttempts` +1 для **каждого** попытанного блока (успех и провал — сохраняет текущую семантику потребления попыток), nodeCost на каждый успешный вызов, warning `blockRegenerator retained <id>` на провал. `otherBlocks` — снапшот `state.generatedBlocks` до батча (блоки видят старые брифы друг друга; допустимо — полный ре-judge всё равно гейтит их вместе).
3. Recursion limit в `graph.ts` не трогать (батчинг строго уменьшает число шагов — верхняя граница остаётся валидной).

### Фаза 3 — Env-гейтированный override модели judge (левер A)

1. `nodes/runtime.ts` `resolvePhaseConfig` (~282–314, единая точка для всех career-playbook LLM-вызовов): применять `CAREER_PLAYBOOK_PHASE_MODEL_OVERRIDES` (JSON: phase → `{modelId, fallbackModelId?}`) поверх `getModelForPhase`; невалидный JSON → warn once + ignore. По умолчанию выключено → staging не затронут.
2. Для A/B на dev: override `{"stage_career_playbook_judge":{"modelId":"deepseek/deepseek-v4-flash","fallbackModelId":"deepseek/deepseek-v4-pro"}}` — repair-путь judge (`preferFallbackModel: true`) автоматически эскалирует к pro. Env нужно установить на **dev-воркере** (генерация server-side): найти точку конфигурации env dev-деплоя (см. memory `reference_cicd_deployment`); если точка недоступна без рисков — остановиться и спросить.

### Фаза 4 — Аудит-док ретраев + регрессионные тесты

1. `docs/career-playbook/retry-strategy.md`: инвариант владельца; карта слоёв (job attempts=1 + rationale mc2-1maah; TTL 120 мин + soft-warn 90%; phase-ретраи maxRetries+1, fallback, ×1.25 токенов с attempt≥2, таймаут 300 c; structured-judge repair; капы регенерации 2/8; budget-exhaustion degradation); таблица failure modes (триггер → поглощающий слой → исход для пользователя → цена/латентность); worst-case латентность; список закреплённых тестов; методика A/B по новым полям.
2. Новые тесты (все — закрепление текущего поведения ДО спид-изменений):
   - `runtime.test.ts`: durationMs/attemptCount на успех; attemptCount=2 на ретрай; «все попытки исчерпаны → последняя ошибка, invoke вызван ровно maxRetries+1 раз»; логи success/warn; override применён / выключен / невалидный JSON / чужая фаза не тронута.
   - `cross-block-judge.test.ts`: **budget exhaustion warns but does not fail** (кап окна и кап per-block: verdict очищен от текущих блоков, warning есть, errors нет); контрольный кейс ниже капа.
   - `block-regenerator.test.ts`: канарейка констант (2 и 8); батч-селекция (фильтр по капам, срез по остатку окна, сортировка fewest-attempts-first); форма батч-апдейта (attempts инкремент при провале, cost на успех); duration_ms/attempts в nodeCost.
   - `graph.test.ts`: judge флагует 2 блока → оба regen-вызова до следующего judge-вызова (judge-вызовов на окно 2, не 3); существующие однoблочные сценарии (`:353,:431,:510`) зелёные без правок.
   - cost-breakdown: `appendCareerPlaybookNodeCost` сохраняет `regeneration_attempts`/`duration_ms`; легаси-строка без новых полей парсится и аппендится.

### Фаза 5 — Верификация, доставка, A/B

```bash
pnpm --filter @megacampus/shared-types type-check
pnpm --filter @megacampus/course-gen-platform type-check
pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts \
  tests/unit/stages/stage-career-playbook/ tests/unit/orchestrator/queue-job-options.test.ts
pnpm --filter @megacampus/course-gen-platform test   # полный unit-набор пакета
pnpm type-check && pnpm build                        # репо-гейты
```

Доставка: commit в `develop` → push (CI задеплоит на dev — новый код нужен dev-воркеру для A/B). Перед push: fetch, стоп при diverged.

A/B-прогон (владелец участвует, бюджет ≤ $5, runbook `docs/career-playbook/live-smoke-dev-run.md`):

- Baseline «до» — прогон 2026-07-03: 73.4 мин, $0.4963, 65 nodeCosts, criterion-#1 pass.
- «После»: включить judge-override env на dev-воркере → mutation-smoke тем же fixture-профилем → сравнить wall-clock, success, criterion-#1 (Supabase напрямую из-за mc2-1nots), новые `duration_ms`/`regeneration_attempts`, cap-exhaustion warnings, число judge/regen вызовов.
- Критерий успеха: wall-clock материально ↓ (ожидание 40–60% цикла), отказов не больше, criterion-#1 pass, cap-exhaustion warnings не выросли.
- Если ок → отдельным решением (спросить владельца): миграция БД judge→flash (осознанно заденет staging) + pinned routing-тест; и оценка regenerator→flash по данным конвергенции.

## Матрица декомпозиции (subagents)

| Стрим                             | Кто                                            | Параллельность       | Причина                                                         |
| --------------------------------- | ---------------------------------------------- | -------------------- | --------------------------------------------------------------- |
| Фазы 1→2→3 (код)                  | `orchestration-bridge:worker`, последовательно | Нет                  | Конкретный конфликт: общие `runtime.ts`, `block-regenerator.ts` |
| Фаза 4.1 (аудит-док)              | `orchestration-bridge:worker` или локально     | Да, параллельно коду | Независимый write-zone (`docs/`)                                |
| Ревью после фаз                   | `orchestration-bridge:correctness-reviewer`    | Да                   | Независимый read-only стрим                                     |
| Оркестрация, Beads, доставка, A/B | локально (main agent)                          | —                    | orchestrator-only координация + live-мутации требуют владельца  |

Промпты воркерам — через `orchestration-bridge:prompt-authoring`/мини-гейт; `orch-prompts prompt-check` если доступен, иначе явно отметить.

## Риски

- Required-поля `durationMs`/`attemptCount` ломают типизированные моки на компиляции — найден один (`department-classifier.test.ts:51`); чинить, не ослаблять до optional.
- Батч-регенерация: при вердиктах с одним блоком поведение byte-identical сегодняшнему; при мульти-блочных — тот же гейт, меньше вызовов. Основной риск — ошибки агрегации state-апдейта; покрывается новыми тестами graph/block-regenerator.
- Env-override: default-off; единственная точка включения — dev-воркер. Staging/БД не трогаем без отдельного одобрения.
- Fake timers в тестах таймингов: `vi.useFakeTimers()` мокает `Date.now` — ассерты детерминированы.

## Closeout

- Beads: закрыть `mc2-b7zm3` после A/B (или явный defer, если прогон отложится); файлить follow-up на DB-промоушен judge→flash и оценку regenerator→flash.
- `.codex/handoff.md` обновить текущим состоянием; отдельное наблюдение из bead (29× hardcoded prompt fallback) — зафайлить отдельно, не чинить тут.
- `docs-reviewed: updated` (retry-strategy.md + handoff); `graph-reviewed: updated` (`graphify update . --force` после изменений кода, если worktree-состояние безопасно, иначе blocked с причиной).
- Session close: commit + push по контракту репо.
