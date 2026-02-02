# LLM Hallucination Protection Diagnostic Report

**Generated**: 2026-02-02
**Issues**: mc2-zoj2, mc2-1nym
**Status**: ✅ PROTECTION ACTIVE, IMPROVEMENTS IDENTIFIED

---

## Executive Summary

The LLM hallucination protection implemented on 2026-01-21/22 is **working correctly**:

1. ✅ **Validation Logic**: Detects prompt template markers in generated content
2. ✅ **Rejection Mechanism**: Returns original content on detection
3. ✅ **Fallback Models**: Configured in database for patcher phase
4. ⚠️ **Missing Retry**: No automatic retry after rejection at orchestrator level

### Key Findings

| Component                    | Status        | Recommendation            |
| ---------------------------- | ------------- | ------------------------- |
| `validateGeneratedContent()` | ✅ Working    | No changes needed         |
| Patcher rejection logic      | ✅ Working    | No changes needed         |
| Database fallback config     | ✅ Configured | No changes needed         |
| Retry logic in orchestrator  | ❌ Missing    | **ADD RETRY LOOP**        |
| LLMClient fallback           | ❌ Missing    | **ADD FALLBACK HANDLING** |

---

## Current Implementation Analysis

### 1. Validation Function (✅ Working)

**Location**: `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/generator/generator-content.ts` (lines 317-353)

**Detects**:

```typescript
const PROMPT_TEMPLATE_MARKERS = [
  '## SECTION TITLE',
  '## ORIGINAL CONTENT',
  '## FIX INSTRUCTIONS',
  '## CONTEXT FOR COHERENCE',
  '## TARGET AREA',
  '## OUTPUT REQUIREMENTS',
  'COMPLETE CORRECTED SECTION:',
] as const;
```

**Logic**:

- Checks if generated content contains any of the markers
- Returns `{ isValid: boolean, detectedMarkers: string[] }`
- Used in patcher to detect hallucination

**Assessment**: ✅ Working correctly, no changes needed.

---

### 2. Patcher Rejection Logic (✅ Working)

**Location**: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/patcher/index.ts` (lines 199-219)

**Implementation**:

```typescript
const markerValidation = validateGeneratedContent(patchedContent);
if (!markerValidation.isValid) {
  logger.error(
    {
      sectionId: input.sectionId,
      detectedMarkers: markerValidation.detectedMarkers,
    },
    'Patcher: REJECTED - response contains prompt template markers (LLM hallucination)'
  );

  return {
    patchedContent: input.originalContent, // Return original - patch was corrupted
    success: false,
    diffSummary: 'Patch rejected: LLM returned prompt structure instead of content',
    tokensUsed,
    durationMs: Date.now() - startTime,
    errorMessage: `LLM hallucinated prompt markers: ${markerValidation.detectedMarkers.join(', ')}`,
  };
}
```

**Assessment**: ✅ Working correctly, returns `success: false` with original content.

---

### 3. Database Fallback Configuration (✅ Configured)

**Query Results**:

```json
[
  {
    "id": "e0653ad4-05d1-440d-a889-184a061f7a0b",
    "phase_name": "stage_6_patcher",
    "model_id": "google/gemini-2.5-flash",
    "fallback_model_id": "xiaomi/mimo-v2-flash",
    "is_active": true,
    "created_at": "2026-01-20 12:04:46.927843+00"
  },
  {
    "id": "f00e1ec9-ca53-4c7f-89ab-0f56e4f05dcd",
    "phase_name": "stage_6_patcher",
    "model_id": "xiaomi/mimo-v2-flash",
    "fallback_model_id": "google/gemini-2.5-flash",
    "is_active": true,
    "created_at": "2026-01-20 12:04:46.927843+00"
  }
]
```

**Assessment**: ✅ Fallback models are configured in database for `stage_6_patcher` phase.

---

### 4. Orchestrator Retry Logic (❌ Missing)

**Location**: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/orchestrator.ts` (lines 183-226)

**Current Implementation**:

