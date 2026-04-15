import { describe, expect, it } from 'vitest';
import { singleCallGeneratorPrompt } from '@/shared/prompts/stage6/single-call-generator';

describe('singleCallGeneratorPrompt hardening', () => {
  it('requires visual elements actively with minimum density guidance', () => {
    const template = singleCallGeneratorPrompt.promptTemplate;

    // Visual toolkit must use active language (aligned with serial generator)
    expect(template).toContain('Use actively to create engaging, professional content');
    // Minimum visual density requirement in toolkit section
    expect(template).toContain('MINIMUM VISUAL DENSITY');
    // Required visual enhancement in critical rules
    expect(template).toContain('REQUIRED: Visual Enhancement');
    // Should NOT have the old soft language
    expect(template).not.toContain('Use selectively when it materially improves understanding');
    expect(template).not.toContain('Include a visual element only when it clarifies the concept.');
  });

  it('adds audience-fit rules with visual guidance for business content', () => {
    const template = singleCallGeneratorPrompt.promptTemplate;

    // Business audiences get specific visual guidance
    expect(template).toContain('For non-technical or business audiences');
    expect(template).toContain('Tables are especially effective for comparing strategies');
    expect(template).toContain('Mermaid flowcharts work well for workflows');
    expect(template).toContain('Code or config snippets are allowed only for code_tutorial.');
    expect(template).not.toContain('presentation critic');
    expect(template).not.toContain('human-eye simulation');
  });
});
