# Stage 6 Targeted Refinement System - Technical Specification

> **Status:** Implemented
> **Created:** 2024-12-10
> **Updated:** 2025-12-25 (Implementation Notes Added)
> **Sources:** Deep Think (o3), Deep Research (Gemini), Codebase Analysis, Admin UI Compatibility Review

## Executive Summary

Текущая система Judge выносит вердикт и при необходимости доработки запускает **полную регенерацию** урока (planner → expander → assembler → smoother). Это приводит к:
- Высокому расходу токенов (~6000 на итерацию)
- Потере качественных секций при частичных проблемах
- Игнорированию конкретных рекомендаций судей

**Цель:** Внедрить систему **Targeted Refinement** с минорными правками, сохраняя качественные секции и экономя ~60-70% токенов.

**Два режима работы:**
- **Semi-Auto Mode:** Пользователь контролирует pipeline, возможна эскалация к человеку
- **Full-Auto Mode:** Полностью автоматическая генерация, best-effort результат без эскалации

---

## 1. Architecture Overview

### 1.1 Current Flow (Problematic)

```
Planner → Expander → Assembler → Smoother → Judge
                                              ↓
                                      [REFINE verdict]
                                              ↓
                            ← ← ← FULL REGENERATION ← ← ←
```

### 1.2 Target Flow (Targeted Refinement)

```
Planner → Expander → Assembler → Smoother → Judge
                                              ↓
                                     [Cascade Decision]
                                     /       |        \
                              ACCEPT   REFINE      REGENERATE
                                        ↓
                                   [Arbiter]
                                   (consolidate)
                                        ↓
                                   [Router]
                                   /      \
                          Patcher      Section-Expander
                          (surgical)   (regenerate section)
                          [parallel for non-adjacent]
                                   \      /
                                    [Verifier]
                                    (Delta Judge)
                                        ↓
                               [Termination Check]
                                        ↓
                    ACCEPT / ITERATE / ESCALATE (semi-auto only)
                                   or
                    ACCEPT / ITERATE / BEST-EFFORT (full-auto)
```

### 1.3 Key Components

| Component | Responsibility | Cost |
|-----------|---------------|------|
| **Arbiter** | Consolidate 3 judge verdicts, resolve conflicts | Low (~500 tokens) |
| **Router** | Decide fix type per section | Free (deterministic) |
| **Patcher** | Surgical edits (tone, clarity, grammar) | Low (~500-800 tokens) |
| **Section-Expander** | Regenerate single section | Medium (~1200 tokens) |
| **Delta Judge** | Verify fix was applied | Low (~200 tokens) |
| **Quality Lock** | Prevent regressions | Free (comparison) |

---

## 2. Operation Modes

### 2.1 Semi-Auto Mode

Пользователь активно управляет pipeline через UI.

```typescript
interface SemiAutoConfig {
  mode: 'semi-auto';

  // Эскалация возможна
  escalationEnabled: true;

  // Пороги
  acceptThreshold: 0.90;      // Автоматический accept
  goodEnoughThreshold: 0.85;  // Accept если нет critical issues

  // При низком качестве после max iterations
  onMaxIterations: 'escalate_to_human';

  // UI показывает прогресс и позволяет вмешаться
  showDetailedProgress: true;
}
```

**Termination в Semi-Auto:**
1. Score >= 0.90 → ACCEPT
2. Score >= 0.85 AND no critical → ACCEPT
3. Max iterations reached → ESCALATE_TO_HUMAN
4. User intervention → Handle manually

### 2.2 Full-Auto Mode

Пользователь нажал "Сгенерировать" и ждёт результат.

```typescript
interface FullAutoConfig {
  mode: 'full-auto';

  // Эскалация невозможна
  escalationEnabled: false;

  // Более мягкие пороги (лучше что-то, чем ничего)
  acceptThreshold: 0.85;      // Ниже чем semi-auto
  goodEnoughThreshold: 0.75;  // Accept с предупреждением

  // При низком качестве - вернуть лучший результат
  onMaxIterations: 'accept_best_effort';

  // UI показывает только финальный результат
  showDetailedProgress: false;
}
```

**Termination в Full-Auto:**
1. Score >= 0.85 → ACCEPT
2. Score >= 0.75 AND no critical → ACCEPT_WITH_WARNING
3. Max iterations reached → ACCEPT_BEST_EFFORT (return best score from history)
4. All iterations failed → ACCEPT_BEST_EFFORT with quality flag

### 2.3 Best-Effort Fallback (Full-Auto)

```typescript
interface BestEffortResult {
  /** Лучший контент из всех итераций */
  content: LessonContent;

  /** Лучший достигнутый score */
  bestScore: number;

  /** Флаг качества */
  qualityStatus: 'good' | 'acceptable' | 'below_standard';

  /** Нерешённые issues (для логирования) */
  unresolvedIssues: JudgeIssue[];

  /** Рекомендация для будущего улучшения */
  improvementHints: string[];
}

function selectBestResult(
  iterationHistory: IterationResult[]
): BestEffortResult {
  // Выбираем итерацию с лучшим score
  const best = iterationHistory.reduce((a, b) =>
    a.score > b.score ? a : b
  );

  return {
    content: best.content,
    bestScore: best.score,
    qualityStatus:
      best.score >= 0.85 ? 'good' :
      best.score >= 0.75 ? 'acceptable' :
      'below_standard',
    unresolvedIssues: best.remainingIssues,
    improvementHints: generateHints(best.remainingIssues),
  };
}
```

---

## 3. Type Definitions

### 3.1 Enhanced JudgeIssue → TargetedIssue

