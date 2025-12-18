/**
 * TextDiffViewer Component (T046)
 *
 * Wrapper around react-diff-viewer-continued for displaying text diffs.
 * Used in PromptHistoryDialog to show differences between prompt template versions.
 *
 * Supports:
 * - Side-by-side comparison
 * - Word-level highlighting
 * - Dark mode detection
 * - Line numbers
 *
 * @module app/admin/pipeline/components/text-diff-viewer
 */

'use client';

import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued';
import { useTheme } from 'next-themes';

interface TextDiffViewerProps {
  oldValue: string;
  newValue: string;
  oldTitle?: string;
  newTitle?: string;
  splitView?: boolean;
}

/**
 * Display text diff between two versions
 *
 * Uses react-diff-viewer-continued to render visual diff.
 * Automatically detects theme for dark mode support.
 *
 * @param oldValue - Original text (left side)
 * @param newValue - New text (right side)
 * @param oldTitle - Optional title for old version
 * @param newTitle - Optional title for new version
 * @param splitView - Whether to show side-by-side (default: true)
 */
export function TextDiffViewer({
  oldValue,
  newValue,
  oldTitle = 'Previous Version',
  newTitle = 'Current Version',
  splitView = true,
}: TextDiffViewerProps) {
  const { theme, systemTheme } = useTheme();
  const resolvedTheme = theme === 'system' ? systemTheme : theme;
  const isDark = resolvedTheme === 'dark';

  return (
    <div className="rounded-lg border bg-background overflow-hidden">
      <ReactDiffViewer
        oldValue={oldValue}
        newValue={newValue}
        splitView={splitView}
        useDarkTheme={isDark}
        leftTitle={oldTitle}
        rightTitle={newTitle}
        compareMethod={DiffMethod.WORDS}
        showDiffOnly={false}
        styles={{
          variables: {
            dark: {
              diffViewerBackground: 'hsl(var(--background))',
              diffViewerColor: 'hsl(var(--foreground))',
              addedBackground: 'hsl(142 76% 36% / 0.15)',
              addedColor: 'hsl(142 76% 66%)',
              removedBackground: 'hsl(0 84% 60% / 0.15)',
              removedColor: 'hsl(0 84% 80%)',
              wordAddedBackground: 'hsl(142 76% 36% / 0.3)',
              wordRemovedBackground: 'hsl(0 84% 60% / 0.3)',
              addedGutterBackground: 'hsl(142 76% 36% / 0.2)',
              removedGutterBackground: 'hsl(0 84% 60% / 0.2)',
              gutterBackground: 'hsl(var(--muted))',
              gutterBackgroundDark: 'hsl(var(--muted))',
              highlightBackground: 'hsl(var(--accent))',
              highlightGutterBackground: 'hsl(var(--accent))',
              codeFoldGutterBackground: 'hsl(var(--muted))',
              codeFoldBackground: 'hsl(var(--muted))',
              emptyLineBackground: 'hsl(var(--muted) / 0.5)',
              gutterColor: 'hsl(var(--muted-foreground))',
              addedGutterColor: 'hsl(142 76% 66%)',
              removedGutterColor: 'hsl(0 84% 80%)',
              codeFoldContentColor: 'hsl(var(--muted-foreground))',
              diffViewerTitleBackground: 'hsl(var(--muted))',
              diffViewerTitleColor: 'hsl(var(--foreground))',
              diffViewerTitleBorderColor: 'hsl(var(--border))',
            },
            light: {
              diffViewerBackground: 'hsl(var(--background))',
              diffViewerColor: 'hsl(var(--foreground))',
              addedBackground: 'hsl(142 76% 36% / 0.1)',
              addedColor: 'hsl(142 76% 26%)',
              removedBackground: 'hsl(0 84% 60% / 0.1)',
              removedColor: 'hsl(0 84% 40%)',
              wordAddedBackground: 'hsl(142 76% 36% / 0.25)',
              wordRemovedBackground: 'hsl(0 84% 60% / 0.25)',
              addedGutterBackground: 'hsl(142 76% 36% / 0.15)',
              removedGutterBackground: 'hsl(0 84% 60% / 0.15)',
              gutterBackground: 'hsl(var(--muted))',
              gutterBackgroundDark: 'hsl(var(--muted))',
              highlightBackground: 'hsl(var(--accent))',
              highlightGutterBackground: 'hsl(var(--accent))',
              codeFoldGutterBackground: 'hsl(var(--muted))',
              codeFoldBackground: 'hsl(var(--muted))',
              emptyLineBackground: 'hsl(var(--muted) / 0.3)',
              gutterColor: 'hsl(var(--muted-foreground))',
              addedGutterColor: 'hsl(142 76% 26%)',
              removedGutterColor: 'hsl(0 84% 40%)',
              codeFoldContentColor: 'hsl(var(--muted-foreground))',
              diffViewerTitleBackground: 'hsl(var(--muted))',
              diffViewerTitleColor: 'hsl(var(--foreground))',
              diffViewerTitleBorderColor: 'hsl(var(--border))',
            },
          },
          line: {
            padding: '0.25rem 0.5rem',
            fontSize: '0.875rem',
            fontFamily: 'var(--font-mono, ui-monospace, monospace)',
          },
          gutter: {
            padding: '0.25rem 0.5rem',
            minWidth: '3rem',
            fontSize: '0.75rem',
          },
          titleBlock: {
            padding: '0.5rem 1rem',
            fontSize: '0.875rem',
            fontWeight: 500,
          },
        }}
      />
    </div>
  );
}
