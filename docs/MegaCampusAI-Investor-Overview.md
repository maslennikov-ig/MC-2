# MegaCampusAI — AI-Powered Course Generation Platform

> **Transform any document into a complete, production-ready course in minutes, not months.**

---

## Executive Summary

**MegaCampusAI** — это платформа нового поколения для автоматической генерации образовательных курсов с помощью искусственного интеллекта. Пользователь загружает документы (PDF, DOCX, PPTX, XLSX, HTML и другие) или просто задаёт тему — и получает полноценный структурированный курс с уроками, квизами, флеш-картами, майнд-картами, аудио-подкастами, презентациями и инфографикой.

Под капотом — **7-стадийный AI-конвейер** с мультимодельной маршрутизацией, системой судей с голосованием, обнаружением галлюцинаций, RAG-поиском по исходным документам, нейронным реранкингом и качеством, основанным на принципах андрагогики и таксономии Блума.

Каждое архитектурное решение подкреплено **собственными исследованиями** со ссылками на 50+ рецензируемых научных работ из ведущих конференций (ACL, NeurIPS, ICLR).

### Key Metrics

| Показатель                     | Значение                                                  |
| ------------------------------ | --------------------------------------------------------- |
| Стоимость генерации 1 курса    | **$0.53 — $0.90**                                         |
| Время генерации (полный курс)  | **30 — 45 минут** (участие человека: 5-10 мин)            |
| AI-моделей через OpenRouter    | **20+**                                                   |
| AI-провайдеров                 | **12** (Qwen, DeepSeek, Google, OpenAI, Moonshot, xAI...) |
| Типов дополнительного контента | **13** (quiz, flashcards, audio, video, mind map...)      |
| Стилей подачи материала        | **12** (от академического до геймифицированного)          |
| Языков генерации курсов        | **19**                                                    |
| Языков интерфейса              | **2** (русский, английский)                               |
| Собственных исследований       | **64+**                                                   |
| Академических ссылок           | **50+** (ACL, NeurIPS, ICLR, arXiv)                       |
| Спецификаций                   | **320+**                                                  |
| Автоматизированных тестов      | **6,300+**                                                |
| Миграций базы данных           | **232**                                                   |
| Строк кода TypeScript          | **600,000+**                                              |

---

## 1. The Problem We Solve

### Традиционный подход к созданию курсов:

- **6-12 месяцев** на разработку одного курса
- **$10,000 — $50,000** стоимость создания
- Ручная работа методистов, дизайнеров, видеографов
- Курс устаревает быстрее, чем создается

### MegaCampusAI:

- **Минуты** вместо месяцев
- **< $1** вместо тысяч долларов
- AI делает работу целой команды
- Мгновенное обновление при изменении материалов

---

## 2. Two Ways to Create a Course

MegaCampusAI поддерживает два принципиально разных подхода к созданию курса:

### С документами (Document-Grounded Generation)

Пользователь загружает свои материалы — лекции, методички, презентации, статьи — и система создаёт курс **на основе именно этих документов**. Каждый урок привязан к конкретным фрагментам исходных материалов через RAG (Retrieval-Augmented Generation). Это гарантирует, что контент точно отражает исходные материалы, а не "выдумывает" информацию.

**Поддерживаемые форматы**: PDF, DOCX, PPTX, XLSX, HTML, Markdown, XML/JATS, PNG, JPG, GIF — **13 форматов** с автоматическим OCR для сканированных документов.

### Без документов (Knowledge-Based Generation)

Пользователь просто задаёт тему — и система генерирует курс из **собственной базы знаний моделей**. Для таких курсов система автоматически выбирает модели с наибольшим количеством параметров и самой широкой картиной мира, чтобы обеспечить максимальную полноту и актуальность информации.

### Два режима генерации

|                 | Автоматический                                                          | Полуавтоматический                                                       |
| --------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Процесс**     | Система всё делает сама. Пользователь получает уведомление о готовности | Пользователь подтверждает каждый этап, может редактировать результаты AI |
| **Контроль**    | Минимальный — доверие системе                                           | Полный — утверждение каждой стадии                                       |
| **Скорость**    | 30-45 мин (участие человека: 5-10 мин)                                  | Зависит от пользователя                                                  |
| **Для кого**    | Быстрая генерация, массовое создание курсов                             | Важен детальный контроль над содержанием                                 |
| **Уведомления** | Push, Email, Telegram                                                   | Интерактивное взаимодействие в UI                                        |

В полуавтоматическом режиме пользователь может **в любой момент переключиться** с автоматического на ручной контроль — например, поставить генерацию на паузу и продолжить с проверкой каждого этапа.

---

## 3. How It Works: 7-Stage AI Pipeline

Каждый курс проходит через **7 последовательных стадий**, каждая из которых — отдельный инженерный прорыв.

