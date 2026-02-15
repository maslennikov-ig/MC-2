# Plan: Оптимизация kimi-k2-0905 в Stage 4 — сокращение до ключевых фаз

## Context

После реализации mc2-1fsg (Budget Allocator + Document Loading + Model Unification) модель `moonshotai/kimi-k2-0905` назначена на 3 из 5 фаз Stage 4: Clarifying (1.5), Expert (3) и Synthesis (4). Это дорогая reasoning-модель с большим количеством параметров. Вопрос: все ли 3 фазы реально нуждаются в глубоком рассуждении?

---

## Анализ каждой фазы

### Phase 1.5 — Clarifying Questions (kimi-k2-0905)

**Задача**: Генерация 8+ уточняющих вопросов по 8 категориям (company_context, audience, expected_outcomes и т.д.) с вариантами ответов и приоритизацией.

**Что делает модель**:
1. Читает документы и Phase 1 output
2. Определяет, какая информация ОТСУТСТВУЕТ (gap detection)
3. Генерирует вопросы разных типов (open/single_choice/multi_choice)
4. Придумывает 2-6 вариантов ответов с обоснованиями (rationale)
5. Расставляет приоритеты (critical/important/nice_to_have)

**Нужен ли thinking?**: **ДА** — обнаружение пробелов в информации требует аналитического мышления. Модель должна понять, что в документах есть, а чего нет, и сформулировать точечные вопросы. Качество вопросов напрямую влияет на качество курса.

**Вывод**: ОСТАВИТЬ kimi-k2-0905.

---

### Phase 3 — Expert Analysis (kimi-k2-0905)

**Задача**: Проектирование педагогической стратегии — assessment_approach и progression_logic.

**Что делает модель**:
1. Кросс-анализ Phase 1 (категория, сложность, ЦА) + Phase 2 (структура секций)
2. Проектирование стратегии оценки (как ученик демонстрирует понимание)
3. Проектирование логики прогрессии (как нарастает сложность от урока к уроку)
4. Учёт clarifying_answers от пользователя

**Нужен ли thinking?**: **ДА, безусловно** — это самая reasoning-интенсивная фаза. Педагогический дизайн требует глубокого понимания андрагогики, построения учебной траектории, scaffolding-стратегии. Результат напрямую определяет качество курса.

**Вывод**: ОСТАВИТЬ kimi-k2-0905.

---

### Phase 4 — Synthesis (kimi-k2-0905)

**Задача**: Синтез всех фаз в `generation_guidance` — структурированный объект с тоном, аналогиями, визуалами, типами упражнений.

**Что делает модель**:
1. Выбирает `tone` из 4 вариантов ("conversational but precise", "formal academic", "casual friendly", "technical professional")
2. Решает `use_analogies` (boolean) + придумывает 1-3 аналогии
3. Составляет `avoid_jargon` — список терминов для упрощения
4. Выбирает `include_visuals` из фиксированного набора (diagrams, flowcharts, code examples...)
5. Выбирает `exercise_types` из фиксированного набора (coding, derivation, analysis...)
6. Пишет `contextual_language_hints` — 1-2 предложения

**Нужен ли thinking?**: **НЕТ** — это задача **структурированной экстракции и классификации**, а не глубокого рассуждения:
- Большинство полей — выбор из предопределённых вариантов
- Креативные поля (analogies, jargon) короткие и ограниченные
- Кросс-ссылки между фазами тривиальные (просто объединение данных)
- Выходная схема жёстко определена Zod

Быстрая модель (mimo-v2-flash / grok-4.1-fast) справится с этой задачей на сравнимом уровне качества.

**Вывод**: ПЕРЕКЛЮЧИТЬ на дешёвую модель.

---

## Рекомендация

| Phase | Текущая модель | Рекомендация | Обоснование |
|-------|---------------|-------------|-------------|
| 1.5 Clarifying | kimi-k2-0905 | **Оставить** | Gap detection требует аналитики |
| 3 Expert | kimi-k2-0905 | **Оставить** | Педагогический дизайн — ядро качества |
| 4 Synthesis | kimi-k2-0905 | **Заменить** на mimo/grok | Структурированная экстракция, не reasoning |

**Итого**: kimi-k2-0905 используется в 2 из 5 фаз вместо 3.

---

## Изменения

### 1. Обновить DB записи для Synthesis

**SQL** (через Supabase MCP):
```sql
-- RU: stage_4_synthesis standard → xiaomi/mimo-v2-flash
UPDATE llm_model_config
SET model_id = 'xiaomi/mimo-v2-flash',
    fallback_model_id = 'google/gemini-3-flash-preview',
    primary_display_name = 'MiMo V2 Flash'
WHERE phase_name = 'stage_4_synthesis'
  AND tier = 'standard'
  AND language_code = 'ru';

-- Any language: stage_4_synthesis standard → x-ai/grok-4.1-fast
UPDATE llm_model_config
SET model_id = 'x-ai/grok-4.1-fast',
    fallback_model_id = 'google/gemini-3-flash-preview',
    primary_display_name = 'Grok 4.1 Fast'
WHERE phase_name = 'stage_4_synthesis'
  AND tier = 'standard'
  AND language_code = 'any';
```

### 2. Обновить документацию

**Файл**: `.claude/docs/llm-model-config.md`
- Стратегия: "Thinking phases (clarifying, expert): kimi-k2-0905"
- Synthesis переходит в категорию "Bulk phases" вместе с classification и scope

### 3. Обновить temperature для Synthesis

Synthesis с дешёвой моделью может использовать temperature 0.70 (как classification и scope), вместо 0.50 (thinking-оптимизированный).

---

## Файлы для изменения

| Файл | Изменение |
|------|-----------|
| DB `llm_model_config` | UPDATE 2 записи (ru + any для synthesis standard) |
| `.claude/docs/llm-model-config.md` | Обновить стратегию и таблицы |

## Верификация

```bash
# 1. Проверить DB записи
SELECT phase_name, tier, language_code, model_id, primary_display_name
FROM llm_model_config
WHERE phase_name = 'stage_4_synthesis';

# 2. Type-check (изменений в коде нет)
pnpm type-check

# 3. Тесты
pnpm --filter course-gen-platform test
```
