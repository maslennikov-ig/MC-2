# Plan: Server-Side Markdown Rendering for Generation Graph

**Date**: 2025-12-11
**Updated**: 2025-12-12
**Status**: Abandoned (see "Important Update" section at bottom)
**Related**: [tasks.md](./tasks.md), [plan.md](./plan.md)

## Problem Statement

Currently, lesson previews in the generation workflow use `MarkdownRendererClient` with `preset="chat"`, which provides **limited rendering**:

| Feature | Student View (lesson page) | Admin Preview (workflow) |
|---------|---------------------------|-------------------------|
| Syntax Highlighting | Shiki (full) | Streamdown (basic) |
| Math (KaTeX) | Yes | No |
| Mermaid Diagrams | Yes | No |
| Callouts | Yes | No |
| Anchor Links | Yes | No |

**Impact**: Admins cannot see how lessons will actually look to students.

## Current Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CURRENT DATA FLOW                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Supabase (lesson_contents, generation_trace)                       │
│       ↓                                                              │
│  useLessonInspectorData() [Client Hook]                             │
│       ↓ rawMarkdown: string                                          │
│  NodeDetailsDrawer → LessonInspector → ContentPreviewPanel          │
│       ↓                                                              │
│  MarkdownRendererClient(rawMarkdown, preset="chat")                 │
│       ↓                                                              │
│  Streamdown (limited features)                                       │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Challenge**:
- Data is fetched **client-side** for realtime updates
- `MarkdownRenderer` (full features) is a **Server Component**
- Server Components cannot be used with dynamic client-side data

## Proposed Solution: Server Action for Markdown Rendering

Use a **Server Action** to render markdown on the server while keeping client-side data fetching:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    PROPOSED DATA FLOW                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Supabase (lesson_contents, generation_trace)                       │
│       ↓                                                              │
│  useLessonInspectorData() [Client Hook] - unchanged                 │
│       ↓ rawMarkdown: string                                          │
│  ContentPreviewPanel                                                 │
│       ↓                                                              │
│  renderMarkdownAction(rawMarkdown, preset)  [Server Action]         │
│       ↓ (server-side)                                                │
│  MarkdownRenderer(content, preset="lesson")                         │
│       ↓                                                              │
│  Returns: HTML string (fully rendered)                              │
│       ↓                                                              │
│  <div dangerouslySetInnerHTML={{ __html: renderedHtml }} />         │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Benefits

| Aspect | Before | After |
|--------|--------|-------|
| Rendering Fidelity | 60% | 100% |
| Single Source of Truth | No (2 renderers) | Yes (1 renderer) |
| Bundle Size | Streamdown on client | Only HTML hydration |
| Realtime Updates | Yes | Yes (preserved) |
| Code Maintenance | 2 paths | 1 path |

## Implementation Tasks

### Phase 1: Create Server Action [EXECUTOR: fullstack-nextjs-specialist]

**Task 1.1**: Create `renderMarkdownAction` Server Action

```typescript
// packages/web/app/actions/render-markdown.ts
'use server';

import { renderToStaticMarkup } from 'react-dom/server';
import { MarkdownRenderer } from '@/components/markdown';

export async function renderMarkdownAction(
  content: string,
  preset: 'lesson' | 'preview' = 'lesson'
): Promise<{ html: string } | { error: string }> {
  try {
    if (!content || content.trim() === '') {
      return { html: '' };
    }

    // Render using the full-featured MarkdownRenderer
    const element = await MarkdownRenderer({ content, preset });

    if (!element) {
      return { html: '' };
    }

    // Convert React element to static HTML
    const html = renderToStaticMarkup(element);

    return { html };
  } catch (error) {
    console.error('Markdown rendering error:', error);
    return { error: 'Failed to render markdown' };
  }
}
```

**Files**:
- Create: `packages/web/app/actions/render-markdown.ts`

**Acceptance Criteria**:
- Server Action accepts markdown string and preset
- Returns rendered HTML or error
- Handles empty content gracefully
- Works with all MarkdownRenderer features (math, mermaid, callouts)

---

### Phase 2: Create Client Hook [EXECUTOR: fullstack-nextjs-specialist]

**Task 2.1**: Create `useServerRenderedMarkdown` hook

```typescript
// packages/web/components/markdown/hooks/useServerRenderedMarkdown.ts
'use client';

import { useState, useEffect, useTransition } from 'react';
import { renderMarkdownAction } from '@/app/actions/render-markdown';

interface UseServerRenderedMarkdownOptions {
  content: string | null;
  preset?: 'lesson' | 'preview';
  enabled?: boolean;
}

interface UseServerRenderedMarkdownResult {
  html: string | null;
  isLoading: boolean;
  error: string | null;
}

export function useServerRenderedMarkdown({
  content,
  preset = 'lesson',
  enabled = true,
}: UseServerRenderedMarkdownOptions): UseServerRenderedMarkdownResult {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!enabled || !content) {
      setHtml(null);
      setError(null);
      return;
    }

    startTransition(async () => {
      const result = await renderMarkdownAction(content, preset);

      if ('error' in result) {
        setError(result.error);
        setHtml(null);
      } else {
        setHtml(result.html);
        setError(null);
      }
    });
  }, [content, preset, enabled]);

  return {
    html,
    isLoading: isPending,
    error,
  };
}
```

