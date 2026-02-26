# Gastown: анализ для проекта MC2

## Context

Мы уже используем **Beads v0.52.0** как основную систему git-native issue tracking в проекте MC2. Beads глубоко интегрирован в наш workflow: 1094 issue, 8 workflow formulas, 5 git hooks, exclusive locking для multi-terminal работы, конституция v1.2.0 обязывает всю работу вести через Beads.

**Gastown** (v0.7.0, released 2026-02-16) — это следующий уровень от того же автора (Steve Yegge). Если Beads — это система учёта работы, то Gastown — это **оркестрация множества AI-агентов** с персистентным состоянием, работающих над одним или несколькими проектами одновременно.

---

## 1. Что такое Gastown

Gastown — multi-agent workspace manager для Claude Code (и других AI-рантаймов: Codex, Gemini, Copilot, Cursor). Ключевая идея: координация 20-30 AI-агентов, работающих параллельно, с сохранением контекста, истории и ответственности.

### Архитектура

```
Town (~/gt/)               — Рабочее пространство (workspace)
  Mayor                    — AI-координатор (главный агент)
  Deacon                   — Фоновый daemon-supervisor
  Rig (project)            — Контейнер проекта (git-репозиторий)
    Witness                — Мониторинг здоровья агентов в рамках rig
    Refinery               — Merge queue (ребейз, конфликты, верификация)
    Crew                   — Персистентные рабочие пространства (для людей)
    Polecats               — Worker-агенты (persistent identity, ephemeral sessions)
```

### Ключевые концепции

| Концепция    | Описание                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------ |
| **Mayor**    | AI-координатор. Ты говоришь ему, что хочешь построить — он декомпозирует, создаёт convoys, спавнит агентов   |
| **Polecats** | Worker-агенты с постоянной идентичностью, но эфемерными сессиями. CV накапливается. Работают в git worktrees |
| **Convoys**  | Единицы батчевой работы — группируют related beads, трекают прогресс, уведомляют при завершении              |
| **Hooks**    | Git worktree-based persistent storage. Работа переживает краши и рестарты агентов                            |
| **Refinery** | Автоматический merge queue с верификацией, ребейзами, обработкой конфликтов                                  |
| **GUPP**     | "If there's work on your hook, YOU RUN IT" — принцип автономности агентов                                    |
| **Seance**   | Коммуникация с предыдущими сессиями агента для восстановления контекста                                      |

---

## 2. Что мы уже используем (Beads в MC2)

| Возможность       | Текущий статус            | Как используем                                 |
| ----------------- | ------------------------- | ---------------------------------------------- |
| Issue tracking    | `bd` CLI, 1094 issues     | Полный цикл: create/update/close               |
| Workflow formulas | 8 формул                  | bigfeature, bugfix, hotfix, release и др.      |
| Molecules/Wisps   | Активно                   | Wisps для exploration, molecules для workflows |
| Git hooks         | 5 хуков                   | post-checkout, pre-commit, pre-push, etc.      |
| Exclusive locking | Включён                   | Multi-terminal работа без конфликтов           |
| Dolt backend      | Да                        | SQL-based хранение issues                      |
| Patrols           | code-review, health-check | Регулярные проверки                            |
| REF: issues       | ~10+                      | База знаний проекта                            |
| Label routing     | По директориям            | frontend, backend, database, etc.              |
| Spec-kit bridge   | Для больших фич           | requirements -> design -> tasks                |

### Чего НЕТ сейчас

- Параллельная работа нескольких AI-агентов на одном проекте
- Автоматический merge queue (мы мержим вручную)
- Persistent identity для AI workers (каждая сессия начинается с нуля)
- Мониторинг здоровья агентов (Witness/Deacon)
- Attribution — трекинг кто из агентов что сделал
- Convoy-based work tracking — батчевое отслеживание связанных задач
- A/B тестирование моделей на реальных задачах
- Escalation system с severity routing
- Dashboard для мониторинга всех агентов

---

## 3. Преимущества Gastown для MC2

### 3.1. Масштабирование AI-разработки (HIGH IMPACT)

**Проблема сейчас:** Мы работаем максимум в 2-3 терминала, каждый делает свою задачу. Координация ручная через Beads locking.

