# Technical Requirements: Modern Markdown Rendering System

> **Status:** Draft
> **Created:** 2025-12-09
> **Complexity:** Medium (можно реализовать без полной спецификации)

## 1. Executive Summary

### 1.1 Цель

Создать унифицированную систему рендеринга Markdown/MDX для образовательной платформы MegaCampusAI с поддержкой:
- Математических формул (LaTeX/KaTeX)
- Диаграмм (Mermaid)
- Подсветки кода (Shiki, VS Code качество)
- Кастомных компонентов (Callouts, интерактивные элементы)

### 1.2 Текущие проблемы

1. **Дублирование:** 4+ компонента рендерят Markdown с разными стилями:
   - `lesson-content.tsx` — полный кастом (398 строк custom components)
   - `ContentPreviewPanel.tsx` — prose + 20 модификаторов inline
   - `LessonContentView.tsx` — prose-sm + arbitrary selectors
   - `RefinementChat.tsx` — минимальный набор компонентов

2. **Устаревший стек:** rehype-highlight отправляет ~50KB JS на клиент

3. **Несогласованные стили:**
   - Таблицы: 3 разных подхода (gradient headers, plain prose, compact)
   - Code blocks: разные цвета фона (purple vs slate vs gray)
   - Headings: разные размеры и spacing

4. **Отсутствует функционал:**
   - Нет математических формул (LaTeX/KaTeX)
   - Нет диаграмм (Mermaid)
   - Нет copy button для кода
   - Нет anchor links для headings

5. **Hardcoded patterns в других местах:**
   - `trace-viewer.tsx` — свой CodeBlock компонент
   - `JsonViewer.tsx` — своя подсветка синтаксиса (оставить, это JSON)
   - `about/page.tsx` — prose без кастомизации

### 1.3 Результат

- Единый `<MarkdownRenderer>` компонент с пресетами
- 0KB клиентского JS для подсветки кода (Shiki SSR)
- Полная поддержка математики и диаграмм
- Premium визуальное качество (уровень Notion/Stripe docs)

---

## 2. Technology Stack

### 2.1 Core Dependencies

```json
{
  "dependencies": {
    "next-mdx-remote": "^5.0.0",
    "react-markdown": "^10.1.0",
    "shiki": "^1.24.0",
    "rehype-pretty-code": "^0.14.0",
    "remark-gfm": "^4.0.1",
    "remark-math": "^6.0.0",
    "remark-emoji": "^5.0.2",
    "rehype-katex": "^7.0.1",
    "rehype-slug": "^6.0.0",
    "rehype-autolink-headings": "^7.1.0",
    "rehype-sanitize": "^6.0.0",
    "mermaid": "^11.4.0",
    "@tailwindcss/typography": "^0.5.19"
  },
  "devDependencies": {
    "katex": "^0.16.11"
  }
}
```

**Примечание:** Используем ДВА рендерера:
- `next-mdx-remote` — для статического контента (RSC)
- `react-markdown` — для streaming AI контента (Client)

### 2.2 Удаляемые зависимости

```json
{
  "remove": {
    "rehype-highlight": "заменяется на rehype-pretty-code"
  }
}
```

### 2.3 Сохраняемые зависимости

```json
{
  "keep": {
    "remark-emoji": "используется в проекте",
    "rehype-sanitize": "для UGC",
    "isomorphic-dompurify": "клиентская санитизация"
  }
}
```

### 2.4 Plugin Configuration Order

```typescript
// ВАЖНО: Порядок плагинов критичен!

// Remark plugins (markdown AST)
const remarkPlugins = [
  remarkGfm,           // GitHub Flavored Markdown (tables, strikethrough)
  remarkMath,          // Parse $...$ and $$...$$
  remarkEmoji,         // Emoji shortcodes (:smile: → 😄)
];

// Rehype plugins for TRUSTED content (AI-generated lessons)
const rehypePluginsTrusted = [
  rehypeSlug,          // Add IDs to headings
  [rehypeAutolinkHeadings, { behavior: 'wrap' }], // Anchor links
  [rehypeKatex, { output: 'htmlAndMathml' }],     // Math with accessibility
  [rehypePrettyCode, {
    theme: {
      light: 'github-light',
      dark: 'github-dark'
    },
    keepBackground: false,
    defaultLang: 'plaintext',
  }],
];

// Rehype plugins for UNTRUSTED content (user comments)
// ВАЖНО: rehype-sanitize ДОЛЖЕН быть ПЕРВЫМ!
const rehypePluginsUntrusted = [
  [rehypeSanitize, sanitizeSchema],  // MUST BE FIRST for security
  rehypeSlug,
  [rehypeKatex, { output: 'htmlAndMathml' }],
  // НЕ используем rehype-pretty-code для UGC (performance + security)
];
```