```
    Upload         Process        Classify        Analyze
  [Stage 1] ──→ [Stage 2] ──→ [Stage 3] ──→ [Stage 4]
   13 форматов   OCR +          AI ranks       Вопросы +
   PDF/DOCX     Markdown +      documents       Analysis +
   XLSX/HTML    Vectorize       by priority     Strategy
                 + RAG
       │
       ▼
    Generate        Content        Enrich
  [Stage 5] ──→ [Stage 6] ──→ [Stage 7]
   Course          Lesson          13 типов:
   Structure       Content +       Quiz, Audio,
   19 languages    Judge System    Video, Cards,
   12 styles       + Refinement    Mind Maps...
```

### Stage 1: Document Upload & Intake

- **13 форматов документов**: PDF, DOCX, PPTX, XLSX, HTML, Markdown, XML, JATS (научные статьи), PNG, JPG, JPEG, GIF
- **OCR** для сканированных документов (Tesseract/EasyOCR) — поддержка рукописных и печатных материалов
- Извлечение изображений с сохранением метаданных
- Контроль квот по подписке (10 MB — 10 GB)
- Возможность создания курса **без документов** — только по теме

### Stage 2: Document Processing & Vectorization

- Конвертация в Markdown через продвинутую модель обработки документов (8 GB, поддержка таблиц, формул, структуры)
- **Иерархическое чанкирование**: Parent (1,500 токенов) → Child (400 токенов) с перекрытием 50 токенов
- **Jina v3 Embeddings** — 768-мерные мультиязычные векторы
- Загрузка в **Qdrant** (HNSW-индекс) с BM25 sparse-векторами для гибридного поиска
- **Late Chunking** — сначала эмбеддинг всего документа, потом нарезка (лучшее сохранение контекста)

### Stage 3: Document Classification (Human-in-the-Loop)

- AI ранжирует документы по важности: **CORE** (1 документ) → **IMPORTANT** (до 30%) → **SUPPLEMENTARY**
- **Пользователь может изменить приоритеты** — AI предлагает, человек утверждает
- Позволяет сфокусировать генерацию на самом важном
- Влияет на распределение бюджетов токенов между документами

### Stage 4: Deep Analysis & Intelligent Clarification

Самая интеллектуальная стадия, состоящая из **5 подфаз**:

**4.1. Classification** — определение типа и области контента

**4.2. Clarifying Questions** — ключевая функция платформы:

AI генерирует **от 3 до 50 контекстно-зависимых вопросов**, которые помогают собрать максимум информации для генерации идеального курса. Каждый вопрос сопровождается:

- **Предлагаемыми вариантами ответов** с обоснованием каждого варианта
- **Приоритетом**: критический, важный или необязательный
- **Категорией**: контекст компании, аудитория, ожидаемые результаты, структура контента, фокус, бизнес-цели, практическое применение, ограничения

Вопросы охватывают **8 категорий** — от целевой аудитории до бизнес-целей и ограничений. AI задаёт вопросы, о которых человек мог не задуматься, **расширяя картину мира** и помогая учесть все аспекты будущего курса.

Пользователь может: принять предложенный ответ, модифицировать его или написать свой. Система отслеживает источник каждого ответа (suggested / modified / custom).

**До 3 раундов уточнений** — если AI считает, что собранной информации недостаточно, он генерирует follow-up вопросы.

**4.3. Scope** — определение объёма курса (модули, секции, уроки)

**4.4. Expert Analysis** — глубокий экспертный анализ (reasoning-модель)

**4.5. Synthesis** — синтез: цели обучения, педагогическая стратегия, план генерации

**Результат**: полная карта курса с Learning Objectives, типами упражнений, стилем подачи и RAG-планом. В полуавтоматическом режиме **все результаты редактируемы** — пользователь может поправить любое предложение AI.

### Stage 5: Course Structure Generation (LangGraph)

- **LangGraph StateGraph** — 4-фазная state machine:
  1. Validation → 2. Metadata Generation → 3. Section Expansion → 4. Quality Assembly
- **3-уровневая маршрутизация моделей** по сложности секций:
  - Simple → экономичная модель (~$0.03/1M tokens)
  - Normal → reasoning-модель (~$0.55/1M tokens)
  - Complex → premium-модель (~$0.70/1M tokens, средняя между input/output)
- **Escalation chain** — при провале качества автоматический переход на более мощную модель

### Stage 6: Lesson Content Generation + Judge System

- **Параллельная генерация** до 30 уроков одновременно
- **Каждый урок проходит через систему судей** (подробнее в разделе 5)
- **Targeted Refinement** — точечное исправление, а не перегенерация всего текста
- RAG-контекст из исходных документов для каждого урока

### Stage 7: Content Enrichment (13 types)