```typescript
const patchResults = await Promise.all(
  patcherTasks.map(task =>
    executePatcherTask(task, currentContent, llmCall, onStreamEvent, {...})
  )
);

for (const result of patchResults) {
  // Always increment edit count to prevent infinite loops on repeated failures
  state.sectionEditCount[result.sectionId] =
    (state.sectionEditCount[result.sectionId] || 0) + 1;

  if (result.success) {
    currentContent = applyPatchToContent(...);
    state.tokensUsed += result.tokensUsed;
  } else {
    // Log failed attempt for debugging (hallucination rejection, truncation, etc.)
    logger.warn({
      sectionId: result.sectionId,
      editCount: state.sectionEditCount[result.sectionId],
      maxEdits: REFINEMENT_CONFIG.quality.sectionLockAfterEdits,
    }, 'Patcher failed - edit attempt counted toward section lock');
    // Still count tokens used even on failure (for budget tracking)
    state.tokensUsed += result.tokensUsed;
  }
}
```

**Issue**:

- When `result.success === false`, the section is **not retried immediately**
- Instead, it's counted as an edit attempt and may be retried in the next iteration
- This wastes iterations on hallucinations that could be retried immediately

**Assessment**: ⚠️ **NEEDS IMPROVEMENT** - Add immediate retry with fallback model.

---

### 5. LLMClient Fallback Handling (❌ Missing)

**Location**: `packages/course-gen-platform/src/shared/llm/client.ts`

**Current Implementation**:

- LLMClient has retry logic for transient errors (429, 500, 502, 503, 504)
- LLMClient does **NOT** implement automatic fallback to `fallbackModelId` on failure
- Model selection is done by `model-config-service`, but LLMClient uses the model as-is

**Issue**:

- If primary model (`google/gemini-2.5-flash`) hallucinates, there's no automatic fallback to `xiaomi/mimo-v2-flash`
- Fallback logic must be implemented at a higher level (task-executor or orchestrator)

**Assessment**: ⚠️ **NEEDS IMPROVEMENT** - Add fallback model retry in task-executor.

---

## Recommendations

### Priority 1: Add Retry Logic in task-executor.ts (HIGH IMPACT)