---

## 3. Component Architecture

### 3.1 File Structure

```
packages/web/components/markdown/
├── MarkdownRenderer.tsx          # Main component (RSC)
├── MarkdownRendererClient.tsx    # For streaming content (client)
├── presets.ts                    # Configuration presets
├── types.ts                      # TypeScript types
├── components/
│   ├── CodeBlock.tsx             # Code with copy button (client)
│   ├── Callout.tsx               # Note/Warning/Tip blocks
│   ├── ResponsiveTable.tsx       # Scrollable tables
│   ├── MermaidDiagram.tsx        # Lazy-loaded diagrams (client)
│   ├── Heading.tsx               # H1-H6 with anchor links
│   ├── Link.tsx                  # Smart links (internal/external)
│   └── index.ts                  # Re-exports
├── styles/
│   └── katex-overrides.css       # KaTeX dark mode fixes
└── __tests__/
    └── MarkdownRenderer.test.tsx
```

### 3.2 Main Component API

```typescript
// MarkdownRenderer.tsx
interface MarkdownRendererProps {
  /** Markdown/MDX content string */
  content: string;

  /** Preset configuration */
  preset?: 'lesson' | 'chat' | 'preview' | 'minimal';

  /** Additional MDX components */
  components?: Record<string, React.ComponentType>;

  /** Custom className for wrapper */
  className?: string;

  /** Enable/disable specific features (override preset) */
  features?: {
    math?: boolean;
    mermaid?: boolean;
    codeHighlight?: boolean;
    copyButton?: boolean;
    anchorLinks?: boolean;
  };
}

// Usage examples:
<MarkdownRenderer content={lessonContent} preset="lesson" />
<MarkdownRenderer content={chatMessage} preset="chat" />
<MarkdownRenderer content={preview} preset="preview" features={{ mermaid: false }} />
```

### 3.3 Presets Definition

```typescript
// presets.ts
export const presets = {
  lesson: {
    math: true,
    mermaid: true,
    codeHighlight: true,
    copyButton: true,
    anchorLinks: true,
    callouts: true,
    responsiveTables: true,
  },

  chat: {
    math: false,
    mermaid: false,
    codeHighlight: true,
    copyButton: false,
    anchorLinks: false,
    callouts: false,
    responsiveTables: false,
  },

  preview: {
    math: true,
    mermaid: false,  // Too heavy for preview
    codeHighlight: true,
    copyButton: true,
    anchorLinks: false,
    callouts: true,
    responsiveTables: true,
  },

  minimal: {
    math: false,
    mermaid: false,
    codeHighlight: false,
    copyButton: false,
    anchorLinks: false,
    callouts: false,
    responsiveTables: false,
  },
};
```

---

## 4. Sub-Components Specification

### 4.1 CodeBlock Component

```typescript
// components/CodeBlock.tsx
'use client';

interface CodeBlockProps {
  children: React.ReactNode;
  language?: string;
  filename?: string;
  showLineNumbers?: boolean;
  highlightLines?: number[];  // e.g., [1, 3, 5]
}

// Features:
// - Copy to clipboard button (top-right)
// - Language badge
// - Optional filename header
// - Line numbers (CSS counters)
// - Line highlighting (background color)
// - Keyboard accessible (tabIndex, focus styles)
```

**Visual Reference:**
```
┌─ example.ts ──────────────────────────── [Copy] ─┐
│  1 │ function greet(name: string) {              │
│  2 │   return `Hello, ${name}!`;  ← highlighted  │
│  3 │ }                                           │
└──────────────────────────────────────────────────┘
```

### 4.2 Callout Component

