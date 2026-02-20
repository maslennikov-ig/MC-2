/**
 * Tests for wrapRawMermaidBlocks() (Stage 0) via runMermaidFixPipeline()
 * @module stages/stage6-lesson-content/utils/mermaid-fix-pipeline
 *
 * wrapRawMermaidBlocks() is private. We test it through the public
 * runMermaidFixPipeline() API with skipLLM:true and mocked validator/fixer.
 *
 * The mocked validator always returns { valid: true } so stages 2-5 are
 * effectively no-ops — any wrapping, metrics, and content changes observed
 * come exclusively from Stage 0 (wrapRawMermaidBlocks).
 *
 * Test coverage:
 * 1. Raw flowchart is wrapped in mermaid fences
 * 2. Raw pie chart with label data is wrapped
 * 3. Already-fenced mermaid is NOT double-wrapped
 * 4. Prose with "graph" keyword is NOT wrapped (false-positive protection)
 * 5. "pie" alone without Mermaid syntax is NOT wrapped
 * 6. sequenceDiagram with participants is wrapped
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runMermaidFixPipeline } from '../../../../src/stages/stage6-lesson-content/utils/mermaid-fix-pipeline.js';

// ============================================================================
// MOCKS
// ============================================================================

vi.mock('../../../../src/stages/stage6-lesson-content/utils/mermaid-validator.js', () => ({
  validateMermaidSyntax: vi
    .fn()
    .mockResolvedValue({ valid: true, errors: [], diagramType: 'flowchart' }),
}));

vi.mock('../../../../src/stages/stage6-lesson-content/utils/mermaid-render-validator.js', () => ({
  validateMermaidBlockRender: vi.fn().mockResolvedValue({
    blockIndex: 0,
    diagramType: 'flowchart-v2',
    parseValid: true,
    renderValid: true,
    svgHasRenderableContent: true,
    errors: [],
    codeSnippet: 'flowchart TD A-->B',
  }),
}));

vi.mock('../../../../src/stages/stage6-lesson-content/utils/mermaid-llm-fixer.js', () => ({
  fixMermaidWithLLM: vi.fn().mockResolvedValue({ fixed: false, content: '' }),
}));

vi.mock('@/shared/logger', () => {
  const mock = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
  return { logger: mock, default: mock };
});

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Run the pipeline with LLM disabled (test-safe, no external calls)
 */
async function run(content: string) {
  return runMermaidFixPipeline(content, { skipLLM: true });
}

// ============================================================================
// TESTS
// ============================================================================

