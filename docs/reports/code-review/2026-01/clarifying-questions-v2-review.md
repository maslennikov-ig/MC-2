# Code Review: Clarifying Questions v2

## Summary

- Total issues: 18
- Critical: 3 | High: 5 | Medium: 7 | Low: 3

**Overall Status**: ⚠️ REQUIRES ATTENTION

The implementation is functionally sound with good separation of concerns, but contains several critical issues around race conditions, type safety, and potential memory/performance problems that should be addressed before production use.

---

## Executive Summary

### Strengths

- ✅ Well-structured schema validation with Zod
- ✅ Comprehensive error handling and logging
- ✅ Good separation between backend and frontend concerns
- ✅ XSS protection with DOMPurify sanitization
- ✅ Rate limiting on tRPC endpoints
- ✅ Atomic operations with RPC functions

### Critical Areas

- ❌ Race condition in status transitions (approveAndProceed)
- ❌ Type casting issues with Supabase JSONB columns
- ❌ Potential memory leak in React ref cleanup (ClarifyingPanel)

---

## Issues

### [CRITICAL-001] Race Condition in Status Transition

**File:** `/home/me/code/mc2/packages/course-gen-platform/src/server/routers/clarifying.router.ts:1007-1027`
**Category:** Bug
**Description:** Despite using atomic RPC function `approve_and_proceed_atomic`, there's a defensive status check after the RPC that could still fail due to race conditions. The gap between RPC success and status verification allows concurrent operations to change the status.

**Impact:**

- Job could be enqueued multiple times if multiple users/tabs click "Continue" simultaneously
- Could lead to duplicate work and wasted resources
- Status check at line 1013 may detect race but user gets confusing error

**Recommendation:**

1. Move job enqueueing INSIDE the RPC function to make it truly atomic
2. OR: Add a unique constraint on `(course_id, job_type, status)` in a jobs tracking table
3. OR: Use Redis locking for the entire approve-proceed operation

**Code:**

```typescript
// CURRENT (vulnerable to race)
const { data: rpcResult, error: rpcError } = await supabase.rpc(
  'approve_and_proceed_atomic',
  { p_course_id: courseId, ... }
);

// Status check here - gap allows race condition
const { data: statusCheck } = await typedSupabase
  .from('courses')
  .select('generation_status')
  .eq('id', courseId)
  .single();

if (statusCheck?.generation_status !== 'stage_4_analyzing') {
  throw new TRPCError({ code: 'CONFLICT', ... });
}

// Job creation - could happen twice
const job = await addJob(JobType.STRUCTURE_ANALYSIS, jobData, { priority });

// RECOMMENDED
// Move job creation inside RPC function or use distributed lock
```

---

### [CRITICAL-002] Unsafe Type Casting for JSONB Columns

**File:** `/home/me/code/mc2/packages/course-gen-platform/src/server/routers/clarifying.router.ts:184-186`
**Category:** Security | Bug
**Description:** Function `getTypedSupabaseAdmin()` returns `any` type to bypass TypeScript checks for the `clarifying_questions` table. This removes all type safety when working with JSONB columns.

**Impact:**

- No compile-time validation of JSONB structure
- Runtime errors if JSONB format changes
- SQL injection risk if JSONB values aren't properly validated

**Recommendation:**

1. Generate TypeScript types from database schema using Supabase CLI
2. OR: Create explicit interface for the table and use type assertion
3. Add runtime validation for all JSONB reads with Zod

**Code:**

```typescript
// CURRENT (unsafe)
function getTypedSupabaseAdmin() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return getSupabaseAdmin() as any;
}

// RECOMMENDED
import { Database } from '@/types/supabase';

function getTypedSupabaseAdmin() {
  return getSupabaseAdmin() as SupabaseClient<Database>;
}

// OR: Use Zod validation
const UserAnswerSchema = z.object({
  value: z.string().optional(),
  values: z.array(z.string()).optional(),
});

const answer = UserAnswerSchema.parse(question.user_answer);
```

---

### [CRITICAL-003] Memory Leak in Ref Cleanup

**File:** `/home/me/code/mc2/packages/web/components/generation-graph/panels/clarifying/ClarifyingPanel.tsx:124-135`
**Category:** Performance | Bug
**Description:** The `useEffect` cleanup for `questionRefs` only removes stale refs, but doesn't clean up the Map when component unmounts. According to Context7 React docs, ref callbacks should return cleanup functions.

