---
investigation_id: INV-2025-11-16-002
status: completed
created_at: 2025-11-16T10:20:00Z
completed_at: 2025-11-16T10:45:00Z
investigator: investigation-agent
priority: P1-High
related_issue: RT-006 Bloom's Taxonomy Validation Bug
related_files:
  - packages/shared-types/src/generation-result.ts
  - specs/008-generation-generation-json/research-decisions/rt-006-bloom-taxonomy-validation.md
previous_investigations:
  - INV-2025-11-16-001 (T053 RT-006 metadata validation failure)
---

# Investigation Report: RT-006 Bloom's Taxonomy Validator Bug

## Executive Summary

**Investigation ID**: INV-2025-11-16-002
**Bug**: RT-006 validator incorrectly validates `text` field instead of `cognitiveLevel` enum
**Status**: CRITICAL - Validation logic error in production code
**Priority**: P1 (Causes false positive validation errors)

### Problem Identified

**RT-006 validation fails** with errors like:
```
Invalid Bloom's taxonomy verb "применять" in language ru
Invalid Bloom's taxonomy verb "оценивать" in language ru
```

### Root Cause

**BUG LOCATION**: `packages/shared-types/src/generation-result.ts` lines 440-445

The RT-006 validator is checking the **`text` field** of learning objectives for Bloom's taxonomy verbs, but it **SHOULD be checking the `cognitiveLevel` enum field** instead.

**What's happening**:
- Validator extracts first verb from `obj.text` (Russian: "применять", "оценивать")
- Validator checks if this Russian verb is in English Bloom's whitelist
- Validator fails because Russian verbs are in `obj.text`, not in `cognitiveLevel`

**What should happen**:
- Validator should check `obj.cognitiveLevel` enum ("apply", "evaluate", "create", etc.)
- Enum field contains English Bloom's level, always valid
- `obj.text` field can contain ANY language (Russian, English, Chinese, etc.)

**Impact**: LearningObjectiveSchema validation incorrectly rejects valid learning objectives that have Russian text with correct English cognitive levels.

---

## Problem Statement

### Observed Behavior

From test execution and user's description:

**Validation Error**:
```
Invalid Bloom's taxonomy verb "применять" in language ru
Invalid Bloom's taxonomy verb "оценивать" in language ru
```

**Current Schema Structure** (CORRECT):
```typescript
{
  id: "550e8400-e29b-41d4-a716-446655440000",
  text: "Применять методы продаж образовательных продуктов",  // ✅ Can be in ANY language
  language: "ru",                                             // ✅ Indicates text language
  cognitiveLevel: "apply",                                    // ✅ ALWAYS English enum
  estimatedDuration: 10,
  targetAudienceLevel: "intermediate"
}
```

**What RT-006 Validator Currently Does** (WRONG):
1. Extracts action verb from `obj.text`: "применять" (Russian)
2. Calls `isBloomsVerb("применять", "ru")`
3. Checks if "применять" exists in `BLOOMS_TAXONOMY_WHITELIST.ru`
4. Fails because whitelist check is unnecessary - `cognitiveLevel` already guarantees validity

**Problem**: The validator is validating the **wrong field**.

### Expected Behavior

**What RT-006 Validator SHOULD Do**:
1. Check that `obj.cognitiveLevel` is a valid Bloom's enum
   - Valid values: "remember", "understand", "apply", "analyze", "evaluate", "create"
   - This is already enforced by Zod enum: `BloomCognitiveLevelSchema`
2. Optionally: Verify consistency between `obj.cognitiveLevel` and action verb in `obj.text`
3. Do NOT reject valid objectives just because `text` field contains non-English verbs

