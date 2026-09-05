/**
 * Course Mapper asset extraction tests
 * @module tests/unit/integrations/lms/course-mapper.test
 *
 * Covers extractAssetUrls(), which populates UnitInput.assets from lesson HTML.
 * Before this existed, every mapped unit carried assets: [] regardless of what
 * the lesson actually referenced.
 */

import { describe, it, expect } from 'vitest';
import { extractAssetUrls } from '../../../../src/integrations/lms/course-mapper';

describe('extractAssetUrls', () => {
  describe('empty and absent input', () => {
    it('returns an empty array for null, undefined and empty string', () => {
      expect(extractAssetUrls(null)).toEqual([]);
      expect(extractAssetUrls(undefined)).toEqual([]);
      expect(extractAssetUrls('')).toEqual([]);
    });

    it('returns an empty array for HTML with no references', () => {
      expect(extractAssetUrls('<p>Просто текст без ссылок</p>')).toEqual([]);
    });
  });

  describe('supported tags', () => {
    it('extracts img src', () => {
      expect(extractAssetUrls('<img src="https://cdn.example.com/diagram.png" alt="d">')).toEqual([
        'https://cdn.example.com/diagram.png',
      ]);
    });

    it('extracts video src', () => {
      expect(extractAssetUrls('<video src="https://cdn.example.com/intro.mp4"></video>')).toEqual([
        'https://cdn.example.com/intro.mp4',
      ]);
    });

    it('extracts source src inside a video element', () => {
      const html = `
        <video controls>
          <source src="https://cdn.example.com/lesson.webm" type="video/webm">
          <source src="https://cdn.example.com/lesson.mp4" type="video/mp4">
        </video>
      `;
      expect(extractAssetUrls(html)).toEqual([
        'https://cdn.example.com/lesson.webm',
        'https://cdn.example.com/lesson.mp4',
      ]);
    });

    it('extracts an anchor href that points at a media file', () => {
      expect(
        extractAssetUrls('<a href="https://cdn.example.com/handout.pdf">Скачать</a>')
      ).toEqual(['https://cdn.example.com/handout.pdf']);
    });

    it('ignores an anchor href that points at a page', () => {
      expect(extractAssetUrls('<a href="https://example.com/docs/intro">Подробнее</a>')).toEqual(
        []
      );
    });

    it('keeps a media anchor whose extension is followed by a query string', () => {
      expect(
        extractAssetUrls('<a href="https://cdn.example.com/slides.pptx?v=3">Слайды</a>')
      ).toEqual(['https://cdn.example.com/slides.pptx?v=3']);
    });

    it('collects references from every supported tag in document order', () => {
      const html = `
        <p>Intro</p>
        <img src="https://cdn.example.com/a.png">
        <a href="https://cdn.example.com/b.pdf">B</a>
        <video src="https://cdn.example.com/c.mp4"></video>
        <source src="https://cdn.example.com/d.webm">
      `;
      expect(extractAssetUrls(html)).toEqual([
        'https://cdn.example.com/a.png',
        'https://cdn.example.com/b.pdf',
        'https://cdn.example.com/c.mp4',
        'https://cdn.example.com/d.webm',
      ]);
    });
  });

  describe('attribute parsing', () => {
    it('reads single-quoted and unquoted attribute values', () => {
      expect(extractAssetUrls("<img src='https://cdn.example.com/single.png'>")).toEqual([
        'https://cdn.example.com/single.png',
      ]);
      expect(extractAssetUrls('<img src=https://cdn.example.com/bare.png alt=x>')).toEqual([
        'https://cdn.example.com/bare.png',
      ]);
    });

    it('tolerates whitespace around the equals sign', () => {
      expect(extractAssetUrls('<img  src = "https://cdn.example.com/spaced.png" >')).toEqual([
        'https://cdn.example.com/spaced.png',
      ]);
    });

    it('matches the tag name case-insensitively', () => {
      expect(extractAssetUrls('<IMG SRC="https://cdn.example.com/upper.png">')).toEqual([
        'https://cdn.example.com/upper.png',
      ]);
    });

    it('does not mistake srcset or data-src for src', () => {
      const html =
        '<img srcset="https://cdn.example.com/wide.png 2x" data-src="https://cdn.example.com/lazy.png">';
      expect(extractAssetUrls(html)).toEqual([]);
    });

    it('decodes HTML entities in the URL', () => {
      expect(
        extractAssetUrls('<img src="https://cdn.example.com/i.png?a=1&amp;b=2">')
      ).toEqual(['https://cdn.example.com/i.png?a=1&b=2']);
    });
  });

  describe('URL filtering', () => {
    // UnitInputSchema declares assets as z.array(z.string().url()), so anything
    // that is not an absolute http(s) URL would fail the shared contract.
    it('skips relative paths', () => {
      const html =
        '<img src="/static/logo.png"><img src="../images/a.png"><img src="photo.jpg">';
      expect(extractAssetUrls(html)).toEqual([]);
    });

    it('skips protocol-relative URLs', () => {
      expect(extractAssetUrls('<img src="//cdn.example.com/a.png">')).toEqual([]);
    });

    it('skips data URIs', () => {
      expect(extractAssetUrls('<img src="data:image/png;base64,iVBORw0KGgo=">')).toEqual([]);
    });

    it('skips non-http schemes', () => {
      const html =
        '<a href="mailto:teacher@example.com">Mail</a><a href="ftp://example.com/a.zip">FTP</a>';
      expect(extractAssetUrls(html)).toEqual([]);
    });

    it('keeps plain http alongside https', () => {
      expect(extractAssetUrls('<img src="http://cdn.example.com/a.png">')).toEqual([
        'http://cdn.example.com/a.png',
      ]);
    });
  });

  describe('deduplication', () => {
    it('returns each URL once, keeping first appearance order', () => {
      const html = `
        <img src="https://cdn.example.com/a.png">
        <img src="https://cdn.example.com/b.png">
        <img src="https://cdn.example.com/a.png">
        <a href="https://cdn.example.com/b.png">B again</a>
      `;
      expect(extractAssetUrls(html)).toEqual([
        'https://cdn.example.com/a.png',
        'https://cdn.example.com/b.png',
      ]);
    });

    it('treats URLs differing only by query string as distinct', () => {
      const html =
        '<img src="https://cdn.example.com/a.png"><img src="https://cdn.example.com/a.png?v=2">';
      expect(extractAssetUrls(html)).toEqual([
        'https://cdn.example.com/a.png',
        'https://cdn.example.com/a.png?v=2',
      ]);
    });
  });
});
