# LLM Model Configuration

> Конфигурация моделей для каждой фазы пайплайна генерации курсов.
> Данные хранятся в таблице `llm_model_config` в Supabase.

## Принцип работы

- **standard tier**: Используется для документов < 80k токенов (дешёвые модели)
- **extended tier**: Используется для документов > 80k токенов (модели с большим контекстом)
- **fallback**: Автоматический переход на fallback модель при ошибке primary

---

## Stage 2: Document Summarization

| Phase                 | Tier     | Primary Model             | Fallback Model            | Temp | Tokens |
| --------------------- | -------- | ------------------------- | ------------------------- | ---- | ------ |
| stage_2_summarization | standard | xiaomi/mimo-v2-flash:free | google/gemini-2.5-flash   | 0.70 | 8000   |
| stage_2_summarization | extended | google/gemini-2.5-flash   | xiaomi/mimo-v2-flash:free | 0.70 | 8000   |

---

## Stage 3: Classification

| Phase                  | Tier     | Primary Model             | Fallback Model            | Temp | Tokens |
| ---------------------- | -------- | ------------------------- | ------------------------- | ---- | ------ |
| stage_3_classification | standard | xiaomi/mimo-v2-flash:free | google/gemini-2.5-flash   | 0.50 | 4096   |
| stage_3_classification | extended | google/gemini-2.5-flash   | xiaomi/mimo-v2-flash:free | 0.50 | 4096   |

---

## Stage 4: Analysis

### Phase 0: Budget Allocation

> Нет отдельной LLM конфигурации — использует документы из Stage 3

### Phase 0.5: Clarifying Questions

| Phase              | Tier     | Primary Model           | Fallback Model                | Temp | Tokens |
| ------------------ | -------- | ----------------------- | ----------------------------- | ---- | ------ |
| stage_4_clarifying | standard | moonshotai/kimi-k2-0905 | google/gemini-3-flash-preview | 0.50 | 4000   |

### Phase 1-4: Analysis

| Phase                  | Tier     | Primary Model             | Fallback Model                | Temp | Tokens |
| ---------------------- | -------- | ------------------------- | ----------------------------- | ---- | ------ |
| stage_4_classification | standard | xiaomi/mimo-v2-flash:free | google/gemini-2.5-flash       | 0.70 | 4096   |
| stage_4_classification | extended | google/gemini-2.5-flash   | xiaomi/mimo-v2-flash:free     | 0.70 | 4096   |
| stage_4_scope          | standard | xiaomi/mimo-v2-flash:free | google/gemini-2.5-flash       | 0.70 | 4096   |
| stage_4_scope          | extended | google/gemini-2.5-flash   | xiaomi/mimo-v2-flash:free     | 0.70 | 4096   |
| stage_4_expert         | standard | moonshotai/kimi-k2-0905   | google/gemini-3-flash-preview | 0.50 | 8000   |
| stage_4_expert         | extended | google/gemini-2.5-flash   | xiaomi/mimo-v2-flash:free     | 0.50 | 8000   |
| stage_4_synthesis      | standard | moonshotai/kimi-k2-0905   | google/gemini-3-flash-preview | 0.70 | 6000   |
| stage_4_synthesis      | extended | google/gemini-2.5-flash   | xiaomi/mimo-v2-flash:free     | 0.70 | 6000   |

---

## Stage 5: Structure Generation

| Phase              | Tier       | Primary Model             | Fallback Model                | Temp | Tokens |
| ------------------ | ---------- | ------------------------- | ----------------------------- | ---- | ------ |
| stage_5_metadata   | standard   | moonshotai/kimi-k2-0905   | google/gemini-3-flash-preview | 0.70 | 4096   |
| stage_5_metadata   | extended   | google/gemini-2.5-flash   | xiaomi/mimo-v2-flash:free     | 0.70 | 4096   |
| stage_5_sections   | standard   | xiaomi/mimo-v2-flash:free | google/gemini-2.5-flash       | 0.70 | 8000   |
| stage_5_sections   | extended   | google/gemini-2.5-flash   | xiaomi/mimo-v2-flash:free     | 0.70 | 8000   |
| stage_5_tier1      | primary    | google/gemini-2.5-flash   | openai/gpt-oss-120b           | 0.70 | 30000  |
| stage_5_tier1      | secondary  | openai/gpt-oss-120b       | moonshotai/kimi-k2-0905       | 0.70 | 30000  |
| stage_5_escalation | primary    | deepseek/deepseek-v3.2    | moonshotai/kimi-k2-0905       | 0.70 | 30000  |
| stage_5_escalation | secondary  | qwen/qwen3-235b-a22b-2507 | moonshotai/kimi-k2-0905       | 0.70 | 30000  |
| stage_5_escalation | fallback-1 | google/gemini-2.5-flash   | deepseek/deepseek-v3.2        | 0.70 | 30000  |
| stage_5_escalation | fallback-2 | google/gemini-2.5-flash   | qwen/qwen3-235b-a22b-2507     | 0.70 | 30000  |
| stage_5_escalation | fallback-3 | moonshotai/kimi-k2-0905   | google/gemini-2.5-flash       | 0.70 | 30000  |

---

## Stage 6: Content Generation