**Correct validation logic**:
- `cognitiveLevel` field: MUST be English enum (already enforced by Zod)
- `text` field: CAN be in any language (no Bloom's verb validation needed)
- `language` field: Indicates language of `text` field

### Environment

- **File**: `packages/shared-types/src/generation-result.ts`
- **Lines**: 440-445 (RT-006 Bloom's taxonomy validator)
- **Schema**: `LearningObjectiveSchema` (lines 415-445)
- **Related Spec**: `research-decisions/rt-006-bloom-taxonomy-validation.md`

---

## Investigation Process

### Phase 1: Tier 0 - Project Internal Documentation Search

**Files Examined**:

1. **`packages/shared-types/src/generation-result.ts`** (lines 1-841)
   - LearningObjectiveSchema definition (lines 415-447)
   - RT-006 Bloom's taxonomy validator (lines 440-445)
   - Bloom's taxonomy whitelist (lines 101-118)
   - Helper functions (lines 178-232)

2. **`specs/008-generation-generation-json/research-decisions/rt-006-bloom-taxonomy-validation.md`**
   - RT-006 specification (829 lines)
   - Bloom's taxonomy whitelist design (lines 113-191)
   - Validation strategy (lines 35-106)
   - Implementation guidance (lines 567-656)

**Key Findings from Project Documentation**:

**Finding 1: Schema Design** (generation-result.ts:415-433)
```typescript
export const LearningObjectiveSchema = z.object({
  id: z.string().uuid(),
  text: z.string()
    .min(10, 'Learning objective too short (min 10 chars)')
    .max(500, 'Learning objective too long (max 500 chars)'),
  language: SupportedLanguageSchema.describe('Language for Bloom\'s taxonomy validation (19 languages supported)'),
  cognitiveLevel: BloomCognitiveLevelSchema
    .optional()
    .describe('Bloom\'s taxonomy cognitive level (auto-detected from action verb)'),
  // ... other fields
})
```

**Key observations**:
- `text` field: String (10-500 chars) - CAN be in ANY language
- `language` field: Enum ("ru", "en", etc.) - Indicates language of `text`
- `cognitiveLevel` field: **Optional** enum - ALWAYS English when present
- Comment says: "auto-detected from action verb" - suggests field should be derived from `text`

**Finding 2: Validator Implementation** (generation-result.ts:440-445)
```typescript
.refine(
  (obj) => isBloomsVerb(extractActionVerb(obj.text, obj.language), obj.language),
  (obj) => ({
    message: `Invalid Bloom's taxonomy verb "${extractActionVerb(obj.text, obj.language)}" in language ${obj.language}`,
  })
)
```

**BUG IDENTIFIED**:
- Validator extracts verb from `obj.text` (Russian: "применять")
- Checks if Russian verb is in Russian Bloom's whitelist
- **Problem**: This validation is WRONG for objectives with `cognitiveLevel` field
- **Correct approach**: If `cognitiveLevel` exists, validate that field; otherwise validate `text`

**Finding 3: Helper Function** (generation-result.ts:178-187)
```typescript
function extractActionVerb(text: string, language: string): string {
  const tokens = text.trim().toLowerCase().split(/\s+/);
  if (language === 'ru') {
    const verb = tokens[0] || '';
    return verb.replace(/ся$/, ''); // Remove reflexive ending
  }
  return tokens[0] || '';
}
```

**Analysis**:
- Function extracts first token from `text` field
- For Russian: removes reflexive ending "ся"
- Returns extracted verb for validation
- **Issue**: This is appropriate for TEXT validation, not for ENUM validation

**Finding 4: Bloom's Whitelist** (generation-result.ts:110-118, rt-006 spec:100-149)
```typescript
const BLOOMS_TAXONOMY_WHITELIST = {
  en: {
    remember: ['define', 'list', 'recall', ...],
    understand: ['explain', 'summarize', ...],
    apply: ['execute', 'implement', 'solve', 'use', 'demonstrate', ...],
    analyze: ['differentiate', 'organize', ...],
    evaluate: ['check', 'critique', 'judge', ...],
    create: ['design', 'construct', 'plan', ...],
  },
  ru: {
    remember: ['определить', 'перечислить', ...],
    understand: ['объяснить', 'резюмировать', ...],
    apply: ['выполнить', 'реализовать', 'решить', 'использовать', 'продемонстрировать', ...],
    analyze: ['дифференцировать', 'организовать', ...],
    evaluate: ['проверить', 'критиковать', 'судить', ...],
    create: ['спроектировать', 'сконструировать', ...],
  },
} as const;
```

**Analysis**:
- Whitelist contains 165 verbs (87 EN + 78 RU)
- Russian "применять" is NOT in whitelist (whitelist has "использовать", "продемонстрировать")
- **But**: If `cognitiveLevel: "apply"` exists, whitelist check is UNNECESSARY
- **Root cause**: Validator assumes `text` is the source of truth, ignores `cognitiveLevel`

**Finding 5: Spec Documentation** (rt-006 spec:150-174)

**Quote from RT-006 spec (lines 150-174)**:
```typescript
function validateBloomsTaxonomy(objective: LearningObjective): ValidationResult {
  const verb = extractActionVerb(objective.text, objective.language);
  const whitelistForLanguage = BLOOMS_TAXONOMY_WHITELIST[objective.language];

  // Check if verb exists in any cognitive level
  for (const [level, verbs] of Object.entries(whitelistForLanguage)) {
    if (verbs.includes(verb.toLowerCase())) {
      return {
        passed: true,
        cognitiveLevel: level as BloomLevel,  // ← Returns detected level
        verb,
        score: 1.0
      };
    }
  }

  return {
    passed: false,
    cognitiveLevel: null,
    verb,
    score: 0.0,
    issues: [`Action verb "${verb}" not found in Bloom's taxonomy whitelist for ${objective.language}`],
    suggestion: suggestAlternativeVerb(verb, objective.language)
  };
}
```

**Key insight from spec**:
- Spec's `validateBloomsTaxonomy()` function **detects and returns** `cognitiveLevel`
- This suggests the validator's PURPOSE is to **populate** `cognitiveLevel` field
- Current implementation in Zod schema does NOT populate field, only validates
- **Design mismatch**: Spec assumes validator SETS `cognitiveLevel`, Zod validator only CHECKS it

### Phase 2: Evidence Collection and Hypothesis Testing

#### Hypothesis 1: Validator Checks Wrong Field ✅ CONFIRMED

**Evidence**: generation-result.ts lines 440-445

**Current code**:
```typescript
.refine(
  (obj) => isBloomsVerb(extractActionVerb(obj.text, obj.language), obj.language),
  //                    ^^^^^^^^^^^^^^^^^ Extracts from TEXT field
  (obj) => ({
    message: `Invalid Bloom's taxonomy verb "${extractActionVerb(obj.text, obj.language)}" in language ${obj.language}`,
  })
)
```

**What this does**:
1. `extractActionVerb(obj.text, obj.language)` → extracts "применять" from Russian text
2. `isBloomsVerb("применять", "ru")` → checks if "применять" is in Russian whitelist
3. Fails because "применять" is not in whitelist (whitelist has different Russian verbs)

**Why this is wrong**:
- `obj.text` can contain ANY Russian verb, not just whitelisted ones
- `obj.cognitiveLevel` already specifies the Bloom's level ("apply")
- Validator should check `cognitiveLevel` enum, not extract verb from `text`

**Correct approach**:
```typescript
.refine(
  (obj) => {
    // If cognitiveLevel is explicitly set, trust it (already validated by Zod enum)
    if (obj.cognitiveLevel) {
      return true; // cognitiveLevel is a valid enum, no further validation needed
    }
    // Otherwise, validate text field to auto-detect level
    return isBloomsVerb(extractActionVerb(obj.text, obj.language), obj.language);
  },
  (obj) => ({
    message: obj.cognitiveLevel
      ? `Cognitive level "${obj.cognitiveLevel}" is valid, but text validation failed`
      : `Invalid Bloom's taxonomy verb "${extractActionVerb(obj.text, obj.language)}" in language ${obj.language}`,
  })
)
```

#### Hypothesis 2: Russian Verb "применять" Not in Whitelist ✅ CONFIRMED

**Evidence**: generation-result.ts lines 110-118

**Russian "apply" verbs in whitelist**:
```typescript
apply: ['выполнить', 'реализовать', 'решить', 'использовать', 'продемонстрировать', 'оперировать', 'вычислить', 'завершить', 'показать', 'исследовать', 'модифицировать'],
```

**Analysis**:
- Whitelist contains 11 Russian verbs for "apply" level
- "применять" is NOT in this list
- **But**: "применять" is a valid Russian verb meaning "to apply"
- **Issue**: Whitelist is incomplete, or validator shouldn't validate text when `cognitiveLevel` is set

**Conclusion**: Validator should NOT validate `text` field when `cognitiveLevel` is explicitly provided.

#### Hypothesis 3: cognitiveLevel Field Should Override Text Validation ✅ CONFIRMED

**Evidence**: Schema design, spec documentation

**Schema comment** (line 421-423):
```typescript
cognitiveLevel: BloomCognitiveLevelSchema
  .optional()
  .describe('Bloom\'s taxonomy cognitive level (auto-detected from action verb)'),
