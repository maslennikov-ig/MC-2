/**
 * Legacy Markdown chunker: heading boundaries and parent/child sizing (mc2-5fpaf).
 *
 * Both passes of this chunker were measuring the wrong thing, and the two
 * mistakes hid each other. The first pass was `new MarkdownTextSplitter({})`,
 * which never split on headings and silently took LangChain's 1000-character
 * default window. The second pass sized its splitters with `tokens * 4`, so a
 * "400 token" child window was really 1600 characters. No section ever reached
 * the child window, so every parent came back from the child splitter unchanged.
 *
 * Measured on production 2026-08-13, 25 documents through the deployed code:
 * 508 of 508 parents held exactly one child carrying the parent's exact text,
 * no child had a sibling, and all 6856 indexed points carried
 * `heading_path: 'Root'` with a null chapter and section.
 *
 * These tests pin the two properties that were absent rather than the exact
 * chunk counts, which legitimately move with the splitter's boundary choices.
 */
import { describe, expect, it } from 'vitest';

import {
  chunkMarkdown,
  DEFAULT_CHUNKING_CONFIG,
  getChildrenForParent,
  getParentForChild,
} from '@/shared/embeddings/markdown-chunker';

/** Russian prose runs ~2.33 characters per token, so this clears 400 tokens. */
function longSection(topic: string): string {
  return Array.from(
    { length: 12 },
    (_, index) =>
      `${topic}: положение ${index + 1}. Руководитель согласует объём работ, фиксирует сроки ` +
      'и передаёт задачу исполнителю, после чего отмечает результат в системе учёта.'
  ).join(' ');
}

const DOCUMENT = [
  '# Регламент работы',
  '',
  longSection('Общие требования'),
  '',
  '## Приём заявок',
  '',
  longSection('Приём заявок'),
  '',
  '### Сроки',
  '',
  longSection('Сроки рассмотрения'),
  '',
  '## Отчётность',
  '',
  longSection('Отчётность'),
].join('\n');

describe('chunkMarkdown heading boundaries', () => {
  it('carries the headings in scope instead of labelling everything Root', async () => {
    const result = await chunkMarkdown(DOCUMENT);

    const paths = new Set(result.child_chunks.map(chunk => chunk.heading_path));
    expect(paths.has('Root')).toBe(false);
    expect(paths.size).toBeGreaterThan(1);

    expect(result.child_chunks.every(chunk => chunk.chapter === 'Регламент работы')).toBe(true);
    expect([...new Set(result.child_chunks.map(chunk => chunk.section))]).toEqual(
      expect.arrayContaining(['Приём заявок', 'Отчётность'])
    );
  });

  it('narrows the path for a deeper heading and drops it again for the next sibling', async () => {
    const result = await chunkMarkdown(DOCUMENT);

    expect(result.child_chunks.some(chunk => chunk.heading_path.endsWith('Сроки'))).toBe(true);
    // 'Отчётность' is an H2 after an H3, so the H3 must not leak into its path.
    const reporting = result.child_chunks.filter(chunk => chunk.section === 'Отчётность');
    expect(reporting.length).toBeGreaterThan(0);
    expect(reporting.every(chunk => !chunk.heading_path.includes('Сроки'))).toBe(true);
  });

  it('does not read a comment inside a fenced code block as a heading', async () => {
    const markdown = [
      '# Настройка',
      '',
      longSection('Настройка окружения'),
      '',
      '```bash',
      '# это комментарий, а не заголовок',
      'export TOKEN=value',
      '```',
      '',
      longSection('Проверка'),
    ].join('\n');

    const result = await chunkMarkdown(markdown);

    expect(result.child_chunks.every(chunk => chunk.chapter === 'Настройка')).toBe(true);
    expect(result.child_chunks.some(chunk => chunk.heading_path.includes('это комментарий'))).toBe(
      false
    );
  });
});

describe('chunkMarkdown parent/child hierarchy', () => {
  it('gives a parent more than one child, which is what a parent is for', async () => {
    const result = await chunkMarkdown(DOCUMENT);

    const populated = result.parent_chunks.filter(
      parent => getChildrenForParent(result, parent.chunk_id).length > 1
    );
    expect(populated.length).toBeGreaterThan(0);

    // The exact regression: a parent whose only child repeats it verbatim.
    const degenerate = result.parent_chunks.filter(parent => {
      const children = getChildrenForParent(result, parent.chunk_id);
      return children.length === 1 && children[0].content.trim() === parent.content.trim();
    });
    expect(degenerate.length).toBeLessThan(result.parent_chunks.length);
  });

  it('links children to each other, so sibling navigation has something to walk', async () => {
    const result = await chunkMarkdown(DOCUMENT);

    const withSiblings = result.child_chunks.filter(chunk => chunk.sibling_chunk_ids.length > 0);
    expect(withSiblings.length).toBeGreaterThan(0);

    const child = withSiblings[0];
    const parent = getParentForChild(result, child.chunk_id);
    expect(parent).not.toBeNull();
    expect(child.sibling_chunk_ids).not.toContain(child.chunk_id);

    const siblingIds = getChildrenForParent(result, parent!.chunk_id).map(c => c.chunk_id);
    expect(siblingIds).toEqual(expect.arrayContaining(child.sibling_chunk_ids));
  });

  it('measures the budgets in tokens rather than in four-characters-per-token', async () => {
    const result = await chunkMarkdown(DOCUMENT);

    // The old code applied a 1600-character child window to Cyrillic text and
    // produced ~700-token children under a 400-token label.
    const overshooting = result.child_chunks.filter(
      chunk => chunk.token_count > DEFAULT_CHUNKING_CONFIG.child_chunk_size * 1.5
    );
    expect(overshooting).toEqual([]);

    for (const parent of result.parent_chunks) {
      expect(parent.token_count).toBeLessThanOrEqual(
        DEFAULT_CHUNKING_CONFIG.parent_chunk_size * 1.5
      );
    }
  });

  it('reports the overlap it actually produced', async () => {
    const result = await chunkMarkdown(DOCUMENT);

    for (const chunk of result.child_chunks) {
      expect(chunk.overlap_tokens).toBeLessThanOrEqual(DEFAULT_CHUNKING_CONFIG.child_chunk_overlap);
      expect(chunk.overlap_tokens).toBeGreaterThanOrEqual(0);
    }
  });
});
