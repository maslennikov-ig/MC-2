# Code Review: i18n Localization Changes for Content Headers

**Review Date**: 2026-02-04
**Reviewer**: Claude Code (code-reviewer agent)
**Scope**: i18n localization for lesson content headers (19 languages)
**Status**: ⚠️ **CONDITIONAL PASS** - See critical findings below

---

## Executive Summary

This review examines recent changes to support localized content headers across 19 languages. The implementation is generally sound with good type safety and fallback mechanisms, but there are **5 critical issues** requiring attention before production deployment.

### Key Findings

| Severity    | Count | Description                                       |
| ----------- | ----- | ------------------------------------------------- |
| 🔴 Critical | 5     | Type safety, null handling, edge cases            |
| 🟡 High     | 3     | Consistency, parameter order, missing validations |
| 🟢 Medium   | 4     | Documentation, test coverage                      |
| 🔵 Low      | 2     | Performance optimizations                         |

### Overall Assessment

- **Type Safety**: 6/10 - Unsafe casts in export-lessons.ts
- **Null Safety**: 7/10 - Missing validation for undefined language
- **Consistency**: 8/10 - All code paths covered but parameter order risky
- **Edge Cases**: 5/10 - Missing fallback for invalid language codes
- **Test Coverage**: 3/10 - No tests for i18n functionality

---

## Critical Issues (Must Fix Before Merge)

### 1. 🔴 Unsafe Type Casting in `export-lessons.ts`

**File**: `packages/course-gen-platform/src/server/routers/lesson-content/procedures/export-lessons.ts:158`

**Issue**:

```typescript
const labels = getContentLabels((course?.language as string) || 'en');
```

**Problems**:

1. **Unsafe cast**: `course?.language as string` bypasses type checking
2. **Runtime risk**: If `course.language` is NOT a valid `Language` type (e.g., database corruption, manual edit), `getContentLabels()` will silently fall back to English
3. **Silent failure**: No warning to user that their language is unsupported

**Example Breaking Case**:

```typescript
// Database has language = 'jp' (typo for 'ja')
course.language = 'jp';
const labels = getContentLabels((course?.language as string) || 'en');
// Result: Returns English labels, user expects Japanese
```

**Recommended Fix**:

```typescript
import { languageSchema } from '@megacampus/shared-types';

// Validate language with Zod
const parsedLanguage = languageSchema.safeParse(course?.language);
const language = parsedLanguage.success ? parsedLanguage.data : 'en';

if (!parsedLanguage.success) {
  logger.warn(
    { courseId, language: course?.language },
    'Invalid language code, falling back to English'
  );
}

const labels = getContentLabels(language);
```

**Impact**: Medium - Causes silent language mismatch for corrupted data

---

### 2. 🔴 Parameter Order Safety in `handlePartialSuccess()` and `saveLessonContent()`

**File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/services/database-service.ts:20-26, 155-161`

**Issue**:

```typescript
// handlePartialSuccess signature
export async function handlePartialSuccess(
  jobId: string,
  courseId: string,
  lessonUuid: LessonUUID,
  lessonLabel: LessonLabel,
  result: Stage6Output,
  language: string = 'en' // ⚠️ Default parameter AFTER required params
): Promise<void>;

// saveLessonContent signature
export async function saveLessonContent(
  courseId: string,
  lessonLabel: string,
  result: Stage6Output,
  sanityResult?: SanityCheckResult,
  language: string = 'en' // ⚠️ Default parameter AFTER optional param
): Promise<void>;
```

**Problems**:

1. **Parameter order**: Default parameter `language` comes after required/optional parameters
2. **Dangerous pattern**: If caller forgets `sanityResult`, TypeScript may confuse positional arguments
3. **Future risk**: Adding more parameters becomes error-prone

**Example Breaking Case**:

```typescript
// Caller thinks they're passing sanityResult, but it's interpreted as language
await saveLessonContent(courseId, lessonLabel, result, 'ru');
// 'ru' is interpreted as language, sanityResult is undefined
// BUT: If they meant sanityResult = 'ru' (invalid), silent failure
```

**Recommended Fix**:

```typescript
// Option 1: Move language before optional params
export async function saveLessonContent(
  courseId: string,
  lessonLabel: string,
  result: Stage6Output,
  language: string = 'en',
  sanityResult?: SanityCheckResult
): Promise<void>;

