import { describe, expect, it, vi } from 'vitest';
import {
  buildDepartmentClassifierPromptVariables,
  DEPARTMENT_CLASSIFIER_PHASE,
  DEPARTMENT_CLASSIFIER_PROMPT_KEY,
  parseDepartmentResolutionFromLLM,
  resolveCareerPlaybookDepartmentOptions,
} from '@/stages/stage-career-playbook/nodes/department-classifier';
import type { CareerPlaybookRuntime } from '@/stages/stage-career-playbook/nodes/runtime';

describe('Career Playbook department classifier', () => {
  it('builds prompt variables from the role title and UI language', () => {
    expect(
      buildDepartmentClassifierPromptVariables({
        title: 'Координатор внедрения',
        language: 'ru',
      })
    ).toEqual(
      expect.objectContaining({
        title: 'Координатор внедрения',
        ui_language: 'ru',
      })
    );
  });

  it('parses valid LLM JSON and keeps only allowed department candidates', () => {
    const parsed = parseDepartmentResolutionFromLLM(
      JSON.stringify({
        candidates: [
          { value: 'operations', label: 'Операции', confidence: 0.74 },
          { value: 'support', label: 'Поддержка и работа с клиентами', confidence: 0.68 },
          { value: 'unsupported', label: 'Unsupported', confidence: 0.99 },
        ],
      })
    );

    expect(parsed).toEqual({
      status: 'needs_user_choice',
      source: 'llm',
      confidence: 0.74,
      candidates: [
        { value: 'operations', label: 'Операции', confidence: 0.74 },
        { value: 'support', label: 'Поддержка и работа с клиентами', confidence: 0.68 },
      ],
    });
  });

  it('retries with fallback model preference after invalid classifier JSON', async () => {
    const renderPrompt = vi.fn().mockResolvedValue('department prompt');
    const invokeLLM = vi
      .fn<CareerPlaybookRuntime['invokeLLM']>()
      .mockResolvedValueOnce({
        content: '{"candidates":[]}',
        model: 'fast-model',
        inputTokens: 10,
        outputTokens: 5,
        costUsd: 0,
        durationMs: 12,
        attemptCount: 1,
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({
          candidates: [{ value: 'operations', label: 'Operations', confidence: 0.7 }],
        }),
        model: 'fallback-model',
        inputTokens: 10,
        outputTokens: 8,
        costUsd: 0,
        durationMs: 18,
        attemptCount: 1,
      });

    const result = await resolveCareerPlaybookDepartmentOptions(
      { title: 'Unusual company role', language: 'en' },
      { renderPrompt, invokeLLM }
    );

    expect(renderPrompt).toHaveBeenCalledWith(
      DEPARTMENT_CLASSIFIER_PROMPT_KEY,
      expect.objectContaining({
        title: 'Unusual company role',
        ui_language: 'en',
      })
    );
    expect(invokeLLM).toHaveBeenNthCalledWith(
      1,
      'department prompt',
      expect.objectContaining({
        phaseName: DEPARTMENT_CLASSIFIER_PHASE,
        preferFallbackModel: false,
      })
    );
    expect(invokeLLM).toHaveBeenNthCalledWith(
      2,
      'department prompt',
      expect.objectContaining({
        phaseName: DEPARTMENT_CLASSIFIER_PHASE,
        preferFallbackModel: true,
      })
    );
    expect(result.status).toBe('needs_user_choice');
    expect(result.candidates).toHaveLength(1);
  });
});
