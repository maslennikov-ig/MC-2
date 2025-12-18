# Research: Unified Markdown Rendering System

**Date**: 2025-12-11
**Status**: Complete

## 1. Library Decisions

### 1.1 Syntax Highlighting: Shiki + rehype-pretty-code

**Decision**: Use `shiki@1.24+` with `rehype-pretty-code@0.14+` for server-side syntax highlighting.

**Rationale**:
- Zero client-side JavaScript for syntax highlighting (SSR only)
- VS Code-quality highlighting using TextMate grammars
- Supports 200+ programming languages out of the box
- Built-in dual theme support (light/dark) via CSS variables
- Active maintenance (High reputation, 78.5 benchmark score)

**Alternatives Considered**:
| Library | Reason Rejected |
|---------|-----------------|
| `rehype-highlight` (current) | Client-side JS (~50KB), less accurate highlighting |
| `highlight.js` | Client-side JS, less accurate than TextMate grammars |
| `prism.js` | Client-side JS, smaller grammar coverage |

**Integration Pattern** (from Context7):
```typescript
// Next.js RSC integration
import { codeToHtml } from 'shiki'

async function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const html = await codeToHtml(code, {
    lang,
    themes: { light: 'github-light', dark: 'github-dark' }
  })
  return <div dangerouslySetInnerHTML={{ __html: html }} />
}
```

### 1.2 Streaming Markdown: Streamdown

**Decision**: Use `streamdown@latest` (Vercel) for AI streaming content.

**Rationale**:
- Drop-in replacement for react-markdown
- Handles incomplete markdown gracefully during streaming
- Uses `remend` library internally to auto-complete partial syntax
- Block-level memoization for performance
- Official Vercel library with high reputation (87.1 benchmark score)

**Alternatives Considered**:
| Library | Reason Rejected |
|---------|-----------------|
| `react-markdown` (current) | No streaming optimization, re-renders entire content |
| Custom streaming parser | Maintenance burden, reinventing wheel |

**Key Feature** (from Context7):
```tsx
// Handles incomplete markdown during streaming
<Streamdown parseIncompleteMarkdown={true}>
  {streamingContent}  // "**bold text that hasn't closed yet" → auto-completed
</Streamdown>
```

### 1.3 Static MDX Rendering: next-mdx-remote

**Decision**: Use `next-mdx-remote@5.x` for RSC static content.

**Rationale**:
- Official MDX solution for Next.js RSC
- Server-side compilation, zero client bundle for MDX processing
- Supports custom components and remark/rehype plugins
- Already proven in production (HashiCorp, High reputation)

**Integration Pattern**:
```typescript
import { compileMDX } from 'next-mdx-remote/rsc'

export async function MarkdownRenderer({ content }: { content: string }) {
  const { content: compiledContent } = await compileMDX({
    source: content,
    options: {
      mdxOptions: {
        remarkPlugins: [remarkGfm, remarkMath, remarkEmoji],
        rehypePlugins: [rehypeSlug, rehypeKatex, rehypePrettyCode],
      },
    },
    components: customComponents,
  })
  return compiledContent
}
```

### 1.4 Math Rendering: KaTeX

**Decision**: Use `katex@0.16+` with `remark-math@6.x` and `rehype-katex@7.x`.

**Rationale**:
- Server-side rendering (CSS-only on client)
- Fastest LaTeX renderer available
- MathML output for accessibility (`output: 'htmlAndMathml'`)
- ~120KB CSS (cached, acceptable for educational platform)

**Alternatives Considered**:
| Library | Reason Rejected |
|---------|-----------------|
| MathJax | Larger bundle, client-side rendering |

**Dark Mode Fix** (from requirements):
```css
/* katex-overrides.css */
.dark .katex { color: var(--foreground); }
.dark .katex .mord, .dark .katex .mbin, .dark .katex .mrel { color: inherit; }
```

### 1.5 Diagrams: Mermaid in Sandboxed Iframe

**Decision**: Use `mermaid@11.4+` rendered inside a sandboxed `<iframe>` with separate CSP.

**Rationale**:
- Mermaid requires `unsafe-eval` for diagram parsing
- Sandboxed iframe isolates security risk from main application
- Main app CSP stays strict (no `unsafe-eval`)
- Spec requirement FR-028 explicitly requires this approach

**Implementation Pattern**:
```tsx
// MermaidIframe.tsx
export function MermaidIframe({ chart }: { chart: string }) {
  const srcDoc = `
    <!DOCTYPE html>
    <html>
    <head>
      <script type="module">
        import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
        mermaid.initialize({
          startOnLoad: true,
          securityLevel: 'strict',
          theme: document.body.classList.contains('dark') ? 'dark' : 'default'
        });
      </script>
    </head>
    <body><div class="mermaid">${escapeHtml(chart)}</div></body>
    </html>
  `
  return (
    <iframe
      sandbox="allow-scripts"
      srcDoc={srcDoc}
      className="w-full border-0"
      title="Mermaid diagram"
    />
  )
}
```

