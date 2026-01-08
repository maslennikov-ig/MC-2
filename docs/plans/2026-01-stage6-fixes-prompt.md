# Implementation Prompt for Stage 6 Quality Improvements

Copy everything below this line and paste into new Claude Code session:

---

## Task

Implement Stage 6 quality improvements according to the implementation plan at `docs/plans/2026-01-stage6-fixes-plan.md`.

## Context

We analyzed lesson generation logs and identified 4 issues to fix:

1. **DOMPurify.addHook error (P0)** - Mermaid diagrams fail to render
2. **Card warning noise (P2)** - Spurious "legacy detection" warnings
3. **InlineFixer feature (P1)** - Zero-token surgical fixes for minor issues
4. **sec_global strategy (P1)** - Smart routing for global issues with tracking

## Instructions

1. **Read the implementation plan first:**
   ```
   Read docs/plans/2026-01-stage6-fixes-plan.md
   ```

2. **Follow the implementation order:**
   - Phase 1: DOMPurify fix + Card warning (quick wins)
   - Phase 2: InlineFixer component (new feature)
   - Phase 3: sec_global strategy (routing + database)
   - Phase 4: Validation

3. **For each change:**
   - Read the existing code first
   - Apply the fix as specified in the plan
   - Run type-check after modifications
   - Commit each phase separately

4. **Key files to modify:**
   - `packages/course-gen-platform/src/stages/stage6-lesson-content/utils/mermaid-dom-setup.ts` (DOMPurify)
   - `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/card-handler.ts` (warn→debug)
   - `packages/shared-types/src/judge-types.ts` (add inlineReplacement field)
   - Create: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/inline-fixer/index.ts`
   - Create migration for `lesson_improvement_suggestions` table

5. **Validation:**
   - Run `pnpm typecheck` after each phase
   - No new TypeScript errors
   - Check the validation checklist in the plan

## Architecture Notes

- **InlineFixer** sits between Arbiter and Router in the refinement pipeline
- Uses **Cascade Search**: Exact match → Flexible regex → Fallback to LLM
- **Whitelist criteria** for inline fix: `factual_accuracy`, `clarity_readability`
- **Blacklist criteria** (need LLM): `pedagogical_structure`, `engagement_examples`, `completeness`
- **sec_global handling**: minor→track only, major/critical→expand intro+conclusion

## Expected Outcomes

- Mermaid diagrams render properly (no fallback comments)
- Clean logs (no spurious warnings)
- ~40-50% reduction in Patcher token costs
- All global issues tracked in database (observability)

Start by reading the implementation plan, then proceed with Phase 1.