describe('wrapRawMermaidBlocks (via runMermaidFixPipeline Stage 0)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Raw flowchart wrapping', () => {
    it('should wrap a raw flowchart block in mermaid fences', async () => {
      const content = [
        'Some introductory text.',
        '',
        'flowchart TD',
        '    A[Start] --> B[Process]',
        '    B --> C[End]',
        '',
        'More text after.',
      ].join('\n');

      const result = await run(content);

      expect(result.content).toContain('```mermaid\nflowchart TD');
      expect(result.metrics.diagramsAutoWrapped).toBe(1);
      expect(result.modified).toBe(true);
    });

    it('should wrap "flowchart LR" (left-right direction)', async () => {
      const content = ['flowchart LR', '    Alice --> Bob', '    Bob --> Carol'].join('\n');

      const result = await run(content);

      expect(result.content).toContain('```mermaid\nflowchart LR');
      expect(result.metrics.diagramsAutoWrapped).toBe(1);
    });

    it('should wrap a "graph TD" block containing arrows', async () => {
      const content = [
        'Diagram below:',
        '',
        'graph TD',
        '    X --> Y',
        '    Y --> Z',
        '',
        'End.',
      ].join('\n');

      const result = await run(content);

      expect(result.content).toContain('```mermaid\ngraph TD');
      expect(result.metrics.diagramsAutoWrapped).toBe(1);
    });
  });

  describe('Raw pie chart wrapping', () => {
    it('should wrap a raw pie chart with label data', async () => {
      const content = ['pie', '    "Sales" : 42', '    "Marketing" : 58'].join('\n');

      const result = await run(content);

      expect(result.content).toContain('```mermaid\npie');
      expect(result.metrics.diagramsAutoWrapped).toBe(1);
    });
  });

  describe('Already-fenced mermaid blocks', () => {
    it('should NOT double-wrap an already-fenced mermaid block', async () => {
      const content = '```mermaid\nflowchart TD\n    A-->B\n```';

      const result = await run(content);

      // Should not gain an extra fence layer
      expect(result.content).not.toContain('```mermaid\n```mermaid');
      expect(result.metrics.diagramsAutoWrapped).toBe(0);
    });

    it('should keep an already-fenced block intact without modification to its structure', async () => {
      const original = '```mermaid\nflowchart TD\n    A-->B\n```\n\nSome prose.';

      const result = await run(original);

      expect(result.content).toContain('```mermaid\nflowchart TD\n    A-->B\n```');
      expect(result.metrics.diagramsAutoWrapped).toBe(0);
    });
  });

  describe('False-positive protection — prose keywords', () => {
    it('should NOT wrap prose that mentions "graph" without Mermaid syntax', async () => {
      const content = [
        'This graph shows the relationship between',
        'various components of the system.',
        '',
        'The section on deployment follows.',
      ].join('\n');

      const result = await run(content);

      expect(result.content).not.toContain('```mermaid');
      expect(result.metrics.diagramsAutoWrapped).toBe(0);
    });

    it('should NOT wrap a paragraph that starts with "flowchart" as a prose word', async () => {
      const content = [
        'flowchart',
        '',
        'This is a lesson about how flowcharts are used in software design.',
        'We will explore many examples.',
      ].join('\n');

      const result = await run(content);

      expect(result.metrics.diagramsAutoWrapped).toBe(0);
    });

    it('should NOT wrap "pie" keyword alone without chart data', async () => {
      const content = [
        'pie',
        '',
        'This is a lesson about pie charts and data visualization.',
        'Pie charts display proportional data clearly.',
      ].join('\n');

      const result = await run(content);

      // No mermaid syntax in the lookahead — should not be wrapped
      expect(result.metrics.diagramsAutoWrapped).toBe(0);
    });
  });

  describe('sequenceDiagram wrapping', () => {
    it('should wrap a raw sequenceDiagram block', async () => {
      // Note: participant lines must be unindented for the ^participant pattern to match.
      // The ->> arrow is not in MERMAID_SYNTAX_PATTERNS; use --> which is.
      const content = [
        'sequenceDiagram',
        'participant Alice',
        'participant Bob',
        'Alice-->Bob: Hello',
        'Bob-->Alice: Hi',
      ].join('\n');

      const result = await run(content);

      expect(result.content).toContain('```mermaid\nsequenceDiagram');
      expect(result.metrics.diagramsAutoWrapped).toBe(1);
    });
  });

  describe('Multiple raw diagrams in one document', () => {
    it('should wrap two separate raw diagrams independently', async () => {
      // participant lines must be unindented; use --> instead of ->> (not in patterns).
      const content = [
        '## Section 1',
        '',
        'flowchart TD',
        '    A --> B',
        '    B --> C',
        '',
        '## Section 2',
        '',
        'sequenceDiagram',
        'participant User',
        'participant Server',
        'User-->Server: Request',
      ].join('\n');

      const result = await run(content);

      expect(result.metrics.diagramsAutoWrapped).toBe(2);
      expect(result.content).toContain('```mermaid\nflowchart TD');
      expect(result.content).toContain('```mermaid\nsequenceDiagram');
    });
  });

  describe('Content without any mermaid diagrams', () => {
    it('should return unchanged content when there is nothing to wrap', async () => {
      const content = 'Just plain text.\n\nNo diagrams here.';

      const result = await run(content);

      expect(result.metrics.diagramsAutoWrapped).toBe(0);
      expect(result.modified).toBe(false);
      expect(result.content).toBe(content);
    });
  });

  describe('Metrics and return value structure', () => {
    it('should return correct metric keys in the result object', async () => {
      const result = await run('Just some text.');

      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('modified');
      expect(result).toHaveProperty('metrics');
      expect(result.metrics).toHaveProperty('diagramsTotal');
      expect(result.metrics).toHaveProperty('diagramsAutoWrapped');
      expect(result.metrics).toHaveProperty('diagramsFixedRegex');
      expect(result.metrics).toHaveProperty('diagramsFixedLLM');
      expect(result.metrics).toHaveProperty('diagramsFallback');
      expect(result.metrics).toHaveProperty('durationMs');
    });

    it('should report diagramsTotal=1 after wrapping one raw diagram', async () => {
      const content = ['flowchart TD', '    A[Start] --> B[End]'].join('\n');

      const result = await run(content);

      // Stage 0 wraps it, then Stage 2 extracts 1 mermaid block
      expect(result.metrics.diagramsTotal).toBe(1);
      expect(result.metrics.diagramsAutoWrapped).toBe(1);
    });
  });
});
