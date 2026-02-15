# LLM Model Configuration

> Конфигурация моделей для каждой фазы пайплайна генерации курсов.
> Данные хранятся в таблице `llm_model_config` в Supabase.

## Принцип работы

- **standard tier**: Используется для документов < 80k токенов (дешёвые модели)
- **extended tier**: Используется для документов > 80k токенов (модели с большим контекстом)
- **fallback**: Автоматический переход на fallback модель при ошибке primary

---

## ⚠️ Как корректировать модели

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

| Phase                 | Tier     | Primary Model           | Fallback Model          | Temp | Tokens |
| --------------------- | -------- | ----------------------- | ----------------------- | ---- | ------ |
| stage_2_summarization | standard | xiaomi/mimo-v2-flash    | google/gemini-2.5-flash | 0.70 | 8000   |
| stage_2_summarization | extended | google/gemini-2.5-flash | xiaomi/mimo-v2-flash    | 0.70 | 8000   |

---

## Stage 3: Classification

| Phase                  | Tier     | Primary Model           | Fallback Model          | Temp | Tokens |
| ---------------------- | -------- | ----------------------- | ----------------------- | ---- | ------ |
| stage_3_classification | standard | xiaomi/mimo-v2-flash    | google/gemini-2.5-flash | 0.50 | 4096   |
| stage_3_classification | extended | google/gemini-2.5-flash | xiaomi/mimo-v2-flash    | 0.50 | 4096   |

---

## Stage 4: Analysis

> **Конфигурация моделей полностью в БД** (`llm_model_config`). Менять через Admin UI: `/admin/pipeline` → Models.
> Budget Allocator читает tier configs из БД, хардкод `STAGE4_MODELS` удалён.

### Порядок выполнения фаз

| # | Phase | DB key | Описание |
|---|-------|--------|----------|
| 0 | Budget Allocation | — | Нет LLM вызова. Распределяет токен-бюджет по документам. |
| 1 | Classification | `stage_4_classification` | Классификация темы курса |
| 1.5 | Clarifying Questions | `stage_4_clarifying` | Генерация уточняющих вопросов (после Phase 1, использует её output). В коде: `phase-0.5-clarifying.ts` |
| 2 | Scope | `stage_4_scope` | Генерация структуры курса (секции, модули) |
| 3 | Expert | `stage_4_expert` | Экспертный анализ с педагогическими рекомендациями |
| 4 | Synthesis | `stage_4_synthesis` | Финальная компиляция метаданных и стиля |

### Стратегия выбора моделей

- **Standard tier** (≤260K tokens): Быстрые дешёвые модели для основных фаз, думающие модели для аналитических
- **Extended tier** (>260K tokens): Модели с большим контекстом (1M)
- **Thinking phases** (clarifying, expert): `moonshotai/kimi-k2-0905` — дорогая reasoning-модель для фаз, требующих глубокого анализа
- **Bulk phases** (classification, scope, synthesis): Быстрые модели — `xiaomi/mimo-v2-flash` (ru), `x-ai/grok-4.1-fast` (other)
- **Порог 260K** — хардкод `STAGE4_CONTEXT_THRESHOLD`, не из БД

### Russian (ru)

| Phase | Tier | Primary Model | Fallback Model | Temp | Tokens |
| ----- | ---- | ------------- | -------------- | ---- | ------ |
| stage_4_classification | standard | xiaomi/mimo-v2-flash | google/gemini-3-flash-preview | 0.70 | 4096 |
| stage_4_classification | extended | google/gemini-3-flash-preview | xiaomi/mimo-v2-flash | 0.70 | 4096 |
| stage_4_scope | standard | xiaomi/mimo-v2-flash | google/gemini-3-flash-preview | 0.70 | 4096 |
| stage_4_scope | extended | google/gemini-3-flash-preview | xiaomi/mimo-v2-flash | 0.70 | 4096 |
| stage_4_synthesis | standard | xiaomi/mimo-v2-flash | google/gemini-3-flash-preview | 0.70 | 6000 |

### Any language (fallback for non-Russian)

