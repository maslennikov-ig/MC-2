# MegaCampusAI — AI-Powered Course Generation Platform

> **Transform any document into a complete, production-ready course in minutes, not months.**

---

## Executive Summary

**MegaCampusAI** — это платформа нового поколения для автоматической генерации образовательных курсов с помощью искусственного интеллекта. Пользователь загружает документы (PDF, DOCX, PPTX, HTML) — и получает полноценный структурированный курс с уроками, квизами, флеш-картами, майнд-картами, аудио-подкастами, презентациями и инфографикой.

Под капотом — **7-стадийный AI-конвейер** с мультимодельной маршрутизацией, системой судей с голосованием, обнаружением галлюцинаций, RAG-поиском по исходным документам и качеством, основанным на принципах андрагогики и таксономии Блума.

### Key Metrics

| Показатель                         | Значение                                             |
| ---------------------------------- | ---------------------------------------------------- |
| Стоимость генерации 1 курса        | **$0.53 — $0.90**                                    |
| Время генерации полного курса      | **3 — 8 минут**                                      |
| Количество AI-моделей              | **20+** через OpenRouter                             |
| Количество AI-провайдеров          | **12** (Qwen, DeepSeek, Google, OpenAI, Moonshot...) |
| Типов обогащающего контента        | **13** (quiz, flashcards, audio, video, mind map...) |
| Стилей подачи материала            | **12** (от академического до геймифицированного)     |
| Поддерживаемых языков (embeddings) | **13** (Jina v3, мультиязычные)                      |
| Тестовых файлов                    | **302**                                              |
| Миграций базы данных               | **232**                                              |
| Исходных TypeScript-файлов         | **1,868**                                            |
| Строк кода                         | **144,000+**                                         |
| Спецификаций (design docs)         | **26**                                               |

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

## 2. How It Works: 7-Stage AI Pipeline

Каждый курс проходит через **7 последовательных стадий**, каждая из которых — отдельный инженерный прорыв.

```
    Upload         Process        Classify        Analyze
  [Stage 1] ──→ [Stage 2] ──→ [Stage 3] ──→ [Stage 4]
   Document       OCR +          AI ranks       Deep analysis:
   PDF/DOCX     Markdown +      documents       objectives,
   PPTX/HTML    Vectorize       by priority     strategy, plan
                 + RAG
       │
       ▼
    Generate        Content        Enrich
  [Stage 5] ──→ [Stage 6] ──→ [Stage 7]
   Course          Lesson          Quizzes,
   Structure       Content +       Flashcards,
   Sections +      Judge System    Audio, Video,
   Metadata        + Refinement    Mind Maps...
```

### Stage 1: Document Upload

- **Форматы**: PDF, DOCX, PPTX, HTML, TXT, Markdown
- OCR для сканированных документов (Tesseract/EasyOCR)
- Извлечение изображений с сохранением метаданных
- Контроль квот по подписке (10 MB — 10 GB)

### Stage 2: Document Processing & Vectorization

- Конвертация в Markdown через **Docling MCP Server** (8 GB модель)
- **Иерархическое чанкирование**: Parent (1,500 токенов) → Child (400 токенов) с перекрытием 50 токенов
- **Jina v3 Embeddings** — 768-мерные мультиязычные векторы
- Загрузка в **Qdrant** (HNSW-индекс) с BM25 sparse-векторами
- **Late Chunking** — сначала эмбеддинг всего документа, потом нарезка (лучшее сохранение контекста)

### Stage 3: Document Classification

- AI ранжирует документы по важности: **CORE** (1 документ) → **IMPORTANT** (до 30%) → **SUPPLEMENTARY**
- Определяет, какие материалы являются ключевыми для курса
- Позволяет сфокусировать генерацию на самом важном

### Stage 4: Deep Analysis (5 sub-phases)

- **Classification Phase** — определение типа контента
- **Clarifying Questions** — AI задает уточняющие вопросы (reasoning-модель Kimi K2)
- **Scope Phase** — определение объема курса
- **Expert Phase** — глубокий экспертный анализ (reasoning-модель)
- **Synthesis Phase** — синтез: цели обучения, педагогическая стратегия, план генерации

**Результат**: полная карта курса с Learning Objectives, упражнениями, стилем подачи и RAG-планом.

### Stage 5: Course Structure Generation (LangGraph)

- **LangGraph StateGraph** — 4-фазная state machine:
  1. Validation → 2. Metadata Generation → 3. Section Expansion → 4. Quality Assembly
