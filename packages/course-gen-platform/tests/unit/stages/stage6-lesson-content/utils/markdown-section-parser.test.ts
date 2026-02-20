import { describe, expect, it } from 'vitest';
import {
  mergeSectionIntoMarkdown,
  parseMarkdownSections,
} from '@/stages/stage6-lesson-content/utils/markdown-section-parser';

describe('markdown-section-parser intro handling', () => {
  it('treats pre-H2 preface as synthetic introduction section', () => {
    const markdown = `# Lesson Title

This preface should be treated as intro.
It has two lines.

## Core Concepts

Body section content.`;

    const parsed = parseMarkdownSections(markdown);
    const intro = parsed.sections.find(section => section.id === 'introduction');
    const firstHeaderIndex = parsed.lines.findIndex(line => /^##\s+/.test(line));

    expect(intro).toBeDefined();
    expect(intro?.title).toBe('Introduction');
    expect(intro?.content).toContain('This preface should be treated as intro.');
    expect(intro?.endLine).toBe(firstHeaderIndex);
    expect(parsed.sections.some(section => section.id === 'section_1')).toBe(true);
  });

  it('replaces synthetic introduction content during merge', () => {
    const markdown = `# Lesson Title

Legacy intro text without explicit header.

## Core Concepts

Body section content.`;

    const parsed = parseMarkdownSections(markdown);
    const regeneratedIntro = '## Introduction\n\nRegenerated introduction content.';
    const merged = mergeSectionIntoMarkdown(parsed, 'introduction', regeneratedIntro);

    expect(merged).toContain('## Introduction');
    expect(merged).toContain('Regenerated introduction content.');
    expect(merged).not.toContain('Legacy intro text without explicit header.');
    expect(merged.indexOf('## Introduction')).toBeLessThan(merged.indexOf('## Core Concepts'));
  });

  it('inserts introduction section when intro is absent', () => {
    const markdown = `# Lesson Title

## Core Concepts

Body section content.`;

    const parsed = parseMarkdownSections(markdown);
    const regeneratedIntro = '## Introduction\n\nInserted introduction content.';
    const merged = mergeSectionIntoMarkdown(parsed, 'introduction', regeneratedIntro);

    expect(parsed.sections.some(section => section.id === 'introduction')).toBe(false);
    expect(merged).toContain('## Introduction');
    expect(merged).toContain('Inserted introduction content.');
    expect(merged.indexOf('## Introduction')).toBeLessThan(merged.indexOf('## Core Concepts'));
  });
});