**Gastown решает:** Mayor декомпозирует большую задачу, создаёт convoy из 5-10 beads, спавнит polecats, каждый работает в своём git worktree. Refinery автоматически мержит. Witness следит, что никто не застрял.

**Пример для MC2:** "Обновить все enrichment handlers для нового формата" — Mayor создаёт 7 issues (по одному на handler), спавнит 7 polecats, каждый работает параллельно, Refinery мержит по готовности.

### 3.2. Persistent Agent Identity и CV (MEDIUM-HIGH IMPACT)

**Проблема сейчас:** Каждая сессия Claude Code начинается с нуля. Нет понимания, какой "агент" лучше справляется с фронтендом, какой с pipeline.

**Gastown решает:** Каждый polecat имеет постоянную идентичность и CV (capability ledger). Можно видеть: "Toast выполнил 47 Go-задач, 12 Python, 3 TypeScript". Routing по навыкам.

**Для MC2:** Со временем можно определить, какие модели/конфигурации лучше работают с нашим pipeline (stages), какие — с фронтендом, какие — с database migrations.

### 3.3. Автоматический Merge Queue (HIGH IMPACT)

**Проблема сейчас:** Мы вручную мержим ветки. При параллельной работе — конфликты, забытые ребейзы, поломанные билды.

**Gastown Refinery:**

- Автоматический ребейз на target branch
- Прогон тестов/type-check перед мержем
- При конфликте — спавн свежего polecat для ре-имплементации
- Integration branches для epics (мержатся как один commit)

### 3.4. Resilience & Self-Healing (MEDIUM IMPACT)

**Проблема сейчас:** Если Claude Code крашится — работа может потеряться. Нужно руками восстанавливать контекст.

**Gastown решает:**

- Hooks сохраняют состояние работы в git
- Witness обнаруживает застрявших/мёртвых polecats
- Автоматический respawn с восстановлением контекста через `gt prime`
- Checkpoint-based recovery для `gt done` (v0.7.0)
- Stale escalation с автоматическим re-dispatch

### 3.5. Observability & Dashboard (MEDIUM IMPACT)

**Проблема сейчас:** Нет единого view на то, что делают все агенты. `bd list` показывает issues, но не live activity.

**Gastown:**

- Web dashboard с real-time view
- `bd activity --follow` — стрим всех событий
- Convoy status — прогресс по батчам
- Agent stats — производительность агентов
- Escalation history — аудит проблем

### 3.6. Multi-Runtime Support (HIGH IMPACT)

У нас есть подписки на **Claude Code**, **ChatGPT (Codex CLI)** и **Gemini** — это идеальный сетап для Gastown, который нативно поддерживает все три рантайма одновременно.

#### Встроенные пресеты агентов

| Preset   | Runtime           | CLI       | Наша подписка  |
| -------- | ----------------- | --------- | -------------- |
| `claude` | Claude Code       | `claude`  | Есть           |
| `codex`  | OpenAI Codex      | `codex`   | Есть (ChatGPT) |
| `gemini` | Google Gemini     | `gemini`  | Есть           |
| `cursor` | Cursor IDE        | `cursor`  | --             |
| `auggie` | Augment Code      | `augment` | --             |
| `amp`    | Amp (Sourcegraph) | `amp`     | --             |

Также можно настраивать кастомные конфигурации:

```bash
gt config agent set claude-opus "claude --model opus"
gt config agent set claude-sonnet "claude --model sonnet"
gt config agent set codex-high "codex --thinking high"
gt config agent set gemini-pro "gemini"
```

#### Мульти-модельный swarm в одном convoy

Ключевая возможность — **разные polecats в одном convoy могут использовать разные рантаймы**:

```bash
# Один convoy, три разных AI-модели работают параллельно
gt convoy create "Enrichment Refactor" gt-abc gt-def gt-ghi --notify

gt sling gt-abc myproject --agent claude     # Claude на архитектурную задачу
gt sling gt-def myproject --agent codex      # Codex на рутинный фикс
gt sling gt-ghi myproject --agent gemini     # Gemini на документацию
```

Или Mayor сам распределяет по моделям:

```bash
gt mayor attach
# "Распредели эти 10 задач между Claude, Gemini и Codex по их сильным сторонам"
```

