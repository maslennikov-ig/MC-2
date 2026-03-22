---
name: job-description
description: Generate comprehensive role guides (job descriptions on steroids) for any position. Multi-phase workflow with web research, adaptive questions, 26 content blocks based on Netflix/Amazon/Toyota/Spotify/Bridgewater best practices, and course brief generation. Use /job-description to create a role guide.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Agent, WebSearch, AskUserQuestion, mcp__supabase__execute_sql
---

# Role Guide Generator

Generate comprehensive, research-backed role guides for any position. Not a traditional job description — an operational playbook that makes business owners say "wow."

Three-phase workflow: (0) discovery, research & clarification, (1) document generation section-by-section, (2) review & publish.

**Research foundation:** Netflix (Context over Control), Amazon (Leadership Principles + Input/Output metrics), Toyota (Standardized Work + TWI), Spotify (Squad Model + Steps Framework), Basecamp (Manager of One), Bridgewater (Baseball Cards), Topgrading (Job Scorecard), EOS/Traction (GWC + Rocks), "Who" by Geoff Smart, "Drive" by Dan Pink, "The Alliance" by Reid Hoffman, "The Checklist Manifesto" by Atul Gawande.

## Language Policy

- **This skill file:** English (saves tokens)
- **Generated document:** Russian (for business owners)
- **Communication with user:** Russian (always)

## Output

- **Phase 1:** `docs/job-descriptions/{slug}.md` — markdown source (permanent, committed to repo)
- **Phase 2:** Published to Supabase `job_descriptions` table → available in web catalog

## When to Use

- User says `/job-description` or asks to create a role guide / job description
- User names a position (e.g., "менеджер по продажам B2B")

## Core Principles

1. **Outcomes over activities** — define what the role ACHIEVES, not what it does (Geoff Smart, Job Scorecard)
2. **Context over control** — give strategic context so people make good decisions autonomously (Netflix)
3. **Every JD is unique** — web research + adaptive content for every role
4. **Written for business owners** — no HR jargon, every block explains "why you need this"
5. **Three elements create 80% of wow-factor:** Anti-goals, Failure modes, Decision authority matrix (research finding)

---

# Phase 0: Discovery & Clarification

### Step 0.1: Parse the Position

Identify: Department/Function, Level (Junior–Director), Specialization hints.

If the position is broad, offer specialization:

> "{Position} — это широкая роль. Хотим конкретизировать?
>
> 1. {Specialization A} — {1-line}
> 2. {Specialization B} — {1-line}
> 3. Оставить общим"

Skip if already specific (e.g., "DevOps-инженер в AWS").

### Step 0.2: Adaptive Clarifying Questions (3-5)

Always ask:

1. "Кому подчиняется? Есть ли подчинённые?"
2. "Размер компании / команды?"

Then 1-3 position-specific questions (adapt by department). Ask ALL in ONE message. Use reasonable defaults for skipped answers.

### Step 0.3: Role Research (автоматический)

**BEFORE generating, run 2-3 WebSearch queries** specific to THIS role:

1. `"best {role_name} KPIs" OR "{role_name} scorecard" OR "{role_name} metrics" best practices`
2. `"{role_name}" trends 2025 2026 challenges skills AI impact`
3. `"{role_name} onboarding" OR "{role_name} playbook" OR "{role_name} career path" best practices`

**Extract and integrate into blocks:** Non-obvious KPIs, trending tools, career paths at top companies, AI impact on this role, common failure modes, industry benchmarks.

**Rules:** Max 3 min. Don't show raw results — weave into blocks naturally. Cite sources: "По данным HBR..." If WebSearch unavailable — proceed without, note in checklist.

### Step 0.4: Choose Slug & Metadata

Propose 3 slug options. Determine: department, specialization, level, tags[], summary. Wait for user confirmation.

---

# Phase 1: Document Generation (Section by Section)

## Generation Strategy

**CRITICAL: Never generate the entire document in one Write call.** Generate in groups:

```
Group 1 (Write): Header + Blocks 1-5 (mission, anti-goals, zones, duties, decision matrix)
Group 2 (Edit):  Blocks 6-9 (KPI, competencies, tools, AI allocation)
Group 3 (Edit):  Blocks 10-13 (interactions, career, candidate, typical day)
Group 4 (Edit):  Blocks 14-17 (onboarding, motivation, processes, red flags)
Group 5 (Edit):  Blocks 18-21 (FAQ, industry, business goals, failure modes)
Group 6 (Edit):  Blocks 22-26 (working-with-me, continuity, role canvas, footer)
```

Communicate progress between edits.

## Document Structure (26 Blocks)

### Header

