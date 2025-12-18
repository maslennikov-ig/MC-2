# Анализ распределения ответственности между Stage 4 (Analyze) и Stage 5 (Generation)

**Дата создания**: 2025-11-20
**Статус**: Аналитический обзор текущего состояния
**Цель**: Понять текущее распределение ответственности, выявить проблемы, дать рекомендации

---

## Executive Summary

### Текущее состояние

Проект использует двухстадийную архитектуру для генерации курсов:

- **Stage 4 (Analyze)**: Анализ документов → структурирование метаданных → планирование курса
- **Stage 5 (Generation)**: Детализация структуры → генерация контента уроков → валидация качества

### Ключевые выводы

✅ **Что работает хорошо**:
- Четкое разделение ответственности между анализом и генерацией
- Архитектура основана на научных исследованиях (Perplexity Research: RT-001, RT-002)
- Hybrid Specialization Model (78.5% success rate vs 66.2% для LLM-only)
- Продуманная модельная маршрутизация (qwen3-max для рассуждений, Gemini для больших контекстов)

⚠️ **Потенциальные проблемы**:
- Возможный оверинжиниринг в слое регенерации (5 слоев + 3 уровня валидации)
- Дублирование логики обработки ошибок между стадиями
- Неполная миграция документации (deprecated scope_instructions все еще используется)
- RAG Planning пока не реализован (запланирован в ANALYZE-ENHANCEMENT-UNIFIED)

---

## 1. Что делает Stage 4 (Analyze)

### 1.1 Архитектурная роль

**Философия**: "Extract and Structure" - извлечение информации из полного контекста документов

**Ключевые принципы**:
- Использование моделей с большим контекстным окном (Gemini 2.5 Flash - 1M tokens)
- Обработка всего документа за один проход (no chunking)
- Фокус на паттернах и отношениях между частями документа
- Вывод: структурированный JSON с метаданными

### 1.2 Реальная реализация (7 фаз)

Согласно коду `analysis-orchestrator.ts`:

```
Phase 0 (Pre-Flight): Stage 3 barrier validation (0-10%)
Phase 1: Basic Classification (10-20%) - категория курса, целевая аудитория
Phase 2: Scope Analysis (20-35%) - количество уроков, проверка минимума 10 lessons
Phase 3: Deep Expert Analysis (35-60%) - педагогическая стратегия, глубокий анализ
Phase 4: Document Synthesis (60-75%) - синтез информации из документов
Phase 6: RAG Planning (75-85%) - mapping документов к секциям (PLANNED, не полностью реализовано)
Phase 5: Final Assembly (85-100%) - сборка финального AnalysisResult
```

### 1.3 Что выдает на выходе

**Текущая структура** (`AnalysisResult`):

```typescript
{
  course_category: { primary, secondary, rationale },
  contextual_language: { ... },
  pedagogical_strategy: {
    teaching_style, interaction_type, content_delivery, assessment_approach
  },
  recommended_structure: {
    total_lessons, total_sections, estimated_content_hours, difficulty_level
  },
  sections_breakdown: [
    {
      area, estimated_lessons, importance, learning_objectives,
      key_topics, pedagogical_approach, difficulty_progression,
      section_id, estimated_duration_hours, difficulty, prerequisites // НОВЫЕ ПОЛЯ
    }
  ],
  expansion_areas: [...], // Опциональные темы
  research_flags: [...],  // Требования дополнительных исследований
  scope_instructions: string, // DEPRECATED - будет заменен на generation_guidance
  metadata: { total_tokens, total_cost_usd, model_usage, ... }
}
```

**Планируемые улучшения** (из ANALYZE-ENHANCEMENT-UNIFIED.md):

1. **pedagogical_patterns** - паттерны преподавания (theory/practice ratio, assessment types)
2. **generation_guidance** - структурированные ограничения для Generation (tone, analogies, visuals, exercises)
3. **document_relevance_mapping** - RAG plan для Generation (какие документы релевантны каким секциям)
4. **document_analysis** - метаданные на уровне документа (themes, complexity, coverage)

### 1.4 Что НЕ делает Analyze

❌ **Не создает**:
- Детальные lesson-level спецификации (создает только section-level)
- Specific prompts для генерации уроков
- Упражнения и задания
- Технические схемы для Stage 6 (content generation)
- JSON repair на уровне Generation (это уже ответственность UnifiedRegenerator в Generation)