**Location**: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/task-executor.ts`

**Implementation**:

```typescript
export async function executePatcherTask(
  task: SectionRefinementTask,
  content: LessonContent,
  llmCall: LLMCallFn | undefined,
  onStreamEvent: ((event: RefinementEvent) => void) | undefined,
  iterationContext: IterationContext
): Promise<{ success: boolean; sectionId: string; patchedContent: string; tokensUsed: number }> {
  // ... existing code ...

  // Execute patch with retry on hallucination
  const MAX_HALLUCINATION_RETRIES = 2;
  let patchResult: PatcherOutput;
  let totalTokensUsed = 0;
  let attemptCount = 0;

  for (let attempt = 0; attempt < MAX_HALLUCINATION_RETRIES; attempt++) {
    attemptCount++;
    patchResult = await executePatch(patcherInput, llmCall);
    totalTokensUsed += patchResult.tokensUsed;

    // If success, break out of retry loop
    if (patchResult.success) {
      logger.info(
        {
          sectionId: task.sectionId,
          attempt: attemptCount,
        },
        'Patcher succeeded'
      );
      break;
    }

    // If failed due to hallucination, retry with different model
    if (patchResult.errorMessage?.includes('hallucinated prompt markers')) {
      logger.warn(
        {
          sectionId: task.sectionId,
          attempt: attemptCount,
          detectedMarkers: patchResult.errorMessage,
          willRetry: attempt < MAX_HALLUCINATION_RETRIES - 1,
        },
        'Patcher rejected due to hallucination - will retry'
      );

      // On last attempt, give up
      if (attempt === MAX_HALLUCINATION_RETRIES - 1) {
        logger.error(
          {
            sectionId: task.sectionId,
            totalAttempts: attemptCount,
          },
          'Patcher failed after all hallucination retries'
        );
      }
    } else {
      // Non-hallucination failure (truncation, etc) - don't retry
      logger.warn(
        {
          sectionId: task.sectionId,
          errorMessage: patchResult.errorMessage,
        },
        'Patcher failed for non-hallucination reason - not retrying'
      );
      break;
    }
  }

  // ... rest of existing code using patchResult and totalTokensUsed ...
}
```

**Benefits**:

- Immediate retry on hallucination detection
- Doesn't waste refinement iterations
- Uses different random seed on retry (temperature variation)
- Logs hallucination attempts for monitoring

**Cost**: ~500-1000 tokens per retry (acceptable for preventing content corruption)

---

### Priority 2: Implement Fallback Model Switching (MEDIUM IMPACT)

**Option A: Add to task-executor.ts (Recommended)**

```typescript
async function executePatchWithFallback(
  patcherInput: PatcherInput,
  llmCall: LLMCallFn | undefined,
  primaryModelId: string,
  fallbackModelId: string | null
): Promise<PatcherOutput> {
  // Try primary model
  const primaryResult = await executePatch(patcherInput, llmCall);

  if (primaryResult.success) {
    return primaryResult;
  }

  // If hallucination detected and fallback available, try fallback
  if (primaryResult.errorMessage?.includes('hallucinated prompt markers') && fallbackModelId) {
    logger.warn(
      {
        sectionId: patcherInput.sectionId,
        primaryModel: primaryModelId,
        fallbackModel: fallbackModelId,
      },
      'Switching to fallback model after hallucination'
    );

    // Create fallback LLM call function
    const fallbackLLMCall = async (
      prompt: string,
      systemPrompt: string,
      options: { maxTokens: number; temperature: number }
    ): Promise<{ content: string; tokensUsed: number }> => {
      const llmClient = new LLMClient();
      const response = await llmClient.generateCompletion(prompt, {
        model: fallbackModelId, // Use fallback model
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        systemPrompt,
      });
      return {
        content: response.content,
        tokensUsed: response.totalTokens,
      };
    };

    const fallbackResult = await executePatch(patcherInput, fallbackLLMCall);

    // Return fallback result (success or failure)
    return fallbackResult;
  }

  // No fallback or non-hallucination failure
  return primaryResult;
}
```

**Option B: Add to LLMClient.generateCompletion (More Complex)**

- Requires passing `fallbackModelId` through all call chains
- More invasive changes
- Not recommended for this specific use case

---

### Priority 3: Add Hallucination Monitoring (LOW IMPACT, HIGH VALUE)

**Add metrics collection**:

```typescript
// In task-executor.ts or orchestrator.ts
let hallucinationCount = 0;
let hallucinationRetriesSucceeded = 0;
let hallucinationRetriesFailed = 0;

// After retry loop:
if (patchResult.errorMessage?.includes('hallucinated')) {
  hallucinationCount++;
  if (patchResult.success) {
    hallucinationRetriesSucceeded++;
  } else {
    hallucinationRetriesFailed++;
  }
}