- Quiz, Flashcards, Mind Map, Study Guide, Presentation
- Audio (OpenAI TTS), Video, Audio Podcast
- Cover Image, Card, Banner, Infographic
- Каждый тип — отдельный генератор с собственными настройками

---

## 4. What Makes Us Different: Andragogy & Bloom's Taxonomy

MegaCampusAI — **не просто генератор текста**. Платформа построена на научных принципах обучения взрослых.

### Принципы андрагогики (Adult Learning Theory)

| Принцип                         | Реализация в платформе                                             |
| ------------------------------- | ------------------------------------------------------------------ |
| **Самонаправленность**          | Квизы для самооценки, флеш-карты с трекингом "знаю/не знаю"        |
| **Опыт как ресурс**             | Вопросы на основе реальных сценариев: "Коллега просит решить X..." |
| **Готовность к обучению**       | Прогрессивная сложность: 40% easy → 40% medium → 20% hard          |
| **Немедленное применение**      | Фокус на "Как использовать это завтра?", а не абстрактная теория   |
| **Мотивация через компетенцию** | Объяснения "почему это важно", а не просто правильность ответа     |

### Таксономия Блума (4 уровня)

Каждый квиз, каждый урок генерируется с учётом когнитивных уровней:

```
                    ┌─────────────┐
                    │   Analyze   │  5-10% вопросов
                    │  Сравнение, │  Сложные связи
                    │   анализ    │
                ┌───┴─────────────┴───┐
                │       Apply         │  20-30% вопросов
                │  Применение знаний  │  Решение задач
            ┌───┴─────────────────────┴───┐
            │        Understand           │  30-40% вопросов
            │  Объяснение, интерпретация  │
        ┌───┴─────────────────────────────┴───┐
        │            Remember                 │  30-40% вопросов
        │     Базовое запоминание фактов      │
        └─────────────────────────────────────┘
```

**Bloom Coverage Tracking** — система отслеживает распределение вопросов по уровням и гарантирует баланс.

### 12 стилей подачи курса

Пользователь выбирает стиль — и **весь контент** (уроки, квизы, презентации) генерируется в едином тоне:

| Категория               | Стили                                                   |
| ----------------------- | ------------------------------------------------------- |
| **B2B / Корпоративные** | Professional, Practical, Problem-Based, Analytical      |
| **Популярные**          | Conversational, Storytelling, Interactive, Motivational |
| **Специализированные**  | Academic, Technical, Research, Gamified                 |

**Пример**: стиль **Gamified** превращает курс в квест с миссиями, уровнями и достижениями. Стиль **Storytelling** — строит нарратив с персонажами и развязкой.

### 19 языков генерации

Курсы генерируются на **19 языках**: русский, английский, китайский, испанский, французский, немецкий, японский, корейский, арабский, португальский, итальянский, турецкий, вьетнамский, тайский, индонезийский, малайский, хинди, бенгальский, польский.

Для каждого языка система хранит локализованные шаблоны учебных элементов (введение, резюме, примеры, упражнения, подсказки) для корректного структурирования контента.

---

## 5. AI Judge System: Multi-Layer Quality Assurance

Это **не ChatGPT-обёртка**. У нас — enterprise-grade система контроля качества, основанная на академических исследованиях.

### 5.1 Cascading Evaluation (3-Stage Cost Optimization)

```
  100% контента
       │
  ┌────▼─────┐
  │ Stage 1  │  Heuristic Pre-filters (FREE)
  │ Эвристики│  Word count, readability, headers, keywords
  └────┬─────┘  Фильтрует 30-50% очевидно плохого контента
       │
  ┌────▼─────┐
  │ Stage 2  │  Single Cheap Judge (LOW COST)
  │ 1 судья  │  Быстрая оценка дешёвой моделью
  └────┬─────┘  50-70% проходят → публикация
       │
  ┌────▼─────┐
  │ Stage 3  │  CLEV Voting (SELECTIVE)
  │ 2-3 судьи│  Мульти-модельный консенсус
  └──────────┘  15-20% спорного контента
```

**Результат**: 67% экономия на оценке без потери качества.

### 5.2 CLEV Voting System (Consensus via Lightweight Efficient Voting)

```
  ┌──────────────┐    ┌──────────────┐
  │  Judge 1     │    │  Judge 2     │
  │  Minimax M2.5│    │  GLM-5       │
  │  (weight: 76)│    │  (weight: 74)│
  └──────┬───────┘    └──────┬───────┘
         │                    │
         ▼                    ▼
   ┌─────────────────────────────┐
   │     Scores agree?          │
   │   (within 0.1 threshold)   │
   └────────┬──────────┬────────┘
         Yes│          │No (15-30%)
            ▼          ▼
      ACCEPT     ┌──────────────┐
      (70-85%    │  Judge 3     │
       cases)    │  Qwen 3.5    │
                 │  (tiebreaker)│
                 └──────────────┘
```