---

## 2. Что делает Stage 5 (Generation)

### 2.1 Архитектурная роль

**Философия**: "Reason and Create" - рассуждение и детальная генерация контента

**Ключевые принципы**:
- Использование моделей с продвинутыми reasoning способностями (qwen3-max, OSS 120B)
- Работа со структурированным входом от Analyze (не с raw documents)
- Фокус на pedagogical reasoning и creative synthesis
- Вывод: готовая структура курса с lessons

### 2.2 Реальная реализация (5 фаз LangGraph)

Согласно коду `generation-orchestrator.ts`:

```
Phase 1: validate_input - проверка schema analysis_result
Phase 2: generate_metadata - генерация метаданных курса (MetadataGenerator)
Phase 3: generate_sections - генерация секций и уроков (SectionBatchGenerator)
Phase 4: validate_quality - валидация качества (QualityValidator, threshold 0.75)
Phase 5: validate_lessons - проверка минимума 10 уроков
```

**LangGraph StateGraph**:
- Линейный workflow (no conditional branching)
- Immutable state updates
- Retry tracking per phase
- Token usage tracking
- Model selection tracking

### 2.3 Что выдает на выходе

**Структура** (`GenerationResult`):

```typescript
{
  course_structure: {
    title, description,
    learning_outcomes: [...],
    difficulty_level, estimated_duration_hours,
    prerequisites: [...],
    target_audience,
    sections: [
      {
        section_id, title, description,
        lessons: [
          {
            lesson_id, title, description,
            learning_objectives: [...],
            topics: [...],
            estimated_duration_minutes,
            difficulty_level,
            exercises: [...],
            interactive_elements: [...]
          }
        ],
        section_metadata: { ... }
      }
    ]
  },
  generation_metadata: {
    total_tokens: { metadata, sections, validation, total },
    cost_usd,
    quality_scores: { metadata_similarity, sections_similarity, overall },
    model_used: { metadata, sections, validation },
    batch_count,
    retry_count: { metadata, sections }
  }
}
```

### 2.4 Что НЕ делает Generation

❌ **Не создает**:
- Анализ документов (уже сделан в Analyze)
- Holistic pattern detection (Analyze уже извлек паттерны)
- Document-level understanding (Analyze имеет full context)
- RAG векторизацию (это Stage 3 - Document Processing)

---

## 3. Ключевые исследования и решения

### 3.1 Perplexity Research: Multi-Stage Architecture

**Источник**: `docs/research/008-generation/Optimal Multi-Stage Architecture for AI Course Generation.md`

**Ключевые находки**:

1. **Hybrid Specialization Model**: 78.5% success rate
   - Single-stage: 29.2%
   - LLM-only multi-stage: 66.2%
   - **Hybrid (наш подход): 78.5%** ✅

2. **Division of Labor принцип**:
   - Analyze: "comprehensive extraction and high-level structuring"
   - Generation: "intelligent reasoning and detailed content creation"

3. **Оптимальная granularity**:
   - Analyze: Section-level (3-7 sections)
   - Generation: Lesson-level (3-5 lessons per section)

4. **Full-context vs RAG**:
   - Full-context (Analyze): 47.25 F1 score
   - RAG: 34.26 F1 score
   - **Вывод**: Full-context первично, RAG - optional enhancement

5. **Scope instructions guidance**:
   - ❌ Too detailed: снижает качество на 15-30% (over-constrains reasoning)
   - ✅ Architectural blueprints: objectives, constraints, success criteria
   - ❌ Too vague: "generate good content"

**Цитата из исследования**:
> "Critical: Analyze should NOT generate specific lesson prompts or paragraph-level content instructions. Research shows this over-constrains downstream reasoning models, reducing quality by 15-30%. Instead, provide objectives, constraints, and success criteria - the 'what' not the 'how.'"

### 3.2 Production Evidence: RudderStack Case Study

**Источник**: Тот же research document

**Архитектура**:
- Batch preprocessing layer (parallel: Analyze)
- Smart reasoning layer (parallel: Generation)

**Результаты**:
- 95% triage time reduction
- 90%+ first-pass accuracy
- Clear debugging paths

