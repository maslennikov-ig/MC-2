# Modern Markdown Rendering for Next.js 15+ Educational Platforms

**The optimal stack for AI-powered educational content combines react-markdown or next-mdx-remote with Shiki-based syntax highlighting, all styled through Tailwind's typography plugin.** This combination delivers zero client-side JavaScript for Markdown parsing when using React Server Components, VS Code-quality code highlighting at build time, and a production-ready typography system that rivals Notion and Stripe's documentation. For an educational platform generating lesson content with math formulas, complex tables, and code examples, this stack handles every content type while maintaining exceptional performance.

The shift toward server-side Markdown rendering has transformed the ecosystem since 2024. Libraries like Shiki now render at build time, eliminating the **~200KB+ client bundle** that syntax highlighters traditionally required. Meanwhile, next-mdx-remote v5 and react-markdown v10 both support React Server Components natively, making the architecture decision straightforward for Next.js 15 applications.

---

## The recommended technology stack for educational content

For an AI-powered educational platform with Next.js 15+, React 19, and Tailwind CSS 4, this configuration provides the best balance of features, performance, and developer experience:

**Core rendering**: Use **next-mdx-remote** (v5.0.0) with its `/rsc` import for dynamic AI-generated content, or **@next/mdx** for file-based course materials. Both integrate seamlessly with React Server Components and support the full unified/remark/rehype plugin ecosystem.

**Syntax highlighting**: **rehype-pretty-code** powered by **Shiki** delivers VS Code-identical highlighting with zero client JavaScript. It supports line highlighting (`{1,4-5}`), word highlighting, diff notation, and automatic dual-theme support for light/dark modes.

**Typography**: **@tailwindcss/typography** provides the prose classes that handle headings, paragraphs, lists, blockquotes, and tables out of the box. Customize via CSS variables or Tailwind config extensions.

**Math rendering**: **remark-math** combined with **rehype-katex** renders LaTeX at build time. KaTeX's **~347KB bundle** (with fonts) stays entirely server-side, producing pre-rendered HTML that displays instantly without layout shift.

**Tables and GFM**: **remark-gfm** enables GitHub Flavored Markdown tables, strikethrough, autolinks, and task lists—essential for educational content.

```typescript
// next.config.mjs - Complete configuration
import createMDX from '@next/mdx'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypePrettyCode from 'rehype-pretty-code'
import rehypeSlug from 'rehype-slug'

const withMDX = createMDX({
  options: {
    remarkPlugins: [remarkGfm, remarkMath],
    rehypePlugins: [
      rehypeSlug,
      rehypeKatex,
      [rehypePrettyCode, {
        theme: { light: 'github-light', dark: 'github-dark' },
        keepBackground: false,
      }],
    ],
  },
})

export default withMDX({
  pageExtensions: ['js', 'jsx', 'md', 'mdx', 'ts', 'tsx'],
})
```

---

## Library comparison reveals clear winners for 2025

The Markdown library ecosystem has consolidated around a few well-maintained solutions, each serving different use cases. React-markdown (v10.1.0, **15.2k GitHub stars**) remains the go-to for rendering plain Markdown strings, while MDX-based solutions dominate when component embedding matters.

| Library | RSC Support | Bundle Impact | Best For | Maintenance |
|---------|-------------|---------------|----------|-------------|
| **next-mdx-remote** | Native (`/rsc` import) | 0KB client | Dynamic/CMS content | Active (HashiCorp) |
| **@next/mdx** | Native | 0KB client | File-based content | Active (Vercel) |
| **react-markdown** | Partial (`MarkdownAsync`) | ~42KB client | Simple Markdown strings | Active |
| **Streamdown** | ✅ | Optimized | AI streaming output | Active (Vercel) |
| **marked/markdown-it** | ❌ | ~8-32KB | Non-React contexts | Not recommended |

For AI-generated content that streams token-by-token, Vercel's **Streamdown** library (3.3k stars) solves the critical problem of rendering incomplete Markdown blocks during streaming. It memoizes parsed blocks to prevent expensive re-renders on each token, making it the optimal choice for ChatGPT-style educational assistants.

```tsx
// Streaming AI content with Streamdown
import { Streamdown } from 'streamdown'

function AIExplanation({ stream }) {
  return (
    <article className="prose dark:prose-invert">
      <Streamdown>{stream}</Streamdown>
    </article>
  )
}
```

---

## Shiki dominates syntax highlighting for server-rendered applications

The syntax highlighting landscape shifted decisively toward **Shiki** in 2024-2025. Unlike Prism or highlight.js, Shiki uses VS Code's TextMate grammar engine, producing identical highlighting to what developers see in their editor. More importantly for Next.js applications, Shiki renders entirely at build time or on the server, resulting in **zero client-side JavaScript**.

