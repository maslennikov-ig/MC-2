/**
 * E2E Tests for Open edX Import Pipeline
 * Test ID: T123
 *
 * Tests the complete pipeline from CourseInput to packaged OLX ready for import.
 * Performance requirement: Full pipeline must complete within 30 seconds.
 *
 * Test Categories:
 * 1. Full pipeline performance (CourseInput → OLX → Package)
 * 2. End-to-end data integrity
 * 3. Pipeline with mocked LMS adapter
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OLXGenerator } from '@/integrations/lms/openedx/olx/generator';
import { packageOLX, formatBytes } from '@/integrations/lms/openedx/olx/packager';
import type { CourseInput } from '@megacampus/shared-types/lms';
import type { OLXStructure } from '@/integrations/lms/openedx/olx/types';

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
 * Create realistic CourseInput for E2E testing
 *
 * Creates a course with:
 * - 3 chapters
 * - 2 sections per chapter
 * - 5 units per section
 * Total: 30 units (moderate size for E2E testing)
 *
 * @returns CourseInput with realistic structure and content
 */
function createRealisticCourseInput(): CourseInput {
  const chapters: CourseInput['chapters'] = [];

  for (let ch = 0; ch < 3; ch++) {
    const sections: CourseInput['chapters'][0]['sections'] = [];

    for (let sec = 0; sec < 2; sec++) {
      const units: CourseInput['chapters'][0]['sections'][0]['units'] = [];

      for (let u = 0; u < 5; u++) {
        const unitNum = ch * 10 + sec * 5 + u + 1;
        units.push({
          id: `unit_${unitNum}`,
          title: `Unit ${unitNum}: Learning Python Basics`,
          content: `
            <div class="lesson-container">
              <h1>Unit ${unitNum}: Python Fundamentals</h1>

              <section class="introduction">
                <h2>Introduction</h2>
                <p>Welcome to Unit ${unitNum}! In this lesson, we'll explore fundamental concepts in Python programming.</p>
                <p>By the end of this unit, you will be able to:</p>
                <ul>
                  <li>Understand core Python syntax</li>
                  <li>Write and execute basic Python programs</li>
                  <li>Apply best practices in code organization</li>
                </ul>
              </section>

              <section class="content">
                <h2>Main Content</h2>
                <p>Let's dive into the key concepts for this unit.</p>

                <h3>Code Example</h3>
                <pre><code class="language-python">
# Example ${unitNum}: Basic Python Operations
def calculate_sum(numbers):
    """Calculate the sum of a list of numbers."""
    total = 0
    for num in numbers:
        total += num
    return total

# Usage
data = [1, 2, 3, 4, 5]
result = calculate_sum(data)
print(f"Sum: {result}")
                </code></pre>

                <h3>Explanation</h3>
                <p>The code above demonstrates fundamental Python concepts including:</p>
                <ul>
                  <li><strong>Functions:</strong> Defining reusable code blocks</li>
                  <li><strong>Loops:</strong> Iterating over sequences</li>
                  <li><strong>Variables:</strong> Storing and manipulating data</li>
                </ul>
              </section>

              <section class="practice">
                <h2>Practice Exercise</h2>
                <p>Try this exercise to reinforce your learning:</p>
                <blockquote>
                  <p>Modify the calculate_sum function to also return the average of the numbers.</p>
                </blockquote>

                <details>
                  <summary>Hint</summary>
                  <p>Remember that average = sum / count</p>
                </details>
              </section>

              <section class="quiz">
                <h2>Quick Quiz</h2>
                <ol>
                  <li>What is the purpose of the for loop in the example?</li>
                  <li>How would you modify the function to accept any iterable?</li>
                  <li>What happens if the input list is empty?</li>
                </ol>
              </section>
            </div>
          `,
          assets: [`https://example.com/images/unit_${unitNum}_diagram.png`],
        });
      }

      sections.push({
        id: `section_${ch}_${sec}`,
        title: `Section ${ch * 2 + sec + 1}: Python Programming Techniques`,
        units,
      });
    }

    chapters.push({
      id: `chapter_${ch}`,
      title: `Chapter ${ch + 1}: Core Python Concepts`,
      sections,
    });
  }

  return {
    courseId: 'PYTHON_101',
    title: 'Introduction to Python Programming',
    description: 'A comprehensive introduction to Python programming for beginners',
    org: 'MegaCampus',
    run: '2025_Q1',
    language: 'en',
    startDate: '2025-01-15T00:00:00Z',
    enrollmentStart: '2025-01-01T00:00:00Z',
    enrollmentEnd: '2025-12-31T23:59:59Z',
    chapters,
  };
}

/**
 * Mock LMS Adapter for testing
 *
 * Simulates LMS adapter without making real API calls.
 */