```typescript
// components/Callout.tsx
interface CalloutProps {
  type: 'note' | 'tip' | 'warning' | 'danger' | 'info';
  title?: string;
  children: React.ReactNode;
}

// Syntax in Markdown (GitHub-style):
// > [!NOTE]
// > This is a note callout
//
// > [!WARNING]
// > This is a warning
```

**Visual Styles:**
| Type | Border Color | Background | Icon |
|------|--------------|------------|------|
| note | blue-400 | blue-50/blue-950 | ℹ️ |
| tip | green-400 | green-50/green-950 | 💡 |
| warning | amber-400 | amber-50/amber-950 | ⚠️ |
| danger | red-400 | red-50/red-950 | 🚫 |
| info | purple-400 | purple-50/purple-950 | 📌 |

### 4.3 MermaidDiagram Component

```typescript
// components/MermaidDiagram.tsx
'use client';

interface MermaidDiagramProps {
  chart: string;  // Mermaid syntax
  className?: string;
}

// Implementation:
// - Lazy load mermaid library via next/dynamic
// - Show skeleton loader while loading
// - Support dark mode (mermaid theme)
// - Error boundary for invalid diagrams
// - Accessible: aria-label with description
```

**Loading Strategy:**
```typescript
const Mermaid = dynamic(() => import('./MermaidCore'), {
  ssr: false,
  loading: () => (
    <div className="animate-pulse bg-gray-100 dark:bg-gray-800
                    rounded-lg h-48 flex items-center justify-center">
      <span className="text-gray-400">Loading diagram...</span>
    </div>
  ),
});
```

### 4.4 ResponsiveTable Component

```typescript
// components/ResponsiveTable.tsx
interface ResponsiveTableProps {
  children: React.ReactNode;
}

// Features:
// - Horizontal scroll on overflow
// - Sticky header (optional)
// - Striped rows
// - Hover highlight
// - Border styling consistent with design system
```

### 4.5 Heading Component

```typescript
// components/Heading.tsx
interface HeadingProps {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  id?: string;
  children: React.ReactNode;
  showAnchor?: boolean;
}

// Features:
// - Auto-generated ID from text (via rehype-slug)
// - Anchor link icon on hover (# symbol)
// - Copy link to clipboard on click
// - Proper heading hierarchy
```

---

## 5. Styling Specification

### 5.1 Tailwind Typography Customization

```typescript
// tailwind.config.ts
typography: {
  DEFAULT: {
    css: {
      '--tw-prose-body': 'var(--foreground)',
      '--tw-prose-headings': 'var(--foreground)',
      '--tw-prose-links': 'var(--primary)',
      '--tw-prose-code': 'var(--foreground)',

      // Headings
      h1: { fontWeight: '700', letterSpacing: '-0.025em' },
      h2: { fontWeight: '600', letterSpacing: '-0.02em',
            borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' },
      h3: { fontWeight: '600' },

      // Code (inline)
      'code::before': { content: '""' },
      'code::after': { content: '""' },
      code: {
        backgroundColor: 'var(--muted)',
        padding: '0.2em 0.4em',
        borderRadius: '0.25rem',
        fontSize: '0.875em',
      },

      // Links
      a: {
        textDecoration: 'none',
        '&:hover': { textDecoration: 'underline' },
      },

      // Tables
      table: { fontSize: '0.875rem' },
      'thead th': {
        fontWeight: '600',
        backgroundColor: 'var(--muted)',
      },
    },
  },
},
```

### 5.2 Code Block Themes

```typescript
// Shiki theme configuration
const codeTheme = {
  light: 'github-light',
  dark: 'github-dark',
};

// CSS variables for code blocks
:root {
  --code-bg: #f6f8fa;
  --code-line-highlight: rgba(255, 255, 0, 0.1);
}

.dark {
  --code-bg: #161b22;
  --code-line-highlight: rgba(255, 255, 0, 0.05);
}
```

### 5.3 KaTeX Dark Mode

```css
/* styles/katex-overrides.css */
.dark .katex {
  color: var(--foreground);
}

.dark .katex .mord,
.dark .katex .mbin,
.dark .katex .mrel {
  color: inherit;
}
```

---

## 6. Migration Plan

### 6.1 Files to Migrate

#### Primary Markdown Rendering (react-markdown usage)