**Вывод**: Separation of concerns работает в production

---

## 4. Текущее распределение ответственности

### 4.1 Матрица ответственности

| Задача | Analyze (Stage 4) | Generation (Stage 5) | Обоснование |
|--------|-------------------|----------------------|-------------|
| **Анализ документов** | ✅ ВЛАДЕЛЕЦ | ❌ НЕТ | Large-context window (1M tokens) |
| **Pattern detection** | ✅ ВЛАДЕЛЕЦ | ❌ НЕТ | Holistic understanding |
| **Pedagogical strategy** | ✅ ВЛАДЕЛЕЦ | ❌ НЕТ | Based on document analysis |
| **Section structure** | ✅ ВЛАДЕЛЕЦ | ✅ REFINEMENT | Analyze: high-level, Generation: detailed |
| **Lesson breakdown** | ❌ НЕТ | ✅ ВЛАДЕЛЕЦ | Reasoning strength |
| **Learning objectives** | ✅ Section-level | ✅ Lesson-level | Division of granularity |
| **Exercise generation** | ❌ НЕТ | ✅ ВЛАДЕЛЕЦ | Creative synthesis |
| **Prompts for Stage 6** | ❌ НЕТ | ✅ ВЛАДЕЛЕЦ | Downstream requirements understanding |
| **JSON repair (auto)** | ✅ Layer 1-2 | ✅ Layer 1-5 | UnifiedRegenerator в обеих стадиях |
| **Quality validation** | ❌ НЕТ | ✅ ВЛАДЕЛЕЦ | Phase 4 in Generation |
| **RAG planning** | ✅ ПЛАНИРУЕТСЯ | ✅ ИСПОЛЬЗУЕТ | Analyze создает план, Generation использует |
| **Token tracking** | ✅ ДА | ✅ ДА | Независимые метрики |
| **Cost tracking** | ✅ ДА | ✅ ДА | Независимые метрики |

### 4.2 Data Flow

```
┌────────────────────────────────────────────────────────────┐
│ Stage 3: Document Processing                               │
│ - Docling PDF extraction                                   │
│ - Hierarchical chunking (400 tokens child, 1500 parent)    │
│ - Vectorization (Qdrant) FROM ORIGINAL DOCUMENTS           │
│ - Summary generation (if needed for Analyze budget)        │
└─────────────────────┬──────────────────────────────────────┘
                      │
                      │ document_summaries (or full text)
                      ↓
┌────────────────────────────────────────────────────────────┐
│ Stage 4: ANALYZE (Gemini 2.5 Flash 1M context)             │
│                                                             │
│ Phase 0: Barrier validation (Stage 3 complete?)            │
│ Phase 1: Classification (course_category, target_audience) │
│ Phase 2: Scope Analysis (min 10 lessons check)             │
│ Phase 3: Expert Analysis (pedagogical_strategy)            │
│ Phase 4: Document Synthesis                                │
│ Phase 6: RAG Planning (document-to-section mapping) 🔄 WIP │
│ Phase 5: Assembly (AnalysisResult)                         │
│                                                             │
│ Output: analysis_result (JSONB, 3-5K tokens)               │
└─────────────────────┬──────────────────────────────────────┘
                      │
                      │ AnalysisResult
                      ↓
┌────────────────────────────────────────────────────────────┐
│ Stage 5: GENERATION (qwen3-max 128K context)               │
│                                                             │
│ Phase 1: Validate Input (schema check)                     │
│ Phase 2: Generate Metadata (MetadataGenerator)             │
│ Phase 3: Generate Sections (SectionBatchGenerator)         │
│         - Optional: RAG context retrieval 🔄 WIP           │
│         - Batch processing (parallel sections)             │
│ Phase 4: Validate Quality (0.75 threshold)                 │
│ Phase 5: Validate Lessons (min 10 lessons)                 │
│                                                             │
│ Output: course_structure (JSONB, 100-200K tokens)          │
└────────────────────────────────────────────────────────────┘
```

**Ключевые особенности**:

1. **Analyze** получает summaries ИЛИ full text (в зависимости от token budget)
2. **Векторы** ВСЕГДА из оригиналов (не из summaries) - для RAG quality
3. **RAG Planning** (Phase 6) пока не полностью реализован
4. **Generation** может использовать RAG (но это optional, пока WIP)