| Phase | Tier | Primary Model | Fallback Model | Temp | Tokens |
| ----- | ---- | ------------- | -------------- | ---- | ------ |
| stage_4_clarifying | standard | moonshotai/kimi-k2-0905 | google/gemini-3-flash-preview | 0.50 | 4000 |
| stage_4_classification | standard | x-ai/grok-4.1-fast | google/gemini-3-flash-preview | 0.70 | 4096 |
| stage_4_classification | extended | google/gemini-3-flash-preview | x-ai/grok-4.1-fast | 0.70 | 4096 |
| stage_4_scope | standard | x-ai/grok-4.1-fast | google/gemini-3-flash-preview | 0.70 | 4096 |
| stage_4_scope | extended | google/gemini-3-flash-preview | x-ai/grok-4.1-fast | 0.70 | 4096 |
| stage_4_expert | standard | moonshotai/kimi-k2-0905 | google/gemini-3-flash-preview | 0.50 | 8000 |
| stage_4_expert | extended | google/gemini-3-flash-preview | moonshotai/kimi-k2-0905 | 0.50 | 8000 |
| stage_4_synthesis | standard | x-ai/grok-4.1-fast | google/gemini-3-flash-preview | 0.70 | 6000 |
| stage_4_synthesis | extended | google/gemini-3-flash-preview | moonshotai/kimi-k2-0905 | 0.70 | 6000 |

---

## Stage 5: Structure Generation

### Metadata Phase

| Phase            | Tier     | Primary Model           | Fallback Model                | Temp | Tokens |
| ---------------- | -------- | ----------------------- | ----------------------------- | ---- | ------ |
| stage_5_metadata | standard | moonshotai/kimi-k2-0905 | google/gemini-3-flash-preview | 0.70 | 4096   |
| stage_5_metadata | extended | google/gemini-2.5-flash | xiaomi/mimo-v2-flash          | 0.70 | 4096   |

### 3-Tier Content Generation (importance-based routing)

Routing based on `sections_breakdown.importance` field from Stage 4:

- **simple**: Trivial intro/overview sections → cheap model
- **normal**: Standard course content (majority of sections) → main workhorse
- **complex**: Hardest material + first section of every course → premium model

| Phase           | Tier     | Primary Model           | Fallback Model          | Temp | Tokens | Description                          |
| --------------- | -------- | ----------------------- | ----------------------- | ---- | ------ | ------------------------------------ |
| stage_5_simple  | standard | openai/gpt-oss-120b     | xiaomi/mimo-v2-flash    | 0.70 | 30000  | Trivial sections (importance=simple) |
| stage_5_simple  | extended | google/gemini-2.5-flash | openai/gpt-oss-120b     | 0.70 | 30000  | Trivial sections (large context)     |
| stage_5_normal  | standard | xiaomi/mimo-v2-flash    | google/gemini-2.5-flash | 0.70 | 30000  | Standard sections (majority)         |
| stage_5_normal  | extended | google/gemini-2.5-flash | xiaomi/mimo-v2-flash    | 0.70 | 30000  | Standard sections (large context)    |
| stage_5_complex | standard | moonshotai/kimi-k2-0905 | google/gemini-2.5-flash | 0.70 | 30000  | Complex + first section (premium)    |
| stage_5_complex | extended | google/gemini-2.5-flash | moonshotai/kimi-k2-0905 | 0.70 | 30000  | Complex + first (large context)      |

### Escalation (retry fallback)

| Phase              | Tier       | Primary Model             | Fallback Model            | Temp | Tokens |
| ------------------ | ---------- | ------------------------- | ------------------------- | ---- | ------ |
| stage_5_escalation | primary    | deepseek/deepseek-v3.2    | moonshotai/kimi-k2-0905   | 0.70 | 30000  |
| stage_5_escalation | secondary  | qwen/qwen3-235b-a22b-2507 | moonshotai/kimi-k2-0905   | 0.70 | 30000  |
| stage_5_escalation | fallback-1 | google/gemini-2.5-flash   | deepseek/deepseek-v3.2    | 0.70 | 30000  |
| stage_5_escalation | fallback-2 | google/gemini-2.5-flash   | qwen/qwen3-235b-a22b-2507 | 0.70 | 30000  |
| stage_5_escalation | fallback-3 | moonshotai/kimi-k2-0905   | google/gemini-2.5-flash   | 0.70 | 30000  |

---

## Stage 6: Content Generation

