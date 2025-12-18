# Data Model: Stage 6 Targeted Refinement

**Date**: 2025-12-11 | **Phase**: 1

## Overview

This document describes the data model for the Targeted Refinement system. Most types are **already defined** in `packages/shared-types/src/judge-types.ts`. This document focuses on:

1. **New types** needed for UI and Arbiter
2. **Entity relationships** between existing and new types
3. **State machine** for refinement iteration

## Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CLEV Voting (Existing)                          │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐     │
│  │  JudgeVerdict   │    │  JudgeVerdict   │    │  JudgeVerdict   │     │
│  │  (Primary)      │    │  (Secondary)    │    │  (Tiebreaker)   │     │
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘     │
│           │                      │                      │               │
│           └──────────────────────┼──────────────────────┘               │
│                                  │                                      │
│                                  ▼                                      │
│                    ┌─────────────────────────┐                          │
│                    │ JudgeAggregatedResult   │                          │
│                    │ (verdicts[], votingMethod)                         │
│                    └────────────┬────────────┘                          │
└─────────────────────────────────┼───────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Arbiter (NEW)                                   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ consolidateVerdicts()                                            │   │
│  │  - Extract JudgeIssue[] from all verdicts                       │   │
│  │  - Calculate Krippendorff's Alpha (agreement)                   │   │
│  │  - Resolve conflicts using PRIORITY_HIERARCHY                   │   │
│  │  - Create TargetedIssue[] with fixAction routing                │   │
│  └──────────────────────────┬──────────────────────────────────────┘   │
│                              │                                          │
│                              ▼                                          │
│              ┌─────────────────────────────┐                           │
│              │     RefinementPlan          │                           │
│              │  - tasks: SectionRefinementTask[]                       │
│              │  - agreementScore (α)       │                           │
│              │  - conflictResolutions[]    │                           │
│              │  - executionBatches[][]     │                           │
│              └──────────────┬──────────────┘                           │
└─────────────────────────────┼───────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Router (NEW)                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ routeTask(task: SectionRefinementTask)                          │   │
│  │  → SURGICAL_EDIT: Patcher                                       │   │
│  │  → REGENERATE_SECTION: Section-Expander                         │   │
│  │  → FULL_REGENERATE: Exit to Planner (abort refinement)          │   │
│  └──────────────────────────┬──────────────────────────────────────┘   │
│                              │                                          │
│                              ▼                                          │
│  ┌───────────────────┐      │      ┌───────────────────┐               │
│  │ Patcher           │◄─────┼─────►│ Section-Expander  │               │
│  │ ~800 tokens/fix   │      │      │ ~1500 tokens/sect │               │
│  └────────┬──────────┘      │      └────────┬──────────┘               │
│           │                 │               │                          │
│           └─────────────────┼───────────────┘                          │
│                             │                                          │
│                             ▼                                          │
│              ┌─────────────────────────────┐                           │
│              │     Verifier (Delta Judge)  │                           │
│              │  - verifyPatch()            │                           │
│              │  - checkQualityLocks()      │                           │
│              │  - checkReadability()       │                           │
│              └──────────────┬──────────────┘                           │
└─────────────────────────────┼───────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                  Iteration Controller (NEW)                             │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ RefinementIterationState                                        │   │
│  │  - iteration: number (0-2)                                      │   │
│  │  - scoreHistory: number[]                                       │   │
│  │  - contentHistory: IterationResult[]                           │   │
│  │  - lockedSections: Set<string>                                 │   │
│  │  - sectionEditCount: Map<string, number>                       │   │
│  │  - qualityLocks: Record<criterion, score>                      │   │
│  └──────────────────────────┬──────────────────────────────────────┘   │
│                              │                                          │
│  Convergence Detection:      │                                          │
│  - |Δscore| < 0.02 for 2 iterations → STOP                            │
│  - sectionEditCount[id] >= 2 → LOCK section                           │
│  - iteration >= 3 → STOP (hard limit)                                 │
│  - qualityLock[criterion] - newScore > 0.05 → REGRESSION              │
│                              │                                          │
│                              ▼                                          │
│  ┌───────────────────┐      │      ┌───────────────────┐               │
│  │ Continue Loop     │◄─────┴─────►│ Exit (Accept/      │               │
│  │ (more iterations) │             │ Best-Effort/       │               │
│  └───────────────────┘             │ Escalate)          │               │
│                                    └───────────────────┘               │
└─────────────────────────────────────────────────────────────────────────┘
```

## Existing Types (in judge-types.ts)

These types are **already implemented** and will be reused:

### Core Types

| Type | Description | Location |
|------|-------------|----------|
| `FixAction` | SURGICAL_EDIT \| REGENERATE_SECTION \| FULL_REGENERATE | judge-types.ts:263 |
| `ContextScope` | paragraph \| section \| global | judge-types.ts:275 |
| `ContextWindow` | startQuote, endQuote, scope | judge-types.ts:284 |
| `TargetedIssue` | JudgeIssue + targeting (id, sectionId, fixAction, contextWindow, fixInstructions) | judge-types.ts:306 |
| `TaskPriority` | critical \| major \| minor | judge-types.ts:325 |
| `SectionRefinementTask` | Per-section task with synthesizedInstructions | judge-types.ts:335 |
| `ConflictResolution` | Conflict log (issue1, issue2, resolution) | judge-types.ts:363 |
| `RefinementPlanStatus` | PENDING \| EXECUTING \| COMPLETED \| FAILED | judge-types.ts:378 |
| `RefinementPlan` | FixRecommendation + tasks, agreementScore, executionBatches | judge-types.ts:393 |
| `IterationResult` | Single iteration snapshot (iteration, score, content, remainingIssues) | judge-types.ts:419 |
| `RefinementIterationState` | Interface (not schema) for iteration tracking | judge-types.ts:436 |
| `OperationMode` | semi-auto \| full-auto | judge-types.ts:464 |
| `SemiAutoConfig` | Config for semi-auto mode (escalationEnabled: true) | judge-types.ts:484 |
| `FullAutoConfig` | Config for full-auto mode (escalationEnabled: false) | judge-types.ts:505 |
| `RefinementConfig` | Discriminated union of mode configs | judge-types.ts:525 |
| `QualityStatus` | good \| acceptable \| below_standard | judge-types.ts:540 |
| `BestEffortResult` | Best available content when max iterations reached | judge-types.ts:548 |
| `RefinementStatus` | accepted \| accepted_warning \| best_effort \| escalated | judge-types.ts:571 |
| `RefinementEvent` | Union type for streaming events | judge-types.ts:588 |
| `UniversalReadabilityMetrics` | avgSentenceLength, avgWordLength, paragraphBreakRatio | judge-types.ts:605 |
| `REFINEMENT_CONFIG` | Complete config constant | judge-types.ts:670 |
| `PRIORITY_HIERARCHY` | Conflict resolution priority order | judge-types.ts:657 |

### Existing UI Types (in stage6-ui.types.ts)

| Type | Description |
|------|-------------|
| `JudgeVerdictDisplay` | Complete judge verdict visualization data |
| `CLEVVotingResult` | Aggregated result from CLEV voting |
| `LessonInspectorData` | Detailed lesson pipeline data |
| `PipelineNodeState` | Node execution state |

## New Types Needed

### 1. Arbiter Types

```typescript
// In packages/shared-types/src/judge-types.ts (extend)