- **Weighted voting** — веса рассчитываются по исторической точности: `w = 1 / (1 + exp(-accuracy))`
- **Language-aware bias prevention** — судьи выбираются так, чтобы не совпадать с моделью-генератором
- **Inter-judge agreement**: Krippendorff's Alpha для статистической надёжности

### 5.3 OSCQR-Based Rubric (6 Criteria)

| Критерий                     | Вес | Надёжность     |
| ---------------------------- | --- | -------------- |
| Learning Objective Alignment | 25% | 80-85%         |
| Pedagogical Structure        | 20% | 85%+           |
| Factual Accuracy             | 15% | 85% (with RAG) |
| Clarity & Readability        | 15% | 90%+           |
| Engagement & Examples        | 15% | 80%+           |
| Completeness                 | 10% | 75-80%         |

### 5.4 Hallucination Detection (Logprob Entropy)

```
Token Logprobs → Per-token Entropy: H = -Σ(pᵢ × log(pᵢ))
     │
     ▼
Sliding Window (5 tokens) → High-entropy spans detected
     │
     ▼
Entropy > 2.0? → Flag sentence for RAG verification
     │
     ▼
RAG Search → Compare claim vs source documents
     │
     ▼
Verdict: verified / no_evidence / unverified / contradicted
```

- **Без RAG**: 30-40% обнаружение галлюцинаций
- **С RAG**: **85%** обнаружение галлюцинаций
- **Claim extraction** — автоматическое распознавание фактических утверждений (даты, статистика, имена) на русском и английском

### 5.5 Targeted Self-Refinement

Вместо перегенерации всего урока — **хирургические правки**:

```
Judge Verdict → Arbiter Consolidation → Refinement Plan
                                             │
                    ┌────────────────────────┤
                    ▼                        ▼
            SURGICAL_EDIT            REGENERATE_SECTION
          (точечный патч)           (полная перегенерация
           по локации)                  секции)
                    │                        │
                    ▼                        ▼
              Quality Lock Check ← Score Comparison
              (regression prevention)
```

- **Convergence detection** — остановка, если улучшения < 0.001 за 3 итерации
- **Quality Lock** — запрет на ухудшение уже прошедших критериев (tolerance 5%)
- **Oscillation detection** — обнаружение "колебаний" оценки
- **Hard limits**: max 10 итераций, 300 секунд, 50 LLM-вызовов

---

## 6. Content Enrichment: 13 Types of Generated Content

Каждый урок может быть дополнен **13 различными типами** дополнительного контента:

### Текстовые и интерактивные материалы

| Тип              | Описание                                           | Назначение                             |
| ---------------- | -------------------------------------------------- | -------------------------------------- |
| **Quiz**         | Интерактивный тест с 3 типами вопросов             | Проверка усвоения по уровням Блума     |
| **Flashcards**   | Интерактивные карточки Q&A (5-100 карт)            | Быстрое запоминание ключевых понятий   |
| **Mind Map**     | Иерархическая карта знаний                         | Визуализация связей между концепциями  |
| **Study Guide**  | Полный учебный гайд (brief/standard/comprehensive) | Конспект для самостоятельного изучения |
| **Presentation** | Слайды с заметками для спикера (3-30 слайдов)      | Материал для очного обучения           |

### Мультимедийные материалы

| Тип                | Описание                                             | Назначение                                |
| ------------------ | ---------------------------------------------------- | ----------------------------------------- |
| **Audio**          | Озвучка урока (OpenAI TTS, 6 голосов)                | Аудио-версия для обучения на ходу         |
| **Audio Podcast**  | Профессиональный подкаст (deep_dive/debate/critique) | Углублённый разбор темы в формате диалога |
| **Video Overview** | Видео-обзор (10+ визуальных стилей)                  | Визуальное резюме урока                   |
| **Infographic**    | Визуальная инфографика (PNG)                         | Наглядная визуализация ключевых данных    |

### Автоматическая генерация визуального оформления

| Тип        | Назначение                                                   | Размер           |
| ---------- | ------------------------------------------------------------ | ---------------- |
| **Cover**  | Обложка урока (Hero Banner) — используется на странице урока | 1280x720 (16:9)  |
| **Card**   | Карточка курса/урока — используется в каталоге и навигации   | 1024x1024 (1:1)  |
| **Banner** | Декоративный баннер — заголовок раздела                      | 1280x400 (32:10) |

Обложки и карточки генерируются **автоматически** после создания структуры курса и уроков, обеспечивая визуальную целостность всего курса.

### Полное отслеживание генерации