#### Практические преимущества трёх подписок

**1. Обход rate limits одного провайдера**
Если Claude упирается в лимит — Gemini и Codex продолжают работать. Три подписки = три независимых потока без простоев.

**2. A/B тестирование на реальных задачах проекта**
Gastown attribution трекает, какая модель использовалась для каждой задачи:

```bash
# Объективная статистика по моделям
bd stats --actor=mc2/polecats/* --group-by=model

# CV конкретного polecat (включая runtime)
bd audit --actor=mc2/polecats/Toast    # Claude
bd audit --actor=mc2/polecats/Shadow   # Gemini
bd audit --actor=mc2/polecats/Copper   # Codex
```

Со временем накапливаются данные: какая модель лучше для frontend (Next.js), какая для pipeline (stages), какая для database migrations, какая для тестов.

**3. Routing по сильным сторонам моделей**

Стартовая конфигурация (до получения данных A/B):

| Тип задачи                                   | Runtime                                  | Обоснование                                  |
| -------------------------------------------- | ---------------------------------------- | -------------------------------------------- |
| Token-heavy (большие файлы, review, анализ)  | Gemini                                   | Максимальный контекст (2M), щедрые лимиты    |
| Сложные задачи (архитектура, рефакторинг)    | **Тройной A/B: Claude + Codex + Gemini** | Все три на одинаковых задачах, данные решают |
| Рутина (фиксы, тесты, переводы, boilerplate) | Claude Sonnet                            | Быстрый, надёжный workhorse                  |
| Frontend components                          | A/B тест                                 | Определим по данным                          |
| Pipeline stages                              | A/B тест                                 | Определим по данным                          |
| Database migrations                          | A/B тест                                 | Определим по данным                          |

**Стратегия тройного A/B на сложных задачах:**
Для каждой сложной задачи создаём 3 одинаковых bead, каждый sling на свой runtime. Сравниваем: время выполнения, качество кода, количество итераций, прохождение type-check/tests. Через 10-20 таких экспериментов — объективная картина.

**4. 3x throughput без дополнительных затрат**
Три подписки уже оплачены. Gastown позволяет использовать их **одновременно** вместо последовательного переключения между ними. Это чистый выигрыш в скорости.

#### Экономика multi-runtime

| Подход                            | Параллельные потоки | Стоимость                 | Throughput |
| --------------------------------- | ------------------- | ------------------------- | ---------- |
| Сейчас (Claude only)              | 1-3                 | 1 подписка                | 1x         |
| Gastown (Claude + Codex + Gemini) | 5-15+               | 3 подписки (уже оплачены) | 3-5x       |

Важно: каждый polecat — это **одна CLI-сессия** соответствующего провайдера. Три подписки позволяют иметь несколько polecats на каждом рантайме одновременно (зависит от rate limits каждого провайдера).

### 3.7. Plugin System (LOW-MEDIUM IMPACT)

Расширяемая система плагинов для автоматизации повторяющихся задач. TOML-based формат, gate-система (cooldown, cron, condition), dispatch через Dogs.

### 3.8. Escalation System (MEDIUM IMPACT)

Severity-based routing (low -> medium -> high -> critical) с автоматическим re-escalation при игнорировании. Каналы: bead, mail, email, SMS, Slack.

---

## 4. Gap-анализ: что нужно для внедрения

### Технические требования

| Требование            | Текущее состояние         | Что нужно                          |
| --------------------- | ------------------------- | ---------------------------------- |
| Beads >= 0.55.4       | v0.52.0 (dev)             | Обновить beads до >=0.55.4         |
| Go 1.23+              | Не установлен (проверить) | Установить Go                      |
| Git 2.25+ (worktrees) | Есть                      | OK                                 |
| tmux 3.0+             | Скорее всего есть         | Проверить                          |
| sqlite3               | Обычно предустановлен     | Проверить                          |
| Dolt SQL Server       | Используем Dolt в beads   | Gastown запускает свой Dolt server |

### Организационные аспекты

