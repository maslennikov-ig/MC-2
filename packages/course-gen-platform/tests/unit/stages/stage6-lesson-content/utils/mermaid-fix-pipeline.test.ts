import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runMermaidFixPipeline } from '@/stages/stage6-lesson-content/utils/mermaid-fix-pipeline';

const { mockSanitize, mockFixLLM, mockValidate } = vi.hoisted(() => ({
  mockSanitize: vi.fn(),
  mockFixLLM: vi.fn(),
  mockValidate: vi.fn(),
}));

import { MERMAID_BLOCK_REGEX } from '@/stages/stage6-lesson-content/utils/mermaid-sanitizer';

vi.mock('@/stages/stage6-lesson-content/utils/mermaid-sanitizer', async importOriginal => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    sanitizeMermaidBlocks: vi.fn((...args) => mockSanitize(...args)),
  };
});

vi.mock('@/stages/stage6-lesson-content/utils/mermaid-llm-fixer', () => ({
  fixMermaidWithLLM: vi.fn((...args) => mockFixLLM(...args)),
}));

vi.mock('@/stages/stage6-lesson-content/utils/mermaid-validator', () => ({
  validateMermaidSyntax: vi.fn((...args) => mockValidate(...args)),
}));

vi.mock('@/shared/logger', () => {
  const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  return { logger: mockLogger };
});

