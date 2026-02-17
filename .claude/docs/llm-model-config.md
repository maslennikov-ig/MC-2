# LLM Model Configuration

> Конфигурация моделей для каждой фазы пайплайна генерации курсов.
> Данные хранятся в таблице `llm_model_config` в Supabase.

## Принцип работы

- **standard tier**: Используется для документов < 80k токенов (дешёвые модели)
- **extended tier**: Используется для документов > 80k токенов (модели с большим контекстом)
- **fallback**: Автоматический переход на fallback модель при ошибке primary

---

## Как корректировать модели

### Приоритет конфигов

1. **База данных** (`llm_model_config`) — ВЫСШИЙ приоритет
2. **Fallback в коде** — используется только если в БД нет записи

### Где менять

| Что менять                 | Где менять | Команда/файл                                     |
| -------------------------- | ---------- | ------------------------------------------------ |
| Любая фаза с конфигом в БД | Supabase   | `UPDATE llm_model_config SET ...`                |
| Fallback (если нет в БД)   | Код        | `chat.router.ts`, `element-crud.router.ts` и др. |
| Seed для новых деплоев     | JSON       | `config/config-seed.json`                        |

### Примеры SQL

**Изменить модель и токены:**

```sql
UPDATE llm_model_config
SET model_id = 'xiaomi/mimo-v2-flash',
    max_tokens = 8192
WHERE phase_name = 'chat_node_refinement';
```

**Посмотреть все конфиги фазы:**

```sql
SELECT phase_name, model_id, max_tokens, temperature, is_active
FROM llm_model_config
WHERE phase_name LIKE 'chat_%';
```

**Отключить конфиг (будет использоваться fallback):**

```sql
UPDATE llm_model_config SET is_active = false WHERE phase_name = 'chat_node_refinement';
```

### Важно

- После изменения в БД — **перезапуск сервера НЕ нужен** (конфиги читаются динамически)
- Fallback в коде — нужен редеплой или перезапуск
- При добавлении новой фазы — добавить в `config-seed.json` для будущих деплоев

---

## Stage 2: Document Summarization

| Phase                 | Tier     | Primary Model                 | Fallback Model                | Temp | Tokens |
| --------------------- | -------- | ----------------------------- | ----------------------------- | ---- | ------ |
| stage_2_summarization | standard | xiaomi/mimo-v2-flash          | google/gemini-3-flash-preview | 0.70 | 8000   |
| stage_2_summarization | extended | google/gemini-3-flash-preview | xiaomi/mimo-v2-flash          | 0.70 | 8000   |

---

## Stage 3: Classification

| Phase                  | Tier     | Primary Model                 | Fallback Model                | Temp | Tokens |
| ---------------------- | -------- | ----------------------------- | ----------------------------- | ---- | ------ |
| stage_3_classification | standard | xiaomi/mimo-v2-flash          | google/gemini-3-flash-preview | 0.50 | 4096   |
| stage_3_classification | extended | google/gemini-3-flash-preview | xiaomi/mimo-v2-flash          | 0.50 | 4096   |

---

## Stage 4: Analysis

> **Конфигурация моделей полностью в БД** (`llm_model_config`). Менять через Admin UI: `/admin/pipeline` → Models.
> Budget Allocator читает tier configs из БД, хардкод `STAGE4_MODELS` удалён.

### Порядок выполнения фаз

| #   | Phase                | DB key                   | Описание                                                                                               |
| --- | -------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------ |
| 0   | Budget Allocation    | —                        | Нет LLM вызова. Распределяет токен-бюджет по документам.                                               |
| 1   | Classification       | `stage_4_classification` | Классификация темы курса                                                                               |
| 1.5 | Clarifying Questions | `stage_4_clarifying`     | Генерация уточняющих вопросов (после Phase 1, использует её output). В коде: `phase-0.5-clarifying.ts` |
| 2   | Scope                | `stage_4_scope`          | Генерация структуры курса (секции, модули)                                                             |
| 3   | Expert               | `stage_4_expert`         | Экспертный анализ с педагогическими рекомендациями                                                     |
| 4   | Synthesis            | `stage_4_synthesis`      | Финальная компиляция метаданных и стиля                                                                |

