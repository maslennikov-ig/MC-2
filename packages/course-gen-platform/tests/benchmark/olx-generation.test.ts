/**
 * Benchmark Tests for OLX Generation
 * Test ID: T121
 *
 * Tests performance of OLX generation for courses with 50 units.
 * Performance requirement: Generation must complete within 5 seconds.
 *
 * Test Categories:
 * 1. 50-unit course generation performance
 * 2. Structure validation
 * 3. Memory efficiency
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OLXGenerator } from '@/integrations/lms/openedx/olx/generator';
import type { CourseInput } from '@megacampus/shared-types/lms';

// Mock logger to avoid console output
vi.mock('@/integrations/lms/logger', () => ({
  lmsLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

/**
 * Create CourseInput fixture with specified number of units
 *
 * Creates a course with chapters, sections, and units to reach target unit count.
 * Structure:
 * - chapters: ceil(unitCount / 10)
 * - sections per chapter: 2
 * - units per section: 5 (for 50 units: 5 chapters × 2 sections × 5 units)
 *
 * @param unitCount - Total number of units to create
 * @returns CourseInput with specified unit count
 */
function createCourseWith50Units(): CourseInput {
  const chapters: CourseInput['chapters'] = [];

  // Create 5 chapters × 2 sections × 5 units = 50 units
  for (let ch = 0; ch < 5; ch++) {
    const sections: CourseInput['chapters'][0]['sections'] = [];

    for (let sec = 0; sec < 2; sec++) {
      const units: CourseInput['chapters'][0]['sections'][0]['units'] = [];

      for (let u = 0; u < 5; u++) {
        const unitNum = ch * 10 + sec * 5 + u + 1;
        units.push({
          id: `unit_${unitNum}`,
          title: `Unit ${unitNum}: Introduction to Topic ${unitNum}`,
          content: `
            <div class="unit-content">
              <h1>Unit ${unitNum} Content</h1>
              <p>This is the main content for unit ${unitNum}.</p>
              <h2>Learning Objectives</h2>
              <ul>
                <li>Understand the fundamentals of topic ${unitNum}</li>
                <li>Apply concepts from previous units</li>
                <li>Practice problem-solving techniques</li>
              </ul>
              <h2>Key Concepts</h2>
              <p>Key concept 1: Introduction to the fundamental principles.</p>
              <p>Key concept 2: Advanced techniques and best practices.</p>
              <p>Key concept 3: Real-world applications and examples.</p>
              <h2>Practice Exercise</h2>
              <p>Complete the following exercise to test your understanding:</p>
              <pre><code>
// Example code block
function example${unitNum}() {
  return "Solution for unit ${unitNum}";
}
              </code></pre>
            </div>
          `,
        });
      }

      sections.push({
        id: `section_${ch}_${sec}`,
        title: `Section ${ch * 2 + sec + 1}: Advanced Topics`,
        units,
      });
    }

    chapters.push({
      id: `chapter_${ch}`,
      title: `Chapter ${ch + 1}: Core Concepts`,
      sections,
    });
  }

  return {
    courseId: 'PERF_TEST_101',
    title: 'Performance Test Course - 50 Units',
    description: 'A course created for performance testing with 50 units',
    org: 'MegaCampus',
    run: '2025_Q1',
    language: 'en',
    startDate: '2025-01-15T00:00:00Z',
    chapters,
  };
}

/**
 * Create large course fixture with specified unit count
 *
 * Useful for testing scalability beyond 50 units.
 *
 * @param unitCount - Total number of units (must be divisible by 10)
 * @returns CourseInput with specified unit count
 */
function createCourseWithUnits(unitCount: number): CourseInput {
  const chapters: CourseInput['chapters'] = [];

  // Calculate structure: aim for ~10 units per chapter
  const chaptersCount = Math.ceil(unitCount / 10);
  const sectionsPerChapter = 2;
  const unitsPerSection = Math.ceil(unitCount / (chaptersCount * sectionsPerChapter));

  let unitCounter = 0;

  for (let ch = 0; ch < chaptersCount && unitCounter < unitCount; ch++) {
    const sections: CourseInput['chapters'][0]['sections'] = [];

    for (let sec = 0; sec < sectionsPerChapter && unitCounter < unitCount; sec++) {
      const units: CourseInput['chapters'][0]['sections'][0]['units'] = [];

      for (let u = 0; u < unitsPerSection && unitCounter < unitCount; u++) {
        unitCounter++;
        units.push({
          id: `unit_${unitCounter}`,
          title: `Unit ${unitCounter}`,
          content: `<p>Content for unit ${unitCounter}</p>`,
        });
      }

      if (units.length > 0) {
        sections.push({
          id: `section_${ch}_${sec}`,
          title: `Section ${ch * 2 + sec + 1}`,
          units,
        });
      }
    }

    if (sections.length > 0) {
      chapters.push({
        id: `chapter_${ch}`,
        title: `Chapter ${ch + 1}`,
        sections,
      });
    }
  }

  return {
    courseId: `PERF_TEST_${unitCount}`,
    title: `Performance Test Course - ${unitCount} Units`,
    org: 'MegaCampus',
    run: '2025_Q1',
    language: 'en',
    chapters,
  };
}