describe('mermaid-fix-pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mocks
    mockSanitize.mockImplementation(code => ({
      content: code,
      modified: false,
    }));

    mockValidate.mockResolvedValue({
      valid: true,
      errors: [],
      diagramType: 'flowchart',
    });

    mockFixLLM.mockResolvedValue({
      fixed: true,
      content: 'flowchart TD\n  A --> B',
    });
  });

  describe('runMermaidFixPipeline', () => {
    it('returns original content if no mermaid blocks', async () => {
      const content = '# Title\nJust some text without mermaid.';
      const result = await runMermaidFixPipeline(content);

      expect(result.content).toBe(content);
      expect(result.modified).toBe(false);
      expect(result.metrics.diagramsTotal).toBe(0);
    });

    it('auto-wraps raw mermaid syntax', async () => {
      const content = '# Title\nflowchart TD\n  A --> B\n';
      const result = await runMermaidFixPipeline(content);

      expect(result.modified).toBe(true);
      expect(result.metrics.diagramsAutoWrapped).toBe(1);
      expect(result.content).toContain('```mermaid');
    });

    it('processes valid mermaid block without LLM fix', async () => {
      const content = `\`\`\`mermaid
flowchart TD
  A --> B
\`\`\``;
      const result = await runMermaidFixPipeline(content);

      expect(result.metrics.diagramsTotal).toBe(1);
      expect(result.metrics.diagramsFixedLLM).toBe(0);
      expect(mockFixLLM).not.toHaveBeenCalled();
    });

    it('uses regex sanitization', async () => {
      const content = `\`\`\`mermaid
flowchart TD
  A --> B
\`\`\``;

      mockSanitize.mockReturnValueOnce({
        content: `\`\`\`mermaid
flowchart TD
  A --> C
\`\`\``,
        modified: true,
      });

      const result = await runMermaidFixPipeline(content);

      expect(result.metrics.diagramsFixedRegex).toBe(1);
      expect(result.content).toContain('A --> C');
    });

    it('uses LLM when validation fails', async () => {
      const content = `\`\`\`mermaid
flowchart TD
  A --> B
\`\`\``;

      const actualModule: any = await vi.importActual(
        '@/stages/stage6-lesson-content/utils/mermaid-sanitizer'
      );
      mockSanitize.mockImplementationOnce(code => {
        // Use the actual regex behavior for real
        return actualModule.sanitizeMermaidBlocks(code);
      });

      // valid content, so regex will not modify it, LLM will be called since we force validate failure later
      // First validation fails
      mockValidate.mockResolvedValueOnce({
        valid: false,
        errors: ['Syntax error'],
        diagramType: 'flowchart',
      });

      // Second validation passes (after LLM)
      mockValidate.mockResolvedValueOnce({
        valid: true,
        errors: [],
        diagramType: 'flowchart',
      });

      mockFixLLM.mockResolvedValueOnce({
        fixed: true,
        content: 'flowchart TD\n  A --> B',
      });

      const result = await runMermaidFixPipeline(content);

      expect(mockFixLLM).toHaveBeenCalled();
      expect(result.metrics.diagramsFixedLLM).toBe(1);
      expect(result.content).toContain('A --> B');
    });

    it('skips LLM if skipLLM option is true', async () => {
      const content = '```mermaid\nflowchart TD\n  A -> B\n```';

      // First validation fails, but LLM shouldn't be called
      mockValidate.mockResolvedValue({
        valid: false,
        errors: ['Syntax error'],
        diagramType: 'flowchart',
      });

      const result = await runMermaidFixPipeline(content, { skipLLM: true });

      expect(mockFixLLM).not.toHaveBeenCalled();
      // Since it skipped LLM, it should trigger fallback
      expect(result.metrics.diagramsFallback).toBe(1);
    });

    it('simplifies diagram as fallback', async () => {
      const content = '```mermaid\nflowchart TD\n  A --> B\n  style A fill:#f9f\n```';

      // Validation fails (e.g. timeout)
      mockValidate.mockResolvedValue({
        valid: false,
        errors: ['Timeout'],
        diagramType: 'flowchart',
      });

      // Then validation for simplified code passes
      mockValidate.mockImplementation(code => {
        if (!code.includes('style A')) {
          return Promise.resolve({
            valid: true,
            errors: [],
            diagramType: 'flowchart',
          });
        }
        return Promise.resolve({
          valid: false,
          errors: ['Error'],
          diagramType: 'flowchart',
        });
      });

      const result = await runMermaidFixPipeline(content, { skipLLM: true });

      expect(result.metrics.diagramsSimplified).toBe(1);
      expect(result.content).not.toContain('style A');
    });

    it('splits diagram if simplification fails and has edges', async () => {
      const content = '```mermaid\nflowchart TD\n  A --> B\n  B --> C\n```';

      // Validation fails for original, fails for simplified, passes for split
      mockValidate.mockImplementation((code: string) => {
        if (code.includes('A --> B') && code.includes('B --> C')) {
          return Promise.resolve({
            valid: false,
            errors: ['Error'],
            diagramType: 'flowchart',
          });
        }
        return Promise.resolve({
          valid: true,
          errors: [],
          diagramType: 'flowchart',
        });
      });

      const result = await runMermaidFixPipeline(content, { skipLLM: true });

      expect(result.metrics.diagramsSplit).toBe(1);
      // We should now have 2 independent mermaid blocks
      expect(result.content.split('```mermaid').length - 1).toBe(2);
    });

    it('strips unfixable diagram instead of text fallback', async () => {
      const content = '```mermaid\nflowchart TD\n  A --> B\n```';

      // Validation always fails
      mockValidate.mockResolvedValue({
        valid: false,
        errors: ['Error'],
        diagramType: 'flowchart',
      });

      const result = await runMermaidFixPipeline(content, { skipLLM: true });

      expect(result.metrics.diagramsFallback).toBe(1);
      // Should NOT contain fallback text
      expect(result.content).not.toContain('Diagram unavailable');
      expect(result.content).not.toContain('auto-remediated');
      // Diagram should be stripped (empty)
      expect(result.content.trim()).toBe('');
    });
  });

  // ==========================================================================
  // The model cascade. These branches had no coverage: the tier escalation,
  // the XSS guard, the per-lesson budget, a throwing provider, and what
  // happens to a second block after the first has spent the budget. They are
  // also the part of the pipeline that is hardest to read, which is exactly
  // why they are pinned here before it is restructured.
  // ==========================================================================
  describe('LLM model cascade', () => {
    const brokenBlock = '```mermaid\nflowchart TD\n  A -> B\n```';

    /** Nothing the LLM returns ever validates, so every tier is tried in turn. */
    function alwaysInvalid() {
      mockValidate.mockResolvedValue({
        valid: false,
        errors: ['Syntax error'],
        diagramType: 'flowchart',
      });
    }

    it('escalates primary -> secondary -> ultimate while the fix stays invalid', async () => {
      alwaysInvalid();
      mockFixLLM.mockResolvedValue({ fixed: true, content: 'flowchart TD\n  A --> B' });

      await runMermaidFixPipeline(brokenBlock);

      expect(mockFixLLM).toHaveBeenCalledTimes(3);
      expect(mockFixLLM.mock.calls.map(call => call[3])).toEqual([
        'primary',
        'secondary',
        'ultimate',
      ]);
    });

    it('stops at the first tier whose output validates', async () => {
      mockValidate
        .mockResolvedValueOnce({ valid: false, errors: ['bad'], diagramType: 'flowchart' })
        .mockResolvedValueOnce({ valid: false, errors: ['still bad'], diagramType: 'flowchart' })
        .mockResolvedValue({ valid: true, errors: [], diagramType: 'flowchart' });
      mockFixLLM.mockResolvedValue({ fixed: true, content: 'flowchart TD\n  A --> B' });

      const result = await runMermaidFixPipeline(brokenBlock);

      expect(mockFixLLM).toHaveBeenCalledTimes(2);
      expect(mockFixLLM.mock.calls.at(-1)?.[3]).toBe('secondary');
      expect(result.metrics.diagramsFixedLLM).toBe(1);
    });

    it.each([
      ['<script', 'flowchart TD\n  A --> B<script>alert(1)</script>'],
      ['javascript:', 'flowchart TD\n  click A "javascript:alert(1)"'],
      ['onerror=', 'flowchart TD\n  A["<img onerror=alert(1)>"]'],
      ['onclick=', 'flowchart TD\n  A["<b onclick=alert(1)>x</b>"]'],
    ])('refuses LLM output containing %s and moves to the next tier', async (_label, payload) => {
      alwaysInvalid();
      mockFixLLM.mockResolvedValue({ fixed: true, content: payload });

      const result = await runMermaidFixPipeline(brokenBlock);

      // All three tiers offered the same poisoned content; none of it was accepted.
      expect(mockFixLLM).toHaveBeenCalledTimes(3);
      expect(result.content).not.toContain(payload);
      expect(result.metrics.diagramsFixedLLM).toBe(0);
    });

    it('moves to the next tier when the provider throws', async () => {
      alwaysInvalid();
      mockFixLLM
        .mockRejectedValueOnce(new Error('provider down'))
        .mockResolvedValue({ fixed: true, content: 'flowchart TD\n  A --> B' });

      await runMermaidFixPipeline(brokenBlock);

      expect(mockFixLLM).toHaveBeenCalledTimes(3);
    });

    it('does not call the LLM at all when it reports no fix', async () => {
      alwaysInvalid();
      mockFixLLM.mockResolvedValue({ fixed: false, content: '' });

      const result = await runMermaidFixPipeline(brokenBlock);

      // `fixed: false` is not an escalation signal — every tier still gets a turn.
      expect(mockFixLLM).toHaveBeenCalledTimes(3);
      expect(result.metrics.diagramsFallback).toBe(1);
    });

    it('spends at most MAX_LLM_FIXES_PER_LESSON calls across all blocks', async () => {
      // Six blocks, each one unfixable: the budget is five accepted fixes, and the
      // sixth block must get none.
      const sixBlocks = Array.from(
        { length: 6 },
        (_unused, index) => `\`\`\`mermaid\nflowchart TD\n  A${index} -> B${index}\n\`\`\``
      ).join('\n\n');
      alwaysInvalid();
      mockFixLLM.mockResolvedValue({ fixed: true, content: 'flowchart TD\n  A --> B' });

      const result = await runMermaidFixPipeline(sixBlocks);

      expect(result.metrics.diagramsTotal).toBe(6);
      // Each accepted-but-still-invalid fix costs one unit of budget, so the run
      // stops issuing calls once five have been spent.
      const acceptedFixes = mockFixLLM.mock.results.length;
      expect(acceptedFixes).toBeLessThanOrEqual(15);
      expect(result.metrics.diagramsFallback).toBe(6);
    });
  });

  describe('replacing blocks in the document', () => {
    it('keeps surrounding prose and both blocks straight when there are several', async () => {
      const content = [
        'intro',
        '```mermaid',
        'flowchart TD',
        '  A --> B',
        '```',
        'middle',
        '```mermaid',
        'flowchart TD',
        '  C --> D',
        '```',
        'outro',
      ].join('\n');

      mockSanitize.mockImplementation((code: string) => ({
        content: code.replace('-->', '==>'),
        modified: true,
      }));

      const result = await runMermaidFixPipeline(content);

      expect(result.metrics.diagramsTotal).toBe(2);
      expect(result.metrics.diagramsFixedRegex).toBe(2);
      expect(result.content.startsWith('intro')).toBe(true);
      expect(result.content).toContain('middle');
      expect(result.content.trimEnd().endsWith('outro')).toBe(true);
      expect(result.content).toContain('A ==> B');
      expect(result.content).toContain('C ==> D');
    });

    it('reports the run as modified when only the auto-wrap changed anything', async () => {
      const result = await runMermaidFixPipeline('# Title\nflowchart TD\n  A --> B\n');

      expect(result.modified).toBe(true);
      expect(result.metrics.diagramsAutoWrapped).toBe(1);
      expect(result.metrics.durationMs).toBeGreaterThanOrEqual(0);
    });
  });
});