/**
 * ArbiterInput - Input for Arbiter consolidation
 */
export interface ArbiterInput {
  /** Aggregated result from CLEV voting */
  clevResult: JudgeAggregatedResult;
  /** Lesson content sections for context anchors */
  contentSections: LessonContentSection[];
  /** Operation mode affects conflict resolution behavior */
  operationMode: OperationMode;
}

/**
 * ArbiterOutput - Result of Arbiter consolidation
 */
export interface ArbiterOutput {
  /** Generated refinement plan */
  plan: RefinementPlan;
  /** Krippendorff's Alpha agreement score */
  agreementScore: number;
  /** Interpretation of agreement level */
  agreementLevel: 'high' | 'moderate' | 'low';
  /** Issues accepted based on agreement threshold */
  acceptedIssues: TargetedIssue[];
  /** Issues rejected (low agreement, non-critical) */
  rejectedIssues: TargetedIssue[];
}
```

### 2. Router Types

```typescript
// In packages/shared-types/src/judge-types.ts (extend)

/**
 * RouterDecision - Result of Router routing a task
 */
export interface RouterDecision {
  /** Task being routed */
  task: SectionRefinementTask;
  /** Chosen fix action */
  action: FixAction;
  /** Agent to execute the fix */
  executor: 'patcher' | 'section-expander' | 'planner';
  /** Estimated token cost */
  estimatedTokens: number;
  /** Routing reasoning */
  reason: string;
}

