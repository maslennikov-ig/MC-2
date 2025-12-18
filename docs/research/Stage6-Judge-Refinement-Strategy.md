# Stage 6 Judge Refinement Strategy

## Текущая ситуация

### Архитектура Judge фазы
- **3 судьи** (CLEV voting: 2 judges + conditional 3rd)
- Каждый судья выносит вердикт по нескольким критериям
- При расхождении - третий судья
- Финальное решение: approve / refine / reject

### Текущее поведение (проблемное)
1. Judge выносит вердикт "refine" → **полная регенерация** (planner → expander → assembler → smoother)
2. Нет механизма **минорных правок** (targeted refinement)
3. Все рекомендации судей **игнорируются** при регенерации
4. Высокий расход токенов при каждой итерации

## Желаемое поведение

### Стратегия правок
```
┌─────────────────────────────────────────────────────────────┐
│                     JUDGE VERDICT                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  APPROVE (score >= 80)                                      │
│    → Завершить генерацию                                    │
│                                                             │
│  MINOR REFINE (score 60-79)                                 │
│    → Таргетированные правки по конкретным секциям           │
│    → Цикл: правка → проверка правки → approve/refine        │
│                                                             │
│  MAJOR REFINE (score 40-59)                                 │
│    → Перегенерация отдельных секций (не всего урока)        │
│    → Сохранение хороших секций                              │
│                                                             │
│  REJECT (score < 40)                                        │
│    → Полная регенерация (текущее поведение)                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Минорные правки (Targeted Self-Refinement)

**Вход:**
- Контент секции
- Конкретные рекомендации от судей
- Критерии, которые не прошли

**Процесс:**
1. Judge выявляет конкретные проблемы
2. Формирует **конкретное задание** для правки
3. LLM вносит **точечные изменения** (не переписывает всё)
4. Повторная оценка **только исправленных мест**

**Пример:**
```
Судья: "В секции 2 недостаточно практических примеров"
Задание: "Добавь 2 конкретных примера в секцию 'Воронка продаж'"
Правка: [Только добавление примеров, без изменения остального]
Проверка: "Примеры добавлены? Соответствуют контексту?"
```

---

## Текущая техническая реализация

### Cascade Evaluation Flow

```
┌─────────────────────────────────────────────────────────────┐
│                  CASCADE EVALUATION                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Stage 1: HEURISTIC PRE-FILTERS (FREE)                      │
│    ├── Word count (dynamic based on lesson duration)        │
│    ├── Flesch-Kincaid readability (English only)            │
│    ├── Required sections (intro, conclusion)                │
│    ├── Keyword coverage from learning objectives            │
│    └── Examples/exercises count                             │
│    → Filters 30-50% of content instantly                    │
│                                                             │
│  Stage 2: SINGLE CHEAP JUDGE (50-70% of passing content)    │
│    ├── Uses secondary judge model (cheapest)                │
│    ├── If confidence HIGH + score clear → return result     │
│    └── If confidence LOW or borderline → Stage 3            │
│    → 67% cost savings when decision is clear                │
│                                                             │
│  Stage 3: CLEV VOTING (15-20% of content)                   │
│    ├── 2 judges in parallel (primary + secondary)           │
│    ├── If agree within 0.1 threshold → return               │
│    └── If disagree → 3rd judge (tiebreaker)                 │
│    → Full evaluation for borderline cases                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### TypeScript Interfaces

#### JudgeVerdict (текущий вывод каждого судьи)

```typescript
// packages/shared-types/src/judge-types.ts

interface JudgeVerdict {
  overallScore: number;           // 0-1 scale
  passed: boolean;                // passed quality threshold
  confidence: 'high' | 'medium' | 'low';
  criteriaScores: CriteriaScores; // 6 dimensions
  issues: JudgeIssue[];           // identified problems
  strengths: string[];            // what to preserve
  recommendation: JudgeRecommendation;
  judgeModel: string;
  temperature: number;
  tokensUsed: number;
  durationMs: number;
}

// 6 criteria with OSCQR-based weights
interface CriteriaScores {
  learning_objective_alignment: number; // 25%
  pedagogical_structure: number;        // 20%
  factual_accuracy: number;             // 15%
  clarity_readability: number;          // 15%
  engagement_examples: number;          // 15%
  completeness: number;                 // 10%
}
```

#### JudgeIssue (структура проблемы)