**Impact:**

- Memory leak if component remounts frequently
- Stale DOM node references accumulate
- Could cause scroll-to issues if refs point to unmounted elements

**Recommendation:**
Use ref callback pattern with cleanup function instead of imperative ref management.

**Code:**

```typescript
// CURRENT (memory leak risk)
useEffect(() => {
  const currentIds = new Set(questions.map((q) => q.id))
  for (const id of questionRefs.current.keys()) {
    if (!currentIds.has(id)) {
      questionRefs.current.delete(id)
    }
  }
}, [questions])

// In JSX
<div
  key={question.id}
  ref={(el) => {
    if (el) questionRefs.current.set(question.id, el)
    // ❌ No cleanup function
  }}
>

// RECOMMENDED (with cleanup)
<div
  key={question.id}
  ref={(node) => {
    if (node) {
      questionRefs.current.set(question.id, node);

      // ✅ Return cleanup function
      return () => {
        questionRefs.current.delete(question.id);
      };
    }
  }}
>
```

---

### [HIGH-001] Missing Validation for Multi-Choice Answer Limits

**File:** `/home/me/code/mc2/packages/course-gen-platform/src/server/routers/clarifying.router.ts:74`
**Category:** Bug | Quality
**Description:** The `answers` array has a max of 10 items, but there's no validation that selected indexes are within suggestion bounds or that the count makes sense for the question.

**Impact:**

- Users could submit 10 answers when only 3-6 options exist
- Server accepts invalid data that doesn't match suggested_answers
- Could cause frontend crashes when rendering answers

**Recommendation:**
Add validation to ensure answers match available suggestions.

**Code:**

```typescript
// CURRENT
answers: z
  .array(
    z.string().transform(s => s.trim()).pipe(z.string().min(1).max(10000))
  )
  .min(1, 'At least one answer required')
  .max(10, 'Too many answers') // ❌ No check against suggestion count
  .optional(),

// RECOMMENDED
// In mutation handler, add validation:
if (isMultiChoice && selectedSuggestionIndexes) {
  const maxAllowed = question.suggested_answers?.length || 0;
  if (selectedSuggestionIndexes.length > maxAllowed) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Cannot select more than ${maxAllowed} options`,
    });
  }

  // Validate each index is unique
  if (new Set(selectedSuggestionIndexes).size !== selectedSuggestionIndexes.length) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Duplicate selections detected',
    });
  }
}
```

---

### [HIGH-002] Auto-Answer Rate Limiting Risk

**File:** `/home/me/code/mc2/packages/web/components/generation-graph/panels/clarifying/ClarifyingPanel.tsx:232-258`
**Category:** Performance | Bug
**Description:** The `handleAcceptAll` function submits answers sequentially with 100ms delay. With 30 req/min rate limit (2000ms between allowed requests), this will fail after ~6 questions.

**Impact:**

- Feature breaks for courses with 7+ questions
- Silent failures after rate limit hit (logged but not shown to user)
- Poor UX - button works partially

**Recommendation:**

1. Batch submit all answers in single tRPC mutation
2. OR: Increase delay to 2100ms (but then 10 questions = 21 seconds wait)
3. OR: Implement backend "accept all" endpoint

**Code:**

```typescript
// CURRENT (rate limit violation)
for (const q of unanswered) {
  await submitAnswerMutation.mutateAsync({ ... });
  await new Promise((r) => setTimeout(r, 100)); // ❌ 100ms too fast
}

// RECOMMENDED (batch mutation)
// Create new endpoint: clarifying.submitMultipleAnswers
const handleAcceptAll = async () => {
  const submissions = unanswered.map(q => ({
    questionId: q.id,
    answer: q.suggestedAnswers[0].text,
    answerSource: 'suggested' as const,
    selectedSuggestionIndex: 0,
  }));

  await submitMultipleAnswersMutation.mutateAsync({ submissions });
};
```

---

### [HIGH-003] Missing Transaction Rollback on Parallel Update Failures

**File:** `/home/me/code/mc2/packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-0.5-clarifying.ts:766-789`
**Category:** Bug | Quality
**Description:** The `autoAnswerAllQuestions` function uses parallel updates via `Promise.all`, but doesn't rollback successful updates if some fail. This leaves the database in inconsistent state.

**Impact:**

- Partial auto-answer: some questions answered, others not
- User sees "auto-answer failed" but can't tell which questions were answered
- Retry will attempt to answer already-answered questions

**Recommendation:**
Use Supabase transaction or sequential updates with rollback.

**Code:**

```typescript
// CURRENT (no rollback)
const results = await Promise.all(updatePromises);
const failedCount = results.filter(r => r.error).length;

