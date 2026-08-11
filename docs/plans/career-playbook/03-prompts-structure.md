# Career Playbook — Prompts Structure (v2)

Версия 2 от 2026-08-11. Заменяет v1 после представительного прогона качества.
Причины изменений: [../../career-playbook/quality-root-cause-2026-08-11.md](../../career-playbook/quality-root-cause-2026-08-11.md).
Нормативные правила: [../../career-playbook/quality-contract.md](../../career-playbook/quality-contract.md).

Все промпты живут в `packages/course-gen-platform/src/shared/prompts/career-playbook-prompts.ts`
как массив `HardcodedPrompt[]` и грузятся через `PromptService.renderPrompt()`.

## Что изменилось в v2

| #   | Изменение                                                                     | Закрывает                                                 |
| --- | ----------------------------------------------------------------------------- | --------------------------------------------------------- |
| 1   | `RoleProfileSpec` получает `metric_ledger`, `evidence_ledger`, `generated_on` | Конфликты метрик, отсутствие источников, устаревшие даты  |
| 2   | Групповые промпты получают четыре новые переменные                            | То же + противоречия между блоками                        |
| 3   | Правило «выдумай реалистичный пример» заменено правилом маркировки            | Выдуманное как корпоративная правда                       |
| 4   | Таксономия судьи расширена четырьмя критичными категориями                    | Судья пропускал конфликты чисел и недоказанную статистику |
| 5   | `contradiction` теперь покрывает противоречие **другому блоку**               | Возврат требования из v1, потерянного при реализации      |
| 6   | Рубрика обратимости решений и правила карьерной лестницы                      | Завышенная классификация решений, дубль уровней           |

## Реестр промптов

| `promptKey`                             | Назначение                                                                | Модель (фаза)                       |
| --------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------- |
| `career_playbook_department_classifier` | Классификация названия роли в функциональную область                      | `stage_career_playbook_followup`    |
| `career_playbook_followup_generator`    | 3-7 адаптивных уточняющих вопросов                                        | `stage_career_playbook_followup`    |
| `career_playbook_spec_builder`          | Q&A + research → `RoleProfileSpec`                                        | `stage_career_playbook_spec`        |
| `career_playbook_group_1_foundation`    | Header + 1 Mission + 2 Anti-goals + 5 Decision Matrix                     | `stage_career_playbook_group_1`     |
| `career_playbook_group_2_operations`    | 3 Responsibility + 4 Duties + 6 KPI + 8 Tools                             | `stage_career_playbook_group_2`     |
| `career_playbook_group_3_people`        | 7 Competencies + 9 Human-AI + 12 Candidate + 13 Day                       | `stage_career_playbook_group_3`     |
| `career_playbook_group_4_growth`        | 11 Career + 14 Onboarding + 15 Motivation + 17 Red flags                  | `stage_career_playbook_group_4`     |
| `career_playbook_group_5_system`        | 10 Dependencies + 16 Processes + 19 Industry + 20 Business + 21 Failure   | `stage_career_playbook_group_5`     |
| `career_playbook_group_6_wrap`          | 18 FAQ + 22 README + 23 Continuity + 24 Canvas + 25 Footer + 26 Checklist | `stage_career_playbook_group_6`     |
| `career_playbook_cross_block_judge`     | Проверка согласованности группы                                           | `stage_career_playbook_judge`       |
| `career_playbook_block_regenerator`     | Перегенерация одного блока по замечанию                                   | `stage_career_playbook_regenerator` |
| `career_playbook_card`                  | Обложка (в БД, `stage_7`)                                                 | Image-модель                        |

Канонический список 26 блоков — единственный источник правды в
`shared/prompts/career-playbook-block-topics.ts`; он же подставляется в промпт spec-builder через
`formatCareerPlaybookCanonicalLayoutForPrompt()`. Не дублировать раскладку в текстах промптов.

---

## RoleProfileSpec v2

Контракт между Q&A и генерацией блоков. Схема:
`packages/shared-types/src/career-playbook.ts`, `CareerPlaybookRoleProfileSpecSchema`.