```typescript
interface JudgeIssue {
  criterion: JudgeCriterion;        // which criteria failed
  severity: 'critical' | 'major' | 'minor';
  location: string;                 // "section 2, paragraph 3"
  description: string;              // what is wrong
  quotedText?: string;              // exact problematic text
  suggestedFix: string;             // actionable suggestion
}
```

#### JudgeRecommendation (текущие опции)

```typescript
type JudgeRecommendation =
  | 'ACCEPT'                      // score >= 0.90
  | 'ACCEPT_WITH_MINOR_REVISION'  // score 0.75-0.90, <= 3 issues
  | 'ITERATIVE_REFINEMENT'        // score 0.60-0.75
  | 'REGENERATE'                  // score < 0.60
  | 'ESCALATE_TO_HUMAN';          // low confidence
```

#### FixRecommendation (для таргетированных правок)

```typescript
interface FixRecommendation {
  issues: JudgeIssue[];            // issues to address
  sectionsToPreserve: string[];    // don't modify these
  sectionsToModify: string[];      // target these
  preserveTerminology: string[];   // maintain consistency
  iterationHistory: Array<{        // for self-refine
    feedback: string;
    score: number;
  }>;
}
```

### Score Thresholds (текущие)

```typescript
// packages/shared-types/src/judge-types.ts

const SCORE_THRESHOLDS = {
  ACCEPT: 0.90,           // Auto-publish
  MINOR_REVISION: 0.75,   // Small fixes
  REFINEMENT: 0.60,       // Iteration needed
  REGENERATE: 0.60,       // Below this = regenerate
};

const MAX_REFINEMENT_ITERATIONS = 2;
```

### CLEV Voting Configuration

```typescript
// packages/course-gen-platform/src/stages/stage6-lesson-content/judge/clev-voter.ts

interface CLEVVoterConfig {
  agreementThreshold: number;      // 0.1 (10% difference)
  minConfidence: 'high' | 'medium' | 'low';
  maxTotalTokens: number;          // 10000
  rubric?: OSCQRRubric;
}

// Judge models based on language (avoid self-evaluation bias)
// Russian content (generated by qwen3) → judges: deepseek/kimi/minimax
// Other languages (generated by deepseek) → judges: qwen3/kimi/minimax

const AVAILABLE_JUDGE_MODELS = {
  'qwen3': { weight: 0.75, role: 'primary' },
  'deepseek': { weight: 0.74, role: 'secondary' },
  'kimi-k2': { weight: 0.73, role: 'secondary' },
  'minimax-m2': { weight: 0.72, role: 'tiebreaker' },
  'glm-4': { weight: 0.71, role: 'tiebreaker' },
  'gemini-flash': { weight: 0.68, role: 'tiebreaker' },
};
```

### Heuristic Pre-Filter Checks

```typescript
// packages/course-gen-platform/src/stages/stage6-lesson-content/judge/heuristic-filter.ts

interface HeuristicFilterConfig {
  wordCount: { min: 500, max: 10000 };
  fleschKincaid: { min: 6, max: 14, target: 10 };
  requiredSections: ['introduction', 'conclusion'];
  keywordCoverageThreshold: 0.5;   // 50%
  contentDensityThreshold: 100;    // words per section
}

// Dynamic word count based on lesson duration
// ~120 words/min (min) to ~600 words/min (max)
function calculateWordCountThresholds(durationMinutes: number) {
  return {
    minWordCount: Math.max(300, durationMinutes * 120),
    maxWordCount: Math.min(25000, durationMinutes * 600),
  };
}
```

### HeuristicResults (выход Stage 1)

```typescript
interface HeuristicResults {
  passed: boolean;
  wordCount: number;
  fleschKincaid: number;
  fleschKincaidSkipped: boolean;   // true for non-English
  sectionsPresent: boolean;
  missingSections: string[];
  keywordCoverage: number;         // 0-1
  examplesCount: number;
  exercisesCount: number;
  failureReasons: string[];        // blocking
  warnings: string[];              // non-blocking
}
```

### OSCQR Rubric Criteria

```typescript
// packages/shared-types/src/judge-rubric.ts

const DEFAULT_OSCQR_RUBRIC = {
  passingThreshold: 0.75,
  criteria: [
    {
      criterion: 'learning_objective_alignment',
      weight: 0.25,
      description: 'Content addresses all learning objectives...',
    },
    {
      criterion: 'pedagogical_structure',
      weight: 0.20,
      description: 'Logical flow, scaffolding, progressive complexity...',
    },
    {
      criterion: 'factual_accuracy',
      weight: 0.15,
      description: 'Information is accurate, verifiable via RAG sources...',
    },
    {
      criterion: 'clarity_readability',
      weight: 0.15,
      description: 'Clear explanations, appropriate vocabulary...',
    },
    {
      criterion: 'engagement_examples',
      weight: 0.15,
      description: 'Relevant examples, engaging presentation...',
    },
    {
      criterion: 'completeness',
      weight: 0.10,
      description: 'All sections present, appropriate depth...',
    },
  ],
};
```