if (failedCount > 0) {
  logger.error({ courseId, failedCount }, 'Some auto-answer updates failed');
  // ❌ No rollback of successful updates
}

// RECOMMENDED (with transaction)
// Use Supabase RPC function for atomic batch update
const { data, error } = await supabase.rpc('auto_answer_all_atomic', {
  p_course_id: courseId,
  p_answers: updates,
});

// OR: Sequential with rollback
const updatedIds: string[] = [];
try {
  for (const update of updates) {
    await supabase.from('clarifying_questions').update(...).eq('id', update.id);
    updatedIds.push(update.id);
  }
} catch (error) {
  // Rollback
  await supabase
    .from('clarifying_questions')
    .update({ status: 'pending', user_answer: null, ... })
    .in('id', updatedIds);
  throw error;
}
```

---

### [HIGH-004] Unvalidated JSONB Read in Frontend

**File:** `/home/me/code/mc2/packages/web/components/generation-graph/panels/clarifying/ClarifyingPanel.tsx:86-100`
**Category:** Bug | Security
**Description:** The code reads `user_answer` from API and assumes it has `value` or `values` properties, but doesn't validate structure before accessing.

**Impact:**

- Runtime error if JSONB structure changes
- Undefined behavior if backend sends unexpected format
- Could break entire component rendering

**Recommendation:**
Add Zod validation or type guard before accessing properties.

**Code:**

```typescript
// CURRENT (unsafe)
if (userAnswer.value) {
  currentAnswer = DOMPurify.sanitize(userAnswer.value);
} else if (userAnswer.values) {
  currentAnswers = userAnswer.values.map(v => DOMPurify.sanitize(v));
}

// RECOMMENDED
const UserAnswerSchema = z.union([
  z.object({ value: z.string() }),
  z.object({ values: z.array(z.string()) }),
  z.string(), // legacy format
]);

const parseUserAnswer = (raw: unknown): { currentAnswer?: string; currentAnswers?: string[] } => {
  try {
    const validated = UserAnswerSchema.parse(raw);

    if (typeof validated === 'string') {
      return { currentAnswer: DOMPurify.sanitize(validated) };
    }
    if ('value' in validated) {
      return { currentAnswer: DOMPurify.sanitize(validated.value) };
    }
    if ('values' in validated) {
      return {
        currentAnswers: validated.values.map(v => DOMPurify.sanitize(v)),
        currentAnswer: validated.values.map(v => DOMPurify.sanitize(v)).join(', '),
      };
    }
  } catch {
    logger.warn({ raw }, 'Invalid user_answer format');
  }
  return {};
};

const { currentAnswer, currentAnswers } = parseUserAnswer(userAnswer);
```

---

### [HIGH-005] Auto-Scroll Race Condition

**File:** `/home/me/code/mc2/packages/web/components/generation-graph/panels/clarifying/ClarifyingPanel.tsx:162-180`
**Category:** Bug | UX
**Description:** The auto-scroll effect compares `answeredQuestions.size` with a ref counter, but this can trigger unexpectedly during concurrent answer submissions or refetches.

**Impact:**

- Scroll jumps during batch operations
- Could scroll away from current question while user is typing
- Race between mutation success and state update

**Recommendation:**
Debounce scroll or tie it directly to mutation success callback.

**Code:**

```typescript
// CURRENT (can trigger unexpectedly)
useEffect(() => {
  const currentCount = answeredQuestions.size;
  if (currentCount > prevAnsweredCount.current) {
    prevAnsweredCount.current = currentCount;
    // Scroll logic
  }
}, [answeredQuestions, questions]);