```typescript
// packages/shared-types/src/judge-types.ts

/**
 * Fix action types for routing decisions
 */
type FixAction =
  | 'SURGICAL_EDIT'        // Patcher: tone, clarity, grammar, minor additions
  | 'REGENERATE_SECTION'   // Section-Expander: factual errors, major gaps
  | 'FULL_REGENERATE';     // Restart from Planner: structural failure

/**
 * Enhanced issue with targeting information for refinement
 */
interface TargetedIssue extends JudgeIssue {
  /** Unique issue identifier */
  id: string;

  /** Target section ID (e.g., "sec_introduction", "sec_2") */
  targetSectionId: string;

  /** Recommended fix action */
  fixAction: FixAction;

  /** Context anchors for surgical edits */
  contextWindow: {
    /** Text anchor at start of problematic area */
    startQuote?: string;
    /** Text anchor at end of problematic area */
    endQuote?: string;
    /** Scope of context needed */
    scope: 'paragraph' | 'section' | 'global';
  };

  /** Specific instructions for the fix agent */
  fixInstructions: string;
}
```

### 3.2 Consolidated Refinement Plan

```typescript
/**
 * Per-section refinement task (output of Arbiter)
 */
interface SectionRefinementTask {
  /** Target section ID */
  sectionId: string;

  /** Section title for context */
  sectionTitle: string;

  /** Action type */
  actionType: 'SURGICAL_EDIT' | 'REGENERATE_SECTION';

  /**
   * Synthesized instructions from all judges
   * Conflicts already resolved by Arbiter
   */
  synthesizedInstructions: string;

  /** Context anchors for coherence */
  contextAnchors: {
    /** Last 3 sentences of previous section */
    prevSectionEnd?: string;
    /** First 3 sentences of next section */
    nextSectionStart?: string;
  };

  /** Priority for execution order */
  priority: 'critical' | 'major' | 'minor';

  /** Original issues that led to this task */
  sourceIssues: TargetedIssue[];
}

/**
 * Full refinement plan (extends existing FixRecommendation)
 */
interface RefinementPlan extends FixRecommendation {
  /** Execution status */
  status: 'PENDING' | 'EXECUTING' | 'COMPLETED' | 'FAILED';

  /** Consolidated tasks by section */
  tasks: SectionRefinementTask[];

  /** Estimated token cost */
  estimatedCost: number;

  /** Inter-rater agreement score (Krippendorff's Alpha) */
  agreementScore: number;

  /** Conflict resolution log */
  conflictResolutions: Array<{
    issue1: string;
    issue2: string;
    resolution: string;
  }>;

  /** Execution batches for parallel processing */
  executionBatches: SectionRefinementTask[][];
}
```

### 3.3 Iteration State

```typescript
/**
 * State for convergence detection
 */
interface RefinementIterationState {
  /** Current iteration (0-based) */
  iteration: number;

  /** Score history for convergence detection */
  scoreHistory: number[];

  /** Content snapshots for best-effort selection */
  contentHistory: Array<{
    iteration: number;
    score: number;
    content: LessonContent;
    remainingIssues: JudgeIssue[];
  }>;

  /** Sections locked from further edits (oscillation prevention) */
  lockedSections: Set<string>;

  /** Edit history per section (for oscillation detection) */
  sectionEditCount: Map<string, number>;

  /** Quality locks - criteria that passed and must not regress */
  qualityLocks: Record<string, number>;  // criterion -> locked score

  /** Regression tolerance */
  regressionTolerance: number;  // default: 0.05

  /** Hard limits */
  maxIterations: number;        // default: 3
  maxTotalTokens: number;       // default: 15000
  timeoutMs: number;            // default: 300000 (5 min)
}
```

---

## 4. Arbiter: Consolidation & Conflict Resolution

### 4.1 Purpose