---

## Открытые вопросы для исследования

### 1. Консолидация рекомендаций от 3 судей
- Как объединять рекомендации, если судьи указывают на разные проблемы?
- Приоритизация: severity > weight > frequency?
- Дедупликация похожих рекомендаций
- **Текущая реализация**: `combineIssues()` дедуплицирует по `criterion:description`, сортирует по severity

### 2. Формат задания на правку
- Насколько конкретным должно быть задание?
- XML tags vs natural language?
- Включать ли примеры желаемого результата?
- **Текущая структура**: `JudgeIssue.suggestedFix` + `JudgeIssue.location`

### 3. Верификация исправлений
- Как убедиться, что правка выполнена?
- Полная повторная оценка vs проверка только исправленного?
- Semantic similarity vs keyword matching?
- **Текущее**: Нет механизма верификации отдельных правок

### 4. Предотвращение бесконечных циклов
- Максимум итераций минорных правок
- Escalation logic: minor → major → reject
- Когда отказаться и принять "достаточно хорошо"?
- **Текущее**: `MAX_REFINEMENT_ITERATIONS = 2`

### 5. Гранулярность правок
- Уровень секции vs уровень параграфа?
- Как изолировать контекст для правки?
- Сохранение coherence после точечных изменений?
- **Текущее**: `sectionsToPreserve`, `sectionsToModify` в `FixRecommendation`

### 6. Routing Logic
- Как определить тип правки (minor vs major vs regenerate)?
- Критерии для каждого пути?
- **Текущее**: `determineRecommendation()` использует score + issues count

---

# Промты для исследования

## Prompt 1: Deep Research (Google DeepMind / Gemini)

```
I'm designing a content quality refinement system with multi-judge architecture.

CONTEXT:
- 3 LLM judges evaluate educational content using OSCQR-based rubrics
- Each judge provides: verdict (approve/refine/reject), score (0-1), specific recommendations
- Current system: if any "refine" verdict → full content regeneration (expensive, loses good parts)
- Goal: implement targeted self-refinement with minimal changes

CURRENT IMPLEMENTATION:
- 6 evaluation criteria with weights:
  * learning_objective_alignment (25%)
  * pedagogical_structure (20%)
  * factual_accuracy (15%)
  * clarity_readability (15%)
  * engagement_examples (15%)
  * completeness (10%)

- Each issue has: criterion, severity (critical/major/minor), location, description, suggestedFix
- Score thresholds: ACCEPT (>=0.90), MINOR_REVISION (0.75-0.90), REFINEMENT (0.60-0.75), REGENERATE (<0.60)
- CLEV voting: 2 judges first, 3rd only if disagreement (within 0.1 threshold)
- Weights by model: Qwen3 (0.75), DeepSeek (0.74), Kimi K2 (0.73), Minimax M2 (0.72)

RESEARCH QUESTIONS:

1. RECOMMENDATION CONSOLIDATION
How should I aggregate recommendations from 3 judges?
- If Judge 1 says "add more examples" and Judge 2 says "simplify language" - sequential or parallel fixes?
- How to handle conflicting recommendations?
- Best practices for weighted voting on refinement tasks
- Should we prioritize by: severity > criterion weight > frequency?

2. TARGETED REFINEMENT PATTERNS
What's the state-of-art for surgical text editing with LLMs?
- Self-refine paper patterns (Madaan et al., 2023)
- Constitutional AI approaches (Bai et al., 2022)
- Localized vs global editing
- How to constrain edits to specific sections without context drift?

3. VERIFICATION OF FIXES
How to verify that a specific recommendation was addressed?
- Re-evaluation strategies (full vs targeted)
- Semantic similarity approaches
- Preventing "fix one, break another" issues
- Should we re-run all judges or single judge for verification?

4. ITERATION CONTROL
How to prevent infinite refinement loops?
- Convergence detection (score improvement < threshold)
- Quality ceiling estimation
- When to accept "good enough"?
- How to detect oscillating fixes (fix A breaks B, fix B breaks A)?

5. COST-QUALITY TRADEOFFS
How to minimize token usage while maintaining quality?
- When is full regeneration actually cheaper than iterative refinement?
- Caching strategies for partial regeneration
- Batch multiple fixes vs sequential

Please provide:
- Academic papers / research on each topic
- Industry best practices (if any)
- Concrete implementation patterns
- Tradeoff analysis
```

