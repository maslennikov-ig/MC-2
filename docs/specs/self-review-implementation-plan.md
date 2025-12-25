# Self-Review + Self-Fix Implementation Plan

> Гибридный подход для оптимизации Stage 6 Judge Pipeline

## 1. Проблема

Текущий пайплайн Stage 6 отправляет весь контент на оценку LLM-судьям, даже если контент имеет очевидные проблемы:
- Смешение языков (китайские иероглифы в русском тексте)
- Обрезанный контент (truncation)
- Несоответствие структуры

**Результат**: лишние токены на дорогих моделях судей.

## 2. Решение: Гибридный подход

### 2.1 Подход A: Расширение Heuristic Filter (FREE)

Добавить бесплатные проверки до LLM:

| Проверка | Описание | Результат |
|----------|----------|-----------|
| `checkLanguageConsistency()` | Unicode-детекция смешения языков | FAIL → REGENERATE |
| `checkContentTruncation()` | Проверка markdown завершённости | FAIL → PARTIAL_REGEN |
| `checkMinSectionLength()` | Минимальная длина каждой секции | WARN → flag to judge |

### 2.2 Подход B: Self-Reviewer Node (LLM)

Новый node между Smoother и Judge:

```
smoother → self-reviewer → judge
              ↓ (issues found)
           self-fix loop (max 1 iteration)
```

**Self-Reviewer**:
- Использует ту же модель, что и Smoother (дешевле судей)
- Чистый контекст (нет bias от предыдущих генераций)
- Проверяет: логику, галлюцинации, соответствие LO

**Self-Fix**:
- Если проблема простая → исправляет сам
- Если проблема сложная → передаёт флаг судьям
- Max 1 итерация (не допускаем oscillation)

## 3. Архитектура изменений

### 3.1 Новые/изменённые файлы

```
packages/course-gen-platform/src/stages/stage6-lesson-content/
├── judge/
│   ├── heuristic-filter.ts        # MODIFY: добавить language/truncation checks
│   ├── cascade-evaluator.ts       # MODIFY: интеграция self-review
│   └── self-reviewer/             # NEW: папка модуля
│       ├── index.ts               # Self-reviewer node
│       ├── self-reviewer-prompt.ts # Промпты
│       ├── self-fix-executor.ts   # Логика исправлений
│       └── types.ts               # Типы модуля
├── nodes/
│   └── self-reviewer-node.ts      # NEW: LangGraph node
├── state.ts                       # MODIFY: добавить selfReviewResult
└── orchestrator.ts                # MODIFY: добавить node в граф

packages/shared-types/src/
├── stage6-ui.types.ts             # MODIFY: добавить SelfReviewer в Stage6NodeName
├── judge-types.ts                 # MODIFY: добавить SelfReviewResult type
└── generation-graph.ts            # MODIFY: добавить node конфиг

packages/web/components/generation-graph/
├── panels/stage6/                 # MODIFY: добавить SelfReview tab
└── translations.ts                # MODIFY: добавить переводы
```

### 3.2 Изменения в State

```typescript
// state.ts
export const LessonGraphState = Annotation.Root({
  // ... existing fields

  /**
   * Self-review result before judge evaluation
   * Contains issues found and whether self-fix was applied
   */
  selfReviewResult: Annotation<SelfReviewResult | null>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
});
```

### 3.3 Изменения в графе

```typescript
// orchestrator.ts
const workflow = new StateGraph(LessonGraphState)
  .addNode('planner', plannerNode)
  .addNode('expander', expanderNode)
  .addNode('assembler', assemblerNode)
  .addNode('smoother', smootherNode)
  .addNode('selfReviewer', selfReviewerNode)  // NEW
  .addNode('judge', judgeNode)
  .addEdge('__start__', 'planner')
  .addEdge('planner', 'expander')
  .addEdge('expander', 'assembler')
  .addEdge('assembler', 'smoother')
  .addEdge('smoother', 'selfReviewer')        // CHANGED
  .addConditionalEdges('selfReviewer', selfReviewerRouter)
  .addEdge('judge', '__end__');
```

### 3.4 Self-Reviewer Router Logic