Для каждого дополнительного материала система трекает: время генерации (ms), использованные токены, стоимость (USD), какая модель сгенерировала, quality score, количество retry — полный audit trail.

---

## 7. RAG: Grounding in Source Documents

Генерация **не на пустом месте** — каждый урок привязан к исходным документам через RAG (Retrieval-Augmented Generation).

### Hybrid Search + Neural Reranking

```
  Query: "Как работает кэширование в Redis?"
              │
     ┌────────┴────────┐
     ▼                 ▼
  Dense Search      Sparse Search
  (Jina v3,         (BM25 keyword
   768-dim)          matching)
     │                 │
     └────────┬────────┘
              ▼
    Reciprocal Rank Fusion (RRF)
              │
              ▼
    Jina Reranker v2 (neural re-ranking)
              │
              ▼
    Top-N релевантных чанков для урока
```

**Jina Reranker v2** — нейронный реранкер, который переоценивает результаты гибридного поиска. В отличие от простого ранжирования по скору, реранкер **читает каждый чанк** и определяет его релевантность запросу с помощью cross-encoder модели. Это повышает качество найденных фрагментов на **15-25%** по метрике nDCG@10 по сравнению с RRF без реранкинга.

- **Hybrid search** — объединение семантического и ключевого поиска
- **Priority boosting** — +40% для CORE-документов
- **Redis caching** — 5-минутный TTL, предотвращение дублирования запросов
- **RAG Context Cache** — предварительная загрузка контекста для Stage 5
- **20-30 чанков** извлекается для каждого урока для полноты покрытия

---

## 8. Model-Agnostic Architecture: Freedom from Vendor Lock-in

### Ключевое преимущество: независимость от провайдеров

MegaCampusAI **не привязан ни к одной конкретной модели**. Все 20+ моделей от 12 провайдеров доступны через единый агрегатор OpenRouter. Это означает:

- **Нет vendor lock-in** — смена модели не требует изменения кода
- **Мгновенная адаптация** к рынку — новая модель появилась → протестировали → подключили
- **Оптимальное соотношение цена/качество** — для каждой задачи используется наиболее подходящая модель, а не самая дорогая

### Dedicated AI Model Research Team

В компании работает **выделенная команда по исследованию AI-моделей** (AI Model Optimization Team), которая непрерывно:

- **Тестирует новые модели** по мере их появления на рынке
- **Проводит A/B-тестирование** на реальных курсах
- **Обновляет конфигурации** в централизованной базе данных моделей
- **Оптимизирует стоимость** — находит модели, дающие сравнимое качество по меньшей цене

Благодаря этому платформа генерирует контент **высокого качества**, не прибегая к дорогостоящим проприетарным моделям (Claude Opus, GPT-5 Pro и подобные), стоимость которых в 10-50 раз выше используемых нами альтернатив.

### Централизованная база конфигураций моделей

Все конфигурации хранятся в **единой базе данных** (`llm_model_config`), содержащей **90+ фазных конфигураций** по всем стадиям pipeline. Обновление модели — это изменение одной строки в БД, без деплоя кода.

### Интеллектуальная маршрутизация (5 уровней)

Маршрутизация моделей используется **на каждой стадии pipeline** и учитывает множество факторов:

```
  Layer 1: Context Size ─── ≤80K tokens → Standard | >80K → Extended (1M+ context)
       │
  Layer 2: Language ──────── Russian → одни модели | Non-Russian → другие модели
       │
  Layer 3: Complexity ────── Simple → $0.03/1M | Normal → $0.55/1M | Complex → $0.70/1M
       │
  Layer 4: Config Bunker ── 5 уровней отказоустойчивости (Memory → Redis → File → Seed → DB)
       │
  Layer 5: Quality Gate ─── Score < 0.75? → Retry с более мощной моделью
```

**Примеры маршрутизации по стадиям:**

- **Stage 3 (Classification)**: дешёвая модель для быстрой классификации
- **Stage 4 (Clarifying Questions)**: reasoning-модель для глубоких вопросов
- **Stage 5 (Structure)**: 3-tier routing по сложности секций (simple/normal/complex)
- **Stage 6 (Content)**: 3-tier routing по сложности уроков + первый модуль всегда на premium
- **Stage 6 (Judges)**: 3 разные модели-судьи с language-aware bias prevention
- **Stage 7 (Enrichments)**: специализированные модели для изображений, аудио, квизов

**Стоимость указана как среднее** между ценой за входящие и исходящие токены, что даёт реалистичную оценку расходов.

### ModelConfig Bunker: 5-Layer Resilience

Конфигурация моделей защищена **5 уровнями отказоустойчивости**:

```
  L1: Memory Map (zero-latency, no eviction)
      ↓ miss
  L2: Redis Cache (60s sync)
      ↓ miss
  L3: Last Known Good File (filesystem snapshot)
      ↓ miss
  L4: Seed Artifact (build-time bundle)
      ↓ miss
  L5: Database (Supabase, source of truth)
      ↓ miss
  Emergency Config (guaranteed to work)
```

- **Survives**: Redis outage, Database outage, Redis+DB outage одновременно
- **Circuit breaker**: останавливает sync при >20% невалидных конфигураций
- **Drop detection**: останавливает sync при подозрительном уменьшении записей

### Cost Optimization

| Стратегия                               | Экономия                                      |
| --------------------------------------- | --------------------------------------------- |
| Complexity-based routing (3 tier)       | 60-70% vs использование premium везде         |
| CLEV voting (67% 2-judge resolution)    | 67% на judge costs                            |
| Cascading evaluation (heuristics first) | 50% на evaluation                             |
| Provider caching (Gemini, DeepSeek)     | 75-90% на repeated prompts                    |
| Selective use of reasoning models       | Только для задач, требующих глубокого анализа |

---

## 9. Research-Driven Engineering

### 64+ собственных исследований

Каждое архитектурное решение в MegaCampusAI основано на **глубоком исследовании**. В проекте собрана библиотека из 64+ собственных research-документов, охватывающих:

| Направление                         | Кол-во | Примеры                                                                                    |
| ----------------------------------- | ------ | ------------------------------------------------------------------------------------------ |
| **Instructional Design & Pedagogy** | 8      | Evidence-Based Pedagogical Architectures, Instructional Design for AI Course Generation    |
| **RAG & Information Retrieval**     | 12     | RAG vs KAG Analysis, Adaptive RAG Optimization, Reranking Cost Optimization, Hybrid Search |
| **LLM Orchestration & Routing**     | 8      | Multi-Model Architecture, LLM Parameters Optimization, JSON Repair Strategies              |
| **Judge & Refinement Systems**      | 6      | Multi-Judge LLM Refinement Design Guide, Judge Strategy Research, CLEV Voting              |
| **Content Editing & UX**            | 10     | Surgical JSON Editing, User Intent Taxonomy (32 intents), UX Patterns for Workflow Editing |
| **Infrastructure & Cost**           | 8      | GPU Rental Analysis, Service Worker Research, Markdown Rendering                           |
| **Document Classification**         | 4      | Fixing LLM Conservative Bias, Classification Prompting Strategies                          |
| **Multilingual**                    | 3      | Grammar Validation, Self-Hosted RAG for Russian Content                                    |

### 50+ академических ссылок

Наши исследования ссылаются на рецензируемые научные работы:

**Instructional Design:**

- Gagné (1965) — Nine Events of Instruction
- Bloom (1956), Anderson & Krathwohl (2001) — Taxonomy of Educational Objectives
- Merrill (2002) — First Principles of Instruction
- Wiggins & McTighe (2005) — Understanding by Design
- van Merriënboer (2024) — 4C/ID Complex Learning

**Cognitive Science:**

- Sweller — Cognitive Load Theory
- Cepeda et al. (2006) — meta-analysis of 839 assessments on spacing effect
- Roediger & Karpicke (2006) — Testing Effect (+50% retention)
- Cowan (2001) — Working Memory Capacity (4±1 chunks)
- Guo, Kim & Rubin (2014) — 6.9M video sessions engagement analysis

**LLM & AI Research (2023-2025):**

- Madaan et al. (NeurIPS 2023) — Self-Refine (+20% quality improvement)
- Jiang et al. (ACL 2023) — LLM-Blender generative fusion
- CARE Framework (OpenReview 2024) — +25% vs majority voting
- RouteLLM (ETH Zurich, ICLR 2025) — 85% cost reduction
- arXiv:2402.03216 — BGE-M3 multilingual embeddings
- arXiv:2504.12879 — RusBEIR benchmark validation

### 320+ спецификаций

Каждая функция проходит полный цикл проектирования: исследование → спецификация → реализация → тестирование. В проекте накоплено 320+ спецификаций, охватывающих каждую стадию pipeline.

---

## 10. Interactive Frontend Experience

### Modern Tech Stack

- **Next.js 15.5** (React 19) с App Router
- **Tailwind CSS 4.1** + **Radix UI** (18+ accessible components)
- **Framer Motion** — анимации
- **React Flow** — визуализация pipeline генерации
- **Markmap** — рендеринг mind maps
- **Mermaid** — диаграммы в контенте
- **KaTeX** — математические формулы
- **CodeMirror** — подсветка кода с syntax highlighting

### Интерактивные учебные инструменты

**Flashcard Viewer**: анимация переворота карточки, самооценка "знаю/не знаю" с трекингом прогресса, полноэкранный режим, shuffle-режим.

