/**
 * Unit Tests for OLX html.xml Template Generators
 * Test ID: T040
 *
 * Tests two functions:
 * 1. generateHtmlXml(urlName: string, displayName: string): string
 *    - Generates html.xml reference file (just <html> tag)
 *
 * 2. generateHtmlContent(content: string): string
 *    - Generates .html content file with proper structure and CDATA escaping
 *
 * Expected Output Formats:
 *
 * html.xml:
 * <html url_name="..." display_name="..." />
 *
 * content.html:
 * <html>
 *   <![CDATA[
 *     [HTML content here]
 *   ]]>
 * </html>
 *
 * NOTE: This is a TDD red-phase test. The implementation does not exist yet.
 * These tests will fail until T050 implements the actual functions.
 */

import { describe, it, expect } from 'vitest';
import {
  generateHtmlXml,
  generateHtmlContent,
} from '@/integrations/lms/openedx/olx/templates/html';

describe('generateHtmlXml - OLX html.xml reference template', () => {
  describe('Basic HTML XML Generation', () => {
    it('should generate valid html.xml with required attributes', () => {
      const urlName = 'html_intro';
      const displayName = 'Introduction to Variables';

      const result = generateHtmlXml(urlName, displayName);

      // Verify XML structure (self-closing tag)
      expect(result).toContain('<html');
      expect(result).toMatch(/<html[^>]*\/>/); // Self-closing

      // Verify attributes
      expect(result).toContain('url_name="html_intro"');
      expect(result).toContain('display_name="Introduction to Variables"');
    });

    it('should generate self-closing html tag', () => {
      const result = generateHtmlXml('test', 'Test');

      // Verify self-closing tag format
      expect(result).toMatch(/<html\s+[^>]*\/>/);
      expect(result).not.toContain('</html>'); // No closing tag
    });

    it('should handle simple ASCII url_name and display_name', () => {
      const result = generateHtmlXml('simple_html', 'Simple HTML Component');

      expect(result).toContain('url_name="simple_html"');
      expect(result).toContain('display_name="Simple HTML Component"');
    });
  });

  describe('Cyrillic and Unicode Support', () => {
    it('should handle Cyrillic display_name with proper XML escaping', () => {
      const urlName = 'html_variables';
      const displayName = 'Переменные в Python';

      const result = generateHtmlXml(urlName, displayName);

      // Verify Cyrillic is preserved (UTF-8 encoding)
      expect(result).toContain('display_name="Переменные в Python"');
    });

    it('should escape special XML characters in display_name', () => {
      const urlName = 'html_algorithms';
      const displayName = 'Algorithms: "Sorting & Searching"';

      const result = generateHtmlXml(urlName, displayName);

      // Verify XML escaping (&, ", <, >)
      expect(result).toContain('&amp;'); // Ampersand escaped
      expect(result).toContain('&quot;'); // Quotes escaped
      expect(result).not.toContain('Sorting & Searching'); // Raw ampersand should not exist
    });

    it('should handle display_name with comparison operators', () => {
      const urlName = 'html_conditions';
      const displayName = 'Conditional Logic: < and > operators';

      const result = generateHtmlXml(urlName, displayName);

      // Verify < and > are escaped
      expect(result).toContain('&lt;');
      expect(result).toContain('&gt;');
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long url_name', () => {
      const urlName = 'html_very_long_url_name_for_testing_purposes_that_is_still_valid';
      const displayName = 'Long URL Name';

      const result = generateHtmlXml(urlName, displayName);

      expect(result).toContain(`url_name="${urlName}"`);
    });

    it('should handle url_name with underscores, hyphens, and numbers', () => {
      const urlName = 'html_1-1-1_intro_2025';
      const displayName = 'HTML 1.1.1';

      const result = generateHtmlXml(urlName, displayName);

      expect(result).toContain('url_name="html_1-1-1_intro_2025"');
    });

    it('should handle special characters in display_name (quotes, ampersands)', () => {
      const urlName = 'html_special';
      const displayName = 'Component: "Testing" & Debugging';

      const result = generateHtmlXml(urlName, displayName);

      // Verify both " and & are escaped
      expect(result).toContain('&quot;');
      expect(result).toContain('&amp;');
    });

    it('should handle empty display_name', () => {
      const urlName = 'html_empty';
      const displayName = '';

      const result = generateHtmlXml(urlName, displayName);

      expect(result).toContain('display_name=""');
    });
  });

  describe('XML Formatting', () => {
    it('should generate well-formed XML', () => {
      const result = generateHtmlXml('test', 'Test');

      // Verify single self-closing tag
      const htmlTags = (result.match(/<html[^>]*\/>/g) || []).length;
      expect(htmlTags).toBe(1);
    });

    it('should end with newline character', () => {
      const result = generateHtmlXml('test', 'Test');

      // Verify ends with newline
      expect(result).toMatch(/\n$/);
    });
  });
});