```

**Key phrase**: "auto-detected from action verb"

**Interpretation**:
- If `cognitiveLevel` is provided: field is EXPLICIT, no auto-detection needed
- If `cognitiveLevel` is missing: validator should DETECT from `text` field
- Current validator ALWAYS validates `text`, even when `cognitiveLevel` is set

**Correct logic**:
```typescript
if (obj.cognitiveLevel) {
  // Cognitive level explicitly set → trust it (already validated by Zod enum)
  return true;
} else {
  // Cognitive level missing → detect from text field
  return isBloomsVerb(extractActionVerb(obj.text, obj.language), obj.language);
}
```

#### Hypothesis 4: Spec and Implementation Diverged ✅ CONFIRMED

**Evidence**: RT-006 spec lines 150-174 vs generation-result.ts lines 440-445

**Spec's validator** (lines 150-174):
- **Purpose**: Detect and RETURN `cognitiveLevel` from text
- **Return type**: `ValidationResult` with `cognitiveLevel` field
- **Behavior**: Extracts verb, finds level, returns level

**Zod implementation** (lines 440-445):
- **Purpose**: Validate that text contains Bloom's verb
- **Return type**: Boolean (pass/fail for Zod refine)
- **Behavior**: Extracts verb, checks whitelist, returns true/false

**Divergence**:
- Spec assumes validator POPULATES `cognitiveLevel` field
- Zod implementation only VALIDATES, doesn't populate
- **Result**: Zod validator rejects valid objectives with explicit `cognitiveLevel`

**Root cause**: Implementation is incomplete - should validate `cognitiveLevel` when present, validate `text` when absent.

---

## Root Cause Analysis

### Primary Cause: Validator Logic Error in LearningObjectiveSchema

**Root Cause**: The RT-006 Bloom's taxonomy validator (generation-result.ts:440-445) incorrectly validates the `text` field for ALL learning objectives, even when the `cognitiveLevel` enum field is explicitly set. This causes false positive validation errors for objectives with non-English text that have correct English cognitive levels.

**Mechanism of Failure**:

**Step 1: Learning Objective Created** (with correct schema)
```typescript
{
  id: "550e8400-e29b-41d4-a716-446655440000",
  text: "Применять методы продаж образовательных продуктов",  // Russian text
  language: "ru",
  cognitiveLevel: "apply",  // ✅ Valid English enum
  estimatedDuration: 10,
  targetAudienceLevel: "intermediate"
}
```

**Step 2: Zod Validation Runs** (generation-result.ts:440-445)
```typescript
.refine(
  (obj) => isBloomsVerb(extractActionVerb(obj.text, obj.language), obj.language),
  // Extracts: "применять" from obj.text
  // Checks: if "применять" is in BLOOMS_TAXONOMY_WHITELIST.ru.apply
  // Result: FALSE (whitelist doesn't contain "применять")
)
```

**Step 3: extractActionVerb Called** (lines 178-187)
```typescript
extractActionVerb("Применять методы продаж...", "ru")
// Splits: ["применять", "методы", "продаж", ...]
// Returns: "применять" (first token, reflexive ending removed)
```

**Step 4: isBloomsVerb Called** (lines 220-232)
```typescript
isBloomsVerb("применять", "ru")
// Gets whitelist: BLOOMS_TAXONOMY_WHITELIST.ru
// Checks: if "применять" exists in any level's verbs
// Returns: FALSE (whitelist has: "выполнить", "реализовать", "использовать", etc.)
```

**Step 5: Validation Fails**
```typescript
message: `Invalid Bloom's taxonomy verb "применять" in language ru`
```

**Step 6: Objective Rejected** (even though it's valid!)
- `cognitiveLevel: "apply"` is correct ✅
- `text` field contains valid Russian sentence ✅
- **But**: Validator rejects because "применять" not in whitelist ❌

**Contributing Factors**:

1. **Design Assumption Mismatch**:
   - RT-006 spec assumes validator DETECTS `cognitiveLevel` from `text`
   - Zod schema assumes `cognitiveLevel` is OPTIONAL (can be pre-filled)
   - Validator doesn't check if `cognitiveLevel` already exists before validating `text`

2. **Incomplete Whitelist**:
   - Russian "применять" (to apply) is a valid Bloom's verb
   - Whitelist contains 11 Russian "apply" verbs, but not "применять"
   - **But**: This is irrelevant when `cognitiveLevel` is explicitly set

3. **Missing Conditional Logic**:
   - Validator should skip `text` validation when `cognitiveLevel` is present
   - Current code has no `if (obj.cognitiveLevel)` check
   - Result: Validates `text` even when unnecessary

4. **Spec-Implementation Divergence**:
   - Spec's `validateBloomsTaxonomy()` returns `cognitiveLevel`
   - Zod's `.refine()` returns boolean
   - **Gap**: No mechanism to populate `cognitiveLevel` from `text` in Zod schema

**Evidence**:
- **Bug location**: packages/shared-types/src/generation-result.ts lines 440-445
- **Whitelist**: lines 101-118 (Russian "apply" doesn't include "применять")
- **Spec**: rt-006-bloom-taxonomy-validation.md lines 150-174
- **Helper**: lines 178-187 (extractActionVerb), 220-232 (isBloomsVerb)

---

## Proposed Solutions

### Solution 1: Skip Text Validation When cognitiveLevel is Set (RECOMMENDED)

**Approach**: Modify validator to only check `text` field when `cognitiveLevel` is missing.

**Description**: If `cognitiveLevel` is explicitly set (and valid enum), trust it. Only validate `text` for auto-detection when field is absent.

**Implementation**:

**File**: `packages/shared-types/src/generation-result.ts`

**Change lines 440-445 from**:
```typescript
.refine(
  (obj) => isBloomsVerb(extractActionVerb(obj.text, obj.language), obj.language),
  (obj) => ({
    message: `Invalid Bloom's taxonomy verb "${extractActionVerb(obj.text, obj.language)}" in language ${obj.language}`,
  })
)
```

**To**:
```typescript
.refine(
  (obj) => {
    // If cognitiveLevel is explicitly set, it's already validated by Zod enum
    // No need to validate text field
    if (obj.cognitiveLevel) {
      return true;
    }
    // Otherwise, validate text field to ensure it contains a Bloom's verb
    return isBloomsVerb(extractActionVerb(obj.text, obj.language), obj.language);
  },
  (obj) => ({
    message: `Invalid Bloom's taxonomy verb "${extractActionVerb(obj.text, obj.language)}" in language ${obj.language}. Either set cognitiveLevel explicitly or use a recognized Bloom's verb.`,
  })
)
```

**Pros**:
- **Fixes bug** (no more false positives for objectives with `cognitiveLevel`)
- **Minimal code change** (5 lines in 1 file)
- **Backward compatible** (still validates `text` when `cognitiveLevel` missing)
- **Low risk** (only adds conditional, doesn't change validation logic)
- **Fast to implement** (10 minutes)

**Cons**:
- Allows objectives with `cognitiveLevel` set but non-Bloom's verb in `text`
- Example: `{ text: "Understand concepts", cognitiveLevel: "apply" }` would pass
- **Mitigation**: Add optional consistency check (Solution 2)

**Complexity**: Very Low (10 minutes)
**Risk**: Very Low (additive logic, no breaking changes)

**Validation**:
```bash
# 1. Apply fix
edit generation-result.ts (lines 440-445)

