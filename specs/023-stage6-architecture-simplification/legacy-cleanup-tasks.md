# Stage 6 Legacy Cleanup Tasks

## Status: COMPLETED

**Date**: 2025-12-25

After refactoring Stage 6 from 6-node pipeline to 3-node pipeline (Generator → SelfReviewer → Judge), need to clean up all legacy references.

**Old Pipeline (DELETED)**: planner → expander → assembler → smoother → selfReviewer → judge
**New Pipeline**: generator → selfReviewer → judge

---

## Phase 1: Critical Fixes (Will Break Runtime)

### Task 1.1: Delete broken integration test ✅
**File**: `packages/course-gen-platform/tests/integration/stage6/nodes.test.ts`
**Issue**: Imports deleted nodes (planner, expander, assembler, smoother)
**Action**: DELETE entire file

### Task 1.2: Fix executor enum in judge-types.ts ✅
**File**: `packages/shared-types/src/judge-types.ts:374`
**Issue**: `executor: z.enum(['patcher', 'section-expander', 'planner'])`
**Action**: Change to `z.enum(['patcher', 'generator'])` - remove 'section-expander' and 'planner'

### Task 1.3: Fix route-task.ts routing logic ✅
**File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/router/route-task.ts:65-94`
**Issue**: Routes to 'planner' and 'section-expander' executors that don't exist
**Action**: Update routing to use 'generator' for full regeneration, 'patcher' for surgical edits

### Task 1.4: Update Stage6NodeName type ✅
**File**: `packages/shared-types/src/stage6-ui.types.ts:32`
**Issue**: Type includes 6 old nodes
**Action**: Change to `'generator' | 'selfReviewer' | 'judge'`

---

## Phase 2: UI Components

### Task 2.1: Update useLessonInspectorData.ts ✅
**File**: `packages/web/components/generation-graph/hooks/useLessonInspectorData.ts`
**Lines**: 44-60, 177, 234, 250
**Issue**: Maps old phase names, calculates expander progress
**Action**: Update mappings to include 'generator', keep old mappings for backward compatibility with existing logs

### Task 2.2: Update useModuleDashboardData.ts ✅
**File**: `packages/web/components/generation-graph/hooks/useModuleDashboardData.ts:107-110`
**Issue**: Initial state has 4 phantom nodes
**Action**: Update to 3-node pipeline (generator, selfReviewer, judge)

### Task 2.3: Update VerticalPipelineStepper.tsx ✅
**File**: `packages/web/components/generation-graph/components/VerticalPipelineStepper.tsx`
**Lines**: 715, 727-733, 920, 1061
**Issue**: Hardcoded old node names and switch cases
**Action**: Update to new pipeline structure

### Task 2.4: Update LiveTerminal.tsx ✅
**File**: `packages/web/components/generation-graph/components/LiveTerminal.tsx:36-39`
**Issue**: Color mappings for deleted nodes
**Action**: Update to generator color, keep old for backward compat with logs

### Task 2.5: Update NodeInputOutput.tsx ✅
**File**: `packages/web/components/generation-graph/components/NodeInputOutput.tsx:36,69-80`
**Issue**: Type and mappings for deleted nodes
**Action**: Add 'generator' type and translations

### Task 2.6: Update MicroStepper components ✅
**File**: `packages/web/components/generation-graph/components/MicroStepper.tsx:23`
**File**: `packages/web/components/generation-graph/components/MicroStepper.example.tsx`
**File**: `packages/web/components/generation-graph/components/MicroStepper.md`
**Issue**: Documentation and examples with old nodes
**Action**: Update docs and examples to new pipeline

### Task 2.7: Update SegmentedPillTrack.tsx ✅
**File**: `packages/web/components/generation-graph/panels/stage6/dashboard/SegmentedPillTrack.tsx:31-34`
**Issue**: Hardcoded old node names
**Action**: Update to new pipeline

### Task 2.8: Update translations.ts ✅
**File**: `packages/web/lib/generation-graph/translations.ts:915-918`
**Issue**: Translations for deleted nodes
**Action**: Add 'generator' translation, keep old for backward compat

---

## Phase 3: Cleanup Dead Code

### Task 3.1: Delete prompt-templates.ts dead code ✅
**File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/utils/prompt-templates.ts`
**Issue**: Dead functions for deleted nodes
**Action**: DELETE file or remove dead functions

### Task 3.2: Clean up prompt-registry.ts ✅
**File**: `packages/course-gen-platform/src/shared/prompts/prompt-registry.ts`
**Issue**: Hardcoded prompts for stage6_planner, stage6_expander, stage6_assembler, stage6_smoother
**Action**: Remove or mark as deprecated

---

## Verification

### Task 4.1: Run type-check ✅
```
pnpm run type-check → PASS (all packages)
```

### Task 4.2: Run all tests ✅
```
vitest run tests/stages/stage6-lesson-content/ → 152 tests passed
```

### Task 4.3: Dynamic token calculation ✅
Verified in generator.ts:
- DEPTH_TOKEN_LIMITS: summary=1500, detailed_analysis=3000, comprehensive=6000
- DEPTH_SCALE_FACTORS: summary=0.25, detailed_analysis=0.5, comprehensive=1.0
- calculateMaxTokensForSection() uses language multiplier and lesson duration

---

## Notes

- Keep backward compatibility for log parsing (old traces in DB have old phase names)
- UI should handle both old logs (planner, etc.) and new logs (generator)
- Stage6NodeName type is source of truth for UI
