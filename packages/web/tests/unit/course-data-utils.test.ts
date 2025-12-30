import { describe, it, expect } from 'vitest';
import {
  isValidShareToken,
  groupAssetsByLessonId,
  prepareSectionsForViewer,
  prepareLessonsForViewer,
  sanitizeTokenForLog,
  SHARE_TOKEN_CONFIG,
} from '@/lib/course-data-utils';
import type { Database } from '@/types/database.generated';

// Database row types for testing
type SectionRow = Database['public']['Tables']['sections']['Row'];
type LessonRow = Database['public']['Tables']['lessons']['Row'];
type AssetRow = Database['public']['Tables']['assets']['Row'];

describe('course-data-utils', () => {
  describe('isValidShareToken', () => {
    describe('valid tokens', () => {
      it('should accept valid alphanumeric tokens', () => {
        expect(isValidShareToken('share_abc123def456')).toBe(true);
        expect(isValidShareToken('share_ABC123XYZ789')).toBe(true);
        expect(isValidShareToken('share_0123456789')).toBe(true);
      });

      it('should accept tokens with hyphens and underscores', () => {
        expect(isValidShareToken('share_test-token_123')).toBe(true);
        expect(isValidShareToken('share_my-test_token-123')).toBe(true);
        expect(isValidShareToken('share_a-b-c_1-2-3')).toBe(true);
      });

      it('should accept tokens at minimum length boundary (10 chars)', () => {
        expect(isValidShareToken('share_1234')).toBe(true); // Exactly 10 chars
      });

      it('should accept tokens at maximum length boundary (50 chars)', () => {
        const maxToken = 'share_' + 'a'.repeat(44); // Exactly 50 chars
        expect(isValidShareToken(maxToken)).toBe(true);
      });

      it('should accept mixed case alphanumeric tokens', () => {
        expect(isValidShareToken('share_AbC123XyZ')).toBe(true);
        expect(isValidShareToken('share_Test_Token_2024')).toBe(true);
      });
    });

    describe('invalid tokens', () => {
      it('should reject tokens without share_ prefix', () => {
        expect(isValidShareToken('invalid_abc123')).toBe(false);
        expect(isValidShareToken('token_abc123')).toBe(false);
        expect(isValidShareToken('abc123def456')).toBe(false);
      });

      it('should reject tokens that are too short', () => {
        expect(isValidShareToken('share_')).toBe(false); // 6 chars
        expect(isValidShareToken('share_ab')).toBe(false); // 8 chars
        expect(isValidShareToken('share_abc')).toBe(false); // 9 chars (< MIN_LENGTH)
      });

      it('should reject tokens that are too long', () => {
        const tooLong = 'share_' + 'a'.repeat(50); // 56 chars (> MAX_LENGTH)
        expect(isValidShareToken(tooLong)).toBe(false);

        const wayTooLong = 'a'.repeat(100);
        expect(isValidShareToken(wayTooLong)).toBe(false);
      });

      it('should reject tokens with special characters', () => {
        expect(isValidShareToken('share_<script>')).toBe(false);
        expect(isValidShareToken('share_abc@123')).toBe(false);
        expect(isValidShareToken('share_abc#123')).toBe(false);
        expect(isValidShareToken('share_abc!123')).toBe(false);
        expect(isValidShareToken('share_abc$123')).toBe(false);
        expect(isValidShareToken('share_abc%123')).toBe(false);
        expect(isValidShareToken('share_abc&123')).toBe(false);
      });

      it('should reject tokens with spaces', () => {
        expect(isValidShareToken('share_ abc123')).toBe(false);
        expect(isValidShareToken('share_abc 123')).toBe(false);
        expect(isValidShareToken('share_abc123 ')).toBe(false);
      });

      it('should reject tokens with path separators', () => {
        expect(isValidShareToken('share_abc/123')).toBe(false);
        expect(isValidShareToken('share_abc\\123')).toBe(false);
        expect(isValidShareToken('share_../../../')).toBe(false);
      });

      it('should reject undefined and empty values', () => {
        expect(isValidShareToken(undefined)).toBe(false);
        expect(isValidShareToken('')).toBe(false);
      });

      it('should reject tokens with only prefix', () => {
        expect(isValidShareToken('share_')).toBe(false);
      });
    });

    describe('SHARE_TOKEN_CONFIG constants', () => {
      it('should have correct configuration values', () => {
        expect(SHARE_TOKEN_CONFIG.PREFIX).toBe('share_');
        expect(SHARE_TOKEN_CONFIG.MIN_LENGTH).toBe(10);
        expect(SHARE_TOKEN_CONFIG.MAX_LENGTH).toBe(50);
        expect(SHARE_TOKEN_CONFIG.VALID_PATTERN).toBeInstanceOf(RegExp);
      });

      it('should match pattern against valid tokens', () => {
        expect(SHARE_TOKEN_CONFIG.VALID_PATTERN.test('share_abc123')).toBe(true);
        expect(SHARE_TOKEN_CONFIG.VALID_PATTERN.test('share_test-token_123')).toBe(true);
      });

      it('should not match pattern against invalid tokens', () => {
        expect(SHARE_TOKEN_CONFIG.VALID_PATTERN.test('invalid_abc123')).toBe(false);
        expect(SHARE_TOKEN_CONFIG.VALID_PATTERN.test('share_abc@123')).toBe(false);
      });
    });
  });

  describe('groupAssetsByLessonId', () => {
    describe('successful grouping', () => {
      it('should group assets by lesson_id', () => {
        const assets: Partial<AssetRow>[] = [
          { id: 'asset-1', lesson_id: 'lesson-1', asset_type: 'image' },
          { id: 'asset-2', lesson_id: 'lesson-1', asset_type: 'video' },
          { id: 'asset-3', lesson_id: 'lesson-2', asset_type: 'image' },
        ];

        const result = groupAssetsByLessonId(assets as AssetRow[]);

        expect(Object.keys(result)).toHaveLength(2);
        expect(result['lesson-1']).toHaveLength(2);
        expect(result['lesson-2']).toHaveLength(1);
      });

      it('should preserve asset properties', () => {
        const assets: Partial<AssetRow>[] = [
          {
            id: 'asset-1',
            lesson_id: 'lesson-1',
            asset_type: 'image',
            url: 'https://example.com/image.png',
          },
        ];

        const result = groupAssetsByLessonId(assets as AssetRow[]);

        expect(result['lesson-1'][0].id).toBe('asset-1');
        expect(result['lesson-1'][0].asset_type).toBe('image');
        expect(result['lesson-1'][0].url).toBe('https://example.com/image.png');
      });

      it('should handle multiple assets for same lesson', () => {
        const assets: Partial<AssetRow>[] = [
          { id: 'asset-1', lesson_id: 'lesson-1', asset_type: 'image' },
          { id: 'asset-2', lesson_id: 'lesson-1', asset_type: 'video' },
          { id: 'asset-3', lesson_id: 'lesson-1', asset_type: 'audio' },
          { id: 'asset-4', lesson_id: 'lesson-1', asset_type: 'document' },
        ];

        const result = groupAssetsByLessonId(assets as AssetRow[]);

        expect(result['lesson-1']).toHaveLength(4);
        expect(result['lesson-1'].map((a) => a.id)).toEqual([
          'asset-1',
          'asset-2',
          'asset-3',
          'asset-4',
        ]);
      });

      it('should maintain asset order within groups', () => {
        const assets: Partial<AssetRow>[] = [
          { id: 'asset-1', lesson_id: 'lesson-1', asset_type: 'image' },
          { id: 'asset-2', lesson_id: 'lesson-2', asset_type: 'video' },
          { id: 'asset-3', lesson_id: 'lesson-1', asset_type: 'audio' },
        ];

        const result = groupAssetsByLessonId(assets as AssetRow[]);

        expect(result['lesson-1'][0].id).toBe('asset-1');
        expect(result['lesson-1'][1].id).toBe('asset-3');
      });
    });

    describe('edge cases', () => {
      it('should return empty object for null input', () => {
        const result = groupAssetsByLessonId(null);
        expect(result).toEqual({});
      });

      it('should return empty object for empty array', () => {
        const result = groupAssetsByLessonId([]);
        expect(result).toEqual({});
      });

      it('should skip assets without lesson_id', () => {
        const assets: Partial<AssetRow>[] = [
          { id: 'asset-1', lesson_id: 'lesson-1', asset_type: 'image' },
          { id: 'asset-2', lesson_id: null, asset_type: 'video' },
          { id: 'asset-3', asset_type: 'audio' } as any, // no lesson_id field
        ];

        const result = groupAssetsByLessonId(assets as AssetRow[]);

        expect(Object.keys(result)).toHaveLength(1);
        expect(result['lesson-1']).toHaveLength(1);
        expect(result['lesson-1'][0].id).toBe('asset-1');
      });

      it('should skip assets with undefined lesson_id', () => {
        const assets: Partial<AssetRow>[] = [
          { id: 'asset-1', lesson_id: 'lesson-1', asset_type: 'image' },
          { id: 'asset-2', lesson_id: undefined, asset_type: 'video' },
        ];

        const result = groupAssetsByLessonId(assets as AssetRow[]);

        expect(Object.keys(result)).toHaveLength(1);
        expect(result['lesson-1']).toBeDefined();
      });

      it('should handle array with only invalid assets', () => {
        const assets: Partial<AssetRow>[] = [
          { id: 'asset-1', lesson_id: null, asset_type: 'image' },
          { id: 'asset-2', lesson_id: undefined, asset_type: 'video' },
        ];

        const result = groupAssetsByLessonId(assets as AssetRow[]);

        expect(Object.keys(result)).toHaveLength(0);
        expect(result).toEqual({});
      });
    });
  });

  describe('prepareSectionsForViewer', () => {
    const courseId = 'course-123';

    describe('section transformation', () => {
      it('should transform sections with computed properties', () => {
        const sections: Partial<SectionRow>[] = [
          {
            id: 'section-1',
            course_id: courseId,
            title: 'Introduction',
            order_index: 1,
          },
        ];

        const result = prepareSectionsForViewer(
          sections as SectionRow[],
          null,
          courseId
        );

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('section-1');
        expect(result[0].section_number).toBe('1');
        expect(result[0].order_number).toBe(1);
        expect(result[0].lessons).toEqual([]);
      });

      it('should handle null order_index with empty string', () => {
        const sections: Partial<SectionRow>[] = [
          {
            id: 'section-1',
            course_id: courseId,
            title: 'Introduction',
            order_index: null,
          },
        ];

        const result = prepareSectionsForViewer(
          sections as SectionRow[],
          null,
          courseId
        );

        expect(result[0].section_number).toBe('');
        expect(result[0].order_number).toBeNull();
      });

      it('should preserve all section properties', () => {
        const sections: Partial<SectionRow>[] = [
          {
            id: 'section-1',
            course_id: courseId,
            title: 'Introduction',
            description: 'Section description',
            order_index: 1,
            created_at: '2024-01-01T00:00:00Z',
          },
        ];

        const result = prepareSectionsForViewer(
          sections as SectionRow[],
          null,
          courseId
        );

        expect(result[0].title).toBe('Introduction');
        expect(result[0].description).toBe('Section description');
        expect(result[0].created_at).toBe('2024-01-01T00:00:00Z');
      });
    });

    describe('lesson association', () => {
      it('should associate lessons with correct sections', () => {
        const sections: Partial<SectionRow>[] = [
          { id: 'section-1', course_id: courseId, title: 'Section 1', order_index: 1 },
          { id: 'section-2', course_id: courseId, title: 'Section 2', order_index: 2 },
        ];

        const lessons: Partial<LessonRow>[] = [
          {
            id: 'lesson-1',
            section_id: 'section-1',
            title: 'Lesson 1.1',
            order_index: 1,
          },
          {
            id: 'lesson-2',
            section_id: 'section-1',
            title: 'Lesson 1.2',
            order_index: 2,
          },
          {
            id: 'lesson-3',
            section_id: 'section-2',
            title: 'Lesson 2.1',
            order_index: 1,
          },
        ];

        const result = prepareSectionsForViewer(
          sections as SectionRow[],
          lessons as LessonRow[],
          courseId
        );

        expect(result[0].lessons).toHaveLength(2);
        expect(result[1].lessons).toHaveLength(1);
        expect(result[0].lessons[0].id).toBe('lesson-1');
        expect(result[0].lessons[1].id).toBe('lesson-2');
        expect(result[1].lessons[0].id).toBe('lesson-3');
      });

      it('should add computed properties to lessons', () => {
        const sections: Partial<SectionRow>[] = [
          { id: 'section-1', course_id: courseId, title: 'Section 1', order_index: 1 },
        ];

        const lessons: Partial<LessonRow>[] = [
          {
            id: 'lesson-1',
            section_id: 'section-1',
            title: 'Lesson 1',
            order_index: 3,
          },
        ];

        const result = prepareSectionsForViewer(
          sections as SectionRow[],
          lessons as LessonRow[],
          courseId
        );

        expect(result[0].lessons[0].lesson_number).toBe('3');
        expect(result[0].lessons[0].course_id).toBe(courseId);
        expect(result[0].lessons[0].order_number).toBe(3);
      });

      it('should handle section with no lessons', () => {
        const sections: Partial<SectionRow>[] = [
          { id: 'section-1', course_id: courseId, title: 'Section 1', order_index: 1 },
        ];

        const lessons: Partial<LessonRow>[] = [
          {
            id: 'lesson-1',
            section_id: 'section-2', // Different section
            title: 'Lesson 1',
            order_index: 1,
          },
        ];

        const result = prepareSectionsForViewer(
          sections as SectionRow[],
          lessons as LessonRow[],
          courseId
        );

        expect(result[0].lessons).toHaveLength(0);
      });

      it('should handle null lessons array', () => {
        const sections: Partial<SectionRow>[] = [
          { id: 'section-1', course_id: courseId, title: 'Section 1', order_index: 1 },
        ];

        const result = prepareSectionsForViewer(
          sections as SectionRow[],
          null,
          courseId
        );

        expect(result[0].lessons).toEqual([]);
      });
    });

    describe('edge cases', () => {
      it('should return empty array for null sections', () => {
        const result = prepareSectionsForViewer(null, null, courseId);
        expect(result).toEqual([]);
      });

      it('should handle multiple sections with mixed lesson counts', () => {
        const sections: Partial<SectionRow>[] = [
          { id: 'section-1', course_id: courseId, title: 'Section 1', order_index: 1 },
          { id: 'section-2', course_id: courseId, title: 'Section 2', order_index: 2 },
          { id: 'section-3', course_id: courseId, title: 'Section 3', order_index: 3 },
        ];

        const lessons: Partial<LessonRow>[] = [
          { id: 'lesson-1', section_id: 'section-1', title: 'Lesson 1.1', order_index: 1 },
          { id: 'lesson-2', section_id: 'section-1', title: 'Lesson 1.2', order_index: 2 },
          { id: 'lesson-3', section_id: 'section-1', title: 'Lesson 1.3', order_index: 3 },
          // section-2 has no lessons
          { id: 'lesson-4', section_id: 'section-3', title: 'Lesson 3.1', order_index: 1 },
        ];

        const result = prepareSectionsForViewer(
          sections as SectionRow[],
          lessons as LessonRow[],
          courseId
        );

        expect(result[0].lessons).toHaveLength(3);
        expect(result[1].lessons).toHaveLength(0);
        expect(result[2].lessons).toHaveLength(1);
      });
    });
  });

  describe('prepareLessonsForViewer', () => {
    const courseId = 'course-123';

    describe('lesson transformation', () => {
      it('should transform lessons with computed properties', () => {
        const lessons: Partial<LessonRow>[] = [
          {
            id: 'lesson-1',
            section_id: 'section-1',
            title: 'Lesson 1',
            order_index: 1,
          },
        ];

        const result = prepareLessonsForViewer(lessons as LessonRow[], courseId);

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('lesson-1');
        expect(result[0].lesson_number).toBe('1');
        expect(result[0].course_id).toBe(courseId);
        expect(result[0].order_number).toBe(1);
      });

      it('should handle null order_index with empty string', () => {
        const lessons: Partial<LessonRow>[] = [
          {
            id: 'lesson-1',
            section_id: 'section-1',
            title: 'Lesson 1',
            order_index: null,
          },
        ];

        const result = prepareLessonsForViewer(lessons as LessonRow[], courseId);

        expect(result[0].lesson_number).toBe('');
        expect(result[0].order_number).toBeNull();
      });

      it('should preserve all lesson properties', () => {
        const lessons: Partial<LessonRow>[] = [
          {
            id: 'lesson-1',
            section_id: 'section-1',
            title: 'Lesson 1',
            content: 'Lesson content',
            duration_minutes: 30,
            order_index: 1,
            created_at: '2024-01-01T00:00:00Z',
          },
        ];

        const result = prepareLessonsForViewer(lessons as LessonRow[], courseId);

        expect(result[0].title).toBe('Lesson 1');
        expect(result[0].content).toBe('Lesson content');
        expect(result[0].duration_minutes).toBe(30);
        expect(result[0].created_at).toBe('2024-01-01T00:00:00Z');
      });
    });

    describe('multiple lessons', () => {
      it('should transform multiple lessons', () => {
        const lessons: Partial<LessonRow>[] = [
          { id: 'lesson-1', section_id: 'section-1', title: 'Lesson 1', order_index: 1 },
          { id: 'lesson-2', section_id: 'section-1', title: 'Lesson 2', order_index: 2 },
          { id: 'lesson-3', section_id: 'section-2', title: 'Lesson 3', order_index: 1 },
        ];

        const result = prepareLessonsForViewer(lessons as LessonRow[], courseId);

        expect(result).toHaveLength(3);
        expect(result[0].lesson_number).toBe('1');
        expect(result[1].lesson_number).toBe('2');
        expect(result[2].lesson_number).toBe('1');
        expect(result.every((l) => l.course_id === courseId)).toBe(true);
      });

      it('should maintain lesson order', () => {
        const lessons: Partial<LessonRow>[] = [
          { id: 'lesson-3', section_id: 'section-1', title: 'Lesson 3', order_index: 3 },
          { id: 'lesson-1', section_id: 'section-1', title: 'Lesson 1', order_index: 1 },
          { id: 'lesson-2', section_id: 'section-1', title: 'Lesson 2', order_index: 2 },
        ];

        const result = prepareLessonsForViewer(lessons as LessonRow[], courseId);

        expect(result[0].id).toBe('lesson-3');
        expect(result[1].id).toBe('lesson-1');
        expect(result[2].id).toBe('lesson-2');
      });
    });

    describe('edge cases', () => {
      it('should return empty array for null lessons', () => {
        const result = prepareLessonsForViewer(null, courseId);
        expect(result).toEqual([]);
      });

      it('should handle empty lessons array', () => {
        const result = prepareLessonsForViewer([], courseId);
        expect(result).toEqual([]);
      });

      it('should handle lessons with various order_index values', () => {
        const lessons: Partial<LessonRow>[] = [
          { id: 'lesson-1', section_id: 'section-1', title: 'Lesson 1', order_index: 0 },
          { id: 'lesson-2', section_id: 'section-1', title: 'Lesson 2', order_index: 100 },
          { id: 'lesson-3', section_id: 'section-1', title: 'Lesson 3', order_index: null },
        ];

        const result = prepareLessonsForViewer(lessons as LessonRow[], courseId);

        // Note: order_index of 0 is treated as falsy, so becomes ''
        expect(result[0].lesson_number).toBe('');
        expect(result[1].lesson_number).toBe('100');
        expect(result[2].lesson_number).toBe('');
      });
    });
  });

  describe('sanitizeTokenForLog', () => {
    describe('token masking', () => {
      it('should mask token keeping only first 10 characters', () => {
        const token = 'share_abc123def456';
        const result = sanitizeTokenForLog(token);

        expect(result).toBe('share_abc1***');
        expect(result).toHaveLength(13); // 10 chars + '***'
      });

      it('should mask long tokens', () => {
        const longToken = 'share_' + 'a'.repeat(40);
        const result = sanitizeTokenForLog(longToken);

        expect(result).toBe('share_aaaa***');
        expect(result.length).toBe(13);
      });

      it('should show exactly 10 characters before masking', () => {
        const token = 'share_test-token_123456789';
        const result = sanitizeTokenForLog(token);

        expect(result.slice(0, 10)).toBe('share_test');
        expect(result.slice(10)).toBe('***');
      });
    });

    describe('short tokens', () => {
      it('should return *** for short tokens', () => {
        expect(sanitizeTokenForLog('short')).toBe('***');
      });

      it('should return *** for empty string', () => {
        expect(sanitizeTokenForLog('')).toBe('***');
      });

      it('should return *** for tokens less than 10 characters', () => {
        expect(sanitizeTokenForLog('share_')).toBe('***');
        expect(sanitizeTokenForLog('share_abc')).toBe('***');
        expect(sanitizeTokenForLog('123456789')).toBe('***'); // 9 chars
      });

      it('should mask tokens exactly 10 characters long', () => {
        const token = '1234567890'; // Exactly 10 chars
        const result = sanitizeTokenForLog(token);

        expect(result).toBe('1234567890***');
      });
    });

    describe('edge cases', () => {
      it('should handle token with special characters in first 10 chars', () => {
        const token = 'share_<sc>ipt>alert(1)</script>';
        const result = sanitizeTokenForLog(token);

        expect(result).toBe('share_<sc>***');
      });

      it('should handle unicode characters', () => {
        const token = 'share_🔒🔐🔑1234567890';
        const result = sanitizeTokenForLog(token);

        expect(result.endsWith('***')).toBe(true);
      });

      it('should handle token with only prefix (edge of short token)', () => {
        const token = 'share_abc'; // 9 chars
        const result = sanitizeTokenForLog(token);

        expect(result).toBe('***');
      });
    });

    describe('security considerations', () => {
      it('should not expose full token in logs', () => {
        const sensitiveToken = 'share_supersecret123456789';
        const result = sanitizeTokenForLog(sensitiveToken);

        expect(result).not.toContain('secret');
        expect(result).not.toContain('123456789');
        expect(result).toBe('share_supe***');
      });

      it('should consistently mask tokens of same prefix', () => {
        const token1 = 'share_abc123def456';
        const token2 = 'share_abc789xyz123';

        const result1 = sanitizeTokenForLog(token1);
        const result2 = sanitizeTokenForLog(token2);

        expect(result1).toBe('share_abc1***');
        expect(result2).toBe('share_abc7***');
        expect(result1.slice(0, 9)).toBe(result2.slice(0, 9)); // Same prefix
      });

      it('should mask all sensitive parts', () => {
        const tokens = [
          'share_secret123',
          'share_password456',
          'share_apikey789',
          'share_token012',
        ];

        tokens.forEach((token) => {
          const result = sanitizeTokenForLog(token);
          expect(result.endsWith('***')).toBe(true);
          expect(result.length).toBe(13);
        });
      });
    });
  });
});
