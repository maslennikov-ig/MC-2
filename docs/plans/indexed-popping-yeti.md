# Research: Оптимальный подход к проверке грамматики и лексики

**Связанная задача**: mc2-q56t
**Статус**: Исследование

---

## Ключевые требования

1. **Не удорожать генерацию** — решение должно быть cost-neutral или экономить токены
2. **Мультиязычность** — поддержка всех языков платформы (не только ru/en)
3. **Детерминизм** — одинаковый текст = одинаковый результат
4. **Inline fixes** — точечные правки без перегенерации всего контента

---

## Текущая реализация (Stage 6 Self-Reviewer)

### Архитектура

Двухфазный fail-fast фильтр перед Judge:

```
Phase 1: Heuristics (бесплатно, 0 токенов)
├── Language consistency (CJK/Arabic = zero-tolerance, Latin в русском)
├── Truncation detection (неполные предложения, unmatched code blocks)
└── Mermaid syntax check

Phase 2: LLM Review (семантика)
├── Grammar inline fixes (quotedText + inlineReplacement)
├── Hygiene issues
└── Semantic verification
```

### Ключевые файлы

- `stages/stage6-lesson-content/nodes/self-reviewer-node.ts` — оркестратор (626 строк)
- `stages/stage6-lesson-content/judge/self-reviewer/grammar-rules.ts` — правила грамматики
- `stages/stage6-lesson-content/judge/self-reviewer/self-reviewer-prompt.ts` — LLM промпт

### Текущие правила грамматики

**Русский (6 правил):**

1. Падежи после предлогов (о/об + prepositional, для + genitive, с/со + instrumental)
2. Согласование в роде (большая таблица, новый файл)
3. Согласование в числе (данные показывают)
4. Согласование с числительными (два файла, пять файлов)
5. Согласование в лице (вы станете)
6. Согласование прилагательного и существительного в падеже

**Английский (3 правила):**

1. Subject-verb agreement
2. Article usage (a/an)
3. Preposition errors

### InlineFixer (уже реализован)

Механизм точечных правок для экономии токенов:

**Файл**: `judge/inline-fixer/index.ts`

**Алгоритм Cascade Search**:

1. Exact match (быстро, надёжно)
2. Flexible regex (normalized whitespace)
3. Fallback to LLM (если не нашли)

**Критерии eligibility**:

- Должен быть `quotedText` + `inlineReplacement`
- Criterion не в blacklist (pedagogical_structure, engagement_examples, completeness)
- Length ratio: 0.5x - 2.0x от оригинала
- Max replacement: 300 символов

**Экономия**: ~1500 токенов per successful fix

**Текущее состояние**: Включён (`FEATURE_INLINE_FIXER=true`)

### Проблемы текущего подхода

1. **Правила неполные** — только 6 правил для ru, 3 для en, остальные языки без правил
2. **LLM недетерминистичен** — один текст → разные результаты
3. **LLM пропускает очевидные ошибки** — слепые зоны
4. **Ограниченная мультиязычность** — grammar-rules.ts поддерживает только ru/en

---

## Альтернативные решения

### 1. LanguageTool Self-hosted (РЕКОМЕНДУЕТСЯ)

| Характеристика | Значение                                 |
| -------------- | ---------------------------------------- |
| Правила        | 2000+ (en), 500+ (ru)                    |
| Типы проверок  | Grammar + Spelling + Style + Punctuation |
| Latency        | 50-200ms                                 |
| Стоимость      | ~$30-40/месяц (Docker хостинг)           |
| Детерминизм    | 100%                                     |

**Плюсы:**

- Покрытие грамматики в 10x больше текущего
- Полностью детерминистичный
- Self-hosted = нет зависимости от внешних API
- Поддержка 30+ языков

**Минусы:**

- Требует отдельного сервиса (Docker)
- Не понимает контекст урока (технические термины могут flagged)

### 2. ~~Yandex Speller API~~ (НЕ ПОДХОДИТ)

**Причина отклонения**: Только русский язык. Не соответствует требованию мультиязычности.

### 3. Hunspell (локальная библиотека)