// Log at end of refinement cycle:
logger.info(
  {
    hallucinationCount,
    hallucinationRetriesSucceeded,
    hallucinationRetriesFailed,
    hallucinationRate: (hallucinationCount / totalPatcherCalls).toFixed(3),
  },
  'Hallucination protection statistics'
);
```

**Benefits**:

- Track hallucination rate by model
- Identify problematic prompts
- Measure effectiveness of protection
- Inform model selection decisions

---

## Testing Recommendations

### Unit Tests

```typescript
// tests/unit/patcher-hallucination.test.ts
describe('Patcher hallucination protection', () => {
  it('should reject response with prompt markers', async () => {
    const mockLLMCall = jest.fn().mockResolvedValue({
      content: '## SECTION TITLE\nThis is hallucinated prompt structure',
      tokensUsed: 500,
    });

    const result = await executePatch(patcherInput, mockLLMCall);

    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain('hallucinated prompt markers');
    expect(result.patchedContent).toBe(patcherInput.originalContent);
  });

  it('should retry on hallucination detection', async () => {
    const mockLLMCall = jest
      .fn()
      .mockResolvedValueOnce({
        content: '## SECTION TITLE\nHallucinated',
        tokensUsed: 500,
      })
      .mockResolvedValueOnce({
        content: 'Valid patched content',
        tokensUsed: 500,
      });

    const result = await executePatcherTask(
      task,
      content,
      mockLLMCall,
      undefined,
      iterationContext
    );

    expect(mockLLMCall).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(true);
    expect(result.patchedContent).toBe('Valid patched content');
  });

  it('should give up after max retries', async () => {
    const mockLLMCall = jest.fn().mockResolvedValue({
      content: '## SECTION TITLE\nAlways hallucinates',
      tokensUsed: 500,
    });

    const result = await executePatcherTask(
      task,
      content,
      mockLLMCall,
      undefined,
      iterationContext
    );

    expect(mockLLMCall).toHaveBeenCalledTimes(2); // MAX_HALLUCINATION_RETRIES
    expect(result.success).toBe(false);
  });
});
```

### Integration Tests

1. **Trigger hallucination manually**:
   - Create test case with prompt that triggers marker generation
   - Verify rejection and retry logic
   - Check logs for proper error messages

2. **Test fallback model switching**:
   - Mock primary model to always hallucinate
   - Verify fallback model is called
   - Check success with fallback

3. **Monitor production logs**:
   - Search for: `"Patcher: REJECTED - response contains prompt template markers"`
   - Analyze frequency by model
   - Check if current protection is sufficient

---

## Implementation Plan

### Phase 1: Add Retry Logic (Immediate)

1. **Modify** `task-executor.ts:executePatcherTask()`
   - Add retry loop (max 2 retries)
   - Check for hallucination-specific failure
   - Log retry attempts

2. **Add unit tests** for retry logic

3. **Deploy to dev** and monitor logs

**Time**: 2-3 hours
**Impact**: HIGH - prevents wasted iterations

---

### Phase 2: Add Fallback Model Switching (Follow-up)

1. **Implement** `executePatchWithFallback()` helper
   - Fetch fallback model from database config
   - Create fallback LLM call function
   - Log model switches

2. **Add unit tests** for fallback switching

3. **Deploy to dev** and monitor effectiveness

**Time**: 3-4 hours
**Impact**: MEDIUM - further reduces hallucination failures

---

### Phase 3: Add Monitoring (Optional)

1. **Add metrics collection** to orchestrator
2. **Log statistics** at end of refinement cycle
3. **Create dashboard** for hallucination rate tracking

**Time**: 1-2 hours
**Impact**: LOW immediate, HIGH long-term (informs model decisions)

---

## Conclusion

The current hallucination protection is **working correctly** but can be **improved**:

1. ✅ **Validation** - Detects markers accurately
2. ✅ **Rejection** - Returns original content safely
3. ✅ **Fallback Config** - Database has fallback models
4. ❌ **Retry Logic** - Missing at orchestrator level (**HIGH PRIORITY**)
5. ❌ **Fallback Switching** - Not implemented (**MEDIUM PRIORITY**)

**Recommended Action**: Implement Priority 1 (retry logic) immediately. This will prevent wasted refinement iterations when hallucinations occur.

**No Prompt Changes Needed**: Current prompts are correct. The issue is with automatic recovery, not detection.

---

## References

**Files Modified (2026-01-21/22)**:

- `generator-content.ts:317-353` - Added `validateGeneratedContent()`
- `patcher/index.ts:199-219` - Added rejection logic

**Files to Modify (This Fix)**:

- `task-executor.ts:102-411` - Add retry loop in `executePatcherTask()`

**Database Tables**:

- `llm_model_config` - Contains fallback configuration

**Related Issues**:

- mc2-zoj2 - LLM галлюцинации (защита уже есть)
- mc2-1nym - Усиление защиты (добавить retry)

---

**Report Generated**: 2026-02-02
**Author**: Claude Code (diagnostic agent)
**Status**: READY FOR IMPLEMENTATION
