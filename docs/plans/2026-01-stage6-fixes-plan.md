# Stage 6 Quality Improvements: Implementation Plan

> **Created:** 2026-01-08
> **Status:** Ready for Implementation
> **Context:** This plan was created after analyzing lesson generation logs and consulting DeepThink for architectural decisions.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Issue 1: DOMPurify Fix (P0)](#issue-1-dompurify-fix-p0)
3. [Issue 2: Card Warning Downgrade (P2)](#issue-2-card-warning-downgrade-p2)
4. [Issue 3: InlineFixer Feature (P1)](#issue-3-inlinefixer-feature-p1)
5. [Issue 4: sec_global Strategy (P1)](#issue-4-sec_global-strategy-p1)
6. [Implementation Order](#implementation-order)
7. [Validation Checklist](#validation-checklist)

---

## Executive Summary

### Problems Identified

| # | Issue | Impact | Solution |
|---|-------|--------|----------|
| 1 | DOMPurify.addHook not a function | Mermaid diagrams broken | One-line fix |
| 2 | Card enrichment legacy warning | Log noise | Downgrade warn→debug |
| 3 | Every minor fix costs ~1500 tokens | Token waste | InlineFixer (0 tokens) |
| 4 | sec_global patches discarded | ~4000 tokens wasted | Smart routing + tracking |

### Expected Outcomes

- **Mermaid diagrams:** Working (not fallback comments)
- **Token savings:** ~40-50% reduction in Patcher costs
- **Observability:** sec_global issues tracked, not lost
- **Clean logs:** No spurious warnings

---

## Issue 1: DOMPurify Fix (P0)

### Problem
Mermaid diagrams fail to render in Node.js. Error in logs:
```
error: "DOMPurify.addHook is not a function"
Mermaid pipeline: All fixes failed, using fallback
```

### Root Cause
`createDOMPurify(window)` creates an instance, but Mermaid 11 expects methods on the module itself.

### Solution

**File:** `packages/course-gen-platform/src/stages/stage6-lesson-content/utils/mermaid-dom-setup.ts`

**Current code (around line 79-83):**
```typescript
const DOMPurify = createDOMPurify(dom.window);
global.window.DOMPurify = DOMPurify;
global.DOMPurify = DOMPurify;
```

**Fixed code:**
```typescript
const DOMPurify = createDOMPurify(dom.window);
// CRITICAL: Copy instance methods to module for Mermaid 11 compatibility
// Mermaid calls DOMPurify.addHook() on the imported module, not the instance
Object.assign(createDOMPurify, DOMPurify);
global.window.DOMPurify = DOMPurify;
global.DOMPurify = DOMPurify;
```

### Validation
1. Run: `pnpm --filter course-gen-platform test` (mermaid tests)
2. Generate test lesson with mermaid diagram
3. Verify NO "DOMPurify.addHook" errors in logs
4. Verify diagram renders (not `<!-- Mermaid diagram removed -->`)

---

## Issue 2: Card Warning Downgrade (P2)

### Problem
Spurious warning in logs:
```
WARN: Card enrichment detected as course card via fallback (legacy detection)
```

### Root Cause
Warning fires when `lesson.content` is empty at card generation time — this is normal behavior.

### Solution

**File:** `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/card-handler.ts`

**Current code (lines 252-257):**
```typescript
if (!isCourseCard && (!lesson.content || lesson.id === 'course-level')) {
  logger.warn(
    { enrichmentId: enrichment.id, lessonId: lesson.id, hasContent: !!lesson.content },
    'Card enrichment detected as course card via fallback (legacy detection)'
  );
}
```

**Fixed code:**
```typescript
if (!isCourseCard && (!lesson.content || lesson.id === 'course-level')) {
  logger.debug(  // Changed from warn to debug
    { enrichmentId: enrichment.id, lessonId: lesson.id, hasContent: !!lesson.content },
    'Card enrichment for lesson without content - using lesson card prompt'
  );
}
```

### Validation
1. Generate lesson with card enrichment
2. Verify NO WARN level log about legacy detection
3. Verify card generates correctly

---

## Issue 3: InlineFixer Feature (P1)

### Concept
Instead of calling Patcher LLM (~1500 tokens) for every minor fix, have Judge return ready-to-apply replacements and apply them with `str.replace()` (0 tokens).

### Architecture

```
Judge → Arbiter → [InlineFixer] → Router → Patcher/Expander
                       ↓
              Try str.replace()
                       ↓
              Success? → Mark RESOLVED
              Failure? → Keep OPEN for Router
```

### Schema Changes

**File:** `packages/shared-types/src/judge-types.ts`

Add `inlineReplacement` field to `JudgeIssueSchema`:

```typescript
export const JudgeIssueSchema = z.object({
  criterion: JudgeCriterionSchema,
  severity: IssueSeveritySchema,
  location: z.string().min(1).describe('Location reference in the content'),
  description: z.string().min(10).describe('Clear description of the problem'),
  quotedText: z.string().optional().describe('Exact text that has the issue'),
  suggestedFix: z.string().min(10).describe('Concrete fix suggestion'),
  // NEW: Ready-to-apply replacement for inline fixing
  inlineReplacement: z.string().optional().describe('Exact replacement text for quotedText'),
});
```

### InlineFixer Component

**New file:** `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/inline-fixer/index.ts`

```typescript
/**
 * InlineFixer - Zero-token surgical fixes
 *
 * Attempts to apply Judge's inlineReplacement directly via string replacement.
 * Falls back to Patcher/Expander if replacement fails.
 *
 * Algorithm: Cascade Search
 * 1. Exact match
 * 2. Flexible regex (normalized whitespace)
 * 3. Fallback to LLM
 */

import type { JudgeIssue, TargetedIssue } from '@megacampus/shared-types';
import { logger } from '@/shared/logger';

export interface InlineFixResult {
  success: boolean;
  content: string;
  appliedFixes: string[];
  failedFixes: TargetedIssue[];
}

// Whitelist: criteria suitable for inline fix
const INLINE_FIX_CRITERIA = new Set([
  'factual_accuracy',      // dates, names, numbers
  'clarity_readability',   // typos, terminology
]);

// Blacklist: criteria that need LLM creativity
const INLINE_FIX_BLACKLIST = new Set([
  'pedagogical_structure', // requires restructuring
  'engagement_examples',   // requires creative generation
  'completeness',          // requires adding new content
]);

/**
 * Check if issue is eligible for inline fix
 */
export function isEligibleForInlineFix(issue: JudgeIssue): boolean {
  // Must have both quotedText and inlineReplacement
  if (!issue.quotedText || !issue.inlineReplacement) {
    return false;
  }

  // Must be in whitelist (not blacklist)
  if (INLINE_FIX_BLACKLIST.has(issue.criterion)) {
    return false;
  }

  // Length heuristic: if replacement is >50% different, probably needs LLM
  const lengthRatio = issue.inlineReplacement.length / issue.quotedText.length;
  if (lengthRatio < 0.5 || lengthRatio > 2.0) {
    return false;
  }

  // Size limit: very large replacements should go to LLM
  if (issue.inlineReplacement.length > 300) {
    return false;
  }

  return true;
}

/**
 * Try to find text using cascade search
 * Returns: { found: boolean, index: number, matchedText: string }
 */
function cascadeSearch(
  content: string,
  searchText: string
): { found: boolean; index: number; matchedText: string } {
  // 1. Exact match
  const exactIndex = content.indexOf(searchText);
  if (exactIndex !== -1) {
    return { found: true, index: exactIndex, matchedText: searchText };
  }

  // 2. Flexible regex: normalize whitespace
  const escapedText = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const flexiblePattern = escapedText.replace(/\s+/g, '\\s+');
  const regex = new RegExp(flexiblePattern);
  const match = content.match(regex);

  if (match && match.index !== undefined) {
    return { found: true, index: match.index, matchedText: match[0] };
  }

  // 3. Not found
  return { found: false, index: -1, matchedText: '' };
}

/**
 * Apply inline fix to section content
 */
export function applyInlineFix(
  sectionContent: string,
  issue: TargetedIssue
): { success: boolean; content: string; reason?: string } {
  if (!issue.quotedText || !issue.inlineReplacement) {
    return { success: false, content: sectionContent, reason: 'missing_replacement' };
  }

  // Cascade search
  const search = cascadeSearch(sectionContent, issue.quotedText);

  if (!search.found) {
    logger.debug(
      { issueId: issue.id, quotedText: issue.quotedText.slice(0, 50) },
      'InlineFixer: text not found, falling back to Patcher'
    );
    return { success: false, content: sectionContent, reason: 'text_not_found' };
  }

  // Check uniqueness: must be exactly 1 occurrence
  const occurrences = sectionContent.split(search.matchedText).length - 1;
  if (occurrences > 1) {
    logger.debug(
      { issueId: issue.id, occurrences },
      'InlineFixer: multiple occurrences found, falling back to Patcher'
    );
    return { success: false, content: sectionContent, reason: 'multiple_occurrences' };
  }

  // Apply replacement
  const newContent = sectionContent.replace(search.matchedText, issue.inlineReplacement);

  // Validate: basic markdown integrity check
  if (!validateMarkdownIntegrity(newContent)) {
    logger.warn(
      { issueId: issue.id },
      'InlineFixer: replacement broke markdown, rolling back'
    );
    return { success: false, content: sectionContent, reason: 'markdown_broken' };
  }

  logger.info(
    {
      issueId: issue.id,
      criterion: issue.criterion,
      originalLength: issue.quotedText.length,
      replacementLength: issue.inlineReplacement.length,
    },
    'InlineFixer: successfully applied inline fix'
  );

  return { success: true, content: newContent };
}

/**
 * Basic markdown integrity validation
 */
function validateMarkdownIntegrity(content: string): boolean {
  // Check balanced markers
  const markers = ['**', '`', '_'];
  for (const marker of markers) {
    const count = (content.match(new RegExp(escapeRegex(marker), 'g')) || []).length;
    if (count % 2 !== 0) {
      return false;
    }
  }

  // Check code blocks are balanced
  const codeBlockCount = (content.match(/```/g) || []).length;
  if (codeBlockCount % 2 !== 0) {
    return false;
  }

  return true;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Process all issues for a section, applying inline fixes where possible
 */
export function processInlineFixes(
  sectionContent: string,
  issues: TargetedIssue[]
): InlineFixResult {
  let content = sectionContent;
  const appliedFixes: string[] = [];
  const failedFixes: TargetedIssue[] = [];

  for (const issue of issues) {
    if (!isEligibleForInlineFix(issue)) {
      failedFixes.push(issue);
      continue;
    }

    const result = applyInlineFix(content, issue);

    if (result.success) {
      content = result.content;
      appliedFixes.push(issue.id);
    } else {
      failedFixes.push(issue);
    }
  }

  return {
    success: failedFixes.length === 0,
    content,
    appliedFixes,
    failedFixes,
  };
}
```

### Judge Prompt Update

**File:** Judge prompt template (find in `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/`)

Add instruction:

```
## INLINE FIX INSTRUCTIONS

For LOCAL issues (typos, incorrect facts, unclear wording) that can be fixed by simple text replacement:

1. Set `quotedText` to the EXACT text from the content (5-15 words, unique enough to locate)
2. Set `inlineReplacement` to the corrected text

Example:
{
  "criterion": "clarity_readability",
  "severity": "minor",
  "location": "sec_2",
  "description": "Jargon may confuse beginners",
  "quotedText": "синергетический эффект коллаборации",
  "suggestedFix": "Replace jargon with simpler terms",
  "inlineReplacement": "эффект совместной работы"
}

DO NOT provide inlineReplacement for:
- Structural changes (moving paragraphs)
- Adding new examples or content
- Changes requiring creativity
- Issues spanning multiple locations
```

### Integration Point

**File:** `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/targeted-refinement-loop.ts`

Add InlineFixer step before Router:

```typescript
import { processInlineFixes, isEligibleForInlineFix } from '../inline-fixer';

// In the refinement loop, before routing to Patcher:
async function processSection(sectionId: string, issues: TargetedIssue[]) {
  const sectionContent = extractSectionContent(content, sectionId);

  // Step 1: Try InlineFixer first (0 tokens)
  const inlineResult = processInlineFixes(sectionContent, issues);

  if (inlineResult.appliedFixes.length > 0) {
    // Apply successful inline fixes to content
    content = applySectionContent(content, sectionId, inlineResult.content);

    // Track metrics
    metrics.inlineFixesApplied += inlineResult.appliedFixes.length;
  }

  // Step 2: Route remaining issues to Patcher/Expander
  if (inlineResult.failedFixes.length > 0) {
    await routeToLLM(sectionId, inlineResult.failedFixes);
  }
}
```

### Metrics & Feature Flag

Add to metrics tracking:

```typescript
interface RefinementMetrics {
  // ... existing fields ...
  inlineFixesAttempted: number;
  inlineFixesSucceeded: number;
  inlineFixesFailed: number;
  tokensSavedByInlineFix: number;  // Estimate: succeeded * 1500
}
```

Feature flag (optional, for gradual rollout):

```typescript
const FEATURE_FLAGS = {
  INLINE_FIXER_ENABLED: process.env.FEATURE_INLINE_FIXER !== 'false',
};
```

---

## Issue 4: sec_global Strategy (P1)

### Problem
Global issues (location="sec_global") waste ~4000 tokens:
1. Section-Expander generates content (~2000 tokens)
2. Delta-Judge approves (~2000 tokens)
3. Patch is discarded — nowhere to apply it

### Strategy: Smart Routing + Tracking

**Principle:** Don't lose information, but don't waste tokens either.

### Implementation

**File:** `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/content-utils.ts`

**Current behavior (lines 212-216):**
```typescript
if (sectionIdLower === 'sec_global') {
  logger.warn({ sectionId },
    'Cannot apply patch to sec_global - global issues require different handling');
  return content;
}
```

**New approach in Router/Arbiter:**

```typescript
/**
 * Handle sec_global issues based on severity
 */
async function handleGlobalIssue(
  issue: TargetedIssue,
  lessonId: string,
  content: LessonContent
): Promise<{ action: 'SKIP' | 'EXPAND_KEY_SECTIONS'; tokensUsed: number }> {

  // Track ALL global issues for observability
  await trackImprovementSuggestion(lessonId, issue);

  if (issue.severity === 'minor') {
    // Minor global issues: track but don't spend tokens
    logger.info(
      { issueId: issue.id, criterion: issue.criterion, severity: issue.severity },
      'Global minor issue tracked as improvement suggestion (no token spend)'
    );
    return { action: 'SKIP', tokensUsed: 0 };
  }

  if (issue.severity === 'major' || issue.severity === 'critical') {
    // Major/Critical: expand introduction and conclusion (most impactful)
    logger.info(
      { issueId: issue.id, criterion: issue.criterion, severity: issue.severity },
      'Global major/critical issue: expanding key sections'
    );

    // Create targeted tasks for intro + conclusion
    const keyTasks = [
      { ...issue, targetSectionId: 'sec_introduction' },
      { ...issue, targetSectionId: 'sec_conclusion' },
    ];

    // Route to Section-Expander
    let tokensUsed = 0;
    for (const task of keyTasks) {
      const result = await executeExpansion(buildExpanderInput(task, content));
      tokensUsed += result.tokensUsed;
    }

    return { action: 'EXPAND_KEY_SECTIONS', tokensUsed };
  }

  return { action: 'SKIP', tokensUsed: 0 };
}

/**
 * Save improvement suggestion to database for analytics
 */
async function trackImprovementSuggestion(
  lessonId: string,
  issue: TargetedIssue
): Promise<void> {
  const supabase = getSupabaseAdmin();

  await supabase.from('lesson_improvement_suggestions').insert({
    lesson_id: lessonId,
    criterion: issue.criterion,
    severity: issue.severity,
    description: issue.description,
    suggested_fix: issue.suggestedFix,
    status: 'pending',  // Can be reviewed later
    created_at: new Date().toISOString(),
  });
}
```

### Database Schema (if tracking table doesn't exist)

```sql
-- Migration: add lesson_improvement_suggestions table
CREATE TABLE IF NOT EXISTS lesson_improvement_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  criterion TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'major', 'minor')),
  description TEXT NOT NULL,
  suggested_fix TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_improvement_suggestions_lesson ON lesson_improvement_suggestions(lesson_id);
CREATE INDEX idx_improvement_suggestions_status ON lesson_improvement_suggestions(status);
```

### Judge Prompt Update (Preventive)

Add instruction to Judge prompt to minimize sec_global usage:

```
## LOCATION SPECIFICITY

AVOID using "sec_global" when possible. Instead:
- If the issue appears in specific sections, list them (e.g., "sec_1, sec_3")
- If engagement is lacking, identify WHERE examples should be added
- Only use "sec_global" for truly document-wide issues (e.g., "inconsistent tone throughout")

Good: "sec_2" - "Missing example for concept X"
Bad: "sec_global" - "Not enough examples" (where should they go?)
```

---

## Implementation Order

```
Phase 1: Critical Fixes (Day 1)
├── [P0] DOMPurify fix (30 min)
│   └── Unblocks: Mermaid diagrams
└── [P2] Card warning downgrade (10 min)
    └── Unblocks: Clean logs

Phase 2: InlineFixer (Day 1-2)
├── Schema: Add inlineReplacement to JudgeIssue (15 min)
├── Component: Create InlineFixer module (1 hour)
├── Integration: Add to refinement loop (30 min)
├── Prompt: Update Judge instructions (30 min)
└── Tests: Unit tests for InlineFixer (45 min)

Phase 3: sec_global Strategy (Day 2)
├── Router: Implement handleGlobalIssue (45 min)
├── Database: Add improvement_suggestions table (15 min)
├── Prompt: Update Judge for location specificity (15 min)
└── Tests: Integration tests (30 min)

Phase 4: Validation (Day 2)
├── Generate test lesson with various issues
├── Verify metrics: token savings, success rate
└── Check logs: no errors, proper tracking
```

---

## Validation Checklist

### DOMPurify Fix
- [ ] No "DOMPurify.addHook is not a function" in logs
- [ ] Mermaid diagrams render (not HTML comments)
- [ ] Existing tests pass

### Card Warning
- [ ] No WARN about "legacy detection" in logs
- [ ] Card generation works correctly

### InlineFixer
- [ ] Schema updated with `inlineReplacement`
- [ ] Judge returns inline replacements for minor issues
- [ ] InlineFixer applies fixes (check logs)
- [ ] Fallback to Patcher works when replace fails
- [ ] Metrics show token savings
- [ ] Markdown integrity validated

### sec_global Strategy
- [ ] Minor global issues tracked (not processed)
- [ ] Major/critical expand intro+conclusion
- [ ] No "Cannot apply patch to sec_global" warnings
- [ ] improvement_suggestions table populated
- [ ] Token usage reduced vs baseline

---

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `packages/course-gen-platform/src/stages/stage6-lesson-content/utils/mermaid-dom-setup.ts` | MODIFY | Add Object.assign for DOMPurify |
| `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/card-handler.ts` | MODIFY | warn → debug |
| `packages/shared-types/src/judge-types.ts` | MODIFY | Add `inlineReplacement` field |
| `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/inline-fixer/index.ts` | CREATE | New InlineFixer component |
| `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/targeted-refinement-loop.ts` | MODIFY | Integrate InlineFixer |
| Judge prompt template | MODIFY | Add inline fix + location instructions |
| `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/router/index.ts` | MODIFY | Add sec_global handling |
| `packages/course-gen-platform/supabase/migrations/` | CREATE | improvement_suggestions table |

---

## Appendix: Key Code Locations

### Targeted Refinement System
- Entry: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/`
- Arbiter: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/arbiter/`
- Router: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/router/`
- Patcher: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/patcher/`
- Section-Expander: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/section-expander/`

### Judge System
- Types: `packages/shared-types/src/judge-types.ts`
- CLEV Voter: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/clev-voter.ts`
- Decision Engine: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/decision-engine.ts`

### Mermaid
- DOM Setup: `packages/course-gen-platform/src/stages/stage6-lesson-content/utils/mermaid-dom-setup.ts`
- Validator: `packages/course-gen-platform/src/stages/stage6-lesson-content/utils/mermaid-validator.ts`
- Fix Pipeline: `packages/course-gen-platform/src/stages/stage6-lesson-content/utils/mermaid-fix-pipeline.ts`

### Card Handler
- Handler: `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/card-handler.ts`
- Auto Trigger: `packages/course-gen-platform/src/stages/stage7-enrichments/services/auto-card-trigger.ts`
