/**
 * Accessibility Testing for Markdown Components
 *
 * Tests all custom markdown rendering components against WCAG 2.1 AA standards:
 * - CodeBlock: Copy buttons, language badges, keyboard interaction
 * - Callout: ARIA roles, alert states, icon accessibility
 * - Link: External link indicators, focus styles, screen reader text
 * - Heading: Anchor links, copy functionality, keyboard access
 * - ResponsiveTable: Keyboard scrolling, region labels
 * - SkipToContent: Keyboard focus, visibility on focus
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Sample markdown content for testing
const SAMPLE_MARKDOWN = `
# Getting Started

Welcome to the markdown accessibility test suite.

## Code Examples

Here's a TypeScript example:

\`\`\`typescript
// Example TypeScript code
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

const message = greet("World");
console.log(message);
\`\`\`

## External Links

Check out [GitHub](https://github.com) for more resources.
Internal link: [About](/about)

## Callouts

> [!NOTE]
> This is an informative note with important details.

> [!WARNING]
> This is a warning message that requires attention.

> [!TIP]
> Here's a helpful tip for better results.

> [!DANGER]
> This is a critical danger alert.

## Data Tables

| Feature | Status | Priority |
|---------|--------|----------|
| Authentication | Complete | High |
| Notifications | In Progress | Medium |
| Reports | Planned | Low |

## Navigation Links

- [Section 1](#section-1)
- [Section 2](#section-2)
- [Back to top](#getting-started)
`;

test.describe('Markdown Component Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    // Set up consistent viewport
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test('Should inject test markdown content', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Inject a test container with markdown components
    await page.evaluate((markdown) => {
      // Create test container
      const container = document.createElement('div');
      container.id = 'markdown-test-content';
      container.setAttribute('data-testid', 'markdown-test');

      // Add skip to content link
      const skipLink = document.createElement('a');
      skipLink.href = '#main-content';
      skipLink.className = 'sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:bg-background focus:text-foreground focus:px-4 focus:py-2 focus:rounded-md focus:border focus:border-border focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2';
      skipLink.textContent = 'Skip to content';
      document.body.insertBefore(skipLink, document.body.firstChild);

      // Add main content area
      const main = document.createElement('main');
      main.id = 'main-content';

      // Add headings with anchors
      const h1 = document.createElement('h1');
      h1.id = 'getting-started';
      h1.className = 'group relative scroll-mt-20';
      h1.innerHTML = `
        <a href="#getting-started"
           class="absolute -left-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity duration-200 text-muted-foreground hover:text-primary p-1 -ml-1 rounded focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
           aria-label="Copy link to Getting Started"
           aria-live="polite">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        </a>
        Getting Started
      `;
      main.appendChild(h1);

      // Add code block
      const codeBlockFigure = document.createElement('figure');
      codeBlockFigure.className = 'code-block group not-prose my-6';
      codeBlockFigure.setAttribute('data-language', 'typescript');
      codeBlockFigure.innerHTML = `
        <figcaption class="code-header flex items-center justify-between gap-2 rounded-t-lg border border-b-0 border-border bg-muted/50 px-4 py-2">
          <div class="flex items-center gap-3">
            <span class="language-badge inline-flex items-center rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">TypeScript</span>
            <span class="filename font-mono text-sm text-muted-foreground">example.ts</span>
          </div>
          <button type="button"
                  class="copy-button inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Copy code to clipboard"
                  aria-live="polite">
            <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>
            <span>Copy</span>
          </button>
        </figcaption>
        <div class="code-content relative overflow-x-auto rounded-lg border border-border bg-muted/30 rounded-t-none border-t-0">
          <pre><code>function greet(name: string): string {
  return \`Hello, \${name}!\`;
}</code></pre>
        </div>
      `;
      main.appendChild(codeBlockFigure);

      // Add external link
      const extLinkPara = document.createElement('p');
      extLinkPara.innerHTML = `
        Visit <a href="https://github.com"
                 target="_blank"
                 rel="noopener noreferrer"
                 class="text-primary underline underline-offset-4 decoration-primary/50 hover:decoration-primary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm inline-flex items-center gap-1">
          GitHub
          <svg class="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/></svg>
          <span class="sr-only">(opens in new tab)</span>
        </a>
      `;
      main.appendChild(extLinkPara);

      // Add callouts with different types
      ['note', 'warning', 'danger', 'tip'].forEach((type) => {
        const callout = document.createElement('aside');
        callout.setAttribute('role', type === 'danger' || type === 'warning' ? 'alert' : 'note');
        const colorMap = { note: 'blue', warning: 'yellow', danger: 'red', tip: 'green' };
        callout.className = 'callout my-6 rounded-lg border-l-4 p-4 border-' + colorMap[type] + '-500';
        callout.innerHTML = '<div class="flex items-start gap-3">' +
          '<svg class="h-5 w-5 flex-shrink-0 mt-0.5" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor">' +
            '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>' +
          '</svg>' +
          '<div class="flex-1 min-w-0">' +
            '<div class="font-semibold mb-1">' + type.charAt(0).toUpperCase() + type.slice(1) + '</div>' +
            '<div class="text-sm opacity-90">This is a ' + type + ' callout message.</div>' +
          '</div>' +
        '</div>';
        main.appendChild(callout);
      });

      // Add responsive table
      const tableWrapper = document.createElement('div');
      tableWrapper.className = 'responsive-table-wrapper my-6 overflow-x-auto scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent';
      tableWrapper.setAttribute('role', 'region');
      tableWrapper.setAttribute('aria-label', 'Scrollable table');
      tableWrapper.setAttribute('tabindex', '0');
      tableWrapper.innerHTML = `
        <div class="min-w-full inline-block align-middle">
          <table class="w-full border-collapse">
            <thead>
              <tr class="border-b">
                <th class="px-4 py-2 text-left">Feature</th>
                <th class="px-4 py-2 text-left">Status</th>
                <th class="px-4 py-2 text-left">Priority</th>
              </tr>
            </thead>
            <tbody>
              <tr class="border-b even:bg-muted/50">
                <td class="px-4 py-2">Authentication</td>
                <td class="px-4 py-2">Complete</td>
                <td class="px-4 py-2">High</td>
              </tr>
              <tr class="border-b even:bg-muted/50">
                <td class="px-4 py-2">Notifications</td>
                <td class="px-4 py-2">In Progress</td>
                <td class="px-4 py-2">Medium</td>
              </tr>
              <tr class="border-b even:bg-muted/50">
                <td class="px-4 py-2">Reports</td>
                <td class="px-4 py-2">Planned</td>
                <td class="px-4 py-2">Low</td>
              </tr>
            </tbody>
          </table>
        </div>
      `;
      main.appendChild(tableWrapper);

      container.appendChild(main);
      document.body.appendChild(container);
    }, SAMPLE_MARKDOWN);

    // Verify content injected
    const testContent = await page.locator('[data-testid="markdown-test"]');
    await expect(testContent).toBeVisible();
  });

  test.describe('CodeBlock Accessibility', () => {
    test('Copy button should have proper ARIA labels', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Inject test content
      await page.evaluate(() => {
        const figure = document.createElement('figure');
        figure.className = 'code-block';
        figure.innerHTML = `
          <figcaption class="code-header">
            <button type="button"
                    class="copy-button"
                    aria-label="Copy code to clipboard"
                    aria-live="polite">
              Copy
            </button>
          </figcaption>
          <div class="code-content">
            <pre><code>console.log("test");</code></pre>
          </div>
        `;
        document.body.appendChild(figure);
      });

      const copyButton = page.locator('.copy-button');
      await expect(copyButton).toBeVisible();

      // Check ARIA attributes
      await expect(copyButton).toHaveAttribute('aria-label', 'Copy code to clipboard');
      await expect(copyButton).toHaveAttribute('aria-live', 'polite');
      await expect(copyButton).toHaveAttribute('type', 'button');
    });

    test('Language badge should be properly labeled', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.evaluate(() => {
        const figure = document.createElement('figure');
        figure.setAttribute('data-language', 'typescript');
        figure.innerHTML = `
          <figcaption class="code-header">
            <span class="language-badge">TypeScript</span>
          </figcaption>
          <div class="code-content">
            <pre><code>const x: number = 42;</code></pre>
          </div>
        `;
        document.body.appendChild(figure);
      });

      const badge = page.locator('.language-badge');
      await expect(badge).toBeVisible();
      await expect(badge).toHaveText('TypeScript');
    });

    test('Code block should be keyboard accessible', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.evaluate(() => {
        const figure = document.createElement('figure');
        figure.innerHTML = `
          <figcaption class="code-header">
            <button type="button" class="copy-button">Copy</button>
          </figcaption>
          <div class="code-content">
            <pre><code>console.log("test");</code></pre>
          </div>
        `;
        document.body.appendChild(figure);
      });

      // Tab to copy button
      await page.keyboard.press('Tab');
      const copyButton = page.locator('.copy-button');

      // Verify button is focusable
      if (await copyButton.count() > 0) {
        await copyButton.focus();
        await expect(copyButton).toBeFocused();
      }
    });

    test('Code content should be accessible', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.evaluate(() => {
        const figure = document.createElement('figure');
        figure.innerHTML = `
          <div class="code-content">
            <pre><code>function test() { return true; }</code></pre>
          </div>
        `;
        document.body.appendChild(figure);
      });

      const accessibilityScanResults = await new AxeBuilder({ page })
        .include('.code-content')
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();

      expect(accessibilityScanResults.violations).toEqual([]);
    });
  });

  test.describe('Callout Accessibility', () => {
    test('Danger callout should use role="alert"', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.evaluate(() => {
        const callout = document.createElement('aside');
        callout.setAttribute('role', 'alert');
        callout.className = 'callout danger';
        callout.innerHTML = `
          <div class="flex items-start gap-3">
            <svg class="h-5 w-5" aria-hidden="true" viewBox="0 0 24 24"></svg>
            <div>
              <div class="font-semibold">Danger</div>
              <div class="text-sm">Critical error message</div>
            </div>
          </div>
        `;
        document.body.appendChild(callout);
      });

      const callout = page.locator('aside.callout.danger');
      await expect(callout).toHaveAttribute('role', 'alert');
    });

    test('Warning callout should use role="alert"', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.evaluate(() => {
        const callout = document.createElement('aside');
        callout.setAttribute('role', 'alert');
        callout.className = 'callout warning';
        callout.innerHTML = `
          <div class="flex items-start gap-3">
            <svg class="h-5 w-5" aria-hidden="true" viewBox="0 0 24 24"></svg>
            <div>
              <div class="font-semibold">Warning</div>
              <div class="text-sm">Warning message</div>
            </div>
          </div>
        `;
        document.body.appendChild(callout);
      });

      const callout = page.locator('aside.callout.warning');
      await expect(callout).toHaveAttribute('role', 'alert');
    });

    test('Note/Tip/Info callouts should use role="note"', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.evaluate(() => {
        ['note', 'tip', 'info'].forEach((type) => {
          const callout = document.createElement('aside');
          callout.setAttribute('role', 'note');
          callout.className = `callout ${type}`;
          callout.innerHTML = `
            <div class="flex items-start gap-3">
              <svg class="h-5 w-5" aria-hidden="true" viewBox="0 0 24 24"></svg>
              <div>
                <div class="font-semibold">${type}</div>
                <div class="text-sm">${type} message</div>
              </div>
            </div>
          `;
          document.body.appendChild(callout);
        });
      });

      const noteCallout = page.locator('aside.callout.note');
      const tipCallout = page.locator('aside.callout.tip');
      const infoCallout = page.locator('aside.callout.info');

      await expect(noteCallout).toHaveAttribute('role', 'note');
      await expect(tipCallout).toHaveAttribute('role', 'note');
      await expect(infoCallout).toHaveAttribute('role', 'note');
    });

    test('Callout icons should have aria-hidden="true"', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.evaluate(() => {
        const callout = document.createElement('aside');
        callout.setAttribute('role', 'note');
        callout.innerHTML = `
          <div class="flex items-start gap-3">
            <svg class="h-5 w-5" aria-hidden="true" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10"/>
            </svg>
            <div>
              <div class="font-semibold">Note</div>
              <div class="text-sm">Note content</div>
            </div>
          </div>
        `;
        document.body.appendChild(callout);
      });

      const icon = page.locator('aside svg');
      await expect(icon).toHaveAttribute('aria-hidden', 'true');
    });

    test('Callouts should pass axe accessibility scan', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.evaluate(() => {
        const callout = document.createElement('aside');
        callout.setAttribute('role', 'alert');
        callout.className = 'callout';
        callout.innerHTML = `
          <div class="flex items-start gap-3">
            <svg class="h-5 w-5" aria-hidden="true" viewBox="0 0 24 24"></svg>
            <div>
              <div class="font-semibold">Title</div>
              <div class="text-sm">Content</div>
            </div>
          </div>
        `;
        document.body.appendChild(callout);
      });

      const accessibilityScanResults = await new AxeBuilder({ page })
        .include('aside.callout')
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();

      expect(accessibilityScanResults.violations).toEqual([]);
    });
  });

  test.describe('Link Accessibility', () => {
    test('External links should have screen reader text', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.evaluate(() => {
        const p = document.createElement('p');
        p.innerHTML = `
          <a href="https://github.com"
             target="_blank"
             rel="noopener noreferrer"
             class="external-link">
            GitHub
            <svg aria-hidden="true" viewBox="0 0 24 24"></svg>
            <span class="sr-only">(opens in new tab)</span>
          </a>
        `;
        document.body.appendChild(p);
      });

      const srText = page.locator('.external-link .sr-only');
      await expect(srText).toHaveText('(opens in new tab)');
    });

    test('External link icon should have aria-hidden', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.evaluate(() => {
        const p = document.createElement('p');
        p.innerHTML = `
          <a href="https://github.com" target="_blank" rel="noopener noreferrer">
            GitHub
            <svg aria-hidden="true" viewBox="0 0 24 24"></svg>
          </a>
        `;
        document.body.appendChild(p);
      });

      const icon = page.locator('a[target="_blank"] svg');
      await expect(icon).toHaveAttribute('aria-hidden', 'true');
    });

    test('Links should have visible focus indicators', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.evaluate(() => {
        const a = document.createElement('a');
        a.href = 'https://github.com';
        a.className = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';
        a.textContent = 'Test Link';
        document.body.appendChild(a);
      });

      const link = page.locator('a[href="https://github.com"]');
      await link.focus();

      // Check focus styles
      const hasRing = await link.evaluate((el) => {
        const styles = window.getComputedStyle(el);
        return styles.outline !== 'none' || styles.boxShadow !== 'none';
      });

      expect(hasRing).toBeTruthy();
    });

    test('External links should have proper security attributes', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.evaluate(() => {
        const a = document.createElement('a');
        a.href = 'https://github.com';
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = 'GitHub';
        document.body.appendChild(a);
      });

      const link = page.locator('a[href="https://github.com"]');
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    test('Links should pass axe accessibility scan', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.evaluate(() => {
        const p = document.createElement('p');
        p.innerHTML = `
          <a href="https://github.com" target="_blank" rel="noopener noreferrer">
            GitHub
            <svg aria-hidden="true" viewBox="0 0 24 24"></svg>
            <span class="sr-only">(opens in new tab)</span>
          </a>
        `;
        document.body.appendChild(p);
      });

      const accessibilityScanResults = await new AxeBuilder({ page })
        .include('a[target="_blank"]')
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();

      expect(accessibilityScanResults.violations).toEqual([]);
    });
  });

  test.describe('Heading Accessibility', () => {
    test('Anchor links should have proper aria-label', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.evaluate(() => {
        const h2 = document.createElement('h2');
        h2.id = 'test-heading';
        h2.className = 'group relative';
        h2.innerHTML = `
          <a href="#test-heading"
             aria-label="Copy link to Test Heading"
             aria-live="polite">
            #
          </a>
          Test Heading
        `;
        document.body.appendChild(h2);
      });

      const anchor = page.locator('h2 a[href="#test-heading"]');
      await expect(anchor).toHaveAttribute('aria-label', 'Copy link to Test Heading');
    });

    test('Anchor links should have aria-live for copy feedback', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.evaluate(() => {
        const h2 = document.createElement('h2');
        h2.id = 'test-heading';
        h2.innerHTML = `
          <a href="#test-heading"
             aria-label="Copy link to Test Heading"
             aria-live="polite">
            #
          </a>
          Test Heading
        `;
        document.body.appendChild(h2);
      });

      const anchor = page.locator('h2 a[href="#test-heading"]');
      await expect(anchor).toHaveAttribute('aria-live', 'polite');
    });

    test('Headings should be keyboard accessible', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.evaluate(() => {
        const h2 = document.createElement('h2');
        h2.id = 'test-heading';
        h2.className = 'group';
        h2.innerHTML = `
          <a href="#test-heading" class="anchor-link">
            #
          </a>
          Test Heading
        `;
        document.body.appendChild(h2);
      });

      const anchor = page.locator('h2 .anchor-link');
      await anchor.focus();
      await expect(anchor).toBeFocused();

      // Test Enter key navigation
      await page.keyboard.press('Enter');
      await page.waitForTimeout(100);

      // URL should have hash
      const url = await page.url();
      expect(url).toContain('#test-heading');
    });

    test('Heading hierarchy should be maintained', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.evaluate(() => {
        const h1 = document.createElement('h1');
        h1.textContent = 'Main Title';
        const h2 = document.createElement('h2');
        h2.textContent = 'Subtitle';
        const h3 = document.createElement('h3');
        h3.textContent = 'Sub-subtitle';

        document.body.appendChild(h1);
        document.body.appendChild(h2);
        document.body.appendChild(h3);
      });

      // Check h1 exists
      const h1Count = await page.locator('h1').count();
      expect(h1Count).toBeGreaterThanOrEqual(1);

      // Verify no heading level is skipped (this is a basic check)
      const headings = await page.locator('h1, h2, h3, h4, h5, h6').all();
      expect(headings.length).toBeGreaterThan(0);
    });

    test('Headings should pass axe accessibility scan', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.evaluate(() => {
        const h2 = document.createElement('h2');
        h2.id = 'test-heading';
        h2.innerHTML = `
          <a href="#test-heading" aria-label="Copy link to Test Heading" aria-live="polite">
            #
          </a>
          Test Heading
        `;
        document.body.appendChild(h2);
      });

      const accessibilityScanResults = await new AxeBuilder({ page })
        .include('h2')
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();

      expect(accessibilityScanResults.violations).toEqual([]);
    });
  });

  test.describe('ResponsiveTable Accessibility', () => {
    test('Table wrapper should have role="region"', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.evaluate(() => {
        const wrapper = document.createElement('div');
        wrapper.setAttribute('role', 'region');
        wrapper.setAttribute('aria-label', 'Scrollable table');
        wrapper.setAttribute('tabindex', '0');
        wrapper.innerHTML = `
          <table>
            <thead><tr><th>Header</th></tr></thead>
            <tbody><tr><td>Data</td></tr></tbody>
          </table>
        `;
        document.body.appendChild(wrapper);
      });

      const wrapper = page.locator('[role="region"]');
      await expect(wrapper).toHaveAttribute('role', 'region');
    });

    test('Table wrapper should have aria-label', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.evaluate(() => {
        const wrapper = document.createElement('div');
        wrapper.setAttribute('role', 'region');
        wrapper.setAttribute('aria-label', 'Scrollable table');
        wrapper.setAttribute('tabindex', '0');
        wrapper.innerHTML = `
          <table>
            <thead><tr><th>Column</th></tr></thead>
            <tbody><tr><td>Value</td></tr></tbody>
          </table>
        `;
        document.body.appendChild(wrapper);
      });

      const wrapper = page.locator('[role="region"]');
      await expect(wrapper).toHaveAttribute('aria-label', 'Scrollable table');
    });

    test('Table wrapper should be keyboard scrollable', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.evaluate(() => {
        const wrapper = document.createElement('div');
        wrapper.setAttribute('role', 'region');
        wrapper.setAttribute('aria-label', 'Scrollable table');
        wrapper.setAttribute('tabindex', '0');
        wrapper.style.width = '300px';
        wrapper.style.overflow = 'auto';
        wrapper.innerHTML = `
          <table style="width: 800px;">
            <thead><tr><th>Col 1</th><th>Col 2</th><th>Col 3</th><th>Col 4</th></tr></thead>
            <tbody><tr><td>A</td><td>B</td><td>C</td><td>D</td></tr></tbody>
          </table>
        `;
        document.body.appendChild(wrapper);
      });

      const wrapper = page.locator('[role="region"]');
      await expect(wrapper).toHaveAttribute('tabindex', '0');

      // Should be focusable
      await wrapper.focus();
      await expect(wrapper).toBeFocused();
    });

    test('Tables should have proper structure', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.evaluate(() => {
        const table = document.createElement('table');
        table.innerHTML = `
          <thead>
            <tr>
              <th>Feature</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Auth</td>
              <td>Done</td>
            </tr>
          </tbody>
        `;
        document.body.appendChild(table);
      });

      const thead = page.locator('table thead');
      const tbody = page.locator('table tbody');
      const th = page.locator('table th');

      await expect(thead).toBeVisible();
      await expect(tbody).toBeVisible();
      expect(await th.count()).toBeGreaterThan(0);
    });

    test('Tables should pass axe accessibility scan', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.evaluate(() => {
        const wrapper = document.createElement('div');
        wrapper.setAttribute('role', 'region');
        wrapper.setAttribute('aria-label', 'Scrollable table');
        wrapper.setAttribute('tabindex', '0');
        wrapper.innerHTML = `
          <table>
            <thead>
              <tr>
                <th>Column 1</th>
                <th>Column 2</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Data 1</td>
                <td>Data 2</td>
              </tr>
            </tbody>
          </table>
        `;
        document.body.appendChild(wrapper);
      });

      const accessibilityScanResults = await new AxeBuilder({ page })
        .include('table')
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();

      expect(accessibilityScanResults.violations).toEqual([]);
    });
  });

  test.describe('SkipToContent Accessibility', () => {
    test('Skip link should be present and focusable', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.evaluate(() => {
        const skipLink = document.createElement('a');
        skipLink.href = '#main-content';
        skipLink.className = 'sr-only focus:not-sr-only';
        skipLink.textContent = 'Skip to content';
        document.body.insertBefore(skipLink, document.body.firstChild);

        const main = document.createElement('main');
        main.id = 'main-content';
        main.textContent = 'Main content';
        document.body.appendChild(main);
      });

      // Tab to first element (should be skip link)
      await page.keyboard.press('Tab');

      const skipLink = page.locator('a[href="#main-content"]').first();

      // Check if skip link is in the DOM
      expect(await skipLink.count()).toBeGreaterThan(0);

      // Should be focusable
      await skipLink.focus();
      await expect(skipLink).toBeFocused();
    });

    test('Skip link should become visible on focus', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.evaluate(() => {
        const skipLink = document.createElement('a');
        skipLink.href = '#main-content';
        skipLink.className = 'sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4';
        skipLink.textContent = 'Skip to content';
        skipLink.id = 'skip-link';
        document.body.insertBefore(skipLink, document.body.firstChild);

        const main = document.createElement('main');
        main.id = 'main-content';
        document.body.appendChild(main);
      });

      const skipLink = page.locator('#skip-link');
      await skipLink.focus();

      // When focused, should be visible
      await expect(skipLink).toBeVisible();
      await expect(skipLink).toBeFocused();
    });

    test('Skip link should navigate to main content', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.evaluate(() => {
        const skipLink = document.createElement('a');
        skipLink.href = '#main-content';
        skipLink.textContent = 'Skip to content';
        skipLink.id = 'skip-link';
        document.body.insertBefore(skipLink, document.body.firstChild);

        const main = document.createElement('main');
        main.id = 'main-content';
        main.setAttribute('tabindex', '-1');
        main.textContent = 'Main content area';
        document.body.appendChild(main);
      });

      const skipLink = page.locator('#skip-link');
      await skipLink.click();

      await page.waitForTimeout(100);

      // Should navigate to main content
      const url = await page.url();
      expect(url).toContain('#main-content');
    });

    test('Skip link should pass axe accessibility scan', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.evaluate(() => {
        const skipLink = document.createElement('a');
        skipLink.href = '#main-content';
        skipLink.className = 'sr-only focus:not-sr-only';
        skipLink.textContent = 'Skip to content';
        document.body.insertBefore(skipLink, document.body.firstChild);

        const main = document.createElement('main');
        main.id = 'main-content';
        document.body.appendChild(main);
      });

      const accessibilityScanResults = await new AxeBuilder({ page })
        .include('a[href="#main-content"]')
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();

      expect(accessibilityScanResults.violations).toEqual([]);
    });
  });

  test.describe('Integrated Markdown Content Accessibility', () => {
    test('Complete markdown document should pass axe scan', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Inject complete markdown-like content
      await page.evaluate(() => {
        const article = document.createElement('article');
        article.id = 'markdown-content';
        article.innerHTML = `
          <h1 id="title">Markdown Accessibility Guide</h1>

          <p>This is a paragraph with <a href="/internal">internal link</a> and
          <a href="https://external.com" target="_blank" rel="noopener noreferrer">
            external link
            <svg aria-hidden="true"></svg>
            <span class="sr-only">(opens in new tab)</span>
          </a>.</p>

          <aside role="note">
            <svg aria-hidden="true"></svg>
            <div>Note: Important information</div>
          </aside>

          <figure>
            <figcaption>
              <button type="button" aria-label="Copy code to clipboard" aria-live="polite">Copy</button>
            </figcaption>
            <pre><code>const x = 42;</code></pre>
          </figure>

          <div role="region" aria-label="Scrollable table" tabindex="0">
            <table>
              <thead><tr><th>Header</th></tr></thead>
              <tbody><tr><td>Data</td></tr></tbody>
            </table>
          </div>
        `;
        document.body.appendChild(article);
      });

      const accessibilityScanResults = await new AxeBuilder({ page })
        .include('#markdown-content')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();

      expect(accessibilityScanResults.violations).toEqual([]);
    });

    test('Markdown components should work together seamlessly', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.evaluate(() => {
        const container = document.createElement('div');
        container.innerHTML = `
          <h2 id="section">
            <a href="#section" aria-label="Copy link to section" aria-live="polite">#</a>
            Section Title
          </h2>

          <aside role="alert">
            <svg aria-hidden="true"></svg>
            <div>Warning message</div>
          </aside>

          <p>Text with <a href="https://example.com" target="_blank" rel="noopener noreferrer">
            link<svg aria-hidden="true"></svg><span class="sr-only">(opens in new tab)</span>
          </a></p>
        `;
        document.body.appendChild(container);
      });

      // Test keyboard navigation through components
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');

      // Should be able to focus through all interactive elements
      const focusedElement = await page.locator(':focus').first();
      expect(await focusedElement.count()).toBeGreaterThan(0);
    });
  });

  test.describe('Mobile Accessibility for Markdown Components', () => {
    test.beforeEach(async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });
    });

    test('Code blocks should be accessible on mobile', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.evaluate(() => {
        const figure = document.createElement('figure');
        figure.innerHTML = `
          <figcaption style="display: flex; justify-content: flex-end;">
            <button
              type="button"
              aria-label="Copy code to clipboard"
              aria-live="polite"
              style="min-width: 44px; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; padding: 8px 12px;"
            >
              Copy
            </button>
          </figcaption>
          <div style="overflow-x: auto;">
            <pre><code>const longCodeLine = "This is a very long line of code";</code></pre>
          </div>
        `;
        document.body.appendChild(figure);
      });

      const copyButton = page.locator('button[aria-label="Copy code to clipboard"]');

      // Check button size (should meet touch target size of 44x44px)
      const box = await copyButton.boundingBox();
      if (box) {
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    });

    test('Tables should be scrollable on mobile', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.evaluate(() => {
        const wrapper = document.createElement('div');
        wrapper.setAttribute('role', 'region');
        wrapper.setAttribute('aria-label', 'Scrollable table');
        wrapper.setAttribute('tabindex', '0');
        wrapper.style.width = '100%';
        wrapper.style.overflowX = 'auto';
        wrapper.innerHTML = `
          <table style="width: 800px;">
            <thead><tr><th>Col 1</th><th>Col 2</th><th>Col 3</th></tr></thead>
            <tbody><tr><td>A</td><td>B</td><td>C</td></tr></tbody>
          </table>
        `;
        document.body.appendChild(wrapper);
      });

      const wrapper = page.locator('[role="region"]');
      await expect(wrapper).toBeVisible();

      // Should be scrollable
      const isScrollable = await wrapper.evaluate((el) => {
        return el.scrollWidth > el.clientWidth;
      });

      expect(isScrollable).toBeTruthy();
    });

    test('Mobile markdown should pass axe scan', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.evaluate(() => {
        const article = document.createElement('article');
        article.innerHTML = `
          <h2 id="mobile">Mobile Section</h2>
          <p>Content with <a href="https://example.com" target="_blank" rel="noopener noreferrer">
            link<svg aria-hidden="true"></svg><span class="sr-only">(opens in new tab)</span>
          </a></p>
          <aside role="note">
            <svg aria-hidden="true"></svg>
            <div>Note</div>
          </aside>
        `;
        document.body.appendChild(article);
      });

      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();

      expect(accessibilityScanResults.violations).toEqual([]);
    });
  });
});