| Phase                    | Tier     | Primary Model           | Fallback Model          | Temp | Tokens |
| ------------------------ | -------- | ----------------------- | ----------------------- | ---- | ------ |
| stage_6_rag_planning     | standard | xiaomi/mimo-v2-flash    | google/gemini-2.5-flash | 0.70 | 4096   |
| stage_6_rag_planning     | extended | google/gemini-2.5-flash | xiaomi/mimo-v2-flash    | 0.70 | 4096   |
| stage_6_refinement       | standard | xiaomi/mimo-v2-flash    | google/gemini-2.5-flash | 0.70 | 8000   |
| stage_6_refinement       | extended | google/gemini-2.5-flash | xiaomi/mimo-v2-flash    | 0.70 | 8000   |
| stage_6_patcher          | standard | xiaomi/mimo-v2-flash    | google/gemini-2.5-flash | 0.70 | 4096   |
| stage_6_patcher          | extended | google/gemini-2.5-flash | xiaomi/mimo-v2-flash    | 0.70 | 4096   |
| stage_6_section_expander | standard | xiaomi/mimo-v2-flash    | google/gemini-2.5-flash | 0.70 | 8000   |
| stage_6_section_expander | extended | google/gemini-2.5-flash | xiaomi/mimo-v2-flash    | 0.70 | 8000   |
| stage_6_arbiter          | standard | xiaomi/mimo-v2-flash    | google/gemini-2.5-flash | 0.30 | 4096   |
| stage_6_arbiter          | extended | google/gemini-2.5-flash | xiaomi/mimo-v2-flash    | 0.30 | 4096   |
| stage_6_delta_judge      | standard | xiaomi/mimo-v2-flash    | google/gemini-2.5-flash | 0.30 | 4096   |
| stage_6_delta_judge      | extended | google/gemini-2.5-flash | xiaomi/mimo-v2-flash    | 0.30 | 4096   |

---

## Stage 6: CLEV Judges (3-judge voting system)

Система голосования из 3 судей для оценки качества сгенерированного контента.

| Language | Role       | Primary Model             | Fallback Model      | Weight |
| -------- | ---------- | ------------------------- | ------------------- | ------ |
| **ru**   | primary    | deepseek/deepseek-v3.2    | openai/gpt-oss-120b | 0.74   |
| ru       | secondary  | moonshotai/kimi-k2-0905   | openai/gpt-oss-120b | 0.73   |
| ru       | tiebreaker | minimax/minimax-m2.1      | openai/gpt-oss-120b | 0.72   |
| **en**   | primary    | qwen/qwen3-235b-a22b-2507 | openai/gpt-oss-120b | 0.75   |
| en       | secondary  | moonshotai/kimi-k2-0905   | openai/gpt-oss-120b | 0.73   |
| en       | tiebreaker | minimax/minimax-m2.1      | openai/gpt-oss-120b | 0.72   |
| **any**  | primary    | qwen/qwen3-235b-a22b-2507 | openai/gpt-oss-120b | 0.75   |
| any      | secondary  | moonshotai/kimi-k2-0905   | openai/gpt-oss-120b | 0.73   |
| any      | tiebreaker | minimax/minimax-m2.1      | openai/gpt-oss-120b | 0.72   |

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

| Phase                   | Stage | Primary Model           | Fallback Model            | Temp | Tokens | Description                |
| ----------------------- | ----- | ----------------------- | ------------------------- | ---- | ------ | -------------------------- |
| chat_stage_5_refinement | 5     | moonshotai/kimi-k2-0905 | moonshotai/kimi-k2.5      | 0.70 | 8192   | Уточнение узлов (Stage 5)  |
| chat_stage_6_refinement | 6     | deepseek/deepseek-v3.2  | qwen/qwen3-235b-a22b-2507 | 0.70 | 8192   | Уточнение уроков (Stage 6) |
| chat_node_refinement    | any   | moonshotai/kimi-k2-0905 | moonshotai/kimi-k2.5      | 0.70 | 8192   | Уточнение узлов (legacy)   |
| chat_global_guidance    | any   | moonshotai/kimi-k2-0905 | moonshotai/kimi-k2.5      | 0.70 | 8192   | Общие указания             |
| chat_full_regeneration  | any   | moonshotai/kimi-k2-0905 | moonshotai/kimi-k2.5      | 0.60 | 8192   | Полная перегенерация       |