describe('OLX Generation Benchmark - 50 Units', () => {
  let generator: OLXGenerator;

  beforeEach(() => {
    generator = new OLXGenerator();
  });

  it('should generate OLX for 50-unit course in < 5 seconds', () => {
    const input = createCourseWith50Units();

    const startTime = Date.now();
    const result = generator.generate(input);
    const duration = Date.now() - startTime;

    // Performance requirement: < 5 seconds (5000ms)
    expect(duration).toBeLessThan(5000);

    // Verify structure was generated correctly
    expect(result).toBeDefined();
    expect(result.courseKey).toBe('course-v1:MegaCampus+PERF_TEST_101+2025_Q1');
    expect(result.verticals.size).toBe(50);
    expect(result.htmlContent.size).toBe(50);

    // Log performance metrics for monitoring
    console.log(`✓ OLX Generation Performance (50 units):`);
    console.log(`  Duration: ${duration}ms`);
    console.log(`  Units: ${result.verticals.size}`);
    console.log(`  Chapters: ${result.chapters.size}`);
    console.log(`  Sequentials: ${result.sequentials.size}`);
    console.log(`  Avg time per unit: ${(duration / 50).toFixed(2)}ms`);
  });

  it('should verify all 50 units are generated correctly', () => {
    const input = createCourseWith50Units();

    const result = generator.generate(input);

    // Verify counts
    expect(result.chapters.size).toBe(5);
    expect(result.sequentials.size).toBe(10);
    expect(result.verticals.size).toBe(50);
    expect(result.htmlRefs.size).toBe(50);
    expect(result.htmlContent.size).toBe(50);

    // Verify 1:1 mapping
    expect(result.verticals.size).toBe(result.htmlRefs.size);
    expect(result.htmlRefs.size).toBe(result.htmlContent.size);
  });

  it('should verify generated structure contains all expected files', () => {
    const input = createCourseWith50Units();

    const result = generator.generate(input);

    // Verify course.xml exists
    expect(result.courseXml).toBeDefined();
    expect(result.courseXml.length).toBeGreaterThan(0);

    // Verify all chapters have XML
    for (const [urlName, xml] of result.chapters.entries()) {
      expect(urlName).toBeTruthy();
      expect(xml).toContain('<chapter');
      expect(xml).toContain(`url_name="${urlName}"`);
    }

    // Verify all sequentials have XML
    for (const [urlName, xml] of result.sequentials.entries()) {
      expect(urlName).toBeTruthy();
      expect(xml).toContain('<sequential');
      expect(xml).toContain(`url_name="${urlName}"`);
    }

    // Verify all verticals have XML
    for (const [urlName, xml] of result.verticals.entries()) {
      expect(urlName).toBeTruthy();
      expect(xml).toContain('<vertical');
      expect(xml).toContain(`url_name="${urlName}"`);
    }

    // Verify all HTML content is non-empty
    for (const [urlName, content] of result.htmlContent.entries()) {
      expect(urlName).toBeTruthy();
      expect(content).toBeTruthy();
      expect(content.length).toBeGreaterThan(0);
    }

    // Verify policy files
    expect(result.policies.policyJson).toBeDefined();
    expect(result.policies.gradingPolicyJson).toBeDefined();
    expect(() => JSON.parse(result.policies.policyJson)).not.toThrow();
    expect(() => JSON.parse(result.policies.gradingPolicyJson)).not.toThrow();
  });

  it('should verify url_names are unique across all 50 units', () => {
    const input = createCourseWith50Units();

    const result = generator.generate(input);

    const allUrlNames = new Set<string>();

    // Collect all url_names
    for (const urlName of result.chapters.keys()) allUrlNames.add(urlName);
    for (const urlName of result.sequentials.keys()) allUrlNames.add(urlName);
    for (const urlName of result.verticals.keys()) allUrlNames.add(urlName);
    for (const urlName of result.htmlRefs.keys()) allUrlNames.add(urlName);

    // Verify all url_names collected are unique
    // (Note: some titles may collide and get numeric suffixes, so count may vary)
    expect(allUrlNames.size).toBeGreaterThan(60);
    expect(allUrlNames.size).toBeLessThanOrEqual(115);

    // Verify no duplicates within each type
    expect(new Set(result.chapters.keys()).size).toBe(result.chapters.size);
    expect(new Set(result.sequentials.keys()).size).toBe(result.sequentials.size);
    expect(new Set(result.verticals.keys()).size).toBe(result.verticals.size);
    expect(new Set(result.htmlRefs.keys()).size).toBe(result.htmlRefs.size);
  });

  it('should verify content preservation for all units', () => {
    const input = createCourseWith50Units();

    const result = generator.generate(input);

    // Check that at least some units have rich content
    const htmlContents = Array.from(result.htmlContent.values());

    // Verify at least one unit has learning objectives
    const hasLearningObjectives = htmlContents.some((content) =>
      content.includes('Learning Objectives')
    );
    expect(hasLearningObjectives).toBe(true);

    // Verify at least one unit has code blocks
    const hasCodeBlocks = htmlContents.some((content) => content.includes('<code>'));
    expect(hasCodeBlocks).toBe(true);

    // Verify content is not empty
    for (const content of htmlContents) {
      expect(content.length).toBeGreaterThan(10);
    }
  });
});

