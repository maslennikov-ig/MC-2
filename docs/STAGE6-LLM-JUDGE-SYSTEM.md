# Stage 6: LLM Judge System

**Дата создания**: 2025-11-22
**Статус**: Реализовано (v0.19.13+)
**Основано на**: Research Report "LLM Judge Implementation for Educational Lesson Content Validation"

---

## Обзор

LLM Judge System - автоматическая система оценки качества сгенерированного контента уроков в Stage 6. Использует несколько LLM-моделей для объективной оценки и принятия решений о публикации, доработке или эскалации к человеку.

---

## Архитектура CLEV Voting

**CLEV** = Consensus via Lightweight Efficient Voting

### Принцип работы

```
┌─────────────────────────────────────────────────────────────────┐
│                    УРОК СГЕНЕРИРОВАН                            │
│            (Qwen3 для RU / DeepSeek для EN)                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 ФАЗА 1: Heuristic Filter (FREE)                 │
│  • Проверка длины контента                                      │
│  • Проверка наличия всех секций                                 │
│  • Базовая структурная валидация                                │
│  → 15-20% контента отсеивается без вызова LLM                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│           ФАЗА 2: CLEV Voting (2 судей параллельно)             │
│                                                                 │
│   ┌──────────────┐           ┌──────────────┐                   │
│   │   СУДЬЯ 1    │           │   СУДЬЯ 2    │                   │
│   │   (Primary)  │           │  (Secondary) │                   │
│   └──────────────┘           └──────────────┘                   │
│         │                           │                           │
│         └───────────┬───────────────┘                           │
│                     │                                           │
│          ┌──────────┴──────────┐                                │
│          │ Разница оценок <10%?│                                │
│          └──────────┬──────────┘                                │
│                     │                                           │
│       ┌─────────────┼─────────────┐                             │
│       │ ДА         │             │ НЕТ                          │
│       ▼             │             ▼                             │
│  ┌─────────┐        │        ┌─────────────┐                    │
│  │ КОНСЕНСУС│       │        │ TIEBREAKER │                     │
│  │ (67% эко-│       │        │ (3-й судья) │                    │
│  │  номия)  │       │        └─────────────┘                    │
│  └─────────┘        │                                           │
└─────────────────────┼───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    РЕШЕНИЕ (Decision Tree)                      │
│                                                                 │
│   Score ≥ 0.90  →  ACCEPT (публикация)                          │
│   0.75 - 0.90   →  TARGETED_FIX (точечное исправление)          │
│   0.60 - 0.75   →  ITERATIVE_REFINEMENT (до 2 итераций)         │
│   < 0.60        →  REGENERATE (полная перегенерация)            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Выбор моделей судей

### Проблема Self-Evaluation Bias

Исследования показывают, что модель оценивает свой собственный контент на 10-25% выше, чем контент других моделей. Это называется **self-evaluation bias**.

### Решение: Language-Aware Judge Selection

Судьи ВСЕГДА отличаются от модели-генератора:

| Язык контента | Генератор | Primary Judge | Secondary Judge | Tiebreaker |
|---------------|-----------|---------------|-----------------|------------|
| **RU** | `qwen/qwen3-235b-a22b-2507` | `deepseek/deepseek-v3.1-terminus` | `moonshotai/kimi-k2-0905` | `minimax/minimax-m2` |
| **EN/Other** | `deepseek/deepseek-v3.1-terminus` | `qwen/qwen3-235b-a22b-2507` | `moonshotai/kimi-k2-0905` | `minimax/minimax-m2` |

### Веса моделей

```typescript
AVAILABLE_JUDGE_MODELS = {
  'qwen3':      { modelId: 'qwen/qwen3-235b-a22b-2507',    weight: 0.75 },
  'deepseek':   { modelId: 'deepseek/deepseek-v3.1-terminus', weight: 0.74 },
  'kimi-k2':    { modelId: 'moonshotai/kimi-k2-0905',      weight: 0.73 },
  'minimax-m2': { modelId: 'minimax/minimax-m2',          weight: 0.72 },
  'glm-4':      { modelId: 'z-ai/glm-4.6',                weight: 0.71 },
  'gemini':     { modelId: 'google/gemini-2.5-flash',     weight: 0.68 }, // fallback only
}
```

### Дополнительные модели (для расширения/fallback)

- `z-ai/glm-4.6` (weight: 0.71)
- `google/gemini-2.5-flash` (weight: 0.68) — только крайний fallback

---

## Критерии оценки (OSCQR Rubric)

Используется адаптированная версия OSCQR (Online Student Course Quality Review) рубрики:

| Критерий | Вес | Что оценивается |
|----------|-----|-----------------|
| **Objective Alignment** | 25% | Соответствие learning objectives |
| **Pedagogical Structure** | 20% | Правильная последовательность, scaffolding |
| **Factual Accuracy** | 15% | Отсутствие ошибок, галлюцинаций |
| **Clarity** | 15% | Понятность, терминология |
| **Engagement** | 15% | Примеры, аналогии, интерактивность |
| **Completeness** | 10% | Полнота покрытия темы |

### Формула расчета общего скора

```typescript
overallScore =
  objectiveAlignment * 0.25 +
  pedagogicalStructure * 0.20 +
  factualAccuracy * 0.15 +
  clarity * 0.15 +
  engagement * 0.15 +
  completeness * 0.10