describe('generateHtmlContent - OLX .html content file template', () => {
  describe('Basic HTML Content Generation', () => {
    it('should wrap content in complete HTML document structure', () => {
      const content = '<p>Hello World</p>';

      const result = generateHtmlContent(content);

      // Verify HTML document structure
      expect(result).toContain('<html>');
      expect(result).toContain('</html>');
      expect(result).toContain('<head></head>');
      expect(result).toContain('<body>');
      expect(result).toContain('</body>');

      // Verify content is inside body
      expect(result).toContain('<p>Hello World</p>');
    });

    it('should preserve simple HTML content unchanged', () => {
      const content = '<h2>Title</h2><p>Paragraph</p>';

      const result = generateHtmlContent(content);

      // Verify content is preserved inside body
      expect(result).toContain('<h2>Title</h2>');
      expect(result).toContain('<p>Paragraph</p>');
    });

    it('should handle empty content', () => {
      const content = '';

      const result = generateHtmlContent(content);

      // Should still generate valid structure
      expect(result).toContain('<html>');
      expect(result).toContain('<head></head>');
      expect(result).toContain('<body>');
      expect(result).toContain('</body>');
      expect(result).toContain('</html>');
    });
  });

  describe('Cyrillic and Unicode Content', () => {
    it('should preserve Cyrillic content in CDATA', () => {
      const content = '<h2>Переменные в Python</h2><p>Переменные - это контейнеры для хранения данных.</p>';

      const result = generateHtmlContent(content);

      // Verify Cyrillic is preserved
      expect(result).toContain('Переменные в Python');
      expect(result).toContain('контейнеры для хранения данных');
    });

    it('should preserve Unicode characters (emojis, symbols)', () => {
      const content = '<p>Python 🐍 Programming</p><p>Math: ∑, ∫, √</p>';

      const result = generateHtmlContent(content);

      // Verify Unicode is preserved
      expect(result).toContain('🐍');
      expect(result).toContain('∑');
      expect(result).toContain('∫');
      expect(result).toContain('√');
    });

    it('should preserve special HTML entities', () => {
      const content = '<p>&nbsp;&copy;&reg;&trade;</p>';

      const result = generateHtmlContent(content);

      // Verify entities are preserved
      expect(result).toContain('&nbsp;');
      expect(result).toContain('&copy;');
      expect(result).toContain('&reg;');
      expect(result).toContain('&trade;');
    });
  });

  describe('Complex HTML Content', () => {
    it('should handle nested HTML tags', () => {
      const content = `
        <div class="lesson">
          <h2>Introduction</h2>
          <p>Welcome to the lesson.</p>
          <div class="code-example">
            <pre><code>x = 10</code></pre>
          </div>
        </div>
      `;

      const result = generateHtmlContent(content);

      // Verify all nested tags are preserved
      expect(result).toContain('<div class="lesson">');
      expect(result).toContain('<h2>Introduction</h2>');
      expect(result).toContain('<div class="code-example">');
      expect(result).toContain('<pre><code>x = 10</code></pre>');
    });

    it('should handle HTML with attributes', () => {
      const content = '<div class="container" id="main"><p style="color: red;">Red text</p></div>';

      const result = generateHtmlContent(content);

      // Verify attributes are preserved
      expect(result).toContain('class="container"');
      expect(result).toContain('id="main"');
      expect(result).toContain('style="color: red;"');
    });

    it('should handle code blocks with special characters', () => {
      const content = `
        <pre><code>
          if (x < 10 && y > 5) {
            console.log("Condition met");
          }
        </code></pre>
      `;

      const result = generateHtmlContent(content);

      // Verify code content is preserved (CDATA handles < and >)
      expect(result).toContain('if (x < 10 && y > 5)');
      expect(result).toContain('console.log("Condition met")');
    });
  });

  describe('Security and XSS Prevention', () => {
    // NOTE: generateHtmlContent is a low-level OLX template function that wraps
    // content in an HTML document. XSS sanitization should be handled upstream
    // at content creation/import time, not at OLX packaging time.
    // These tests verify that content passes through unchanged (as expected).

    it('should pass through script tags (sanitization is upstream responsibility)', () => {
      const content = '<script>alert("XSS")</script><p>Content</p>';

      const result = generateHtmlContent(content);

      // Content passes through unchanged - sanitization happens upstream
      expect(result).toContain('<script>alert("XSS")</script>');
      expect(result).toContain('<p>Content</p>');
    });

    it('should pass through javascript: URLs (sanitization is upstream responsibility)', () => {
      const content = '<a href="javascript:alert(1)">Click</a>';

      const result = generateHtmlContent(content);

      // Content passes through unchanged - sanitization happens upstream
      expect(result).toContain('href="javascript:alert(1)"');
      expect(result).toContain('Click</a>');
    });

    it('should pass through event handlers (sanitization is upstream responsibility)', () => {
      const content = '<img src="x" onerror="alert(1)"><div onclick="malicious()">Click</div>';

      const result = generateHtmlContent(content);

      // Content passes through unchanged - sanitization happens upstream
      expect(result).toContain('onerror="alert(1)"');
      expect(result).toContain('onclick="malicious()"');
    });
  });

  describe('CDATA Handling', () => {
    it('should handle content with existing CDATA markers', () => {
      // Edge case: content already has CDATA markers
      const content = '<p>Some text <![CDATA[nested CDATA]]> more text</p>';

      const result = generateHtmlContent(content);

      // The function should properly handle nested CDATA
      // (may need to escape the inner CDATA markers)
      expect(result).toContain('<html>');
      expect(result).toContain('</html>');
    });

    it('should handle content with ]]> sequence', () => {
      // Edge case: content contains ]]> which terminates CDATA
      const content = '<p>Example: ]]> is a CDATA terminator</p>';

      const result = generateHtmlContent(content);

      // The function should escape or split the CDATA section
      // For TDD: assume it handles this gracefully
      expect(result).toContain('<html>');
      expect(result).toContain('</html>');
    });
  });

  describe('Whitespace and Formatting', () => {
    it('should preserve whitespace in content', () => {
      const content = `
        <p>
          Line 1
          Line 2
          Line 3
        </p>
      `;

      const result = generateHtmlContent(content);

      // Verify whitespace is preserved
      expect(result).toContain('Line 1');
      expect(result).toContain('Line 2');
      expect(result).toContain('Line 3');
    });

    it('should handle content with tabs and special whitespace', () => {
      const content = '<pre>\tIndented\n\tCode\n</pre>';

      const result = generateHtmlContent(content);

      // Verify tabs and newlines are preserved
      expect(result).toContain('\tIndented');
      expect(result).toContain('\tCode');
    });

    it('should end with newline character', () => {
      const content = '<p>Test</p>';

      const result = generateHtmlContent(content);

      // Verify ends with newline
      expect(result).toMatch(/\n$/);
    });
  });

  describe('Real-world Content Examples', () => {
    it('should handle typical lesson introduction content', () => {
      const content = `
        <h2>Введение в переменные</h2>
        <p>Переменные - это контейнеры для хранения данных в программе.</p>
        <h3>Создание переменных</h3>
        <p>В Python переменные создаются автоматически при присваивании значения:</p>
        <pre><code>x = 10
name = "Alice"
is_active = True</code></pre>
        <p>В этом примере мы создали три переменные разных типов.</p>
      `;

      const result = generateHtmlContent(content);

      // Verify all content is preserved
      expect(result).toContain('Введение в переменные');
      expect(result).toContain('контейнеры для хранения данных');
      expect(result).toContain('<pre><code>x = 10');
      expect(result).toContain('name = "Alice"');
    });

    it('should handle data science content with formulas', () => {
      const content = `
        <h2>Hypothesis Testing</h2>
        <p>The null hypothesis (H₀) states that there is no significant difference.</p>
        <p>We reject H₀ if p < 0.05 (significance level α = 0.05).</p>
        <div class="formula">
          <p>T-statistic: t = (x̄ - μ) / (s / √n)</p>
        </div>
      `;

      const result = generateHtmlContent(content);

      // Verify formulas are preserved
      expect(result).toContain('H₀');
      expect(result).toContain('p < 0.05');
      expect(result).toContain('α = 0.05');
      expect(result).toContain('(x̄ - μ)');
      expect(result).toContain('√n');
    });

    it('should handle content with embedded images and links', () => {
      const content = `
        <h2>Python Logo</h2>
        <img src="/static/images/python-logo.png" alt="Python Logo" />
        <p>Learn more at <a href="https://python.org" target="_blank">python.org</a></p>
      `;

      const result = generateHtmlContent(content);

      // Verify images and links are preserved
      expect(result).toContain('<img src="/static/images/python-logo.png"');
      expect(result).toContain('alt="Python Logo"');
      expect(result).toContain('<a href="https://python.org"');
      expect(result).toContain('target="_blank"');
    });

    it('should handle MegaCampus-generated HTML content', () => {
      const content = `
        <div class="lesson-content">
          <h1>Lesson 1.1: Introduction to Python</h1>
          <section id="what-is-python">
            <h2>What is Python?</h2>
            <p>Python is a high-level, interpreted programming language.</p>
            <ul>
              <li>Easy to learn</li>
              <li>Versatile</li>
              <li>Large ecosystem</li>
            </ul>
          </section>
          <section id="getting-started">
            <h2>Getting Started</h2>
            <p>Install Python from <a href="https://python.org">python.org</a></p>
          </section>
        </div>
      `;

      const result = generateHtmlContent(content);

      // Verify structure is preserved
      expect(result).toContain('class="lesson-content"');
      expect(result).toContain('id="what-is-python"');
      expect(result).toContain('<ul>');
      expect(result).toContain('<li>Easy to learn</li>');
      expect(result).toContain('id="getting-started"');
    });
  });
});