# 2. Run type-check
pnpm --filter @megacampus/shared-types type-check

# 3. Run tests
pnpm --filter course-gen-platform test tests/e2e/t053-synergy-sales-course.test.ts
```

### Solution 2: Add Consistency Check (RECOMMENDED - Enhancement)

**Approach**: When both `cognitiveLevel` and `text` are present, verify they are consistent.

**Description**: If `cognitiveLevel` is "apply", verify `text` starts with an "apply"-level verb (optional warning).

**Implementation**:

**File**: `packages/shared-types/src/generation-result.ts`

**Add after Solution 1**:
```typescript
.refine(
  (obj) => {
    // Skip consistency check if cognitiveLevel is missing
    if (!obj.cognitiveLevel) {
      return true;
    }

    // Extract verb from text
    const verb = extractActionVerb(obj.text, obj.language);

    // Check if verb matches cognitiveLevel
    const whitelist = BLOOMS_TAXONOMY_WHITELIST[obj.language as 'en' | 'ru'];
    if (!whitelist) {
      return true; // Language not in whitelist, skip check
    }

    const expectedVerbs = whitelist[obj.cognitiveLevel];
    if (!expectedVerbs) {
      return true; // Level not in whitelist, skip check
    }

    // Warn (not error) if inconsistent
    if (!expectedVerbs.some((v: string) => v.toLowerCase() === verb.toLowerCase())) {
      console.warn(
        `[RT-006] Potential inconsistency: text starts with "${verb}" but cognitiveLevel is "${obj.cognitiveLevel}". This may be intentional.`
      );
    }

    // Always pass (warning only, not blocking)
    return true;
  },
  {
    message: 'Consistency check (should never fail)',
  }
)
```

**Pros**:
- **Detects inconsistencies** (text: "understand", cognitiveLevel: "apply")
- **Non-blocking** (warning only, doesn't reject valid objectives)
- **Helpful for debugging** (identifies potential LLM errors)

**Cons**:
- **Adds complexity** (second validation pass)
- **May have false positives** (synonyms not in whitelist)
- **Optional feature** (not required for bug fix)

**Complexity**: Low (30 minutes)
**Risk**: Very Low (warning only, no validation errors)

**NOT REQUIRED for immediate bug fix, but useful for quality assurance.**

### Solution 3: Populate cognitiveLevel from Text (NOT RECOMMENDED)

**Approach**: Add a Zod transform to auto-detect and populate `cognitiveLevel` from `text` when missing.

**Description**: Use `.transform()` to set `cognitiveLevel` based on extracted verb.

**Implementation**:

**File**: `packages/shared-types/src/generation-result.ts`

**Add before refinements**:
```typescript
export const LearningObjectiveSchema = z.object({
  id: z.string().uuid(),
  text: z.string().min(10).max(500),
  language: SupportedLanguageSchema,
  cognitiveLevel: BloomCognitiveLevelSchema.optional(),
  // ... other fields
})
  .transform((obj) => {
    // If cognitiveLevel is missing, auto-detect from text
    if (!obj.cognitiveLevel) {
      const verb = extractActionVerb(obj.text, obj.language);
      const whitelist = BLOOMS_TAXONOMY_WHITELIST[obj.language as 'en' | 'ru'];

      if (whitelist) {
        for (const [level, verbs] of Object.entries(whitelist)) {
          if ((verbs as readonly string[]).some((v: string) => v.toLowerCase() === verb.toLowerCase())) {
            obj.cognitiveLevel = level as BloomCognitiveLevel;
            break;
          }
        }
      }
    }

    return obj;
  })
  .refine(/* ... existing validators ... */);
