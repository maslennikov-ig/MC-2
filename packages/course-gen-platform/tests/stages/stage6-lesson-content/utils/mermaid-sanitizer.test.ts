/**
 * Tests for Mermaid Sanitizer and Syntax Check Functions
 * @module stages/stage6-lesson-content/utils/mermaid-sanitizer.test
 *
 * Tests sanitizeMermaidBlocks, hasBrokenMermaidSyntax, countMermaidBlocks,
 * and checkMermaidSyntax from heuristic-filter.
 */

import { describe, it, expect } from 'vitest';
import {
  sanitizeMermaidBlocks,
  hasBrokenMermaidSyntax,
  countMermaidBlocks,
} from '../../../../src/stages/stage6-lesson-content/utils/mermaid-sanitizer.js';
import {
  checkMermaidSyntax,
} from '../../../../src/stages/stage6-lesson-content/judge/heuristic-filter.js';

// ============================================================================
// sanitizeMermaidBlocks Tests
// ============================================================================

describe('sanitizeMermaidBlocks', () => {
  describe('Content with escaped quotes', () => {
    it('should remove escaped quotes from Mermaid blocks', () => {
      const content = `# Lesson

\`\`\`mermaid
flowchart TD
    A[Контакт: \\"Обещал ответ\\"]
    B[Статус: \\"В работе\\"]
    A --> B
\`\`\`

Some text after.`;

      const result = sanitizeMermaidBlocks(content);

      expect(result.modified).toBe(true);
      expect(result.blocksProcessed).toBe(1);
      expect(result.fixes.length).toBe(1);
      expect(result.fixes[0].type).toBe('ESCAPED_QUOTE_REMOVED');
      expect(result.fixes[0].count).toBe(4); // 4 escaped quotes removed
      expect(result.content).toContain('A[Контакт: Обещал ответ]');
      expect(result.content).toContain('B[Статус: В работе]');
      expect(result.content).not.toContain('\\"');
    });

    it('should handle multiple Mermaid blocks', () => {
      const content = `# Lesson

\`\`\`mermaid
flowchart TD
    A[Step: \\"One\\"]
\`\`\`

Some text.

\`\`\`mermaid
flowchart LR
    B[Step: \\"Two\\"]
\`\`\``;

      const result = sanitizeMermaidBlocks(content);

      expect(result.modified).toBe(true);
      expect(result.blocksProcessed).toBe(2);
      expect(result.fixes.length).toBe(2);
      expect(result.content).toContain('A[Step: One]');
      expect(result.content).toContain('B[Step: Two]');
    });
  });

  describe('Clean content', () => {
    it('should not modify clean Mermaid blocks', () => {
      const content = `# Lesson

\`\`\`mermaid
flowchart TD
    A[Simple text]
    B[Another node]
    A --> B
\`\`\``;

      const result = sanitizeMermaidBlocks(content);

      expect(result.modified).toBe(false);
      expect(result.blocksProcessed).toBe(1);
      expect(result.fixes.length).toBe(0);
      expect(result.content).toBe(content);
    });

    it('should handle content without Mermaid blocks', () => {
      const content = `# Lesson

This is regular markdown content without any Mermaid diagrams.

\`\`\`javascript
const x = "test";
\`\`\``;

      const result = sanitizeMermaidBlocks(content);

      expect(result.modified).toBe(false);
      expect(result.blocksProcessed).toBe(0);
      expect(result.fixes.length).toBe(0);
    });
  });
});

// ============================================================================
// hasBrokenMermaidSyntax Tests
// ============================================================================

describe('hasBrokenMermaidSyntax', () => {
  it('should detect escaped quotes', () => {
    const content = `\`\`\`mermaid
flowchart TD
    A[Text: \\"quote\\"]
\`\`\``;

    expect(hasBrokenMermaidSyntax(content)).toBe(true);
  });

  it('should detect unclosed brackets', () => {
    const content = `\`\`\`mermaid
flowchart TD
    A[Unclosed bracket
    B[Normal]
\`\`\``;

    expect(hasBrokenMermaidSyntax(content)).toBe(true);
  });

  it('should detect unclosed braces', () => {
    const content = `\`\`\`mermaid
flowchart TD
    A{Unclosed brace
    B{Normal}
\`\`\``;

    expect(hasBrokenMermaidSyntax(content)).toBe(true);
  });

  it('should pass clean Mermaid blocks', () => {
    const content = `\`\`\`mermaid
flowchart TD
    A[Normal text]
    B{Decision}
    A --> B
\`\`\``;

    expect(hasBrokenMermaidSyntax(content)).toBe(false);
  });

  it('should pass content without Mermaid', () => {
    const content = `# Just markdown

No Mermaid here.`;

    expect(hasBrokenMermaidSyntax(content)).toBe(false);
  });
});