**rehype-pretty-code** wraps Shiki for seamless integration with the remark/rehype pipeline. It adds features essential for educational content: line numbers via CSS counters, line highlighting using `{1,4-5}` syntax in code fences, word highlighting with `/pattern/` notation, and diff highlighting for showing code changes.

| Highlighter | Client Bundle | RSC Support | Languages | Features |
|-------------|---------------|-------------|-----------|----------|
| **Shiki/rehype-pretty-code** | 0KB | Excellent | 190+ | Line/word/diff highlighting, dual themes |
| **prism-react-renderer** | ~12KB | Client only | ~40 | Render props API, customizable |
| **react-syntax-highlighter** | 17-200KB | Client only | 190+ | Built-in line numbers |
| **Sugar High** | ~1KB | Manual | JS/JSX only | Ultra-lightweight |
| **Bright** | 0KB | Native | 190+ | RSC-first, extensible |

For educational platforms, the **a11y-dark** and **github-light/dark** themes provide WCAG-compliant contrast ratios (**4.5:1 minimum**) essential for readability. The copy-to-clipboard functionality requires a client component wrapper:

```tsx
// components/CodeBlock.tsx
'use client'
import { useState } from 'react'

export function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  
  const handleCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  
  return (
    <button 
      onClick={handleCopy}
      className="absolute top-2 right-2 px-2 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600"
      aria-label="Copy code to clipboard"
    >
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  )
}
```

---

## Typography and visual design patterns from leading platforms

Premium Markdown styling follows consistent patterns across Notion, Linear, Stripe, and Vercel documentation. **Inter** has emerged as the standard UI font (used by Notion and Linear) due to its high x-height and excellent screen legibility. The Tailwind typography plugin encodes these patterns into ready-to-use prose classes.

The key typography values that define readable educational content:
- **Body font size**: 16-18px (16px minimum for accessibility)
- **Line height**: 1.5-1.625 (WCAG recommends 1.5× minimum)
- **Line length**: 65-75 characters (use `max-width: 65ch`)
- **Paragraph spacing**: 1.25-1.5em between paragraphs
- **Heading tracking**: -0.025em letter-spacing for h1/h2

```tsx
// Applying Tailwind typography with customizations
<article className="prose prose-lg dark:prose-invert
  prose-headings:tracking-tight
  prose-h2:border-b prose-h2:pb-2
  prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline
  prose-code:bg-gray-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded
  prose-img:rounded-xl prose-img:shadow-lg
  max-w-prose">
  <MarkdownRenderer content={content} />
</article>
```

**Callout components** following Mintlify and Docusaurus patterns enhance educational content with contextual alerts. Implement five variants—note, tip, info, warning, danger—each with distinct colors and icons:

```tsx
const calloutStyles = {
  note: 'bg-blue-50 border-blue-400 dark:bg-blue-950',
  warning: 'bg-amber-50 border-amber-400 dark:bg-amber-950',
  tip: 'bg-emerald-50 border-emerald-400 dark:bg-emerald-950',
  danger: 'bg-red-50 border-red-400 dark:bg-red-950',
}

export function Callout({ type = 'note', title, children }) {
  return (
    <aside 
      role={type === 'warning' || type === 'danger' ? 'alert' : 'note'}
      className={`my-6 p-4 border-l-4 rounded-r-lg ${calloutStyles[type]}`}
    >
      {title && <strong className="block mb-2">{title}</strong>}
      <div className="text-sm leading-relaxed">{children}</div>
    </aside>
  )
}
```

---

## Tables require wrapper components for responsive behavior

Markdown tables through remark-gfm render as standard HTML tables, which need additional styling for responsive behavior and visual polish. The pattern involves wrapping tables in a scrollable container while applying striped rows, hover states, and sticky headers through CSS or Tailwind utilities.

```tsx
// mdx-components.tsx - Custom table rendering
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...components,
    table: ({ children }) => (
      <div className="overflow-x-auto my-6 rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }) => (
      <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
        {children}
      </thead>
    ),
    th: ({ children }) => (
      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">
        {children}
      </th>
    ),
    tr: ({ children }) => (
      <tr className="even:bg-gray-50 dark:even:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors">
        {children}
      </tr>
    ),
    td: ({ children }) => (
      <td className="px-4 py-3 text-sm border-t border-gray-200 dark:border-gray-700">
        {children}
      </td>
    ),
  }
}
```

For tables requiring sorting or filtering, the content must be parsed from the Markdown AST and rendered with a dynamic table library like TanStack Table—Markdown tables are inherently static.

---

## Math rendering with KaTeX outperforms MathJax for most use cases

For educational platforms rendering mathematical formulas, **KaTeX** provides the optimal balance of performance and capability. Its **~347KB bundle** (including fonts) is processed entirely server-side, compared to MathJax's **~5MB full bundle**. KaTeX renders synchronously and produces smaller output HTML.