### Стратегия выбора моделей

- **Standard tier** (<=260K tokens): Быстрые дешёвые модели для основных фаз, думающие модели для аналитических
- **Extended tier** (>260K tokens): Модели с большим контекстом (1M)
- **Thinking phases** (clarifying, expert): `moonshotai/kimi-k2-thinking` — дорогая reasoning-модель для фаз, требующих глубокого анализа
- **Bulk phases** (classification, scope, synthesis): Быстрые модели — `xiaomi/mimo-v2-flash` (ru), `x-ai/grok-4.1-fast` (other)
- **Порог 260K** — хардкод `STAGE4_CONTEXT_THRESHOLD`, не из БД

### Russian (ru)

| Phase                  | Tier     | Primary Model                 | Fallback Model                | Temp | Tokens |
| ---------------------- | -------- | ----------------------------- | ----------------------------- | ---- | ------ |
| stage_4_clarifying     | standard | moonshotai/kimi-k2-thinking   | google/gemini-3-flash-preview | 0.50 | 4000   |
| stage_4_clarifying     | extended | google/gemini-3-flash-preview | moonshotai/kimi-k2-thinking   | 0.50 | 4000   |
| stage_4_classification | standard | xiaomi/mimo-v2-flash          | google/gemini-3-flash-preview | 0.70 | 4096   |
| stage_4_classification | extended | google/gemini-3-flash-preview | xiaomi/mimo-v2-flash          | 0.70 | 4096   |
| stage_4_scope          | standard | xiaomi/mimo-v2-flash          | google/gemini-3-flash-preview | 0.70 | 4096   |
| stage_4_scope          | extended | google/gemini-3-flash-preview | xiaomi/mimo-v2-flash          | 0.70 | 4096   |
| stage_4_expert         | standard | moonshotai/kimi-k2-thinking   | google/gemini-3-flash-preview | 0.50 | 8000   |
| stage_4_expert         | extended | google/gemini-3-flash-preview | moonshotai/kimi-k2-thinking   | 0.50 | 8000   |
| stage_4_synthesis      | standard | xiaomi/mimo-v2-flash          | google/gemini-3-flash-preview | 0.70 | 6000   |
| stage_4_synthesis      | extended | google/gemini-3-flash-preview | xiaomi/mimo-v2-flash          | 0.70 | 6000   |

### Any language (fallback for non-Russian)

| Phase                  | Tier     | Primary Model                 | Fallback Model                | Temp | Tokens |
| ---------------------- | -------- | ----------------------------- | ----------------------------- | ---- | ------ |
| stage_4_clarifying     | standard | moonshotai/kimi-k2-thinking   | google/gemini-3-flash-preview | 0.50 | 4000   |
| stage_4_clarifying     | extended | google/gemini-3-flash-preview | moonshotai/kimi-k2-thinking   | 0.50 | 4000   |
| stage_4_classification | standard | x-ai/grok-4.1-fast            | google/gemini-3-flash-preview | 0.70 | 4096   |
| stage_4_classification | extended | google/gemini-3-flash-preview | x-ai/grok-4.1-fast            | 0.70 | 4096   |
| stage_4_scope          | standard | x-ai/grok-4.1-fast            | google/gemini-3-flash-preview | 0.70 | 4096   |
| stage_4_scope          | extended | google/gemini-3-flash-preview | x-ai/grok-4.1-fast            | 0.70 | 4096   |
| stage_4_expert         | standard | moonshotai/kimi-k2-thinking   | google/gemini-3-flash-preview | 0.50 | 8000   |
| stage_4_expert         | extended | google/gemini-3-flash-preview | moonshotai/kimi-k2-thinking   | 0.50 | 8000   |
| stage_4_synthesis      | standard | x-ai/grok-4.1-fast            | google/gemini-3-flash-preview | 0.70 | 6000   |
| stage_4_synthesis      | extended | google/gemini-3-flash-preview | moonshotai/kimi-k2-thinking   | 0.70 | 6000   |