### Routing Logic

- **Stage 5 node-level chat** → `chat_stage_5_refinement`
- **Stage 6 node-level chat** → `chat_stage_6_refinement`
- **Other stages node-level chat** → `chat_node_refinement`
- **Global chat (any stage)** → `chat_global_guidance`
- **Full regeneration** → `chat_full_regeneration`

**Fallback конфиг** (используется если запись в БД отключена или отсутствует):

- Файл: `chat-mutation-helpers.ts` → `CHAT_STAGE_FALLBACK_MODELS`
- Stage 5: kimi-k2 → kimi-k2.5, Stage 6: deepseek-v3.2 → qwen3-235b

---

## Inline Operations

| Phase                     | Primary Model        | Fallback Model            | Temp | Tokens | Description               |
| ------------------------- | -------------------- | ------------------------- | ---- | ------ | ------------------------- |
| inline_block_regeneration | xiaomi/mimo-v2-flash | qwen/qwen3-235b-a22b-2507 | 0.70 | 2000   | Инлайн регенерация блоков |
| inline_element_crud       | xiaomi/mimo-v2-flash | qwen/qwen3-235b-a22b-2507 | 0.70 | 4000   | Добавление секций/уроков  |

---

## Special Phases

| Phase            | Tier     | Primary Model           | Fallback Model          | Temp | Tokens | Description                   |
| ---------------- | -------- | ----------------------- | ----------------------- | ---- | ------ | ----------------------------- |
| global_default   | standard | xiaomi/mimo-v2-flash    | google/gemini-2.5-flash | 0.70 | 4096   | Дефолт для неизвестных фаз    |
| global_default   | extended | google/gemini-2.5-flash | xiaomi/mimo-v2-flash    | 0.70 | 4096   | Дефолт для больших контекстов |
| emergency        | -        | google/gemini-2.5-flash | -                       | 0.70 | 4096   | Аварийный fallback            |
| quality_fallback | -        | openai/gpt-oss-120b     | google/gemini-2.5-flash | 0.50 | 8000   | Fallback для качества         |

---

## Model Aliases

| Alias                  | Full Model ID                        | Provider | Notes                  |
| ---------------------- | ------------------------------------ | -------- | ---------------------- |
| MiMo V2 Flash          | xiaomi/mimo-v2-flash                 | Xiaomi   | Стабильная, русский    |
| Gemini 2.5 Flash       | google/gemini-2.5-flash              | Google   | Большой контекст (1M)  |
| Gemini 3 Flash Preview | google/gemini-3-flash-preview        | Google   | Большой контекст (1M), Stage 4 extended |
| Grok 4.1 Fast          | x-ai/grok-4.1-fast                  | xAI      | Быстрая, Stage 4 non-Russian |
| Gemini 2.0 Thinking    | google/gemini-2.0-flash-thinking-exp | Google   | Reasoning модель       |
| DeepSeek V3.2          | deepseek/deepseek-v3.2               | DeepSeek | Лучшая для русского    |
| Qwen3 235B             | qwen/qwen3-235b-a22b-2507            | Alibaba  | Лучшая для английского |
| Kimi K2                | moonshotai/kimi-k2-0905              | Moonshot | Мультиязычная          |
| Kimi K2.5              | moonshotai/kimi-k2.5                 | Moonshot | Fallback для Kimi K2   |
| Minimax M2.1           | minimax/minimax-m2.1                 | Minimax  | Стабильный tiebreaker  |
| GPT-OSS 120B           | openai/gpt-oss-120b                  | OpenAI   | Премиум fallback       |
| Gemini 2.5 Flash Image | google/gemini-2.5-flash-image        | Google   | Генерация изображений  |
| GPT-5 Image Mini       | openai/gpt-5-image-mini              | OpenAI   | Генерация карточек     |

---

## Statistics

- **Total configs**: 68
- **Active configs**: 68
- **Last updated**: 2026-02-15
- **Last change**: Stage 4 Synthesis switched from kimi-k2-0905 to cheap models (mimo-v2-flash/grok-4.1-fast) — structured extraction doesn't need reasoning
