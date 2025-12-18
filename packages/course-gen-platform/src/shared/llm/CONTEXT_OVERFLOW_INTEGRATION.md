# Context Overflow Handler - Integration Guide

## Overview

The context overflow handler provides automatic fallback to larger context models when token estimation is inaccurate and OpenRouter returns a `context_length_exceeded` error.

## Components

### 1. Error Detection
```typescript
import { isContextOverflowError } from '@/shared/llm';

try {
  await llm.invoke(messages);
} catch (error) {
  if (isContextOverflowError(error)) {
    // Handle context overflow
  }
}
```

### 2. Fallback Selection
```typescript
import { getContextOverflowFallback } from '@/shared/llm';

const fallback = getContextOverflowFallback('qwen/qwen3-235b-a22b-2507', 'ru');
// fallback.modelId === 'google/gemini-2.5-flash-preview-09-2025'
// fallback.maxContext === 1_000_000
```

### 3. Automatic Execution Wrapper (Recommended)
```typescript
import { executeWithContextFallback } from '@/shared/llm';

const { result, modelUsed } = await executeWithContextFallback(
  async (modelId) => {
    const model = getModelForPhase(modelId, 0.3);
    return await model.invoke(messages);
  },
  'qwen/qwen3-235b-a22b-2507',
  'ru'
);
```

## Integration with Stage 4 Phases

### Pattern 1: Simple Phase Execution

**Before:**
```typescript
export async function runPhase1(input: Phase1Input): Promise<Phase1Output> {
  const model = getModelForPhase('openai/gpt-oss-20b', 0.3);
  const [systemMessage, humanMessage] = buildPrompt(input);
  const response = await model.invoke([systemMessage, humanMessage]);
  return parseResponse(response);
}
```

**After:**
```typescript
import { executeWithContextFallback } from '@/shared/llm';

export async function runPhase1(input: Phase1Input): Promise<Phase1Output> {
  const { result, modelUsed } = await executeWithContextFallback(
    async (modelId) => {
      const model = getModelForPhase(modelId, 0.3);
      const [systemMessage, humanMessage] = buildPrompt(input);
      return await model.invoke([systemMessage, humanMessage]);
    },
    'openai/gpt-oss-20b',
    input.language === 'ru' ? 'ru' : 'en'
  );

  logger.info({ modelUsed }, 'Phase 1 completed');
  return parseResponse(result);
}
```

### Pattern 2: Phase with Budget Allocation

**Before:**
```typescript
export async function runPhase2(
  input: Phase2Input,
  allocation: Stage4BudgetAllocation
): Promise<Phase2Output> {
  const model = getModelForPhase(allocation.modelSelection.modelId, 0.3);
  const messages = buildMessages(input, allocation);
  const response = await model.invoke(messages);
  return parseResponse(response);
}
```

**After:**
```typescript
import { executeWithContextFallback } from '@/shared/llm';
import { recalculateBudgetForExtendedTier } from '../phases/stage4-budget-allocator';

export async function runPhase2(
  input: Phase2Input,
  allocation: Stage4BudgetAllocation
): Promise<Phase2Output> {
  let currentAllocation = allocation;

  const { result, modelUsed } = await executeWithContextFallback(
    async (modelId) => {
      // Update allocation if model changed
      if (modelId !== currentAllocation.modelSelection.modelId) {
        currentAllocation = recalculateBudgetForExtendedTier(
          currentAllocation,
          input.language === 'ru' ? 'ru' : 'en'
        );
      }

      const model = getModelForPhase(modelId, 0.3);
      const messages = buildMessages(input, currentAllocation);
      return await model.invoke(messages);
    },
    allocation.modelSelection.modelId,
    input.language === 'ru' ? 'ru' : 'en'
  );

  logger.info({
    originalModel: allocation.modelSelection.modelId,
    modelUsed,
    fallbackOccurred: modelUsed !== allocation.modelSelection.modelId
  }, 'Phase 2 completed');

  return parseResponse(result);
}
```

### Pattern 3: Manual Error Handling (Advanced)

For cases where you need full control:

```typescript
import {
  isContextOverflowError,
  getContextOverflowFallback
} from '@/shared/llm';

export async function runPhaseWithManualFallback(
  input: PhaseInput,
  allocation: Stage4BudgetAllocation
): Promise<PhaseOutput> {
  let currentModelId = allocation.modelSelection.modelId;
  let attempt = 0;
  const maxRetries = 2;

  while (attempt <= maxRetries) {
    try {
      const model = getModelForPhase(currentModelId, 0.3);
      const messages = buildMessages(input, allocation);
      const response = await model.invoke(messages);
      return parseResponse(response);
    } catch (error) {
      if (isContextOverflowError(error)) {
        const fallback = getContextOverflowFallback(
          currentModelId,
          input.language === 'ru' ? 'ru' : 'en'
        );

        if (fallback) {
          logger.warn({
            attempt: attempt + 1,
            currentModel: currentModelId,
            nextModel: fallback.modelId,
          }, 'Context overflow - retrying with larger model');

          currentModelId = fallback.modelId;
          attempt++;
          continue;
        }
      }

      // Not a context overflow or no fallback available
      throw error;
    }
  }

  throw new Error('Exhausted all fallback models');
}
```

## Escalation Path

### Standard Tier → Extended Tier

For Russian (ru):
1. Standard: `qwen/qwen3-235b-a22b-2507` (260K context)
2. Extended primary: `google/gemini-2.5-flash-preview-09-2025` (1M context)
3. Extended fallback: `qwen/qwen-plus-2025-07-28` (1M context)

For English (en):
1. Standard: `x-ai/grok-4.1-fast:free` (260K context)
2. Extended primary: `x-ai/grok-4.1-fast:free` (1M context)
3. Extended fallback: `moonshotai/kimi-linear-48b-a3b-instruct` (1M context)

## Best Practices

1. **Use executeWithContextFallback**: Prefer the wrapper for simple cases
2. **Log fallback events**: Always log when fallback occurs for debugging
3. **Update allocation**: When using budget allocator, recalculate with extended tier
4. **Preserve language**: Always pass correct language for proper model selection
5. **Limited retries**: Default 2 retries is sufficient (standard → extended → fallback)

## Error Patterns Detected

The handler detects these error message patterns:
- `context_length_exceeded` (OpenRouter standard)
- `context length` (generic)
- `maximum context` (provider-specific)
- `token limit` (provider-specific)
- `exceeds the model` (Anthropic)
- `too many tokens` (OpenAI)

## Future Enhancements

Consider these improvements in follow-up tasks:
- Add telemetry for fallback rate tracking
- Implement cost comparison logging (standard vs extended)
- Add preemptive escalation when token count is near threshold
- Create phase-specific retry strategies
