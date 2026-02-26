/**
 * Tests for adaptive Mermaid remediation chain in fix pipeline
 * @module stages/stage6-lesson-content/utils/mermaid-remediation-chain.test
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockValidateMermaidBlockRender, mockFixMermaidWithLLM } = vi.hoisted(() => ({
  mockValidateMermaidBlockRender: vi.fn(),
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

vi.mock('../../../../src/stages/stage6-lesson-content/utils/mermaid-render-validator.js', () => ({
  validateMermaidBlockRender: mockValidateMermaidBlockRender,
}));

vi.mock('../../../../src/stages/stage6-lesson-content/utils/mermaid-llm-fixer.js', () => ({
  fixMermaidWithLLM: mockFixMermaidWithLLM,
}));

import { runMermaidFixPipeline } from '../../../../src/stages/stage6-lesson-content/utils/mermaid-fix-pipeline.js';

function invalidDiagnostic(message: string) {
  return {
    blockIndex: 0,
    diagramType: 'flowchart-v2',
    parseValid: false,
    renderValid: false,
    svgHasRenderableContent: false,
    errors: [message],
    codeSnippet: 'flowchart TD A --> B',
  };
}

function validDiagnostic() {
  return {
    blockIndex: 0,
    diagramType: 'flowchart-v2',
    parseValid: true,
    renderValid: true,
    svgHasRenderableContent: true,
    errors: [],
    codeSnippet: 'flowchart TD A --> B',
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
    mockValidateMermaidBlockRender.mockImplementation((code: string) => {
      if (code.includes('style A')) {
        return Promise.resolve(invalidDiagnostic('Unsupported style command'));
      }
      return Promise.resolve(validDiagnostic());
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
    mockValidateMermaidBlockRender.mockImplementation((code: string) => {
      const hasLeftHalf =
        code.includes('A --> B') && code.includes('B --> C') && !code.includes('D --> E');
      const hasRightHalf =
        code.includes('C --> D') && code.includes('D --> E') && !code.includes('A --> B');

      if (hasLeftHalf || hasRightHalf) {
        return Promise.resolve(validDiagnostic());
      }

      return Promise.resolve(invalidDiagnostic('Diagram too complex'));
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

  it('falls back to structured markdown (not HTML comment) when simplify and split both fail', async () => {
    mockValidateMermaidBlockRender.mockResolvedValue(invalidDiagnostic('Parse failed'));

    const content = `
\`\`\`mermaid
flowchart TD
  A[Broken
  A --> B
\`\`\`
`;

    const result = await runMermaidFixPipeline(content, { skipLLM: true });

    expect(result.metrics.diagramsFallback).toBe(1);
    expect(result.content).toContain('Diagram unavailable (auto-remediated)');
    expect(result.content).not.toContain('<!-- Mermaid');
    expect(result.content).not.toContain('```mermaid');
  });
});