**Quiz Player**: пошаговый режим, мгновенная обратная связь с объяснениями, бейджи сложности и уровня Блума, подсчёт баллов, повторное прохождение.

**Mind Map Viewer**: масштабирование и навигация, полноэкранный режим с сохранением состояния, бейджи количества узлов и глубины.

**Audio Player**: контроль скорости (0.5x — 2x), прогресс-бар с навигацией.

### Rich Content Rendering

Markdown (GFM), Syntax Highlighting (Shiki), диаграммы Mermaid, математика KaTeX, callout-блоки, responsive tables.

### PWA (Progressive Web App)

Установка как нативное приложение, offline fallback, push-уведомления, кэширование медиа-контента.

### Internationalization

- **Интерфейс**: русский и английский (полная локализация, 8 пространств имён)
- **Генерация курсов**: 19 языков

---

## 11. Enterprise-Grade Infrastructure

### Multi-Tenant Architecture (60+ tables)

- **Row-Level Security** — полная изоляция данных между организациями на уровне PostgreSQL
- **4 роли**: Superadmin → Admin → Instructor → Student
- **232 миграции** — battle-tested schema evolution

### Subscription Tiers

| Tier         | Storage | Files/Course | Formats                          |
| ------------ | ------- | ------------ | -------------------------------- |
| **Free**     | 10 MB   | 0            | —                                |
| **Basic**    | 100 MB  | 1            | TXT, MD                          |
| **Standard** | 1 GB    | 3            | + PDF, DOCX, PPTX, HTML          |
| **Premium**  | 10 GB   | 10           | + XLSX, PNG, JPG, GIF, SVG, WebP |

### Full Audit Trail

- **generation_trace** — каждый LLM-вызов: модель, токены, стоимость, duration, quality score
- **fsm_events** — все переходы состояний генерации
- **audit_log** — действия пользователей с before/after values
- **error_logs** — ошибки с fingerprinting и deduplication

---

## 12. DevOps & Deployment

### Blue/Green Zero-Downtime Deployment

```
        Traffic (Nginx)
              │
     ┌────────┴────────┐
     │   Active: Blue  │──→ Web :3001 + API :4001
     │   Standby: Green│──→ Web :3002 + API :4002
     └─────────────────┘
              │
         13-step deploy → Health Check → Switch → Instant Rollback
```

### CI/CD Pipeline (9 stages)

```
  Setup → [Lint | Type-Check | Security Audit] → [Unit | Contract | Integration Tests]
     → Build → CI Gate → Docker Build (matrix) → Deploy → [Rollback if fail]
     → Telegram Notification
```

### Testing Infrastructure

| Тип тестов        | Количество | Фреймворк               |
| ----------------- | ---------- | ----------------------- |
| **Unit**          | 164        | Vitest                  |
| **Integration**   | 42         | Vitest + Redis          |
| **E2E**           | 21         | Playwright (5 browsers) |
| **Contract**      | 4          | Vitest + Supabase       |
| **Accessibility** | 3          | Playwright + axe-core   |
| **Performance**   | 2          | Playwright              |
| **RLS Security**  | 1          | pgTAP                   |
| **Total**         | **302**    | —                       |

Coverage threshold: 70%. Pre-commit hooks: Husky + lint-staged. Quality gates: lint, type-check, build.

### Security

| Мера           | Реализация                                            |
| -------------- | ----------------------------------------------------- |
| XSS Prevention | DOMPurify санитизация всего сгенерированного контента |
| SQL Injection  | Parameterized queries через Supabase SDK              |
| TLS            | TLSv1.2 + TLSv1.3                                     |
| Headers        | X-Frame-Options, X-Content-Type-Options, HSTS         |
| Rate Limiting  | Nginx (50 req/s per IP)                               |
| Auth           | OAuth (Google, GitHub) + email/password               |

---

## 13. AI-Augmented Development

Разработка MegaCampusAI ведётся **классической командой разработчиков**, но с активным использованием AI-инструментов:

- **AI-ассистированная разработка** — Claude Code, Codex и Gemini используются для ускорения написания кода, тестов и документации
- **Gastown** — собственная система мульти-агентной оркестрации для параллельной разработки фич
- **Beads** — git-backed issue tracker с зависимостями между задачами и автоматическим восстановлением контекста
- **Автоматизированные code review** и health checks через AI-агентов

Это позволяет **небольшой команде** двигаться со скоростью значительно большего коллектива, сохраняя высокое качество кода (302 теста, 70% coverage threshold, strict TypeScript).

---

## 14. Observability & Cost Control

### Per-Course Cost Tracking

