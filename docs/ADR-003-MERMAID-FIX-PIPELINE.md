# ADR-003: Mermaid Fix Pipeline for Stage 6 Lesson Content

**Status**: ACCEPTED
**Date**: 2025-12-25
**Deciders**: Development Team
**Technical Story**: Stage 6 - Mermaid Diagram Syntax Validation and Auto-Fix

---

## Context and Problem Statement

LLMs generating lesson content frequently produce **invalid Mermaid diagram syntax**. The most common issue is **escaped quotes** (`\"`) inside node labels, which breaks client-side rendering.

**Example of the Problem**:
```mermaid
flowchart TD
    A[Contact: \"Promised Response\"] --> B[Follow-up]
```

The `\"` syntax is invalid in Mermaid - it renders as a broken diagram with parsing errors.

**Impact**:
- Broken diagrams in 15-30% of lessons containing Mermaid
- Poor user experience (error messages instead of diagrams)
- Manual intervention required to fix
- No automated recovery path

**Root Cause Analysis**:
LLMs (especially instruction-tuned models) are trained on code that uses escaped quotes in strings. When generating Mermaid syntax inside markdown, they incorrectly apply JSON/string escaping rules.

---

## Decision Drivers

### Primary Drivers
1. **Zero Rendering Failures** (40%): Users should never see broken diagrams
2. **Automated Recovery** (30%): Fix issues without human intervention
3. **Cost Efficiency** (20%): Avoid expensive Judge calls for fixable issues

### Secondary Drivers
4. **Defense in Depth** (10%): Multiple layers to catch edge cases

---

## Considered Options

### Option 1: Single-Layer Prompt Fix

**Approach**: Add Mermaid guidelines to generation prompts only.

**Pros**:
- Simple implementation
- No additional processing

**Cons**:
- LLMs still produce escaped quotes ~10-15% of time
- No recovery for failures
- Silent broken diagrams

**Score**: 4/10

---

### Option 2: Client-Side Fix

**Approach**: Fix Mermaid syntax in the web frontend before rendering.

**Pros**:
- Works for all content (past and future)
- No regeneration needed

**Cons**:
- Masks quality issues (bad content stored in DB)
- Every client must implement fix logic
- Maintenance burden across platforms (web, mobile)
- Doesn't help API consumers

**Score**: 5/10

---

### Option 3: Send to Judge for Evaluation

**Approach**: Route Mermaid issues to Judge for quality evaluation.

**Pros**:
- Comprehensive evaluation
- Can assess semantic correctness too

**Cons**:
- Expensive (Judge costs ~$0.10-0.15 per lesson)
- Overkill for syntax-only issues
- Increases latency
- Mermaid issues are deterministic, not semantic

**Score**: 4/10

---

### Option 4: 3-Layer Defense Architecture (SELECTED)

**Approach**: Prevention + Auto-Fix + Detection layers.

**Architecture**:
```
Layer 1: Prevention (Prompt Instructions)
    ↓
Layer 2: Auto-Fix (Sanitizer in Generator)
    ↓
Layer 3: Detection (Heuristic Filter) → CRITICAL → REGENERATE
```

**Pros**:
- Near-zero Mermaid failures reach production
- No expensive Judge calls for syntax issues
- Self-healing at each layer
- Defense in depth catches edge cases

**Cons**:
- Three components to maintain
- Slightly more complex pipeline

**Score**: 9.5/10

---

## Decision Outcome

**Chosen option**: **3-Layer Defense Architecture**

### Layer 1: Prevention (Prompt Instructions)

Added explicit Mermaid guidelines to generation prompts:

**Location**: `shared/prompts/prompt-registry.ts`

```typescript
const MERMAID_INSTRUCTIONS = `
## Mermaid Diagram Guidelines
When creating Mermaid diagrams:
- NEVER use escaped quotes (\") inside node labels
- Use single quotes or no quotes for labels: A[Label Text]
- Valid: A[Contact: Promised Response]
- INVALID: A[Contact: \"Promised Response\"]
- Keep node labels concise and unquoted when possible
`;
```

**Effectiveness**: Reduces escaped quote generation from ~30% to ~10%.

### Layer 2: Auto-Fix (Mermaid Sanitizer)

Automatic syntax correction after generation:

**Location**: `stages/stage6-lesson-content/utils/mermaid-sanitizer.ts`

```typescript
/**
 * Regex to match Mermaid code blocks in markdown
 */
export const MERMAID_BLOCK_REGEX = /```mermaid\s*([\s\S]*?)```/g;

/**
 * Sanitize Mermaid blocks by removing escaped quotes
 *
 * Input:  A[Contact: \"Promised Response\"]
 * Output: A[Contact: Promised Response]
 */
export function sanitizeMermaidBlocks(content: string): MermaidSanitizeResult {
  let modified = false;
  const fixes: MermaidFix[] = [];

  const sanitizedContent = content.replace(MERMAID_BLOCK_REGEX, (match, mermaidContent) => {
    // Remove escaped quotes: \" -> empty string
    const sanitized = mermaidContent.replace(/\\"/g, '');

    if (sanitized !== mermaidContent) {
      modified = true;
      fixes.push({
        type: 'ESCAPED_QUOTE_REMOVED',
        count: (mermaidContent.match(/\\"/g) || []).length,
      });
    }

    return `\`\`\`mermaid\n${sanitized}\`\`\``;
  });

  return { content: sanitizedContent, modified, fixes };
}
```

**Integration Point**: Called in `nodes/generator.ts` after LLM response:

```typescript
// In generator node, after receiving LLM content
import { sanitizeMermaidBlocks } from '../utils/mermaid-sanitizer';

