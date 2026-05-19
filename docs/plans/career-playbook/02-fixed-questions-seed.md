# Career Playbook — Fixed Questions Seed (Phase 1)

Phase A wizard — 5-7 фиксированных стартовых вопросов. Они хранятся в `career_playbook_fixed_questions` table.

## Принципы

- Каждый вопрос минимальный — 1 экран
- Mix: open / single_choice / multi_choice
- 1 conditional question (branching) — пример как это работает
- RU + EN параллельно
- `position` определяет порядок (1, 2, 3, ...). Conditional questions могут иметь тот же position.

## RU questions

### 1. position — Должность (open, autocomplete)

```json
{
  "language": "ru",
  "position": 1,
  "question_key": "position",
  "question_type": "open",
  "question_text": "Какую должность вы хотите оформить?",
  "helper_text": "Например: Менеджер по продажам B2B, DevOps-инженер, Product Manager",
  "is_required": true
}
```

Frontend: input с autocomplete по top-50 ролям (статичный список в JSON в коде, не в БД).

### 2. department — Отдел (single_choice)

```json
{
  "language": "ru",
  "position": 2,
  "question_key": "department",
  "question_type": "single_choice",
  "question_text": "Отдел или функциональная область",
  "options": [
    {"value": "sales", "label": "Продажи / Sales"},
    {"value": "marketing", "label": "Маркетинг"},
    {"value": "product", "label": "Продукт / Product"},
    {"value": "engineering", "label": "Инженерия / IT"},
    {"value": "design", "label": "Дизайн / UX"},
    {"value": "data", "label": "Аналитика / Data"},
    {"value": "operations", "label": "Операционка / Operations"},
    {"value": "hr", "label": "HR / People"},
    {"value": "finance", "label": "Финансы"},
    {"value": "support", "label": "Поддержка / Customer Success"},
    {"value": "legal", "label": "Юридический"},
    {"value": "other", "label": "Другое"}
  ],
  "is_required": true
}
```

### 3. level — Уровень (single_choice)

```json
{
  "language": "ru",
  "position": 3,
  "question_key": "level",
  "question_type": "single_choice",
  "question_text": "Уровень должности",
  "options": [
    {"value": "junior", "label": "Junior (до 2 лет опыта)"},
    {"value": "middle", "label": "Middle (2-5 лет)"},
    {"value": "senior", "label": "Senior (5+ лет, эксперт)"},
    {"value": "lead", "label": "Lead / Team Lead (ведёт команду)"},
    {"value": "director", "label": "Director / Head (руководит направлением)"},
    {"value": "c-level", "label": "C-level (CEO, CTO, CFO ...)"}
  ],
  "is_required": true
}
```

### 4. reporting — Подчинённость (open, короткий)

```json
{
  "language": "ru",
  "position": 4,
  "question_key": "reporting",
  "question_type": "open",
  "question_text": "Кому подчиняется и есть ли подчинённые?",
  "helper_text": "Например: Подчиняется CRO. В подчинении 3 SDR + 2 AE.",
  "is_required": true
}
```

### 5. team_size — Размер команды/компании (single_choice)

```json
{
  "language": "ru",
  "position": 5,
  "question_key": "team_size",
  "question_type": "single_choice",
  "question_text": "Размер компании",
  "options": [
    {"value": "1-10", "label": "1-10 человек (early-stage стартап)"},
    {"value": "11-50", "label": "11-50 человек (растущий стартап)"},
    {"value": "51-200", "label": "51-200 человек (Scale-up)"},
    {"value": "201-1000", "label": "201-1000 человек (Established)"},
    {"value": "1000+", "label": "1000+ человек (Enterprise)"}
  ],
  "is_required": true
}
```

### 6. company_stage — Стадия (single_choice, conditional)

