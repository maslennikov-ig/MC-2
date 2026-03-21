# Plan: Fix Mermaid Diagram Regression — Eliminate Text Fallback Completely

## Context

Since late February 2026, Mermaid diagrams in generated lessons are being replaced with text fallbacks:

```
**Diagram unavailable (auto-remediated)**
The original Mermaid flowchart diagram could not be rendered reliably...
Key flow: D -> E, E -> F...
```

**Scale**: 245 lessons affected (8.9%), **230 in March alone**. Course XAX-6557: **33/54 broken, 0 working** — 100% failure.

**Root cause**: Commit `f802fe1e` (Feb 20) added SVG render validation using JSDOM. JSDOM has limited SVG support → `hasRenderableSvgContent()` rejects valid diagrams that would render perfectly in real browsers. Pipeline cascades to Stage 5C (text fallback), permanently destroying the original diagram.

**User requirement**: Fallback should **NEVER** trigger. Every lesson must have proper renderable Mermaid diagrams or no diagram at all.

## Design Principles

1. **Parse is the truth gate** — if `mermaid.parse()` passes, the diagram IS valid. Real browsers render it correctly. JSDOM is not a reliable SVG renderer.
2. **Never store text fallback** — text descriptions like "Diagram unavailable" provide zero value. Fallback should NEVER trigger.
3. **Model cascade for quality** — if the cheap model can't fix a diagram, escalate to a more powerful model. We have multiple models available.
4. **Frontend is the safety net** — `MermaidDirect.tsx` already has robust error handling with retry logic. Trust it to render parse-valid diagrams.

## Implementation Plan

### Phase 1: Fix validation gate — parse-only (hard), render (advisory)

**File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/utils/mermaid-fix-pipeline.ts`

**Change `validateBlockForPipeline()` (lines 196-229)**:

```typescript
async function validateBlockForPipeline(
  code: string,
  blockIndex: number
): Promise<MermaidPipelineValidation> {
  // Parse validation is the reliable truth gate
  const parseResult = await validateMermaidSyntax(code);

  if (!parseResult.valid) {
    return {
      valid: false,
      errors: parseResult.errors.length > 0 ? parseResult.errors : ['Mermaid parse failed'],
      diagramType: parseResult.diagramType,
      failureStage: 'parse',
    };
  }

  // Parse succeeded = diagram will render in real browsers
  // JSDOM render check is advisory-only (JSDOM has limited SVG support)
  return {
    valid: true,
    errors: [],
    diagramType: parseResult.diagramType,
    failureStage: null,
  };
}
```

**Why**: `mermaid.parse()` uses the same parser as the browser. If it passes, the diagram is syntactically valid. JSDOM's SVG rendering is unreliable and should not gate content.

**Import change**: Replace `validateMermaidBlockRender` with `validateMermaidSyntax` import from `mermaid-validator.ts`.

### Phase 2: Add model cascade to mermaid LLM fixer

**File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/utils/mermaid-llm-fixer.ts`

Current: single model `minimax/minimax-m2.1` (cheap, $0.30/1M input).

**Add 3-tier model cascade**:

```typescript
// Tier 1: cheap model for most fixes (90%+ of cases)
const LLM_MODEL_PRIMARY = 'minimax/minimax-m2.1'; // $0.30/1M
// Tier 2: strong model for complex diagrams
const LLM_MODEL_SECONDARY = 'qwen/qwen3.5-plus-02-15'; // ~$3/1M
// Tier 3: top model, last resort only
const LLM_MODEL_ULTIMATE = 'z-ai/glm-5'; // expensive, only if T1+T2 fail
```

**Modify `fixMermaidWithLLM()`**: Add `modelTier` parameter (`'primary' | 'secondary' | 'ultimate'`). Selects model accordingly.

**In the pipeline** (`mermaid-fix-pipeline.ts`):

```
Stage 3a: LLM fix with primary model (minimax — cheap)
  → if parse still fails:
Stage 3b: LLM fix with secondary model (qwen — strong)
  → if still fails:
Stage 3c: LLM fix with ultimate model (z-ai/glm-5 — expensive, last resort)
  → if still fails: continue to simplify/split
```

Rate limit: adjust `MAX_LLM_FIXES_PER_LESSON` separately per tier (e.g., 5 primary, 3 secondary, 1 ultimate).