---

## Stage 5: Structure Generation

### Metadata Phase

| Phase            | Tier     | Primary Model                 | Fallback Model                | Temp | Tokens |
| ---------------- | -------- | ----------------------------- | ----------------------------- | ---- | ------ |
| stage_5_metadata | standard | moonshotai/kimi-k2-thinking   | google/gemini-3-flash-preview | 0.70 | 4096   |
| stage_5_metadata | extended | google/gemini-3-flash-preview | xiaomi/mimo-v2-flash          | 0.70 | 4096   |

### 3-Tier Content Generation (importance-based routing)

Routing based on `sections_breakdown.importance` field from Stage 4:

- **simple**: Trivial intro/overview sections -> cheap model
- **normal**: Standard course content (majority of sections) -> main workhorse
- **complex**: Hardest material + first section of every course -> premium model

| Phase           | Tier     | Primary Model                 | Fallback Model                | Temp | Tokens | Description                          |
| --------------- | -------- | ----------------------------- | ----------------------------- | ---- | ------ | ------------------------------------ |
| stage_5_simple  | standard | openai/gpt-oss-120b           | xiaomi/mimo-v2-flash          | 0.70 | 30000  | Trivial sections (importance=simple) |
| stage_5_simple  | extended | google/gemini-3-flash-preview | openai/gpt-oss-120b           | 0.70 | 30000  | Trivial sections (large context)     |
| stage_5_normal  | standard | xiaomi/mimo-v2-flash          | google/gemini-3-flash-preview | 0.70 | 30000  | Standard sections (majority)         |
| stage_5_normal  | extended | google/gemini-3-flash-preview | xiaomi/mimo-v2-flash          | 0.70 | 30000  | Standard sections (large context)    |
| stage_5_complex | standard | moonshotai/kimi-k2-thinking   | google/gemini-3-flash-preview | 0.70 | 30000  | Complex + first section (premium)    |
| stage_5_complex | extended | google/gemini-3-flash-preview | moonshotai/kimi-k2-thinking   | 0.70 | 30000  | Complex + first (large context)      |

### Escalation (retry fallback)

| Phase              | Tier       | Primary Model                 | Fallback Model                | Temp | Tokens |
| ------------------ | ---------- | ----------------------------- | ----------------------------- | ---- | ------ |
| stage_5_escalation | primary    | deepseek/deepseek-v3.2        | moonshotai/kimi-k2-thinking   | 0.70 | 30000  |
| stage_5_escalation | secondary  | qwen/qwen3-235b-a22b-2507     | moonshotai/kimi-k2-thinking   | 0.70 | 30000  |
| stage_5_escalation | fallback-1 | google/gemini-3-flash-preview | deepseek/deepseek-v3.2        | 0.70 | 30000  |
| stage_5_escalation | fallback-2 | google/gemini-3-flash-preview | qwen/qwen3-235b-a22b-2507     | 0.70 | 30000  |
| stage_5_escalation | fallback-3 | moonshotai/kimi-k2-thinking   | google/gemini-3-flash-preview | 0.70 | 30000  |

---

## Stage 6: Content Generation

### 3-Tier Lesson Generation (difficulty-based routing)

Routing based on `difficulty_level` field from Stage 5 LessonSpecificationV2:

- **simple**: Beginner difficulty lessons -> cost-effective model
- **normal**: Intermediate difficulty (majority) -> main workhorse
- **complex**: Advanced difficulty + all Module 1 lessons -> premium model

**First module rule**: All lessons in Module 1 (lesson_id starts with "1.") always use complex tier for best first impression quality.

