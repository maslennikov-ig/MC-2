import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPromptService } from '@/shared/prompts/prompt-service';
import { PROMPT_REGISTRY } from '@/shared/prompts/prompt-registry';

vi.mock('@/shared/supabase/admin', () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          })),
        })),
      })),
    })),
  })),
}));

describe('PromptService required variable handling', () => {
  beforeEach(() => {
    createPromptService().clearCache();
  });

  it('should treat empty string as provided value for required variables', async () => {
    const prompt = PROMPT_REGISTRY.get('stage5_batch_section_generator');
    expect(prompt).toBeDefined();

    const variables = Object.fromEntries(
      (prompt?.variables ?? []).map(variable => [variable.name, ''])
    );

    await expect(
      createPromptService().renderPrompt('stage5_batch_section_generator', variables)
    ).resolves.toEqual(expect.any(String));
  });

  it('should throw when required variable key is missing', async () => {
    await expect(
      createPromptService().renderPrompt('stage5_batch_section_generator', {
        courseTitle: 'Test',
      })
    ).rejects.toThrow('Missing required variables');
  });
});