| Phase                    | Tier     | Primary Model             | Fallback Model            | Temp | Tokens |
| ------------------------ | -------- | ------------------------- | ------------------------- | ---- | ------ |
| stage_6_rag_planning     | standard | xiaomi/mimo-v2-flash:free | google/gemini-2.5-flash   | 0.70 | 4096   |
| stage_6_rag_planning     | extended | google/gemini-2.5-flash   | xiaomi/mimo-v2-flash:free | 0.70 | 4096   |
| stage_6_refinement       | standard | xiaomi/mimo-v2-flash:free | google/gemini-2.5-flash   | 0.70 | 8000   |
| stage_6_refinement       | extended | google/gemini-2.5-flash   | xiaomi/mimo-v2-flash:free | 0.70 | 8000   |
| stage_6_patcher          | standard | xiaomi/mimo-v2-flash:free | google/gemini-2.5-flash   | 0.70 | 4096   |
| stage_6_patcher          | extended | google/gemini-2.5-flash   | xiaomi/mimo-v2-flash:free | 0.70 | 4096   |
| stage_6_section_expander | standard | xiaomi/mimo-v2-flash:free | google/gemini-2.5-flash   | 0.70 | 8000   |
| stage_6_section_expander | extended | google/gemini-2.5-flash   | xiaomi/mimo-v2-flash:free | 0.70 | 8000   |
| stage_6_arbiter          | standard | xiaomi/mimo-v2-flash:free | google/gemini-2.5-flash   | 0.30 | 4096   |
| stage_6_arbiter          | extended | google/gemini-2.5-flash   | xiaomi/mimo-v2-flash:free | 0.30 | 4096   |
| stage_6_delta_judge      | standard | xiaomi/mimo-v2-flash:free | google/gemini-2.5-flash   | 0.30 | 4096   |
| stage_6_delta_judge      | extended | google/gemini-2.5-flash   | xiaomi/mimo-v2-flash:free | 0.30 | 4096   |

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
| stage_7_cover        | google/gemini-2.5-flash-image | xiaomi/mimo-v2-flash:free | 1024   | Обложки уроков (16:9) |
| stage_7_card         | openai/gpt-5-image-mini       | xiaomi/mimo-v2-flash:free | 1024   | Карточки (1:1)        |
| stage_7_video        | xiaomi/mimo-v2-flash:free     | qwen/qwen3-235b-a22b-2507 | 8000   | Видео-скрипты         |
| stage_7_audio        | xiaomi/mimo-v2-flash:free     | qwen/qwen3-235b-a22b-2507 | 8000   | TTS-скрипты           |
| stage_7_quiz         | xiaomi/mimo-v2-flash:free     | qwen/qwen3-235b-a22b-2507 | 4096   | Тесты                 |
| stage_7_presentation | xiaomi/mimo-v2-flash:free     | qwen/qwen3-235b-a22b-2507 | 8000   | Презентации           |

---

## Chat Phases

| Phase                  | Primary Model             | Fallback Model          | Temp | Tokens | Description               |
| ---------------------- | ------------------------- | ----------------------- | ---- | ------ | ------------------------- |
| chat_full_regeneration | qwen/qwen3-235b-a22b-2507 | moonshotai/kimi-k2-0905 | 0.60 | 16000  | Полная перегенерация      |
| chat_global_guidance   | qwen/qwen3-235b-a22b-2507 | moonshotai/kimi-k2-0905 | 0.70 | 2048   | Общие указания            |
| chat_node_refinement   | qwen/qwen3-235b-a22b-2507 | moonshotai/kimi-k2-0905 | 0.70 | 4096   | Уточнение отдельных узлов |

---

## Special Phases

| Phase            | Tier     | Primary Model             | Fallback Model            | Temp | Tokens | Description                   |
| ---------------- | -------- | ------------------------- | ------------------------- | ---- | ------ | ----------------------------- |
| global_default   | standard | xiaomi/mimo-v2-flash:free | google/gemini-2.5-flash   | 0.70 | 4096   | Дефолт для неизвестных фаз    |
| global_default   | extended | google/gemini-2.5-flash   | xiaomi/mimo-v2-flash:free | 0.70 | 4096   | Дефолт для больших контекстов |
| emergency        | -        | google/gemini-2.5-flash   | -                         | 0.70 | 4096   | Аварийный fallback            |
| quality_fallback | -        | openai/gpt-oss-120b       | google/gemini-2.5-flash   | 0.50 | 8000   | Fallback для качества         |

---

## Model Aliases

| Alias                  | Full Model ID                        | Provider | Notes                  |
| ---------------------- | ------------------------------------ | -------- | ---------------------- |
| MiMo V2 Flash          | xiaomi/mimo-v2-flash:free            | Xiaomi   | Бесплатная, быстрая    |
| Gemini 2.5 Flash       | google/gemini-2.5-flash              | Google   | Большой контекст (1M)  |
| Gemini 2.0 Thinking    | google/gemini-2.0-flash-thinking-exp | Google   | Reasoning модель       |
| DeepSeek V3.2          | deepseek/deepseek-v3.2               | DeepSeek | Лучшая для русского    |
| Qwen3 235B             | qwen/qwen3-235b-a22b-2507            | Alibaba  | Лучшая для английского |
| Kimi K2                | moonshotai/kimi-k2-0905              | Moonshot | Мультиязычная          |
| Minimax M2.1           | minimax/minimax-m2.1                 | Minimax  | Стабильный tiebreaker  |
| GPT-OSS 120B           | openai/gpt-oss-120b                  | OpenAI   | Премиум fallback       |
| Gemini 2.5 Flash Image | google/gemini-2.5-flash-image        | Google   | Генерация изображений  |
| GPT-5 Image Mini       | openai/gpt-5-image-mini              | OpenAI   | Генерация карточек     |

---

## Statistics

- **Total configs**: 60
- **Active configs**: 60
- **Last updated**: 2026-01-25