```typescript
interface RoleProfileSpec {
  position: {
    title: string;
    slug: string;
    department: string;
    specialization?: string;
    level: 'junior' | 'middle' | 'senior' | 'lead' | 'director' | 'c-level';
  };

  context: {
    company_stage?: 'pre-pmf' | 'growth' | 'scale' | 'mature';
    team_size: '1-10' | '11-50' | '51-200' | '201-1000' | '1000+';
    reports_to: string;
    has_subordinates: boolean;
    subordinates_description?: string;
    industry?: string;
    region?: string;
  };

  focus_areas: {
    primary_kpis: string[]; // 3-5 названий метрик
    key_tools: string[];
    critical_competencies: string[];
    anti_goals: string[];
    failure_patterns: string[];
  };

  // ── НОВОЕ В v2 ──────────────────────────────────────────────────────────
  // Канонический реестр чисел. Каждая метрика из primary_kpis обязана иметь
  // здесь запись. Блоки цитируют значения дословно и не вводят своих.
  metric_ledger: Array<{
    key: string; // 'pipeline_coverage'
    label: string; // как метрика называется в тексте
    unit: string; // 'x' | '%' | 'дней' | ''
    target: string; // '>=3x'
    green: string;
    yellow: string;
    red: string;
    review_period: string; // 'неделя' | 'месяц' | 'квартал' | 'год'
    provenance: 'company_source' | 'user_answer' | 'benchmark' | 'assumption';
    source_ref: string | null; // id из evidence_ledger
  }>;

  // Реестр источников. ЗАПОЛНЯЕТСЯ КОДОМ из результата web-research,
  // не моделью. Любые записи из ответа LLM отбрасываются.
  evidence_ledger: Array<{
    id: string; // 'S1'
    url: string;
    title: string;
    claim: string; // что именно подтверждает источник
    retrieved_at: string;
  }>;

  // Дата генерации. Заполняется кодом из системного времени.
  generated_on: string; // ISO-дата
  // ────────────────────────────────────────────────────────────────────────

  research: {
    kpis_insights: string[];
    trends_insights: string[];
    onboarding_insights: string[];
    sources: string[];
  } | null;

  business_context?: {
    mode: 'universal' | 'company_specific';
    digest: BusinessContextDigest | null;
    source_ids: string[];
  };

  block_boundaries: {
    [blockId: string]: {
      primary_topics: string[];
      do_not_repeat: string[];
    };
  };

  content_language: string;
}
```

### Разделение ответственности при заполнении

| Поле               | Кто заполняет                             | Как обеспечивается                                                                   |
| ------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------ |
| `block_boundaries` | LLM, затем детерминированная нормализация | `normalizeRoleProfileSpecToCanonicalBlockTopics` (`nodes/spec-builder-canonical.ts`) |
| `metric_ledger`    | LLM, затем детерминированная нормализация | Схлопывание дубликатов по `key`, отбрасывание пустых `target`, нормализация `unit`   |
| `evidence_ledger`  | **Только код**                            | Сборка из `runCareerPlaybookWebResearch`, id `S1..Sn` по порядку                     |
| `generated_on`     | **Только код**                            | Системное время в момент построения спеки                                            |

Причина строгого разделения: в прогоне 2026-08-11 модель произвольно сочиняла обороты «Research
shows» без привязки к реальным URL, потому что источники существовали только внутри промпта
spec-builder и терялись дальше.

---

## Общие правила групповых промптов

Все шесть промптов `career_playbook_group_*` получают одинаковый набор переменных:

| Переменная                | Содержимое                                  |
| ------------------------- | ------------------------------------------- |
| `spec_json`               | Сериализованный `RoleProfileSpec`           |
| `content_language`        | Код целевого языка                          |
| `heading_*`               | Локализованные заголовки блоков этой группы |
| **`metric_ledger_md`**    | Реестр метрик как markdown-таблица          |
| **`evidence_ledger_md`**  | Список `[S1] title — url — claim`           |
| **`generated_on`**        | Дата генерации                              |
| **`prior_blocks_digest`** | Выжимка уже принятых блоков                 |

Жирным — новое в v2.