```

---

## Decision Tree (Дерево решений)

### Пороговые значения

```typescript
DECISION_THRESHOLDS = {
  ACCEPT: 0.90,              // Score >= 0.90: публикация
  HIGH_QUALITY: 0.75,        // Score 0.75-0.90: доработка
  MEDIUM_QUALITY: 0.60,      // Score 0.60-0.75: итеративный рефайнмент
  LOW_QUALITY: 0.60,         // Score < 0.60: регенерация
  REFINEMENT_TARGET: 0.80,   // Целевой score после рефайнмента
}
```

### Логика принятия решений

```
IF score >= 0.90:
  → ACCEPT (публикация, возможна легкая полировка)

IF score 0.75-0.90:
  IF issues локализованы (<30% контента):
    → TARGETED_FIX (1 итерация точечных исправлений)
  ELSE:
    → ITERATIVE_REFINEMENT (до 2 итераций)
    IF улучшение < 3% после итерации:
      → ACCEPT (diminishing returns)

IF score 0.60-0.75:
  → ITERATIVE_REFINEMENT (до 2 итераций)
  IF score < 0.80 после 2 итераций:
    → REGENERATE с enhanced prompt

IF score < 0.60:
  → IMMEDIATE REGENERATE
  Используем failure analysis для улучшения промпта
```

---

## Эскалация к человеку

### Триггеры эскалации

| Триггер | Условие | Приоритет |
|---------|---------|-----------|
| **LOW_SCORE_AFTER_REFINEMENT** | Score < 0.75 после 2 итераций | MEDIUM (HIGH если < 0.50) |
| **LOW_JUDGE_CONFIDENCE** | ВСЕ судьи: confidence = "low" | MEDIUM |
| **CONFLICTING_VERDICTS** | StdDev оценок > 0.15 (15%) | MEDIUM |
| **FACTUAL_ACCURACY_CONCERNS** | factual_accuracy < 0.70 ИЛИ critical issue | **HIGH** (всегда) |
| **COST_EXCEEDED** | Стоимость > 5x базовой генерации | LOW |
| **MAX_ITERATIONS_REACHED** | 2 итерации, score < 0.90 | LOW-MEDIUM |

### Приоритизация очереди

```
HIGH:   Factual accuracy concerns, critical issues, score < 0.50
MEDIUM: Low scores (0.50-0.70), conflicting verdicts, low confidence
LOW:    Cost exceeded, max iterations (score >= 0.70)
```

### Review Queue Lifecycle

```
pending → in_review → approved | rejected | regenerate_requested
```

---

## Refinement Loop

### Модели для Refinement

```typescript
REFINEMENT_MODELS = {
  default: 'moonshotai/kimi-k2-0905',
  fallback: 'minimax/minimax-m2',
}
```

### Процесс рефайнмента

1. Получаем verdict от судей с issues
2. Генерируем Fix Templates на основе issues
3. Применяем targeted fixes к контенту
4. Повторяем оценку
5. Максимум 2 итерации

### Fix Templates

```typescript
FIX_TEMPLATE_STRATEGIES = {
  objective_alignment: "Align content with learning objectives...",
  pedagogical_structure: "Improve scaffolding and sequencing...",
  factual_accuracy: "Verify and correct factual claims...",
  clarity: "Simplify explanations and terminology...",
  engagement: "Add examples and interactive elements...",
  completeness: "Expand coverage of missing topics...",
}
```

---

## Mermaid Fix Pipeline (3-Layer Defense)

**Добавлено в v0.26.x**

LLM часто генерируют некорректный синтаксис Mermaid, особенно escaped quotes (`\"`) которые ломают рендеринг.
Система реализует 3-уровневую защиту:

### Layer 1: Prevention (Prompt Instructions)

Файл: `src/shared/prompts/prompt-registry.ts`

Инструкции в промпте явно запрещают использование escaped quotes в Mermaid диаграммах.

### Layer 2: Auto-Fix (Sanitizer)

Файл: `src/stages/stage6-lesson-content/utils/mermaid-sanitizer.ts`

Автоматически удаляет `\"` из Mermaid блоков после генерации:

```typescript
import { sanitizeMermaidBlocks } from './utils/mermaid-sanitizer';

const result = sanitizeMermaidBlocks(content);
// result.content - очищенный контент
// result.modified - были ли изменения
// result.fixes - детали примененных исправлений
```

### Layer 3: Detection (Heuristic Filter)

Файл: `judge/heuristic-filter.ts` (функция `checkMermaidSyntax()`)

Обнаруживает оставшиеся проблемы Mermaid и направляет их:
- **CRITICAL severity** → запускает `REGENERATE` (дешевая модель)
- НЕ отправляется в Judge (дорогие модели)

### Ключевое архитектурное решение

Проблемы Mermaid имеют `severity: CRITICAL` что запускает `REGENERATE`, а НЕ `FLAG_TO_JUDGE`.
Это позволяет избежать дорогих вызовов Judge для легко исправимых синтаксических ошибок.

---

## Дополнительные компоненты

### Entropy-based Hallucination Detection

Использует logprob entropy для обнаружения потенциальных галлюцинаций:

```typescript
ENTROPY_THRESHOLDS = {
  LOW: 0.3,      // Низкая энтропия - уверенный ответ
  MEDIUM: 0.6,   // Средняя энтропия - возможная неуверенность
  HIGH: 0.8,     // Высокая энтропия - потенциальная галлюцинация
}
```

При высокой энтропии запускается дополнительная верификация через RAG (если доступен контекст).

### Factual Verifier

Проверяет фактическую корректность через:
1. Сравнение с RAG chunks (если доступны)
2. Cross-reference с исходными документами курса
3. Semantic similarity проверка утверждений

### Heuristic Filter (Pre-LLM)

Бесплатные проверки до вызова LLM:
- Минимальная длина контента
- Наличие всех обязательных секций
- Базовая структурная валидация
- **Mermaid синтаксис** (escaped quotes, unclosed brackets)
- Языковая консистентность (Unicode script detection)
- Обнаружение truncation (неполные предложения)
- Отсеивает 30-50% явно некачественного контента

**Маршрутизация по severity:**

| Severity | Action | Описание |
|----------|--------|----------|
| `CRITICAL` (Mermaid, truncation) | `REGENERATE` | Дешевая модель для регенерации |
| `COMPLEX` (factual, major) | `FLAG_TO_JUDGE` | Полная оценка Judge |
| `FIXABLE` (clarity, tone) | `SURGICAL_EDIT` | Patcher применяет точечное исправление |
| `INFO` (minor observations) | Pass through | Без действий |

### Prompt Cache

Кеширование промптов для оптимизации:
- Системные промпты для судей
- Rubric definitions
- Fix templates
- TTL: 1 час

---

## Стоимость и оптимизация

### Экономия через CLEV

- **67% случаев**: 2 судей согласны → результат сразу (экономия 33% vs 3-way voting)
- **33% случаев**: Требуется 3-й судья как tiebreaker

### Примерная стоимость на урок

| Компонент | Стоимость |
|-----------|-----------|
| Heuristic Filter | $0 |
| Primary Judge | ~$0.001-0.002 |
| Secondary Judge | ~$0.001-0.002 |
| Tiebreaker (33% случаев) | ~$0.001 |
| **Среднее на урок** | **~$0.003-0.005** |

### Temperature

Все судьи используют `temperature: 0.1` для консистентности оценок.

---