| Current File | Action | Target Preset | Notes |
|--------------|--------|---------------|-------|
| `components/common/lesson-content.tsx` | Replace with MarkdownRenderer | `lesson` | Full feature set, student-facing |
| `components/generation-graph/panels/output/LessonContentView.tsx` | Replace with MarkdownRenderer | `preview` | Compact preview |
| `components/generation-graph/panels/lesson/ContentPreviewPanel.tsx` | Replace with MarkdownRenderer | `preview` | Content approval UI |
| `components/generation-graph/panels/RefinementChat.tsx` | Replace with MarkdownRendererClient | `chat` | Streaming AI content |

#### Related Styling to Unify

| File | Current Pattern | Action |
|------|-----------------|--------|
| `components/course/course-viewer-enhanced.tsx` | Wraps LessonContent with `prose prose-lg prose-purple` | Remove wrapper, MarkdownRenderer handles styling |
| `app/about/page.tsx` | `prose prose-invert` | Review - may need MarkdownRenderer if content is dynamic |
| `components/generation-graph/panels/shared/JsonViewer.tsx` | Custom syntax highlighting | Keep separate (JSON, not Markdown) |
| `components/generation-graph/components/trace-viewer.tsx` | `CodeBlock` component | Extract and reuse in MarkdownRenderer's CodeBlock |

#### Patterns to Consolidate

**Prose class variations found:**
1. `prose prose-slate dark:prose-invert max-w-none prose-lg` + 20+ modifiers (ContentPreviewPanel)
2. `prose prose-sm dark:prose-invert max-w-none` + arbitrary selectors (LessonContentView)
3. `prose prose-lg dark:prose-invert max-w-none prose-purple` (course-viewer-enhanced)
4. `prose prose-invert` (about page)

**All should use unified MarkdownRenderer with preset configurations.**

#### Files Summary (Total: 6 files to modify)

```
Primary (react-markdown):
├── lesson-content.tsx           → MarkdownRenderer (lesson)
├── ContentPreviewPanel.tsx      → MarkdownRenderer (preview)
├── LessonContentView.tsx        → MarkdownRenderer (preview)
└── RefinementChat.tsx           → MarkdownRendererClient (chat)

Wrappers to clean:
├── course-viewer-enhanced.tsx   → Remove prose wrapper
└── about/page.tsx               → Review/update

Keep separate:
├── JsonViewer.tsx               → JSON syntax (not markdown)
└── trace-viewer.tsx             → Extract CodeBlock for reuse
```

### 6.2 Migration Steps

1. Create new `components/markdown/` directory structure
2. Implement MarkdownRenderer with MDX support
3. Implement all sub-components
4. Add KaTeX CSS to layout
5. Update existing components one by one
6. Remove old dependencies (rehype-highlight)
7. Update tests
8. Visual QA

---

## 7. Streaming Content Support

### 7.1 Проблема

`next-mdx-remote` НЕ поддерживает streaming — он требует полного контента для компиляции. Для AI-генерируемого контента в реальном времени (RefinementChat) нужен другой подход.

### 7.2 Решение: Два рендерера

| Рендерер | Тип | Используется для |
|----------|-----|------------------|
| `MarkdownRenderer.tsx` | RSC (Server) | Уроки, preview, статический контент |
| `MarkdownRendererClient.tsx` | Client | Streaming AI, чат, real-time preview |

### 7.3 MarkdownRendererClient Implementation

```typescript
// MarkdownRendererClient.tsx
'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useMemo, memo } from 'react';

interface Props {
  content: string;
  preset?: 'chat' | 'minimal';
}

// Мемоизация для предотвращения re-render при каждом новом токене
export const MarkdownRendererClient = memo(function MarkdownRendererClient({
  content,
  preset = 'chat'
}: Props) {
  const plugins = useMemo(() => ({
    remarkPlugins: [remarkGfm],
    // Минимальный набор для streaming performance
  }), []);

  return (
    <ReactMarkdown {...plugins} components={chatComponents}>
      {content}
    </ReactMarkdown>
  );
});
```

### 7.4 Streaming Considerations

- **Incomplete markdown:** AI может отправить незакрытый блок кода, таблицу без конца
- **Мемоизация:** Каждый новый токен вызывает re-render — нужна оптимизация
- **Graceful degradation:** Показывать контент даже при ошибках парсинга

**Альтернатива:** Библиотека `streamdown` от Vercel специально оптимизирована для streaming markdown. Рассмотреть если react-markdown недостаточно.