## Prompt 2: Deep Think (o3 / Claude thinking)

```
Design a targeted refinement system for LLM-generated educational content.

SYSTEM ARCHITECTURE:
- Pipeline: Planner → Expander (parallel sections) → Assembler → Smoother → Judge
- 3 LLM judges using CLEV voting (2 agree = final, else 3rd vote)
- Current: any refine → full regeneration from Planner (wasteful)

CURRENT TYPE DEFINITIONS:

interface JudgeVerdict {
  overallScore: number;           // 0-1
  passed: boolean;
  confidence: 'high' | 'medium' | 'low';
  criteriaScores: {
    learning_objective_alignment: number;
    pedagogical_structure: number;
    factual_accuracy: number;
    clarity_readability: number;
    engagement_examples: number;
    completeness: number;
  };
  issues: JudgeIssue[];
  strengths: string[];
  recommendation: 'ACCEPT' | 'ACCEPT_WITH_MINOR_REVISION' | 'ITERATIVE_REFINEMENT' | 'REGENERATE' | 'ESCALATE_TO_HUMAN';
}

interface JudgeIssue {
  criterion: string;
  severity: 'critical' | 'major' | 'minor';
  location: string;
  description: string;
  quotedText?: string;
  suggestedFix: string;
}

interface FixRecommendation {
  issues: JudgeIssue[];
  sectionsToPreserve: string[];
  sectionsToModify: string[];
  preserveTerminology: string[];
  iterationHistory: Array<{ feedback: string; score: number }>;
}

CONSTRAINTS:
- Minimize token usage
- Preserve coherent sections
- Maximum 3 refinement iterations (currently 2)
- Must work with streaming progress updates
- Flesch-Kincaid readability only for English (skip for Russian)

DESIGN REQUIREMENTS:

1. Judge Output Schema Enhancement
Enhance JudgeIssue to enable targeted refinement:
- Which specific sections need work
- What type of fix (add content, remove, rewrite, adjust tone)
- Severity (critical, major, minor)
- Concrete instructions for the fix
- Context window needed for the fix

2. Refinement Router
Logic to decide:
- Minor fix (edit in place) vs Major fix (regenerate section) vs Full regeneration
- Threshold scores/criteria for each path
- How to handle section dependencies
- When to batch fixes vs sequential

3. Targeted Fix Prompt
Design prompt for making surgical edits:
- How to provide context without full regeneration
- How to constrain the edit scope
- How to verify the fix was applied
- Should include: original text, issue, suggested fix, constraints

4. Fix Verification
Design verification strategy:
- Re-run full judge panel? (expensive)
- Targeted check for specific criteria? (risky)
- Hybrid approach?
- Fast heuristic check + selective full check?

5. Convergence Logic
When to stop iterating:
- Score improvement threshold (e.g., < 0.05 improvement)
- Diminishing returns detection
- Hard limits (MAX_REFINEMENT_ITERATIONS)
- Escalation path

OUTPUT FORMAT:
Provide complete implementation plan with:
- Enhanced TypeScript interfaces
- Decision flowchart
- Prompt templates for targeted fixes
- Edge cases and their handling
- Token cost estimation for each path
```

---

## Следующие шаги

1. [ ] Запустить Deep Research промт
2. [ ] Запустить Deep Think промт
3. [ ] Сравнить результаты
4. [ ] Создать consolidated ТЗ
5. [ ] Имплементировать по приоритетам

## Связанные файлы

### Core Judge Implementation
- `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/cascade-evaluator.ts` - cascading evaluation logic
- `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/clev-voter.ts` - CLEV voting orchestrator
- `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/heuristic-filter.ts` - heuristic pre-filters

### Type Definitions
- `packages/shared-types/src/judge-types.ts` - JudgeVerdict, JudgeIssue, FixRecommendation
- `packages/shared-types/src/judge-rubric.ts` - OSCQR rubric configuration
- `packages/shared-types/src/judge-thresholds.ts` - dynamic threshold calculations

### Pipeline Integration
- `packages/course-gen-platform/src/stages/stage6-lesson-content/orchestrator.ts` - routing logic
- `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/` - pipeline nodes

### Research Documents
- `docs/research/010-stage6-generation-strategy/` - original cascade research
- `specs/010-stages-456-pipeline/data-model.md` - data model specification