| Характеристика | Значение          |
| -------------- | ----------------- |
| Проверки       | Только орфография |
| Latency        | <10ms             |
| Стоимость      | Бесплатно         |

**Подходит для:** быстрая первичная фильтрация, кэширование

---

## Варианты интеграции

### Вариант A: Hybrid Pipeline (детерминизм + семантика)

```
Генерация контента
       ↓
[Phase 0] LanguageTool (детерминистическая проверка)
       ↓ issues[]
[Phase 1] Auto-fix (простые замены)
       ↓
[Phase 2] LLM Review (только сложные/семантические кейсы)
       ↓
Judge
```

**Преимущества:**

- LanguageTool ловит 95% очевидных ошибок детерминистично
- LLM фокусируется на семантике, стиле, контексте
- Экономия токенов: -70% (LLM не проверяет то, что проверил LT)

### Вариант B: Post-processing Layer

```
Генерация → Self-Reviewer → Judge → [Grammar Layer] → Финальный контент
```

Отдельный этап после Judge, исправляет грамматику в финальном тексте.

**Преимущества:**

- Не меняет текущий pipeline
- Можно включать/выключать независимо

**Недостатки:**

- Поздняя проверка = поздние ошибки
- Может конфликтовать с уже одобренным контентом

### Вариант C: Расширение текущего подхода

Добавить больше правил в `grammar-rules.ts` и улучшить промпт.

**Преимущества:**

- Минимальные изменения
- Нет новых зависимостей

**Недостатки:**

- Не решает проблему недетерминизма
- Ручная работа по правилам
- LLM всё равно будет пропускать

---

## Рекомендация

**Вариант A: Hybrid Pipeline** с LanguageTool Self-hosted

### Архитектура интеграции

```
┌─────────────────────────────────────────────────────────────┐
│                    Self-Reviewer Node                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [Phase 0] LanguageTool Check (NEW)                         │
│  ├── Вызов LanguageTool API (self-hosted)                   │
│  ├── Получение списка issues с точными позициями            │
│  └── Auto-fix очевидных ошибок (confidence > 0.9)           │
│                                                             │
│  [Phase 1] Heuristics (существующий)                        │
│  ├── Language consistency                                    │
│  ├── Truncation detection                                   │
│  └── Mermaid syntax                                         │
│                                                             │
│  [Phase 2] LLM Review (существующий, оптимизированный)      │
│  ├── Только семантические проверки                          │
│  ├── Контекст урока (технические термины OK)                │
│  └── Стиль и tone of voice                                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### План внедрения

1. **Развернуть LanguageTool** (1-2 дня)
   - Docker контейнер на сервере
   - Health check endpoint
   - Интеграционные тесты

2. **Создать LanguageTool service** (1 день)
   - `packages/course-gen-platform/src/services/language-tool/`
   - Client для API
   - Типы для responses
   - Retry logic

3. **Интегрировать в Self-Reviewer** (2-3 дня)
   - Phase 0 node
   - Auto-fix logic
   - Whitelist для технических терминов
   - Метрики и логирование

4. **Оптимизировать LLM Review** (1 день)
   - Убрать grammar rules из промпта
   - Фокус на семантику
   - Уменьшить token budget

5. **A/B тестирование** (ongoing)
   - Сравнить качество до/после
   - Измерить экономию токенов
   - Проверить latency impact

---

## Открытые вопросы

1. **Инфраструктура**: Где развернуть LanguageTool? (тот же сервер / отдельный / cloud)
2. **Whitelist**: Как управлять списком разрешённых технических терминов?
3. **Fallback**: Что делать если LanguageTool недоступен?
4. **Приоритет**: Насколько критична эта задача для текущего релиза?

---

## Предложение: Deep Research

Учитывая требования (cost-neutral, мультиязычность, детерминизм), предлагается провести глубокое исследование перед принятием решения.

### Вопросы для исследования

1. **LanguageTool стоимость и окупаемость**
   - Сколько токенов экономит замена LLM grammar check на LanguageTool?
   - При каком объёме генерации LanguageTool окупится?
   - Сравнение: $30-40/мес LanguageTool vs X токенов LLM

2. **Мультиязычные альтернативы**
   - Какие ещё детерминистические grammar checkers поддерживают 10+ языков?
   - Есть ли open-source альтернативы LanguageTool?
   - Можно ли использовать браузерные API (Grammarly, etc)?

3. **Inline fixes эффективность**
   - Какой % текущих grammar issues решается через inline fixes?
   - Можно ли улучшить hit rate без LLM?
   - Статистика cascade search success rate

4. **Архитектурные варианты**
   - Pre-generation check (до генерации) vs post-generation (после)?
   - Как минимизировать latency impact?
   - Graceful degradation если grammar service недоступен

### Формат результата

После deep research ожидается документ с:

- Сравнительная таблица решений по критериям
- ROI расчёт для LanguageTool
- Рекомендация с обоснованием
- План внедрения с оценкой трудозатрат

---

## Deep Research Prompt

```
CONTEXT:
I'm building an AI-powered course generation platform that creates educational content in multiple languages (Russian, English, Spanish, German, French, Chinese, Arabic, and more). The platform uses LLM (Claude/GPT) to generate lesson content, and we need a grammar/spelling validation layer.