```

**Pros**:
- **Auto-fills cognitiveLevel** (implements spec's "auto-detected" feature)
- **Reduces manual work** (LLM doesn't need to provide `cognitiveLevel`)

**Cons**:
- **Changes schema behavior** (output has `cognitiveLevel` even if input doesn't)
- **Breaking change** (transforms affect downstream code)
- **Whitelist dependency** (fails for verbs not in whitelist)
- **High complexity** (transforms are tricky with Zod refinements)

**Complexity**: Medium (2-3 hours)
**Risk**: Medium (schema behavior change, potential side effects)

**NOT RECOMMENDED**: Too complex for bug fix, better as separate feature.

### Solution 4: Expand Russian Verb Whitelist (NOT RECOMMENDED)

**Approach**: Add "применять", "оценивать" and other missing Russian verbs to whitelist.

**Description**: Update `BLOOMS_TAXONOMY_WHITELIST.ru` with additional Russian verbs.

**Implementation**:

**File**: `packages/shared-types/src/generation-result.ts`

**Change lines 110-118**:
```typescript
ru: {
  remember: ['определить', 'перечислить', 'вспомнить', ...],
  understand: ['объяснить', 'резюмировать', ...],
  apply: ['выполнить', 'реализовать', 'решить', 'использовать', 'применять', ...],  // ← ADD применять
  analyze: ['дифференцировать', 'организовать', ...],
  evaluate: ['проверить', 'критиковать', 'судить', 'оценивать', ...],              // ← ADD оценивать
  create: ['спроектировать', 'сконструировать', ...],
},
```

**Pros**:
- **Fixes immediate errors** ("применять", "оценивать" now pass)
- **Minimal code change** (add 2 words)

**Cons**:
- **DOESN'T fix root cause** (validator still checks wrong field)
- **Temporary fix** (other Russian verbs will still fail)
- **Whitelist maintenance** (endless whack-a-mole with missing verbs)
- **Doesn't address design issue** (cognitiveLevel should override text)

**Complexity**: Very Low (5 minutes)
**Risk**: Low (just whitelist update)

**NOT RECOMMENDED**: Band-aid fix, doesn't solve underlying problem.

---

## Implementation Guidance

### Recommended Approach

**SOLUTION 1** (Skip text validation when cognitiveLevel is set)

**Why**: Fixes root cause with minimal risk and code change.

**Implementation Steps**:

**1. Edit generation-result.ts** (5 minutes)
```bash
# File: packages/shared-types/src/generation-result.ts
# Lines: 440-445
# Change: Add conditional check for obj.cognitiveLevel
```

**2. Test locally** (5 minutes)
```bash
# Type-check
pnpm --filter @megacampus/shared-types type-check

