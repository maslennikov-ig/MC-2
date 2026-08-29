import { describe, expect, it } from 'vitest';
import { careerPlaybookPrompts } from '@/shared/prompts/career-playbook-prompts';

describe('Career Playbook spec-builder prompt', () => {
  // mc2-eksyp: spec-builder-canonical.ts:144 (normalizeRoleProfileSpecToCanonicalBlockTopics)
  // overwrites do_not_repeat unconditionally, so an instruction asking the model to
  // fill it pays output tokens for a discarded answer and contradicts the code.
  it('does not instruct the model to fill do_not_repeat', () => {
    const specBuilderPrompt = careerPlaybookPrompts.find(
      prompt => prompt.promptKey === 'career_playbook_spec_builder'
    );

    expect(specBuilderPrompt).toBeDefined();
    expect(specBuilderPrompt?.promptTemplate).not.toMatch(/do_not_repeat only when/i);
  });
});