// ============================================================================
// countMermaidBlocks Tests
// ============================================================================

describe('countMermaidBlocks', () => {
  it('should count multiple Mermaid blocks', () => {
    const content = `
\`\`\`mermaid
flowchart TD
    A --> B
\`\`\`

\`\`\`mermaid
sequenceDiagram
    A->>B: Hello
\`\`\`

\`\`\`mermaid
pie
    "A" : 30
    "B" : 70
\`\`\``;

    expect(countMermaidBlocks(content)).toBe(3);
  });

  it('should return 0 for no Mermaid blocks', () => {
    const content = `# Just markdown

\`\`\`javascript
const x = 1;
\`\`\``;

    expect(countMermaidBlocks(content)).toBe(0);
  });
});

// ============================================================================
// checkMermaidSyntax Tests (Heuristic Filter)
// ============================================================================

describe('checkMermaidSyntax', () => {
  describe('PASS cases', () => {
    it('should pass for content without Mermaid blocks', () => {
      const content = '# Just markdown content';
      const result = checkMermaidSyntax(content);

      expect(result.passed).toBe(true);
      expect(result.totalDiagrams).toBe(0);
      expect(result.affectedDiagrams).toBe(0);
      expect(result.mermaidIssues).toHaveLength(0);
    });

    it('should pass for clean Mermaid blocks', () => {
      const content = `\`\`\`mermaid
flowchart TD
    A[Step 1]
    B[Step 2]
    A --> B
\`\`\``;

      const result = checkMermaidSyntax(content);

      expect(result.passed).toBe(true);
      expect(result.totalDiagrams).toBe(1);
      expect(result.affectedDiagrams).toBe(0);
    });
  });

  describe('FAIL cases', () => {
    it('should detect escaped quotes', () => {
      const content = `\`\`\`mermaid
flowchart TD
    A[Text: \\"quoted\\"]
\`\`\``;

      const result = checkMermaidSyntax(content);

      expect(result.passed).toBe(false);
      expect(result.mermaidIssues.some(i => i.includes('escaped quotes'))).toBe(true);
      expect(result.affectedDiagrams).toBe(1);
    });

    it('should detect unclosed brackets', () => {
      const content = `\`\`\`mermaid
flowchart TD
    A[Unclosed
    B[Normal]
\`\`\``;

      const result = checkMermaidSyntax(content);

      expect(result.passed).toBe(false);
      expect(result.mermaidIssues.some(i => i.includes('Unclosed brackets'))).toBe(true);
    });

    it('should detect unclosed braces', () => {
      const content = `\`\`\`mermaid
flowchart TD
    A{Unclosed
    B{Normal}
\`\`\``;

      const result = checkMermaidSyntax(content);

      expect(result.passed).toBe(false);
      expect(result.mermaidIssues.some(i => i.includes('Unclosed braces'))).toBe(true);
    });

    it('should detect invalid arrow syntax', () => {
      const content = `\`\`\`mermaid
flowchart TD
    A[Step 1]
    A -> B[Step 2]
\`\`\``;

      const result = checkMermaidSyntax(content);

      expect(result.passed).toBe(false);
      expect(result.mermaidIssues.some(i => i.includes('Invalid arrow syntax'))).toBe(true);
    });

    it('should detect multiple issues in one diagram', () => {
      const content = `\`\`\`mermaid
flowchart TD
    A[Text: \\"quote\\"]
    A -> B[Missing closing
\`\`\``;

      const result = checkMermaidSyntax(content);

      expect(result.passed).toBe(false);
      expect(result.mermaidIssues.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Edge cases', () => {
    it('should allow valid arrow syntax (-->)', () => {
      const content = `\`\`\`mermaid
flowchart TD
    A --> B
    B --> C
    C --> D
\`\`\``;

      const result = checkMermaidSyntax(content);

      expect(result.passed).toBe(true);
    });

    it('should allow dotted arrow syntax (-.->)', () => {
      const content = `\`\`\`mermaid
flowchart TD
    A -.-> B
    B -.-> C
\`\`\``;

      const result = checkMermaidSyntax(content);

      expect(result.passed).toBe(true);
    });
  });
});