```
  ┌──────────────────────────────────────────┐
  │  Course Generation Cost Breakdown        │
  │                                          │
  │  Stage 2 (Processing)    $0.001-0.002    │
  │  Stage 3 (Classification) $0.0005        │
  │  Stage 4 (Analysis)       $0.15-0.25     │
  │  Stage 5 (Structure)      $0.20-0.40     │
  │  Stage 6 (Content+Judge)  $0.10-0.20     │
  │  Stage 7 (Enrichments)    $0.05-0.15     │
  │  ─────────────────────────────────────── │
  │  TOTAL                    $0.53-0.90     │
  │                                          │
  │  Cost alerts:                            │
  │  Warning    > $0.75                      │
  │  Critical   > $1.00                      │
  └──────────────────────────────────────────┘
```

- **Pino** — structured JSON logging
- Каждый LLM-вызов логируется: model, tokens, cost, duration

---

## 15. Admin Panel

- **Dashboard** — общая статистика (пользователи, курсы, уроки, ошибки)
- **Generation History** — история генераций с audit trail
- **Pipeline Monitor** — мониторинг всех стадий в реальном времени
- **User Management** — управление пользователями
- **Error Logs** — просмотр и анализ ошибок
- **Pricing Configuration** — настройка тарифов

---

## 16. Competitive Advantages

| Конкурент                       | Их подход                        | Наше преимущество                                    |
| ------------------------------- | -------------------------------- | ---------------------------------------------------- |
| Coursera / Udemy                | Ручное создание курсов           | AI-генерация за минуты                               |
| ChatGPT / Gemini                | Генерация текста без структуры   | 7-стадийный pipeline с quality assurance             |
| AI-генераторы (Synthesia, etc.) | Один тип контента                | 13 типов дополнительного контента                    |
| LMS (Moodle, Canvas)            | Платформа без генерации          | Генерация + доставка в одном                         |
| Простые AI-обёртки              | Single-model, no quality control | 20+ моделей, 3-judge voting, hallucination detection |

### Что невозможно скопировать за вечер:

1. **7-стадийный pipeline** с LangGraph state machines — 144K строк TypeScript
2. **CLEV Judge System** с 3 независимыми судьями и Krippendorff's Alpha
3. **Hallucination detection** через logprob entropy + RAG verification
4. **Neural Reranking** — Jina Reranker v2 для повышения точности RAG
5. **Clarifying Questions** — интеллектуальная система сбора требований с 3 раундами уточнений
6. **64+ собственных исследований** со ссылками на 50+ научных работ
7. **Model-agnostic architecture** — 90+ конфигураций, 5-layer resilience
8. **19 языков генерации** с локализованными шаблонами
9. **232 миграции** — production-proven database schema
10. **302 теста** — enterprise-grade quality assurance

---

## 17. Roadmap: от генерации курсов к AI Operating System

### Текущая платформа (Done)

| Stage                   | Description                                  |
| ----------------------- | -------------------------------------------- |
| Stage 0: Foundation     | Auth, DB, RLS, Subscription Tiers            |
| Stage 1: Upload         | 13 форматов документов                       |
| Stage 2: Processing     | Vectorization + RAG + Reranking              |
| Stage 3: Classification | Приоритизация документов (Human-in-the-Loop) |
| Stage 4: Analysis       | Clarifying Questions + Deep 5-phase analysis |
| Stage 5: Structure      | LangGraph course generation                  |
| Stage 6: Content        | Lesson generation + Judge System             |
| Stage 7: Enrichments    | 13 типов дополнительного контента            |

### Ближайшие планы

| Stage                       | Description                                    |
| --------------------------- | ---------------------------------------------- |
| Stage 8: Analytics          | Аналитика обучения, прогресс, проседающие темы |
| Stage 9: LMS Integration    | Экспорт в Canvas, Moodle, Open edX             |
| Stage 10: Adaptive Learning | Персонализированные траектории                 |

### Стратегическое видение: путь к Helixa AIOS

Генерация курсов — это **точка входа**, а не конечная цель. Следующие шаги:

- **Корпоративная экосистема знаний** — замкнутый цикл: знания сотрудников → верификация руководителем → обновление обучения → ежедневное 20-минутное микрообучение
- **AI Tutor** — персональный AI-наставник для каждого сотрудника, решающий "Проблему двух сигм" Блума (студент с тьютором показывает результаты на +2σ выше)
- **Корпоративный граф знаний** — единая карта всех знаний компании из всех источников (документы, совещания, чаты, обучение)
- **Helixa AIOS** — AI Operating System для бизнеса с 15+ специализированными AI-агентами

Подробнее: **[MegaCampusAI — Strategic Vision & Future Roadmap](./MegaCampusAI-Vision-Future.md)**

---

## Contact

**Version**: 0.31.17
**Staging**: https://ai.megacampus.ru
**Development**: https://dev.ai.megacampus.ru

---

_This document is based on actual codebase analysis of 144,000+ lines of TypeScript, 64+ original research documents, and 320+ specifications._