The Arbiter sits between Judge output and Router. It:
1. Aggregates issues from up to 3 judges
2. Calculates inter-rater agreement (Krippendorff's Alpha)
3. Deduplicates similar issues
4. Resolves conflicting recommendations
5. Synthesizes actionable instructions

### 4.2 Consolidation Algorithm

```typescript
async function consolidateVerdicts(
  verdicts: JudgeVerdict[],
  config: ArbiterConfig
): Promise<RefinementPlan> {
  // 1. Calculate inter-rater agreement (Krippendorff's Alpha)
  const alpha = calculateKrippendorffsAlpha(verdicts);

  // 2. Cluster similar issues by section + criterion
  const clusteredIssues = clusterIssuesBySectionAndCriterion(
    verdicts.flatMap(v => v.issues)
  );

  // 3. For each cluster, apply consolidation rules
  const tasks: SectionRefinementTask[] = [];

  for (const [sectionId, sectionIssues] of clusteredIssues) {
    // 3a. Filter by agreement level
    const filteredIssues = filterByAgreement(sectionIssues, alpha);

    // 3b. Resolve conflicts within section
    const resolved = resolveConflicts(filteredIssues, PRIORITY_HIERARCHY);

    // 3c. Synthesize instructions
    const task = synthesizeTask(sectionId, resolved);
    tasks.push(task);
  }

  // 4. Build execution batches (non-adjacent sections can run in parallel)
  const executionBatches = buildExecutionBatches(tasks);

  return {
    status: 'PENDING',
    tasks,
    executionBatches,
    estimatedCost: estimateTokenCost(tasks),
    agreementScore: alpha,
    conflictResolutions: [],
    // ... legacy fields
  };
}
```

### 4.3 Agreement-Based Filtering (Krippendorff's Alpha)

```typescript
// Using existing library: npm install krippendorff-alpha
import { krippendorff } from 'krippendorff-alpha';

function calculateKrippendorffsAlpha(verdicts: JudgeVerdict[]): number {
  // Build matrix: judges x criteria scores
  const matrix = verdicts.map(v => [
    v.criteriaScores.learning_objective_alignment,
    v.criteriaScores.pedagogical_structure,
    v.criteriaScores.factual_accuracy,
    v.criteriaScores.clarity_readability,
    v.criteriaScores.engagement_examples,
    v.criteriaScores.completeness,
  ]);

  return krippendorff(matrix, { level: 'interval' });
}
```

| Alpha Score | Interpretation | Action |
|-------------|----------------|--------|
| α ≥ 0.80 | High agreement | Accept all issues |
| 0.67 ≤ α < 0.80 | Moderate agreement | Accept issues with 2+ judge agreement |
| α < 0.67 | Low agreement | Only accept CRITICAL issues, flag for review |

### 4.4 Conflict Resolution: Priority Hierarchy

When judges contradict (e.g., "add details" vs "simplify"), apply **Hierarchy of Needs**:

```typescript
const PRIORITY_HIERARCHY = [
  'factual_accuracy',             // 1. Accuracy & Safety (highest)
  'learning_objective_alignment', // 2. Learning objectives
  'pedagogical_structure',        // 3. Structure
  'clarity_readability',          // 4. Clarity
  'engagement_examples',          // 5. Engagement
  'completeness',                 // 6. Completeness (lowest)
];

function resolveConflict(issue1: TargetedIssue, issue2: TargetedIssue): string {
  const priority1 = PRIORITY_HIERARCHY.indexOf(issue1.criterion);
  const priority2 = PRIORITY_HIERARCHY.indexOf(issue2.criterion);

  if (priority1 < priority2) {
    // Higher priority wins, lower becomes constraint
    return `${issue1.fixInstructions}. CONSTRAINT: ${issue2.criterion} should not degrade.`;
  } else {
    return `${issue2.fixInstructions}. CONSTRAINT: ${issue1.criterion} should not degrade.`;
  }
}
```

**Example:**
- Issue 1: "Add more details about funnel stages" (completeness)
- Issue 2: "Simplify the language, too complex" (clarity)
- **Resolution:** "Add more details about funnel stages. CONSTRAINT: Use concise bullet points to maintain clarity."

---

## 5. Router: Deciding Fix Type

### 5.1 Decision Flowchart

```
┌─────────────────────────────────────────────────────────────┐
│                    ROUTING DECISION                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. STRUCTURAL INTEGRITY CHECK                              │
│     IF pedagogical_structure < 0.6                          │
│        OR >40% sections have CRITICAL issues                │
│     THEN → FULL_REGENERATE                                  │
│                                                             │
│  2. PER-SECTION ANALYSIS                                    │
│     FOR each section with issues:                           │
│                                                             │
│     IF criterion IN [factual_accuracy, completeness]        │
│        AND severity IN [critical, major]                    │
│     THEN → REGENERATE_SECTION                               │
│                                                             │
│     IF criterion IN [clarity, engagement, tone]             │
│        OR severity == minor                                 │
│     THEN → SURGICAL_EDIT                                    │
│                                                             │
│  3. DEPENDENCY CHECK                                        │
│     IF section N marked for REGENERATE                      │
│     THEN flag section N+1 for consistency check             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Implementation

```typescript
function routeTask(
  task: SectionRefinementTask,
  globalMetrics: { structureScore: number; criticalRatio: number }
): FixAction {
  // 1. Global structural failure → full regen
  if (globalMetrics.structureScore < 0.6 || globalMetrics.criticalRatio > 0.4) {
    return 'FULL_REGENERATE';
  }

  // 2. Check issue types
  const hasMajorFactualIssue = task.sourceIssues.some(
    i => i.criterion === 'factual_accuracy' &&
         ['critical', 'major'].includes(i.severity)
  );

  const hasCompletenessGap = task.sourceIssues.some(
    i => i.criterion === 'completeness' && i.severity === 'critical'
  );

  if (hasMajorFactualIssue || hasCompletenessGap) {
    return 'REGENERATE_SECTION';
  }

  // 3. Default to surgical edit
  return 'SURGICAL_EDIT';
}
```

---

## 6. Parallel Execution for Non-Adjacent Sections

### 6.1 Batching Strategy

```typescript
/**
 * Group tasks into parallel execution batches.
 * Non-adjacent sections can run in parallel.
 * Adjacent sections must be sequential (shared context anchors).
 */
function buildExecutionBatches(
  tasks: SectionRefinementTask[]
): SectionRefinementTask[][] {
  // 1. Separate by action type
  const patcherTasks = tasks.filter(t => t.actionType === 'SURGICAL_EDIT');
  const expanderTasks = tasks.filter(t => t.actionType === 'REGENERATE_SECTION');

  // 2. Group patcher tasks by non-adjacency
  const patcherBatches = groupNonAdjacentSections(patcherTasks);

  // 3. Expander tasks are always sequential (too much context dependency)
  const expanderBatches = expanderTasks.map(t => [t]);

  // 4. Patchers first (cheaper), then expanders
  return [...patcherBatches, ...expanderBatches];
}

function groupNonAdjacentSections(
  tasks: SectionRefinementTask[]
): SectionRefinementTask[][] {
  if (tasks.length === 0) return [];

  // Sort by section index
  const sorted = tasks.sort((a, b) =>
    getSectionIndex(a.sectionId) - getSectionIndex(b.sectionId)
  );

  const batches: SectionRefinementTask[][] = [];
  let currentBatch: SectionRefinementTask[] = [];
  let lastIndex = -2;  // -2 so first section always fits

  for (const task of sorted) {
    const index = getSectionIndex(task.sectionId);

    if (index - lastIndex > 1) {
      // Non-adjacent, can add to current batch
      currentBatch.push(task);
    } else {
      // Adjacent, start new batch
      if (currentBatch.length > 0) batches.push(currentBatch);
      currentBatch = [task];
    }
    lastIndex = index;
  }

  if (currentBatch.length > 0) batches.push(currentBatch);
  return batches;
}
```

**Example:**
```
Sections with issues: [1, 3, 4, 7]

Batch 1 (parallel): [1, 3, 7]  // Non-adjacent
Batch 2 (sequential): [4]      // Adjacent to 3, waits for batch 1
```

### 6.2 Execution Limits

```typescript
const PARALLEL_EXECUTION_CONFIG = {
  // Max concurrent Patcher calls
  maxConcurrentPatchers: 3,

  // Section-Expander always sequential
  sequentialForRegenerations: true,

  // Min gap between parallel sections
  adjacentSectionGap: 1,
};
```

---

## 7. Patcher: Surgical Edit Agent

### 7.1 Prompt Template

```markdown
**ROLE:** Expert Educational Content Editor
**TASK:** Apply targeted fixes to a specific section.

**SECTION:** "{{sectionTitle}}"
**LESSON CONTEXT:**
- Tone: {{tone}}
- Target Audience: {{targetAudience}}
- Difficulty: {{difficultyLevel}}

**CONTEXT (DO NOT EDIT):**
[PREVIOUS SECTION ENDING]:
"""
{{prevSectionEnd}}
"""

[NEXT SECTION BEGINNING]:
"""
{{nextSectionStart}}
"""

**CURRENT CONTENT TO FIX:**
<section id="{{sectionId}}" status="edit">
{{sectionContent}}
</section>

**ISSUES TO ADDRESS:**
{{#each issues}}
- [{{severity}}] {{criterion}}: {{fixInstructions}}
{{/each}}

**CONSTRAINTS:**
1. Fix ONLY the listed issues. Preserve all other content.
2. Ensure smooth transition FROM [PREVIOUS] and TO [NEXT].
3. Maintain consistent terminology: {{preserveTerminology}}
4. Keep sentences clear and concise (average ≤ 20 words).

**OUTPUT:**
Return ONLY the corrected section content (no XML tags).
```

### 7.2 Cost Estimation

- Input: ~400-600 tokens (context + instructions)
- Output: ~200-400 tokens (edited section)
- **Total: ~600-1000 tokens per section**

---

## 8. Section-Expander: Major Regeneration

### 8.1 Prompt Template

```markdown
**ROLE:** Educational Content Creator
**TASK:** Regenerate section "{{sectionTitle}}" from scratch.

**REASON FOR REGENERATION:**
The previous draft was rejected due to:
{{#each issues}}
- {{description}}
{{/each}}

**LESSON SPECIFICATION:**
- Title: {{lessonTitle}}
- Learning Objective: {{learningObjective}}
- Key Concepts: {{keyPointsToCover}}
- Content Archetype: {{contentArchetype}}

**CONTEXT (ANCHORS):**
[PREVIOUS SECTION]: "{{prevSectionEnd}}"
[NEXT SECTION]: "{{nextSectionStart}}"

**CONSTRAINTS:**
- Word count: {{minWords}}-{{maxWords}}
- Depth: {{depth}}
- Must address ALL issues listed above
- Maintain terminology: {{preserveTerminology}}

**OUTPUT:**
Full section content in Markdown.
```

### 8.2 Cost Estimation

- Input: ~800-1200 tokens
- Output: ~400-800 tokens
- **Total: ~1200-2000 tokens per section**

---

## 9. Verifier: Fix Validation

### 9.1 Two-Tier Verification Strategy

| Tier | Trigger | Method | Cost |
|------|---------|--------|------|
| **1: Heuristic** | All fixes | Length check, language detection, structure validation | FREE |
| **2: Delta Judge** | All fixes | Single LLM: "Was issue X fixed? Y/N" | ~200 tokens |

**Note:** Full CLEV panel runs only on final iteration before accept.

### 9.2 Delta Judge Prompt

```markdown
**TASK:** Verify if the following issue was addressed.

**ORIGINAL ISSUE:**
- Criterion: {{criterion}}
- Description: {{description}}
- Required fix: {{fixInstructions}}

**ORIGINAL TEXT:**
"""
{{originalText}}
"""

**NEW TEXT:**
"""
{{newText}}
"""

**QUESTION:** Was the issue properly addressed?
Answer ONLY "YES" or "NO" followed by a brief explanation.
```

### 9.3 Regression Detection (Quality Lock)

```typescript
interface QualityLock {
  criterion: string;
  lockedScore: number;
  tolerance: number;  // default 0.05
}

function checkRegression(
  newScores: CriteriaScores,
  locks: QualityLock[]
): RegressionReport {
  const regressions: Array<{criterion: string; delta: number}> = [];

  for (const lock of locks) {
    const newScore = newScores[lock.criterion];
    if (newScore < lock.lockedScore - lock.tolerance) {
      regressions.push({
        criterion: lock.criterion,
        delta: lock.lockedScore - newScore,
      });
    }
  }

  return {
    hasRegression: regressions.length > 0,
    regressions,
  };
}
```

---

## 10. Convergence & Iteration Control

### 10.1 Stopping Conditions (Priority Order)

**Semi-Auto Mode:**
1. **Hard Limits:** iteration >= 3, tokens >= 15000, timeout >= 5min
2. **Target Achieved:** score >= 0.90 → ACCEPT
3. **Good Enough:** score >= 0.85 AND no critical → ACCEPT
4. **Convergence:** score improvement < 2% for 2 iterations → ACCEPT or ESCALATE
5. **Max Iterations:** → ESCALATE_TO_HUMAN

**Full-Auto Mode:**
1. **Hard Limits:** iteration >= 3, tokens >= 15000, timeout >= 5min
2. **Target Achieved:** score >= 0.85 → ACCEPT
3. **Good Enough:** score >= 0.75 AND no critical → ACCEPT_WITH_WARNING
4. **Convergence:** score improvement < 2% for 2 iterations → ACCEPT_BEST_EFFORT
5. **Max Iterations:** → ACCEPT_BEST_EFFORT

### 10.2 Oscillation Prevention (Simple)

```typescript
/**
 * Simple oscillation detection: lock section after 2 edits
 */
function checkAndLockSection(
  state: RefinementIterationState,
  sectionId: string
): boolean {
  const editCount = state.sectionEditCount.get(sectionId) || 0;

  if (editCount >= 2) {
    state.lockedSections.add(sectionId);
    logger.warn({ sectionId, editCount }, 'Section locked after 2 edits');
    return true;  // Section is locked, skip
  }

  // Increment edit count
  state.sectionEditCount.set(sectionId, editCount + 1);
  return false;  // Section not locked, proceed
}
```

### 10.3 Convergence Detection

```typescript
function detectConvergence(
  scoreHistory: number[],
  threshold: number = 0.02
): boolean {
  if (scoreHistory.length < 2) return false;

  const recent = scoreHistory.slice(-2);
  const improvement = recent[1] - recent[0];

  // Converged if improvement < 2% absolute
  return improvement < threshold;
}
```

---

## 11. Readability Metrics (Universal)

### 11.1 Language-Agnostic Approach

Instead of language-specific metrics (like Flesch-Kincaid for English only), we use **universal metrics** that work for all languages:

```typescript
interface UniversalReadabilityMetrics {
  /** Average sentence length in words */
  avgSentenceLength: number;  // Target: 15-20, Max: 25

  /** Average word length in characters */
  avgWordLength: number;  // Max: 8 (varies by language)

  /** Paragraph break ratio (paragraphs / sentences) */
  paragraphBreakRatio: number;  // Min: 0.1 (avoid wall of text)
}

function evaluateReadability(content: string): UniversalReadabilityMetrics {
  const sentences = content.split(/[.!?。！？]+/).filter(s => s.trim());
  const words = content.split(/\s+/).filter(w => w.length > 0);
  const paragraphs = content.split(/\n\n+/).filter(p => p.trim());

  return {
    avgSentenceLength: words.length / Math.max(1, sentences.length),
    avgWordLength: words.reduce((sum, w) => sum + w.length, 0) / Math.max(1, words.length),
    paragraphBreakRatio: paragraphs.length / Math.max(1, sentences.length),
  };
}

const READABILITY_THRESHOLDS = {
  avgSentenceLength: { target: 17, max: 25 },
  avgWordLength: { max: 10 },  // Generous for German compound words
  paragraphBreakRatio: { min: 0.08 },
};
```

### 11.2 Heuristic Validation

```typescript
function validateReadability(
  content: string
): { passed: boolean; warnings: string[] } {
  const metrics = evaluateReadability(content);
  const warnings: string[] = [];

  if (metrics.avgSentenceLength > READABILITY_THRESHOLDS.avgSentenceLength.max) {
    warnings.push(`Sentences too long (avg ${metrics.avgSentenceLength.toFixed(1)} words)`);
  }

  if (metrics.paragraphBreakRatio < READABILITY_THRESHOLDS.paragraphBreakRatio.min) {
    warnings.push('Text is too dense, add more paragraph breaks');
  }

  return {
    passed: warnings.length === 0,
    warnings,
  };
}
```

---

## 12. Streaming & UI Integration

### 12.1 Event Types

```typescript
type RefinementEvent =
  | { type: 'refinement_start'; targetSections: string[]; mode: 'semi-auto' | 'full-auto' }
  | { type: 'batch_started'; batchIndex: number; sections: string[] }
  | { type: 'task_started'; sectionId: string; taskType: FixAction }
  | { type: 'patch_applied'; sectionId: string; content: string; diffSummary: string }
  | { type: 'verification_result'; sectionId: string; passed: boolean }
  | { type: 'batch_complete'; batchIndex: number }
  | { type: 'iteration_complete'; iteration: number; score: number }
  | { type: 'refinement_complete'; finalScore: number; status: RefinementStatus };

type RefinementStatus =
  | 'accepted'           // Score met threshold
  | 'accepted_warning'   // Full-auto: below ideal but acceptable
  | 'best_effort'        // Full-auto: returned best available
  | 'escalated';         // Semi-auto only: needs human review
```

### 12.2 Client-Side Handling

```typescript
// Client holds full document as Map<sectionId, content>
const documentState = new Map<string, string>();

eventSource.on('patch_applied', (event) => {
  // Update only the affected section
  documentState.set(event.sectionId, event.content);

  // UI shows diff indicator (semi-auto mode)
  if (config.mode === 'semi-auto') {
    highlightSection(event.sectionId, event.diffSummary);
  }
});

eventSource.on('refinement_complete', (event) => {
  if (event.status === 'best_effort') {
    showWarning('Content generated with best available quality. Some improvements may be possible.');
  }
});
```

---

## 13. Cost Analysis

### 13.1 Comparison: Full Regeneration vs Targeted Refinement

**Scenario:** 2000-token lesson, 1 major factual error (Section B), 2 minor grammar errors (Section D)

| Approach | Components | Tokens |
|----------|-----------|--------|
| **Full Regen** | Input (~4000) + Output (~2000) | **~6000** |
| **Targeted** | Arbiter (500) + Section-Expander B (1200) + Patcher D (500) + Delta Judge (400) | **~2600** |

**Savings: ~57%**

### 13.2 Expected Savings by Issue Type

| Issue Type | Recommended Fix | Avg Tokens | vs Full Regen |
|------------|----------------|------------|---------------|
| Grammar/Tone | Patcher | ~800 | -87% |
| Minor Clarity | Patcher | ~800 | -87% |
| Missing Examples | Patcher | ~1000 | -83% |
| Factual Error | Section-Expander | ~1500 | -75% |
| Structure Issue | Section-Expander | ~1500 | -75% |
| Multiple Major | Full Regen | ~6000 | 0% |

---

## 14. Implementation Plan

### Phase 1: Foundation (1-2 days)
- [ ] Add new types to `shared-types/src/judge-types.ts`
- [ ] Create `RefinementIterationState` interface
- [ ] Add `targetSectionId` and `fixAction` to Judge output schema
- [ ] Add operation mode config
- [ ] Add UI types to `shared-types/src/stage6-ui.types.ts` (Section 18.1)
- [ ] Add refinement phase names to `phaseNameSchema` (Section 18.4)

### Phase 2: Arbiter (2-3 days)
- [ ] Implement `consolidateVerdicts()` function
- [ ] Add Krippendorff's Alpha calculation (use existing npm package)
- [ ] Implement conflict resolution with priority hierarchy
- [ ] Implement `buildExecutionBatches()` for parallel execution
- [ ] Unit tests for consolidation scenarios

### Phase 3: Router (1 day)
- [ ] Implement `routeTask()` decision logic
- [ ] Add dependency flagging for adjacent sections

### Phase 4: Agents (3-4 days)
- [ ] Implement Patcher prompt and execution
- [ ] Implement Section-Expander prompt and execution
- [ ] Add context anchor extraction
- [ ] Add parallel execution for non-adjacent sections
- [ ] Integration tests

### Phase 5: Verifier (1-2 days)
- [ ] Implement Heuristic tier (FREE)
- [ ] Implement Delta Judge tier
- [ ] Add Quality Lock mechanism
- [ ] Add regression detection

### Phase 6: Convergence & Modes (1-2 days)
- [ ] Implement stopping conditions for both modes
- [ ] Add oscillation prevention (section locking)
- [ ] Implement best-effort fallback for full-auto
- [ ] Add convergence detection

### Phase 7: Integration (2-3 days)
- [ ] Update orchestrator routing logic
- [ ] Add streaming events
- [ ] Update UI to handle partial updates
- [ ] End-to-end testing for both modes

### Phase 8: Admin UI Integration (2-3 days)
- [ ] Implement `RefinementPlanPanel` component
- [ ] Implement `IterationProgressChart` component (sparkline)
- [ ] Add `BestEffortWarning` alert banner
- [ ] Add `EscalationButton` for semi-auto mode
- [ ] Extend `LessonInspector` with refinement visibility
- [ ] Handle streaming refinement events in UI
- [ ] Test backward compatibility with existing UI

**Total Estimate: 13-19 days**

---

## 15. Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Tokens per refinement iteration | ~6000 | ~2600 (-57%) |
| Quality preservation (no regression) | N/A | >95% |
| Refinement success rate (semi-auto) | N/A | >85% |
| Refinement success rate (full-auto) | N/A | >90% (incl. best-effort) |
| Average iterations to accept | N/A | <2.5 |
| Human escalation rate (semi-auto) | N/A | <10% |

---

## 16. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Patcher breaks coherence | Medium | Context anchors (prev/next sentences) |
| Oscillation loops | High | Section locking after 2 edits |
| Judge disagreement | Medium | Krippendorff's Alpha filtering |
| Regression in passing criteria | High | Quality Lock with 5% tolerance |
| Token budget overrun | Medium | Hard limits + early stopping |
| Full-auto returns bad content | Medium | Best-effort with quality flag |

---

## 17. Configuration Summary

```typescript
export const REFINEMENT_CONFIG = {
  // Operation modes
  modes: {
    'semi-auto': {
      acceptThreshold: 0.90,
      goodEnoughThreshold: 0.85,
      onMaxIterations: 'escalate',
      escalationEnabled: true,
    },
    'full-auto': {
      acceptThreshold: 0.85,
      goodEnoughThreshold: 0.75,
      onMaxIterations: 'best_effort',
      escalationEnabled: false,
    },
  },

  // Hard limits
  limits: {
    maxIterations: 3,
    maxTokens: 15000,
    timeoutMs: 300000,
  },

  // Quality control
  quality: {
    regressionTolerance: 0.05,
    sectionLockAfterEdits: 2,
    convergenceThreshold: 0.02,
  },

  // Parallel execution
  parallel: {
    maxConcurrentPatchers: 3,
    adjacentSectionGap: 1,
    sequentialForRegenerations: true,
  },

  // Readability (universal)
  readability: {
    avgSentenceLength: { target: 17, max: 25 },
    paragraphBreakRatio: { min: 0.08 },
  },
};
```

---

## 18. Admin UI Integration

> **Note:** This section ensures compatibility with the existing Pipeline Admin dashboard
> and Stage 6 "Glass Factory" monitoring UI.

### 18.1 New Shared Types

The following types must be added to `packages/shared-types/src/stage6-ui.types.ts`:

```typescript
// =============================================================================
// Targeted Refinement UI Types
// =============================================================================

/**
 * RefinementTaskDisplay - Single refinement task for UI visualization
 *
 * Shows what fix is being applied to which section, with progress tracking.
 * Used in Lesson Inspector to display refinement plan execution.
 */
export interface RefinementTaskDisplay {
  /** Target section ID */
  sectionId: string;
  /** Section title for display */
  sectionTitle: string;
  /** Type of fix being applied */
  actionType: 'SURGICAL_EDIT' | 'REGENERATE_SECTION';
  /** Task priority level */
  priority: 'critical' | 'major' | 'minor';
  /** Current execution status */
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  /** Consolidated instructions from Arbiter */
  synthesizedInstructions: string;
  /** Whether section is locked from further edits */
  isLocked?: boolean;
  /** Edit count for this section (oscillation tracking) */
  editCount?: number;
}

/**
 * RefinementIterationDisplay - Iteration state for UI progress tracking
 *
 * Shows current iteration progress, score history, and convergence status.
 * Used in Lesson Inspector during active refinement.
 */
export interface RefinementIterationDisplay {
  /** Current iteration number (0-based) */
  iteration: number;
  /** Maximum iterations allowed */
  maxIterations: number;
  /** Score history for sparkline/chart */
  scoreHistory: number[];
  /** Current overall score */
  currentScore: number;
  /** Total tasks in current iteration */
  tasksTotal: number;
  /** Completed tasks count */
  tasksCompleted: number;
  /** Failed tasks count */
  tasksFailed: number;
  /** Sections locked from further edits */
  lockedSections: string[];
  /** Current quality assessment */
  qualityStatus: 'good' | 'acceptable' | 'below_standard';
  /** Whether convergence detected (score plateau) */
  isConverged: boolean;
  /** Token budget usage */
  tokensUsed: number;
  /** Token budget limit */
  tokensLimit: number;
}

/**
 * RefinementPlanDisplay - Full refinement plan for UI
 *
 * Contains all tasks grouped by execution batch, with cost estimates.
 * Shown in Lesson Inspector when verdict requires refinement.
 */
export interface RefinementPlanDisplay {
  /** All refinement tasks */
  tasks: RefinementTaskDisplay[];
  /** Execution batches (for parallel processing visualization) */
  executionBatches: Array<{
    batchIndex: number;
    sectionIds: string[];
    canParallelize: boolean;
  }>;
  /** Estimated token cost for full plan */
  estimatedCost: number;
  /** Inter-rater agreement score (Krippendorff's Alpha) */
  agreementScore: number;
  /** Agreement interpretation */
  agreementLevel: 'high' | 'moderate' | 'low';
  /** Conflict resolutions made by Arbiter */
  conflictResolutions?: Array<{
    criterion1: string;
    criterion2: string;
    resolution: string;
  }>;
}

/**
 * BestEffortDisplay - Best-effort result info for full-auto mode
 *
 * Shows when full-auto mode returns best available result
 * instead of meeting quality threshold.
 */
export interface BestEffortDisplay {
  /** Best achieved score across all iterations */
  bestScore: number;
  /** Which iteration achieved best score */
  bestIteration: number;
  /** Quality status classification */
  qualityStatus: 'good' | 'acceptable' | 'below_standard';
  /** Number of unresolved issues */
  unresolvedIssuesCount: number;
  /** Categories of unresolved issues */
  unresolvedCategories: string[];
  /** Improvement hints for manual review */
  improvementHints: string[];
}

/**
 * Extended JudgeVerdictDisplay - Add refinement visibility
 *
 * Extends existing JudgeVerdictDisplay with refinement-specific fields.
 * These fields are populated when verdict is TARGETED_FIX or ITERATIVE_REFINEMENT.
 */
// Add to existing JudgeVerdictDisplay interface:
export interface JudgeVerdictDisplayRefinementExtension {
  /** Refinement plan (when verdict requires fix) */
  refinementPlan?: RefinementPlanDisplay;

  /** Current iteration state (during active refinement) */
  iterationState?: RefinementIterationDisplay;

  /** Best-effort result info (full-auto mode only) */
  bestEffortInfo?: BestEffortDisplay;

  /** Operation mode that produced this result */
  operationMode?: 'semi-auto' | 'full-auto';

  /** Whether result was escalated to human (semi-auto only) */
  wasEscalated?: boolean;
}
```

### 18.2 Extended Log Entry Types

Extend `LessonLogEntry` node types for refinement agents:

```typescript
// Update Stage6NodeName or add refinement-specific nodes
export type RefinementAgentName = 'arbiter' | 'router' | 'patcher' | 'section_expander' | 'delta_judge' | 'verifier';

// Extend LessonLogEntry
export interface LessonLogEntry {
  // ...existing fields...

  /** Which node generated this log */
  node: Stage6NodeName | 'system' | RefinementAgentName;

  /** Refinement-specific event type (for filtering/grouping) */
  refinementEvent?: {
    type:
      | 'refinement_start'
      | 'arbiter_consolidation'
      | 'batch_started'
      | 'task_started'
      | 'patch_applied'
      | 'section_regenerated'
      | 'verification_result'
      | 'quality_lock_triggered'
      | 'section_locked'
      | 'iteration_complete'
      | 'convergence_detected'
      | 'best_effort_selected'
      | 'escalation_triggered'
      | 'refinement_complete';

    /** Target section (if applicable) */
    sectionId?: string;

    /** Score delta (if applicable) */
    scoreDelta?: number;

    /** Batch index (if applicable) */
    batchIndex?: number;
  };
}
```

### 18.3 Extended LessonInspectorData

Add operation mode and escalation support:

```typescript
// Add to existing LessonInspectorData interface:
export interface LessonInspectorDataRefinementExtension {
  /** Generation operation mode */
  operationMode: 'semi-auto' | 'full-auto';

  /** Whether escalation action is available (semi-auto, low quality) */
  canEscalate: boolean;

  /** Whether this result came from best-effort fallback */
  isBestEffort: boolean;

  /** Active refinement state (null if not in refinement) */
  activeRefinement?: {
    /** Current iteration */
    iteration: number;
    /** Active tasks being processed */
    activeTasks: RefinementTaskDisplay[];
    /** Estimated time remaining */
    estimatedTimeRemainingMs?: number;
  };
}
```

### 18.4 Phase Names for Model Configuration

Add refinement agent phases to `phaseNameSchema` in `packages/shared-types/src/pipeline-admin.ts`:

```typescript
export const phaseNameSchema = z.enum([
  // ... existing phases ...

  // Stage 6: Lesson Content (existing)
  'stage_6_rag_planning',
  'stage_6_judge',
  'stage_6_refinement',

  // Stage 6: Targeted Refinement Agents (NEW)
  'stage_6_arbiter',        // Consolidation agent
  'stage_6_patcher',        // Surgical edit agent
  'stage_6_section_expander', // Section regeneration agent
  'stage_6_delta_judge',    // Fix verification agent

  // ... rest of phases ...
]);
```

> **Note:** This allows admins to configure different models for each refinement agent
> through the existing Model Configuration UI. If a single model is preferred for all
> refinement agents, use `stage_6_refinement` as the unified phase.

### 18.5 Streaming Event Mapping

Map refinement events to existing UI infrastructure:

| Refinement Event | UI Component | Action |
|------------------|--------------|--------|
| `refinement_start` | LessonInspector | Show refinement plan panel |
| `batch_started` | PipelineStepper | Highlight batch sections |
| `task_started` | RefinementTaskList | Mark task as in_progress |
| `patch_applied` | ContentPreview | Update section content, show diff indicator |
| `verification_result` | RefinementTaskList | Mark task completed/failed |
| `iteration_complete` | IterationProgress | Update score chart, iteration counter |
| `convergence_detected` | StatusBadge | Show "Converged" indicator |
| `best_effort_selected` | QualityBadge | Show warning with best score |
| `escalation_triggered` | ActionButtons | Enable "Review Required" state |
| `refinement_complete` | LessonInspector | Transition to final state |

### 18.6 UI Component Recommendations

New components needed for refinement visibility:

1. **RefinementPlanPanel** - Shows tasks grouped by batch, with Arbiter agreement score
2. **IterationProgressChart** - Sparkline showing score history across iterations
3. **SectionLockIndicator** - Badge showing locked sections (oscillation prevention)
4. **BestEffortWarning** - Alert banner for full-auto results below threshold
5. **EscalationButton** - Action button for semi-auto escalation to human

### 18.7 Backward Compatibility

The refinement system is **backward compatible** with existing UI:

1. **No refinement fields** → UI works as before (shows only final verdict)
2. **Refinement fields present** → UI shows extended refinement visibility
3. **Operation mode absent** → Default to 'full-auto' behavior

All new fields are **optional**, so existing clients continue working without updates.

---

## Appendix A: References

- Madaan et al., 2023. "Self-Refine: Iterative Refinement with Self-Feedback" (NeurIPS)
- Bai et al., 2022. "Constitutional AI" (Anthropic)
- Jiang et al., 2023. "LLM-Blender" (ACL)
- CARE Framework, 2024 (OpenReview)
- Multi-Agent Debate Framework (Hu et al., 2024)
- DELIteraTeR (Grammarly, ACL 2022)

## Appendix B: Related Files

### Current Implementation
- `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/cascade-evaluator.ts`
- `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/clev-voter.ts`
- `packages/course-gen-platform/src/stages/stage6-lesson-content/orchestrator.ts`
- `packages/shared-types/src/judge-types.ts`

### Admin UI Files (Section 18)
- `packages/shared-types/src/stage6-ui.types.ts` - UI types for Stage 6 monitoring
- `packages/shared-types/src/pipeline-admin.ts` - Phase names and model config types
- `packages/web/components/generation-graph/panels/lesson/LessonInspector.tsx` - Main inspector component
- `packages/web/components/generation-graph/components/JudgeVotingPanel.tsx` - CLEV voting visualization

### Research Documents
- `docs/research/Stage6-Judge-Refinement-Strategy.md`
- `docs/research/Multi-judge LLM refinement systems A comprehensive design guide.md`

## Appendix C: Removed from v1.0 (Deferred)

The following features were considered but deferred to avoid overengineering:

| Feature | Reason for Deferral |
|---------|---------------------|
| NLI entailment verification | Delta Judge sufficient, NLI requires separate model |
| Quality ceiling estimation | Hard limits simpler and more predictable |
| Language-specific readability | Universal metrics work for all languages |
| Semantic caching | Phase 2 optimization after core system works |
| Autocorrelation oscillation | Simple section locking after 2 edits is sufficient |
| Lite-Smoother component | Patcher handles transitions via context anchors |

---

## Appendix D: Implementation Notes (Added 2025-12-25)

### Mermaid Fix Pipeline (3-Layer Defense)

LLMs frequently generate invalid Mermaid syntax, especially escaped quotes (`\"`) that break rendering.
The implementation adds a 3-layer defense that integrates with the targeted refinement system:

| Layer | Component | File Location | Description |
|-------|-----------|---------------|-------------|
| 1 | Prevention | `src/shared/prompts/prompt-registry.ts` | Prompt instructions to avoid escaped quotes |
| 2 | Auto-fix | `src/stages/stage6-lesson-content/utils/mermaid-sanitizer.ts` | Automatically removes `\"` from Mermaid blocks |
| 3 | Detection | `src/stages/stage6-lesson-content/judge/heuristic-filter.ts` | Detects remaining issues, routes to REGENERATE |

**Key Design Decision**: Mermaid issues have `severity: CRITICAL` which triggers `REGENERATE`, NOT `FLAG_TO_JUDGE`.
This avoids expensive Judge calls for easily fixable syntax issues.

### Severity Routing Implementation

The self-reviewer node (`nodes/self-reviewer-node.ts`) routes issues based on severity:

| Severity | Issue Types | Action | Description |
|----------|-------------|--------|-------------|
| `CRITICAL` | Mermaid syntax, truncation, empty sections | `REGENERATE` | Cheap model self-regeneration |
| `COMPLEX` | Factual errors, major structural issues | `FLAG_TO_JUDGE` | Full Judge evaluation |
| `FIXABLE` | Clarity, tone, minor grammar | `SURGICAL_EDIT` | Patcher applies targeted fix |
| `INFO` | Minor observations, suggestions | Pass through | No action needed |

### Best-Effort Fallback Implementation

The `best-effort-selector.ts` module implements the fallback logic:

```typescript
// Key function: selectBestIteration()
// Selects iteration with HIGHEST score (not original)
// Returns with improvementHints extracted from unresolved issues
```

Quality status thresholds:
- >= 0.85: 'good'
- >= 0.75: 'acceptable'
- < 0.75: 'below_standard'

### Patcher Model Selection

Patcher uses FREE model: `xiaomi/mimo-v2-flash:free`
Configured in: `src/stages/stage6-lesson-content/config/index.ts`

### Test Coverage

| Test Suite | Tests | Description |
|------------|-------|-------------|
| `mermaid-sanitizer.test.ts` | 20 | Unit tests for Mermaid sanitizer |
| `mermaid-fix-pipeline.e2e.test.ts` | 27 | E2E pipeline with real DB data |
| `targeted-refinement-cycle.e2e.test.ts` | 23 | Full refinement cycle E2E |
| Total Stage 6 | 262+ | All passing |

### Files Created/Modified

**New Files:**
- `src/stages/stage6-lesson-content/utils/mermaid-sanitizer.ts` - Layer 2 auto-fix
- `src/stages/stage6-lesson-content/utils/markdown-section-parser.ts` - Section parsing utilities
- `src/stages/stage6-lesson-content/utils/section-regenerator.ts` - Section regeneration logic
- `tests/stages/stage6-lesson-content/utils/mermaid-sanitizer.test.ts` - Unit tests
- `tests/stages/stage6-lesson-content/mermaid-fix-pipeline.e2e.test.ts` - E2E tests
- `tests/stages/stage6-lesson-content/targeted-refinement-cycle.e2e.test.ts` - Full cycle E2E

**Modified Files:**
- `judge/heuristic-filter.ts` - Added `checkMermaidSyntax()` function
- `nodes/generator.ts` - Integrated mermaid sanitizer after generation
- `nodes/self-reviewer-node.ts` - CRITICAL severity for Mermaid issues
- `src/shared/prompts/prompt-registry.ts` - Mermaid instructions in prompt
- `judge/targeted-refinement/orchestrator.ts` - Main refinement orchestration
- `judge/targeted-refinement/best-effort-selector.ts` - Best iteration selection
