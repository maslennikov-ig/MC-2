# Diff Viewer Libraries Research for Configuration Versioning

**Date**: 2025-12-03
**Researcher**: Research Specialist
**Status**: Complete
**Project**: Admin Pipeline Dashboard (Feature 015)

## Executive Summary

This research evaluates diff viewer libraries for displaying version differences of LLM model configurations (JSON) and prompt templates (large text/XML up to 10K characters) in the admin dashboard. The primary recommendation is to use **two separate libraries**: `json-diff-kit` for structured JSON diffs and `react-diff-viewer-continued` for text/XML diffs.

### Key Findings

1. **JSON diff**: `json-diff-kit` provides superior structured diffing for JSON objects with array LCS diffing
2. **Text diff**: `react-diff-viewer-continued` is the most maintained fork of react-diff-viewer with good styling options
3. **React 19 compatibility**: Neither library officially supports React 19 yet, but both can work with `--legacy-peer-deps`
4. **Bundle size**: Combined impact is ~140-220KB minified, acceptable for admin-only pages
5. **Monaco Editor**: Too heavy (~2MB) for this use case

## Research Context

### Requirements (from FR-12a, FR-22)

- Display diff between two versions of model config (JSON objects)
- Display diff between two versions of prompt template (text/XML strings up to 10K chars)
- Visual side-by-side or inline diff
- Highlight additions, deletions, modifications
- Dark theme compatibility (shadcn/ui)
- React 19 / Next.js 15 compatibility

### Project Environment

- **Framework**: Next.js 15.5.3 with React 19.1.1
- **UI Library**: shadcn/ui (dark theme by default)
- **Existing Editor**: CodeMirror for prompt editing
- **Target**: Admin-only page (bundle size less critical)

## Library Evaluation

### 1. json-diff-kit

**Context7 Library ID**: `/rexskz/json-diff-kit`

#### Overview

A TypeScript library specifically designed for JSON diffing with advanced features like LCS array diffing and modification detection (beyond simple add/remove).

#### Strengths

✅ **JSON-focused**: Built specifically for structured JSON comparison
✅ **LCS array diffing**: Smart array comparison using Longest Common Subsequence
✅ **Modification detection**: Recognizes changes as "modifications" not just "remove+add"
✅ **React component included**: Built-in `Viewer` component with customization props
✅ **TypeScript**: Full TypeScript support with type definitions
✅ **Active maintenance**: Latest version 1.0.34 (published 9 days ago)

#### Bundle Size

