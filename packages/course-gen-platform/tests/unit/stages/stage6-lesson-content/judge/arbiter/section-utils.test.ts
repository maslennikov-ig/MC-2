/**
 * Tests for stage6-lesson-content/judge/arbiter/section-utils.ts
 *
 * Covers section ID parsing, location normalization, and section ID extraction.
 */
import { describe, it, expect } from 'vitest';
import {
  parseSectionIndex,
  normalizeLocation,
  extractSectionIdFromLocation,
} from '@/stages/stage6-lesson-content/judge/arbiter/section-utils';

describe('parseSectionIndex', () => {
  it('parses numeric sections correctly', () => {
    expect(parseSectionIndex('sec_0')).toBe(0);
    expect(parseSectionIndex('sec_1')).toBe(1);
    expect(parseSectionIndex('sec_42')).toBe(42);
  });

  it('handles introduction specifically', () => {
    expect(parseSectionIndex('sec_introduction')).toBe(0);
    expect(parseSectionIndex('intro')).toBe(0);
  });

  it('handles conclusion and summary', () => {
    expect(parseSectionIndex('sec_conclusion')).toBe(9999);
    expect(parseSectionIndex('summary')).toBe(9999);
  });

  it('handles global locations', () => {
    expect(parseSectionIndex('global')).toBe(10000);
    expect(parseSectionIndex('sec_global')).toBe(10000);
  });

  it('handles named sections (content, examples, exercises)', () => {
    expect(parseSectionIndex('content')).toBe(100);
    expect(parseSectionIndex('examples')).toBe(101);
    expect(parseSectionIndex('exercises')).toBe(102);
  });

  it('returns high value for unknown sections', () => {
    expect(parseSectionIndex('unknown_section')).toBe(5000);
  });
});

describe('normalizeLocation', () => {
  it('extracts section number from loose text', () => {
    expect(normalizeLocation('section 2')).toBe('section_2');
    expect(normalizeLocation('Section 5, paragraph 3')).toBe('section_5');
  });

  it('normalizes introduction', () => {
    expect(normalizeLocation('In the Introduction')).toBe('introduction');
    expect(normalizeLocation('intro')).toBe('introduction');
  });

  it('normalizes conclusion', () => {
    expect(normalizeLocation('Conclusion')).toBe('conclusion');
    expect(normalizeLocation('In the summary')).toBe('conclusion');
  });

  it('maps lesson-wide and generic locations to global', () => {
    const globalTerms = [
      'entire lesson',
      'whole lesson',
      'overall',
      'lesson-wide',
      'all sections',
      'content sections',
      'throughout',
      'multiple sections',
      'various',
    ];
    for (const term of globalTerms) {
      expect(normalizeLocation(`This applies to ${term}`)).toBe('global');
    }
    const exactTerms = ['lesson', 'general', 'content'];
    for (const term of exactTerms) {
      expect(normalizeLocation(term)).toBe('global');
    }
  });

  it('extracts first word for unrecognized specific locations', () => {
    expect(normalizeLocation('Formatting issue on page 2')).toBe('formatting');
    expect(normalizeLocation('Syntax error in code')).toBe('syntax');
  });

  it('maps non-specific leading words to global', () => {
    expect(normalizeLocation('All of the above')).toBe('global');
    expect(normalizeLocation('Some parts of the text')).toBe('global');
  });
});

describe('extractSectionIdFromLocation', () => {
  it('extracts section ID from formatted string', () => {
    expect(extractSectionIdFromLocation('sec_4')).toBe('sec_4');
    expect(extractSectionIdFromLocation('In SEC_1')).toBe('sec_1');
  });

  it('extracts section ID from plain text', () => {
    expect(extractSectionIdFromLocation('section 2')).toBe('sec_2');
    expect(extractSectionIdFromLocation('See section 10 for details')).toBe('sec_10');
  });

  it('handles named sections', () => {
    expect(extractSectionIdFromLocation('introduction')).toBe('sec_introduction');
    expect(extractSectionIdFromLocation('conclusion')).toBe('sec_conclusion');
  });

  it('maps examples and exercises to conclusion', () => {
    expect(extractSectionIdFromLocation('exercises')).toBe('sec_conclusion');
    expect(extractSectionIdFromLocation('examples')).toBe('sec_conclusion');
  });

  it('maps global locations to sec_global', () => {
    expect(extractSectionIdFromLocation('overall')).toBe('sec_global');
    expect(extractSectionIdFromLocation('entire lesson')).toBe('sec_global');
  });

  it('matches against section titles if provided', () => {
    const titles = ['Getting Started', 'Advanced Topics', 'Conclusion'];
    expect(extractSectionIdFromLocation('in advanced topics', titles)).toBe('sec_2');
    expect(extractSectionIdFromLocation('getting started section', titles)).toBe('sec_1');
  });

  it('falls back to sec_global for entirely unrecognized locations without titles', () => {
    expect(extractSectionIdFromLocation('Random unparseable location')).toBe('sec_global');
  });
});
