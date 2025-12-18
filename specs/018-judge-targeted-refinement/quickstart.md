# Quickstart: Stage 6 Targeted Refinement Implementation

**Date**: 2025-12-11 | **Phase**: 1

## Overview

This guide provides implementation instructions for the Targeted Refinement system. Follow this order to minimize rework.

## Implementation Phases

### Phase 1: Foundation (Types & Config)

**Files to modify:**
- `packages/shared-types/src/judge-types.ts` - Add new types
- `packages/shared-types/src/stage6-ui.types.ts` - Add UI display types
- `packages/shared-types/src/pipeline-admin.ts` - Add phase names

**Steps:**

1. Add new types to `judge-types.ts`:
   - `ArbiterInput`, `ArbiterOutput`
   - `RouterDecision`, `RoutingConfig`
   - `DeltaJudgeInput`, `DeltaJudgeResult`
   - `QualityLockViolation`

2. Add UI types to `stage6-ui.types.ts`:
   - `RefinementTaskDisplay`
   - `RefinementIterationDisplay`
   - `RefinementPlanDisplay`
   - `LessonInspectorDataRefinementExtension`

3. Add phase names to `pipeline-admin.ts`:
   - `stage_6_arbiter`
   - `stage_6_patcher`
   - `stage_6_expander`
   - `stage_6_delta_judge`

4. Run type-check: `pnpm type-check`

### Phase 2: Arbiter Module

**New files:**
```
packages/course-gen-platform/src/stages/stage6-lesson-content/judge/arbiter/
├── index.ts
├── consolidate-verdicts.ts
├── krippendorff.ts
└── conflict-resolver.ts
```

**Implementation order:**

1. **krippendorff.ts** - Krippendorff's Alpha calculation
   ```typescript
   import { krippendorff } from 'krippendorff';

   export function calculateAgreementScore(
     verdicts: JudgeVerdict[]
   ): { score: number; level: 'high' | 'moderate' | 'low' } {
     // Convert criteria scores to rating matrix
     // Calculate alpha
     // Return with level interpretation
   }
   ```

2. **conflict-resolver.ts** - Resolve conflicting issues using PRIORITY_HIERARCHY
   ```typescript
   export function resolveConflicts(
     issues: JudgeIssue[],
     agreementScore: number
   ): { accepted: TargetedIssue[]; rejected: TargetedIssue[]; log: ConflictResolution[] }
   ```

3. **consolidate-verdicts.ts** - Main Arbiter logic
   ```typescript
   export async function consolidateVerdicts(
     input: ArbiterInput
   ): Promise<ArbiterOutput> {
     // 1. Extract issues from all verdicts
     // 2. Calculate Krippendorff's Alpha
     // 3. Resolve conflicts
     // 4. Create TargetedIssues with routing info
     // 5. Build RefinementPlan with execution batches
   }
   ```

4. **index.ts** - Exports

5. Tests: `tests/unit/judge/arbiter.test.ts`

### Phase 3: Router Module

**New files:**
```
packages/course-gen-platform/src/stages/stage6-lesson-content/judge/router/
├── index.ts
└── route-task.ts
```

**Implementation:**

```typescript
// route-task.ts
export function routeTask(
  task: SectionRefinementTask,
  config: RoutingConfig
): RouterDecision {
  // Decision matrix:
  // - Minor + localizable → SURGICAL_EDIT (Patcher)
  // - Major + single section → REGENERATE_SECTION (Section-Expander)
  // - Critical + structural → FULL_REGENERATE (exit to Planner)
  // - Multiple criteria in section → REGENERATE_SECTION
  // - Tone/grammar/clarity → SURGICAL_EDIT
  // - Factual error → REGENERATE_SECTION
}

export function createExecutionBatches(
  tasks: SectionRefinementTask[],
  maxConcurrent: number
): SectionRefinementTask[][] {
  // Greedy coloring for non-adjacent batching
}
```

### Phase 4: Patcher Agent

**New files:**
```
packages/course-gen-platform/src/stages/stage6-lesson-content/judge/patcher/
├── index.ts
└── patcher-prompt.ts
```

**Implementation:**

```typescript
// patcher-prompt.ts
export function buildPatcherPrompt(input: PatcherInput): string {
  return `You are a precise content editor. Apply the following surgical fix to the content.

## ORIGINAL CONTENT
${input.originalContent}

## FIX INSTRUCTIONS
${input.instructions}

## CONTEXT (preserve coherence)
Previous section ends: "${input.contextAnchors.prevSectionEnd}"
Next section starts: "${input.contextAnchors.nextSectionStart}"