---

## 5. Система регенерации (UnifiedRegenerator)

### 5.1 Архитектура

**Источник**: `docs/REGENERATION-STRATEGY.md`

**Проблема**: Два типа ошибок
1. Context Overflow (input too large) → Emergency Phase (Grok/Gemini)
2. Quality/Validation Failure → UnifiedRegenerator (5 layers)

### 5.2 Пять слоев регенерации

| Layer | Strategy | Cost | Success Rate | Use Case |
|-------|----------|------|--------------|----------|
| **Layer 1** | Auto-repair (jsonrepair + field-name-fix) | **FREE** | **95-98%** | Malformed JSON, camelCase→snake_case |
| **Layer 2** | Critique-revise (LLM feedback loop) | 1x cost | +2-3% | Logical errors, missing fields |
| **Layer 3** | Partial regeneration (field-level atomic repair) | 0.5x cost | +5-10% | Specific field validation failures |
| **Layer 4** | Model escalation (20B → 120B) | 6x cost | +10-15% | Complex reasoning failures |
| **Layer 5** | Quality fallback (Kimi K2) | 2x cost | +5-8% | Last resort, high quality needed |

### 5.3 Три уровня валидации

**Tier 1: Preprocessing** (FREE, instant, 60-80% success)
- Lowercase + trim
- Fix typos (hyphen → underscore)
- Map synonyms ('analysis' → 'case_study')

**Tier 2: Semantic Matching** ($0.00002, 50ms, 12-15% success)
- Embeddings (OpenAI text-embedding-3-small)
- Cosine similarity > 0.85
- **Status**: Implemented but NOT integrated yet

**Tier 3: Warning Fallback** (Stage 4 only)
- Accept invalid value with warning
- Mark: `validated: false`
- **ONLY for Stage 4 advisory fields** (Stage 5 must be strict for database integrity)

### 5.4 Где используется

**Analyze (Stage 4)**:
- All phases (1-4) use UnifiedRegenerator
- Configuration: `allowWarningFallback: true` (advisory fields OK)
- Layers 1-5 enabled

**Generation (Stage 5)**:
- Metadata generation uses UnifiedRegenerator
- Section generation uses UnifiedRegenerator
- Configuration: `allowWarningFallback: false` (strict database validation)
- Layers 1-5 enabled

---

## 6. Проблемы и риски

### 6.1 Потенциальный оверинжиниринг

#### 6.1.1 Пять слоев регенерации - это много?

**Аргументы "ЗА" сложность**:
- ✅ Layer 1 (free) покрывает 95-98% случаев - это хорошо
- ✅ Layers 2-5 срабатывают редко (<5%) - добавляют надежность
- ✅ Production evidence: 95%+ success rate
- ✅ Cost analysis: $2,700 annual savings (96% cost reduction)

**Аргументы "ПРОТИВ" сложность**:
- ⚠️ 5 слоев + 3 tier validation = 8 уровней обработки ошибок
- ⚠️ Debugging complexity: какой слой сработал? Почему?
- ⚠️ Maintenance overhead: 8 стратегий поддерживать
- ⚠️ Over-abstraction: большинство проблем решает Layer 1

**Моё мнение**:
- Layers 1-2: абсолютно оправданы
- Layers 3-4: оправданы для production
- Layer 5: questionable (Kimi K2 - дорого, +5-8% marginal improvement)
- Tier 2 (Semantic Matching): не интегрирован → возможно, не нужен?

#### 6.1.2 RAG Planning - добавляет ли ценность?

**Текущий статус**: Planned (ANALYZE-ENHANCEMENT-UNIFIED), не реализован

**Обещания**:
- +$0.068/course savings (no extra Planning LLM call)
- +20% RAG quality (targeted retrieval)
- Solves full-text document token budget problem

**Риски**:
- ⚠️ Analyze уже перегружен (7 phases)
- ⚠️ Phase 6 (RAG Planning) - это 8-я фаза по факту
- ⚠️ Generation может работать без RAG (MVP functional)
- ⚠️ Сложность: document-to-section mapping требует reasoning

**Моё мнение**:
- Оставить как optional enhancement (Phase 2)
- Не блокирует production launch
- A/B тест покажет, есть ли реальная ценность

### 6.2 Дублирование логики