```json
{
  "language": "ru",
  "position": 6,
  "question_key": "company_stage",
  "question_type": "single_choice",
  "question_text": "Какая стадия компании / продукта?",
  "options": [
    {"value": "pre-pmf", "label": "Pre-PMF (ищем product-market fit)"},
    {"value": "growth", "label": "Growth (PMF найден, масштабируем)"},
    {"value": "scale", "label": "Scale (отлаженная машина, расширяем рынки)"},
    {"value": "mature", "label": "Mature (стабильный бизнес, оптимизация)"}
  ],
  "is_required": false,
  "branching_rules": {
    "when": {"question_key": "team_size", "value_in": ["1-10", "11-50", "51-200"]}
  }
}
```

Для team_size 201+ — этот вопрос не показывается (компания уже established).

### 7. content_language — Язык генерации (single_choice)

```json
{
  "language": "ru",
  "position": 7,
  "question_key": "content_language",
  "question_type": "single_choice",
  "question_text": "На каком языке сгенерировать Role Guide?",
  "helper_text": "Если документ будет использоваться в международной компании, выберите English. По умолчанию совпадает с языком интерфейса.",
  "options": [
    {"value": "ru", "label": "Русский"},
    {"value": "en", "label": "English"},
    {"value": "es", "label": "Español"},
    {"value": "de", "label": "Deutsch"},
    {"value": "fr", "label": "Français"},
    {"value": "pt", "label": "Português"},
    {"value": "it", "label": "Italiano"}
  ],
  "is_required": true
}
```

Список языков должен соответствовать тем, что поддерживает Stage 6 (проверить в `packages/course-gen-platform/src/stages/stage6-lesson-content/state.ts` actual list).

## EN questions

Те же структуры, переведённые ключи. Опции `value` остаются на английском (это identifiers, не отображаемый текст). Только `label` и `helper_text` локализованы.

Пример для question 2 (department):

```json
{
  "language": "en",
  "position": 2,
  "question_key": "department",
  "question_type": "single_choice",
  "question_text": "Department or functional area",
  "options": [
    {"value": "sales", "label": "Sales"},
    {"value": "marketing", "label": "Marketing"},
    {"value": "product", "label": "Product"},
    {"value": "engineering", "label": "Engineering / IT"},
    {"value": "design", "label": "Design / UX"},
    {"value": "data", "label": "Analytics / Data"},
    {"value": "operations", "label": "Operations"},
    {"value": "hr", "label": "HR / People"},
    {"value": "finance", "label": "Finance"},
    {"value": "support", "label": "Support / Customer Success"},
    {"value": "legal", "label": "Legal"},
    {"value": "other", "label": "Other"}
  ],
  "is_required": true
}
```

Полная EN-локализация всех 7 вопросов — implementor создаёт по этому шаблону, переводя на английский. (Не дублируется здесь для краткости.)

## Department-specific deep-dive (опциональные, на Phase B)

Они не в `career_playbook_fixed_questions` (это уже LLM follow-up territory), но prompt для followup-questions node должен учитывать department и подсказывать LLM правильные направления:

- **sales:** ACV, типы сделок (transactional/consultative/enterprise), цикл сделки, тип воронки
- **engineering:** стек, размер инфраструктуры (req/sec, DAU), production / scale challenges
- **marketing:** каналы (paid/organic/PR), B2B/B2C, brand/performance focus
- **product:** B2B/B2C, метрики (DAU/MAU, retention, NPS), product-led vs sales-led
- **data:** real-time / batch, ML / analytics / BI focus, data volume
- **operations:** volume, complexity, regulatory constraints
- **hr:** размер employee base, hiring volume, learning vs recruiting focus
- **support:** ticket volume, SLA, B2B/B2C, self-serve vs human-led

Это hints для LLM в системном промпте `followup-questions` ноды, не вопросы в БД.

## Total seed rows

- 7 questions × 2 languages = 14 rows (минимум).
- Эту таблицу легко расширять без миграции — INSERT new questions с уникальным `question_key`.