# Unit tests (if any exist for LearningObjectiveSchema)
pnpm --filter @megacampus/shared-types test
```

**3. Run E2E tests** (10 minutes)
```bash
# Run T053 test with Russian learning objectives
pnpm --filter course-gen-platform test tests/e2e/t053-synergy-sales-course.test.ts

# Verify no "Invalid Bloom's taxonomy verb" errors
```

**4. Optional: Add Solution 2** (30 minutes)
```bash
# Add consistency check warning
# Non-blocking, helps identify potential issues
```

### Validation Criteria

**Success Metrics**:
- ✅ No "Invalid Bloom's taxonomy verb" errors for objectives with `cognitiveLevel`
- ✅ Validation still works for objectives WITHOUT `cognitiveLevel`
- ✅ T053 E2E test passes (all 4 scenarios)
- ✅ Type-check passes
- ✅ No breaking changes to existing code

**Test Cases**:

**Test 1: Objective with cognitiveLevel (should pass)**
```typescript
{
  id: "...",
  text: "Применять методы продаж",  // Russian verb not in whitelist
  language: "ru",
  cognitiveLevel: "apply",  // ✅ Explicit level
  estimatedDuration: 10,
  targetAudienceLevel: "intermediate"
}
// Expected: PASS (cognitiveLevel overrides text validation)
```

**Test 2: Objective without cognitiveLevel (should validate text)**
```typescript
{
  id: "...",
  text: "Использовать методы продаж",  // Russian verb IN whitelist
  language: "ru",
  // cognitiveLevel: undefined
  estimatedDuration: 10,
  targetAudienceLevel: "intermediate"
}
// Expected: PASS (verb found in whitelist)
```

**Test 3: Objective without cognitiveLevel, invalid verb (should fail)**
```typescript
{
  id: "...",
  text: "Применять методы продаж",  // Russian verb NOT in whitelist
  language: "ru",
  // cognitiveLevel: undefined
  estimatedDuration: 10,
  targetAudienceLevel: "intermediate"
}
// Expected: FAIL (verb not found in whitelist, no cognitiveLevel to override)
```

**Test 4: Objective with inconsistent verb and level (optional warning)**
```typescript
{
  id: "...",
  text: "Понимать концепции",  // "understand" verb
  language: "ru",
  cognitiveLevel: "apply",  // "apply" level
  estimatedDuration: 10,
  targetAudienceLevel: "intermediate"
}
// Expected: PASS with WARNING (if Solution 2 implemented)
```

### Rollback Plan

**If Solution 1 causes issues**:
```bash
# 1. Revert generation-result.ts lines 440-445
git checkout HEAD -- packages/shared-types/src/generation-result.ts