describe('OLX Generation Scalability', () => {
  let generator: OLXGenerator;

  beforeEach(() => {
    generator = new OLXGenerator();
  });

  it('should scale linearly for 100-unit course', () => {
    const input = createCourseWithUnits(100);

    const startTime = Date.now();
    const result = generator.generate(input);
    const duration = Date.now() - startTime;

    // Should scale linearly: if 50 units < 5s, then 100 units < 10s
    expect(duration).toBeLessThan(10000);

    expect(result.verticals.size).toBe(100);
    expect(result.htmlContent.size).toBe(100);

    console.log(`✓ OLX Generation Scalability (100 units):`);
    console.log(`  Duration: ${duration}ms`);
    console.log(`  Avg time per unit: ${(duration / 100).toFixed(2)}ms`);
  });

  it('should handle 200-unit course efficiently', () => {
    const input = createCourseWithUnits(200);

    const startTime = Date.now();
    const result = generator.generate(input);
    const duration = Date.now() - startTime;

    // Should scale linearly: 200 units < 20s
    expect(duration).toBeLessThan(20000);

    expect(result.verticals.size).toBe(200);
    expect(result.htmlContent.size).toBe(200);

    console.log(`✓ OLX Generation Scalability (200 units):`);
    console.log(`  Duration: ${duration}ms`);
    console.log(`  Avg time per unit: ${(duration / 200).toFixed(2)}ms`);
  });

  it('should verify memory efficiency for large courses', () => {
    const input = createCourseWithUnits(100);

    // Capture memory before generation
    if (global.gc) {
      global.gc();
    }
    const memBefore = process.memoryUsage().heapUsed;

    const result = generator.generate(input);

    const memAfter = process.memoryUsage().heapUsed;
    const memDelta = memAfter - memBefore;
    const memDeltaMB = memDelta / 1024 / 1024;

    // Memory usage should be reasonable (< 100MB for 100 units)
    expect(memDeltaMB).toBeLessThan(100);

    console.log(`✓ Memory Efficiency (100 units):`);
    console.log(`  Memory delta: ${memDeltaMB.toFixed(2)} MB`);
    console.log(`  Memory per unit: ${(memDeltaMB / 100).toFixed(2)} MB`);

    // Verify structure is valid
    expect(result.verticals.size).toBe(100);
  });
});

describe('OLX Generation - Performance Regression', () => {
  let generator: OLXGenerator;

  beforeEach(() => {
    generator = new OLXGenerator();
  });

  it('should maintain consistent performance across multiple generations', () => {
    const input = createCourseWith50Units();
    const durations: number[] = [];

    // Generate 5 times to check consistency
    for (let i = 0; i < 5; i++) {
      generator.reset();

      const startTime = Date.now();
      generator.generate(input);
      const duration = Date.now() - startTime;

      durations.push(duration);
    }

    // All generations should be < 5 seconds
    for (const duration of durations) {
      expect(duration).toBeLessThan(5000);
    }

    // Calculate average and standard deviation
    const avg = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    const variance =
      durations.reduce((sum, d) => sum + Math.pow(d - avg, 2), 0) / durations.length;
    const stdDev = Math.sqrt(variance);

    console.log(`✓ Performance Consistency (5 runs):`);
    console.log(`  Average: ${avg.toFixed(2)}ms`);
    console.log(`  Std Dev: ${stdDev.toFixed(2)}ms`);
    console.log(`  Min: ${Math.min(...durations)}ms`);
    console.log(`  Max: ${Math.max(...durations)}ms`);

    // Standard deviation should be reasonable
    // For very fast operations (<5ms), allow higher variance due to timer resolution
    const maxStdDev = avg < 5 ? 2 : avg * 0.2;
    expect(stdDev).toBeLessThan(maxStdDev);
  });

  it('should verify reset() does not degrade performance', () => {
    const input = createCourseWith50Units();

    // First generation (cold)
    const startTime1 = Date.now();
    generator.generate(input);
    const duration1 = Date.now() - startTime1;

    // Reset and second generation
    generator.reset();
    const startTime2 = Date.now();
    generator.generate(input);
    const duration2 = Date.now() - startTime2;

    // Second run should not be significantly slower
    // Allow up to 20% variance
    expect(duration2).toBeLessThan(duration1 * 1.2);

    console.log(`✓ Reset Performance:`);
    console.log(`  First run: ${duration1}ms`);
    console.log(`  Second run (after reset): ${duration2}ms`);
  });
});