```typescript
function selfReviewerRouter(state: LessonGraphStateType): string {
  const result = state.selfReviewResult;

  if (!result) return 'judge';

  // PASS → go to judge
  if (result.passed) return 'judge';

  // SELF_FIXED → go to judge with flags
  if (result.selfFixApplied) return 'judge';

  // NEEDS_REGENERATION → back to smoother (max 1 retry)
  if (result.decision === 'REGENERATE' && state.retryCount < 1) {
    return 'smoother';
  }

  // Otherwise → go to judge
  return 'judge';
}
```

## 4. Типы

### 4.1 SelfReviewResult

```typescript
// packages/shared-types/src/judge-types.ts

export type SelfReviewDecision =
  | 'PASS'              // No issues found
  | 'FIXED'             // Issues found and self-fixed
  | 'FLAG_TO_JUDGE'     // Issues found, flagged for judge attention
  | 'REGENERATE';       // Fundamental issues, needs regeneration

export interface SelfReviewIssue {
  type: 'language_mix' | 'truncation' | 'logic_error' | 'lo_mismatch' | 'hallucination';
  severity: 'critical' | 'major' | 'minor';
  location: string;
  description: string;
  fixable: boolean;
  suggestedFix?: string;
}

export interface SelfReviewResult {
  /** Whether content passed self-review */
  passed: boolean;
  /** Decision made by self-reviewer */
  decision: SelfReviewDecision;
  /** Issues found during self-review */
  issues: SelfReviewIssue[];
  /** Whether self-fix was applied */
  selfFixApplied: boolean;
  /** Content after self-fix (if applied) */
  fixedContent?: string;
  /** Tokens used for self-review */
  tokensUsed: number;
  /** Duration in milliseconds */
  durationMs: number;
}
```

### 4.2 UI Types

```typescript
// packages/shared-types/src/stage6-ui.types.ts

export type Stage6NodeName =
  | 'planner'
  | 'expander'
  | 'assembler'
  | 'smoother'
  | 'selfReviewer'  // NEW
  | 'judge';

export const STAGE6_NODE_LABELS: Record<Stage6NodeName, { ru: string; description: string }> = {
  // ... existing
  selfReviewer: {
    ru: 'Само-проверка',
    description: 'Проверка и исправление до судей'
  },
};
```

## 5. Heuristic Filter Extensions

### 5.1 Language Consistency Check

```typescript
// heuristic-filter.ts

/**
 * Detect language mixing using Unicode ranges
 *
 * @param text - Text to check
 * @param expectedLanguage - Expected language code (ru, en, zh, etc.)
 * @returns Object with consistency check result
 */
export function checkLanguageConsistency(
  text: string,
  expectedLanguage: string
): { passed: boolean; foreignCharacters: number; samples: string[] } {
  // Unicode ranges
  const CYRILLIC = /[\u0400-\u04FF]/g;
  const CJK = /[\u4E00-\u9FFF\u3400-\u4DBF]/g;
  const LATIN = /[a-zA-Z]/g;

  // Language → expected script mapping
  const expectedScripts: Record<string, RegExp> = {
    ru: CYRILLIC,
    en: LATIN,
    zh: CJK,
    // ... other languages
  };

  const expectedScript = expectedScripts[expectedLanguage] || LATIN;

  // Find unexpected scripts
  const unexpectedPatterns: RegExp[] = [];
  if (expectedLanguage === 'ru') {
    unexpectedPatterns.push(CJK); // Chinese in Russian is always wrong
  }
  if (expectedLanguage === 'en') {
    unexpectedPatterns.push(CJK, CYRILLIC);
  }

  let foreignCount = 0;
  const samples: string[] = [];

  for (const pattern of unexpectedPatterns) {
    const matches = text.match(pattern) || [];
    foreignCount += matches.length;
    if (matches.length > 0) {
      samples.push(...matches.slice(0, 3));
    }
  }

  return {
    passed: foreignCount === 0,
    foreignCharacters: foreignCount,
    samples: samples.slice(0, 5),
  };
}
```

### 5.2 Content Truncation Check

```typescript
/**
 * Check if content appears truncated
 *
 * Signs of truncation:
 * - Ends mid-sentence (no proper punctuation)
 * - Unmatched code blocks (``` without closing)
 * - Unmatched lists (- without content)
 */
