import { describe, expect, it } from 'vitest';
import { singleCallGeneratorPrompt } from '@/shared/prompts/stage6/single-call-generator';

describe('singleCallGeneratorPrompt hardening', () => {
  it('keeps the prompt English while softening visual bias', () => {
    const template = singleCallGeneratorPrompt.promptTemplate;

    expect(template).toContain('Use selectively when it materially improves understanding');
    expect(template).not.toContain('Use actively to create engaging content');
    expect(template).toContain('Include a visual element only when it clarifies the concept.');
    expect(template).not.toContain('Include at least 1 visual element');
  });

  it('adds a compact audience-fit rule without expanding into a rubric block', () => {
    const template = singleCallGeneratorPrompt.promptTemplate;

    expect(template).toContain(
      'For non-technical or business audiences, explain conceptually and use business examples.'
    );
    expect(template).toContain('Code or config snippets are allowed only for code_tutorial.');
    expect(template).not.toContain('presentation critic');
    expect(template).not.toContain('human-eye simulation');
  });
});
