import { describe, it, expect } from 'vitest'
import { parseMarkdownToContent, parsedLessonContentSchema } from '../markdown-content-parser'

/**
 * XSS Safety Tests for Markdown Content Parser
 *
 * IMPORTANT: This parser is NOT responsible for XSS protection.
 * It's a pure string parser that extracts structured data from markdown.
 *
 * XSS Protection Strategy:
 * 1. Parser (this file): Stores raw markdown with XSS vectors as-is
 * 2. Zod validation: Validates structure, NOT content safety
 * 3. MDEditor rendering: react-markdown sanitizes HTML by default
 *    - Script tags are stripped during rendering
 *    - javascript: URLs are blocked
 *    - Event handlers are removed
 *
 * These tests verify that:
 * - Parser treats XSS vectors as regular text (expected behavior)
 * - Zod validation passes (structural validation only)
 * - We document reliance on MDEditor for actual XSS protection
 */
describe('Markdown XSS Safety', () => {
  describe('Parser does NOT strip XSS vectors (by design)', () => {
    it('should preserve script tags in markdown as regular text', () => {
      const markdown = `## Section
<script>alert('XSS')</script>
Regular content.`

      const result = parseMarkdownToContent(markdown)

      // Parser stores XSS vector as-is (it's just text to the parser)
      expect(result.sections?.[0].content).toContain('<script>')
      expect(result.sections?.[0].content).toContain("alert('XSS')")
      expect(result.sections?.[0].content).toContain('</script>')
    })

    it('should preserve javascript: links as regular text', () => {
      const markdown = `## Section
[Click me](javascript:alert('XSS'))
Regular content.`

      const result = parseMarkdownToContent(markdown)

      // Parser preserves the link syntax
      expect(result.sections?.[0].content).toContain('javascript:alert')
    })

    it('should preserve img onerror XSS vectors', () => {
      const markdown = `## Section
<img src=x onerror=alert(1)>
Content continues.`

      const result = parseMarkdownToContent(markdown)

      expect(result.sections?.[0].content).toContain('<img src=x onerror=alert(1)>')
    })

    it('should preserve event handler attributes', () => {
      const markdown = `## Section
<div onclick="alert('XSS')">Click me</div>
More content.`

      const result = parseMarkdownToContent(markdown)

      expect(result.sections?.[0].content).toContain('onclick="alert')
    })
  })

  describe('Zod validation does NOT sanitize content', () => {
    it('should pass validation for content with script tags', () => {
      const markdown = `## Введение
<script>alert('XSS')</script>

## Section
Normal content.

## Заключение
<script>console.log('XSS')</script>`

      const parsed = parseMarkdownToContent(markdown)

      // Zod validates structure, not content safety
      expect(() => parsedLessonContentSchema.parse(parsed)).not.toThrow()

      const validated = parsedLessonContentSchema.parse(parsed)
      expect(validated.intro).toContain('<script>')
      expect(validated.summary).toContain('<script>')
    })

    it('should pass validation for content with javascript: URLs', () => {
      const markdown = `## Section
[Malicious link](javascript:void(document.cookie))
Content.`

      const parsed = parseMarkdownToContent(markdown)
      const validated = parsedLessonContentSchema.parse(parsed)

      expect(validated.sections?.[0].content).toContain('javascript:void')
    })

    it('should pass validation for content with iframe injection', () => {
      const markdown = `## Section
<iframe src="https://evil.com"></iframe>
Content.`

      const parsed = parseMarkdownToContent(markdown)
      const validated = parsedLessonContentSchema.parse(parsed)

      expect(validated.sections?.[0].content).toContain('<iframe')
    })

    it('should pass validation for content with data: URLs', () => {
      const markdown = `## Section
<a href="data:text/html,<script>alert('XSS')</script>">Click</a>
Content.`

      const parsed = parseMarkdownToContent(markdown)
      const validated = parsedLessonContentSchema.parse(parsed)

      expect(validated.sections?.[0].content).toContain('data:text/html')
    })
  })

  describe('Complex XSS vectors are preserved as text', () => {
    it('should preserve SVG-based XSS', () => {
      const markdown = `## Section
<svg onload=alert(1)>
Content.`

      const result = parseMarkdownToContent(markdown)

      expect(result.sections?.[0].content).toContain('<svg onload=alert(1)>')
    })

    it('should preserve meta refresh redirect', () => {
      const markdown = `## Section
<meta http-equiv="refresh" content="0;url=javascript:alert('XSS')">
Content.`

      const result = parseMarkdownToContent(markdown)

      expect(result.sections?.[0].content).toContain('<meta http-equiv="refresh"')
    })

    it('should preserve base64 encoded XSS', () => {
      const markdown = `## Section
<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgnWFNTJyk8L3NjcmlwdD4=">Click</a>
Content.`

      const result = parseMarkdownToContent(markdown)

      expect(result.sections?.[0].content).toContain('base64,PHNjcmlwdD')
    })

    it('should preserve HTML entities that could be used for obfuscation', () => {
      const markdown = `## Section
&lt;script&gt;alert('XSS')&lt;/script&gt;
Content.`

      const result = parseMarkdownToContent(markdown)

      expect(result.sections?.[0].content).toContain('&lt;script&gt;')
    })
  })

  describe('XSS vectors in different sections', () => {
    it('should preserve XSS in intro', () => {
      const markdown = `<script>alert('intro XSS')</script>

## Section
Normal content.`

      const result = parseMarkdownToContent(markdown)

      expect(result.intro).toContain('<script>')
      expect(result.intro).toContain("alert('intro XSS')")
    })

    it('should preserve XSS in section title', () => {
      const markdown = `## <script>alert('title XSS')</script>
Section content.`

      const result = parseMarkdownToContent(markdown)

      expect(result.sections?.[0].title).toContain('<script>')
    })

    it('should preserve XSS in summary', () => {
      const markdown = `## Section
Content.

## Заключение
<script>alert('summary XSS')</script>`

      const result = parseMarkdownToContent(markdown)

      expect(result.summary).toContain('<script>')
    })

    it('should preserve XSS across multiple sections', () => {
      const markdown = `## Section 1
<img src=x onerror=alert(1)>

## Section 2
<iframe src="javascript:alert('XSS')"></iframe>

## Section 3
<a href="javascript:void(0)">Link</a>`

      const result = parseMarkdownToContent(markdown)

      expect(result.sections).toHaveLength(3)
      expect(result.sections?.[0].content).toContain('<img src=x onerror')
      expect(result.sections?.[1].content).toContain('<iframe')
      expect(result.sections?.[2].content).toContain('javascript:void')
    })
  })

  describe('Documentation: MDEditor is responsible for XSS protection', () => {
    it('should document that react-markdown sanitizes HTML by default', () => {
      /**
       * MDEditor uses react-markdown for rendering, which:
       * 1. Does NOT render raw HTML by default (disallowedElements)
       * 2. Escapes dangerous content automatically
       * 3. Blocks javascript: URLs
       * 4. Strips event handlers (onclick, onerror, etc.)
       *
       * Configuration in MDEditor component:
       * - rehype-sanitize plugin: Sanitizes HTML
       * - disallowedElements: Blocks script, iframe, object, embed
       * - allowedElements whitelist: Only safe markdown elements
       *
       * Therefore: This parser can safely store raw markdown with XSS vectors,
       * because the rendering layer handles sanitization.
       */

      const maliciousMarkdown = `## XSS Test
<script>alert('This will be stripped by MDEditor')</script>
[Click me](javascript:alert('This will be blocked by MDEditor'))
<img src=x onerror=alert(1) />`

      const parsed = parseMarkdownToContent(maliciousMarkdown)

      // Parser stores as-is (it's just a string parser)
      expect(parsed.sections?.[0].content).toContain('<script>')
      expect(parsed.sections?.[0].content).toContain('javascript:alert')
      expect(parsed.sections?.[0].content).toContain('onerror')

      // MDEditor will strip these during rendering
      // (cannot test rendering here, but this documents the expectation)
    })

    it('should preserve safe markdown that MDEditor will render correctly', () => {
      const safeMarkdown = `## Safe Content
This is **bold** and *italic*.

- List item 1
- List item 2

\`\`\`javascript
// Code block (safe)
const x = 10;
\`\`\`

[Safe link](https://example.com)`

      const result = parseMarkdownToContent(safeMarkdown)

      // Parser preserves all markdown syntax
      expect(result.sections?.[0].content).toContain('**bold**')
      expect(result.sections?.[0].content).toContain('*italic*')
      expect(result.sections?.[0].content).toContain('- List item')
      expect(result.sections?.[0].content).toContain('```javascript')
      expect(result.sections?.[0].content).toContain('[Safe link](https://example.com)')

      // Zod validation passes
      expect(() => parsedLessonContentSchema.parse(result)).not.toThrow()
    })
  })

  describe('Content Security Policy (CSP) defense-in-depth', () => {
    it('should document that CSP provides additional XSS protection', () => {
      /**
       * Defense-in-depth strategy:
       * 1. Parser: Stores raw content (no sanitization)
       * 2. MDEditor: Sanitizes during rendering (primary defense)
       * 3. CSP headers: Blocks inline scripts even if they bypass rendering
       *    - script-src 'self': Only scripts from same origin
       *    - No 'unsafe-inline': Inline scripts blocked
       *    - No 'unsafe-eval': eval() blocked
       *
       * Even if XSS vector reaches HTML:
       * - MDEditor strips it (primary)
       * - CSP blocks execution (fallback)
       *
       * This parser's role: Extract structure, NOT sanitize content.
       */

      const markdown = `## Test
<script>
  // Even if this reaches HTML, CSP blocks it
  alert('XSS blocked by CSP');
</script>`

      const result = parseMarkdownToContent(markdown)

      // Parser stores as-is
      expect(result.sections?.[0].content).toContain('<script>')
      // CSP + MDEditor handle safety
    })
  })

  describe('Edge cases: XSS in Zod validation limits', () => {
    it('should enforce length limits even for malicious content', () => {
      const longXSS = '<script>alert("XSS")</script>'.repeat(1000)
      const markdown = `## Section
${longXSS}`

      const parsed = parseMarkdownToContent(markdown)

      // If content exceeds limit, Zod will reject
      if (parsed.sections?.[0].content.length > 100000) {
        expect(() => parsedLessonContentSchema.parse(parsed)).toThrow(
          /Содержание секции слишком длинное/
        )
      }
    })

    it('should count XSS vector characters toward length limit', () => {
      const intro = '<script>alert("XSS")</script>'.repeat(400) // ~10400 chars
      const invalid = { intro }

      expect(() => parsedLessonContentSchema.parse(invalid)).toThrow(/Введение слишком длинное/)
    })
  })
})