| Phase           | Tier     | Primary Model                 | Fallback Model                | Temp | Tokens | Description                         |
| --------------- | -------- | ----------------------------- | ----------------------------- | ---- | ------ | ----------------------------------- |
| stage_6_simple  | standard | moonshotai/kimi-k2-thinking   | google/gemini-3-flash-preview | 0.70 | 8000   | Beginner difficulty lessons         |
| stage_6_simple  | extended | google/gemini-3-flash-preview | moonshotai/kimi-k2-thinking   | 0.70 | 8000   | Beginner (large context)            |
| stage_6_normal  | standard | moonshotai/kimi-k2-thinking   | google/gemini-3-flash-preview | 0.70 | 8000   | Intermediate difficulty (majority)  |
| stage_6_normal  | extended | google/gemini-3-flash-preview | moonshotai/kimi-k2-thinking   | 0.70 | 8000   | Intermediate (large context)        |
| stage_6_complex | standard | qwen/qwen3.5-plus-02-15       | moonshotai/kimi-k2-thinking   | 0.70 | 8000   | Advanced + Module 1 (premium)       |
| stage_6_complex | extended | moonshotai/kimi-k2-thinking   | qwen/qwen3.5-plus-02-15       | 0.70 | 8000   | Advanced + Module 1 (large context) |

### Other Stage 6 Phases

| Phase                    | Tier     | Primary Model                 | Fallback Model                | Temp | Tokens |
| ------------------------ | -------- | ----------------------------- | ----------------------------- | ---- | ------ |
| stage_6_refinement       | standard | xiaomi/mimo-v2-flash          | google/gemini-3-flash-preview | 0.70 | 8000   |
| stage_6_refinement       | extended | google/gemini-3-flash-preview | xiaomi/mimo-v2-flash          | 0.70 | 8000   |
| stage_6_patcher          | standard | xiaomi/mimo-v2-flash          | google/gemini-3-flash-preview | 0.70 | 4096   |
| stage_6_patcher          | extended | google/gemini-3-flash-preview | xiaomi/mimo-v2-flash          | 0.70 | 4096   |
| stage_6_section_expander | standard | xiaomi/mimo-v2-flash          | google/gemini-3-flash-preview | 0.70 | 8000   |
| stage_6_section_expander | extended | google/gemini-3-flash-preview | xiaomi/mimo-v2-flash          | 0.70 | 8000   |
| stage_6_arbiter          | standard | xiaomi/mimo-v2-flash          | google/gemini-3-flash-preview | 0.30 | 4096   |
| stage_6_arbiter          | extended | google/gemini-3-flash-preview | xiaomi/mimo-v2-flash          | 0.30 | 4096   |

---

## Stage 6: CLEV Judges (3-judge voting system)

Система голосования из 3 судей для оценки качества сгенерированного контента.
Все судьи language-agnostic (одинаковые для любого языка контента).

| Role       | Model                   | Display Name | Weight | Fallback Model       |
| ---------- | ----------------------- | ------------ | ------ | -------------------- |
| primary    | minimax/minimax-m2.5    | Minimax M2.5 | 0.76   | xiaomi/mimo-v2-flash |
| secondary  | z-ai/glm-5              | GLM-5        | 0.74   | xiaomi/mimo-v2-flash |
| tiebreaker | qwen/qwen3.5-plus-02-15 | Qwen3.5 Plus | 0.75   | xiaomi/mimo-v2-flash |

### Delta Judge

| Phase               | Model                   | Display Name | Temp | Tokens |
| ------------------- | ----------------------- | ------------ | ---- | ------ |
| stage_6_delta_judge | qwen/qwen3.5-plus-02-15 | Qwen3.5 Plus | 0.30 | 4096   |

---

## Stage 7: Enrichments