// RECOMMENDED
const handleAnswer = (questionId, answer, source, ...) => {
  void submitAnswerMutation
    .mutateAsync(payload)
    .then(() => {
      setAnsweredQuestions((prev) => new Set(prev).add(questionId));

      // ✅ Scroll only after THIS specific answer
      const nextUnanswered = questions.find(
        q => !prev.has(q.id) && q.id !== questionId
      );
      if (nextUnanswered) {
        const element = questionRefs.current.get(nextUnanswered.id);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    });
};

// Remove the useEffect entirely
```

---

### [MEDIUM-001] Missing Index on JSONB Query Path

**File:** `/home/me/code/mc2/packages/course-gen-platform/supabase/migrations/20260127_question_types.sql:92-93`
**Category:** Performance
**Description:** The migration adds index on `(course_id, question_type)` but doesn't add GIN index for JSONB column `user_answer` which will be queried frequently.

**Impact:**

- Slow queries when filtering by answer content
- No performance benefit for JSONB path lookups
- Could cause slow admin queries if searching within answers

**Recommendation:**
Add GIN index for JSONB column.

**Code:**

```sql
-- CURRENT
CREATE INDEX IF NOT EXISTS idx_clarifying_questions_question_type
ON clarifying_questions (course_id, question_type);

-- RECOMMENDED (add GIN index for JSONB)
CREATE INDEX IF NOT EXISTS idx_clarifying_questions_user_answer_gin
ON clarifying_questions USING GIN (user_answer);

-- For specific path queries:
CREATE INDEX IF NOT EXISTS idx_clarifying_questions_answer_value
ON clarifying_questions ((user_answer->>'value'));
```

---

### [MEDIUM-002] No Validation for Question Type Transition

**File:** `/home/me/code/mc2/packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-0.5-clarifying.ts:341`
**Category:** Quality
**Description:** When storing questions, code defaults to 'open' type for backwards compatibility, but doesn't validate that the default matches the suggested_answers structure.

**Impact:**

- Could store 'open' type with 6 suggestions (more typical for multi_choice)
- Frontend might render incorrectly if type/suggestions mismatch
- No migration path from old 'open' questions to new types

**Recommendation:**
Add validation that question_type matches suggested_answers count and structure.

**Code:**

```typescript
// CURRENT
const rows = questions.map((q, index) => ({
  // ...
  question_type: q.question_type || 'open', // ❌ No validation
  suggested_answers: q.suggested_answers,
  // ...
}));

// RECOMMENDED
const rows = questions.map((q, index) => {
  const questionType = q.question_type || 'open';
  const suggestionCount = q.suggested_answers.length;

  // Validate type matches suggestion structure
  if (questionType === 'open' && suggestionCount > 3) {
    logger.warn(
      { questionText: q.question_text, suggestionCount },
      'Open question has many suggestions, consider multi_choice'
    );
  }

  if (questionType === 'multi_choice' && suggestionCount < 3) {
    throw new Error(`Multi-choice question "${q.question_text}" needs at least 3 options`);
  }

  return {
    // ...
    question_type: questionType,
    suggested_answers: q.suggested_answers,
    // ...
  };
});
```

---

### [MEDIUM-003] Hardcoded String Values Instead of Enum

**File:** `/home/me/code/mc2/packages/web/components/generation-graph/panels/clarifying/QuestionCard.tsx:56-78`
**Category:** Quality
**Description:** Priority and type configurations use hardcoded string keys instead of importing from shared types package.

**Impact:**

- Duplication between frontend and backend
- Risk of typo causing missing config (falls back to undefined behavior)
- No compile-time validation

**Recommendation:**
Import enums from `@megacampus/shared-types` and use them as keys.

**Code:**

```typescript
// CURRENT (hardcoded)
const priorityConfig = {
  critical: { ... },
  important: { ... },
  nice_to_have: { ... },
};

// RECOMMENDED
import { QuestionPriority, QuestionType } from '@megacampus/shared-types';

const priorityConfig: Record<QuestionPriority, { ... }> = {
  [QuestionPriority.CRITICAL]: { ... },
  [QuestionPriority.IMPORTANT]: { ... },
  [QuestionPriority.NICE_TO_HAVE]: { ... },
} as const;

// This gives TypeScript exhaustiveness checking
```

---

### [MEDIUM-004] Missing Loading State in QuestionCard

**File:** `/home/me/code/mc2/packages/web/components/generation-graph/panels/clarifying/QuestionCard.tsx:106-116`
**Category:** UX | Quality
**Description:** The card component receives `isProcessing` prop but doesn't show visual loading indicator on the card itself, only on buttons.

**Impact:**

- User can't tell which card is being saved
- Could try to edit another question while first is saving
- Confusing UX during batch operations

**Recommendation:**
Add loading overlay or skeleton state to card during processing.

**Code:**

```typescript
// RECOMMENDED
return (
  <motion.div {...}>
    <Card className={cn(priorityConf.card, 'overflow-hidden', {
      'opacity-50 pointer-events-none': isProcessing, // ✅ Visual feedback
    })}>
      {isProcessing && (
        <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-purple-600" />
        </div>
      )}
      <CardContent className="space-y-4 p-4">
        {/* ... */}
      </CardContent>
    </Card>
  </motion.div>
);
```

---

### [MEDIUM-005] Overly Permissive Zod Schema for Text Fields

**File:** `/home/me/code/mc2/packages/course-gen-platform/src/server/routers/clarifying.router.ts:60-64`
**Category:** Security | Quality
**Description:** Answer text fields allow up to 10,000 characters with only trim validation. No check for malicious content, excessive whitespace, or non-printable characters.

**Impact:**

- Users could submit very long answers that slow down rendering
- Could inject control characters or unicode attacks
- Database bloat if users paste large documents

**Recommendation:**
Add stricter validation and content checks.

**Code:**

```typescript
// CURRENT
answer: z
  .string()
  .transform(s => s.trim())
  .pipe(z.string().min(3, 'Answer must be at least 3 characters').max(10000))
  .optional(),

// RECOMMENDED
const sanitizeText = (text: string): string => {
  return text
    .trim()
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control chars
    .slice(0, 5000); // Hard limit
};

answer: z
  .string()
  .transform(sanitizeText)
  .pipe(
    z.string()
      .min(3, 'Answer must be at least 3 characters')
      .max(5000, 'Answer too long (max 5000 characters)')
      .refine(
        (val) => val.split(/\s+/).length <= 1000,
        'Answer exceeds word limit (max 1000 words)'
      )
  )
  .optional(),
```

---

### [MEDIUM-006] No Error Boundary in ClarifyingPanel

**File:** `/home/me/code/mc2/packages/web/components/generation-graph/panels/clarifying/ClarifyingPanel.tsx`
**Category:** Bug | UX
**Description:** Component has no error boundary to catch rendering errors. If DOMPurify fails, JSONB parsing fails, or any child throws, entire panel crashes.

**Impact:**

- White screen of death if any question has malformed data
- No way to recover without page reload
- Poor UX - user loses all progress

**Recommendation:**
Wrap in ErrorBoundary or add try-catch to mapping function.

**Code:**

```typescript
// RECOMMENDED
import { ErrorBoundary } from 'react-error-boundary';

export function ClarifyingPanel({ courseId, onComplete }: ClarifyingPanelProps) {
  // ... existing code ...

  return (
    <ErrorBoundary
      fallback={
        <Card className="p-6">
          <div className="text-center space-y-4">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto" />
            <h3 className="text-lg font-semibold">Ошибка загрузки вопросов</h3>
            <p className="text-sm text-slate-600">
              Не удалось отобразить вопросы. Попробуйте обновить страницу.
            </p>
            <Button onClick={() => window.location.reload()}>
              Обновить страницу
            </Button>
          </div>
        </Card>
      }
      onError={(error) => {
        logger.error({ courseId, error: error.message }, 'ClarifyingPanel crashed');
      }}
    >
      <div className="space-y-4">
        {/* ... existing render ... */}
      </div>
    </ErrorBoundary>
  );
}
```

---

### [MEDIUM-007] Incomplete Migration Rollback Strategy

**File:** `/home/me/code/mc2/packages/course-gen-platform/supabase/migrations/20260127_question_types.sql`
**Category:** Quality
**Description:** Migration is idempotent for forward direction but provides no rollback script. If JSONB conversion corrupts data, no way to revert.

**Impact:**

- Can't rollback if migration causes issues in production
- Data could be stuck in JSONB format if feature needs to be reverted
- No testing strategy for rollback path

**Recommendation:**
Create separate rollback migration file.

**Code:**

```sql
-- RECOMMENDED: Create 20260127_question_types_rollback.sql
-- ============================================================================
-- ROLLBACK: Convert user_answer from JSONB back to TEXT
-- ============================================================================

-- Step 1: Convert JSONB -> TEXT
DO $$
DECLARE
    current_type TEXT;
BEGIN
    SELECT data_type INTO current_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'clarifying_questions'
    AND column_name = 'user_answer';

    IF current_type = 'jsonb' THEN
        -- Extract 'value' from {"value": "text"} or join 'values' array
        ALTER TABLE clarifying_questions
        ALTER COLUMN user_answer TYPE TEXT
        USING CASE
            WHEN user_answer IS NULL THEN NULL
            WHEN user_answer ? 'value' THEN user_answer->>'value'
            WHEN user_answer ? 'values' THEN array_to_string(
                ARRAY(SELECT jsonb_array_elements_text(user_answer->'values')),
                ', '
            )
            ELSE NULL
        END;

        RAISE NOTICE 'Converted user_answer from JSONB to TEXT';
    END IF;
END $$;

-- Step 2: Drop question_type column
ALTER TABLE clarifying_questions DROP COLUMN IF EXISTS question_type;

-- Step 3: Drop indexes
DROP INDEX IF EXISTS idx_clarifying_questions_question_type;
```

---

### [LOW-001] Inconsistent Error Messages

**File:** Multiple files
**Category:** Quality | UX
**Description:** Error messages mix English and Russian, use different formats, and don't follow consistent pattern.

**Impact:**

- Confusing for users (language switching)
- Hard to localize later
- Inconsistent UX

**Recommendation:**
Centralize error messages in i18n files and use consistent format.

**Examples:**

```typescript
// phase-0.5-clarifying.ts:408
throw new Error(`Invalid Phase 0.5 input: ${errorMessage}`);

// clarifying.router.ts:218
message: ('Course not found',
  // ClarifyingPanel.tsx:213
  toast.error('Не удалось сохранить ответ', {
    description: error.message || 'Попробуйте ещё раз',
  }));
```

**Recommended:**

```typescript
// Create shared error messages
export const CLARIFYING_ERRORS = {
  COURSE_NOT_FOUND: {
    en: 'Course not found',
    ru: 'Курс не найден',
  },
  SAVE_ANSWER_FAILED: {
    en: 'Failed to save answer',
    ru: 'Не удалось сохранить ответ',
  },
  // ...
} as const;

// Use in components
toast.error(CLARIFYING_ERRORS.SAVE_ANSWER_FAILED[language]);
```

---

### [LOW-002] Magic Numbers in Rate Limiting

**File:** `/home/me/code/mc2/packages/course-gen-platform/src/server/routers/clarifying.router.ts:392, 629, 925`
**Category:** Quality
**Description:** Rate limit values (60, 30, 10 requests per window) are hardcoded without explanation of why these specific values.

**Impact:**

- Hard to tune rate limits without understanding rationale
- Could be too restrictive or too permissive for actual usage patterns
- No differentiation by tier/plan

**Recommendation:**
Extract to configuration with comments explaining rationale.

**Code:**

```typescript
// RECOMMENDED: Create rate limit config
export const CLARIFYING_RATE_LIMITS = {
  GET_QUESTIONS: {
    requests: 60,
    windowSeconds: 60,
    reason: 'Read-heavy endpoint, allow frequent polling',
  },
  SUBMIT_ANSWER: {
    requests: 30,
    windowSeconds: 60,
    reason: 'User typically answers 1-7 questions, allow burst with buffer',
  },
  APPROVE_AND_PROCEED: {
    requests: 10,
    windowSeconds: 60,
    reason: 'Job creation endpoint, very strict to prevent duplicate work',
  },
} as const;

// In router
.use(createRateLimiter({
  requests: CLARIFYING_RATE_LIMITS.SUBMIT_ANSWER.requests,
  window: CLARIFYING_RATE_LIMITS.SUBMIT_ANSWER.windowSeconds,
}))
```

---

### [LOW-003] Unnecessary tRPC Query for isEnabled

**File:** `/home/me/code/mc2/packages/course-gen-platform/src/server/routers/clarifying.router.ts:345-367`
**Category:** Performance
**Description:** The `isEnabled` endpoint does a database query even though this is static configuration that rarely changes per course.

**Impact:**

- Extra DB query on every component mount
- Could be cached more aggressively
- Minor performance cost

**Recommendation:**
Return enabled flag with course metadata query or use longer cache time.

**Code:**

```typescript
// CURRENT
const { data: course, error } = await supabase
  .from('courses')
  .select('settings')
  .eq('id', courseId)
  .single();

// RECOMMENDED (in client)
const { data: enabledData } = trpc.clarifying.isEnabled.useQuery(
  { courseId },
  {
    staleTime: 30 * 60 * 1000, // 30 minutes - setting rarely changes
    cacheTime: 60 * 60 * 1000, // 1 hour
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  }
);

// OR: Include in course metadata query to avoid separate request
```

---

## Recommendations

### Immediate Actions (Before Production)

1. **Fix CRITICAL-001**: Implement distributed locking or move job creation to RPC
2. **Fix CRITICAL-002**: Generate proper TypeScript types for clarifying_questions table
3. **Fix CRITICAL-003**: Add cleanup functions to all ref callbacks
4. **Fix HIGH-001**: Add multi-choice answer validation
5. **Fix HIGH-002**: Implement batch answer submission endpoint

### Short-term Improvements (Next Sprint)

1. Add comprehensive error boundaries to all panels
2. Create rollback migrations for all schema changes
3. Implement centralized error message i18n
4. Add GIN indexes for JSONB columns
5. Refactor rate limiting to configuration-based system

### Long-term Architectural Improvements

1. Consider moving to optimistic UI updates with rollback
2. Implement real-time question status updates via Supabase Realtime
3. Add telemetry for question answer patterns (A/B testing)
4. Consider GraphQL subscription for collaborative answering
5. Implement question answer versioning for audit trail

### Testing Recommendations

1. **Unit Tests**:
   - Zod schema validation edge cases
   - JSONB serialization/deserialization
   - extractAnswerString helper with all formats

2. **Integration Tests**:
   - Race condition in approveAndProceed (use multiple concurrent requests)
   - Rate limiting behavior (simulate burst traffic)
   - JSONB migration (test with existing data)

3. **E2E Tests**:
   - Full clarifying flow: generate → answer → proceed
   - Multi-choice selection with all permutations
   - Auto-answer all functionality
   - Edit answer after submission

### Security Considerations

1. ✅ Good: XSS protection with DOMPurify
2. ✅ Good: Rate limiting on all endpoints
3. ✅ Good: Zod validation on inputs
4. ⚠️ Consider: Adding CSRF tokens for mutations
5. ⚠️ Consider: Implementing audit log for all answer changes
6. ⚠️ Consider: Rate limiting per user, not per IP (current behavior unclear)

---

## Context7 Validation

### React Best Practices

- ✅ Uses hooks correctly (useState, useEffect, useRef)
- ❌ Missing cleanup functions in ref callbacks (CRITICAL-003)
- ✅ Proper prop drilling and component composition
- ⚠️ Auto-scroll effect could use improvement (HIGH-005)

### tRPC Best Practices

- ✅ Proper input validation with Zod schemas
- ✅ Error handling with TRPCError
- ✅ Rate limiting middleware
- ⚠️ Could improve error formatting for Zod validation errors
- ⚠️ Missing batch mutation endpoint (HIGH-002)

### Supabase Best Practices

- ✅ JSONB for flexible data structure
- ✅ Idempotent migrations with DO $$ blocks
- ❌ Missing GIN indexes for JSONB (MEDIUM-001)
- ❌ Unsafe type casting with `as any` (CRITICAL-002)
- ⚠️ No RLS policies shown (assume configured elsewhere)

---

## Metrics

- **Files Reviewed**: 5
- **Total Lines**: ~2,900
- **Critical Issues**: 3 (must fix before production)
- **High Priority Issues**: 5 (should fix before production)
- **Medium Priority Issues**: 7 (fix in next sprint)
- **Low Priority Issues**: 3 (nice to have)

---

## Conclusion

The Clarifying Questions v2 implementation demonstrates solid software engineering practices with good separation of concerns, comprehensive validation, and thoughtful UX design. However, several **critical issues around race conditions, type safety, and memory management must be addressed before production deployment**.

The most urgent fixes are:

1. Race condition in status transition (CRITICAL-001)
2. Unsafe JSONB type casting (CRITICAL-002)
3. Memory leak in ref cleanup (CRITICAL-003)
4. Rate limiting issues in auto-answer (HIGH-002)

Once these are resolved, the feature should be production-ready with appropriate monitoring and error tracking in place.

---

**Review Date**: 2026-01-27
**Reviewer**: Claude Code (code-reviewer agent)
**Review Type**: Comprehensive (Security + Performance + Quality + UX)
**Context7 Libraries Validated**: React, tRPC, Supabase