// Option 2: Use options object (better for >4 params)
export async function saveLessonContent(options: {
  courseId: string;
  lessonLabel: string;
  result: Stage6Output;
  language?: string;
  sanityResult?: SanityCheckResult;
}): Promise<void>;
```

**Impact**: High - Potential argument confusion leading to wrong language being used

---

### 3. 🔴 Missing Language Validation in `job-processor.ts`

**File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/services/job-processor.ts:402, 435`

**Issue**:

```typescript
// Line 402
const markdown = extractContentMarkdown(result.lessonContent, language);

// Line 435
await handlePartialSuccess(
  job.id ?? 'unknown',
  courseId,
  lessonUuid,
  lessonLabel,
  result,
  language // ⚠️ No validation that `language` is defined
);
```

**Problems**:

1. **Undefined risk**: `language` comes from `job.data.language` (line 247) which could be undefined
2. **No validation**: Code assumes `language` is always a valid string
3. **Silent failure**: If `language` is undefined, functions will use default 'en' without warning

**Evidence of Risk**:

```typescript
// Line 247: language destructured from job.data
const { lessonSpec, courseId, language, ... } = job.data;

// Type definition allows undefined:
interface Stage6JobInput {
  language?: string;  // Optional field!
}
```

**Recommended Fix**:

```typescript
// At top of processStage6Job, validate and log
const language = job.data.language || 'en';

if (!job.data.language) {
  jobLogger.warn(
    { courseId, lessonId: lessonLabel },
    'No language specified in job data, defaulting to English'
  );
}

// Then use validated language throughout
```

**Impact**: Medium - Silent language fallback could generate content in wrong language

---

### 4. 🔴 Invalid Language Code Handling in `common-enums.ts`

**File**: `packages/shared-types/src/common-enums.ts:370-376`

**Issue**:

```typescript
export function getContentLabels(code: string): typeof CONTENT_LABELS.en {
  const labels = CONTENT_LABELS[code as Language];
  if (!labels && process.env.NODE_ENV === 'development') {
    console.warn(`[getContentLabels] Unknown language code: "${code}", falling back to English`);
  }
  return labels || CONTENT_LABELS.en;
}
```

**Problems**:

1. **Silent failure in production**: Warning only in development mode
2. **No logging**: Production deployments won't know about invalid codes
3. **No validation**: Accepts ANY string, including typos like 'eng', 'rus', 'jp'

**Example Breaking Case**:

```typescript
// Database has invalid code 'eng' (should be 'en')
const labels = getContentLabels('eng');
// Result: Silently returns English labels, no production warning
```

**Recommended Fix**:

```typescript
import { languageSchema } from './common-enums';

export function getContentLabels(code: string): typeof CONTENT_LABELS.en {
  // Validate with Zod schema
  const parsed = languageSchema.safeParse(code);

  if (!parsed.success) {
    // Always log in production (not just development)
    if (typeof logger !== 'undefined') {
      logger.warn(
        { invalidCode: code, fallback: 'en' },
        '[getContentLabels] Invalid language code, falling back to English'
      );
    } else {
      console.warn(`[getContentLabels] Invalid language code: "${code}", falling back to English`);
    }
    return CONTENT_LABELS.en;
  }

  return CONTENT_LABELS[parsed.data];
}
```

**Impact**: High - Silent failures in production mask data quality issues

---

### 5. 🔴 Missing Language Field in Course Query

**File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/services/database-service.ts:470-476`

**Issue**: Function `checkAndSetStage6Complete()` queries course but doesn't include `language` field:

```typescript
const { data: course, error: courseError } = await supabaseAdmin
  .from('courses')
  .select(
    'generation_status, course_structure, auto_finalize_after_stage6, generation_progress'
    // ⚠️ Missing 'language' field
  )
  .eq('id', courseId)
  .single();