## TARGET AREA
${input.contextWindow.scope === 'paragraph'
  ? `Focus on the area between: "${input.contextWindow.startQuote}" and "${input.contextWindow.endQuote}"`
  : 'Apply changes throughout the section'}

## OUTPUT
Return ONLY the corrected content. Preserve all other text exactly.`;
}

// index.ts
export async function executePatch(input: PatcherInput): Promise<PatcherOutput> {
  const prompt = buildPatcherPrompt(input);
  // Call LLM (~800 tokens max)
  // Parse response
  // Calculate diff summary
}
```

### Phase 5: Section-Expander Agent

**New files:**
```
packages/course-gen-platform/src/stages/stage6-lesson-content/judge/section-expander/
├── index.ts
└── expander-prompt.ts
```

**Implementation:**

Similar pattern to Patcher but:
- Uses RAG chunks for grounding
- Regenerates entire section (~1500 tokens)
- Includes learning objectives in prompt

### Phase 6: Verifier (Delta Judge + Quality Lock)

**New files:**
```
packages/course-gen-platform/src/stages/stage6-lesson-content/judge/verifier/
├── index.ts
├── delta-judge.ts
└── quality-lock.ts
```

**Implementation:**

```typescript
// delta-judge.ts
export async function verifyPatch(input: DeltaJudgeInput): Promise<DeltaJudgeOutput> {
  // Fast LLM check (~150-250 tokens)
  // Check: was issue addressed? Any new issues?
  // Return pass/fail with reasoning
}

// quality-lock.ts
export function checkQualityLocks(
  locksBeforePatch: Record<string, number>,
  scoresAfterPatch: CriteriaScores,
  tolerance: number
): QualityLockCheckResult {
  // Check each criterion didn't regress > tolerance
}

export function calculateUniversalReadability(text: string): UniversalReadabilityMetrics {
  // Language-agnostic metrics
}
```

### Phase 7: Iteration Controller

**New files:**
```
packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/
├── index.ts
├── iteration-controller.ts
└── best-effort-selector.ts
```

**Implementation:**

```typescript
// iteration-controller.ts
export function shouldContinueIteration(
  input: IterationControllerInput
): IterationControllerOutput {
  // Check: max iterations, token budget, timeout
  // Check: convergence (|Δscore| < 0.02 for 2 iterations)
  // Check: all sections locked
  // Return decision with reason
}

export function updateSectionLocks(
  editCounts: Map<string, number>,
  currentLocked: Set<string>,
  maxEdits: number
): Set<string> {
  // Lock sections with >= maxEdits
}

// best-effort-selector.ts
export function selectBestIteration(
  input: BestEffortSelectorInput
): BestEffortSelectorOutput {
  // Find highest scoring iteration
  // Generate improvementHints from unresolvedIssues
  // Determine quality status
}
```

### Phase 8: Orchestrator Integration

**Modify:**
- `packages/course-gen-platform/src/stages/stage6-lesson-content/orchestrator.ts`
- `packages/course-gen-platform/src/stages/stage6-lesson-content/state.ts`

**Changes to `state.ts`:**

```typescript
// Add to LessonGraphStateType
interface LessonGraphStateType {
  // ... existing fields ...

  // NEW: Targeted refinement state
  refinementState?: RefinementIterationState;
  refinementPlan?: RefinementPlan;
  operationMode: OperationMode;
}
```

**Changes to `orchestrator.ts`:**

```typescript
// In judgeNode, replace existing refinement loop with:
import { executeTargetedRefinement } from './judge/targeted-refinement';

async function judgeNode(state: LessonGraphStateType): Promise<LessonGraphStateUpdate> {
  // ... existing cascade evaluation ...

  if (decision.action === DecisionAction.TARGETED_FIX ||
      decision.action === DecisionAction.ITERATIVE_REFINEMENT) {

    // NEW: Use targeted refinement instead of existing loop
    const refinementResult = await executeTargetedRefinement({
      clevResult: cascadeResult.clevResult!,
      lessonContent: contentBody,
      lessonSpec: state.lessonSpec,
      ragChunks: state.ragChunks,
      operationMode: state.operationMode ?? 'semi-auto',
      onEvent: (event) => {
        // Stream to UI via existing event mechanism
      },
    });

    // ... handle refinementResult ...
  }
}
```

### Phase 9: UI Components

**New files:**
```
packages/web/components/generation-graph/
├── panels/lesson/RefinementPlanPanel.tsx
├── components/IterationProgressChart.tsx
├── components/SectionLockIndicator.tsx
└── components/BestEffortWarning.tsx
```