**Files**:
- Create: `packages/web/components/markdown/hooks/useServerRenderedMarkdown.ts`
- Update: `packages/web/components/markdown/index.ts` (add export)

**Acceptance Criteria**:
- Hook calls Server Action when content changes
- Shows loading state during rendering
- Handles errors gracefully
- Debounces rapid updates (via useTransition)

---

### Phase 3: Create Server-Rendered Preview Component [EXECUTOR: fullstack-nextjs-specialist]

**Task 3.1**: Create `ServerRenderedMarkdown` component

```typescript
// packages/web/components/markdown/ServerRenderedMarkdown.tsx
'use client';

import * as React from 'react';
import { useServerRenderedMarkdown } from './hooks/useServerRenderedMarkdown';
import { cn } from '@/lib/utils';

interface ServerRenderedMarkdownProps {
  content: string | null;
  preset?: 'lesson' | 'preview';
  className?: string;
  loadingFallback?: React.ReactNode;
  errorFallback?: React.ReactNode;
}

export function ServerRenderedMarkdown({
  content,
  preset = 'lesson',
  className,
  loadingFallback,
  errorFallback,
}: ServerRenderedMarkdownProps) {
  const { html, isLoading, error } = useServerRenderedMarkdown({
    content,
    preset,
    enabled: Boolean(content),
  });

  if (isLoading) {
    return loadingFallback ?? (
      <div className="animate-pulse space-y-4">
        <div className="h-4 bg-muted rounded w-3/4" />
        <div className="h-4 bg-muted rounded w-1/2" />
        <div className="h-4 bg-muted rounded w-5/6" />
      </div>
    );
  }

  if (error) {
    return errorFallback ?? (
      <div className="text-destructive text-sm">
        Failed to render content: {error}
      </div>
    );
  }

  if (!html) {
    return null;
  }

  return (
    <div
      className={cn('prose prose-lg dark:prose-invert max-w-none', className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
```

**Files**:
- Create: `packages/web/components/markdown/ServerRenderedMarkdown.tsx`
- Update: `packages/web/components/markdown/index.ts` (add export)

**Acceptance Criteria**:
- Component renders HTML from Server Action
- Shows loading skeleton during fetch
- Shows error state on failure
- Applies proper prose styles

---

### Phase 4: Update ContentPreviewPanel [EXECUTOR: fullstack-nextjs-specialist]

**Task 4.1**: Replace MarkdownRendererClient with ServerRenderedMarkdown

**Current** (line 59):
```tsx
<MarkdownRendererClient content={rawMarkdown} preset="chat" />
```

**New**:
```tsx
<ServerRenderedMarkdown
  content={rawMarkdown}
  preset="lesson"
  loadingFallback={<ContentSkeleton />}
/>
```

**Files**:
- Update: `packages/web/components/generation-graph/panels/lesson/ContentPreviewPanel.tsx`

**Acceptance Criteria**:
- Preview shows full lesson rendering (math, diagrams, callouts)
- Loading state displayed while rendering
- Error handling for failed renders
- Realtime updates still work

---

### Phase 5: Update LessonContentView [EXECUTOR: fullstack-nextjs-specialist]

**Task 5.1**: Replace MarkdownRendererClient with ServerRenderedMarkdown

**Current** (line 227):
```tsx
<MarkdownRendererClient content={content} preset="chat" />
```

**New**:
```tsx
<ServerRenderedMarkdown
  content={content}
  preset="lesson"
/>
```

**Files**:
- Update: `packages/web/components/generation-graph/panels/output/LessonContentView.tsx`

**Acceptance Criteria**:
- Output view shows full lesson rendering
- Works with expand/collapse functionality
- Gradient overlay still works

---

### Phase 6: Testing & Validation [EXECUTOR: test-writer]

**Task 6.1**: Unit tests for Server Action

```typescript
// packages/web/tests/unit/actions/render-markdown.test.ts
describe('renderMarkdownAction', () => {
  it('renders basic markdown');
  it('renders math formulas');
  it('renders mermaid diagrams');
  it('renders callouts');
  it('handles empty content');
  it('handles malformed markdown');
});
```

**Task 6.2**: Integration tests for ServerRenderedMarkdown

```typescript
// packages/web/tests/unit/components/markdown/ServerRenderedMarkdown.test.tsx
describe('ServerRenderedMarkdown', () => {
  it('shows loading state initially');
  it('renders content after loading');
  it('shows error on failure');
  it('re-renders when content changes');
});
```

**Files**:
- Create: `packages/web/tests/unit/actions/render-markdown.test.ts`
- Create: `packages/web/tests/unit/components/markdown/ServerRenderedMarkdown.test.tsx`

---

### Phase 7: Cleanup [EXECUTOR: MAIN]

**Task 7.1**: Verify no regressions