/**
 * RoutingConfig - Configuration for Router decisions
 */
export interface RoutingConfig {
  /** Token budget remaining */
  tokenBudget: number;
  /** Maximum Patcher invocations per iteration */
  maxPatcherCalls: number;
  /** Whether to prefer surgical edits */
  preferSurgical: boolean;
}
```

### 3. Verifier Types

```typescript
// In packages/shared-types/src/judge-types.ts (extend)

/**
 * DeltaJudgeInput - Input for Delta Judge verification
 */
export interface DeltaJudgeInput {
  /** Original section content before patch */
  originalContent: string;
  /** Patched section content */
  patchedContent: string;
  /** Issue that was addressed */
  addressedIssue: TargetedIssue;
  /** Context anchors for coherence check */
  contextAnchors: SectionRefinementTask['contextAnchors'];
}

/**
 * DeltaJudgeResult - Result of Delta Judge verification
 */
export interface DeltaJudgeResult {
  /** Whether the fix was successful */
  passed: boolean;
  /** Confidence in the assessment */
  confidence: JudgeConfidence;
  /** Reasoning for the assessment */
  reasoning: string;
  /** Any new issues introduced */
  newIssues: JudgeIssue[];
  /** Tokens used for verification */
  tokensUsed: number;
  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * QualityLockViolation - Record of a quality regression
 */
export interface QualityLockViolation {
  /** Which criterion regressed */
  criterion: JudgeCriterion;
  /** Locked score (before patch) */
  lockedScore: number;
  /** New score (after patch) */
  newScore: number;
  /** Delta (negative means regression) */
  delta: number;
  /** Section where regression occurred */
  sectionId: string;
}
```

### 4. UI Extension Types

```typescript
// In packages/shared-types/src/stage6-ui.types.ts (extend)

/**
 * RefinementTaskDisplay - UI representation of a refinement task
 */
export interface RefinementTaskDisplay {
  /** Task ID */
  id: string;
  /** Section being refined */
  sectionId: string;
  /** Section title */
  sectionTitle: string;
  /** Fix action type */
  actionType: 'SURGICAL_EDIT' | 'REGENERATE_SECTION';
  /** Priority badge */
  priority: 'critical' | 'major' | 'minor';
  /** Status in current iteration */
  status: 'pending' | 'executing' | 'completed' | 'failed';
  /** Duration if completed */
  durationMs?: number;
  /** Token usage if completed */
  tokensUsed?: number;
  /** Error message if failed */
  errorMessage?: string;
}

/**
 * RefinementIterationDisplay - UI representation of a refinement iteration
 */
export interface RefinementIterationDisplay {
  /** Iteration number (0-2) */
  iteration: number;
  /** Score at start of iteration */
  startScore: number;
  /** Score at end of iteration */
  endScore: number;
  /** Score improvement */
  improvement: number;
  /** Tasks executed in this iteration */
  tasks: RefinementTaskDisplay[];
  /** Sections locked after this iteration */
  sectionsLocked: string[];
  /** Duration of iteration */
  durationMs: number;
  /** Token usage */
  tokensUsed: number;
}

/**
 * RefinementPlanDisplay - UI representation of refinement plan
 */
export interface RefinementPlanDisplay {
  /** Plan status */
  status: 'PENDING' | 'EXECUTING' | 'COMPLETED' | 'FAILED';
  /** Agreement score (Krippendorff's Alpha) */
  agreementScore: number;
  /** Agreement level badge */
  agreementLevel: 'high' | 'moderate' | 'low';
  /** Total tasks planned */
  totalTasks: number;
  /** Tasks by priority */
  tasksByPriority: {
    critical: number;
    major: number;
    minor: number;
  };
  /** Estimated token cost */
  estimatedCost: number;
  /** Iterations completed */
  iterations: RefinementIterationDisplay[];
  /** Current iteration (if executing) */
  currentIteration?: number;
  /** Best score achieved */
  bestScore: number;
  /** Final status message */
  statusMessage?: string;
}

/**
 * LessonInspectorDataRefinementExtension - Extension for LessonInspectorData
 * Adds refinement-specific fields to existing type
 */
export interface LessonInspectorDataRefinementExtension {
  /** Refinement plan display (if refinement occurred) */
  refinementPlan?: RefinementPlanDisplay;
  /** Whether escalation to human is possible */
  canEscalate?: boolean;
  /** Active refinement state (if currently refining) */
  activeRefinement?: {
    currentIteration: number;
    currentTask: RefinementTaskDisplay | null;
    estimatedTimeRemainingMs: number;
  };
}
```

### 5. Phase Names

```typescript
// In packages/shared-types/src/pipeline-admin.ts (extend phaseNameSchema)

export const phaseNameSchema = z.enum([
  // ... existing phases ...
  // Stage 6: Lesson Content
  'stage_6_rag_planning',
  'stage_6_judge',
  'stage_6_refinement',
  // NEW: Targeted Refinement phases
  'stage_6_arbiter',         // NEW: Arbiter consolidation
  'stage_6_patcher',         // NEW: Surgical edits
  'stage_6_section_expander', // NEW: Section regeneration
  'stage_6_delta_judge',     // NEW: Verification
]);
```

### 6. Refinement Agent Names (for Logging)

```typescript
// In packages/shared-types/src/stage6-ui.types.ts (extend)

/**
 * RefinementAgentName - Agent identifiers for refinement logging
 * Used in LessonLogEntry.node for detailed log filtering
 */
export type RefinementAgentName =
  | 'arbiter'
  | 'router'
  | 'patcher'
  | 'section_expander'
  | 'delta_judge'
  | 'verifier';

/**
 * Extended LessonLogEntry.node type
 * Extends Stage6NodeName with refinement agents
 */
export type ExtendedStage6NodeName =
  | Stage6NodeName
  | 'system'
  | RefinementAgentName;

/**
 * RefinementEventType - Event types for refinement progress tracking
 * Used in LessonLogEntry.refinementEvent.type
 */
export type RefinementEventType =
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
```

## State Machine

### Refinement Iteration State Machine

```
     ┌─────────────────────────────────────────────────────────────────┐
     │                      IDLE                                       │
     │    (No refinement in progress)                                  │
     └──────────────────────┬──────────────────────────────────────────┘
                            │ CLEV verdict: ITERATIVE_REFINEMENT
                            │ or ACCEPT_WITH_MINOR_REVISION
                            ▼
     ┌─────────────────────────────────────────────────────────────────┐
     │                   ARBITER_CONSOLIDATING                         │
     │    - consolidateVerdicts()                                      │
     │    - Calculate Krippendorff's Alpha                             │
     │    - Create RefinementPlan                                      │
     └──────────────────────┬──────────────────────────────────────────┘
                            │ Plan created
                            ▼
     ┌─────────────────────────────────────────────────────────────────┐
     │                   ITERATION_STARTING                            │
     │    - iteration++                                                │
     │    - Create batch from plan.executionBatches[i]                 │
     │    - Check iteration < maxIterations                            │
     └──────────────────────┬──────────────────────────────────────────┘
                            │ Batch ready
                            ▼
     ┌─────────────────────────────────────────────────────────────────┐
     │                   BATCH_EXECUTING                               │
     │    - Execute non-adjacent tasks in parallel                     │
     │    - Route each task to Patcher or Section-Expander             │
     │    - Stream RefinementEvents                                    │
     └──────────────────────┬──────────────────────────────────────────┘
                            │ Batch complete
                            ▼
     ┌─────────────────────────────────────────────────────────────────┐
     │                   BATCH_VERIFYING                               │
     │    - Run Delta Judge on each patched section                    │
     │    - Check quality locks (no regression)                        │
     │    - Check readability metrics                                  │
     └──────────────────────┬──────────────────────────────────────────┘
                            │ Verification complete
                            ▼
     ┌─────────────────────────────────────────────────────────────────┐
     │                   CONVERGENCE_CHECKING                          │
     │    - Update scoreHistory                                        │
     │    - Check |Δscore| < 0.02 (convergence)                        │
     │    - Update sectionEditCount (lock if >= 2 edits)               │
     │    - Check token budget                                         │
     │    - Check timeout                                              │
     └──────────────────┬───────────────────────┬──────────────────────┘
                        │                       │
        More batches?   │                       │ Convergence OR
        Budget OK?      │                       │ Max iterations OR
        Time OK?        │                       │ All tasks done
                        ▼                       ▼
              ┌─────────────────┐      ┌─────────────────┐
              │ ITERATION_      │      │ FINALIZING      │
              │ STARTING        │      │                 │
              │ (loop back)     │      │ - Select best   │
              └─────────────────┘      │   iteration     │
                                       │ - Determine     │
                                       │   final status  │
                                       └────────┬────────┘
                                                │
                            ┌───────────────────┼───────────────────┐
                            ▼                   ▼                   ▼
                   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
                   │   ACCEPTED   │    │  BEST_EFFORT │    │  ESCALATED   │
                   │  (≥0.85 semi │    │ (full-auto   │    │ (semi-auto   │
                   │   ≥0.75 full)│    │  fallback)   │    │  escalation) │
                   └──────────────┘    └──────────────┘    └──────────────┘
```

## Database Schema Changes

No database schema changes required. All refinement state is:
- In-memory during execution
- Logged to trace tables (existing)
- Streamed via events (existing pattern)

If persistent refinement history is needed later, extend:
- `lesson_content.metadata` (JSONB) with `refinement_history`
- Or create new `refinement_logs` table

## Validation Rules

### Arbiter Consolidation

1. **Agreement Threshold**:
   - α ≥ 0.80: Accept ALL issues
   - α ≥ 0.67: Accept issues with 2+ judge agreement
   - α < 0.67: Accept only CRITICAL issues, flag for review

2. **Conflict Resolution Order** (PRIORITY_HIERARCHY):
   1. factual_accuracy (highest)
   2. learning_objective_alignment
   3. pedagogical_structure
   4. clarity_readability
   5. engagement_examples
   6. completeness (lowest)

### Iteration Constraints

1. **Hard Limits**:
   - maxIterations: 3
   - maxTotalTokens: 15000
   - timeoutMs: 300000 (5 min)

2. **Convergence**:
   - |Δscore| < 0.02 for 2 consecutive iterations → STOP

3. **Section Locking**:
   - sectionEditCount[id] ≥ 2 → Lock section
   - Adjacent sections (±1) cannot be edited in parallel

4. **Quality Locks**:
   - regressionTolerance: 0.05
   - If criterion score drops > 0.05 → FAIL patch, rollback

### Router Decision Matrix

| Condition | Action | Executor |
|-----------|--------|----------|
| severity=minor AND localizable | SURGICAL_EDIT | Patcher |
| severity=major AND single section | REGENERATE_SECTION | Section-Expander |
| severity=critical AND structural | FULL_REGENERATE | Exit to Planner |
| multiple criteria in section | REGENERATE_SECTION | Section-Expander |
| tone/grammar/clarity issue | SURGICAL_EDIT | Patcher |
| factual error | REGENERATE_SECTION | Section-Expander |
