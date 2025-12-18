# Implementation Plan: Unified Markdown Rendering System

**Branch**: `feature/markdown-renderer` | **Date**: 2025-12-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/017-markdown-renderer/spec.md`

## Summary

Create a unified `<MarkdownRenderer>` component system for MegaCampusAI educational platform that consolidates 4+ existing markdown rendering implementations into a single, consistent solution. The system uses a dual-renderer architecture: Server-side RSC with Shiki for static content (0 KB client JS for syntax highlighting) and Streamdown for streaming AI content. Key features include LaTeX/KaTeX math rendering, Mermaid diagrams in sandboxed iframes, and WCAG-compliant typography.

## Technical Context

**Language/Version**: TypeScript 5.9+ (strict mode)
**Primary Dependencies**:
- `next-mdx-remote@5.x` - RSC MDX compilation
- `streamdown@latest` - Streaming markdown (Vercel)
- `shiki@1.24+` - SSR syntax highlighting
- `rehype-pretty-code@0.14+` - Shiki integration for rehype
- `remark-gfm@4.x`, `remark-math@6.x`, `remark-emoji@5.x` - Remark plugins
- `rehype-katex@7.x`, `rehype-slug@6.x`, `rehype-autolink-headings@7.x` - Rehype plugins
- `mermaid@11.4+` - Diagram rendering (sandboxed iframe)
- `katex@0.16+` - Math formula CSS

**Storage**: N/A (presentation layer only)
**Testing**: Vitest (unit), Playwright (visual regression, accessibility)
**Target Platform**: Next.js 15.5+ App Router (RSC), Web browsers (Chrome, Firefox, Safari, Edge)
**Project Type**: Monorepo package (`packages/web`)

**Performance Goals**:
- 0 KB client JS for syntax highlighting (Shiki SSR)
- ~5-10 KB client JS for streaming renderer (Streamdown)
- Mermaid lazy-loaded only when diagram visible
- LCP impact < 100ms

**Constraints**:
- CSP must NOT include `unsafe-eval` in main app (Mermaid isolated in iframe)
- Must preserve all existing content rendering functionality
- WCAG AA compliance required

**Scale/Scope**:
- 4 existing components to migrate
- 10 user stories to satisfy
- 27 functional requirements

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Context-First Architecture | ✅ PASS | Existing components analyzed, patterns documented in requirements.md |
| II. Single Source of Truth | ✅ PASS | Single MarkdownRenderer with presets replaces 4+ duplicated implementations |
| III. Strict Type Safety | ✅ PASS | TypeScript strict mode, explicit interfaces for all props |
| IV. Atomic Evolution | ✅ PASS | Tasks will be broken into small, verifiable units with `/push patch` after each |
| V. Quality Gates & Security | ✅ PASS | rehype-sanitize for UGC, Mermaid sandboxed iframe, CSP maintained |
| VI. Library-First Development | ✅ PASS | Using established libraries: Shiki, Streamdown, KaTeX, Mermaid |
| VII. Task Tracking & Artifacts | ✅ PASS | Tasks.md will track all deliverables with artifact paths |

**Re-check after Phase 1**: Verified - no new violations introduced by design decisions.

## Project Structure

### Documentation (this feature)

```text
specs/017-markdown-renderer/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── component-api.md # Component props specification
├── checklists/
│   └── requirements.md  # Requirements checklist
└── spec.md              # Feature specification
```

### Source Code (repository root)

```text
packages/web/
├── components/
│   └── markdown/                    # NEW: Unified markdown system
│       ├── MarkdownRenderer.tsx     # RSC main component
│       ├── MarkdownRendererClient.tsx  # Client streaming component
│       ├── presets.ts               # Preset configurations
│       ├── types.ts                 # TypeScript interfaces
│       ├── components/
│       │   ├── CodeBlock.tsx        # Code with copy button (client)
│       │   ├── Callout.tsx          # Note/Warning/Tip blocks
│       │   ├── ResponsiveTable.tsx  # Scrollable tables
│       │   ├── MermaidDiagram.tsx   # Lazy-loaded diagrams (client)
│       │   ├── MermaidIframe.tsx    # Sandboxed iframe for Mermaid
│       │   ├── Heading.tsx          # H1-H6 with anchor links
│       │   ├── Link.tsx             # Smart links (internal/external)
│       │   └── index.ts             # Re-exports
│       ├── styles/
│       │   └── katex-overrides.css  # KaTeX dark mode fixes
│       └── __tests__/
│           ├── MarkdownRenderer.test.tsx
│           └── components/
│               └── *.test.tsx
├── components/common/
│   └── lesson-content.tsx           # MIGRATE: Replace internals
├── components/generation-graph/
│   └── panels/
│       ├── output/LessonContentView.tsx    # MIGRATE
│       ├── lesson/ContentPreviewPanel.tsx  # MIGRATE
│       └── RefinementChat.tsx              # MIGRATE to streaming
└── app/
    └── layout.tsx                   # ADD: KaTeX CSS import
```

**Structure Decision**: Monorepo web package structure. New `components/markdown/` directory for unified system with clear separation of concerns (main renderers, sub-components, styles, tests).

## Complexity Tracking

> No constitution violations requiring justification.

| Decision | Rationale | Simpler Alternative Rejected |
|----------|-----------|------------------------------|
| Dual renderer (RSC + Client) | Spec requirement FR-027: SSR for static, Streamdown for streaming | Single renderer cannot handle both SSR and streaming optimally |
| Sandboxed iframe for Mermaid | Spec requirement FR-028: Avoid unsafe-eval in main CSP | Direct Mermaid requires unsafe-eval, violates security requirement |
| Presets system | DRY principle: 4 contexts need different feature sets | Per-component configuration would duplicate logic |

## Security: Sanitization Schema

For untrusted content (user-generated), use `rehype-sanitize` with extended schema to preserve KaTeX MathML and Shiki highlighting:

```typescript
import { defaultSchema } from 'rehype-sanitize';

export const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    'math', 'semantics', 'mrow', 'mi', 'mo', 'mn', // KaTeX MathML
  ],
  attributes: {
    ...defaultSchema.attributes,
    code: ['className'],  // For language-* classes
    span: ['className', 'style'], // For Shiki highlighting
  },
};
```

**Note**: Trusted content (AI-generated lessons) skips sanitization for performance per FR-026.