export function checkContentTruncation(content: LessonContentBody): {
  passed: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // Check last section ends properly
  const lastSection = content.sections[content.sections.length - 1];
  if (lastSection) {
    const lastChar = lastSection.content.trim().slice(-1);
    if (!/[.!?。！？]/.test(lastChar)) {
      issues.push('Last section does not end with proper punctuation');
    }

    // Check for unmatched code blocks
    const codeBlocks = (lastSection.content.match(/```/g) || []).length;
    if (codeBlocks % 2 !== 0) {
      issues.push('Unmatched code block markers');
    }
  }

  return {
    passed: issues.length === 0,
    issues,
  };
}
```

## 6. Self-Reviewer Prompt

**Implementation**: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/self-reviewer/self-reviewer-prompt.ts`

The prompt uses a **Fail-Fast architecture** with 4 phases:

### Phase 1: Integrity & Critical Failures → REGENERATE
- Truncation detection (JSON structure, sentence completion)
- Language failure (wrong script, excluding code blocks and tech terms)
- Empty/placeholder fields
- Section length < 50 words

### Phase 2: Hygiene & Self-Repair → FIXED
- Chatbot artifacts ("Sure, here is...", "As an AI...")
- Isolated script pollution (1-3 stray foreign chars)
- Markdown syntax errors (unclosed bold, broken links)

### Phase 3: Semantic Verification → FLAG_TO_JUDGE
- Learning objective alignment
- Hallucination risk (contradictions with RAG)
- Internal logic errors

### Phase 4: Acceptance → PASS / PASS_WITH_FLAGS
- Clean content proceeds to judges
- Minor observations flagged for judge attention

### Key Design Decisions

| Feature | Decision | Rationale |
|---------|----------|-----------|
| XML delimiters | `<TARGET_LANGUAGE>`, `<LESSON_SPEC>`, etc. | Prevents prompt injection from content headers |
| Full patched_content | Return entire JSON, not diff | LLM diffs are error-prone; full replacement is reliable |
| Code block exclusion | Skip language checks in ``` | Technical code is always acceptable |
| Tech terms exception | Allow English in Russian text | "API", "React" are universal |
| Conservative flags | PASS_WITH_FLAGS > FLAG_TO_JUDGE | Avoid false positives |

### Output Schema

```typescript
interface SelfReviewResponse {
  status: "PASS" | "PASS_WITH_FLAGS" | "FIXED" | "REGENERATE" | "FLAG_TO_JUDGE";
  reasoning: string;
  issues: Array<{
    type: "TRUNCATION" | "LANGUAGE" | "EMPTY" | "SHORT_SECTION" | "ALIGNMENT" | "HALLUCINATION" | "LOGIC" | "HYGIENE";
    severity: "CRITICAL" | "FIXABLE" | "COMPLEX" | "INFO";
    location: string;
    description: string;
  }>;
  patched_content: LessonContent | null;
}
```

## 7. Database

**Нет изменений в схеме БД**. Используем существующий механизм:

```typescript
// Логирование через generation_traces
await logTrace({
  course_id: courseId,
  stage: 'stage_6',
  phase: 'self_reviewer',  // Новая фаза
  status: 'completed',
  trace_data: selfReviewResult,
  tokens_used: selfReviewResult.tokensUsed,
  duration_ms: selfReviewResult.durationMs,
});
```

## 8. UI Changes

### 8.1 NodeDetailsDrawer

Добавить tab для Self-Review результатов:

```typescript
// panels/stage6/Stage6SelfReviewTab.tsx

export function Stage6SelfReviewTab({
  selfReviewResult
}: {
  selfReviewResult: SelfReviewResult | null
}) {
  if (!selfReviewResult) return <div>Само-проверка не выполнялась</div>;

  return (
    <div>
      <Badge variant={selfReviewResult.passed ? 'success' : 'warning'}>
        {selfReviewResult.passed ? 'Пройдено' : 'Найдены проблемы'}
      </Badge>

      {selfReviewResult.selfFixApplied && (
        <Alert>Применены автоматические исправления</Alert>
      )}

      {selfReviewResult.issues.length > 0 && (
        <IssuesList issues={selfReviewResult.issues} />
      )}
    </div>
  );
}
```

### 8.2 Micro-Stepper

Добавить 6-й шаг в визуализацию прогресса:

```
[1] Planner → [2] Expander → [3] Assembler → [4] Smoother → [5] Self-Review → [6] Judge
```

## 9. Reference Files (Read Before Implementation)

Before implementing, read these files to understand existing patterns:

### Core Stage 6 Files
```
packages/course-gen-platform/src/stages/stage6-lesson-content/
├── state.ts                    # LessonGraphState definition (copy pattern for selfReviewResult)
├── orchestrator.ts             # StateGraph setup, node registration, edges
├── nodes/smoother-node.ts      # Example node implementation pattern
├── nodes/judge-node.ts         # Another node example
└── judge/
    ├── heuristic-filter.ts     # Where to add checkLanguageConsistency, checkContentTruncation
    ├── cascade-evaluator.ts    # Integration point for self-review
    └── clev-voter.ts           # Example of LLM evaluation pattern
```

### Shared Types
```
packages/shared-types/src/
├── judge-types.ts              # Add SelfReviewResult, SelfReviewIssue types here
├── stage6-ui.types.ts          # Add selfReviewer to Stage6NodeName
├── lesson-content.ts           # LessonContentBody, RAGChunk definitions
└── lesson-specification-v2.ts  # LessonSpecificationV2 definition
```

### UI Components
```
packages/web/components/generation-graph/
├── panels/NodeDetailsDrawer.tsx      # How tabs are structured
├── panels/stage6/Stage6ProcessTab.tsx # Example tab component
└── lib/generation-graph/translations.ts # Where to add ru/en labels
```

### Already Created
```
packages/course-gen-platform/src/stages/stage6-lesson-content/judge/self-reviewer/
└── self-reviewer-prompt.ts     # ✅ ALREADY EXISTS - prompt implementation
```

### Key Imports Pattern
```typescript
// For LangGraph nodes
import { Annotation } from '@langchain/langgraph';
import type { LessonGraphStateType } from '../state';

// For LLM calls
import { LLMClient } from '@/shared/llm';
import { createModelConfigService } from '@/shared/llm/model-config-service';

// For logging
import { logger } from '@/shared/logger';

// For types
import type { LessonContentBody, RAGChunk } from '@megacampus/shared-types/lesson-content';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
```

---

## 10. Task Breakdown

### Phase 1: Heuristic Filter Extensions (A)
- [ ] T1: Добавить `checkLanguageConsistency()` в heuristic-filter.ts
- [ ] T2: Добавить `checkContentTruncation()` в heuristic-filter.ts
- [ ] T3: Интегрировать в `runHeuristicFilters()`
- [ ] T4: Написать тесты

### Phase 2: Self-Reviewer Node (B)
- [ ] T5: Создать `self-reviewer/types.ts`
- [ ] T6: Создать `self-reviewer/self-reviewer-prompt.ts`
- [ ] T7: Создать `self-reviewer/index.ts`
- [ ] T8: Создать `nodes/self-reviewer-node.ts`
- [ ] T9: Обновить `state.ts`
- [ ] T10: Обновить `orchestrator.ts` (граф)
- [ ] T11: Написать тесты

### Phase 3: Types & UI
- [ ] T12: Добавить `SelfReviewResult` в judge-types.ts
- [ ] T13: Обновить `Stage6NodeName` в stage6-ui.types.ts
- [ ] T14: Добавить переводы в translations.ts
- [ ] T15: Создать `Stage6SelfReviewTab.tsx`
- [ ] T16: Обновить `NodeDetailsDrawer.tsx`
- [ ] T17: Обновить micro-stepper

### Phase 4: Integration & Testing
- [ ] T18: E2E тест: контент с языковым смешением → REGENERATE
- [ ] T19: E2E тест: чистый контент → PASS to judge
- [ ] T20: Нагрузочное тестирование

## 10. Estimated Token Savings

| Scenario | Before (tokens) | After (tokens) | Savings |
|----------|-----------------|----------------|---------|
| Language mix detected | 5000 (judge) | 0 (heuristic) | 100% |
| Truncated content | 5000 (judge) | 500 (self-review) | 90% |
| Minor issues | 15000 (3 judges) | 2000 (self-fix) | 87% |
| Clean content | 5000 (judge) | 5500 (review+judge) | -10% |

**Net expected savings**: 30-50% on judge token costs.

## 11. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Self-reviewer misses issues | Medium | Always pass to judge, self-review is advisory |
| Self-fix introduces errors | High | Limit self-fix to simple issues (language, typos) |
| Added latency | Low | Run heuristics sync, self-review async if needed |
| False positives | Medium | Tune thresholds based on production data |

## 12. Success Metrics

- [ ] Reduce judge token usage by 30%+
- [ ] Catch 90%+ of language mixing issues before judges
- [ ] No increase in final content quality issues
- [ ] Latency increase < 2s per lesson