```

**Impact**: Low currently (function doesn't use language), but creates **inconsistency risk**:

- If future code assumes `course.language` exists, will break
- Other functions query `language` (e.g., export-lessons.ts:149)

**Recommended Fix**:

```typescript
.select(
  'generation_status, course_structure, auto_finalize_after_stage6, generation_progress, language'
)
```

**Impact**: Low - Future-proofing issue

---

## High Priority Issues (Should Fix Before Merge)

### 6. 🟡 Inconsistent Parameter Naming

**Files**: Multiple

**Issue**: Parameter name inconsistency across files:

- `content-utils.ts`: `language: string = 'en'`
- `database-service.ts`: `language: string = 'en'`
- `cascade-evaluator.ts`: `input.language || 'en'`
- `clev-voter.ts`: `input.language || 'en'`

**Problem**: Some functions check `input.language || 'en'` inline, others use default parameter. This creates subtle bugs where undefined language is treated differently.

**Example**:

```typescript
// In cascade-evaluator.ts:1103
const language = input.language || 'en';
heuristicResults = runHeuristicFilters(
  input.lessonContent,
  input.lessonSpec,
  finalConfig.heuristicThresholds,
  language  // ✅ Guaranteed non-undefined
);

// In database-service.ts:22
export async function handlePartialSuccess(
  ...,
  language: string = 'en'  // ⚠️ Could be undefined if caller passes undefined
)
```

**Recommended Fix**: Standardize to always validate at entry point:

```typescript
// At function entry, normalize undefined to 'en'
const normalizedLanguage = language || 'en';
```

---

### 7. 🟡 Missing Validation in Cascade Evaluator

**File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/cascade-evaluator.ts:731`

**Issue**:

```typescript
const labels = getContentLabels(input.language || 'en');
```

**Problem**: No validation that `input.language` is a VALID language code. Could be any string.

**Recommended Fix**: Add validation at cascade entry point:

```typescript
// At executeCascadeEvaluation entry (line 1067)
const language = languageSchema.safeParse(input.language).success ? input.language : 'en';

if (!languageSchema.safeParse(input.language).success && input.language) {
  logger.warn(
    { invalidLanguage: input.language, fallback: 'en' },
    'Invalid language code in cascade evaluation input'
  );
}
```

---

### 8. 🟡 No Validation for Language in All Callers

**Files**: `job-processor.ts`, `cascade-evaluator.ts`, `clev-voter.ts`

**Issue**: Functions pass `language` without validating it's a supported language code.

**Risk**: Garbage values like `'unknown'`, `''`, `null` could propagate through the system.

**Recommended Fix**: Create a utility validator:

```typescript
// In @megacampus/shared-types
export function validateLanguageCode(code: unknown): Language {
  const parsed = languageSchema.safeParse(code);
  return parsed.success ? parsed.data : 'en';
}
```

Then use at all entry points:

```typescript
const language = validateLanguageCode(job.data.language);
```

---

## Medium Priority Issues (Fix Soon)

### 9. 🟢 Translation Quality Not Verified

**File**: `packages/shared-types/src/common-enums.ts:114-361`

**Issue**: Added translations for 19 languages but no verification of translation quality.

**Concerns**:

1. **Native speaker review**: Were translations reviewed by native speakers?
2. **Educational terminology**: Are educational terms (Упражнение, Exercice, 練習) appropriate?
3. **Regional variants**: Portuguese (pt) - Brazilian or European?

**Example Potential Issues**:

```typescript
// Chinese (zh):
examples: '示例',  // Is this the right term for educational examples?
exercises: '练习', // Does this mean "practice" or "exercise"?

// Arabic (ar):
introduction: 'مقدمة', // Right-to-left rendering tested?
```

**Recommended Fix**:

1. Create translation verification task for Beads
2. Get native speaker review for each language
3. Add comments indicating regional variant (e.g., `pt-BR` vs `pt-PT`)

**Impact**: Medium - May confuse users if terminology is unnatural

---

### 10. 🟢 No Tests for i18n Functionality

**Missing Tests**:

1. Test `getContentLabels()` for all 19 languages
2. Test fallback behavior for invalid codes
3. Test parameter passing through call chain
4. Test export-lessons.ts with different languages
5. Test cascade evaluator with Russian content

**Recommended Tests**:

```typescript
describe('i18n Content Labels', () => {
  it('should return correct labels for all supported languages', () => {
    SUPPORTED_LANGUAGES.forEach(lang => {
      const labels = getContentLabels(lang);
      expect(labels.introduction).toBeDefined();
      expect(labels.exercises).toBeDefined();
    });
  });

  it('should fall back to English for invalid language', () => {
    const labels = getContentLabels('invalid');
    expect(labels).toEqual(CONTENT_LABELS.en);
  });

  it('should warn in development for invalid language', () => {
    const warnSpy = jest.spyOn(console, 'warn');
    getContentLabels('invalid');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unknown language code: "invalid"')
    );
  });
});

describe('extractContentMarkdown with language', () => {
  it('should use localized headers for Russian', () => {
    const markdown = extractContentMarkdown(lessonContent, 'ru');
    expect(markdown).toContain('Примеры'); // Russian for "Examples"
    expect(markdown).toContain('Упражнения'); // Russian for "Exercises"
  });

  it('should default to English if language not provided', () => {
    const markdown = extractContentMarkdown(lessonContent);
    expect(markdown).toContain('Examples');
    expect(markdown).toContain('Exercises');
  });
});
```

**Impact**: Medium - Risk of regressions without test coverage

---

### 11. 🟢 Documentation Missing

**Missing Documentation**:

1. No README explaining i18n support
2. No guide for adding new languages
3. No documentation of translation sources

**Recommended Documentation**:

````markdown
# i18n Content Localization

## Supported Languages

We support 19 languages for lesson content headers. See `SUPPORTED_LANGUAGES` in `common-enums.ts`.

## Adding a New Language

1. Add language code to `languageSchema` enum
2. Add full name to `LANGUAGE_NAMES` mapping
3. Add translations to `CONTENT_LABELS` with native speaker review
4. Update tests to cover new language
5. Test with actual lesson generation in that language

## Translation Sources

- **Russian (ru)**: Reviewed by native speaker
- **Chinese (zh)**: Reviewed by native speaker
- **Others**: Generated by LLM, requires native review

## Testing

Run i18n tests:

```bash
pnpm test --grep="i18n"
```
````

````

**Impact**: Medium - Maintainability issue

---

### 12. 🟢 Flesch-Kincaid Logic Only for English

**File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/cascade-evaluator.ts:620-647`

**Issue**: Flesch-Kincaid readability check is correctly skipped for non-English, but the **implementation is well-documented**:

```typescript
// Calculate Flesch-Kincaid grade level (ONLY for English)
// Flesch-Kincaid uses English syllable counting (/[aeiouy]+/g) which doesn't work for:
// - Russian (Cyrillic): а, е, и, о, у, ы, э, ю, я
// - Spanish, German, French, etc. (different vowel patterns)
const isEnglish = language === 'en' || language === 'english';
const fleschKincaidSkipped = !isEnglish;
````

**Observation**: This is CORRECT behavior. Including here to acknowledge the limitation.

**Future Enhancement**: Consider adding language-specific readability metrics:

- Russian: Flesch-Kincaid Russian adaptation
- Chinese: Character complexity metrics
- Others: SMOG, Gunning Fog alternatives

**Impact**: Low - Current implementation is correct

---

## Low Priority Issues (Nice to Have)

### 13. 🔵 Performance: Repeated `getContentLabels()` Calls

**Files**: `cascade-evaluator.ts`, `clev-voter.ts`, `generator-content.ts`

**Issue**: `getContentLabels()` is called multiple times with same language in same request.

**Example**:

```typescript
// In buildSingleJudgePrompt (cascade-evaluator.ts:731)
const labels = getContentLabels(input.language || 'en');

// In buildJudgePrompt (clev-voter.ts:194)
const labels = getContentLabels(input.language || 'en');

// Both called for same lesson evaluation
```

**Impact**: Negligible (object lookup is O(1)), but could be optimized with memoization:

```typescript
const labelCache = new Map<string, typeof CONTENT_LABELS.en>();

export function getContentLabels(code: string): typeof CONTENT_LABELS.en {
  if (labelCache.has(code)) {
    return labelCache.get(code)!;
  }

  const labels = CONTENT_LABELS[code as Language] || CONTENT_LABELS.en;
  labelCache.set(code, labels);
  return labels;
}
```

**Impact**: Low - Premature optimization

---

### 14. 🔵 Missing Language in CLEV Judge Logs