---

## 8. Caching Strategy

### 8.1 React cache() для MDX compilation

```typescript
import { cache } from 'react';
import { compileMDX } from 'next-mdx-remote/rsc';

// Кэширование на уровне request (React)
export const getCompiledMDX = cache(async (
  content: string,
  preset: PresetName
) => {
  const config = getPresetConfig(preset);

  return compileMDX({
    source: content,
    options: {
      mdxOptions: {
        remarkPlugins: config.remarkPlugins,
        rehypePlugins: config.rehypePlugins,
      },
    },
    components: config.components,
  });
});
```

### 8.2 Next.js Data Cache для DB content

```typescript
import { unstable_cache } from 'next/cache';

export const getCachedLesson = unstable_cache(
  async (lessonId: string) => {
    const lesson = await db.lessons.findUnique({ where: { id: lessonId } });
    return lesson?.content;
  },
  ['lesson-content'],
  {
    revalidate: 3600,  // 1 hour
    tags: ['lessons']  // For manual invalidation
  }
);

// Инвалидация при обновлении урока
export async function updateLesson(id: string, content: string) {
  await db.lessons.update({ where: { id }, data: { content } });
  revalidateTag('lessons');
}
```

### 8.3 Performance Optimization

- **Pre-render popular lessons:** Static generation для топ-100 уроков
- **Edge caching:** Vercel Edge Cache для скомпилированного HTML
- **Bundle analysis:** Регулярная проверка через `@next/bundle-analyzer`

---

## 9. Security Considerations

### 9.1 Trusted vs Untrusted Content

| Source | Trust Level | Sanitization |
|--------|-------------|--------------|
| AI-generated lessons | Trusted | None (performance) |
| User comments | Untrusted | rehype-sanitize strict |
| CMS content | Trusted | None |

### 9.2 Sanitization Schema (for untrusted content)

```typescript
const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...defaultSchema.tagNames,
    'math', 'semantics', 'mrow', 'mi', 'mo', 'mn', // KaTeX MathML
  ],
  attributes: {
    ...defaultSchema.attributes,
    code: ['className'],  // For language-* classes
    span: ['className', 'style'], // For Shiki highlighting
  },
};
```

### 9.3 Content Security Policy (CSP)

Для дополнительной защиты настроить CSP headers в `next.config.js`:

```typescript
// next.config.js
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval'",  // Mermaid требует eval
      "style-src 'self' 'unsafe-inline'", // KaTeX inline styles
      "img-src 'self' data: blob:",       // Mermaid SVG
      "font-src 'self'",                  // KaTeX fonts
    ].join('; '),
  },
];
```

**Примечание:** Mermaid использует `eval()` для парсинга диаграмм, поэтому `unsafe-eval` необходим. Альтернатива — pre-render диаграммы на сервере.

---

## 10. Accessibility Requirements

### 10.1 Checklist

- [ ] All headings have proper hierarchy (no skipped levels)
- [ ] Code blocks have `tabIndex={0}` for keyboard focus
- [ ] Copy buttons have `aria-label`
- [ ] Callouts use `role="note"` or `role="alert"`
- [ ] Math formulas include MathML (KaTeX `output: 'htmlAndMathml'`)
- [ ] Mermaid diagrams have `aria-label` descriptions
- [ ] Links indicate external (target="_blank") with icon
- [ ] Color contrast meets WCAG AA (4.5:1 for text)

### 10.2 Keyboard Navigation

- Tab navigates between interactive elements
- Enter/Space activates copy button
- Escape closes any popups
- Focus visible on all interactive elements

### 10.3 Skip Links

Для длинного контента добавить "Skip to content" ссылки:

```tsx
// В layout или page компоненте
<a href="#main-content" className="sr-only focus:not-sr-only">
  Skip to main content
</a>

// В MarkdownRenderer
<article id="main-content" tabIndex={-1}>
  {renderedContent}
</article>
```

---

## 11. Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Client JS (code highlight) | 0 KB | Shiki SSR |
| Client JS (math) | 0 KB | KaTeX SSR + CSS only |
| Client JS (mermaid) | Lazy | Only when diagram visible |
| Client JS (copy button) | ~2 KB | Minimal client component |
| KaTeX CSS | ~120 KB | Single load, cached |
| LCP impact | < 100ms | No blocking resources |

