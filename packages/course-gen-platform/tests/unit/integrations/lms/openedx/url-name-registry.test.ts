/**
 * Unit Tests for UrlNameRegistry
 * Tests T034: Basic url_name generation functionality
 * Tests T034a: Duplicate handling and registry management
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { UrlNameRegistry } from '@/integrations/lms/openedx/olx/url-name-registry';

describe('UrlNameRegistry - URL Name Generation and Management', () => {
  let registry: UrlNameRegistry;

  beforeEach(() => {
    registry = new UrlNameRegistry();
  });

  describe('T034 - Basic Generation Functionality', () => {
    describe('Cyrillic (Russian) Transliteration', () => {
      it('should generate url_name from Cyrillic input', () => {
        const result = registry.generate('chapter', 'Введение');

        expect(result).toBe('vvedenie');
        expect(result).toMatch(/^[a-z0-9_-]+$/); // ASCII-only, lowercase
      });

      it('should handle full Russian course title', () => {
        const result = registry.generate('chapter', 'Основы программирования');

        expect(result).toMatch(/^[a-z0-9_-]+$/);
        expect(result).toContain('osnovy');
        expect(result).toContain('programmirovaniya');
      });

      it('should handle Russian with spaces', () => {
        const result = registry.generate('sequential', 'Введение в Python');

        expect(result).toMatch(/^[a-z0-9_-]+$/);
        expect(result).toContain('vvedenie');
        expect(result).toContain('python');
        // Spaces should be converted to underscores
        expect(result).toMatch(/vvedenie_v_python/);
      });
    });

    describe('ASCII Input Passthrough', () => {
      it('should generate url_name from ASCII input', () => {
        const result = registry.generate('chapter', 'Introduction');

        expect(result).toBe('introduction');
      });

      it('should convert uppercase to lowercase', () => {
        const result = registry.generate('sequential', 'ADVANCED TOPICS');

        expect(result).toBe('advanced_topics');
      });

      it('should preserve hyphens in ASCII input', () => {
        const result = registry.generate('vertical', 'Part-1');

        expect(result).toBe('part-1');
      });
    });

    describe('Special Character Removal', () => {
      it('should remove special characters and replace with underscores', () => {
        const result = registry.generate('chapter', 'Hello, World!');

        expect(result).toBe('hello_world');
      });

      it('should remove parentheses', () => {
        const result = registry.generate('sequential', 'Lesson 1 (Introduction)');

        expect(result).toBe('lesson_1_introduction');
      });

      it('should remove quotes', () => {
        const result = registry.generate('vertical', 'He said "Hello"');

        expect(result).toBe('he_said_hello');
      });

      it('should collapse multiple underscores into one', () => {
        const result = registry.generate('chapter', 'Hello,,,World!!!');

        expect(result).toBe('hello_world');
      });

      it('should remove leading and trailing underscores', () => {
        const result = registry.generate('sequential', '___Test___');

        expect(result).toBe('test');
      });

      it('should handle all special characters', () => {
        const result = registry.generate('vertical', '@#$%^&*()+={}[]|\\:;"<>?,./');

        // Should collapse to single underscore or empty
        expect(result).toMatch(/^[a-z0-9_-]*$/);
        expect(result.length).toBeGreaterThan(0);
      });
    });

    describe('40-Character Base Name Limit', () => {
      it('should limit base name to 40 characters', () => {
        const longName = 'a'.repeat(100);
        const result = registry.generate('chapter', longName);

        expect(result.length).toBeLessThanOrEqual(40);
        expect(result).toBe('a'.repeat(40));
      });

      it('should truncate long transliterated names', () => {
        const longRussian = 'Введение '.repeat(10);
        const result = registry.generate('sequential', longRussian);

        expect(result.length).toBeLessThanOrEqual(40);
        expect(result).toMatch(/^[a-z0-9_-]+$/);
      });

      it('should leave room for numeric suffixes', () => {
        const longName = 'x'.repeat(50);

        const name1 = registry.generate('chapter', longName);
        const name2 = registry.generate('chapter', longName);

        // First should be exactly 40 chars
        expect(name1.length).toBe(40);
        // Second should be base (40 chars) + "_1"
        expect(name2).toBe('x'.repeat(40) + '_1');
      });
    });

    describe('Independent Tracking Per Element Type', () => {
      it('should track chapter independently from sequential', () => {
        const name1 = registry.generate('chapter', 'Introduction');
        const name2 = registry.generate('sequential', 'Introduction');

        expect(name1).toBe('introduction');
        expect(name2).toBe('introduction');
        // Both should be 'introduction' because they're in different namespaces
      });

      it('should track all four element types independently', () => {
        const input = 'Test Topic';

        const chapter = registry.generate('chapter', input);
        const sequential = registry.generate('sequential', input);
        const vertical = registry.generate('vertical', input);
        const html = registry.generate('html', input);

        // All should be the same because different namespaces
        expect(chapter).toBe('test_topic');
        expect(sequential).toBe('test_topic');
        expect(vertical).toBe('test_topic');
        expect(html).toBe('test_topic');
      });

      it('should count element types independently', () => {
        registry.generate('chapter', 'Topic 1');
        registry.generate('chapter', 'Topic 2');
        registry.generate('sequential', 'Topic 3');

        expect(registry.count('chapter')).toBe(2);
        expect(registry.count('sequential')).toBe(1);
        expect(registry.count('vertical')).toBe(0);
        expect(registry.count('html')).toBe(0);
      });
    });

    describe('Empty and Edge Cases', () => {
      it('should generate "item" for empty string', () => {
        const result = registry.generate('chapter', '');

        expect(result).toBe('item');
      });

      it('should generate "item" for whitespace-only string', () => {
        const result = registry.generate('sequential', '   ');

        expect(result).toBe('item');
      });

      it('should generate "item" for special-characters-only string', () => {
        const result = registry.generate('vertical', '!@#$%^&*()');

        expect(result).toBe('item');
      });
    });
  });

  describe('T034a - Duplicate Handling and Registry Management', () => {
    describe('Duplicate Detection and Numeric Suffixes', () => {
      it('should detect duplicate and add _1 suffix', () => {
        const name1 = registry.generate('chapter', 'Introduction');
        const name2 = registry.generate('chapter', 'Introduction');

        expect(name1).toBe('introduction');
        expect(name2).toBe('introduction_1');
      });

      it('should increment suffix for multiple duplicates', () => {
        const name1 = registry.generate('sequential', 'Test');
        const name2 = registry.generate('sequential', 'Test');
        const name3 = registry.generate('sequential', 'Test');
        const name4 = registry.generate('sequential', 'Test');

        expect(name1).toBe('test');
        expect(name2).toBe('test_1');
        expect(name3).toBe('test_2');
        expect(name4).toBe('test_3');
      });

      it('should handle many duplicates', () => {
        const names: string[] = [];

        for (let i = 0; i < 20; i++) {
          names.push(registry.generate('chapter', 'Duplicate'));
        }

        expect(names[0]).toBe('duplicate');
        expect(names[1]).toBe('duplicate_1');
        expect(names[10]).toBe('duplicate_10');
        expect(names[19]).toBe('duplicate_19');

        // All names should be unique
        const uniqueNames = new Set(names);
        expect(uniqueNames.size).toBe(20);
      });

      it('should handle duplicates for default "item" name', () => {
        const name1 = registry.generate('vertical', '');
        const name2 = registry.generate('vertical', '');
        const name3 = registry.generate('vertical', '!@#');

        expect(name1).toBe('item');
        expect(name2).toBe('item_1');
        expect(name3).toBe('item_2');
      });
    });

    describe('Cross-Type Independence', () => {
      it('should allow same name in different element types', () => {
        const chapterName = registry.generate('chapter', 'intro');
        const sequentialName = registry.generate('sequential', 'intro');
        const verticalName = registry.generate('vertical', 'intro');
        const htmlName = registry.generate('html', 'intro');

        expect(chapterName).toBe('intro');
        expect(sequentialName).toBe('intro');
        expect(verticalName).toBe('intro');
        expect(htmlName).toBe('intro');
      });

      it('should track duplicates independently per type', () => {
        // Generate duplicates in chapter
        const chapter1 = registry.generate('chapter', 'topic');
        const chapter2 = registry.generate('chapter', 'topic');

        // Generate duplicates in sequential
        const seq1 = registry.generate('sequential', 'topic');
        const seq2 = registry.generate('sequential', 'topic');

        expect(chapter1).toBe('topic');
        expect(chapter2).toBe('topic_1');
        expect(seq1).toBe('topic');
        expect(seq2).toBe('topic_1');
      });
    });

    describe('has() Method - Detection of Registered Names', () => {
      it('should detect registered names', () => {
        registry.generate('chapter', 'Introduction');

        expect(registry.has('chapter', 'introduction')).toBe(true);
      });

      it('should return false for unregistered names', () => {
        registry.generate('chapter', 'Introduction');

        expect(registry.has('chapter', 'advanced')).toBe(false);
      });

      it('should respect element type namespaces', () => {
        registry.generate('chapter', 'Introduction');

        expect(registry.has('chapter', 'introduction')).toBe(true);
        expect(registry.has('sequential', 'introduction')).toBe(false);
        expect(registry.has('vertical', 'introduction')).toBe(false);
      });

      it('should detect names with numeric suffixes', () => {
        registry.generate('sequential', 'Test');
        registry.generate('sequential', 'Test');

        expect(registry.has('sequential', 'test')).toBe(true);
        expect(registry.has('sequential', 'test_1')).toBe(true);
        expect(registry.has('sequential', 'test_2')).toBe(false);
      });
    });

    describe('count() Method - Count Registered Names', () => {
      it('should return 0 for new registry', () => {
        expect(registry.count('chapter')).toBe(0);
        expect(registry.count('sequential')).toBe(0);
        expect(registry.count('vertical')).toBe(0);
        expect(registry.count('html')).toBe(0);
      });

      it('should return correct count after generating names', () => {
        registry.generate('chapter', 'Topic 1');
        registry.generate('chapter', 'Topic 2');
        registry.generate('chapter', 'Topic 3');

        expect(registry.count('chapter')).toBe(3);
      });

      it('should count duplicates correctly', () => {
        registry.generate('sequential', 'Intro');
        registry.generate('sequential', 'Intro');
        registry.generate('sequential', 'Intro');

        expect(registry.count('sequential')).toBe(3);
      });

      it('should track counts independently per element type', () => {
        registry.generate('chapter', 'A');
        registry.generate('chapter', 'B');
        registry.generate('sequential', 'C');
        registry.generate('vertical', 'D');
        registry.generate('vertical', 'E');
        registry.generate('vertical', 'F');

        expect(registry.count('chapter')).toBe(2);
        expect(registry.count('sequential')).toBe(1);
        expect(registry.count('vertical')).toBe(3);
        expect(registry.count('html')).toBe(0);
      });
    });

    describe('getAll() Method - Retrieve All Registered Names', () => {
      it('should return empty array for new registry', () => {
        const all = registry.getAll('chapter');

        expect(all).toEqual([]);
      });

      it('should return all registered names', () => {
        registry.generate('chapter', 'Introduction');
        registry.generate('chapter', 'Advanced Topics');
        registry.generate('chapter', 'Conclusion');

        const all = registry.getAll('chapter');

        expect(all).toHaveLength(3);
        expect(all).toContain('introduction');
        expect(all).toContain('advanced_topics');
        expect(all).toContain('conclusion');
      });

      it('should include names with numeric suffixes', () => {
        registry.generate('sequential', 'Topic');
        registry.generate('sequential', 'Topic');
        registry.generate('sequential', 'Topic');

        const all = registry.getAll('sequential');

        expect(all).toEqual(['topic', 'topic_1', 'topic_2']);
      });

      it('should return copy, not reference', () => {
        registry.generate('vertical', 'Test');

        const all1 = registry.getAll('vertical');
        const all2 = registry.getAll('vertical');

        expect(all1).not.toBe(all2); // Different array instances
        expect(all1).toEqual(all2); // Same contents
      });

      it('should respect element type namespaces', () => {
        registry.generate('chapter', 'Chapter 1');
        registry.generate('sequential', 'Sequential 1');
        registry.generate('vertical', 'Vertical 1');

        expect(registry.getAll('chapter')).toEqual(['chapter_1']);
        expect(registry.getAll('sequential')).toEqual(['sequential_1']);
        expect(registry.getAll('vertical')).toEqual(['vertical_1']);
        expect(registry.getAll('html')).toEqual([]);
      });
    });

    describe('clear() Method - Reset Registry', () => {
      it('should clear all registered names', () => {
        registry.generate('chapter', 'Topic 1');
        registry.generate('chapter', 'Topic 2');
        registry.generate('sequential', 'Topic 3');

        registry.clear();

        expect(registry.count('chapter')).toBe(0);
        expect(registry.count('sequential')).toBe(0);
        expect(registry.getAll('chapter')).toEqual([]);
        expect(registry.getAll('sequential')).toEqual([]);
      });

      it('should reset all element types', () => {
        registry.generate('chapter', 'A');
        registry.generate('sequential', 'B');
        registry.generate('vertical', 'C');
        registry.generate('html', 'D');

        registry.clear();

        expect(registry.count('chapter')).toBe(0);
        expect(registry.count('sequential')).toBe(0);
        expect(registry.count('vertical')).toBe(0);
        expect(registry.count('html')).toBe(0);
      });

      it('should allow reusing names after clear', () => {
        const name1 = registry.generate('chapter', 'Introduction');
        expect(name1).toBe('introduction');

        registry.clear();

        const name2 = registry.generate('chapter', 'Introduction');
        expect(name2).toBe('introduction'); // No suffix, because registry was cleared
      });

      it('should reset duplicate counters', () => {
        registry.generate('sequential', 'Test');
        registry.generate('sequential', 'Test');
        registry.generate('sequential', 'Test');

        registry.clear();

        const name1 = registry.generate('sequential', 'Test');
        const name2 = registry.generate('sequential', 'Test');

        expect(name1).toBe('test');
        expect(name2).toBe('test_1');
      });
    });

    describe('Error Handling', () => {
      it('should throw error for unknown element type', () => {
        expect(() => {
          // @ts-expect-error Testing invalid element type
          registry.generate('invalid_type', 'Test');
        }).toThrow('Unknown element type');
      });

      it('should throw error for excessive duplicates (safety limit)', () => {
        // Mock the safety limit by generating many duplicates
        // This test ensures the safety mechanism exists
        const longName = 'x'.repeat(40);

        expect(() => {
          for (let i = 0; i < 10001; i++) {
            registry.generate('chapter', longName);
          }
        }).toThrow('Too many duplicate url_names');
      });
    });

    describe('Real-world Course Scenarios', () => {
      it('should handle typical course structure', () => {
        // Chapter: Week 1
        const week1 = registry.generate('chapter', 'Week 1: Introduction');

        // Sequentials in Week 1
        const lesson1 = registry.generate('sequential', 'Lesson 1: Getting Started');
        const lesson2 = registry.generate('sequential', 'Lesson 2: Basic Concepts');

        // Verticals in Lesson 1
        const unit1 = registry.generate('vertical', 'Introduction Video');
        const unit2 = registry.generate('vertical', 'Reading Material');

        expect(week1).toBe('week_1_introduction');
        expect(lesson1).toBe('lesson_1_getting_started');
        expect(lesson2).toBe('lesson_2_basic_concepts');
        expect(unit1).toBe('introduction_video');
        expect(unit2).toBe('reading_material');
      });

      it('should handle multilingual course with duplicates', () => {
        const rusChapter = registry.generate('chapter', 'Введение');
        const engChapter = registry.generate('chapter', 'Introduction');
        const rusChapter2 = registry.generate('chapter', 'Введение');

        expect(rusChapter).toBe('vvedenie');
        expect(engChapter).toBe('introduction');
        expect(rusChapter2).toBe('vvedenie_1');
      });

      it('should generate unique names for similar section titles', () => {
        const intro1 = registry.generate('sequential', 'Introduction');
        const intro2 = registry.generate('sequential', 'Introduction to Python');
        const intro3 = registry.generate('sequential', 'Introduction to Data Science');

        expect(intro1).toBe('introduction');
        expect(intro2).toBe('introduction_to_python');
        expect(intro3).toBe('introduction_to_data_science');

        // All should be unique
        const allNames = new Set([intro1, intro2, intro3]);
        expect(allNames.size).toBe(3);
      });
    });
  });
});