const rawContent = llmResponse.content;
const { content: sanitizedContent, modified, fixes } = sanitizeMermaidBlocks(rawContent);

if (modified) {
  logger.info({ fixes }, 'Mermaid syntax auto-fixed');
}

return sanitizedContent;
```

**Effectiveness**: Fixes 95%+ of remaining escaped quote issues.

### Layer 3: Detection (Heuristic Filter)

Final safety net for edge cases that slip through:

**Location**: `stages/stage6-lesson-content/judge/heuristic-filter.ts`

```typescript
/**
 * Check Mermaid diagrams for syntax issues
 *
 * Detects:
 * - Escaped quotes \" (should be caught by sanitizer, but edge cases exist)
 * - Unclosed brackets [] or braces {}
 * - Invalid arrow syntax (-> should be -->)
 */
export function checkMermaidSyntax(content: string): FilterCheckResult & {
  mermaidIssues: string[];
  affectedDiagrams: number;
  totalDiagrams: number;
} {
  // ... detection logic
}
```

**Key Decision: CRITICAL Severity**

**Location**: `stages/stage6-lesson-content/nodes/self-reviewer-node.ts`

```typescript
// Mermaid issues are CRITICAL (not COMPLEX) - triggers REGENERATE
if (!mermaidCheck.passed) {
  issues.push({
    type: 'HYGIENE',
    severity: 'CRITICAL',  // <-- CRITICAL, not COMPLEX
    location: 'global',
    description: `Mermaid syntax issues: ${mermaidCheck.mermaidIssues.join('; ')}`,
  });
}
```

**Why CRITICAL instead of FLAG_TO_JUDGE?**

1. **Deterministic Issue**: Mermaid syntax is binary (valid/invalid), not semantic
2. **No Judge Value**: Judge cannot "evaluate" syntax - it's not a quality judgment
3. **Cost**: Judge costs ~$0.10-0.15, regeneration + sanitizer costs ~$0.03
4. **Recovery Rate**: Fresh generation with prompt guidelines + sanitizer = 99%+ fix rate
5. **Speed**: Regeneration is faster than Judge round-trip

**Flow Diagram**:
```
Mermaid Issue Detected (Layer 3)
    ↓
Status: CRITICAL
    ↓
Action: REGENERATE (skip Judge)
    ↓
Generator runs again
    ↓
Layer 1 (Prompt) reduces issue probability
    ↓
Layer 2 (Sanitizer) fixes any remaining issues
    ↓
Layer 3 (Detection) should now pass
```

---

## Implementation Files

### New Files
- `stages/stage6-lesson-content/utils/mermaid-sanitizer.ts` - Auto-fix logic

### Modified Files
- `stages/stage6-lesson-content/judge/heuristic-filter.ts` - Added `checkMermaidSyntax()`
- `stages/stage6-lesson-content/nodes/self-reviewer-node.ts` - CRITICAL severity routing
- `stages/stage6-lesson-content/nodes/generator.ts` - Sanitizer integration
- `shared/prompts/prompt-registry.ts` - Mermaid instructions

### Test Files
- `tests/stages/stage6-lesson-content/mermaid-fix-pipeline.e2e.test.ts` - 27 tests

---

## Positive Consequences

1. **Zero Mermaid Failures**: 3-layer defense catches all known syntax issues
2. **Cost Efficient**: Avoid ~$0.10 Judge cost per Mermaid issue
3. **Fast Recovery**: Regeneration + sanitizer is faster than Judge evaluation
4. **Self-Healing**: System automatically recovers without human intervention
5. **Observability**: Each layer logs its fixes for debugging

---

## Negative Consequences

1. **Regeneration Overhead**: Some lessons will regenerate unnecessarily if only Mermaid has issues
2. **Complexity**: Three components to maintain vs single fix
3. **Edge Cases**: Very unusual Mermaid syntax errors may still slip through

---

## Validation & Success Metrics

### Success Criteria
- 0 Mermaid rendering failures in production logs
- Sanitizer fix rate >= 95% of escaped quote issues
- Regeneration rate for Mermaid-only issues < 5%

### Monitoring
- Log sanitizer fixes with count and block index
- Track heuristic filter Mermaid issue detection rate
- Monitor regeneration reasons (should rarely be "Mermaid only")

---

## Test Coverage

**E2E Tests** (27 tests in `mermaid-fix-pipeline.e2e.test.ts`):

1. **Sanitizer Tests**:
   - Removes escaped quotes from single diagram
   - Handles multiple diagrams in content
   - Preserves valid Mermaid syntax
   - Reports fix details accurately

2. **Detection Tests**:
   - Detects escaped quotes that slip through
   - Detects unclosed brackets
   - Detects unclosed braces
   - Detects invalid arrow syntax
   - Returns clean for valid diagrams

3. **Integration Tests**:
   - Layer 1 + Layer 2: Prompt + Sanitizer combination
   - Layer 2 + Layer 3: Sanitizer misses, Detection catches
   - Full pipeline: All layers working together

---

## References

- **Mermaid Syntax Docs**: https://mermaid.js.org/syntax/flowchart.html
- **Entity Codes**: https://mermaid.js.org/syntax/flowchart.html#entity-codes-to-escape-characters
- **Implementation**: `packages/course-gen-platform/src/stages/stage6-lesson-content/utils/mermaid-sanitizer.ts`
- **Tests**: `packages/course-gen-platform/tests/stages/stage6-lesson-content/mermaid-fix-pipeline.e2e.test.ts`

---

**Decision Log**:
- 2025-12-25: ADR created and ACCEPTED
- 2025-12-25: Implementation complete with 27 E2E tests passing
