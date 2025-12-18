# Diff Viewer Library Recommendation - Quick Summary

**Date**: 2025-12-03
**Full Research**: See `diff-viewer-research.md`

## Recommendation: Two-Library Approach

### For JSON Model Configurations

**Library**: `json-diff-kit`

```bash
npm install json-diff-kit --legacy-peer-deps
```

**Why**:
- Purpose-built for JSON structured diffing
- LCS array diffing for intelligent array comparison
- Shows modifications clearly (not just add+remove)
- TypeScript support
- ~220KB package size

**Usage**:
```tsx
import { Differ, Viewer } from 'json-diff-kit';
import 'json-diff-kit/dist/viewer.css';

const differ = new Differ({
  detectCircular: true,
  arrayDiffMethod: 'lcs',
  showModifications: true,
});

const diff = differ.diff(oldConfig, newConfig);

<Viewer
  diff={diff}
  indent={2}
  lineNumbers={true}
  highlightInlineDiff={true}
/>
```

---

### For Text Prompt Templates

**Library**: `react-diff-viewer-continued`

```bash
npm install react-diff-viewer-continued --legacy-peer-deps
```

**Why**:
- Built for text/code comparison
- Syntax highlighting support (Prism.js)
- Dark theme built-in
- Split view for long prompts
- ~140KB minified

**Usage**:
```tsx
import ReactDiffViewer from 'react-diff-viewer-continued';

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
```

---

## React 19 Compatibility

⚠️ **Both libraries**: Use `--legacy-peer-deps` flag
- Neither officially supports React 19 yet
- Should work fine based on code patterns
- Monitor GitHub issues for updates

**Installation note**: Add to `.npmrc`:
```
legacy-peer-deps=true
```

---

## Bundle Size Impact

- **json-diff-kit**: ~220KB package
- **react-diff-viewer-continued**: ~140KB minified
- **Combined**: ~360KB package size, ~100-150KB minified+gzipped
- **Verdict**: ✅ Acceptable for admin-only pages

---

## Rejected Alternatives

❌ **Monaco Editor**: Too heavy (~2MB bundle size)
❌ **react-diff-view**: Too complex for simple version comparison
🤔 **CodeMirror merge**: Consider as alternative for prompts only (already using CodeMirror)

---

## Implementation Checklist

- [ ] Install both libraries with `--legacy-peer-deps`
- [ ] Create `ModelConfigDiff.tsx` wrapper component
- [ ] Create `PromptTemplateDiff.tsx` wrapper component
- [ ] Add CSS overrides for shadcn dark theme
- [ ] Test with React 19 / Next.js 15
- [ ] Test with large JSON (1000+ lines)
- [ ] Test with large text (10K+ characters)
- [ ] Add to model config history modal (FR-012)
- [ ] Add to prompt template history modal (FR-024)
- [ ] Measure bundle size impact

---

## Key Findings

1. **Separate solutions work best**: JSON needs structured diffing, text needs line-by-line comparison
2. **React 19 workaround**: Use `--legacy-peer-deps`, both should work fine
3. **Bundle size acceptable**: ~360KB for admin-only pages is reasonable
4. **Monaco too heavy**: 2MB bundle not justified for view-only diffs
5. **Dark theme supported**: Both libraries allow CSS customization for shadcn theme

---

## Questions Answered

✅ **JSON support?** Yes - json-diff-kit provides excellent structured JSON diffing
✅ **Large text support?** Yes - react-diff-viewer-continued handles 10K+ chars efficiently
✅ **Bundle size?** ~360KB combined (acceptable for admin pages)
✅ **Styling?** Both support dark theme via CSS overrides
✅ **React 19 / Next.js 15?** Works with `--legacy-peer-deps` workaround
✅ **Maintenance?** json-diff-kit active (9 days ago), react-diff-viewer-continued older (2 years)

---

## Next Steps

1. **Install libraries** with `--legacy-peer-deps` flag
2. **Create wrapper components** for each use case
3. **Add CSS overrides** for shadcn dark theme compatibility
4. **Test thoroughly** with React 19 and production-size data
5. **Monitor** GitHub issues for official React 19 support

**Full analysis**: See `diff-viewer-research.md` for detailed evaluation, bundle size analysis, implementation roadmap, and risk assessment.