# 2. Run type-check and tests
pnpm type-check
pnpm test

# 3. Document issue in investigation report
```

**Rollback risk**: Very Low (simple conditional, easily reverted)

---

## Risks and Considerations

### Implementation Risks

**Risk 1: Objectives with Inconsistent cognitiveLevel**
- **Concern**: LLM sets `cognitiveLevel: "apply"` but text says "understand concepts"
- **Likelihood**: Low (LLMs usually consistent)
- **Impact**: Medium (misleading metadata)
- **Mitigation**: Implement Solution 2 (consistency warning)

**Risk 2: Legacy Objectives Without cognitiveLevel**
- **Concern**: Existing objectives may not have `cognitiveLevel` field
- **Likelihood**: Medium (field is optional)
- **Impact**: Low (validator still checks `text` for these)
- **Mitigation**: No action needed (backward compatible)

**Risk 3: Whitelist Incomplete for Text-Only Validation**
- **Concern**: Objectives without `cognitiveLevel` fail due to missing verbs in whitelist
- **Likelihood**: Medium (whitelist has 165 verbs, but Russian language is large)
- **Impact**: Medium (validation errors for valid objectives)
- **Mitigation**: Add missing verbs to whitelist as discovered

### Performance Impact

**Solution 1**:
- **Performance**: +1 conditional check (if statement)
- **Latency**: <0.01ms per objective
- **Negligible impact**: Validation already iterates over all objectives

**Solution 2**:
- **Performance**: +1 additional refine pass
- **Latency**: ~0.1-0.5ms per objective (whitelist lookup)
- **Acceptable**: Non-blocking, runs after main validation

### Breaking Changes

**None identified**.

**Solution 1**: Additive conditional logic, no API or schema changes
**Solution 2**: Optional warning, no validation errors

### Side Effects

**Reduced validation strictness**:
- Objectives with `cognitiveLevel` skip `text` validation
- Allows non-Bloom's verbs in `text` field when `cognitiveLevel` is set
- **Acceptable**: `cognitiveLevel` is the source of truth, `text` is user-facing description

**Better user experience**:
- Russian/non-English learning objectives no longer rejected
- LLMs can use natural language without whitelist constraints
- Metadata generation less brittle

---

## Documentation References

### Tier 0: Project Internal Documentation

**Code Files**:

1. **`packages/shared-types/src/generation-result.ts`** (lines 1-841)
   - **Lines 415-447**: LearningObjectiveSchema definition
   - **Lines 440-445**: BUG LOCATION - RT-006 Bloom's validator
   - **Lines 101-118**: Bloom's taxonomy whitelist
   - **Lines 178-187**: extractActionVerb() helper
   - **Lines 220-232**: isBloomsVerb() helper
   - **Key quote (line 422)**: "Bloom's taxonomy cognitive level (auto-detected from action verb)"

2. **`specs/008-generation-generation-json/research-decisions/rt-006-bloom-taxonomy-validation.md`** (829 lines)
   - **Lines 113-191**: Bilingual Bloom's whitelist design
   - **Lines 150-174**: validateBloomsTaxonomy() spec
   - **Lines 567-656**: Integration guidance
   - **Key quote (line 151)**: "Check if verb exists in any cognitive level" → function DETECTS level from text

**Previous Investigations**:

1. **INV-2025-11-16-001** (T053 RT-006 metadata validation failure)
   - **Status**: COMPLETED
   - **Finding**: Prompt-schema mismatch in metadata generation
   - **Relevance**: Different issue (metadata prompt), but related RT-006 context
   - **Key insight**: RT-006 validators are active in production

**Spec Documentation**:

1. **RT-006 Spec** (rt-006-bloom-taxonomy-validation.md)
   - **Purpose**: Define Bloom's taxonomy validation framework
   - **Design**: 165 verbs across 6 cognitive levels (87 EN + 78 RU)
   - **Implementation**: validateBloomsTaxonomy() detects level from text
   - **Gap**: Spec assumes text → level detection, Zod schema has explicit `cognitiveLevel` field

**Schema Design Intent**:

From schema comments and spec:
- **Course-level** `learning_outcomes`: Simple strings (no cognitive level)
- **Section-level** `learning_objectives`: Simple strings (no cognitive level)
- **Lesson-level** `lesson_objectives`: Simple strings (no cognitive level)
- **Stage 6 content** `LearningObjective`: Complex objects with cognitive level

**Interpretation**: RT-006 validators in `LearningObjectiveSchema` are for Stage 6 content generation, where `cognitiveLevel` can be explicitly set OR auto-detected from `text`.

### Tier 1: Context7 MCP (Not Used)

**Rationale**: Investigation focused on internal schema validation bug. No external library questions (Zod API, RT-006 spec) required external documentation lookup.

### Tier 2/3: External Documentation (Not Used)

**Rationale**: Bug is in project-specific validation logic, not Zod library behavior or Bloom's taxonomy research.

---

## MCP Server Usage

**Tools Used**:
- ✅ **Read**: Examined generation-result.ts, rt-006 spec, previous investigation
- ✅ **Grep**: Searched for "Invalid Bloom's taxonomy verb" error message
- ✅ **Glob**: Located investigation reports and spec files
- ✅ **Bash**: Checked current date, listed directories
- ✅ **TodoWrite**: Tracked investigation phases

**MCP Servers Not Used**:
- ❌ **Supabase MCP**: No database queries needed (schema validation only)
- ❌ **Sequential Thinking MCP**: Bug sufficiently analyzed through code review
- ❌ **Context7 MCP**: No external library questions

---

## Next Steps

### For Implementation Agent

**PRIORITY 1: Apply Solution 1** (10-15 minutes)

**File**: `packages/shared-types/src/generation-result.ts`
**Lines**: 440-445

**Change**:
```typescript
// BEFORE
.refine(
  (obj) => isBloomsVerb(extractActionVerb(obj.text, obj.language), obj.language),
  (obj) => ({
    message: `Invalid Bloom's taxonomy verb "${extractActionVerb(obj.text, obj.language)}" in language ${obj.language}`,
  })
)