**Проблема**: UnifiedRegenerator используется в ОБЕИХ стадиях

**Плюсы**:
- ✅ Consistent error handling
- ✅ Shared infrastructure

**Минусы**:
- ⚠️ Duplication: каждая стадия настраивает regenerator отдельно
- ⚠️ Configuration drift: allowWarningFallback разный
- ⚠️ Maintenance: изменения нужно синхронизировать

**Рекомендация**: Оставить как есть, но документировать различия в конфигурации

### 6.3 Deprecated fields

**Проблема**: `scope_instructions` (string) еще используется

**План**: Заменить на `generation_guidance` (structured)

**Статус**: ANALYZE-ENHANCEMENT-UNIFIED (approved, not implemented)

**Риск**: Technical debt, backward compatibility burden

**Рекомендация**: Приоритизировать миграцию (Phase 1 implementation)

### 6.4 Архитектурная неконсистентность

**Обнаружено**: INV-2025-11-19-002-stage5-architecture-cleanup.md

**Проблема**: Duplicate folders
- Active: `/services/stage5/` (15 files)
- Unused: `/orchestrator/services/generation/` (3 files, abandoned refactoring)

**Статус**: READY FOR EXECUTION (cleanup pending)

**Риск**: Developer confusion, wasted effort

**Рекомендация**: Удалить duplicate ASAP + создать STAGE5-ARCHITECTURE.md

---

## 7. Мое мнение: есть ли оверинжиниринг?

### 7.1 Что ХОРОШО спроектировано ✅

1. **Hybrid Specialization Model** - научно обоснован (78.5% vs 66.2%)
2. **Division of Labor** - четкое разделение: Analyze = structure, Generation = details
3. **Section vs Lesson granularity** - правильный уровень абстракции
4. **Model routing** - используем strengths каждой модели
5. **Layer 1-2 regeneration** - free + effective, оправдан

### 7.2 Что вызывает вопросы ⚠️

#### 7.2.1 Регенерация: слишком много слоев

**Текущее**: 5 layers + 3 tiers = 8 уровней

**Рекомендация**: Упростить до 4 уровней
```
Layer 1: Auto-repair (jsonrepair + field-name-fix) - FREE, 95-98%
Layer 2: Critique-revise - 1x cost, +2-3%
Layer 3: Partial regeneration - 0.5x cost, +5-10%
Layer 4: Model escalation (20B → 120B) - 6x cost, +10-15%
[REMOVE] Layer 5: Kimi K2 - marginal value, high cost
```

**Обоснование**:
- Layer 4 (120B) уже достаточно мощный
- Layer 5 добавляет только +5-8% при 2x cost
- Production 99.5% success rate достижим с 4 слоями

**Tier 2 (Semantic Matching)**:
- ❌ Не интегрирован за несколько месяцев
- ❌ Возможно, не нужен (Layer 1 покрывает 95-98%)
- Рекомендация: Удалить ИЛИ интегрировать в ближайшие 2 недели

#### 7.2.2 Analyze: слишком много фаз?

**Текущее**: 7 phases (0, 1, 2, 3, 4, 6, 5)

**Проблемы**:
- Фазы 0, 6, 5 - это auxiliary logic, не core analysis
- Phase numbering: почему Phase 6 между 4 и 5?
- Phase 0 (barrier check) - это validation, не analysis

**Рекомендация**: Переименовать для ясности
```
Pre-Flight Validation (barrier check)
Phase 1: Classification
Phase 2: Scope Analysis
Phase 3: Expert Analysis
Phase 4: Document Synthesis
Phase 5: Final Assembly
[OPTIONAL] RAG Planning (future enhancement)
```

**Обоснование**: Убирает confusion, делает workflow понятнее

#### 7.2.3 RAG Planning - преждевременная оптимизация?

**Статус**: Planned, не реализован

**Обещания**: +20% RAG quality, $0.068 savings

**Реальность**:
- Generation уже работает без RAG (MVP functional)
- RAG - optional enhancement, не core requirement
- Добавляет complexity в Analyze (уже 7 фаз)

**Рекомендация**: DEFER to Phase 2
- Запустить production БЕЗ RAG Planning
- A/B тест: нужен ли RAG вообще?
- Если нужен: добавить RAG Planning позже