| Аспект     | Текущее                          | При Gastown                       |
| ---------- | -------------------------------- | --------------------------------- |
| Workspace  | Каждый проект отдельно           | Town workspace объединяет проекты |
| Агенты     | 1-3 terminal, ручная координация | Mayor координирует 5-20+ polecats |
| Merge      | Ручной через git                 | Автоматический через Refinery     |
| Мониторинг | `bd list`, ручной                | Dashboard + Witness + Deacon      |
| Деплой     | `/deploy` через наш скрипт       | Интеграция через formula/convoy   |

---

## 5. Что говорит сообщество

### 5.0.1. Положительные отзывы

**DoltHub (15 января 2026)** — [A Day in Gas Town](https://www.dolthub.com/blog/2026-01-15-a-day-in-gas-town/):

> "Вся оркестрация работает. Множество агентов спавнятся. Система подталкивает их завершать задачи. Тесты запускаются. PR-ы создаются и... мержатся. Работать с Mayor — одно удовольствие."

**Enterprise Vibe Code (Medium)** — 10 hours with Gas Town:

> "Я прошёл от генерации 5 PR за первые три часа до создания 36 PR за последние четыре часа." Автор подчёркивает: "Теперь мы все — менеджеры агентов. Ваш span of control напрямую коррелирует с вашим вниманием и памятью."

**Justin Abrahms** — [Wrapping my head around Gas Town](https://justin.abrah.ms/blog/2026-01-05-wrapping-my-head-around-gas-town.html):

> Поставил Gas Town, выполнил реальную работу (single rig, без convoy). Система сломалась один раз, но после рестарта продолжила точно с того места, где остановилась. Главная проблема — "нужно ОЧЕНЬ много планирования, чтобы кормить двигатель задачами. Он пожирает implementation plans быстрее, чем ты их создаёшь."

### 5.0.2. Критические отзывы и проблемы

**Simon Hartcher** — [My thoughts after 10,000 hours of Claude Code](https://simonhartcher.com/posts/2026-01-19-my-thoughts-on-gas-town-after-10000-hours-of-claude-code/):

- Потеря видимости: результаты появляются без понимания процесса
- Медленная работа при малом количестве агентов (ожидание из-за скорости токенов)
- Beads загрязняет git — метаданные попадают в PR вместе с кодом
- Вердикт: "Круто, но пока не для меня"

**DoltHub** (тот же обзор — про качество):

- Ни один из 4 сгенерированных PR не оказался приемлемым
- Пришлось закрыть все и сделать reset репозитория после несанкционированных мержей
- Система мержила код несмотря на падающие тесты

**Paddo.dev** — [Two Kinds of Multi-Agent](https://paddo.dev/blog/gastown-two-kinds-of-multi-agent/):

> "Хаос Gas Town реален: $100/час burn rate, автомерж падающих тестов, 'бешеный Deacon, удаляющий код'. Две недели возраста и дикость."

**Shipyard** — [Multi-agent orchestration for Claude Code](https://shipyard.build/blog/claude-code-multi-agent/):

> "Мульти-агентные workflow не для 95% задач. Сейчас это дорогой и экспериментальный способ делать большие проекты."

### 5.0.3. Практические рекомендации сообщества

| Совет                                                                                                        | Источник       |
| ------------------------------------------------------------------------------------------------------------ | -------------- |
| **Начинайте с vanilla**: Plan Mode + verification loops покрывает типичные задачи                            | Paddo.dev      |
| **Идеальные промпты обязательны**: в отличие от интерактивных сессий, нет возможности корректировать на ходу | Shipyard       |
| **Автоматические тесты на каждый коммит**: агенты должны валидировать свою работу                            | Shipyard       |
| **Три подписки Claude Max** может потребоваться для поддержания темпа                                        | Shipyard       |
| **Подходит для НОВЫХ проектов** с guardrails; осторожно с established codebases                              | DoltHub        |
| **Нужно много планирования**: двигатель пожирает задачи быстрее чем вы их создаёте                           | Justin Abrahms |

### 5.0.4. Сравнение с альтернативами

| Аспект                         | Gas Town                        | Multiclaude (Dan Lorenc)                         |
| ------------------------------ | ------------------------------- | ------------------------------------------------ |
| Сложность                      | Высокая                         | Низкая                                           |
| Лучше для                      | Соло-разработчик, хобби-проекты | Команды, коллаборация                            |
| Параллелизация                 | Сильнее                         | Слабее                                           |
| Длительность автономной работы | Короткие burst-ы                | Длинные автономные сессии                        |
| Философия                      | "Kubernetes для агентов"        | "Brownian ratchet" — автомерж при прохождении CI |

### 5.0.5. Вывод из community feedback

**Gastown — это перспективная, но сырая технология.** Архитектура звучит правильно, но практика показывает:

- Качество output-а агентов нестабильно — нельзя доверять автомержу
- Нужны жёсткие guardrails (type-check, tests, manual review перед мержем)
- Стоимость может быть высокой при интенсивном использовании
- Главная ценность — для ПАРАЛЛЕЛИЗИРУЕМЫХ задач, где можно ожидать 3-5x ускорение
- Для рутинной работы vanilla Claude Code + Beads (как у нас сейчас) достаточно

---

## 5A. Риски и ограничения (наш контекст)

### 5A.1. Зрелость проекта

- v0.7.0 — проект активно развивается, но ещё молодой
- 135 коммитов только за последний релиз — быстрый темп изменений
- Возможны breaking changes между версиями

### 5A.2. Сложность

- Gastown добавляет значительный слой абстракций: Mayor, Witness, Refinery, Deacon, Dogs, Polecats, Convoys, Hooks
- Кривая обучения для понимания всей архитектуры
- Debugging может быть сложнее при проблемах

### 5A.3. Требование обновления Beads

- Gastown требует beads >= 0.55.4, у нас 0.52.0
- Обновление может потребовать миграции данных
- Нужно тестировать совместимость с нашими hooks и formulas

### 5A.4. Ресурсы

- **Подписки, не API:** Каждый polecat — это CLI-сессия (Claude Code, Codex CLI, Gemini CLI), работающая через **подписку**, а не API. Дополнительных расходов на API нет. Ограничение — rate limits подписок каждого провайдера (количество одновременных сессий/запросов)
- tmux сессии требуют ресурсов (RAM, CPU)
- Dolt SQL Server — дополнительный daemon
- Больше polecats = больше нагрузка на локальную машину (tmux panes, git worktrees, процессы CLI)

### 5A.5. Наша специфика

- Мы работаем преимущественно в одном monorepo (mc2)
- Gastown оптимизирован для multi-repo сценариев
- Часть функционала (federation, cross-rig) нам не нужна

---

## 6. План внедрения

### Phase 1: Установка и настройка инфраструктуры

**Цель:** Установить все компоненты, убедиться что всё запускается.

**1.1. Обновить Beads до >= 0.55.4**

```bash
# Проверить текущую версию
bd --version                      # 0.52.0 (dev)

# Обновить (из исходников или через go install)
go install github.com/steveyegge/beads/cmd/bd@latest

# Проверить совместимость с нашими issues
bd doctor
bd list --limit=5                 # Убедиться что issues читаются
```

**1.2. Установить Gastown**

```bash
# Через Go (самый надёжный способ)
go install github.com/steveyegge/gastown/cmd/gt@latest

# Или через npm
npm install -g @gastown/gt

# Или через Homebrew (macOS)
brew install gastown
```

**1.3. Установить CLI всех трёх рантаймов**

```bash
# Claude Code (уже установлен)
claude --version

# Codex CLI (OpenAI)
npm install -g @openai/codex

# Gemini CLI (Google)
npm install -g @anthropic-ai/gemini-cli   # или через pip/другой путь
```

**1.4. Проверить зависимости**

```bash
go version          # >= 1.23
git --version       # >= 2.25
tmux -V             # >= 3.0
sqlite3 --version   # предустановлен
```

**1.5. Создать Town workspace**

```bash
gt install ~/gt --git
cd ~/gt

# Проверить
gt config show
gt config agent list              # Должны быть: claude, codex, gemini
```

---

### Phase 2: Подключение MC2 и настройка мульти-рантайма

**Цель:** Добавить MC2 как rig, настроить три рантайма.

**2.1. Добавить MC2 как rig**

```bash
cd ~/gt
gt rig add mc2 /home/me/code/mc2
gt rig list                       # mc2 должен появиться
```

**2.2. Настроить агентов для трёх подписок**

```bash
# Кастомные конфигурации
gt config agent set claude-opus "claude --model opus"
gt config agent set claude-sonnet "claude --model sonnet"
gt config agent set codex-53 "codex --thinking high"
gt config agent set gemini-pro "gemini"

# Дефолтный агент — Claude
gt config default-agent claude-opus
```

**2.3. Создать crew workspace**

```bash
gt crew add me --rig mc2
cd mc2/crew/me                    # Твоё рабочее пространство
```

**2.4. Запустить Mayor и проверить**

```bash
gt mayor attach
# В Mayor сессии:
gt agents                         # Список доступных агентов
gt config agent list              # Доступные рантаймы
```

---

### Phase 3: Первый пилотный запуск (реальная задача MC2)

**Цель:** Проверить полный цикл на некритичной задаче.

**Рекомендуемая первая задача:** Что-то вроде "Добавить unit тесты для 3 модулей" или "Обновить переводы в i18n файлах" — задача, которая легко параллелизируется и не ломает ничего критичного.

**3.1. Создать convoy с тремя задачами**

```bash
# Создать beads для задачи
bd create --title="Add tests for module A" --type=task
bd create --title="Add tests for module B" --type=task
bd create --title="Add tests for module C" --type=task

# Создать convoy
gt convoy create "Test Coverage Sprint" mc2-xxx mc2-yyy mc2-zzz --notify --human
```

**3.2. Sling на разные рантаймы**

```bash
gt sling mc2-xxx mc2 --agent claude-opus    # Claude
gt sling mc2-yyy mc2 --agent codex-53       # Codex 5.3
gt sling mc2-zzz mc2 --agent gemini-pro     # Gemini
```

**3.3. Мониторинг**

```bash
gt convoy list                    # Общий прогресс
gt convoy status                  # Детали
gt agents                         # Статус polecats
bd activity --follow              # Live стрим событий
```

**3.4. Оценить результаты**

```bash
bd stats --actor=mc2/polecats/* --group-by=model
# Что сравнивать:
# - Время выполнения
# - Качество (прошёл ли type-check, tests)
# - Количество ревизий
# - Нужно ли было вмешательство
```

---

### Phase 4: Тройной A/B тест на сложной задаче

**Цель:** Объективно определить лучший runtime для сложных задач MC2.

**4.1. Методология**
Для каждой сложной задачи:

1. Создать **3 одинаковых bead** с идентичным описанием
2. Sling каждый на свой runtime (Claude Opus, Codex 5.3, Gemini)
3. Все три работают параллельно, в изолированных worktrees
4. Сравнить результаты по метрикам

**4.2. Метрики сравнения**

| Метрика                    | Как измерять                                 |
| -------------------------- | -------------------------------------------- |
| Время выполнения           | Timestamps в bead (start → close)            |
| Качество кода              | `pnpm type-check && pnpm build && pnpm test` |
| Количество итераций        | Revision count в CV                          |
| Merge success              | Прошёл ли через Refinery без конфликтов      |
| Человеческое вмешательство | Было ли escalation / manual fix              |

**4.3. Примеры сложных задач для A/B**

- Рефакторинг enrichment handler
- Новый tRPC endpoint с тестами
- Исправление сложного бага в pipeline stage
- Миграция базы данных с RLS

**4.4. Минимальная выборка**
Провести 10-15 тройных A/B тестов для статистической значимости.

---

### Phase 4B: Настройка guardrails (КРИТИЧНО — по итогам community feedback)

**Цель:** Не допустить проблем, описанных сообществом (автомерж падающих тестов, некачественный код).

**4B.1. Refinery verification gates**
Настроить Refinery так, чтобы перед мержем ОБЯЗАТЕЛЬНО проходили:

```bash
pnpm type-check    # TypeScript проверка
pnpm build          # Build
pnpm test           # Тесты
```

Если хоть один шаг падает — merge отклоняется, polecat получает REWORK_REQUEST.

**4B.2. Запрет автомержа без review**
На первых этапах — **отключить автомерж**. Все PR от polecats должны проходить ручной review (crew member).

**4B.3. Ограничение scope для polecats**
Не давать polecats слишком широкие задачи. Чёткие, атомарные beads:

- "Добавить unit тест для функции X в файле Y"
- НЕ "Улучшить тестовое покрытие модуля"

**4B.4. Мониторинг расхода подписок**
Отслеживать rate limits каждого провайдера. Не запускать больше polecats, чем позволяет подписка.

---

### Phase 5: Выработка стратегии routing и масштабирование

**Цель:** На основе данных Phase 4 определить финальную стратегию.

**5.1. Анализ данных A/B**

```bash
bd stats --actor=mc2/polecats/* --group-by=model
# → Таблица: модель | задач | avg время | success rate | avg ревизий
```

**5.2. Зафиксировать routing правила**
На основе данных определить:

- Какой runtime лучше для какого типа задач
- Обновить конфигурацию Mayor для автоматического routing
- Обновить CLAUDE.md / конституцию

**5.3. Включить полную инфраструктуру**

- Witness мониторинг
- Dashboard (`gt dashboard`)
- Escalation (`settings/escalation.json`)
- Деплой интеграция через convoy + наш `/deploy`

---

### Phase 6: Полная продуктивная работа

**Цель:** Gastown становится основным workflow.

- Mayor как основной интерфейс для постановки задач
- Convoys для всех batch-задач
- Refinery для автоматического merge
- Тройной A/B переходит в рутинный мониторинг
- Dashboard для observability
- Обновлённая конституция v2.0 с Gastown

---

## 7. Сравнительная таблица: Текущий подход vs Gastown

| Параметр            | Сейчас (Beads + ручная координация) | С Gastown                              |
| ------------------- | ----------------------------------- | -------------------------------------- |
| Параллельные агенты | 1-3                                 | 5-30                                   |
| Координация         | Ручная + exclusive locks            | Автоматическая через Mayor             |
| Merge               | Ручной                              | Автоматический (Refinery)              |
| Crash recovery      | Ручной                              | Автоматический (Witness + Hooks)       |
| Agent tracking      | Нет                                 | CV, attribution, stats                 |
| Observability       | `bd list`                           | Dashboard + activity feed              |
| Escalation          | Нет                                 | Severity-based с auto-reescalation     |
| Model A/B testing   | Нет                                 | Встроенная поддержка                   |
| Стоимость           | 1-3 CLI-сессии (подписка)           | N CLI-сессий (те же подписки, без API) |
| Сложность setup     | Минимальная                         | Значительная                           |
| Кривая обучения     | Низкая                              | Средняя-высокая                        |

---

## 8. Конкретные сценарии применения в MC2

### Сценарий 1: Большой рефакторинг

Например, "обновить все enrichment handlers для нового API". Mayor декомпозирует на 7-10 задач, polecats работают параллельно, Refinery мержит. Время выполнения: в ~3-5x быстрее.

### Сценарий 2: Multi-stage pipeline changes

Изменения в pipeline (stages 1-7) часто требуют согласованных правок в нескольких местах. Convoy отслеживает все связанные issues, гарантирует, что ничего не потеряется.

### Сценарий 3: Code review + fix cycles

Patrol запускает code review, находит 15 issues. Convoy с 15 beads, polecats фиксят параллельно. Вместо последовательной работы — параллельная.

### Сценарий 4: A/B тестирование моделей

Назначить одинаковые задачи разным моделям (Claude Sonnet vs Opus vs GPT-4), объективно сравнить результаты через CV и work history.

---

## 9. Итоговая оценка

| Критерий                       | Оценка                                            |
| ------------------------------ | ------------------------------------------------- |
| Потенциал ускорения разработки | Высокий (3-5x для параллелизируемых задач)        |
| Улучшение качества             | Средний (merge queue, verification gates)         |
| Observability                  | Высокий (dashboard, activity feed, escalation)    |
| Сложность внедрения            | Средняя-высокая                                   |
| Риск                           | Низкий-средний (поэтапное внедрение)              |
| ROI                            | Положительный при регулярных параллельных задачах |

**Вердикт:** Gastown — естественная эволюция нашего workflow с Beads. Мы уже на 80% пути (используем Beads, Dolt, formulas, molecules). Gastown добавляет оркестрационный слой, который нам пока приходится делать руками. Рекомендую поэтапное внедрение, начиная с обновления Beads и тестового workspace.