---

## 12. Testing Requirements

### 12.1 Unit Tests

```typescript
// __tests__/MarkdownRenderer.test.tsx
describe('MarkdownRenderer', () => {
  it('renders basic markdown');
  it('renders code blocks with syntax highlighting');
  it('renders math formulas');
  it('renders tables responsively');
  it('renders callouts with correct styling');
  it('applies preset configurations');
  it('handles empty content');
  it('handles malformed markdown gracefully');
});
```

### 12.2 Visual Regression Tests

- Screenshot tests for each component variant
- Dark mode variants
- Mobile responsive views

### 12.3 Accessibility Tests

- axe-core automated testing
- Screen reader manual testing (VoiceOver, NVDA)

---

## 13. Implementation Tasks

### Phase 1: Foundation (Priority: High)

- [ ] **T1.1** Create `packages/web/components/markdown/` directory structure
- [ ] **T1.2** Install new dependencies (`next-mdx-remote`, `shiki`, etc.)
- [ ] **T1.3** Remove `rehype-highlight` dependency
- [ ] **T1.4** Create `types.ts` with all TypeScript interfaces
- [ ] **T1.5** Create `presets.ts` with configuration objects
- [ ] **T1.6** Implement base `MarkdownRenderer.tsx` with MDX support

### Phase 2: Sub-Components (Priority: High)

- [ ] **T2.1** Implement `CodeBlock.tsx` with copy button
- [ ] **T2.2** Implement `Callout.tsx` with all variants
- [ ] **T2.3** Implement `ResponsiveTable.tsx`
- [ ] **T2.4** Implement `Heading.tsx` with anchor links
- [ ] **T2.5** Implement `Link.tsx` with external link handling
- [ ] **T2.6** Create `components/index.ts` with re-exports

### Phase 3: Advanced Features (Priority: Medium)

- [ ] **T3.1** Implement `MermaidDiagram.tsx` with lazy loading
- [ ] **T3.2** Add KaTeX CSS to `app/layout.tsx`
- [ ] **T3.3** Create `katex-overrides.css` for dark mode
- [ ] **T3.4** Implement `MarkdownRendererClient.tsx` for streaming

### Phase 4: Styling (Priority: Medium)

- [ ] **T4.1** Update `tailwind.config.ts` typography customization
- [ ] **T4.2** Create Shiki theme configuration
- [ ] **T4.3** Test all components in light/dark mode
- [ ] **T4.4** Ensure mobile responsiveness

### Phase 5: Migration (Priority: High)

- [ ] **T5.1** Migrate `lesson-content.tsx` to use MarkdownRenderer (preset="lesson")
- [ ] **T5.2** Migrate `LessonContentView.tsx` (preset="preview")
- [ ] **T5.3** Migrate `ContentPreviewPanel.tsx` (preset="preview")
- [ ] **T5.4** Migrate `RefinementChat.tsx` to MarkdownRendererClient (preset="chat")
- [ ] **T5.5** Clean `course-viewer-enhanced.tsx` — remove prose wrapper around LessonContent
- [ ] **T5.6** Review `about/page.tsx` — use MarkdownRenderer if dynamic content
- [ ] **T5.7** Extract CodeBlock from `trace-viewer.tsx` → reuse shared component
- [ ] **T5.8** Remove all inline prose modifiers from migrated files
- [ ] **T5.9** Verify JsonViewer.tsx stays independent (JSON syntax, not Markdown)

### Phase 6: Quality Assurance (Priority: High)

- [ ] **T6.1** Write unit tests for MarkdownRenderer
- [ ] **T6.2** Write unit tests for sub-components
- [ ] **T6.3** Accessibility audit (axe-core)
- [ ] **T6.4** Visual QA across all pages
- [ ] **T6.5** Performance testing (bundle size, LCP)

### Phase 7: Documentation (Priority: Low)

- [ ] **T7.1** Add JSDoc comments to all components
- [ ] **T7.2** Create usage examples in Storybook (if applicable)
- [ ] **T7.3** Update project documentation

---

## 14. Acceptance Criteria

### Must Have