| Phase                | Primary Model                 | Fallback Model            | Tokens | Description           |
| -------------------- | ----------------------------- | ------------------------- | ------ | --------------------- |
| stage_7_cover        | google/gemini-2.5-flash-image | xiaomi/mimo-v2-flash      | 1024   | Обложки уроков (16:9) |
| stage_7_card         | openai/gpt-5-image-mini       | xiaomi/mimo-v2-flash      | 1024   | Карточки (1:1)        |
| stage_7_video        | xiaomi/mimo-v2-flash          | qwen/qwen3-235b-a22b-2507 | 8000   | Видео-скрипты         |
| stage_7_audio        | xiaomi/mimo-v2-flash          | qwen/qwen3-235b-a22b-2507 | 8000   | TTS-скрипты           |
| stage_7_quiz         | xiaomi/mimo-v2-flash          | qwen/qwen3-235b-a22b-2507 | 4096   | Тесты                 |
| stage_7_presentation | xiaomi/mimo-v2-flash          | qwen/qwen3-235b-a22b-2507 | 8000   | Презентации           |

---

## Chat Phases

Stage-specific models with automatic fallback:

| Phase                   | Stage | Primary Model               | Fallback Model            | Temp | Tokens | Description                |
| ----------------------- | ----- | --------------------------- | ------------------------- | ---- | ------ | -------------------------- |
| chat_stage_5_refinement | 5     | moonshotai/kimi-k2-thinking | moonshotai/kimi-k2.5      | 0.70 | 8192   | Уточнение узлов (Stage 5)  |
| chat_stage_6_refinement | 6     | deepseek/deepseek-v3.2      | qwen/qwen3-235b-a22b-2507 | 0.70 | 8192   | Уточнение уроков (Stage 6) |
| chat_node_refinement    | any   | moonshotai/kimi-k2-thinking | moonshotai/kimi-k2.5      | 0.70 | 8192   | Уточнение узлов (legacy)   |
| chat_global_guidance    | any   | moonshotai/kimi-k2-thinking | moonshotai/kimi-k2.5      | 0.70 | 8192   | Общие указания             |
| chat_full_regeneration  | any   | moonshotai/kimi-k2-thinking | moonshotai/kimi-k2.5      | 0.60 | 8192   | Полная перегенерация       |

### Routing Logic

- **Stage 5 node-level chat** -> `chat_stage_5_refinement`
- **Stage 6 node-level chat** -> `chat_stage_6_refinement`
- **Other stages node-level chat** -> `chat_node_refinement`
- **Global chat (any stage)** -> `chat_global_guidance`
- **Full regeneration** -> `chat_full_regeneration`

**Fallback конфиг** (используется если запись в БД отключена или отсутствует):

- Файл: `chat-mutation-helpers.ts` -> `CHAT_STAGE_FALLBACK_MODELS`
- Stage 5: kimi-k2-thinking -> kimi-k2.5, Stage 6: deepseek-v3.2 -> qwen3-235b

---

## Inline Operations

| Phase                     | Primary Model        | Fallback Model            | Temp | Tokens | Description               |
| ------------------------- | -------------------- | ------------------------- | ---- | ------ | ------------------------- |
| inline_block_regeneration | xiaomi/mimo-v2-flash | qwen/qwen3-235b-a22b-2507 | 0.70 | 2000   | Инлайн регенерация блоков |
| inline_element_crud       | xiaomi/mimo-v2-flash | qwen/qwen3-235b-a22b-2507 | 0.70 | 4000   | Добавление секций/уроков  |

---

## Special Phases

| Phase            | Tier     | Primary Model                 | Fallback Model                | Temp | Tokens | Description                   |
| ---------------- | -------- | ----------------------------- | ----------------------------- | ---- | ------ | ----------------------------- |
| global_default   | standard | xiaomi/mimo-v2-flash          | google/gemini-3-flash-preview | 0.70 | 4096   | Дефолт для неизвестных фаз    |
| global_default   | extended | google/gemini-3-flash-preview | xiaomi/mimo-v2-flash          | 0.70 | 4096   | Дефолт для больших контекстов |
| emergency        | -        | google/gemini-3-flash-preview | -                             | 0.70 | 4096   | Аварийный fallback            |
| quality_fallback | -        | openai/gpt-oss-120b           | google/gemini-3-flash-preview | 0.50 | 8000   | Fallback для качества         |

---

