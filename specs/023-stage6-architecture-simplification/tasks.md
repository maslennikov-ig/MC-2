# Stage 6 Architecture Simplification - Tasks

## Status: COMPLETED

**Completion Date**: 2025-12-25

Refactor Stage 6 from Map-Reduce (6+ LLM calls) to Serial Generation Loop (N sections × 1 call each).

**Before**: `Planner → Expander (parallel) → Assembler → Smoother → SelfReviewer → Judge`
**After**: `Generator (serial loop) → SelfReviewer → Judge`

---

## Completed Tasks

### Phase 1: Create Serial Generator

#### Task 1.1: Create generator.ts node ✅
→ Artifacts: [generator.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/generator.ts)

#### Task 1.2: Create stage6_serial_generator prompt ✅
→ Artifacts: [prompt-registry.ts](packages/course-gen-platform/src/shared/prompts/prompt-registry.ts) (line 667)

### Phase 2: Simplify State

#### Task 2.1: Update state.ts ✅
→ Artifacts: [state.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/state.ts)

#### Task 2.2: Update LessonGraphNode type ✅
→ Artifacts: [state.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/state.ts) (line 30)

### Phase 3: Update Orchestrator

#### Task 3.1: Update orchestrator.ts graph topology ✅
→ Artifacts: [orchestrator.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/orchestrator.ts)

#### Task 3.2: Update nodes/index.ts exports ✅
→ Artifacts: [index.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/index.ts)

### Phase 4: Cleanup Deprecated Code

#### Task 4.1: Remove deprecated node files ✅
→ **Removed files**:
  - `nodes/planner.ts`
  - `nodes/expander.ts`
  - `nodes/assembler.ts`
  - `nodes/smoother.ts`

#### Task 4.2: Update self-reviewer to use generatedContent ✅
→ Artifacts: [self-reviewer-node.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/self-reviewer-node.ts)

### Phase 5: Update Tests

#### Task 5.1: Update orchestrator tests ✅
→ Artifacts: [orchestrator-self-reviewer.test.ts](packages/course-gen-platform/tests/stages/stage6-lesson-content/orchestrator-self-reviewer.test.ts)

#### Task 5.2: Update self-reviewer node tests ✅
→ Artifacts: [self-reviewer-node.test.ts](packages/course-gen-platform/tests/stages/stage6-lesson-content/nodes/self-reviewer-node.test.ts)

### Phase 6: Integration Verification

#### Task 6.1: Run type-check ✅
```
pnpm run type-check → PASS (all packages)
```

#### Task 6.2: Run tests ✅
```
vitest run tests/stages/stage6-lesson-content/ → 120 tests passed
```

### Phase 7: Code Review Fixes (Production Hardening)

Code review report: `.tmp/current/code-review-stage6-simplification.md`

#### Task 7.1: Fix extractContextWindow edge cases ✅
- Added explicit empty string check for first section
- Implemented smart truncation at paragraph boundaries
→ Artifacts: [generator.ts:157-182](packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/generator.ts)

#### Task 7.2: Add depth validation with error throwing ✅
- Log warning when depth constraint missing (uses default)
- Throw error for invalid depth values
→ Artifacts: [generator.ts:413-432](packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/generator.ts)

#### Task 7.3: Add content size validation ✅
- Warning when accumulated content > 100K chars
→ Artifacts: [generator.ts:555-565](packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/generator.ts)

#### Task 7.4: Add token metadata warning ✅
- Changed extractTokenUsage to return { tokens, hasMeta }
- Warnings logged when metadata missing in all 3 call sites
→ Artifacts: [generator.ts:106-137](packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/generator.ts)

#### Task 7.5: Add empty RAG chunks warning ✅
- Warning when section has no RAG chunks for context
→ Artifacts: [generator.ts:453-460](packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/generator.ts)

#### Task 7.6: Handle empty previousContext in prompt ✅
- First section gets XML comment instead of empty tag
→ Artifacts: [generator.ts:479-483](packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/generator.ts)

#### Task 7.7: Add JSDoc to helper functions ✅
- formatKeyPointsList, extractTokenUsage, extractContextWindow, calculateMaxTokensForSection
- Documented magic number 1.5 (formatting/examples overhead)
→ Artifacts: [generator.ts:89-237](packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/generator.ts)

#### Task 7.8: Remove deprecated state fields ✅
- Removed commented deprecated fields (outline, expandedSections, assembledContent, smoothedContent)
- Removed deprecated ExpandedSection interface
→ Artifacts: [state.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/state.ts)

#### Task 7.9: Create generator unit tests ✅
- Created generator.test.ts with 32 unit tests
- Covers extractContextWindow, formatKeyPointsList, calculateMaxTokensForSection, depth validation
→ Artifacts: [generator.test.ts](packages/course-gen-platform/tests/stages/stage6-lesson-content/nodes/generator.test.ts)

#### Task 7.10: Final verification ✅
```
pnpm run type-check → PASS (all packages)
vitest run tests/stages/stage6-lesson-content/ → 152 tests passed
```

---

## Architecture Summary

### New Pipeline Flow

```
START → generator → selfReviewer → (conditional) → judge → END
                         ↓
                    generator (retry on REGENERATE)
```

### Generator Node Logic

```typescript
async function generatorNode(state) {
  // 1. Generate Introduction (using intro_blueprint)
  const intro = await generateIntroduction(lessonSpec, language, model);

  // 2. Loop through sections sequentially with context window
  for (const section of lessonSpec.sections) {
    const context = extractContextWindow(accumulatedContent, 5000);
    const sectionContent = await generateSection(section, context, ...);
    accumulatedContent += sectionContent;
  }

  // 3. Generate Summary
  const summary = await generateSummary(lessonSpec, sectionTitles, language, model);

  // 4. Return full markdown
  return {
    generatedContent: fullMarkdown,
    tokensUsed: totalTokens,
    currentNode: 'selfReviewer',
  };
}
```

### Key Design Decisions

1. **Context Window (5000 chars)**: Each section sees previous content for natural transitions
2. **Dynamic Token Limits**: Reused from expander.ts (`DEPTH_TOKEN_LIMITS`, `DEPTH_SCALE_FACTORS`)
3. **Serial Loop**: Eliminates need for Smoother node - transitions are inherent
4. **Backward Compatible State**: Deprecated fields commented out (not deleted) for rollback

### Files Changed

| File | Change Type |
|------|-------------|
| `nodes/generator.ts` | Created (~651 lines) |
| `nodes/index.ts` | Updated exports |
| `nodes/planner.ts` | Deleted |
| `nodes/expander.ts` | Deleted |
| `nodes/assembler.ts` | Deleted |
| `nodes/smoother.ts` | Deleted |
| `nodes/self-reviewer-node.ts` | Updated (generatedContent) |
| `state.ts` | Updated (new fields, deprecated old) |
| `orchestrator.ts` | Updated (new graph topology) |
| `prompt-registry.ts` | Added stage6_serial_generator prompt |
| Test files | Updated for new state fields |

### Success Metrics

- ✅ Type-check passes
- ✅ All 152 tests pass (120 original + 32 new generator tests)
- ✅ No truncation issues (context window strategy with smart paragraph truncation)
- ✅ Natural transitions (no separate Smoother needed)
- ✅ Reduced LLM calls: 6+ → N+2 (intro + N sections + summary)
- ✅ Production-grade validation (depth, content size, token metadata, RAG chunks)
- ✅ Comprehensive JSDoc documentation