### 7.3 Итоговая оценка

**Оверинжиниринг?**

**Да, есть элементы:**
- ✂️ Layer 5 regeneration - можно убрать
- ✂️ Tier 2 (Semantic Matching) - не используется, удалить
- ✂️ RAG Planning - отложить до Phase 2

**Нет, core архитектура правильная:**
- ✅ Hybrid Specialization Model - обоснован
- ✅ Division of Labor - правильное распределение
- ✅ Layers 1-4 regeneration - необходимы для production
- ✅ Multi-phase orchestration - структурирует сложность

**Рекомендации по упрощению**:

1. **Короткий срок (1-2 недели)**:
   - Удалить duplicate folder (`/orchestrator/services/generation/`)
   - Создать STAGE5-ARCHITECTURE.md
   - Удалить Tier 2 (Semantic Matching) если не интегрируется
   - Документировать Layer 5 как optional (можно отключить)

2. **Средний срок (1-2 месяца)**:
   - Мигрировать `scope_instructions` → `generation_guidance`
   - Переименовать Analyze phases для ясности
   - A/B тест: Layer 5 vs without Layer 5

3. **Долгий срок (3-6 месяцев)**:
   - A/B тест: RAG Planning нужен или нет?
   - Если нужен: реализовать
   - Если нет: удалить из roadmap

---

## 8. Финальная рекомендация

### 8.1 Текущее распределение ответственности - правильное ✅

**Analyze (Stage 4)**:
- ✅ Extract comprehensive structure from full documents
- ✅ Provide high-level pedagogical guidance
- ✅ Section-level breakdown (not lesson-level)
- ✅ Objectives, constraints, success criteria

**Generation (Stage 5)**:
- ✅ Elaborate structure into detailed lessons
- ✅ Reason about pedagogy and content
- ✅ Generate exercises, prompts, assessments
- ✅ Quality validation

**Separation of concerns**: Правильная, основана на научных исследованиях

### 8.2 Упрощения для снижения complexity

**High Priority** (сделать в ближайшие 2 недели):

1. ✂️ Удалить duplicate folder `/orchestrator/services/generation/`
2. ✂️ Удалить Tier 2 (Semantic Matching) ИЛИ интегрировать (decision point)
3. ✅ Создать STAGE5-ARCHITECTURE.md

**Medium Priority** (1-2 месяца):

4. ✂️ Сделать Layer 5 (Kimi K2) optional (config flag)
5. ✅ Мигрировать `scope_instructions` → `generation_guidance`
6. ✅ Переименовать Analyze phases для clarity

**Low Priority** (3-6 месяцев):

7. 🔬 A/B тест: RAG Planning - нужен или нет?
8. 🔬 A/B тест: Layer 5 regeneration - добавляет ли value?
9. ✅ Production metrics: track regeneration layer usage

### 8.3 Оставить как есть (хорошо спроектировано)

✅ **Hybrid Specialization Model** - работает, не трогать
✅ **Division of Labor** - правильное распределение, не менять
✅ **Layers 1-4 regeneration** - необходимы, оставить
✅ **Multi-phase orchestration** - структурирует complexity, оставить
✅ **LangGraph StateGraph** - правильный выбор для Generation, оставить

---

## 9. Заключение

**Главный вывод**: Архитектура спроектирована правильно, основана на исследованиях, но есть элементы оверинжиниринга в деталях (слишком много слоев регенерации, неиспользуемые features).

**Action Items**:

1. ✂️ Упростить: удалить Layer 5, Tier 2, duplicate folders
2. ✅ Документировать: STAGE5-ARCHITECTURE.md, миграция scope_instructions
3. 🔬 Измерить: A/B тесты для RAG Planning и Layer 5
4. ✅ Оставить core как есть: Hybrid Specialization правильная

**Итоговая оценка**: **7/10** (хорошо, но можно упростить)

---

**Автор анализа**: Claude Code (Sonnet 4.5)
**Дата**: 2025-11-20
**Источники**:
- Research documents: RT-001, RT-002, Perplexity Multi-Stage Architecture
- Code: analysis-orchestrator.ts, generation-orchestrator.ts
- Investigations: INV-2025-11-19-002, REGENERATION-STRATEGY.md
- Specs: ANALYZE-ENHANCEMENT-UNIFIED.md
