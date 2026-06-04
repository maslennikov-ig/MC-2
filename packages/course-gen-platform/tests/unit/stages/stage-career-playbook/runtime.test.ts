import { describe, expect, it, vi } from 'vitest';
import { createCareerPlaybookRuntime } from '@/stages/stage-career-playbook/nodes/runtime';

describe('Career Playbook runtime', () => {
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
    expect(createModel).toHaveBeenNthCalledWith(1, 'fast-model', 0.2, 1000);
    expect(createModel).toHaveBeenNthCalledWith(2, 'adult-model', 0.2, 1000);
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

    expect(createModel).toHaveBeenCalledWith('adult-model', 0.2, 1250);
  });
});
