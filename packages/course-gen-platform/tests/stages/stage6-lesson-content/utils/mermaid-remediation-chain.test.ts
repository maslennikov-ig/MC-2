/**
 * Tests for adaptive Mermaid remediation chain in fix pipeline
 * @module stages/stage6-lesson-content/utils/mermaid-remediation-chain.test
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockValidateMermaidSyntax, mockFixMermaidWithLLM } = vi.hoisted(() => ({
  mockValidateMermaidSyntax: vi.fn(),
  mockFixMermaidWithLLM: vi.fn(),
}));

vi.mock('@/shared/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../../src/stages/stage6-lesson-content/utils/mermaid-validator.js', () => ({
  validateMermaidSyntax: mockValidateMermaidSyntax,
}));

vi.mock('../../../../src/stages/stage6-lesson-content/utils/mermaid-llm-fixer.js', () => ({
  fixMermaidWithLLM: mockFixMermaidWithLLM,
}));

import { runMermaidFixPipeline } from '../../../../src/stages/stage6-lesson-content/utils/mermaid-fix-pipeline.js';

function invalidResult(message: string) {
  return {
    valid: false,
    diagramType: 'flowchart-v2',
    errors: [message],
  };
}

function validResult() {
  return {
    valid: true,
    diagramType: 'flowchart-v2',
    errors: [],
  };
}

describe('runMermaidFixPipeline remediation chain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFixMermaidWithLLM.mockResolvedValue({
      fixed: false,
      content: '',
      explanation: '',
    });
  });

  it('uses simplify stage before split/fallback when simplification can pass validation', async () => {
    mockValidateMermaidSyntax.mockImplementation((code: string) => {
      if (code.includes('style A')) {
        return Promise.resolve(invalidResult('Unsupported style command'));
      }
      return Promise.resolve(validResult());
    });

    const content = `
\`\`\`mermaid
flowchart TD
  A --> B
  style A fill:#f9f,stroke:#333,stroke-width:2px
\`\`\`
`;

    const result = await runMermaidFixPipeline(content, { skipLLM: true });

    expect(result.metrics.diagramsFallback).toBe(0);
    expect(result.content).toContain('```mermaid');
    expect(result.content).not.toContain('style A fill');
    expect(result.content).not.toContain('<!-- Mermaid');
  });

  it('splits into at most two Mermaid diagrams when single-diagram validation keeps failing', async () => {
    mockValidateMermaidSyntax.mockImplementation((code: string) => {
      const hasLeftHalf =
        code.includes('A --> B') && code.includes('B --> C') && !code.includes('D --> E');
      const hasRightHalf =
        code.includes('C --> D') && code.includes('D --> E') && !code.includes('A --> B');

      if (hasLeftHalf || hasRightHalf) {
        return Promise.resolve(validResult());
      }

      return Promise.resolve(invalidResult('Diagram too complex'));
    });

    const content = `
\`\`\`mermaid
flowchart TD
  A --> B
  B --> C
  C --> D
  D --> E
\`\`\`
`;

    const result = await runMermaidFixPipeline(content, { skipLLM: true });
    const fencedMermaidBlocks = (result.content.match(/```mermaid/g) || []).length;

    expect(result.metrics.diagramsFallback).toBe(0);
    expect(fencedMermaidBlocks).toBe(2);
    expect(result.content).not.toContain('<!-- Mermaid');
  });

  it('strips unfixable diagram (instead of text fallback) when simplify and split both fail', async () => {
    mockValidateMermaidSyntax.mockResolvedValue(invalidResult('Parse failed'));

    const content = `
\`\`\`mermaid
flowchart TD
  A[Broken
  A --> B
\`\`\`
`;

    const result = await runMermaidFixPipeline(content, { skipLLM: true });

    expect(result.metrics.diagramsFallback).toBe(1);
    expect(result.content).not.toContain('Diagram unavailable (auto-remediated)');
    expect(result.content).not.toContain('<!-- Mermaid');
    expect(result.content).not.toContain('```mermaid');
  });
});