### Блок общих правил (одинаков во всех шести промптах)

```
Output rules:
- Markdown only, no HTML.
- Write all prose in {{content_language}}.
- For Russian output, translate user-facing framework labels and table labels.
  Common KPI acronyms from user context may remain unchanged.

NUMBERS — canonical ledger:
- The metric ledger below is the single source of numeric truth.
  Reproduce every value and traffic-light threshold from it VERBATIM.
- Never introduce a different number for a metric that appears in the ledger.
- A metric absent from the ledger is described qualitatively, without a precise
  threshold.

EXTERNAL CLAIMS — sourcing:
- A precise statistic about the market, industry, competitors, or AI impact is
  allowed ONLY with a [Sn] reference to the evidence ledger below.
- With no matching evidence entry, rewrite the statement without a precise
  number, as an explicit hypothesis to validate.
- Never write "research shows", "studies indicate", or a dated study reference
  without a [Sn] reference.

EXAMPLES — marking:
- A company-specific value not backed by the business context or the user's
  answers (salary, bonus, ARR, budget, person name, internal tool) stays
  concrete but MUST carry the marker "(example — replace)" immediately after
  the value, in the same sentence or table cell.
- Never leave raw bracket placeholders such as [Name] or {value}.

DATES:
- Today is {{generated_on}}.
- Plans, schedules, and Gantt-style tables use relative labels only:
  "Day 1-30", "Week 2", "Quarter 1", "Month 3".
- An absolute calendar year is allowed only in the block 25 footer and must
  equal the year of {{generated_on}}.

CONSISTENCY WITH EARLIER BLOCKS:
- The digest below lists anti-goals, numeric commitments, named parties, and
  promised cadences already published in accepted blocks.
- Do not contradict any of them. If a duty would violate a stated anti-goal,
  restate the duty so both hold.

BLOCK BOUNDARIES:
- When RoleProfileSpec.block_boundaries lists a topic under do_not_repeat for a
  block, define that topic only in the owning block and cross-reference it here.
```

Раздел USER во всех групповых промптах:

```
USER:
RoleProfileSpec:
{{spec_json}}

Metric ledger (single source of numeric truth):
{{metric_ledger_md}}

Evidence ledger (the only citable sources):
{{evidence_ledger_md}}

Already published content (do not contradict):
{{prior_blocks_digest}}
```

### `prior_blocks_digest`

Строится детерминированно из `state.generatedBlocks` в `group-generator.ts` перед вызовом:

- анти-цели из блока 2 — полным списком;
- числовые обязательства из принятых блоков в формате `метрика: значение`;
- названные роли, инструменты и лица;
- обещанные ритмы взаимодействия (ежедневно / еженедельно / ежемесячно).

Лимит 1500 токенов; при усечении анти-цели и числовые обязательства сохраняются всегда.

Для группы 1 значение — `none` (предыдущих блоков нет).

---

## Методологические блоки по группам

Раздел `Methodology:` каждого промпта остаётся прежним, кроме двух групп.

### Группа 1 — рубрика решений (блок 5)

Заменяет единственную метку «one-way / two-way door»:

```
- Block 5: classify every decision on FOUR independent axes, not one label:
  * Reversibility: reversible / reversible with cost / irreversible
  * Blast radius: team / function / company / customer
  * Contract commitment: none / has deadline / has penalty
  * Approval level: act alone / notify / align / manager decides
  Changing CRM stages and choosing a vendor are "reversible with cost", not
  irreversible. Hiring and termination stay high-consequence.
  At least 4 decisions, spanning different approval levels.
```

### Группа 4 — карьерная лестница (блок 11)

```
- Block 11: dual IC/management tracks, promotion criteria, relative timelines,
  and a Mermaid career diagram.
  * The next level must differ in scope from the current one. Never emit a step
    that renames the same level (e.g. "CRO -> Chief Revenue Officer /
    President of Revenue").
  * Do not label a people-management position as "Senior <role> (IC)".
  * Every transition carries a promotion criterion and a relative timeline.
```

### Формулировки метрик (все группы)