class MockOpenEdXAdapter {
  async uploadPackage(buffer: Buffer): Promise<{ success: boolean; importId: string }> {
    // Simulate network delay (100ms)
    await new Promise((resolve) => setTimeout(resolve, 100));

    return {
      success: true,
      importId: `import_${Date.now()}`,
    };
  }

  async getImportStatus(importId: string): Promise<{ status: string; progress: number }> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 50));

    return {
      status: 'completed',
      progress: 100,
    };
  }
}

describe('Open edX Import Pipeline E2E - Full Pipeline', () => {
  let generator: OLXGenerator;
  let adapter: MockOpenEdXAdapter;

  beforeEach(() => {
    generator = new OLXGenerator();
    adapter = new MockOpenEdXAdapter();
    vi.clearAllMocks();
  });

  it('should complete full pipeline in < 30 seconds', async () => {
    const courseInput = createRealisticCourseInput();

    const pipelineStart = Date.now();

    // Step 1: Generate OLX structure
    const generationStart = Date.now();
    const olxStructure = generator.generate(courseInput);
    const generationDuration = Date.now() - generationStart;

    // Step 2: Package OLX to tar.gz
    const packagingStart = Date.now();
    const packageResult = await packageOLX(olxStructure);
    const packagingDuration = Date.now() - packagingStart;

    // Step 3: Mock upload to LMS (simulated)
    const uploadStart = Date.now();
    const uploadResult = await adapter.uploadPackage(packageResult.buffer);
    const uploadDuration = Date.now() - uploadStart;

    const totalDuration = Date.now() - pipelineStart;

    // Performance requirement: < 30 seconds total
    expect(totalDuration).toBeLessThan(30000);

    // Verify each step completed successfully
    expect(olxStructure).toBeDefined();
    expect(packageResult.buffer).toBeInstanceOf(Buffer);
    expect(uploadResult.success).toBe(true);

    console.log(`\n✓ Full Pipeline Performance:`);
    console.log(`  Total duration: ${totalDuration}ms`);
    console.log(`  1. OLX Generation: ${generationDuration}ms`);
    console.log(`  2. Packaging: ${packagingDuration}ms`);
    console.log(`  3. Mock Upload: ${uploadDuration}ms`);
    console.log(`\n  Course: ${courseInput.title}`);
    console.log(`  Units: ${olxStructure.verticals.size}`);
    console.log(`  Package size: ${formatBytes(packageResult.size)}`);
    console.log(`  Import ID: ${uploadResult.importId}`);
  });

  it('should verify data integrity through entire pipeline', async () => {
    const courseInput = createRealisticCourseInput();

    // Step 1: Generate OLX
    const olxStructure = generator.generate(courseInput);

    // Verify OLX structure integrity
    expect(olxStructure.courseKey).toBe('course-v1:MegaCampus+PYTHON_101+2025_Q1');
    expect(olxStructure.chapters.size).toBe(3);
    expect(olxStructure.sequentials.size).toBe(6);
    expect(olxStructure.verticals.size).toBe(30);
    expect(olxStructure.htmlContent.size).toBe(30);

    // Step 2: Package OLX
    const packageResult = await packageOLX(olxStructure);

    // Verify package integrity
    expect(packageResult.size).toBeGreaterThan(0);
    expect(packageResult.fileCount).toBe(1 + 3 + 6 + 30 + 30 + 30 + 2); // 102 files

    // Step 3: Mock upload
    const uploadResult = await adapter.uploadPackage(packageResult.buffer);

    // Verify upload success
    expect(uploadResult.success).toBe(true);
    expect(uploadResult.importId).toMatch(/^import_\d+$/);

    console.log(`\n✓ Data Integrity Validation:`);
    console.log(`  Course Key: ${olxStructure.courseKey}`);
    console.log(`  Structure: ${olxStructure.chapters.size} chapters, ${olxStructure.sequentials.size} sections, ${olxStructure.verticals.size} units`);
    console.log(`  Package: ${packageResult.fileCount} files, ${formatBytes(packageResult.size)}`);
    console.log(`  Upload: ${uploadResult.success ? 'Success' : 'Failed'} (${uploadResult.importId})`);
  });

  it('should verify all unit content is preserved', async () => {
    const courseInput = createRealisticCourseInput();

    // Generate OLX
    const olxStructure = generator.generate(courseInput);

    // Verify all units have content
    expect(olxStructure.htmlContent.size).toBe(30);

    // Sample check: verify first unit content
    const firstHtmlContent = Array.from(olxStructure.htmlContent.values())[0];
    expect(firstHtmlContent).toContain('Python Fundamentals');
    expect(firstHtmlContent).toContain('Code Example');
    expect(firstHtmlContent).toContain('Practice Exercise');

    // Package
    const packageResult = await packageOLX(olxStructure);

    // Verify package is not empty
    expect(packageResult.size).toBeGreaterThan(1000); // At least 1KB

    console.log(`\n✓ Content Preservation:`);
    console.log(`  HTML components: ${olxStructure.htmlContent.size}`);
    console.log(`  Sample content length: ${firstHtmlContent.length} chars`);
    console.log(`  Package size: ${formatBytes(packageResult.size)}`);
  });

  it('should handle Cyrillic content throughout pipeline', async () => {
    const cyrillicCourse: CourseInput = {
      courseId: 'PYTHON_RU_101',
      title: 'Введение в программирование на Python',
      description: 'Полное введение в программирование на Python для начинающих',
      org: 'MegaCampus',
      run: '2025_Q1',
      language: 'ru',
      startDate: '2025-01-15T00:00:00Z',
      chapters: [
        {
          id: 'ch1',
          title: 'Основы Python',
          sections: [
            {
              id: 'sec1',
              title: 'Переменные и типы данных',
              units: [
                {
                  id: 'unit1',
                  title: 'Что такое переменная',
                  content: `
                    <div>
                      <h1>Переменные в Python</h1>
                      <p>Переменная - это именованная область памяти для хранения данных.</p>
                      <pre><code>
# Пример объявления переменной
имя = "Иван"
возраст = 25
                      </code></pre>
                    </div>
                  `,
                },
                {
                  id: 'unit2',
                  title: 'Типы данных',
                  content: '<p>Строки, числа, списки</p>',
                },
              ],
            },
          ],
        },
      ],
    };

    const pipelineStart = Date.now();

    // Full pipeline
    const olxStructure = generator.generate(cyrillicCourse);
    const packageResult = await packageOLX(olxStructure);
    const uploadResult = await adapter.uploadPackage(packageResult.buffer);

    const totalDuration = Date.now() - pipelineStart;

    // Verify pipeline completed
    expect(totalDuration).toBeLessThan(30000);
    expect(uploadResult.success).toBe(true);

    // Verify Cyrillic is preserved
    expect(olxStructure.courseXml).toContain('Введение в программирование на Python');

    const chapterXml = Array.from(olxStructure.chapters.values())[0];
    expect(chapterXml).toContain('Основы Python');

    console.log(`\n✓ Cyrillic Content Pipeline:`);
    console.log(`  Duration: ${totalDuration}ms`);
    console.log(`  Course title: ${cyrillicCourse.title}`);
    console.log(`  Package size: ${formatBytes(packageResult.size)}`);
  });
});

