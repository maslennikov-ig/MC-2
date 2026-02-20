/**
 * Tests for Mermaid render validator utilities
 * @module stages/stage6-lesson-content/utils/mermaid-render-validator.test
 */

import { JSDOM } from 'jsdom';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/logger', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(),
  },
}));

vi.mock('../../../../src/stages/stage6-lesson-content/utils/mermaid-validator.js', () => ({
  validateMermaidSyntax: vi.fn(),
}));

import mermaid from 'mermaid';
import { validateMermaidSyntax } from '../../../../src/stages/stage6-lesson-content/utils/mermaid-validator.js';
import {
  countMermaidFallbackComments,
  validateMermaidBlockRender,
  validateMermaidRenderInMarkdown,
} from '../../../../src/stages/stage6-lesson-content/utils/mermaid-render-validator.js';

const mockRender = mermaid.render as ReturnType<typeof vi.fn>;
const mockInitialize = mermaid.initialize as ReturnType<typeof vi.fn>;
const mockValidateMermaidSyntax = validateMermaidSyntax as ReturnType<typeof vi.fn>;

describe('mermaid-render-validator', () => {
  beforeEach(() => {
    const dom = new JSDOM('<!DOCTYPE html><body></body>');
    global.document = dom.window.document as unknown as Document;
    global.window = dom.window as unknown as Window & typeof globalThis;

    mockRender.mockReset();
    mockInitialize.mockReset();
    mockValidateMermaidSyntax.mockReset();
  });

  afterEach(() => {
    // @ts-expect-error intentional cleanup for test isolation
    delete global.document;
    // @ts-expect-error intentional cleanup for test isolation
    delete global.window;
  });

  it('counts fallback comments in markdown', () => {
    const content = `
<!-- Mermaid flowchart could not be rendered. Please review manually. -->
Some text
<!-- Mermaid sequenceDiagram could not be rendered. Please review manually. -->
`;
    expect(countMermaidFallbackComments(content)).toBe(2);
  });

  it('returns parse failure diagnostics and skips render', async () => {
    mockValidateMermaidSyntax.mockResolvedValue({
      valid: false,
      diagramType: null,
      errors: ['Parse error at line 1'],
    });

    const result = await validateMermaidBlockRender('flowchart TD\nA -->', 0);

    expect(result.parseValid).toBe(false);
    expect(result.renderValid).toBe(false);
    expect(result.errors[0]).toContain('Parse error');
    expect(mockRender).not.toHaveBeenCalled();
  });

  it('fails render validation when SVG has defs-only content', async () => {
    mockValidateMermaidSyntax.mockResolvedValue({
      valid: true,
      diagramType: 'flowchart-v2',
      errors: [],
    });
    mockRender.mockResolvedValue({
      svg: '<svg xmlns="http://www.w3.org/2000/svg"><defs><path d="M0 0 L10 10"/></defs></svg>',
    });

    const result = await validateMermaidBlockRender('flowchart TD\n  A-->B', 1);

    expect(result.parseValid).toBe(true);
    expect(result.renderValid).toBe(false);
    expect(result.errors[0]).toContain('without renderable graph nodes');
  });

  it('passes when parse succeeds and SVG contains graph nodes', async () => {
    mockValidateMermaidSyntax.mockResolvedValue({
      valid: true,
      diagramType: 'flowchart-v2',
      errors: [],
    });
    mockRender.mockResolvedValue({
      svg: '<svg xmlns="http://www.w3.org/2000/svg"><g><rect width="10" height="10"/></g></svg>',
    });

    const result = await validateMermaidBlockRender('flowchart TD\n  A-->B', 2);

    expect(result.parseValid).toBe(true);
    expect(result.renderValid).toBe(true);
    expect(result.svgHasRenderableContent).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('aggregates markdown diagnostics and fallback comment counts', async () => {
    mockValidateMermaidSyntax.mockImplementation((code: string) => {
      if (code.includes('BROKEN')) {
        return {
          valid: false,
          diagramType: null,
          errors: ['Broken diagram'],
        };
      }
      return {
        valid: true,
        diagramType: 'flowchart-v2',
        errors: [],
      };
    });
    mockRender.mockResolvedValue({
      svg: '<svg xmlns="http://www.w3.org/2000/svg"><g><rect width="10" height="10"/></g></svg>',
    });

    const markdown = `
\`\`\`mermaid
flowchart TD
  A --> B
\`\`\`

\`\`\`mermaid
flowchart TD
  BROKEN -->
\`\`\`

<!-- Mermaid flowchart could not be rendered. Please review manually. -->
`;

    const result = await validateMermaidRenderInMarkdown(markdown);

    expect(result.totalBlocks).toBe(2);
    expect(result.failedBlocks).toBe(1);
    expect(result.fallbackComments).toBe(1);
    expect(result.passed).toBe(false);
  });
});