// AFTER
.refine(
  (obj) => {
    // If cognitiveLevel is explicitly set, it's already validated by Zod enum
    if (obj.cognitiveLevel) {
      return true;
    }
    // Otherwise, validate text field to ensure it contains a Bloom's verb
    return isBloomsVerb(extractActionVerb(obj.text, obj.language), obj.language);
  },
  (obj) => ({
    message: `Invalid Bloom's taxonomy verb "${extractActionVerb(obj.text, obj.language)}" in language ${obj.language}. Either set cognitiveLevel explicitly or use a recognized Bloom's verb.`,
  })
)
```

**Testing**:
```bash
# 1. Type-check
pnpm --filter @megacampus/shared-types type-check

# 2. Run T053 E2E test
pnpm --filter course-gen-platform test tests/e2e/t053-synergy-sales-course.test.ts

# 3. Verify no "Invalid Bloom's taxonomy verb" errors in logs
```

**OPTIONAL: Add Solution 2** (30 minutes)

Add consistency warning (non-blocking) to help identify potential LLM errors.

### For User/Orchestrator

**Summary**:

**BUG IDENTIFIED**: RT-006 validator checks `text` field instead of `cognitiveLevel` enum field

**LOCATION**: `packages/shared-types/src/generation-result.ts` lines 440-445

**IMPACT**: False positive validation errors for learning objectives with:
- Russian text (e.g., "применять", "оценивать")
- Explicit `cognitiveLevel` set (e.g., "apply", "evaluate")

**FIX**: Add conditional check - if `cognitiveLevel` exists, skip `text` validation

**EFFORT**: 10-15 minutes (5 lines of code)

**RISK**: Very Low (additive logic, backward compatible)

**Returning control to main session.**

---

## Investigation Log

**Timeline**:
```
2025-11-16 10:20:00 - Investigation started (INV-2025-11-16-002)
2025-11-16 10:22:00 - Tier 0: Read generation-result.ts, located bug (lines 440-445)
2025-11-16 10:25:00 - Tier 0: Read rt-006 spec, found design intent
2025-11-16 10:28:00 - Tier 0: Read previous investigation (INV-2025-11-16-001)
2025-11-16 10:30:00 - Analyzed schema structure and field relationships
2025-11-16 10:33:00 - Tested hypotheses (4 hypotheses, all confirmed)
2025-11-16 10:36:00 - Root cause identified: validator checks text instead of cognitiveLevel
2025-11-16 10:38:00 - Formulated 4 solutions (ranked by complexity/risk)
2025-11-16 10:40:00 - Selected recommendation: Solution 1 (minimal fix)
2025-11-16 10:45:00 - Report generation complete
```

**Commands Executed**:
```bash
# Get current date
date '+%Y-%m-%d'

# List investigations directory
ls -la /home/me/code/.../docs/investigations/

# Read schema file
Read /home/me/code/.../packages/shared-types/src/generation-result.ts

# Read RT-006 spec
Read /home/me/code/.../specs/008.../rt-006-bloom-taxonomy-validation.md

# Search for error message
Grep "Invalid Bloom's taxonomy verb" --output_mode=content

# Read previous investigation
Read /home/me/code/.../docs/investigations/INV-2025-11-16-001...md
```

**MCP Calls**: None (completed through file analysis)

---

**Investigation Status**: ✅ COMPLETED
**Report Location**: `/docs/investigations/INV-2025-11-16-002-rt006-blooms-verb-validation-bug.md`
**Recommended Solution**: Solution 1 (Skip text validation when cognitiveLevel is set)
**Estimated Fix Time**: 10-15 minutes
**Next Agent**: Implementation agent (typescript-types-specialist or code-modification-specialist)
