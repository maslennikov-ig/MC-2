import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createCareerPlaybookRuntime } from '@/stages/stage-career-playbook/nodes/runtime';

describe('Career Playbook runtime', () => {
  it('times out hung LLM calls and retries with the fallback model', async () => {
    vi.useFakeTimers();
    try {
      const firstInvoke = vi.fn(() => new Promise<{ content: string }>(() => {}));
      const fallbackInvoke = vi.fn().mockResolvedValue({ content: 'ok' });
      const createModel = vi.fn((modelId: string) => ({
        invoke: modelId === 'fast-model' ? firstInvoke : fallbackInvoke,
      }));
      const runtime = createCareerPlaybookRuntime({
        promptService: { renderPrompt: vi.fn() },
        modelConfigService: {
          getModelForPhase: vi.fn().mockResolvedValue({
            modelId: 'fast-model',
            fallbackModelId: 'adult-model',
            temperature: 0.2,
            maxTokens: 1000,
            maxRetries: 1,
            timeoutMs: 5,
          }),
        },
        createModel,
      });

      const resultPromise = runtime.invokeLLM('prompt', {
        phaseName: 'stage_career_playbook_judge',
        promptKey: 'career_playbook_cross_block_judge',
        node: 'crossBlockJudge',
      });
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(6);
      await Promise.resolve();
      await Promise.resolve();

      await expect(resultPromise).resolves.toEqual(
        expect.objectContaining({
          content: 'ok',
          model: 'adult-model',
        })
      );
      expect(firstInvoke).toHaveBeenCalledTimes(1);
      expect(fallbackInvoke).toHaveBeenCalledTimes(1);
      expect(createModel).toHaveBeenNthCalledWith(1, 'fast-model', 0.2, 1000, 5);
      expect(createModel).toHaveBeenNthCalledWith(2, 'adult-model', 0.2, 1000, 5);
    } finally {
      vi.useRealTimers();
    }
  });

  it('retries failed LLM calls and escalates to the configured fallback model', async () => {
    const invoke = vi
      .fn()
      .mockRejectedValueOnce(new Error('transient provider error'))
      .mockResolvedValueOnce({ content: 'ok' });
    const createModel = vi.fn(() => ({ invoke }));
    const modelConfigService = {
      getModelForPhase: vi.fn().mockResolvedValue({
        modelId: 'fast-model',
        fallbackModelId: 'adult-model',
        temperature: 0.2,
        maxTokens: 1000,
        maxRetries: 2,
      }),
    };

    const runtime = createCareerPlaybookRuntime({
      promptService: { renderPrompt: vi.fn() },
      modelConfigService,
      createModel,
    });

    const result = await runtime.invokeLLM('prompt', {
      phaseName: 'stage_career_playbook_department_classifier',
      promptKey: 'career_playbook_department_classifier',
      node: 'departmentClassifier',
    });

    expect(result).toEqual(
      expect.objectContaining({
        content: 'ok',
        model: 'adult-model',
      })
    );
    expect(modelConfigService.getModelForPhase).toHaveBeenCalledWith(
      'stage_career_playbook_department_classifier',
      undefined,
      undefined,
      undefined
    );
    expect(createModel).toHaveBeenNthCalledWith(1, 'fast-model', 0.2, 1000, 300_000);
    expect(createModel).toHaveBeenNthCalledWith(2, 'adult-model', 0.2, 1000, 300_000);
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('can start directly with the configured fallback model for validation retries', async () => {
    const invoke = vi.fn().mockResolvedValue({ content: 'ok' });
    const createModel = vi.fn(() => ({ invoke }));
    const runtime = createCareerPlaybookRuntime({
      promptService: { renderPrompt: vi.fn() },
      modelConfigService: {
        getModelForPhase: vi.fn().mockResolvedValue({
          modelId: 'fast-model',
          fallbackModelId: 'adult-model',
          temperature: 0.2,
          maxTokens: 1000,
          maxRetries: 2,
        }),
      },
      createModel,
    });

    await runtime.invokeLLM('prompt', {
      phaseName: 'stage_career_playbook_department_classifier',
      promptKey: 'career_playbook_department_classifier',
      node: 'departmentClassifier',
      preferFallbackModel: true,
      maxTokensMultiplier: 1.25,
    });

    expect(createModel).toHaveBeenCalledWith('adult-model', 0.2, 1250, 300_000);
  });

  it('uses LangChain structured output when a schema is provided', async () => {
    const invoke = vi.fn().mockResolvedValue({ content: 'plain text should not be used' });
    const structuredInvoke = vi.fn().mockResolvedValue({ answer: 'ok' });
    const withStructuredOutput = vi.fn(() => ({ invoke: structuredInvoke }));
    const createModel = vi.fn(() => ({ invoke, withStructuredOutput }));
    const runtime = createCareerPlaybookRuntime({
      promptService: { renderPrompt: vi.fn() },
      modelConfigService: {
        getModelForPhase: vi.fn().mockResolvedValue({
          modelId: 'fast-model',
          fallbackModelId: 'adult-model',
          temperature: 0.2,
          maxTokens: 1000,
          maxRetries: 0,
        }),
      },
      createModel,
    });

    const result = await runtime.invokeLLM('prompt', {
      phaseName: 'stage_career_playbook_followup',
      promptKey: 'career_playbook_followup_generator',
      node: 'followupGenerator',
      structuredOutputSchema: z.object({ answer: z.string() }),
      structuredOutputName: 'career_playbook_followups',
      structuredOutputMethod: 'jsonSchema',
      structuredOutputStrict: true,
    });

    expect(result.content).toBe(JSON.stringify({ answer: 'ok' }));
    expect(invoke).not.toHaveBeenCalled();
    expect(withStructuredOutput).toHaveBeenCalledWith(expect.any(Object), {
      name: 'career_playbook_followups',
      method: 'jsonSchema',
      strict: true,
    });
    expect(structuredInvoke).toHaveBeenCalledWith('prompt');
  });
});