describe('Open edX Import Pipeline E2E - Performance Scalability', () => {
  let generator: OLXGenerator;
  let adapter: MockOpenEdXAdapter;

  beforeEach(() => {
    generator = new OLXGenerator();
    adapter = new MockOpenEdXAdapter();
  });

  it('should handle 100-unit course within reasonable time', async () => {
    // Create larger course
    const chapters: CourseInput['chapters'] = [];

    // 5 chapters × 4 sections × 5 units = 100 units
    for (let ch = 0; ch < 5; ch++) {
      const sections: CourseInput['chapters'][0]['sections'] = [];

      for (let sec = 0; sec < 4; sec++) {
        const units: CourseInput['chapters'][0]['sections'][0]['units'] = [];

        for (let u = 0; u < 5; u++) {
          units.push({
            id: `unit_${ch}_${sec}_${u}`,
            title: `Unit ${ch * 20 + sec * 5 + u + 1}`,
            content: `<p>Content for unit ${ch * 20 + sec * 5 + u + 1}</p>`,
          });
        }

        sections.push({
          id: `sec_${ch}_${sec}`,
          title: `Section ${ch * 4 + sec + 1}`,
          units,
        });
      }

      chapters.push({
        id: `ch_${ch}`,
        title: `Chapter ${ch + 1}`,
        sections,
      });
    }

    const courseInput: CourseInput = {
      courseId: 'LARGE_COURSE_100',
      title: 'Large Course - 100 Units',
      org: 'MegaCampus',
      run: '2025_Q1',
      language: 'en',
      chapters,
    };

    const pipelineStart = Date.now();

    const olxStructure = generator.generate(courseInput);
    const packageResult = await packageOLX(olxStructure);
    const uploadResult = await adapter.uploadPackage(packageResult.buffer);

    const totalDuration = Date.now() - pipelineStart;

    // Larger course should still complete reasonably (< 60 seconds)
    expect(totalDuration).toBeLessThan(60000);

    // Verify structure
    expect(olxStructure.verticals.size).toBe(100);
    expect(uploadResult.success).toBe(true);

    console.log(`\n✓ Large Course Pipeline (100 units):`);
    console.log(`  Total duration: ${totalDuration}ms`);
    console.log(`  Avg time per unit: ${(totalDuration / 100).toFixed(2)}ms`);
    console.log(`  Package size: ${formatBytes(packageResult.size)}`);
  });

  it('should verify pipeline consistency across multiple runs', async () => {
    const courseInput = createRealisticCourseInput();
    const durations: number[] = [];
    const packageSizes: number[] = [];

    // Run pipeline 3 times
    for (let i = 0; i < 3; i++) {
      generator.reset();

      const start = Date.now();
      const olxStructure = generator.generate(courseInput);
      const packageResult = await packageOLX(olxStructure);
      await adapter.uploadPackage(packageResult.buffer);
      const duration = Date.now() - start;

      durations.push(duration);
      packageSizes.push(packageResult.size);
    }

    // All runs should complete within 30 seconds
    for (const duration of durations) {
      expect(duration).toBeLessThan(30000);
    }

    // Package sizes should be identical (deterministic)
    expect(new Set(packageSizes).size).toBe(1);

    const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;

    console.log(`\n✓ Pipeline Consistency (3 runs):`);
    console.log(`  Average duration: ${avgDuration.toFixed(2)}ms`);
    console.log(`  Min: ${Math.min(...durations)}ms`);
    console.log(`  Max: ${Math.max(...durations)}ms`);
    console.log(`  Package size: ${formatBytes(packageSizes[0])} (identical across runs)`);
  });
});