```markdown
# {Position Title}: операционный playbook

> {One sentence — the essence of this role for a business owner}

---

**Отдел:** {department}
**Подчинение:** {reports to}
**Подчинённые:** {direct reports / none}
**Уровень:** {Junior / Middle / Senior / Lead / Director}
**Специализация:** {B2B / B2C / ... or "Общая"}
**North Star Metric:** {THE one number this role must drive}

---
```

### Block 1: Миссия и ключевые результаты

**Outcome-based, not activity-based** (Geoff Smart's Job Scorecard).

Structure:

- **Миссия:** 2-3 sentences — why this role exists, written for the owner
- **Ключевые результаты (3-5):** Measurable outcomes ranked by priority, time-bound
- **North Star Metric:** The ONE number that captures this role's core value delivery

**Anti-pattern:** "Обеспечивает эффективное функционирование отдела"
**Good:** "Приносит компании выручку, закрывая 5-8 B2B-сделок в месяц. North Star: объём квалифицированного pipeline (≥3x от плана)."

**NSM by role category:**

- Revenue roles: Pipeline Value / Closed Revenue
- Support: Net Revenue Retention / CSAT
- Technical: Deployment Frequency × Success Rate (DORA)
- Operations: On-Time-In-Full (OTIF)
- Creative: Qualified Leads Generated / Engagement Rate
- Admin/HR: Process Cycle Time (Time-to-Hire, Days-to-Close)

### Block 2: Анти-цели (что эта роль НЕ делает)

**THE #1 wow-element from research.** Prevents scope creep — the silent killer of productivity.

Table: 4-6 explicit anti-goals. For each: what NOT to do + whose responsibility it actually is.

```markdown
## 🚫 Анти-цели: что эта роль НЕ делает

| #   | Анти-цель                                | Чья ответственность                 |
| --- | ---------------------------------------- | ----------------------------------- |
| 1   | НЕ занимается первичной обработкой лидов | SDR / маркетинг                     |
| 2   | НЕ пишет техническую документацию        | Технический писатель / разработчики |
| 3   | НЕ согласовывает юридические вопросы     | Юрист                               |

> Если вы регулярно делаете что-то из списка — это сигнал о проблеме в процессах. Сообщите руководителю.
```

### Block 3: Ключевые зоны ответственности

Table: 4-6 zones with weight % (must sum to 100%) + **Definition of Done** for each zone.

```markdown
| #   | Зона                 | Вес (%) | Definition of Done                                 |
| --- | -------------------- | ------- | -------------------------------------------------- |
| 1   | Привлечение клиентов | 30%     | Pipeline ≥ 3x от плана, все лиды в CRM с next step |
```

### Block 4: Обязанности

Split by frequency: daily / weekly / monthly / quarterly (quarterly only for Lead/Director).

Each obligation = **action + measurable result + Definition of Done.**

**Anti-pattern:** "Ведёт переговоры с клиентами"
**Good:** "Проводит 3-5 встреч с ЛПР в день. Done = результат в CRM в течение 30 мин, назначен следующий шаг."

### Block 5: Матрица решений (Decision Authority)

**THE #2 wow-element.** Based on Management 3.0 delegation levels + Amazon One-Way/Two-Way Door.

```markdown
## 🎯 Матрица решений: что вы решаете сами

| Решение                     | Уровень автономии        | Действие                            |
| --------------------------- | ------------------------ | ----------------------------------- |
| Приоритизация задач на день | ✅ Полная автономия      | Решаете сами                        |
| Скидка клиенту до 10%       | 📋 Решаете, информируете | Применяете, сообщаете РОПу          |
| Скидка > 10%                | 🤝 Рекомендуете          | Предлагаете решение, РОП утверждает |
| Изменение условий договора  | ⛔ Только с одобрения    | Согласуете с юристом + руководством |

> **Принцип Amazon:** Бóльшая часть решений — "двусторонняя дверь" (можно откатить). Принимайте их быстро. Только необратимые решения требуют согласования.
```

### Block 6: KPI и метрики

**Enhanced with Input/Output pairing (Andy Grove) + Traffic Light system + Anti-metrics.**

Structure:

1. **Input/Output таблица** — paired metrics preventing gaming
2. **Traffic Light система** — Green/Yellow/Red with MANDATORY actions
3. **Анти-метрики** — what NOT to measure solo (Goodhart's Law warnings)

```markdown
## 📊 KPI и метрики

### Что вы контролируете → Что мы измеряем

| Input (ваши действия) | Output (результат)      | Counter-метрика (качество) |
| --------------------- | ----------------------- | -------------------------- |
| 15-25 касаний/день    | 4-8 закрытых сделок/мес | Конверсия ≥ 15%            |

### Светофор: что делать при отклонении

| Статус     | Порог        | Обязательное действие                               |
| ---------- | ------------ | --------------------------------------------------- |
| 🟢 Зелёный | ≥ 90% плана  | Продолжаем. Делитесь тем, что работает              |
| 🟡 Жёлтый  | 75-89% плана | Анализ причин на этой неделе, корректировка подхода |
| 🔴 Красный | < 75% плана  | 15-мин разбор с руководителем в течение 48 часов    |

### ⚠️ Анти-метрики (не используйте как единственный показатель)

- **Количество звонков без конверсии** — приводит к имитации деятельности
- **Время в офисе / онлайн** — измеряет присутствие, а не результат
```

### Block 7: Необходимые компетенции

**Enhanced with Superpowers + Energy Map.**

Structure:

1. **⚡ Суперсила** — THE 1-2 exceptional capabilities (not "well-rounded")
2. **Hard Skills** table (skill, level 1-5, criticality)
3. **Soft Skills** with WHY explanation for THIS role
4. **Карта энергии** — which tasks energize vs drain (hiring insight)

```markdown
### ⚡ Суперсила этой роли

**Главная суперсила:** {the ONE thing where must be exceptional}

> Это то, что отличает отличного сотрудника от хорошего на этой позиции.

### Карта энергии: каких людей искать

| Задача                 | ⚡ Заряжает                        | 🔋 Истощает               |
| ---------------------- | ---------------------------------- | ------------------------- |
| Переговоры с клиентами | Проведение встреч, закрытие сделок | Составление отчётов после |

> 🎯 Идеальный кандидат находит ≥ 60% задач роли заряжающими.
```

### Block 8: Инструменты и технологии

Table: tool, purpose, proficiency level. Include cutting-edge tools from research.

### Block 9: Человек + AI в этой роли

**Based on Stanford SALTLab Human Agency Scale + 3-Bucket Analysis.**

```markdown
## 🤖 Как AI меняет эту роль

| Задача           | Уровень автоматизации         | Как это работает                               |
| ---------------- | ----------------------------- | ---------------------------------------------- |
| Первый драфт КП  | AI делает → человек проверяет | AI генерирует из шаблона, вы персонализируете  |
| Анализ данных    | Партнёрство (50/50)           | AI строит модели, вы интерпретируете и решаете |
| Переговоры с ЛПР | Только человек                | Эмпатия, доверие, считывание невербалики       |

> **Ваша истинная ценность** — то, что AI НЕ может: эмпатия, сложные переговоры, стратегическое мышление, построение отношений.
```

### Block 10: Взаимодействие и зависимости

**Enhanced with Role Dependencies + Blast Radius + Mermaid dependency diagram + Communication Charter.**

Structure:

1. **Mermaid диаграмма зависимостей** — visual upstream/downstream flow
2. **Таблица с blast radius** — через сколько заблокируется
3. **Протокол коммуникации** — channels, response times, async vs sync

Generate a **Mermaid flowchart LR** showing the role's position in the value chain:

```markdown
### 🔗 Карта зависимостей

` ` `mermaid
flowchart LR
MKT["Маркетинг\n(лиды)"] --> YOU["👉 {Role Title}"]
PROD["Продукт\n(информация)"] --> YOU
YOU --> ACC["Аккаунтинг\n(данные клиента)"]
YOU --> MGMT["Руководство\n(прогноз)"]
YOU --> CS["Клиентский сервис\n(передача клиента)"]

    style YOU fill:#172554,stroke:#3b82f6,color:#fff
    style MKT fill:#14532d,stroke:#22c55e,color:#fff
    style PROD fill:#14532d,stroke:#22c55e,color:#fff
    style ACC fill:#78350f,stroke:#f59e0b,color:#fff
    style MGMT fill:#78350f,stroke:#f59e0b,color:#fff
    style CS fill:#78350f,stroke:#f59e0b,color:#fff

` ` `

> 🟢 Зелёный = кто даёт вам входные данные · 🟠 Оранжевый = кто зависит от вашего результата

### Blast Radius: через сколько заблокируется

| Направление       | Кто         | Что зависит                     | Через сколько заблокируется |
| ----------------- | ----------- | ------------------------------- | --------------------------- |
| ⬆️ Вам дают       | Маркетинг   | Квалифицированные лиды          | —                           |
| ⬇️ От вас зависят | Аккаунтинг  | Данные о клиенте для онбординга | 2 дня                       |
| ⬇️ От вас зависят | Руководство | Прогноз выручки                 | 1 неделя                    |

### 📡 Как общаться

| Канал  | Для чего                    | Время ответа | Не использовать для      |
| ------ | --------------------------- | ------------ | ------------------------ |
| Slack  | Быстрые вопросы, FYI        | 4 часа       | Длинных решений, фидбэка |
| Email  | Формальные запросы, клиенты | 24 часа      | Срочных вопросов         |
| Звонок | Только ЧП                   | Сразу        | Всего остального         |
```

### Block 11: Карьерный рост

**Enhanced with Dual Tracks (IC + Management) + Role Inheritance + Mermaid career diagram.**

Generate a **Mermaid flowchart TB** showing dual career tracks. Replace ASCII art with a proper diagram:

```markdown
### Два пути развития: экспертный и управленческий

` ` `mermaid
flowchart TB
YOU["👉 ВЫ ЗДЕСЬ\n{Current Title}, L2"]
MGR_L3["{Manager Title}\nЛюди, L3"]
IC_L3["{Senior Specialist Title}\nЭкспертиза, L3"]
MGR_L4["{Director Title}\nЛюди, L4"]
IC_L4["{Principal Title}\nЭкспертиза, L4"]
VP["{VP Title}\nL5"]

    YOU --> MGR_L3
    YOU --> IC_L3
    MGR_L3 --> MGR_L4
    IC_L3 --> IC_L4
    MGR_L4 --> VP
    IC_L4 --> VP

    style YOU fill:#172554,stroke:#3b82f6,color:#fff
    style MGR_L3 fill:#14532d,stroke:#22c55e,color:#fff
    style MGR_L4 fill:#14532d,stroke:#22c55e,color:#fff
    style IC_L3 fill:#78350f,stroke:#f59e0b,color:#fff
    style IC_L4 fill:#78350f,stroke:#f59e0b,color:#fff
    style VP fill:#3b0764,stroke:#a855f7,color:#fff

` ` `

> 🟢 Зелёный = управленческий трек (люди) · 🟠 Оранжевый = экспертный трек (мастерство)
> Оба трека равноценны по зарплате. Выбирайте по энергии, а не по давлению.
```

**IMPORTANT:** In the actual generated document, use real triple backticks (not escaped). The escape above is only to prevent nested markdown parsing in the skill file.

Show criteria for promotion + approximate timelines in a table after the diagram.

### Block 12: Профиль кандидата

**Enhanced with GWC filter (EOS/Traction).**

Education, experience, personality profile + GWC:

- **G — Get it:** Понимает ли суть роли, культуру, систему?
- **W — Want it:** Искренне хочет именно ЭТУ работу, а не просто должность?
- **C — Capacity:** Есть ли интеллектуальные, эмоциональные, физические и временные ресурсы?

> Все три = ✅. Один ❌ = не тот человек, даже если результаты пока ОК.

### Block 13: Типичный рабочий день

Hourly schedule table. **Enhanced with Cognitive Load profile.**

After the schedule, add:

```markdown
### 🧠 Когнитивная нагрузка

| Тип нагрузки             | Источник                    | Как снизить                            |
| ------------------------ | --------------------------- | -------------------------------------- |
| Основная (сама работа)   | Сложные переговоры с ЛПР    | Подготовка брифов, decision frameworks |
| Лишняя (плохие процессы) | 4 разных системы отчётности | Консолидировать в одну CRM             |

> 🎯 Минимум: 2-часовые блоки без прерываний, 3 раза в неделю
```

### Block 14: Онбординг: First 5 Wins + План 30-60-90

**Enhanced with First 5 Wins + Sprint structure + Graduation criteria + Support triangle.**

Structure:

1. **Первые 5 побед** (неделя 1-4) — конкретные quick wins для momentum
2. **Sprint-based 30-60-90** с deliverables на каждом этапе
3. **Критерии выпуска** — когда онбординг завершён (pass/fail)
4. **Треугольник поддержки** — Manager + Mentor + Buddy

```markdown
### 🏆 Первые 5 побед

| #   | Что сделать                                 | Срок     | Зачем                            |
| --- | ------------------------------------------- | -------- | -------------------------------- |
| 1   | Провести 1-on-1 с каждым из стейкхолдеров   | Неделя 1 | Построить отношения              |
| 2   | Провести аудит одного процесса              | Неделя 2 | Найти quick fix                  |
| 3   | Починить одну видимую проблему              | Неделя 3 | Заработать доверие               |
| 4   | Выдать первый осязаемый результат           | Неделя 4 | Доказать ценность                |
| 5   | Презентовать "State of Things" руководителю | Неделя 4 | Показать видение свежим взглядом |

### Критерии выпуска (Day 90)

- [ ] Все deliverables 30-60-90 выполнены
- [ ] Самооценка ≥ 4/5 по ключевым компетенциям
- [ ] Первый самостоятельный результат сдан
- [ ] Руководитель подтверждает готовность

### Ваша команда поддержки

| Роль             | Зона                                  | Частота                |
| ---------------- | ------------------------------------- | ---------------------- |
| **Руководитель** | KPI, цели, развитие                   | Еженедельный 1-on-1    |
| **Наставник**    | Технические навыки, процессы          | Ежедневно первый месяц |
| **Buddy**        | Культура, навигация, "глупые вопросы" | По запросу             |
```

Then the standard 30-60-90 day tables (Learning → Contributing → Leading).

**Self-assessment tracking** — repeat at each milestone:

```markdown
### 📊 Самооценка (повторяется на Day 30 / 60 / 90)

| Навык          | Уверенность (1-5) | Пример / доказательство | Где нужна помощь |
| -------------- | ----------------- | ----------------------- | ---------------- |
| {Core skill 1} | \_\_              |                         |                  |
| {Core skill 2} | \_\_              |                         |                  |

> Заполняйте честно. Если самооценка < 4 — запросите дополнительное обучение.
> Разрыв между вашей оценкой и оценкой руководителя = точка роста (не повод для паники).
```

**Rule:** The SAME competency table is repeated at Day 30, 60, 90 to show visual growth trajectory (Google Noogler research: +15% faster productivity when self-assessment is built into onboarding).

### Block 15: Система мотивации

**Enhanced with AMP Framework (Dan Pink) + Career Conversations (Russ Laraway) + Job Crafting (Amy Wrzesniewski, Yale).**

Structure:

1. Material motivation (adapted by role type)
2. **AMP-рычаги** — Autonomy / Mastery / Purpose для конкретной роли
3. **Career Conversations** — 3 разговора (Прошлое → Видение → План)
4. **Job Crafting** — как сотрудник может перекраивать роль в рамках границ

```markdown
### Мотивационные рычаги этой роли (AMP)

| Рычаг          | Что это значит для вас                                                |
| -------------- | --------------------------------------------------------------------- |
| **Автономия**  | Мы определяем ЧТО (цели). Вы определяете КАК (методы, график)         |
| **Мастерство** | 4 часа в неделю на обучение. Путь к {конкретный навык/сертификация}   |
| **Цель**       | Каждый ваш {результат} напрямую влияет на {бизнес-результат клиентов} |

### 🔧 Job Crafting: как сделать эту роль «своей»

Вы можете адаптировать роль под свои сильные стороны — в рамках фиксированных обязанностей:

| Тип адаптации  | Что можно менять                         | Пример                                                                |
| -------------- | ---------------------------------------- | --------------------------------------------------------------------- |
| **Задачи**     | Какие задачи брать на себя дополнительно | Взять на себя менторинг новичков, если нравится обучать               |
| **Отношения**  | С кем и как взаимодействовать            | Углубить работу с продуктовой командой для лучшего понимания продукта |
| **Восприятие** | Как вы осмысляете свою работу            | "Я не обрабатываю заявки — я помогаю людям решить их бизнес-проблему" |
| **⚠️ Границы** | Что менять нельзя                        | Основные обязанности и KPI остаются фиксированными                    |

> По данным Yale (Amy Wrzesniewski): сотрудники, которые crafтят свою работу, демонстрируют более высокую вовлечённость, мотивацию и результативность.
```

### Block 16: Регламенты и процессы

**Enhanced with Mermaid process flowchart + DO-CONFIRM / READ-DO checklists + SBAR protocol + Exception handling.**

Structure:

1. **Mermaid flowchart** of the PRIMARY business process for this role
2. Key processes (trigger → steps → result)
3. **Checklists with type labels:** [DO-CONFIRM] for experienced, [READ-DO] for new/rare tasks
4. **SBAR for status updates:** Situation, Background, Assessment, Recommendation
5. **Exception handling:** "When process doesn't apply" framework
6. Scripts (ONLY for communication roles)

Generate a **Mermaid flowchart TB** showing the main business process of this role. Adapt to the role type:

- Sales: lead qualification → meeting → proposal → negotiation → close → handoff
- DevOps: code commit → build → test → deploy → monitor → incident response
- HR Recruiter: sourcing → screening → interview → offer → onboarding
- Support: ticket → classify → resolve/escalate → close → retrospective

```markdown
` ` `mermaid
flowchart TB
A["Входящий лид"] --> B{"Квалификация\n(BANT)"}
B -->|Квалифицирован| C["Встреча / презентация"]
B -->|Не подходит| D["Возврат в маркетинг"]
C --> E["Коммерческое предложение"]
E --> F{"Решение клиента"}
F -->|Да| G["Договор + оплата"]
F -->|Возражения| H["Отработка возражений"]
H --> F
F -->|Отказ| I["Анализ причин\n→ CRM"]
G --> J["Передача в аккаунтинг"]

    style A fill:#14532d,stroke:#22c55e,color:#fff
    style G fill:#172554,stroke:#3b82f6,color:#fff
    style D fill:#78350f,stroke:#f59e0b,color:#fff
    style I fill:#78350f,stroke:#f59e0b,color:#fff

` ` `
```

**IMPORTANT:** In the actual generated document, use real triple backticks. The escape above is only to prevent nested markdown parsing in the skill file. Adapt the flowchart completely to the specific role — the example above is for sales only.

```markdown
### Обработка исключений (когда стандартный процесс не подходит)

1. Могу ли я решить это в рамках своих полномочий? → Решайте
2. Совпадает ли решение с нашими ценностями? → Действуйте
3. Смогу ли я спокойно объяснить это руководителю? → Делайте
4. Задокументируйте: что случилось, что сделали, почему
5. Отметьте исключение для улучшения процесса
```

### Block 17: Red Flags и система раннего предупреждения

**Enhanced with 5 Stages of Disengagement + Stay Interviews + Pre-quitting behaviors.**

Structure:

1. **Red flags by role category** (leading behavioral indicators)
2. **5 стадий отключения** (Discontent → Decreased productivity → Withdrawal → Absenteeism → Total disengagement)
3. **Stay Interview** — 4 вопроса каждые 90 дней
4. **Performance review criteria** (table: criterion, weight, scale)
5. **Skill Sprints** instead of traditional PIPs

```markdown
### 📊 Stay Interview (каждые 90 дней)

Руководитель задаёт 4 вопроса. Слушает 80%, говорит 20%.

1. Что в вашей работе заставляет вас вставать с энтузиазмом?
2. Какую часть работы вы бы убрали, если бы могли?
3. Используются ли ваши сильные стороны на полную?
4. Если бы вы уходили завтра — какова наиболее вероятная причина?
   → В течение 48 часов руководитель предпринимает ОДНО конкретное действие.

### Вместо PIP — Skill Sprints

Вместо 60-90 дневного плана улучшения (PIP): 2-недельные спринты, каждый фокусируется на ОДНОМ навыке. Ежедневные чек-ины. Чёткие критерии успеха.
```

### Block 18: FAQ

Table: 5-8 questions. Mix FROM employee and ABOUT the role.

### Block 19: Отраслевой контекст

**Enhanced with 3-Layer Context + Durable Skills + AI Impact.**

Structure:

1. **Layer 1 — Вечные динамики** (principles that last 5+ years, never update)
2. **Layer 2 — Направление движения** ("от X → к Y" format, review annually)
3. **Layer 3 — Текущий снимок** (specific data, marked with review date)
4. **Durable / Semi-durable / Perishable skills** for this role
5. **AI impact** on this specific role

```markdown
### Навыки по сроку годности

| Тип                | Примеры                                              | Срок жизни |
| ------------------ | ---------------------------------------------------- | ---------- |
| 🌳 Долговечные     | Переговоры, стратегическое мышление, эмпатия         | 7+ лет     |
| 🌿 Полудолговечные | SPIN-selling, Agile, CRM-методологии                 | 2-7 лет    |
| 🍃 Скоропортящиеся | Конкретные версии инструментов, текущие AI-платформы | < 2 лет    |

> 🎯 Инвестируйте в 🌳 — они дают компаундный эффект на всю карьеру.

### 📚 Непрерывное обучение и Skill Stacking

| Формат               | Описание                                                                        | Время     |
| -------------------- | ------------------------------------------------------------------------------- | --------- |
| **В потоке работы**  | Микро-обучение во время задач: AI-assisted research, peer review, разбор кейсов | Ежедневно |
| **Выделенное время** | Глубокое изучение: курсы, книги, сертификации                                   | {X} ч/мес |

**Рекомендуемый стек навыков:**
{Основной навык} + {Смежный навык 1} + {Смежный навык 2}
→ Эта комбинация создаёт: {уникальное конкурентное преимущество}

> По данным Josh Bersin: у сотрудника в среднем 24 минуты в неделю на формальное обучение. Поэтому главный рост происходит в потоке работы, а не на курсах.
```

### Block 20: Связь с бизнес-целями

**Enhanced with Context Over Control charter (Netflix).**

Table: Business Goal | How the role impacts it | Impact metric + Context paragraph:

```markdown
> **Контекст для принятия решений:** {1 paragraph — how the business makes money, where this role fits, current strategic challenge. So the employee can make good autonomous decisions.}
```

### Block 21: Failure Modes Pre-Mortem

**THE #3 wow-element.** Based on FMEA methodology + Leadership IQ data (46% of new hires fail in 18 months; 89% from attitude, not skills).

```markdown
## ⚠️ Как люди обычно проваливаются на этой роли

| Типичный провал                     | Ранние сигналы                                               | Профилактика                                   |
| ----------------------------------- | ------------------------------------------------------------ | ---------------------------------------------- |
| Пытается всё делать сам             | Пропускает 1-on-1, не делегирует, становится узким горлышком | Еженедельный чек делегирования с руководителем |
| Оптимизирует срочное вместо важного | Реактивный календарь, стратегические задачи сдвигаются       | Time-block 4 ч/нед на стратегическую работу    |
| Избегает трудных разговоров         | Проблемы с производительностью тлеют, растёт недовольство    | Ежемесячный цикл прямой обратной связи         |

> 💡 89% увольнений в первые 18 месяцев — из-за soft skills, а не технических навыков (Leadership IQ, 20 000+ наймов).
```

### Block 22: "Working with me" — персональный README

**Template that the role-holder fills in** during first month. Eliminates months of team friction by making working style explicit. (HackerNoon "12 Manager READMEs from Silicon Valley"; Notion templates; Washington Post Graphics team)

```markdown
## 👤 "Как со мной работать" (заполняется сотрудником)

**Мой стиль общения:** {напр. "Я думаю письменно. Пришлите документ, а не приглашение на встречу."}
**Как давать мне обратную связь:** {напр. "Прямо и конкретно. Не смягчайте."}
**Что меня заряжает:** {напр. "Решать запутанные проблемы. Мозговые штурмы с умными людьми."}
**Что меня истощает:** {напр. "Статус-митинги без решений. Ожидание согласований."}
**Моя особенность:** {напр. "Когда молчу — обдумываю, а не несогласен."}
**Как понять, что я в стрессе:** {напр. "Начинаю отвечать односложно."}
**Если мы не согласны:** {напр. "Спорьте прямо. Я уважаю аргументы больше, чем согласие."}
```

**Rule:** This block is a template — generate it with placeholder prompts, not pre-filled content. The employee fills it in during onboarding Week 2-3.

### Block 23: Протокол непрерывности ("Hit by a Bus")

```markdown
## 🚌 Если я исчезну завтра

**Критические знания:**

- [ ] Все пароли/доступы в общем хранилище (обновляется ежемесячно)
- [ ] Контакты ключевых контрагентов задокументированы
- [ ] SOP для каждого повторяющегося процесса в {shared location}
- [ ] История ключевых решений задокументирована

**Кто подхватит:**
| Функция | Основной | Дублёр | Последнее обучение |
|---------|----------|--------|-------------------|
| {функция} | Эта роль | {имя} | {дата} |
```

### Block 24: Role Canvas (одностраничная сводка)

Visual summary of the entire role on one "page":

```markdown
## 📋 Role Canvas: {Title}

| 🎯 МИССИЯ               | 📊 КЛЮЧЕВЫЕ МЕТРИКИ  |
| ----------------------- | -------------------- |
| {Зачем роль существует} | {North Star + 3 KPI} |

| ⚡ СУПЕРСИЛА                   | 🚫 АНТИ-ЦЕЛИ             |
| ------------------------------ | ------------------------ |
| {1-2 exceptional capabilities} | {Top 3 things NOT to do} |

| 🎯 РЕШЕНИЯ (автономия)  | 🔗 ЗАВИСИМОСТИ               |
| ----------------------- | ---------------------------- |
| {What you decide alone} | {Who is blocked if you fail} |

| 📈 КАРЬЕРНЫЙ ПУТЬ            | 🏆 ПЕРВАЯ ПОБЕДА     |
| ---------------------------- | -------------------- |
| {Current → Next → Long-term} | {Week 1-2 quick win} |
```

### Block 25: Footer (CTA + Evolution)

```markdown
---

## 🔄 Когда пересматривать эту инструкцию
- Команда выросла > 8 человек
- AI автоматизировал > 20% текущих задач
- Ключевые результаты не достигаются 2 квартала подряд
- Стратегия компании существенно изменилась
- Каждые 6 месяцев в любом случае

**Версия:** 1.0 · **Дата:** {date}

---

> Создано на платформе MegaCampus AI
> Хотите обучить сотрудника на эту должность?
> **[Создать курс обучения →](/create?from_jd={slug})**
```

---

# Phase 2: Review & Publish

### Step 2.1: Review with User

**STOP and present** summary of key sections. Iterate until approved.

### Step 2.2: Generate Course Brief

```json
{
  "position_title": "...",
  "target_audience": "...",
  "learning_goals": ["from Block 7 competencies + Block 6 KPIs"],
  "suggested_modules": [
    { "title": "...", "based_on_block": "competencies|tools|kpi|processes", "skills": ["..."] }
  ],
  "course_size": "small|medium|large",
  "estimated_duration_hours": 8
}
```

### Step 2.3: Publish to Supabase

Insert into `job_descriptions` table via MCP with all fields.

### Step 2.4: Confirm Publication

Show: title, department, slug, status = published.

---

# Content Quality Rules

## DO:

- Define roles by OUTCOMES, not activities (Job Scorecard)
- Pair every output metric with a quality counter-metric (Andy Grove)
- Include Anti-goals, Failure Modes, Decision Matrix in EVERY guide (80% of wow)
- Use Traffic Light system with mandatory ACTIONS, not just colors
- Include DO-CONFIRM/READ-DO labels on all checklists
- Add "Blast Radius" — who is blocked if this role fails
- Include Human-AI task allocation for every role
- Write Energy Map — which tasks energize vs drain
- Add Cognitive Load profile — how many parallel tracks
- Use 3-layer industry context (enduring/directional/snapshot)
- Classify skills as Durable/Semi-durable/Perishable
- Reference research sources naturally ("По данным Netflix...", "Компании уровня Amazon...")
- Generate 3 Mermaid diagrams: career path (Block 11), dependencies (Block 10), main process (Block 16)
- **Mermaid rules:** use `flowchart TB` for career/process, `flowchart LR` for dependencies. Dark fills only: Blue `#172554`, Green `#14532d`, Orange `#78350f`, Purple `#3b0764`. Short labels (2-4 words per node). Add `color:#fff` to all style declarations

## DON'T:

- Generate the entire document in one Write call
- Use template phrases ("ответственный, коммуникабельный, стрессоустойчивый")
- Write vague obligations without Definition of Done
- Skip Anti-metrics warnings in KPI section
- List 15+ generic skills — identify 1-2 Superpowers instead
- Use traditional PIPs — recommend Skill Sprints
- Write in legal/bureaucratic language
- Invent trends — use WebSearch for current data
- Make up salary numbers — use ranges

## Adaptive Blocks Reference

| Block                  | Condition                                        | Action                     |
| ---------------------- | ------------------------------------------------ | -------------------------- |
| 4 Quarterly duties     | Only for Lead/Director                           | Skip for Junior-Senior     |
| 9 Human-AI allocation  | All roles                                        | Adapt tasks by role type   |
| 15 Material motivation | Sales → KPI bonuses, IT → grades, Ops → premiums | Adapt                      |
| 16.5 Scripts           | Only for Sales, Support, HR                      | Skip for IT, Finance, etc. |
| 19 Industry context    | Needs current data                               | Use WebSearch              |
| 22 Continuity          | Critical for roles with unique knowledge         | Lighter for junior roles   |

---

# Validation Checklist

### Phase 0:

- [ ] Position parsed: department, level, specialization
- [ ] 3-5 adaptive questions asked in one message
- [ ] **Role research completed** — 2-3 web searches, insights for KPIs, tools, trends, failures
- [ ] Slug and metadata confirmed by user

### Phase 1:

- [ ] All 26 blocks generated (conditional blocks skipped where appropriate)
- [ ] Generated in 6 groups, not all at once
- [ ] **Anti-goals present** (Block 2) — at least 4 items
- [ ] **Decision authority matrix present** (Block 5) — at least 4 decisions mapped
- [ ] **Failure modes pre-mortem present** (Block 21) — at least 3 patterns
- [ ] **North Star Metric defined** in Block 1
- [ ] KPIs use Input/Output pairing with Traffic Light system
- [ ] Competencies include Superpowers + Energy Map
- [ ] **Human-AI allocation present** (Block 9)
- [ ] Onboarding includes First 5 Wins + Graduation criteria
- [ ] **Research insights integrated** — at least 3 findings woven into blocks
- [ ] Written for business owners (not HR)
- [ ] **Role Canvas one-pager present** (Block 24)
- [ ] **3 Mermaid diagrams:** career path (Block 11), dependencies (Block 10), main process (Block 16)

### Phase 2:

- [ ] User reviewed and approved content
- [ ] MD saved to `docs/job-descriptions/{slug}.md`
- [ ] Course brief generated
- [ ] Published to Supabase