Точность прогноза описывается через абсолютную ошибку. Формулировка вида
«accuracy consistently >±20%» смешивает точность с отклонением и запрещена.

---

## `career_playbook_spec_builder`

Дополнения к промпту v1:

```
- Build metric_ledger: one entry per metric in focus_areas.primary_kpis, with a
  target and green/yellow/red thresholds. This ledger is the single source of
  numeric truth for all 26 blocks, so every value must be internally coherent.
- Set provenance for each metric:
  * company_source — backed by the uploaded business context
  * user_answer   — stated by the user in the wizard
  * benchmark     — backed by a web research source
  * assumption    — not backed by anything; the guide will present it as a
                    hypothesis to agree internally
- Do NOT populate evidence_ledger or generated_on. The application fills both
  deterministically; any values you emit there are discarded.
```

Остальные требования v1 сохраняются: канонические `block_boundaries`, явные `anti_goals` и
`failure_patterns`, разделение business context и web research, режим `universal` без выдумывания
продуктовых и метрических фактов.

### Ограничения вызова

| Параметр              |                                        v1 |                                                v2 | Причина                                                                                                          |
| --------------------- | ----------------------------------------: | ------------------------------------------------: | ---------------------------------------------------------------------------------------------------------------- |
| `maxTokens`           |                                     8 000 |                                        **16 000** | 26 записей `block_boundaries` + `metric_ledger` не помещались; модель отдала ровно 8000 токенов и JSON оборвался |
| Поведение при обрезке | принудительный переход на fallback-модель | повтор на **той же** модели с увеличенным лимитом | Понижение до flash стоило 17,5 минуты и дало спеку худшего качества                                              |

---

## `career_playbook_cross_block_judge`

### Таксономия v2

Критичные категории, которые ведут к регенерации:

| Категория                | Определение                                                                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `contradiction`          | Блок противоречит `RoleProfileSpec`, **или противоречит другому блоку**, или повторяет тему, закреплённую `block_boundaries` за другим блоком |
| `format_minimum`         | Не выполнен жёсткий формат-минимум: анти-целей < 4, строк матрицы решений < 4, режимов отказа < 3, отсутствует обязательная Mermaid-диаграмма |
| `wrong_language`         | Пользовательский текст не на целевом языке                                                                                                    |
| `unresolved_placeholder` | Остались сырые плейсхолдеры вида `[дата]`, `{fill}`                                                                                           |
| `invented_number`        | Company-specific число, квота, бюджет или дедлайн заявлены как факт без подтверждения                                                         |
| `metric_conflict`        | Значение метрики расходится с `metric_ledger`                                                                                                 |
| `unsourced_claim`        | Точная внешняя статистика без ссылки `[Sn]`                                                                                                   |
| `stale_date`             | Абсолютная дата вне года `generated_on`                                                                                                       |
| `unmarked_example`       | Company-specific пример в universal-режиме без маркера                                                                                        |

Всё остальное — тон, «слишком обобщённо», «недостаточно конкретно», стилистические предпочтения —
это `style`, максимум `warning`, и **никогда** не основание для регенерации. Причина неизменна:
детерминированный слой надёжно ловит жёсткие отказы, а маршрутизация стилистических мнений в
регенерацию сжигает циклы без выигрыша в корректности.

Новые переменные промпта судьи: `metric_ledger_md`, `evidence_ledger_md`, `generated_on` — иначе
судья не может проверить `metric_conflict`, `unsourced_claim` и `stale_date`.

### Соотношение с детерминированным слоем

`metric_conflict`, `unsourced_claim`, `stale_date` и `unmarked_example` **сначала** проверяются
детерминированно (см. следующий раздел). LLM-судья — второй контур для случаев, которые регулярное
выражение не ловит: смысловое противоречие между блоками, конфликт обязанности с анти-целью,
несогласованность формулировок.

---

## Детерминированные проверки

Живут в `stages/stage-career-playbook/nodes/cross-block-judge-checks.ts`, подключаются в
`runCareerPlaybookDeterministicChecks`.