## Targeted Refinement (Best-Effort Fallback)

**Добавлено в v0.26.x**

Система targeted refinement применяет хирургические исправления к конкретным секциям вместо полной регенерации.

### Конфигурация

```typescript
REFINEMENT_CONFIG = {
  limits: {
    maxIterations: 3,      // Максимум итераций уточнения
    maxTokens: 15000,      // Бюджет токенов
    timeoutMs: 300000,     // 5 минут таймаут
  },
  quality: {
    regressionTolerance: 0.05,    // 5% допуск на регрессию
    sectionLockAfterEdits: 2,     // Блокировка секции после 2 правок
    convergenceThreshold: 0.02,   // 2% порог улучшения
  },
}
```

### Best-Effort Fallback

Когда достигнут максимум итераций без достижения порога:
- Возвращает итерацию с **НАИВЫСШИМ score** (не оригинал)
- Включает `improvementHints` извлеченные из нерешенных issues
- Устанавливает `qualityStatus`: 'good' | 'acceptable' | 'below_standard'

### Модель Patcher

Patcher использует БЕСПЛАТНУЮ модель: `xiaomi/mimo-v2-flash:free`
Это минимизирует стоимость уточнений при сохранении качества.

### Блокировка секций

После 2 правок секция блокируется для предотвращения осцилляции.
Это предотвращает бесконечные циклы исправлений.

---

## Файловая структура

```
packages/course-gen-platform/src/stages/stage6-lesson-content/
├── utils/
│   └── mermaid-sanitizer.ts     # Layer 2: Auto-fix Mermaid syntax
├── judge/
│   ├── clev-voter.ts            # CLEV voting orchestration, model selection
│   ├── cascade-evaluator.ts     # Cascade evaluation (heuristics → single → CLEV)
│   ├── decision-engine.ts       # Score-based decision tree
│   ├── heuristic-filter.ts      # Pre-LLM validation + Mermaid check (Layer 3)
│   ├── entropy-detector.ts      # Hallucination detection via logprob entropy
│   ├── factual-verifier.ts      # RAG-based factual verification
│   ├── review-queue.ts          # Human review queue service
│   ├── prompt-cache.ts          # Prompt caching for optimization
│   ├── self-reviewer/           # Self-review node
│   │   └── self-reviewer-prompt.ts
│   ├── patcher/                 # Targeted refinement: surgical edits
│   │   ├── index.ts
│   │   └── patcher-prompt.ts
│   ├── section-expander/        # Targeted refinement: section regeneration
│   │   ├── index.ts
│   │   └── expander-prompt.ts
│   ├── verifier/                # Delta Judge verification
│   │   ├── delta-judge.ts
│   │   └── quality-lock.ts
│   ├── arbiter/                 # Judge consensus consolidation
│   │   ├── consolidate-verdicts.ts
│   │   ├── conflict-resolver.ts
│   │   └── krippendorff.ts
│   ├── router/                  # Fix action routing
│   │   └── route-task.ts
│   └── targeted-refinement/     # Main refinement orchestration
│       ├── index.ts
│       ├── orchestrator.ts
│       ├── iteration-controller.ts
│       └── best-effort-selector.ts

packages/shared-types/src/
├── judge-rubric.ts              # OSCQR rubric types and weights
└── judge-types.ts               # JudgeVerdict, JudgeIssue, refinement types
```

---

## Связанные документы

- **Research**: `docs/research/010-stage6-generation-strategy/LLM Judge Implementation for Educational Lesson Content Validation Comprehensive Research Report.md`
- **Model Selection**: `docs/MODEL-SELECTION-DECISIONS.md` (Section 6)
- **Data Model**: `specs/010-stages-456-pipeline/data-model.md`

---

## Тестовое покрытие

Stage 6 имеет обширное тестовое покрытие:

| Тест | Кол-во | Описание |
|------|--------|----------|
| `mermaid-sanitizer.test.ts` | 20 | Unit тесты Mermaid sanitizer |
| `mermaid-fix-pipeline.e2e.test.ts` | 27 | E2E pipeline с реальными данными БД |
| `targeted-refinement-cycle.e2e.test.ts` | 23 | Полный цикл targeted refinement E2E |
| Всего Stage 6 | 262+ | Все проходят |

---

**Последнее обновление**: 2025-12-25
