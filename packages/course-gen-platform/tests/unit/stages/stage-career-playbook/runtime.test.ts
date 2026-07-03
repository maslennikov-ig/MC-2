import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createCareerPlaybookRuntime } from '@/stages/stage-career-playbook/nodes/runtime';
import { logger } from '@/shared/logger';

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
      Math.ceil('prompt'.length / 4),
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
    const structuredInvoke = vi.fn().mockResolvedValue({
      raw: { usage_metadata: { input_tokens: 30, output_tokens: 15 } },
      parsed: { answer: 'ok' },
    });
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
    // Real usage flows through from the raw AIMessage instead of being estimated.
    expect(result.inputTokens).toBe(30);
    expect(result.outputTokens).toBe(15);
    expect(invoke).not.toHaveBeenCalled();
    expect(withStructuredOutput).toHaveBeenCalledWith(expect.any(Object), {
      name: 'career_playbook_followups',
      method: 'jsonSchema',
      strict: true,
      includeRaw: true,
    });
    expect(structuredInvoke).toHaveBeenCalledWith('prompt');
  });

  it('reports real token usage and a catalog-based cost when the model returns usage', async () => {
    const invoke = vi.fn().mockResolvedValue({
      content: 'ok',
      usage_metadata: { input_tokens: 1000, output_tokens: 500 },
    });
    const createModel = vi.fn(() => ({ invoke }));
    const runtime = createCareerPlaybookRuntime({
      promptService: { renderPrompt: vi.fn() },
      modelConfigService: {
        getModelForPhase: vi.fn().mockResolvedValue({
          modelId: 'deepseek/deepseek-v4-flash',
          fallbackModelId: 'google/gemini-3-flash-preview',
          temperature: 0.3,
          maxTokens: 1000,
          maxRetries: 0,
        }),
      },
      createModel,
    });

    const result = await runtime.invokeLLM('prompt', {
      phaseName: 'stage_career_playbook_spec',
      promptKey: 'career_playbook_spec_builder',
      node: 'specBuilder',
    });

    expect(result.inputTokens).toBe(1000);
    expect(result.outputTokens).toBe(500);
    // deepseek/deepseek-v4-flash: $0.10/1M input + $0.20/1M output
    // 1000 * 0.10/1e6 + 500 * 0.20/1e6 = 0.0001 + 0.0001 = 0.0002
    expect(result.costUsd).toBeCloseTo(0.0002, 10);
  });

  it('falls back to token estimates and still prices when usage is absent', async () => {
    const invoke = vi.fn().mockResolvedValue({ content: 'abcd' });
    const createModel = vi.fn(() => ({ invoke }));
    const runtime = createCareerPlaybookRuntime({
      promptService: { renderPrompt: vi.fn() },
      modelConfigService: {
        getModelForPhase: vi.fn().mockResolvedValue({
          modelId: 'deepseek/deepseek-v4-flash',
          fallbackModelId: 'google/gemini-3-flash-preview',
          temperature: 0.3,
          maxTokens: 1000,
          maxRetries: 0,
        }),
      },
      createModel,
    });

    const result = await runtime.invokeLLM('prompt-1234', {
      phaseName: 'stage_career_playbook_spec',
      promptKey: 'career_playbook_spec_builder',
      node: 'specBuilder',
    });

    expect(result.inputTokens).toBe(Math.ceil('prompt-1234'.length / 4));
    expect(result.outputTokens).toBe(Math.ceil('abcd'.length / 4));
    expect(result.costUsd).toBeGreaterThan(0);
  });

  it('threads the rendered prompt token count into model routing', async () => {
    const invoke = vi.fn().mockResolvedValue({ content: 'ok' });
    const createModel = vi.fn(() => ({ invoke }));
    const getModelForPhase = vi.fn().mockResolvedValue({
      modelId: 'fast-model',
      fallbackModelId: 'adult-model',
      temperature: 0.2,
      maxTokens: 1000,
      maxRetries: 0,
      maxContextTokens: 128_000,
    });
    const runtime = createCareerPlaybookRuntime({
      promptService: { renderPrompt: vi.fn() },
      modelConfigService: { getModelForPhase },
      createModel,
    });

    const prompt = 'x'.repeat(4000); // ~1000 estimated tokens
    await runtime.invokeLLM(prompt, {
      phaseName: 'stage_career_playbook_spec',
      promptKey: 'career_playbook_spec_builder',
      node: 'specBuilder',
    });

    expect(getModelForPhase).toHaveBeenCalledWith(
      'stage_career_playbook_spec',
      undefined,
      Math.ceil(prompt.length / 4),
      undefined
    );
    // Fits comfortably inside a 128k window, so the output budget is untouched.
    expect(createModel).toHaveBeenCalledWith('fast-model', 0.2, 1000, 300_000);
  });

  it('clamps the output budget to the resolved model context window', async () => {
    const invoke = vi.fn().mockResolvedValue({ content: 'ok' });
    const createModel = vi.fn(() => ({ invoke }));
    const runtime = createCareerPlaybookRuntime({
      promptService: { renderPrompt: vi.fn() },
      modelConfigService: {
        getModelForPhase: vi.fn().mockResolvedValue({
          modelId: 'fast-model',
          fallbackModelId: 'adult-model',
          temperature: 0.2,
          maxTokens: 4000,
          maxRetries: 0,
          maxContextTokens: 2000,
        }),
      },
      createModel,
    });

    // ~1000 estimated prompt tokens; 2000 context - 1000 prompt = 1000 for output.
    await runtime.invokeLLM('x'.repeat(4000), {
      phaseName: 'stage_career_playbook_spec',
      promptKey: 'career_playbook_spec_builder',
      node: 'specBuilder',
    });

    expect(createModel).toHaveBeenCalledWith('fast-model', 0.2, 1000, 300_000);
  });

  it('leaves the output budget untouched when the model context window is unknown', async () => {
    const invoke = vi.fn().mockResolvedValue({ content: 'ok' });
    const createModel = vi.fn(() => ({ invoke }));
    const runtime = createCareerPlaybookRuntime({
      promptService: { renderPrompt: vi.fn() },
      modelConfigService: {
        getModelForPhase: vi.fn().mockResolvedValue({
          modelId: 'fast-model',
          fallbackModelId: 'adult-model',
          temperature: 0.2,
          maxTokens: 4000,
          maxRetries: 0,
          maxContextTokens: null,
        }),
      },
      createModel,
    });

    await runtime.invokeLLM('x'.repeat(4000), {
      phaseName: 'stage_career_playbook_spec',
      promptKey: 'career_playbook_spec_builder',
      node: 'specBuilder',
    });

    expect(createModel).toHaveBeenCalledWith('fast-model', 0.2, 4000, 300_000);
  });

  it('warns and floors the output budget when the prompt exceeds the context window', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    try {
      const invoke = vi.fn().mockResolvedValue({ content: 'ok' });
      const createModel = vi.fn(() => ({ invoke }));
      const runtime = createCareerPlaybookRuntime({
        promptService: { renderPrompt: vi.fn() },
        modelConfigService: {
          getModelForPhase: vi.fn().mockResolvedValue({
            modelId: 'fast-model',
            fallbackModelId: 'adult-model',
            temperature: 0.2,
            maxTokens: 4000,
            maxRetries: 0,
            maxContextTokens: 1100,
          }),
        },
        createModel,
      });

      // 1100 context - 1000 prompt = 100 available (< 512 floor) -> warn + floor at 512.
      await runtime.invokeLLM('x'.repeat(4000), {
        phaseName: 'stage_career_playbook_spec',
        promptKey: 'career_playbook_spec_builder',
        node: 'specBuilder',
      });

      expect(createModel).toHaveBeenCalledWith('fast-model', 0.2, 512, 300_000);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          phaseName: 'stage_career_playbook_spec',
          node: 'specBuilder',
          maxContextTokens: 1100,
        }),
        'Career Playbook prompt exceeds model context window; extended-tier routing may be misconfigured'
      );
    } finally {
      warnSpy.mockRestore();
    }
  });
});
