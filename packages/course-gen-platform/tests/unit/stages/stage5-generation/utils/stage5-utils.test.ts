/**
 * Tests for stage5-generation/utils — pure utility functions
 *
 * Covers:
 * - sanitize.ts: sanitizeCourseStructure, sanitizeCourseStructureWithLogging
 * - rag-fallback-queries.ts: buildFallbackSearchQueries
 * - prompt-helpers.ts: buildUserContextSection
 */

import { describe, it, expect } from 'vitest';
import {
    sanitizeCourseStructure,
    sanitizeCourseStructureWithLogging,
} from '@/stages/stage5-generation/utils/sanitize';
import { buildFallbackSearchQueries } from '@/stages/stage5-generation/utils/rag-fallback-queries';
import { buildUserContextSection } from '@/stages/stage5-generation/utils/prompt-helpers';
import type { CourseStructure } from '@megacampus/shared-types/generation-result';
import type { FrontendParameters } from '@megacampus/shared-types';

// Minimal course structure for tests
function makeCourseStructure(overrides: Partial<CourseStructure> = {}): CourseStructure {
    return {
        course_title: 'Test Course',
        course_description: 'A test course description',
        course_overview: 'Overview',
        target_audience: 'Developers',
        difficulty_level: 'beginner',
        estimated_duration: '4 hours',
        prerequisites: [],
        course_tags: [],
        sections: [],
        ...overrides,
    } as CourseStructure;
}

// ─────────────────────────────────────────────────────────────────────────────
// sanitizeCourseStructure
// ─────────────────────────────────────────────────────────────────────────────

describe('sanitizeCourseStructure', () => {
    it('returns clean structure unchanged', () => {
        const course = makeCourseStructure({ course_title: 'Clean Title' });
        const result = sanitizeCourseStructure(course);
        expect(result.course_title).toBe('Clean Title');
    });

    it('removes <script> tags from course_title', () => {
        const course = makeCourseStructure({
            course_title: "<script>alert('XSS')</script>Safe Title",
        });
        const result = sanitizeCourseStructure(course);
        expect(result.course_title).not.toContain('<script>');
        expect(result.course_title).toContain('Safe Title');
    });

    it('strips onclick handlers from descriptions', () => {
        const course = makeCourseStructure({
            course_description: "<p onclick=\"evil()\">Clean text content</p>",
        });
        const result = sanitizeCourseStructure(course);
        expect(result.course_description).not.toContain('onclick');
        expect(result.course_description).toContain('Clean text content');
    });

    it('sanitizes nested section titles', () => {
        const course = makeCourseStructure({
            sections: [
                {
                    section_title: '<img src=x onerror=alert(1)>Intro',
                    section_description: 'Safe description',
                    section_order: 1,
                    importance: 'complex',
                    lessons: [],
                },
            ],
        });
        const result = sanitizeCourseStructure(course);
        const section = result.sections[0];
        expect(section.section_title).not.toContain('<img');
        expect(section.section_title).toContain('Intro');
    });

    it('sanitizes lesson titles in nested sections', () => {
        const course = makeCourseStructure({
            sections: [
                {
                    section_title: 'Section 1',
                    section_description: 'Desc',
                    section_order: 1,
                    importance: 'complex',
                    lessons: [
                        {
                            lesson_title: "<a href='javascript:alert()'>Basics</a>",
                            lesson_order: 1,
                            lesson_objectives: [],
                            key_topics: [],
                            estimated_duration: '30 min',
                        } as any,
                    ],
                },
            ],
        });
        const result = sanitizeCourseStructure(course);
        const lesson = result.sections[0].lessons[0] as any;
        expect(lesson.lesson_title).not.toContain('<a');
        expect(lesson.lesson_title).toContain('Basics');
    });

    it('preserves arrays of primitives (course_tags)', () => {
        const course = makeCourseStructure({
            course_tags: ['javascript', 'react', 'typescript'],
        });
        const result = sanitizeCourseStructure(course);
        expect(result.course_tags).toEqual(['javascript', 'react', 'typescript']);
    });

    it('preserves numeric values (numbers, floats)', () => {
        const course = makeCourseStructure();
        // Add a numeric field via override
        const extra = { ...course, some_count: 42, rating: 4.5 } as any;
        const result = sanitizeCourseStructure(extra);
        expect(result.some_count).toBe(42);
        expect(result.rating).toBe(4.5);
    });

    it('does not mutate original structure (immutable)', () => {
        const course = makeCourseStructure({
            course_title: "<script>evil</script>Title",
        });
        const originalTitle = course.course_title;
        sanitizeCourseStructure(course);
        expect(course.course_title).toBe(originalTitle); // unchanged
    });

    it('handles null values without throwing', () => {
        const course = makeCourseStructure({ course_overview: null as any });
        expect(() => sanitizeCourseStructure(course)).not.toThrow();
    });

    it('removes ANSI escape codes from strings', () => {
        const course = makeCourseStructure({
            course_title: '\u001b[31mRed Title\u001b[0m',
        });
        const result = sanitizeCourseStructure(course);
        expect(result.course_title).not.toContain('\u001b[');
        expect(result.course_title).toContain('Red Title');
    });
});