The setup uses remark-math to parse `$inline$` and `$$block$$` LaTeX syntax, then rehype-katex to convert the math AST nodes to HTML:

```tsx
// Include KaTeX CSS in your layout
import 'katex/dist/katex.min.css'

// Or via CDN in layout.tsx
<link 
  href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" 
  rel="stylesheet" 
/>
```

KaTeX supports approximately **300 LaTeX functions**—sufficient for undergraduate mathematics, physics, and statistics. For graduate-level content requiring obscure LaTeX packages or enhanced accessibility (speech output, braille), MathJax remains necessary. MathJax 3's accessibility extensions provide ARIA labels and explorable equations that KaTeX cannot match.

---

## Security requires sanitization for user-generated content

When rendering user-generated Markdown, **rehype-sanitize** prevents XSS attacks by stripping dangerous HTML elements and attributes. The plugin order matters critically—sanitize first, then apply other transformations:

```typescript
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'

// Extended schema to preserve code highlighting and math classes
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [['className', /^language-./, 'math-inline', 'math-display']],
    span: [...(defaultSchema.attributes?.span || []), ['className', /^hljs-/]],
  },
}

// Plugin order: sanitize BEFORE other transformations
rehypePlugins: [
  [rehypeSanitize, sanitizeSchema],
  rehypeKatex,
  rehypePrettyCode,
]
```

The sanitizer automatically prefixes all `id` and `name` attributes with `user-content-` to prevent DOM clobbering attacks. For AI-generated content from trusted sources, sanitization adds unnecessary overhead and can be skipped.

---

## Performance optimization centers on server rendering

The architecture choice between SSR and CSR determines bundle size and initial render performance. For educational content that doesn't require real-time interactivity, **full server rendering eliminates JavaScript entirely** from the Markdown pipeline.

| Strategy | Client JS | Use When |
|----------|-----------|----------|
| Full RSC | 0KB | Static/cached content |
| Hybrid | Minimal | Interactive code blocks, diagrams |
| Full CSR | 50-200KB+ | User-generated, real-time editing |

**Caching rendered Markdown** at the React level using the `cache` function prevents redundant processing:

```tsx
import { cache } from 'react'
import { compileMDX } from 'next-mdx-remote/rsc'

export const getLesson = cache(async (slug: string) => {
  const source = await fetchLessonContent(slug)
  return compileMDX({
    source,
    options: { mdxOptions: { remarkPlugins, rehypePlugins } },
    components: customComponents,
  })
})
```

For heavy components like Mermaid diagrams, use **dynamic imports with `ssr: false`** to keep them client-side while the rest renders on the server:

```tsx
const Mermaid = dynamic(() => import('./Mermaid'), {
  ssr: false,
  loading: () => <div className="animate-pulse h-48 bg-gray-100 rounded" />,
})
```

---

## Accessibility checklist for educational Markdown

Educational content must be accessible to all learners. Beyond semantic HTML, specific considerations apply to Markdown-rendered content:

- **Heading hierarchy**: Never skip levels (h1→h2→h3). Use rehype-slug for linkable IDs
- **Images**: Require meaningful alt text describing content, not just "diagram"
- **Tables**: Ensure proper `<thead>` and `<th>` elements with `scope` attributes
- **Code blocks**: Add language labels, make copy buttons keyboard-accessible (`tabIndex={0}`)
- **Math**: KaTeX generates hidden MathML for screen readers; test with VoiceOver/NVDA
- **Callouts**: Use `role="alert"` for warnings, `role="note"` for informational content
- **Links**: Descriptive text, external link indicators (↗), visible focus states
- **Color**: Never rely on color alone—use icons, patterns, or text labels

```tsx
// Accessible code block wrapper
<div role="group" aria-label={`${language} code example`}>
  <button 
    onClick={handleCopy}
    className="focus:ring-2 focus:ring-blue-500 focus:outline-none"
    aria-label="Copy code to clipboard"
  >
    Copy
  </button>
  <pre tabIndex={0}>
    <code>{children}</code>
  </pre>
</div>
```

---

## Conclusion: A production-ready implementation path

The modern Markdown rendering stack for Next.js 15+ educational platforms has matured significantly. **Server-side rendering with Shiki eliminates the traditional performance penalty** of rich syntax highlighting. The unified/remark/rehype plugin ecosystem provides modular, composable processing for any content type—from LaTeX equations to Mermaid diagrams.

The critical insight is that React Server Components changed the calculus entirely. What previously required **200KB+ of client JavaScript** now happens at build time or on the server, producing static HTML that renders instantly. For educational platforms where content quality and accessibility matter more than real-time editing, this architecture delivers premium results with minimal complexity.

Start with the recommended configuration (next-mdx-remote + rehype-pretty-code + remark-gfm + remark-math + rehype-katex), add the @tailwindcss/typography plugin for baseline styling, then progressively enhance with custom components for callouts, responsive tables, and interactive elements as needed.