1. Single `<MarkdownRenderer>` component used across all markdown rendering
2. **Zero duplication:** All 4+ existing implementations replaced
3. **Consistent styling:** Same visual appearance for same content type
4. Code blocks rendered with Shiki (0 client JS)
5. Math formulas rendered with KaTeX
6. Mermaid diagrams supported (lazy loaded)
7. Callout components for notes/warnings
8. Copy button on code blocks
9. Dark mode support for all elements
10. Mobile responsive tables
11. All existing functionality preserved
12. Streaming support via MarkdownRendererClient

### Should Have

1. Anchor links on headings
2. Line highlighting in code blocks
3. Filename headers for code blocks
4. External link indicators

### Nice to Have

1. Diff highlighting in code blocks
2. Collapsible sections
3. Table of contents generation

---

## 15. Dependencies & Risks

### Dependencies

- Shiki requires Node.js runtime (works with Next.js App Router)
- KaTeX CSS must be loaded globally
- Mermaid requires client-side JavaScript

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Shiki SSR performance | Low | Medium | Use caching, pre-render |
| Mermaid bundle size | Medium | Medium | Lazy loading |
| Breaking existing content | Low | High | Thorough testing |
| KaTeX font loading | Low | Low | Preload fonts |

---

## 16. Estimated Effort

| Phase | Estimated Time | Complexity |
|-------|----------------|------------|
| Phase 1: Foundation | 4-6 hours | Medium |
| Phase 2: Sub-Components | 6-8 hours | Medium |
| Phase 3: Advanced Features | 4-6 hours | High |
| Phase 4: Styling | 2-4 hours | Low |
| Phase 5: Migration | 4-6 hours | Medium |
| Phase 6: QA | 4-6 hours | Medium |
| Phase 7: Documentation | 2-3 hours | Low |
| **Total** | **26-39 hours** | **Medium** |

---

## 17. Out of Scope

### Backend Markdown Utilities

Следующие backend модули **НЕ затрагиваются** этим ТЗ и остаются без изменений:

| Модуль | Назначение | Причина |
|--------|-----------|---------|
| `markdown-parser.ts` | Парсинг LLM output в структурированные TypeScript объекты | Backend логика, не связана с rendering |
| `markdown-converter.ts` | Конвертация Docling JSON → Markdown для RAG | Document processing pipeline |
| `markdown-chunker.ts` | Token-aware chunking для векторного поиска | RAG embedding pipeline |
| `xss-sanitizer.ts` | Server-side DOMPurify санитизация | Остается для backend validation |
| `sanitize-llm-output.ts` | Санитизация LLM текста перед сохранением в БД | Backend security layer |

Эти модули работают на сервере и не связаны с визуальным рендерингом Markdown в браузере.

---

## 18. Typography Best Practices

### 18.1 Recommended Values (из исследований)

| Property | Value | Rationale |
|----------|-------|-----------|
| Body font size | 16-18px | WCAG minimum 16px |
| Line height | 1.5-1.625 | WCAG recommends 1.5× minimum |
| Line length | 65-75 characters | `max-width: 65ch` |
| Paragraph spacing | 1.25-1.5em | Visual breathing room |
| Heading letter-spacing | -0.025em | Tighter for display text |

### 18.2 Font Stack

Текущий шрифт проекта сохраняется. Если нужна смена:
- **Рекомендация из исследований:** Inter (используется в Notion, Linear)
- **Альтернативы:** System UI stack, Geist (Vercel)

### 18.3 CSS Implementation

```css
/* В Tailwind config или global CSS */
.prose {
  --tw-prose-body: hsl(var(--foreground));
  font-size: 1rem;        /* 16px base */
  line-height: 1.625;     /* Optimal readability */
  max-width: 65ch;        /* Comfortable line length */
}

.prose p + p {
  margin-top: 1.25em;     /* Paragraph spacing */
}

.prose h1, .prose h2 {
  letter-spacing: -0.025em;
}
```

---

## 19. Decision: Specification vs Direct Implementation

**Recommendation: Direct Implementation без полной спецификации**

**Причины:**
1. Scope ограничен одной подсистемой (markdown rendering)
2. Все библиотеки стандартные и хорошо документированы
3. Patterns уже описаны в исследованиях
4. Нет сложных бизнес-требований
5. Техническое задание достаточно детальное для реализации

**Следующий шаг:** Создать tasks.md и приступить к реализации.