- Run type-check
- Test in browser: navigate to generation workflow, open lesson details
- Verify math, code, diagrams render correctly
- Verify realtime updates still work

**Task 7.2**: Update documentation

- Update quickstart.md with ServerRenderedMarkdown usage
- Update tasks.md with completed status

---

## File Changes Summary

| Action | File |
|--------|------|
| CREATE | `packages/web/app/actions/render-markdown.ts` |
| CREATE | `packages/web/components/markdown/hooks/useServerRenderedMarkdown.ts` |
| CREATE | `packages/web/components/markdown/ServerRenderedMarkdown.tsx` |
| UPDATE | `packages/web/components/markdown/index.ts` |
| UPDATE | `packages/web/components/generation-graph/panels/lesson/ContentPreviewPanel.tsx` |
| UPDATE | `packages/web/components/generation-graph/panels/output/LessonContentView.tsx` |
| CREATE | `packages/web/tests/unit/actions/render-markdown.test.ts` |
| CREATE | `packages/web/tests/unit/components/markdown/ServerRenderedMarkdown.test.tsx` |

## Execution Order

```
Phase 1 (Server Action)
    ↓
Phase 2 (Hook)
    ↓
Phase 3 (Component)
    ↓
Phase 4 + Phase 5 (can run in parallel - different files)
    ↓
Phase 6 (Tests)
    ↓
Phase 7 (Cleanup)
```

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Server Action latency | useTransition for non-blocking updates |
| Mermaid in HTML string | Mermaid uses iframe, should work via dangerouslySetInnerHTML |
| XSS via dangerouslySetInnerHTML | MarkdownRenderer uses rehype-sanitize for untrusted content |
| Realtime update lag | Content updates trigger re-render, acceptable delay (~100ms) |

## Success Criteria

1. **Visual Parity**: Preview looks identical to student lesson page
2. **Realtime**: Updates within 500ms of content change
3. **No Regressions**: All existing functionality preserved
4. **Tests Pass**: Unit and integration tests green
5. **Type-Check Pass**: No TypeScript errors

## Timeline

| Phase | Tasks | Executor | Status |
|-------|-------|----------|--------|
| 1 | Server Action | fullstack-nextjs-specialist | ❌ Reverted |
| 2 | Hook | fullstack-nextjs-specialist | ❌ Reverted |
| 3 | Component | fullstack-nextjs-specialist | ❌ Reverted |
| 4 | Update ContentPreviewPanel | fullstack-nextjs-specialist | ✅ Uses MarkdownRendererClient |
| 5 | Update LessonContentView | fullstack-nextjs-specialist | ✅ Uses MarkdownRendererClient |
| 6 | Tests | test-writer | ⏸️ Deferred |
| 7 | Cleanup | MAIN | ✅ Complete |

**Updated**: 2025-12-12

---

## Important Update: ServerRenderedMarkdown Approach Abandoned

### Why ServerRenderedMarkdown Was Reverted

The Server Action approach using `renderToStaticMarkup` from `react-dom/server` was implemented but had to be reverted due to **Next.js 15 architectural limitations**:

1. **Hard Limitation**: Next.js production build fails with error:
   > "You're importing a component that imports react-dom/server. This only works in a Server Component which is not supported in Server Actions."

2. **Attempted Alternatives**:
   - Route Handler (`/api/markdown/render`) - Same error
   - `serverExternalPackages: ['react-dom']` in next.config.ts - Did not resolve the issue
   - Dynamic imports - Not applicable for RSC

3. **Root Cause**: `react-dom/server` APIs (`renderToStaticMarkup`, `renderToString`) are designed for SSR/SSG during initial page render, not for dynamic server-side rendering in response to client requests.

### Current Solution

The generation workflow preview panels now use **MarkdownRendererClient** (Streamdown-based):

```tsx
// ContentPreviewPanel.tsx
<MarkdownRendererClient content={rawMarkdown} />

// LessonContentView.tsx
<MarkdownRendererClient content={content} />
```

### Feature Comparison (Updated)

| Feature | Student View (lesson page) | Admin Preview (workflow) |
|---------|---------------------------|-------------------------|
| Syntax Highlighting | Shiki (full) | Streamdown (basic) |
| Math (KaTeX) | Yes | No |
| Mermaid Diagrams | Yes | No |
| Callouts | Yes | No |
| Anchor Links | Yes | No |
| **Realtime Updates** | N/A | Yes |
| **Streaming Support** | N/A | Yes |

### Future Alternatives (If Full Parity Needed)

1. **Client-side MarkdownRenderer**: Would require bundling all plugins client-side (large bundle)
2. **Pre-render on lesson save**: Render to HTML when lesson is saved, store HTML alongside markdown
3. **Edge Function**: Render markdown in Edge Runtime (requires investigation)
4. **React Server Components with Suspense**: Wait for RSC streaming to support this pattern

### Commits (Final State)

1. `69efc95` - fix(markdown): address code review findings (removed ServerRenderedMarkdown, updated previews to use MarkdownRendererClient)