describe('sanitizeCourseStructureWithLogging', () => {
    it('returns same sanitized content as sanitizeCourseStructure for clean input', () => {
        const course = makeCourseStructure({ course_title: 'Clean Title' });
        const result1 = sanitizeCourseStructure(course);
        const result2 = sanitizeCourseStructureWithLogging(course);
        expect(result2.course_title).toBe(result1.course_title);
    });

    it('logs XSS warning when content is removed', () => {
        // This test just verifies it does not throw
        const course = makeCourseStructure({
            course_title: "<script>alert('XSS')</script>Title",
        });
        expect(() => sanitizeCourseStructureWithLogging(course)).not.toThrow();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildFallbackSearchQueries
// ─────────────────────────────────────────────────────────────────────────────

describe('buildFallbackSearchQueries', () => {
    it('returns area + up to 3 key topics when sectionBreakdown provided', () => {
        const breakdown = {
            area: 'Machine Learning',
            key_topics: ['supervised', 'unsupervised', 'neural nets', 'deep learning'],
        };
        const result = buildFallbackSearchQueries(breakdown as any, 'Data Science', 1);
        expect(result).toHaveLength(4); // area + 3 topics (not 4)
        expect(result[0]).toBe('Machine Learning');
        expect(result[1]).toBe('supervised');
        expect(result[2]).toBe('unsupervised');
        expect(result[3]).toBe('neural nets');
        expect(result).not.toContain('deep learning'); // 4th topic excluded
    });

    it('returns "topic section N" when sectionBreakdown is undefined', () => {
        const result = buildFallbackSearchQueries(undefined, 'Data Science', 3);
        expect(result).toHaveLength(1);
        expect(result[0]).toBe('Data Science section 3');
    });

    it('uses "course" as fallback when topic is empty string', () => {
        const result = buildFallbackSearchQueries(undefined, '', 2);
        expect(result[0]).toBe('course section 2');
    });

    it('works with string section IDs', () => {
        const result = buildFallbackSearchQueries(undefined, 'ML', 'section-5');
        expect(result[0]).toBe('ML section section-5');
    });

    it('returns only area when key_topics is empty', () => {
        const breakdown = { area: 'Math', key_topics: [] };
        const result = buildFallbackSearchQueries(breakdown as any, 'Science', 1);
        expect(result).toHaveLength(1);
        expect(result[0]).toBe('Math');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildUserContextSection
// ─────────────────────────────────────────────────────────────────────────────

describe('buildUserContextSection', () => {
    it('returns empty string for minimal params', () => {
        const params: Partial<FrontendParameters> = {};
        const result = buildUserContextSection(params as FrontendParameters);
        expect(result).toBe('');
    });

    it('includes description when provided', () => {
        const params = { description: 'Build a REST API using Node.js and Express' } as FrontendParameters;
        const result = buildUserContextSection(params);
        expect(result).toContain('**User Requirements**');
        expect(result).toContain('Build a REST API using Node.js and Express');
    });

    it('includes target_audience when provided', () => {
        const params = { target_audience: 'Backend Developers' } as FrontendParameters;
        const result = buildUserContextSection(params);
        expect(result).toContain('**Target Audience**');
        expect(result).toContain('Backend Developers');
    });

    it('includes numbered learning outcomes', () => {
        const params = {
            learning_outcomes: ['Build REST APIs', 'Understand authentication', 'Deploy to cloud'],
        } as FrontendParameters;
        const result = buildUserContextSection(params);
        expect(result).toContain('**Required Learning Outcomes**');
        expect(result).toContain('1. Build REST APIs');
        expect(result).toContain('2. Understand authentication');
        expect(result).toContain('3. Deploy to cloud');
    });

    it('skips learning_outcomes when empty array', () => {
        const params = { learning_outcomes: [] } as FrontendParameters;
        const result = buildUserContextSection(params);
        expect(result).not.toContain('Learning Outcomes');
    });

    it('includes desired_lessons_count when course_size not auto', () => {
        const params = {
            desired_lessons_count: 12,
            desired_modules_count: 4,
        } as FrontendParameters;
        const result = buildUserContextSection(params);
        expect(result).toContain('12 lessons');
        expect(result).toContain('4 sections');
    });

    it('combines all provided sections', () => {
        const params = {
            description: 'Advanced course',
            target_audience: 'Senior engineers',
            learning_outcomes: ['Master TypeScript'],
        } as FrontendParameters;
        const result = buildUserContextSection(params);
        expect(result).toContain('**User Requirements**');
        expect(result).toContain('**Target Audience**');
        expect(result).toContain('**Required Learning Outcomes**');
    });
});
