/**
 * Contract tests for MarkdownRenderer RSC (React Server Component)
 *
 * Tests verify the public API contract:
 * 1. Basic markdown rendering (headings, paragraphs, lists)
 * 2. Empty content handling (returns null)
 * 3. Malformed markdown graceful handling (no crashes)
 * 4. Preset application (correct className)
 *
 * Testing strategy:
 * - Since MarkdownRenderer is an async RSC, we await the promise before assertions
 * - We use @testing-library/react for DOM queries
 * - Focus on behavior and public API, not implementation details
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer';

/**
 * Helper to render async RSC component
 * Awaits the promise and renders the resolved JSX element
 */
async function renderAsync(
  component: Promise<React.JSX.Element | null>
): Promise<ReturnType<typeof render> | null> {
  const resolved = await component;
  if (resolved === null) return null;
  return render(resolved);
}

describe('MarkdownRenderer - Contract Tests', () => {
  describe('Basic markdown rendering', () => {
    it('should render heading (h1)', async () => {
      const result = await renderAsync(
        MarkdownRenderer({ content: '# Hello World' })
      );

      expect(result).not.toBeNull();
      const heading = result!.container.querySelector('h1');
      expect(heading).toBeTruthy();
      expect(heading?.textContent).toBe('Hello World');
    });

    it('should render multiple heading levels', async () => {
      const content = `
# Heading 1
## Heading 2
### Heading 3
      `.trim();

      const result = await renderAsync(MarkdownRenderer({ content }));

      expect(result).not.toBeNull();
      expect(result!.container.querySelector('h1')?.textContent).toBe('Heading 1');
      expect(result!.container.querySelector('h2')?.textContent).toBe('Heading 2');
      expect(result!.container.querySelector('h3')?.textContent).toBe('Heading 3');
    });

    it('should render paragraphs', async () => {
      const content = `
This is paragraph one.

This is paragraph two.
      `.trim();

      const result = await renderAsync(MarkdownRenderer({ content }));

      expect(result).not.toBeNull();
      const paragraphs = result!.container.querySelectorAll('p');
      expect(paragraphs.length).toBeGreaterThanOrEqual(2);
      expect(paragraphs[0].textContent).toBe('This is paragraph one.');
      expect(paragraphs[1].textContent).toBe('This is paragraph two.');
    });

    it('should render unordered list', async () => {
      const content = `
- Item 1
- Item 2
- Item 3
      `.trim();

      const result = await renderAsync(MarkdownRenderer({ content }));

      expect(result).not.toBeNull();
      const ul = result!.container.querySelector('ul');
      expect(ul).toBeTruthy();

      const items = ul!.querySelectorAll('li');
      expect(items.length).toBe(3);
      expect(items[0].textContent).toBe('Item 1');
      expect(items[1].textContent).toBe('Item 2');
      expect(items[2].textContent).toBe('Item 3');
    });

    it('should render ordered list', async () => {
      const content = `
1. First
2. Second
3. Third
      `.trim();

      const result = await renderAsync(MarkdownRenderer({ content }));

      expect(result).not.toBeNull();
      const ol = result!.container.querySelector('ol');
      expect(ol).toBeTruthy();

      const items = ol!.querySelectorAll('li');
      expect(items.length).toBe(3);
      expect(items[0].textContent).toBe('First');
      expect(items[1].textContent).toBe('Second');
      expect(items[2].textContent).toBe('Third');
    });

    it('should render links', async () => {
      const content = 'Visit [OpenAI](https://openai.com)';

      const result = await renderAsync(MarkdownRenderer({ content }));

      expect(result).not.toBeNull();
      const link = result!.container.querySelector('a');
      expect(link).toBeTruthy();
      expect(link?.textContent).toBe('OpenAI');
      expect(link?.getAttribute('href')).toBe('https://openai.com');
    });

    it('should render inline code', async () => {
      const content = 'Use `console.log()` for debugging';

      const result = await renderAsync(MarkdownRenderer({ content }));

      expect(result).not.toBeNull();
      const code = result!.container.querySelector('code');
      expect(code).toBeTruthy();
      expect(code?.textContent).toBe('console.log()');
    });

    it('should render code block', async () => {
      const content = `
\`\`\`javascript
function hello() {
  console.log("Hello");
}
\`\`\`
      `.trim();

      const result = await renderAsync(MarkdownRenderer({ content }));

      expect(result).not.toBeNull();
      const pre = result!.container.querySelector('pre');
      expect(pre).toBeTruthy();

      const code = pre?.querySelector('code');
      expect(code).toBeTruthy();
    });

    it('should render blockquote', async () => {
      const content = '> This is a quote';

      const result = await renderAsync(MarkdownRenderer({ content }));

      expect(result).not.toBeNull();
      const blockquote = result!.container.querySelector('blockquote');
      expect(blockquote).toBeTruthy();
      expect(blockquote?.textContent?.trim()).toContain('This is a quote');
    });

    it('should render GFM table (GitHub Flavored Markdown)', async () => {
      const content = `
| Column 1 | Column 2 |
|----------|----------|
| Data 1   | Data 2   |
      `.trim();

      const result = await renderAsync(MarkdownRenderer({ content }));

      expect(result).not.toBeNull();
      const table = result!.container.querySelector('table');
      expect(table).toBeTruthy();

      const headers = table!.querySelectorAll('th');
      expect(headers.length).toBe(2);
      expect(headers[0].textContent).toBe('Column 1');
      expect(headers[1].textContent).toBe('Column 2');

      const cells = table!.querySelectorAll('td');
      expect(cells.length).toBe(2);
      expect(cells[0].textContent).toBe('Data 1');
      expect(cells[1].textContent).toBe('Data 2');
    });

    it('should render bold and italic text', async () => {
      const content = '**bold** and *italic*';

      const result = await renderAsync(MarkdownRenderer({ content }));

      expect(result).not.toBeNull();
      const strong = result!.container.querySelector('strong');
      const em = result!.container.querySelector('em');
      expect(strong?.textContent).toBe('bold');
      expect(em?.textContent).toBe('italic');
    });
  });

  describe('Empty content handling', () => {
    it('should return null for empty string', async () => {
      const result = await MarkdownRenderer({ content: '' });
      expect(result).toBeNull();
    });

    it('should return null for whitespace-only content', async () => {
      const result = await MarkdownRenderer({ content: '   \n\t  ' });
      expect(result).toBeNull();
    });

    it('should return null for single newline', async () => {
      const result = await MarkdownRenderer({ content: '\n' });
      expect(result).toBeNull();
    });

    it('should return null for multiple spaces', async () => {
      const result = await MarkdownRenderer({ content: '     ' });
      expect(result).toBeNull();
    });
  });

  describe('Malformed markdown graceful handling', () => {
    it('should handle unclosed code block without crashing', async () => {
      const malformedContent = `
# Title

\`\`\`javascript
function test() {
  console.log("no closing fence");
      `.trim();

      // Should not throw error
      await expect(
        renderAsync(MarkdownRenderer({ content: malformedContent }))
      ).resolves.not.toThrow();

      const result = await renderAsync(
        MarkdownRenderer({ content: malformedContent })
      );
      expect(result).not.toBeNull();
    });

    it('should handle broken table without crashing', async () => {
      const malformedContent = `
| Column 1 | Column 2
|----------|
| Data 1
      `.trim();

      // Should not throw error
      await expect(
        renderAsync(MarkdownRenderer({ content: malformedContent }))
      ).resolves.not.toThrow();

      const result = await renderAsync(
        MarkdownRenderer({ content: malformedContent })
      );
      expect(result).not.toBeNull();
    });

    it('should handle unbalanced brackets without crashing', async () => {
      const malformedContent = '[Broken link](https://example.com';

      await expect(
        renderAsync(MarkdownRenderer({ content: malformedContent }))
      ).resolves.not.toThrow();

      const result = await renderAsync(
        MarkdownRenderer({ content: malformedContent })
      );
      expect(result).not.toBeNull();
    });

    it('should handle malformed heading syntax', async () => {
      const malformedContent = `
####### Too many hashes
# Normal heading
      `.trim();

      await expect(
        renderAsync(MarkdownRenderer({ content: malformedContent }))
      ).resolves.not.toThrow();

      const result = await renderAsync(
        MarkdownRenderer({ content: malformedContent })
      );
      expect(result).not.toBeNull();
    });

    it('should handle mixed valid and invalid markdown', async () => {
      const malformedContent = `
# Valid Heading

This is a paragraph.

\`\`\`unclosed
code block

**bold but not closed

- List item 1
- List item 2
      `.trim();

      await expect(
        renderAsync(MarkdownRenderer({ content: malformedContent }))
      ).resolves.not.toThrow();

      const result = await renderAsync(
        MarkdownRenderer({ content: malformedContent })
      );
      expect(result).not.toBeNull();

      // Should still render valid parts
      const heading = result!.container.querySelector('h1');
      expect(heading).toBeTruthy();
      expect(heading?.textContent).toBe('Valid Heading');
    });
  });

  describe('Preset application', () => {
    it('should apply default "lesson" preset className', async () => {
      const result = await renderAsync(
        MarkdownRenderer({ content: '# Test' })
      );

      expect(result).not.toBeNull();
      const article = result!.container.querySelector('article');
      expect(article).toBeTruthy();
      expect(article?.className).toContain('prose');
      expect(article?.className).toContain('prose-lg');
      expect(article?.className).toContain('dark:prose-invert');
      expect(article?.className).toContain('max-w-none');
    });

    it('should apply "chat" preset className', async () => {
      const result = await renderAsync(
        MarkdownRenderer({ content: '# Test', preset: 'chat' })
      );

      expect(result).not.toBeNull();
      const article = result!.container.querySelector('article');
      expect(article).toBeTruthy();
      expect(article?.className).toContain('prose');
      expect(article?.className).toContain('prose-sm');
      expect(article?.className).toContain('dark:prose-invert');
    });

    it('should apply "preview" preset className', async () => {
      const result = await renderAsync(
        MarkdownRenderer({ content: '# Test', preset: 'preview' })
      );

      expect(result).not.toBeNull();
      const article = result!.container.querySelector('article');
      expect(article).toBeTruthy();
      expect(article?.className).toContain('prose');
      expect(article?.className).toContain('dark:prose-invert');
      expect(article?.className).toContain('max-w-none');
      // Should NOT contain prose-lg (preview uses default size)
      expect(article?.className).not.toContain('prose-lg');
    });

    it('should apply "minimal" preset className', async () => {
      const result = await renderAsync(
        MarkdownRenderer({ content: '# Test', preset: 'minimal' })
      );

      expect(result).not.toBeNull();
      const article = result!.container.querySelector('article');
      expect(article).toBeTruthy();
      expect(article?.className).toContain('prose');
      expect(article?.className).toContain('prose-sm');
    });

    it('should merge custom className with preset className', async () => {
      const result = await renderAsync(
        MarkdownRenderer({ content: '# Test', className: 'custom-class' })
      );

      expect(result).not.toBeNull();
      const article = result!.container.querySelector('article');
      expect(article).toBeTruthy();
      expect(article?.className).toContain('prose');
      expect(article?.className).toContain('custom-class');
    });
  });

  describe('Wrapper element', () => {
    it('should render content in semantic <article> element', async () => {
      const result = await renderAsync(
        MarkdownRenderer({ content: '# Test' })
      );

      expect(result).not.toBeNull();
      const article = result!.container.querySelector('article');
      expect(article).toBeTruthy();
    });

    it('should have className attribute on article wrapper', async () => {
      const result = await renderAsync(
        MarkdownRenderer({ content: '# Test' })
      );

      expect(result).not.toBeNull();
      const article = result!.container.querySelector('article');
      expect(article?.hasAttribute('class')).toBe(true);
    });

    it('should contain rendered markdown inside article', async () => {
      const result = await renderAsync(
        MarkdownRenderer({ content: '# Nested Content' })
      );

      expect(result).not.toBeNull();
      const article = result!.container.querySelector('article');
      const heading = article?.querySelector('h1');
      expect(heading).toBeTruthy();
      expect(heading?.textContent).toBe('Nested Content');
    });
  });

  describe('Trust mode handling', () => {
    it('should accept trusted=true (default)', async () => {
      await expect(
        renderAsync(
          MarkdownRenderer({ content: '# Test', trusted: true })
        )
      ).resolves.not.toThrow();
    });

    it('should accept trusted=false (untrusted mode)', async () => {
      await expect(
        renderAsync(
          MarkdownRenderer({ content: '# Test', trusted: false })
        )
      ).resolves.not.toThrow();
    });

    it('should render content in both trust modes', async () => {
      const content = '# Security Test';

      const trustedResult = await renderAsync(
        MarkdownRenderer({ content, trusted: true })
      );
      const untrustedResult = await renderAsync(
        MarkdownRenderer({ content, trusted: false })
      );

      expect(trustedResult).not.toBeNull();
      expect(untrustedResult).not.toBeNull();

      // Both should render the heading
      expect(trustedResult!.container.querySelector('h1')).toBeTruthy();
      expect(untrustedResult!.container.querySelector('h1')).toBeTruthy();
    });
  });

  describe('Feature overrides', () => {
    it('should accept feature overrides object', async () => {
      await expect(
        renderAsync(
          MarkdownRenderer({
            content: '# Test',
            features: { math: false, codeHighlight: true },
          })
        )
      ).resolves.not.toThrow();
    });

    it('should render with empty features object', async () => {
      await expect(
        renderAsync(
          MarkdownRenderer({ content: '# Test', features: {} })
        )
      ).resolves.not.toThrow();
    });
  });

  describe('Custom components', () => {
    it('should accept custom components prop', async () => {
      await expect(
        renderAsync(
          MarkdownRenderer({ content: '# Test', components: {} })
        )
      ).resolves.not.toThrow();
    });

    it('should render with empty components object', async () => {
      const result = await renderAsync(
        MarkdownRenderer({ content: '# Test', components: {} })
      );

      expect(result).not.toBeNull();
      const heading = result!.container.querySelector('h1');
      expect(heading).toBeTruthy();
    });
  });

  describe('Edge cases', () => {
    it('should handle very long content', async () => {
      const longContent = Array(100)
        .fill('# Heading\n\nParagraph text.\n\n')
        .join('');

      await expect(
        renderAsync(MarkdownRenderer({ content: longContent }))
      ).resolves.not.toThrow();

      const result = await renderAsync(
        MarkdownRenderer({ content: longContent })
      );
      expect(result).not.toBeNull();
    });

    it('should handle special characters', async () => {
      // MDX interprets <> as JSX tags, so we use escaped HTML entities
      // and other special chars that don't conflict with JSX/MDX syntax
      const content = '# Special: &amp; &quot; @#$%^*';

      const result = await renderAsync(MarkdownRenderer({ content }));

      expect(result).not.toBeNull();
      const heading = result!.container.querySelector('h1');
      expect(heading).toBeTruthy();
      expect(heading?.textContent).toContain('Special');
    });

    it('should handle unicode characters', async () => {
      const content = '# Unicode: 你好 🚀 Ñoño';

      const result = await renderAsync(MarkdownRenderer({ content }));

      expect(result).not.toBeNull();
      const heading = result!.container.querySelector('h1');
      expect(heading).toBeTruthy();
      expect(heading?.textContent).toContain('你好');
      expect(heading?.textContent).toContain('🚀');
    });

    it('should handle content with only whitespace after trimming returns null', async () => {
      const result = await MarkdownRenderer({ content: '\n\n\n\t\t\t   \n' });
      expect(result).toBeNull();
    });

    it('should handle single character', async () => {
      const result = await renderAsync(MarkdownRenderer({ content: 'a' }));

      expect(result).not.toBeNull();
      const paragraph = result!.container.querySelector('p');
      expect(paragraph).toBeTruthy();
      expect(paragraph?.textContent).toBe('a');
    });
  });
});