| Проверка                                | v1   | v2            |
| --------------------------------------- | ---- | ------------- |
| `validateAntiGoalsMinimum`              | есть | без изменений |
| `validateDecisionMatrixMinimum`         | есть | без изменений |
| `validateFailureModesMinimum`           | есть | без изменений |
| `validateMermaidCoverage` + синтаксис   | есть | без изменений |
| `validateBlockLanguageConsistency`      | есть | без изменений |
| `validateFillablePlaceholderResolution` | есть | без изменений |
| `validateMetricLedgerConsistency`       | —    | **новая**     |
| `validateUnsourcedStatistics`           | —    | **новая**     |
| `validateExampleMarking`                | —    | **новая**     |
| `validateRelativeDates`                 | —    | **новая**     |
| `validateAntiGoalConflict`              | —    | **новая**     |

Семантика каждой — в [контракте качества](../../career-playbook/quality-contract.md), раздел 6.

Требования к реализации: чистые функции без сети, юнит-тесты на позитивном и негативном примере из
реального прогона (`packages/course-gen-platform/artifacts/career-playbook-quality/career-playbook.md`),
никакого разбора внутри fenced-блоков Mermaid и кода.

---

## `career_playbook_block_regenerator`

Дополнения к промпту v1:

- Получает `metric_ledger_md`, `evidence_ledger_md`, `generated_on` — иначе перегенерация вводит
  очередное новое число вместо исправления конфликта.
- Явное правило: «если замечание относится к `metric_conflict`, приведи значение к реестру, не
  придумывай третье».
- Сохраняются существующие правила: улучшать имеющуюся Mermaid-диаграмму, а не добавлять вторую;
  оборачивать метки узлов в двойные кавычки; не оставлять сырые плейсхолдеры.

---

## Model selection

Фактические значения из `llm_model_config` (миграции `20260523073000_...`,
`20260704150000_...`) плюс изменения v2:

| Фаза                                 | Модель   | Fallback | temp |    max_tokens | timeout_ms |
| ------------------------------------ | -------- | -------- | ---: | ------------: | ---------: |
| `stage_career_playbook_followup`     | v4-flash | v4-pro   | 0.40 |         4 000 | 120 000 ⬅ |
| `stage_career_playbook_spec`         | v4-pro   | v4-flash | 0.30 | **16 000** ⬅ | 120 000 ⬅ |
| `stage_career_playbook_group_1..4,6` | v4-flash | v4-pro   | 0.70 |        14 000 | 120 000 ⬅ |
| `stage_career_playbook_group_5`      | v4-pro   | v4-flash | 0.70 |        14 000 | 120 000 ⬅ |
| `stage_career_playbook_judge`        | v4-flash | v4-pro   | 0.20 |         4 000 | 120 000 ⬅ |
| `stage_career_playbook_regenerator`  | v4-pro   | v4-flash | 0.40 |         6 000 | 120 000 ⬅ |

⬅ — меняется в v2. Снижение таймаута с 300 000 до 120 000 означает, что три неудачные попытки
стоят 6 минут вместо 20; ретрай-сеть при этом не ослабляется.

Крупные вызовы судьи по-прежнему стартуют сразу на fallback-модели при превышении
`CAREER_PLAYBOOK_JUDGE_FALLBACK_TOKEN_THRESHOLD` (по умолчанию 28 000 токенов) —
`nodes/cross-block-judge-structured.ts`.

---

## Variable conventions

- `{{position}}`, `{{department}}`, … — простые скаляры.
- `{{qa_data_json}}`, `{{spec_json}}` — сериализованный JSON.
- `{{metric_ledger_md}}`, `{{evidence_ledger_md}}`, `{{prior_blocks_digest}}` — предрендеренный
  markdown, а не JSON: он идёт в текстовый промпт и должен читаться моделью без разбора.
- `{{generated_on}}` — ISO-дата.
- `{{content_language}}` — код целевого языка.

Все переменные объявляются в `variables: PromptVariable[]` рядом с шаблоном и валидируются
`PromptService`.

## Caching

`PromptService` кеширует шаблоны на 5 минут. Значения переменных не кешируются — `generated_on` и
`prior_blocks_digest` вычисляются на каждый вызов.
