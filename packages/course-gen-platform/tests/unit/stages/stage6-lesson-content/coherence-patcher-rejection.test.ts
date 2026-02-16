/**
 * Unit Tests for Coherence Patcher Prompt Marker Rejection
 *
 * Tests that applyCoherencePreservingPatch() rejects LLM responses
 * containing prompt template markers (hallucination detection) and
 * returns original content instead.
 *
 * @module tests/unit/stage6/coherence-patcher-rejection.test
 */

import { describe, it, expect, vi } from 'vitest';
import type { SectionRefinementTask } from '@megacampus/shared-types';
import type { IterationContext } from '@/stages/stage6-lesson-content/judge/targeted-refinement/types';
import type { LLMCallFn } from '@/stages/stage6-lesson-content/judge/patcher';

// Mock logger to suppress output in tests
vi.mock('@/shared/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock LLMClient and model config service (not used when llmCall is provided)
vi.mock('@/shared/llm', () => ({
  LLMClient: vi.fn(),
}));

vi.mock('@/shared/llm/model-config-service', () => ({
  createModelConfigService: vi.fn(),
}));

import { applyCoherencePreservingPatch } from '@/stages/stage6-lesson-content/judge/targeted-refinement/task-executor-helpers';

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockTask(overrides?: Partial<SectionRefinementTask>): SectionRefinementTask {
  return {
    sectionId: 'sec_1',
    sectionTitle: 'Introduction to TypeScript',
    actionType: 'SURGICAL_EDIT',
    synthesizedInstructions: 'Improve clarity and add examples for better understanding.',
    contextAnchors: {
      prevSectionEnd: 'Previous section ends here.',
      nextSectionStart: 'Next section starts here.',
    },
    priority: 'high',
    sourceIssues: [
      {
        criterion: 'clarity',
        severity: 'major',
        location: 'paragraph 2',
        description: 'Content is unclear',
        suggestedFix: 'Rewrite paragraph 2',
      },
    ],
    ...overrides,
  } as SectionRefinementTask;
}

function createMockIterationContext(
  overrides?: Partial<IterationContext>
): IterationContext {
  return {
    score: 0.65,
    iteration: 2,
    issues: [
      {
        criterion: 'clarity',
        severity: 'major',
        location: 'paragraph 2',
        description: 'Content is unclear',
      },
    ],
    iterationHistory: [
      { feedback: 'Content needs more clarity in paragraph 2.', score: 0.5 },
      { feedback: 'Improved but still needs concrete examples.', score: 0.6 },
    ],
    lessonSpec: {
      lesson_id: 'lesson_1',
      title: 'TypeScript Basics',
      description: 'A beginner-friendly introduction to TypeScript',
      difficulty_level: 'beginner',
      estimated_duration_minutes: 45,
      learning_objectives: ['Understand TypeScript generics'],
      sections: [{ id: 'sec_1', title: 'Introduction to TypeScript', target_word_count: 300 }],
      metadata: { target_audience: 'beginner developers' },
    } as IterationContext['lessonSpec'],
    strengths: ['Good code examples'],
    ...overrides,
  };
}

function createLlmCallMock(responseContent: string): LLMCallFn {
  return vi.fn().mockResolvedValue({
    content: responseContent,
    tokensUsed: 150,
  });
}

// ============================================================================
// Tests
// ============================================================================

describe('applyCoherencePreservingPatch — prompt marker rejection', () => {
  const originalContent = 'TypeScript is a typed superset of JavaScript that compiles to plain JavaScript. It adds static types, classes, and interfaces.';
  const cleanPatchedContent = 'TypeScript is a strongly-typed superset of JavaScript. It provides static types, classes, and interfaces for better developer experience.';

  it('should return patched content when LLM response is clean', async () => {
    const llmCall = createLlmCallMock(cleanPatchedContent);

    const result = await applyCoherencePreservingPatch(
      createMockTask(),
      originalContent,
      createMockIterationContext(),
      llmCall,
      undefined
    );

    expect(result.patchedContent).toBe(cleanPatchedContent);
    expect(result.tokensUsed).toBe(150);
  });

  it('should reject and return original content when LLM hallucinates ## SECTION TITLE', async () => {
    const hallucinatedResponse = '## SECTION TITLE\nIntroduction to TypeScript\n\n## ORIGINAL CONTENT\nSome rewritten content here';
    const llmCall = createLlmCallMock(hallucinatedResponse);

    const result = await applyCoherencePreservingPatch(
      createMockTask(),
      originalContent,
      createMockIterationContext(),
      llmCall,
      undefined
    );

    expect(result.patchedContent).toBe(originalContent);
    expect(result.tokensUsed).toBe(150);
  });

  it('should reject and return original content when LLM hallucinates ## FIX INSTRUCTIONS', async () => {
    const hallucinatedResponse = '## FIX INSTRUCTIONS\nPlease improve the following section:\n\nThe content here...';
    const llmCall = createLlmCallMock(hallucinatedResponse);

    const result = await applyCoherencePreservingPatch(
      createMockTask(),
      originalContent,
      createMockIterationContext(),
      llmCall,
      undefined
    );

    expect(result.patchedContent).toBe(originalContent);
    expect(result.tokensUsed).toBe(150);
  });

  it('should reject when LLM returns COMPLETE CORRECTED SECTION: marker', async () => {
    const hallucinatedResponse = 'COMPLETE CORRECTED SECTION:\nHere is the improved version of the content.';
    const llmCall = createLlmCallMock(hallucinatedResponse);

    const result = await applyCoherencePreservingPatch(
      createMockTask(),
      originalContent,
      createMockIterationContext(),
      llmCall,
      undefined
    );

    expect(result.patchedContent).toBe(originalContent);
    expect(result.tokensUsed).toBe(150);
  });

  it('should reject when LLM returns ## OUTPUT REQUIREMENTS marker', async () => {
    const hallucinatedResponse = '## OUTPUT REQUIREMENTS\n- Must include examples\n- Use clear language\n\nActual content here';
    const llmCall = createLlmCallMock(hallucinatedResponse);

    const result = await applyCoherencePreservingPatch(
      createMockTask(),
      originalContent,
      createMockIterationContext(),
      llmCall,
      undefined
    );

    expect(result.patchedContent).toBe(originalContent);
    expect(result.tokensUsed).toBe(150);
  });

  it('should still count tokens even when rejecting hallucinated content', async () => {
    const hallucinatedResponse = '## SECTION TITLE\nHallucinated output';
    const llmCall = createLlmCallMock(hallucinatedResponse);

    const result = await applyCoherencePreservingPatch(
      createMockTask(),
      originalContent,
      createMockIterationContext(),
      llmCall,
      undefined
    );

    expect(result.patchedContent).toBe(originalContent);
    expect(result.tokensUsed).toBe(150); // Tokens spent but content rejected
  });

  it('should not emit patch_applied event when content is rejected', async () => {
    const hallucinatedResponse = '## SECTION TITLE\nBad content';
    const llmCall = createLlmCallMock(hallucinatedResponse);
    const onStreamEvent = vi.fn();

    await applyCoherencePreservingPatch(
      createMockTask(),
      originalContent,
      createMockIterationContext(),
      llmCall,
      onStreamEvent
    );

    // Should NOT emit patch_applied since content was rejected
    const patchAppliedEvents = onStreamEvent.mock.calls.filter(
      (call) => call[0]?.type === 'patch_applied'
    );
    expect(patchAppliedEvents).toHaveLength(0);
  });

  it('should emit patch_applied event when content passes validation', async () => {
    const llmCall = createLlmCallMock(cleanPatchedContent);
    const onStreamEvent = vi.fn();

    await applyCoherencePreservingPatch(
      createMockTask(),
      originalContent,
      createMockIterationContext(),
      llmCall,
      onStreamEvent
    );

    const patchAppliedEvents = onStreamEvent.mock.calls.filter(
      (call) => call[0]?.type === 'patch_applied'
    );
    expect(patchAppliedEvents).toHaveLength(1);
    expect(patchAppliedEvents[0][0].content).toBe(cleanPatchedContent);
  });
});