## Model Aliases

| Alias                  | Full Model ID                 | Provider | Notes                                            |
| ---------------------- | ----------------------------- | -------- | ------------------------------------------------ |
| MiMo V2 Flash          | xiaomi/mimo-v2-flash          | Xiaomi   | Стабильная, русский                              |
| Gemini 3 Flash Preview | google/gemini-3-flash-preview | Google   | Контекст 1M, extended tier + emergency + caching |
| Grok 4.1 Fast          | x-ai/grok-4.1-fast            | xAI      | Быстрая, Stage 4 non-Russian                     |
| DeepSeek V3.2          | deepseek/deepseek-v3.2        | DeepSeek | Лучшая для русского                              |
| Qwen3 235B             | qwen/qwen3-235b-a22b-2507     | Alibaba  | Лучшая для английского                           |
| Qwen3.5 Plus           | qwen/qwen3.5-plus-02-15       | Alibaba  | Stage 6 complex tier + judges                    |
| Kimi K2 Thinking       | moonshotai/kimi-k2-thinking   | Moonshot | Мультиязычная reasoning-модель                   |
| Kimi K2.5              | moonshotai/kimi-k2.5          | Moonshot | Fallback для Kimi K2 Thinking                    |
| Minimax M2.5           | minimax/minimax-m2.5          | Minimax  | Primary CLEV judge                               |
| GLM-5                  | z-ai/glm-5                    | Zhipu AI | Secondary CLEV judge                             |
| GPT-OSS 120B           | openai/gpt-oss-120b           | OpenAI   | Премиум fallback                                 |
| Gemini 2.5 Flash Image | google/gemini-2.5-flash-image | Google   | Генерация изображений                            |
| GPT-5 Image Mini       | openai/gpt-5-image-mini       | OpenAI   | Генерация карточек                               |

---

## Prompt Caching

OpenRouter поддерживает два вида кэширования для Gemini моделей:

### Implicit Caching (автоматическое)

- Работает автоматически для всех Gemini запросов через OpenRouter
- Кэшированные токены стоят **0.25x** от стоимости обычных input-токенов
- TTL ~3-5 минут
- Для максимальной эффективности: системные промпты и повторяющиеся части должны быть в начале сообщения

### Explicit Caching (через cache_control breakpoints)

- Включено в `client-helpers.ts` **только для Anthropic** моделей
- Добавляет `cache_control: { type: 'ephemeral' }` к system message
- Для Gemini explicit кэширование **не используется**: implicit caching дешевле (нет write costs)
- Anthropic: Cache Read 0.1x, Cache Write 1.25x, TTL 5 min (расширяемый до 1h)

### DB flag: cache_read_enabled

Колонка `cache_read_enabled` в `llm_model_config`:

- `true` для всех конфигов с `google/gemini-3-flash-preview` как primary model
- Читается через `fetchStageConfigFromDb()` → `ModelConfigResult.cacheReadEnabled`
- Читается через `fetchPhaseConfigFromDb()` → `PhaseModelConfig.cacheReadEnabled`
- Используется в Stage 4 Budget Allocator для выбора модели

---

## Архитектура DEFAULT_PHASE_CONFIGS

Hardcoded fallback конфигурации загружаются из `config-seed.json` при старте модуля:

1. **config-seed.json** обновляется из БД при каждом `prebuild` (`generate-config-seed.ts`)
2. При старте `model-config-db.ts` парсит seed и строит `DEFAULT_PHASE_CONFIGS`
3. Если seed недоступен — используется минимальный аварийный набор (`global_default` + `emergency`)

Это обеспечивает автоматическую синхронизацию fallback'ов с БД без ручных правок кода.

---

## Statistics

- **Total configs**: ~90
- **Active configs**: ~90
- **Last updated**: 2026-02-17
- **Last change**: Gemini → gemini-3-flash-preview everywhere, prompt caching, DEFAULT_PHASE_CONFIGS auto-sync from seed, Stage 6 3-tier routing, CLEV judges update