### Phase 2b: Replace text fallback with diagram stripping

**File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/utils/mermaid-fix-pipeline.ts`

In Stage 5C (after ALL stages fail including model cascade):

- **Remove** `generateStructuredFallbackText()` call
- **Instead**: strip the broken mermaid block entirely from content
- Log ERROR with original diagram code for debugging

**Why**: A missing diagram is invisible to the user. A "Diagram unavailable" text block looks broken and unprofessional. With parse-only validation + model cascade, stripping should be extremely rare.

### Phase 3: Fix judge render gate

**File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/judge-node-helpers.ts`

Search for `validateMermaidRenderInLessonContentBody` — if used as a hard gate in judge flow, change to parse-only check. The judge should not reject content based on JSDOM render failures.

**File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/judge-remediation-helpers.ts`

Check `remediateMermaidInContentBody()` — ensure it uses the same parse-only validation.

### Phase 4: Repair 245 broken lessons

The original Mermaid code is lost (replaced with text fallback). Must re-generate.

**Step 4a**: Identify affected courses

```sql
SELECT DISTINCT course_id, COUNT(*) as broken_count
FROM lesson_contents
WHERE content::text LIKE '%Diagram unavailable%auto-remediated%'
GROUP BY course_id
ORDER BY broken_count DESC;
```

**Step 4b**: For each affected course, use `partialGenerate` to re-generate lessons with broken diagrams. The updated pipeline (parse-only validation) will produce proper diagrams.

**Step 4c**: Verify re-generated lessons have working mermaid blocks.

### Phase 5: Verify

1. **Unit tests**: `npx vitest run mermaid-fix-pipeline` — may need to update test expectations (no more structured fallback)
2. **Type check**: `pnpm type-check`
3. **Build**: `pnpm build`
4. **Manual test**: Generate a new course and verify all mermaid diagrams render correctly in browser
5. **Database check**: `SELECT COUNT(*) FROM lesson_contents WHERE content::text LIKE '%auto-remediated%'` should be 0 after repair

## Key Files

| File                                 | Change                                   | Priority |
| ------------------------------------ | ---------------------------------------- | -------- |
| `mermaid-fix-pipeline.ts:196-229`    | Parse-only validation gate               | P1       |
| `mermaid-llm-fixer.ts`               | Add model cascade (primary → escalation) | P1       |
| `mermaid-fix-pipeline.ts` (Stage 5C) | Strip diagram instead of text fallback   | P1       |
| `judge-node-helpers.ts`              | Fix judge render gate                    | P1       |
| `judge-remediation-helpers.ts`       | Check remediation flow                   | P2       |
| `mermaid-render-validator.ts`        | Keep for advisory logging (no delete)    | —        |

## Existing utilities to reuse

- `validateMermaidSyntax()` from `mermaid-validator.ts` — parse-only validation, already exists
- `sanitizeMermaidBlocks()` from `mermaid-sanitizer.ts` — regex fixes, keep as-is
- `fixMermaidWithLLM()` from `mermaid-llm-fixer.ts` — LLM repair, add escalation tier
- `createOpenRouterModel()` from `shared/llm/langchain-models.ts` — model factory
- `simplifyMermaidDiagram()` from `mermaid-remediation.ts` — simplification, keep as-is
- `splitMermaidDiagramIntoTwo()` from `mermaid-remediation.ts` — splitting, keep as-is

## Available models for mermaid cascade

| Tier           | Model                     | Cost      | When                            |
| -------------- | ------------------------- | --------- | ------------------------------- |
| T1 (primary)   | `minimax/minimax-m2.1`    | $0.30/1M  | First attempt, handles 90%+     |
| T2 (secondary) | `qwen/qwen3.5-plus-02-15` | ~$3/1M    | Complex diagrams T1 can't fix   |
| T3 (ultimate)  | `z-ai/glm-5`              | expensive | Last resort, only if T1+T2 fail |

## Risks

- Parse-valid diagrams that render poorly in specific browsers → Mitigated by `MermaidDirect.tsx` frontend error handling
- Stripping diagrams = lost visual content → Should be near-zero with parse-only gate + model cascade
- Re-generation cost for 245 lessons → One-time LLM cost, necessary for quality

## Out of Scope

- Improving JSDOM SVG support (upstream library)
- Changing mermaid npm version
- Frontend rendering changes (already robust)