**Security Levels** (from Context7):
- `strict`: Safe for untrusted content (recommended)
- `antiscript`: Blocks inline script execution in labels
- `loose`: Allows click events and some HTML (not for UGC)

### 1.6 Existing Dependencies to Keep

| Dependency | Version | Reason |
|------------|---------|--------|
| `remark-gfm` | 4.x | GFM support (tables, strikethrough, autolinks) |
| `remark-emoji` | 5.x | Emoji shortcodes |
| `rehype-sanitize` | 6.x | UGC sanitization |
| `isomorphic-dompurify` | 2.x | Client-side sanitization backup |
| `@tailwindcss/typography` | 0.5.x | Prose styling |

### 1.7 Dependencies to Remove

| Dependency | Reason |
|------------|--------|
| `rehype-highlight` | Replaced by Shiki/rehype-pretty-code |

## 2. Architecture Decisions

### 2.1 Dual Renderer Architecture

**Decision**: Two separate renderers for different use cases.

| Renderer | Type | Use Case | Client JS |
|----------|------|----------|-----------|
| `MarkdownRenderer` | RSC (Server) | Lessons, previews, static content | 0 KB (highlight) |
| `MarkdownRendererClient` | Client | Streaming AI chat | ~5-10 KB (Streamdown) |

**Justification**: Server components cannot handle streaming token-by-token updates. Client components add unnecessary JS for static content. Dual approach optimizes both scenarios.

### 2.2 Presets System

**Decision**: Predefined feature configurations for common contexts.

```typescript
export const presets = {
  lesson: {
    math: true, mermaid: true, codeHighlight: true,
    copyButton: true, anchorLinks: true, callouts: true
  },
  chat: {
    math: false, mermaid: false, codeHighlight: true,
    copyButton: false, anchorLinks: false, callouts: false
  },
  preview: {
    math: true, mermaid: false, codeHighlight: true,
    copyButton: true, anchorLinks: false, callouts: true
  },
  minimal: {
    math: false, mermaid: false, codeHighlight: false,
    copyButton: false, anchorLinks: false, callouts: false
  }
}
```

**Justification**: Avoids per-component configuration duplication. Easy to extend with new presets.

### 2.3 Two-Tier Security Model

**Decision**: Different sanitization pipelines for trusted vs untrusted content.

| Content Source | Trust Level | Sanitization |
|----------------|-------------|--------------|
| AI-generated lessons | Trusted | None (performance) |
| User comments/input | Untrusted | rehype-sanitize FIRST |

**Justification**: Spec requirement FR-026. Trusted content (CMS, AI) doesn't need sanitization overhead. UGC must be sanitized before any processing.

## 3. Typography Standards (WCAG-Compliant)

**Decision**: Enforce accessibility-compliant typography values.

| Property | Value | Standard |
|----------|-------|----------|
| Body font size | 16px (base) | WCAG minimum |
| Line height | 1.625 | WCAG 1.5× minimum |
| Line length | max 65ch | Readability studies |
| Paragraph spacing | 1.25em | Visual breathing room |
| Heading letter-spacing | -0.025em | Display text optimization |

## 4. Component Reuse from Existing Code

### 4.1 CodeBlock Pattern

**Source**: Existing `trace-viewer.tsx` has a CodeBlock component.

**Decision**: Extract and enhance pattern for markdown system.
- Add copy button with clipboard API
- Add language badge
- Add line numbers (CSS counters)
- Add line highlighting support

### 4.2 Callout Pattern

**Decision**: Implement GitHub-style callout syntax.

```markdown
> [!NOTE]
> This is a note callout

> [!WARNING]
> This is a warning
```

Parse with custom remark plugin or regex in component.

## 5. Migration Strategy

**Decision**: Gradual migration with feature parity validation.

1. Create new `components/markdown/` with all features
2. Migrate `lesson-content.tsx` first (most complex, student-facing)
3. Migrate preview components
4. Migrate streaming chat last (different renderer)
5. Remove old dependencies after all migrations complete
6. Visual regression tests at each step

## 6. Performance Optimization

### 6.1 Lazy Loading

| Component | Strategy |
|-----------|----------|
| MermaidDiagram | `next/dynamic` with loading skeleton |
| CodeBlock copy button | Inline, minimal (~2KB) |
| KaTeX CSS | Single load in layout, cached |

### 6.2 Caching

```typescript
import { cache } from 'react'

// Request-level cache for MDX compilation
export const getCompiledMDX = cache(async (content: string, preset: string) => {
  return compileMDX({ source: content, options: getPresetOptions(preset) })
})
```

## 7. Research Questions Resolved

| Question | Resolution |
|----------|------------|
| How to achieve 0 KB client JS for highlighting? | Shiki SSR via next-mdx-remote RSC |
| How to handle streaming markdown? | Streamdown library with `parseIncompleteMarkdown` |
| How to avoid unsafe-eval for Mermaid? | Sandboxed iframe with isolated CSP |
| Which typography values are WCAG-compliant? | 16px font, 1.625 line-height, 65ch max-width |
| How to support dual themes (light/dark)? | Shiki dual themes + CSS variables |