**File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/clev-voter.ts:680-691`

**Issue**: CLEV voting logs don't include `language` parameter for debugging:

```typescript
logger.info(
  {
    lessonId: input.lessonSpec.lesson_id,
    language,  // ⚠️ Not included in log
    primaryJudge: judgeModels.primary.displayName,
    ...
  },
  'Starting CLEV voting evaluation'
);
```

**Recommended Fix**:

```typescript
logger.info(
  {
    lessonId: input.lessonSpec.lesson_id,
    language: input.language || 'en',  // Add language to logs
    primaryJudge: judgeModels.primary.displayName,
    ...
  },
  'Starting CLEV voting evaluation with language-aware judge selection'
);
```

**Impact**: Low - Debugging improvement

---

## Translation Verification Checklist

The following translations should be verified by native speakers:

| Language   | Code | Status          | Fields to Verify            |
| ---------- | ---- | --------------- | --------------------------- |
| Russian    | ru   | ⚠️ Needs review | hints, examples, yourAnswer |
| Chinese    | zh   | ⚠️ Needs review | All fields                  |
| Spanish    | es   | ⚠️ Needs review | All fields                  |
| French     | fr   | ⚠️ Needs review | All fields                  |
| German     | de   | ⚠️ Needs review | All fields                  |
| Japanese   | ja   | ⚠️ Needs review | All fields                  |
| Korean     | ko   | ⚠️ Needs review | All fields                  |
| Arabic     | ar   | ⚠️ Needs review | All fields + RTL testing    |
| Portuguese | pt   | ⚠️ Needs review | Regional variant (BR vs PT) |
| Italian    | it   | ⚠️ Needs review | All fields                  |
| Turkish    | tr   | ⚠️ Needs review | All fields                  |
| Vietnamese | vi   | ⚠️ Needs review | All fields                  |
| Thai       | th   | ⚠️ Needs review | All fields                  |
| Indonesian | id   | ⚠️ Needs review | All fields                  |
| Malay      | ms   | ⚠️ Needs review | All fields                  |
| Hindi      | hi   | ⚠️ Needs review | All fields                  |
| Bengali    | bn   | ⚠️ Needs review | All fields                  |
| Polish     | pl   | ⚠️ Needs review | All fields                  |

**Note**: All translations appear to be machine-generated and need native speaker validation.

---

## Edge Cases Analysis

### Case 1: Language is `null`

**Scenario**: `course.language = null` in database

**Current Behavior**:

```typescript
const labels = getContentLabels((course?.language as string) || 'en');
// null is falsy, so fallback to 'en' works ✅
```

**Result**: ✅ Handled correctly by fallback

---

### Case 2: Language is Empty String

**Scenario**: `course.language = ''` in database

**Current Behavior**:

```typescript
const labels = getContentLabels((course?.language as string) || 'en');
// '' is falsy, so fallback to 'en' works ✅
```

**Result**: ✅ Handled correctly by fallback

---

### Case 3: Language is Undefined

**Scenario**: `job.data.language = undefined`

**Current Behavior**:

```typescript
// job-processor.ts:247
const { language } = job.data;
// language = undefined

// Later called:
extractContentMarkdown(result.lessonContent, language);
// Signature: extractContentMarkdown(content: LessonContent, language: string = 'en')
// undefined !== string, so default 'en' is used ✅
```

**Result**: ✅ Handled correctly by default parameter

---

### Case 4: Language is Invalid Code

**Scenario**: `course.language = 'invalid'`

**Current Behavior**:

```typescript
const labels = getContentLabels('invalid');
// Returns CONTENT_LABELS.en (fallback)
// ⚠️ No warning in production
```

**Result**: ⚠️ Silent fallback - See Critical Issue #4

---

### Case 5: Course Has No Language Field

**Scenario**: Old course created before language field added

**Current Behavior**:

```typescript
const { data: course } = await supabase.from('courses').select('title, language').single();

// course.language = undefined
const labels = getContentLabels((course?.language as string) || 'en');
// Fallback to 'en' ✅
```

**Result**: ✅ Handled correctly

---

### Case 6: Parameter Order Confusion

**Scenario**: Developer forgets optional parameter in middle

**Current Behavior**:

```typescript
// Intended:
saveLessonContent(courseId, lessonLabel, result, undefined, 'ru');