CURRENT IMPLEMENTATION:
- LLM-based self-reviewer with grammar rules in the prompt
- Only 6 rules for Russian, 3 rules for English, no rules for other languages
- InlineFixer mechanism: when LLM identifies error with quotedText + inlineReplacement, we apply string replacement directly (saves ~1500 tokens per fix)
- Problems: non-deterministic (same text → different results), LLM misses obvious errors, expensive (tokens)

KEY REQUIREMENTS:
1. COST-NEUTRAL or COST-SAVING — must not increase generation cost
2. MULTILINGUAL — must support 10+ languages (not just Russian/English)
3. DETERMINISTIC — same input = same output (unlike LLM)
4. SURGICAL FIXES — ability to fix single word/phrase without regenerating entire content

RESEARCH QUESTIONS:

1. GRAMMAR CHECKING SOLUTIONS COMPARISON
- Compare LanguageTool (self-hosted), Grammarly API, ProWritingAid, Sapling.ai, and other grammar APIs
- Which support 10+ languages including Russian?
- What's the pricing model? (per request, subscription, self-hosted)
- What's the typical latency?
- Can they return exact positions for surgical fixes?

2. LANGUAGETOOL DEEP DIVE
- Self-hosted vs Cloud API pricing
- How many rules per language? (especially Russian, Spanish, German, Chinese)
- Memory/CPU requirements for self-hosted
- Can it be configured to ignore technical terms/code blocks?
- Response format — does it provide replacement suggestions?

3. COST-BENEFIT ANALYSIS
- If current LLM grammar check uses ~500-1000 tokens per section
- At $3/1M input tokens, $15/1M output tokens (Claude pricing)
- How many checks justify $30-40/month for LanguageTool hosting?
- Break-even calculation

4. ALTERNATIVE APPROACHES
- Are there lightweight spell-checkers that support many languages? (Hunspell dictionaries coverage)
- Can we use browser-based spell-check APIs?
- Are there any ML-based grammar models that can run locally? (smaller than LLM)
- What about combining multiple tools? (Hunspell for spelling + simple rule engine for grammar)

5. INTEGRATION PATTERNS
- Pre-generation validation (check user input) vs post-generation (check output)
- How to handle false positives for technical content?
- Graceful degradation if grammar service is unavailable

EXPECTED OUTPUT FORMAT:
1. Comparison table: Solution | Languages | Pricing | Latency | Surgical Fixes | Deterministic
2. LanguageTool analysis: pros, cons, hosting requirements
3. Cost calculation: tokens saved vs hosting cost
4. Recommendation with reasoning
5. Implementation roadmap (high-level)

CONSTRAINTS:
- No Yandex Speller (Russian only)
- No solutions that require per-request payment to third-party cloud (we generate thousands of sections)
- Prefer open-source or self-hosted solutions for cost predictability
```

---

## Следующие шаги

1. **[ТЕКУЩИЙ] Провести deep research** — используй промпт выше
2. **Прислать результаты** — я проанализирую и обновлю план
3. **Выбрать решение** — на основе ROI и требований
4. **Создать задачи в Beads** — детальный план внедрения