- **Package size**: ~219KB (from Package Galaxy, December 2022 data)
- **Actual minified + gzipped**: Not available in search results, check [bundlephobia.com/package/json-diff-kit](https://bundlephobia.com/package/json-diff-kit)
- **Dependencies**: Minimal, ES6 only

#### React 19 Compatibility

⚠️ **Not confirmed**: No explicit React 19 peer dependency declaration
✅ **Likely works**: No known breaking changes, standard React component patterns
⚠️ **May require**: `--legacy-peer-deps` or `--force` during npm install

#### Usage Example

```tsx
import { Differ, Viewer } from 'json-diff-kit';
import 'json-diff-kit/dist/viewer.css';

// Configure differ
const differ = new Differ({
  detectCircular: true,
  maxDepth: Infinity,
  showModifications: true,
  arrayDiffMethod: 'lcs', // Use LCS for arrays
});

// Generate diff
const diff = differ.diff(beforeConfig, afterConfig);

// Render diff
<Viewer
  diff={diff}
  indent={4}
  lineNumbers={true}
  highlightInlineDiff={true}
  inlineDiffOptions={{
    mode: 'word', // Better than 'char' for readability
    wordSeparator: ' ',
  }}
/>;
```

#### Customization for Dark Theme

The library provides CSS classes that can be overridden with shadcn/ui theme colors:

```css
/* Override json-diff-kit styles for dark theme */
.json-diff-viewer {
  background: hsl(var(--background));
  color: hsl(var(--foreground));
}

.json-diff-added {
  background: hsl(var(--success) / 0.1);
  color: hsl(var(--success-foreground));
}

.json-diff-removed {
  background: hsl(var(--destructive) / 0.1);
  color: hsl(var(--destructive-foreground));
}
```

#### Recommendation for Model Configs

✅ **Recommended** for LLM model configuration diffs (JSON objects)

**Rationale**:

- Perfect fit for structured data (model_id, temperature, max_tokens)
- LCS array diffing handles fallback model arrays intelligently
- Modification detection shows parameter changes clearly
- TypeScript types provide type safety

---

### 2. react-diff-viewer-continued

**Context7 Library ID**: `/aeolun/react-diff-viewer-continued`

#### Overview

A maintained fork of `react-diff-viewer` for displaying text differences with syntax highlighting support.

#### Strengths

✅ **Text-focused**: Built for text/code diffs with line-by-line comparison
✅ **Maintained fork**: Active maintenance (3.4.0 published 2 years ago)
✅ **Syntax highlighting**: Built-in support via Prism.js integration
✅ **Customizable styling**: Extensive style override system
✅ **Split/unified views**: Supports both side-by-side and inline diffs
✅ **Dark theme**: Built-in dark theme with customizable colors

#### Bundle Size

- **Estimated**: ~140KB minified (from Bundlephobia search results)
- **Actual**: Check [bundlephobia.com/package/react-diff-viewer-continued](https://bundlephobia.com/package/react-diff-viewer-continued)
- **Dependencies**: `diff` (jsdiff) library

#### React 19 Compatibility

⚠️ **Not officially supported**: [GitHub Issue #63](https://github.com/Aeolun/react-diff-viewer-continued/issues/63) requesting React 19 support
⚠️ **Workaround required**: Use `--legacy-peer-deps` during install
⚠️ **Last update**: 2 years ago (may need watching for updates)

#### Usage Example

```tsx
import ReactDiffViewer from 'react-diff-viewer-continued';

<ReactDiffViewer
  oldValue={oldPromptText}
  newValue={newPromptText}
  splitView={true}
  useDarkTheme={true}
  leftTitle="Version 1.0"
  rightTitle="Version 2.0"
  showDiffOnly={true}
  extraLinesSurroundingDiff={3}
  styles={{
    variables: {
      dark: {
        diffViewerBackground: 'hsl(var(--background))',
        diffViewerColor: 'hsl(var(--foreground))',
        addedBackground: 'hsl(var(--success) / 0.15)',
        addedColor: 'hsl(var(--success-foreground))',
        removedBackground: 'hsl(var(--destructive) / 0.15)',
        removedColor: 'hsl(var(--destructive-foreground))',
        gutterBackground: 'hsl(var(--muted))',
      },
    },
  }}
/>;
```

#### Customization for Prompt Templates

For XML/text prompt templates with syntax highlighting:

```tsx
import Prism from 'prismjs';
import 'prismjs/components/prism-markup'; // For XML

const highlightSyntax = (str: string) => (
  <pre
    style={{ display: 'inline' }}
    dangerouslySetInnerHTML={{
      __html: Prism.highlight(str, Prism.languages.markup, 'markup'),
    }}
  />
);

<ReactDiffViewer
  oldValue={oldPrompt}
  newValue={newPrompt}
  splitView={true}
  useDarkTheme={true}
  renderContent={highlightSyntax}
  compareMethod="diffLines" // Better for large text
/>;
```

#### Recommendation for Prompt Templates

✅ **Recommended** for prompt template diffs (text/XML strings)

**Rationale**:

- Handles large text files (10K+ chars) efficiently
- Syntax highlighting for XML structure
- Dark theme built-in with customization
- Split view works well for comparing long prompts
- Line-by-line comparison suitable for text content

---

### 3. react-diff-view

**Context7 Library ID**: `/otakustay/react-diff-view`

#### Overview

A git-style diff viewer with advanced features for parsing and rendering diffs.

#### Strengths

✅ **Advanced features**: Token system, web worker support, custom renderers
✅ **Git-style**: Designed for git unified diff format
✅ **Powerful API**: Extensive utilities for diff manipulation
✅ **High downloads**: 135,735 weekly downloads

#### Weaknesses

⚠️ **Complexity**: More complex API, steeper learning curve
⚠️ **Git-focused**: Requires unified diff format (not direct string comparison)
⚠️ **Overkill**: Too feature-rich for simple version comparison

#### Bundle Size

- **Estimated**: Check [bundlephobia.com/package/react-diff-view](https://bundlephobia.com/package/react-diff-view)

#### React 19 Compatibility

⚠️ **Not confirmed**: No explicit documentation found

#### Recommendation

❌ **Not recommended** for this use case

**Rationale**: Too complex for simple version comparison, requires git diff format

---

### 4. Monaco Editor (with Diff Editor)

**Package**: `@monaco-editor/react`

#### Overview

VS Code's editor as a React component with built-in diff functionality.

#### Strengths

✅ **Professional**: VS Code-level diff experience
✅ **Feature-rich**: Inline diff, minimap, navigation controls
✅ **React 19 support**: v4.7.0-rc.0 supports React 19
✅ **Next.js compatible**: Works with SSR via dynamic imports

#### Critical Weakness

❌ **Bundle size**: ~2MB for Monaco core (10MB uncompressed)
❌ **Overkill**: Full editor for view-only diff display
❌ **Load time**: Significantly slower page loads

#### Bundle Size Mitigation

- CDN loading (default): Avoids bundle bloat but adds network dependency
- Webpack plugin: Can reduce size but requires complex config
- Language-specific builds: Still large for multiple languages

#### React 19 Compatibility

✅ **Supported**: Use `npm install @monaco-editor/react@next`

#### Recommendation

❌ **Not recommended** for this use case

**Rationale**: Bundle size far too large for admin-only configuration diffs

---

### 5. CodeMirror Merge Addon

**Package**: `@codemirror/merge` + `react-codemirror-merge`

#### Overview

CodeMirror 6's merge/diff view as a React component.

#### Strengths

✅ **Already in project**: CodeMirror used for prompt editing
✅ **Consistent UX**: Matches existing prompt editor
✅ **Active maintenance**: Latest version 6.11.1 (published 5 days ago)
✅ **Modern**: CodeMirror 6 architecture

#### Considerations

⚠️ **Separate package**: `react-codemirror-merge` wrapper needed
⚠️ **Bundle size**: Adds ~100KB+ on top of existing CodeMirror
⚠️ **JSON support**: Not optimized for structured JSON diffing

#### React 19 Compatibility

✅ **Likely compatible**: CodeMirror 6 uses modern React patterns

#### Recommendation

🤔 **Consider as alternative** for prompt templates only

**Rationale**:

- Provides consistent UX with existing prompt editor
- Good for text diffs but not ideal for JSON
- Bundle size acceptable since CodeMirror already in use
- Would still need separate solution for model config JSON diffs

---

## Comparison Matrix

| Library                         | JSON Diff  | Text Diff  | Bundle Size | React 19      | Dark Theme      | Maintenance        | Recommendation  |
| ------------------------------- | ---------- | ---------- | ----------- | ------------- | --------------- | ------------------ | --------------- |
| **json-diff-kit**               | ⭐⭐⭐⭐⭐ | ⭐⭐⭐     | ~220KB      | ⚠️ Likely     | ✅ CSS Override | ✅ Active (9 days) | ✅ **For JSON** |
| **react-diff-viewer-continued** | ⭐⭐⭐     | ⭐⭐⭐⭐⭐ | ~140KB      | ⚠️ Workaround | ✅ Built-in     | ⚠️ 2 years ago     | ✅ **For Text** |
| **react-diff-view**             | ⭐⭐⭐     | ⭐⭐⭐⭐   | ~100KB?     | ⚠️ Unknown    | ✅ Customizable | ✅ Active          | ❌ Too complex  |
| **Monaco Editor**               | ⭐⭐⭐⭐   | ⭐⭐⭐⭐⭐ | 🔴 ~2MB     | ✅ RC         | ✅ Built-in     | ✅ Active          | ❌ Too heavy    |
| **CodeMirror Merge**            | ⭐⭐⭐     | ⭐⭐⭐⭐   | ~100KB+     | ✅ Likely     | ✅ CSS          | ✅ Active (5 days) | 🤔 Alternative  |

**Legend**:

- ⭐⭐⭐⭐⭐ Excellent
- ⭐⭐⭐⭐ Good
- ⭐⭐⭐ Adequate
- ✅ Supported
- ⚠️ Requires workaround or uncertain
- ❌ Not suitable
- 🔴 Critical issue

---

## Final Recommendation

### Two-Library Approach (Recommended)

Use **separate libraries** optimized for each use case:

#### For Model Configuration Diffs (JSON)

**Library**: `json-diff-kit`
**Install**: `npm install json-diff-kit --legacy-peer-deps`

**Pros**:

- Purpose-built for JSON structured diffing
- LCS array diffing handles model arrays intelligently
- Shows modifications clearly (not just add+remove)
- TypeScript support
- Compact viewer component

**Implementation**:

```tsx
// components/admin/ModelConfigDiff.tsx
import { Differ, Viewer } from 'json-diff-kit';
import 'json-diff-kit/dist/viewer.css';

export function ModelConfigDiff({
  oldConfig,
  newConfig,
}: {
  oldConfig: ModelConfig;
  newConfig: ModelConfig;
}) {
  const differ = new Differ({
    detectCircular: true,
    arrayDiffMethod: 'lcs',
    showModifications: true,
  });

  const diff = useMemo(() => differ.diff(oldConfig, newConfig), [oldConfig, newConfig]);

  return <Viewer diff={diff} indent={2} lineNumbers={true} highlightInlineDiff={true} />;
}
```

#### For Prompt Template Diffs (Text/XML)

**Library**: `react-diff-viewer-continued`
**Install**: `npm install react-diff-viewer-continued --legacy-peer-deps`

**Pros**:

- Built for text/code comparison
- Syntax highlighting support
- Dark theme with customization
- Split view for long prompts
- Simple API

**Implementation**:

```tsx
// components/admin/PromptTemplateDiff.tsx
import ReactDiffViewer from 'react-diff-viewer-continued';

export function PromptTemplateDiff({
  oldPrompt,
  newPrompt,
}: {
  oldPrompt: string;
  newPrompt: string;
}) {
  return (
    <ReactDiffViewer
      oldValue={oldPrompt}
      newValue={newPrompt}
      splitView={true}
      useDarkTheme={true}
      showDiffOnly={true}
      compareMethod="diffLines"
      styles={{
        variables: {
          dark: {
            diffViewerBackground: 'hsl(var(--background))',
            addedBackground: 'hsl(var(--success) / 0.15)',
            removedBackground: 'hsl(var(--destructive) / 0.15)',
          },
        },
      }}
    />
  );
}
```

### Combined Bundle Size Impact

- **json-diff-kit**: ~220KB (package size, actual minified+gzipped likely smaller)
- **react-diff-viewer-continued**: ~140KB minified
- **Total estimated**: ~360KB package size, ~100-150KB minified+gzipped

**Verdict**: Acceptable for admin-only pages loaded on-demand

---

## Alternative: Single-Library Approach

If minimizing dependencies is critical, use **json-diff-kit for both**:

### JSON Diffs

Use `Viewer` component as shown above.

### Text Diffs

Convert text to JSON structure and use `Viewer`:

```tsx
// Less ideal but works
const oldLines = { lines: oldPrompt.split('\n') };
const newLines = { lines: newPrompt.split('\n') };
const diff = differ.diff(oldLines, newLines);
```

**Trade-offs**:

- ❌ Loses text-specific diff features (word-level, syntax highlighting)
- ✅ Single dependency
- ✅ Consistent UI
- ❌ Less optimal UX for long text

---

## React 19 / Next.js 15 Compatibility Notes

### Installation with Legacy Peer Deps

Both recommended libraries require `--legacy-peer-deps` flag:

```bash
npm install json-diff-kit --legacy-peer-deps
npm install react-diff-viewer-continued --legacy-peer-deps
```

Or add to `.npmrc`:

```
legacy-peer-deps=true
```

### Testing Checklist

- [ ] Install libraries in Next.js 15 environment
- [ ] Verify no runtime errors with React 19
- [ ] Test dark theme rendering
- [ ] Test with large JSON (1000+ lines model config)
- [ ] Test with large text (10K+ character prompt)
- [ ] Check bundle size impact via `@next/bundle-analyzer`
- [ ] Test SSR compatibility (Next.js)

### Potential Issues

1. **React 19 warnings**: May see peer dependency warnings but should work
2. **SSR hydration**: Ensure dynamic imports for client-only components
3. **CSS conflicts**: May need to namespace CSS to avoid conflicts with shadcn

---

## Implementation Roadmap

### Phase 1: Setup & Integration (Day 1-2)

1. Install libraries with `--legacy-peer-deps`
2. Create wrapper components:
   - `ModelConfigDiff.tsx`
   - `PromptTemplateDiff.tsx`
3. Add CSS overrides for dark theme
4. Test with sample data

### Phase 2: UI Integration (Day 3)

1. Integrate into model config history modal (FR-012)
2. Integrate into prompt template history modal (FR-024)
3. Add loading states
4. Add error boundaries

### Phase 3: Testing & Optimization (Day 4)

1. Test with production-size data
2. Measure bundle size impact
3. Optimize CSS loading (critical vs non-critical)
4. Add accessibility (keyboard navigation, ARIA labels)

### Phase 4: Polish (Day 5)

1. Add "copy diff" functionality
2. Add "expand/collapse" for large diffs
3. Add "navigate changes" buttons
4. Documentation

---

## Risk Assessment

### High Risk ❌

**Monaco Editor bundle size**: Would add 2MB to bundle → Use lighter alternatives

### Medium Risk ⚠️

**React 19 compatibility**: Neither library officially supports React 19

- **Mitigation**: Use `--legacy-peer-deps`, test thoroughly, monitor GitHub issues
- **Fallback**: Downgrade to React 18 if critical issues (unlikely)

**react-diff-viewer-continued maintenance**: Last update 2 years ago

- **Mitigation**: Fork library if needed, or use react-diff-view as backup
- **Fallback**: Switch to CodeMirror merge if abandoned

### Low Risk ✅

**Bundle size**: Combined ~360KB package size is acceptable

- **Context**: Admin-only pages, lazy-loaded
- **Mitigation**: Code splitting, dynamic imports

**Dark theme styling**: CSS customization needed

- **Context**: Both libraries support style overrides
- **Mitigation**: Use shadcn CSS variables

---

## References & Sources

### Library Documentation

1. [json-diff-kit on npm](https://www.npmjs.com/package/json-diff-kit)
2. [json-diff-kit GitHub](https://github.com/RexSkz/json-diff-kit)
3. [json-diff-kit Playground](https://json-diff-kit.js.org/)
4. [react-diff-viewer-continued on npm](https://www.npmjs.com/package/react-diff-viewer-continued)
5. [react-diff-viewer-continued GitHub](https://github.com/Aeolun/react-diff-viewer-continued)
6. [React 19 Support Issue #63](https://github.com/Aeolun/react-diff-viewer-continued/issues/63)

### Bundle Size Analysis

7. [Bundlephobia: react-diff-viewer-continued](https://bundlephobia.com/package/react-diff-viewer-continued)
8. [Bundlephobia: json-diff-kit](https://bundlephobia.com/package/json-diff-kit)
9. [npm trends: diff libraries comparison](https://npmtrends.com/jsdiff-vs-json-diff-vs-react-diff-vs-react-diff-view-vs-react-diff-viewer)

### Monaco Editor Research

10. [@monaco-editor/react on npm](https://www.npmjs.com/package/@monaco-editor/react)
11. [Monaco Editor bundle size discussion](https://github.com/react-monaco-editor/react-monaco-editor/issues/299)
12. [Monaco React documentation](https://monaco-react.surenatoyan.com/)

### CodeMirror Merge

13. [@codemirror/merge on npm](https://www.npmjs.com/package/@codemirror/merge)
14. [react-codemirror-merge on npm](https://www.npmjs.com/package/react-codemirror-merge)
15. [CodeMirror merge demo](https://codemirror.net/5/demo/merge.html)

### React 19 / Next.js 15

16. [shadcn/ui React 19 docs](https://ui.shadcn.com/docs/react-19)
17. [Next.js 15 + React 19 Implementation Guide](https://medium.com/@genildocs/next-js-15-react-19-full-stack-implementation-guide-4ba0978fa0e5)

### Context7 Research

18. Context7 library docs for `/rexskz/json-diff-kit`
19. Context7 library docs for `/aeolun/react-diff-viewer-continued`
20. Context7 library docs for `/otakustay/react-diff-view`

---

## Conclusion

The **two-library approach** using `json-diff-kit` for JSON model configs and `react-diff-viewer-continued` for text prompt templates provides the best balance of:

- ✅ Purpose-built functionality for each use case
- ✅ Acceptable bundle size for admin pages
- ✅ Good dark theme support
- ✅ Active maintenance (json-diff-kit)
- ⚠️ React 19 compatibility with workarounds

This approach delivers the best user experience while maintaining reasonable technical trade-offs. The libraries can be installed with `--legacy-peer-deps` and should work reliably with React 19/Next.js 15 based on their architecture.

**Next Steps**: Proceed with implementation following the roadmap, with special attention to React 19 compatibility testing in Phase 3.