- **3-уровневая маршрутизация моделей** по сложности секций:
  - Simple → дешевая модель (Xiaomi MiMo, $0.03/1M)
  - Normal → reasoning-модель (Kimi K2, $0.55/1M)
  - Complex → premium-модель (Qwen 3.5 Plus, $0.15/1M)
- **Escalation chain** — при провале качества автоматический переход на более мощную модель

### Stage 6: Lesson Content Generation + Judge System

- **Параллельная генерация** до 30 уроков одновременно
- **Каждый урок проходит через систему судей** (подробнее в разделе 4)
- **Targeted Refinement** — точечное исправление, а не перегенерация всего текста
- RAG-контекст из исходных документов для каждого урока

### Stage 7: Content Enrichment (13 types)

- Quiz, Flashcards, Mind Map, Study Guide, Presentation
- Audio (OpenAI TTS), Video (NotebookLM)
- Cover Image, Card, Banner, Infographic
- Каждый обогащающий тип — отдельный handler с собственными настройками

---

## 3. What Makes Us Different: Andragogy & Bloom's Taxonomy

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

Каждый квиз, каждый урок генерируется с учетом когнитивных уровней:

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

---

## 4. AI Judge System: Multi-Layer Quality Assurance

Это **не ChatGPT-обертка**. У нас — enterprise-grade система контроля качества, основанная на академических исследованиях.

### 4.1 Cascading Evaluation (3-Stage Cost Optimization)

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
  │ 1 судья  │  Быстрая оценка дешевой моделью
  └────┬─────┘  50-70% проходят → публикация
       │
  ┌────▼─────┐
  │ Stage 3  │  CLEV Voting (SELECTIVE)
  │ 2-3 судьи│  Мульти-модельный консенсус
  └──────────┘  15-20% спорного контента
```

**Результат**: 67% экономия на оценке без потери качества.

### 4.2 CLEV Voting System (Consensus via Lightweight Efficient Voting)

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
- **Inter-judge agreement**: Krippendorff's Alpha для статистической надежности

### 4.3 OSCQR-Based Rubric (6 Criteria)

| Критерий                     | Вес | Надежность     |
| ---------------------------- | --- | -------------- |
| Learning Objective Alignment | 25% | 80-85%         |
| Pedagogical Structure        | 20% | 85%+           |
| Factual Accuracy             | 15% | 85% (with RAG) |
| Clarity & Readability        | 15% | 90%+           |
| Engagement & Examples        | 15% | 80%+           |
| Completeness                 | 10% | 75-80%         |

### 4.4 Hallucination Detection (Logprob Entropy)

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

### 4.5 Targeted Self-Refinement

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

### Научная основа Judge System

| Исследование                             | Вклад                                    |
| ---------------------------------------- | ---------------------------------------- |
| **Self-Refine** (Madaan et al., 2023)    | Итеративное улучшение → +20% quality     |
| **LLM-Blender** (Jiang et al., ACL 2023) | Generative fusion → 3.2 vs 3.90 avg rank |
| **CARE Framework** (OpenReview 2024)     | PGM → +25% vs majority voting            |
| **Krippendorff's Alpha**                 | Inter-rater reliability                  |
| **DELIteraTeR** (Grammarly, ACL 2022)    | Span-level targeted editing              |

---

## 5. Content Enrichment: 13 Types of Generated Content

Каждый урок может быть дополнен **13 различными типами** обогащающего контента:

### Генерация через LLM (OpenRouter)

| Тип              | Описание                               | Настройки                                    |
| ---------------- | -------------------------------------- | -------------------------------------------- |
| **Quiz**         | Интерактивный тест с 3 типами вопросов | 3-20 вопросов, 4 уровня Блума, passing score |
| **Presentation** | Слайды с заметками для спикера         | 3-30 слайдов, темы, layouts                  |
| **Audio**        | Озвучка через OpenAI TTS               | 6 голосов, 5 форматов, контроль скорости     |

### Генерация через NotebookLM Bridge

| Тип                | Описание                        | Форматы                                |
| ------------------ | ------------------------------- | -------------------------------------- |
| **Flashcards**     | Интерактивные карточки Q&A      | 5-100 карт, difficulty levels          |
| **Mind Map**       | Иерархическая карта знаний      | shallow/standard/deep (до 50 уровней)  |
| **Study Guide**    | Полный учебный гайд в Markdown  | brief/standard/comprehensive           |
| **Audio Podcast**  | Профессиональная аудио-нарратив | deep_dive/brief/critique/debate        |
| **Video Overview** | Видео-обзор урока               | explainer/brief, 10+ визуальных стилей |
| **Infographic**    | Визуальная инфографика (PNG)    | portrait/landscape                     |

### Генерация изображений

| Тип                     | Модель                 | Размер           |
| ----------------------- | ---------------------- | ---------------- |
| **Cover** (Hero Banner) | Gemini 2.5 Flash Image | 1280x720 (16:9)  |
| **Card** (Thumbnail)    | GPT-5 Image Mini       | 1024x1024 (1:1)  |
| **Banner** (Header)     | Gemini 2.5 Flash Image | 1280x400 (32:10) |

### Полное отслеживание генерации

Для каждого обогащения системa трекает:

- Время генерации (ms), использованные токены, стоимость (USD)
- Какая модель сгенерировала, quality score, количество retry
- Полный audit trail в `generation_trace`

---

## 6. RAG: Grounding in Source Documents

Генерация **не на пустом месте** — каждый урок привязан к исходным документам через RAG (Retrieval-Augmented Generation).

### Hybrid Search Architecture

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
    Jina Reranker v2 (top-N quality boost)
              │
              ▼
    20-30 релевантных чанков для урока
```

