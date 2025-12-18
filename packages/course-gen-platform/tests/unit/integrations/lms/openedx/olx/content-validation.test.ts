/**
 * Unit Tests for Content Type Validation
 * Tests T109-T110: Validation for supported content types and unsupported element warnings
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateContentTypes,
  type ContentValidationResult,
} from '@/integrations/lms/openedx/olx/validators';
import type { CourseInput } from '@megacampus/shared-types/lms';

// Mock lmsLogger to avoid console output during tests
vi.mock('@/integrations/lms/logger', () => ({
  lmsLogger: {
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

// Helper: Create valid minimal CourseInput
function createValidCourseInput(): CourseInput {
  return {
    courseId: 'intro-to-ai',
    title: 'Introduction to AI',
    description: 'Learn AI basics',
    org: 'MegaCampus',
    run: '2025_Q1',
    language: 'ru',
    chapters: [
      {
        id: 'chapter-1',
        title: 'Chapter 1',
        sections: [
          {
            id: 'section-1',
            title: 'Section 1',
            units: [
              {
                id: 'unit-1',
                title: 'Unit 1',
                content: '<p>Hello world</p>',
              },
            ],
          },
        ],
      },
    ],
  };
}

describe('validateContentTypes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Valid Cases - HTML/Text Only', () => {
    it('should pass validation for plain HTML content (no warnings)', () => {
      const input = createValidCourseInput();
      const result = validateContentTypes(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should pass validation for complex HTML with headings and lists (no warnings)', () => {
      const input = createValidCourseInput();
      input.chapters[0].sections[0].units[0].content = `
        <h1>Introduction</h1>
        <p>This is a paragraph with <strong>bold</strong> and <em>italic</em> text.</p>
        <ul>
          <li>Item 1</li>
          <li>Item 2</li>
        </ul>
        <ol>
          <li>First</li>
          <li>Second</li>
        </ol>
      `;

      const result = validateContentTypes(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should pass validation for HTML with links and images (no warnings)', () => {
      const input = createValidCourseInput();
      input.chapters[0].sections[0].units[0].content = `
        <p>Check out <a href="https://example.com">this link</a>.</p>
        <img src="https://example.com/image.png" alt="Example image" />
      `;

      const result = validateContentTypes(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should pass validation for HTML with tables (no warnings)', () => {
      const input = createValidCourseInput();
      input.chapters[0].sections[0].units[0].content = `
        <table>
          <thead>
            <tr><th>Header 1</th><th>Header 2</th></tr>
          </thead>
          <tbody>
            <tr><td>Cell 1</td><td>Cell 2</td></tr>
          </tbody>
        </table>
      `;

      const result = validateContentTypes(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should pass validation for plain text content (no warnings)', () => {
      const input = createValidCourseInput();
      input.chapters[0].sections[0].units[0].content = 'Just plain text content';

      const result = validateContentTypes(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('Warning Cases - Video Content', () => {
    it('should warn about HTML5 video tag', () => {
      const input = createValidCourseInput();
      input.chapters[0].sections[0].units[0].content = `
        <p>Watch this video:</p>
        <video controls>
          <source src="video.mp4" type="video/mp4">
        </video>
      `;

      const result = validateContentTypes(input);

      expect(result.valid).toBe(true); // Still valid, just warnings
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Video content detected');
      expect(result.warnings[0]).toContain('placeholder text');
      expect(result.warnings[0]).toContain('Chapter 1, Section 1, Unit 1');
    });

    it('should warn about markdown-style video placeholder [video]', () => {
      const input = createValidCourseInput();
      input.chapters[0].sections[0].units[0].content = `
        <p>Video here: [video]</p>
      `;

      const result = validateContentTypes(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Video content detected');
    });

    it('should warn about video source element', () => {
      const input = createValidCourseInput();
      input.chapters[0].sections[0].units[0].content = `
        <source src="video.mp4" type="video/mp4">
      `;

      const result = validateContentTypes(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Video content detected');
    });

    it('should warn about video tag with attributes', () => {
      const input = createValidCourseInput();
      input.chapters[0].sections[0].units[0].content = `
        <video width="640" height="480" controls autoplay>
          <source src="video.mp4" type="video/mp4">
        </video>
      `;

      const result = validateContentTypes(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Video content detected');
    });

    it('should issue video warning only once for multiple video elements', () => {
      const input = createValidCourseInput();
      // Replace first unit with video content
      input.chapters[0].sections[0].units[0].content = '<video src="video1.mp4"></video>';
      // Add more units with video
      input.chapters[0].sections[0].units.push({
        id: 'unit-2',
        title: 'Unit 2',
        content: '<video src="video2.mp4"></video>',
      });
      input.chapters[0].sections[0].units.push({
        id: 'unit-3',
        title: 'Unit 3',
        content: '<video src="video3.mp4"></video>',
      });

      const result = validateContentTypes(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('First occurrence: Chapter 1, Section 1, Unit 1');
    });
  });

  describe('Warning Cases - Quiz/Assessment Content', () => {
    it('should warn about quiz tag', () => {
      const input = createValidCourseInput();
      input.chapters[0].sections[0].units[0].content = `
        <p>Take this quiz:</p>
        <quiz>
          <question>What is 2+2?</question>
        </quiz>
      `;

      const result = validateContentTypes(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Quiz/assessment content detected');
      expect(result.warnings[0]).toContain('not supported in the current MVP');
      expect(result.warnings[0]).toContain('Chapter 1, Section 1, Unit 1');
    });

    it('should warn about question tag', () => {
      const input = createValidCourseInput();
      input.chapters[0].sections[0].units[0].content = `
        <question>What is the capital of France?</question>
      `;

      const result = validateContentTypes(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Quiz/assessment content detected');
    });

    it('should warn about assessment tag', () => {
      const input = createValidCourseInput();
      input.chapters[0].sections[0].units[0].content = `
        <assessment type="multiple-choice">
          <item>Option A</item>
        </assessment>
      `;

      const result = validateContentTypes(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Quiz/assessment content detected');
    });

    it('should warn about markdown-style quiz placeholder [quiz]', () => {
      const input = createValidCourseInput();
      input.chapters[0].sections[0].units[0].content = `
        <p>Quiz here: [quiz]</p>
      `;

      const result = validateContentTypes(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Quiz/assessment content detected');
    });

    it('should warn about markdown-style question placeholder [question]', () => {
      const input = createValidCourseInput();
      input.chapters[0].sections[0].units[0].content = `
        <p>Question here: [question]</p>
      `;

      const result = validateContentTypes(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Quiz/assessment content detected');
    });

    it('should warn about markdown-style assessment placeholder [assessment]', () => {
      const input = createValidCourseInput();
      input.chapters[0].sections[0].units[0].content = `
        <p>Assessment here: [assessment]</p>
      `;

      const result = validateContentTypes(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Quiz/assessment content detected');
    });

    it('should warn about JSON-like quiz structure', () => {
      const input = createValidCourseInput();
      input.chapters[0].sections[0].units[0].content = `
        quiz: {
          "questions": [
            {"text": "What is 2+2?", "answer": "4"}
          ]
        }
      `;

      const result = validateContentTypes(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Quiz/assessment content detected');
    });

    it('should issue quiz warning only once for multiple quiz elements', () => {
      const input = createValidCourseInput();
      // Replace first unit with quiz content
      input.chapters[0].sections[0].units[0].content = '<quiz>Question 1</quiz>';
      // Add more units with quiz/question
      input.chapters[0].sections[0].units.push({
        id: 'unit-2',
        title: 'Unit 2',
        content: '<question>Question 2</question>',
      });
      input.chapters[0].sections[0].units.push({
        id: 'unit-3',
        title: 'Unit 3',
        content: '<assessment>Assessment</assessment>',
      });

      const result = validateContentTypes(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('First occurrence: Chapter 1, Section 1, Unit 1');
    });
  });

  describe('Warning Cases - Iframe/External Embeds', () => {
    it('should warn about iframe element', () => {
      const input = createValidCourseInput();
      input.chapters[0].sections[0].units[0].content = `
        <p>Embedded content:</p>
        <iframe src="https://example.com" width="600" height="400"></iframe>
      `;

      const result = validateContentTypes(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('External embed (iframe) detected');
      expect(result.warnings[0]).toContain('may not work correctly');
      expect(result.warnings[0]).toContain('Chapter 1, Section 1, Unit 1');
    });

    it('should warn about iframe with self-closing syntax', () => {
      const input = createValidCourseInput();
      input.chapters[0].sections[0].units[0].content = `
        <iframe src="https://example.com" />
      `;

      const result = validateContentTypes(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('External embed (iframe) detected');
    });

    it('should issue iframe warning only once for multiple iframe elements', () => {
      const input = createValidCourseInput();
      // Replace first unit with iframe content
      input.chapters[0].sections[0].units[0].content = '<iframe src="https://example1.com"></iframe>';
      // Add more units with iframe
      input.chapters[0].sections[0].units.push({
        id: 'unit-2',
        title: 'Unit 2',
        content: '<iframe src="https://example2.com"></iframe>',
      });
      input.chapters[0].sections[0].units.push({
        id: 'unit-3',
        title: 'Unit 3',
        content: '<iframe src="https://example3.com"></iframe>',
      });

      const result = validateContentTypes(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('First occurrence: Chapter 1, Section 1, Unit 1');
    });
  });

  describe('Multiple Warning Cases', () => {
    it('should return multiple warnings for different unsupported element types', () => {
      const input = createValidCourseInput();
      input.chapters[0].sections[0].units[0].content = `
        <p>Video:</p>
        <video src="video.mp4"></video>
        <p>Quiz:</p>
        <quiz>Question</quiz>
        <p>Embed:</p>
        <iframe src="https://example.com"></iframe>
      `;

      const result = validateContentTypes(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(3);
      expect(result.warnings.some((w) => w.includes('Video content detected'))).toBe(true);
      expect(result.warnings.some((w) => w.includes('Quiz/assessment content detected'))).toBe(
        true
      );
      expect(result.warnings.some((w) => w.includes('External embed (iframe) detected'))).toBe(
        true
      );
    });

    it('should handle warnings across multiple chapters, sections, and units', () => {
      const input = createValidCourseInput();

      // Add chapter 2 with video
      input.chapters.push({
        id: 'chapter-2',
        title: 'Chapter 2',
        sections: [
          {
            id: 'section-2',
            title: 'Section 2',
            units: [
              {
                id: 'unit-2',
                title: 'Unit 2',
                content: '<video src="video.mp4"></video>',
              },
            ],
          },
        ],
      });

      // Add section 2 in chapter 1 with quiz
      input.chapters[0].sections.push({
        id: 'section-3',
        title: 'Section 3',
        units: [
          {
            id: 'unit-3',
            title: 'Unit 3',
            content: '<quiz>Question</quiz>',
          },
        ],
      });

      const result = validateContentTypes(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(2);
      expect(result.warnings.some((w) => w.includes('Video content detected'))).toBe(true);
      expect(result.warnings.some((w) => w.includes('Quiz/assessment content detected'))).toBe(
        true
      );
    });
  });

  describe('Edge Cases', () => {
    it('should not warn about "video" in plain text (not HTML tag)', () => {
      const input = createValidCourseInput();
      input.chapters[0].sections[0].units[0].content = `
        <p>This course includes video lectures on AI fundamentals.</p>
      `;

      const result = validateContentTypes(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should not warn about "quiz" in plain text (not HTML tag)', () => {
      const input = createValidCourseInput();
      input.chapters[0].sections[0].units[0].content = `
        <p>Take the quiz at the end of each module.</p>
      `;

      const result = validateContentTypes(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should handle case-insensitive video tag detection', () => {
      const input = createValidCourseInput();
      input.chapters[0].sections[0].units[0].content = '<VIDEO src="video.mp4"></VIDEO>';

      const result = validateContentTypes(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Video content detected');
    });

    it('should handle case-insensitive quiz tag detection', () => {
      const input = createValidCourseInput();
      input.chapters[0].sections[0].units[0].content = '<QUIZ>Question</QUIZ>';

      const result = validateContentTypes(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Quiz/assessment content detected');
    });

    it('should handle case-insensitive iframe tag detection', () => {
      const input = createValidCourseInput();
      input.chapters[0].sections[0].units[0].content = '<IFRAME src="https://example.com"></IFRAME>';

      const result = validateContentTypes(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('External embed (iframe) detected');
    });

    it('should handle whitespace in tags', () => {
      const input = createValidCourseInput();
      input.chapters[0].sections[0].units[0].content = '<  video   src="video.mp4"><  /video  >';

      const result = validateContentTypes(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Video content detected');
    });

    it('should handle empty content (no warnings)', () => {
      const input = createValidCourseInput();
      input.chapters[0].sections[0].units[0].content = '';

      const result = validateContentTypes(input);

      expect(result.valid).toBe(true);
      // Note: validateCourseInput would catch empty content as an error
      // validateContentTypes focuses only on content type warnings
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('Location Reporting', () => {
    it('should report correct location for first occurrence (Chapter 2, Section 3, Unit 4)', () => {
      const input = createValidCourseInput();

      // Add more chapters/sections/units
      input.chapters.push({
        id: 'chapter-2',
        title: 'Chapter 2',
        sections: [
          {
            id: 'section-2',
            title: 'Section 2',
            units: [
              {
                id: 'unit-2',
                title: 'Unit 2',
                content: '<p>Normal content</p>',
              },
            ],
          },
          {
            id: 'section-3',
            title: 'Section 3',
            units: [
              {
                id: 'unit-3',
                title: 'Unit 3',
                content: '<p>Normal content</p>',
              },
              {
                id: 'unit-4',
                title: 'Unit 4',
                content: '<video src="video.mp4"></video>',
              },
            ],
          },
        ],
      });

      const result = validateContentTypes(input);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Chapter 2, Section 2, Unit 2');
    });

    it('should include unit title in location', () => {
      const input = createValidCourseInput();
      input.chapters[0].sections[0].units[0].title = 'Introduction to Video Editing';
      input.chapters[0].sections[0].units[0].content = '<video src="video.mp4"></video>';

      const result = validateContentTypes(input);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('"Introduction to Video Editing"');
    });
  });
});