// Accidentally:
saveLessonContent(courseId, lessonLabel, result, 'ru');
// TypeScript interprets 'ru' as sanityResult (SanityCheckResult | undefined)
// Type error! ✅ Caught by TypeScript
```

**Result**: ✅ TypeScript catches this error

**BUT**: If caller passes wrong type that happens to be assignable:

```typescript
saveLessonContent(courseId, lessonLabel, result, { ok: true } as any, 'ru');
// Type assertion bypasses check ⚠️
```

**Result**: ⚠️ See Critical Issue #2

---

## Recommendations Summary

### Immediate Actions (Critical)

1. **Add language validation** in `export-lessons.ts` using Zod schema
2. **Reorder parameters** in `handlePartialSuccess()` and `saveLessonContent()`
3. **Validate language** at entry point in `job-processor.ts`
4. **Always log warnings** in `getContentLabels()` (not just in development)
5. **Add language field** to course query in `checkAndSetStage6Complete()`

### Before Next Release

6. **Standardize parameter handling** across all functions
7. **Add validation** in cascade evaluator entry point
8. **Create validation utility** for language codes
9. **Get native speaker review** for all 19 language translations
10. **Write comprehensive tests** for i18n functionality
11. **Document i18n support** with guide for adding languages

### Future Improvements

12. **Add language-specific readability metrics** (alternative to Flesch-Kincaid)
13. **Consider memoization** for repeated `getContentLabels()` calls
14. **Add language to debug logs** in CLEV voter

---

## Testing Recommendations

### Unit Tests

```typescript
// packages/shared-types/src/__tests__/common-enums.test.ts
describe('getContentLabels', () => {
  test('returns correct labels for each language', () => {
    SUPPORTED_LANGUAGES.forEach(lang => {
      const labels = getContentLabels(lang);
      expect(labels.introduction).toBeTruthy();
      expect(labels.exercises).toBeTruthy();
    });
  });

  test('falls back to English for invalid language', () => {
    expect(getContentLabels('invalid')).toEqual(CONTENT_LABELS.en);
  });

  test('handles null and undefined', () => {
    expect(getContentLabels(null as any)).toEqual(CONTENT_LABELS.en);
    expect(getContentLabels(undefined as any)).toEqual(CONTENT_LABELS.en);
  });
});

// packages/course-gen-platform/src/stages/stage6-lesson-content/services/__tests__/content-utils.test.ts
describe('extractContentMarkdown', () => {
  test('uses Russian headers for Russian language', () => {
    const content = createMockContent();
    const markdown = extractContentMarkdown(content, 'ru');
    expect(markdown).toContain('Примеры');
    expect(markdown).toContain('Упражнения');
  });

  test('defaults to English when language not provided', () => {
    const content = createMockContent();
    const markdown = extractContentMarkdown(content);
    expect(markdown).toContain('Examples');
    expect(markdown).toContain('Exercises');
  });
});
```

### Integration Tests

```typescript
// packages/course-gen-platform/tests/integration/stage6/language-support.test.ts
describe('Stage 6 Language Support', () => {
  test('generates lesson with Russian headers', async () => {
    const job = createStage6Job({ language: 'ru' });
    const result = await processStage6Job(job);

    // Verify Russian headers in output
    const markdown = result.lessonContent.markdownContent;
    expect(markdown).toContain('Упражнения');
  });

  test('falls back to English for invalid language', async () => {
    const job = createStage6Job({ language: 'invalid' });
    const result = await processStage6Job(job);

    const markdown = result.lessonContent.markdownContent;
    expect(markdown).toContain('Exercises');
  });
});
```

---

## Conclusion

The i18n localization implementation is **architecturally sound** with good fallback mechanisms, but requires **5 critical fixes** before production:

1. Type-safe language validation in export-lessons.ts
2. Parameter order fix in database-service.ts
3. Language validation in job-processor.ts entry point
4. Production logging in getContentLabels()
5. Language field in checkAndSetStage6Complete()

Additionally, **translation quality verification** by native speakers is essential for all 19 languages to ensure professional quality.

**Recommendation**: ⚠️ **CONDITIONAL PASS** - Merge after addressing critical issues #1-5 and scheduling translation review for next sprint.

---

**Review completed**: 2026-02-04
**Next review**: After critical fixes implemented
**Follow-up**: Schedule translation verification with native speakers