- **Hybrid search** — объединение семантического и ключевого поиска
- **Priority boosting** — +40% для CORE-документов
- **Redis caching** — 5-минутный TTL, предотвращение дублирования запросов
- **RAG Context Cache** — предварительная загрузка контекста для Stage 5

---

## 7. Multi-Model AI Routing: 20+ Models, Smart Selection

### Иерархия маршрутизации (5 уровней)

```
  Layer 1: Context Tier ─── ≤80K tokens → Standard | >80K → Extended
       │
  Layer 2: Language ──────── Russian → Xiaomi MiMo | Other → xAI Grok
       │
  Layer 3: Importance ────── Simple → $0.03/1M | Normal → $0.55/1M | Complex → $0.15/1M
       │
  Layer 4: Config Bunker ── Memory → Redis → LKG File → Seed → Database (5 fallback layers)
       │
  Layer 5: Quality Gate ─── Score < 0.75? → Retry with stronger model
```

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

- **Survives**: Redis outage, Database outage, Redis+DB outage simultaneously
- **Circuit breaker**: Abort sync if >20% invalid configs
- **Drop detection**: Abort if cache has >10 configs but sync returns <5

### Cost Optimization

| Стратегия                                      | Экономия                           |
| ---------------------------------------------- | ---------------------------------- |
| Importance-based routing (3 tier)              | 60-70% vs using premium everywhere |
| CLEV voting (67% 2-judge resolution)           | 67% на judge costs                 |
| Cascading evaluation (heuristics first)        | 50% на evaluation                  |
| Provider caching (Anthropic, Gemini, DeepSeek) | 75-90% на repeated prompts         |
| Optional fields removal                        | 10-15K tokens/course               |

---

## 8. Interactive Frontend Experience

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

**Flashcard Viewer**:

- Анимация переворота карточки (Framer Motion)
- Самооценка "знаю / не знаю" с трекингом прогресса
- Полноэкранный режим для фокусированного обучения
- Shuffle-режим, сохранение прогресса в localStorage

**Quiz Player**:

- Пошаговый режим (один вопрос за раз)
- Мгновенная обратная связь с объяснениями
- Бейджи сложности и уровня Блума
- Подсчет баллов, определение pass/fail
- Повторное прохождение

**Mind Map Viewer**:

- Масштабирование и навигация
- Полноэкранный режим с сохранением состояния
- Бейджи количества узлов и глубины

**Audio Player**:

- Контроль скорости (0.5x — 2x)
- Прогресс-бар с навигацией
- Управление громкостью

### Rich Content Rendering

- Markdown с GitHub Flavored Markdown
- Syntax highlighting (Shiki)
- Диаграммы Mermaid (inline)
- Математика KaTeX
- Callout-блоки (info/warning/error)
- Responsive tables

### PWA (Progressive Web App)

- Установка как нативное приложение
- Offline fallback page
- Push-уведомления
- Кэширование медиа-контента (аудио, видео, шрифты)
- **Важно**: JS/CSS НЕ кэшируются (предотвращение 502 после деплоя)

### Internationalization (i18n)

- Полная поддержка **русского** и **английского** языков
- 8 пространств имен перевода (common, admin, auth, course, enrichments, generation, organizations, profile)
- `next-intl` с SSR

---

## 9. Enterprise-Grade Infrastructure

### Multi-Tenant Architecture (60+ tables)

- **Row-Level Security** — полная изоляция данных между организациями на уровне PostgreSQL
- **4 роли**: Superadmin → Admin → Instructor → Student
- **JWT Claims Injection** — кастомный хук обогащает токены ролью и organization_id
- **RLS Policy Consolidation** — 40 политик → 18 (оптимизация производительности)