describe('Open edX Import Pipeline E2E - Error Handling', () => {
  let generator: OLXGenerator;

  beforeEach(() => {
    generator = new OLXGenerator();
  });

  it('should handle pipeline with invalid input gracefully', async () => {
    const invalidInput: any = {
      courseId: 'INVALID',
      title: 'Test',
      org: 'Test',
      run: 'test',
      language: 'en',
      chapters: [], // Empty chapters - invalid
    };

    // Should throw validation error during generation
    expect(() => generator.generate(invalidInput)).toThrow();
  });

  it('should complete pipeline even with minimal content', async () => {
    const minimalCourse: CourseInput = {
      courseId: 'MINIMAL_101',
      title: 'Minimal Course',
      org: 'MegaCampus',
      run: '2025_Q1',
      language: 'en',
      chapters: [
        {
          id: 'ch1',
          title: 'Chapter 1',
          sections: [
            {
              id: 'sec1',
              title: 'Section 1',
              units: [
                {
                  id: 'unit1',
                  title: 'Unit 1',
                  content: '<p>Minimal content</p>',
                },
              ],
            },
          ],
        },
      ],
    };

    const start = Date.now();

    const olxStructure = generator.generate(minimalCourse);
    const packageResult = await packageOLX(olxStructure);

    const duration = Date.now() - start;

    // Minimal course should be very fast
    expect(duration).toBeLessThan(1000);

    // Verify structure
    expect(olxStructure.verticals.size).toBe(1);
    expect(packageResult.size).toBeGreaterThan(0);

    console.log(`\n✓ Minimal Course Pipeline:`);
    console.log(`  Duration: ${duration}ms`);
    console.log(`  Package size: ${formatBytes(packageResult.size)}`);
  });
});

describe('Open edX Import Pipeline E2E - Import Status Polling', () => {
  let generator: OLXGenerator;
  let adapter: MockOpenEdXAdapter;

  beforeEach(() => {
    generator = new OLXGenerator();
    adapter = new MockOpenEdXAdapter();
  });

  it('should complete full workflow including status polling', async () => {
    const courseInput = createRealisticCourseInput();

    const workflowStart = Date.now();

    // Step 1-3: Generate, package, upload
    const olxStructure = generator.generate(courseInput);
    const packageResult = await packageOLX(olxStructure);
    const uploadResult = await adapter.uploadPackage(packageResult.buffer);

    // Step 4: Poll import status
    const statusResult = await adapter.getImportStatus(uploadResult.importId);

    const workflowDuration = Date.now() - workflowStart;

    // Full workflow should complete within 30 seconds
    expect(workflowDuration).toBeLessThan(30000);

    // Verify workflow completed
    expect(statusResult.status).toBe('completed');
    expect(statusResult.progress).toBe(100);

    console.log(`\n✓ Full Workflow with Status Polling:`);
    console.log(`  Total duration: ${workflowDuration}ms`);
    console.log(`  Import ID: ${uploadResult.importId}`);
    console.log(`  Status: ${statusResult.status}`);
    console.log(`  Progress: ${statusResult.progress}%`);
  });
});