**Modify:**
- `LessonInspector.tsx` - Add refinement tab
- `JudgeVotingPanel.tsx` - Show refinement tasks

## Testing Strategy

### Unit Tests

```typescript
// tests/unit/judge/arbiter.test.ts
describe('Arbiter', () => {
  describe('calculateAgreementScore', () => {
    it('returns high for unanimous verdicts', async () => {});
    it('returns moderate for 2/3 agreement', async () => {});
    it('returns low for disagreement', async () => {});
  });

  describe('resolveConflicts', () => {
    it('accepts all issues when α >= 0.80', async () => {});
    it('accepts 2+ agreement issues when α >= 0.67', async () => {});
    it('accepts only critical when α < 0.67', async () => {});
  });
});

// tests/unit/judge/router.test.ts
describe('Router', () => {
  it('routes minor issues to Patcher', async () => {});
  it('routes factual errors to Section-Expander', async () => {});
  it('routes structural failures to FULL_REGENERATE', async () => {});
  it('creates non-adjacent batches', async () => {});
});

// tests/unit/judge/patcher.test.ts
describe('Patcher', () => {
  it('applies surgical edit to target area', async () => {});
  it('preserves context coherence', async () => {});
  it('returns diff summary', async () => {});
});

// tests/unit/judge/verifier.test.ts
describe('Verifier', () => {
  describe('DeltaJudge', () => {
    it('passes when issue is addressed', async () => {});
    it('fails when new issues introduced', async () => {});
  });

  describe('QualityLock', () => {
    it('passes when no regression', async () => {});
    it('fails when criterion regresses > tolerance', async () => {});
  });
});
```

### Contract Tests

```typescript
// tests/contract/refinement-types.test.ts
describe('Refinement Type Contracts', () => {
  it('ArbiterInput validates correctly', () => {});
  it('RefinementPlan validates correctly', () => {});
  it('RefinementStreamEvent discriminates correctly', () => {});
});
```

## Configuration

### REFINEMENT_CONFIG (already in judge-types.ts)

```typescript
REFINEMENT_CONFIG = {
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
  limits: {
    maxIterations: 3,
    maxTokens: 15000,
    timeoutMs: 300000,
  },
  quality: {
    regressionTolerance: 0.05,
    sectionLockAfterEdits: 2,
    convergenceThreshold: 0.02,
  },
  parallel: {
    maxConcurrentPatchers: 3,
    adjacentSectionGap: 1,
    sequentialForRegenerations: true,
  },
  // ... more in judge-types.ts
};
```

## Dependencies

```bash
# Add to course-gen-platform
cd packages/course-gen-platform
pnpm add krippendorff
```

## Checklist

- [ ] Phase 1: Types & Config
  - [ ] New types in judge-types.ts
  - [ ] UI types in stage6-ui.types.ts
  - [ ] Phase names in pipeline-admin.ts
  - [ ] Type-check passes

- [ ] Phase 2: Arbiter
  - [ ] krippendorff.ts
  - [ ] conflict-resolver.ts
  - [ ] consolidate-verdicts.ts
  - [ ] Unit tests pass

- [ ] Phase 3: Router
  - [ ] route-task.ts
  - [ ] createExecutionBatches()
  - [ ] Unit tests pass

- [ ] Phase 4: Patcher
  - [ ] patcher-prompt.ts
  - [ ] executePatch()
  - [ ] Unit tests pass

- [ ] Phase 5: Section-Expander
  - [ ] expander-prompt.ts
  - [ ] executeExpansion()
  - [ ] Unit tests pass

- [ ] Phase 6: Verifier
  - [ ] delta-judge.ts
  - [ ] quality-lock.ts
  - [ ] Unit tests pass

- [ ] Phase 7: Iteration Controller
  - [ ] iteration-controller.ts
  - [ ] best-effort-selector.ts
  - [ ] Unit tests pass

- [ ] Phase 8: Orchestrator Integration
  - [ ] state.ts updates
  - [ ] orchestrator.ts integration
  - [ ] Integration tests pass

- [ ] Phase 9: UI Components
  - [ ] RefinementPlanPanel.tsx
  - [ ] IterationProgressChart.tsx
  - [ ] SectionLockIndicator.tsx
  - [ ] BestEffortWarning.tsx
  - [ ] LessonInspector.tsx updates

- [ ] Final
  - [ ] All tests pass
  - [ ] Type-check passes
  - [ ] Build passes
  - [ ] Contract tests pass