### Subscription Tiers

| Tier         | Storage | Files/Course | Formats                    |
| ------------ | ------- | ------------ | -------------------------- |
| **Free**     | 10 MB   | 0            | —                          |
| **Basic**    | 100 MB  | 1            | TXT, MD                    |
| **Standard** | 1 GB    | 3            | + PDF, DOCX, PPTX, HTML    |
| **Premium**  | 10 GB   | 10           | + PNG, JPG, GIF, SVG, WebP |

### Database

- **PostgreSQL 15+** через Supabase
- **232 миграции** (production-proven schema evolution)
- **60+ таблиц** (courses, lessons, enrichments, traces, FSM events, audit logs...)
- **Views** с `security_invoker = true` для безопасного доступа

### Full Audit Trail

- **generation_trace** — каждый LLM-вызов: модель, токены, стоимость, duration, quality score
- **fsm_events** — все переходы состояний генерации
- **audit_log** — действия пользователей (create/update/delete с before/after values)
- **error_logs** — ошибки с fingerprinting и deduplication

### Job Queue Infrastructure (BullMQ + Redis)

- **3 выделенных очереди**: main pipeline, Stage 6 (30 concurrent), Stage 7 (enrichments)
- Retry с exponential backoff
- Bull Board UI для мониторинга
- Job persistence и automatic recovery

---

## 10. DevOps & Deployment

### Blue/Green Zero-Downtime Deployment

```
        Traffic (Nginx)
              │
     ┌────────┴────────┐
     │   Active: Blue  │──→ Web :3001 + API :4001
     │   Standby: Green│──→ Web :3002 + API :4002
     └─────────────────┘
              │
         13-step deploy:
         Pull → Start → Health Check → Switch Nginx → Cleanup
              │
         Instant rollback via rollback_blue_green.sh
```

### CI/CD Pipeline (9 stages)

```
  Setup → [Lint | Type-Check | Security Audit] → [Unit | Contract | Integration Tests]
     → Build → CI Gate → Docker Build (matrix) → Deploy → [Rollback if fail]
     → Telegram Notification
```

- **Matrix Docker builds** — web, api, notebooklm-bridge (parallel)
- **GHCR** — GitHub Container Registry
- **Auto-deploy**: develop → Dev, master → Staging
- **Telegram notifications** о результатах деплоя

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

- **Coverage threshold**: 70% (branches, functions, lines, statements)
- **Pre-commit hooks**: Husky + lint-staged (ESLint + Prettier)
- **Quality gates**: lint, type-check, build — все обязательные для merge

### Containerization

- **5 Docker-сервисов**: Web, API, Worker, Docling MCP (8 GB), NotebookLM Bridge
- **Multi-stage builds** — оптимизированные production-образы
- **Resource limits** — CPU и memory constraints на каждый контейнер
- **Health checks** — на каждом сервисе (HTTP, socket, redis-cli)

### Security

| Мера           | Реализация                                            |
| -------------- | ----------------------------------------------------- |
| XSS Prevention | DOMPurify санитизация всего сгенерированного контента |
| SQL Injection  | Parameterized queries через Supabase SDK              |
| CSRF           | JWT + SameSite cookies                                |
| TLS            | TLSv1.2 + TLSv1.3                                     |
| Headers        | X-Frame-Options, X-Content-Type-Options, HSTS         |
| Rate Limiting  | Nginx (50 req/s per IP на enrichments)                |
| API Keys       | Hashed storage, prefix for identification             |
| Auth           | OAuth (Google, GitHub) + email/password               |
| Secrets Audit  | `pnpm audit --audit-level=high` в CI                  |

---

## 11. Multi-Agent Development Orchestration

Разработка ведется с помощью **Gastown** — собственной системы мульти-агентной оркестрации:

- **Mayor** — координатор задач
- **Polecats** — агенты-исполнители (изолированные git worktrees)
- **Refinery** — обработчик merge queue
- **Witness** — мониторинг здоровья агентов
- **Beads** — git-backed issue tracker с зависимостями между задачами

Это позволяет **параллельно разрабатывать** несколько фич без конфликтов.

---

## 12. Observability & Cost Control

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

### Structured Logging

- **Pino** — structured JSON logging
- Каждый LLM-вызов логируется: model, tokens, cost, duration
- **Axiom integration** (planned) для централизованного анализа

---

## 13. Admin Panel & Analytics

Полноценная административная панель:

- **Dashboard** — общая статистика (пользователи, курсы, уроки, ошибки)
- **Generation History** — история генераций с audit trail
- **Pipeline Monitor** — мониторинг всех стадий в реальном времени
- **User Management** — управление пользователями
- **Error Logs** — просмотр и анализ ошибок
- **Pricing Configuration** — настройка тарифов
- **Bull Board** — мониторинг очередей (IP-restricted)

---

## 14. Technical Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MegaCampusAI                                │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │  Next.js 15  │  │  tRPC API    │  │  BullMQ Workers (x3)    │  │
│  │  React 19    │──│  Express     │──│  Main | Stage6 | Stage7  │  │
│  │  Tailwind 4  │  │  TypeScript  │  │  30 concurrent lessons  │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────────┘  │
│         │                 │                      │                  │
│  ┌──────▼─────────────────▼──────────────────────▼──────────────┐  │
│  │                    Supabase (PostgreSQL 15+)                 │  │
│  │  60+ tables | 232 migrations | RLS | JWT | OAuth | FSM      │  │
│  └─────────────────────────────────────────────────────────────┘  │
│         │                 │                      │                  │
│  ┌──────▼───────┐  ┌──────▼───────┐  ┌──────────▼──────────────┐  │
│  │  Redis 7     │  │  Qdrant      │  │  OpenRouter (20+ LLMs)  │  │
│  │  Job Queue   │  │  Vector DB   │  │  12 AI providers        │  │
│  │  Caching     │  │  RAG Search  │  │  Smart routing          │  │
│  └──────────────┘  └──────────────┘  └─────────────────────────┘  │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │  Docling MCP │  │  NotebookLM  │  │  Jina v3 Embeddings     │  │
│  │  8 GB model  │  │  Bridge      │  │  768-dim multilingual    │  │
│  │  PDF/DOCX    │  │  Audio/Video │  │  13 languages            │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Quality Assurance                                          │   │
│  │  CLEV Voting (3 judges) | OSCQR Rubric | Bloom's Taxonomy  │   │
│  │  Hallucination Detection | Targeted Refinement | RAG Check  │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 15. Competitive Advantages

| Конкурент                       | Их подход                        | Наше преимущество                                    |
| ------------------------------- | -------------------------------- | ---------------------------------------------------- |
| Coursera / Udemy                | Ручное создание курсов           | AI-генерация за минуты                               |
| ChatGPT / Gemini                | Генерация текста без структуры   | 7-стадийный pipeline с quality assurance             |
| AI-генераторы (Synthesia, etc.) | Один тип контента (видео)        | 13 типов обогащения                                  |
| LMS (Moodle, Canvas)            | Платформа без генерации          | Генерация + доставка в одном                         |
| Простые AI-обертки              | Single-model, no quality control | 20+ моделей, 3-judge voting, hallucination detection |

### Что невозможно скопировать за вечер:

1. **7-стадийный pipeline** с LangGraph state machines — 144K строк TypeScript
2. **CLEV Judge System** с 3 независимыми судьями и Krippendorff's Alpha
3. **Hallucination detection** через logprob entropy + RAG verification
4. **5-layer ModelConfig Bunker** — survives Redis+DB outage
5. **232 миграции** — production-proven database schema
6. **302 теста** — enterprise-grade quality assurance
7. **Blue/Green deployment** с auto-rollback
8. **Multi-agent development** через Gastown

---

## 16. Roadmap

| Stage                       | Status      | Description                           |
| --------------------------- | ----------- | ------------------------------------- |
| Stage 0: Foundation         | ✅ Complete | Auth, DB, RLS, Tiers                  |
| Stage 1: Upload             | ✅ Complete | Multi-format documents                |
| Stage 2: Processing         | ✅ Complete | Docling + Vectorization + RAG         |
| Stage 3: Classification     | ✅ Complete | Document priority ranking             |
| Stage 4: Analysis           | ✅ Complete | Deep 5-phase analysis                 |
| Stage 5: Structure          | ✅ Complete | LangGraph course generation           |
| Stage 6: Content            | ✅ Complete | Lessons + Judge System                |
| Stage 7: Enrichments        | ✅ Complete | 13 content types                      |
| Stage 8: Analytics          | 🔜 Planned  | Learning analytics, progress tracking |
| Stage 9: LMS Integration    | 🔜 Planned  | Canvas, Moodle export                 |
| Stage 10: Adaptive Learning | 🔜 Planned  | Personalized learning paths           |

---

## Contact

**Version**: 0.31.17
**Staging**: https://ai.megacampus.ru
**Development**: https://dev.ai.megacampus.ru

---

_This document was generated based on actual codebase analysis of 144,000+ lines of TypeScript across 1,868 source files._
